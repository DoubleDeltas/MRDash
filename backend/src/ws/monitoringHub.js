import { isPrometheusConfigured, queryInstant } from '../util/prometheus.js';
import { acquirePresence, hostPresenceKey, serverPresenceKey } from '../util/scrapePresence.js';

// 전체 모니터링 (/ws/monitoring) — 위쪽 KPI 타일용 최신 값을 1초마다 조회해 내려준다 (그래프는 Grafana 패널).
// 보는 사람이 있는 동안 호스트 수집 대상은 1초마다 수집된다 (util/scrapePresence.js).
// 서버별 모니터링 (/ws/monitoring/server?serverId=<id>) — 데이터는 보내지 않고, 열려 있는 동안 그 서버를 1초로 수집하게 한다.
const POLL_INTERVAL_MS = 1000;
// 응답 없는 연결(브라우저가 닫힘 이벤트 없이 사라진 경우)을 찾아 끊는 주기
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const GiB = 1024 ** 3;

// irate는 구간 안의 마지막 두 샘플로 계산한다 — 1초 수집 중엔 1초 해상도, 15초로 돌아가도 값이 비지 않는다
const QUERIES = {
  totalCpu: '100 * (1 - avg(irate(node_cpu_seconds_total{mode="idle"}[1m])))',
  usedMemory: `sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / ${GiB}`,
  totalMemory: `sum(node_memory_MemTotal_bytes) / ${GiB}`,
  // 호스트 전체 코어 대비 %로 환산해야 누적 합이 전체 CPU 부하(%)와 같은 축에 올라간다
  containerCpu:
    'sum by (name) (irate(container_cpu_usage_seconds_total{name!=""}[1m])) * 100 / scalar(count(node_cpu_seconds_total{mode="idle"}))',
  containerMemory: `sum by (name) (container_memory_working_set_bytes{name!=""}) / ${GiB}`,
};

const hostSockets = new Set();
let pollTimer = null;
let polling = false;
let lastMessage = null;

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) ws.send(payload);
};

const round = (value, digits) => +Number(value).toFixed(digits);

const fetchLatest = async () => {
  const [totalCpu, usedMemory, totalMemory, containerCpu, containerMemory] = await Promise.all(
    Object.values(QUERIES).map((q) => queryInstant(q)),
  );

  const containers = new Map();
  const addContainerValues = (series, key, digits) => {
    for (const { metric, value } of series) {
      if (!containers.has(metric.name)) containers.set(metric.name, { name: metric.name, cpu: 0, memory: 0 });
      containers.get(metric.name)[key] = round(value[1], digits);
    }
  };
  addContainerValues(containerCpu, 'cpu', 1);
  addContainerValues(containerMemory, 'memory', 2);

  const valueOf = (series, digits) => (series[0] ? round(series[0].value[1], digits) : 0);
  const timestamp = Math.round((usedMemory[0]?.value[0] ?? Date.now() / 1000) * 1000);

  return {
    type: 'latest',
    memTotal: valueOf(totalMemory, 1),
    point: {
      timestamp,
      totalCpu: valueOf(totalCpu, 1),
      totalMemory: valueOf(usedMemory, 2),
      containers: [...containers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
};

const poll = async () => {
  // Prometheus가 1초 넘게 걸리면 겹쳐서 쌓이지 않게 이번 차례는 건너뛴다
  if (polling) return;
  polling = true;
  let message;
  try {
    if (!isPrometheusConfigured()) {
      message = { type: 'unavailable', reason: 'PROMETHEUS_URL is not set' };
    } else {
      message = await fetchLatest();
    }
  } catch (err) {
    console.error('[ws/monitoring] Prometheus query failed:', err.message);
    message = { type: 'unavailable', reason: err.message };
  } finally {
    polling = false;
  }

  // 조회하는 사이 마지막 브라우저가 나갔으면 버린다
  if (hostSockets.size === 0) return;
  lastMessage = JSON.stringify(message);
  for (const ws of hostSockets) send(ws, lastMessage);
};

// 연결이 살아 있는지 주기적으로 확인하고, 닫히면 시청 표시를 한 번만 내린다
const trackPresence = (ws, key, onClose) => {
  const release = acquirePresence(key);
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    release();
    onClose?.();
  };
  ws.once('close', cleanup);
  ws.on('error', () => ws.terminate());
};

// 보고 있는 브라우저가 있을 때만 Prometheus를 조회한다
export const handleMonitoringConnection = (ws) => {
  hostSockets.add(ws);
  if (!pollTimer) {
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    poll();
  } else if (lastMessage) {
    send(ws, lastMessage);
  }

  trackPresence(ws, hostPresenceKey, () => {
    hostSockets.delete(ws);
    if (hostSockets.size === 0) {
      clearInterval(pollTimer);
      pollTimer = null;
      lastMessage = null;
    }
  });
};

export const handleServerMonitoringConnection = (ws, serverId) => {
  trackPresence(ws, serverPresenceKey(serverId));
};
