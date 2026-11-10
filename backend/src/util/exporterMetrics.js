// Exporter별 지표 — 연결 테스트와 Grafana 경보 규칙이 이 표를 보고 PromQL을 만든다.
// 그래프는 Exporter별 Grafana 대시보드(grafana/dashboards/mrdash-minecraft*.json)가 같은 식으로 그린다.
// 새 Exporter를 지원하려면 prisma의 PrometheusExporter enum, 이 표, Grafana 대시보드,
// frontend/src/components/grafana.js, pages/ServerMonitoring.jsx의 대시보드 매핑, pages/PrometheusSettings.jsx의
// 선택지에 함께 추가한다.
//
// metrics의 각 항목
//   key: 모니터링 알림 규칙에 저장되는 값 (DB에 남으므로 바꾸지 않는다 — 지표 이름을 그대로 쓴다)
//   label: 알림 규칙 화면의 [지표 이름] 드롭다운에 보이는 이름
//   expr: (selector) => 월드·종류별로 나뉜 시계열을 하나로 합친 PromQL (selector는 buildSelector 결과)
// metricsPath: 수집 대상 자동 등록(/internal/prometheus/targets) 때 Prometheus가 지표를 가져올 경로
// probe: 연결 테스트에서 "Exporter 지표가 들어오고 있는지" 확인할 지표 이름 (서버가 켜져 있으면 항상 있는 것)

const aggregate = (fn, metric) => (selector) => `${fn}(${metric}{${selector}})`;

export const EXPORTER_METRICS = {
  // https://github.com/sladkoff/minecraft-prometheus-exporter (Bukkit/Paper 플러그인)
  MINECRAFT_PROMETHEUS_EXPORTER: {
    label: 'PrometheusExporter 플러그인',
    metrics: {
      players: { key: 'mc_players_online_total', label: '접속자 수', expr: aggregate('sum', 'mc_players_online_total') },
      tps: { key: 'mc_tps', label: 'TPS', expr: aggregate('avg', 'mc_tps') },
      entities: { key: 'mc_entities_total', label: '엔티티 수', expr: aggregate('sum', 'mc_entities_total') },
      chunks: { key: 'mc_loaded_chunks_total', label: '로드된 청크 수', expr: aggregate('sum', 'mc_loaded_chunks_total') },
    },
    metricsPath: '/metrics',
    probe: 'mc_tps',
  },

  // https://github.com/cpburnz/minecraft-prometheus-exporter (Forge/NeoForge/Fabric 모드)
  // Forge 26.2 빌드: https://github.com/DoubleDeltas/minecraft-prometheus-exporter (mc26.2-forge 브랜치)
  PROMETHEUS_EXPORTER_MOD: {
    label: 'Prometheus Exporter 모드',
    metrics: {
      // 접속한 플레이어마다 값 1인 시계열 — 아무도 없으면 시계열이 없으므로, 서버가 수집되고 있으면 0으로 채운다
      players: {
        key: 'mc_player_list',
        label: '접속자 수',
        expr: (selector) => `count(mc_player_list{${selector}}) or (max(up{${selector}}) * 0)`,
      },
      // TPS 지표가 없어 서버 틱 히스토그램으로 구한다: min(20, 1 / 평균 틱 시간(MSPT))
      // 실제 틱 횟수(rate(_count))로 구하지 않는 이유: 빈 서버가 틱을 멈추면(pause-when-empty-seconds)
      // TPS 0이 되어 "TPS < x" 알림이 울린다. 이 식은 그때 0/0 = NaN(데이터 없음 = 정상)이 된다.
      tps: {
        key: 'mc_server_tick_seconds_count',
        label: 'TPS',
        expr: (selector) => `avg(clamp_max(rate(mc_server_tick_seconds_count{${selector}}[1m]) / rate(mc_server_tick_seconds_sum{${selector}}[1m]), 20))`,
      },
      entities: { key: 'mc_entities_total', label: '엔티티 수', expr: aggregate('sum', 'mc_entities_total') },
      chunks: { key: 'mc_dimension_chunks_loaded', label: '로드된 청크 수', expr: aggregate('sum', 'mc_dimension_chunks_loaded') },
    },
    metricsPath: '/metrics',
    probe: 'mc_server_tick_seconds_count',
  },
};

// Exporter와 상관없이 Prometheus가 수집 대상마다 기록하는 지표.
// up: 마지막 수집에 성공하면 1, 실패하면 0 — Exporter가 서버 안에서 돌기 때문에 서버가 꺼지면 0이 된다.
// (서버가 꺼지면 mc_* 지표는 값이 낮아지는 게 아니라 사라지므로, 꺼짐은 up으로만 잡을 수 있다)
const COMMON_METRICS = [
  { key: 'up', label: '서버 상태 (켜짐 1 / 꺼짐 0)', summaryLabel: '서버 상태', expr: aggregate('max', 'up') },
];

const metricsOf = (exporter) => [
  ...COMMON_METRICS,
  ...Object.values(EXPORTER_METRICS[exporter]?.metrics ?? {}),
];

// 알림 규칙에서 고를 수 있는 지표 — [{ key: 'up', label: ... }, { key: 'mc_tps', label: 'TPS' }, ...]
// (데이터 소스·Exporter가 없으면 빈 목록)
export const alertMetricsFor = (exporter) => (EXPORTER_METRICS[exporter]
  ? metricsOf(exporter).map(({ key, label }) => ({ key, label }))
  : []);

// 알림 규칙 하나를 PromQL과 화면용 이름으로 — Exporter를 바꿔 지금 Exporter에 없는 key가 남아 있으면
// 그 이름의 지표를 그대로 조회한다 (보통 데이터 없음 = 정상으로 평가된다)
export const resolveAlertMetric = (exporter, key, selector) => {
  const metric = metricsOf(exporter).find((m) => m.key === key);
  return {
    expr: metric ? metric.expr(selector) : `max(${key}{${selector}})`,
    label: metric ? (metric.summaryLabel ?? metric.label) : key,
  };
};
