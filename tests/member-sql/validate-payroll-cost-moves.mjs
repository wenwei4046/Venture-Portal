// Local PostgreSQL regression for part of a person's payroll cost billed to another department (2026-11-03). The user:
// Director Office's Vivian, "我打算split RM 3000 是由hr pool 承担， 然后hr 那边再根据他department 的percentage bill 去给每个公司",
// "可能往后也会别的department bill 去别的department", and of the two ways shown, "对，我决定还是要方法b" — the move is
// billed by an automatic internal invoice, payroll's funding and accrual untouched (spec
// docs/superpowers/specs/2026-11-03-payroll-cost-to-department-design.md).
//
// 20261103200000 runs VERBATIM over stand-ins for what it reads and writes — the departments and their accounts, the
// roster, the month's payroll rows, the company splits with production's own guard
// (guard_staff_allocation_follows_payroll, 20260930050000, loaded from its migration), hr_pool_allocation as production
// holds it, and the permission registries. What is under test: a department line takes an amount or a percentage;
// it follows the company split's lock (a draft row only, a Resubmit opening it again, never a month closed for good);
// a centralized person may move cost to a department though never split it to a company; no line to the person's own
// department, to Venture Office or to a department with no pool; the receivers' monthly Bill to % (hr_pool_allocation)
// can be deleted and set again, never for a centralized, internal or pool-less department nor in a closed month; and
// every department with a pool has its "Inter-billing - <name>" expense account, IT's added and a department
// provisioned later given one. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const lf = text => text.replace(/\r\n/g, '\n')
const load = async f => db.exec(lf(await readFile(new URL(f, migrations), 'utf8')))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

