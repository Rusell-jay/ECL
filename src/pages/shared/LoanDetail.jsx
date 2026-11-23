import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Printer,
  ReceiptText,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DetailRow,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  ProgressBar,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_METHODS } from '../../lib/constants'
import { formatDate, formatDateTime, formatMoney, formatPercent, fullName, todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'

function Receipt({ payment, loan, onClose }) {
  if (!payment) return null
  const borrowerName = fullName(loan?.borrowers, 'Borrower')
  return (
    <Modal
      open
      onClose={onClose}
      title="Payment receipt"
      description="Official acknowledgement of cash received."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print receipt</Button>
        </>
      }
    >
      <div id="receipt-print" className="rounded-xl border border-ink-200 p-6">
        <div className="flex items-start justify-between border-b border-ink-200 pb-4">
          <div>
            <p className="text-lg font-bold text-ink-950">CashBridge Lending</p>
            <p className="text-xs text-ink-500">Emergency Cash Loan Management</p>
            <p className="mt-1 text-[11px] text-ink-400">123 Finance Street, Metro Manila · +63 2 8888 0000</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">Payment Receipt</p>
            <p className="mt-1 font-mono text-xs font-bold text-ink-900">{payment.receipt_no}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Received from</p>
            <p className="font-semibold text-ink-900">{borrowerName}</p>
            <p className="text-xs text-ink-500">{loan?.borrowers?.borrower_code}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Payment date</p>
            <p className="font-semibold text-ink-900">{formatDate(payment.payment_date)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Loan number</p>
            <p className="font-mono text-xs font-semibold text-ink-900">{loan?.loan_no}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Payment method</p>
            <p className="font-semibold capitalize text-ink-900">{payment.method?.replace(/_/g, ' ')}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-brand-50 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">Amount received</p>
          <p className="mt-1 text-3xl font-bold text-brand-900">{formatMoney(payment.amount)}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Reference</p>
            <p className="font-medium text-ink-800">{payment.reference_no || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Received by</p>
            <p className="font-medium text-ink-800">{payment.profiles?.full_name || 'Authorized personnel'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Total payable</p>
            <p className="font-medium text-ink-800">{formatMoney(loan?.total_payable)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">Remaining balance</p>
            <p className="font-medium text-ink-800">
              {formatMoney(
                payment.balance_after ?? Number(loan?.total_payable ?? 0) - Number(loan?.amount_paid ?? 0),
              )}
            </p>
          </div>
        </div>

        {payment.notes ? <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">{payment.notes}</p> : null}

        <div className="mt-8 flex items-end justify-between text-[10px] text-ink-400">
          <div className="w-40 border-t border-ink-300 pt-1 text-center">Received by</div>
          <div className="w-40 border-t border-ink-300 pt-1 text-center">Borrower signature</div>
        </div>
        <p className="mt-4 text-center text-[10px] text-ink-400">
          This receipt is generated by CashBridge and acknowledges the cash amount stated above.
        </p>
      </div>
    </Modal>
  )
}

export default function LoanDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { isStaff } = useAuth()
  const [loan, setLoan] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [payments, setPayments] = useState([])
  const [disbursement, setDisbursement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'cash',
    payment_date: todayISO(),
    reference: '',
    notes: '',
  })
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (isStaff) {
      await supabase.rpc('refresh_overdue_schedules')
    }
    const [loanRes, scheduleRes, paymentRes, disbRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, loan_types(name, description), borrowers(*, profiles(full_name, email, phone))')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('repayment_schedules').select('*').eq('loan_id', id).order('installment_no'),
      supabase
        .from('payment_records')
        .select('*, profiles(full_name)')
        .eq('loan_id', id)
        .order('payment_date', { ascending: false }),
      supabase.from('loan_disbursements').select('*, profiles(full_name)').eq('loan_id', id).maybeSingle(),
    ])

    if (loanRes.error) setError(loanRes.error.message)
    setLoan(loanRes.data ?? null)
    setSchedules(scheduleRes.data ?? [])
    setPayments(paymentRes.data ?? [])
    setDisbursement(disbRes.data ?? null)
    setLoading(false)
  }, [id, isStaff])

  useEffect(() => {
    load()
  }, [load])

  const remaining = useMemo(
    () => (loan ? Number(loan.total_payable) - Number(loan.amount_paid) : 0),
    [loan],
  )

  const openPayment = () => {
    setPaymentForm({
      amount: remaining > 0 ? remaining.toFixed(2) : '',
      method: 'cash',
      payment_date: todayISO(),
      reference: '',
      notes: '',
    })
    setFeedback(null)
    setPayOpen(true)
  }

  // Support deep links such as /loans/:id?pay=1 from the collections queue.
  useEffect(() => {
    if (searchParams.get('pay') === '1' && isStaff && loan?.status === 'active') {
      openPayment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id, isStaff])

  const submitPayment = async (event) => {
    event.preventDefault()
    setFeedback(null)
    const amount = Number(paymentForm.amount)
    if (!amount || amount <= 0) {
      setFeedback({ tone: 'error', message: 'Enter a payment amount greater than zero.' })
      return
    }
    if (amount > remaining + 0.005) {
      setFeedback({ tone: 'error', message: `Payment cannot exceed the remaining balance of ${formatMoney(remaining)}.` })
      return
    }
    if (paymentForm.payment_date > todayISO()) {
      setFeedback({ tone: 'error', message: 'Payment date cannot be in the future.' })
      return
    }

    setPaying(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('record_payment', {
        p_loan_id: id,
        p_amount: amount,
        p_method: paymentForm.method,
        p_reference: paymentForm.reference.trim() || null,
        p_notes: paymentForm.notes.trim() || null,
        p_payment_date: paymentForm.payment_date,
      })
      if (rpcError) throw rpcError
      setPayOpen(false)
      setFeedback({
        tone: 'success',
        message: `Payment recorded successfully. Receipt ${data.receipt_no}. Remaining balance: ${formatMoney(data.remaining_balance)}.`,
      })
      await load()
      setReceipt({
        receipt_no: data.receipt_no,
        amount,
        payment_date: paymentForm.payment_date,
        method: paymentForm.method,
        reference_no: paymentForm.reference.trim() || null,
        notes: paymentForm.notes.trim() || null,
        balance_after: data.remaining_balance,
        profiles: null,
      })
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <PageLoader label="Loading loan details…" />
  if (!loan) {
    return (
      <div>
        <PageHeader title="Loan not found" subtitle="This loan does not exist or you do not have access to it." />
        <Link to={isStaff ? '/staff/loans' : '/borrower/loans'}>
          <Button variant="outline" icon={ArrowLeft}>Back to loans</Button>
        </Link>
      </div>
    )
  }

  const borrowerName = fullName(loan.borrowers, 'Borrower')
  const paidCount = schedules.filter((row) => row.status === 'paid').length

  return (
    <div>
      <Link
        to={isStaff ? '/staff/loans' : '/borrower/loans'}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to loans
      </Link>

      <PageHeader
        eyebrow={loan.loan_no}
        title={borrowerName}
        subtitle={`${loan.loan_types?.name} · ${loan.term_months} month${loan.term_months === 1 ? '' : 's'} · ${loan.payment_frequency} installments`}
        actions={
          <>
            <StatusBadge status={loan.status} kind="loan" />
            {isStaff && loan.status === 'active' ? (
              <Button icon={CreditCard} onClick={openPayment}>Record payment</Button>
            ) : null}
          </>
        }
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Approved principal" value={formatMoney(loan.principal)} icon={Wallet} tone="brand" />
        <StatCard label="Total payable" value={formatMoney(loan.total_payable)} icon={FileText} tone="blue" />
        <StatCard label="Amount paid" value={formatMoney(loan.amount_paid)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Remaining balance" value={formatMoney(remaining)} icon={TrendingUp} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Repayment schedule"
              subtitle={`${paidCount} of ${schedules.length} installments fully paid`}
              icon={CalendarClock}
            />
            <div className="px-5 pt-4">
              <ProgressBar value={loan.amount_paid} max={loan.total_payable} />
              <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
                <span>{Math.round((Number(loan.amount_paid) / Number(loan.total_payable)) * 100)}% repaid</span>
                <span>Maturity {formatDate(loan.maturity_date)}</span>
              </div>
            </div>
            {schedules.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Schedule not generated yet"
                description="The repayment schedule is created automatically when the cash loan is disbursed."
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due date</th>
                      <th>Principal</th>
                      <th>Interest</th>
                      <th>Fee</th>
                      <th>Amount due</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((row) => (
                      <tr key={row.id}>
                        <td className="text-ink-500">{row.installment_no}</td>
                        <td className="whitespace-nowrap font-medium text-ink-900">{formatDate(row.due_date)}</td>
                        <td>{formatMoney(row.principal_due)}</td>
                        <td>{formatMoney(row.interest_due)}</td>
                        <td>{formatMoney(row.fee_due)}</td>
                        <td className="font-semibold text-ink-900">{formatMoney(row.amount_due)}</td>
                        <td className="text-emerald-700">{formatMoney(row.amount_paid)}</td>
                        <td>{formatMoney(Number(row.amount_due) - Number(row.amount_paid))}</td>
                        <td><StatusBadge status={row.status} kind="schedule" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Payment history"
              subtitle="Cash repayments received against this loan"
              icon={ReceiptText}
              actions={
                isStaff && loan.status === 'active' ? (
                  <Button size="sm" variant="outline" icon={CreditCard} onClick={openPayment}>
                    Record payment
                  </Button>
                ) : null
              }
            />
            {payments.length === 0 ? (
              <EmptyState icon={ReceiptText} title="No payments recorded" description="Payments received will appear here with printable receipts." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
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
                        <td className="whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                        <td className="font-semibold text-emerald-700">{formatMoney(payment.amount)}</td>
                        <td className="capitalize">{payment.method?.replace(/_/g, ' ')}</td>
                        <td className="text-xs">{payment.profiles?.full_name ?? '—'}</td>
                        <td>
                          <Button size="xs" variant="outline" icon={Printer} onClick={() => setReceipt(payment)}>
                            Receipt
                          </Button>
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
            <CardHeader title="Loan details" icon={FileText} />
            <div className="p-5">
              <DetailRow label="Borrower" value={borrowerName} />
              <DetailRow label="Borrower code" value={loan.borrowers?.borrower_code} />
              <DetailRow label="Loan type" value={loan.loan_types?.name} />
              <DetailRow label="Principal" value={formatMoney(loan.principal)} />
              <DetailRow label="Interest" value={`${formatMoney(loan.interest_amount)} (${formatPercent(loan.interest_rate)}/mo)`} />
              <DetailRow label="Processing fee" value={formatMoney(loan.processing_fee)} />
              <DetailRow label="Total payable" value={formatMoney(loan.total_payable)} />
              <DetailRow label="Term" value={`${loan.term_months} months · ${loan.payment_frequency}`} />
              <DetailRow label="First due date" value={formatDate(loan.first_due_date)} />
              <DetailRow label="Maturity date" value={formatDate(loan.maturity_date)} />
              <DetailRow label="Approved" value={loan.approved_at ? formatDateTime(loan.approved_at) : '—'} />
              <DetailRow label="Disbursed" value={loan.disbursed_at ? formatDateTime(loan.disbursed_at) : 'Not yet'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Cash disbursement" icon={Banknote} />
            {!disbursement ? (
              <p className="p-5 text-sm text-ink-500">
                No cash has been released for this loan yet. Disbursement is recorded by authorized personnel.
              </p>
            ) : (
              <div className="p-5">
                <DetailRow label="Amount released" value={<span className="font-bold text-brand-700">{formatMoney(disbursement.amount_released)}</span>} />
                <DetailRow label="Date" value={formatDate(disbursement.disbursement_date)} />
                <DetailRow label="Method" value={<span className="capitalize">{disbursement.method?.replace(/_/g, ' ')}</span>} />
                <DetailRow label="Reference" value={disbursement.reference_no || '—'} />
                <DetailRow label="Processed by" value={disbursement.profiles?.full_name || '—'} />
                {disbursement.notes ? (
                  <p className="mt-2 rounded-lg bg-ink-50 p-2.5 text-xs text-ink-600">{disbursement.notes}</p>
                ) : null}
              </div>
            )}
          </Card>

          {isStaff ? (
            <Card className="bg-ink-50/60 p-4">
              <p className="text-xs leading-relaxed text-ink-600">
                Payments are allocated to the oldest unpaid installments first. Every payment is audited and
                generates a numbered receipt. Duplicate disbursements are blocked at the database level.
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record a cash repayment"
        description={`Remaining balance: ${formatMoney(remaining)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button icon={CreditCard} loading={paying} onClick={submitPayment}>
              Save payment
            </Button>
          </>
        }
      >
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Amount received"
              type="number"
              min="0.01"
              max={remaining}
              step="0.01"
              prefix="₱"
              required
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
              hint={`Maximum ${formatMoney(remaining)}`}
            />
            <Input
              label="Payment date"
              type="date"
              max={todayISO()}
              required
              value={paymentForm.payment_date}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, payment_date: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Payment method"
              options={PAYMENT_METHODS}
              value={paymentForm.method}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
            />
            <Input
              label="Reference number"
              placeholder="Optional"
              value={paymentForm.reference}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, reference: event.target.value }))}
            />
          </div>
          <Textarea
            label="Notes"
            rows={2}
            placeholder="Optional remarks"
            value={paymentForm.notes}
            onChange={(event) => setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <Alert tone="info">
            The system will allocate this amount to the oldest unpaid installments and update the loan balance
            automatically.
          </Alert>
        </form>
      </Modal>

      {receipt ? <Receipt payment={receipt} loan={loan} onClose={() => setReceipt(null)} /> : null}
    </div>
  )
}
