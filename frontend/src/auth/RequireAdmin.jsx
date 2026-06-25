import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

function RequireAdmin({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />

  return children
}

export default RequireAdmin
