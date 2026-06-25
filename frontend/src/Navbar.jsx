import { useNavigate } from 'react-router-dom'
import './Navbar.css'

function Navbar({ breadcrumbs, onToggleSidebar }) {
  const navigate = useNavigate()

  const handleBreadcrumbClick = (path) => {
    if (path) {
      navigate(path)
    }
  }

  const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]

  return (
    <nav className="navbar">
      <button className="navbar-menu-btn" onClick={onToggleSidebar}>
        <span className="material-icons">dehaze</span>
      </button>
      
      {lastBreadcrumb.icon && (
        <span className="navbar-icon">{lastBreadcrumb.icon}</span>
      )}
      
      <div className="navbar-breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <div key={index} className="breadcrumb-item">
            {crumb.path ? (
              <button 
                className="breadcrumb-link"
                onClick={() => handleBreadcrumbClick(crumb.path)}
              >
                {crumb.title}
              </button>
            ) : (
              <span className="breadcrumb-current">{crumb.title}</span>
            )}
            {index < breadcrumbs.length - 1 && <span className="breadcrumb-separator">&gt;</span>}
          </div>
        ))}
      </div>
    </nav>
  )
}

export default Navbar
