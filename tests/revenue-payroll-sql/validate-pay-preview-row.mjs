// Local PostgreSQL regression for 20261014203000 — Comm Cal's salary preview
// reads the payroll row's basic and allowances, as the payroll does (2026-10-14;
// the user on PETER's RM 23,000 and KRIS's RM 26,000 non-statutory allowance:
// part of their director pay, not on top of it).
//
// Production's payroll trigger (compute_hr_monthly_payroll, md5 524cad13…, from
// 20260930010000) and production's preview (revenue_pay_preview, md5 d4c21845…,
// rebuilt from the migration by undoing its four swaps) run VERBATIM, over
// stand-in tables and stand-in statutory lookups. Checks: production's preview
// paid PETER's allowance on top and took no contribution off STANLEY's row
// basic; after the migration the preview reads every salary input the trigger
// reads, so its contributions, PCB and gross are the trigger's own; a person
// with no payroll row yet previews what the close will write; everybody else
// previews as before; the guard refuses a body that changed since; running the
// migration twice changes nothing. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const n = v => (v === null || v === undefined ? v : Number(v))
const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = await migrationText('20261014203000_revenue_pay_preview_reads_the_payroll_row')
const PREVIEW_START = MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.revenue_pay_preview')
const PREVIEW_NEW = MIGRATION.slice(PREVIEW_START)

// The migration's four swaps, undone: what is left is production's body.
const SWAPS = [
  ['               pr.gross AS pr_gross, pr.net AS pr_net\n          FROM people p',
    '               pr.gross AS pr_gross, pr.net AS pr_net,\n'
      + '               COALESCE(pr.basic_salary, st.basic_salary) AS pay_basic,\n'
      + '               COALESCE(pr.statutory_allowance, 0) AS pay_stat,\n'
      + '               COALESCE(pr.non_statutory_allowance, 0) AS pay_nonstat\n          FROM people p'],
  ['               GREATEST(w.basic_salary * w.worked::NUMERIC / NULLIF(v_dim, 0)\n                      + w.allowances * w.worked::NUMERIC / NULLIF(v_dim, 0)',
    '               GREATEST(w.pay_basic * w.worked::NUMERIC / NULLIF(v_dim, 0)\n                      + w.pay_stat * w.worked::NUMERIC / NULLIF(v_dim, 0)'],
  ['        w.basic_salary, w.allowances, w.non_statutory_allowance,\n',
    '        w.pay_basic, w.pay_stat, w.pay_nonstat,\n'],
  ['                      GREATEST(ROUND(w.basic_salary * w.worked::NUMERIC / NULLIF(v_dim, 0), 2)',
    '                      GREATEST(ROUND(w.pay_basic * w.worked::NUMERIC / NULLIF(v_dim, 0), 2)'],
]
let PREVIEW_PRODUCTION = PREVIEW_NEW
for (const [production, swapped] of SWAPS) {
  assert.equal(PREVIEW_PRODUCTION.split(swapped).length - 1, 1, `the migration holds this swap once:\n${swapped}`)
  PREVIEW_PRODUCTION = PREVIEW_PRODUCTION.replace(swapped, production)
}

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
const PETER = id(11)
const STANLEY = id(12)
const NEWBIE = id(13)
const ANTHONY = id(14)

const preview = async () => Object.fromEntries((await q('SELECT * FROM revenue_pay_preview($1, $2)', [SUB, PERIOD]))
  .map(r => [r.staff_id, r]))
const payrollRow = staffId => q('SELECT * FROM hr_monthly_payroll WHERE staff_id = $1 AND period_month = $2', [staffId, PERIOD])
  .then(rows => rows[0])

