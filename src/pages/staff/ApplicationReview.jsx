import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Briefcase,
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DetailRow,
  Modal,
  PageHeader,
  PageLoader,
  StatusBadge,
  Textarea,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { APPLICATION_STATUS } from '../../lib/constants'
import { formatDate, formatDateTime, formatMoney, formatPercent, fullName } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const DECISION_COPY = {
  approved: {
    title: 'Approve this application?',
    description: 'A cash loan record will be created. The borrower will be notified and the decision is audited.',
    confirm: 'Approve application',
    variant: 'success',
  },
  rejected: {
    title: 'Reject this application?',
    description: 'The borrower will be notified. Provide clear remarks explaining the rejection.',
    confirm: 'Reject application',
    variant: 'danger',
  },
  additional_info: {
    title: 'Request additional information?',
    description: 'The borrower will be asked to respond before evaluation continues.',
    confirm: 'Request information',
    variant: 'primary',
  },
}

export default function ApplicationReview() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [application, setApplication] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [loan, setLoan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [decision, setDecision] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [appRes, approvalsRes, loanRes] = await Promise.all([
      supabase
        .from('loan_applications')
        .select('*, loan_types(*), borrowers(*, profiles(email, phone))')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('loan_approvals')
        .select('id, decision, remarks, created_at, profiles(full_name, role)')
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('loans').select('id, loan_no, status, total_payable, amount_paid').eq('application_id', id).maybeSingle(),
    ])
    if (appRes.error) setError(appRes.error.message)
    setApplication(appRes.data ?? null)
    setApprovals(approvalsRes.data ?? [])
    setLoan(loanRes.data ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const advance = async (status) => {
    setSaving(true)
    setFeedback(null)
    try {
      const { error: rpcError } = await supabase.rpc('advance_application', {
        p_application_id: id,
        p_status: status,
        p_remarks: remarks.trim() || null,
      })
      if (rpcError) throw rpcError
      setFeedback({ tone: 'success', message: `Application moved to ${status.replace(/_/g, ' ')}.` })
      setRemarks('')
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const submitDecision = async () => {
    if (!decision) return
    if ((decision === 'rejected' || decision === 'additional_info') && remarks.trim().length < 5) {
      setFeedback({ tone: 'error', message: 'Please provide remarks (at least 5 characters) for this decision.' })
      setDecision(null)
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const { error: rpcError } = await supabase.rpc('decide_application', {
        p_application_id: id,
        p_decision: decision,
        p_remarks: remarks.trim() || null,
      })
      if (rpcError) throw rpcError
      setDecision(null)
      setRemarks('')
      setFeedback({
        tone: 'success',
        message:
          decision === 'approved'
            ? 'Application approved and a cash loan record was created.'
            : decision === 'rejected'
              ? 'Application rejected. The borrower has been notified.'
              : 'Additional information requested from the borrower.',
      })
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading application…" />
  if (!application) {
    return (
      <div>
        <PageHeader title="Application not found" subtitle="It may have been removed or you do not have access." />
        <Link to="/staff/applications"><Button variant="outline" icon={ArrowLeft}>Back to applications</Button></Link>
      </div>
    )
  }

  const borrower = application.borrowers
  const type = application.loan_types
  const statusMeta = APPLICATION_STATUS[application.status] ?? { label: application.status, tone: 'slate' }
  const canDecide = ['pending', 'under_review', 'additional_info_required'].includes(application.status)
  const affordability =
    borrower?.monthly_income > 0
      ? (Number(application.estimated_installment) / Number(borrower.monthly_income)) * 100
      : null

  return (
    <div>
      <Link to="/staff/applications" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to applications
      </Link>

      <PageHeader
        eyebrow={application.application_no}
        title={`${fullName(borrower)} · ${formatMoney(application.requested_amount)}`}
        subtitle={`${type?.name} · ${application.term_months} month${application.term_months === 1 ? '' : 's'} · ${application.payment_frequency} · submitted ${formatDate(application.submitted_at)}`}
        actions={<StatusBadge status={application.status} />}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      {application.status === 'additional_info_required' ? (
        <Alert tone="warning" title="Waiting on the borrower" className="mb-4">
          The borrower has been asked for additional information. You can still record a decision once the
          information is available.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Borrower information" icon={User} subtitle="Personal, employment and contact details" />
            <div className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
              <DetailRow label="Full name" value={fullName(borrower)} />
              <DetailRow label="Borrower code" value={borrower?.borrower_code} />
              <DetailRow label="Email" value={borrower?.profiles?.email ?? borrower?.email} />
              <DetailRow label="Contact" value={borrower?.contact_number} />
              <DetailRow label="Date of birth" value={formatDate(borrower?.date_of_birth)} />
              <DetailRow label="Status" value={<Badge tone={borrower?.status === 'active' ? 'emerald' : 'rose'}>{borrower?.status}</Badge>} />
              <DetailRow label="Address" value={[borrower?.address, borrower?.city, borrower?.province, borrower?.postal_code].filter(Boolean).join(', ')} />
              <DetailRow label="Emergency contact" value={`${borrower?.emergency_contact_name ?? '—'} (${borrower?.emergency_contact_relationship ?? 'contact'})`} />
              <DetailRow label="Emergency number" value={borrower?.emergency_contact_number} />
            </div>
            <div className="border-t border-ink-100 p-5">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <Briefcase className="h-3.5 w-3.5" /> Employment & financial capacity
              </p>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <DetailRow label="Employment" value={<span className="capitalize">{borrower?.employment_status?.replace(/_/g, ' ')}</span>} />
                <DetailRow label="Occupation" value={borrower?.occupation} />
                <DetailRow label="Employer / business" value={borrower?.employer_name || '—'} />
                <DetailRow label="Monthly income" value={formatMoney(borrower?.monthly_income)} />
                <DetailRow label="Estimated installment" value={formatMoney(application.estimated_installment)} />
                <DetailRow
                  label="Installment / income"
                  value={
                    affordability === null ? '—' : (
                      <span className={affordability > 40 ? 'text-rose-600' : affordability > 25 ? 'text-amber-600' : 'text-emerald-700'}>
                        {affordability.toFixed(1)}%
                      </span>
                    )
                  }
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Application details" icon={FileText} />
            <div className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
              <DetailRow label="Loan type" value={type?.name} />
              <DetailRow label="Payment frequency" value={<span className="capitalize">{application.payment_frequency}</span>} />
              <DetailRow label="Requested amount" value={formatMoney(application.requested_amount)} />
              <DetailRow label="Term" value={`${application.term_months} month${application.term_months === 1 ? '' : 's'}`} />
              <DetailRow label="Interest rate" value={`${formatPercent(application.interest_rate)} / month`} />
              <DetailRow label="Interest amount" value={formatMoney(application.interest_amount)} />
              <DetailRow label="Processing fee" value={formatMoney(application.processing_fee)} />
              <DetailRow label="Total payable" value={<span className="font-bold text-brand-700">{formatMoney(application.total_payable)}</span>} />
            </div>
            <div className="border-t border-ink-100 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Purpose of the loan</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{application.purpose}</p>
              {application.borrower_message ? (
                <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Borrower's additional information</p>
                  <p className="mt-1 leading-relaxed">{application.borrower_message}</p>
                </div>
              ) : null}
            </div>
            {type?.requires_documents ? (
              <div className="border-t border-ink-100 p-5">
                <Alert tone="warning" title="Supporting documents required">
                  This loan type requires document verification. Confirm the borrower's income or business
                  documents before approving. Document verification is recorded in your remarks.
                </Alert>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Evaluation trail" subtitle="All decisions and status changes" icon={MessageSquare} />
            {approvals.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No evaluation activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {approvals.map((item) => (
                  <li key={item.id} className="flex gap-3 p-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold capitalize text-ink-900">{item.decision.replace(/_/g, ' ')}</p>
                      {item.remarks ? <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{item.remarks}</p> : null}
                      <p className="mt-1 text-[11px] text-ink-400">
                        {item.profiles?.full_name ?? 'Staff'} · {formatDateTime(item.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="xl:sticky xl:top-24">
            <CardHeader title="Evaluation & decision" icon={ShieldCheck} subtitle={`Signed in as ${profile?.full_name ?? 'staff'}`} />
            <div className="space-y-3 p-5">
              {canDecide ? (
                <>
                  {application.status !== 'under_review' ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      icon={FileText}
                      loading={saving}
                      onClick={() => advance('under_review')}
                    >
                      Mark as under review
                    </Button>
                  ) : null}

                  <Textarea
                    label="Evaluation remarks"
                    rows={4}
                    placeholder="Record income verification, document checks and the reason for your decision…"
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                  />

                  <div className="space-y-2">
                    <Button
                      variant="success"
                      icon={CheckCircle2}
                      className="w-full"
                      onClick={() => setDecision('approved')}
                    >
                      Approve application
                    </Button>
                    <Button
                      variant="danger"
                      icon={XCircle}
                      className="w-full"
                      onClick={() => setDecision('rejected')}
                    >
                      Reject application
                    </Button>
                    <Button
                      variant="outline"
                      icon={Send}
                      className="w-full"
                      onClick={() => setDecision('additional_info')}
                    >
                      Request additional information
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-400">
                    Remarks are required when rejecting or requesting information. All decisions are recorded in
                    the audit trail with your name and timestamp.
                  </p>
                </>
              ) : null}

              {application.status === 'approved' ? (
                <>
                  <Alert tone="success" title="Approved">
                    Move this application to the agreement stage so the borrower can review the loan terms.
                  </Alert>
                  <Button className="w-full" icon={ArrowRight} loading={saving} onClick={() => advance('for_agreement')}>
                    Move to For Agreement
                  </Button>
                </>
              ) : null}

              {application.status === 'for_agreement' ? (
                <>
                  <Alert tone="info" title="For agreement">
                    Confirm the borrower has agreed to the loan terms before marking it ready for cash
                    disbursement.
                  </Alert>
                  <Button className="w-full" icon={Banknote} loading={saving} onClick={() => advance('ready_for_disbursement')}>
                    Mark ready for disbursement
                  </Button>
                </>
              ) : null}

              {application.status === 'ready_for_disbursement' ? (
                <>
                  <Alert tone="info" title="Ready for cash release">
                    Record the actual cash disbursement from the disbursement module.
                  </Alert>
                  <Link to="/staff/disbursements">
                    <Button className="w-full" icon={Banknote}>Go to disbursements</Button>
                  </Link>
                </>
              ) : null}

              {['active', 'completed'].includes(application.status) && loan ? (
                <>
                  <Alert tone="success" title="Cash loan active">
                    This application has been disbursed and is now a live cash loan.
                  </Alert>
                  <Link to={`/loans/${loan.id}`}>
                    <Button className="w-full" icon={Banknote}>View loan & repayments</Button>
                  </Link>
                </>
              ) : null}

              {['rejected', 'cancelled'].includes(application.status) ? (
                <Alert tone={application.status === 'rejected' ? 'error' : 'warning'} title={statusMeta.label}>
                  This application is closed. No further evaluation actions are available.
                </Alert>
              ) : null}

              {loan ? (
                <div className="rounded-lg border border-ink-200 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">Loan record</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-ink-900">{loan.loan_no}</span>
                    <StatusBadge status={loan.status} kind="loan" />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="bg-ink-50/60 p-4">
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-ink-600">
                Only authorized loan officers and administrators can approve or reject applications. Decisions
                cannot be made automatically by the system.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision ? DECISION_COPY[decision].title : ''}
        description={decision ? DECISION_COPY[decision].description : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              variant={decision ? DECISION_COPY[decision].variant : 'primary'}
              loading={saving}
              onClick={submitDecision}
            >
              {decision ? DECISION_COPY[decision].confirm : 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-ink-50 p-3 text-sm">
            <p className="font-semibold text-ink-900">{fullName(borrower)}</p>
            <p className="text-xs text-ink-500">
              {application.application_no} · {formatMoney(application.requested_amount)} · {application.term_months} months
            </p>
          </div>
          <Textarea
            label="Remarks"
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder={
              decision === 'approved'
                ? 'e.g. Income verified, capacity sufficient.'
                : 'Explain the reason for this decision…'
            }
            required={decision === 'rejected' || decision === 'additional_info'}
          />
        </div>
      </Modal>
    </div>
  )
}
