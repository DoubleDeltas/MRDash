import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { discordLoginUrl } from '../api/client'
import './Login.css'

export default function Login() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>마랜디 대시보드</h1>
        <p>디스코드 계정으로 로그인하고 계속하세요.</p>
        <a className="discord-login-button" href={discordLoginUrl}>
          <span className="material-icons">forum</span>
          Discord로 로그인
        </a>
      </div>
    </div>
  )
}
