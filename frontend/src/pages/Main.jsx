import { useState } from 'react'
import './Main.css'

function Main() {
  const [notices] = useState([
    {
      id: 1,
      title: '마랜디 대시보드 오픈',
      content: '마랜디 커뮤니티 통합 관리 대시보드가 새롭게 오픈되었습니다. 앞으로 다양한 서비스를 한곳에서 관리할 수 있습니다.',
      date: '2026-05-25',
      category: '공지'
    },
    {
      id: 2,
      title: '마인크래프트 서버 점검 예정',
      content: '초보자 서버의 업그레이드로 인해 5월 30일 오후 2시부터 4시까지 점검이 예정되어 있습니다. 이용에 불편을 드려 죄송합니다.',
      date: '2026-05-24',
      category: '공지'
    },
    {
      id: 3,
      title: '마랜디위키 업데이트 완료',
      content: '마랜디위키에 새로운 섹션이 추가되었습니다. 커뮤니티 가이드 및 자주 묻는 질문 섹션을 확인해보세요.',
      date: '2026-05-23',
      category: '업데이트'
    }
  ])

  const getCategoryColor = (category) => {
    switch (category) {
      case '공지':
        return '#7289DA'
      case '업데이트':
        return '#43B581'
      default:
        return '#72767d'
    }
  }

  return (
    <div className="main-page">
      <section className="notices-section">
        <h2>📢 공지사항</h2>
        <div className="notices-list">
          {notices.map(notice => (
            <article key={notice.id} className="notice-card">
              <div className="notice-header">
                <h3 className="notice-title">{notice.title}</h3>
                <span className="notice-category" style={{ backgroundColor: getCategoryColor(notice.category) }}>
                  {notice.category}
                </span>
              </div>
              <p className="notice-content">{notice.content}</p>
              <div className="notice-footer">
                <time className="notice-date">{notice.date}</time>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="quick-links-section">
        <h2>🔗 빠른 링크</h2>
        <div className="quick-links">
          <a href="#minecraft" className="quick-link">
            <span className="material-icons">view_in_ar</span>
            <span>마인크래프트</span>
          </a>
          <a href="https://mzpedia.kro.kr/wiki/index.php/%EB%8C%80%EB%AC%B8" target="_blank" rel="noopener noreferrer" className="quick-link">
            <span className="material-icons">book</span>
            <span>마랜디위키</span>
          </a>
        </div>
      </section>
    </div>
  )
}

export default Main
