import { API_BASE_URL } from '../api/client'

// MRDash 백엔드가 /api/grafana/* 를 Grafana 컨테이너로 넘겨준다 (MRDash 로그인으로 인증, grafana/README.md)
const GRAFANA_BASE_URL = `${API_BASE_URL}/grafana`

// 대시보드 UID와 패널 id — grafana/dashboards/*.json과 맞춘다
export const GRAFANA_DASHBOARDS = {
  host: {
    uid: 'mrdash-host',
    panels: { cpu: 1, memory: 2, containerCpu: 3, containerMemory: 4 },
  },
  // PrometheusExporter 플러그인 (backend/src/util/exporterMetrics.js의 MINECRAFT_PROMETHEUS_EXPORTER)
  minecraft: {
    uid: 'mrdash-minecraft',
    panels: { players: 1, tps: 2, entities: 3, chunks: 4 },
  },
}

// 외부 Prometheus를 쓰는 서버의 Grafana 데이터 소스 — backend/src/util/grafanaDatasources.js와 같은 규칙
export const serverDatasourceUid = (serverId) => `mrdash-server-${serverId}`

// 기간에 맞춘 자동 새로고침 — 백엔드의 조회 간격과 같은 규칙 (15초 단위, 1분 이하)
const refreshFor = (rangeMinutes) => {
  const sec = Math.min(60, Math.max(15, Math.ceil((rangeMinutes * 60) / 60 / 15) * 15))
  return sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`
}

// 패널 하나만 보여주는 Grafana 주소 (/d-solo/<uid>/<slug>?panelId=...)
export const grafanaPanelUrl = (dashboard, panelId, { rangeMinutes, vars = {} }) => {
  const params = new URLSearchParams({
    orgId: '1',
    panelId: String(panelId),
    from: `now-${rangeMinutes}m`,
    to: 'now',
    refresh: refreshFor(rangeMinutes),
    theme: 'dark',
  })
  for (const [name, value] of Object.entries(vars)) {
    params.set(`var-${name}`, value)
  }
  return `${GRAFANA_BASE_URL}/d-solo/${dashboard.uid}/_?${params}`
}
