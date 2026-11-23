-- ===========================================================================
--  CashBridge — Migration 2 of 4
--  Security helpers, workflow RPCs, audit trail, dashboards
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read profiles without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid() and is_active),
    'anon'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_role() in ('super_admin', 'admin', 'loan_officer');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_role() in ('super_admin', 'admin');
$$;

create or replace function public.current_borrower_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.borrowers where profile_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Audit + notification helpers (never exposed directly to clients)
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select id into v_actor from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
  values (v_actor, public.app_role(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text default 'info',
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message, type, link)
  values (p_user_id, p_title, p_message, coalesce(p_type, 'info'), p_link);
end;
$$;

create or replace function public.notify_staff(
  p_title text,
  p_message text,
  p_type text default 'info',
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message, type, link)
  select p.id, p_title, p_message, coalesce(p_type, 'info'), p_link
  from public.profiles p
  where p.role in ('super_admin', 'admin', 'loan_officer') and p.is_active;
end;
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile (+ borrower record when registration metadata has it)
-- Role is ALWAYS 'borrower' here; staff accounts are provisioned by an
-- authenticated admin through the `admin-users` Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    'borrower',
    coalesce(meta ->> 'full_name', ''),
    new.email,
    meta ->> 'phone'
  )
  on conflict (id) do nothing;

  if coalesce(meta ->> 'date_of_birth', '') <> '' then
    insert into public.borrowers (
      profile_id, first_name, middle_name, last_name, date_of_birth,
      contact_number, email, address, city, province, postal_code,
      employment_status, employer_name, occupation, monthly_income,
      emergency_contact_name, emergency_contact_number, emergency_contact_relationship
    )
    values (
      new.id,
      coalesce(meta ->> 'first_name', ''),
      nullif(meta ->> 'middle_name', ''),
      coalesce(meta ->> 'last_name', ''),
      (meta ->> 'date_of_birth')::date,
      coalesce(meta ->> 'contact_number', meta ->> 'phone', ''),
      coalesce(meta ->> 'email', new.email),
      coalesce(meta ->> 'address', ''),
      nullif(meta ->> 'city', ''),
      nullif(meta ->> 'province', ''),
      nullif(meta ->> 'postal_code', ''),
      coalesce(meta ->> 'employment_status', 'employed'),
      nullif(meta ->> 'employer_name', ''),
      coalesce(meta ->> 'occupation', ''),
      coalesce((meta ->> 'monthly_income')::numeric, 0),
      coalesce(meta ->> 'emergency_contact_name', ''),
      coalesce(meta ->> 'emergency_contact_number', ''),
      nullif(meta ->> 'emergency_contact_relationship', '')
    )
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notify staff whenever a new application arrives
-- ---------------------------------------------------------------------------
create or replace function public.on_application_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_staff(
    'New cash loan application',
    'Application ' || new.application_no || ' is waiting for evaluation.',
    'info',
    '/staff/applications/' || new.id
  );
  perform public.log_audit(
    'application.submitted', 'loan_application', new.id::text,
    jsonb_build_object('application_no', new.application_no, 'amount', new.requested_amount)
  );
  return new;
end;
$$;

drop trigger if exists trg_application_created on public.loan_applications;
create trigger trg_application_created
  after insert on public.loan_applications
  for each row execute function public.on_application_created();

