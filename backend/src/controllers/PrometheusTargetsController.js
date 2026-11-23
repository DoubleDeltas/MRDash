import { prisma } from '../config/prisma.js';
import { EXPORTER_METRICS } from '../util/exporterMetrics.js';
import { hostPresenceKey, isHot, serverPresenceKey } from '../util/scrapePresence.js';

// MRDash Prometheus의 수집 대상 — Prometheus HTTP 서비스 디스커버리(http_sd_configs)가 부른다.
// 응답 형식: https://prometheus.io/docs/prometheus/latest/http_sd/
//   [{ "targets": ["host:port"], "labels": { "job": "...", "mrdash_server_id": "1", "__metrics_path__": "/metrics" } }]
// job 라벨을 넣어 두면 Prometheus의 job_name 대신 이 값이 쓰여, 서버 설정의 Job Name과 그대로 맞는다.
//
// 수집 간격: 모니터링 화면을 보는 사람이 있는 대상(util/scrapePresence.js)에만 __scrape_interval__/__scrape_timeout__을
// 1초로 붙여 job 기본값(15초)을 덮어쓴다. 둘 다 __ 내부 라벨이라 job·instance가 그대로여서 시계열은 이어진다.
// 대상을 목록에서 빼면 수집이 끊기므로 간격만 바꾸고 대상은 항상 내보낸다.
// Prometheus 쪽 설정은 grafana/README.md 5절 참고.

const HOT_SCRAPE_LABELS = { __scrape_interval__: '1s', __scrape_timeout__: '1s' };

const withScrapeInterval = (labels, hot) => (hot ? { ...labels, ...HOT_SCRAPE_LABELS } : labels);

// 호스트 수집 대상(node-exporter·cAdvisor) — PROMETHEUS_HOST_TARGETS에 http_sd 형식 JSON으로 둔다.
// prometheus.yml의 정적 설정과 job·targets를 똑같이 옮겨야 기존 시계열이 이어진다. 없거나 잘못되면 내보내지 않는다.
const isTargetGroup = (group) =>
  Array.isArray(group?.targets) &&
  group.targets.length > 0 &&
  group.targets.every((target) => typeof target === 'string' && target !== '') &&
  (group.labels === undefined ||
    (group.labels !== null && typeof group.labels === 'object' && !Array.isArray(group.labels)));

const hostTargetGroups = () => {
  const raw = process.env.PROMETHEUS_HOST_TARGETS?.trim();
  if (!raw) return [];
  try {
    const groups = JSON.parse(raw);
    if (!Array.isArray(groups) || !groups.every(isTargetGroup)) {
      throw new Error('expected [{ "targets": ["host:port"], "labels": { ... } }]');
    }
    const hot = isHot(hostPresenceKey);
    return groups.map(({ targets, labels = {} }) => ({ targets, labels: withScrapeInterval(labels, hot) }));
  } catch (error) {
    console.error('[prometheus/targets] PROMETHEUS_HOST_TARGETS is invalid:', error.message);
    return [];
  }
};

// 서버 설정에서 "수집 대상 자동 등록"을 켠 서버들
const serverTargetGroups = async () => {
  const sources = await prisma.prometheusDataSource.findMany({
    where: {
      autoScrape: true,
      url: null, // 외부 Prometheus는 그쪽에서 관리한다
      job: { not: null },
      instance: { not: null },
      dataSource: { type: 'PROMETHEUS' },
    },
    select: { job: true, instance: true, exporter: true, dataSource: { select: { serverId: true } } },
    orderBy: { id: 'asc' },
  });

  // 같은 job·instance를 두 번 내보내면 같은 시계열을 두 번 수집하게 되므로 먼저 등록한 것만 둔다
  // (저장할 때도 막지만, 혹시 남아 있어도 Prometheus 쪽이 깨지지 않게)
  const seen = new Set();
  const groups = [];
  for (const { job, instance, exporter, dataSource } of sources) {
    const key = `${job}\n${instance}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      targets: [instance],
      labels: withScrapeInterval(
        {
          job,
          mrdash_server_id: String(dataSource.serverId),
          __metrics_path__: EXPORTER_METRICS[exporter]?.metricsPath ?? '/metrics',
        },
        isHot(serverPresenceKey(dataSource.serverId)),
      ),
    });
  }
  return groups;
};

// GET /internal/prometheus/targets
export const getPrometheusTargets = async (req, res) => {
  try {
    res.json([...hostTargetGroups(), ...(await serverTargetGroups())]);
  } catch (error) {
    // http_sd는 200이 아니면 이전 목록을 그대로 쓴다 — 빈 목록을 주면 수집 대상이 전부 사라지므로 오류로 응답한다
    res.status(500).json({ success: false, error: error.message });
  }
};
