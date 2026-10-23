// Local PostgreSQL regression for 20261024214500 (2026-10-23 — the user: "for the employment status, i want go with
// permenant, part time and probation status follow by the hire date start. then if the probation is almost end, then it
// will notification hr acknowledge for further action"): employment status and a probation's period on the roster, the
// probation's last day generated from the hire date, HR's acknowledgement of the reminder, and the waiting list's
// transfer asking both. member_transfer_waiting is loaded as production runs it (20261010150000's statement, md5-checked)
// over stand-ins for what it calls; the migration is applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

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
const FIN_LOGIN = id(2)
const DEPT = id(11)
const TITLE = id(21)
const SUB = id(31)
const P_HR = id(101)
const P_DUE = id(102)
const P_LATER = id(103)
const P_PERM = id(104)
const P_GONE = id(105)
const P_NO_HIRE = id(106)
const W1 = id(201)
const W2 = id(202)

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

  // member_transfer_waiting as production runs it: 20261010150000's statement, whose body md5 production reports.
  const original = (await readFile(new URL('20261010150000_member_transfer_waiting.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const fn = /CREATE OR REPLACE FUNCTION public\.member_transfer_waiting\([\s\S]*?\n\$\$;\n/.exec(original)
  assert.ok(fn, '20261010150000 holds member_transfer_waiting')
  await db.exec(fn[0])
  await db.exec(`REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) TO authenticated, service_role;`)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_transfer_waiting'"), '662d5c844e758eb706fc0da3ccb9eec1',
    'the transfer as production runs it')

  await q(`INSERT INTO users VALUES ($1, 'li.sean@x.my', 'Li Sean'), ($2, 'finance@x.my', 'Finance')`, [HR_LOGIN, FIN_LOGIN])
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department')`, [DEPT])
  await q(`INSERT INTO titles VALUES ($1, 'Revenue Specialist', $2, true)`, [TITLE, DEPT])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, user_id, department_id, hire_date) VALUES ($1, 'LI SEAN', $2, $3, '2026-08-10')`, [P_HR, HR_LOGIN, DEPT])

  // ── The migration, verbatim — twice: the second run changes nothing ───────────────────────────────
  await db.exec('RESET ROLE')
  const sql = (await readFile(new URL('20261024214500_people_employment_status.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const bodies = () => q("SELECT pg_get_function_identity_arguments(oid) AS args, md5(prosrc) AS md5 FROM pg_proc WHERE proname IN ('member_transfer_waiting', 'probation_reviews', 'probation_acknowledge', 'hr_staff_costs_probation_ack') ORDER BY 1, 2")
  const first = await bodies()
  await db.exec(sql)
  check(await bodies(), first, 'applied again, nothing changes twice')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_transfer_waiting' AND pronargs = 10"), '6d0ee2a061217c680870795aa9d3cb14',
    'the 10-argument transfer now calls the 12-argument one with neither')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_transfer_waiting' AND pronargs = 12"), '6b01f6ee60808dbd8a18e2b667860498',
    'the 12-argument transfer is the body the production dry run made (2026-10-23)')
  const twelve = await one("SELECT prosrc FROM pg_proc WHERE proname = 'member_transfer_waiting' AND pronargs = 12")
  const reverted = twelve
    .replace('created_by,\n    employment_status, probation_months\n', 'created_by\n')
    .replace('auth.uid(),\n    p_employment_status, p_probation_months\n', 'auth.uid()\n')
  check(createHash('md5').update(reverted).digest('hex'), '662d5c844e758eb706fc0da3ccb9eec1', 'production’s body, the two columns the only change')
  check(await q("SELECT pronargs, prosecdef FROM pg_proc WHERE proname = 'member_transfer_waiting' ORDER BY pronargs"),
    [{ pronargs: 10, prosecdef: false }, { pronargs: 12, prosecdef: false }], 'both still run as the caller')

  // Who may call them, and read the columns.
  for (const sig of ['probation_reviews()', 'probation_acknowledge(uuid)', 'member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${sig}', 'EXECUTE')`), false, `${sig}: never the publishable key`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE')`), true, `${sig}: a sign-in calls it`)
  }
  check(await q("SELECT proname, prosecdef, provolatile FROM pg_proc WHERE proname IN ('probation_reviews', 'probation_acknowledge') ORDER BY 1"),
    [{ proname: 'probation_acknowledge', prosecdef: true, provolatile: 'v' }, { proname: 'probation_reviews', prosecdef: true, provolatile: 's' }],
    'their owner’s; the read STABLE')
  for (const col of ['employment_status', 'probation_months', 'probation_end', 'probation_ack_end', 'probation_ack_by', 'probation_ack_name', 'probation_ack_at']) {
    check(await one(`SELECT has_column_privilege('authenticated', 'public.hr_staff_costs', '${col}', 'SELECT')`), true, `${col} is a session’s to read`)
  }

  // ── The probation's last day: the hire date + the months − 1 day, generated ──────────────────────
  const endOf = async (hire, months, status = 'probation') => {
    const [r] = await q(`INSERT INTO hr_staff_costs (employee_name, hire_date, employment_status, probation_months, status)
      VALUES ('X', $1, $2, $3, 'inactive') RETURNING probation_end`, [hire, status, months])
    return r.probation_end ? r.probation_end.toISOString().slice(0, 10) : null
  }
  check(await endOf('2026-10-01', 3), '2026-12-31', '1 Oct + 3 months → 31 Dec')
  check(await endOf('2026-08-01', 3), '2026-10-31', '1 Aug + 3 months → 31 Oct')
  check(await endOf('2026-01-31', 1), '2026-02-27', 'a month with fewer days: 31 Jan + 1 month is 28 Feb, so 27 Feb (lib/employment-status.ts says the same)')
  check(await endOf('2026-11-30', 3), '2027-02-27', '30 Nov + 3 months → 27 Feb')
  check(await endOf(null, 3), null, 'no hire date, no end')
  check(await endOf('2026-10-01', null, 'permanent'), null, 'off probation, no end')

  // ── The checks: a status of the three, a period exactly while on probation ───────────────────────
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status) VALUES ('X', 'probation')`, [], /hr_staff_costs_probation_months_check/,
    'a probation without its period')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, probation_months) VALUES ('X', 'permanent', 3)`, [], /hr_staff_costs_probation_months_check/,
    'a period without a probation')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status, probation_months) VALUES ('X', 'probation', 25)`, [], /hr_staff_costs_probation_months_check/,
    'two years at most')
  await refused(`INSERT INTO hr_staff_costs (employee_name, employment_status) VALUES ('X', 'contract')`, [], /hr_staff_costs_employment_status_check/,
    'only the three statuses')
  check(await one(`SELECT count(*)::int FROM hr_staff_costs WHERE employment_status IS NULL AND employee_name = 'LI SEAN'`), 1,
    'somebody filed before the status existed stays not set')

  // The people the reminders are about (the office's today is the database's; ends are set around it).
  await db.exec(`
    INSERT INTO hr_staff_costs (id, employee_name, first_name, last_name, employee_code, department_id, title_id, hire_date, employment_status, probation_months, status, probation_ack_end, probation_ack_name)
    VALUES
      ('${P_DUE}', 'TEOH CHEA HUAN', 'CHEA HUAN', 'TEOH', 'HV009', '${DEPT}', '${TITLE}',
        ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - interval '3 months' + interval '10 days')::date, 'probation', 3, 'active', '2026-01-01', 'SPOOF'),
      ('${P_LATER}', 'LATER', NULL, NULL, 'HV020', '${DEPT}', NULL,
        (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'probation', 6, 'active', NULL, NULL),
      ('${P_PERM}', 'PERMANENT ONE', NULL, NULL, 'HV030', '${DEPT}', NULL, '2024-01-01', 'permanent', NULL, 'active', NULL, NULL),
      ('${P_GONE}', 'GONE', NULL, NULL, 'HV040', '${DEPT}', NULL, '2026-08-01', 'probation', 3, 'inactive', NULL, NULL),
      ('${P_NO_HIRE}', 'NO HIRE DATE', NULL, NULL, 'HV050', '${DEPT}', NULL, NULL, 'probation', 3, 'active', NULL, NULL);
  `)
  check(await q(`SELECT probation_ack_end, probation_ack_name FROM hr_staff_costs WHERE id = $1`, [P_DUE]), [{ probation_ack_end: null, probation_ack_name: null }],
    'a new row starts with no acknowledgement, whatever it was handed')

  // ── An acknowledgement is probation_acknowledge's alone ───────────────────────────────────────────
  await refused(`UPDATE hr_staff_costs SET probation_ack_end = probation_end WHERE id = $1`, [P_DUE], /acknowledged with Acknowledge, never written straight/,
    'not even the owner writes it straight')
  await as(HR_LOGIN, HR)
  await refused(`UPDATE hr_staff_costs SET probation_ack_name = 'SOMEBODY ELSE' WHERE id = $1`, [P_DUE], /never written straight/,
    'nor HR through the row')

  // ── HR view's bell: everybody active on probation, soonest end first ─────────────────────────────
  const reviews = await one('SELECT public.probation_reviews()')
  check(reviews.map(r => r.name), ['TEOH CHEA HUAN', 'LATER', 'NO HIRE DATE'], 'the active on probation — the inactive and the permanent left out — soonest first, no end last')
  const due = reviews[0]
  check([due.id, due.firstName, due.lastName, due.code, due.department, due.title, due.months, due.ackEnd],
    [P_DUE, 'CHEA HUAN', 'TEOH', 'HV009', 'Revenue Department', 'Revenue Specialist', 3, null], 'what the bell lists of them')
  check(due.endsOn, await one(`SELECT probation_end::text FROM hr_staff_costs WHERE id = $1`, [P_DUE]), 'its end, as the column has it')
  await as(FIN_LOGIN, { actions: ['team.view'], scopes: ['treasury'] })
  await refused('SELECT public.probation_reviews()', [], /Probation reminders need People · Edit/, 'finance@: refused')
  await as(FIN_LOGIN, { actions: ['team.edit'], scopes: ['treasury'] })
  await refused('SELECT public.probation_reviews()', [], /need People · Edit/, 'People · Edit without the HR scope: refused')

  // ── Acknowledge ───────────────────────────────────────────────────────────────────────────────────
  await as(HR_LOGIN, { ...HR, closed: true })
  await refused('SELECT public.probation_acknowledge($1)', [P_DUE], /unticked for you on \/team\/people\/\[id\]/, 'the person page’s box unticked: refused')
  await as(FIN_LOGIN, { actions: ['team.view'], scopes: ['hr'] })
  await refused('SELECT public.probation_acknowledge($1)', [P_DUE], /Acknowledging a probation needs People · Edit/, 'without People · Edit: refused')
  await as(HR_LOGIN, HR)
  const ack = await one('SELECT public.probation_acknowledge($1)', [P_DUE])
  check([ack.endsOn, ack.ackName], [due.endsOn, 'LI SEAN'], 'acknowledged for the end it stands at, in the name on their People record')
  await db.exec('RESET ROLE')
  check(await q(`SELECT probation_ack_end::text AS ack_end, probation_ack_by AS by, probation_ack_name AS name, probation_ack_at IS NOT NULL AS at
                   FROM hr_staff_costs WHERE id = $1`, [P_DUE]),
  [{ ack_end: due.endsOn, by: HR_LOGIN, name: 'LI SEAN', at: true }], 'who and when, written')
  check(await one("SELECT coalesce(current_setting('app.probation_ack', true), '')"), '', 'the door it opened is shut again')
  await as(HR_LOGIN, HR)
  await refused('SELECT public.probation_acknowledge($1)', [P_PERM], /not on probation any more/, 'a permanent one: nothing to acknowledge')
  await refused('SELECT public.probation_acknowledge($1)', [P_GONE], /not on probation any more/, 'an inactive one: nothing to acknowledge')
  await refused('SELECT public.probation_acknowledge($1)', [P_NO_HIRE], /no end yet — fill in their hire date first/, 'no hire date: no end to acknowledge')

  // ── Extended: the end moves past the acknowledgement, which stays for the end it was given for ──────
  await q('UPDATE hr_staff_costs SET probation_months = 5 WHERE id = $1', [P_DUE])
  const [ext] = await q('SELECT probation_end::text AS end, probation_ack_end::text AS ack FROM hr_staff_costs WHERE id = $1', [P_DUE])
  check(ext.ack, due.endsOn, 'the acknowledgement keeps its end')
  check(ext.end > ext.ack, true, 'the probation now ends after it — reminded again before the new end')

  // ── Confirmed as permanent: the period and the acknowledgement go with the probation ────────────────
  await q(`UPDATE hr_staff_costs SET employment_status = 'permanent', probation_months = NULL WHERE id = $1`, [P_DUE])
  await db.exec('RESET ROLE')
  check(await q(`SELECT employment_status, probation_months, probation_end, probation_ack_end, probation_ack_by, probation_ack_name, probation_ack_at
                   FROM hr_staff_costs WHERE id = $1`, [P_DUE]),
  [{ employment_status: 'permanent', probation_months: null, probation_end: null, probation_ack_end: null, probation_ack_by: null, probation_ack_name: null, probation_ack_at: null }],
  'nothing of the probation left behind')

  // ── Transfer from the waiting list: the status and the period on the same insert ──────────────────
  await q(`INSERT INTO waiting VALUES ($1, 'accepted', NULL), ($2, 'accepted', NULL)`, [W1, W2])
  await as(HR_LOGIN, HR)
  const t12 = await one(`SELECT public.member_transfer_waiting(p_request => $1, p_name => ' Amelia Tan ', p_title => $2, p_reports_to => NULL,
    p_hire_date => '2026-10-20', p_nric => '900101145678', p_bank_name => 'Maybank', p_bank_account_no => '1234567890', p_contact => NULL,
    p_email => NULL, p_employment_status => 'probation', p_probation_months => 3)`, [W1, TITLE])
  const t10 = await one(`SELECT public.member_transfer_waiting(p_request => $1, p_name => 'Old Page', p_title => $2, p_reports_to => NULL,
    p_hire_date => '2026-10-20', p_nric => '900101145679', p_bank_name => 'Maybank', p_bank_account_no => '1234567891', p_contact => NULL,
    p_email => NULL)`, [W2, TITLE])
  await db.exec('RESET ROLE')
  check(await q(`SELECT employee_name, employment_status, probation_months, probation_end::text AS end FROM hr_staff_costs WHERE id = ANY ($1) ORDER BY employee_name`,
    [[t12.staffId, t10.staffId]]),
  [{ employee_name: 'Amelia Tan', employment_status: 'probation', probation_months: 3, end: '2027-01-19' },
    { employee_name: 'Old Page', employment_status: null, probation_months: null, end: null }],
  'filed with the status and period it was given — or, from a page opened before, not set')
  check(await q('SELECT status FROM waiting ORDER BY id'), [{ status: 'executed' }, { status: 'executed' }], 'and each applicant off the list, in the same transaction')
  await q(`INSERT INTO waiting VALUES ($1, 'accepted', NULL)`, [id(203)])
  await as(HR_LOGIN, HR)
  await refused(`SELECT public.member_transfer_waiting(p_request => $1, p_name => 'Bad', p_title => $2, p_reports_to => NULL,
    p_hire_date => '2026-10-20', p_nric => '1', p_bank_name => 'Maybank', p_bank_account_no => '1', p_contact => NULL,
    p_email => NULL, p_employment_status => 'probation', p_probation_months => NULL)`, [id(203), TITLE], /hr_staff_costs_probation_months_check/,
  'a probation without its period is refused, and nothing is filed')
  await db.exec('RESET ROLE')
  check(await one(`SELECT status FROM waiting WHERE id = $1`, [id(203)]), 'accepted', 'the applicant still on the list')

  console.log(`employment status: ${checks} checks passed`)
} finally {
  await db.close()
}