-- ---------------------------------------------------------------------------
-- Internal: build amortization schedule (principal, interest, fee per period)
-- ---------------------------------------------------------------------------
create or replace function public.build_repayment_schedule(p_loan_id uuid, p_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_count integer;
  v_due date;
  i integer;
  v_p numeric(14, 2);
  v_i numeric(14, 2);
  v_f numeric(14, 2);
  v_amount numeric(14, 2);
  v_last_p numeric(14, 2);
  v_last_i numeric(14, 2);
  v_last_f numeric(14, 2);
begin
  select * into v_loan from public.loans where id = p_loan_id;
  if v_loan.id is null then
    raise exception 'Loan not found';
  end if;
  if exists (select 1 from public.repayment_schedules where loan_id = p_loan_id and amount_paid > 0) then
    raise exception 'Cannot rebuild a schedule that already has payments';
  end if;

  delete from public.repayment_schedules where loan_id = p_loan_id;

  v_count := public.installment_count(v_loan.payment_frequency, v_loan.term_months);
  v_p := round(v_loan.principal / v_count, 2);
  v_i := round(v_loan.interest_amount / v_count, 2);
  v_f := round(v_loan.processing_fee / v_count, 2);
  v_last_p := v_loan.principal - v_p * (v_count - 1);
  v_last_i := v_loan.interest_amount - v_i * (v_count - 1);
  v_last_f := v_loan.processing_fee - v_f * (v_count - 1);

  for i in 1..v_count loop
    if v_loan.payment_frequency = 'weekly' then
      v_due := p_start + (i * 7);
    elsif v_loan.payment_frequency = 'biweekly' then
      v_due := p_start + (i * 14);
    else
      v_due := (p_start + make_interval(months => i))::date;
    end if;

    if i = v_count then
      v_p := v_last_p;
      v_i := v_last_i;
      v_f := v_last_f;
    end if;
    v_amount := round(v_p + v_i + v_f, 2);

    insert into public.repayment_schedules
      (loan_id, installment_no, due_date, principal_due, interest_due, fee_due, amount_due)
    values (p_loan_id, i, v_due, v_p, v_i, v_f, v_amount);
  end loop;

  update public.loans
  set first_due_date = (select min(due_date) from public.repayment_schedules where loan_id = p_loan_id),
      maturity_date  = (select max(due_date) from public.repayment_schedules where loan_id = p_loan_id)
  where id = p_loan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff decision: approve / reject / request additional information
-- Creates the loan record on approval. Never auto-approves anything.
-- ---------------------------------------------------------------------------
create or replace function public.decide_application(
  p_application_id uuid,
  p_decision text,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.loan_applications;
  v_profile uuid;
  v_loan_id uuid;
  v_loan_no text;
begin
  if not public.is_staff() then
    raise exception 'Only authorized personnel can evaluate applications';
  end if;
  if p_decision not in ('approved', 'rejected', 'additional_info') then
    raise exception 'Invalid decision';
  end if;

  select * into v_app from public.loan_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'Application not found';
  end if;
  if v_app.status not in ('pending', 'under_review', 'additional_info_required') then
    raise exception 'Application % can no longer be evaluated (status: %)', v_app.application_no, v_app.status;
  end if;

  insert into public.loan_approvals (application_id, decision, remarks, decided_by)
  values (p_application_id, p_decision, p_remarks, auth.uid());

  if p_decision = 'approved' then
    if exists (select 1 from public.loans where application_id = p_application_id) then
      raise exception 'A loan already exists for this application';
    end if;
    insert into public.loans (
      application_id, borrower_id, loan_type_id, principal, interest_amount,
      processing_fee, total_payable, term_months, payment_frequency,
      interest_rate, status, approved_by, approved_at
    )
    values (
      v_app.id, v_app.borrower_id, v_app.loan_type_id, v_app.requested_amount,
      v_app.interest_amount, v_app.processing_fee, v_app.total_payable,
      v_app.term_months, v_app.payment_frequency, v_app.interest_rate,
      'approved', auth.uid(), now()
    )
    returning id, loan_no into v_loan_id, v_loan_no;

    update public.loan_applications
    set status = 'approved', decided_at = now(), staff_notes = coalesce(p_remarks, staff_notes)
    where id = p_application_id;
  elsif p_decision = 'rejected' then
    update public.loan_applications
    set status = 'rejected', decided_at = now(), staff_notes = coalesce(p_remarks, staff_notes)
    where id = p_application_id;
  else
    update public.loan_applications
    set status = 'additional_info_required', staff_notes = coalesce(p_remarks, staff_notes)
    where id = p_application_id;
  end if;

  select b.profile_id into v_profile
  from public.borrowers b where b.id = v_app.borrower_id;

  perform public.notify_user(
    v_profile,
    case p_decision
      when 'approved' then 'Your loan application was approved'
      when 'rejected' then 'Your loan application was rejected'
      else 'Additional information required'
    end,
    'Application ' || v_app.application_no || ': ' ||
      coalesce(p_remarks, case p_decision
        when 'approved' then 'You may now review your loan agreement.'
        when 'rejected' then 'Please contact our office for details.'
        else 'Please open your application and provide the requested information.' end),
    case p_decision when 'approved' then 'success' when 'rejected' then 'error' else 'warning' end,
    '/borrower/applications/' || v_app.id
  );

  perform public.log_audit(
    'application.' || p_decision, 'loan_application', v_app.id::text,
    jsonb_build_object('application_no', v_app.application_no, 'remarks', p_remarks,
                       'loan_id', v_loan_id, 'loan_no', v_loan_no)
  );

  return jsonb_build_object('status', p_decision, 'loan_id', v_loan_id, 'loan_no', v_loan_no);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff workflow transitions: under review, agreement, ready for disbursement
-- ---------------------------------------------------------------------------
create or replace function public.advance_application(
  p_application_id uuid,
  p_status text,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.loan_applications;
  v_profile uuid;
  v_loan_status text;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('under_review', 'for_agreement', 'ready_for_disbursement') then
    raise exception 'Invalid target status';
  end if;

  select * into v_app from public.loan_applications where id = p_application_id for update;
  if v_app.id is null then
    raise exception 'Application not found';
  end if;

  if p_status = 'under_review' then
    if v_app.status not in ('pending', 'additional_info_required', 'under_review') then
      raise exception 'Application cannot be moved to under review from %', v_app.status;
    end if;
    update public.loan_applications set status = 'under_review', staff_notes = coalesce(p_remarks, staff_notes)
    where id = p_application_id;
    insert into public.loan_approvals (application_id, decision, remarks, decided_by)
    values (p_application_id, 'under_review', p_remarks, auth.uid());
  elsif p_status = 'for_agreement' then
    if v_app.status <> 'approved' then
      raise exception 'Only approved applications can move to for agreement';
    end if;
    update public.loan_applications set status = 'for_agreement' where id = p_application_id;
    update public.loans set status = 'for_agreement' where application_id = p_application_id;
    v_loan_status := 'for_agreement';
  else
    if v_app.status <> 'for_agreement' then
      raise exception 'Only applications for agreement can be marked ready for disbursement';
    end if;
    update public.loan_applications set status = 'ready_for_disbursement' where id = p_application_id;
    update public.loans set status = 'ready_for_disbursement' where application_id = p_application_id;
    v_loan_status := 'ready_for_disbursement';
  end if;

  select b.profile_id into v_profile from public.borrowers b where b.id = v_app.borrower_id;
  perform public.notify_user(
    v_profile,
    case p_status
      when 'under_review' then 'Your application is under review'
      when 'for_agreement' then 'Your loan agreement is ready'
      else 'Your loan is ready for disbursement' end,
    'Application ' || v_app.application_no || ' status: ' || replace(p_status, '_', ' ') || '.',
    'info',
    '/borrower/applications/' || v_app.id
  );

  perform public.log_audit('application.status_changed', 'loan_application', v_app.id::text,
    jsonb_build_object('from', v_app.status, 'to', p_status, 'remarks', p_remarks, 'loan_status', v_loan_status));

  return jsonb_build_object('status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrower cancels own pending application (staff may also cancel)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_application(
  p_application_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.loan_applications;
begin
  select * into v_app from public.loan_applications where id = p_application_id for update;
  if v_app.id is null then raise exception 'Application not found'; end if;

  if not public.is_staff() and v_app.borrower_id <> public.current_borrower_id() then
    raise exception 'Not authorized';
  end if;
  if v_app.status not in ('pending', 'under_review', 'additional_info_required') then
    raise exception 'This application can no longer be cancelled';
  end if;

  update public.loan_applications
  set status = 'cancelled', cancelled_at = now(),
      staff_notes = case when public.is_staff() and p_reason is not null
                         then coalesce(staff_notes || E'\n', '') || 'Cancelled: ' || p_reason
                         else staff_notes end
  where id = p_application_id;

  perform public.log_audit('application.cancelled', 'loan_application', v_app.id::text,
    jsonb_build_object('application_no', v_app.application_no, 'reason', p_reason));

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrower responds to an "additional information required" request
-- ---------------------------------------------------------------------------
create or replace function public.submit_additional_info(
  p_application_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.loan_applications;
begin
  select * into v_app from public.loan_applications where id = p_application_id for update;
  if v_app.id is null then raise exception 'Application not found'; end if;
  if v_app.borrower_id <> public.current_borrower_id() then
    raise exception 'Not authorized';
  end if;
  if v_app.status <> 'additional_info_required' then
    raise exception 'No additional information is currently requested';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Please provide the requested information';
  end if;

  update public.loan_applications
  set borrower_message = p_message, status = 'under_review'
  where id = p_application_id;

  perform public.notify_staff(
    'Borrower submitted additional information',
    'Application ' || v_app.application_no || ' is back under review.',
    'info',
    '/staff/applications/' || v_app.id
  );
  perform public.log_audit('application.information_submitted', 'loan_application', v_app.id::text,
    jsonb_build_object('application_no', v_app.application_no));

  return jsonb_build_object('status', 'under_review');
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash disbursement: records release, builds schedule, activates loan
-- ---------------------------------------------------------------------------
create or replace function public.disburse_loan(
  p_loan_id uuid,
  p_amount_released numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_disbursement_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_app public.loan_applications;
  v_profile uuid;
  v_disb_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_amount_released is null or p_amount_released <= 0 then
    raise exception 'Amount released must be greater than zero';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'ready_for_disbursement' then
    raise exception 'Loan is not ready for disbursement (status: %)', v_loan.status;
  end if;
  if p_amount_released > v_loan.principal then
    raise exception 'Amount released cannot exceed the approved principal of %', v_loan.principal;
  end if;
  if exists (select 1 from public.loan_disbursements where loan_id = p_loan_id) then
    raise exception 'This loan has already been disbursed';
  end if;
  if p_disbursement_date > current_date then
    raise exception 'Disbursement date cannot be in the future';
  end if;

  insert into public.loan_disbursements
    (loan_id, amount_released, disbursement_date, method, reference_no, notes, processed_by)
  values
    (p_loan_id, p_amount_released, p_disbursement_date, coalesce(p_method, 'cash'),
     p_reference, p_notes, auth.uid())
  returning id into v_disb_id;

  update public.loans
  set status = 'active', disbursed_at = p_disbursement_date::timestamptz
  where id = p_loan_id;

  perform public.build_repayment_schedule(p_loan_id, p_disbursement_date);

  update public.loan_applications
  set status = 'active'
  where id = v_loan.application_id
  returning * into v_app;

  select b.profile_id into v_profile from public.borrowers b where b.id = v_loan.borrower_id;
  perform public.notify_user(
    v_profile,
    'Cash loan disbursed',
    'Your loan ' || v_loan.loan_no || ' has been released. Your repayment schedule is now available.',
    'success',
    '/loans/' || v_loan.id
  );
  perform public.log_audit('loan.disbursed', 'loan_disbursement', v_disb_id::text,
    jsonb_build_object('loan_no', v_loan.loan_no, 'amount_released', p_amount_released,
                       'method', p_method, 'reference', p_reference));

  return jsonb_build_object('disbursement_id', v_disb_id, 'loan_no', v_loan.loan_no);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a repayment (cash collected). Allocates oldest installments first.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_payment_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans;
  v_profile uuid;
  v_remaining numeric(14, 2);
  v_alloc numeric(14, 2);
  v_sched public.repayment_schedules;
  v_receipt text;
  v_payment_id uuid;
  v_outstanding numeric(14, 2);
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'active' then
    raise exception 'Only active loans can accept payments (current status: %)', v_loan.status;
  end if;
  if p_payment_date > current_date then
    raise exception 'Payment date cannot be in the future';
  end if;

  v_outstanding := v_loan.total_payable - v_loan.amount_paid;
  if p_amount > v_outstanding + 0.005 then
    raise exception 'Payment exceeds the remaining balance of %', v_outstanding;
  end if;

  v_receipt := 'RCPT-' || to_char(now(), 'YYYY') || '-' ||
               lpad(nextval('public.receipt_no_seq')::text, 6, '0');

  insert into public.payment_records
    (loan_id, receipt_no, amount, payment_date, method, reference_no, notes, received_by)
  values
    (p_loan_id, v_receipt, p_amount, p_payment_date, coalesce(p_method, 'cash'),
     p_reference, p_notes, auth.uid())
  returning id into v_payment_id;

  v_remaining := p_amount;

  for v_sched in
    select * from public.repayment_schedules
    where loan_id = p_loan_id and status not in ('paid', 'waived')
    order by installment_no
    for update
  loop
    exit when v_remaining <= 0;
    v_alloc := least(v_remaining, v_sched.amount_due - v_sched.amount_paid);
    if v_alloc > 0 then
      update public.repayment_schedules
      set amount_paid = amount_paid + v_alloc,
          status = case when amount_paid + v_alloc >= amount_due - 0.005 then 'paid' else 'partial' end,
          paid_at = case when amount_paid + v_alloc >= amount_due - 0.005 then now() else paid_at end
      where id = v_sched.id;
      v_remaining := v_remaining - v_alloc;
    end if;
  end loop;

  update public.loans
  set amount_paid = amount_paid + p_amount,
      status = case when amount_paid + p_amount >= total_payable - 0.005 then 'completed' else status end
  where id = p_loan_id
  returning * into v_loan;

  if v_loan.status = 'completed' then
    update public.loan_applications
    set status = 'completed'
    where id = v_loan.application_id;

    select b.profile_id into v_profile from public.borrowers b where b.id = v_loan.borrower_id;
    perform public.notify_user(
      v_profile,
      'Loan fully paid',
      'Congratulations! Loan ' || v_loan.loan_no || ' has been fully settled.',
      'success',
      '/loans/' || v_loan.id
    );
  end if;

  perform public.log_audit('payment.recorded', 'payment_record', v_payment_id::text,
    jsonb_build_object('loan_no', v_loan.loan_no, 'receipt_no', v_receipt, 'amount', p_amount,
                       'method', p_method, 'reference', p_reference, 'payment_date', p_payment_date));

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_no', v_receipt,
    'loan_status', v_loan.status,
    'amount_paid', v_loan.amount_paid,
    'remaining_balance', v_loan.total_payable - v_loan.amount_paid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Flag overdue installments (called by the UI / optional cron job)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_overdue_schedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Staff-only. A null auth.uid() is a trusted server/SQL context (seed, cron).
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  update public.repayment_schedules
  set status = 'overdue'
  where due_date < current_date
    and status in ('pending', 'partial')
    and amount_paid < amount_due - 0.005;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates for staff
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'total_borrowers',        (select count(*) from public.borrowers),
    'active_borrowers',       (select count(*) from public.borrowers where status = 'active'),
    'total_applications',     (select count(*) from public.loan_applications),
    'pending_applications',   (select count(*) from public.loan_applications where status = 'pending'),
    'under_review',           (select count(*) from public.loan_applications where status = 'under_review'),
    'additional_info',        (select count(*) from public.loan_applications where status = 'additional_info_required'),
    'approved_applications',  (select count(*) from public.loan_applications
                               where status in ('approved', 'for_agreement', 'ready_for_disbursement', 'active', 'completed')),
    'rejected_applications',  (select count(*) from public.loan_applications where status = 'rejected'),
    'active_loans',           (select count(*) from public.loans where status = 'active'),
    'completed_loans',        (select count(*) from public.loans where status = 'completed'),
    'total_disbursed',        coalesce((select sum(amount_released) from public.loan_disbursements), 0),
    'total_collected',        coalesce((select sum(amount) from public.payment_records), 0),
    'outstanding_balance',    coalesce((select sum(total_payable - amount_paid)
                                        from public.loans where status = 'active'), 0),
    'overdue_count',          (select count(*) from public.repayment_schedules
                               where status = 'overdue' or (due_date < current_date and status in ('pending','partial'))),
    'overdue_amount',         coalesce((select sum(amount_due - amount_paid) from public.repayment_schedules
                                        where due_date < current_date and status in ('pending', 'partial', 'overdue')), 0),
    'due_today',              coalesce((select sum(amount_due - amount_paid) from public.repayment_schedules
                                        where due_date = current_date and status in ('pending', 'partial', 'overdue')), 0),
    'disbursed_this_month',   coalesce((select sum(amount_released) from public.loan_disbursements
                                        where date_trunc('month', disbursement_date) = date_trunc('month', current_date)), 0),
    'collected_this_month',   coalesce((select sum(amount) from public.payment_records
                                        where date_trunc('month', payment_date) = date_trunc('month', current_date)), 0),
    'applications_this_month',(select count(*) from public.loan_applications
                               where date_trunc('month', created_at) = date_trunc('month', current_date)),
    'ready_for_disbursement', (select count(*) from public.loans where status = 'ready_for_disbursement')
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.financial_trends()
returns table (month text, disbursed numeric, collected numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select to_char(m, 'Mon YY')::text,
         coalesce((select sum(d.amount_released) from public.loan_disbursements d
                   where date_trunc('month', d.disbursement_date) = m), 0)::numeric,
         coalesce((select sum(p.amount) from public.payment_records p
                   where date_trunc('month', p.payment_date) = m), 0)::numeric
  from generate_series(
         date_trunc('month', current_date) - interval '5 months',
         date_trunc('month', current_date),
         interval '1 month'
       ) as m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------
revoke all on function public.build_repayment_schedule(uuid, date) from public, anon, authenticated;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_staff(text, text, text, text) from public, anon, authenticated;
revoke all on function public.on_application_created() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.app_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_borrower_id() from public, anon;
revoke all on function public.installment_count(text, integer) from public, anon;
revoke all on function public.decide_application(uuid, text, text) from public, anon;
revoke all on function public.advance_application(uuid, text, text) from public, anon;
revoke all on function public.cancel_application(uuid, text) from public, anon;
revoke all on function public.submit_additional_info(uuid, text) from public, anon;
revoke all on function public.disburse_loan(uuid, numeric, text, text, text, date) from public, anon;
revoke all on function public.record_payment(uuid, numeric, text, text, text, date) from public, anon;
revoke all on function public.refresh_overdue_schedules() from public, anon;
revoke all on function public.dashboard_stats() from public, anon;
revoke all on function public.financial_trends() from public, anon;

grant execute on function public.app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_borrower_id() to authenticated;
grant execute on function public.installment_count(text, integer) to authenticated;
grant execute on function public.decide_application(uuid, text, text) to authenticated;
grant execute on function public.advance_application(uuid, text, text) to authenticated;
grant execute on function public.cancel_application(uuid, text) to authenticated;
grant execute on function public.submit_additional_info(uuid, text) to authenticated;
grant execute on function public.disburse_loan(uuid, numeric, text, text, text, date) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text, text, date) to authenticated;
grant execute on function public.refresh_overdue_schedules() to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.financial_trends() to authenticated;
