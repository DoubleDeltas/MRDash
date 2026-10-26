import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WS_BASE_URL } from '../api/client'
import LineChart from '../components/LineChart'
import { maxScale } from '../components/chartScale'
import MonitoringRangeSelect, { DEFAULT_RANGE_MINUTES, formatStep } from '../components/MonitoringRangeSelect'
import './Monitoring.css'

// 접속자·엔티티·청크 수는 정수라 눈금 간격을 1 이상으로, 값이 없을 때는 0~4
const COUNT_SCALE = { fallback: 4, minStep: 1 }

// TPS 축은 기본 19.0~20.1, 관측값이 이 범위를 벗어날 때만 넓힌다
const TPS_DEFAULT_MIN = 19.0
const TPS_DEFAULT_MAX = 20.1

const tpsRange = (values) => {
  const observed = values.filter(v => v != null)
  if (!observed.length) return { min: TPS_DEFAULT_MIN, max: TPS_DEFAULT_MAX }
  const low = Math.min(...observed)
  const high = Math.max(...observed)
  return {
    min: low < TPS_DEFAULT_MIN ? Math.max(0, Math.floor(low)) : TPS_DEFAULT_MIN,
    max: high > TPS_DEFAULT_MAX ? Math.ceil(high * 10) / 10 : TPS_DEFAULT_MAX,
  }
}

// 서버별 모니터링 — PrometheusExporter 플러그인 지표를 백엔드 /ws/monitoring/:serverId 스트림으로 받는다.
function ServerMonitoring() {
  const { serverId } = useParams()
  // 'connecting' | 'ok' | 'not-connected' | 'no-data' | 'unavailable'
  const [status, setStatus] = useState('connecting')
  const [metrics, setMetrics] = useState({ data: [] })
  const [rangeMinutes, setRangeMinutes] = useState(DEFAULT_RANGE_MINUTES)
  // 백엔드가 기간에 맞춰 정한 조회 간격(초) — 기간이 길수록 길어진다
  const [stepSec, setStepSec] = useState(null)

  // 기간을 바꾸면 새 기간으로 다시 연결한다 (새 데이터가 올 때까지는 이전 그래프를 보여준다)
  useEffect(() => {
    setStatus(prev => (prev === 'ok' ? 'connecting' : prev))
    let reconnectTimer = null
    let cancelled = false
    let ws = null

    const connect = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/monitoring/${serverId}?range=${rangeMinutes}`)

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'metrics') {
          setMetrics({
            data: msg.points.map(p => ({ ...p, time: new Date(p.timestamp).toTimeString().slice(0, 5) })),
          })
          setStepSec(msg.stepSec)
          setStatus('ok')
        } else if (['not-connected', 'no-data', 'unavailable'].includes(msg.type)) {
          setStatus(msg.type)
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        setStatus(prev => (prev === 'ok' || prev === 'connecting' ? 'connecting' : prev))
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
  }, [serverId, rangeMinutes])

  const { data } = metrics
  const values = (key) => data.map(d => d[key])

  // 상태에 따라 안내 카드 또는 그래프 — 기간 선택 바는 항상 위에 둔다
  const renderContent = () => {
    if (status === 'not-connected') {
      return (
        <div className="monitoring-status-card">
          <span className="material-icons">link_off</span>
          <span>
            모니터링 데이터 소스가 연결되지 않았습니다.{' '}
            <Link to={`/settings/${serverId}`} className="monitoring-status-link">서버 설정에서 연결하기</Link>
          </span>
        </div>
      )
    }

    if (status === 'unavailable') {
      return (
        <div className="monitoring-status-card monitoring-status-error">
          <span className="material-icons">cloud_off</span>
          Prometheus가 연결되지 않았습니다. 연결 상태와 환경변수를 확인해주세요!
        </div>
      )
    }

    if (status === 'no-data') {
      return (
        <div className="monitoring-status-card">
          <span className="material-icons">search_off</span>
          <span>
            Prometheus에서 이 서버의 지표를 찾지 못했습니다. Job Name·Targets와 플러그인 설치를 확인해주세요.{' '}
            <Link to={`/settings/prometheus/${serverId}`} className="monitoring-status-link">Prometheus 설정</Link>
          </span>
        </div>
      )
    }

    if (data.length < 2) {
      return (
        <div className="monitoring-status-card">
          <span className="material-icons">hourglass_empty</span>
          모니터링 데이터를 불러오는 중입니다...
        </div>
      )
    }

    const tps = tpsRange(values('tps'))

    return (
      <>
        <section className="monitoring-section">
          <h3 className="monitoring-section-title">일반</h3>
          <div className="monitoring-charts-grid monitoring-charts-grid-fill">
            <LineChart
              data={data}
              dataKey="players"
              unit="명"
              maxVal={maxScale(values('players'), COUNT_SCALE)}
              title="접속자 수"
              color="#3987e5"
            />
          </div>
        </section>

        <section className="monitoring-section">
          <h3 className="monitoring-section-title">부하</h3>
          <div className="monitoring-charts-grid">
            <LineChart
              data={data}
              dataKey="tps"
              unit="TPS"
              minVal={tps.min}
              maxVal={tps.max}
              referenceLines={[20]}
              title="TPS"
              color="#c98500"
            />
            <LineChart
              data={data}
              dataKey="entities"
              unit="개"
              maxVal={maxScale(values('entities'), COUNT_SCALE)}
              title="엔티티 수"
              color="#d55181"
            />
            <LineChart
              data={data}
              dataKey="chunks"
              unit="개"
              maxVal={maxScale(values('chunks'), COUNT_SCALE)}
              title="로드된 청크 수"
              color="#9085e9"
            />
          </div>
        </section>
      </>
    )
  }

  return (
    <div className="monitoring-page">
      <div className="monitoring-controls-bar">
        <MonitoringRangeSelect value={rangeMinutes} onChange={setRangeMinutes} />
        {(status === 'ok' || status === 'connecting') && (
          <span className={`live-indicator ${status === 'ok' ? '' : 'live-indicator-off'}`}>
            <span className="live-dot" />
            {status === 'ok' ? `실시간 (${formatStep(stepSec)} 주기)` : '불러오는 중...'}
          </span>
        )}
      </div>

      {renderContent()}
    </div>
  )
}

export default ServerMonitoring
