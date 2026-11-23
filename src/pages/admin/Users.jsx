import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, ShieldCheck, UserCog } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, STAFF_ROLES } from '../../lib/constants'
import { formatDate, initials } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const ROLE_TONES = {
  super_admin: 'violet',
  admin: 'brand',
  loan_officer: 'blue',
  borrower: 'gray',
}

async function invokeAdmin(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json?.()
      if (payload?.error) message = payload.error
    } catch {
      // ignore parsing failure
    }
    if (/failed to send a request/i.test(message)) {
      message = 'The admin-users Edge Function is not reachable. Deploy it with: supabase functions deploy admin-users'
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

const CREATE_EMPTY = { full_name: '', email: '', phone: '', password: '', role: 'loan_officer' }

export default function Users() {
  const { profile: me } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(CREATE_EMPTY)
  const [editOpen, setEditOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role: 'loan_officer', is_active: true, password: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('role')
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    setProfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const roleOptions = useMemo(() => {
    const roles = me?.role === 'super_admin' ? STAFF_ROLES : ['admin', 'loan_officer']
    return roles.map((value) => ({ value, label: ROLE_LABELS[value] }))
  }, [me?.role])

  const createStaff = async (event) => {
    event.preventDefault()
    setFormError('')
    if (!createForm.full_name.trim() || !createForm.email.trim()) return setFormError('Name and email are required.')
    if (createForm.password.length < 8) return setFormError('Password must be at least 8 characters.')
    setSaving(true)
    try {
      await invokeAdmin({ action: 'create', ...createForm })
      setCreateOpen(false)
      setCreateForm(CREATE_EMPTY)
      setFeedback({ tone: 'success', message: 'Staff account created successfully.' })
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (row) => {
    setSelected(row)
    setEditForm({
      full_name: row.full_name ?? '',
      phone: row.phone ?? '',
      role: row.role,
      is_active: row.is_active,
      password: '',
    })
    setFormError('')
    setEditOpen(true)
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    if (!selected) return
    setFormError('')
    if (editForm.password && editForm.password.length < 8) return setFormError('New password must be at least 8 characters.')
    setSaving(true)
    try {
      const result = await invokeAdmin({
        action: 'update',
        user_id: selected.id,
        full_name: editForm.full_name,
        phone: editForm.phone,
        role: editForm.role,
        is_active: editForm.is_active,
      })
      if (editForm.password) {
        await invokeAdmin({ action: 'reset_password', user_id: selected.id, password: editForm.password })
      }
      setEditOpen(false)
      setFeedback(
        result?.warning
          ? { tone: 'warning', message: result.warning }
          : { tone: 'success', message: 'Staff account updated.' },
      )
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading users…" />

  const staffCount = profiles.filter((row) => STAFF_ROLES.includes(row.role)).length

  return (
    <div>
      <PageHeader
        title="Staff & users"
        subtitle="Manage administrative accounts and role-based access. Borrowers register their own accounts."
        actions={<Button icon={Plus} onClick={() => { setCreateForm(CREATE_EMPTY); setFormError(''); setCreateOpen(true) }}>New staff account</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <Alert tone="info" className="mb-4" title="Privileged account operations">
        Staff accounts are created through the <span className="font-mono text-xs">admin-users</span> Edge Function. The
        Supabase service role key stays on the server and is never shipped to the browser.
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Total users</p>
          <p className="mt-1 text-2xl font-bold text-ink-950">{profiles.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Staff accounts</p>
          <p className="mt-1 text-2xl font-bold text-ink-950">{staffCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">Borrower accounts</p>
          <p className="mt-1 text-2xl font-bold text-ink-950">{profiles.length - staffCount}</p>
        </Card>
      </div>

      <Card>
        {profiles.length === 0 ? (
          <EmptyState icon={UserCog} title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profiles.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                          {initials(row.full_name || row.email)}
                        </span>
                        <div>
                          <p className="font-medium text-ink-900">
                            {row.full_name || 'Unnamed user'}
                            {row.id === me?.id ? <span className="ml-1.5 text-[10px] font-semibold text-brand-600">(you)</span> : null}
                          </p>
                          <p className="text-[11px] text-ink-500">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={ROLE_TONES[row.role]}>{ROLE_LABELS[row.role] ?? row.role}</Badge></td>
                    <td>
                      <Badge tone={row.is_active ? 'emerald' : 'gray'}>{row.is_active ? 'Active' : 'Disabled'}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(row.created_at)}</td>
                    <td>
                      {STAFF_ROLES.includes(row.role) ? (
                        <Button size="xs" variant="outline" icon={Pencil} onClick={() => openEdit(row)}>Manage</Button>
                      ) : (
                        <span className="text-[11px] text-ink-400">Borrower account</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a staff account"
        description="The user can sign in immediately with the password you set."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button icon={ShieldCheck} loading={saving} onClick={createStaff}>Create account</Button>
          </>
        }
      >
        <form onSubmit={createStaff} className="space-y-4">
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <Input
            label="Full name"
            required
            value={createForm.full_name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, full_name: event.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Email address"
              type="email"
              required
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <Input
              label="Contact number"
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Temporary password"
              type="password"
              required
              value={createForm.password}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
              hint="At least 8 characters"
            />
            <Select
              label="Role"
              options={roleOptions}
              value={createForm.role}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}
            />
          </div>
          <Alert tone="info">
            Loan officers can evaluate applications and record payments. Admins can also manage loan types,
            staff and audit logs.
          </Alert>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={selected ? `Manage ${selected.full_name || selected.email}` : 'Manage staff'}
        description="Role and account status changes are recorded in the audit log."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={saveEdit}>Save changes</Button>
          </>
        }
      >
        {selected ? (
          <form onSubmit={saveEdit} className="space-y-4">
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={editForm.full_name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, full_name: event.target.value }))}
              />
              <Input
                label="Contact number"
                value={editForm.phone}
                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Role"
                options={roleOptions}
                value={editForm.role}
                onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
                disabled={selected.id === me?.id}
                hint={selected.id === me?.id ? 'You cannot change your own role.' : undefined}
              />
              <div>
                <p className="mb-1.5 block text-sm font-medium text-ink-700">Account status</p>
                <label className="flex h-10 items-center gap-2 rounded-lg border border-ink-300 px-3 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    disabled={selected.id === me?.id}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  Account is active
                </label>
              </div>
            </div>
            <div className="border-t border-ink-100 pt-4">
              <Input
                label="Reset password"
                type="password"
                placeholder="Leave blank to keep current password"
                value={editForm.password}
                onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                hint="Optional. At least 8 characters."
              />
            </div>
            <Alert tone="warning">
              Disabling an account blocks new sign-ins. The person's historical records remain intact.
            </Alert>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
