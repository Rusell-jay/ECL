import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileText, PlusCircle } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMoney } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'approved', label: 'Approved / Active' },
  { value: 'closed', label: 'Closed' },
]

const GROUPS = {
  in_progress: ['pending', 'under_review', 'additional_info_required'],
  approved: ['approved', 'for_agreement', 'ready_for_disbursement', 'active'],
  closed: ['completed', 'rejected', 'cancelled'],
}

export default function BorrowerApplications() {
  const { borrower } = useAuth()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    if (!borrower?.id) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('loan_applications')
        .select('id, application_no, status, requested_amount, total_payable, term_months, payment_frequency, purpose, submitted_at, loan_types(name)')
        .eq('borrower_id', borrower.id)
        .order('created_at', { ascending: false })
      if (loadError) setError(loadError.message)
      setApplications(data ?? [])
      setLoading(false)
    }
    load()
  }, [borrower?.id])

  const counts = useMemo(() => {
    const result = { all: applications.length }
    Object.entries(GROUPS).forEach(([key, statuses]) => {
      result[key] = applications.filter((app) => statuses.includes(app.status)).length
    })
    return result
  }, [applications])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return applications.filter((app) => {
      if (tab !== 'all' && !GROUPS[tab]?.includes(app.status)) return false
      if (!term) return true
      return (
        app.application_no?.toLowerCase().includes(term) ||
        app.loan_types?.name?.toLowerCase().includes(term) ||
        app.purpose?.toLowerCase().includes(term)
      )
    })
  }, [applications, tab, search])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [tab, search])

  if (loading) return <PageLoader label="Loading your applications…" />

  return (
    <div>
      <PageHeader
        title="My applications"
        subtitle="Track every cash loan application you have submitted."
        actions={
          <Link to="/borrower/apply">
            <Button icon={PlusCircle}>New application</Button>
          </Link>
        }
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            tabs={TABS.map((item) => ({ ...item, count: counts[item.value] ?? 0 }))}
            value={tab}
            onChange={setTab}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search application no., type or purpose"
            className="lg:w-80"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={applications.length === 0 ? 'No applications yet' : 'No matching applications'}
            description={
              applications.length === 0
                ? 'Submit your first cash loan application and it will appear here for tracking.'
                : 'Try a different search term or filter.'
            }
            action={
              applications.length === 0 ? (
                <Link to="/borrower/apply">
                  <Button size="sm" icon={PlusCircle}>Apply for a loan</Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Application</th>
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
                      <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-ink-500">{app.purpose}</p>
                    </td>
                    <td className="font-medium text-ink-800">{app.loan_types?.name}</td>
                    <td>
                      <p className="font-semibold text-ink-900">{formatMoney(app.requested_amount)}</p>
                      <p className="text-[11px] text-ink-500">Total {formatMoney(app.total_payable)}</p>
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-600">
                      {app.term_months} mo · {app.payment_frequency}
                    </td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(app.submitted_at)}</td>
                    <td>
                      <Link to={`/borrower/applications/${app.id}`}>
                        <Button size="xs" variant="outline">
                          View <ArrowRight className="h-3 w-3" />
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
