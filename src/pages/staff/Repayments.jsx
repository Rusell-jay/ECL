import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CreditCard, ReceiptText, TrendingUp, Wallet } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  SearchInput,
  StatCard,
} from '../../components/ui'
import { daysBetween, formatDate, formatMoney, fullName, todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function Repayments() {
  const [stats, setStats] = useState(null)
  const [activeLoans, setActiveLoans] = useState([])
  const [overdue, setOverdue] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      await supabase.rpc('refresh_overdue_schedules')
      const [statsRes, loansRes, overdueRes, paymentsRes] = await Promise.all([
        supabase.rpc('dashboard_stats'),
        supabase
          .from('loans')
          .select('*, borrowers(first_name, middle_name, last_name, borrower_code), loan_types(name)')
          .eq('status', 'active')
          .order('maturity_date'),
        supabase
          .from('repayment_schedules')
          .select('*, loans(id, loan_no, status, borrowers(first_name, last_name))')
          .lt('due_date', todayISO())
          .in('status', ['pending', 'partial', 'overdue'])
          .order('due_date')
          .limit(100),
        supabase
          .from('payment_records')
          .select('*, profiles(full_name), loans(id, loan_no, borrowers(first_name, last_name))')
          .order('payment_date', { ascending: false })
          .limit(20),
      ])
      if (!active) return
      if (statsRes.error) setError(statsRes.error.message)
      setStats(statsRes.data ?? null)
      setActiveLoans(loansRes.data ?? [])
      setOverdue((overdueRes.data ?? []).filter((row) => Number(row.amount_paid) < Number(row.amount_due) - 0.005))
      setPayments(paymentsRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filteredLoans = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return activeLoans
    return activeLoans.filter(
      (loan) =>
        loan.loan_no?.toLowerCase().includes(term) ||
        fullName(loan.borrowers, '').toLowerCase().includes(term) ||
        loan.borrowers?.borrower_code?.toLowerCase().includes(term),
    )
  }, [activeLoans, search])

  if (loading) return <PageLoader label="Loading repayment data…" />

  return (
    <div>
      <PageHeader
        title="Repayments & collections"
        subtitle="Monitor due installments, record cash payments and keep balances accurate."
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active loans" value={stats?.active_loans ?? activeLoans.length} icon={Wallet} tone="emerald" />
        <StatCard label="Outstanding balance" value={formatMoney(stats?.outstanding_balance)} icon={TrendingUp} tone="brand" />
        <StatCard label="Overdue amount" value={formatMoney(stats?.overdue_amount)} hint={`${stats?.overdue_count ?? overdue.length} installments`} icon={AlertTriangle} tone="rose" />
        <StatCard label="Collected this month" value={formatMoney(stats?.collected_this_month)} icon={ReceiptText} tone="emerald" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Overdue installments"
            subtitle="Oldest first — record a payment to bring the account current."
            icon={AlertTriangle}
            actions={<Badge tone="rose">{overdue.length} overdue</Badge>}
          />
          {overdue.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No overdue installments" description="All active loans are current on their schedules." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Loan</th>
                    <th>Installment</th>
                    <th>Due date</th>
                    <th>Balance</th>
                    <th>Days late</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium text-ink-900">{fullName(row.loans?.borrowers)}</td>
                      <td className="font-mono text-xs">{row.loans?.loan_no}</td>
                      <td className="text-xs">#{row.installment_no}</td>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.due_date)}</td>
                      <td className="font-semibold text-rose-600">
                        {formatMoney(Number(row.amount_due) - Number(row.amount_paid))}
                      </td>
                      <td><Badge tone="rose">{Math.max(0, daysBetween(row.due_date, todayISO()))} days</Badge></td>
                      <td>
                        <Link to={`/loans/${row.loans?.id}?pay=1`}>
                          <Button size="xs" icon={CreditCard}>Collect</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent collections" icon={ReceiptText} />
          {payments.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No payments recorded" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {payments.map((payment) => (
                <li key={payment.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink-900">{fullName(payment.loans?.borrowers)}</p>
                    <span className="whitespace-nowrap text-sm font-semibold text-emerald-700">{formatMoney(payment.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {payment.receipt_no} · {formatDate(payment.payment_date)} · {payment.method?.replace(/_/g, ' ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Active loans"
          subtitle="Record payments against any active cash loan."
          icon={Wallet}
          actions={<SearchInput value={search} onChange={setSearch} placeholder="Search loan or borrower" className="w-64" />}
        />
        {filteredLoans.length === 0 ? (
          <EmptyState icon={Wallet} title="No active loans" description="Disbursed loans appear here while they have an outstanding balance." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Loan</th>
                  <th>Total payable</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Progress</th>
                  <th>Maturity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((loan) => {
                  const balance = Number(loan.total_payable) - Number(loan.amount_paid)
                  return (
                    <tr key={loan.id}>
                      <td>
                        <p className="font-medium text-ink-900">{fullName(loan.borrowers)}</p>
                        <p className="text-[11px] text-ink-500">{loan.borrowers?.borrower_code}</p>
                      </td>
                      <td>
                        <p className="font-mono text-xs">{loan.loan_no}</p>
                        <p className="text-[11px] text-ink-500">{loan.loan_types?.name}</p>
                      </td>
                      <td>{formatMoney(loan.total_payable)}</td>
                      <td className="text-emerald-700">{formatMoney(loan.amount_paid)}</td>
                      <td className="font-semibold text-ink-900">{formatMoney(balance)}</td>
                      <td className="w-32">
                        <ProgressBar value={loan.amount_paid} max={loan.total_payable} />
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDate(loan.maturity_date)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Link to={`/loans/${loan.id}?pay=1`}>
                            <Button size="xs" icon={CreditCard}>Pay</Button>
                          </Link>
                          <Link to={`/loans/${loan.id}`}>
                            <Button size="xs" variant="outline">Open</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Payment history" subtitle="Most recent cash repayments received" icon={ReceiptText} />
        {payments.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No payments recorded" description="Recorded repayments will appear here with their receipts." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Borrower</th>
                  <th>Loan</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Received by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-mono text-xs font-semibold text-ink-900">{payment.receipt_no}</td>
                    <td className="whitespace-nowrap text-xs">{formatDate(payment.payment_date)}</td>
                    <td className="font-medium text-ink-800">{fullName(payment.loans?.borrowers)}</td>
                    <td className="font-mono text-xs">{payment.loans?.loan_no}</td>
                    <td className="font-semibold text-emerald-700">{formatMoney(payment.amount)}</td>
                    <td className="capitalize text-xs">{payment.method?.replace(/_/g, ' ')}</td>
                    <td className="text-xs">{payment.profiles?.full_name ?? '—'}</td>
                    <td>
                      <Link to={`/loans/${payment.loans?.id}`}>
                        <Button size="xs" variant="outline">Open loan</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
