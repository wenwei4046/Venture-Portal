// Local PostgreSQL regression for a member's claim decided in Member Services
// (2026-10-08). The migration runs VERBATIM against a synthetic surrounding
// schema; what is under test is the money path: which payroll month a claim's
// pay line lands in, the payment request Finance turns into a voucher, a claim
// moving with its voucher and its payroll row, and Comm Cal's pencil leaving a
// claim's line alone. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1)
const FIN = id(2)
const MEMBER = id(3)
const REVENUE = id(10)
const FINANCE = id(11)
const FAIR = id(20)
const IR = id(21)
const ANTHONY = id(30) // Revenue, based in Fair
const IRENE = id(31) // Revenue, based in IR (no cutover)
const OSCAR = id(32) // Finance — not on the Revenue payroll
const BANK = id(40)
const OLD_BANK = id(41)

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

async function as(user, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}

// The repo's own text, as production has it: LF line endings whatever this
// checkout's git turned them into (the migration's guard compares md5s).
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const match = new RegExp(
    `create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`,
    'i',
  ).exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

let requestCount = 0
/** A member claim as member_submit_request leaves it: a pending benefit claim and a submitted request. */
async function memberClaim({ staff = ANTHONY, sub = FAIR, submittedAt = '2026-09-10 10:00+08', amount = 220, description = 'Airbnb · 2 pax × 1 night' } = {}) {
  // Written under whoever is acting — every table is writable here — so the
  // caller's session (HR, mid-review) is left as it was.
  const claim = await one(
    `INSERT INTO claims(claim_type, claimant_name, department_id, amount, description, status, source_pool, created_by)
     SELECT 'benefit', s.employee_name, s.department_id, $2, $3, 'pending', 'venture_pool', $4
       FROM hr_staff_costs s WHERE s.id = $1 RETURNING id`,
    [staff, amount, description, MEMBER],
  )
  requestCount++
  const request = await one(
    `INSERT INTO member_requests(created_by, staff_id, sub_department_id, kind, status, title, detail, claim_id, request_no, submitted_at)
     VALUES ($1, $2, $3, 'claim', 'submitted', 'Claim', '{}'::jsonb, $4, $5, $6::timestamptz) RETURNING id`,
    [MEMBER, staff, sub, claim, `RQ-2609-${String(requestCount).padStart(3, '0')}`, submittedAt],
  )
  return { claim, request }
}

