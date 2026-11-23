import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, TrendingUp, Wallet } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  StatCard,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMoney } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function MyLoans() {
  const { borrower } = useAuth()
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')

  useEffect(() => {
    if (!borrower?.id) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('loans')
        .select('*, loan_types(name)')
        .eq('borrower_id', borrower.id)
        .order('created_at', { ascending: false })
      if (loadError) setError(loadError.message)
      setLoans(data ?? [])
      setLoading(false)
    }
    load()
  }, [borrower?.id])

  const counts = useMemo(
    () => ({
      all: loans.length,
      active: loans.filter((loan) => loan.status === 'active').length,
      completed: loans.filter((loan) => loan.status === 'completed').length,
    }),
    [loans],
  )

  const filtered = useMemo(() => {
    if (tab === 'active') return loans.filter((loan) => loan.status === 'active')
    if (tab === 'completed') return loans.filter((loan) => loan.status === 'completed')
    return loans
  }, [loans, tab])

  const totals = useMemo(() => {
    const active = loans.filter((loan) => loan.status === 'active')
    return {
      borrowed: active.reduce((sum, loan) => sum + Number(loan.principal), 0),
      outstanding: active.reduce((sum, loan) => sum + Number(loan.total_payable) - Number(loan.amount_paid), 0),
      paid: loans.reduce((sum, loan) => sum + Number(loan.amount_paid), 0),
    }
  }, [loans])

  if (loading) return <PageLoader label="Loading your loans…" />

  return (
    <div>
      <PageHeader title="My loans" subtitle="Your approved cash loans, balances and repayment progress." />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active principal" value={formatMoney(totals.borrowed)} icon={Wallet} tone="brand" />
        <StatCard label="Outstanding balance" value={formatMoney(totals.outstanding)} icon={TrendingUp} tone="amber" />
        <StatCard label="Total repaid" value={formatMoney(totals.paid)} icon={CalendarClock} tone="emerald" />
      </div>

      <Tabs
        tabs={[
          { value: 'all', label: 'All loans', count: counts.all },
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'completed', label: 'Completed', count: counts.completed },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4 w-fit"
      />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No loans to show"
            description="Approved and disbursed cash loans will appear here with their full repayment details."
            action={
              <Link to="/borrower/applications">
                <Button size="sm" variant="outline">View applications</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((loan) => {
            const remaining = Number(loan.total_payable) - Number(loan.amount_paid)
            return (
              <Card key={loan.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-ink-500">{loan.loan_no}</p>
                    <p className="mt-1 text-xl font-bold text-ink-950">{formatMoney(loan.principal)}</p>
                    <p className="text-xs text-ink-500">
                      {loan.loan_types?.name} · {loan.term_months} mo · {loan.payment_frequency}
                    </p>
                  </div>
                  <StatusBadge status={loan.status} kind="loan" />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-500">
                      Paid {formatMoney(loan.amount_paid)} of {formatMoney(loan.total_payable)}
                    </span>
                    <span className="font-semibold text-brand-700">
                      {loan.total_payable ? Math.round((Number(loan.amount_paid) / Number(loan.total_payable)) * 100) : 0}%
                    </span>
                  </div>
                  <ProgressBar value={loan.amount_paid} max={loan.total_payable} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ink-50 p-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Remaining</p>
                    <p className="mt-0.5 font-semibold text-ink-900">{formatMoney(remaining)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Next due</p>
                    <p className="mt-0.5 font-semibold text-ink-900">{formatDate(loan.first_due_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Maturity</p>
                    <p className="mt-0.5 font-semibold text-ink-900">{formatDate(loan.maturity_date)}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Link to={`/loans/${loan.id}`}>
                    <Button size="sm" variant="outline">
                      View schedule & payments <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
