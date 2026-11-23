-- ===========================================================================
--  CashBridge — Migration 4 of 4
--  Fictitious development seed data. DO NOT run against production.
--
--  Demo accounts (password shown for local/testing only):
--    admin@cashloan.test      / Admin123!      (super_admin)
--    officer@cashloan.test    / Officer123!    (loan_officer)
--    maria@example.test       / Borrower123!   (borrower)
--    jose@example.test        / Borrower123!   (borrower)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'admin@cashloan.test',
    crypt('Admin123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alexis Grant"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'officer@cashloan.test',
    crypt('Officer123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Dana Whitfield"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated', 'maria@example.test',
    crypt('Borrower123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{
      "full_name":"Maria Santos",
      "first_name":"Maria","middle_name":"Cruz","last_name":"Santos",
      "date_of_birth":"1990-04-12","contact_number":"09171234567",
      "email":"maria@example.test","address":"24 Mabini Street, Barangay San Roque",
      "city":"Quezon City","province":"Metro Manila","postal_code":"1103",
      "employment_status":"employed","employer_name":"Northwind Services Inc.",
      "occupation":"Accounting Staff","monthly_income":"32000",
      "emergency_contact_name":"Ramon Santos","emergency_contact_number":"09179876543",
      "emergency_contact_relationship":"Spouse","phone":"09171234567"
    }', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444444',
    'authenticated', 'authenticated', 'jose@example.test',
    crypt('Borrower123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{
      "full_name":"Jose Ramirez",
      "first_name":"Jose","middle_name":"Bautista","last_name":"Ramirez",
      "date_of_birth":"1985-11-02","contact_number":"09182223333",
      "email":"jose@example.test","address":"88 Rizal Avenue, Barangay Poblacion",
      "city":"Makati","province":"Metro Manila","postal_code":"1210",
      "employment_status":"self_employed","employer_name":"Ramirez Auto Repair",
      "occupation":"Proprietor / Mechanic","monthly_income":"45000",
      "emergency_contact_name":"Liza Ramirez","emergency_contact_number":"09185556666",
      "emergency_contact_relationship":"Sister","phone":"09182223333"
    }', now(), now()
  )
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u
where u.email in ('admin@cashloan.test', 'officer@cashloan.test', 'maria@example.test', 'jose@example.test')
on conflict do nothing;

-- Assign staff roles (profiles were auto-created as 'borrower' by the trigger)
update public.profiles set role = 'super_admin', full_name = 'Alexis Grant'
where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'loan_officer', full_name = 'Dana Whitfield'
where id = '22222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------------
-- Cash loan products
-- ---------------------------------------------------------------------------
insert into public.loan_types
  (id, code, name, description, min_amount, max_amount, interest_rate,
   processing_fee_rate, processing_fee_fixed, payment_frequency,
   term_options, min_term_months, max_term_months, requires_documents, is_active)
values
  ('a1000000-0000-0000-0000-000000000001', 'QCK', 'Quick Cash',
   'Fast cash for short-term emergencies. Weekly installments.',
   1000, 10000, 3.000, 1.000, 0, 'weekly', '{1,2,3}', 1, 3, false, true),
  ('a1000000-0000-0000-0000-000000000002', 'SLY', 'Salary Loan',
   'Payroll-friendly cash loan with monthly amortization.',
   5000, 50000, 2.500, 2.000, 0, 'monthly', '{3,6,12}', 3, 12, true, true),
  ('a1000000-0000-0000-0000-000000000003', 'EMR', 'Emergency Loan',
   'Biweekly cash loan for urgent household or medical needs.',
   500, 20000, 4.000, 1.000, 100, 'biweekly', '{1,2,3}', 1, 3, false, true),
  ('a1000000-0000-0000-0000-000000000004', 'BIZ', 'Business Cash Loan',
   'Working capital for micro and small businesses.',
   10000, 100000, 2.000, 2.000, 0, 'monthly', '{6,12,24}', 6, 24, true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Loan applications
-- ---------------------------------------------------------------------------
insert into public.loan_applications
  (id, borrower_id, loan_type_id, requested_amount, purpose, term_months,
   payment_frequency, status, submitted_at, created_at)
select
  'b1000000-0000-0000-0000-000000000001',
  b.id, 'a1000000-0000-0000-0000-000000000001', 5000, 'Medical bill for a family member',
  1, 'weekly', 'pending', now() - interval '2 days', now() - interval '2 days'
from public.borrowers b where b.email = 'maria@example.test'
on conflict (id) do nothing;

insert into public.loan_applications
  (id, borrower_id, loan_type_id, requested_amount, purpose, term_months,
   payment_frequency, status, submitted_at, created_at)
select
  'b1000000-0000-0000-0000-000000000002',
  b.id, 'a1000000-0000-0000-0000-000000000002', 30000, 'Home repair after typhoon damage',
  6, 'monthly', 'under_review', now() - interval '4 days', now() - interval '4 days'
from public.borrowers b where b.email = 'jose@example.test'
on conflict (id) do nothing;

insert into public.loan_applications
  (id, borrower_id, loan_type_id, requested_amount, purpose, term_months,
   payment_frequency, status, submitted_at, decided_at, created_at)
select
  'b1000000-0000-0000-0000-000000000003',
  b.id, 'a1000000-0000-0000-0000-000000000003', 10000, 'Urgent dental procedure',
  3, 'biweekly', 'ready_for_disbursement', now() - interval '7 days',
  now() - interval '5 days', now() - interval '7 days'
from public.borrowers b where b.email = 'maria@example.test'
on conflict (id) do nothing;

insert into public.loan_applications
  (id, borrower_id, loan_type_id, requested_amount, purpose, term_months,
   payment_frequency, status, submitted_at, decided_at, created_at)
select
  'b1000000-0000-0000-0000-000000000004',
  b.id, 'a1000000-0000-0000-0000-000000000001', 8000, 'Inventory replenishment for repair shop',
  1, 'weekly', 'active', now() - interval '30 days',
  now() - interval '28 days', now() - interval '30 days'
from public.borrowers b where b.email = 'jose@example.test'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Evaluation trail
-- ---------------------------------------------------------------------------
insert into public.loan_approvals (id, application_id, decision, remarks, decided_by, created_at)
values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
   'under_review', 'Verifying employment and income documents.', '22222222-2222-2222-2222-222222222222',
   now() - interval '3 days'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003',
   'approved', 'Income verified; approved for full requested amount.', '22222222-2222-2222-2222-222222222222',
   now() - interval '5 days'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004',
   'approved', 'Repeat client with good payment history.', '22222222-2222-2222-2222-222222222222',
   now() - interval '28 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------
insert into public.loans
  (id, application_id, borrower_id, loan_type_id, principal, interest_amount,
   processing_fee, total_payable, term_months, payment_frequency, interest_rate,
   status, approved_by, approved_at)
select
  'd1000000-0000-0000-0000-000000000003', a.id, a.borrower_id, a.loan_type_id,
  a.requested_amount, a.interest_amount, a.processing_fee, a.total_payable,
  a.term_months, a.payment_frequency, a.interest_rate, 'ready_for_disbursement',
  '22222222-2222-2222-2222-222222222222', now() - interval '5 days'
from public.loan_applications a where a.id = 'b1000000-0000-0000-0000-000000000003'
on conflict (id) do nothing;

insert into public.loans
  (id, application_id, borrower_id, loan_type_id, principal, interest_amount,
   processing_fee, total_payable, term_months, payment_frequency, interest_rate,
   status, approved_by, approved_at, disbursed_at, amount_paid)
select
  'd1000000-0000-0000-0000-000000000004', a.id, a.borrower_id, a.loan_type_id,
  a.requested_amount, a.interest_amount, a.processing_fee, a.total_payable,
  a.term_months, a.payment_frequency, a.interest_rate, 'active',
  '22222222-2222-2222-2222-222222222222', now() - interval '28 days',
  (current_date - 21)::timestamptz, 1200
from public.loan_applications a where a.id = 'b1000000-0000-0000-0000-000000000004'
on conflict (id) do nothing;

insert into public.loan_disbursements
  (id, loan_id, amount_released, disbursement_date, method, reference_no, processed_by)
values
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004',
   8000, current_date - 21, 'cash', 'CASH-2026-0042', '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- Build the weekly schedule for the demo active loan (4 installments)
select public.build_repayment_schedule('d1000000-0000-0000-0000-000000000004', current_date - 21)
where not exists (
  select 1 from public.repayment_schedules
  where loan_id = 'd1000000-0000-0000-0000-000000000004'
);

-- One partial cash payment already collected
insert into public.payment_records
  (id, loan_id, receipt_no, amount, payment_date, method, reference_no, notes, received_by)
values
  ('f1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004',
   'RCPT-2026-000001', 1200, current_date - 10, 'cash', 'CASH-2026-0042',
   'Partial payment received at the branch.', '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

update public.repayment_schedules
set amount_paid = 1200, status = 'partial', paid_at = now() - interval '10 days'
where loan_id = 'd1000000-0000-0000-0000-000000000004'
  and installment_no = 1 and amount_paid = 0;

select public.refresh_overdue_schedules();

-- ---------------------------------------------------------------------------
-- Audit entries for the seeded financial activity
-- ---------------------------------------------------------------------------
insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
values
  ('22222222-2222-2222-2222-222222222222', 'loan_officer', 'loan.disbursed',
   'loan_disbursement', 'e1000000-0000-0000-0000-000000000004',
   '{"loan_no":"seed-demo","amount_released":8000,"method":"cash"}'),
  ('22222222-2222-2222-2222-222222222222', 'loan_officer', 'payment.recorded',
   'payment_record', 'f1000000-0000-0000-0000-000000000001',
   '{"receipt_no":"RCPT-2026-000001","amount":1200,"method":"cash"}');
