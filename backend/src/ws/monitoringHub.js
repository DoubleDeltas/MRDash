import { isPrometheusConfigured, queryRange } from '../util/prometheus.js';
import { pollIntervalMs, rangeWindow } from '../util/monitoringRange.js';
import { hostMetricsSampler } from '../util/hostMetrics.js';

// 전체 모니터링 — 호스트 OS 지표는 직접 읽고, 컨테이너별 지표는 Prometheus에서 가져온다.
const GiB = 1024 ** 3;
const HOST_SAMPLE_INTERVAL_MS = 1000;
const HOST_HISTORY_MS = 10 * 60 * 1000;
const MAX_HOST_POINTS = HOST_HISTORY_MS / HOST_SAMPLE_INTERVAL_MS + 1;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const buildQueries = (step) => {
  const window = `${Math.max(60, step)}s`;
  return {
    containerCpu:
      `sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[${window}])) * 100 / scalar(count(node_cpu_seconds_total{mode="idle"}))`,
    containerMemory: `sum by (name) (container_memory_working_set_bytes{name!=""}) / ${GiB}`,
  };
};

// 기간 -> 방; 같은 Prometheus 조회 결과는 브라우저끼리 공유한다.
const rooms = new Map();
const hostSockets = new Set();
const hostHistory = [];
let hostTimer = null;
let hostSampling = false;
let hostError = null;
let lastHostErrorLog = 0;
const HOST_ERROR_LOG_INTERVAL_MS = 30 * 1000;

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
};

const round = (value, digits) => +Number(value).toFixed(digits);

const broadcastHost = (payload) => {
  const message = JSON.stringify(payload);
  for (const ws of hostSockets) send(ws, message);
};

const pollHost = async () => {
  if (hostSampling || hostSockets.size === 0) return;
  hostSampling = true;
  try {
    const sample = await hostMetricsSampler();
    if (hostSockets.size === 0) {
      hostMetricsSampler.reset();
      hostHistory.length = 0;
      hostError = null;
      return;
    }
    hostHistory.push(sample);
    const cutoff = sample.timestamp - HOST_HISTORY_MS;
    while (hostHistory.length && hostHistory[0].timestamp < cutoff) hostHistory.shift();
    if (hostHistory.length > MAX_HOST_POINTS) hostHistory.splice(0, hostHistory.length - MAX_HOST_POINTS);
    hostError = null;
    broadcastHost({ type: 'host-sample', sample });
  } catch (err) {
    if (hostSockets.size === 0) {
      hostMetricsSampler.reset();
      hostHistory.length = 0;
      hostError = null;
      return;
    }
    hostError = err.message;
    if (Date.now() - lastHostErrorLog >= HOST_ERROR_LOG_INTERVAL_MS) {
      console.error('[ws/monitoring] Host procfs read failed:', err.message);
      lastHostErrorLog = Date.now();
    }
    broadcastHost({ type: 'host-unavailable', reason: hostError });
  } finally {
    hostSampling = false;
  }
};

const sendHostSnapshot = (ws) => {
  send(ws, hostError
    ? { type: 'host-unavailable', reason: hostError }
    : { type: 'host-history', history: hostHistory });
};

const startHostHeartbeat = (ws) => {
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const timer = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);
  ws.once('close', () => clearInterval(timer));
  ws.on('error', () => ws.terminate());
};

const joinHostRoom = (ws) => {
  hostSockets.add(ws);
  startHostHeartbeat(ws);
  sendHostSnapshot(ws);
  if (!hostTimer) {
    hostTimer = setInterval(pollHost, HOST_SAMPLE_INTERVAL_MS);
    pollHost();
  }
  ws.once('close', () => {
    hostSockets.delete(ws);
    if (hostSockets.size === 0) {
      clearInterval(hostTimer);
      hostTimer = null;
      if (!hostSampling) {
        hostMetricsSampler.reset();
        hostHistory.length = 0;
        hostError = null;
      }
    }
  });
};

const fetchContainerSnapshot = async (minutes) => {
  const range = rangeWindow(minutes);
  const queries = buildQueries(range.step);
  const [containerCpu, containerMemory] = await Promise.all(
    Object.values(queries).map((query) => queryRange(query, range)),
  );

  const points = new Map();
  const addValues = (series, key, digits) => {
    for (const { metric, values } of series) {
      for (const [timestamp, value] of values) {
        const point = points.get(timestamp) ?? { timestamp: timestamp * 1000, containers: {} };
        point.containers[metric.name] ??= { name: metric.name, cpu: 0, memory: 0 };
        point.containers[metric.name][key] = round(value, digits);
        points.set(timestamp, point);
      }
    }
  };
  addValues(containerCpu, 'cpu', 1);
  addValues(containerMemory, 'memory', 2);
  return {
    type: 'container-metrics',
    rangeMinutes: minutes,
    stepSec: range.step,
    points: [...points.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((point) => ({ ...point, containers: Object.values(point.containers).sort((a, b) => a.name.localeCompare(b.name)) })),
  };
};

const pollContainers = async (minutes) => {
  let message;
  if (!isPrometheusConfigured()) {
    message = { type: 'container-unavailable', reason: 'PROMETHEUS_URL is not set' };
  } else {
    try {
      message = await fetchContainerSnapshot(minutes);
    } catch (err) {
      console.error('[ws/monitoring] Prometheus query failed:', err.message);
      message = { type: 'container-unavailable', reason: err.message };
    }
  }

  const room = rooms.get(minutes);
  if (!room) return;
  room.lastMessage = JSON.stringify(message);
  for (const ws of room.sockets) send(ws, room.lastMessage);
};

export const handleMonitoringConnection = (ws, minutes) => {
  joinHostRoom(ws);
  let room = rooms.get(minutes);
  if (!room) {
    room = { sockets: new Set(), timer: null, lastMessage: null };
    rooms.set(minutes, room);
    room.timer = setInterval(() => pollContainers(minutes), pollIntervalMs(minutes));
    pollContainers(minutes);
  }
  room.sockets.add(ws);
  if (room.lastMessage) send(ws, room.lastMessage);

  ws.once('close', () => {
    room.sockets.delete(ws);
    if (room.sockets.size === 0) {
      clearInterval(room.timer);
      rooms.delete(minutes);
    }
  });
};
