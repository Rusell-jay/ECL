import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-ink-950">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-500">
        The page you are looking for does not exist or you do not have access to it.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
