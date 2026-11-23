import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'

export function homePath(role) {
  return role === 'borrower' ? '/borrower' : '/staff'
}

function FullPageLoader({ label = 'Preparing your workspace…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
        <span className="text-lg font-bold">C</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <Spinner /> {label}
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading, profile, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
        <div className="surface w-full max-w-md p-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Your account has been disabled</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Access has been suspended by an administrator. Contact your lending office if you believe this is a
            mistake.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }
  return <Outlet />
}

export function RoleRoute({ roles }) {
  const { profile, loading, profileError, session } = useAuth()

  if (loading || (session && !profile && !profileError)) return <FullPageLoader />
  if (profileError) {
    return (
      <div className="surface mx-auto mt-10 max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-rose-700">Could not load your profile</p>
        <p className="mt-1 text-xs text-ink-500">{profileError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homePath(profile.role)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { profile, loading, session, profileError } = useAuth()
  if (loading || (session && !profile && !profileError)) return <FullPageLoader />
  return <Navigate to={homePath(profile?.role)} replace />
}
