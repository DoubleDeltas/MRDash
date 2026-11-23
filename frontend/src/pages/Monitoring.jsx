import { useState, useEffect, useRef } from 'react'
import { WS_BASE_URL } from '../api/client'
import GrafanaPanel from '../components/GrafanaPanel'
import HostMetricChart from '../components/HostMetricChart'
import { GRAFANA_DASHBOARDS, grafanaPanelUrl } from '../components/grafana'
import MonitoringRangeSelect, { DEFAULT_RANGE, formatRefresh, resolveRange } from '../components/MonitoringRangeSelect'
import './Monitoring.css'

const decoratePoints = (points) => points.map((point) => ({
  ...point,
  time: new Date(point.timestamp).toTimeString().slice(0, 5),
}))

const HOST_COLORS = { blue: '#3987e5', green: '#199e70', orange: '#e8a33d' }

function Monitoring() {
  const [viewMode, setViewMode] = useState('total')
  const [containerStatus, setContainerStatus] = useState('connecting')
  const [hostStatus, setHostStatus] = useState('connecting')
  const [hostHistory, setHostHistory] = useState([])
  const hostHistoryRef = useRef([])
  const [containerData, setContainerData] = useState([])
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE)

  useEffect(() => {
    let reconnectTimer = null
    let cancelled = false
    let ws = null
    const connect = () => {
      if (cancelled) return
      ws = new WebSocket(`${WS_BASE_URL}/ws/monitoring`)
      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }
        if (msg.type === 'host-history') {
          const points = msg.history.map((point) => ({ ...point, time: new Date(point.timestamp).toTimeString().slice(0, 8) }))
          hostHistoryRef.current = points
          setHostHistory(points)
          setHostStatus('ok')
        } else if (msg.type === 'host-sample') {
          const point = { ...msg.sample, time: new Date(msg.sample.timestamp).toTimeString().slice(0, 8) }
          const points = [...hostHistoryRef.current, point].slice(-601)
          hostHistoryRef.current = points
          setHostHistory(points)
          setHostStatus('ok')
        } else if (msg.type === 'host-unavailable') {
          setHostStatus('unavailable')
        } else if (msg.type === 'container-metrics') {
          setContainerData(decoratePoints(msg.points))
          setContainerStatus('ok')
        } else if (msg.type === 'container-unavailable') {
          setContainerStatus('unavailable')
        }
      }
      ws.onclose = () => {
        if (cancelled) return
        setHostStatus('connecting')
        setContainerStatus('connecting')
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

  const range = resolveRange(rangeId)
  const containerRange = { from: range.from, to: range.to, refresh: range.refresh }
  const current = hostHistory.at(-1) || {}
  const memoryRatio = current.totalGb ? (current.usedGb || 0) / current.totalGb : 0
  const chartSeries = (key, label, color) => [{
    label,
    color,
    values: hostHistory.filter((point) => Number.isFinite(point[key])).map((point) => ({ timestamp: point.timestamp, value: point[key] })),
  }]
  const grafanaPanel = (key, title, wide = false) => (
    <GrafanaPanel key={key} title={title} wide={wide} src={grafanaPanelUrl(GRAFANA_DASHBOARDS.host, GRAFANA_DASHBOARDS.host.panels[key], { range: containerRange })} />
  )

  return (
    <div className="monitoring-page">
      {hostStatus === 'unavailable' && <div className="monitoring-status-card monitoring-status-error"><span className="material-icons">cloud_off</span>호스트 지표를 읽을 수 없습니다. Linux 호스트의 /proc 파일이 backend에 읽기 전용으로 연결됐는지 확인해주세요.</div>}

      <div className="monitoring-kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">전체 CPU 부하</span>
          <div className="kpi-value-row"><span className="kpi-value">{Number.isFinite(current.cpuPercent) ? `${current.cpuPercent.toFixed(1)}%` : '—'}</span><span className="kpi-tag" style={{ color: current.cpuPercent > 80 ? '#e34948' : '#1baf7a' }}>{current.cpuPercent > 80 ? '주의' : '호스트 직접 측정'}</span></div>
          <div className="kpi-meter-bg"><div className="kpi-meter-fill" style={{ width: `${Math.min(100, current.cpuPercent || 0)}%`, backgroundColor: current.cpuPercent > 80 ? '#e34948' : HOST_COLORS.blue }} /></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">사용 중인 메모리</span>
          <div className="kpi-value-row"><span className="kpi-value">{Number.isFinite(current.usedGb) ? current.usedGb.toFixed(1) : '—'} <span className="kpi-unit">/ {Number.isFinite(current.totalGb) ? current.totalGb.toFixed(1) : '—'} GB</span></span><span className="kpi-tag" style={{ color: '#1baf7a' }}>{current.totalGb ? `${Math.round(memoryRatio * 100)}%` : '호스트 직접 측정'}</span></div>
          <div className="kpi-meter-bg"><div className="kpi-meter-fill" style={{ width: `${Math.min(100, memoryRatio * 100)}%`, backgroundColor: HOST_COLORS.green }} /></div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">전체 네트워크</span>
          <div className="kpi-value-row"><span className="kpi-value">↓ {Number.isFinite(current.receiveBps) ? (current.receiveBps / 1_000_000).toFixed(2) : '—'} <span className="kpi-unit">Mbps</span></span></div>
          <div className="kpi-subtext">↑ 송신 {Number.isFinite(current.transmitBps) ? (current.transmitBps / 1_000_000).toFixed(2) : '—'} Mbps · 호스트 직접 측정</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">실행 중인 컨테이너</span>
          <div className="kpi-value-row"><span className="kpi-value">{containerData.at(-1)?.containers?.length ?? '—'} <span className="kpi-unit">컨테이너</span></span></div>
          <div className="kpi-subtext">{containerStatus === 'ok' ? 'cAdvisor · Prometheus' : '컨테이너 지표는 Prometheus 필요'}</div>
        </div>
      </div>

      <div className="monitoring-controls-bar">
        <div className="control-groups">
          <div className="control-group"><label htmlFor="view-mode-select" className="control-label">보기 모드</label><select id="view-mode-select" value={viewMode} onChange={(event) => setViewMode(event.target.value)} className="monitoring-select"><option value="total">호스트 전체</option><option value="container">컨테이너별</option></select></div>
          {viewMode === 'container' && <MonitoringRangeSelect value={rangeId} onChange={setRangeId} />}
        </div>
        <div className="control-actions"><span className={`live-indicator ${hostStatus === 'ok' ? '' : 'live-indicator-off'}`}><span className="live-dot" />{hostStatus === 'ok' ? '호스트 실시간 (1초)' : '호스트 지표 연결 중...'}</span></div>
      </div>

      {viewMode === 'total' ? (
        <div className="monitoring-charts-grid">
          <HostMetricChart title="호스트 CPU 사용률" series={chartSeries('cpuPercent', 'CPU', HOST_COLORS.blue)} unit="%" kind="percent" description="호스트 OS에서 직접 측정 · 최근 10분" />
          <HostMetricChart title="호스트 메모리 사용량" series={chartSeries('usedGb', '사용 중', HOST_COLORS.green)} unit="GB" kind="memory" description="MemTotal − MemAvailable · 최근 10분" />
          <HostMetricChart title="호스트 네트워크 트래픽" series={[{ label: '수신', color: HOST_COLORS.blue, values: chartSeries('receiveBps', '수신', HOST_COLORS.blue)[0].values }, { label: '송신', color: HOST_COLORS.orange, values: chartSeries('transmitBps', '송신', HOST_COLORS.orange)[0].values }]} unit="bit/s" kind="network" description="가상·loopback 인터페이스 제외 · 최근 10분" />
        </div>
      ) : (
        <section className="monitoring-section">
          <h3 className="monitoring-section-title">컨테이너별 지표 · Prometheus</h3>
          {containerStatus === 'unavailable' && <div className="monitoring-status-card monitoring-status-error"><span className="material-icons">cloud_off</span>컨테이너별 지표는 Prometheus가 연결돼 있어야 볼 수 있습니다. 호스트 전체 그래프는 직접 수집으로 계속 동작합니다.</div>}
          {containerStatus === 'connecting' && <div className="monitoring-status-card"><span className="material-icons">hourglass_empty</span>컨테이너 지표를 불러오는 중입니다...</div>}
          <div className="monitoring-charts-grid">{grafanaPanel('containerCpu', 'CPU 부하 (컨테이너별 누적)')}{grafanaPanel('containerMemory', '사용 중인 메모리 (컨테이너별 누적)')}{grafanaPanel('containerNetwork', '네트워크 트래픽 (컨테이너별 누적)', true)}</div>
        </section>
      )}
    </div>
  )
}

export default Monitoring
