import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, FileSearch } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { downloadCsv, formatDate, formatMoney, fullName } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'additional_info_required', label: 'Info required' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
]

const GROUP = {
  approved: ['approved', 'for_agreement', 'ready_for_disbursement'],
  closed: ['active', 'completed', 'cancelled'],
}

export default function StaffApplications() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const pageSize = 12

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('loan_applications')
        .select('id, application_no, status, requested_amount, total_payable, term_months, payment_frequency, submitted_at, purpose, borrowers(first_name, middle_name, last_name, borrower_code, monthly_income), loan_types(name)')
        .order('created_at', { ascending: false })
      if (loadError) setError(loadError.message)
      setApplications(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const counts = useMemo(() => {
    const result = { all: applications.length }
    TABS.forEach((item) => {
      if (item.value === 'all') return
      result[item.value] = applications.filter((app) =>
        GROUP[item.value] ? GROUP[item.value].includes(app.status) : app.status === item.value,
      ).length
    })
    return result
  }, [applications])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return applications.filter((app) => {
      if (tab !== 'all') {
        const matches = GROUP[tab] ? GROUP[tab].includes(app.status) : app.status === tab
        if (!matches) return false
      }
      if (range.from && app.submitted_at?.slice(0, 10) < range.from) return false
      if (range.to && app.submitted_at?.slice(0, 10) > range.to) return false
      if (!term) return true
      const borrower = fullName(app.borrowers, '')
      return (
        app.application_no?.toLowerCase().includes(term) ||
        borrower.toLowerCase().includes(term) ||
        app.borrowers?.borrower_code?.toLowerCase().includes(term) ||
        app.loan_types?.name?.toLowerCase().includes(term)
      )
    })
  }, [applications, tab, search, range])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [tab, search, range])

  const exportCsv = () => {
    downloadCsv(
      `loan-applications-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered,
      [
        { label: 'Application No', value: (row) => row.application_no },
        { label: 'Borrower', value: (row) => fullName(row.borrowers) },
        { label: 'Borrower Code', value: (row) => row.borrowers?.borrower_code },
        { label: 'Loan Type', value: (row) => row.loan_types?.name },
        { label: 'Requested Amount', value: (row) => row.requested_amount },
        { label: 'Total Payable', value: (row) => row.total_payable },
        { label: 'Term (months)', value: (row) => row.term_months },
        { label: 'Frequency', value: (row) => row.payment_frequency },
        { label: 'Status', value: (row) => row.status },
        { label: 'Submitted', value: (row) => row.submitted_at?.slice(0, 10) },
      ],
    )
  }

  if (loading) return <PageLoader label="Loading applications…" />

  return (
    <div>
      <PageHeader
        title="Loan applications"
        subtitle="Evaluate cash loan requests, request information, and record approval decisions."
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Tabs tabs={TABS.map((item) => ({ ...item, count: counts[item.value] ?? 0 }))} value={tab} onChange={setTab} />
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search application, borrower or loan type"
              className="xl:w-80"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Submitted from"
              type="date"
              value={range.from}
              onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
              className="w-40"
            />
            <Input
              label="Submitted to"
              type="date"
              value={range.to}
              onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
              className="w-40"
            />
            {(range.from || range.to) && (
              <Button size="sm" variant="ghost" onClick={() => setRange({ from: '', to: '' })}>Clear dates</Button>
            )}
            <span className="ml-auto text-xs text-ink-500">{filtered.length} application{filtered.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No applications match"
            description="Adjust the filters or wait for new borrower applications to arrive."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Borrower</th>
                  <th>Loan type</th>
                  <th>Amount</th>
                  <th>Term</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <p className="font-mono text-xs font-semibold text-ink-900">{app.application_no}</p>
                      <p className="max-w-[220px] truncate text-[11px] text-ink-500">{app.purpose}</p>
                    </td>
                    <td>
                      <p className="font-medium text-ink-900">{fullName(app.borrowers)}</p>
                      <p className="text-[11px] text-ink-500">{app.borrowers?.borrower_code}</p>
                    </td>
                    <td className="text-sm">{app.loan_types?.name}</td>
                    <td>
                      <p className="font-semibold text-ink-900">{formatMoney(app.requested_amount)}</p>
                      <p className="text-[11px] text-ink-500">Total {formatMoney(app.total_payable)}</p>
                    </td>
                    <td className="whitespace-nowrap text-xs">{app.term_months} mo · {app.payment_frequency}</td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(app.submitted_at)}</td>
                    <td>
                      <Link to={`/staff/applications/${app.id}`}>
                        <Button size="xs" variant="outline">
                          Evaluate <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </Card>
    </div>
  )
}
