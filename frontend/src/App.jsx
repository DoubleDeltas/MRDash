import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import './App.css'
import { pagesByPath } from './pageConstants'
import { apiClient } from './api/client'

const SERVER_SUB_PAGES = [
  { prefix: '/console/', title: '콘솔', icon: 'terminal' },
  { prefix: '/monitoring/', title: '모니터링', icon: 'monitor_heart' },
  // '/settings/'보다 먼저 검사해야 한다
  { prefix: '/settings/prometheus/', title: 'Prometheus 설정', icon: 'monitor_heart' },
  { prefix: '/settings/', title: '서버 설정', icon: 'settings' },
]

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [serverPageName, setServerPageName] = useState(null)
  const location = useLocation()

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 서버 하위 페이지(/console/:id, /monitoring/:id, /settings/:id, /settings/prometheus/:id)는 breadcrumb에 서버 이름을 보여준다
  const serverSubPage = SERVER_SUB_PAGES.find(p => location.pathname.startsWith(p.prefix))

  useEffect(() => {
    if (!serverSubPage) {
      setServerPageName(null)
      return
    }
    const serverId = location.pathname.split('/').pop()
    apiClient.get(`/servers/${serverId}`)
      .then(res => setServerPageName(res.data.data.name))
      .catch(() => setServerPageName(null))
  }, [location.pathname])

  const getPageInfo = () => {
    const page = pagesByPath[location.pathname]

    if (serverSubPage) {
      return {
        breadcrumbs: [
          { title: '마인크래프트 서버', path: '/minecraft' },
          { title: serverPageName || serverSubPage.title, path: null, icon: <span className="material-icons">{serverSubPage.icon}</span> }
        ]
      }
    }

    return {
      breadcrumbs: [
        { title: page?.title || 'MRDash', path: null, icon: page?.icon || null }
      ]
    }
  }

  const pageInfo = getPageInfo()

  return (
    <div className="dashboard">
      <Sidebar 
        isOpen={sidebarOpen} 
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        isMobile={isMobile}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <Navbar
          breadcrumbs={pageInfo.breadcrumbs}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        />
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default App
