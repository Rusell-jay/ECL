import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, FileText, Printer } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { daysBetween, downloadCsv, formatDate, formatDateTime, formatMoney, fullName, todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const money = (value) => formatMoney(value)
const text = (value) => value ?? '—'

const REPORTS = {
  borrowers: {
    label: 'Borrowers',
    dateKey: 'created_at',
    totalKey: 'monthly_income',
    totalLabel: 'Monthly income',
    file: 'borrower-report',
    columns: [
      { label: 'Code', csv: (r) => r.borrower_code, render: (r) => <span className="font-mono text-xs">{r.borrower_code}</span> },
      { label: 'Borrower', csv: (r) => fullName(r), render: (r) => <span className="font-medium text-ink-900">{fullName(r)}</span> },
      { label: 'Contact', csv: (r) => r.contact_number },
      { label: 'Email', csv: (r) => r.email },
      { label: 'Employment', csv: (r) => r.employment_status, render: (r) => <span className="capitalize">{text(r.employment_status?.replace(/_/g, ' '))}</span> },
      { label: 'Occupation', csv: (r) => r.occupation },
      { label: 'Monthly income', csv: (r) => r.monthly_income, render: (r) => money(r.monthly_income) },
      { label: 'Status', csv: (r) => r.status, render: (r) => <Badge tone={r.status === 'active' ? 'emerald' : r.status === 'blacklisted' ? 'rose' : 'gray'}>{r.status}</Badge> },
      { label: 'Registered', csv: (r) => r.created_at?.slice(0, 10), render: (r) => formatDate(r.created_at) },
    ],
  },
  applications: {
    label: 'Applications',
    dateKey: 'submitted_at',
    totalKey: 'requested_amount',
    totalLabel: 'Requested amount',
    file: 'loan-application-report',
    columns: [
      { label: 'Application', csv: (r) => r.application_no, render: (r) => <span className="font-mono text-xs">{r.application_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.borrowers), render: (r) => fullName(r.borrowers) },
      { label: 'Loan type', csv: (r) => r.loan_types?.name },
      { label: 'Amount', csv: (r) => r.requested_amount, render: (r) => money(r.requested_amount) },
      { label: 'Term', csv: (r) => r.term_months, render: (r) => `${r.term_months} mo` },
      { label: 'Frequency', csv: (r) => r.payment_frequency },
      { label: 'Status', csv: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { label: 'Submitted', csv: (r) => r.submitted_at?.slice(0, 10), render: (r) => formatDate(r.submitted_at) },
    ],
  },
  approvals: {
    label: 'Approvals',
    dateKey: 'created_at',
    file: 'approval-rejection-report',
    columns: [
      { label: 'Date', csv: (r) => r.created_at?.slice(0, 10), render: (r) => formatDateTime(r.created_at) },
      { label: 'Application', csv: (r) => r.loan_applications?.application_no, render: (r) => <span className="font-mono text-xs">{r.loan_applications?.application_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.loan_applications?.borrowers), render: (r) => fullName(r.loan_applications?.borrowers) },
      { label: 'Decision', csv: (r) => r.decision, render: (r) => <span className="capitalize">{r.decision?.replace(/_/g, ' ')}</span> },
      { label: 'Remarks', csv: (r) => r.remarks, render: (r) => <span className="block max-w-[260px] truncate">{text(r.remarks)}</span> },
      { label: 'Decided by', csv: (r) => r.profiles?.full_name },
    ],
  },
  disbursements: {
    label: 'Disbursements',
    dateKey: 'disbursement_date',
    totalKey: 'amount_released',
    totalLabel: 'Cash released',
    file: 'cash-disbursement-report',
    columns: [
      { label: 'Date', csv: (r) => r.disbursement_date, render: (r) => formatDate(r.disbursement_date) },
      { label: 'Loan', csv: (r) => r.loans?.loan_no, render: (r) => <span className="font-mono text-xs">{r.loans?.loan_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.loans?.borrowers), render: (r) => fullName(r.loans?.borrowers) },
      { label: 'Amount released', csv: (r) => r.amount_released, render: (r) => <span className="font-semibold text-brand-700">{money(r.amount_released)}</span> },
      { label: 'Method', csv: (r) => r.method },
      { label: 'Reference', csv: (r) => r.reference_no },
      { label: 'Processed by', csv: (r) => r.profiles?.full_name },
    ],
  },
  repayments: {
    label: 'Repayments',
    dateKey: 'payment_date',
    totalKey: 'amount',
    totalLabel: 'Cash collected',
    file: 'repayment-collection-report',
    columns: [
      { label: 'Date', csv: (r) => r.payment_date, render: (r) => formatDate(r.payment_date) },
      { label: 'Receipt', csv: (r) => r.receipt_no, render: (r) => <span className="font-mono text-xs">{r.receipt_no}</span> },
      { label: 'Loan', csv: (r) => r.loans?.loan_no, render: (r) => <span className="font-mono text-xs">{r.loans?.loan_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.loans?.borrowers), render: (r) => fullName(r.loans?.borrowers) },
      { label: 'Amount', csv: (r) => r.amount, render: (r) => <span className="font-semibold text-emerald-700">{money(r.amount)}</span> },
      { label: 'Method', csv: (r) => r.method },
      { label: 'Received by', csv: (r) => r.profiles?.full_name },
    ],
  },
  outstanding: {
    label: 'Outstanding',
    dateKey: 'created_at',
    totalKey: '__balance',
    totalLabel: 'Outstanding balance',
    file: 'outstanding-balance-report',
    columns: [
      { label: 'Loan', csv: (r) => r.loan_no, render: (r) => <span className="font-mono text-xs">{r.loan_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.borrowers), render: (r) => fullName(r.borrowers) },
      { label: 'Principal', csv: (r) => r.principal, render: (r) => money(r.principal) },
      { label: 'Total payable', csv: (r) => r.total_payable, render: (r) => money(r.total_payable) },
      { label: 'Paid', csv: (r) => r.amount_paid, render: (r) => money(r.amount_paid) },
      { label: 'Balance', csv: (r) => Number(r.total_payable) - Number(r.amount_paid), render: (r) => <span className="font-semibold text-ink-900">{money(Number(r.total_payable) - Number(r.amount_paid))}</span> },
      { label: 'Maturity', csv: (r) => r.maturity_date, render: (r) => formatDate(r.maturity_date) },
      { label: 'Status', csv: (r) => r.status, render: (r) => <StatusBadge status={r.status} kind="loan" /> },
    ],
  },
  overdue: {
    label: 'Overdue',
    dateKey: 'due_date',
    totalKey: '__balance',
    totalLabel: 'Overdue balance',
    file: 'overdue-repayment-report',
    columns: [
      { label: 'Due date', csv: (r) => r.due_date, render: (r) => formatDate(r.due_date) },
      { label: 'Loan', csv: (r) => r.loans?.loan_no, render: (r) => <span className="font-mono text-xs">{r.loans?.loan_no}</span> },
      { label: 'Borrower', csv: (r) => fullName(r.loans?.borrowers), render: (r) => fullName(r.loans?.borrowers) },
      { label: 'Installment', csv: (r) => r.installment_no, render: (r) => `#${r.installment_no}` },
      { label: 'Amount due', csv: (r) => r.amount_due, render: (r) => money(r.amount_due) },
      { label: 'Paid', csv: (r) => r.amount_paid, render: (r) => money(r.amount_paid) },
      { label: 'Balance', csv: (r) => Number(r.amount_due) - Number(r.amount_paid), render: (r) => <span className="font-semibold text-rose-600">{money(Number(r.amount_due) - Number(r.amount_paid))}</span> },
      { label: 'Days late', csv: (r) => Math.max(0, daysBetween(r.due_date, todayISO())), render: (r) => Math.max(0, daysBetween(r.due_date, todayISO())) },
      { label: 'Status', csv: (r) => r.status, render: (r) => <StatusBadge status={r.status} kind="schedule" /> },
    ],
  },
}

const TABS = Object.entries(REPORTS).map(([value, config]) => ({ value, label: config.label }))

async function fetchReport(tab) {
  if (tab === 'borrowers') {
    const { data, error } = await supabase.from('borrowers').select('*').order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    return data ?? []
  }
  if (tab === 'applications') {
    const { data, error } = await supabase
      .from('loan_applications')
      .select('*, borrowers(first_name, middle_name, last_name), loan_types(name)')
      .order('submitted_at', { ascending: false })
      .limit(1000)
    if (error) throw error
    return data ?? []
  }
  if (tab === 'approvals') {
    const { data, error } = await supabase
      .from('loan_approvals')
      .select('*, profiles(full_name), loan_applications(application_no, borrowers(first_name, middle_name, last_name))')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw error
    return data ?? []
  }
  if (tab === 'disbursements') {
    const { data, error } = await supabase
      .from('loan_disbursements')
      .select('*, profiles(full_name), loans(loan_no, borrowers(first_name, middle_name, last_name))')
      .order('disbursement_date', { ascending: false })
      .limit(1000)
    if (error) throw error
    return data ?? []
  }
  if (tab === 'repayments') {
    const { data, error } = await supabase
      .from('payment_records')
      .select('*, profiles(full_name), loans(loan_no, borrowers(first_name, middle_name, last_name))')
      .order('payment_date', { ascending: false })
      .limit(1000)
    if (error) throw error
    return data ?? []
  }
  if (tab === 'outstanding') {
    const { data, error } = await supabase
      .from('loans')
      .select('*, borrowers(first_name, middle_name, last_name), loan_types(name)')
      .eq('status', 'active')
      .order('maturity_date')
      .limit(1000)
    if (error) throw error
    return data ?? []
  }
  const { data, error } = await supabase
    .from('repayment_schedules')
    .select('*, loans(loan_no, borrowers(first_name, middle_name, last_name))')
    .lt('due_date', todayISO())
    .in('status', ['pending', 'partial', 'overdue'])
    .order('due_date')
    .limit(1000)
  if (error) throw error
  return (data ?? []).filter((row) => Number(row.amount_paid) < Number(row.amount_due) - 0.005)
}

export default function Reports() {
  const [tab, setTab] = useState('borrowers')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })

  const config = REPORTS[tab]

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchReport(tab)
        if (active) setRows(data)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [tab])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      const dateValue = row[config.dateKey]
      if (range.from && dateValue && String(dateValue).slice(0, 10) < range.from) return false
      if (range.to && dateValue && String(dateValue).slice(0, 10) > range.to) return false
      if (!term) return true
      return JSON.stringify(row).toLowerCase().includes(term)
    })
  }, [rows, config.dateKey, range, search])

  const total = useMemo(() => {
    if (!config.totalKey) return null
    return filtered.reduce((sum, row) => {
      const value = config.totalKey === '__balance'
        ? (row.total_payable !== undefined
            ? Number(row.total_payable) - Number(row.amount_paid)
            : Number(row.amount_due) - Number(row.amount_paid))
        : Number(row[config.totalKey] ?? 0)
      return sum + value
    }, 0)
  }, [filtered, config.totalKey])

  const exportCsv = () => {
    downloadCsv(
      `${config.file}-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered,
      config.columns.map((column) => ({ label: column.label, value: column.csv })),
    )
  }

  const rangeLabel =
    range.from || range.to
      ? `${range.from ? formatDate(range.from) : 'Beginning'} – ${range.to ? formatDate(range.to) : 'Today'}`
      : 'All dates'

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Search, filter, export and print operational and financial reports."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
            <Button icon={Printer} onClick={() => window.print()} disabled={filtered.length === 0}>
              Print / PDF
            </Button>
          </>
        }
      />

      <div className="no-print">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-4" />

        <Card className="mb-4">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="From"
                type="date"
                value={range.from}
                onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                className="w-40"
              />
              <Input
                label="To"
                type="date"
                value={range.to}
                onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                className="w-40"
              />
              {(range.from || range.to) && (
                <Button size="sm" variant="ghost" onClick={() => setRange({ from: '', to: '' })}>Clear</Button>
              )}
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search this report" className="lg:w-80" />
          </div>
        </Card>

        {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      </div>

      {loading ? (
        <PageLoader label="Building report…" />
      ) : (
        <Card id="report-print" className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">CashBridge Lending</p>
              <h2 className="mt-1 text-lg font-bold text-ink-950">{config.label} report</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                {rangeLabel} · Generated {formatDateTime(new Date())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-ink-400">Records</p>
              <p className="text-lg font-bold text-ink-900">{filtered.length}</p>
              {total !== null ? (
                <>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">{config.totalLabel}</p>
                  <p className="text-sm font-bold text-brand-700">{formatMoney(total)}</p>
                </>
              ) : null}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={BarChart3} title="No records found" description="Adjust the date range or search term, or wait for new activity." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    {config.columns.map((column) => (
                      <th key={column.label}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => (
                    <tr key={row.id ?? index}>
                      {config.columns.map((column) => (
                        <td key={column.label}>
                          {column.render ? column.render(row) : text(column.csv(row))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Report generated from live Supabase data. Rows are limited to 1,000 records per export.
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
