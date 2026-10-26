import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { WS_BASE_URL } from '../api/client'
import LineChart from '../components/LineChart'
import './Monitoring.css'

// 데이터 범위에 맞는 축 최댓값 (1·2·5 × 10ⁿ 중 값보다 10% 이상 큰 것, 최소 minimum)
const niceMax = (values, minimum) => {
  const top = Math.max(minimum, ...values.filter(v => v != null)) * 1.1
  const magnitude = 10 ** Math.floor(Math.log10(top))
  return [1, 2, 5, 10].map(m => m * magnitude).find(v => v >= top)
}

// 서버별 모니터링 — PrometheusExporter 플러그인 지표를 백엔드 /ws/monitoring/:serverId 스트림으로 받는다.
function ServerMonitoring() {
  const { serverId } = useParams()
  // 'connecting' | 'ok' | 'not-connected' | 'no-data' | 'unavailable'
  const [status, setStatus] = useState('connecting')
  const [metrics, setMetrics] = useState({ data: [], jvmMax: null })

  useEffect(() => {
    let reconnectTimer = null
    let cancelled = false
    let ws = null

    const connect = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/monitoring/${serverId}`)

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
            jvmMax: msg.jvmMax,
          })
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
  }, [serverId])

  if (status === 'not-connected') {
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

  if (status === 'no-data') {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">search_off</span>
          <span>
            Prometheus에서 이 서버의 지표를 찾지 못했습니다. Job Name·Targets와 플러그인 설치를 확인해주세요.{' '}
            <Link to={`/settings/prometheus/${serverId}`} className="monitoring-status-link">Prometheus 설정</Link>
          </span>
        </div>
      </div>
    )
  }

  const { data, jvmMax } = metrics
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

  const values = (key) => data.map(d => d[key])

  return (
    <div className="monitoring-page">
      <section className="monitoring-section">
        <h3 className="monitoring-section-title">일반</h3>
        <div className="monitoring-charts-grid monitoring-charts-grid-fill">
          <LineChart
            data={data}
            dataKey="players"
            unit="명"
            maxVal={niceMax(values('players'), 5)}
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
            dataKey="jvmUsed"
            unit="GB"
            maxVal={jvmMax || niceMax(values('jvmUsed'), 1)}
            title={jvmMax ? `JVM 메모리 (최대 ${jvmMax} GB)` : 'JVM 메모리'}
            color="#199e70"
          />
          <LineChart
            data={data}
            dataKey="tps"
            unit="TPS"
            maxVal={20}
            title="TPS"
            color="#c98500"
          />
          <LineChart
            data={data}
            dataKey="entities"
            unit="개"
            maxVal={niceMax(values('entities'), 10)}
            title="엔티티 수"
            color="#d55181"
          />
          <LineChart
            data={data}
            dataKey="chunks"
            unit="개"
            maxVal={niceMax(values('chunks'), 10)}
            title="로드된 청크 수"
            color="#9085e9"
          />
        </div>
      </section>
    </div>
  )
}

export default ServerMonitoring
