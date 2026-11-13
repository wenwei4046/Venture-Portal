// Local PostgreSQL regression for 20261114090000 — Comm Cal's salary preview
// takes the statutory figures HR typed on HR › Payroll (2026-11-13; the user,
// on a row whose PCB HR typed as RM 930.00: payroll deducted 930.00 while Comm
// Cal still showed the lookup's 333.85).
//
// Production's payroll trigger (compute_hr_monthly_payroll, md5 524cad13…, from
// 20260930010000) and production's preview (revenue_pay_preview, md5 c11380d9…,
// from 20261014203000) run VERBATIM, over stand-in tables and stand-in
// statutory lookups. Checks: production's preview ignored a typed PCB and a
// typed EPF; after the migration every typed figure is the preview's, and a
// PCB looked up reads the basic after the EPF the row pays — the trigger's own
// figures; a row with nothing typed previews exactly as before; the guard
// refuses a body that changed since; running it twice changes nothing.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const n = v => (v === null || v === undefined ? v : Number(v))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
const fromCreate = sql => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.revenue_pay_preview'))
const PREVIEW_PRODUCTION = fromCreate(await migrationText('20261014203000_revenue_pay_preview_reads_the_payroll_row'))
const MIGRATION = await migrationText('20261114090000_revenue_pay_preview_reads_typed_statutory')

