import { useEffect, useMemo, useState } from 'react'
import { Download, ScrollText, ShieldCheck } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  SearchInput,
  Select,
} from '../../components/ui'
import { ROLE_LABELS } from '../../lib/constants'
import { downloadCsv, formatDateTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { value: 'all', label: 'All activities' },
  { value: 'application', label: 'Applications' },
  { value: 'loan', label: 'Loans & disbursements' },
  { value: 'payment', label: 'Payments' },
  { value: 'staff', label: 'Staff administration' },
]

function actionTone(action = '') {
  if (action.startsWith('payment')) return 'emerald'
  if (action.startsWith('loan')) return 'brand'
  if (action.startsWith('application')) return 'blue'
  if (action.startsWith('staff')) return 'violet'
  return 'slate'
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [range, setRange] = useState({ from: '', to: '' })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('audit_logs')
        .select('*, profiles(full_name, role)')
        .order('created_at', { ascending: false })
        .limit(500)
      if (loadError) setError(loadError.message)
      setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return logs.filter((log) => {
      if (category !== 'all' && !log.action?.startsWith(category)) return false
      if (range.from && log.created_at?.slice(0, 10) < range.from) return false
      if (range.to && log.created_at?.slice(0, 10) > range.to) return false
      if (!term) return true
      return (
        log.action?.toLowerCase().includes(term) ||
        log.entity?.toLowerCase().includes(term) ||
        log.entity_id?.toLowerCase().includes(term) ||
        log.profiles?.full_name?.toLowerCase().includes(term) ||
        JSON.stringify(log.details ?? {}).toLowerCase().includes(term)
      )
    })
  }, [logs, search, category, range])

  const exportCsv = () => {
    downloadCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, filtered, [
      { label: 'Timestamp', value: (row) => row.created_at },
      { label: 'Actor', value: (row) => row.profiles?.full_name ?? '' },
      { label: 'Actor role', value: (row) => row.profiles?.role ?? row.actor_role ?? '' },
      { label: 'Action', value: (row) => row.action },
      { label: 'Entity', value: (row) => row.entity },
      { label: 'Entity ID', value: (row) => row.entity_id },
      { label: 'Details', value: (row) => JSON.stringify(row.details ?? {}) },
    ])
  }

  if (loading) return <PageLoader label="Loading audit trail…" />

  return (
    <div>
      <PageHeader
        title="Audit logs"
        subtitle="Immutable record of financial decisions, disbursements, collections and account changes."
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>}
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      <Alert tone="info" className="mb-4" title="Append-only activity trail">
        Log entries are written by secured database functions and cannot be edited or deleted from the
        application.
      </Alert>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="From"
              type="date"
              value={range.from}
              onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
              className="w-40"
            />
            <Input
              label="To"
              type="date"
              value={range.to}
              onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
              className="w-40"
            />
            <Select
              label="Activity"
              options={CATEGORIES}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-52"
            />
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search action, actor or details" className="xl:w-80" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries found" description="Important system and financial activities will be recorded here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(log.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-xs font-medium text-ink-900">{log.profiles?.full_name ?? 'System'}</p>
                          <p className="text-[10px] text-ink-500">
                            {ROLE_LABELS[log.profiles?.role] ?? log.actor_role ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={actionTone(log.action)}>{log.action}</Badge></td>
                    <td>
                      <p className="text-xs font-medium text-ink-800">{log.entity}</p>
                      <p className="max-w-[140px] truncate font-mono text-[10px] text-ink-400">{log.entity_id}</p>
                    </td>
                    <td>
                      <details className="group">
                        <summary className="cursor-pointer list-none text-xs font-semibold text-brand-700 hover:underline">
                          View details
                        </summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-ink-50 p-2 text-[10px] leading-relaxed text-ink-600">
                          {JSON.stringify(log.details ?? {}, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-[11px] text-ink-500">
          Showing {filtered.length} of the latest {logs.length} entries (maximum 500 loaded).
        </div>
      </Card>
    </div>
  )
}
