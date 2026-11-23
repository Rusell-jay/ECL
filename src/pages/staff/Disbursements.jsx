import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, CalendarClock, CheckCircle2, ShieldCheck } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from '../../components/ui'
import { DISBURSEMENT_METHODS } from '../../lib/constants'
import { formatDate, formatMoney, fullName, todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function Disbursements() {
  const [readyLoans, setReadyLoans] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    amount_released: '',
    disbursement_date: todayISO(),
    method: 'cash',
    reference: '',
    notes: '',
  })

  const load = async () => {
    setLoading(true)
    const [readyRes, historyRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, borrowers(first_name, middle_name, last_name, borrower_code, contact_number), loan_types(name), loan_applications(application_no)')
        .eq('status', 'ready_for_disbursement')
        .order('approved_at'),
      supabase
        .from('loan_disbursements')
        .select('*, profiles(full_name), loans(id, loan_no, principal, total_payable, borrowers(first_name, last_name))')
        .order('disbursement_date', { ascending: false })
        .limit(50),
    ])
    if (readyRes.error) setError(readyRes.error.message)
    if (historyRes.error) setError(historyRes.error.message)
    setReadyLoans(readyRes.data ?? [])
    setHistory(historyRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7)
    return {
      ready: readyLoans.length,
      readyAmount: readyLoans.reduce((sum, loan) => sum + Number(loan.principal), 0),
      released: history.reduce((sum, row) => sum + Number(row.amount_released), 0),
      releasedMonth: history
        .filter((row) => row.disbursement_date?.slice(0, 7) === month)
        .reduce((sum, row) => sum + Number(row.amount_released), 0),
    }
  }, [readyLoans, history])

  const openModal = (loan) => {
    setSelected(loan)
    setForm({
      amount_released: Number(loan.principal).toFixed(2),
      disbursement_date: todayISO(),
      method: 'cash',
      reference: '',
      notes: '',
    })
    setFeedback(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!selected) return
    setFeedback(null)
    const amount = Number(form.amount_released)
    if (!amount || amount <= 0) {
      setFeedback({ tone: 'error', message: 'Enter the amount of cash released.' })
      return
    }
    if (amount > Number(selected.principal)) {
      setFeedback({ tone: 'error', message: 'Amount released cannot exceed the approved principal.' })
      return
    }
    if (!form.disbursement_date || form.disbursement_date > todayISO()) {
      setFeedback({ tone: 'error', message: 'Enter a valid disbursement date (not in the future).' })
      return
    }

    setSaving(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('disburse_loan', {
        p_loan_id: selected.id,
        p_amount_released: amount,
        p_method: form.method,
        p_reference: form.reference.trim() || null,
        p_notes: form.notes.trim() || null,
        p_disbursement_date: form.disbursement_date,
      })
      if (rpcError) throw rpcError
      setSelected(null)
      setFeedback({
        tone: 'success',
        message: `Cash disbursement recorded for ${data.loan_no}. The repayment schedule has been generated and the loan is now active.`,
      })
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading disbursements…" />

  return (
    <div>
      <PageHeader
        title="Cash disbursements"
        subtitle="Release approved cash loans and maintain a complete disbursement history."
        actions={<StatusBadge status="ready_for_disbursement" kind="loan" />}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready for release" value={totals.ready} hint="Loans awaiting cash release" icon={Banknote} tone="cyan" />
        <StatCard label="Pending release value" value={formatMoney(totals.readyAmount)} icon={CalendarClock} tone="amber" />
        <StatCard label="Total cash released" value={formatMoney(totals.released)} hint="Recorded disbursements" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Released this month" value={formatMoney(totals.releasedMonth)} icon={Banknote} tone="brand" />
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader
            title="Approved loans ready for disbursement"
            subtitle="Only loans marked ready by an authorized officer can be released."
            icon={Banknote}
          />
          {readyLoans.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No loans waiting for release"
              description="Approved applications move here after the agreement stage is completed."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Loan</th>
                    <th>Borrower</th>
                    <th>Approved amount</th>
                    <th>Total payable</th>
                    <th>Terms</th>
                    <th>Approved</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {readyLoans.map((loan) => (
                    <tr key={loan.id}>
                      <td>
                        <p className="font-mono text-xs font-semibold text-ink-900">{loan.loan_no}</p>
                        <p className="text-[11px] text-ink-500">{loan.loan_applications?.application_no}</p>
                      </td>
                      <td>
                        <p className="font-medium text-ink-900">{fullName(loan.borrowers)}</p>
                        <p className="text-[11px] text-ink-500">{loan.borrowers?.contact_number}</p>
                      </td>
                      <td className="font-semibold text-ink-900">{formatMoney(loan.principal)}</td>
                      <td>{formatMoney(loan.total_payable)}</td>
                      <td className="whitespace-nowrap text-xs">{loan.term_months} mo · {loan.payment_frequency}</td>
                      <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(loan.approved_at)}</td>
                      <td>
                        <Button size="sm" icon={Banknote} onClick={() => openModal(loan)}>
                          Record release
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Disbursement history" subtitle="Cash actually released to borrowers" icon={ShieldCheck} />
          {history.length === 0 ? (
            <EmptyState icon={Banknote} title="No disbursements yet" description="Recorded cash releases will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Loan</th>
                    <th>Borrower</th>
                    <th>Amount released</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Processed by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-xs font-medium text-ink-900">{formatDate(row.disbursement_date)}</td>
                      <td className="font-mono text-xs">{row.loans?.loan_no}</td>
                      <td className="font-medium text-ink-800">{fullName(row.loans?.borrowers)}</td>
                      <td className="font-semibold text-brand-700">{formatMoney(row.amount_released)}</td>
                      <td className="capitalize text-xs">{row.method?.replace(/_/g, ' ')}</td>
                      <td className="text-xs text-ink-500">{row.reference_no || '—'}</td>
                      <td className="text-xs">{row.profiles?.full_name ?? '—'}</td>
                      <td>
                        {row.loans ? (
                          <Link to={`/loans/${row.loans.id}`}>
                            <Button size="xs" variant="outline">Open <ArrowRight className="h-3 w-3" /></Button>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Record cash disbursement"
        description={selected ? `${selected.loan_no} · ${fullName(selected.borrowers)}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button icon={Banknote} loading={saving} onClick={submit}>Confirm release</Button>
          </>
        }
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            {feedback?.tone === 'error' ? <Alert tone="error">{feedback.message}</Alert> : null}

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Approved principal</p>
                <p className="font-semibold text-ink-900">{formatMoney(selected.principal)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Total payable</p>
                <p className="font-semibold text-ink-900">{formatMoney(selected.total_payable)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Term</p>
                <p className="font-semibold text-ink-900">{selected.term_months} months · {selected.payment_frequency}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Borrower contact</p>
                <p className="font-semibold text-ink-900">{selected.borrowers?.contact_number}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Actual amount released"
                type="number"
                min="0.01"
                max={selected.principal}
                step="0.01"
                prefix="₱"
                required
                value={form.amount_released}
                onChange={(event) => setForm((prev) => ({ ...prev, amount_released: event.target.value }))}
                hint={`Cannot exceed ${formatMoney(selected.principal)}`}
              />
              <Input
                label="Disbursement date"
                type="date"
                max={todayISO()}
                required
                value={form.disbursement_date}
                onChange={(event) => setForm((prev) => ({ ...prev, disbursement_date: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Disbursement method"
                options={DISBURSEMENT_METHODS}
                value={form.method}
                onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
              />
              <Input
                label="Transaction reference"
                placeholder="Optional"
                value={form.reference}
                onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
              />
            </div>
            <Textarea
              label="Notes"
              rows={2}
              placeholder="Optional remarks for the release"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <Alert tone="warning" title="Before confirming">
              Confirm the borrower's identity and that the cash amount is correct. A loan can only be disbursed
              once, and the repayment schedule will be generated immediately.
            </Alert>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
