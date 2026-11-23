import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, Wallet } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  Pagination,
  SearchInput,
  StatCard,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { downloadCsv, formatDate, formatMoney, fullName } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'ready_for_disbursement', label: 'Ready for cash release' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'other', label: 'Other' },
]

export default function StaffLoans() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 12

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('loans')
        .select('*, loan_types(name), borrowers(first_name, middle_name, last_name, borrower_code), loan_disbursements(amount_released, disbursement_date)')
        .order('created_at', { ascending: false })
      if (loadError) setError(loadError.message)
      setLoans(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const counts = useMemo(() => {
    const result = { all: loans.length }
    TABS.forEach((item) => {
      if (item.value === 'all') return
      result[item.value] = loans.filter((loan) =>
        item.value === 'other'
          ? !['ready_for_disbursement', 'active', 'completed'].includes(loan.status)
          : loan.status === item.value,
      ).length
    })
    return result
  }, [loans])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return loans.filter((loan) => {
      if (tab !== 'all') {
        const matches =
          tab === 'other'
            ? !['ready_for_disbursement', 'active', 'completed'].includes(loan.status)
            : loan.status === tab
        if (!matches) return false
      }
      if (!term) return true
      return (
        loan.loan_no?.toLowerCase().includes(term) ||
        fullName(loan.borrowers, '').toLowerCase().includes(term) ||
        loan.borrowers?.borrower_code?.toLowerCase().includes(term) ||
        loan.loan_types?.name?.toLowerCase().includes(term)
      )
    })
  }, [loans, tab, search])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => setPage(1), [tab, search])

  const totals = useMemo(() => {
    const active = loans.filter((loan) => loan.status === 'active')
    return {
      active: active.length,
      principal: active.reduce((sum, loan) => sum + Number(loan.principal), 0),
      outstanding: active.reduce((sum, loan) => sum + Number(loan.total_payable) - Number(loan.amount_paid), 0),
    }
  }, [loans])

  const exportCsv = () => {
    downloadCsv(`loans-${new Date().toISOString().slice(0, 10)}.csv`, filtered, [
      { label: 'Loan No', value: (row) => row.loan_no },
      { label: 'Borrower', value: (row) => fullName(row.borrowers) },
      { label: 'Borrower Code', value: (row) => row.borrowers?.borrower_code },
      { label: 'Loan Type', value: (row) => row.loan_types?.name },
      { label: 'Principal', value: (row) => row.principal },
      { label: 'Interest', value: (row) => row.interest_amount },
      { label: 'Fees', value: (row) => row.processing_fee },
      { label: 'Total Payable', value: (row) => row.total_payable },
      { label: 'Amount Paid', value: (row) => row.amount_paid },
      { label: 'Status', value: (row) => row.status },
      { label: 'Disbursed', value: (row) => row.disbursed_at?.slice(0, 10) ?? '' },
      { label: 'Maturity', value: (row) => row.maturity_date ?? '' },
    ])
  }

  if (loading) return <PageLoader label="Loading loans…" />

  return (
    <div>
      <PageHeader
        title="Cash loans"
        subtitle="All approved, active and completed cash loans."
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active loans" value={totals.active} icon={Wallet} tone="emerald" />
        <StatCard label="Active principal" value={formatMoney(totals.principal)} tone="brand" />
        <StatCard label="Outstanding balance" value={formatMoney(totals.outstanding)} tone="amber" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs tabs={TABS.map((item) => ({ ...item, count: counts[item.value] ?? 0 }))} value={tab} onChange={setTab} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search loan, borrower or type" className="xl:w-80" />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Wallet} title="No loans found" description="Approved applications create loan records that appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Borrower</th>
                  <th>Principal</th>
                  <th>Total payable</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Disbursed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <p className="font-mono text-xs font-semibold text-ink-900">{loan.loan_no}</p>
                      <p className="text-[11px] text-ink-500">{loan.loan_types?.name}</p>
                    </td>
                    <td>
                      <p className="font-medium text-ink-900">{fullName(loan.borrowers)}</p>
                      <p className="text-[11px] text-ink-500">{loan.borrowers?.borrower_code}</p>
                    </td>
                    <td className="font-semibold text-ink-900">{formatMoney(loan.principal)}</td>
                    <td>{formatMoney(loan.total_payable)}</td>
                    <td className="text-emerald-700">{formatMoney(loan.amount_paid)}</td>
                    <td className="font-medium">{formatMoney(Number(loan.total_payable) - Number(loan.amount_paid))}</td>
                    <td><StatusBadge status={loan.status} kind="loan" /></td>
                    <td className="whitespace-nowrap text-xs text-ink-500">
                      {loan.disbursed_at ? formatDate(loan.disbursed_at) : '—'}
                    </td>
                    <td>
                      <Link to={`/loans/${loan.id}`}>
                        <Button size="xs" variant="outline">Open <ArrowRight className="h-3 w-3" /></Button>
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
