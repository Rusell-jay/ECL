import { Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck, Wallet } from 'lucide-react'
import { CONFIG_ERROR_MESSAGE, isSupabaseConfigured } from '../lib/supabase'
import { Alert } from './ui'

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-ink-50">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink-950 p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(60rem 30rem at -10% -10%, rgba(34,155,128,0.35), transparent 60%), radial-gradient(40rem 24rem at 110% 110%, rgba(67,182,153,0.18), transparent 60%)',
          }}
        />
        <div className="relative">
          <Link to="/login" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg">
              <Wallet className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-bold text-white">CashBridge</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-brand-300">
                Emergency Cash Loan System
              </span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
            Emergency cash, managed with clarity and control.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            A complete lending workflow for cash loans — from borrower registration and evaluation to
            disbursement, collections, and portfolio reporting.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-200">
            {[
              'Role-based access for admins, loan officers and borrowers',
              'Structured evaluation and approval with a full audit trail',
              'Accurate repayment schedules, receipts and balances',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-ink-400">
          <ShieldCheck className="h-4 w-4 text-brand-400" />
          Secured by Supabase Auth and row level security.
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Wallet className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-ink-950">CashBridge</span>
              <span className="block text-[10px] font-medium uppercase tracking-widest text-ink-400">
                Cash Loan System
              </span>
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-ink-950">{title}</h2>
            {subtitle ? <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p> : null}
          </div>

          {!isSupabaseConfigured ? (
            <Alert tone="warning" title="Supabase is not configured" className="mb-5">
              {CONFIG_ERROR_MESSAGE}
            </Alert>
          ) : null}

          {children}

          {footer ? <div className="mt-6 text-center text-sm text-ink-500">{footer}</div> : null}

          <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-400">
            Cash loans only. CashBridge does not process product purchases, goods, appliances, or collateral
            inventory.
          </p>
        </div>
      </div>
    </div>
  )
}