async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const match = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\([\s\S]*?\bas\s+(\$\w*\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
const SUB = id(1)
const RUN = id(2)
const PERIOD = '2026-09-01'
const CHEA = id(11)
const TYPED_EPF = id(12)
const ANTHONY = id(13)
const STAT = ['epf_er', 'epf_ee', 'socso_er', 'socso_ee', 'eis_er', 'eis_ee', 'pcb']

const preview = async () => Object.fromEntries((await q('SELECT * FROM revenue_pay_preview($1, $2)', [SUB, PERIOD]))
  .map(r => [r.staff_id, r]))
const payrollRow = staffId => q('SELECT * FROM hr_monthly_payroll WHERE staff_id = $1 AND period_month = $2', [staffId, PERIOD])
  .then(rows => rows[0])
const figures = row => STAT.map(k => n(row[k]))

try {
  await db.exec(`
    CREATE TABLE hr_staff_costs (
      id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, designation text,
      employment_type text NOT NULL DEFAULT 'commission_eligible',
      basic_salary numeric(15,2) NOT NULL DEFAULT 0, allowances numeric(15,2) NOT NULL DEFAULT 0,
      non_statutory_allowance numeric(15,2) NOT NULL DEFAULT 0,
      hire_date date, resignation_date date,
      epf_category text NOT NULL DEFAULT 'A', socso_category text NOT NULL DEFAULT 'first',
      pcb_category text NOT NULL DEFAULT 'KA1', children_count integer NOT NULL DEFAULT 0,
      is_epf_exempt boolean NOT NULL DEFAULT false, tax_mode text NOT NULL DEFAULT 'pcb',
      withholding_rate numeric(9,6) NOT NULL DEFAULT 0.02
    );
    CREATE TABLE comm_runs (id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text);
    CREATE TABLE comm_statements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, staff_id uuid, total_commission numeric(15,2));
    CREATE TABLE period_locks (period_month date, is_locked boolean);
    CREATE TABLE hr_monthly_payroll (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL, period_month date NOT NULL,
      source text NOT NULL, status text NOT NULL DEFAULT 'draft',
      basic_salary numeric(15,2) NOT NULL DEFAULT 0, statutory_allowance numeric(15,2) NOT NULL DEFAULT 0,
      non_statutory_allowance numeric(15,2) NOT NULL DEFAULT 0, ot_hours numeric(10,2) NOT NULL DEFAULT 0,
      ot_amount numeric(15,2) NOT NULL DEFAULT 0, unpaid_leave_days numeric(10,2) NOT NULL DEFAULT 0,
      deduction_amount numeric(15,2) NOT NULL DEFAULT 0, skbbk_amount numeric(15,2) NOT NULL DEFAULT 0,
      commission_amount numeric(15,2) NOT NULL DEFAULT 0, commission_adjustment_amount numeric(15,2) NOT NULL DEFAULT 0,
      epf_er numeric(15,2), epf_ee numeric(15,2), socso_er numeric(15,2), socso_ee numeric(15,2),
      eis_er numeric(15,2), eis_ee numeric(15,2), pcb numeric(15,2), withholding_tax numeric(15,2),
      epf_er_override_amount numeric(15,2), epf_ee_override_amount numeric(15,2), socso_er_override_amount numeric(15,2),
      socso_ee_override_amount numeric(15,2), eis_er_override_amount numeric(15,2), eis_ee_override_amount numeric(15,2),
      pcb_override_amount numeric(15,2),
      gross numeric(15,2), net numeric(15,2), prorata_days_worked integer, prorata_days_in_month integer,
      pay_line_earnings numeric(15,2) NOT NULL DEFAULT 0, pay_line_deductions numeric(15,2) NOT NULL DEFAULT 0,
      payout_split_version smallint, basic_pay_net numeric(15,2), commission_balance numeric(15,2), updated_at timestamptz
    );
    CREATE FUNCTION public.has_any_action(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION payroll_month_closed(date) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION revenue_pay_line_totals(uuid, date) RETURNS TABLE(earnings numeric, deductions numeric)
      LANGUAGE sql AS $$ SELECT 0::numeric, 0::numeric $$;
    CREATE FUNCTION lookup_epf(p_wages numeric, p_part text, p_period date DEFAULT NULL)
      RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql
      AS $$ SELECT ceil(p_wages * 0.12), ceil(p_wages * 0.11) $$;
    CREATE FUNCTION lookup_socso(p_wages numeric, p_category text, p_period date DEFAULT NULL)
      RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql
      AS $$ SELECT round(least(p_wages, 6000) * 0.0175, 2), round(least(p_wages, 6000) * 0.005, 2) $$;
    CREATE FUNCTION lookup_eis(p_wages numeric, p_period date DEFAULT NULL)
      RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql
      AS $$ SELECT round(least(p_wages, 6000) * 0.002, 2), round(least(p_wages, 6000) * 0.002, 2) $$;
    CREATE FUNCTION lookup_pcb(p_income numeric, p_category text, p_children integer, p_period date DEFAULT NULL)
      RETURNS numeric LANGUAGE sql AS $$ SELECT round(greatest(p_income - 3000, 0) * 0.1, 2) $$;
  `)
  await productionFunction('20260930010000_payroll_statutory_overrides', 'compute_hr_monthly_payroll')
  check(await md5('public.compute_hr_monthly_payroll()'), '524cad13c3e002baa0193b89211436cc', 'the payroll trigger is production’s')
  await db.exec(`CREATE TRIGGER compute_hr_monthly_payroll BEFORE INSERT OR UPDATE ON hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.compute_hr_monthly_payroll()`)
  await db.exec(PREVIEW_PRODUCTION)
  check(await md5('public.revenue_pay_preview(uuid,date)'), 'c11380d952c6eef4af9153c1a22bd7eb', 'the preview is production’s')

  // September on Fair: CHEA's row has a basic of RM 7,000 and a PCB typed as
  // 930.00; TYPED_EPF's row has EPF (employee) typed as 500 and nothing else;
  // ANTHONY's row has nothing typed.
  await q(`INSERT INTO hr_staff_costs (id, employee_name, basic_salary, hire_date) VALUES
    ($1, 'CHEA HUAN', 7000, '2025-01-01'), ($2, 'TYPED EPF', 7000, '2025-01-01'), ($3, 'ANTHONY', 0, '2025-01-01')`,
  [CHEA, TYPED_EPF, ANTHONY])
  await q(`INSERT INTO comm_runs VALUES ($1, $2, $3, 'computed')`, [RUN, SUB, PERIOD])
  await q(`INSERT INTO comm_statements (run_id, staff_id, total_commission) VALUES ($1, $2, 3000), ($1, $3, 3000), ($1, $4, 2000)`,
    [RUN, CHEA, TYPED_EPF, ANTHONY])
  await q(`INSERT INTO hr_monthly_payroll (staff_id, period_month, source, basic_salary, commission_amount, pcb_override_amount, epf_ee_override_amount) VALUES
    ($1, $4, 'commission', 7000, 3000, 930, NULL), ($2, $4, 'commission', 7000, 3000, NULL, 500), ($3, $4, 'commission', 0, 2000, NULL, NULL)`,
  [CHEA, TYPED_EPF, ANTHONY, PERIOD])

  const before = await preview()
  check(n((await payrollRow(CHEA)).pcb), 930, 'payroll pays CHEA’s typed PCB')
  check(n(before[CHEA].pcb), 323, 'production’s preview showed the lookup’s PCB, not the typed 930')
  check(n(before[TYPED_EPF].epf_ee), 770, 'production’s preview showed the lookup’s EPF, not the typed 500')

  await db.exec(MIGRATION)
  const newMd5 = await md5('public.revenue_pay_preview(uuid,date)')
  const after = await preview()

  for (const [who, staffId] of [['CHEA HUAN', CHEA], ['TYPED EPF', TYPED_EPF], ['ANTHONY', ANTHONY]]) {
    check(figures(after[staffId]), figures(await payrollRow(staffId)), `${who}: the preview’s contributions and PCB are payroll’s`)
  }
  check(n(after[CHEA].pcb), 930, 'CHEA: the typed PCB')
  check([n(after[TYPED_EPF].epf_ee), n(after[TYPED_EPF].pcb)], [500, 350],
    'TYPED EPF: the typed EPF, and the PCB looked up on 7,000 − 500')
  check(after[ANTHONY], before[ANTHONY], 'nothing typed: previews exactly as before')

  // Twice changes nothing.
  await db.exec(MIGRATION)
  check(await md5('public.revenue_pay_preview(uuid,date)'), newMd5, 'a second run changes nothing')

  // A body changed in production since is refused, and left as it was.
  await db.exec(PREVIEW_PRODUCTION.replace('RETURN QUERY', 'RETURN QUERY -- changed since\n   '))
  const drifted = await md5('public.revenue_pay_preview(uuid,date)')
  await assert.rejects(() => db.exec(MIGRATION), /changed in production since this migration was written/)
  check(await md5('public.revenue_pay_preview(uuid,date)'), drifted, 'the guard refuses a body that changed since')

  console.log(`PASS: ${checks} pay-preview checks (20261114090000), new md5 ${newMd5}. Production’s trigger and preview verbatim; no live database.`)
} finally {
  await db.close()
}
