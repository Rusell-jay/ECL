import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Banknote,
  BarChart3,
  Bell,
  ChevronDown,
  Circle,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ADMIN_NAV, BORROWER_NAV, ROLE_LABELS, STAFF_NAV } from '../lib/constants'
import { cn, initials } from '../lib/format'
import { supabase } from '../lib/supabase'
import { Badge, IconButton } from './ui'

const ICONS = {
  Banknote,
  BarChart3,
  FileText,
  LayoutDashboard,
  PlusCircle,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Users,
  Wallet,
}

function Brand({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
        <Wallet className="h-5 w-5" />
      </span>
      {!compact ? (
        <span>
          <span className="block text-sm font-bold leading-tight text-white">CashBridge</span>
          <span className="block text-[10px] font-medium uppercase tracking-widest text-brand-300">
            Cash Loan System
          </span>
        </span>
      ) : null}
    </Link>
  )
}

function NavItem({ item, onNavigate }) {
  const Icon = ICONS[item.icon] ?? Circle
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/30'
            : 'text-ink-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-300' : 'text-ink-400 group-hover:text-ink-200')} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }) {
  const { profile, isAdmin, isBorrower } = useAuth()
  const nav = isBorrower ? BORROWER_NAV : STAFF_NAV
  const roleLabel = ROLE_LABELS[profile?.role] ?? 'User'

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex h-16 items-center border-b border-white/5 px-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            {isBorrower ? 'My Account' : 'Operations'}
          </p>
          <div className="space-y-1">
            {nav.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        {isAdmin ? (
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Administration</p>
            <div className="space-y-1">
              {ADMIN_NAV.map((item) => (
                <NavItem key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-white/5 p-3">
        <Link
          to={isBorrower ? '/borrower/profile' : '/staff'}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-200 ring-1 ring-brand-400/30">
            {initials(profile?.full_name || profile?.email || 'U')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {profile?.full_name || profile?.email}
            </span>
            <span className="block truncate text-[11px] text-ink-400">{roleLabel}</span>
          </span>
        </Link>
        <p className="mt-2 px-2 text-[10px] leading-relaxed text-ink-600">
          Cash loans only. No product or collateral inventory.
        </p>
      </div>
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isBorrower = profile?.role === 'borrower'
  const nav = isBorrower ? BORROWER_NAV : STAFF_NAV
  const allNav = profile?.role && ['super_admin', 'admin'].includes(profile.role) ? [...nav, ...ADMIN_NAV] : nav
  const current =
    allNav.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))?.label ??
    'Overview'

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profile?.id) return undefined
    let active = true

    const loadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
      if (active) setUnread(count ?? 0)
    }
    loadCount()

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        loadCount,
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [profile?.id, location.pathname])

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
              {isBorrower ? 'Borrower Portal' : 'Loan Operations'}
            </p>
            <p className="truncate text-sm font-semibold text-ink-900">{current}</p>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Link to="/notifications" className="relative">
              <IconButton label="Notifications" icon={Bell} />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-ink-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                  {initials(profile?.full_name || profile?.email || 'U')}
                </span>
                <span className="hidden max-w-[140px] truncate text-sm font-medium text-ink-800 sm:block">
                  {profile?.full_name || profile?.email}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-ink-400 sm:block" />
              </button>

              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg">
                    <div className="border-b border-ink-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {profile?.full_name || 'User'}
                      </p>
                      <p className="truncate text-xs text-ink-500">{profile?.email}</p>
                      <Badge tone="brand" className="mt-2">
                        {ROLE_LABELS[profile?.role] ?? 'User'}
                      </Badge>
                    </div>
                    <div className="p-1">
                      {isBorrower ? (
                        <Link
                          to="/borrower/profile"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
                        >
                          <UserCircle className="h-4 w-4 text-ink-400" /> My profile
                        </Link>
                      ) : null}
                      <Link
                        to="/notifications"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
                      >
                        <Bell className="h-4 w-4 text-ink-400" /> Notifications
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
