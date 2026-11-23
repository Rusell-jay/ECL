-- ===========================================================================
--  CashBridge — Emergency Cash Loan Management System
--  Migration 1 of 4: Core schema, tables, constraints, indexes, triggers
--  Target: Supabase / PostgreSQL 15+
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Sequences used for human-readable references
-- ---------------------------------------------------------------------------
create sequence if not exists public.application_no_seq start with 1001;
create sequence if not exists public.loan_no_seq start with 1001;
create sequence if not exists public.receipt_no_seq start with 100001;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. profiles — one row per authenticated user, holds role for RBAC
-- ===========================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'borrower'
              check (role in ('super_admin', 'admin', 'loan_officer', 'borrower')),
  full_name   text not null default '',
  email       text not null default '',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ===========================================================================
-- 2. borrowers — personal + financial information for cash loan clients
-- ===========================================================================
create table if not exists public.borrowers (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles (id) on delete cascade,
  borrower_code     text not null unique
                    default ('BRW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  first_name        text not null,
  middle_name       text,
  last_name         text not null,
  date_of_birth     date not null,
  contact_number    text not null,
  email             text not null,
  address           text not null,
  city              text,
  province          text,
  postal_code       text,
  employment_status text not null
                    check (employment_status in
                      ('employed', 'self_employed', 'business_owner', 'unemployed', 'retired', 'student')),
  employer_name     text,
  occupation        text not null,
  monthly_income    numeric(14, 2) not null default 0 check (monthly_income >= 0),
  emergency_contact_name         text not null,
  emergency_contact_number       text not null,
  emergency_contact_relationship text,
  status            text not null default 'active'
                    check (status in ('active', 'inactive', 'blacklisted')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists borrowers_profile_idx on public.borrowers (profile_id);
create index if not exists borrowers_status_idx on public.borrowers (status);
create index if not exists borrowers_name_idx on public.borrowers (lower(last_name), lower(first_name));
create unique index if not exists borrowers_email_unique_idx on public.borrowers (lower(email));

-- ===========================================================================
-- 3. loan_types — cash loan products, rates, fees and term configuration
-- ===========================================================================
create table if not exists public.loan_types (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  min_amount           numeric(14, 2) not null check (min_amount > 0),
  max_amount           numeric(14, 2) not null check (max_amount >= min_amount),
  interest_rate        numeric(7, 3) not null default 0 check (interest_rate >= 0),   -- % per month, simple
  processing_fee_rate  numeric(7, 3) not null default 0 check (processing_fee_rate >= 0), -- % of principal
  processing_fee_fixed numeric(12, 2) not null default 0 check (processing_fee_fixed >= 0),
  payment_frequency    text not null default 'monthly'
                       check (payment_frequency in ('weekly', 'biweekly', 'monthly')),
  term_options         integer[] not null default '{1,3,6,12}',
  min_term_months      integer not null default 1 check (min_term_months > 0),
  max_term_months      integer not null default 12 check (max_term_months >= min_term_months),
  requires_documents   boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists loan_types_active_idx on public.loan_types (is_active);

-- ===========================================================================
-- 4. loan_applications — cash loan requests and computed pricing snapshot
-- ===========================================================================
create table if not exists public.loan_applications (
  id                   uuid primary key default gen_random_uuid(),
  application_no       text not null unique
                       default ('APP-' || to_char(now(), 'YYYY') || '-' ||
                                lpad(nextval('public.application_no_seq')::text, 5, '0')),
  borrower_id          uuid not null references public.borrowers (id) on delete restrict,
  loan_type_id         uuid not null references public.loan_types (id) on delete restrict,
  requested_amount     numeric(14, 2) not null check (requested_amount > 0),
  purpose              text not null,
  term_months          integer not null check (term_months > 0),
  payment_frequency    text not null default 'monthly'
                       check (payment_frequency in ('weekly', 'biweekly', 'monthly')),
  interest_rate        numeric(7, 3) not null default 0,
  interest_amount      numeric(14, 2) not null default 0,
  processing_fee       numeric(14, 2) not null default 0,
  total_payable        numeric(14, 2) not null default 0,
  estimated_installment numeric(14, 2) not null default 0,
  status               text not null default 'pending'
                       check (status in ('pending', 'under_review', 'additional_info_required',
                                         'approved', 'rejected', 'for_agreement',
                                         'ready_for_disbursement', 'active', 'completed', 'cancelled')),
  borrower_message     text,
  staff_notes          text,
  submitted_at         timestamptz not null default now(),
  decided_at           timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists loan_applications_borrower_idx on public.loan_applications (borrower_id);
create index if not exists loan_applications_status_idx on public.loan_applications (status);
create index if not exists loan_applications_created_idx on public.loan_applications (created_at desc);
create index if not exists loan_applications_type_idx on public.loan_applications (loan_type_id);

-- ===========================================================================
-- 5. loan_approvals — immutable evaluation trail (approve/reject/info)
-- ===========================================================================
create table if not exists public.loan_approvals (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.loan_applications (id) on delete cascade,
  decision        text not null
                  check (decision in ('approved', 'rejected', 'additional_info', 'under_review')),
  remarks         text,
  decided_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index if not exists loan_approvals_application_idx on public.loan_approvals (application_id, created_at desc);
create index if not exists loan_approvals_decider_idx on public.loan_approvals (decided_by);

-- ===========================================================================
-- 6. loans — approved/active cash loans (financial truth for each loan)
-- ===========================================================================
create table if not exists public.loans (
  id                 uuid primary key default gen_random_uuid(),
  loan_no            text not null unique
                     default ('LN-' || to_char(now(), 'YYYY') || '-' ||
                              lpad(nextval('public.loan_no_seq')::text, 5, '0')),
  application_id     uuid not null unique references public.loan_applications (id) on delete restrict,
  borrower_id        uuid not null references public.borrowers (id) on delete restrict,
  loan_type_id       uuid not null references public.loan_types (id) on delete restrict,
  principal          numeric(14, 2) not null check (principal > 0),
  interest_amount    numeric(14, 2) not null default 0,
  processing_fee     numeric(14, 2) not null default 0,
  total_payable      numeric(14, 2) not null,
  term_months        integer not null,
  payment_frequency  text not null check (payment_frequency in ('weekly', 'biweekly', 'monthly')),
  interest_rate      numeric(7, 3) not null default 0,
  status             text not null default 'approved'
                     check (status in ('approved', 'for_agreement', 'ready_for_disbursement',
                                       'active', 'completed', 'cancelled', 'written_off')),
  approved_by        uuid references public.profiles (id) on delete set null,
  approved_at        timestamptz,
  disbursed_at       timestamptz,
  first_due_date     date,
  maturity_date      date,
  amount_paid        numeric(14, 2) not null default 0 check (amount_paid >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint loans_paid_not_over_total check (amount_paid <= total_payable + 0.01)
);

create index if not exists loans_borrower_idx on public.loans (borrower_id);
create index if not exists loans_status_idx on public.loans (status);
create index if not exists loans_created_idx on public.loans (created_at desc);

-- ===========================================================================
-- 7. loan_disbursements — actual cash released (one per loan)
-- ===========================================================================
create table if not exists public.loan_disbursements (
  id               uuid primary key default gen_random_uuid(),
  loan_id          uuid not null unique references public.loans (id) on delete restrict,
  amount_released  numeric(14, 2) not null check (amount_released > 0),
  disbursement_date date not null default current_date,
  method           text not null default 'cash'
                   check (method in ('cash', 'bank_transfer', 'check', 'gcash', 'other')),
  reference_no     text,
  notes            text,
  processed_by     uuid not null references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now()
);

create index if not exists disbursements_loan_idx on public.loan_disbursements (loan_id);
create index if not exists disbursements_date_idx on public.loan_disbursements (disbursement_date desc);

-- ===========================================================================
-- 8. repayment_schedules — amortization generated at disbursement
-- ===========================================================================
create table if not exists public.repayment_schedules (
  id             uuid primary key default gen_random_uuid(),
  loan_id        uuid not null references public.loans (id) on delete cascade,
  installment_no integer not null check (installment_no > 0),
  due_date       date not null,
  principal_due  numeric(14, 2) not null default 0,
  interest_due   numeric(14, 2) not null default 0,
  fee_due        numeric(14, 2) not null default 0,
  amount_due     numeric(14, 2) not null check (amount_due > 0),
  amount_paid    numeric(14, 2) not null default 0 check (amount_paid >= 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'partial', 'paid', 'overdue', 'waived')),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (loan_id, installment_no)
);

create index if not exists schedules_loan_idx on public.repayment_schedules (loan_id, installment_no);
create index if not exists schedules_due_idx on public.repayment_schedules (due_date);
create index if not exists schedules_status_idx on public.repayment_schedules (status);

-- ===========================================================================
-- 9. payment_records — cash actually collected from borrowers
-- ===========================================================================
create table if not exists public.payment_records (
  id            uuid primary key default gen_random_uuid(),
  loan_id       uuid not null references public.loans (id) on delete restrict,
  receipt_no    text not null unique
                default ('RCPT-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('public.receipt_no_seq')::text, 6, '0')),
  amount        numeric(14, 2) not null check (amount > 0),
  payment_date  date not null default current_date,
  method        text not null default 'cash'
                check (method in ('cash', 'bank_transfer', 'check', 'gcash', 'other')),
  reference_no  text,
  notes         text,
  received_by   uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index if not exists payments_loan_idx on public.payment_records (loan_id, payment_date desc);
create index if not exists payments_date_idx on public.payment_records (payment_date desc);

-- ===========================================================================
-- 10. notifications — per-user in-app alerts
-- ===========================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  message    text not null,
  type       text not null default 'info' check (type in ('info', 'success', 'warning', 'error')),
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where is_read = false;

-- ===========================================================================
-- 11. audit_logs — append-only trail of important actions
-- ===========================================================================
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_role text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_borrowers_updated on public.borrowers;
create trigger trg_borrowers_updated before update on public.borrowers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_loan_types_updated on public.loan_types;
create trigger trg_loan_types_updated before update on public.loan_types
  for each row execute function public.set_updated_at();

drop trigger if exists trg_loans_updated on public.loans;
create trigger trg_loans_updated before update on public.loans
  for each row execute function public.set_updated_at();

drop trigger if exists trg_schedules_updated on public.repayment_schedules;
create trigger trg_schedules_updated before update on public.repayment_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Installment count helper (weekly = 4/month, biweekly = 2/month, monthly = 1)
-- ---------------------------------------------------------------------------
create or replace function public.installment_count(p_frequency text, p_term_months integer)
returns integer
language sql
immutable
as $$
  select greatest(1, case
    when p_frequency = 'weekly'   then p_term_months * 4
    when p_frequency = 'biweekly' then p_term_months * 2
    else p_term_months
  end);
$$;

-- ---------------------------------------------------------------------------
-- Pricing engine: snapshot loan type terms and compute totals on every write.
-- Simple interest: principal x monthly rate x term (months)
-- Processing fee : principal x fee rate + fixed fee
-- ---------------------------------------------------------------------------
create or replace function public.apply_loan_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.loan_types;
  v_installments integer;
begin
  select * into v_type from public.loan_types where id = new.loan_type_id;
  if v_type.id is null then
    raise exception 'The selected loan type does not exist';
  end if;
  if not v_type.is_active then
    raise exception 'The selected loan type is not currently available';
  end if;
  if new.requested_amount < v_type.min_amount or new.requested_amount > v_type.max_amount then
    raise exception 'Loan amount must be between % and %', v_type.min_amount, v_type.max_amount;
  end if;
  if new.term_months < v_type.min_term_months or new.term_months > v_type.max_term_months then
    raise exception 'Repayment term must be between % and % months',
      v_type.min_term_months, v_type.max_term_months;
  end if;
  if new.term_months <> all (v_type.term_options) then
    raise exception 'Repayment term % months is not offered for this loan type', new.term_months;
  end if;

  if new.payment_frequency is null then
    new.payment_frequency := v_type.payment_frequency;
  end if;

  new.interest_rate      := v_type.interest_rate;
  new.interest_amount    := round(new.requested_amount * v_type.interest_rate / 100 * new.term_months, 2);
  new.processing_fee     := round(new.requested_amount * v_type.processing_fee_rate / 100
                                  + v_type.processing_fee_fixed, 2);
  new.total_payable      := new.requested_amount + new.interest_amount + new.processing_fee;
  v_installments         := public.installment_count(new.payment_frequency, new.term_months);
  new.estimated_installment := round(new.total_payable / v_installments, 2);
  new.updated_at         := now();
  return new;
end;
$$;

drop trigger if exists trg_application_terms on public.loan_applications;
create trigger trg_application_terms before insert or update of loan_type_id, requested_amount, term_months
  on public.loan_applications
  for each row execute function public.apply_loan_terms();

-- ---------------------------------------------------------------------------
-- Guard: borrowers may only change personal fields, never status/notes.
-- ---------------------------------------------------------------------------
create or replace function public.guard_borrower_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.profile_id and not public.is_staff() then
    new.status := old.status;
    new.notes := old.notes;
    new.profile_id := old.profile_id;
    new.borrower_code := old.borrower_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_borrower_update on public.borrowers;
create trigger trg_guard_borrower_update before update on public.borrowers
  for each row execute function public.guard_borrower_update();
