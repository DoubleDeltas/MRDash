import { API_BASE_URL } from '../api/client'

// MRDash 백엔드가 /api/grafana/* 를 Grafana 컨테이너로 넘겨준다 (MRDash 로그인으로 인증, grafana/README.md)
const GRAFANA_BASE_URL = `${API_BASE_URL}/grafana`

// Minecraft 서버 대시보드는 Exporter마다 따로 있지만 패널 id는 같게 맞춘다
const MINECRAFT_PANELS = { players: 1, tps: 2, entities: 3, chunks: 4, heap: 5, status: 6 }

// 대시보드 UID와 패널 id — grafana/dashboards/*.json과 맞춘다
export const GRAFANA_DASHBOARDS = {
  host: {
    uid: 'mrdash-host',
    panels: { cpu: 1, memory: 2, containerCpu: 3, containerMemory: 4 },
  },
  // PrometheusExporter 플러그인 (backend/src/util/exporterMetrics.js의 MINECRAFT_PROMETHEUS_EXPORTER)
  minecraft: {
    uid: 'mrdash-minecraft',
    panels: MINECRAFT_PANELS,
  },
  // Prometheus Exporter 모드 (exporterMetrics.js의 PROMETHEUS_EXPORTER_MOD) — 패널 id는 위와 같다
  minecraftMod: {
    uid: 'mrdash-minecraft-mod',
    panels: MINECRAFT_PANELS,
  },
}

// 외부 Prometheus를 쓰는 서버의 Grafana 데이터 소스 — backend/src/util/grafanaDatasources.js와 같은 규칙
export const serverDatasourceUid = (serverId) => `mrdash-server-${serverId}`

// 패널 하나만 보여주는 Grafana 주소 (/d-solo/<uid>/<slug>?panelId=...)
// range: MonitoringRangeSelect의 resolveRange 결과 { from, to, refresh }
export const grafanaPanelUrl = (dashboard, panelId, { range, vars = {} }) => {
  const params = new URLSearchParams({
    orgId: '1',
    panelId: String(panelId),
    from: range.from,
    to: range.to,
    refresh: range.refresh,
    theme: 'dark',
  })
  for (const [name, value] of Object.entries(vars)) {
    params.set(`var-${name}`, value)
  }
  return `${GRAFANA_BASE_URL}/d-solo/${dashboard.uid}/_?${params}`
}
