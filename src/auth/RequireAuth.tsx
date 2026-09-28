import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '../components/FullPageSpinner'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
