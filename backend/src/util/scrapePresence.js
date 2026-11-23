// 모니터링 화면을 보고 있는 사람이 있는 수집 대상 — 그동안만 Prometheus가 1초마다 수집한다.
// 키: 'host'(전체 모니터링, node-exporter·cAdvisor) / 'server:<id>'(서버별 모니터링의 Exporter)
// HTTP SD(/internal/prometheus/targets, controllers/PrometheusTargetsController.js)가 isHot()으로 수집 간격 라벨을 붙인다.
//
// 백엔드가 컨테이너 하나로 돌아가므로 메모리에 둔다. 여러 개로 늘리면 Redis 같은 공유 저장소로 옮겨야 한다.

// 마지막 사람이 나간 뒤에도 이만큼은 1초로 둔다 — 새로고침·재연결 때 1초↔15초가 오가지 않게
const GRACE_MS = 30 * 1000;

// key -> { count, graceTimer }
const entries = new Map();

// 화면 하나가 열리면 부른다. 돌려주는 함수를 닫힐 때 부른다 (여러 번 불러도 한 번만 센다).
export const acquirePresence = (key) => {
  let entry = entries.get(key);
  if (!entry) {
    entry = { count: 0, graceTimer: null };
    entries.set(key, entry);
  }
  entry.count += 1;
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.count -= 1;
    if (entry.count > 0) return;
    entry.graceTimer = setTimeout(() => {
      if (entries.get(key) === entry && entry.count === 0) entries.delete(key);
    }, GRACE_MS);
    entry.graceTimer.unref?.();
  };
};

export const isHot = (key) => entries.has(key);

export const hostPresenceKey = 'host';
export const serverPresenceKey = (serverId) => `server:${serverId}`;
