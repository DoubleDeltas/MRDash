import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import './App.css'
import { pagesByPath } from './pageConstants'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const location = useLocation()

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getPageInfo = () => {
    const page = pagesByPath[location.pathname]
    
    // 콘솔 페이지 처리
    if (location.pathname.startsWith('/console/')) {
      const serverId = location.pathname.split('/').pop()
      const servers = [
        { id: 1, name: '초보자 서버' },
        { id: 2, name: '생존 서버' }
      ]
      const server = servers.find(s => s.id === parseInt(serverId))
      return {
        breadcrumbs: [
          { title: '마인크래프트 서버', path: '/minecraft' },
          { title: server ? server.name : '콘솔', path: null, icon: <span className="material-icons">terminal</span> }
        ]
      }
    }
    
    return {
      breadcrumbs: [
        { title: page?.title || 'MRD', path: null, icon: page?.icon || null }
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
