import { prisma } from '../config/prisma.js';
import { EXPORTER_METRICS } from '../util/exporterMetrics.js';

// MRDash Prometheus의 수집 대상 자동 등록 — Prometheus HTTP 서비스 디스커버리(http_sd_configs)가 부른다.
// 응답 형식: https://prometheus.io/docs/prometheus/latest/http_sd/
//   [{ "targets": ["host:port"], "labels": { "job": "...", "mrdash_server_id": "1", "__metrics_path__": "/metrics" } }]
// job 라벨을 넣어 두면 Prometheus의 job_name 대신 이 값이 쓰여, 서버 설정의 Job Name과 그대로 맞는다.
// Prometheus 쪽 설정은 grafana/README.md 참고.

// GET /internal/prometheus/targets
export const getPrometheusTargets = async (req, res) => {
  try {
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
        labels: {
          job,
          mrdash_server_id: String(dataSource.serverId),
          __metrics_path__: EXPORTER_METRICS[exporter]?.metricsPath ?? '/metrics',
        },
      });
    }
    res.json(groups);
  } catch (error) {
    // http_sd는 200이 아니면 이전 목록을 그대로 쓴다 — 빈 목록을 주면 수집 대상이 전부 사라지므로 오류로 응답한다
    res.status(500).json({ success: false, error: error.message });
  }
};
