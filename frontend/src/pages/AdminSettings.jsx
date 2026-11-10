import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import NoticeCard, { NOTICE_CATEGORIES } from '../components/NoticeCard'
import './MinecraftServers.css'
import './UserManagement.css'
import './AdminSettings.css'

const TITLE_MAX = 100
const CONTENT_MAX = 2000

const EMPTY_DRAFT = { title: '', content: '', category: NOTICE_CATEGORIES[0].value }

// 공지 작성·수정 폼 — 입력하는 동안 메인 페이지에 보일 모양을 아래에 미리 보여준다
function NoticeForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [draft, setDraft] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (field) => (e) => setDraft(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ title: draft.title.trim(), content: draft.content.trim(), category: draft.category })
    } catch (err) {
      setError(err.response?.data?.error || '공지 저장에 실패했습니다.')
      setSubmitting(false)
    }
  }

  return (
    <form className="server-form notice-form" onSubmit={handleSubmit}>
      <div className="notice-form-fields">
        <div className="server-form-row">
          <label htmlFor="notice-title">제목</label>
          <input
            id="notice-title"
            value={draft.title}
            onChange={update('title')}
            maxLength={TITLE_MAX}
            required
          />
        </div>
        <div className="server-form-row notice-form-category">
          <label htmlFor="notice-category">분류</label>
          <select id="notice-category" value={draft.category} onChange={update('category')}>
            {NOTICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="server-form-row">
        <label htmlFor="notice-content">내용</label>
        <textarea
          id="notice-content"
          value={draft.content}
          onChange={update('content')}
          maxLength={CONTENT_MAX}
          rows={5}
          required
        />
        <p className="notice-form-count">{draft.content.length} / {CONTENT_MAX}</p>
      </div>

      <div className="server-form-row">
        <label>미리보기</label>
        <div className="notice-form-preview">
          <NoticeCard
            notice={{
              title: draft.title || '제목',
              content: draft.content || '내용',
              category: draft.category,
              createdAt: initial.createdAt ?? new Date().toISOString(),
            }}
          />
        </div>
      </div>

      {error && <p className="server-form-error">{error}</p>}

      <div className="server-form-actions">
        <button type="submit" className="server-form-submit" disabled={submitting}>
          {submitting ? '저장하는 중...' : submitLabel}
        </button>
        <button type="button" className="server-form-cancel" onClick={onCancel} disabled={submitting}>
          취소
        </button>
      </div>
    </form>
  )
}

// ADMIN 전용 MRDash 관리 페이지 — 지금은 메인 페이지 공지사항 관리
function AdminSettings() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  // 열려 있는 폼: null | 'new' | 공지 id (수정)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [listError, setListError] = useState(null)

  useEffect(() => {
    apiClient.get('/notices')
      .then(res => setNotices(res.data.data))
      .catch(() => setLoadError('공지사항을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const openForm = (target) => {
    setListError(null)
    setEditing(target)
  }

  const handleCreate = async (draft) => {
    const res = await apiClient.post('/notices', draft)
    setNotices(prev => [res.data.data, ...prev])
    setEditing(null)
  }

  const handleUpdate = (id) => async (draft) => {
    const res = await apiClient.put(`/notices/${id}`, draft)
    setNotices(prev => prev.map(n => (n.id === id ? res.data.data : n)))
    setEditing(null)
  }

  const handleDelete = async (notice) => {
    if (!window.confirm(`"${notice.title}" 공지를 삭제할까요? 되돌릴 수 없습니다.`)) return
    setDeletingId(notice.id)
    setListError(null)
    try {
      await apiClient.delete(`/notices/${notice.id}`)
      setNotices(prev => prev.filter(n => n.id !== notice.id))
    } catch (err) {
      setListError(err.response?.data?.error || '공지 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="user-management admin-settings">
      <div className="users-header">
        <h2>MRDash 관리</h2>
        <p>ADMIN만 볼 수 있는 페이지입니다. MRDash 전체에 적용되는 설정을 관리합니다.</p>
      </div>

      <section className="admin-section">
        <div className="admin-section-header">
          <h3>
            <span className="material-icons">campaign</span>
            메인 공지사항
          </h3>
          {editing !== 'new' && (
            <button type="button" className="add-server-button" onClick={() => openForm('new')}>
              <span className="material-icons">add</span>
              새 공지
            </button>
          )}
        </div>
        <p className="admin-section-description">메인 페이지 상단에 최신순으로 보입니다.</p>

        {editing === 'new' && (
          <NoticeForm
            initial={EMPTY_DRAFT}
            submitLabel="등록"
            onSubmit={handleCreate}
            onCancel={() => setEditing(null)}
          />
        )}

        {listError && <p className="server-form-error">{listError}</p>}

        {loading && <p className="users-message">불러오는 중...</p>}
        {loadError && <p className="users-message">{loadError}</p>}
        {!loading && !loadError && notices.length === 0 && editing !== 'new' && (
          <p className="users-message">등록된 공지사항이 없습니다.</p>
        )}

        <div className="admin-notice-list">
          {notices.map(notice => (editing === notice.id ? (
            <NoticeForm
              key={notice.id}
              initial={notice}
              submitLabel="저장"
              onSubmit={handleUpdate(notice.id)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div key={notice.id} className="admin-notice-row">
              <div className="admin-notice-card">
                <NoticeCard notice={notice} />
              </div>
              <div className="admin-notice-actions">
                <button
                  type="button"
                  className="action-button"
                  onClick={() => openForm(notice.id)}
                  title="수정"
                >
                  <span className="material-icons">edit</span>
                </button>
                <button
                  type="button"
                  className="action-button admin-notice-delete"
                  onClick={() => handleDelete(notice)}
                  disabled={deletingId === notice.id}
                  title="삭제"
                >
                  <span className="material-icons">delete</span>
                </button>
              </div>
            </div>
          )))}
        </div>
      </section>
    </div>
  )
}

export default AdminSettings
