// Local PostgreSQL regression for 20261025013000 (2026-10-24 — LI SEAN asked on IT-0006 for the Revenue team's contract
// status; the user: "can add with one is Contract, then need pick time period as well, 6 month, 12 month, 18, 24, until
// 36"): Contract as a fourth employment status, its period and its generated last day, and the waiting list's transfer
// filing it. member_transfer_waiting is loaded as production runs it (20261010150000's statement, then 20261024214500
// verbatim — each md5-checked) over stand-ins for what it calls; the migration is applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const read = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

/** Signed in as `user`, holding `actions` (has_any_action) and `scopes` (has_scope); `closed` unticks the page's box. */
async function as(user, { actions = [], scopes = [], closed = false } = {}) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await q("SELECT set_config('test.scopes', $1, false)", [scopes.join(',')])
  await q("SELECT set_config('test.closed', $1, false)", [closed ? 'on' : ''])
  await db.exec('SET ROLE authenticated')
}
const HR = { actions: ['team.view', 'team.edit'], scopes: ['hr'] }

const HR_LOGIN = id(1)
const DEPT = id(11)
const TITLE = id(21)
const SUB = id(31)
const W1 = id(201)
const W2 = id(202)
const W3 = id(203)
const W4 = id(204)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL, name text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE hr_staff_costs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text, last_name text,
      employee_code text, designation text, department_id uuid, title_id uuid, home_sub_department_id uuid, reports_to uuid,
      status text NOT NULL DEFAULT 'active', hire_date date, user_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
      employment_type text NOT NULL DEFAULT 'salaried', basic_salary numeric NOT NULL DEFAULT 0, allowances numeric NOT NULL DEFAULT 0,
      non_statutory_allowance numeric NOT NULL DEFAULT 0, nric text, bank_name text, bank_account_no text, contact_number text,
      email text, created_by uuid);
    -- As production since mig 20261009050100: no table-wide SELECT for a session, the columns one by one.
    GRANT INSERT, UPDATE ON hr_staff_costs TO authenticated;
    GRANT SELECT (id, employee_name, first_name, last_name, employee_code, designation, department_id, title_id, status, hire_date, user_id)
      ON hr_staff_costs TO authenticated;
    GRANT SELECT ON titles, departments TO authenticated;

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ','))) $$;
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM unnest(p_scopes) s WHERE s = ANY (string_to_array(current_setting('test.scopes', true), ','))) $$;
    CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('test.closed', true) = 'on' THEN
        RAISE EXCEPTION 'People · Edit is unticked for you on %', p_pages[1] USING ERRCODE = '42501';
      END IF;
    END $$;

    -- The waiting list's two (DEFINER, their own checks): the applicant's facts, and the request completed.
    CREATE TABLE waiting(id uuid PRIMARY KEY, status text NOT NULL, staff uuid);
    CREATE FUNCTION public.member_waiting_transfer(p_request uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT jsonb_build_object('status', w.status, 'subDepartmentId', '${SUB}', 'departmentId', '${DEPT}', 'seatFree', true,
                                'subDepartment', 'Fair', 'occupied', 0, 'held', 0, 'capacity', 28)
        FROM public.waiting w WHERE w.id = p_request $$;
    CREATE FUNCTION public.member_complete_waiting_transfer(p_request uuid, p_staff uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE public.waiting SET status = 'executed', staff = p_staff WHERE id = p_request;
      RETURN jsonb_build_object('id', p_request);
    END $$;
  `)

  // member_transfer_waiting as production runs it: 20261010150000's statement, then 20261024214500 verbatim.
  const original = await read('20261010150000_member_transfer_waiting.sql')
  const fn = /CREATE OR REPLACE FUNCTION public\.member_transfer_waiting\([\s\S]*?\n\$\$;\n/.exec(original)
  assert.ok(fn, '20261010150000 holds member_transfer_waiting')
  await db.exec(fn[0])
  await db.exec(await read('20261024214500_people_employment_status.sql'))
  const md5Of = nargs => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_transfer_waiting' AND pronargs = ${nargs}`)
  check(await md5Of(12), '6b01f6ee60808dbd8a18e2b667860498', 'the 12-argument transfer as production runs it')
  check(await md5Of(10), '6d0ee2a061217c680870795aa9d3cb14', 'the 10-argument transfer as production runs it')

  await q(`INSERT INTO users VALUES ($1, 'li.sean@x.my', 'Li Sean')`, [HR_LOGIN])
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department')`, [DEPT])
  await q(`INSERT INTO titles VALUES ($1, 'Revenue Specialist', $2, true)`, [TITLE, DEPT])
  await q(`INSERT INTO hr_staff_costs (employee_name, user_id, department_id, hire_date, employment_status, probation_months)
           VALUES ('LI SEAN', $1, $2, '2026-08-10', 'probation', 3), ('NOT SET', NULL, $2, '2025-01-01', NULL, NULL)`, [HR_LOGIN, DEPT])

  // ── The migration, verbatim — twice: the second run changes nothing ───────────────────────────────
  const sql = await read('20261025013000_people_contract_status.sql')
  await db.exec(sql)
  const bodies = () => q("SELECT pronargs, md5(prosrc) AS md5 FROM pg_proc WHERE proname = 'member_transfer_waiting' ORDER BY 1")
  const first = await bodies()
  await db.exec(sql)
  check(await bodies(), first, 'applied again, nothing changes twice')
  check(await md5Of(13), '09abaa70c60bfba17e12bdaecddf3e98', 'the 13-argument transfer as the production dry run makes it')
  check(await md5Of(12), '44744e5e8ea43845acb1130c2ce8a938', 'the 12-argument transfer now calls the 13-argument one with no contract')
  check(await md5Of(10), '6d0ee2a061217c680870795aa9d3cb14', 'the 10-argument transfer untouched — it calls the 12-argument one')
  const thirteen = await one("SELECT prosrc FROM pg_proc WHERE proname = 'member_transfer_waiting' AND pronargs = 13")
  const reverted = thirteen
    .replace('employment_status, probation_months, contract_months\n', 'employment_status, probation_months\n')
    .replace('p_employment_status, p_probation_months, p_contract_months\n', 'p_employment_status, p_probation_months\n')
  check(createHash('md5').update(reverted).digest('hex'), '6b01f6ee60808dbd8a18e2b667860498', 'production’s 12-argument body, the contract’s column the only change')
  check(await q("SELECT pronargs, prosecdef FROM pg_proc WHERE proname = 'member_transfer_waiting' ORDER BY pronargs"),
    [{ pronargs: 10, prosecdef: false }, { pronargs: 12, prosecdef: false }, { pronargs: 13, prosecdef: false }], 'all three still run as the caller')

  // Who may call it, and read the columns.
  const sig13 = 'member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer, integer)'
  check(await one(`SELECT has_function_privilege('anon', 'public.${sig13}', 'EXECUTE')`), false, 'the 13-argument transfer: never the publishable key')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${sig13}', 'EXECUTE')`), true, 'the 13-argument transfer: a sign-in calls it')
  for (const col of ['contract_months', 'contract_end']) {
    check(await one(`SELECT has_column_privilege('authenticated', 'public.hr_staff_costs', '${col}', 'SELECT')`), true, `${col} is a session’s to read`)
  }

  // ── A contract's last day: the hire date + the months − 1 day, generated ──────────────────────────
  const endOf = async (hire, months, status = 'contract') => {
    const [r] = await q(`INSERT INTO hr_staff_costs (employee_name, hire_date, employment_status, contract_months, status)
      VALUES ('X', $1, $2, $3, 'inactive') RETURNING contract_end`, [hire, status, months])
    return r.contract_end ? r.contract_end.toISOString().slice(0, 10) : null
  }
  check(await endOf('2026-10-01', 12), '2027-09-30', '1 Oct + 12 months → 30 Sep')
  check(await endOf('2026-10-01', 6), '2027-03-31', '1 Oct + 6 months → 31 Mar')
  check(await endOf('2026-03-01', 36), '2029-02-28', '1 Mar + 36 months → 28 Feb')
  check(await endOf('2026-01-31', 6), '2026-07-30', '31 Jan + 6 months is 31 Jul, so 30 Jul (lib/employment-status.ts says the same)')
  check(await endOf('2026-08-31', 18), '2028-02-28', '31 Aug + 18 months is 29 Feb 2028, so 28 Feb')
  check(await endOf(null, 12), null, 'no hire date, no end')
  check(await endOf('2026-10-01', null, 'permanent'), null, 'not on a contract, no end')

  // ── The checks: a status of the four, a period exactly while on a contract ────────────────────────
  check(await one(`INSERT INTO hr_staff_costs (employee_name, employment_status, contract_months) VALUES ('C', 'contract', 24) RETURNING employment_status`),
    'contract', 'Contract is a status now')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status) VALUES ('X', 'contract')`, [], /hr_staff_costs_contract_months_check/,
    'a contract without its period')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, contract_months) VALUES ('X', 'permanent', 12)`, [], /hr_staff_costs_contract_months_check/,
    'a contract period without a contract')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, contract_months) VALUES ('X', 'contract', 37)`, [], /hr_staff_costs_contract_months_check/,
    'three years at most')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, contract_months) VALUES ('X', 'contract', 0)`, [], /hr_staff_costs_contract_months_check/,
    'a month at least')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, probation_months, contract_months) VALUES ('X', 'contract', 3, 12)`, [],
    /hr_staff_costs_probation_months_check/, 'a contract carries no probation period')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, probation_months, contract_months) VALUES ('X', 'probation', 3, 12)`, [],
    /hr_staff_costs_contract_months_check/, 'a probation carries no contract period')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status) VALUES ('X', 'freelance')`, [], /hr_staff_costs_employment_status_check/,
    'only the four statuses')
  check(await q(`SELECT employee_name, employment_status, contract_months, contract_end FROM hr_staff_costs WHERE employee_name IN ('LI SEAN', 'NOT SET') ORDER BY 1`),
    [{ employee_name: 'LI SEAN', employment_status: 'probation', contract_months: null, contract_end: null },
      { employee_name: 'NOT SET', employment_status: null, contract_months: null, contract_end: null }],
    'everybody filed before keeps what they had — no contract, no end')

  // ── From a probation to a contract and on: the two periods trade places in one update ────────────
  const [li] = await q(`SELECT id FROM hr_staff_costs WHERE employee_name = 'LI SEAN'`)
  await refused(`UPDATE hr_staff_costs SET employment_status = 'contract', contract_months = 12 WHERE id = $1`, [li.id],
    /hr_staff_costs_probation_months_check/, 'a contract with the probation’s period left behind: refused')
  await q(`UPDATE hr_staff_costs SET employment_status = 'contract', probation_months = NULL, contract_months = 12 WHERE id = $1`, [li.id])
  check(await q(`SELECT employment_status, probation_months, probation_end, contract_months, contract_end::text AS end FROM hr_staff_costs WHERE id = $1`, [li.id]),
    [{ employment_status: 'contract', probation_months: null, probation_end: null, contract_months: 12, end: '2027-08-09' }],
    'on a contract: its 12 months from 10 Aug end 9 Aug, nothing of the probation left')
  await q(`UPDATE hr_staff_costs SET contract_months = 24 WHERE id = $1`, [li.id])
  check(await one(`SELECT contract_end::text FROM hr_staff_costs WHERE id = $1`, [li.id]), '2028-08-09', 'a longer contract: the end moves with it')
  await refused(`UPDATE hr_staff_costs SET employment_status = 'permanent' WHERE id = $1`, [li.id], /hr_staff_costs_contract_months_check/,
    'made permanent with the contract’s period left behind: refused')
  await q(`UPDATE hr_staff_costs SET employment_status = 'permanent', contract_months = NULL WHERE id = $1`, [li.id])
  check(await q(`SELECT employment_status, contract_months, contract_end FROM hr_staff_costs WHERE id = $1`, [li.id]),
    [{ employment_status: 'permanent', contract_months: null, contract_end: null }], 'permanent: nothing of the contract left')

  // ── Transfer from the waiting list: a contract's period on the same insert ────────────────────────
  await q(`INSERT INTO waiting VALUES ($1, 'accepted', NULL), ($2, 'accepted', NULL), ($3, 'accepted', NULL), ($4, 'accepted', NULL)`, [W1, W2, W3, W4])
  await as(HR_LOGIN, HR)
  const transfer = (request, name, extra) => one(`SELECT public.member_transfer_waiting(p_request => $1, p_name => $2, p_title => $3, p_reports_to => NULL,
    p_hire_date => '2026-10-20', p_nric => $4, p_bank_name => 'Maybank', p_bank_account_no => '1234567890', p_contact => NULL, p_email => NULL${extra})`,
  [request, name, TITLE, `9001011456${String(checks).padStart(2, '0')}`])
  const t13 = await transfer(W1, 'Contract Hire', `, p_employment_status => 'contract', p_probation_months => NULL, p_contract_months => 12`)
  const t12 = await transfer(W2, 'Probation Hire', `, p_employment_status => 'probation', p_probation_months => 3`)
  const t10 = await transfer(W3, 'Old Page', '')
  await db.exec('RESET ROLE')
  check(await q(`SELECT employee_name, employment_status, probation_months, contract_months, contract_end::text AS end
                   FROM hr_staff_costs WHERE id = ANY ($1) ORDER BY employee_name`, [[t13.staffId, t12.staffId, t10.staffId]]),
  [{ employee_name: 'Contract Hire', employment_status: 'contract', probation_months: null, contract_months: 12, end: '2027-10-19' },
    { employee_name: 'Old Page', employment_status: null, probation_months: null, contract_months: null, end: null },
    { employee_name: 'Probation Hire', employment_status: 'probation', probation_months: 3, contract_months: null, end: null }],
  'a contract filed with its period and end; a page opened before files as before (a probation, or not set)')
  check(await q('SELECT status FROM waiting WHERE id = ANY ($1) ORDER BY id', [[W1, W2, W3]]),
    [{ status: 'executed' }, { status: 'executed' }, { status: 'executed' }], 'each applicant off the list, in the same transaction')

  // ── HR view's bell is the probation's alone ───────────────────────────────────────────────────────
  await as(HR_LOGIN, HR)
  check((await one('SELECT public.probation_reviews()')).map(r => r.name), ['Probation Hire'],
    'the probation hire is listed; the contract hires (and the active contract C) are not')
  await db.exec('RESET ROLE')
  await as(HR_LOGIN, HR)
  await refused(`SELECT public.member_transfer_waiting(p_request => $1, p_name => 'Bad', p_title => $2, p_reports_to => NULL,
    p_hire_date => '2026-10-20', p_nric => '1', p_bank_name => 'Maybank', p_bank_account_no => '1', p_contact => NULL,
    p_email => NULL, p_employment_status => 'contract', p_probation_months => NULL, p_contract_months => NULL)`, [W4, TITLE],
  /hr_staff_costs_contract_months_check/, 'a contract without its period is refused, and nothing is filed')
  await db.exec('RESET ROLE')
  check(await one(`SELECT status FROM waiting WHERE id = $1`, [W4]), 'accepted', 'the applicant still on the list')

  // ── The guard: a 12-argument body production changed since is never overwritten ─────────────────
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_transfer_waiting(p_request uuid, p_name text, p_title uuid, p_reports_to uuid,
    p_hire_date date, p_nric text, p_bank_name text, p_bank_account_no text, p_contact text, p_email text, p_employment_status text,
    p_probation_months integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN RETURN NULL; END $$;`)
  await assert.rejects(db.exec(sql), err => /member_transfer_waiting\(12 arguments\) is not the body this migration replaces/.test(String(err.message)),
    'a drifted body stops the migration')
  checks++

  console.log(`employment contract: ${checks} checks passed`)
} finally {
  await db.close()
}
