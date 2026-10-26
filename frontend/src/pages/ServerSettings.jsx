import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ServerFormFields, EMPTY_FORM, serverImageUrl } from '../components/ServerFormFields'
import PrometheusIcon from '../components/PrometheusIcon'
import './MinecraftServers.css'
import './ServerSettings.css'

const DATA_SOURCE_LABELS = {
  PROMETHEUS: 'Prometheus',
}

function ServerSettings() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [allUsers, setAllUsers] = useState(null)

  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState(null)
  const [issuedToken, setIssuedToken] = useState(null)
  const [issuingToken, setIssuingToken] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [dataSourceUpdating, setDataSourceUpdating] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiClient.get(`/servers/${serverId}`)
      .then(res => {
        const s = res.data.data
        setServer(s)
        setEditForm({
          name: s.name,
          description: s.description || '',
          address: s.address,
          mcVersion: s.mcVersion,
          mcPlatform: s.mcPlatform,
          color: s.color,
          imageBase64: null,
          ownerId: s.ownerId,
          managerIds: s.managerIds || [],
        })
      })
      .catch(() => setLoadError('서버 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [serverId])

  useEffect(() => {
    if (!isAdmin) return
    apiClient.get('/users')
      .then(res => setAllUsers(res.data.data))
      .catch(() => setAllUsers([]))
  }, [isAdmin])

  const handleEditFormChange = (e) => {
    setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleIssueToken = async () => {
    setIssuingToken(true)
    try {
      const res = await apiClient.post(`/servers/${server.id}/console-token`)
      setIssuedToken(res.data.data.consoleToken)
      setTokenCopied(false)
      setServer(prev => ({ ...prev, hasConsoleToken: true }))
    } catch {
      setEditError('콘솔 토큰 발급에 실패했습니다.')
    } finally {
      setIssuingToken(false)
    }
  }

  // 연결 해제는 [저장]과 별개로 즉시 반영한다 (콘솔 토큰 발급과 같은 방식).
  // 연결은 Host/Port 등을 받아야 해서 /settings/prometheus/:serverId 페이지에서 한다.
  const handleDisconnectDataSource = async () => {
    setDataSourceUpdating(true)
    try {
      await apiClient.delete(`/servers/${server.id}/monitoring-data-source`)
      setServer(prev => ({ ...prev, monitoringDataSource: null }))
    } catch {
      setEditError('모니터링 데이터 소스 연결 해제에 실패했습니다.')
    } finally {
      setDataSourceUpdating(false)
    }
  }

  const handleCopyToken = async () => {
    if (!issuedToken) return
    await navigator.clipboard.writeText(issuedToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    try {
      await apiClient.delete(`/servers/${server.id}`)
      navigate('/minecraft')
    } catch (err) {
      setEditError(err.response?.data?.error || '서버 삭제에 실패했습니다.')
      setDeleteConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditSubmitting(true)
    setEditError(null)
    try {
      await apiClient.put(`/servers/${server.id}`, editForm)
      navigate('/minecraft')
    } catch (err) {
      setEditError(err.response?.data?.error || '서버 설정 저장에 실패했습니다.')
    } finally {
      setEditSubmitting(false)
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

  // [설정] 버튼과 같은 조건 — 수정/삭제/토큰 발급 API도 admin 또는 소유자만 허용한다.
  if (!isAdmin && server.ownerId !== user?.id) {
    return <div className="server-settings"><p className="servers-message">이 서버의 설정을 변경할 권한이 없습니다.</p></div>
  }

  return (
    <div className="server-settings">
      <div className="settings-header">
        <h2>설정</h2>
      </div>

      <form className="server-form" onSubmit={handleEditSubmit}>
        <ServerFormFields
          form={editForm}
          onChange={handleEditFormChange}
          onColorReset={() => setEditForm(prev => ({ ...prev, color: null }))}
          imagePreviewUrl={editForm.imageBase64 || (server.hasImage ? serverImageUrl(server) : null)}
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
          <label>모니터링 데이터 소스 연결</label>
          {/* 상태별로 key를 달리해 버튼을 새로 만든다 — 같은 <button>을 재사용하면 클래스만 바뀌면서
              transition: all 때문에 한 버튼이 다른 버튼 모양으로 변하는 애니메이션이 생긴다 */}
          {server.monitoringDataSource ? (
            <div key="connected" className="monitoring-source-row">
              <span className="monitoring-source-label">
                {DATA_SOURCE_LABELS[server.monitoringDataSource] || server.monitoringDataSource} 데이터 소스가 연결되어 있습니다.
                <Link
                  to={`/settings/prometheus/${server.id}`}
                  className="monitoring-source-link"
                  title="데이터 소스 설정"
                >
                  <span className="material-icons">north_east</span>
                </Link>
              </span>
              <button
                type="button"
                className="server-form-delete"
                onClick={handleDisconnectDataSource}
                disabled={dataSourceUpdating}
              >
                연결 해제
              </button>
            </div>
          ) : (
            <div key="disconnected" className="monitoring-source-row">
              <span className="monitoring-source-label">모니터링 데이터 소스가 연결되지 않았습니다.</span>
              <button
                type="button"
                className="console-token-button monitoring-source-connect"
                onClick={() => navigate(`/settings/prometheus/${server.id}`)}
              >
                <PrometheusIcon size={32} />
                Prometheus 연결
              </button>
            </div>
          )}
        </div>

        <div className="server-form-row">
          <label>콘솔 연동</label>
          <div className="console-token-row">
            <button
              type="button"
              className="console-token-button"
              onClick={handleIssueToken}
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
            onClick={() => setDeleteConfirmOpen(true)}
          >
            삭제
          </button>
          <button type="button" className="server-form-cancel" onClick={() => navigate('/minecraft')}>
            취소
          </button>
        </div>
      </form>

      {deleteConfirmOpen && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-message">
              정말로 <strong>{server.name}</strong> 서버를 삭제할까요?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-ok" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? '삭제 중...' : '삭제'}
              </button>
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServerSettings
