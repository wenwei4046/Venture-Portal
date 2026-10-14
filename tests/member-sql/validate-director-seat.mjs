// Local PostgreSQL regression for 20261014090000 (2026-10-14 — the user, on PETER's login: "why as revenue director
// log in, peter, cant switch to fair view"; the Switch sub-department sheet was empty). A Revenue Director heads the
// department and holds no seat (23DIR); the Revenue app read only seats. The user chose: a director is the TOP of each
// sub-department they direct. The functions the migration touches are built from production's text — the repo copies
// production ran (md5-checked here) and, for the two whose last repo copy is older than production,
// `director-seat-production.sql` — then the migration runs VERBATIM, twice. What is under test: the switcher lists a
// director's sub-departments; Insight / Arena / KPI / the Quote / My income's gate open to a director of the
// sub-department and to nobody else new; everybody (a seat whose upline holds none there too) is under the director,
// never a member's own subtree widened; a director's block has no next rung; memos and the team map follow; a body
// production changed since is refused. No live I/O.
import assert from 'node:assert/strict'
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
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const migrationText = name => text(new URL(`${name}.sql`, migrations))
const MIGRATION = '20261014090000_revenue_director_in_member_app'

/**
 * The LAST definition of a function in a repo migration — the body production ran — as one statement. `args`: the
 * first argument names, when the file defines more than one function of that name.
 */
