import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, API_BASE_URL } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ServerFormFields, PLATFORM_LABELS, EMPTY_FORM, serverImageUrl } from '../components/ServerFormFields'
import './MinecraftServers.css'

const playerHeadUrl = (uuid) => `${API_BASE_URL}/players/${uuid}/head`

// 배경색 밝기에 따라 검정/흰색 중 더 잘 보이는 글자색을 고른다 (YIQ luma)
const getContrastTextColor = (hexColor) => {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#000000' : '#FFFFFF'
}

// 색상 미설정 시 쓰던 #B9BBBE(secondary)/#72767d(tertiary)는 흰색을 검정 쪽으로
// 각각 약 27%, 53% 섞은 값이다. 카드에 색이 설정됐을 때도 같은 비율로
// (primary 글자색 -> 반대색) 섞어서 같은 위계감을 유지한다.
const SECONDARY_BLEND = 0.27
const TERTIARY_BLEND = 0.53

const mixHexColors = (hexA, hexB, t) => {
  const channels = (hex) => [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(h => parseInt(h, 16))
  const a = channels(hexA)
  const b = channels(hexB)
  const mixed = a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
  return `#${mixed.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const getServerTextColors = (backgroundColor) => {
  const primary = getContrastTextColor(backgroundColor)
  const opposite = primary === '#000000' ? '#FFFFFF' : '#000000'
  return {
    primary,
    secondary: mixHexColors(primary, opposite, SECONDARY_BLEND),
    tertiary: mixHexColors(primary, opposite, TERTIARY_BLEND),
  }
}

function MinecraftServers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isOwner = (server) => server.ownerId === user?.id
  const isManager = (server) => !!user && server.managerIds?.includes(user.id)

  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusesLoading, setStatusesLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [hoveredButtonId, setHoveredButtonId] = useState(null)
  const [hoveredServerId, setHoveredServerId] = useState(null)
  const [hoveredPlayersId, setHoveredPlayersId] = useState(null)
  const [statuses, setStatuses] = useState({})
  const [agentStatuses, setAgentStatuses] = useState({})

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const loadServers = async () => {
    const res = await apiClient.get('/servers')
    const list = res.data.data
    setServers(list)

    const [statusResults, agentResults] = await Promise.all([
      Promise.allSettled(list.map(server => apiClient.get(`/servers/${server.id}/status`))),
      Promise.allSettled(list.map(server => apiClient.get(`/servers/${server.id}/agent-status`))),
    ])

    const newStatuses = {}
    const newAgentStatuses = {}
    list.forEach((server, i) => {
      newStatuses[server.id] = statusResults[i].status === 'fulfilled'
        ? statusResults[i].value.data.data
        : { online: false }
      newAgentStatuses[server.id] = agentResults[i].status === 'fulfilled'
        ? agentResults[i].value.data.data.connected
        : false
    })
    setStatuses(newStatuses)
    setAgentStatuses(newAgentStatuses)
  }

  useEffect(() => {
    loadServers()
      .catch(() => setError('서버 목록을 불러오지 못했습니다.'))
      .finally(() => {
        setLoading(false)
        setStatusesLoading(false)
      })
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadServers()
    } catch {
      setError('서버 목록을 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleConsoleClick = (serverId) => {
    navigate(`/console/${serverId}`)
  }

  const handleFormChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await apiClient.post('/servers', form)
      setServers(prev => [...prev, res.data.data])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setFormError(err.response?.data?.error || '서버 추가에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSettingsClick = (serverId) => {
    navigate(`/settings/${serverId}`)
  }

  if (loading) {
    return (
      <div className="minecraft-servers">
        <div className="servers-loading">
          <div className="loading-spinner" />
          <p className="servers-message">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="minecraft-servers"><p className="servers-message">{error}</p></div>
  }

  if (statusesLoading) {
    return (
      <div className="minecraft-servers">
        <div className="servers-loading">
          <div className="loading-spinner" />
          <p className="servers-message">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 온라인인 서버를 위로, 같은 온라인/오프라인 그룹 내에서는 DB id 순서대로 정렬
  const sortedServers = [...servers].sort((a, b) => {
    const aOnline = statuses[a.id]?.online ? 1 : 0
    const bOnline = statuses[b.id]?.online ? 1 : 0
    if (aOnline !== bOnline) return bOnline - aOnline
    return a.id - b.id
  })

  return (
    <div className="minecraft-servers">
      <div className="server-form-section">
        <div className="servers-toolbar">
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="새로고침"
          >
            <span className={`material-icons ${refreshing ? 'icon-spin' : ''}`}>refresh</span>
          </button>

          {isAdmin && (
            <button className="add-server-button" onClick={() => setShowForm(prev => !prev)}>
              <span className="material-icons">{showForm ? 'close' : 'add'}</span>
              {showForm ? '취소' : '서버 추가'}
            </button>
          )}
        </div>

        {isAdmin && showForm && (
          <form className="server-form" onSubmit={handleSubmit}>
            <ServerFormFields
              form={form}
              onChange={handleFormChange}
              onColorReset={() => setForm(prev => ({ ...prev, color: null }))}
              imagePreviewUrl={form.imageBase64}
              onImageConfirm={(dataUrl) => setForm(prev => ({ ...prev, imageBase64: dataUrl }))}
            />

            {formError && <p className="server-form-error">{formError}</p>}

            <button type="submit" className="server-form-submit" disabled={submitting}>
              {submitting ? '추가하는 중...' : '추가'}
            </button>
          </form>
        )}
      </div>

      <div className="servers-list">
        {servers.length === 0 && (
          <p className="servers-message">등록된 서버가 없습니다.</p>
        )}
        {sortedServers.map(server => {
          const isOnlineWithColor = statuses[server.id]?.online && server.color
          const textColors = isOnlineWithColor ? getServerTextColors(server.color) : null
          const cardStyle = isOnlineWithColor
            ? {
                backgroundColor: server.color,
                '--server-text-primary': textColors.primary,
                '--server-text-secondary': textColors.secondary,
                '--server-text-tertiary': textColors.tertiary,
              }
            : undefined

          return (
          <div key={server.id} className="server-card-wrapper">
            <div className="server-card" style={cardStyle}>
              <div className="server-logo">
                <img src={serverImageUrl(server)} alt={server.name} />
              </div>

              <div className="server-info">
                <h3 className="server-name">{server.name}</h3>
                {server.description && (
                  <p className="server-description">{server.description}</p>
                )}
                <p className="server-address">{server.address}</p>
              </div>

              <div className="server-status">
                <div className="status-indicator">
                  <div
                    className={`status-dot ${statuses[server.id]?.online ? 'open' : 'closed'}`}
                    onMouseEnter={() => setHoveredServerId(server.id)}
                    onMouseLeave={() => setHoveredServerId(null)}
                  >
                    {hoveredServerId === server.id && (
                      <div className="status-tooltip">
                        {!statuses[server.id]
                          ? '확인 중...'
                          : statuses[server.id].online
                            ? `Ping: ${statuses[server.id].ping} ms`
                            : '오프라인'}
                      </div>
                    )}
                  </div>
                  <div
                    className="player-count"
                    onMouseEnter={() => setHoveredPlayersId(server.id)}
                    onMouseLeave={() => setHoveredPlayersId(null)}
                  >
                    {statuses[server.id]?.online
                      ? `${statuses[server.id].players.online}/${statuses[server.id].players.max}`
                      : statuses[server.id]
                        ? 'OFF'
                        : ''}

                    {hoveredPlayersId === server.id && statuses[server.id]?.online && (
                      <div className="player-list-tooltip">
                        {statuses[server.id].players.sample?.length > 0 ? (
                          statuses[server.id].players.sample.map(player => (
                            <div key={player.id} className="player-list-row">
                              <img className="player-list-avatar" src={playerHeadUrl(player.id)} alt={player.name} />
                              <span className="player-list-name">{player.name}</span>
                            </div>
                          ))
                        ) : (
                          <p className="player-list-empty">접속자 목록 없음</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="server-environment">
                  {(PLATFORM_LABELS[server.mcPlatform] || server.mcPlatform)} {server.mcVersion}
                </p>
              </div>

              <div className="server-actions">
                {(isAdmin || isOwner(server) || isManager(server)) && (
                  <div
                    className="action-button-wrapper"
                    onMouseEnter={() => setHoveredButtonId(`monitoring-${server.id}`)}
                    onMouseLeave={() => setHoveredButtonId(null)}
                  >
                    <button className="action-button">
                      <span className="material-icons">monitor_heart</span>
                    </button>
                    {hoveredButtonId === `monitoring-${server.id}` && (
                      <div className="action-tooltip">모니터링</div>
                    )}
                  </div>
                )}

                {(isAdmin || isOwner(server) || isManager(server)) && (() => {
                  const agentConnected = agentStatuses[server.id] === true
                  return (
                    <div
                      className="action-button-wrapper"
                      onMouseEnter={() => setHoveredButtonId(`console-${server.id}`)}
                      onMouseLeave={() => setHoveredButtonId(null)}
                    >
                      <button
                        className="action-button"
                        onClick={() => handleConsoleClick(server.id)}
                        disabled={!agentConnected}
                      >
                        <span className="material-icons">terminal</span>
                      </button>
                      {hoveredButtonId === `console-${server.id}` && (
                        <div className="action-tooltip">
                          {agentConnected
                            ? '콘솔 접속'
                            : 'MRDash 브리지가 연결되어 있지 않아 콘솔에 접속할 수 없습니다.'}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {(isAdmin || isOwner(server)) && (
                  <div
                    className="action-button-wrapper"
                    onMouseEnter={() => setHoveredButtonId(`settings-${server.id}`)}
                    onMouseLeave={() => setHoveredButtonId(null)}
                  >
                    <button className="action-button" onClick={() => handleSettingsClick(server.id)}>
                      <span className="material-icons">settings</span>
                    </button>
                    {hoveredButtonId === `settings-${server.id}` && (
                      <div className="action-tooltip">서버 설정</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

export default MinecraftServers
