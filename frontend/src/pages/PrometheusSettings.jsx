import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import './MinecraftServers.css'
import './ServerSettings.css'

const EXPORTERS = [
  {
    value: 'MINECRAFT_PROMETHEUS_EXPORTER',
    label: 'PrometheusExporter 플러그인',
    detail: 'sladkoff/minecraft-prometheus-exporter',
    url: 'https://github.com/sladkoff/minecraft-prometheus-exporter',
  },
]

// 연결 대상: MRDash 백엔드의 Prometheus(PROMETHEUS_URL) 또는 URL을 직접 입력한 외부 Prometheus.
// MRDash로 저장하면 prometheusUrl/Token이 null로 저장된다.
const TARGETS = [
  { value: 'MRDASH', label: 'MRDash Prometheus에 연결' },
  { value: 'EXTERNAL', label: '외부 Prometheus에 연결' },
]

// 서버별 Prometheus 데이터 소스 설정 — 처음 연결할 때와 연결된 설정을 고칠 때 같이 쓴다.
function PrometheusSettings() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [target, setTarget] = useState('MRDASH')
  const [url, setUrl] = useState('')
  // 저장된 토큰은 내려오지 않으므로, 입력칸은 새 토큰을 넣을 때만 쓰고 비워 두면 기존 토큰을 유지한다
  const [token, setToken] = useState('')
  const [clearToken, setClearToken] = useState(false)
  const [job, setJob] = useState('')
  const [instance, setInstance] = useState('')
  const [exporter, setExporter] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // 연결 테스트 결과: 'idle'(검은 램프) | 'testing' | 'success'(초록) | 'fail'(빨강, 아래에 원인 표시)
  const [testState, setTestState] = useState('idle')
  const [testReason, setTestReason] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    apiClient.get(`/servers/${serverId}`)
      .then(res => {
        const s = res.data.data
        setServer(s)
        setTarget(s.prometheusUrl ? 'EXTERNAL' : 'MRDASH')
        setUrl(s.prometheusUrl || '')
        setJob(s.prometheusJob || '')
        setInstance(s.prometheusInstance || '')
        setExporter(s.prometheusExporter || null)
      })
      .catch(() => setLoadError('서버 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [serverId])

  // 입력이 바뀌면 이전 테스트 결과는 더 이상 맞지 않으므로 램프를 끈다
  useEffect(() => {
    setTestState('idle')
    setTestReason(null)
  }, [target, url, token, clearToken, job, instance])

  // 저장 전 폼 값 그대로 테스트한다 (토큰 칸이 비어 있으면 저장된 토큰 사용)
  const handleTest = async () => {
    if (!formRef.current.reportValidity()) return

    setTestState('testing')
    setTestReason(null)
    try {
      const res = await apiClient.post(`/servers/${server.id}/monitoring-data-source/test`, {
        target,
        ...(target === 'EXTERNAL' && {
          url: url.trim(),
          ...(token.trim() && { token: token.trim() }),
          ...(clearToken && { clearToken: true }),
        }),
        job: job.trim(),
        instance: instance.trim() || null,
      })
      if (res.data.data.ok) {
        setTestState('success')
      } else {
        setTestState('fail')
        setTestReason(res.data.data.reason)
      }
    } catch (err) {
      setTestState('fail')
      setTestReason(err.response?.data?.error || '연결 테스트 요청에 실패했습니다.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!exporter) {
      setError('Exporter를 선택해주세요.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await apiClient.put(`/servers/${server.id}/monitoring-data-source`, {
        dataSource: 'PROMETHEUS',
        target,
        ...(target === 'EXTERNAL' && {
          url: url.trim(),
          ...(token.trim() && { token: token.trim() }),
          ...(clearToken && { clearToken: true }),
        }),
        job: job.trim(),
        instance: instance.trim() || null,
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
      <div className="settings-header">
        <h2>
          <Link to={`/settings/${server.id}`} className="settings-header-link">설정</Link>
          <span className="settings-header-separator">&gt;</span>
          Prometheus 연결
        </h2>
      </div>

      <form className="server-form" onSubmit={handleSubmit} ref={formRef}>
        <div className="server-form-row">
          <label>Prometheus</label>
          <div className="radio-options">
            {TARGETS.map(option => (
              <label key={option.value} className="radio-option">
                <input
                  type="radio"
                  name="target"
                  value={option.value}
                  checked={target === option.value}
                  onChange={() => setTarget(option.value)}
                />
                {option.label}
              </label>
            ))}
            {/* 외부 Prometheus가 목록의 마지막 항목이라 그 바로 아래, 같은 상자 안에 둔다 */}
            {target === 'EXTERNAL' && (
              <div className="prometheus-external-fields">
                <div className="server-form-row">
                  <label htmlFor="prometheus-url">URL</label>
                  <input
                    id="prometheus-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://prometheus.example.kr"
                    required
                  />
                </div>
                <div className="server-form-row">
                  <label htmlFor="prometheus-token">인증 토큰 (선택)</label>
                  <div className="prometheus-token-row">
                    <input
                      id="prometheus-token"
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => { setToken(e.target.value); setClearToken(false) }}
                      disabled={clearToken}
                      placeholder={
                        clearToken ? '저장하면 토큰이 삭제됩니다'
                          : server.hasPrometheusToken ? '저장된 토큰 유지 (바꾸려면 새로 입력)'
                            : 'Bearer 토큰'
                      }
                    />
                    {server.hasPrometheusToken && (
                      <button
                        type="button"
                        className="server-form-cancel"
                        onClick={() => { setClearToken(prev => !prev); setToken('') }}
                      >
                        {clearToken ? '삭제 취소' : '토큰 삭제'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="server-form-row">
          <label htmlFor="prometheus-job">Job Name</label>
          <input
            id="prometheus-job"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="minecraft"
            required
          />
          <p className="server-form-hint">Prometheus 설정(scrape_configs)의 job_name</p>
        </div>

        <div className="server-form-row">
          <label htmlFor="prometheus-instance">Targets (선택)</label>
          <input
            id="prometheus-instance"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            placeholder="mc-survival:9940"
          />
          <p className="server-form-hint">한 job에 서버가 여러 개라면 이 서버의 target(instance)을 입력</p>
        </div>

        <div className="server-form-row">
          <label>Exporter 선택</label>
          <div className="radio-options">
            {EXPORTERS.map(option => (
              <label key={option.value} className="radio-option">
                <input
                  type="radio"
                  name="exporter"
                  value={option.value}
                  checked={exporter === option.value}
                  onChange={() => { setExporter(option.value); setError(null) }}
                />
                {option.label}
                {option.detail && <span className="radio-option-detail">({option.detail})</span>}
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

        <div className="server-form-row">
          <div className="connection-test-row">
            <button
              type="button"
              className="console-token-button"
              onClick={handleTest}
              disabled={testState === 'testing'}
            >
              {testState === 'testing' ? '테스트 중...' : '연결 테스트'}
            </button>
            <span
              className={`connection-test-lamp ${testState}`}
              role="status"
              aria-label={
                testState === 'success' ? '연결 성공'
                  : testState === 'fail' ? '연결 실패'
                    : testState === 'testing' ? '테스트 중' : '테스트 전'
              }
            />
          </div>
          {testState === 'fail' && testReason && (
            <p className="connection-test-reason">{testReason}</p>
          )}
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
