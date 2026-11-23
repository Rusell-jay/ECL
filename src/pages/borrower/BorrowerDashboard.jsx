import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  PlusCircle,
  TrendingUp,
  UserCircle,
  Wallet,
} from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMoney } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function BorrowerDashboard() {
  const { profile, borrower } = useAuth()
  const [applications, setApplications] = useState([])
  const [loans, setLoans] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!borrower?.id) {
      setLoading(false)
      return
    }
    let active = true

    const load = async () => {
      setLoading(true)
      const [appsRes, loansRes] = await Promise.all([
        supabase
          .from('loan_applications')
          .select('id, application_no, status, requested_amount, total_payable, estimated_installment, submitted_at, loan_types(name)')
          .eq('borrower_id', borrower.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('loans')
          .select('*, loan_types(name)')
          .eq('borrower_id', borrower.id)
          .order('created_at', { ascending: false }),
      ])

      if (!active) return
      if (appsRes.error) setError(appsRes.error.message)
      if (loansRes.error) setError(loansRes.error.message)
      setApplications(appsRes.data ?? [])
      setLoans(loansRes.data ?? [])

      const activeLoan = (loansRes.data ?? []).find((loan) => loan.status === 'active')
      if (activeLoan) {
        const { data: scheduleRows } = await supabase
          .from('repayment_schedules')
          .select('*')
          .eq('loan_id', activeLoan.id)
          .order('installment_no')
        if (active) setSchedules(scheduleRows ?? [])
      } else {
        setSchedules([])
      }
      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [borrower?.id])

  const activeLoan = useMemo(() => loans.find((loan) => loan.status === 'active'), [loans])
  const outstanding = useMemo(
    () => loans.filter((loan) => loan.status === 'active').reduce((sum, loan) => sum + Number(loan.total_payable) - Number(loan.amount_paid), 0),
    [loans],
  )
  const nextDue = useMemo(
    () =>
      schedules
        .filter((row) => row.status !== 'paid' && row.status !== 'waived')
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0],
    [schedules],
  )
  const inProgress = applications.filter((app) =>
    ['pending', 'under_review', 'additional_info_required', 'approved', 'for_agreement', 'ready_for_disbursement'].includes(app.status),
  ).length

  if (!borrower && !loading) {
    return (
      <div>
        <PageHeader title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'there'}`} subtitle="Let's finish setting up your borrower profile." />
        <Card className="p-6">
          <EmptyState
            icon={UserCircle}
            title="Complete your borrower profile"
            description="We need your personal and financial details before you can apply for a cash loan."
            action={
              <Link to="/borrower/profile">
                <Button icon={ArrowRight}>Complete profile</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  if (loading) return <PageLoader label="Loading your dashboard…" />

  return (
    <div>
      <PageHeader
        eyebrow="Borrower portal"
        title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'borrower'}`}
        subtitle="Track your cash loan applications, active loan and upcoming repayments in one place."
        actions={
          <Link to="/borrower/apply">
            <Button icon={PlusCircle}>Apply for a loan</Button>
          </Link>
        }
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      {borrower?.status === 'blacklisted' ? (
        <Alert tone="error" title="Account restricted" className="mb-4">
          Your borrower account is currently restricted. Please contact the lending office for assistance.
        </Alert>
      ) : null}

      {!activeLoan && applications.length === 0 ? (
        <Alert tone="info" title="Start with a cash loan application" className="mb-4">
          Choose a loan type, enter the amount you need and submit. A loan officer will evaluate your application.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active loan"
          value={activeLoan ? formatMoney(activeLoan.principal) : 'None'}
          hint={activeLoan ? activeLoan.loan_no : 'No active cash loan'}
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          label="Outstanding balance"
          value={formatMoney(outstanding)}
          hint="Principal, interest and fees"
          icon={TrendingUp}
          tone="brand"
        />
        <StatCard
          label="Next payment due"
          value={nextDue ? formatMoney(Number(nextDue.amount_due) - Number(nextDue.amount_paid)) : '—'}
          hint={nextDue ? formatDate(nextDue.due_date) : 'No upcoming installment'}
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Applications in progress"
          value={inProgress}
          hint={`${applications.length} recent application${applications.length === 1 ? '' : 's'}`}
          icon={FileText}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Active cash loan"
              subtitle="Your current loan balance and repayment progress"
              icon={Wallet}
              actions={
                activeLoan ? (
                  <Link to={`/loans/${activeLoan.id}`}>
                    <Button size="sm" variant="outline">
                      View loan <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ) : null
              }
            />
            {!activeLoan ? (
              <EmptyState
                icon={Wallet}
                title="No active loan"
                description="Once your application is approved and cash is disbursed, your active loan will appear here."
                action={
                  <Link to="/borrower/applications">
                    <Button size="sm" variant="outline">View my applications</Button>
                  </Link>
                }
              />
            ) : (
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{activeLoan.loan_no}</p>
                    <p className="mt-1 text-2xl font-bold text-ink-950">{formatMoney(activeLoan.principal)}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {activeLoan.loan_types?.name} · {activeLoan.term_months} month{activeLoan.term_months === 1 ? '' : 's'} ·{' '}
                      {activeLoan.payment_frequency}
                    </p>
                  </div>
                  <StatusBadge status={activeLoan.status} kind="loan" />
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-600">
                      Paid {formatMoney(activeLoan.amount_paid)} of {formatMoney(activeLoan.total_payable)}
                    </span>
                    <span className="font-semibold text-brand-700">
                      {Math.round((Number(activeLoan.amount_paid) / Number(activeLoan.total_payable)) * 100)}%
                    </span>
                  </div>
                  <ProgressBar value={activeLoan.amount_paid} max={activeLoan.total_payable} />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-ink-400">Total payable</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">{formatMoney(activeLoan.total_payable)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-ink-400">Amount paid</dt>
                    <dd className="mt-0.5 font-semibold text-emerald-700">{formatMoney(activeLoan.amount_paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-ink-400">Remaining</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">
                      {formatMoney(Number(activeLoan.total_payable) - Number(activeLoan.amount_paid))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-ink-400">Maturity</dt>
                    <dd className="mt-0.5 font-semibold text-ink-900">{formatDate(activeLoan.maturity_date)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Upcoming repayments"
              subtitle="Installments on your active loan"
              icon={CalendarClock}
              actions={
                activeLoan ? (
                  <Link to={`/loans/${activeLoan.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                    Full schedule
                  </Link>
                ) : null
              }
            />
            {schedules.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No repayment schedule" description="Schedules are generated when your loan is disbursed." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due date</th>
                      <th>Amount due</th>
                      <th>Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.slice(0, 6).map((row) => (
                      <tr key={row.id}>
                        <td className="text-ink-500">{row.installment_no}</td>
                        <td className="font-medium text-ink-900">{formatDate(row.due_date)}</td>
                        <td>{formatMoney(row.amount_due)}</td>
                        <td>{formatMoney(row.amount_paid)}</td>
                        <td>
                          <StatusBadge status={row.status} kind="schedule" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Quick actions" icon={CheckCircle2} />
            <div className="space-y-2 p-4">
              <Link
                to="/borrower/apply"
                className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-brand-600" /> New cash loan application
                </span>
                <ArrowRight className="h-4 w-4 text-ink-400" />
              </Link>
              <Link
                to="/borrower/applications"
                className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-600" /> Track applications
                </span>
                <ArrowRight className="h-4 w-4 text-ink-400" />
              </Link>
              <Link
                to="/borrower/profile"
                className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-brand-600" /> Update my profile
                </span>
                <ArrowRight className="h-4 w-4 text-ink-400" />
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent applications"
              actions={
                <Link to="/borrower/applications" className="text-xs font-semibold text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
            {applications.length === 0 ? (
              <EmptyState icon={FileText} title="No applications yet" description="Submit your first cash loan application to get started." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {applications.map((app) => (
                  <li key={app.id}>
                    <Link to={`/borrower/applications/${app.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{formatMoney(app.requested_amount)}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {app.application_no} · {app.loan_types?.name}
                        </p>
                      </div>
                      <StatusBadge status={app.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="border-brand-200 bg-brand-50/40 p-4">
            <div className="flex gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-xs leading-relaxed text-ink-600">
                All applications are reviewed by authorized personnel. Submitting an application does not
                guarantee approval, and no cash is released until evaluation and disbursement are completed.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
