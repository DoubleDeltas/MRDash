import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import './UserManagement.css'

const PROVIDER_LABELS = {
  LOCAL: '로컬',
  DISCORD: 'Discord',
}

const avatarUrl = (u) => u.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.providerId}`
const displayName = (u) => u.nickname || u.providerId
// 디스코드 유저는 실제 핸들이라 @를 붙이고, 로컬 유저는 그냥 자기가 정한 ID라 @ 없이 그대로 보여준다.
const displayHandle = (u) => (u.handle ? `@${u.handle}` : u.providerId)

function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [openSettingsId, setOpenSettingsId] = useState(null)
  const [roleDraft, setRoleDraft] = useState('USER')
  const [savingRole, setSavingRole] = useState(false)
  const [rowError, setRowError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadUsers = async () => {
    const res = await apiClient.get('/users')
    setUsers(res.data.data)
  }

  useEffect(() => {
    loadUsers()
      .catch(() => setError('유저 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSettingsClick = (u) => {
    setRowError(null)
    if (openSettingsId === u.id) {
      setOpenSettingsId(null)
      return
    }
    setOpenSettingsId(u.id)
    setRoleDraft(u.role)
  }

  const handleSaveRole = async (id) => {
    setSavingRole(true)
    setRowError(null)
    try {
      const res = await apiClient.patch(`/users/${id}/role`, { role: roleDraft })
      setUsers(prev => prev.map(u => (u.id === id ? res.data.data : u)))
      setOpenSettingsId(null)
    } catch (err) {
      setRowError(err.response?.data?.error || '권한 변경에 실패했습니다.')
    } finally {
      setSavingRole(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('정말로 이 유저를 탈퇴시키겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return
    }
    setDeletingId(id)
    setRowError(null)
    try {
      await apiClient.delete(`/users/${id}`)
      setUsers(prev => prev.filter(u => u.id !== id))
      setOpenSettingsId(null)
    } catch (err) {
      setRowError(err.response?.data?.error || '탈퇴 처리에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="user-management">
        <div className="users-loading">
          <div className="loading-spinner" />
          <p className="users-message">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="user-management"><p className="users-message">{error}</p></div>
  }

  return (
    <div className="user-management">
      <div className="users-header">
        <h2>유저 관리</h2>
        <p>MRD에 등록된 유저 목록입니다. 권한을 조정하거나 탈퇴시킬 수 있습니다.</p>
      </div>

      <div className="users-list">
        {users.length === 0 && (
          <p className="users-message">등록된 유저가 없습니다.</p>
        )}
        {users.map(u => {
          const isSelf = u.id === me?.id
          return (
            <div key={u.id} className="user-card-wrapper">
              <div className="user-card">
                <div className="user-avatar-wrap">
                  <img src={avatarUrl(u)} alt={displayName(u)} />
                </div>

                <div className="user-info">
                  <h3 className="user-name">
                    {displayName(u)}
                    {isSelf && <span className="user-self-badge">나</span>}
                  </h3>
                  <p className="user-handle">{displayHandle(u)}</p>
                </div>

                <div className="user-meta">
                  <span className="user-provider-badge">{PROVIDER_LABELS[u.provider] || u.provider}</span>
                  <span className={`user-role-badge ${u.role === 'ADMIN' ? 'admin' : ''}`}>{u.role}</span>
                </div>

                <div className="user-actions">
                  <button
                    className="action-button"
                    onClick={() => handleSettingsClick(u)}
                    disabled={isSelf}
                    title={isSelf ? '자기 자신은 설정할 수 없습니다' : '설정'}
                  >
                    <span className="material-icons">settings</span>
                  </button>
                </div>
              </div>

              {openSettingsId === u.id && (
                <div className="user-settings-panel">
                  <div className="user-settings-row">
                    <label>권한</label>
                    <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)}>
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <button
                      className="user-settings-save"
                      onClick={() => handleSaveRole(u.id)}
                      disabled={savingRole || roleDraft === u.role}
                    >
                      {savingRole ? '저장하는 중...' : '저장'}
                    </button>
                  </div>

                  {rowError && <p className="user-settings-error">{rowError}</p>}

                  <div className="user-settings-row">
                    <button
                      className="user-delete-button"
                      onClick={() => handleDelete(u.id)}
                      disabled={deletingId === u.id}
                    >
                      {deletingId === u.id ? '탈퇴 처리 중...' : '탈퇴시키기'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default UserManagement
