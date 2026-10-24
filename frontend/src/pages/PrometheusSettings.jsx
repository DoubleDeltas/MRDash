import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import './MinecraftServers.css'
import './ServerSettings.css'

const EXPORTERS = [
  {
    value: 'MINECRAFT_PROMETHEUS_EXPORTER',
    label: 'PrometheusExporter 버킷 플러그인',
    url: 'https://github.com/sladkoff/minecraft-prometheus-exporter',
  },
]

const MIN_PORT = 0
const MAX_PORT = 65535

// 서버별 Prometheus 데이터 소스 설정 — 처음 연결할 때와 연결된 설정을 고칠 때 같이 쓴다.
function PrometheusSettings() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [host, setHost] = useState('')
  const [port, setPort] = useState(String(MIN_PORT))
  const [exporter, setExporter] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    apiClient.get(`/servers/${serverId}`)
      .then(res => {
        const s = res.data.data
        setServer(s)
        setHost(s.prometheusHost || '')
        setPort(String(s.prometheusPort ?? MIN_PORT))
        setExporter(s.prometheusExporter || null)
      })
      .catch(() => setLoadError('서버 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [serverId])

  // 직접 입력한 값은 포커스를 잃을 때 0~65535 범위의 정수로 맞춘다
  const handlePortBlur = () => {
    const parsed = parseInt(port, 10)
    const clamped = Number.isNaN(parsed) ? MIN_PORT : Math.min(MAX_PORT, Math.max(MIN_PORT, parsed))
    setPort(String(clamped))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!exporter) {
      setError('Exporter를 선택해주세요.')
      return
    }

    const parsedPort = parseInt(port, 10)
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.put(`/servers/${server.id}/monitoring-data-source`, {
        dataSource: 'PROMETHEUS',
        host: host.trim(),
        port: Number.isNaN(parsedPort) ? MIN_PORT : Math.min(MAX_PORT, Math.max(MIN_PORT, parsedPort)),
        exporter,
      })
      navigate(`/settings/${server.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Prometheus 설정 저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="server-settings">
        <div className="servers-loading">
          <div className="loading-spinner" />
          <p className="servers-message">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return <div className="server-settings"><p className="servers-message">{loadError}</p></div>
  }

  // 서버 설정 페이지와 같은 조건 — 데이터 소스 연결 API도 admin 또는 소유자만 허용한다.
  if (!isAdmin && server.ownerId !== user?.id) {
    return <div className="server-settings"><p className="servers-message">이 서버의 설정을 변경할 권한이 없습니다.</p></div>
  }

  return (
    <div className="server-settings">
      <form className="server-form" onSubmit={handleSubmit}>
        <div className="prometheus-address-row">
          <div className="server-form-row prometheus-host">
            <label htmlFor="prometheus-host">Host</label>
            <input
              id="prometheus-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="example.marendi.kr"
              required
            />
          </div>
          <div className="server-form-row prometheus-port">
            <label htmlFor="prometheus-port">Port</label>
            <input
              id="prometheus-port"
              type="number"
              min={MIN_PORT}
              max={MAX_PORT}
              step={1}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onBlur={handlePortBlur}
              required
            />
          </div>
        </div>

        <div className="server-form-row">
          <label>Exporter 선택</label>
          <div className="exporter-options">
            {EXPORTERS.map(option => (
              <label
                key={option.value}
                className={`exporter-option ${exporter === option.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="exporter"
                  value={option.value}
                  checked={exporter === option.value}
                  onChange={() => { setExporter(option.value); setError(null) }}
                />
                {option.label}
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="monitoring-source-link"
                  title="GitHub에서 보기"
                >
                  <span className="material-icons">north_east</span>
                </a>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="server-form-error">{error}</p>}

        <div className="server-form-actions">
          <button type="submit" className="server-form-submit" disabled={submitting}>
            {submitting ? '저장하는 중...' : '저장'}
          </button>
          <button type="button" className="server-form-cancel" onClick={() => navigate(-1)}>
            취소
          </button>
        </div>
      </form>
    </div>
  )
}

export default PrometheusSettings
