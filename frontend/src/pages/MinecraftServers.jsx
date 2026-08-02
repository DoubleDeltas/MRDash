import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, API_BASE_URL } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import ImageCropper from '../components/ImageCropper'
import './MinecraftServers.css'

const PLATFORM_LABELS = {
  VANILLA: '바닐라',
  FORGE: 'Forge',
  NEOFORGE: 'NeoForge',
  FABRIC: 'Fabric',
  QUILT: 'Quilt',
}

const EMPTY_FORM = { name: '', description: '', address: '', mcVersion: '', mcPlatform: 'VANILLA', color: null, imageBase64: null, ownerId: null, managerIds: [] }
const DEFAULT_COLOR = '#7289DA'

const serverImageUrl = (server) =>
  server.hasImage
    ? `${API_BASE_URL}/servers/${server.id}/image`
    : `https://api.dicebear.com/7.x/identicon/svg?seed=minecraft${server.id}`

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

function ServerFormFields({ form, onChange, onColorReset, imagePreviewUrl, onImageConfirm, ownerPicker, managerPicker }) {
  const [pendingFile, setPendingFile] = useState(null)

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) setPendingFile(file)
    e.target.value = ''
  }

  return (
    <>
      <div className="server-form-row">
        <label>이미지</label>
        <div className="server-form-image-picker">
          <div className="server-form-image-preview">
            {imagePreviewUrl
              ? <img src={imagePreviewUrl} alt="미리보기" />
              : <span className="material-icons">image</span>}
          </div>
          <label className="server-form-image-upload">
            이미지 선택
            <input type="file" accept="image/*" onChange={handleFileSelect} hidden />
          </label>
        </div>
      </div>
      <div className="server-form-row">
        <label>서버 이름</label>
        <input name="name" value={form.name} onChange={onChange} required />
      </div>
      <div className="server-form-row">
        <label>서버 설명</label>
        <input name="description" value={form.description} onChange={onChange} />
      </div>
      <div className="server-form-row">
        <label>연결 주소</label>
        <input name="address" value={form.address} onChange={onChange} placeholder="example.marendi.kr" required />
      </div>
      <div className="server-form-row">
        <label>Version</label>
        <input name="mcVersion" value={form.mcVersion} onChange={onChange} placeholder="1.21.1" required />
      </div>
      <div className="server-form-row">
        <label>Platform</label>
        <select name="mcPlatform" value={form.mcPlatform} onChange={onChange}>
          {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="server-form-row">
        <label>색상 (온라인일 때 카드 배경)</label>
        <div className="server-form-color-row">
          <input
            type="color"
            name="color"
            value={form.color || DEFAULT_COLOR}
            onChange={onChange}
          />
          <button type="button" className="server-form-color-reset" onClick={onColorReset}>
            리셋
          </button>
          {form.color === null && <span className="server-form-color-empty">색상 없음</span>}
        </div>
      </div>

      {ownerPicker}
      {managerPicker}

      {pendingFile && (
        <ImageCropper
          file={pendingFile}
          onConfirm={(dataUrl) => { onImageConfirm(dataUrl); setPendingFile(null) }}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </>
  )
}

function MinecraftServers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isOwner = (server) => server.ownerId === user?.id
  const isManager = (server) => !!user && server.managerIds?.includes(user.id)

  const [servers, setServers] = useState([])
  const [allUsers, setAllUsers] = useState(null)
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

  const [editingId, setEditingId] = useState(null)
  const [editingHasImage, setEditingHasImage] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState(null)
  const [issuedToken, setIssuedToken] = useState(null)
  const [issuingToken, setIssuingToken] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [deleteConfirmServer, setDeleteConfirmServer] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

  const handleIssueToken = async (serverId) => {
    setIssuingToken(true)
    try {
      const res = await apiClient.post(`/servers/${serverId}/console-token`)
      setIssuedToken(res.data.data.consoleToken)
      setTokenCopied(false)
      setServers(prev => prev.map(s => (s.id === serverId ? { ...s, hasConsoleToken: true } : s)))
    } catch {
      setEditError('콘솔 토큰 발급에 실패했습니다.')
    } finally {
      setIssuingToken(false)
    }
  }

  const handleCopyToken = async () => {
    if (!issuedToken) return
    await navigator.clipboard.writeText(issuedToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  const handleEditClick = (server) => {
    setEditingId(server.id)
    setEditingHasImage(server.hasImage)
    setEditError(null)
    setIssuedToken(null)
    setEditForm({
      name: server.name,
      description: server.description || '',
      address: server.address,
      mcVersion: server.mcVersion,
      mcPlatform: server.mcPlatform,
      color: server.color,
      imageBase64: null,
      ownerId: server.ownerId,
      managerIds: server.managerIds || [],
    })

    if (isAdmin && allUsers === null) {
      apiClient.get('/users')
        .then(res => setAllUsers(res.data.data))
        .catch(() => setAllUsers([]))
    }
  }

  const handleEditFormChange = (e) => {
    setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmServer) return
    setDeleting(true)
    try {
      await apiClient.delete(`/servers/${deleteConfirmServer.id}`)
      setServers(prev => prev.filter(s => s.id !== deleteConfirmServer.id))
      setEditingId(null)
      setIssuedToken(null)
      setDeleteConfirmServer(null)
    } catch (err) {
      setEditError(err.response?.data?.error || '서버 삭제에 실패했습니다.')
      setDeleteConfirmServer(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleEditSubmit = async (e, serverId) => {
    e.preventDefault()
    setEditSubmitting(true)
    setEditError(null)
    try {
      const res = await apiClient.put(`/servers/${serverId}`, editForm)
      setServers(prev => prev.map(s => (s.id === serverId ? res.data.data : s)))
      setEditingId(null)
    } catch (err) {
      setEditError(err.response?.data?.error || '서버 수정에 실패했습니다.')
    } finally {
      setEditSubmitting(false)
    }
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
          // 수정 중인 카드는 저장 전이라도 color picker 값을 실시간으로 미리보기하고,
          // 취소하면 editForm이 버려지므로 자연히 원래 색(server.color)으로 돌아간다.
          const previewColor = editingId === server.id ? editForm.color : server.color
          const isOnlineWithColor = statuses[server.id]?.online && previewColor
          const textColors = isOnlineWithColor ? getServerTextColors(previewColor) : null
          const cardStyle = isOnlineWithColor
            ? {
                backgroundColor: previewColor,
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
                {(isAdmin || isOwner(server) || isManager(server)) && (() => {
                  const agentConnected = agentStatuses[server.id] === true
                  return (
                    <button
                      className="action-button"
                      onMouseEnter={() => setHoveredButtonId(`console-${server.id}`)}
                      onMouseLeave={() => setHoveredButtonId(null)}
                      onClick={() => agentConnected && handleConsoleClick(server.id)}
                      disabled={!agentConnected}
                    >
                      <span className="material-icons">terminal</span>
                      {hoveredButtonId === `console-${server.id}` && (
                        <div className="action-tooltip">
                          {agentConnected
                            ? '콘솔 접속'
                            : 'MRDash 브리지가 연결되어 있지 않아 콘솔에 접속할 수 없습니다.'}
                        </div>
                      )}
                    </button>
                  )
                })()}

                {(isAdmin || isOwner(server)) && (
                  <button
                    className="action-button"
                    onMouseEnter={() => setHoveredButtonId(`edit-${server.id}`)}
                    onMouseLeave={() => setHoveredButtonId(null)}
                    onClick={() => handleEditClick(server)}
                    title="서버 수정"
                  >
                    <span className="material-icons">settings</span>
                    {hoveredButtonId === `edit-${server.id}` && (
                      <div className="action-tooltip">서버 수정</div>
                    )}
                  </button>
                )}
              </div>
            </div>

            {editingId === server.id && (
              <form className="server-form" onSubmit={(e) => handleEditSubmit(e, server.id)}>
                <ServerFormFields
                  form={editForm}
                  onChange={handleEditFormChange}
                  onColorReset={() => setEditForm(prev => ({ ...prev, color: null }))}
                  imagePreviewUrl={editForm.imageBase64 || (editingHasImage ? serverImageUrl(server) : null)}
                  onImageConfirm={(dataUrl) => setEditForm(prev => ({ ...prev, imageBase64: dataUrl }))}
                  ownerPicker={isAdmin && (
                    <div className="server-form-row">
                      <label>소유자</label>
                      <select
                        value={editForm.ownerId || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, ownerId: e.target.value || null }))}
                      >
                        <option value="">없음</option>
                        {(allUsers || []).map(u => (
                          <option key={u.id} value={u.id}>
                            {u.nickname || u.handle || u.providerId}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  managerPicker={isAdmin && (
                    <div className="server-form-row">
                      <label>관리자 (콘솔 접속만 가능)</label>
                      <div className="server-form-manager-list">
                        {(allUsers || []).length === 0 && (
                          <span className="server-form-color-empty">유저가 없습니다</span>
                        )}
                        {(allUsers || []).map(u => (
                          <label key={u.id} className="server-form-manager-item">
                            <input
                              type="checkbox"
                              checked={editForm.managerIds.includes(u.id)}
                              onChange={(e) => {
                                setEditForm(prev => ({
                                  ...prev,
                                  managerIds: e.target.checked
                                    ? [...prev.managerIds, u.id]
                                    : prev.managerIds.filter(id => id !== u.id),
                                }))
                              }}
                            />
                            {u.nickname || u.handle || u.providerId}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                />

                <div className="server-form-row">
                  <label>콘솔 연동</label>
                  <div className="console-token-row">
                    <button
                      type="button"
                      className="console-token-button"
                      onClick={() => handleIssueToken(server.id)}
                      disabled={issuingToken}
                    >
                      {server.hasConsoleToken ? '콘솔 토큰 재발급' : '콘솔 토큰 발급'}
                    </button>
                    {issuedToken && <code className="console-token-value">{issuedToken}</code>}
                    {issuedToken && (
                      <button
                        type="button"
                        className="console-token-copy"
                        onClick={handleCopyToken}
                      >
                        <span className="material-icons">{tokenCopied ? 'check' : 'content_copy'}</span>
                        {tokenCopied ? '복사됨' : '복사하기'}
                      </button>
                    )}
                  </div>
                  {issuedToken && (
                    <p className="console-token-hint">
                      이 토큰은 다시 보여주지 않습니다. MRD bridge의 API Key 칸에 지금 복사해두세요.
                    </p>
                  )}
                </div>

                {editError && <p className="server-form-error">{editError}</p>}

                <div className="server-form-actions">
                  <button type="submit" className="server-form-submit" disabled={editSubmitting}>
                    {editSubmitting ? '저장하는 중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    className="server-form-delete"
                    disabled={!isAdmin && !isOwner(server)}
                    onClick={() => setDeleteConfirmServer(server)}
                  >
                    삭제
                  </button>
                  <button type="button" className="server-form-cancel" onClick={() => { setEditingId(null); setIssuedToken(null) }}>
                    취소
                  </button>
                </div>
              </form>
            )}
          </div>
          )
        })}
      </div>
      {deleteConfirmServer && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteConfirmServer(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-message">
              정말로 <strong>{deleteConfirmServer.name}</strong> 서버를 삭제할까요?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-ok" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? '삭제 중...' : '삭제'}
              </button>
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirmServer(null)} disabled={deleting}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MinecraftServers
