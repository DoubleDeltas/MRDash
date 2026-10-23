import { isPrometheusConfigured, queryRange } from '../util/prometheus.js';

// Prometheus scrape_interval(15s)에 맞춰 조회하고, 최근 10분치를 한 번에 내려준다.
const STEP_SEC = 15;
const HISTORY_POINTS = 40;
const POLL_INTERVAL_MS = STEP_SEC * 1000;
const GiB = 1024 ** 3;

// 컨테이너 CPU는 호스트 전체 코어 대비 %로 환산해야 누적 합이 전체 CPU 부하(%)와 같은 축에 올라간다.
const QUERIES = {
  totalCpu: '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))',
  usedMemory: `sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / ${GiB}`,
  totalMemory: `sum(node_memory_MemTotal_bytes) / ${GiB}`,
  containerCpu:
    'sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[1m])) * 100 / scalar(count(node_cpu_seconds_total{mode="idle"}))',
  containerMemory: `sum by (name) (container_memory_working_set_bytes{name!=""}) / ${GiB}`,
};

const browserSockets = new Set();
let pollTimer = null;
// 새로 들어온 브라우저에 바로 보여줄 마지막 결과
let lastMessage = null;

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
};

const round = (value, digits) => +Number(value).toFixed(digits);

const fetchSnapshot = async () => {
  const end = Math.floor(Date.now() / 1000 / STEP_SEC) * STEP_SEC;
  const range = { start: end - (HISTORY_POINTS - 1) * STEP_SEC, end, step: STEP_SEC };

  const [totalCpu, usedMemory, totalMemory, containerCpu, containerMemory] = await Promise.all(
    Object.values(QUERIES).map((q) => queryRange(q, range)),
  );

  // timestamp(초) -> point
  const points = new Map();
  const pointAt = (ts) => {
    if (!points.has(ts)) {
      points.set(ts, { timestamp: ts * 1000, totalCpu: 0, totalMemory: 0, containers: {} });
    }
    return points.get(ts);
  };

  for (const [ts, v] of totalCpu[0]?.values ?? []) pointAt(ts).totalCpu = round(v, 1);
  for (const [ts, v] of usedMemory[0]?.values ?? []) pointAt(ts).totalMemory = round(v, 2);

  const addContainerValues = (series, key, digits) => {
    for (const { metric, values } of series) {
      for (const [ts, v] of values) {
        const containers = pointAt(ts).containers;
        containers[metric.name] ??= { name: metric.name, cpu: 0, memory: 0 };
        containers[metric.name][key] = round(v, digits);
      }
    }
  };
  addContainerValues(containerCpu, 'cpu', 1);
  addContainerValues(containerMemory, 'memory', 2);

  const memTotalValues = totalMemory[0]?.values ?? [];
  const memTotal = memTotalValues.length ? round(memTotalValues.at(-1)[1], 1) : 0;

  return {
    type: 'metrics',
    memTotal,
    points: [...points.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => ({
        ...p,
        containers: Object.values(p.containers).sort((a, b) => a.name.localeCompare(b.name)),
      })),
  };
};

const poll = async () => {
  let message;
  if (!isPrometheusConfigured()) {
    message = { type: 'unavailable', reason: 'PROMETHEUS_URL is not set' };
  } else {
    try {
      message = await fetchSnapshot();
    } catch (err) {
      console.error('[ws/monitoring] Prometheus query failed:', err.message);
      message = { type: 'unavailable', reason: err.message };
    }
  }

  // 조회하는 사이 마지막 브라우저가 나갔으면 버린다.
  if (!pollTimer) return;
  lastMessage = JSON.stringify(message);
  for (const ws of browserSockets) {
    send(ws, lastMessage);
  }
};

// 보고 있는 브라우저가 있을 때만 Prometheus를 조회한다.
const startPolling = () => {
  if (pollTimer) return;
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
};

const stopPolling = () => {
  clearInterval(pollTimer);
  pollTimer = null;
  lastMessage = null;
};

export const handleMonitoringConnection = (ws) => {
  browserSockets.add(ws);
  if (lastMessage) send(ws, lastMessage);
  startPolling();

  ws.on('close', () => {
    browserSockets.delete(ws);
    if (browserSockets.size === 0) stopPolling();
  });
};
