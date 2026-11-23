// ===========================================================================
//  Workflow + security test suite for the CashBridge database.
//
//  Runs the real migrations against an in-memory PostgreSQL (PGlite), then
//  exercises the full cash-loan lifecycle and the RLS rules with two borrower
//  sessions and a staff session.
//
//  Run with:  npm run test:sql
// ===========================================================================
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', 'supabase', 'migrations')

const db = new PGlite()
let failures = 0

function check(name, condition, extra = '') {
  if (condition) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name} ${extra}`)
  }
}

async function expectError(name, fn) {
  try {
    await fn()
    failures += 1
    console.log(`FAIL  ${name} (expected an error, none thrown)`)
  } catch (err) {
    console.log(`PASS  ${name} -> ${String(err.message).slice(0, 110)}`)
  }
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]

try {
  // -------------------------------------------------------------------------
  // Minimal Supabase-compatible auth schema. Supabase provides the real one.
  // -------------------------------------------------------------------------
  await db.exec(`
    create schema auth;
    create table auth.users (
      instance_id uuid,
      id uuid primary key,
      aud text,
      role text,
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
    create table auth.identities (
      id uuid primary key,
      user_id uuid,
      provider_id text,
      identity_data jsonb,
      provider text,
      last_sign_in_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('test.uid', true), '')::uuid
      $$;
    create role anon;
    create role authenticated;
  `)

  for (const file of [
    '20260101000000_schema.sql',
    '20260101000100_functions.sql',
    '20260101000200_rls.sql',
  ]) {
    // PGlite (Postgres 17) ships gen_random_uuid() in core and has no pgcrypto
    // package; Supabase provides the extension. Strip it for the test only.
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/create extension if not exists pgcrypto;/gi, '')
    await db.exec(sql)
    console.log(`Applied ${file}`)
  }

  const borrowerId = '33333333-3333-3333-3333-333333333333'
  const otherId = '44444444-4444-4444-4444-444444444444'
  const staffId = '22222222-2222-2222-2222-222222222222'

  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'maria@test.local',
             '{"provider":"email"}', $2::jsonb, now(), now())`,
    [
      borrowerId,
      JSON.stringify({
        full_name: 'Maria Santos',
        first_name: 'Maria',
        last_name: 'Santos',
        date_of_birth: '1990-04-12',
        contact_number: '09171234567',
        address: '24 Mabini Street',
        employment_status: 'employed',
        occupation: 'Accounting Staff',
        monthly_income: '32000',
        emergency_contact_name: 'Ramon Santos',
        emergency_contact_number: '09179876543',
      }),
    ],
  )
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'other@test.local',
             '{"provider":"email"}', $2::jsonb, now(), now())`,
    [
      otherId,
      JSON.stringify({
        full_name: 'Jose Ramirez',
        first_name: 'Jose',
        last_name: 'Ramirez',
        date_of_birth: '1985-11-02',
        contact_number: '09182223333',
        address: '88 Rizal Avenue',
        employment_status: 'self_employed',
        occupation: 'Mechanic',
        monthly_income: '45000',
        emergency_contact_name: 'Liza Ramirez',
        emergency_contact_number: '09185556666',
      }),
    ],
  )
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'officer@test.local',
             '{"provider":"email"}', '{"full_name":"Dana Whitfield"}'::jsonb, now(), now())`,
    [staffId],
  )

  const profiles = await one('select count(*)::int as n from public.profiles')
  const borrowers = await one('select count(*)::int as n from public.borrowers')
  check('handle_new_user created 3 profiles', profiles.n === 3, JSON.stringify(profiles))
  check('handle_new_user created 2 borrower rows', borrowers.n === 2, JSON.stringify(borrowers))

  await db.query(`update public.profiles set role = 'super_admin' where id = $1`, [staffId])
  await db.query(`update public.profiles set role = 'loan_officer' where id = $1`, [staffId])

  await db.query(
    `insert into public.loan_types (id, code, name, description, min_amount, max_amount, interest_rate,
       processing_fee_rate, processing_fee_fixed, payment_frequency, term_options, min_term_months, max_term_months)
     values ('a1000000-0000-0000-0000-000000000001', 'QCK', 'Quick Cash', 'Test product', 1000, 10000, 3, 1, 0, 'weekly', '{1,2,3}', 1, 3)`,
  )

  const otherBorrower = await one('select id from public.borrowers where profile_id = $1', [otherId])
  check('seeded second borrower row', Boolean(otherBorrower?.id), JSON.stringify(otherBorrower))

  // ---- RLS: borrower submits an application --------------------------------
  await db.exec(`set role authenticated`)
  await db.query(`select set_config('test.uid', $1, false)`, [borrowerId])

  const ownBorrower = await one('select id from public.borrowers where profile_id = $1', [borrowerId])
  check('current borrower resolved through RLS helper', Boolean(ownBorrower?.id))

  const appRes = await one(
    `insert into public.loan_applications (borrower_id, loan_type_id, requested_amount, purpose, term_months, payment_frequency)
     values ($1, 'a1000000-0000-0000-0000-000000000001', 5000, 'Medical bill for a family member', 1, 'weekly')
     returning id, application_no, interest_amount, processing_fee, total_payable, estimated_installment, status`,
    [ownBorrower.id],
  )
  check('borrower can insert a pending application', appRes?.status === 'pending', JSON.stringify(appRes))
  check('pricing engine computed interest 150.00', Number(appRes.interest_amount) === 150, JSON.stringify(appRes))
  check('pricing engine computed fee 50.00', Number(appRes.processing_fee) === 50, JSON.stringify(appRes))
  check('pricing engine computed total 5200.00', Number(appRes.total_payable) === 5200, JSON.stringify(appRes))
  check('pricing engine computed 4 weekly installments of 1300', Number(appRes.estimated_installment) === 1300, JSON.stringify(appRes))

  await expectError('borrower cannot approve an application', () =>
    db.query(`select public.decide_application($1, 'approved', 'self approval')`, [appRes.id]),
  )

  await expectError('borrower cannot insert an application for someone else', () =>
    db.query(
      `insert into public.loan_applications (borrower_id, loan_type_id, requested_amount, purpose, term_months)
       values ($1, 'a1000000-0000-0000-0000-000000000001', 3000, 'Attempted impersonation', 1)`,
      [otherBorrower.id],
    ),
  )

  await expectError('borrower cannot update application status directly', () =>
    db.query(`update public.loan_applications set status = 'approved' where id = $1`, [appRes.id]),
  )

  await db.query(`update public.profiles set role = 'admin' where id = $1`, [borrowerId])
  const roleAfter = await one('select role from public.profiles where id = $1', [borrowerId])
  check('borrower cannot escalate own role', roleAfter.role === 'borrower', JSON.stringify(roleAfter))

  await expectError('borrower cannot refresh overdue schedules', () =>
    db.query(`select public.refresh_overdue_schedules()`),
  )

  // ---- Staff approval workflow ---------------------------------------------
  await db.query(`select set_config('test.uid', $1, false)`, [staffId])

  const approval = await one(`select public.decide_application($1, 'approved', 'Income verified') as result`, [appRes.id])
  check('staff can approve an application', approval.result?.loan_id, JSON.stringify(approval))

  const loan = await one(`select * from public.loans where application_id = $1`, [appRes.id])
  check('loan record created with approved status', loan.status === 'approved', JSON.stringify(loan))
  check('loan total payable copied correctly', Number(loan.total_payable) === 5200, JSON.stringify(loan))

  await expectError('staff cannot bypass the workflow with a direct loan update', () =>
    db.query(`update public.loans set status = 'active' where id = $1`, [loan.id]),
  )

  await db.query(`select public.advance_application($1, 'for_agreement', null)`, [appRes.id])
  await db.query(`select public.advance_application($1, 'ready_for_disbursement', null)`, [appRes.id])
  const readyLoan = await one(`select status from public.loans where id = $1`, [loan.id])
  check('loan moved to ready_for_disbursement', readyLoan.status === 'ready_for_disbursement', JSON.stringify(readyLoan))

  const disb = await one(
    `select public.disburse_loan($1, 5000, 'cash', 'CASH-001', 'Branch release', current_date) as result`,
    [loan.id],
  )
  check('staff can record a cash disbursement', disb.result?.disbursement_id, JSON.stringify(disb))

  const activeLoan = await one(`select * from public.loans where id = $1`, [loan.id])
  check('loan is active after disbursement', activeLoan.status === 'active', JSON.stringify(activeLoan))
  check('first due date and maturity generated', Boolean(activeLoan.first_due_date && activeLoan.maturity_date), JSON.stringify(activeLoan))

  const schedule = await db.query(
    `select installment_no, due_date, amount_due, amount_paid, status from public.repayment_schedules where loan_id = $1 order by installment_no`,
    [loan.id],
  )
  check('4 weekly installments generated', schedule.rows.length === 4, JSON.stringify(schedule.rows))
  const scheduleTotal = schedule.rows.reduce((sum, row) => sum + Number(row.amount_due), 0)
  check('installments sum to total payable', Math.abs(scheduleTotal - 5200) < 0.01, String(scheduleTotal))

  await expectError('duplicate disbursement is blocked', () =>
    db.query(`select public.disburse_loan($1, 5000, 'cash', null, null, current_date)`, [loan.id]),
  )

  // ---- Payments ------------------------------------------------------------
  const firstAmount = Number(schedule.rows[0].amount_due)
  const pay1 = await one(
    `select public.record_payment($1, $2, 'cash', 'R1', null, current_date) as result`,
    [loan.id, firstAmount],
  )
  check('payment generates a receipt', Boolean(pay1.result?.receipt_no), JSON.stringify(pay1))
  const afterFirst = await db.query(
    `select status, amount_paid from public.repayment_schedules where loan_id = $1 order by installment_no`,
    [loan.id],
  )
  check('oldest installment marked paid', afterFirst.rows[0].status === 'paid', JSON.stringify(afterFirst.rows))
  check('second installment untouched', afterFirst.rows[1].status === 'pending', JSON.stringify(afterFirst.rows))

  await expectError('overpayment beyond remaining balance is blocked', () =>
    db.query(`select public.record_payment($1, 999999, 'cash', null, null, current_date)`, [loan.id]),
  )

  const remaining = Number(activeLoan.total_payable) - Number(afterFirst.rows.reduce((sum, row) => sum + Number(row.amount_paid), 0))
  const pay2 = await one(`select public.record_payment($1, $2, 'gcash', 'R2', null, current_date) as result`, [loan.id, remaining])
  check('final payment completes the loan', pay2.result?.loan_status === 'completed', JSON.stringify(pay2))

  const finalLoan = await one(`select status, amount_paid from public.loans where id = $1`, [loan.id])
  const finalApp = await one(`select status from public.loan_applications where id = $1`, [appRes.id])
  const finalSchedules = await one(
    `select count(*)::int as n from public.repayment_schedules where loan_id = $1 and status = 'paid'`,
    [loan.id],
  )
  check('loan balance equals total payable', Math.abs(Number(finalLoan.amount_paid) - 5200) < 0.01, JSON.stringify(finalLoan))
  check('loan status completed', finalLoan.status === 'completed', JSON.stringify(finalLoan))
  check('application status completed', finalApp.status === 'completed', JSON.stringify(finalApp))
  check('all installments paid', finalSchedules.n === 4, JSON.stringify(finalSchedules))

  await expectError('payment on completed loan is blocked', () =>
    db.query(`select public.record_payment($1, 10, 'cash', null, null, current_date)`, [loan.id]),
  )

  // ---- Dashboards + audit --------------------------------------------------
  const stats = await one('select public.dashboard_stats() as stats')
  check('dashboard_stats returns staff aggregates', Number(stats.stats.total_borrowers) === 2, JSON.stringify(stats.stats))
  check('dashboard_stats total collected = 5200', Number(stats.stats.total_collected) === 5200, JSON.stringify(stats.stats))

  const trends = await db.query('select * from public.financial_trends()')
  check('financial_trends returns 6 months', trends.rows.length === 6, JSON.stringify(trends.rows))

  const officerAudit = await one(`select count(*)::int as n from public.audit_logs`)
  check('loan officer cannot read audit logs', officerAudit.n === 0, JSON.stringify(officerAudit))

  await db.exec(`reset role`)
  const auditCount = await one(`select count(*)::int as n from public.audit_logs`)
  check('audit trail recorded workflow events', auditCount.n >= 4, JSON.stringify(auditCount))
  await db.exec(`set role authenticated`)

  // ---- Cross-borrower isolation --------------------------------------------
  await db.query(`select set_config('test.uid', $1, false)`, [otherId])
  const visibleApps = await one('select count(*)::int as n from public.loan_applications')
  const visibleLoans = await one('select count(*)::int as n from public.loans')
  const visibleSchedules = await one('select count(*)::int as n from public.repayment_schedules')
  const visibleAudit = await one('select count(*)::int as n from public.audit_logs')
  check('other borrower cannot see applications', visibleApps.n === 0, JSON.stringify(visibleApps))
  check('other borrower cannot see loans', visibleLoans.n === 0, JSON.stringify(visibleLoans))
  check('other borrower cannot see schedules', visibleSchedules.n === 0, JSON.stringify(visibleSchedules))
  check('borrower cannot read audit logs', visibleAudit.n === 0, JSON.stringify(visibleAudit))

  const ownVisible = await db.query(
    `select count(*)::int as n from public.loan_applications where borrower_id = (select public.current_borrower_id())`,
  )
  check('RLS scope resolves for the signed-in borrower', ownVisible.rows[0].n === 0, JSON.stringify(ownVisible.rows))

  await db.query(`select set_config('test.uid', $1, false)`, [staffId])
  const staffApps = await one('select count(*)::int as n from public.loan_applications')
  check('staff sees all applications', staffApps.n === 1, JSON.stringify(staffApps))

  // ---- Deactivated staff lose access immediately ---------------------------
  await db.exec(`reset role`)
  // Clear the simulated JWT so the profile guard does not block the update
  // (in production this update runs through the service-role Edge Function).
  await db.query(`select set_config('test.uid', '', false)`)
  await db.query(`update public.profiles set is_active = false where id = $1`, [staffId])
  await db.exec(`set role authenticated`)
  await db.query(`select set_config('test.uid', $1, false)`, [staffId])
  const disabledApps = await one('select count(*)::int as n from public.loan_applications')
  check('deactivated staff are treated as anon by RLS', disabledApps.n === 0, JSON.stringify(disabledApps))
  await expectError('deactivated staff cannot call workflow RPCs', () =>
    db.query(`select public.advance_application($1, 'for_agreement', null)`, [appRes.id]),
  )
} catch (err) {
  failures += 1
  console.error('HARNESS ERROR:', err)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
