// Local PostgreSQL regression for 20261103231500 (2026-11-03 — the user, circling *Team members* on STANLEY's Insight ›
// My team: "i need them can press their team member than can view their order as well like this"). A member reads, for
// anybody their My team lists, that person's own bills and KPI items. The functions it builds on — who the caller is
// (member_staff_id), their sub-department (member_insight_scheme, member_director_scheme), the window
// (member_insight_window, member_kpi_month) and My team's own tree (member_downline_board) — are production's text
// (`team-member-bills-production.sql`, md5-checked); the bills and the KPI items are stand-ins that say whom and what
// they were asked for, so what is under test is the migration's own work: who is let in (every level down, a Revenue
// Director everybody, nobody else — not a peer, an upline, oneself, somebody who left, another sub-department's), that
// its tree is My team's to the person (member_downline_board, leader by leader), and the grants. The migration runs
// VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = await text(new URL('../../supabase/migrations/20261103231500_member_team_order_book.sql', import.meta.url))
const PRODUCTION = await text(new URL('./team-member-bills-production.sql', import.meta.url))
const md5Of = sig => one('SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure', [sig])

const DEPT = id(1), HQ = id(2)
const FAIR = id(10), IR = id(11)
const S_FAIR = id(20), S_FAIR_OLD = id(21), S_IR = id(22)
const T_TL = id(30), T_RS = id(31)
const U_STANLEY = id(100), U_JAMES = id(101), U_PETER = id(102), U_NO_INSIGHT = id(103), U_HR = id(104), U_GONE = id(105)
const STANLEY = id(201), LUCAS = id(202), JAMES = id(203), KAR = id(204), LOUIS = id(205), GONE = id(206), ANTHONY = id(207), YUNY = id(208)
const OLDPOS = id(209), FUTURE = id(210), TENG = id(211), PETER = id(212), CYC1 = id(213), CYC2 = id(214), MEI = id(215)
const NAMES = { [STANLEY]: 'STANLEY', [LUCAS]: 'LUCAS', [JAMES]: 'JAMES', [KAR]: 'KAR', [LOUIS]: 'LOUIS', [GONE]: 'GONE', [ANTHONY]: 'ANTHONY',
  [YUNY]: 'YUNY', [OLDPOS]: 'OLDPOS', [FUTURE]: 'FUTURE', [TENG]: 'TENG', [PETER]: 'PETER', [CYC1]: 'CYC1', [CYC2]: 'CYC2', [MEI]: 'MEI' }

