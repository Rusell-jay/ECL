import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  MessageSquare,
  Send,
  Wallet,
  XCircle,
} from 'lucide-react'
import {
  Alert,
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
import { APPLICATION_FLOW, APPLICATION_STATUS } from '../../lib/constants'
import { formatDate, formatDateTime, formatMoney, formatPercent } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const FLOW_LABELS = {
  pending: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  for_agreement: 'For agreement',
  ready_for_disbursement: 'Ready for disbursement',
  active: 'Active',
  completed: 'Completed',
}

function Timeline({ status }) {
  const effective = status === 'additional_info_required' ? 'under_review' : status
  const currentIndex = APPLICATION_FLOW.indexOf(effective)
  return (
    <ol className="space-y-0">
      {APPLICATION_FLOW.map((step, index) => {
        const done = currentIndex >= index
        const current = currentIndex === index
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  done ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400'
                } ${current ? 'ring-4 ring-brand-100' : ''}`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
              </span>
              {index < APPLICATION_FLOW.length - 1 ? (
                <span className={`h-8 w-0.5 ${currentIndex > index ? 'bg-brand-400' : 'bg-ink-200'}`} />
              ) : null}
            </div>
            <div className="pb-3 pt-1">
              <p className={`text-sm ${done ? 'font-semibold text-ink-900' : 'font-medium text-ink-400'}`}>
                {FLOW_LABELS[step]}
              </p>
              {current ? <p className="text-[11px] text-brand-700">Current status</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function BorrowerApplicationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { borrower } = useAuth()
  const [application, setApplication] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [loan, setLoan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [actionState, setActionState] = useState({ saving: false, error: '', success: '' })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [appRes, approvalsRes, loanRes] = await Promise.all([
      supabase
        .from('loan_applications')
        .select('*, loan_types(name, description, interest_rate, processing_fee_rate, processing_fee_fixed)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('loan_approvals')
        .select('id, decision, remarks, created_at, profiles(full_name, role)')
        .eq('application_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('loans')
        .select('id, loan_no, status, amount_paid, total_payable, disbursed_at')
        .eq('application_id', id)
        .maybeSingle(),
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

  const latestInfoRequest = useMemo(
    () => approvals.find((item) => item.decision === 'additional_info'),
    [approvals],
  )

  const submitInfo = async (event) => {
    event.preventDefault()
    setActionState({ saving: true, error: '', success: '' })
    try {
      if (infoMessage.trim().length < 5) throw new Error('Please describe the requested information.')
      const { error: rpcError } = await supabase.rpc('submit_additional_info', {
        p_application_id: id,
        p_message: infoMessage.trim(),
      })
      if (rpcError) throw rpcError
      setInfoMessage('')
      setActionState({ saving: false, error: '', success: 'Information submitted. Your application is back under review.' })
      await load()
    } catch (err) {
      setActionState({ saving: false, error: err.message, success: '' })
    }
  }

  const cancelApplication = async () => {
    setActionState({ saving: true, error: '', success: '' })
    try {
      const { error: rpcError } = await supabase.rpc('cancel_application', {
        p_application_id: id,
        p_reason: cancelReason.trim() || null,
      })
      if (rpcError) throw rpcError
      setCancelOpen(false)
      setActionState({ saving: false, error: '', success: 'Your application has been cancelled.' })
      await load()
    } catch (err) {
      setActionState({ saving: false, error: err.message, success: '' })
    }
  }

  if (loading) return <PageLoader label="Loading application…" />
  if (!application) {
    return (
      <div>
        <PageHeader title="Application not found" subtitle="This application does not exist or you do not have access to it." />
        <Link to="/borrower/applications"><Button variant="outline" icon={ArrowLeft}>Back to applications</Button></Link>
      </div>
    )
  }

  const statusMeta = APPLICATION_STATUS[application.status] ?? { label: application.status, tone: 'slate' }
  const canCancel = ['pending', 'under_review', 'additional_info_required'].includes(application.status)
  const isRejected = application.status === 'rejected'
  const isCancelled = application.status === 'cancelled'

  return (
    <div>
      <Link to="/borrower/applications" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to applications
      </Link>

      <PageHeader
        eyebrow={application.application_no}
        title={formatMoney(application.requested_amount)}
        subtitle={`${application.loan_types?.name} · ${application.term_months} month${application.term_months === 1 ? '' : 's'} · ${application.payment_frequency} installments`}
        actions={<StatusBadge status={application.status} />}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {actionState.error ? <Alert tone="error" className="mb-4">{actionState.error}</Alert> : null}
      {actionState.success ? <Alert tone="success" className="mb-4">{actionState.success}</Alert> : null}

      {isRejected ? (
        <Alert tone="error" title="Application rejected" className="mb-4">
          {latestInfoRequest?.remarks || approvals.find((a) => a.decision === 'rejected')?.remarks || 'Please contact the lending office for more details.'}
        </Alert>
      ) : null}
      {isCancelled ? (
        <Alert tone="warning" title="Application cancelled" className="mb-4">
          This application was cancelled and can no longer be processed.
        </Alert>
      ) : null}

      {application.status === 'additional_info_required' ? (
        <Alert tone="warning" title="Additional information required" className="mb-4">
          {latestInfoRequest?.remarks || 'Please provide the information requested by our loan officer below.'}
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Loan summary" icon={FileText} />
            <div className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
              <DetailRow label="Application no." value={<span className="font-mono">{application.application_no}</span>} />
              <DetailRow label="Loan type" value={application.loan_types?.name} />
              <DetailRow label="Requested amount" value={formatMoney(application.requested_amount)} />
              <DetailRow label="Term" value={`${application.term_months} month${application.term_months === 1 ? '' : 's'}`} />
              <DetailRow label="Interest rate" value={`${formatPercent(application.interest_rate)} / month`} />
              <DetailRow label="Payment frequency" value={application.payment_frequency} />
              <DetailRow label="Interest amount" value={formatMoney(application.interest_amount)} />
              <DetailRow label="Processing fee" value={formatMoney(application.processing_fee)} />
              <DetailRow label="Total payable" value={<span className="font-bold text-brand-700">{formatMoney(application.total_payable)}</span>} />
              <DetailRow label="Estimated installment" value={formatMoney(application.estimated_installment)} />
              <DetailRow label="Submitted" value={formatDateTime(application.submitted_at)} />
              <DetailRow label="Decision date" value={application.decided_at ? formatDateTime(application.decided_at) : '—'} />
            </div>
            <div className="border-t border-ink-100 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Purpose</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{application.purpose}</p>
            </div>
          </Card>

          {application.status === 'additional_info_required' ? (
            <Card>
              <CardHeader title="Respond to the information request" icon={MessageSquare} />
              <form onSubmit={submitInfo} className="space-y-3 p-5">
                <Textarea
                  label="Your response"
                  rows={4}
                  placeholder="Provide the requested details or clarify your application…"
                  value={infoMessage}
                  onChange={(event) => setInfoMessage(event.target.value)}
                  required
                />
                <div className="flex justify-end">
                  <Button type="submit" icon={Send} loading={actionState.saving}>
                    Submit information
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Evaluation history" subtitle="Remarks recorded by authorized personnel" icon={MessageSquare} />
            {approvals.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No evaluation has been recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {approvals.map((item) => (
                  <li key={item.id} className="flex gap-3 p-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                      <Clock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-ink-900">
                        {item.decision.replace(/_/g, ' ')}
                      </p>
                      {item.remarks ? <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{item.remarks}</p> : null}
                      <p className="mt-1 text-[11px] text-ink-400">
                        {item.profiles?.full_name ?? 'Loan officer'} · {formatDateTime(item.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Application progress" icon={CalendarClock} />
            <div className="p-5">
              {isRejected || isCancelled ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{statusMeta.label}. This application is no longer in the approval flow.</span>
                </div>
              ) : (
                <Timeline status={application.status} />
              )}
            </div>
          </Card>

          {loan ? (
            <Card className="border-brand-200">
              <CardHeader title="Cash loan created" icon={Wallet} />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">Loan no.</span>
                  <span className="font-mono text-xs font-semibold text-ink-900">{loan.loan_no}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">Status</span>
                  <StatusBadge status={loan.status} kind="loan" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">Disbursed</span>
                  <span className="text-sm font-medium text-ink-900">{loan.disbursed_at ? formatDate(loan.disbursed_at) : 'Pending'}</span>
                </div>
                <Link to={`/loans/${loan.id}`} className="block">
                  <Button className="w-full" icon={Wallet}>View loan & schedule</Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {canCancel ? (
            <Card>
              <CardHeader title="Need to cancel?" />
              <div className="p-5">
                <p className="text-xs leading-relaxed text-ink-500">
                  You can withdraw this application while it is still pending or under review. This action
                  cannot be undone.
                </p>
                <Button variant="danger" className="mt-3 w-full" onClick={() => setCancelOpen(true)}>
                  Cancel application
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="bg-ink-50/60 p-4">
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-ink-600">
                Only authorized loan officers and administrators can approve or reject applications. Status
                updates are recorded in the audit trail.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this application?"
        description="This cannot be undone. You may submit a new application later."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep application</Button>
            <Button variant="danger" loading={actionState.saving} onClick={cancelApplication}>
              Yes, cancel it
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason (optional)"
          rows={3}
          placeholder="Tell us why you are cancelling…"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
    </div>
  )
}
