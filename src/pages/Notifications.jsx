import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDateTime, cn } from '../lib/format'
import { supabase } from '../lib/supabase'

const TYPE_STYLES = {
  info: 'border-blue-200 bg-blue-50/50',
  success: 'border-emerald-200 bg-emerald-50/50',
  warning: 'border-amber-200 bg-amber-50/50',
  error: 'border-rose-200 bg-rose-50/50',
}

export default function Notifications() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!user?.id) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (loadError) setError(loadError.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const markRead = async (item) => {
    if (item.is_read) return
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
    await supabase.from('notifications').update({ is_read: true }).eq('id', item.id)
  }

  const markAll = async () => {
    setBusy(true)
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    await load()
    setBusy(false)
  }

  const remove = async (item) => {
    setItems((prev) => prev.filter((row) => row.id !== item.id))
    await supabase.from('notifications').delete().eq('id', item.id)
  }

  const unread = items.filter((item) => !item.is_read).length

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You are all caught up.'}
        actions={
          <Button variant="outline" icon={CheckCheck} onClick={markAll} disabled={busy || unread === 0}>
            Mark all as read
          </Button>
        }
      />

      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      {loading ? (
        <PageLoader label="Loading notifications…" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Updates about your applications, approvals, disbursements and repayments will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const content = (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm', item.is_read ? 'font-medium text-ink-700' : 'font-bold text-ink-950')}>
                    {item.title}
                  </p>
                  {!item.is_read ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> : null}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{item.message}</p>
                <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(item.created_at)}</p>
              </div>
            )

            return (
              <Card
                key={item.id}
                className={cn('flex items-start gap-3 p-4 transition-colors', !item.is_read && TYPE_STYLES[item.type])}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-ink-200">
                  <Bell className="h-4 w-4" />
                </span>
                {item.link ? (
                  <Link to={item.link} onClick={() => markRead(item)} className="min-w-0 flex-1">
                    {content}
                  </Link>
                ) : (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => markRead(item)}>
                    {content}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
                  aria-label="Delete notification"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
