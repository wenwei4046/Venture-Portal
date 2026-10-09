// Local PostgreSQL regression for 20261009050000 + 20261009050100 (PR4 of
// the People Management revamp, 2026-10-09): salary amounts, NRIC / IC and
// bank account numbers show only where ticked — in two steps, and the state
// between them (readers in place, columns still readable) keeps the code that
// was live working. Production's four tables with their own
// SELECT policies (byte for byte — the migration's guard reads them),
// production's payment_cycle (its md5 is guarded), stand-ins carrying the
// exact statements the migration swaps, and five people: HR (all three ticks),
// a Director (Salary only), Finance (Bank only, its own department), the
// Executive office (no ticks, no HR scope) and a custom template that runs
// payroll without Bank. Then the migration VERBATIM: nobody's session reads a
// number straight off a table, the readers hand it to a holder of the tick and
// •••• to everybody else over exactly the rows the policies let them read, the
// payment cycle masks, a salary PV needs Bank, a payroll submission copies no
// number, and the chart's INVOKER lifecycle still works. A policy that moved
// under the migration stops it. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const HR = id(1)
const DIRECTOR = id(2)
const FINANCE = id(3)
const OFFICE = id(4)
const CUSTOM = id(5)

const DEPT = { hr: id(101), finance: id(102), marketing: id(103), director: id(104), office: id(105) }

const PERSONAS = [
  // uid, keys, department, ticks, actions
  [HR, ['team', 'hr_costing', 'salary_individual', 'payroll_payouts'], DEPT.hr, ['bank', 'nric', 'salary'], ['hr_costing.create', 'revenue.edit']],
  [DIRECTOR, ['team', 'director_salary', 'treasury', 'payroll_payouts', 'salary_individual'], DEPT.director, ['salary'], ['treasury.create']],
  [FINANCE, ['treasury', 'payroll_payouts'], DEPT.finance, ['bank'], ['treasury.create']],
  [OFFICE, ['dashboard', 'claims'], DEPT.office, [], []],
  [CUSTOM, ['hr_costing', 'salary_individual'], DEPT.hr, ['salary'], ['hr_costing.create']],
]
const KEY_SCOPES = {
  team: 'hr', hr_costing: 'hr', director_salary: 'hr', salary_individual: 'hr', revenue: 'hr',
  treasury: 'treasury', payroll_payouts: 'none', dashboard: 'shared', claims: 'shared', audit_log: 'admin',
}

// Production's own SELECT policies on the tables whose numbers move (pg_policies, 2026-10-09).
const POLICIES = `
  CREATE POLICY hr_staff_costs_ph_select ON public.hr_staff_costs FOR SELECT
    USING ((SELECT has_scope(ARRAY['hr'::text])));
  CREATE POLICY hr_staff_costs_finance_own_dept_select ON public.hr_staff_costs FOR SELECT
    USING (((SELECT has_scope(ARRAY['treasury'::text])) AND (SELECT has_perm('payroll_payouts'::text))
      AND ((SELECT current_user_department_id()) IS NOT NULL) AND (department_id = (SELECT current_user_department_id()))));
  CREATE POLICY directors_pfh_select ON public.directors FOR SELECT
    USING ((SELECT has_scope(ARRAY['treasury'::text, 'hr'::text])));
  CREATE POLICY pvl_select ON public.payroll_voucher_lines FOR SELECT
    USING (((SELECT has_scope(ARRAY['hr'::text, 'admin'::text]))
      OR ((SELECT has_scope(ARRAY['treasury'::text])) AND (SELECT has_perm('payroll_payouts'::text)))));
  CREATE POLICY hr_cost_sub_pfh_select ON public.hr_cost_submissions FOR SELECT
    USING ((SELECT has_scope(ARRAY['treasury'::text, 'hr'::text])));
`

