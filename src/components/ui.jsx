import { useEffect, useId, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { APPLICATION_STATUS, LOAN_STATUS, SCHEDULE_STATUS } from '../lib/constants'
import { cn } from '../lib/format'

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */
const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500',
  secondary: 'bg-ink-900 text-white shadow-sm hover:bg-ink-800 focus-visible:ring-ink-700',
  outline: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 focus-visible:ring-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-ink-300',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:ring-brand-300',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-400',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-400',
}

const BUTTON_SIZES = {
  xs: 'h-8 gap-1.5 px-2.5 text-xs',
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

export function IconButton({ label, icon: Icon, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Form fields                                                               */
/* -------------------------------------------------------------------------- */
export function Field({ label, htmlFor, error, hint, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500'

export function Input({ label, error, hint, required, className, prefix, ...props }) {
  const id = useId()
  const inputId = props.id ?? id
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-ink-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={inputId}
          required={required}
          className={cn(CONTROL, prefix && 'pl-8', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100')}
          {...props}
        />
      </div>
    </Field>
  )
}

export function Textarea({ label, error, hint, required, className, rows = 3, ...props }) {
  const id = useId()
  const inputId = props.id ?? id
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={inputId}
        rows={rows}
        required={required}
        className={cn(CONTROL, 'resize-y', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100')}
        {...props}
      />
    </Field>
  )
}

export function Select({ label, error, hint, required, options = [], placeholder, className, children, ...props }) {
  const id = useId()
  const inputId = props.id ?? id
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} className={className}>
      <select
        id={inputId}
        required={required}
        className={cn(CONTROL, 'pr-8', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100')}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
    </Field>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, 'pl-9')}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cards, badges, alerts                                                     */
/* -------------------------------------------------------------------------- */
export function Card({ className, children, ...props }) {
  return (
    <div className={cn('surface', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions, icon: Icon, className }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  )
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tone = 'slate', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        TONES[tone] ?? TONES.slate,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status, kind = 'application' }) {
  const map = kind === 'loan' ? LOAN_STATUS : kind === 'schedule' ? SCHEDULE_STATUS : APPLICATION_STATUS
  const meta = map[status] ?? { label: status ?? '—', tone: 'slate' }
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export function Alert({ tone = 'info', title, children, className, onClose }) {
  const styles = {
    info: { box: 'border-blue-200 bg-blue-50 text-blue-800', Icon: Info },
    success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
    warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
    error: { box: 'border-rose-200 bg-rose-50 text-rose-800', Icon: XCircle },
  }
  const { box, Icon } = styles[tone] ?? styles.info
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-black/5" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-ink-500">
      <Spinner className="h-7 w-7" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink-800">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Layout helpers                                                            */
/* -------------------------------------------------------------------------- */
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p> : null}
        <h1 className="text-xl font-bold text-ink-950 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

const STAT_TONES = {
  brand: 'bg-brand-50 text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  cyan: 'bg-cyan-50 text-cyan-600',
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  return (
    <div className="surface flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <p className="mt-1.5 truncate text-xl font-bold text-ink-950 sm:text-2xl">{value}</p>
        {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
      </div>
      {Icon ? (
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', STAT_TONES[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
    </div>
  )
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-brand-50 text-brand-700' : 'bg-ink-200 text-ink-600')}>
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="xs" variant="outline" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Prev
        </Button>
        <span className="font-semibold text-ink-700">
          {page} / {pages}
        </span>
        <Button size="xs" variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function DetailRow({ label, value, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-ink-100/70 py-2 last:border-0', className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</span>
      <span className="text-right text-sm font-medium text-ink-900">{value ?? '—'}</span>
    </div>
  )
}

export function ProgressBar({ value, max, tone = 'brand', className }) {
  const percent = useMemo(() => {
    const total = Number(max ?? 0)
    if (!total) return 0
    return Math.min(100, Math.max(0, (Number(value ?? 0) / total) * 100))
  }, [value, max])
  const tones = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-100', className)}>
      <div className={cn('h-full rounded-full transition-all', tones[tone])} style={{ width: `${percent}%` }} />
    </div>
  )
}