// A function as a migration file holds it — CREATE … through its closing tag.
async function productionFunction(migration, name) {
  const sql = lf(await readFile(new URL(`${migration}.sql`, migrations), 'utf8'))
  const match = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const MIGRATION = '20261103200000_payroll_cost_moves.sql'
const HR_USER = id(1)
const HR = id(11)
const FIN = id(12)
const DIRO = id(13)
const IT = id(14)
const MKT = id(15)
const REV = id(16)
const VO = id(17)
const LEAD = id(18)
const OPS = id(19)
const LATE = '0000000f-0000-4000-8000-00000000000f'
const C2990 = id(31)
const CAR = id(32)
const CONTS = id(33)
const KEN = id(45)
const VIVIAN = id(41)
const AMIRUL = id(42)
const SALLY = id(43)
const NOBODY = id(44)
const LENA = id(46)
const NOV = '2026-11-01'

const MOVE = `INSERT INTO hr_staff_dept_moves (staff_id, period_month, department_id, amount, pct, created_by)
  VALUES ($1, $2, $3, $4, $5, '${HR_USER}')`
const BILL_TO = `INSERT INTO hr_pool_allocation (department_id, company_id, period_month, split_pct, created_by)
  VALUES ($1, $2, $3, $4, '${HR_USER}')`
/** The payroll's own step, as its functions run it (app.payroll_lifecycle set). */
const payrollStatus = (staff, status) =>
  db.exec(`SELECT set_config('app.payroll_lifecycle', 'test', false);
    UPDATE hr_monthly_payroll SET status = '${status}' WHERE staff_id = '${staff}' AND period_month = '${NOV}';
    SELECT set_config('app.payroll_lifecycle', '', false);`)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
    CREATE TABLE permission_table_reads(table_name text PRIMARY KEY, actions text[] NOT NULL);
    CREATE TABLE permission_table_writes(table_name text, command text, actions text[] NOT NULL, PRIMARY KEY (table_name, command));
    CREATE TABLE guard_runs(kind text, table_name text);
    CREATE FUNCTION public.permission_writes_guard(p_table text) RETURNS void LANGUAGE sql AS
      $$ INSERT INTO guard_runs VALUES ('writes', p_table) $$;
    CREATE FUNCTION public.permission_reads_guard(p_table text) RETURNS void LANGUAGE sql AS
      $$ INSERT INTO guard_runs VALUES ('reads', p_table) $$;

    CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
    CREATE TYPE cash_flow_category AS ENUM ('operating', 'investing', 'financing', 'non_cash');
    CREATE TABLE chart_of_accounts(code varchar PRIMARY KEY, name text NOT NULL, type account_type NOT NULL, parent_code varchar,
      is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 100, cash_flow_category cash_flow_category NOT NULL,
      is_internal_fund boolean NOT NULL DEFAULT false);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL, is_internal boolean NOT NULL DEFAULT false, segment_key text,
      cost_model text NOT NULL DEFAULT 'cost_center', payroll_source text);
    CREATE TABLE companies(id uuid PRIMARY KEY, name text, short_code text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid REFERENCES departments(id));
    CREATE TABLE hr_monthly_payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      period_month date NOT NULL, status text NOT NULL DEFAULT 'draft', source text NOT NULL DEFAULT 'imported',
      basic_salary numeric(15,2) NOT NULL DEFAULT 0, prorata_days_worked int, prorata_days_in_month int, deduction_amount numeric(15,2),
      gross numeric(15,2) NOT NULL DEFAULT 0, epf_er numeric(15,2) NOT NULL DEFAULT 0, socso_er numeric(15,2) NOT NULL DEFAULT 0,
      eis_er numeric(15,2) NOT NULL DEFAULT 0, UNIQUE (staff_id, period_month));
    -- Who is asking (the billing functions' guards, as production runs them since 20261009040000).
    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'staff');
    CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE AS $$ SELECT 'finance'::user_role $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE TABLE payroll_month_closes(period_month date PRIMARY KEY);
    CREATE FUNCTION public.payroll_month_closed(p_period date) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM payroll_month_closes WHERE period_month = p_period) $$;

    -- The company split, as production holds it (20260101000007, the payroll key of 20260930040000).
    CREATE TABLE hr_staff_allocation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      company_id uuid NOT NULL REFERENCES companies(id), period_month date NOT NULL, allocation_pct numeric(7,6) NOT NULL,
      created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (staff_id, period_month) REFERENCES hr_monthly_payroll(staff_id, period_month) ON UPDATE CASCADE ON DELETE CASCADE);

    -- The receivers' monthly %, as production holds it (20260101000007, its policies as live on 2026-11-03).
    CREATE TABLE hr_pool_allocation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES departments(id),
      company_id uuid NOT NULL REFERENCES companies(id), period_month date NOT NULL, split_pct numeric(7,6) NOT NULL,
      created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
      CONSTRAINT split_pct_valid CHECK (split_pct >= 0 AND split_pct <= 1),
      CONSTRAINT uq_pool_alloc_dept_company_period UNIQUE (department_id, company_id, period_month));
    ALTER TABLE hr_pool_allocation ENABLE ROW LEVEL SECURITY;
    CREATE POLICY hr_pool_alloc_ph_select ON hr_pool_allocation FOR SELECT USING ((SELECT has_scope(ARRAY['hr'])));
    CREATE POLICY hr_pool_alloc_hr_write ON hr_pool_allocation FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
    CREATE POLICY hr_pool_alloc_hr_update ON hr_pool_allocation FOR UPDATE USING ((SELECT has_scope(ARRAY['hr'])));
    CREATE POLICY hr_pool_alloc_no_delete ON hr_pool_allocation FOR DELETE USING (false);
    -- Its registry rows as live on 2026-11-03 (20261009020000, 20261009080000).
    INSERT INTO permission_table_writes VALUES
      ('hr_pool_allocation', 'INSERT', ARRAY['hr_costing.create', 'hr_costing.edit']),
      ('hr_pool_allocation', 'UPDATE', ARRAY['hr_costing.create', 'hr_costing.edit']);
    INSERT INTO permission_table_reads VALUES ('hr_pool_allocation', ARRAY['hr_costing.create', 'hr_costing.edit']);
  `)
  await productionFunction('20260930050000_department_cost_model', 'guard_staff_allocation_follows_payroll')
  // The two billing functions as production runs them: 20261005100000's bodies with 20261009040000's guard swapped in.
  for (const name of ['get_staff_billing_allocation', 'get_staff_own_share_allocation']) {
    const sql = lf(await readFile(new URL('20261005100000_billing_allocation_imported_basic.sql', migrations), 'utf8'))
    const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`))
    const end = sql.indexOf('$function$;', start) + '$function$;'.length
    await db.exec(sql.slice(start, end).replace(
      `IF v_role NOT IN ('principal', 'finance', 'hr') THEN\n        RAISE EXCEPTION 'insufficient_privilege';\n    END IF;`,
      `IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION '${name}: needs Billing or HR Costing · View' USING ERRCODE = '42501';\n    END IF;`))
  }
  check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'get_staff_billing_allocation'`), 'b3c79672245014edbee7021c4a8bc82d',
    'the billing function stands in as production runs it')
  check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'get_staff_own_share_allocation'`), '63e60f8a19d1c05687c6bf5e3dcf1c95',
    'the own-share function stands in as production runs it')
  await db.exec(`
    CREATE TRIGGER trg_hr_staff_allocation_follows_payroll
      BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_allocation
      FOR EACH ROW EXECUTE FUNCTION public.guard_staff_allocation_follows_payroll();

    INSERT INTO users VALUES ('${HR_USER}', 'HR Manager', 'hr@x');
    INSERT INTO departments (id, name, is_internal, segment_key, cost_model, payroll_source) VALUES
      ('${HR}', 'HR', false, 'hr', 'cost_center', null),
      ('${FIN}', 'Finance', false, 'finance', 'cost_center', null),
      ('${DIRO}', 'Director Office', false, 'director_office', 'cost_center', null),
      ('${IT}', 'IT', false, 'it', 'cost_center', null),
      ('${MKT}', 'Marketing', false, 'marketing', 'centralized', null),
      ('${REV}', 'Revenue Department', false, 'revenue_department', 'centralized', 'commission'),
      ('${VO}', 'Venture Office', true, null, 'cost_center', null),
      ('${LEAD}', 'Lead Department', false, null, 'cost_center', null);
    -- Production's inter-billing accounts on 2026-11-03: 9050 and its children, Revenue Department's at 9001, none for IT.
    INSERT INTO chart_of_accounts (code, name, type, parent_code, sort_order, cash_flow_category) VALUES
      ('9050', 'Inter-billing Expense', 'expense', null, 60, 'operating'),
      ('9051', 'Inter-billing - Marketing', 'expense', '9050', 61, 'operating'),
      ('9052', 'Inter-billing - Finance', 'expense', '9050', 62, 'operating'),
      ('9053', 'Inter-billing - HR', 'expense', '9050', 63, 'operating'),
      ('9054', 'Inter-billing - Director Office', 'expense', '9050', 64, 'operating'),
      ('9055', 'Inter-billing - Director', 'expense', '9050', 65, 'operating'),
      ('9056', 'Inter-billing - Venture Office', 'expense', '9050', 66, 'operating'),
      ('9001', 'Inter-billing - Revenue Department', 'expense', '9050', 100, 'operating');
    -- …and 9080–9099, production's other expenses (read off production 2026-11-03: Staff Salary & Contribution …
    -- Printing & Stationery): the next code of the range must not be read off them.
    INSERT INTO chart_of_accounts (code, name, type, parent_code, sort_order, cash_flow_category)
      SELECT c::text, 'Expense ' || c, 'expense', null, 200, 'operating' FROM generate_series(9080, 9099) c;
    INSERT INTO companies VALUES ('${C2990}', '2990 Sdn Bhd', '2990'), ('${CAR}', 'Carres', 'CAR'), ('${CONTS}', 'The Conts', 'CONTS');
    INSERT INTO hr_staff_costs VALUES ('${VIVIAN}', 'VIVIAN', '${DIRO}'), ('${AMIRUL}', 'AMIRUL', '${MKT}'),
      ('${SALLY}', 'SALLY', '${HR}'), ('${NOBODY}', 'NOBODY', '${FIN}'), ('${KEN}', 'KEN', '${IT}');
    -- Vivian 6,000 (basic 4,900 + allowance 300, EPF 676, SOCSO 104.10, EIS 19.90); Sally 4,600; Amirul 4,000; Ken 3,448.50.
    INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, gross, epf_er, socso_er, eis_er) VALUES
      ('${VIVIAN}', '${NOV}', 4900, 5200, 676, 104.10, 19.90),
      ('${AMIRUL}', '${NOV}', 3500, 3500, 455, 35, 10),
      ('${SALLY}', '${NOV}', 4000, 4000, 520, 70, 10),
      ('${KEN}', '${NOV}', 3000, 3000, 390, 52.50, 6);
  `)

  await load(MIGRATION)

  // ── A line takes an amount or a percentage ──────────────────────────────────
  await reject(MOVE, [VIVIAN, NOV, HR, 3000, 0.5], /check/i, 'an amount AND a percentage is refused')
  await reject(MOVE, [VIVIAN, NOV, HR, null, null], /check/i, 'neither is refused')
  await reject(MOVE, [VIVIAN, NOV, HR, 0, null], /check/i, 'a nought amount is refused')
  await reject(MOVE, [VIVIAN, NOV, HR, null, 1.5], /check/i, 'over 100% is refused')
  await q(MOVE, [VIVIAN, NOV, HR, 3000, null])
  check(await one(`SELECT amount::float FROM hr_staff_dept_moves WHERE staff_id = $1`, [VIVIAN]), 3000, 'a draft row takes the line')
  await reject(MOVE, [VIVIAN, NOV, HR, null, 0.1], /unique|duplicate/i, 'one line per receiving department')

  // ── The company split's lock ────────────────────────────────────────────────
  await payrollStatus(VIVIAN, 'completed')
  await reject(`UPDATE hr_staff_dept_moves SET amount = 2500 WHERE staff_id = $1`, [VIVIAN],
    /VIVIAN's November 2026 pay is Completed .* Unlock them on HR › Payroll/, 'a completed row is locked, in the split’s words')
  await payrollStatus(VIVIAN, 'submitted')
  await reject(`DELETE FROM hr_staff_dept_moves WHERE staff_id = $1`, [VIVIAN],
    /pay is with Finance .* Resubmit them on HR › Payroll/, 'a submitted row is locked: Resubmit is the way back')
  // Resubmit puts the row back to draft (payroll_open_topup), and the line changes again — no Send back needed.
  await payrollStatus(VIVIAN, 'draft')
  await q(`UPDATE hr_staff_dept_moves SET amount = 2000 WHERE staff_id = $1`, [VIVIAN])
  check(await one(`SELECT amount::float FROM hr_staff_dept_moves WHERE staff_id = $1`, [VIVIAN]), 2000, 'reopened, the line changes')
  await reject(MOVE, [NOBODY, NOV, HR, 100, null], /NOBODY is not on November 2026 payroll/, 'nobody off the payroll moves cost')
  await db.exec(`INSERT INTO payroll_month_closes VALUES ('${NOV}')`)
  await reject(`UPDATE hr_staff_dept_moves SET amount = 1000 WHERE staff_id = $1`, [VIVIAN],
    /Payroll for November 2026 is closed for good/, 'a month closed for good refuses')
  await db.exec(`DELETE FROM payroll_month_closes`)
  // The payroll's own functions pass (a payroll row removed cascades its lines away).
  await db.exec(`SELECT set_config('app.payroll_lifecycle', 'test', false)`)
  await q(`UPDATE hr_staff_dept_moves SET amount = 3000 WHERE staff_id = $1`, [VIVIAN])
  await db.exec(`SELECT set_config('app.payroll_lifecycle', '', false)`)
  check(await one(`SELECT amount::float FROM hr_staff_dept_moves WHERE staff_id = $1`, [VIVIAN]), 3000, 'the payroll’s own functions pass')

  // ── Centralized: departments yes, companies no ──────────────────────────────
  await q(MOVE, [AMIRUL, NOV, FIN, null, 0.25])
  check(await one(`SELECT pct::float FROM hr_staff_dept_moves WHERE staff_id = $1`, [AMIRUL]), 0.25, 'a centralized person moves cost to a department')
  await reject(`INSERT INTO hr_staff_allocation (staff_id, company_id, period_month, allocation_pct) VALUES ($1, $2, $3, 0.5)`,
    [AMIRUL, C2990, NOV], /Marketing is centralized/, 'but is still never split to a company')

  // ── Who may receive ─────────────────────────────────────────────────────────
  await reject(MOVE, [SALLY, NOV, HR, 100, null], /SALLY is in HR — move the cost to another department/, 'not to the person’s own department')
  await reject(MOVE, [SALLY, NOV, VO, 100, null], /Venture Office does not take moved payroll/, 'not to Venture Office')
  await reject(MOVE, [SALLY, NOV, LEAD, 100, null], /Lead Department has no pool of its own/, 'not to a department with no pool')
  // …nor from one: a person whose own department has no pool has no P&L for the move to be recovered in.
  await db.exec(`INSERT INTO hr_staff_costs VALUES ('${LENA}', 'LENA', '${LEAD}');
    INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, gross, epf_er, socso_er, eis_er)
      VALUES ('${LENA}', '${NOV}', 2000, 2000, 260, 35, 4)`)
  await reject(MOVE, [LENA, NOV, HR, 100, null], /LENA is in Lead Department, which has no pool of its own — their cost cannot move/,
    'nor from a department with no pool')
  await db.exec(`DELETE FROM hr_monthly_payroll WHERE staff_id = '${LENA}'`)

  // ── The receivers' monthly Bill to % ────────────────────────────────────────
  check((await q(`SELECT policyname FROM pg_policies WHERE tablename = 'hr_pool_allocation' AND cmd = 'DELETE' ORDER BY 1`)).map(r => r.policyname),
    ['hr_pool_alloc_hr_delete'], 'HR may delete a receiver’s month; the no-delete policy is gone')
  await q(BILL_TO, [HR, C2990, NOV, 0.3])
  await q(`DELETE FROM hr_pool_allocation WHERE department_id = $1 AND period_month = $2`, [HR, NOV])
  await q(BILL_TO, [HR, C2990, NOV, 0.3])
  await q(BILL_TO, [HR, CAR, NOV, 0.3])
  check(await one(`SELECT count(*)::int FROM hr_pool_allocation WHERE department_id = $1`, [HR]), 2, 'a month deleted and set again')
  await reject(BILL_TO, [MKT, C2990, NOV, 0.5], /Marketing is centralized — what moves into it is its own cost/, 'no Bill to % for a centralized department')
  await reject(BILL_TO, [VO, C2990, NOV, 0.5], /Venture Office does not take moved payroll/, 'nor for Venture Office')
  await reject(BILL_TO, [LEAD, C2990, NOV, 0.5], /Lead Department has no pool of its own/, 'nor for a department with no pool')
  await db.exec(`INSERT INTO payroll_month_closes VALUES ('${NOV}')`)
  await reject(`UPDATE hr_pool_allocation SET split_pct = 0.4 WHERE department_id = $1 AND company_id = $2`, [HR, CAR],
    /Payroll for November 2026 is closed for good/, 'a month closed for good refuses the Bill to %')
  await db.exec(`DELETE FROM payroll_month_closes`)

  // ── The registries ──────────────────────────────────────────────────────────
  check((await q(`SELECT command, actions FROM permission_table_writes WHERE table_name = 'hr_staff_dept_moves' ORDER BY 1`)),
    ['DELETE', 'INSERT', 'UPDATE'].map(command => ({ command, actions: ['hr_costing.create', 'hr_costing.edit'] })), 'HR writes the lines')
  check(await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'hr_staff_dept_moves'`),
    ['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own'], 'HR reads the lines')
  check((await q(`SELECT command FROM permission_table_writes WHERE table_name = 'hr_pool_allocation' ORDER BY 1`)).map(r => r.command),
    ['DELETE', 'INSERT', 'UPDATE'], 'the Bill to % may be deleted')
  check(await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'hr_pool_allocation'`),
    ['hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own'], 'the Allocation page reads the Bill to %')
  check((await q(`SELECT kind, table_name FROM guard_runs ORDER BY 2, 1`)),
    [{ kind: 'reads', table_name: 'hr_pool_allocation' }, { kind: 'writes', table_name: 'hr_pool_allocation' },
     { kind: 'reads', table_name: 'hr_staff_dept_moves' }, { kind: 'writes', table_name: 'hr_staff_dept_moves' }],
    'the restrictive policies follow both registries')

  // ── Every department with a pool bears through its own inter-billing account ─
  const missing = await q(`SELECT d.name FROM departments d WHERE d.segment_key IS NOT NULL AND NOT d.is_internal
    AND NOT EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.name = 'Inter-billing - ' || d.name AND a.type = 'expense' AND a.is_active)`)
  check(missing, [], 'every department with a pool has its inter-billing account')
  check(await q(`SELECT code, parent_code, cash_flow_category::text AS cf FROM chart_of_accounts WHERE name = 'Inter-billing - IT'`),
    [{ code: '9057', parent_code: '9050', cf: 'operating' }], 'IT’s is added at the next free code under 9050')
  await db.exec(`INSERT INTO departments (id, name, segment_key) VALUES ('${OPS}', 'Operations', null);
    UPDATE departments SET segment_key = 'operations' WHERE id = '${OPS}'`)
  check(await one(`SELECT code FROM chart_of_accounts WHERE name = 'Inter-billing - Operations'`), '9058',
    'a department provisioned later gets its account')
  // The block 9057–9079 full: the department is still provisioned, with no account (one opened by hand), never refused.
  await db.exec(`INSERT INTO chart_of_accounts (code, name, type, parent_code, sort_order, cash_flow_category)
      SELECT c::text, 'Taken ' || c, 'expense', null, 200, 'operating' FROM generate_series(9059, 9079) c;
    INSERT INTO departments (id, name, segment_key) VALUES ('${LATE}', 'Logistics', 'logistics')`)
  check(await one(`SELECT segment_key FROM departments WHERE id = '${LATE}'`), 'logistics', 'a full block never refuses a department')
  check(await one(`SELECT count(*)::int FROM chart_of_accounts WHERE name = 'Inter-billing - Logistics'`), 0, '…it opens no account then')
  await db.exec(`DELETE FROM chart_of_accounts WHERE name LIKE 'Taken %'; DELETE FROM departments WHERE id = '${LATE}'`)
  // An account whose name the readers match ("Inter-billing — HR", an em dash) counts: no second one opened.
  await db.exec(`UPDATE chart_of_accounts SET name = 'Inter-billing — HR' WHERE code = '9053'`)
  await q(`SELECT public.ensure_inter_billing_account(id) FROM departments WHERE name = 'HR'`)
  check(await one(`SELECT count(*)::int FROM chart_of_accounts WHERE name ILIKE 'Inter-billing % HR'`), 1, 'the readers’ match decides whether it exists')
  await db.exec(`UPDATE chart_of_accounts SET name = 'Inter-billing - HR' WHERE code = '9053'`)

  // ══ Billing (Task 2): the sender less what moved; cost-center receivers billing on by their Bill to % ══════════
  // The month as HR leaves it before Submit to Finance: Vivian 2990 25% / CAR 25% / RM 3,000 to HR; Sally (HR)
  // 23.3% to each of 2990, CAR and CONTS; Amirul (Marketing, centralized) 25% to Finance; Ken (IT) 2990 40% / CAR 40%
  // and RM 500 to Marketing. No Bill to % yet.
  await q(`DELETE FROM hr_pool_allocation`)
  const SPLIT = `INSERT INTO hr_staff_allocation (staff_id, company_id, period_month, allocation_pct) VALUES ($1, $2, '${NOV}', $3)`
  for (const [staff, company, pct] of [[VIVIAN, C2990, 0.25], [VIVIAN, CAR, 0.25], [SALLY, C2990, 0.233], [SALLY, CAR, 0.233],
    [SALLY, CONTS, 0.233], [KEN, C2990, 0.4], [KEN, CAR, 0.4]]) await q(SPLIT, [staff, company, pct])
  await q(MOVE, [KEN, NOV, MKT, 500, null])
  for (const staff of [VIVIAN, SALLY, AMIRUL, KEN]) await payrollStatus(staff, 'submitted')

  const billing = async () => (await q(`SELECT department_name AS d, company_short_code AS c, amount::float AS a, salary_amount::float AS s,
      allowance_amount::float AS al, epf_amount::float AS e, socso_amount::float AS so, eis_amount::float AS ei
    FROM get_staff_billing_allocation('${NOV}') ORDER BY 1, 2`))
  const rowsOf = (rows, dept) => Object.fromEntries(rows.filter(r => r.d === dept).map(r => [r.c, r.a]))
  const summary = async () => (await q(`SELECT department_name AS d, cost_model AS m, moved_in::float AS moved, billed::float AS billed,
      stays::float AS stays FROM get_payroll_moves_summary('${NOV}') ORDER BY 1`))
  const ownShare = async () => Object.fromEntries((await q(`SELECT department_name AS d, amount::float AS a
    FROM get_staff_own_share_allocation('${NOV}') ORDER BY 1`)).map(r => [r.d, r.a]))

  let rows = await billing()
  check(rowsOf(rows, 'Director Office'), { 2990: 1500, CAR: 1500 }, 'Vivian’s companies stay a % of her whole cost; no HV row — the rest moved to HR')
  check(await q(`SELECT from_department_name AS f, to_department_name AS t, staff_count AS n, amount::float AS a, salary_amount::float AS s,
      allowance_amount::float AS al, epf_amount::float AS e, socso_amount::float AS so, eis_amount::float AS ei
    FROM get_staff_dept_moves_allocation('${NOV}') ORDER BY 1, 2`), [
    { f: 'Director Office', t: 'HR', n: 1, a: 3000, s: 2450, al: 150, e: 338, so: 52.05, ei: 9.95 },
    { f: 'IT', t: 'Marketing', n: 1, a: 500, s: 434.97, al: 0, e: 56.55, so: 7.61, ei: 0.87 },
    { f: 'Marketing', t: 'Finance', n: 1, a: 1000, s: 875, al: 0, e: 113.75, so: 8.75, ei: 2.5 },
  ], 'what moved, by sender and receiver, in the five cost items')
  check(rowsOf(rows, 'HR'), { 2990: 1071.8, CAR: 1071.8, CONTS: 1071.8, HV: 1384.6 }, 'no Bill to %: HR bills only its own people')
  check(await summary(), [
    { d: 'Finance', m: 'cost_center', moved: 1000, billed: 0, stays: 1000 },
    { d: 'HR', m: 'cost_center', moved: 3000, billed: 0, stays: 3000 },
    { d: 'Marketing', m: 'centralized', moved: 500, billed: 0, stays: 500 },
  ], 'what moved in stays with each receiver until HR sets its Bill to %')

  // HR's Bill to: 2990 30% / CAR 30% / CONTS 20%; Finance's 2990 100%. A Bill to % set for Marketing while it was a
  // cost center, then Marketing made centralized again: ignored.
  for (const [dept, company, pct] of [[HR, C2990, 0.3], [HR, CAR, 0.3], [HR, CONTS, 0.2], [FIN, C2990, 1]]) await q(BILL_TO, [dept, company, NOV, pct])
  await q(`UPDATE departments SET cost_model = 'cost_center' WHERE id = $1`, [MKT])
  await q(BILL_TO, [MKT, CAR, NOV, 1])
  await q(`UPDATE departments SET cost_model = 'centralized' WHERE id = $1`, [MKT])
  rows = await billing()
  check(rowsOf(rows, 'HR'), { 2990: 1971.8, CAR: 1971.8, CONTS: 1671.8, HV: 1384.6 },
    'HR’s rows grow by 900 / 900 / 600, merged with its own people’s; its HV row is unchanged')
  check(rowsOf(rows, 'Finance'), { 2990: 1000 }, 'a receiver with no split of its own still bills what moved in')
  check(rowsOf(rows, 'Marketing'), {}, 'a centralized receiver’s Bill to % is ignored')
  check(rows.filter(r => Math.round((r.s + r.al + r.e + r.so + r.ei) * 100) !== Math.round(r.a * 100)), [], 'every row’s five items add up to it')
  check(await summary(), [
    { d: 'Finance', m: 'cost_center', moved: 1000, billed: 1000, stays: 0 },
    { d: 'HR', m: 'cost_center', moved: 3000, billed: 2400, stays: 600 },
    { d: 'Marketing', m: 'centralized', moved: 500, billed: 0, stays: 500 },
  ], 'billed by each Bill to %; the rest stays')
  check(await ownShare(), { HR: 1384.6, IT: 189.7, Marketing: 3000 },
    'own share: each sender’s leftover less what it moved; nothing moved in counts')

  // Every sen lands in one place: the companies, the leftovers, and what stays with a receiver add up to the payroll.
  const cost = await one(`SELECT sum(gross + epf_er + socso_er + eis_er)::float FROM hr_monthly_payroll WHERE period_month = '${NOV}'`)
  const everything = async () => {
    const companies = (await billing()).filter(r => r.c !== 'HV').reduce((s, r) => s + r.a, 0)
    const leftovers = Object.values(await ownShare()).reduce((s, a) => s + a, 0)
    const stays = (await summary()).reduce((s, r) => s + r.stays, 0)
    return Math.round((companies + leftovers + stays) * 100) / 100
  }
  check(await everything(), cost, 'companies + leftovers + what stays = the month’s payroll')
  // A sender moved to another department after the batch: the billing reads her by the roster as today, and a move
  // to the department a person now sits in is no move at all — still every sen in one place.
  await q(`UPDATE hr_staff_costs SET department_id = $1 WHERE id = $2`, [FIN, AMIRUL])
  check(rowsOf(await billing(), 'Finance'), {}, 'a move into the person’s own department is no move')
  check(await everything(), cost, 'and every sen still lands in one place')
  await q(`UPDATE hr_staff_costs SET department_id = $1 WHERE id = $2`, [MKT, AMIRUL])

  // Who may ask: Billing or HR Costing · View, as the billing function.
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${HR_USER}', false), set_config('test.actions', 'claims.view', false)`)
  await reject(`SELECT * FROM get_staff_dept_moves_allocation('${NOV}')`, [], /needs Billing or HR Costing · View/, 'the moves need Billing or HR Costing')
  await reject(`SELECT * FROM get_payroll_moves_summary('${NOV}')`, [], /needs Billing or HR Costing · View/, 'the summary too')
  await db.exec(`SELECT set_config('test.actions', 'billing.view', false)`)
  check((await q(`SELECT * FROM get_payroll_moves_summary('${NOV}')`)).length, 3, 'Billing · View reads it')
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  check(await one(`SELECT has_function_privilege('anon', 'public.get_payroll_moves_summary(date)', 'execute')`), false, 'never anon')

  console.log(`payroll cost moves: ${checks} checks passed`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
