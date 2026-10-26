// Exporter별 지표 이름 — 서버별 모니터링 그래프와 연결 테스트가 이 표를 보고 PromQL을 만든다.
// 새 Exporter를 지원하려면 prisma의 PrometheusExporter enum에 값을 추가하고 여기에 지표 이름을 적는다.
//
// metric: Prometheus 지표 이름
// aggregate: 월드/종류별로 나뉜 시계열을 하나로 합치는 방법 (sum | avg | max)
export const EXPORTER_METRICS = {
  // https://github.com/sladkoff/minecraft-prometheus-exporter
  MINECRAFT_PROMETHEUS_EXPORTER: {
    label: 'PrometheusExporter 플러그인',
    metrics: {
      players: { metric: 'mc_players_online_total', aggregate: 'sum' },
      tps: { metric: 'mc_tps', aggregate: 'avg' },
      entities: { metric: 'mc_entities_total', aggregate: 'sum' },
      chunks: { metric: 'mc_loaded_chunks_total', aggregate: 'sum' },
    },
    // 연결 테스트에서 "플러그인 지표가 들어오고 있는지" 확인할 지표
    probe: 'tps',
  },
};

// { players: 'sum(mc_players_online_total{job="..."})', ... }
export const buildExporterQueries = (exporter, selector) => {
  const definition = EXPORTER_METRICS[exporter];
  if (!definition) return null;
  return Object.fromEntries(
    Object.entries(definition.metrics).map(([key, { metric, aggregate }]) => [key, `${aggregate}(${metric}{${selector}})`]),
  );
};
