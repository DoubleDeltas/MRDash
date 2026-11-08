import { useState, useEffect } from 'react'
import { WS_BASE_URL } from '../api/client'
import GrafanaPanel from '../components/GrafanaPanel'
import { GRAFANA_DASHBOARDS, grafanaPanelUrl } from '../components/grafana'
import MonitoringRangeSelect, { DEFAULT_RANGE, formatRefresh, resolveRange } from '../components/MonitoringRangeSelect'
import './Monitoring.css'

// 백엔드 /ws/monitoring 스트림의 point에 화면용 시간 라벨을 붙인다 (KPI 타일용)
const decoratePoints = (points) => points.map(p => ({
  ...p,
  time: new Date(p.timestamp).toTimeString().slice(0, 5),
}))

function Monitoring() {
  const [viewMode, setViewMode] = useState('total') // 'total' | 'container'
  // 'connecting': 백엔드 ws 연결 중 / 'ok': 데이터 수신 중 / 'unavailable': 백엔드가 Prometheus 조회에 실패
  const [status, setStatus] = useState('connecting')
  const [metrics, setMetrics] = useState({ data: [], memTotal: 0 })
  // 그래프(Grafana) 기간 — 위쪽 KPI 타일은 기간과 상관없이 최신 값만 쓴다
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE)

  // 화면을 보고 있는 동안 백엔드가 Prometheus 조회 결과를 밀어준다 (KPI 타일용 최신 값).
  useEffect(() => {
    let reconnectTimer = null
    let cancelled = false
    let ws = null

    const connect = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/monitoring`)

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'metrics') {
          setMetrics({ data: decoratePoints(msg.points), memTotal: msg.memTotal })
          setStatus('ok')
        } else if (msg.type === 'unavailable') {
          setStatus('unavailable')
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        setStatus(prev => (prev === 'unavailable' ? prev : 'connecting'))
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  const { data, memTotal } = metrics
  const range = resolveRange(rangeId)
  const currentPoint = data[data.length - 1] || {}
  const memRatio = memTotal ? (currentPoint.totalMemory || 0) / memTotal : 0

  if (status === 'unavailable') {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card monitoring-status-error">
          <span className="material-icons">cloud_off</span>
          Prometheus가 연결되지 않았습니다. 연결 상태와 환경변수를 확인해주세요!
        </div>
      </div>
    )
  }

  if (data.length < 2) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">hourglass_empty</span>
          모니터링 데이터를 불러오는 중입니다...
        </div>
      </div>
    )
  }

  return (
    <div className="monitoring-page">
      {/* KPI 요약 타일 */}
      <div className="monitoring-kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">전체 CPU 부하</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{currentPoint.totalCpu ?? 0}%</span>
            <span className="kpi-tag" style={{ color: currentPoint.totalCpu > 80 ? '#e34948' : '#1baf7a' }}>
              {currentPoint.totalCpu > 80 ? '주의' : '정상'}
            </span>
          </div>
          <div className="kpi-meter-bg">
            <div
              className="kpi-meter-fill"
              style={{
                width: `${Math.min(100, currentPoint.totalCpu || 0)}%`,
                backgroundColor: currentPoint.totalCpu > 80 ? '#e34948' : '#3987e5'
              }}
            />
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">사용 중인 메모리</span>
          <div className="kpi-value-row">
            <span className="kpi-value">
              {currentPoint.totalMemory ?? 0} <span className="kpi-unit">/ {memTotal} GB</span>
            </span>
            <span className="kpi-tag" style={{ color: '#1baf7a' }}>
              {Math.round(memRatio * 100)}%
            </span>
          </div>
          <div className="kpi-meter-bg">
            <div
              className="kpi-meter-fill"
              style={{
                width: `${Math.min(100, memRatio * 100)}%`,
                backgroundColor: '#199e70'
              }}
            />
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">실행 중인 컨테이너</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{currentPoint.containers?.length ?? 0} <span className="kpi-unit">컨테이너</span></span>
          </div>
          <div className="kpi-subtext">cAdvisor 기준</div>
        </div>
      </div>

      {/* 상단 컨트롤 바 */}
      <div className="monitoring-controls-bar">
        <div className="control-groups">
          <div className="control-group">
            <label htmlFor="view-mode-select" className="control-label">보기 모드</label>
            <select
              id="view-mode-select"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className="monitoring-select"
            >
              <option value="total">전체</option>
              <option value="container">Docker 컨테이너별</option>
            </select>
          </div>
          <MonitoringRangeSelect value={rangeId} onChange={setRangeId} />
        </div>

        <div className="control-actions">
          <span className={`live-indicator ${status === 'ok' ? '' : 'live-indicator-off'}`}>
            <span className="live-dot" />
            {status === 'ok' ? `실시간 (${formatRefresh(range.refresh)} 주기)` : '불러오는 중...'}
          </span>
        </div>
      </div>

      {/* 그래프 — Grafana mrdash-host 대시보드의 패널 (grafana/dashboards/mrdash-host.json) */}
      <div className="monitoring-charts-grid">
        {(viewMode === 'total'
          ? [['cpu', 'CPU 부하 (전체)'], ['memory', '사용 중인 메모리 (전체)']]
          : [['containerCpu', 'CPU 부하 (컨테이너별 누적)'], ['containerMemory', '사용 중인 메모리 (컨테이너별 누적)']]
        ).map(([panel, title]) => (
          <GrafanaPanel
            key={panel}
            title={title}
            src={grafanaPanelUrl(GRAFANA_DASHBOARDS.host, GRAFANA_DASHBOARDS.host.panels[panel], { range })}
          />
        ))}
      </div>
    </div>
  )
}

export default Monitoring