/** Signed in as `user` (none = signed out), under `authenticated` as the API would be — or the owner, for the checks. */
async function as(user, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const book = (staff, sub = FAIR, from = '2026-11', until = from) =>
  q('SELECT public.member_team_order_book($1, $2, $3, $4) AS b', [staff, sub, from, until]).then(r => r[0].b)
const kpi = (staff, scheme = S_FAIR, period = '2026-10') =>
  q('SELECT public.member_team_kpi_summary($1, $2, $3) AS k', [staff, scheme, period]).then(r => r[0].k)
const NOT_TEAM = /This person is not in your team/

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, email text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text, payroll_source text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid, department_id uuid, title_id uuid,
      status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, staff_id uuid NOT NULL,
      upline_staff_id uuid, title_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_sub_department_directors(staff_id uuid, sub_department_id uuid);

    -- ── Stand-ins ────────────────────────────────────────────────────────────────────────────────────────────────
    -- The permission check: what the signed-in account was granted.
    CREATE TABLE perms(user_id uuid, perm text);
    CREATE FUNCTION public.has_perm(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM public.perms WHERE user_id=auth.uid() AND perm=p) $$;
    -- A member's own reads (production's are under their own tests): they say whose, which scheme and which window.
    CREATE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
      RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('staff',p_staff,'scheme',p_scheme,'from',p_from,'until',p_until,'orders','[]'::jsonb) $$;
    CREATE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
      RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('staff',p_staff,'schemeId',p_scheme,'period',p_period,'enabled',false) $$;
    -- My team's figures: nobody has sold yet — only its tree is under test.
    CREATE FUNCTION public.member_scoreboard(p_scheme uuid, p_period date)
      RETURNS TABLE(staff_id uuid, order_count integer, sales numeric, held numeric, kpi_qty numeric, margin_revenue numeric,
        margin_cost numeric, blind_orders integer, last_order date)
      LANGUAGE sql STABLE AS $$ SELECT NULL::uuid,0,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0,NULL::date WHERE false $$;
  `)

  // ── Production's bodies (md5 = production's on 2026-11-03) ───────────────────────────────────────────────────
  await db.exec(PRODUCTION)
  for (const [sig, md5] of [
    ['public.member_staff_id()', 'a979898c84f67c45f29ba168cfaf98de'],
    ['public.member_director_scheme(uuid,uuid)', '7d993d9b630cefc6ad97e32d697e80a4'],
    ['public.member_insight_scheme(uuid)', 'cc9c66f4f38bc3a07776d138f0e8dea1'],
    ['public.member_insight_window(text,text)', 'c00dd0de9ce4e7d39db1812a5ca135b7'],
    ['public.member_kpi_month(text)', 'af7212594c89c008de3ae3cfc65324a0'],
    ['public.member_downline_board(uuid,uuid,date)', '6e18705406bb602cace2f7075e8450eb'],
  ]) check(await md5Of(sig), md5, `${sig} is production’s`)

  // ── The department ───────────────────────────────────────────────────────────────────────────────────────────
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department', 'commission'), ($2, 'HQ', 'manual')`, [DEPT, HQ])
  await q(`INSERT INTO comm_sub_departments(id, name, department_id) VALUES ($1, 'Fair', $3), ($2, 'IR', $3)`, [FAIR, IR, DEPT])
  await q(`INSERT INTO comm_schemes(id, sub_department_id, is_active, effective_from, effective_to) VALUES
    ($1, $4, true, '2026-01-01', NULL), ($2, $4, false, '2025-01-01', '2025-12-31'), ($3, $5, true, '2026-01-01', NULL)`,
  [S_FAIR, S_FAIR_OLD, S_IR, FAIR, IR])
  await q(`INSERT INTO titles VALUES ($1, 'Team Leader'), ($2, 'Revenue Specialist')`, [T_TL, T_RS])
  await q(`INSERT INTO users(id, email) VALUES ($1, 'stanley@x'), ($2, 'james@x'), ($3, 'peter@x'), ($4, 'mei@x'), ($5, 'hr@x'), ($6, 'gone@x')`,
    [U_STANLEY, U_JAMES, U_PETER, U_NO_INSIGHT, U_HR, U_GONE])
  for (const u of [U_STANLEY, U_JAMES, U_PETER, U_GONE]) await q(`INSERT INTO perms VALUES ($1, 'member_portal'), ($1, 'member_insight')`, [u])
  await q(`INSERT INTO perms VALUES ($1, 'member_portal')`, [U_NO_INSIGHT])
  const staff = [
    [STANLEY, U_STANLEY, 'active'], [LUCAS, null, 'active'], [JAMES, U_JAMES, 'active'], [KAR, null, 'active'], [LOUIS, null, 'active'],
    [GONE, U_GONE, 'inactive'], [ANTHONY, null, 'active'], [YUNY, null, 'active'], [OLDPOS, null, 'active'], [FUTURE, null, 'active'],
    [TENG, null, 'active'], [PETER, U_PETER, 'active'], [CYC1, null, 'active'], [CYC2, null, 'active'], [MEI, U_NO_INSIGHT, 'active'],
  ]
  for (const [sid, user, status] of staff) {
    await q(`INSERT INTO hr_staff_costs(id, employee_name, user_id, department_id, title_id, status) VALUES ($1, $2, $3, $4, $5, $6)`,
      [sid, NAMES[sid], user, DEPT, T_RS, status])
  }
  // Fair today: STANLEY › LUCAS › JAMES (and GONE, who left), STANLEY › KAR › LOUIS; ANTHONY › YUNY; two who report to
  // each other and to nobody else; a position that ended, one not begun; MEI, a seat with no Insight. PETER directs Fair.
  // IR: STANLEY › TENG.
  const seat = (scheme, s, up, from = '2026-01-01', to = null) =>
    q(`INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, title_id, effective_from, effective_to) VALUES ($1, $2, $3, $4, $5, $6)`,
      [scheme, s, up, T_TL, from, to])
  for (const [s, up] of [[STANLEY, null], [LUCAS, STANLEY], [JAMES, LUCAS], [GONE, LUCAS], [KAR, STANLEY], [LOUIS, KAR],
    [ANTHONY, null], [YUNY, ANTHONY], [CYC1, CYC2], [CYC2, CYC1], [MEI, null]]) await seat(S_FAIR, s, up)
  await seat(S_FAIR, OLDPOS, STANLEY, '2026-01-01', '2026-01-31')
  await seat(S_FAIR, FUTURE, STANLEY, '2099-01-01')
  await seat(S_FAIR_OLD, TENG, STANLEY)
  await seat(S_IR, STANLEY, null)
  await seat(S_IR, TENG, STANLEY)
  await q(`INSERT INTO comm_sub_department_directors VALUES ($1, $2)`, [PETER, FAIR])

  // ── The migration, VERBATIM — twice ──────────────────────────────────────────────────────────────────────────
  await db.exec(MIGRATION)
  const bodies = await Promise.all(['public.member_team_has(uuid,uuid,uuid)', 'public.member_team_order_book(uuid,uuid,text,text)',
    'public.member_team_kpi_summary(uuid,uuid,text)'].map(md5Of))
  // …exactly what production runs since it was applied (2026-11-03).
  check(bodies, ['63502f9d5d3c3c6bcc6d5cb163f3fc9a', '6479be0550495e83205f3404acb81a2a', '7bf753653b12996b519cea659c955bfc'], 'the bodies are production’s')
  await db.exec(MIGRATION)
  check(await Promise.all(['public.member_team_has(uuid,uuid,uuid)', 'public.member_team_order_book(uuid,uuid,text,text)',
    'public.member_team_kpi_summary(uuid,uuid,text)'].map(md5Of)), bodies, 'running it again changes nothing')

  // ── The grants: the two reads for a signed-in member, the helper for the service role alone, nothing for anon ──
  const may = (role, sig) => one(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, sig])
  for (const sig of ['public.member_team_order_book(uuid,uuid,text,text)', 'public.member_team_kpi_summary(uuid,uuid,text)']) {
    check([await may('authenticated', sig), await may('service_role', sig), await may('anon', sig)], [true, true, false], `${sig}: who may call it`)
  }
  check([await may('authenticated', 'public.member_team_has(uuid,uuid,uuid)'), await may('anon', 'public.member_team_has(uuid,uuid,uuid)'),
    await may('service_role', 'public.member_team_has(uuid,uuid,uuid)')], [false, false, true], 'the helper is the service role’s alone')
  check(await one(`SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('member_team_has', 'member_team_order_book', 'member_team_kpi_summary')`),
    true, 'each runs as its owner')
  check(await one(`SELECT bool_and(proconfig @> ARRAY['search_path=public']) FROM pg_proc WHERE proname IN ('member_team_has', 'member_team_order_book', 'member_team_kpi_summary')`),
    true, 'each pins its search_path')

  // ── Its tree is My team's, leader by leader, to the person ───────────────────────────────────────────────────
  await as(null, null)
  const everybody = [...Object.keys(NAMES)]
  for (const leader of [STANLEY, LUCAS, KAR, ANTHONY, PETER, JAMES, CYC1, TENG, MEI]) {
    const board = (await q(`SELECT staff_id FROM public.member_downline_board($1, $2, '2026-11-01')`, [S_FAIR, leader])).map(r => r.staff_id).sort()
    const team = []
    for (const s of everybody) if (await one('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, leader, s])) team.push(s)
    check(team.sort(), board, `${NAMES[leader]}: member_team_has is My team (member_downline_board)`)
  }
  const names = async leader => {
    const team = []
    for (const s of everybody) if (await one('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, leader, s])) team.push(NAMES[s])
    return team.sort()
  }
  check(await names(STANLEY), ['JAMES', 'KAR', 'LOUIS', 'LUCAS'], 'STANLEY: every level down — not who left, ended or has not begun')
  check(await names(PETER), ['ANTHONY', 'JAMES', 'KAR', 'LOUIS', 'LUCAS', 'MEI', 'STANLEY', 'YUNY'], 'a Revenue Director: the top of every tree, and below')
  check(await names(JAMES), [], 'somebody with nobody under them')
  check(await names(CYC1), ['CYC2'], 'a loop ends')
  check(await one('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, STANLEY, null]), false, 'nobody asked: no')
  check(await one('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, null, JAMES]), false, 'nobody asking: no')
  check(await one('SELECT public.member_team_has($1, $2, $3)', [S_IR, STANLEY, TENG]), true, 'IR is its own tree')
  check(await one('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, STANLEY, TENG]), false, '…not Fair’s')

  // ── A leader's reads ─────────────────────────────────────────────────────────────────────────────────────────
  await as(U_STANLEY)
  check(await book(JAMES), { staff: JAMES, scheme: S_FAIR, from: '2026-11-01', until: '2026-12-01', orders: [], teamView: true, viewedStaffId: JAMES },
    'STANLEY reads JAMES (two levels down): JAMES’s own bills, Fair’s scheme, the month')
  check((await book(LOUIS, FAIR, '2026-07', '2026-09')), { staff: LOUIS, scheme: S_FAIR, from: '2026-07-01', until: '2026-10-01', orders: [], teamView: true, viewedStaffId: LOUIS },
    '…LOUIS over a quarter')
  check((await book(TENG, IR)).scheme, S_IR, '…TENG in IR, by IR’s scheme')
  for (const [who, sub, what] of [[ANTHONY, FAIR, 'another tree'], [YUNY, FAIR, 'another tree, below'], [STANLEY, FAIR, 'oneself'],
    [GONE, FAIR, 'who left'], [OLDPOS, FAIR, 'a position that ended'], [FUTURE, FAIR, 'one not begun'], [TENG, FAIR, 'IR’s, by Fair'],
    [PETER, FAIR, 'the director above']]) {
    await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [who, sub, '2026-11', '2026-11'], NOT_TEAM, `STANLEY cannot read ${what}`)
  }
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [null, FAIR, '2026-11', '2026-11'], NOT_TEAM, 'nobody asked for')
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-10'], /Choose a month, a quarter or a year/, 'a window backwards')
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-1', '2026-11'], /Choose a valid month/, 'a month it cannot read')
  await reject('SELECT public.member_team_has($1, $2, $3)', [S_FAIR, STANLEY, JAMES], /permission denied/, 'the helper is closed to a member')

  check(await kpi(JAMES), { staff: JAMES, schemeId: S_FAIR, period: '2026-10-01', enabled: false, teamView: true, viewedStaffId: JAMES },
    'STANLEY reads JAMES’s KPI items of October')
  check((await kpi(JAMES, S_FAIR, null)).period, null, '…and of this month')
  await reject('SELECT public.member_team_kpi_summary($1, $2, $3)', [ANTHONY, S_FAIR, '2026-10'], NOT_TEAM, 'KPI: another tree')
  await reject('SELECT public.member_team_kpi_summary($1, $2, $3)', [JAMES, S_IR, '2026-10'], NOT_TEAM, 'KPI: JAMES is nobody in IR')
  await reject('SELECT public.member_team_kpi_summary($1, $2, $3)', [JAMES, S_FAIR_OLD, '2026-10'], NOT_TEAM, 'KPI: a scheme Fair no longer runs')
  await reject('SELECT public.member_team_kpi_summary($1, $2, $3)', [JAMES, id(999), '2026-10'], /This department is not available/, 'KPI: no such scheme')

  // ── Not an upline, not without Insight, not signed out ───────────────────────────────────────────────────────
  await as(U_JAMES)
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [LUCAS, FAIR, '2026-11', '2026-11'], NOT_TEAM, 'JAMES cannot read his upline')
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [STANLEY, FAIR, '2026-11', '2026-11'], NOT_TEAM, '…nor the top of his tree')
  await as(U_PETER)
  check((await book(YUNY)).staff, YUNY, 'PETER (Fair’s director, no seat) reads anybody in Fair')
  check((await kpi(STANLEY)).staff, STANLEY, '…their KPI items too')
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [TENG, IR, '2026-11', '2026-11'], /This department is not available/, 'PETER does not direct IR')
  await as(U_NO_INSIGHT)
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-11'], /Insight is not enabled/, 'a seat without Insight')
  await as(U_GONE)
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-11'], /No active Revenue staff record/, 'a login whose record left')
  await as(U_HR)
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-11'], /Member account access is not enabled/, 'an account with no member access')
  await as(null)
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-11'], /Member account access is not enabled/, 'signed out')
  await reject('SELECT public.member_team_kpi_summary($1, $2, $3)', [JAMES, S_FAIR, '2026-10'], /Member account access is not enabled/, 'signed out: KPI')
  await as(null, 'anon')
  await reject('SELECT public.member_team_order_book($1, $2, $3, $4)', [JAMES, FAIR, '2026-11', '2026-11'], /permission denied/, 'anon may not call it')

  console.log(`validate-team-member-bills: ${checks} checks passed`)
} finally {
  await db.close()
}
