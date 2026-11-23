import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  FileSearch,
  FileText,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  PageLoader,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMoney, fullName, todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function StaffDashboard() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState([])
  const [applications, setApplications] = useState([])
  const [overdue, setOverdue] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      await supabase.rpc('refresh_overdue_schedules')

      const [statsRes, trendsRes, appsRes, overdueRes, paymentsRes] = await Promise.all([
        supabase.rpc('dashboard_stats'),
        supabase.rpc('financial_trends'),
        supabase
          .from('loan_applications')
          .select('id, application_no, status, requested_amount, submitted_at, borrowers(first_name, last_name, borrower_code), loan_types(name)')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('repayment_schedules')
          .select('id, installment_no, due_date, amount_due, amount_paid, status, loans(id, loan_no, borrowers(first_name, last_name))')
          .in('status', ['overdue', 'pending', 'partial'])
          .lt('due_date', todayISO())
          .order('due_date')
          .limit(6),
        supabase
          .from('payment_records')
          .select('id, receipt_no, amount, payment_date, method, loans(loan_no, borrowers(first_name, last_name))')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (!active) return
      if (statsRes.error) setError(statsRes.error.message)
      setStats(statsRes.data ?? null)
      setTrends(trendsRes.data ?? [])
      setApplications(appsRes.data ?? [])
      setOverdue(overdueRes.data ?? [])
      setPayments(paymentsRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader label="Loading operations dashboard…" />

  const s = stats ?? {}
  const chartData = trends.map((row) => ({
    month: row.month,
    Disbursed: Number(row.disbursed),
    Collected: Number(row.collected),
  }))

  return (
    <div>
      <PageHeader
        eyebrow={isAdmin ? 'Administrator dashboard' : 'Loan officer dashboard'}
        title={`Good day, ${profile?.full_name?.split(' ')[0] || 'team'}`}
        subtitle="Portfolio health, application queue and collections at a glance."
        actions={
          <>
            <Link to="/staff/applications">
              <Button variant="outline" icon={FileSearch}>Review applications</Button>
            </Link>
            <Link to="/staff/disbursements">
              <Button icon={Banknote}>Disburse cash</Button>
            </Link>
          </>
        }
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      {isAdmin ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total borrowers" value={s.total_borrowers ?? 0} hint={`${s.active_borrowers ?? 0} active`} icon={Users} tone="brand" />
            <StatCard label="Active cash loans" value={s.active_loans ?? 0} hint={`${s.completed_loans ?? 0} completed`} icon={Wallet} tone="emerald" />
            <StatCard label="Total disbursed" value={formatMoney(s.total_disbursed)} hint={`${formatMoney(s.disbursed_this_month)} this month`} icon={Banknote} tone="blue" />
            <StatCard label="Total collected" value={formatMoney(s.total_collected)} hint={`${formatMoney(s.collected_this_month)} this month`} icon={ReceiptText} tone="emerald" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Outstanding balance" value={formatMoney(s.outstanding_balance)} icon={TrendingUp} tone="amber" />
            <StatCard label="Overdue amount" value={formatMoney(s.overdue_amount)} hint={`${s.overdue_count ?? 0} installments`} icon={AlertTriangle} tone="rose" />
            <StatCard label="Pending applications" value={s.pending_applications ?? 0} hint={`${s.under_review ?? 0} under review`} icon={Clock} tone="amber" />
            <StatCard label="Approved applications" value={s.approved_applications ?? 0} hint={`${s.rejected_applications ?? 0} rejected`} icon={CheckCircle2} tone="brand" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Pending evaluation" value={s.pending_applications ?? 0} hint="Newly submitted applications" icon={Clock} tone="amber" />
            <StatCard label="Under review" value={s.under_review ?? 0} hint="Currently being evaluated" icon={FileSearch} tone="blue" />
            <StatCard label="Additional info required" value={s.additional_info ?? 0} hint="Waiting on borrowers" icon={AlertTriangle} tone="orange" />
            <StatCard label="Approved" value={s.approved_applications ?? 0} hint="Approved and ongoing loans" icon={CheckCircle2} tone="emerald" />
            <StatCard label="Rejected" value={s.rejected_applications ?? 0} icon={FileText} tone="rose" />
            <StatCard label="Ready for disbursement" value={s.ready_for_disbursement ?? 0} hint="Awaiting cash release" icon={Banknote} tone="cyan" />
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Disbursements vs collections"
            subtitle="Last six months"
            icon={TrendingUp}
            actions={<Badge tone="brand">Portfolio cash flow</Badge>}
          />
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="disbursed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#229b80" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#229b80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64778f' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64778f' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `₱${Math.round(Number(value) / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatMoney(value)} contentStyle={{ borderRadius: 12, borderColor: '#d5dae2', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Disbursed" stroke="#229b80" strokeWidth={2} fill="url(#disbursed)" />
                <Area type="monotone" dataKey="Collected" stroke="#6366f1" strokeWidth={2} fill="url(#collected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Collections snapshot" icon={ReceiptText} />
          <div className="p-5">
            <div className="rounded-xl bg-brand-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Collected this month</p>
              <p className="mt-1 text-2xl font-bold text-brand-900">{formatMoney(s.collected_this_month)}</p>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Disbursed this month</dt>
                <dd className="font-semibold text-ink-900">{formatMoney(s.disbursed_this_month)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Due today</dt>
                <dd className="font-semibold text-ink-900">{formatMoney(s.due_today)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Overdue installments</dt>
                <dd className="font-semibold text-rose-600">{s.overdue_count ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Applications this month</dt>
                <dd className="font-semibold text-ink-900">{s.applications_this_month ?? 0}</dd>
              </div>
            </dl>
            <Link to="/staff/reports" className="mt-4 block">
              <Button variant="outline" className="w-full" icon={TrendingUp}>Open reports</Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Latest applications"
            subtitle="Most recent cash loan requests"
            icon={FileText}
            actions={
              <Link to="/staff/applications" className="text-xs font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {applications.length === 0 ? (
            <EmptyState icon={FileText} title="No applications yet" description="New borrower applications will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Borrower</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <p className="font-mono text-xs font-semibold text-ink-900">{app.application_no}</p>
                        <p className="text-[11px] text-ink-500">{app.loan_types?.name} · {formatDate(app.submitted_at)}</p>
                      </td>
                      <td className="font-medium text-ink-800">{fullName(app.borrowers)}</td>
                      <td className="font-semibold text-ink-900">{formatMoney(app.requested_amount)}</td>
                      <td><StatusBadge status={app.status} /></td>
                      <td>
                        <Link to={`/staff/applications/${app.id}`}>
                          <Button size="xs" variant="outline">Review</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Overdue installments"
              icon={AlertTriangle}
              actions={
                <Link to="/staff/repayments" className="text-xs font-semibold text-brand-700 hover:underline">
                  Manage
                </Link>
              }
            />
            {overdue.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No overdue accounts" description="All installments are current." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {overdue.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{fullName(row.loans?.borrowers)}</p>
                      <Badge tone="rose">Overdue</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {row.loans?.loan_no} · installment {row.installment_no} · due {formatDate(row.due_date)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-rose-600">
                      {formatMoney(Number(row.amount_due) - Number(row.amount_paid))} unpaid
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent payments" icon={ReceiptText} />
            {payments.length === 0 ? (
              <EmptyState icon={ReceiptText} title="No payments yet" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{fullName(payment.loans?.borrowers)}</p>
                      <p className="truncate text-[11px] text-ink-500">{payment.receipt_no} · {formatDate(payment.payment_date)}</p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-emerald-700">
                      {formatMoney(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Link to="/staff/repayments" className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm font-semibold text-brand-800 hover:bg-brand-50">
            Record a repayment <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
