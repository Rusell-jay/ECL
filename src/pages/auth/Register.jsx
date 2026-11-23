import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, UserPlus } from 'lucide-react'
import AuthShell from '../../components/AuthShell'
import { Alert, Button, Input, Select } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { EMPLOYMENT_STATUSES } from '../../lib/constants'
import { describeSupabaseError } from '../../lib/supabase'

const INITIAL = {
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  contact_number: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  employment_status: 'employed',
  employer_name: '',
  occupation: '',
  monthly_income: '',
  emergency_contact_name: '',
  emergency_contact_number: '',
  emergency_contact_relationship: '',
  email: '',
  password: '',
  confirm_password: '',
  agree: false,
}

const STEPS = ['Account', 'Personal details', 'Employment & contact']

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  const maxDob = useMemo(() => {
    const date = new Date()
    date.setFullYear(date.getFullYear() - 18)
    return date.toISOString().slice(0, 10)
  }, [])

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validateStep = (index) => {
    const next = {}
    if (index === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.'
      if (form.password.length < 8) next.password = 'Use at least 8 characters.'
      if (form.confirm_password !== form.password) next.confirm_password = 'Passwords do not match.'
    }
    if (index === 1) {
      if (!form.first_name.trim()) next.first_name = 'First name is required.'
      if (!form.last_name.trim()) next.last_name = 'Last name is required.'
      if (!form.date_of_birth) next.date_of_birth = 'Date of birth is required.'
      else if (form.date_of_birth > maxDob) next.date_of_birth = 'You must be at least 18 years old.'
      if (!form.contact_number.trim()) next.contact_number = 'Contact number is required.'
      if (!form.address.trim()) next.address = 'Complete address is required.'
    }
    if (index === 2) {
      if (!form.occupation.trim()) next.occupation = 'Occupation is required.'
      const income = Number(form.monthly_income)
      if (form.monthly_income === '' || Number.isNaN(income) || income <= 0)
        next.monthly_income = 'Enter your monthly income.'
      if (!form.emergency_contact_name.trim()) next.emergency_contact_name = 'Emergency contact name is required.'
      if (!form.emergency_contact_number.trim())
        next.emergency_contact_number = 'Emergency contact number is required.'
      if (!form.agree) next.agree = 'Please confirm the information is accurate.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    for (let index = 0; index < STEPS.length; index += 1) {
      if (!validateStep(index)) {
        setStep(index)
        return
      }
    }

    setSubmitting(true)
    try {
      const fullName = [form.first_name, form.middle_name, form.last_name]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')

      const metadata = {
        full_name: fullName,
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        contact_number: form.contact_number.trim(),
        phone: form.contact_number.trim(),
        email: form.email.trim().toLowerCase(),
        address: form.address.trim(),
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        postal_code: form.postal_code.trim() || null,
        employment_status: form.employment_status,
        employer_name: form.employer_name.trim() || null,
        occupation: form.occupation.trim(),
        monthly_income: String(Number(form.monthly_income)),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_number: form.emergency_contact_number.trim(),
        emergency_contact_relationship: form.emergency_contact_relationship.trim() || null,
      }

      const data = await signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        metadata,
      })

      if (data?.session) {
        navigate('/borrower', { replace: true })
      } else {
        setCreated(true)
      }
    } catch (err) {
      const message = /already registered|already been registered|duplicate/i.test(err.message)
        ? 'An account already exists for this email address. Try signing in instead.'
        : describeSupabaseError(err)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="One last step to activate your borrower account."
        footer={
          <Link to="/login" className="link">
            Back to sign in
          </Link>
        }
      >
        <div className="surface p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Mail className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-ink-900">Confirm your email address</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            We sent a confirmation link to <strong className="text-ink-800">{form.email}</strong>. Confirm your
            email, then sign in to submit your first cash loan application.
          </p>
          <Alert tone="info" className="mt-4 text-left">
            If email confirmation is disabled in your Supabase project, you can sign in right away.
          </Alert>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create a borrower account"
      subtitle="Register once, then apply for emergency cash loans and track repayments online."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className="flex-1">
              <div
                className={`h-1.5 rounded-full ${index <= step ? 'bg-brand-500' : 'bg-ink-200'}`}
                aria-hidden="true"
              />
              <p className={`mt-1.5 text-[10px] font-semibold ${index === step ? 'text-brand-700' : 'text-ink-400'}`}>
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        {step === 0 ? (
          <>
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={update('password')}
                error={errors.password}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={form.confirm_password}
                onChange={update('confirm_password')}
                error={errors.confirm_password}
                required
              />
            </div>
            <Alert tone="info">
              Use a strong, unique password. Your account is protected by Supabase Auth, and your data is
              restricted to you by row level security.
            </Alert>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="First name"
                value={form.first_name}
                onChange={update('first_name')}
                error={errors.first_name}
                required
              />
              <Input label="Middle name" value={form.middle_name} onChange={update('middle_name')} />
              <Input
                label="Last name"
                value={form.last_name}
                onChange={update('last_name')}
                error={errors.last_name}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Date of birth"
                type="date"
                max={maxDob}
                value={form.date_of_birth}
                onChange={update('date_of_birth')}
                error={errors.date_of_birth}
                required
              />
              <Input
                label="Contact number"
                placeholder="0917 123 4567"
                value={form.contact_number}
                onChange={update('contact_number')}
                error={errors.contact_number}
                required
              />
            </div>
            <Input
              label="Complete address"
              placeholder="House no., street, barangay"
              value={form.address}
              onChange={update('address')}
              error={errors.address}
              required
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="City / Municipality" value={form.city} onChange={update('city')} />
              <Input label="Province" value={form.province} onChange={update('province')} />
              <Input label="Postal code" value={form.postal_code} onChange={update('postal_code')} />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Employment status"
                value={form.employment_status}
                onChange={update('employment_status')}
                options={EMPLOYMENT_STATUSES}
                required
              />
              <Input
                label="Occupation"
                placeholder="e.g. Accounting staff"
                value={form.occupation}
                onChange={update('occupation')}
                error={errors.occupation}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Employer / Business name"
                value={form.employer_name}
                onChange={update('employer_name')}
              />
              <Input
                label="Monthly income"
                type="number"
                min="0"
                step="0.01"
                prefix="₱"
                placeholder="0.00"
                value={form.monthly_income}
                onChange={update('monthly_income')}
                error={errors.monthly_income}
                required
              />
            </div>

            <div className="border-t border-ink-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Emergency contact</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Contact name"
                  value={form.emergency_contact_name}
                  onChange={update('emergency_contact_name')}
                  error={errors.emergency_contact_name}
                  required
                />
                <Input
                  label="Contact number"
                  value={form.emergency_contact_number}
                  onChange={update('emergency_contact_number')}
                  error={errors.emergency_contact_number}
                  required
                />
              </div>
              <Input
                className="mt-4"
                label="Relationship"
                placeholder="e.g. Spouse, parent, sibling"
                value={form.emergency_contact_relationship}
                onChange={update('emergency_contact_relationship')}
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={form.agree}
                onChange={update('agree')}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                I confirm that the information provided is accurate and I authorize CashBridge to verify it for
                the purpose of evaluating my cash loan application.
              </span>
            </label>
            {errors.agree ? <p className="text-xs font-medium text-rose-600">{errors.agree}</p> : null}
          </>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          {step > 0 ? (
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep((current) => current - 1)}>
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button type="button" icon={ArrowRight} onClick={nextStep} className="ml-auto">
              Continue
            </Button>
          ) : (
            <Button type="submit" icon={UserPlus} loading={submitting} className="ml-auto">
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          )}
        </div>

        {step === 2 ? (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
            Your details are stored securely and visible only to authorized staff.
          </p>
        ) : null}
      </form>
    </AuthShell>
  )
}
