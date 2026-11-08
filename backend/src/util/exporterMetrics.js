// Exporter별 지표 이름 — 연결 테스트가 이 표를 보고 PromQL을 만든다.
// 그래프는 Grafana 대시보드(grafana/dashboards/mrdash-minecraft.json)가 같은 지표 이름으로 그린다.
// 새 Exporter를 지원하려면 prisma의 PrometheusExporter enum, 이 표, Grafana 대시보드,
// frontend/src/components/grafana.js와 pages/ServerMonitoring.jsx의 대시보드 매핑에 함께 추가한다.
//
// metric: Prometheus 지표 이름 (모니터링 알림 규칙의 key로도 쓴다)
// label: 알림 규칙 화면의 [지표 이름] 드롭다운에 보이는 이름
// aggregate: 월드/종류별로 나뉜 시계열을 하나로 합치는 방법 (sum | avg | max)
export const EXPORTER_METRICS = {
  // https://github.com/sladkoff/minecraft-prometheus-exporter
  MINECRAFT_PROMETHEUS_EXPORTER: {
    label: 'PrometheusExporter 플러그인',
    metrics: {
      players: { metric: 'mc_players_online_total', label: '접속자 수', aggregate: 'sum' },
      tps: { metric: 'mc_tps', label: 'TPS', aggregate: 'avg' },
      entities: { metric: 'mc_entities_total', label: '엔티티 수', aggregate: 'sum' },
      chunks: { metric: 'mc_loaded_chunks_total', label: '로드된 청크 수', aggregate: 'sum' },
    },
    // 연결 테스트에서 "플러그인 지표가 들어오고 있는지" 확인할 지표
    probe: 'tps',
  },
};

// Exporter와 상관없이 Prometheus가 수집 대상마다 기록하는 지표.
// up: 마지막 수집에 성공하면 1, 실패하면 0 — 플러그인이 서버 안에서 돌기 때문에 서버가 꺼지면 0이 된다.
// (서버가 꺼지면 mc_* 지표는 값이 낮아지는 게 아니라 사라지므로, 꺼짐은 up으로만 잡을 수 있다)
const COMMON_ALERT_METRICS = [
  { key: 'up', label: '서버 상태 (켜짐 1 / 꺼짐 0)' },
];

// 알림 규칙에서 고를 수 있는 지표 — [{ key: 'up', label: ... }, { key: 'mc_tps', label: 'TPS' }, ...]
// (데이터 소스·Exporter가 없으면 빈 목록)
export const alertMetricsFor = (exporter) => (EXPORTER_METRICS[exporter]
  ? [
    ...COMMON_ALERT_METRICS,
    ...Object.values(EXPORTER_METRICS[exporter].metrics).map(({ metric, label }) => ({ key: metric, label })),
  ]
  : []);
