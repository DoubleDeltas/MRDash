import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import NoticeCard from '../components/NoticeCard'
import './Main.css'

function Main() {
  // 공지는 관리 페이지(/admin)에서 ADMIN이 작성한다 — GET /notices는 로그인 없이도 볼 수 있다
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    apiClient.get('/notices')
      .then(res => setNotices(res.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="main-page">
      <section className="notices-section">
        <h2>📢 공지사항</h2>
        <div className="notices-list">
          {loading && <p className="notices-message">불러오는 중...</p>}
          {!loading && error && <p className="notices-message">공지사항을 불러오지 못했습니다.</p>}
          {!loading && !error && notices.length === 0 && <p className="notices-message">등록된 공지사항이 없습니다.</p>}
          {notices.map(notice => <NoticeCard key={notice.id} notice={notice} />)}
        </div>
      </section>

      <section className="quick-links-section">
        <h2>🔗 빠른 링크</h2>
        <div className="quick-links">
          <a href="#minecraft" className="quick-link">
            <span className="material-icons">view_in_ar</span>
            <span>마인크래프트</span>
          </a>
          <a href={window.__env?.VITE_URL_MZPEDIA} target="_blank" rel="noopener noreferrer" className="quick-link">
            <span className="material-icons">book</span>
            <span>마랜디위키</span>
          </a>
        </div>
      </section>
    </div>
  )
}

export default Main
