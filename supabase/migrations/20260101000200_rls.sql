-- ===========================================================================
--  CashBridge — Migration 3 of 4
--  Row Level Security policies + privilege hardening
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Prevent self-service privilege escalation on profiles
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.borrowers           enable row level security;
alter table public.loan_types          enable row level security;
alter table public.loan_applications   enable row level security;
alter table public.loan_approvals      enable row level security;
alter table public.loans               enable row level security;
alter table public.loan_disbursements  enable row level security;
alter table public.repayment_schedules enable row level security;
alter table public.payment_records     enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (id = auth.uid() or (select public.is_staff()));

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or (select public.is_admin()))
  with check (id = auth.uid() or (select public.is_admin()));

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using ((select public.is_admin()) and id <> auth.uid());

-- ---------------------------------------------------------------------------
-- borrowers
-- ---------------------------------------------------------------------------
drop policy if exists "borrowers_select_own_or_staff" on public.borrowers;
create policy "borrowers_select_own_or_staff" on public.borrowers
  for select to authenticated
  using (profile_id = auth.uid() or (select public.is_staff()));

drop policy if exists "borrowers_insert_own_or_staff" on public.borrowers;
create policy "borrowers_insert_own_or_staff" on public.borrowers
  for insert to authenticated
  with check (profile_id = auth.uid() or (select public.is_staff()));

drop policy if exists "borrowers_update_own_or_staff" on public.borrowers;
create policy "borrowers_update_own_or_staff" on public.borrowers
  for update to authenticated
  using (profile_id = auth.uid() or (select public.is_staff()))
  with check (profile_id = auth.uid() or (select public.is_staff()));

drop policy if exists "borrowers_delete_admin" on public.borrowers;
create policy "borrowers_delete_admin" on public.borrowers
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- loan_types (read-only for borrowers, full control for admins)
-- ---------------------------------------------------------------------------
drop policy if exists "loan_types_select" on public.loan_types;
create policy "loan_types_select" on public.loan_types
  for select to authenticated
  using (is_active or (select public.is_staff()));

drop policy if exists "loan_types_insert_admin" on public.loan_types;
create policy "loan_types_insert_admin" on public.loan_types
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "loan_types_update_admin" on public.loan_types;
create policy "loan_types_update_admin" on public.loan_types
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "loan_types_delete_admin" on public.loan_types;
create policy "loan_types_delete_admin" on public.loan_types
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- loan_applications
-- ---------------------------------------------------------------------------
drop policy if exists "applications_select_own_or_staff" on public.loan_applications;
create policy "applications_select_own_or_staff" on public.loan_applications
  for select to authenticated
  using (borrower_id = (select public.current_borrower_id()) or (select public.is_staff()));

drop policy if exists "applications_insert_own_pending" on public.loan_applications;
create policy "applications_insert_own_pending" on public.loan_applications
  for insert to authenticated
  with check (
    borrower_id = (select public.current_borrower_id())
    and status = 'pending'
  );

-- No UPDATE policy on purpose: application status changes must go through the
-- SECURITY DEFINER workflow RPCs (decide_application / advance_application /
-- cancel_application / submit_additional_info) so pricing, approvals and audit
-- trails can never be bypassed with a direct REST update.

-- ---------------------------------------------------------------------------
-- loan_approvals
-- ---------------------------------------------------------------------------
drop policy if exists "approvals_select_own_or_staff" on public.loan_approvals;
create policy "approvals_select_own_or_staff" on public.loan_approvals
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.loan_applications a
      where a.id = loan_approvals.application_id
        and a.borrower_id = (select public.current_borrower_id())
    )
  );

drop policy if exists "approvals_insert_staff" on public.loan_approvals;
-- Approvals are written only by decide_application() / advance_application()
-- (SECURITY DEFINER), so no INSERT policy is defined here.

-- ---------------------------------------------------------------------------
-- loans (read-only; mutations happen through SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------
drop policy if exists "loans_select_own_or_staff" on public.loans;
create policy "loans_select_own_or_staff" on public.loans
  for select to authenticated
  using (borrower_id = (select public.current_borrower_id()) or (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- loan_disbursements
-- ---------------------------------------------------------------------------
drop policy if exists "disbursements_select_own_or_staff" on public.loan_disbursements;
create policy "disbursements_select_own_or_staff" on public.loan_disbursements
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.loans l
      where l.id = loan_disbursements.loan_id
        and l.borrower_id = (select public.current_borrower_id())
    )
  );

-- ---------------------------------------------------------------------------
-- repayment_schedules
-- ---------------------------------------------------------------------------
drop policy if exists "schedules_select_own_or_staff" on public.repayment_schedules;
create policy "schedules_select_own_or_staff" on public.repayment_schedules
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.loans l
      where l.id = repayment_schedules.loan_id
        and l.borrower_id = (select public.current_borrower_id())
    )
  );

-- ---------------------------------------------------------------------------
-- payment_records
-- ---------------------------------------------------------------------------
drop policy if exists "payments_select_own_or_staff" on public.payment_records;
create policy "payments_select_own_or_staff" on public.payment_records
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.loans l
      where l.id = payment_records.loan_id
        and l.borrower_id = (select public.current_borrower_id())
    )
  );

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_logs (admins read; writes only through SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Explicit grants (RLS still applies to every authenticated request)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant usage on schema public to authenticated;

-- Direct client writes are limited to the tables the UI legitimately edits.
-- Financial tables are read-only to clients and mutated only through the
-- SECURITY DEFINER RPCs, which keeps the workflow and audit trail intact.
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.borrowers to authenticated;
grant select, insert, update, delete on public.loan_types to authenticated;
grant select, insert on public.loan_applications to authenticated;
grant select on
  public.loan_approvals, public.loans, public.loan_disbursements,
  public.repayment_schedules, public.payment_records, public.audit_logs
  to authenticated;
grant select, update, delete on public.notifications to authenticated;

grant usage, select on all sequences in schema public to authenticated;