// The trigger's gross for a commission row (lib/revenue-pay.ts, the twin),
// worked from a preview row and the commission — a full month, so ratio 1.
const previewGross = (p, commission) => round2(commission - n(p.epf_er) - n(p.socso_er) - n(p.eis_er)
  + n(p.statutory_allowance) + n(p.ot_amount) + n(p.non_statutory_allowance) - n(p.deduction_amount))

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
    -- Stand-ins: every caller may read; the schedules are simple and fixed.
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
  check(await md5('public.revenue_pay_preview(uuid,date)'), 'd4c2184533b81634d8feb7bdecd553db',
    'the migration is production’s preview with exactly its four swaps')

  // September 2026 on Fair, as on production: the directors' records hold
  // their package (basic 12,000 + allowance), their payroll rows no allowance;
  // STANLEY's row a basic of 7,000 his record no longer has; NEWBIE no payroll
  // row yet; ANTHONY a full-commission salesperson like everybody else.
  await q(`INSERT INTO hr_staff_costs (id, employee_name, basic_salary, allowances, non_statutory_allowance, hire_date) VALUES
    ($1, 'PETER', 12000, 0, 23000, '2025-01-01'), ($2, 'STANLEY', 0, 0, 0, '2025-01-01'),
    ($3, 'NEWBIE', 3000, 300, 500, '2025-01-01'), ($4, 'ANTHONY', 0, 0, 0, '2025-01-01')`, [PETER, STANLEY, NEWBIE, ANTHONY])
  await q(`INSERT INTO comm_runs VALUES ($1, $2, $3, 'computed')`, [RUN, SUB, PERIOD])
  await q(`INSERT INTO comm_statements (run_id, staff_id, total_commission) VALUES
    ($1, $2, 35000), ($1, $3, 17491.40), ($1, $4, 1000), ($1, $5, 10545.52)`, [RUN, PETER, STANLEY, NEWBIE, ANTHONY])
  await q(`INSERT INTO hr_monthly_payroll (staff_id, period_month, source, basic_salary, commission_amount) VALUES
    ($1, $4, 'commission', 12000, 35000), ($2, $4, 'commission', 7000, 17491.40), ($3, $4, 'commission', 0, 10545.52)`,
  [PETER, STANLEY, ANTHONY, PERIOD])

  const before = await preview()
  // Production's preview: PETER's allowance on top, STANLEY's basic missed.
  check(n(before[PETER].non_statutory_allowance), 23000, 'production’s preview paid PETER’s RM 23,000 on top')
  check(previewGross(before[PETER], 35000) - n((await payrollRow(PETER)).gross), 23000, '…so its gross was RM 23,000 over payroll’s')
  check([n(before[STANLEY].basic_salary), n(before[STANLEY].statutory_wages), n(before[STANLEY].epf_er)], [0, 0, 0],
    'production’s preview took no contribution off STANLEY’s row basic')

  await db.exec(MIGRATION)
  check(await md5('public.revenue_pay_preview(uuid,date)'), 'c11380d952c6eef4af9153c1a22bd7eb', 'the migration’s preview is in')
  const after = await preview()

  // Every salary input the trigger reads, from where it reads it — so the
  // contributions, the PCB and the gross are the trigger's own.
  for (const [who, staffId, commission] of [['PETER', PETER, 35000], ['STANLEY', STANLEY, 17491.40], ['ANTHONY', ANTHONY, 10545.52]]) {
    const p = after[staffId]
    const row = await payrollRow(staffId)
    check(
      ['basic_salary', 'statutory_allowance', 'non_statutory_allowance'].map(k => n(p[k])),
      [n(row.basic_salary), n(row.statutory_allowance), n(row.non_statutory_allowance)],
      `${who}: the preview reads the payroll row’s salary`,
    )
    check(
      ['epf_er', 'epf_ee', 'socso_er', 'socso_ee', 'eis_er', 'eis_ee', 'pcb'].map(k => n(p[k])),
      [row.epf_er, row.epf_ee, row.socso_er, row.socso_ee, row.eis_er, row.eis_ee, row.pcb].map(n),
      `${who}: the preview’s contributions and PCB are payroll’s`,
    )
    check(previewGross(p, commission), n(row.gross), `${who}: the preview’s gross is payroll’s`)
  }
  check([n(after[PETER].non_statutory_allowance), n((await payrollRow(PETER)).gross)], [0, 33443],
    'PETER: no allowance on top — RM 35,000 less the employer’s share (the stand-in schedules’ RM 1,557)')
  check([n(after[STANLEY].basic_salary), n(after[STANLEY].statutory_wages), n(after[STANLEY].epf_er)], [7000, 7000, 840],
    'STANLEY: the row’s RM 7,000 basic, its EPF taken')

  // ANTHONY — and so everybody whose record and row agree — previews as before.
  check(after[ANTHONY], before[ANTHONY], 'a salesperson whose record and row agree previews exactly as before')

  // No payroll row yet: the record's basic and no allowance — what the close
  // writes (comm_close_sync_payroll inserts the basic alone). Then the close's
  // row, as the trigger works it out, matches the preview taken before it.
  const ahead = after[NEWBIE]
  check([n(ahead.basic_salary), n(ahead.statutory_allowance), n(ahead.non_statutory_allowance), ahead.payroll_exists],
    [3000, 0, 0, false], 'NEWBIE: the record’s basic, no allowance, before the row exists')
  await q(`INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, commission_amount, source, status)
    SELECT id, $2, basic_salary, 1000, 'commission', 'draft' FROM hr_staff_costs WHERE id = $1`, [NEWBIE, PERIOD])
  const closed = await payrollRow(NEWBIE)
  check(
    ['epf_er', 'epf_ee', 'socso_er', 'socso_ee', 'eis_er', 'eis_ee', 'pcb'].map(k => n(ahead[k])),
    [closed.epf_er, closed.epf_ee, closed.socso_er, closed.socso_ee, closed.eis_er, closed.eis_ee, closed.pcb].map(n),
    'NEWBIE: what the preview said before the row is what the close’s row holds',
  )
  check(previewGross(ahead, 1000), n(closed.gross), 'NEWBIE: …and its gross')

  // Twice changes nothing.
  await db.exec(MIGRATION)
  check(await md5('public.revenue_pay_preview(uuid,date)'), 'c11380d952c6eef4af9153c1a22bd7eb', 'a second run changes nothing')

  // A body changed in production since is refused, and left as it was.
  await db.exec(PREVIEW_PRODUCTION.replace('RETURN QUERY', 'RETURN QUERY -- changed since\n   '))
  const drifted = await md5('public.revenue_pay_preview(uuid,date)')
  await assert.rejects(() => db.exec(MIGRATION), /changed in production since this migration was written/)
  check(await md5('public.revenue_pay_preview(uuid,date)'), drifted, 'the guard refuses a body that changed since')

  console.log(`PASS: ${checks} pay-preview checks (20261014203000). Production’s trigger and preview verbatim; no live database.`)
} finally {
  await db.close()
}