async function productionFunction(db, migration, name) {
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

async function boot({ policies = POLICIES } = {}) {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

    -- Who is who: the permission world, reduced to what these tables ask.
    CREATE TABLE persona(uid uuid PRIMARY KEY, keys text[] NOT NULL, dept uuid, sensitive text[] NOT NULL, actions text[] NOT NULL);
    CREATE TABLE permission_defs(key text PRIMARY KEY, scope text NOT NULL);
    CREATE FUNCTION public.current_permissions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT coalesce((SELECT keys FROM persona WHERE uid = auth.uid()), '{}'::text[]) $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT p_key = ANY (public.current_permissions()) $$;
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT EXISTS (SELECT 1 FROM permission_defs d WHERE d.scope = ANY (p_scopes) AND d.key = ANY (public.current_permissions())) $$;
    CREATE FUNCTION public.current_user_department_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT dept FROM persona WHERE uid = auth.uid() $$;
    CREATE FUNCTION public.current_sensitive_fields() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT coalesce((SELECT sensitive FROM persona WHERE uid = auth.uid()), '{}'::text[]) $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT coalesce((SELECT actions && p_wants FROM persona WHERE uid = auth.uid()), false) $$;

    -- Production's tables, the columns that matter.
    CREATE TABLE public.hr_staff_costs(
      id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid NOT NULL,
      basic_salary numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active', hire_date date,
      bank_name text, bank_account_no text, nric text, bank_name_2 text, bank_account_no_2 text, user_id uuid);
    CREATE TABLE public.directors(id uuid PRIMARY KEY, name text NOT NULL, code text, nric text, status text NOT NULL DEFAULT 'active');
    CREATE TABLE public.payroll_voucher_lines(
      id uuid PRIMARY KEY, voucher_id uuid NOT NULL, employee_name text NOT NULL, net numeric NOT NULL,
      bank_name text, bank_account_no text);
    CREATE TABLE public.hr_cost_submissions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL, dept_summaries jsonb,
      staff_snapshot jsonb, staff_allocation_snapshot jsonb, execution_state text);
    ALTER TABLE public.hr_staff_costs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.directors ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.payroll_voucher_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.hr_cost_submissions ENABLE ROW LEVEL SECURITY;
    ${policies}
    -- Production's update rule: SELECT … FOR UPDATE (the chart's lifecycle) meets it too.
    CREATE POLICY hr_staff_costs_hr_update ON public.hr_staff_costs FOR UPDATE
      USING ((SELECT has_scope(ARRAY['hr'::text])));
    -- Supabase's own default: every table is the API roles' to read and write; RLS decides.
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  `)
  for (const [key, scope] of Object.entries(KEY_SCOPES)) {
    await db.query('INSERT INTO permission_defs VALUES ($1, $2)', [key, scope])
  }
  for (const [uid, keys, dept, sensitive, actions] of PERSONAS) {
    await db.query('INSERT INTO persona VALUES ($1, $2, $3, $4, $5)', [uid, keys, dept, sensitive, actions])
  }
  await db.query(`INSERT INTO public.hr_staff_costs(id, employee_name, department_id, basic_salary, hire_date, bank_name, bank_account_no, nric, bank_name_2, bank_account_no_2) VALUES
    ($1, 'AMY', $2, 4300, '2024-01-02', 'Maybank', '1234567890', '850101141234', 'CIMB', '9876543210'),
    ($3, 'BEN', $4, 5200, '2023-05-06', 'CIMB', '2222333344', '900202081111', NULL, NULL),
    ($5, 'CARA', $2, 3900, NULL, NULL, NULL, NULL, NULL, ''),
    ($6, 'DAN', $7, 6100, '2022-03-04', 'RHB', '5555666677', '' , NULL, NULL)`,
  [id(11), DEPT.marketing, id(12), DEPT.finance, id(13), id(14), DEPT.hr])
  await db.query(`INSERT INTO public.directors VALUES ($1, 'PETER', 'D01', '700101101111', 'active'), ($2, 'KRIS', 'D02', NULL, 'active')`,
    [id(21), id(22)])
  await db.query(`INSERT INTO public.payroll_voucher_lines VALUES ($1, $3, 'AMY', 4100, 'Maybank', '1234567890'), ($2, $3, 'BEN', 4900, 'CIMB', NULL)`,
    [id(31), id(32), id(30)])

  // Production's payment_cycle, byte for byte (its md5 is the migration's guard).
  await productionFunction(db, '20260927061000_unified_payroll', 'payment_cycle')
  const live = (await db.query("SELECT md5(prosrc) AS m FROM pg_proc WHERE proname = 'payment_cycle'")).rows[0].m
  assert.equal(live, 'cf21b5c3c5580735dcf7af4112f3deb3', 'the copy in 20260927061000 is production\'s payment_cycle')

  // The three bodies the migration swaps a statement in, carrying production's exact statements.
  await db.exec(`
    CREATE FUNCTION public.create_payroll_disbursement_vouchers(p_period date, p_scope text, p_payment_date date,
      p_granularity text, p_department_id uuid, p_payroll_row_ids uuid[], p_component_selections jsonb)
    RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
        IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: needs HR Costing · Create' USING ERRCODE = '42501';
        END IF;
        RETURN json_build_object('count', 0);
    END $$;

    CREATE FUNCTION public.build_hr_cost_submission_payload(p_period date)
    RETURNS TABLE(dept_summaries jsonb, staff_snapshot jsonb, pool_allocation_snapshot jsonb, staff_allocation_snapshot jsonb)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
        v_staff_snap JSONB;
    BEGIN
        -- Full staff snapshot (PII)
        SELECT COALESCE(jsonb_agg(to_jsonb(hsc) ORDER BY hsc.employee_name), '[]'::jsonb)
        INTO v_staff_snap
        FROM hr_staff_costs hsc
        WHERE hsc.status = 'active';
        RETURN QUERY SELECT '{}'::jsonb, v_staff_snap, '[]'::jsonb, '[]'::jsonb;
    END $$;

    CREATE FUNCTION public.employee_chart_lifecycle(p_action text, p_staff_id uuid, p_source_scheme_id uuid,
      p_destination_kind text, p_destination_id uuid, p_title_id uuid, p_resignation_date date)
    RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
    declare
      v_staff public.hr_staff_costs%rowtype;
    begin
      select * into v_staff from public.hr_staff_costs where id = p_staff_id for update;
      if not found or v_staff.status <> 'active' then
        raise exception 'This employee is no longer active or visible.' using errcode = '23EMP';
      end if;
      return jsonb_build_object('name', v_staff.employee_name, 'department', v_staff.department_id, 'hired', v_staff.hire_date);
    end
    $function$;
  `)
  return db
}

function client(db) {
  const q = async (sql, params = []) => (await db.query(sql, params)).rows
  async function as(user) {
    await db.exec('RESET ROLE')
    await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
    if (user !== undefined) await db.exec('SET ROLE authenticated')
  }
  async function asAnon() {
    await db.exec('RESET ROLE')
    await q("SELECT set_config('request.jwt.claim.sub', '', false)")
    await db.exec('SET ROLE anon')
  }
  const asSystem = async () => {
    await db.exec('RESET ROLE')
    await q("SELECT set_config('request.jwt.claim.sub', '', false)")
  }
  // A read as somebody: its rows, or 'denied' when the database refuses it.
  async function read(user, sql, params = []) {
    await as(user)
    try {
      return await q(sql, params)
    } catch (error) {
      if (/permission denied/i.test(error.message)) return 'denied'
      throw error
    } finally {
      await asSystem()
    }
  }
  return { q, as, asAnon, asSystem, read }
}

try {
  // ── A policy that moved under the migration stops it ─────────────────────
  {
    const moved = POLICIES.replace("has_scope(ARRAY['hr'::text])));", "has_scope(ARRAY['hr'::text, 'treasury'::text])));")
    assert.notEqual(moved, POLICIES)
    const db = await boot({ policies: moved })
    let refused = null
    try {
      await db.exec(await migrationText('20261009050000_sensitive_fields_readers'))
    } catch (error) {
      refused = error.message
    }
    check(/A SELECT policy the readers repeat changed/.test(refused ?? ''), true, 'a moved policy stops the migration')
    await db.close()
  }

  const db = await boot()
  const { q, asAnon, asSystem, read } = client(db)

  // ── Before: every number is anybody's who reads the row ───────────────────
  check((await read(DIRECTOR, 'SELECT nric FROM public.hr_staff_costs ORDER BY employee_name')).map(r => r.nric),
    ['850101141234', '900202081111', null, ''], 'before: a Director reads every NRIC raw')

  // Step two refuses to run before step one.
  {
    let refused = null
    try {
      await db.exec(await migrationText('20261009050100_sensitive_columns_leave_select'))
    } catch (error) {
      refused = error.message
    }
    check(/The readers are not there/.test(refused ?? ''), true, 'step two needs step one')
  }

  await db.exec(await migrationText('20261009050000_sensitive_fields_readers'))

  // ── Between the steps: the code that was live still reads, the new code's readers answer ─
  check((await read(HR, 'SELECT nric FROM public.hr_staff_costs ORDER BY employee_name')).length, 4,
    'between: the old direct read still works')
  check((await read(DIRECTOR, 'SELECT nric FROM public.staff_private_fields(NULL) WHERE nric IS NOT NULL AND nric <> \'\' ')).map(r => r.nric),
    ['••••', '••••'], 'between: the readers already mask')

  await db.exec(await migrationText('20261009050100_sensitive_columns_leave_select'))

  // ── 1. Nobody's session reads a number straight off the table ─────────────
  for (const [who, sql] of [
    ['HR', 'SELECT nric FROM public.hr_staff_costs'],
    ['HR', 'SELECT bank_account_no_2 FROM public.hr_staff_costs'],
    ['HR', 'SELECT * FROM public.hr_staff_costs'],
    ['HR', 'SELECT nric FROM public.directors'],
    ['HR', 'SELECT bank_account_no FROM public.payroll_voucher_lines'],
    ['HR', 'SELECT staff_snapshot FROM public.hr_cost_submissions'],
    ['HR', 'SELECT staff_allocation_snapshot FROM public.hr_cost_submissions'],
  ]) {
    check(await read(HR, sql), 'denied', `${who}: ${sql}`)
  }
  check((await read(HR, 'SELECT employee_name, bank_name, basic_salary FROM public.hr_staff_costs ORDER BY employee_name')).length, 4,
    'every other column stays readable')
  check((await read(HR, 'SELECT id, period_month, dept_summaries, execution_state FROM public.hr_cost_submissions')).length, 0,
    'a submission without its per-person copies stays readable')
  check(await read(OFFICE, 'SELECT employee_name FROM public.hr_staff_costs'), [], 'RLS still decides the rows')
  await asAnon()
  await assert.rejects(() => q('SELECT employee_name FROM public.hr_staff_costs'), /permission denied/)
  await assert.rejects(() => q('SELECT * FROM public.staff_private_fields(NULL)'), /permission denied/)
  await asSystem()
  checks += 2

  // ── 2. The readers: the value with the tick, •••• without, over the policies' rows ─
  const staff = async user => (await read(user,
    'SELECT p.nric, p.bank_account_no, p.bank_account_no_2 FROM public.staff_private_fields(NULL) p JOIN public.hr_staff_costs s USING (id) ORDER BY s.employee_name'))
  check(await staff(HR), [
    { nric: '850101141234', bank_account_no: '1234567890', bank_account_no_2: '9876543210' },
    { nric: '900202081111', bank_account_no: '2222333344', bank_account_no_2: null },
    { nric: null, bank_account_no: null, bank_account_no_2: '' },
    { nric: '', bank_account_no: '5555666677', bank_account_no_2: null },
  ], 'HR: every number, as stored')
  check(await staff(DIRECTOR), [
    { nric: '••••', bank_account_no: '••••', bank_account_no_2: '••••' },
    { nric: '••••', bank_account_no: '••••', bank_account_no_2: null },
    { nric: null, bank_account_no: null, bank_account_no_2: '' },
    { nric: '', bank_account_no: '••••', bank_account_no_2: null },
  ], 'a Director (Salary only): •••• where something is on file, blank stays blank')
  check(await read(FINANCE,
    "SELECT s.employee_name, p.nric, p.bank_account_no FROM public.staff_private_fields(NULL) p JOIN (SELECT id, employee_name FROM public.hr_staff_costs) s USING (id)"),
  [{ employee_name: 'BEN', nric: '••••', bank_account_no: '2222333344' }],
  'Finance: its own department only, the account number but not the NRIC')
  check(await read(OFFICE, 'SELECT * FROM public.staff_private_fields(NULL)'), [], 'no HR scope, no rows')
  check((await read(DIRECTOR, 'SELECT id FROM public.staff_private_fields($1)', [[id(11)]])).length, 1, 'by id')

  check(await read(FINANCE, 'SELECT nric FROM public.director_private_fields(NULL) ORDER BY nric NULLS LAST'),
    [{ nric: '••••' }, { nric: null }], 'directors: Finance reads them, not their NRIC')
  check(await read(HR, 'SELECT nric FROM public.director_private_fields(NULL) ORDER BY nric NULLS LAST'),
    [{ nric: '700101101111' }, { nric: null }], 'directors: HR reads the NRIC')
  check(await read(OFFICE, 'SELECT * FROM public.director_private_fields(NULL)'), [], 'directors: no scope, no rows')

  const lines = async user => (await read(user, 'SELECT bank_account_no FROM public.payroll_line_accounts($1) ORDER BY id', [[id(31), id(32)]]))
  check(await lines(FINANCE), [{ bank_account_no: '1234567890' }, { bank_account_no: null }], 'PV lines: Finance (Bank)')
  check(await lines(DIRECTOR), [{ bank_account_no: '••••' }, { bank_account_no: null }], 'PV lines: a Director (no Bank)')
  check(await lines(OFFICE), [], 'PV lines: no payouts, no rows')

  // ── 3. The payment cycle masks for a reader without Bank ─────────────────
  check((await q("SELECT has_function_privilege('authenticated', 'public.payment_cycle_unmasked(date)', 'EXECUTE') AS x"))[0].x, false,
    'production\'s body is not callable by a session')
  await db.exec(`CREATE OR REPLACE FUNCTION public.payment_cycle_unmasked(p_period date) RETURNS jsonb LANGUAGE plpgsql STABLE
    SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN '{"run": {"id": "r1"}, "people": [{"name": "AMY", "bank_name": "Maybank", "bank_account_no": "1234567890",
        "bank_name_2": "CIMB", "bank_account_no_2": "9876543210",
        "components": [{"component": "net", "amount": 4100, "bank_account_no": "1234567890"}, {"component": "basic", "bank_account_no": null}]},
        {"name": "BEN", "bank_account_no": ""}]}'::jsonb;
    END $$`)
  const cycle = async user => (await read(user, "SELECT public.payment_cycle('2026-09-01') AS c"))
  const hrCycle = (await cycle(HR))[0].c
  check(hrCycle.people[0].bank_account_no, '1234567890', 'cycle: HR sees the account numbers')
  const masked = (await cycle(CUSTOM))[0].c
  check([masked.people[0].bank_account_no, masked.people[0].bank_account_no_2, masked.people[0].components[0].bank_account_no,
    masked.people[0].components[1].bank_account_no, masked.people[1].bank_account_no, masked.people[0].bank_name, masked.run.id,
    masked.people[0].components[0].amount],
  ['••••', '••••', '••••', null, '', 'Maybank', 'r1', 4100], 'cycle: a payroll title without Bank sees •••• and nothing else changes')
  await assert.rejects(() => read(OFFICE, "SELECT public.payment_cycle('2026-09-01')"), /not permitted/)
  checks++

  // ── 4. A salary PV needs Bank accounts ────────────────────────────────────
  const raise = async user => {
    try {
      await read(user, "SELECT public.create_payroll_disbursement_vouchers('2026-09-01', 'staff', '2026-09-28', 'employee', NULL, NULL, NULL)")
      return 'ok'
    } catch (error) {
      return error.message
    }
  }
  check(await raise(HR), 'ok', 'salary PV: HR (Bank ticked)')
  check(/needs Bank accounts ticked/.test(await raise(CUSTOM)), true, 'salary PV: payroll without Bank is refused')
  check(/needs HR Costing · Create/.test(await raise(DIRECTOR)), true, 'salary PV: the action check still comes first')

  // ── 5. A payroll submission copies no number ──────────────────────────────
  const snapshot = (await read(HR, "SELECT staff_snapshot FROM public.build_hr_cost_submission_payload('2026-09-01')"))[0].staff_snapshot
  check(snapshot.length, 4, 'the snapshot still has everybody')
  check(snapshot.some(s => 'nric' in s || 'bank_account_no' in s || 'bank_account_no_2' in s), false, 'and no NRIC or account number')
  check(snapshot.find(s => s.employee_name === 'AMY').basic_salary, 4300, 'pay stays — calculate_dept_np reads it')

  // ── 6. The chart's lifecycle (INVOKER) still reads the row it needs ───────
  check((await read(HR, "SELECT public.employee_chart_lifecycle('terminate', $1, NULL, NULL, NULL, NULL, '2026-10-09') AS r", [id(11)]))[0].r,
    { name: 'AMY', department: DEPT.marketing, hired: '2024-01-02' }, 'lifecycle: the four fields, without the whole row')
  check((await q("SELECT prosrc ~* 'select\\s+\\*\\s+into\\s+v_staff' AS x FROM pg_proc WHERE proname = 'employee_chart_lifecycle'"))[0].x, false,
    'no select * left')

  // ── Running it twice changes nothing ──────────────────────────────────────
  const before = (await q("SELECT md5(string_agg(proname || prosrc, '' ORDER BY proname)) AS m FROM pg_proc WHERE proname IN ('create_payroll_disbursement_vouchers', 'build_hr_cost_submission_payload', 'employee_chart_lifecycle')"))[0].m
  const swapOnly = (await migrationText('20261009050000_sensitive_fields_readers')).match(/CREATE OR REPLACE FUNCTION pg_temp\.swap_check[\s\S]*?\$fn\$;\n\nSELECT[\s\S]*?(?=\n-- ── Guards)/)
  assert(swapOnly, 'the swap section')
  await db.exec(swapOnly[0])
  check((await q("SELECT md5(string_agg(proname || prosrc, '' ORDER BY proname)) AS m FROM pg_proc WHERE proname IN ('create_payroll_disbursement_vouchers', 'build_hr_cost_submission_payload', 'employee_chart_lifecycle')"))[0].m,
    before, 'the swaps are idempotent')

  await db.close()
  console.log(`validate-sensitive-fields: ${checks} checks passed`)
} catch (error) {
  console.error(error)
  process.exit(1)
}
