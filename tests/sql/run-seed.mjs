// ===========================================================================
//  Seed data validation for the CashBridge database.
//
//  Applies the migrations + supabase/seed.sql to an in-memory PostgreSQL and
//  verifies the demo accounts, products, applications, active loan, schedule
//  and payment are all present and internally consistent. Also re-runs the
//  seed to prove it is idempotent.
//
//  Run with:  npm run test:sql
// ===========================================================================
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const SEED = join(ROOT, 'supabase', 'seed.sql')

const db = new PGlite()
let failures = 0

function check(name, condition, extra = '') {
  if (condition) console.log(`PASS  ${name}`)
  else {
    failures += 1
    console.log(`FAIL  ${name} ${extra}`)
  }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]

try {
  await db.exec(`
    create schema auth;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud text, role text, email text unique,
      encrypted_password text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      created_at timestamptz, updated_at timestamptz
    );
    create table auth.identities (
      id uuid primary key, user_id uuid, provider_id text, identity_data jsonb,
      provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role anon;
    create role authenticated;
    -- pgcrypto stand-ins (Supabase provides the real ones)
    create or replace function crypt(text, text) returns text language sql immutable as $$ select $1 $$;
    create or replace function gen_salt(text) returns text language sql immutable as $$ select 'salt' $$;
  `)

  for (const file of [
    '20260101000000_schema.sql',
    '20260101000100_functions.sql',
    '20260101000200_rls.sql',
  ]) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/create extension if not exists pgcrypto;/gi, '')
    await db.exec(sql)
  }
  console.log('Migrations applied')

  await db.exec(readFileSync(SEED, 'utf8'))
  console.log('Seed applied\n')

  const users = await one(`select count(*)::int as n from auth.users`)
  check('seed created 4 auth users', users.n === 4, JSON.stringify(users))

  const profiles = await db.query(`select email, role, full_name from public.profiles order by email`)
  check('seed created 4 profiles', profiles.rows.length === 4, JSON.stringify(profiles.rows))
  const admin = profiles.rows.find((row) => row.email === 'admin@cashloan.test')
  const officer = profiles.rows.find((row) => row.email === 'officer@cashloan.test')
  const maria = profiles.rows.find((row) => row.email === 'maria@example.test')
  check('admin profile has super_admin role', admin?.role === 'super_admin', JSON.stringify(admin))
  check('officer profile has loan_officer role', officer?.role === 'loan_officer', JSON.stringify(officer))
  check('borrower profile keeps borrower role', maria?.role === 'borrower', JSON.stringify(maria))

  const borrowers = await db.query(`select borrower_code, email, first_name, last_name from public.borrowers order by email`)
  check('seed created 2 borrower rows', borrowers.rows.length === 2, JSON.stringify(borrowers.rows))
  check('borrowers received generated codes', borrowers.rows.every((row) => /^BRW-/.test(row.borrower_code ?? '')), JSON.stringify(borrowers.rows))

  const types = await one(`select count(*)::int as n from public.loan_types`)
  check('seed created 4 loan types', types.n === 4, JSON.stringify(types))

  const apps = await db.query(`select application_no, status from public.loan_applications order by id`)
  check('seed created 4 applications', apps.rows.length === 4, JSON.stringify(apps.rows))
  check(
    'applications cover pending / under review / ready / active',
    ['pending', 'under_review', 'ready_for_disbursement', 'active'].every((status) =>
      apps.rows.some((row) => row.status === status),
    ),
    JSON.stringify(apps.rows),
  )

  const pricing = await one(
    `select requested_amount, interest_amount, processing_fee, total_payable
     from public.loan_applications where id = 'b1000000-0000-0000-0000-000000000001'`,
  )
  check(
    'pricing trigger computed the pending application',
    Number(pricing.interest_amount) === 150 &&
      Number(pricing.processing_fee) === 50 &&
      Number(pricing.total_payable) === 5200,
    JSON.stringify(pricing),
  )

  const loans = await db.query(`select loan_no, status, amount_paid, total_payable from public.loans order by id`)
  check('seed created 2 loans', loans.rows.length === 2, JSON.stringify(loans.rows))
  const activeLoan = loans.rows.find((row) => row.status === 'active')
  check('active loan has ₱1,200 paid', Number(activeLoan?.amount_paid) === 1200, JSON.stringify(activeLoan))

  const schedules = await db.query(
    `select installment_no, amount_due, amount_paid, status, due_date
     from public.repayment_schedules where loan_id = 'd1000000-0000-0000-0000-000000000004'
     order by installment_no`,
  )
  check('active loan has 4 installments', schedules.rows.length === 4, JSON.stringify(schedules.rows))
  check('first installment reflects the partial payment', Number(schedules.rows[0].amount_paid) === 1200, JSON.stringify(schedules.rows[0]))
  check(
    'installments sum to total payable',
    Math.abs(schedules.rows.reduce((sum, row) => sum + Number(row.amount_due), 0) - Number(activeLoan.total_payable)) < 0.01,
    JSON.stringify(schedules.rows),
  )
  check(
    'overdue refresh flagged past-due installments',
    schedules.rows.some((row) => row.status === 'overdue'),
    JSON.stringify(schedules.rows.map((row) => row.status)),
  )

  const payments = await one(`select count(*)::int as n from public.payment_records`)
  check('seed created 1 payment record', payments.n === 1, JSON.stringify(payments))

  const disbursements = await one(`select count(*)::int as n from public.loan_disbursements`)
  check('seed created 1 disbursement', disbursements.n === 1, JSON.stringify(disbursements))

  const audit = await db.query(`select action from public.audit_logs`)
  check(
    'seed recorded disbursement + payment audit entries',
    audit.rows.some((row) => row.action === 'loan.disbursed') &&
      audit.rows.some((row) => row.action === 'payment.recorded'),
    JSON.stringify(audit.rows),
  )
  check(
    'application trigger audited seeded submissions',
    audit.rows.filter((row) => row.action === 'application.submitted').length === 4,
    JSON.stringify(audit.rows),
  )

  // Idempotency: re-running the seed must not duplicate rows or fail.
  await db.exec(readFileSync(SEED, 'utf8'))
  const again = await one(`select
      (select count(*) from auth.users)::int as users,
      (select count(*) from public.loan_types)::int as types,
      (select count(*) from public.loan_applications)::int as apps,
      (select count(*) from public.loans)::int as loans`)
  check(
    'seed is idempotent on re-run',
    again.users === 4 && again.types === 4 && again.apps === 4 && again.loans === 2,
    JSON.stringify(again),
  )
} catch (err) {
  failures += 1
  console.error('SEED HARNESS ERROR:', err.message)
}

console.log(`\n${failures === 0 ? 'ALL SEED CHECKS PASSED' : `${failures} SEED CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
