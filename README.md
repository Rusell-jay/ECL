# CashBridge — Emergency Cash Loan Management System

A complete, production-shaped web application for managing **emergency cash loans** end to end:
borrower registration, loan application, manual evaluation and approval, cash disbursement,
repayment schedules, collections, receipts and reporting.

Built with **React 18 + Vite + Tailwind CSS + Supabase** (PostgreSQL, Auth, Row Level Security and
Edge Functions). Deploys as a static site to **Vercel**.

> **Scope:** cash loans only. There are no products, goods, appliances, collateral inventory or item
> release features anywhere in the schema or UI.

---

## Table of contents

1. [Feature overview](#feature-overview)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Quick start](#quick-start)
5. [Supabase setup](#supabase-setup)
6. [Demo accounts](#demo-accounts)
7. [Database design](#database-design)
8. [Loan lifecycle](#loan-lifecycle)
9. [Pricing and repayment rules](#pricing-and-repayment-rules)
10. [Security model](#security-model)
11. [Testing](#testing)
12. [Deployment (Vercel)](#deployment-vercel)
13. [Scripts](#scripts)
14. [Limitations and next steps](#limitations-and-next-steps)

---

## Feature overview

### Borrower portal

- Self-service registration with full KYC-style profile (personal, address, employment, income and
  emergency contact details).
- Dashboard with application counts, active loan balance and upcoming installments.
- Apply for a cash loan: choose an active loan type, amount, term and payment frequency, with a live
  pricing preview (interest, processing fee, total payable, estimated installment).
- Track applications through every status, respond to "Additional information required" requests and
  cancel applications that have not been approved.
- View loan details, repayment schedule, payment history and printable receipts.
- Profile editing and password change.

### Loan officer / staff portal

- Operations dashboard with portfolio KPIs, six-month disbursement vs collection chart, latest
  applications, overdue installments and recent collections.
- Application queue with search, status tabs, date range filters, pagination and CSV export.
- Application review page: borrower capacity analysis (installment-to-income ratio), evaluation
  remarks, approve / reject / request information, and progress the application through agreement
  and "ready for disbursement".
- Borrower directory with lending history, status changes and internal notes.
- Cash loans list with balances and statuses.
- Cash disbursement module: release an approved loan once, capture amount, date, method and
  reference; the repayment schedule is generated automatically.
- Repayments and collections: overdue queue, active loans, payment recording with receipt
  generation, payment history.
- Reports: borrowers, applications, approvals/rejections, disbursements, repayments, outstanding
  balances and overdue installments — with search, date range, CSV export and print/PDF.
- In-app notifications with unread badge (realtime).

### Administrator portal

- Loan types and pricing configuration (amount range, monthly interest, processing fee, frequency,
  terms, document requirement, active flag).
- Staff account management through a privileged Edge Function: create, update role, enable/disable,
  reset password. The service-role key never reaches the browser.
- Append-only audit log of financial and administrative actions with search, category/date filters
  and CSV export.

---

## Tech stack

| Layer      | Choice                                                       |
| ---------- | ------------------------------------------------------------ |
| Frontend   | React 18, Vite 5, React Router 6                             |
| Styling    | Tailwind CSS 3, custom design tokens, print stylesheet       |
| Charts     | Recharts                                                     |
| Icons      | lucide-react                                                 |
| Backend    | Supabase PostgreSQL 15+, Auth, Row Level Security, Edge Functions (Deno) |
| Tests      | PGlite (in-memory PostgreSQL) SQL workflow + seed suites     |
| Hosting    | Vercel (static SPA with rewrite)                             |

---

## Project structure

```
emergency-cash-loan-system/
├─ src/
│  ├─ App.jsx                    # Route map and role guards
│  ├─ main.jsx                   # React root, router, auth provider
│  ├─ index.css                  # Tailwind layers, components, print CSS
│  ├─ components/
│  │  ├─ AuthShell.jsx           # Split-screen auth layout
│  │  ├─ Layout.jsx              # Sidebar, topbar, notifications, user menu
│  │  ├─ ProtectedRoute.jsx      # Session + role + disabled-account guards
│  │  └─ ui.jsx                  # Button, Input, Card, Modal, Tabs, StatCard…
│  ├─ context/AuthContext.jsx    # Session, profile, borrower, auth actions
│  ├─ lib/
│  │  ├─ constants.js            # Roles, statuses, nav config, enums
│  │  ├─ format.js               # Money/date formatting, CSV export, helpers
│  │  └─ supabase.js             # Supabase browser client
│  └─ pages/
│     ├─ auth/                   # Login, 3-step Register
│     ├─ borrower/               # Dashboard, Profile, ApplyLoan, Applications,
│     │                          # ApplicationDetail, MyLoans
│     ├─ staff/                  # Dashboard, Applications, ApplicationReview,
│     │                          # Borrowers, Loans, Disbursements, Repayments, Reports
│     ├─ admin/                  # LoanTypes, Users, AuditLogs
│     ├─ shared/LoanDetail.jsx   # Loan detail, schedule, payments, receipts
│     └─ Notifications.jsx
├─ supabase/
│  ├─ config.toml                # Local Supabase config
│  ├─ migrations/
│  │  ├─ 20260101000000_schema.sql      # Tables, constraints, indexes, pricing trigger
│  │  ├─ 20260101000100_functions.sql   # RPCs, audit/notification helpers, dashboards
│  │  └─ 20260101000200_rls.sql         # RLS policies, grants, escalation guards
│  ├─ seed.sql                   # Fictitious demo data (never run in production)
│  └─ functions/admin-users/     # Privileged staff management Edge Function
├─ tests/sql/                    # PGlite workflow + seed test suites
├─ .env.example
├─ vercel.json                   # SPA rewrite + security headers
└─ package.json
```

---

## Quick start

### 1. Prerequisites

- Node.js 18+ and npm
- A Supabase project (free tier is fine)
- Optional: the Supabase CLI and Docker for local development

### 2. Install the frontend

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Fill in `.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both values are in **Supabase Dashboard → Project Settings → API**. The anon key is designed to be
public; Row Level Security protects the data. **Never** put the service-role key in a `VITE_` variable.

### 3. Apply the database

See [Supabase setup](#supabase-setup).

### 4. Run

```bash
npm run dev
```

Open <http://localhost:5173> and sign in with a [demo account](#demo-accounts) or register a new
borrower.

---

## Supabase setup

### Option A — Supabase CLI (recommended)

```bash
npm install -g supabase          # or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>

# Push the three migrations to the linked project
supabase db push

# Optional: load the fictitious demo data (SQL editor or psql)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

For fully local development:

```bash
supabase start
supabase db reset          # applies migrations + seed.sql automatically
supabase functions serve admin-users
```

### Option B — Dashboard SQL editor

1. Open **SQL Editor** in the Supabase dashboard.
2. Run the three files **in order**:
   1. `supabase/migrations/20260101000000_schema.sql`
   2. `supabase/migrations/20260101000100_functions.sql`
   3. `supabase/migrations/20260101000200_rls.sql`
3. Optionally run `supabase/seed.sql` for demo data.

The migrations are idempotent (`create table if not exists`, `create or replace function`,
`drop policy if exists`), so re-running is safe.

### Auth settings

In **Authentication → Providers → Email**:

- Enable email/password sign-in.
- For the demo, turn **Confirm email** off so new borrower registrations can sign in immediately.
  With confirmations enabled, users must click the email link first.
- Add your local and production URLs under **Authentication → URL Configuration → Redirect URLs**
  (for example `http://localhost:5173` and `https://your-app.vercel.app`).

### Deploy the staff-management Edge Function

Staff accounts must be created with the service-role key, which is only available server-side. The
`admin-users` function verifies the caller's JWT, checks that the caller is an active admin, and then
performs the privileged operation.

```bash
supabase functions deploy admin-users
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
Edge Function runtime. Do not add them to `.env`.

Until the function is deployed, the **Staff & Users** page still lists users but create/update
actions will return a clear "Edge Function is not reachable" message.

---

## Demo accounts

Created by `supabase/seed.sql`. All data is fictitious.

| Role         | Email                  | Password       |
| ------------ | ---------------------- | -------------- |
| Super Admin  | `admin@cashloan.test`  | `Admin123!`    |
| Loan Officer | `officer@cashloan.test`| `Officer123!`  |
| Borrower     | `maria@example.test`   | `Borrower123!` |
| Borrower     | `jose@example.test`    | `Borrower123!` |

Seeded scenarios:

- Maria has a **pending** application and a **ready-for-disbursement** loan.
- Jose has an **under-review** application and an **active** ₱8,000 weekly loan with ₱1,200 paid and
  an overdue installment.
- Four cash loan products: Quick Cash, Salary Loan, Emergency Loan, Business Cash Loan.

> The seeded auth users are inserted directly for convenience. You can ignore the seed and use normal
> registration plus the **Staff & Users** page instead.

---

## Database design

| Table                  | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `profiles`             | One row per auth user; holds `role` (`super_admin`, `admin`, `loan_officer`, `borrower`) and `is_active`. |
| `borrowers`            | Borrower KYC record linked to a profile: name, birth date, contact, address, employment, income, emergency contact, status, internal notes. |
| `loan_types`           | Cash loan products: amount range, monthly interest, processing fee, payment frequency, term options, document requirement, active flag. |
| `loan_applications`    | Loan requests with a pricing snapshot and workflow status. |
| `loan_approvals`       | Immutable evaluation trail: under-review, approved, rejected, additional-information decisions with remarks and decider. |
| `loans`                | Approved/active/completed cash loans. Created by `decide_application`, never by the client. |
| `loan_disbursements`   | Actual cash releases (amount, date, method, reference, processed by). One per loan. |
| `repayment_schedules`  | Installments generated at disbursement: principal, interest, fee, amount due, amount paid, due date, status. |
| `payment_records`      | Cash repayments with generated receipt numbers, method, reference and receiver. |
| `notifications`        | Per-user in-app notifications (application updates, payments, approvals). |
| `audit_logs`           | Append-only trail of financial and administrative actions with actor, role, entity and JSON details. |

Human-readable references are generated by sequences: `APP-YYYY-#####`, `LN-YYYY-#####`,
`BRW-YYYY-#####` and `RCPT-YYYY-######`.

### Enforced invariants

- Unique `application_id` on `loans` → one loan per application.
- Unique `loan_id` on `loan_disbursements` → no duplicate disbursement.
- Application status constrained to the ten supported statuses.
- Schedule status constrained to `pending`, `partial`, `paid`, `overdue`, `waived`.
- Pricing is always recomputed by a `BEFORE INSERT/UPDATE` trigger from the selected loan type, so a
  client cannot submit forged interest or fees.
- Borrowers cannot change their own `status`, `borrower_code` or `profile_id`.
- Borrowers cannot change their own `role`, `email` or `is_active`.
- Financial tables (`loans`, `loan_disbursements`, `repayment_schedules`, `payment_records`,
  `loan_approvals`) are read-only to clients; they are written only by `SECURITY DEFINER` functions.

---

## Loan lifecycle

```
pending
  └─ under_review ──► additional_info_required ──► under_review
        │
        ├─ approved ──► for_agreement ──► ready_for_disbursement
        │                                        │
        │                                  disburse_loan()
        │                                        ▼
        │                                     active ──► completed
        └─ rejected

pending / under_review / additional_info_required ──► cancelled (borrower or staff)
```

- Decisions are **always manual**; there is no automatic approval path in the database or UI.
- `decide_application(application_id, decision, remarks)` accepts `approved`, `rejected` or
  `additional_info`. Approval creates the loan record, copies the pricing snapshot, writes an
  approval entry, notifies the borrower and logs the audit event.
- `advance_application(application_id, status, remarks)` moves an approved application to
  `for_agreement` or `ready_for_disbursement` and keeps the loan record in sync.
- `submit_additional_info(application_id, message)` returns the application to `under_review` and
  notifies staff.
- `cancel_application(application_id, reason)` is available before disbursement.
- `disburse_loan(...)` requires `ready_for_disbursement`, records the cash release, generates the
  schedule, sets `active` and notifies the borrower.
- `record_payment(...)` requires `active`, allocates the amount to the oldest unpaid installments,
  generates a receipt, and completes the loan automatically when fully paid.

---

## Pricing and repayment rules

All amounts are Philippine pesos. Interest is **simple interest**:

```
interest        = principal × monthly_rate × term_months
processing_fee  = principal × fee_rate + fixed_fee
total_payable   = principal + interest + processing_fee
installments    = term_months × 4   (weekly)
                = term_months × 2   (biweekly)
                = term_months       (monthly)
estimated       = total_payable / installments
```

The schedule generated at disbursement splits each installment into principal, interest and fee
components. Rounding differences are applied to the final installment so the schedule always sums
exactly to `total_payable`.

Payments are applied **oldest installment first**. Partial payments set an installment to `partial`;
fully covered installments become `paid`. Past-due unpaid installments are flagged `overdue` by
`refresh_overdue_schedules()`, which staff pages call on load (an optional `pg_cron` job can call it
on a schedule).

---

## Security model

- **Row Level Security is enabled on every table.** Borrowers can only read their own borrower
  record, applications, loans, schedules, payments and notifications. Staff can read operational
  data; only admins can read the audit log and manage loan types/staff.
- **`SECURITY DEFINER` RPCs** own every state transition. They validate the caller's role, enforce
  allowed status transitions, and write the audit/notification records atomically.
- **No client writes to financial tables.** The `authenticated` role receives only `SELECT` on
  `loans`, `loan_approvals`, `loan_disbursements`, `repayment_schedules`, `payment_records` and
  `audit_logs`. Even a crafted REST call cannot skip the workflow.
- **Role escalation guards.** A trigger prevents borrowers from changing their own role, active flag
  or email. `is_admin()`/`is_staff()` are `SECURITY DEFINER` helpers that avoid RLS recursion.
- **Disabled accounts are blocked twice.** The Edge Function bans the auth user, and `app_role()`
  treats `is_active = false` as `anon`, so a still-valid JWT immediately loses all access.
- **Service-role key stays server-side.** Only the `admin-users` Edge Function reads it from the
  runtime environment; it is never exposed to Vite or committed.
- **Audit trail is append-only.** There is no client INSERT/UPDATE/DELETE policy on `audit_logs`.
- **Unique constraints** prevent duplicate disbursements and duplicate loans per application.
- `vercel.json` adds `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` headers.

---

## Testing

### Build check

```bash
npm run build
```

### Database workflow and security suite

The repository includes two runnable SQL suites that apply the real migrations to an in-memory
PostgreSQL (PGlite) — no Docker or Supabase project required:

```bash
npm run test:sql
```

`tests/sql/run-workflow.mjs` covers:

- Trigger-created profiles and borrower rows.
- Pricing engine math (interest, fee, total, installment count).
- Borrower application submission and RLS scoping.
- Borrowers cannot approve their own loan, impersonate another borrower, update status directly,
  or escalate their role.
- Staff approval → agreement → ready-for-disbursement → disbursement.
- Schedule generation and sum-to-total check.
- Duplicate disbursement blocked.
- Payment allocation, partial payments, receipts, overpayment block.
- Automatic loan/application completion and payment-on-completed block.
- Dashboard aggregates and six-month trends.
- Audit visibility (admin-only) and cross-borrower isolation.
- Deactivated staff treated as `anon` by RLS and workflow RPCs.

`tests/sql/run-seed.mjs` verifies demo users, roles, borrower codes, loan types, application states,
the seeded active loan, partial payment, overdue flag, audit entries and seed idempotency.

### Manual QA checklist

| Area | Steps |
| ---- | ----- |
| Registration | Register a borrower; confirm profile + borrower row are created and you land on the borrower dashboard. |
| Application | Apply for a loan; confirm the pricing preview matches the stored totals. |
| Validation | Try an amount outside the product range, an unsupported term, or an empty purpose; confirm friendly errors. |
| Staff review | Sign in as officer; open the application, add remarks, request information, then approve it. |
| Borrower response | Sign back in as the borrower; respond to the information request; confirm status returns to under review. |
| Agreement | As staff, move the approved application to For Agreement, then Ready for Disbursement. |
| Disbursement | Record the cash release; confirm the loan becomes active and a schedule appears. Try a second release; confirm it is blocked. |
| Payments | Record a partial payment; confirm receipt, balance and schedule status. Pay the remainder; confirm the loan completes. |
| Overdue | With the seeded Jose loan, confirm overdue installments appear in the collections queue. |
| Reports | Change report tabs, filter by date/search, export CSV, print/PDF. |
| Admin | Create a loan type, disable/enable it, create a staff account, disable the account, inspect the audit log. |
| Notifications | Confirm the unread badge updates and marking notifications read works. |
| Responsive | Check the sidebar drawer, tables and modals at mobile width. |

---

## Deployment (Vercel)

1. Push the repository to GitHub.
2. In Vercel, **New Project → Import** the repository.
3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist`.
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. `vercel.json` rewrites all routes to `index.html` for client-side routing.
6. Add the Vercel URL to **Supabase → Authentication → URL Configuration → Site URL / Redirect URLs**.
7. Deploy the Edge Function separately with `supabase functions deploy admin-users`.

---

## Scripts

| Command            | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `npm run dev`      | Start the Vite dev server at <http://localhost:5173>.              |
| `npm run build`    | Production build to `dist/`.                                       |
| `npm run preview`  | Preview the production build locally.                              |
| `npm run test:sql` | Run the PGlite workflow/security and seed validation suites.       |

---

## Limitations and next steps

- Document uploads are not implemented. Loan types can require documents, and the reviewer is asked
  to verify them, but files are not stored. Add a Supabase Storage bucket plus a documents table for
  a production KYC flow.
- Overdue refresh is triggered by staff page loads. Add a `pg_cron` job calling
  `refresh_overdue_schedules()` for unattended operation.
- No payment gateway integration: disbursements and repayments are recorded as cash/manual
  transactions by staff, which matches the cash-loan scope.
- Email/SMS notifications are in-app only. Supabase Auth already sends password-reset emails; add an
  Edge Function plus a provider for transactional email/SMS if needed.
- The seed inserts demo auth users directly. For production, create the first super admin through
  the Supabase dashboard or a one-off script, then use the Staff & Users page.
