import { isPrometheusConfigured, queryRange } from '../util/prometheus.js';
import { pollIntervalMs, rangeWindow } from '../util/monitoringRange.js';

// 전체 모니터링 (/ws/monitoring?range=<분>) — 선택한 기간만큼을 조회 간격(step)마다 다시 조회해 한 번에 내려준다.
const GiB = 1024 ** 3;

// 컨테이너 CPU는 호스트 전체 코어 대비 %로 환산해야 누적 합이 전체 CPU 부하(%)와 같은 축에 올라간다.
// rate 구간은 조회 간격보다 짧으면 그 사이 값을 건너뛰므로 step 이상(최소 1분)으로 잡는다.
const buildQueries = (step) => {
  const window = `${Math.max(60, step)}s`;
  return {
    totalCpu: `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[${window}])))`,
    usedMemory: `sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / ${GiB}`,
    totalMemory: `sum(node_memory_MemTotal_bytes) / ${GiB}`,
    containerCpu:
      `sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[${window}])) * 100 / scalar(count(node_cpu_seconds_total{mode="idle"}))`,
    containerMemory: `sum by (name) (container_memory_working_set_bytes{name!=""}) / ${GiB}`,
  };
};

// 기간(분) -> { sockets, timer, lastMessage } — 같은 기간을 보는 브라우저끼리 조회 결과를 나눠 쓴다
const rooms = new Map();

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
};

const round = (value, digits) => +Number(value).toFixed(digits);

const fetchSnapshot = async (minutes) => {
  const range = rangeWindow(minutes);

  const [totalCpu, usedMemory, totalMemory, containerCpu, containerMemory] = await Promise.all(
    Object.values(buildQueries(range.step)).map((q) => queryRange(q, range)),
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
    rangeMinutes: minutes,
    stepSec: range.step,
    memTotal,
    points: [...points.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => ({
        ...p,
        containers: Object.values(p.containers).sort((a, b) => a.name.localeCompare(b.name)),
      })),
  };
};

const poll = async (minutes) => {
  let message;
  if (!isPrometheusConfigured()) {
    message = { type: 'unavailable', reason: 'PROMETHEUS_URL is not set' };
  } else {
    try {
      message = await fetchSnapshot(minutes);
    } catch (err) {
      console.error('[ws/monitoring] Prometheus query failed:', err.message);
      message = { type: 'unavailable', reason: err.message };
    }
  }

  // 조회하는 사이 마지막 브라우저가 나갔으면 버린다.
  const room = rooms.get(minutes);
  if (!room) return;
  room.lastMessage = JSON.stringify(message);
  for (const ws of room.sockets) {
    send(ws, room.lastMessage);
  }
};

// 보고 있는 브라우저가 있을 때만 Prometheus를 조회한다.
export const handleMonitoringConnection = (ws, minutes) => {
  let room = rooms.get(minutes);
  if (!room) {
    room = { sockets: new Set(), timer: null, lastMessage: null };
    rooms.set(minutes, room);
    room.timer = setInterval(() => poll(minutes), pollIntervalMs(minutes));
    poll(minutes);
  }
  room.sockets.add(ws);
  if (room.lastMessage) send(ws, room.lastMessage);

  ws.on('close', () => {
    room.sockets.delete(ws);
    if (room.sockets.size === 0) {
      clearInterval(room.timer);
      rooms.delete(minutes);
    }
  });
};
