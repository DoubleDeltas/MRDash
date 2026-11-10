import '../pages/Main.css'

// 공지 카테고리 — 메인 페이지 공지 카드와 관리 페이지(/admin)의 공지 편집이 같이 쓴다.
// value는 API(/notices)의 category 값
export const NOTICE_CATEGORIES = [
  { value: 'NOTICE', label: '공지', color: '#7289DA' },
  { value: 'UPDATE', label: '업데이트', color: '#43B581' },
]

const categoryOf = (value) => NOTICE_CATEGORIES.find(c => c.value === value)
  ?? { value, label: value, color: '#72767d' }

// 공지 날짜 — KST 기준 YYYY-MM-DD
export const formatNoticeDate = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(iso))

// 메인 페이지의 공지 카드 하나 (관리 페이지의 미리보기도 같은 모양)
// notice: { title, content, category, createdAt }
function NoticeCard({ notice }) {
  const category = categoryOf(notice.category)
  return (
    <article className="notice-card">
      <div className="notice-header">
        <h3 className="notice-title">{notice.title}</h3>
        <span className="notice-category" style={{ backgroundColor: category.color }}>
          {category.label}
        </span>
      </div>
      <p className="notice-content">{notice.content}</p>
      <div className="notice-footer">
        <time className="notice-date" dateTime={notice.createdAt}>{formatNoticeDate(notice.createdAt)}</time>
      </div>
    </article>
  )
}

export default NoticeCard
