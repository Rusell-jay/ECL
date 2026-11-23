import { useEffect, useState } from 'react'
import { Pencil, Plus, Power, SlidersHorizontal } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Textarea,
} from '../../components/ui'
import { PAYMENT_FREQUENCIES } from '../../lib/constants'
import { formatMoney, formatPercent } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const EMPTY = {
  code: '',
  name: '',
  description: '',
  min_amount: '',
  max_amount: '',
  interest_rate: '',
  processing_fee_rate: '',
  processing_fee_fixed: '0',
  payment_frequency: 'monthly',
  term_options: '1,3,6,12',
  min_term_months: '1',
  max_term_months: '12',
  requires_documents: false,
  is_active: true,
}

export default function LoanTypes() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('loan_types').select('*').order('min_amount')
    if (loadError) setError(loadError.message)
    setTypes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (type) => {
    setEditing(type)
    setForm({
      code: type.code,
      name: type.name,
      description: type.description ?? '',
      min_amount: String(type.min_amount),
      max_amount: String(type.max_amount),
      interest_rate: String(type.interest_rate),
      processing_fee_rate: String(type.processing_fee_rate),
      processing_fee_fixed: String(type.processing_fee_fixed),
      payment_frequency: type.payment_frequency,
      term_options: (type.term_options ?? []).join(', '),
      min_term_months: String(type.min_term_months),
      max_term_months: String(type.max_term_months),
      requires_documents: type.requires_documents,
      is_active: type.is_active,
    })
    setFormError('')
    setModalOpen(true)
  }

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (event) => {
    event.preventDefault()
    setFormError('')
    const min = Number(form.min_amount)
    const max = Number(form.max_amount)
    const rate = Number(form.interest_rate)
    const feeRate = Number(form.processing_fee_rate)
    const feeFixed = Number(form.processing_fee_fixed || 0)
    const terms = form.term_options
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)

    if (!form.code.trim() || !form.name.trim()) return setFormError('Code and name are required.')
    if (!min || !max || min <= 0 || max < min) return setFormError('Enter a valid amount range.')
    if (Number.isNaN(rate) || rate < 0) return setFormError('Interest rate must be zero or greater.')
    if (Number.isNaN(feeRate) || feeRate < 0 || Number.isNaN(feeFixed) || feeFixed < 0)
      return setFormError('Processing fees must be zero or greater.')
    if (terms.length === 0) return setFormError('Provide at least one repayment term (in months).')
    if (Number(form.min_term_months) < 1 || Number(form.max_term_months) < Number(form.min_term_months))
      return setFormError('Enter a valid term range.')

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      min_amount: min,
      max_amount: max,
      interest_rate: rate,
      processing_fee_rate: feeRate,
      processing_fee_fixed: feeFixed,
      payment_frequency: form.payment_frequency,
      term_options: [...new Set(terms)].sort((a, b) => a - b),
      min_term_months: Number(form.min_term_months),
      max_term_months: Number(form.max_term_months),
      requires_documents: form.requires_documents,
      is_active: form.is_active,
    }

    setSaving(true)
    try {
      if (editing) {
        const { error: updateError } = await supabase.from('loan_types').update(payload).eq('id', editing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('loan_types').insert(payload)
        if (insertError) throw insertError
      }
      setModalOpen(false)
      setFeedback({ tone: 'success', message: `Loan type ${editing ? 'updated' : 'created'} successfully.` })
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (type) => {
    setFeedback(null)
    const { error: updateError } = await supabase
      .from('loan_types')
      .update({ is_active: !type.is_active })
      .eq('id', type.id)
    if (updateError) setFeedback({ tone: 'error', message: updateError.message })
    else {
      setFeedback({ tone: 'success', message: `${type.name} is now ${type.is_active ? 'inactive' : 'active'}.` })
      await load()
    }
  }

  if (loading) return <PageLoader label="Loading loan types…" />

  return (
    <div>
      <PageHeader
        title="Loan types & pricing"
        subtitle="Configure the cash loan products, interest rates, fees and repayment terms offered to borrowers."
        actions={<Button icon={Plus} onClick={openCreate}>New loan type</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4" onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <Alert tone="info" className="mb-4">
        Existing applications and loans keep the rates and fees captured when they were submitted. Editing a
        loan type only affects future applications.
      </Alert>

      <Card>
        {types.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No loan types configured"
            description="Create your first cash loan product so borrowers can apply."
            action={<Button size="sm" icon={Plus} onClick={openCreate}>Create loan type</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Loan type</th>
                  <th>Amount range</th>
                  <th>Interest</th>
                  <th>Processing fee</th>
                  <th>Frequency</th>
                  <th>Terms</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{type.name}</p>
                      <p className="font-mono text-[11px] text-ink-500">{type.code}</p>
                      {type.description ? <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-ink-500">{type.description}</p> : null}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {formatMoney(type.min_amount)} – {formatMoney(type.max_amount)}
                    </td>
                    <td className="font-medium text-brand-700">{formatPercent(type.interest_rate)}/mo</td>
                    <td className="text-xs">
                      {formatPercent(type.processing_fee_rate)}
                      {Number(type.processing_fee_fixed) > 0 ? ` + ${formatMoney(type.processing_fee_fixed)}` : ''}
                    </td>
                    <td className="capitalize text-xs">{type.payment_frequency}</td>
                    <td className="text-xs">{(type.term_options ?? []).map((term) => `${term}mo`).join(', ')}</td>
                    <td>
                      <Badge tone={type.is_active ? 'emerald' : 'gray'}>{type.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="outline" icon={Pencil} onClick={() => openEdit(type)}>Edit</Button>
                        <Button
                          size="xs"
                          variant={type.is_active ? 'ghost' : 'subtle'}
                          icon={Power}
                          onClick={() => toggleActive(type)}
                        >
                          {type.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New cash loan type'}
        description="All amounts are in Philippine pesos. Interest is simple interest per month."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={save}>Save loan type</Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" required value={form.name} onChange={update('name')} />
            <Input label="Code" required value={form.code} onChange={update('code')} hint="Short unique code, e.g. QCK" />
          </div>
          <Textarea label="Description" rows={2} value={form.description} onChange={update('description')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Minimum amount" type="number" min="0" step="0.01" prefix="₱" required value={form.min_amount} onChange={update('min_amount')} />
            <Input label="Maximum amount" type="number" min="0" step="0.01" prefix="₱" required value={form.max_amount} onChange={update('max_amount')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Interest rate (% / month)" type="number" min="0" step="0.001" required value={form.interest_rate} onChange={update('interest_rate')} />
            <Input label="Processing fee (%)" type="number" min="0" step="0.001" value={form.processing_fee_rate} onChange={update('processing_fee_rate')} />
            <Input label="Fixed fee" type="number" min="0" step="0.01" prefix="₱" value={form.processing_fee_fixed} onChange={update('processing_fee_fixed')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Payment frequency" options={PAYMENT_FREQUENCIES} value={form.payment_frequency} onChange={update('payment_frequency')} />
            <Input label="Minimum term (months)" type="number" min="1" required value={form.min_term_months} onChange={update('min_term_months')} />
            <Input label="Maximum term (months)" type="number" min="1" required value={form.max_term_months} onChange={update('max_term_months')} />
          </div>
          <Input
            label="Available terms (months)"
            required
            value={form.term_options}
            onChange={update('term_options')}
            hint="Comma-separated, e.g. 1, 3, 6, 12"
          />
          <div className="flex flex-wrap gap-5 rounded-lg border border-ink-200 p-3">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.requires_documents}
                onChange={update('requires_documents')}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Requires supporting documents
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={update('is_active')}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Available to borrowers
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