const decide = (request, action, data = {}) =>
  one('SELECT member_admin_action($1, $2, $3::jsonb)', [action, request, JSON.stringify(data)])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;

    CREATE TABLE users(id uuid PRIMARY KEY, role text NOT NULL, name text);
    INSERT INTO users VALUES ('${HR}', 'hr', 'HR Manager'), ('${FIN}', 'finance', 'Finance Manager'), ('${MEMBER}', 'revenue_member', 'Anthony');
    -- The two gates the code under test asks: HR's request management, Finance's treasury.
    CREATE FUNCTION member_is_manager(text) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('hr', 'principal')) $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
              AND (role = 'principal' OR ($1 = 'treasury' AND role = 'finance'))) $$;
    CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('hr', 'principal')) $$;

    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL, payroll_source text NOT NULL);
    INSERT INTO departments VALUES ('${REVENUE}', 'Revenue Department', 'commission'), ('${FINANCE}', 'Finance', 'imported');
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL);
    INSERT INTO comm_sub_departments VALUES ('${FAIR}', 'Fair'), ('${IR}', 'IR');
    CREATE TABLE comm_cutovers(sub_department_id uuid PRIMARY KEY, first_paid_month date NOT NULL);
    INSERT INTO comm_cutovers VALUES ('${FAIR}', '2026-09-01');
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid NOT NULL);
    INSERT INTO hr_staff_costs VALUES ('${ANTHONY}', 'ANTHONY', '${REVENUE}'), ('${IRENE}', 'IRENE', '${REVENUE}'),
      ('${OSCAR}', 'OSCAR', '${FINANCE}');

    CREATE TABLE period_locks(period_month date NOT NULL, is_locked boolean NOT NULL DEFAULT true);
    CREATE TABLE payroll_month_closes(period_month date PRIMARY KEY);
    CREATE FUNCTION payroll_month_closed(p_period date) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT EXISTS (SELECT 1 FROM payroll_month_closes WHERE period_month = p_period) $$;
    CREATE FUNCTION assert_commission_payroll_open(p_period date) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = p_period AND is_locked) THEN
        RAISE EXCEPTION 'Period is closed';
      END IF;
    END $$;

    CREATE TYPE hr_monthly_payroll_source AS ENUM ('imported', 'manual', 'carried_forward', 'commission');
    CREATE TYPE hr_monthly_payroll_status AS ENUM ('draft', 'completed', 'submitted', 'paid');
    CREATE TABLE hr_monthly_payroll(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL, period_month date NOT NULL,
      source hr_monthly_payroll_source NOT NULL DEFAULT 'commission',
      status hr_monthly_payroll_status NOT NULL DEFAULT 'draft',
      pay_line_earnings numeric(15,2) NOT NULL DEFAULT 0, pay_line_deductions numeric(15,2) NOT NULL DEFAULT 0,
      UNIQUE (staff_id, period_month));

    -- revenue_pay_lines as 20260927060000 made it.
    CREATE TABLE revenue_pay_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      period_month date NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
      kind text NOT NULL CHECK (kind IN ('special_claim', 'allowance', 'incentive', 'deduction')),
      description text CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 200),
      amount numeric(15,2) NOT NULL CHECK (amount > 0),
      sort_order integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now());

    CREATE TYPE claim_type AS ENUM ('project', 'benefit');
    CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
    CREATE TABLE claims(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_type claim_type NOT NULL, claimant_name text NOT NULL,
      department_id uuid, amount numeric NOT NULL, description text, receipt_url text,
      status claim_status NOT NULL DEFAULT 'pending', approved_by uuid, approved_at timestamptz,
      payroll_month date, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
      source_pool text, voucher_id uuid);

    CREATE TABLE member_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, staff_id uuid,
      sub_department_id uuid, kind text NOT NULL, status text NOT NULL, title text, detail jsonb NOT NULL DEFAULT '{}',
      claim_id uuid, note text, allocated_staff_id uuid, reserved_at timestamptz, reservation_expires_at timestamptz,
      reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz, request_no text);

    CREATE TABLE bank_accounts(id uuid PRIMARY KEY, bank_name text NOT NULL, status text NOT NULL);
    INSERT INTO bank_accounts VALUES ('${BANK}', 'Maybank', 'active'), ('${OLD_BANK}', 'Closed', 'inactive');
    CREATE TYPE payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid', 'voided');
    CREATE TYPE payment_voucher_type AS ENUM ('expense', 'claim_payout', 'other');
    CREATE TABLE payment_vouchers(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_no text, voucher_type payment_voucher_type NOT NULL,
      status payment_voucher_status NOT NULL DEFAULT 'draft', amount numeric NOT NULL, payee_name text NOT NULL,
      bank_account_id uuid, reference_type text, reference_id uuid, description text NOT NULL,
      payment_method text NOT NULL DEFAULT 'bank_transfer', payment_date date, direction text NOT NULL DEFAULT 'debit',
      source_pool text, created_by uuid NOT NULL,
      CONSTRAINT voucher_requires_bank CHECK (status NOT IN ('paid', 'pending_approval')
        OR coalesce(payment_method, '') = 'netting' OR bank_account_id IS NOT NULL));
    CREATE TABLE payment_voucher_sources(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL, pool text NOT NULL,
      amount numeric NOT NULL, account_code varchar NOT NULL);
    CREATE TYPE approval_request_type AS ENUM ('payment_voucher', 'dept_payment_request');
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
    CREATE TYPE approval_workflow_state AS ENUM ('submitted', 'approved', 'rejected');
    CREATE TABLE approval_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type approval_request_type NOT NULL,
      reference_id uuid NOT NULL, reference_table text NOT NULL, submitted_by uuid NOT NULL,
      description text, amount numeric, status approval_status NOT NULL DEFAULT 'pending',
      workflow_state approval_workflow_state NOT NULL DEFAULT 'submitted');

    CREATE TABLE access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, resource_type text,
      resource_id text, action text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());

    -- The writer and the two functions member_admin_action is replaced over, as production had them.
    CREATE FUNCTION member_reserve_waiting(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  `)
  await productionFunction('20260927060000_revenue_pay_lines', 'revenue_pay_line_totals')
  await productionFunction('20260912050000_member_hr_management', 'member_admin_action')
  await productionFunction('20260927060000_revenue_pay_lines', 'revenue_save_pay_lines')
  await productionFunction('20261005030000_member_requests_numbers_claims', 'member_request_json')

  // ── The migration, verbatim ───────────────────────────────────────────────
  await db.exec(await migrationText('20261008100000_member_claims_decided_in_member_services'))
  await db.exec(`
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION member_admin_action(text, uuid, jsonb), revenue_save_pay_lines(uuid, date, jsonb, jsonb) TO authenticated;
  `)

  // ── Only HR decides, and only through member_admin_action ────────────────
  const first = await memberClaim()
  await as(FIN)
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['approve', first.request, '{"route":"payroll"}'],
    /HR request management access is required/, 'Finance cannot decide a member claim')
  await reject('SELECT member_review_claim($1, $2, $3::jsonb)', [first.request, 'approve', '{"route":"payroll"}'],
    /permission denied/, 'the decision function is not callable on its own')
  await as(HR)
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['approve', first.request, '{}'],
    /Choose how the claim is paid/, 'an approval names where the money comes from')
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['approve', first.request, '{"route":"cash"}'],
    /Choose how the claim is paid/, 'only payroll or payment')

  // ── Into the payroll: the month it was submitted ─────────────────────────
  let json = await decide(first.request, 'approve', { route: 'payroll' })
  check(json.status, 'approved', 'the request reads approved')
  check(json.payout, { route: 'payroll', payrollMonth: '2026-09-01', voucherNo: null, voucherStatus: null }, 'and says which payroll month')
  await as(null, null)
  check(await q('SELECT status::text, payout_route, payroll_month::text FROM claims WHERE id = $1', [first.claim]),
    [{ status: 'approved', payout_route: 'payroll', payroll_month: '2026-09-01' }], 'the claim is approved into September')
  check(await q('SELECT period_month::text, kind, amount::text, description, claim_id = $1 AS linked FROM revenue_pay_lines WHERE staff_id = $2',
    [first.claim, ANTHONY]),
  [{ period_month: '2026-09-01', kind: 'special_claim', amount: '220.00', description: 'RQ-2609-001 · Airbnb · 2 pax × 1 night', linked: true }],
  'one special-claim line, described from the claim')
  check(await one("SELECT count(*)::int FROM access_log WHERE action = 'claim_line'"), 1, 'the line is logged')
  await as(HR)
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['approve', first.request, '{"route":"payroll"}'],
    /already been decided/, 'a claim is approved once')
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['reject', first.request, '{"note":"no"}'],
    /already been decided/, 'and not rejected after')

  // A month before the cutover is not one the portal pays: the line waits for September.
  const august = await memberClaim({ submittedAt: '2026-08-20 09:00+08', amount: 150 })
  json = await decide(august.request, 'approve', { route: 'payroll' })
  check(json.payout.payrollMonth, '2026-09-01', 'an August claim lands in the first month the portal pays')
  // A sub-department without a cutover keeps its own month.
  const irene = await memberClaim({ staff: IRENE, sub: IR, submittedAt: '2026-08-20 09:00+08', amount: 90 })
  json = await decide(irene.request, 'approve', { route: 'payroll' })
  check(json.payout.payrollMonth, '2026-08-01', 'no cutover: the month it was submitted')

  // A draft row takes the new totals at once.
  await as(null, null)
  await q("INSERT INTO hr_monthly_payroll(staff_id, period_month, status) VALUES ($1, '2026-10-01', 'draft')", [ANTHONY])
  const october = await memberClaim({ submittedAt: '2026-10-02 09:00+08', amount: 75.5 })
  await as(HR)
  json = await decide(october.request, 'approve', { route: 'payroll' })
  check(json.payout.payrollMonth, '2026-10-01', 'October, where the draft row is')
  await as(null, null)
  check(await one("SELECT pay_line_earnings::text FROM hr_monthly_payroll WHERE staff_id = $1 AND period_month = '2026-10-01'", [ANTHONY]),
    '75.50', 'the draft row carries the claim at once')

  // A month that has moved on for this person sends the line to the next one open.
  await q("UPDATE hr_monthly_payroll SET status = 'completed' WHERE staff_id = $1 AND period_month = '2026-10-01'", [ANTHONY])
  const late = await memberClaim({ submittedAt: '2026-10-20 09:00+08', amount: 60 })
  await as(HR)
  json = await decide(late.request, 'approve', { route: 'payroll' })
  check(json.payout.payrollMonth, '2026-11-01', 'October completed for him: November')
  // So does a month locked for the accounts, or closed for good.
  await as(null, null)
  await q("INSERT INTO period_locks(period_month) VALUES ('2026-11-01')")
  await q("INSERT INTO payroll_month_closes(period_month) VALUES ('2026-12-01')")
  const locked = await memberClaim({ submittedAt: '2026-11-03 09:00+08', amount: 40 })
  await as(HR)
  json = await decide(locked.request, 'approve', { route: 'payroll' })
  check(json.payout.payrollMonth, '2027-01-01', 'November locked, December closed: January')

  // Not on the Revenue payroll: no pay line, a payment from Finance instead.
  const oscar = await memberClaim({ staff: OSCAR, sub: FAIR, amount: 30 })
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['approve', oscar.request, '{"route":"payroll"}'],
    /not paid through the Revenue payroll/, 'a non-Revenue claimant cannot take the payroll route')

  // ── Rejected, with a reason ──────────────────────────────────────────────
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['reject', oscar.request, '{}'],
    /Say why/, 'a rejection says why')
  json = await decide(oscar.request, 'reject', { note: 'Not an outstation fair' })
  check([json.status, json.note], ['rejected', 'Not an outstation fair'], 'rejected with its reason')
  await as(null, null)
  check(await one('SELECT status::text FROM claims WHERE id = $1', [oscar.claim]), 'rejected', 'and so is the claim')

  // Asking for more information still works the way it did.
  const info = await memberClaim({ amount: 10 })
  await as(HR)
  await reject('SELECT member_admin_action($1, $2, $3::jsonb)', ['needs_info', info.request, '{}'],
    /Return the claim with a note/, 'needs info needs a note')
  json = await decide(info.request, 'needs_info', { note: 'Attach the invoice' })
  check(json.status, 'needs_info', 'returned for information')

  // ── A payment request: Finance raises the voucher ────────────────────────
  const pay = await memberClaim({ amount: 450, description: 'Plane ticket · KL → Kuching' })
  await as(HR)
  json = await decide(pay.request, 'approve', { route: 'payment', note: 'Ticket checked' })
  check(json.payout, { route: 'payment', payrollMonth: null, voucherNo: null, voucherStatus: null }, 'waiting for Finance')
  await as(null, null)
  check(await one('SELECT count(*)::int FROM revenue_pay_lines WHERE claim_id = $1', [pay.claim]), 0, 'no pay line for a payment')
  check(await one('SELECT count(*)::int FROM payment_vouchers'), 0, 'and no voucher until Finance raises it')

  // Finance's queue names the request — which Finance cannot read itself.
  await as(FIN)
  check(await q('SELECT claim_type, claimant_name, department, amount::text, request_no, voucher_id FROM claim_payment_queue()'),
    [{ claim_type: 'benefit', claimant_name: 'ANTHONY', department: 'Revenue Department', amount: '450', request_no: 'RQ-2609-009', voucher_id: null }],
    'one payment request waits for Finance; payroll claims never appear')
  await as(HR)
  check(await q('SELECT * FROM claim_payment_queue()'), [], 'the queue is Finance\'s alone')
  await reject('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, BANK, 'bank_transfer'],
    /Only Finance/, 'HR does not raise the voucher')
  await as(FIN)
  await reject('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, BANK, 'netting'],
    /bank transfer, cheque or cash/, 'a real payment method')
  await reject('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, OLD_BANK, 'bank_transfer'],
    /active bank account/, 'from an active bank')
  await reject('SELECT claim_create_payment_voucher($1, $2, $3)', [first.claim, BANK, 'bank_transfer'],
    /paid with the payroll/, 'a payroll claim is never also paid by voucher')
  const pv = await one('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, BANK, 'bank_transfer'])
  await as(null, null)
  check(await q(`SELECT voucher_no ~ '^HV-PV-[0-9]{6}-0001$' AS numbered, voucher_type::text, status::text, amount::text,
                        payee_name, bank_account_id = $2 AS bank, source_pool, reference_type, reference_id = $3 AS ref,
                        description FROM payment_vouchers WHERE id = $1`, [pv, BANK, pay.claim]),
  [{ numbered: true, voucher_type: 'claim_payout', status: 'pending_approval', amount: '450', payee_name: 'ANTHONY',
    bank: true, source_pool: 'venture_pool', reference_type: 'claim', ref: true,
    description: 'Claim payout: ANTHONY — RQ-2609-009 · Plane ticket · KL → Kuching' }],
  'a claim payout voucher waiting for the Principal')
  check(await q('SELECT pool, amount::text, account_code FROM payment_voucher_sources WHERE voucher_id = $1', [pv]),
    [{ pool: 'venture_pool', amount: '450', account_code: '9000' }], 'charged to its pool, G&A')
  check(await one("SELECT count(*)::int FROM approval_requests WHERE reference_id = $1 AND status = 'pending'", [pv]), 1,
    'in the Principal\'s queue')
  check(await one('SELECT voucher_id = $2 FROM claims WHERE id = $1', [pay.claim, pv]), true, 'the claim knows its voucher')
  await as(FIN)
  await reject('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, BANK, 'bank_transfer'],
    /not waiting for a payment voucher/, 'one voucher per claim')
  check(await q('SELECT voucher_status FROM claim_payment_queue()'), [{ voucher_status: 'pending_approval' }],
    'raised: it waits for the Principal')

  // ── The claim moves with its money ───────────────────────────────────────
  await as(null, null)
  await q("UPDATE payment_vouchers SET status = 'paid' WHERE id = $1", [pv])
  check(await one('SELECT status::text FROM claims WHERE id = $1', [pay.claim]), 'paid', 'voucher paid: claim paid')
  json = await one('SELECT member_request_json($1)', [pay.request])
  check([json.status, json.payout.voucherStatus], ['paid', 'paid'], 'the request reads paid, with its voucher')
  // Voided (reversed): the money came back, so the claim waits for a new voucher.
  await q("UPDATE payment_vouchers SET status = 'voided' WHERE id = $1", [pv])
  check(await q('SELECT status::text, voucher_id FROM claims WHERE id = $1', [pay.claim]),
    [{ status: 'approved', voucher_id: null }], 'voided: back to Finance\'s queue')
  await as(FIN)
  const second = await one('SELECT claim_create_payment_voucher($1, $2, $3)', [pay.claim, BANK, 'cheque'])
  await as(null, null)
  check(await one('SELECT voucher_no FROM payment_vouchers WHERE id = $1', [second]).then(no => no.endsWith('-0002')), true,
    'a fresh voucher, the next number')

  // A pool claim whose voucher was voided can be raised again too.
  const pool = await one(`INSERT INTO claims(claim_type, claimant_name, amount, description, status, source_pool, created_by)
    VALUES ('project', 'MARKETING', 80, 'Booth banner', 'approved', 'dept_pool_marketing', $1) RETURNING id`, [FIN])
  await as(FIN)
  const poolPv = await one('SELECT claim_create_payment_voucher($1, $2, $3)', [pool, BANK, 'bank_transfer'])
  await as(null, null)
  check(await one('SELECT pool FROM payment_voucher_sources WHERE voucher_id = $1', [poolPv]), 'dept_pool_marketing',
    'a pool claim pays from its own pool')

  // The payroll row paid: its claims are paid.
  await q("INSERT INTO hr_monthly_payroll(staff_id, period_month, status) VALUES ($1, '2026-09-01', 'draft')", [ANTHONY])
  await q("UPDATE hr_monthly_payroll SET status = 'submitted' WHERE staff_id = $1 AND period_month = '2026-09-01'", [ANTHONY])
  check(await one('SELECT status::text FROM claims WHERE id = $1', [first.claim]), 'approved', 'submitted is not paid')
  await q("UPDATE hr_monthly_payroll SET status = 'paid' WHERE staff_id = $1 AND period_month = '2026-09-01'", [ANTHONY])
  check(await q("SELECT status::text FROM claims WHERE id IN ($1, $2) ORDER BY created_at", [first.claim, august.claim]),
    [{ status: 'paid' }, { status: 'paid' }], 'both September lines paid with the row')
  check(await one('SELECT status::text FROM claims WHERE id = $1', [october.claim]), 'approved', 'October\'s is not')
  await q("UPDATE hr_monthly_payroll SET status = 'draft' WHERE staff_id = $1 AND period_month = '2026-09-01'", [ANTHONY])
  check(await one('SELECT status::text FROM claims WHERE id = $1', [first.claim]), 'paid', 'reopened for a second payroll: still paid')

  // ── Comm Cal's pencil leaves a claim's line alone ────────────────────────
  // October is completed for him; reopen it to draft to edit.
  await q("UPDATE hr_monthly_payroll SET status = 'draft' WHERE staff_id = $1 AND period_month = '2026-10-01'", [ANTHONY])
  const seen = async () => (await q("SELECT id::text || ':' || version AS t FROM revenue_pay_lines WHERE staff_id = $1 AND period_month = '2026-10-01'", [ANTHONY])).map(r => r.t)
  const claimLine = await one("SELECT id FROM revenue_pay_lines WHERE claim_id = $1", [october.claim])
  await as(HR)
  const save = (lines, seenTokens) => q('SELECT revenue_save_pay_lines($1, $2, $3::jsonb, $4::jsonb) AS r',
    [ANTHONY, '2026-10-01', JSON.stringify(lines), JSON.stringify(seenTokens)])
  await as(null, null)
  const opened = await seen()
  await as(HR)
  await save([{ id: null, kind: 'allowance', description: 'Phone', amount: 50 }], opened)
  await as(null, null)
  check(await q("SELECT kind, amount::text, claim_id IS NOT NULL AS from_claim FROM revenue_pay_lines WHERE staff_id = $1 AND period_month = '2026-10-01' ORDER BY kind", [ANTHONY]),
    [{ kind: 'allowance', amount: '50.00', from_claim: false }, { kind: 'special_claim', amount: '75.50', from_claim: true }],
    'saving the editor\'s lines keeps the claim\'s line')
  check(await one("SELECT pay_line_earnings::text FROM hr_monthly_payroll WHERE staff_id = $1 AND period_month = '2026-10-01'", [ANTHONY]),
    '125.50', 'and the row counts both')
  const reopened = await seen()
  await as(HR)
  await assert.rejects(() => save([{ id: claimLine, kind: 'special_claim', description: 'RQ-2609-004 · Airbnb · 2 pax × 1 night', amount: 999 }], reopened),
    /came from an approved claim/, 'a claim line cannot be changed by hand'); checks++
  await save([
    { id: claimLine, kind: 'special_claim', description: 'RQ-2609-004 · Airbnb · 2 pax × 1 night', amount: 75.5 },
  ], reopened)
  await as(null, null)
  check(await one('SELECT count(*)::int FROM revenue_pay_lines WHERE id = $1', [claimLine]), 1, 'sent back unchanged it stays')
  await as(HR)
  await assert.rejects(() => save([], []), /changed since you opened them/,
    'an editor that never saw the claim line is stale'); checks++

  console.log(`Member claim checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}
