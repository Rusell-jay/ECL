import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react'
import AuthShell from '../../components/AuthShell'
import { Alert, Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { describeSupabaseError } from '../../lib/supabase'

export default function Login() {
  const { signIn, resetPassword, session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotState, setForgotState] = useState({ loading: false, message: '', error: '' })

  useEffect(() => {
    if (!authLoading && session) navigate('/', { replace: true })
  }, [session, authLoading, navigate])

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!form.email.trim() || !form.password) {
      setError('Enter your email address and password.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(form.email.trim().toLowerCase(), form.password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(
        /invalid login credentials/i.test(err.message)
          ? 'Incorrect email or password. Please try again.'
          : describeSupabaseError(err),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgot = async (event) => {
    event.preventDefault()
    setForgotState({ loading: true, message: '', error: '' })
    try {
      if (!forgotEmail.trim()) throw new Error('Enter the email address on your account.')
      await resetPassword(forgotEmail.trim().toLowerCase())
      setForgotState({
        loading: false,
        message: 'If an account exists for that email, a password reset link is on its way.',
        error: '',
      })
    } catch (err) {
      setForgotState({ loading: false, message: '', error: describeSupabaseError(err) })
    }
  }

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Access your loan dashboard, applications and repayment records."
      footer={
        <>
          New borrower?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update('email')}
          required
        />

        <div>
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={form.password}
              onChange={update('password')}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-[34px] text-ink-400 hover:text-ink-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((open) => !open)
                setForgotEmail(form.email)
              }}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {forgotOpen ? (
          <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3">
            <p className="mb-2 text-xs font-semibold text-ink-700">Reset your password</p>
            {forgotState.message ? <Alert tone="success" className="mb-2">{forgotState.message}</Alert> : null}
            {forgotState.error ? <Alert tone="error" className="mb-2">{forgotState.error}</Alert> : null}
            <div className="flex gap-2">
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder="Account email"
                className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <Button size="sm" variant="secondary" icon={Mail} loading={forgotState.loading} onClick={handleForgot}>
                Send
              </Button>
            </div>
          </div>
        ) : null}

        <Button type="submit" size="lg" icon={LogIn} loading={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {import.meta.env.DEV ? (
        <div className="mt-6 rounded-xl border border-dashed border-ink-300 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Demo accounts (seeded)</p>
          <div className="mt-2 grid gap-1 text-[11px] text-ink-600">
            <span><strong>Super Admin:</strong> admin@cashloan.test / Admin123!</span>
            <span><strong>Loan Officer:</strong> officer@cashloan.test / Officer123!</span>
            <span><strong>Borrower:</strong> maria@example.test / Borrower123!</span>
          </div>
        </div>
      ) : null}
    </AuthShell>
  )
}
