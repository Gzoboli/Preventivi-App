import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '../components/FullPageSpinner'
import { ProfileProvider, useProfile } from '../profile/ProfileProvider'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace />
  return (
    <ProfileProvider>
      <OnboardingGate />
    </ProfileProvider>
  )
}

/** Sends users to the onboarding until they complete it or choose to do it later. */
function OnboardingGate() {
  const { profile, answers, loading, error, reload } = useProfile()
  const { pathname } = useLocation()

  if (loading) return <FullPageSpinner />
  if (error || !profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center" role="alert">
        <p className="text-lg">Qualcosa non ha funzionato, riprova.</p>
        <button type="button" onClick={() => void reload()} className="h-12 rounded-lg bg-accent px-6 font-semibold text-white">
          Riprova
        </button>
      </div>
    )
  }
  const mustOnboard = !profile.onboarding_completed && !answers._meta?.postponed
  if (mustOnboard && pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <Outlet />
}
