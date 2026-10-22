// Local PostgreSQL regression for 20261023100000 (2026-10-23 — the user, on the Revenue app's Profile › View as:
// "找不到我的 revenue director 了。By right 它应该是能够找得到的"). A Revenue Director holds no seat (23DIR); their own app reads
// them as the top of each sub-department they direct since 20261014090000, but the Principal's View as listed only
// seats and member_principal_context refused anybody without one. The two functions the migration swaps a statement
// into are production's own text (`view-as-director-production.sql`, md5-checked); the rest are the repo copies
// production runs (md5-checked). The migration runs VERBATIM, twice. What is under test: View as's list carries each
// sub-department's directors after its seats, as their own switcher names them (title, rung or '', no upline,
// `director`), never one who left or one who also sits there; the reads open for a director of the sub-department and
// for nobody new; a p_scheme that is not the director's is still refused; the seats' entries are unchanged; a body
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
const MIGRATION = '20261023100000_view_as_revenue_director'

/** The LAST definition of a function in a repo migration — the body production ran — as one statement. */
async function productionFunction(migration, name, md5) {
  const sql = await migrationText(migration)
  const head = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'ig')
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

const DEPT = id(1), OTHER_DEPT = id(2)
const FAIR = id(10), IR = id(11)
const S_FAIR = id(20), S_IR = id(21), S_FAIR_OLD = id(23)
const T_DIR = id(30), T_TL = id(31), T_RS = id(32)
const R_SS = id(40), R_A = id(41), R_B = id(42), R_IRA = id(43)
const U_PRINCIPAL = id(100), U_ANNA = id(103), U_HR = id(106)
const PETER = id(201), KRIS = id(202), ANNA = id(203), BEN = id(204), CARL = id(205), OUT = id(210), GONE = id(211), LEFT = id(212)

