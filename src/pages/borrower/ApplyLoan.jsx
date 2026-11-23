import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calculator, CheckCircle2, Info, Send, Wallet } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Textarea,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatMoney, formatPercent } from '../../lib/format'
import { supabase } from '../../lib/supabase'

function installmentsFor(frequency, term) {
  if (frequency === 'weekly') return Math.max(1, term * 4)
  if (frequency === 'biweekly') return Math.max(1, term * 2)
  return Math.max(1, term)
}

export default function ApplyLoan() {
  const { borrower, profile } = useAuth()
  const [loanTypes, setLoanTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ loan_type_id: '', requested_amount: '', term_months: '', purpose: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data, error: loadError } = await supabase
        .from('loan_types')
        .select('*')
        .eq('is_active', true)
        .order('min_amount')
      if (loadError) setError(loadError.message)
      setLoanTypes(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const selected = useMemo(
    () => loanTypes.find((type) => type.id === form.loan_type_id) ?? null,
    [loanTypes, form.loan_type_id],
  )

  const quote = useMemo(() => {
    const amount = Number(form.requested_amount) || 0
    const term = Number(form.term_months) || 0
    if (!selected || amount <= 0 || term <= 0) return null
    const interest = amount * (Number(selected.interest_rate) / 100) * term
    const fee = amount * (Number(selected.processing_fee_rate) / 100) + Number(selected.processing_fee_fixed)
    const total = amount + interest + fee
    const installments = installmentsFor(selected.payment_frequency, term)
    return {
      interest,
      fee,
      total,
      installments,
      perInstallment: total / installments,
    }
  }, [form.requested_amount, form.term_months, selected])

  const pickType = (type) => {
    setForm((prev) => ({
      ...prev,
      loan_type_id: type.id,
      term_months: String(type.term_options?.[0] ?? type.min_term_months ?? ''),
      requested_amount: '',
    }))
    setErrors({})
  }

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (!selected) next.loan_type_id = 'Select a loan type.'
    if (selected) {
      const amount = Number(form.requested_amount)
      if (!form.requested_amount || Number.isNaN(amount)) next.requested_amount = 'Enter the amount you need.'
      else if (amount < Number(selected.min_amount) || amount > Number(selected.max_amount))
        next.requested_amount = `Amount must be between ${formatMoney(selected.min_amount)} and ${formatMoney(selected.max_amount)}.`
      if (!form.term_months) next.term_months = 'Select a repayment term.'
    }
    if (form.purpose.trim().length < 10) next.purpose = 'Describe the purpose in at least 10 characters.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!borrower) {
      setError('Please complete your borrower profile before applying.')
      return
    }
    if (!validate()) return

    setSubmitting(true)
    try {
      const { data, error: insertError } = await supabase
        .from('loan_applications')
        .insert({
          borrower_id: borrower.id,
          loan_type_id: selected.id,
          requested_amount: Number(form.requested_amount),
          purpose: form.purpose.trim(),
          term_months: Number(form.term_months),
          payment_frequency: selected.payment_frequency,
          status: 'pending',
        })
        .select('id, application_no, requested_amount, total_payable, estimated_installment')
        .single()
      if (insertError) throw insertError
      setSubmitted(data)
      setForm({ loan_type_id: '', requested_amount: '', term_months: '', purpose: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader label="Loading available cash loans…" />

  if (submitted) {
    return (
      <div>
        <PageHeader title="Application submitted" subtitle="Your cash loan request is now with our loan officers." />
        <Card className="mx-auto max-w-xl p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-ink-950">We received your application</h2>
          <p className="mt-1 text-sm text-ink-500">
            Application <strong className="font-mono text-ink-800">{submitted.application_no}</strong> is pending
            evaluation. You can track its status at any time.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-4 text-left text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-400">Requested amount</dt>
              <dd className="font-semibold text-ink-900">{formatMoney(submitted.requested_amount)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-400">Estimated total</dt>
              <dd className="font-semibold text-ink-900">{formatMoney(submitted.total_payable)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={`/borrower/applications/${submitted.id}`}>
              <Button icon={ArrowRight}>Track application</Button>
            </Link>
            <Button variant="outline" onClick={() => setSubmitted(null)}>
              Apply again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!borrower) {
    return (
      <div>
        <PageHeader title="Apply for a cash loan" subtitle="You need a completed borrower profile first." />
        <Card className="p-6">
          <EmptyState
            icon={Wallet}
            title="Complete your borrower profile"
            description="We need your personal and financial information before you can submit a cash loan application."
            action={
              <Link to="/borrower/profile">
                <Button icon={ArrowRight}>Go to my profile</Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Cash loan application"
        title="Apply for a cash loan"
        subtitle="Choose a loan type, tell us how much you need, and review the estimated repayment before submitting."
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {borrower.status !== 'active' ? (
        <Alert tone="warning" className="mb-4" title="Application unavailable">
          Your borrower account is currently {borrower.status}. Please contact the lending office.
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="1. Select a cash loan type" subtitle="Only active loan products are shown." icon={Wallet} />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {loanTypes.map((type) => {
                const active = form.loan_type_id === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => pickType(type)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      active
                        ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-100'
                        : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-ink-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-ink-950">{type.name}</p>
                      <span className={`mt-1 h-4 w-4 rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'}`}>
                        {active ? <span className="block h-full w-full scale-50 rounded-full bg-white" /> : null}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{type.description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-600">
                      <span>{formatMoney(type.min_amount)} – {formatMoney(type.max_amount)}</span>
                      <span className="font-semibold text-brand-700">{formatPercent(type.interest_rate)} / month</span>
                      <span className="capitalize">{type.payment_frequency}</span>
                    </div>
                  </button>
                )
              })}
              {loanTypes.length === 0 ? (
                <div className="sm:col-span-2">
                  <EmptyState icon={Wallet} title="No loan types available" description="Please check back later or contact the lending office." />
                </div>
              ) : null}
            </div>
            {errors.loan_type_id ? <p className="px-5 pb-4 text-xs font-medium text-rose-600">{errors.loan_type_id}</p> : null}
          </Card>

          <Card>
            <CardHeader title="2. Loan details" subtitle="Enter the amount and choose a term that fits your budget." icon={Calculator} />
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Amount you need"
                  type="number"
                  min={selected?.min_amount ?? 0}
                  max={selected?.max_amount ?? undefined}
                  step="0.01"
                  prefix="₱"
                  placeholder="0.00"
                  disabled={!selected}
                  value={form.requested_amount}
                  onChange={update('requested_amount')}
                  error={errors.requested_amount}
                  hint={selected ? `Allowed: ${formatMoney(selected.min_amount)} – ${formatMoney(selected.max_amount)}` : 'Select a loan type first.'}
                />
                <div>
                  <p className="mb-1.5 block text-sm font-medium text-ink-700">
                    Repayment term <span className="text-rose-500">*</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(selected?.term_options ?? []).map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, term_months: String(term) }))
                          setErrors((prev) => ({ ...prev, term_months: undefined }))
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          Number(form.term_months) === term
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                        }`}
                      >
                        {term} mo{term === 1 ? '' : 's'}
                      </button>
                    ))}
                    {!selected ? <p className="text-xs text-ink-400">Select a loan type to see terms.</p> : null}
                  </div>
                  {errors.term_months ? <p className="mt-1 text-xs font-medium text-rose-600">{errors.term_months}</p> : null}
                  {selected ? (
                    <p className="mt-1 text-xs text-ink-500">
                      Installments: {installmentsFor(selected.payment_frequency, Number(form.term_months) || 0)} ({selected.payment_frequency})
                    </p>
                  ) : null}
                </div>
              </div>

              <Textarea
                label="Purpose of the loan"
                rows={4}
                placeholder="e.g. Hospital bill for a family member, urgent home repair, business working capital…"
                value={form.purpose}
                onChange={update('purpose')}
                error={errors.purpose}
                hint={`${form.purpose.trim().length}/10 characters minimum`}
                required
              />

              <Alert tone="info">
                Applications are evaluated by authorized personnel. Submitting this form does not guarantee
                approval. You will be notified when the status changes.
              </Alert>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="xl:sticky xl:top-24">
            <CardHeader title="Estimated repayment" subtitle="Based on the selected loan terms" icon={Calculator} />
            <div className="p-5">
              {!quote ? (
                <div className="rounded-xl border border-dashed border-ink-300 p-5 text-center text-xs text-ink-500">
                  Select a loan type and enter an amount to see your estimate.
                </div>
              ) : (
                <>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Principal</dt>
                      <dd className="font-semibold text-ink-900">{formatMoney(Number(form.requested_amount))}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">
                        Interest ({formatPercent(selected.interest_rate)} × {form.term_months} mo)
                      </dt>
                      <dd className="font-medium text-ink-900">{formatMoney(quote.interest)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Processing fee</dt>
                      <dd className="font-medium text-ink-900">{formatMoney(quote.fee)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-ink-200 pt-2.5">
                      <dt className="font-semibold text-ink-800">Total payable</dt>
                      <dd className="text-base font-bold text-brand-700">{formatMoney(quote.total)}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-xl bg-brand-50 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                      Estimated {selected.payment_frequency} installment
                    </p>
                    <p className="mt-1 text-xl font-bold text-brand-800">{formatMoney(quote.perInstallment)}</p>
                    <p className="mt-0.5 text-[11px] text-brand-700/80">
                      {quote.installments} installment{quote.installments === 1 ? '' : 's'} · actual schedule is
                      generated at disbursement
                    </p>
                  </div>
                </>
              )}

              <Button
                type="submit"
                icon={Send}
                loading={submitting}
                disabled={!quote || borrower.status !== 'active'}
                className="mt-5 w-full"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </Button>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Final figures are calculated by the system using the configured loan type rates and fees.
              </p>
            </div>
          </Card>
        </div>
      </form>
    </div>
  )
}
