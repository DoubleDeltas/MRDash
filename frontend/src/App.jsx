import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import './App.css'
import { pagesByPath } from './pageConstants'
import { apiClient } from './api/client'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [consoleServerName, setConsoleServerName] = useState(null)
  const location = useLocation()

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!location.pathname.startsWith('/console/')) {
      setConsoleServerName(null)
      return
    }
    const serverId = location.pathname.split('/').pop()
    apiClient.get(`/servers/${serverId}`)
      .then(res => setConsoleServerName(res.data.data.name))
      .catch(() => setConsoleServerName(null))
  }, [location.pathname])

  const getPageInfo = () => {
    const page = pagesByPath[location.pathname]

    if (location.pathname.startsWith('/console/')) {
      return {
        breadcrumbs: [
          { title: '마인크래프트 서버', path: '/minecraft' },
          { title: consoleServerName || '콘솔', path: null, icon: <span className="material-icons">terminal</span> }
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
