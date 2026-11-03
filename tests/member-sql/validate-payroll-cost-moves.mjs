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
const C2990 = id(31)
const CAR = id(32)
const VIVIAN = id(41)
const AMIRUL = id(42)
const SALLY = id(43)
const NOBODY = id(44)
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
      period_month date NOT NULL, status text NOT NULL DEFAULT 'draft', source text NOT NULL DEFAULT 'manual',
      gross numeric(15,2) NOT NULL DEFAULT 0, epf_er numeric(15,2) NOT NULL DEFAULT 0, socso_er numeric(15,2) NOT NULL DEFAULT 0,
      eis_er numeric(15,2) NOT NULL DEFAULT 0, UNIQUE (staff_id, period_month));
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
    INSERT INTO companies VALUES ('${C2990}', '2990 Sdn Bhd', '2990'), ('${CAR}', 'Carres', 'CAR');
    INSERT INTO hr_staff_costs VALUES ('${VIVIAN}', 'VIVIAN', '${DIRO}'), ('${AMIRUL}', 'AMIRUL', '${MKT}'),
      ('${SALLY}', 'SALLY', '${HR}'), ('${NOBODY}', 'NOBODY', '${FIN}');
    INSERT INTO hr_monthly_payroll (staff_id, period_month, gross, epf_er, socso_er, eis_er) VALUES
      ('${VIVIAN}', '${NOV}', 5200, 676, 104.10, 19.90),
      ('${AMIRUL}', '${NOV}', 3500, 455, 35, 10),
      ('${SALLY}', '${NOV}', 4000, 520, 70, 10);
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

  console.log(`payroll cost moves: ${checks} checks passed`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