async function as(user) {
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
}
const ctx = (staff, sub, scheme = null) => q('SELECT member_principal_context($1, $2, $3) AS s', [staff, sub, scheme]).then(r => r[0].s)
const NOT_HERE = /needs an active membership in this department/

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE users(id uuid PRIMARY KEY, email text, name text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text, payroll_source text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, first_name text, user_id uuid,
      department_id uuid, title_id uuid, status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date,
      basic_salary numeric DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, code text, department_id uuid,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL);
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now(),
      enable_kpi boolean NOT NULL DEFAULT false);
    CREATE TABLE comm_ranks(id uuid PRIMARY KEY, scheme_id uuid, rank_key text, label text, product_rate numeric, sort_order integer, title_id uuid);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, staff_id uuid NOT NULL,
      upline_staff_id uuid, title_id uuid, rank_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_sub_department_directors(sub_department_id uuid NOT NULL, staff_id uuid NOT NULL, created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (sub_department_id, staff_id));
    CREATE TABLE member_department_capacity(sub_department_id uuid PRIMARY KEY, headcount_limit integer);
    CREATE TABLE comm_runs(id uuid PRIMARY KEY, scheme_id uuid, sub_department_id uuid, period_month date, status text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_statements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, staff_id uuid, product_commission numeric,
      override_commission numeric, kpi_commission numeric, open_bill_bonus numeric, margin_incentive numeric, group_incentive numeric,
      total_commission numeric, product_revenue numeric, deferred_revenue numeric, kpi_qty numeric);
    CREATE TABLE comm_brands(id uuid PRIMARY KEY, scheme_id uuid, code text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE comm_margin_bands(id uuid PRIMARY KEY, scheme_id uuid, brand_id uuid, label text, kind text, margin_pct numeric,
      commission_multiplier numeric, monthly_incentive numeric);
    CREATE TABLE member_requests(id uuid PRIMARY KEY, sub_department_id uuid, status text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE member_memos(id uuid PRIMARY KEY, title text, body text, sender text, published_at timestamptz NOT NULL DEFAULT now(),
      effective_at date, version integer NOT NULL DEFAULT 1, requires_ack boolean NOT NULL DEFAULT false, kind text,
      attachment_path text, attachment_name text, attachment_type text, attachment_deleted_at timestamptz);
    CREATE TABLE member_memo_audiences(memo_id uuid, sub_department_id uuid);
    CREATE TABLE member_memo_recipients(memo_id uuid, staff_id uuid);
    CREATE TABLE member_memo_receipts(memo_id uuid, user_id uuid, version integer, read_at timestamptz, acknowledged_at timestamptz);

    -- Not under test: a request's own JSON, a name's parts.
    CREATE FUNCTION public.member_request_json(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('id', p_id) $$;
    CREATE FUNCTION public.person_name_parts(p_name text, OUT first_name text, OUT last_name text) LANGUAGE sql IMMUTABLE AS $$
      SELECT split_part(p_name, ' ', 1), nullif(split_part(p_name, ' ', 2), '') $$;
    -- Reached only when no member is named (the member's own session) — never by the Principal's reads here.
    CREATE FUNCTION public.member_insight_scheme(p_sub uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  `)

  // ── Production, from the repo copies it runs (md5 = production's on 2026-10-23) ──────────────────────────
  await productionFunction('20260917040000_member_principal_function_parity', 'member_principal_department', '1dd7819daa1a4ba75e8d1bd0c25026aa')
  await productionFunction('20261014090000_revenue_director_in_member_app', 'member_director_scheme', '7d993d9b630cefc6ad97e32d697e80a4')
  await productionFunction('20261005040000_member_income_context', 'member_income_context', 'd8f3114a6694954480b8358d23900187')
  // Newer in production than in the repo: production's own text.
  await db.exec(await text(new URL('view-as-director-production.sql', import.meta.url)))
  check(await md5Of('public.member_principal_context(uuid,uuid,uuid)'), '04ccd4e04e98834263f0c35837cfa2b1', 'member_principal_context is production’s')
  check(await md5Of('public.member_principal_snapshot(boolean)'), '80abc002c770035b9e5c04db014d306a', 'the Principal’s snapshot is production’s')
  // Production's grants: only the service role (and the owner) may call the context; the snapshot is the app's.
  await db.exec(`
    REVOKE ALL ON FUNCTION public.member_principal_context(uuid,uuid,uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.member_principal_context(uuid,uuid,uuid) TO service_role;
    REVOKE ALL ON FUNCTION public.member_principal_snapshot(boolean) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.member_principal_snapshot(boolean) TO authenticated, service_role;
  `)
  const grants = () => q(`SELECT r.rolname, has_function_privilege(r.rolname, 'public.member_principal_context(uuid,uuid,uuid)', 'EXECUTE') AS ctx,
    has_function_privilege(r.rolname, 'public.member_principal_snapshot(boolean)', 'EXECUTE') AS snap
    FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role') ORDER BY 1`)
  const grantsBefore = await grants()

  // ── The department ────────────────────────────────────────────────────────────────────────────────────────
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department', 'commission'), ($2, 'HQ', 'manual')`, [DEPT, OTHER_DEPT])
  await q(`INSERT INTO comm_sub_departments(id, name, code, department_id, created_at) VALUES
    ($1, 'Fair', 'FAIR', $3, '2026-01-01'), ($2, 'IR', NULL, $3, '2026-02-01')`, [FAIR, IR, DEPT])
  await q(`INSERT INTO comm_schemes(id, sub_department_id, is_active, effective_from, effective_to) VALUES
    ($1, $4, true, '2026-01-01', NULL), ($2, $5, true, '2026-01-01', NULL), ($3, $4, false, '2025-01-01', '2025-12-31')`,
  [S_FAIR, S_IR, S_FAIR_OLD, FAIR, IR])
  await q(`INSERT INTO titles VALUES ($1, 'Revenue Director', true), ($2, 'Team Leader', false), ($3, 'Revenue Specialist', false)`, [T_DIR, T_TL, T_RS])
  // Fair's ladder has the director's own rung (Rank SS); IR's has none.
  await q(`INSERT INTO comm_ranks(id, scheme_id, rank_key, label, product_rate, sort_order, title_id) VALUES
    ($1, $5, 'rd_12', 'Rank SS', 0.12, 70, $6), ($2, $5, 'a', 'Rank A', 0.09, 20, $7),
    ($3, $5, 'b', 'Rank B', 0.06, 10, $8), ($4, $9, 'a', 'Rank A', 0.05, 20, $7)`,
  [R_SS, R_A, R_B, R_IRA, S_FAIR, T_DIR, T_TL, T_RS, S_IR])
  await q(`INSERT INTO member_department_capacity VALUES ($1, 28)`, [FAIR])
  await q(`INSERT INTO users(id, email, name, role) VALUES ($1, 'principal@x', 'Principal', 'principal'), ($2, 'anna@x', 'ANNA', 'revenue_member'),
    ($3, 'hr@x', 'HR', 'hr')`, [U_PRINCIPAL, U_ANNA, U_HR])
  const staff = [
    [PETER, 'PETER', T_DIR, 'active', null], [KRIS, 'KRIS', T_DIR, 'active', null], [ANNA, 'ANNA', T_TL, 'active', null],
    [BEN, 'BEN', T_RS, 'active', null], [CARL, 'CARL', T_TL, 'active', null], [OUT, 'OUT', T_RS, 'active', null],
    [GONE, 'GONE', T_DIR, 'inactive', null], [LEFT, 'LEFT', T_DIR, 'active', '2026-01-31'],
  ]
  for (const [sid, name, title, status, resigned] of staff) {
    await q('INSERT INTO hr_staff_costs(id, employee_name, department_id, title_id, status, resignation_date) VALUES ($1, $2, $3, $4, $5, $6)',
      [sid, name, DEPT, title, status, resigned])
  }
  await q('UPDATE hr_staff_costs SET user_id = $1 WHERE id = $2', [U_ANNA, ANNA])
  // Fair ← PETER + KRIS (+ GONE, inactive, and LEFT, past their last day); IR ← PETER.
  await q(`INSERT INTO comm_sub_department_directors(sub_department_id, staff_id) VALUES ($1, $3), ($1, $4), ($1, $5), ($1, $6), ($2, $3)`,
    [FAIR, IR, PETER, KRIS, GONE, LEFT])
  // Fair: ANNA → BEN, CARL. IR: CARL.
  const seat = (scheme, s, upline, title, rank) => q('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, title_id, rank_id) VALUES ($1, $2, $3, $4, $5)', [scheme, s, upline, title, rank])
  await seat(S_FAIR, ANNA, null, T_TL, R_A); await seat(S_FAIR, BEN, ANNA, T_RS, R_B); await seat(S_FAIR, CARL, null, T_TL, R_A)
  await seat(S_IR, CARL, null, T_TL, R_IRA)

  const people = async () => {
    const snap = await one('SELECT member_principal_snapshot(false)')
    return Object.fromEntries(snap.memberships.map(m => [m.name, m.people]))
  }

  // ── Before: View as lists the seats only, and refuses a director ──────────────────────────────────────────────
  await as(U_PRINCIPAL)
  const before = await people()
  check(Object.entries(before).map(([n, ps]) => [n, ps.map(p => p.name)]), [['Fair', ['ANNA', 'BEN', 'CARL']], ['IR', ['CARL']]],
    'before: Fair and IR list their seats, no director')
  await reject('SELECT member_principal_context($1, $2, NULL)', [PETER, FAIR], NOT_HERE, 'before: PETER cannot be viewed in Fair')
  const occupiedBefore = (await one('SELECT member_principal_snapshot(false)')).memberships.map(m => [m.name, m.occupied, m.capacity])

  // ── A body production changed since is refused before anything is written ───────────────────────────────────
  const migration = await migrationText(MIGRATION)
  const ctxBefore = await one(`SELECT pg_get_functiondef('public.member_principal_context(uuid,uuid,uuid)'::regprocedure)`)
  await db.exec(ctxBefore.replace('needs an active membership', 'needs a membership'))
  await assert.rejects(() => db.exec(migration), /member_principal_context.*its statement is there 0 times/, 'a drifted body stops the migration')
  checks++
  await db.exec(ctxBefore)
  check(await md5Of('public.member_principal_context(uuid,uuid,uuid)'), '04ccd4e04e98834263f0c35837cfa2b1', 'and production’s body is back for the real run')
  check(await md5Of('public.member_principal_snapshot(boolean)'), '80abc002c770035b9e5c04db014d306a', 'the snapshot untouched by the refused run')

  // ── The migration, verbatim — twice, the second changing nothing ────────────────────────────────────────────
  await db.exec(migration)
  const touched = ['public.member_principal_context(uuid,uuid,uuid)', 'public.member_principal_snapshot(boolean)']
  const once = await Promise.all(touched.map(md5Of))
  check(once.map((m, i) => m !== ['04ccd4e04e98834263f0c35837cfa2b1', '80abc002c770035b9e5c04db014d306a'][i]), [true, true], 'both bodies changed')
  await db.exec(migration)
  check(await Promise.all(touched.map(md5Of)), once, 'applying it twice changes nothing')
  check(await grants(), grantsBefore, 'nobody new may call either function')

  // ── View as's list ──────────────────────────────────────────────────────────────────────────────────────────
  await as(U_PRINCIPAL)
  const after = await people()
  const seats = ps => ps.filter(p => !p.director)
  check(seats(after.Fair), before.Fair, 'Fair’s seats are exactly as before')
  check(seats(after.IR), before.IR, 'and IR’s')
  check(after.Fair.filter(p => p.director), [
    { id: KRIS, name: 'KRIS', title: 'Revenue Director', rank: 'Rank SS', parentId: null, self: false, director: true },
    { id: PETER, name: 'PETER', title: 'Revenue Director', rank: 'Rank SS', parentId: null, self: false, director: true },
  ], 'Fair lists its directors after the seats — their title and Fair’s director rung, no upline (GONE, inactive, and LEFT, past their last day, not at all)')
  check(after.IR.filter(p => p.director), [
    { id: PETER, name: 'PETER', title: 'Revenue Director', rank: '', parentId: null, self: false, director: true },
  ], 'IR lists PETER with no rank (IR’s ladder has no director rung) and not KRIS')
  check((await one('SELECT member_principal_snapshot(false)')).memberships.map(m => [m.name, m.occupied, m.capacity]), occupiedBefore,
    'a director takes no place: occupied and capacity as before')
  await seat(S_IR, PETER, null, T_DIR, null)
  check((await people()).IR.filter(p => p.id === PETER).map(p => [p.name, p.director ?? false]), [['PETER', false]],
    'somebody who also sits in the sub-department is listed once, by the seat')
  await q('DELETE FROM comm_hierarchy WHERE scheme_id = $1 AND staff_id = $2', [S_IR, PETER])
  await q(`UPDATE titles SET name = 'Head of Revenue' WHERE id = $1`, [T_DIR])
  check((await people()).Fair.filter(p => p.director).map(p => p.title), ['Head of Revenue', 'Head of Revenue'], 'the title is the person’s own, as it is named')
  await q(`UPDATE titles SET name = 'Revenue Director' WHERE id = $1`, [T_DIR])

  // ── The person picked ───────────────────────────────────────────────────────────────────────────────────────
  check(await ctx(PETER, FAIR), S_FAIR, 'PETER in Fair: Fair’s current scheme (not the old one)')
  check(await ctx(PETER, IR), S_IR, 'PETER in IR')
  check(await ctx(KRIS, FAIR), S_FAIR, 'KRIS in Fair')
  await reject('SELECT member_principal_context($1, $2, NULL)', [KRIS, IR], NOT_HERE, 'not KRIS in IR, which KRIS does not direct')
  await reject('SELECT member_principal_context($1, $2, NULL)', [GONE, FAIR], NOT_HERE, 'nor a director who is inactive')
  await reject('SELECT member_principal_context($1, $2, NULL)', [LEFT, FAIR], NOT_HERE, 'nor one past their last day')
  await reject('SELECT member_principal_context($1, $2, NULL)', [OUT, FAIR], NOT_HERE, 'nor somebody with no seat and no directorship')
  check(await ctx(PETER, FAIR, S_FAIR), S_FAIR, 'the scheme asked for, when it is the director’s')
  await reject('SELECT member_principal_context($1, $2, $3)', [PETER, FAIR, S_FAIR_OLD], NOT_HERE, 'never another scheme of the sub-department')
  await reject('SELECT member_principal_context($1, $2, $3)', [PETER, FAIR, S_IR], NOT_HERE, 'nor another sub-department’s')
  check(await ctx(ANNA, FAIR), S_FAIR, 'a member as before')
  check(await ctx(CARL, IR), S_IR, 'and in IR')
  await reject('SELECT member_principal_context($1, $2, NULL)', [ANNA, IR], NOT_HERE, 'a member still not where they have no seat')
  check(await one('SELECT member_income_context($1, $2)', [FAIR, PETER]), PETER, 'My income’s gate opens on PETER in Fair')
  await reject('SELECT member_income_context($1, $2)', [IR, KRIS], NOT_HERE, 'and stays shut on KRIS in IR')

  // ── Only the Principal ──────────────────────────────────────────────────────────────────────────────────────
  for (const [user, who] of [[U_ANNA, 'a member'], [U_HR, 'HR'], [null, 'nobody signed in']]) {
    await as(user)
    await reject('SELECT member_principal_context($1, $2, NULL)', [PETER, FAIR], /active Principal account is required/, `${who} cannot view a director`)
    await reject('SELECT member_principal_snapshot(false)', [], /active Principal account is required/, `nor read View as’s list (${who})`)
  }
  await as(U_PRINCIPAL)
  await q('UPDATE users SET is_active = false WHERE id = $1', [U_PRINCIPAL])
  await reject('SELECT member_principal_context($1, $2, NULL)', [PETER, FAIR], /active Principal account is required/, 'nor a Principal account switched off')
  await q('UPDATE users SET is_active = true WHERE id = $1', [U_PRINCIPAL])
  await q('UPDATE comm_sub_departments SET department_id = $1 WHERE id = $2', [OTHER_DEPT, IR])
  await reject('SELECT member_principal_context($1, $2, NULL)', [PETER, IR], /active Revenue department is required/, 'a sub-department outside Revenue stays shut')
  await q('UPDATE comm_sub_departments SET department_id = $1 WHERE id = $2', [DEPT, IR])

  console.log(`PASS: ${checks} view-as-director checks (20261023100000 verbatim, twice, over production’s bodies). No live I/O.`)
} finally {
  await db.close()
}
