import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import './MinecraftServers.css'
import './ServerSettings.css'

// 비교 연산자 — 백엔드 MonitoringAlertOp enum 값과 화면 기호
const OPS = [
  { value: 'GT', label: '>' },
  { value: 'LT', label: '<' },
  { value: 'GTE', label: '>=' },
  { value: 'LTE', label: '<=' },
  { value: 'NEQ', label: '!=' },
  { value: 'EQ', label: '==' },
]

// 기준값 입력: 숫자와 소수점(앞에 - 하나)만 받는다. 입력 중인 "12." / "-" 같은 중간 상태도 허용한다.
const THRESHOLD_INPUT = /^-?\d*\.?\d*$/
const isCompleteNumber = (value) => /^-?(\d+\.?\d*|\.\d+)$/.test(value)

const DISCORD_WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/

// 행마다 React key가 필요해서 화면에서만 쓰는 id를 붙인다
let nextRowId = 1
const newRow = (fields) => ({ rowId: nextRowId++, ...fields })

// 서버별 모니터링 알림 설정 — 규칙(지표·연산·기준값)과 알림 대상(웹후크, "테트라" 봇 채널)
function AlertSettings() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [metrics, setMetrics] = useState([])
  const [channels, setChannels] = useState([])
  const [rules, setRules] = useState([])
  const [webhooks, setWebhooks] = useState([])
  const [channelIds, setChannelIds] = useState([])
  // 불러올 때 선택돼 있던 채널 — 봇이 더 이상 볼 수 없는 채널을 해제해도 목록에서 사라지지 않게 기억해 둔다
  const [savedChannelIds, setSavedChannelIds] = useState([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiClient.get(`/servers/${serverId}`),
      apiClient.get(`/servers/${serverId}/monitoring-alert`),
    ])
      .then(([serverRes, alertRes]) => {
        const alert = alertRes.data.data
        setServer(serverRes.data.data)
        setMetrics(alert.metrics)
        setChannels(alert.channels)
        setRules(alert.rules.map(r => newRow({ key: r.key, op: r.op, threshold: String(r.threshold) })))
        setWebhooks(alert.webhookUrls.map(url => newRow({ url })))
        setChannelIds(alert.channelIds)
        setSavedChannelIds(alert.channelIds)
      })
      .catch((err) => setLoadError(
        err.response?.status === 403
          ? '이 서버의 설정을 변경할 권한이 없습니다.'
          : '알림 설정을 불러오지 못했습니다.',
      ))
      .finally(() => setLoading(false))
  }, [serverId])

  const updateRule = (rowId, field, value) => {
    setRules(prev => prev.map(r => (r.rowId === rowId ? { ...r, [field]: value } : r)))
    setError(null)
  }

  const updateWebhook = (rowId, url) => {
    setWebhooks(prev => prev.map(w => (w.rowId === rowId ? { ...w, url } : w)))
    setError(null)
  }

  const toggleChannel = (channelId, checked) => {
    setChannelIds(prev => (checked ? [...prev, channelId] : prev.filter(id => id !== channelId)))
  }

  const validate = () => {
    for (const [i, rule] of rules.entries()) {
      if (!rule.key) return `규칙 ${i + 1}: 지표 이름을 선택해주세요.`
      if (!isCompleteNumber(rule.threshold)) return `규칙 ${i + 1}: 기준값을 숫자로 입력해주세요.`
    }
    for (const [i, webhook] of webhooks.entries()) {
      if (!DISCORD_WEBHOOK.test(webhook.url.trim())) {
        return `웹후크 ${i + 1}: 디스코드 웹후크 주소(https://discord.com/api/webhooks/...)를 입력해주세요.`
      }
    }
    return null
  }

  const handleSave = async () => {
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await apiClient.put(`/servers/${server.id}/monitoring-alert`, {
        rules: rules.map(({ key, op, threshold }) => ({ key, op, threshold: Number(threshold) })),
        channelIds,
        webhookUrls: webhooks.map(w => w.url.trim()),
      })
      navigate(`/settings/${server.id}`)
    } catch (err) {
      setError(err.response?.data?.error || '알림 설정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
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

  // 서버 설정 페이지와 같은 조건 (admin 또는 소유자) — 알림 설정 API도 같은 조건이다
  if (!isAdmin && server.ownerId !== user?.id) {
    return <div className="server-settings"><p className="servers-message">이 서버의 설정을 변경할 권한이 없습니다.</p></div>
  }

  // 저장돼 있지만 지금 목록에 없는 지표·채널도 보이게 해서 바꾸거나 해제할 수 있게 한다
  const metricOptions = [
    ...metrics,
    ...[...new Set(rules.map(r => r.key))]
      .filter(key => key && !metrics.some(m => m.key === key))
      .map(key => ({ key, label: `${key} (지원하지 않는 지표)` })),
  ]
  const channelOptions = [
    ...channels,
    ...savedChannelIds
      .filter(id => !channels.some(c => c.id === id))
      .map(id => ({ id, name: `알 수 없는 채널 (${id})`, category: '봇이 볼 수 없음' })),
  ]

  return (
    <div className="server-settings">
      <div className="settings-header">
        <h2>
          <Link to={`/settings/${server.id}`} className="settings-header-link">설정</Link>
          <span className="settings-header-separator">&gt;</span>
          모니터링 알림
        </h2>
      </div>

      <div className="server-form">
        <section className="alert-section">
          <h3 className="alert-section-title">규칙 설정</h3>
          {metrics.length === 0 && (
            <p className="server-form-hint">
              모니터링 데이터 소스가 연결되지 않아 고를 수 있는 지표가 없습니다.{' '}
              <Link to={`/settings/${server.id}`} className="monitoring-status-link">서버 설정에서 연결하기</Link>
            </p>
          )}
          {rules.length === 0 && <p className="alert-empty">설정된 규칙이 없습니다.</p>}
          {rules.map(rule => (
            <div key={rule.rowId} className="alert-row alert-rule-row">
              <select
                aria-label="지표 이름"
                className="alert-rule-key"
                value={rule.key}
                onChange={(e) => updateRule(rule.rowId, 'key', e.target.value)}
              >
                <option value="">지표 이름</option>
                {metricOptions.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              <select
                aria-label="연산"
                className="alert-rule-op"
                value={rule.op}
                onChange={(e) => updateRule(rule.rowId, 'op', e.target.value)}
              >
                {OPS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              <input
                aria-label="기준값"
                className="alert-rule-threshold"
                type="text"
                inputMode="decimal"
                placeholder="기준값"
                value={rule.threshold}
                onChange={(e) => THRESHOLD_INPUT.test(e.target.value) && updateRule(rule.rowId, 'threshold', e.target.value)}
              />
              <button
                type="button"
                className="alert-row-delete"
                title="규칙 삭제"
                onClick={() => setRules(prev => prev.filter(r => r.rowId !== rule.rowId))}
              >
                <span className="material-icons">delete</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="console-token-button alert-add-button"
            onClick={() => setRules(prev => [...prev, newRow({ key: '', op: 'GT', threshold: '' })])}
          >
            규칙 추가
          </button>
        </section>

        <section className="alert-section">
          <h3 className="alert-section-title">알림 대상 설정</h3>

          <div className="server-form-row">
            <label>웹후크</label>
            {webhooks.map(webhook => (
              <div key={webhook.rowId} className="alert-row">
                <input
                  aria-label="웹후크 URL"
                  className="alert-webhook-url"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhook.url}
                  onChange={(e) => updateWebhook(webhook.rowId, e.target.value)}
                />
                <button
                  type="button"
                  className="alert-row-delete"
                  title="웹후크 삭제"
                  onClick={() => setWebhooks(prev => prev.filter(w => w.rowId !== webhook.rowId))}
                >
                  <span className="material-icons">delete</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="console-token-button alert-add-button"
              onClick={() => setWebhooks(prev => [...prev, newRow({ url: '' })])}
            >
              웹후크 추가
            </button>
          </div>

          <div className="server-form-row">
            <label>마랜디 채널</label>
            <div className="server-form-manager-list">
              {channelOptions.length === 0 && (
                <span className="server-form-color-empty">"테트라" 봇이 볼 수 있는 채널이 없습니다</span>
              )}
              {channelOptions.map(channel => (
                <label key={channel.id} className="server-form-manager-item">
                  <input
                    type="checkbox"
                    checked={channelIds.includes(channel.id)}
                    onChange={(e) => toggleChannel(channel.id, e.target.checked)}
                  />
                  # {channel.name}
                  {channel.category && <span className="radio-option-detail">{channel.category}</span>}
                </label>
              ))}
            </div>
          </div>
        </section>

        {error && <p className="server-form-error">{error}</p>}

        <div className="server-form-actions">
          <button type="button" className="server-form-submit" onClick={handleSave} disabled={saving}>
            {saving ? '저장하는 중...' : '변경사항 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertSettings
