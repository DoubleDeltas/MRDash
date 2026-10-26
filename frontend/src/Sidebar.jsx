import { useLocation, useNavigate } from 'react-router-dom'
import './Sidebar.css'
import { pages } from './pageConstants'
import SidebarUser from './components/SidebarUser'
import { useAuth } from './auth/AuthContext'

// vite.config.js의 define으로 주입된 빌드 시각을 KST "yymmdd hh:mm"으로 표시
const formatBuildTime = (iso) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map(p => [p.type, p.value])
  )
  return `${parts.year}${parts.month}${parts.day} ${parts.hour}:${parts.minute}`
}

const BUILD_LABEL = formatBuildTime(__BUILD_TIME__)

function Sidebar({ isOpen, toggleSidebar, isMobile }) {
  const navigate = useNavigate()
	const location = useLocation()
  const { user, loading, logout } = useAuth()

  const handleMenuClick = (page) => {
		navigate(page.path)
		if (isMobile) {
			toggleSidebar()
		}
  }

  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-content">
          <button className="sidebar-close-btn" onClick={toggleSidebar}>
            <span className="material-icons">close</span>
          </button>

          <div className="sidebar-header">
            <h2>MRDash</h2>
            <p className="sidebar-subtitle">MARENDI RAILWAY DASHBOARD</p>
            <p className="sidebar-build">BUILD {BUILD_LABEL}</p>
          </div>

          <nav className="sidebar-menu">
            {pages.filter(page => !page.adminOnly || user?.role === 'ADMIN').map(page => (
              <button
                key={page.id}
                className="menu-item"
                onClick={() => handleMenuClick(page)}
                title={page.title}
              >
                <span className="material-icons menu-icon">{page.icon}</span>
                <span className="menu-text">{page.title}</span>
                {page.external && <span className="external-icon">↗</span>}
              </button>
            ))}
          </nav>

          {!loading && (
            user ? (
              <div className="sidebar-user-row">
                <SidebarUser
                  avatarUrl={user.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.providerId}`}
                  nickname={user.nickname || user.providerId}
                  handle={user.handle ? `@${user.handle}` : user.providerId}
                />
                <button className="sidebar-logout-btn" onClick={logout} title="로그아웃">
                  <span className="material-icons">logout</span>
                </button>
              </div>
            ) : (
              <button className="sidebar-login-btn" onClick={() => navigate('/login')}>
                <span className="material-icons">login</span>
                로그인
              </button>
            )
          )}
        </div>
      </aside>
    </>
  )
}

export default Sidebar
