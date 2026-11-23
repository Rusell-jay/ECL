export function cn(...values) {
  return values.filter(Boolean).join(' ')
}

export function formatMoney(value, options = {}) {
  const number = Number(value ?? 0)
  if (Number.isNaN(number)) return '₱0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(number)
}

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat('en-PH', options).format(Number(value ?? 0))
}

export function formatPercent(value, digits = 2) {
  return `${Number(value ?? 0).toFixed(digits)}%`
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function daysBetween(a, b) {
  const first = toDate(a)
  const second = toDate(b)
  if (!first || !second) return 0
  return Math.round((second - first) / 86_400_000)
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleCase(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function downloadCsv(filename, rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return ''
    const text = String(value).replace(/"/g, '""')
    return /[",\n]/.test(text) ? `"${text}"` : text
  }
  const header = columns.map((col) => escape(col.label)).join(',')
  const body = rows.map((row) => columns.map((col) => escape(col.value(row))).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function fullName(person, fallback = 'Borrower') {
  if (!person) return fallback
  const name = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || person.full_name || fallback
}
