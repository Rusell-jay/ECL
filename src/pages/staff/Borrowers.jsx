import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, Search, UserCircle, Users } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  DetailRow,
  EmptyState,
  Modal,
  PageHeader,
  PageLoader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui'
import { BORROWER_STATUS } from '../../lib/constants'
import { downloadCsv, formatDate, formatMoney, fullName } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function StaffBorrowers() {
  const [borrowers, setBorrowers] = useState([])
  const [applications, setApplications] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({ status: 'active', notes: '' })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const pageSize = 12

  const load = async () => {
    setLoading(true)
    const [borrowersRes, appsRes, loansRes] = await Promise.all([
      supabase.from('borrowers').select('*, profiles(email, is_active)').order('created_at', { ascending: false }),
      supabase.from('loan_applications').select('id, borrower_id, status, requested_amount, application_no'),
      supabase.from('loans').select('id, borrower_id, status, principal, total_payable, amount_paid, loan_no'),
    ])
    if (borrowersRes.error) setError(borrowersRes.error.message)
    setBorrowers(borrowersRes.data ?? [])
    setApplications(appsRes.data ?? [])
    setLoans(loansRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(() => {
    return borrowers.map((borrower) => {
      const borrowerApps = applications.filter((app) => app.borrower_id === borrower.id)
      const borrowerLoans = loans.filter((loan) => loan.borrower_id === borrower.id)
      const active = borrowerLoans.filter((loan) => loan.status === 'active')
      return {
        ...borrower,
        appCount: borrowerApps.length,
        activeLoanCount: active.length,
        outstanding: active.reduce((sum, loan) => sum + Number(loan.total_payable) - Number(loan.amount_paid), 0),
        apps: borrowerApps,
        loanRows: borrowerLoans,
      }
    })
  }, [borrowers, applications, loans])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!term) return true
      return (
        fullName(row).toLowerCase().includes(term) ||
        row.borrower_code?.toLowerCase().includes(term) ||
        row.email?.toLowerCase().includes(term) ||
        row.contact_number?.includes(term)
      )
    })
  }, [rows, search, statusFilter])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [search, statusFilter])

  const openBorrower = (borrower) => {
    setSelected(borrower)
    setEditForm({ status: borrower.status, notes: borrower.notes ?? '' })
    setFeedback(null)
  }

  const saveBorrower = async () => {
    if (!selected) return
    setSaving(true)
    setFeedback(null)
    try {
      const { error: updateError } = await supabase
        .from('borrowers')
        .update({ status: editForm.status, notes: editForm.notes.trim() || null })
        .eq('id', selected.id)
      if (updateError) throw updateError
      setFeedback({ tone: 'success', message: 'Borrower record updated.' })
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    downloadCsv(`borrowers-${new Date().toISOString().slice(0, 10)}.csv`, filtered, [
      { label: 'Borrower Code', value: (row) => row.borrower_code },
      { label: 'Full Name', value: (row) => fullName(row) },
      { label: 'Email', value: (row) => row.email },
      { label: 'Contact', value: (row) => row.contact_number },
      { label: 'Employment', value: (row) => row.employment_status },
      { label: 'Occupation', value: (row) => row.occupation },
      { label: 'Monthly Income', value: (row) => row.monthly_income },
      { label: 'Status', value: (row) => row.status },
      { label: 'Applications', value: (row) => row.appCount },
      { label: 'Active Loans', value: (row) => row.activeLoanCount },
      { label: 'Outstanding', value: (row) => row.outstanding },
      { label: 'Registered', value: (row) => row.created_at?.slice(0, 10) },
    ])
  }

  if (loading) return <PageLoader label="Loading borrowers…" />

  return (
    <div>
      <PageHeader
        title="Borrowers"
        subtitle="Registered cash loan borrowers and their lending history."
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, email or contact" className="sm:w-96" />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(BORROWER_STATUS).map(([value, meta]) => ({ value, label: meta.label }))]}
            className="sm:w-48"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Users} title="No borrowers found" description="Borrowers appear here after they register an account." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Contact</th>
                  <th>Employment</th>
                  <th>Monthly income</th>
                  <th>Applications</th>
                  <th>Active loans</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <p className="font-medium text-ink-900">{fullName(row)}</p>
                      <p className="font-mono text-[11px] text-ink-500">{row.borrower_code}</p>
                    </td>
                    <td>
                      <p className="text-xs text-ink-700">{row.contact_number}</p>
                      <p className="text-[11px] text-ink-500">{row.email}</p>
                    </td>
                    <td>
                      <p className="text-xs capitalize text-ink-700">{row.employment_status?.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-ink-500">{row.occupation}</p>
                    </td>
                    <td className="font-medium text-ink-900">{formatMoney(row.monthly_income)}</td>
                    <td className="text-center">{row.appCount}</td>
                    <td>
                      <span className="font-semibold text-ink-900">{row.activeLoanCount}</span>
                      {row.outstanding > 0 ? (
                        <p className="text-[11px] text-ink-500">{formatMoney(row.outstanding)} outstanding</p>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={BORROWER_STATUS[row.status]?.tone ?? 'slate'}>
                        {BORROWER_STATUS[row.status]?.label ?? row.status}
                      </Badge>
                    </td>
                    <td>
                      <Button size="xs" variant="outline" onClick={() => openBorrower(row)}>
                        View <ArrowRight className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? fullName(selected) : 'Borrower'}
        description={selected ? `${selected.borrower_code} · registered ${formatDate(selected.created_at)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            <Button loading={saving} onClick={saveBorrower}>Save changes</Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            {feedback ? <Alert tone={feedback.tone} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : null}

            <div className="grid gap-x-6 sm:grid-cols-2">
              <DetailRow label="Email" value={selected.email} />
              <DetailRow label="Contact" value={selected.contact_number} />
              <DetailRow label="Date of birth" value={formatDate(selected.date_of_birth)} />
              <DetailRow label="Monthly income" value={formatMoney(selected.monthly_income)} />
              <DetailRow label="Address" value={[selected.address, selected.city, selected.province].filter(Boolean).join(', ')} />
              <DetailRow label="Occupation" value={`${selected.occupation} (${selected.employment_status?.replace(/_/g, ' ')})`} />
              <DetailRow label="Employer" value={selected.employer_name || '—'} />
              <DetailRow label="Emergency contact" value={`${selected.emergency_contact_name} · ${selected.emergency_contact_number}`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Borrower status"
                value={editForm.status}
                onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
                options={Object.entries(BORROWER_STATUS).map(([value, meta]) => ({ value, label: meta.label }))}
              />
              <Textarea
                label="Internal notes"
                rows={2}
                value={editForm.notes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Visible to staff only"
              />
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Search className="h-3.5 w-3.5" /> Applications ({selected.apps.length})
              </p>
              {selected.apps.length === 0 ? (
                <p className="text-sm text-ink-500">No applications.</p>
              ) : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {selected.apps.slice(0, 5).map((app) => (
                    <li key={app.id}>
                      <Link to={`/staff/applications/${app.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-ink-50">
                        <span className="text-xs">
                          <span className="font-mono font-semibold text-ink-900">{app.application_no}</span>
                          <span className="ml-2 text-ink-500">{formatMoney(app.requested_amount)}</span>
                        </span>
                        <StatusBadge status={app.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <UserCircle className="h-3.5 w-3.5" /> Loans ({selected.loanRows.length})
              </p>
              {selected.loanRows.length === 0 ? (
                <p className="text-sm text-ink-500">No loans.</p>
              ) : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {selected.loanRows.slice(0, 5).map((loan) => (
                    <li key={loan.id}>
                      <Link to={`/loans/${loan.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-ink-50">
                        <span className="text-xs">
                          <span className="font-mono font-semibold text-ink-900">{loan.loan_no}</span>
                          <span className="ml-2 text-ink-500">{formatMoney(loan.principal)}</span>
                        </span>
                        <StatusBadge status={loan.status} kind="loan" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
