import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import GrafanaPanel from '../components/GrafanaPanel'
import { GRAFANA_DASHBOARDS, grafanaPanelUrl, serverDatasourceUid } from '../components/grafana'
import MonitoringRangeSelect, { DEFAULT_RANGE, resolveRange } from '../components/MonitoringRangeSelect'
import './Monitoring.css'

// Exporter별 Grafana 대시보드
const GRAFANA_DASHBOARD_BY_EXPORTER = {
  MINECRAFT_PROMETHEUS_EXPORTER: GRAFANA_DASHBOARDS.minecraft,
}

// 서버별 모니터링 — Grafana 패널(grafana/dashboards/mrdash-minecraft.json)로 그린다.
// MRDash Prometheus를 쓰는 서버는 Grafana의 기본 Prometheus 데이터 소스를, 외부 Prometheus를 쓰는 서버는
// 백엔드가 만들어 둔 그 서버 전용 데이터 소스(mrdash-server-<id>, backend/src/util/grafanaDatasources.js)를 쓴다.
function ServerMonitoring() {
  const { serverId } = useParams()
  const [server, setServer] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE)

  useEffect(() => {
    setServer(null)
    setLoadError(false)
    apiClient.get(`/servers/${serverId}`)
      .then(res => setServer(res.data.data))
      .catch(() => setLoadError(true))
  }, [serverId])

  if (loadError) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card monitoring-status-error">
          <span className="material-icons">error_outline</span>
          서버 정보를 불러오지 못했습니다.
        </div>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">hourglass_empty</span>
          모니터링 데이터를 불러오는 중입니다...
        </div>
      </div>
    )
  }

  if (server.monitoringDataSource !== 'PROMETHEUS' || !server.prometheusJob) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">link_off</span>
          <span>
            모니터링 데이터 소스가 연결되지 않았습니다.{' '}
            <Link to={`/settings/${serverId}`} className="monitoring-status-link">서버 설정에서 연결하기</Link>
          </span>
        </div>
      </div>
    )
  }

  const dashboard = GRAFANA_DASHBOARD_BY_EXPORTER[server.prometheusExporter]
  if (!dashboard) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">search_off</span>
          이 Exporter의 그래프는 아직 지원하지 않습니다.
        </div>
      </div>
    )
  }

  const range = resolveRange(rangeId)
  const panel = (key, title) => (
    <GrafanaPanel
      title={title}
      src={grafanaPanelUrl(dashboard, dashboard.panels[key], {
        range,
        // Targets를 비워 두면 job 전체 ($__all → 대시보드의 instance=~".*")
        vars: {
          ...(server.prometheusUrl && { datasource: serverDatasourceUid(server.id) }),
          job: server.prometheusJob,
          instance: server.prometheusInstance || '$__all',
        },
      })}
    />
  )

  return (
    <div className="monitoring-page">
      <div className="monitoring-controls-bar">
        <MonitoringRangeSelect value={rangeId} onChange={setRangeId} />
      </div>

      <section className="monitoring-section">
        <h3 className="monitoring-section-title">일반</h3>
        <div className="monitoring-charts-grid monitoring-charts-grid-fill">
          {panel('status', '서버 상태')}
          {panel('players', '접속자 수')}
        </div>
      </section>

      <section className="monitoring-section">
        <h3 className="monitoring-section-title">부하</h3>
        <div className="monitoring-charts-grid">
          {panel('tps', 'TPS')}
          {panel('entities', '엔티티 수')}
          {panel('chunks', '로드된 청크 수')}
          {panel('heap', '힙 메모리')}
        </div>
      </section>
    </div>
  )
}

export default ServerMonitoring
