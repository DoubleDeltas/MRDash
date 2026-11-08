import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import './MinecraftServers.css'
import './ServerSettings.css'

// 서버별 모니터링 알림 설정 (Grafana 경보 → 디스코드 웹후크 / "테트라" 봇 채널) — 내용은 추후 구현
function AlertSettings() {
  const { serverId } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    setLoading(true)
    apiClient.get(`/servers/${serverId}`)
      .then(res => setServer(res.data.data))
      .catch(() => setLoadError('서버 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) {
    return (
      <div className="server-settings">
        <div className="servers-loading">
          <div className="loading-spinner" />
          <p className="servers-message">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return <div className="server-settings"><p className="servers-message">{loadError}</p></div>
  }

  // 서버 설정 페이지와 같은 조건 (admin 또는 소유자)
  if (!isAdmin && server.ownerId !== user?.id) {
    return <div className="server-settings"><p className="servers-message">이 서버의 설정을 변경할 권한이 없습니다.</p></div>
  }

  return (
    <div className="server-settings">
      <div className="settings-header">
        <h2>
          <Link to={`/settings/${server.id}`} className="settings-header-link">설정</Link>
          <span className="settings-header-separator">&gt;</span>
          모니터링 알림 설정
        </h2>
      </div>

      <div className="server-form" />
    </div>
  )
}

export default AlertSettings
