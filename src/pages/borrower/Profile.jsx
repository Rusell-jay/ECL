import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Save, ShieldCheck, UserCircle } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Select,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { BORROWER_STATUS, EMPLOYMENT_STATUSES } from '../../lib/constants'
import { formatDate } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const EMPTY = {
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
}

export default function BorrowerProfile() {
  const { profile, borrower, refresh } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [password, setPassword] = useState({ next: '', confirm: '' })
  const [passwordState, setPasswordState] = useState({ saving: false, message: '', error: '' })

  useEffect(() => {
    if (borrower) {
      setForm({
        first_name: borrower.first_name ?? '',
        middle_name: borrower.middle_name ?? '',
        last_name: borrower.last_name ?? '',
        date_of_birth: borrower.date_of_birth ?? '',
        contact_number: borrower.contact_number ?? '',
        address: borrower.address ?? '',
        city: borrower.city ?? '',
        province: borrower.province ?? '',
        postal_code: borrower.postal_code ?? '',
        employment_status: borrower.employment_status ?? 'employed',
        employer_name: borrower.employer_name ?? '',
        occupation: borrower.occupation ?? '',
        monthly_income: borrower.monthly_income ?? '',
        emergency_contact_name: borrower.emergency_contact_name ?? '',
        emergency_contact_number: borrower.emergency_contact_number ?? '',
        emergency_contact_relationship: borrower.emergency_contact_relationship ?? '',
      })
    }
  }, [borrower?.id])

  const maxDob = useMemo(() => {
    const date = new Date()
    date.setFullYear(date.getFullYear() - 18)
    return date.toISOString().slice(0, 10)
  }, [])

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (!form.first_name.trim()) next.first_name = 'First name is required.'
    if (!form.last_name.trim()) next.last_name = 'Last name is required.'
    if (!form.date_of_birth) next.date_of_birth = 'Date of birth is required.'
    else if (form.date_of_birth > maxDob) next.date_of_birth = 'You must be at least 18 years old.'
    if (!form.contact_number.trim()) next.contact_number = 'Contact number is required.'
    if (!form.address.trim()) next.address = 'Complete address is required.'
    if (!form.occupation.trim()) next.occupation = 'Occupation is required.'
    if (form.monthly_income === '' || Number(form.monthly_income) <= 0) next.monthly_income = 'Enter a valid monthly income.'
    if (!form.emergency_contact_name.trim()) next.emergency_contact_name = 'Emergency contact name is required.'
    if (!form.emergency_contact_number.trim()) next.emergency_contact_number = 'Emergency contact number is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setFeedback(null)
    if (!validate()) {
      setFeedback({ tone: 'error', message: 'Please review the highlighted fields.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        contact_number: form.contact_number.trim(),
        address: form.address.trim(),
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        postal_code: form.postal_code.trim() || null,
        employment_status: form.employment_status,
        employer_name: form.employer_name.trim() || null,
        occupation: form.occupation.trim(),
        monthly_income: Number(form.monthly_income),
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_number: form.emergency_contact_number.trim(),
        emergency_contact_relationship: form.emergency_contact_relationship.trim() || null,
      }

      if (borrower) {
        const { error } = await supabase.from('borrowers').update(payload).eq('id', borrower.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('borrowers')
          .insert({ ...payload, profile_id: profile.id, email: profile.email })
        if (error) throw error
      }

      const fullName = [payload.first_name, payload.middle_name, payload.last_name].filter(Boolean).join(' ')
      await supabase
        .from('profiles')
        .update({ full_name: fullName, phone: payload.contact_number })
        .eq('id', profile.id)

      await refresh()
      setFeedback({ tone: 'success', message: 'Your profile has been saved.' })
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handlePassword = async (event) => {
    event.preventDefault()
    setPasswordState({ saving: true, message: '', error: '' })
    try {
      if (password.next.length < 8) throw new Error('Password must be at least 8 characters.')
      if (password.next !== password.confirm) throw new Error('Passwords do not match.')
      const { error } = await supabase.auth.updateUser({ password: password.next })
      if (error) throw error
      setPassword({ next: '', confirm: '' })
      setPasswordState({ saving: false, message: 'Your password has been updated.', error: '' })
    } catch (err) {
      setPasswordState({ saving: false, message: '', error: err.message })
    }
  }

  const statusMeta = BORROWER_STATUS[borrower?.status] ?? { label: 'New', tone: 'blue' }

  return (
    <div>
      <PageHeader
        title="My profile"
        subtitle="Keep your personal, employment and emergency contact details up to date."
        actions={
          borrower ? (
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          ) : (
            <Badge tone="amber">Profile incomplete</Badge>
          )
        }
      />

      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      {!borrower ? (
        <Alert tone="warning" title="Complete your profile" className="mb-4">
          We could not find a borrower record for your account yet. Fill in the details below and save to
          activate your borrower profile.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={handleSave} className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Personal information" icon={UserCircle} subtitle="Required fields are marked with an asterisk." />
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="First name" required value={form.first_name} onChange={update('first_name')} error={errors.first_name} />
                <Input label="Middle name" value={form.middle_name} onChange={update('middle_name')} />
                <Input label="Last name" required value={form.last_name} onChange={update('last_name')} error={errors.last_name} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Date of birth"
                  type="date"
                  max={maxDob}
                  required
                  value={form.date_of_birth}
                  onChange={update('date_of_birth')}
                  error={errors.date_of_birth}
                />
                <Input
                  label="Contact number"
                  required
                  value={form.contact_number}
                  onChange={update('contact_number')}
                  error={errors.contact_number}
                />
              </div>
              <Input label="Email address" value={profile?.email ?? ''} disabled hint="Email changes require assistance from the lending office." />
              <Input label="Complete address" required value={form.address} onChange={update('address')} error={errors.address} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="City / Municipality" value={form.city} onChange={update('city')} />
                <Input label="Province" value={form.province} onChange={update('province')} />
                <Input label="Postal code" value={form.postal_code} onChange={update('postal_code')} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Employment and income" subtitle="Used to evaluate your loan affordability." />
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Employment status" required options={EMPLOYMENT_STATUSES} value={form.employment_status} onChange={update('employment_status')} />
                <Input label="Occupation" required value={form.occupation} onChange={update('occupation')} error={errors.occupation} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Employer / Business name" value={form.employer_name} onChange={update('employer_name')} />
                <Input
                  label="Monthly income"
                  type="number"
                  min="0"
                  step="0.01"
                  prefix="₱"
                  required
                  value={form.monthly_income}
                  onChange={update('monthly_income')}
                  error={errors.monthly_income}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Emergency contact" subtitle="Someone we can reach in case of emergency." />
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Contact name"
                  required
                  value={form.emergency_contact_name}
                  onChange={update('emergency_contact_name')}
                  error={errors.emergency_contact_name}
                />
                <Input
                  label="Contact number"
                  required
                  value={form.emergency_contact_number}
                  onChange={update('emergency_contact_number')}
                  error={errors.emergency_contact_number}
                />
              </div>
              <Input
                label="Relationship"
                value={form.emergency_contact_relationship}
                onChange={update('emergency_contact_relationship')}
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" icon={Save} loading={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Account summary" icon={ShieldCheck} />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Borrower code</span>
                <span className="font-mono text-xs font-semibold text-ink-900">{borrower?.borrower_code ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Member since</span>
                <span className="font-medium text-ink-900">{formatDate(borrower?.created_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Account status</span>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Role</span>
                <Badge tone="brand">Borrower</Badge>
              </div>
              <p className="border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
                Some fields, such as your account status and borrower code, can only be changed by authorized
                lending personnel.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Security" subtitle="Change your sign-in password" icon={KeyRound} />
            <form onSubmit={handlePassword} className="space-y-3 p-5">
              {passwordState.message ? <Alert tone="success">{passwordState.message}</Alert> : null}
              {passwordState.error ? <Alert tone="error">{passwordState.error}</Alert> : null}
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password.next}
                onChange={(event) => setPassword((prev) => ({ ...prev, next: event.target.value }))}
                required
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={password.confirm}
                onChange={(event) => setPassword((prev) => ({ ...prev, confirm: event.target.value }))}
                required
              />
              <Button type="submit" variant="secondary" loading={passwordState.saving} className="w-full">
                Update password
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
