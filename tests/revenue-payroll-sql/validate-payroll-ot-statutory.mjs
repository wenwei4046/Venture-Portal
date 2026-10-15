// Local PostgreSQL regression for 20261015150000 — the payroll trigger pays HQ overtime in full and counts it
// for SOCSO and EIS (2026-10-15; the user, shown Ali's October: "对，照这样做").
//
// Production's payroll trigger (compute_hr_monthly_payroll, md5 524cad13…, from 20260930010000) runs VERBATIM
// over stand-in tables and stand-in statutory lookups, then the migration. Checks: production's trigger paid
// Ali's RM 212.50 overtime as RM 198.79 and left it out of SOCSO / EIS; after the migration his overtime is paid
// in full, SOCSO and EIS take it, EPF does not; a Revenue (commission) row and an HQ row with no overtime come
// out exactly as before; an EPF-exempt row and a row with no basic; the new column; twice changes nothing; a
// body changed in production since is refused. No live I/O.
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
const MIGRATION = await migrationText('20261015150000_attendance_close_writes_payroll')

async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const match = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\([\s\S]*?\bas\s+(\$\w*\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const md5 = () => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.compute_hr_monthly_payroll()'::regprocedure`)
const PERIOD = '2026-10-01'
const ALI = id(1)
const BEA = id(2)
const CHE = id(3)
const DAN = id(4)
const EVA = id(5)
const FIELDS = ['prorata_days_worked', 'epf_er', 'epf_ee', 'socso_er', 'socso_ee', 'eis_er', 'eis_ee', 'pcb', 'gross', 'net']
const figures = async staffId => {
  const [row] = await q('SELECT * FROM hr_monthly_payroll WHERE staff_id = $1 AND period_month = $2', [staffId, PERIOD])
  return Object.fromEntries(FIELDS.map(k => [k, n(row[k])]))
}
// Work a row out again: set an input to what it already is (the trigger listens to its inputs).
const recompute = staffId => q('UPDATE hr_monthly_payroll SET ot_amount = ot_amount WHERE staff_id = $1 AND period_month = $2', [staffId, PERIOD])

try {
  await db.exec(`
    CREATE TABLE hr_staff_costs (
      id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, designation text,
      employment_type text NOT NULL DEFAULT 'salaried',
      basic_salary numeric(15,2) NOT NULL DEFAULT 0, allowances numeric(15,2) NOT NULL DEFAULT 0,
      non_statutory_allowance numeric(15,2) NOT NULL DEFAULT 0,
      hire_date date, resignation_date date,
      epf_category text NOT NULL DEFAULT 'A', socso_category text NOT NULL DEFAULT 'first',
      pcb_category text NOT NULL DEFAULT 'KA1', children_count integer NOT NULL DEFAULT 0,
      is_epf_exempt boolean NOT NULL DEFAULT false, tax_mode text NOT NULL DEFAULT 'pcb',
      withholding_rate numeric(9,6) NOT NULL DEFAULT 0.02
    );
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
    -- Stand-ins: the schedules are simple and fixed (SOCSO and EIS capped at RM 6,000).
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
      RETURNS numeric LANGUAGE sql AS $$ SELECT round(greatest(p_income - 2000, 0) * 0.1, 2) $$;
  `)
  await productionFunction('20260930010000_payroll_statutory_overrides', 'compute_hr_monthly_payroll')
  check(await md5(), '524cad13c3e002baa0193b89211436cc', 'the payroll trigger is production’s')
  await db.exec(`CREATE TRIGGER compute_hr_monthly_payroll BEFORE INSERT OR UPDATE ON hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.compute_hr_monthly_payroll()`)

  // October 2026 (31 days). ALI: basic 2,600, OT RM 212.50 (10 h), 2 unpaid days — the example the user agreed to.
  // BEA: HQ, no overtime, a deduction. CHE: a Revenue row with overtime and unpaid days. DAN: EPF-exempt, with OT.
  // EVA: no basic at all, OT only.
  await q(`INSERT INTO hr_staff_costs (id, employee_name, hire_date, is_epf_exempt) VALUES
    ($1, 'ALI', '2020-01-01', false), ($2, 'BEA', '2020-01-01', false), ($3, 'CHE', '2020-01-01', false),
    ($4, 'DAN', '2020-01-01', true), ($5, 'EVA', '2020-01-01', false)`, [ALI, BEA, CHE, DAN, EVA])
  await q(`INSERT INTO hr_monthly_payroll (staff_id, period_month, source, basic_salary, statutory_allowance, ot_hours, ot_amount,
      unpaid_leave_days, deduction_amount, commission_amount) VALUES
    ($1, $6, 'carried_forward', 2600, 0, 10, 212.50, 2, 0, 0),
    ($2, $6, 'carried_forward', 3100, 150, 0, 0, 1, 50, 0),
    ($3, $6, 'commission', 1800, 0, 4, 90, 3, 0, 4200),
    ($4, $6, 'carried_forward', 2600, 0, 10, 212.50, 0, 0, 0),
    ($5, $6, 'carried_forward', 0, 0, 4, 80, 0, 0, 0)`, [ALI, BEA, CHE, DAN, EVA, PERIOD])

  const before = {}
  for (const who of [ALI, BEA, CHE, DAN, EVA]) before[who] = await figures(who)

  // Production's trigger: Ali's overtime shrank with his unpaid days, and SOCSO / EIS never saw it.
  check(before[ALI].prorata_days_worked, 29, 'ALI worked 29 of 31 days')
  check(before[ALI].gross, 2631.05, 'production paid ALI’s RM 212.50 as RM 198.79 (2,432.26 + 198.79)')
  check([before[ALI].socso_er, before[ALI].socso_ee, before[ALI].eis_ee], [42.56, 12.16, 4.86], 'production’s SOCSO / EIS on RM 2,432.26 alone')

  await db.exec(MIGRATION)
  check(await md5(), '3a54d8608f6e41fd0847a28dfcc473a5', 'the migration’s trigger is in')
  check(await one(`SELECT data_type FROM information_schema.columns WHERE table_name = 'hr_monthly_payroll' AND column_name = 'attendance_figures'`),
    'jsonb', 'the row carries what a close wrote')

  for (const who of [ALI, BEA, CHE, DAN, EVA]) await recompute(who)
  const after = {}
  for (const who of [ALI, BEA, CHE, DAN, EVA]) after[who] = await figures(who)

  // ALI: basic 2,600 × 29/31 = 2,432.26; overtime in full.
  check(after[ALI].gross, 2644.76, 'ALI: RM 2,432.26 + the whole RM 212.50')
  check([after[ALI].epf_er, after[ALI].epf_ee], [292, 268], 'ALI: EPF on RM 2,432.26 — overtime left out (the stand-in: 12% / 11%, rounded up)')
  check([after[ALI].socso_er, after[ALI].socso_ee], [46.28, 13.22], 'ALI: SOCSO on RM 2,644.76 — overtime counted')
  check([after[ALI].eis_er, after[ALI].eis_ee], [5.29, 5.29], 'ALI: EIS on RM 2,644.76')
  check(after[ALI].net, Math.round((2644.76 - 268 - 13.22 - 5.29 - after[ALI].pcb) * 100) / 100, 'ALI: net = gross less his share')
  check(after[ALI].pcb, Math.round((2644.76 - 268 - 2000) * 0.1 * 100) / 100, 'ALI: PCB on the gross with the whole overtime, less EPF')

  // Nobody else's pay moves: no overtime, or a Revenue row.
  check(after[BEA], before[BEA], 'BEA: no overtime — exactly as before')
  check(after[CHE], before[CHE], 'CHE: a Revenue row keeps its arithmetic, overtime and unpaid days and all')

  // DAN: EPF-exempt, overtime still counted for SOCSO / EIS.
  check([after[DAN].epf_er, after[DAN].epf_ee], [0, 0], 'DAN: EPF-exempt stays exempt')
  check([after[DAN].socso_ee, after[DAN].eis_ee], [14.06, 5.63], 'DAN: SOCSO / EIS on RM 2,812.50')
  check([before[DAN].socso_ee, before[DAN].eis_ee], [13, 5.2], '…where production took them on RM 2,600')

  // EVA: no basic — production took no SOCSO / EIS at all; now her overtime is counted, EPF still nothing.
  check([before[EVA].socso_ee, before[EVA].eis_ee, before[EVA].epf_ee], [0, 0, 0], 'EVA: production took nothing on RM 80 of overtime')
  check([after[EVA].socso_er, after[EVA].socso_ee, after[EVA].eis_ee, after[EVA].epf_ee], [1.4, 0.4, 0.16, 0], 'EVA: SOCSO / EIS on her RM 80, no EPF')
  check(after[EVA].gross, 80, 'EVA: her overtime, in full')

  // Twice changes nothing.
  await db.exec(MIGRATION)
  check(await md5(), '3a54d8608f6e41fd0847a28dfcc473a5', 'a second run changes nothing')
  await recompute(ALI)
  check(await figures(ALI), after[ALI], '…and works ALI out the same')

  // A body changed in production since is refused, and left as it was.
  await db.exec(`CREATE OR REPLACE FUNCTION public.compute_hr_monthly_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.net := 0; RETURN NEW; END $$`)
  const drifted = await md5()
  await assert.rejects(() => db.exec(MIGRATION), /changed in production since this migration was written/)
  checks++
  check(await md5(), drifted, 'the refused run left the drifted body alone')

  console.log(`validate-payroll-ot-statutory: ${checks} checks passed`)
} finally {
  await db.close()
}
