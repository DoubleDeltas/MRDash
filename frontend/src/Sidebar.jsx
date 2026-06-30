import { useLocation, useNavigate } from 'react-router-dom'
import './Sidebar.css'
import { pages } from './pageConstants'
import SidebarUser from './components/SidebarUser'
import { useAuth } from './auth/AuthContext'

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
