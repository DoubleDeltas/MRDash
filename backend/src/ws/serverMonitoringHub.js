import { prisma } from '../config/prisma.js';
import { buildSelector, queryRange } from '../util/prometheus.js';

// 서버별 모니터링 (/ws/monitoring/:serverId) — PrometheusExporter 플러그인(sladkoff/minecraft-prometheus-exporter) 지표를
// 서버 설정의 job/instance로 골라서 최근 10분치를 15초마다 내려준다.
const STEP_SEC = 15;
const HISTORY_POINTS = 40;
const POLL_INTERVAL_MS = STEP_SEC * 1000;

const buildQueries = (selector) => ({
  players: `sum(mc_players_online_total{${selector}})`,
  tps: `avg(mc_tps{${selector}})`,
  entities: `sum(mc_entities_total{${selector}})`,
  chunks: `sum(mc_loaded_chunks_total{${selector}})`,
});

const DIGITS = { players: 0, tps: 2, entities: 0, chunks: 0 };

// serverId -> { sockets, timer, lastMessage }
const rooms = new Map();

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
};

const round = (value, digits) => +Number(value).toFixed(digits);

const fetchSnapshot = async (serverId) => {
  const server = await prisma.minecraftServer.findUnique({
    where: { id: serverId },
    select: {
      monitoringDataSource: true,
      prometheusUrl: true,
      prometheusToken: true,
      prometheusJob: true,
      prometheusInstance: true,
    },
  });

  if (!server || server.monitoringDataSource !== 'PROMETHEUS' || !server.prometheusJob) {
    return { type: 'not-connected' };
  }

  const selector = buildSelector(server.prometheusJob, server.prometheusInstance);

  // prometheusUrl이 없으면 MRDash Prometheus(PROMETHEUS_URL)를 쓴다
  const source = server.prometheusUrl
    ? { baseUrl: server.prometheusUrl, token: server.prometheusToken }
    : {};

  const end = Math.floor(Date.now() / 1000 / STEP_SEC) * STEP_SEC;
  const range = { start: end - (HISTORY_POINTS - 1) * STEP_SEC, end, step: STEP_SEC };

  const queries = buildQueries(selector);
  const keys = Object.keys(queries);
  const results = await Promise.all(keys.map((k) => queryRange(queries[k], range, source)));
  const series = Object.fromEntries(keys.map((k, i) => [k, results[i][0]?.values ?? []]));

  // job/instance가 틀렸거나 플러그인 지표가 아직 없으면 전부 비어 있다
  if (keys.every((k) => series[k].length === 0)) {
    return { type: 'no-data' };
  }

  // timestamp(초) -> point (값이 없는 시점은 null)
  const points = new Map();
  for (const key of Object.keys(DIGITS)) {
    for (const [ts, v] of series[key]) {
      if (!points.has(ts)) {
        points.set(ts, { timestamp: ts * 1000, players: null, tps: null, entities: null, chunks: null });
      }
      points.get(ts)[key] = round(v, DIGITS[key]);
    }
  }

  return {
    type: 'metrics',
    points: [...points.values()].sort((a, b) => a.timestamp - b.timestamp),
  };
};

const poll = async (serverId) => {
  let message;
  try {
    message = await fetchSnapshot(serverId);
  } catch (err) {
    console.error(`[ws/monitoring/${serverId}] Prometheus query failed:`, err.message);
    message = { type: 'unavailable', reason: err.message };
  }

  // 조회하는 사이 마지막 브라우저가 나갔으면 버린다.
  const room = rooms.get(serverId);
  if (!room) return;
  room.lastMessage = JSON.stringify(message);
  for (const ws of room.sockets) {
    send(ws, room.lastMessage);
  }
};

// 그 서버 모니터링 화면을 보고 있는 브라우저가 있을 때만 조회한다.
export const handleServerMonitoringConnection = (ws, serverId) => {
  let room = rooms.get(serverId);
  if (!room) {
    room = { sockets: new Set(), timer: null, lastMessage: null };
    rooms.set(serverId, room);
    room.timer = setInterval(() => poll(serverId), POLL_INTERVAL_MS);
    poll(serverId);
  }
  room.sockets.add(ws);
  if (room.lastMessage) send(ws, room.lastMessage);

  ws.on('close', () => {
    room.sockets.delete(ws);
    if (room.sockets.size === 0) {
      clearInterval(room.timer);
      rooms.delete(serverId);
    }
  });
};