async function productionFunction(migration, name, md5, args = []) {
  const sql = await migrationText(migration)
  const head = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(${args.map(a => `\\s*${a}\\s+\\w+\\s*,?`).join('')}`, 'ig')
  let at = -1
  for (let m = head.exec(sql); m; m = head.exec(sql)) at = m.index
  assert(at >= 0, `Missing ${name} in ${migration}`)
  const tag = /\bas\s+(\$\w*\$)/i.exec(sql.slice(at))
  assert(tag, `Missing body of ${name}`)
  const bodyAt = at + tag.index + tag[0].length
  const close = sql.indexOf(tag[1], bodyAt)
  const end = sql.indexOf(';', close + tag[1].length)
  await db.exec(sql.slice(at, end + 1))
  check(await one('SELECT md5(prosrc) FROM pg_proc WHERE proname = $1 ORDER BY oid DESC LIMIT 1', [name]), md5, `${name} is production’s`)
}

const md5Of = sig => one('SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure', [sig])

const DEPT = id(1)
const FAIR = id(10), IR = id(11)
const S_FAIR = id(20), S_IR = id(21), S_FAIR_OLD = id(23)
const T_DIR = id(30), T_TL = id(31), T_RS = id(32)
const R_SS = id(40), R_A = id(41), R_B = id(42), R_IRA = id(43)
const U_PETER = id(101), U_KRIS = id(102), U_ANNA = id(103), U_OUT = id(104), U_GONE = id(105)
const PETER = id(201), KRIS = id(202), ANNA = id(203), BEN = id(204), CARL = id(205), DORA = id(206), EVE = id(207)
const IRMA = id(208), IAN = id(209), OUT = id(210), GONE = id(211)
const M_FAIR = id(301), M_IR = id(302), M_OUT = id(303)

const PERMS = 'member_portal,member_insight,member_quote,member_memos'
async function as(user, perms = PERMS) {
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.perms', $2, false)`, [user ?? '', perms])
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT p_key = ANY (string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;

    CREATE TABLE users(id uuid PRIMARY KEY, email text, name text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text, payroll_source text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, user_id uuid, department_id uuid,
      title_id uuid, status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date, basic_salary numeric DEFAULT 0);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, code text, department_id uuid,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL);
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now(),
      enable_kpi boolean NOT NULL DEFAULT false);
    CREATE TABLE comm_ranks(id uuid PRIMARY KEY, scheme_id uuid, rank_key text, label text, product_rate numeric, sort_order integer,
      title_id uuid, personal_sales_threshold numeric, group_sales_threshold numeric, consecutive_months integer);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, staff_id uuid NOT NULL,
      upline_staff_id uuid, title_id uuid, rank_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_sub_department_directors(sub_department_id uuid NOT NULL, staff_id uuid NOT NULL, created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (sub_department_id, staff_id));
    CREATE TABLE member_department_capacity(sub_department_id uuid PRIMARY KEY, headcount_limit integer);
    CREATE TABLE comm_runs(id uuid PRIMARY KEY, scheme_id uuid, sub_department_id uuid, period_month date, status text);
    CREATE TABLE comm_statements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, staff_id uuid, product_commission numeric,
      override_commission numeric, kpi_commission numeric, open_bill_bonus numeric, margin_incentive numeric, group_incentive numeric,
      total_commission numeric, product_revenue numeric, group_revenue numeric, deferred_revenue numeric, rank_key text,
      product_rate numeric, kpi_qty numeric);
    CREATE TABLE comm_statement_brand_margins(statement_id uuid, brand_code text, margin_pct numeric, revenue numeric, top_band_key text);
    CREATE TABLE comm_kpi_thresholds(scheme_id uuid, min_qty integer, effective_from date, effective_to date);
    CREATE TABLE comm_kpi_items(id uuid PRIMARY KEY, scheme_id uuid, source text, product_code text, product_name text, option_pool text,
      option_value text, kpi_amount numeric, effective_from date, effective_to date);
    CREATE TABLE comm_brands(id uuid PRIMARY KEY, scheme_id uuid, code text, name text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE comm_margin_bands(id uuid PRIMARY KEY, scheme_id uuid, brand_id uuid, label text, kind text, margin_pct numeric,
      commission_multiplier numeric, monthly_incentive numeric);
    CREATE TABLE member_memos(id uuid PRIMARY KEY, title text, body text, sender text, published_at timestamptz NOT NULL DEFAULT now(),
      effective_at date, version integer NOT NULL DEFAULT 1, requires_ack boolean NOT NULL DEFAULT false, kind text,
      attachment_path text, attachment_name text, attachment_type text, attachment_deleted_at timestamptz);
    CREATE TABLE member_memo_audiences(memo_id uuid, sub_department_id uuid);
    CREATE TABLE member_memo_recipients(memo_id uuid, staff_id uuid);
    CREATE TABLE member_memo_receipts(memo_id uuid, user_id uuid, version integer, read_at timestamptz, acknowledged_at timestamptz);

    -- The bills as member_order_facts hands them over (its own rules are not under test).
    CREATE TABLE test_facts(order_id uuid, order_no text, staff_id uuid, scheme_id uuid, brand text, revenue numeric, goods_revenue numeric,
      margin_pct numeric, kpi_qty numeric, cleared boolean, order_date date, source_period date, recognition_month date,
      manual boolean NOT NULL DEFAULT false);
    CREATE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date) RETURNS SETOF test_facts LANGUAGE sql STABLE AS $$
      SELECT * FROM test_facts WHERE scheme_id = p_scheme AND (p_from IS NULL OR recognition_month >= p_from)
        AND (p_until IS NULL OR recognition_month < p_until) $$;
    -- Places (not under test; production's own counts only the people still working).
    CREATE FUNCTION public.member_occupied(p_sub uuid, p_date date) RETURNS integer LANGUAGE sql STABLE AS $$
      SELECT count(DISTINCT h.staff_id)::integer FROM comm_hierarchy h JOIN comm_schemes c ON c.id = h.scheme_id WHERE c.sub_department_id = p_sub $$;
  `)

  // ── Production, from the repo copies it runs (md5 = production's on 2026-10-14) ──────────────────────────
  await productionFunction('20260917060000_member_performance_order_facts', 'member_scoreboard', '80bc6819f6f93eae002d4cf1b06f3808')
  await productionFunction('20261004010000_member_order_book', 'member_scoreboard_range', 'f8d61d1177ab8982ecd2fe7770dec580')
  await productionFunction('20260917060000_member_performance_order_facts', 'member_insight_orders', '1a1e609c1874e1dc46b872150116e695')
  await productionFunction('20260916010000_member_insight', 'member_department_board', '779ab46bc07e3f749106af0507a69db5')
  await productionFunction('20260916010000_member_insight', 'member_downline_board', '9110586fc7dab49dce695e33954d7610')
  await productionFunction('20261004010000_member_order_book', 'member_insight_range_for_staff', '46d591a3d6fcea8cf394f1076e9eded8')
  await productionFunction('20260912030000_member_read_models', 'member_tree_json', 'c46685892c0dd51934fa0af57e6f5c5f')
  await productionFunction('20260912020000_member_self_service', 'member_staff_id', 'a979898c84f67c45f29ba168cfaf98de')
  await productionFunction('20260912020000_member_self_service', 'member_has_membership', '70ec93f70d453300d6eb8e985509f088')
  await productionFunction('20261004010000_member_order_book', 'member_insight_scheme', '2b1cd0c484a12598ff4a5c9f397befcf')
  await productionFunction('20260917010000_member_arena', 'member_arena_scheme', 'e2c49806fe9f2891cb4fbac34094eb09')
  await productionFunction('20261004020000_member_month_follows_close', 'member_kpi_for_staff', '9de5b5c85d3687fdba5ccbb323d7b709', ['p_staff', 'p_scheme', 'p_period'])
  await productionFunction('20261005120000_member_quote_context_no_ratio', 'member_quote_context', 'e79ebc7453d19400378f7c7bc98a4045')
  await productionFunction('20260917040000_member_principal_function_parity', 'member_insight_for_staff', 'e2c1cc93a60ad6e2d1159cfde391826e')
  await productionFunction('20260917040000_member_principal_function_parity', 'member_org_map_for_department', 'a981676a61cd450487f3a08229ff6a9f')
  // Newer in production than in the repo: production's own text.
  await db.exec(await text(new URL('director-seat-production.sql', import.meta.url)))
  check(await md5Of('public.member_data_snapshot(boolean)'), 'f44dac41ed77726c9b53ac5ddec69be0', 'the member snapshot is production’s')
  check(await md5Of('public.member_visible_memo(uuid,uuid)'), 'a52d1aa6ef7c380b4097517e34c68f96', 'member_visible_memo is production’s')

  // ── The department ────────────────────────────────────────────────────────────────────────────────────────
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department', 'commission')`, [DEPT])
  await q(`INSERT INTO comm_sub_departments(id, name, code, department_id, created_at) VALUES
    ($1, 'Fair', 'FAIR', $3, '2026-01-01'), ($2, 'IR', NULL, $3, '2026-02-01')`, [FAIR, IR, DEPT])
  await q(`INSERT INTO comm_schemes(id, sub_department_id, is_active, effective_from, effective_to) VALUES
    ($1, $4, true, '2026-01-01', NULL), ($2, $5, true, '2026-01-01', NULL), ($3, $4, false, '2025-01-01', '2025-12-31')`,
  [S_FAIR, S_IR, S_FAIR_OLD, FAIR, IR])
  await q(`INSERT INTO titles VALUES ($1, 'Revenue Director', true), ($2, 'Team Leader', false), ($3, 'Revenue Specialist', false)`, [T_DIR, T_TL, T_RS])
  // Fair's ladder: the director's own rung (Rank SS, no gate) and two member rungs; IR has no director rung.
  await q(`INSERT INTO comm_ranks(id, scheme_id, rank_key, label, product_rate, sort_order, title_id, personal_sales_threshold, consecutive_months) VALUES
    ($1, $5, 'rd_12', 'Rank SS', 0.12, 70, $6, NULL, NULL), ($2, $5, 'a', 'Rank A', 0.09, 20, $7, 50000, 1),
    ($3, $5, 'b', 'Rank B', 0.06, 10, $8, NULL, NULL), ($4, $9, 'a', 'Rank A', 0.05, 20, $7, NULL, NULL)`,
  [R_SS, R_A, R_B, R_IRA, S_FAIR, T_DIR, T_TL, T_RS, S_IR])
  await q(`INSERT INTO member_department_capacity VALUES ($1, 28)`, [FAIR])
  await q(`INSERT INTO users(id, email, name, role) VALUES ($1, 'peter@x', 'PETER', 'revenue_member'), ($2, 'kris@x', 'KRIS', 'revenue_member'),
    ($3, 'anna@x', 'ANNA', 'revenue_member'), ($4, 'out@x', 'OUT', 'revenue_member'), ($5, 'gone@x', 'GONE', 'revenue_member')`,
  [U_PETER, U_KRIS, U_ANNA, U_OUT, U_GONE])
  const staff = [
    [PETER, 'PETER', U_PETER, T_DIR, 'active'], [KRIS, 'KRIS', U_KRIS, T_DIR, 'active'], [ANNA, 'ANNA', U_ANNA, T_TL, 'active'],
    [BEN, 'BEN', null, T_RS, 'active'], [CARL, 'CARL', null, T_TL, 'active'], [DORA, 'DORA', null, T_RS, 'active'],
    [EVE, 'EVE', null, T_RS, 'active'], [IRMA, 'IRMA', null, T_TL, 'active'], [IAN, 'IAN', null, T_RS, 'active'],
    [OUT, 'OUT', U_OUT, T_RS, 'active'], [GONE, 'GONE', U_GONE, T_DIR, 'inactive'],
  ]
  for (const [sid, name, user, title, status] of staff) {
    await q('INSERT INTO hr_staff_costs(id, employee_name, user_id, department_id, title_id, status) VALUES ($1, $2, $3, $4, $5, $6)', [sid, name, user, DEPT, title, status])
  }
  // Fair ← PETER + KRIS (+ GONE, who left); IR ← PETER.
  await q(`INSERT INTO comm_sub_department_directors(sub_department_id, staff_id) VALUES ($1, $3), ($1, $4), ($1, $5), ($2, $3)`, [FAIR, IR, PETER, KRIS, GONE])
  // Fair: ANNA → BEN, CARL → DORA, and EVE, whose upline IRMA holds no seat in Fair. IR: IRMA → IAN.
  const seat = (scheme, s, upline, title, rank) => q('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, title_id, rank_id) VALUES ($1, $2, $3, $4, $5)', [scheme, s, upline, title, rank])
  await seat(S_FAIR, ANNA, null, T_TL, R_A); await seat(S_FAIR, BEN, ANNA, T_RS, R_B)
  await seat(S_FAIR, CARL, null, T_TL, R_A); await seat(S_FAIR, DORA, CARL, T_RS, R_B)
  await seat(S_FAIR, EVE, IRMA, T_RS, R_B)
  await seat(S_IR, IRMA, null, T_TL, R_IRA); await seat(S_IR, IAN, IRMA, T_RS, null)

  const month = await one(`SELECT date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::date::text`)
  const bill = (n, s, revenue, cleared = true, scheme = S_FAIR) => q(`INSERT INTO test_facts(order_id, order_no, staff_id, scheme_id, brand, revenue,
    goods_revenue, margin_pct, kpi_qty, cleared, order_date, source_period, recognition_month) VALUES ($1, $2, $3, $4, 'AKEMI', $5, $5, 0.4, 1, $6, $7, $7, $7)`,
  [id(400 + n), `HC-${n}`, s, scheme, revenue, cleared, month])
  await bill(1, ANNA, 10000); await bill(2, BEN, 5000); await bill(3, CARL, 7000); await bill(4, DORA, 3000, false)
  await bill(5, EVE, 2000); await bill(6, PETER, 1000); await bill(7, IRMA, 4000, true, S_IR); await bill(8, KRIS, 500)

  await q(`INSERT INTO member_memos(id, title, body, sender, kind) VALUES ($1, 'Fair memo', 'x', 'HR', 'Memo'), ($2, 'IR memo', 'x', 'HR', 'Memo'),
    ($3, 'Letter', 'x', 'HR', 'Letter')`, [M_FAIR, M_IR, M_OUT])
  await q(`INSERT INTO member_memo_audiences VALUES ($1, $3), ($2, $4)`, [M_FAIR, M_IR, FAIR, IR])
  await q(`INSERT INTO member_memo_recipients VALUES ($1, $2)`, [M_OUT, OUT])

  // ── Before: a director's app has nothing ────────────────────────────────────────────────────────────────────
  await as(U_PETER)
  check((await one('SELECT member_data_snapshot(false)')).memberships, [], 'before: PETER’s switcher is empty')
  await reject('SELECT member_insight_scheme($1)', [FAIR], /not available to your account/, 'before: Fair is not PETER’s')

  // ── A body production changed since is refused before anything is written ───────────────────────────────────
  const migration = await migrationText(MIGRATION)
  const treeBefore = await one(`SELECT pg_get_functiondef('public.member_tree_json(uuid,uuid)'::regprocedure)`)
  await db.exec(treeBefore.replace(`'Title 待配置'`, `'Title pending'`))
  await assert.rejects(() => db.exec(migration), /member_tree_json\(uuid,uuid\) changed in production/, 'a drifted body stops the migration')
  checks++
  check(await one(`SELECT to_regprocedure('public.member_director_scheme(uuid,uuid)') IS NULL`), true, 'nothing of it was applied')
  await db.exec(treeBefore)

  // ── The migration, verbatim — twice, the second changing nothing ────────────────────────────────────────────
  await db.exec(migration)
  const touched = ['public.member_insight_scheme(uuid)', 'public.member_arena_scheme(uuid)', 'public.member_kpi_for_staff(uuid,uuid,date)',
    'public.member_quote_context(uuid)', 'public.member_visible_memo(uuid,uuid)', 'public.member_data_snapshot(boolean)',
    'public.member_insight_for_staff(uuid,text,uuid,boolean)', 'public.member_downline_board(uuid,uuid,date)',
    'public.member_insight_range_for_staff(uuid,uuid,date,date)', 'public.member_tree_json(uuid,uuid)',
    'public.member_org_map_for_department(uuid,uuid)', 'public.member_director_scheme(uuid,uuid)']
  const bodies = async () => Promise.all(touched.map(md5Of))
  const once = await bodies()
  await db.exec(migration)
  check(await bodies(), once, 'applying it twice changes nothing')

  // ── The one rule ────────────────────────────────────────────────────────────────────────────────────────────
  const directs = (s, sub) => one('SELECT member_director_scheme($1, $2)', [s, sub])
  check(await directs(PETER, FAIR), S_FAIR, 'PETER reads Fair by its current scheme, not the old one')
  check(await directs(PETER, IR), S_IR, 'PETER directs IR')
  check(await directs(KRIS, FAIR), S_FAIR, 'KRIS directs Fair')
  check(await directs(KRIS, IR), null, 'KRIS does not direct IR')
  check(await directs(GONE, FAIR), null, 'a director who left directs nothing')
  check(await directs(ANNA, FAIR), null, 'a member is no director')
  await q(`UPDATE hr_staff_costs SET resignation_date = '2026-01-31' WHERE id = $1`, [KRIS])
  check(await directs(KRIS, FAIR), null, 'nor one past their last day')
  await q(`UPDATE hr_staff_costs SET resignation_date = NULL WHERE id = $1`, [KRIS])
  for (const role of ['anon', 'authenticated']) {
    check(await one(`SELECT has_function_privilege('${role}', 'public.member_director_scheme(uuid,uuid)', 'EXECUTE')`), false, `${role} cannot call the rule`)
  }
  check(await one(`SELECT has_function_privilege('service_role', 'public.member_director_scheme(uuid,uuid)', 'EXECUTE')`), true, 'the service role can')

  // ── "Is this the caller's sub-department" ───────────────────────────────────────────────────────────────────
  await as(U_PETER)
  check(await one('SELECT member_insight_scheme($1)', [FAIR]), S_FAIR, 'Insight opens Fair for PETER')
  check(await one('SELECT member_insight_scheme($1)', [IR]), S_IR, 'and IR')
  check(await one('SELECT member_arena_scheme($1)', [FAIR]), S_FAIR, 'the Arena too')
  await as(U_KRIS)
  check(await one('SELECT member_insight_scheme($1)', [FAIR]), S_FAIR, 'Insight opens Fair for KRIS')
  await reject('SELECT member_insight_scheme($1)', [IR], /not available to your account/, 'not IR, which KRIS does not direct')
  await reject('SELECT member_arena_scheme($1)', [IR], /not available to your account/, 'nor its Arena')
  await as(U_ANNA)
  check(await one('SELECT member_insight_scheme($1)', [FAIR]), S_FAIR, 'a member still reads their own sub-department')
  await reject('SELECT member_insight_scheme($1)', [IR], /not available to your account/, 'and still not another')
  await as(U_OUT)
  await reject('SELECT member_insight_scheme($1)', [FAIR], /not available to your account/, 'somebody with no seat and no directorship reads nothing')
  await reject('SELECT member_arena_scheme($1)', [FAIR], /not available to your account/, 'nor the Arena')
  await as(U_PETER, 'member_portal')
  await reject('SELECT member_insight_scheme($1)', [FAIR], /Insight is not enabled/, 'a director without Insight is still refused')

  // KPI and the Quote
  await as(U_PETER)
  check((await one('SELECT member_kpi_for_staff($1, $2, NULL)', [PETER, S_FAIR])).enabled, false, 'KPI opens for Fair’s director (off this month)')
  await reject('SELECT member_kpi_for_staff($1, $2, NULL)', [KRIS, S_IR], /active membership in this scheme/, 'not for IR, which KRIS does not direct')
  await reject('SELECT member_kpi_for_staff($1, $2, NULL)', [OUT, S_FAIR], /active membership in this scheme/, 'nor for somebody with no seat')
  check((await one('SELECT member_kpi_for_staff($1, $2, NULL)', [ANNA, S_FAIR])).enabled, false, 'a member’s as before')
  check((await one('SELECT member_quote_context($1)', [S_FAIR])).subDepartmentId, FAIR, 'Fair’s calculator opens for its director')
  await reject('SELECT member_quote_context($1)', [S_IR], /active Fair membership is required/, 'IR has no calculator, director or not')
  await as(U_OUT)
  await reject('SELECT member_quote_context($1)', [S_FAIR], /active Fair membership is required/, 'the calculator stays closed to somebody with no seat')

  // ── Everybody is under the director; a member's subtree is as it was ───────────────────────────────────────
  const downline = async (scheme, s) => (await q('SELECT name, depth, upline_id, sales FROM member_downline_board($1, $2, $3) ORDER BY depth, name', [scheme, s, month]))
    .map(r => [r.name, r.depth, r.upline_id, Number(r.sales)])
  check(await downline(S_FAIR, PETER), [['ANNA', 1, PETER, 10000], ['CARL', 1, PETER, 7000], ['EVE', 1, PETER, 2000], ['BEN', 2, ANNA, 5000], ['DORA', 2, CARL, 0]],
    'PETER: the tops and EVE (her upline holds no seat in Fair) report to him, everybody below them follows')
  check(await downline(S_FAIR, KRIS), (await downline(S_FAIR, PETER)).map(r => (r[2] === PETER ? [r[0], r[1], KRIS, r[3]] : r)), 'KRIS, Fair’s other director, the same')
  check(await downline(S_IR, PETER), [['IRMA', 1, PETER, 4000], ['IAN', 2, IRMA, 0]], 'PETER in IR')
  check(await downline(S_IR, KRIS), [], 'KRIS has nobody in IR')
  check(await downline(S_FAIR, ANNA), [['BEN', 1, ANNA, 5000]], 'ANNA’s own subtree, unchanged')
  check(await downline(S_FAIR, OUT), [], 'somebody with no seat has no subtree')

  const range = await one('SELECT member_insight_range_for_staff($1, $2, $3::date, ($3::date + interval \'1 month\')::date)', [PETER, S_FAIR, month])
  check([Number(range.me.sales), range.downline.map(r => [r.name, r.depth])], [1000, [['ANNA', 1], ['CARL', 1], ['EVE', 1], ['BEN', 2], ['DORA', 2]]],
    'a quarter or a year: PETER’s own bills, everybody below him')
  const annaRange = await one('SELECT member_insight_range_for_staff($1, $2, $3::date, ($3::date + interval \'1 month\')::date)', [ANNA, S_FAIR, month])
  check(annaRange.downline.map(r => r.name), ['BEN'], 'ANNA’s range, unchanged')

  const people = async (scheme, s) => (await one('SELECT member_tree_json($1, $2)', [scheme, s]))
    .map(p => [p.name, p.parentId, p.self])
  check(await people(S_FAIR, PETER), [['ANNA', null, false], ['BEN', ANNA, false], ['CARL', null, false], ['DORA', CARL, false], ['EVE', null, false]],
    'a director’s people: every seat in Fair, nobody marked as them')
  check(await people(S_FAIR, ANNA), [['ANNA', null, true], ['BEN', ANNA, false]], 'a member’s people, unchanged')

  // ── Insight's block ─────────────────────────────────────────────────────────────────────────────────────────
  const blocks = (await one('SELECT member_insight_for_staff($1, NULL, NULL, true)', [PETER])).blocks
  check(blocks.map(b => [b.department, b.director, b.title, b.rank, b.target]), [['Fair', true, 'Revenue Director', 'Rank SS', null], ['IR', true, 'Revenue Director', '', null]],
    'PETER: a block for each sub-department he directs — his title, his own rung where it has one, no next rung')
  const fair = blocks[0]
  check([Number(fair.me.sales), fair.downline.length, fair.orders.map(o => o.number)], [1000, 5, ['HC-6']], 'his own bills, everybody below him')
  const all = t => [t.sales, t.held, t.orders, t.kpiQty, t.marginRevenue, t.marginCost, t.blindOrders].map(Number)
  check(all(fair.team), [25500, 3000, 6, 6, 25500, 15300, 0],
    'All of Fair: every bill of the month — the members’, PETER’s own and KRIS’s, which nobody’s downline holds')
  check(fair.boards[0].rows.map(r => [r.name, r.self]), [['ANNA', false], ['CARL', false], ['BEN', false], ['EVE', false], ['DORA', false]],
    'Fair’s board lists the members, the director on none')
  check((await one('SELECT member_insight_for_staff($1, NULL, $2, true)', [PETER, IR])).blocks.map(b => b.department), ['IR'], 'one sub-department when asked for one')
  const krisBlocks = (await one('SELECT member_insight_for_staff($1, NULL, NULL, true)', [KRIS])).blocks
  check(krisBlocks.map(b => b.department), ['Fair'], 'KRIS: Fair only')
  check(all(krisBlocks[0].team), all(fair.team), 'and the same All of Fair as PETER')
  const anna = (await one('SELECT member_insight_for_staff($1, NULL, NULL, true)', [ANNA])).blocks
  check(anna.map(b => [b.department, b.rank, b.downline.map(d => d.name), 'director' in b, 'team' in b]), [['Fair', 'Rank A', ['BEN'], false, false]],
    'a member’s block, as before — not even a new key')
  check((await one('SELECT member_insight_for_staff($1, NULL, NULL, true)', [OUT])).blocks, [], 'somebody with no seat has none')

  // ── Memos ───────────────────────────────────────────────────────────────────────────────────────────────────
  const sees = (memo, s) => one('SELECT member_visible_memo($1, $2)', [memo, s])
  check([await sees(M_FAIR, PETER), await sees(M_IR, PETER), await sees(M_OUT, PETER)], [true, true, false], 'PETER sees Fair’s and IR’s memos, not a letter to somebody else')
  check([await sees(M_FAIR, KRIS), await sees(M_IR, KRIS)], [true, false], 'KRIS sees Fair’s only')
  check([await sees(M_FAIR, ANNA), await sees(M_IR, ANNA)], [true, false], 'a member as before')
  check([await sees(M_FAIR, OUT), await sees(M_OUT, OUT)], [false, true], 'a letter still reaches its person')
  check(await sees(M_FAIR, GONE), false, 'a director who left is told nothing')

  // ── The switcher ────────────────────────────────────────────────────────────────────────────────────────────
  await as(U_PETER)
  const snap = await one('SELECT member_data_snapshot(false)')
  check(snap.memberships.map(m => [m.name, m.director, m.title, m.rank, Number(m.rate), m.calculator, m.schemeId]),
    [['Fair', true, 'Revenue Director', 'Rank SS', 0.12, true, S_FAIR], ['IR', true, 'Revenue Director', '', 0, null, S_IR]],
    'PETER’s switcher: Fair and IR, his title and Fair’s director rung, the calculator in Fair')
  check(snap.memberships[0].people.map(p => p.name), ['ANNA', 'BEN', 'CARL', 'DORA', 'EVE'], 'Fair’s people: everybody')
  check([snap.memberships[0].capacity, snap.memberships[0].occupied], [28, 5], 'its places')
  check(snap.memos.map(m => m.title).sort(), ['Fair memo', 'IR memo'], 'his sub-departments’ memos')
  await as(U_KRIS)
  check((await one('SELECT member_data_snapshot(false)')).memberships.map(m => m.name), ['Fair'], 'KRIS’s: Fair')
  await as(U_ANNA)
  const annaSnap = await one('SELECT member_data_snapshot(false)')
  check(annaSnap.memberships.map(m => [m.name, m.director ?? null, m.rank, m.people.length]), [['Fair', null, 'Rank A', 2]], 'a member’s: as before')
  await as(U_OUT)
  check((await one('SELECT member_data_snapshot(false)')).memberships, [], 'somebody with no seat and no directorship: none')
  await as(U_PETER, 'member_portal,member_insight,member_memos')
  check((await one('SELECT member_data_snapshot(false)')).memberships.map(m => m.calculator), [false, false], 'no calculator without Quote')

  // ── The team map ────────────────────────────────────────────────────────────────────────────────────────────
  const map = async s => {
    const m = await one('SELECT member_org_map_for_department($1, $2)', [DEPT, s])
    return [m.departments.map(d => [d.name, d.mine, d.directors.map(x => x.name)]), [...new Set(m.people.filter(p => p.mine).map(p => p.departmentId))].sort()]
  }
  check(await map(PETER), [[['Fair', true, ['KRIS', 'PETER']], ['IR', true, ['PETER']]], [FAIR, IR].sort()], 'PETER’s map: both his (GONE, who left, on no rail)')
  check(await map(KRIS), [[['Fair', true, ['KRIS', 'PETER']], ['IR', false, ['PETER']]], [FAIR]], 'KRIS’s: Fair')
  check(await map(ANNA), [[['Fair', true, ['KRIS', 'PETER']], ['IR', false, ['PETER']]], [FAIR]], 'a member’s: as before')
  check(await map(null), [[['Fair', false, ['KRIS', 'PETER']], ['IR', false, ['PETER']]], []], 'the Principal’s (nobody): as before')

  console.log(`PASS: ${checks} director-seat checks (20261014090000 verbatim, twice, over production’s bodies). No live I/O.`)
} finally {
  await db.close()
}
