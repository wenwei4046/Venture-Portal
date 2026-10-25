// Local PostgreSQL regression for 20261026014700 (2026-10-25 — a salesperson's note the user passed on, over the
// Principal's own Revenue app: "要看销售额的话，就是把全部的加起来 … 直接 show 全部人的单 … 要不然一直这样漏单的话，其实很
// 容易让人以为是出 bug"). Viewing nobody, the Principal's app read nothing but the commission: every read asked for a
// person. Four reads answer for the WHOLE sub-department, for an active Principal account only. The functions they are
// built on that decide who may read and which window — member_principal_department, member_insight_window,
// member_scoreboard_range, sales_order_parts — are the repo copies production runs (md5-checked); the bill facts, the
// boards, the booths and the KPI hits are stand-ins with the very columns production's return, so what is under test is
// the four functions' own work: who is let in, the scheme picked, everybody's figures summed and listed, every bill once
// with its salesperson, nobody marked as the reader, nobody's brand weeks. The migration runs VERBATIM, twice. No live I/O.
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
const MIGRATION = '20261026014700_revenue_app_whole_sub_department'

/** The LAST definition of a function in a repo migration — the body production runs — as one statement. */
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

const DEPT = id(1), HQ = id(2)
const FAIR = id(10), IR = id(11), SHOP = id(12)
const S_FAIR = id(20), S_FAIR_OLD = id(21), S_IR = id(22), S_SHOP = id(23)
const T_TL = id(30), T_RS = id(31), T_DIR = id(32), T_TA = id(33)
const U_PRINCIPAL = id(100), U_HR = id(101), U_GONE = id(102), U_ANNA = id(103)
const ANNA = id(201), BEN = id(202), CARL = id(203), KRIS = id(204), LEFT = id(205), DORA = id(206)
const B1 = id(301), B2 = id(302), B3 = id(303), B4 = id(304), B5 = id(305), B6 = id(306), B7 = id(307)
const L1 = id(401), L2 = id(402), L3 = id(403), L4 = id(404)
const EV = id(501), ORG = id(502)

async function as(user) {
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
}
const PRINCIPAL_ONLY = /An active Principal account is required/
const md5Of = sig => one('SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure', [sig])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE users(id uuid PRIMARY KEY, email text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text, payroll_source text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, title_id uuid,
      status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now(),
      enable_kpi boolean NOT NULL DEFAULT false, deposit_threshold_pct numeric);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, staff_id uuid NOT NULL,
      upline_staff_id uuid, title_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_kpi_thresholds(scheme_id uuid, min_qty integer, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, period_month date, status text);
    CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY, name text);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, start_date date, end_date date, organiser_id uuid, erp_organiser_text text);
    CREATE TABLE sales_orders(id uuid PRIMARY KEY, order_no text, staff_id uuid, bill_ref text, customer_name text, fair_source text,
      raw jsonb, venue text, fair_event_id uuid, order_total numeric, paid_amount numeric);
    CREATE TABLE sales_order_lines(id uuid PRIMARY KEY, order_id uuid, line_no integer, product_name text, product_code text, qty numeric,
      line_amount numeric, item_group text);
    CREATE TABLE sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);

    -- ── Stand-ins, with the columns production's return ─────────────────────────────────────────────────────────
    -- The bill facts member_order_facts works out (production's own is under its own tests): one row a bill, one a holder.
    CREATE TABLE facts(scheme_id uuid, order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date,
      brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean);
    CREATE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
      RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text,
        cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean)
      LANGUAGE sql STABLE AS $$
      SELECT f.order_id,f.staff_id,f.order_no,f.order_date,f.source_period,f.recognition_month,f.brand,f.cleared,f.revenue,f.goods_revenue,
        f.margin_pct,f.kpi_qty,f.manual FROM facts f
      WHERE f.scheme_id=p_scheme AND (p_from IS NULL OR f.recognition_month>=p_from) AND (p_until IS NULL OR f.recognition_month<p_until) $$;
    CREATE TABLE hits(line_id uuid, order_id uuid, item_id uuid, qty numeric, unit_amount numeric);
    CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_orders uuid[], p_at date)
      RETURNS TABLE(line_id uuid, order_id uuid, item_id uuid, qty numeric, unit_amount numeric)
      LANGUAGE sql STABLE AS $$ SELECT h.line_id,h.order_id,h.item_id,h.qty,h.unit_amount FROM hits h WHERE h.order_id=ANY(p_orders) $$;
    CREATE FUNCTION public.comm_first_paid_month(p_sub_department_id uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
    CREATE FUNCTION public.erp_sync_brand_code(p_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(p_name)) $$;
    -- The boards and the booths: what they were asked for comes back, so the reads' own arguments can be checked.
    CREATE FUNCTION public.member_arena_for_staff(p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean)
      RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('membershipId',p_sub_department,'asked',jsonb_build_object('staff',p_staff,'scheme',p_scheme,'period',p_period,
        'window',p_window,'isSelf',p_is_self),'selfId',CASE WHEN p_is_self THEN p_staff::text ELSE '' END,
        'people',jsonb_build_array(jsonb_build_object('id','x','self',p_is_self))) $$;
    CREATE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
      RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('events',jsonb_build_array(jsonb_build_object('id','fair|AKEMI','scheme',p_scheme)),
        'weeks',jsonb_build_array(jsonb_build_object('staffId','x','week','2026-10-02','brand','AKEMI'))) $$;
  `)

  // ── Production, from the repo copies it runs (md5 = production's on 2026-10-25) ──────────────────────────
  await productionFunction('20260917040000_member_principal_function_parity', 'member_principal_department', '1dd7819daa1a4ba75e8d1bd0c25026aa')
  await productionFunction('20261004010000_member_order_book', 'member_insight_window', 'c00dd0de9ce4e7d39db1812a5ca135b7')
  await productionFunction('20261004010000_member_order_book', 'member_scoreboard_range', 'f8d61d1177ab8982ecd2fe7770dec580')
  await productionFunction('20261021150000_shared_bills_in_the_revenue_app', 'sales_order_parts', '5232a846101d466c329cf34148db4d48')

  // ── The department ────────────────────────────────────────────────────────────────────────────────────────
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department', 'commission'), ($2, 'HQ', 'manual')`, [DEPT, HQ])
  await q(`INSERT INTO comm_sub_departments(id, name, department_id) VALUES ($1, 'Fair', $4), ($2, 'IR', $4), ($3, 'Shop', $5)`, [FAIR, IR, SHOP, DEPT, HQ])
  // Fair's current scheme and the one it replaced (inactive); IR's; a sub-department of a department that is not paid by commission.
  await q(`INSERT INTO comm_schemes(id, sub_department_id, is_active, effective_from, effective_to, created_at, deposit_threshold_pct) VALUES
    ($1, $5, true, '2026-01-01', NULL, '2026-01-01', 0.3), ($2, $5, false, '2025-01-01', '2025-12-31', '2025-01-01', 0.3),
    ($3, $6, true, '2026-01-01', NULL, '2026-01-01', NULL), ($4, $7, true, '2026-01-01', NULL, '2026-01-01', NULL)`,
  [S_FAIR, S_FAIR_OLD, S_IR, S_SHOP, FAIR, IR, SHOP])
  await q(`INSERT INTO titles VALUES ($1, 'Team Leader', false), ($2, 'Revenue Specialist', false), ($3, 'Revenue Director', true), ($4, 'Team Assistant', false)`,
    [T_TL, T_RS, T_DIR, T_TA])
  await q(`INSERT INTO users(id, email, role, is_active) VALUES ($1, 'principal@x', 'principal', true), ($2, 'hr@x', 'hr', true),
    ($3, 'gone@x', 'principal', false), ($4, 'anna@x', 'revenue_member', true)`, [U_PRINCIPAL, U_HR, U_GONE, U_ANNA])
  const staff = [
    [ANNA, 'ANNA', T_RS, 'active'], [BEN, 'BEN', T_RS, 'active'], [CARL, 'CARL', T_RS, 'active'],
    [KRIS, 'KRIS', T_DIR, 'active'], [LEFT, 'LEFT', T_RS, 'inactive'], [DORA, 'DORA', T_RS, 'active'],
  ]
  for (const [sid, name, title, status] of staff) {
    await q('INSERT INTO hr_staff_costs(id, employee_name, department_id, title_id, status) VALUES ($1, $2, $3, $4, $5)', [sid, name, DEPT, title, status])
  }
  // Fair: ANNA leads BEN; CARL sits with no bill; LEFT's seat is still there but they have left. KRIS directs (no seat).
  // DORA sits in IR only.
  const seat = (scheme, s, upline, title) => q('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, title_id) VALUES ($1, $2, $3, $4)', [scheme, s, upline, title])
  await seat(S_FAIR, ANNA, null, T_TL); await seat(S_FAIR, BEN, ANNA, T_TA); await seat(S_FAIR, CARL, ANNA, null); await seat(S_FAIR, LEFT, ANNA, T_RS)
  await seat(S_IR, DORA, null, T_RS)

  // October's bills: ANNA's two (one shared 50/50 with BEN), BEN's own, KRIS's own, LEFT's, one the ERP named nobody for;
  // September's: ANNA's one.
  const bill = (bid, no, staffId, total, paid, extra = {}) => q(`INSERT INTO sales_orders(id, order_no, staff_id, bill_ref, customer_name, fair_source, raw,
    venue, fair_event_id, order_total, paid_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
  [bid, no, staffId, extra.ref ?? null, extra.customer ?? 'Mdm Lee', extra.fairSource ?? null, extra.raw ? JSON.stringify(extra.raw) : null, extra.venue ?? 'SETIA SPICE',
    extra.event ?? null, total, paid])
  await q(`INSERT INTO comm_organisers VALUES ($1, 'MEGAHOME')`, [ORG])
  await q(`INSERT INTO comm_venue_events VALUES ($1, '2026-10-02', '2026-10-04', $2, NULL)`, [EV, ORG])
  await bill(B1, 'HC-SO-2610-001', ANNA, 5000, 5000, { ref: 'HC10519', event: EV, fairSource: 'erp', raw: { fair: { brand: 'akemi', status: 'confirmed' } } })
  await bill(B2, 'HC-SO-2610-002', ANNA, 4000, 4000, { event: EV })
  await bill(B3, 'HC-SO-2610-003', BEN, 3000, 500)
  await bill(B4, 'HC-SO-2610-004', KRIS, 2000, 2000)
  await bill(B5, 'HC-SO-2610-005', LEFT, 1000, 1000)
  await bill(B6, 'HC-SO-2610-006', null, 700, 700, { customer: '  ' })
  await bill(B7, 'HC-SO-2609-001', ANNA, 900, 900)
  await q(`INSERT INTO sales_order_shares VALUES ($1, $2, 0.5)`, [B2, BEN])
  await q(`INSERT INTO comm_item_groups VALUES ($1, 'MATTRESS', true), ($1, 'DELIVERY', false)`, [S_FAIR])
  await q(`INSERT INTO sales_order_lines VALUES ($1, $5, 1, 'AKEMI MATT (Q)', 'AK-Q', 1, 4800, 'MATTRESS'), ($2, $5, 2, '', 'PILLOW', 2, 0, 'MATTRESS'),
    ($3, $5, 3, 'DELIVERY', 'DLV', 1, 200, 'DELIVERY'), ($4, $6, 1, 'AKEMI MATT (K)', 'AK-K', 1, 4000, 'MATTRESS')`, [L1, L2, L3, L4, B1, B2])
  const fact = (scheme, order, staffId, no, month, brand, cleared, revenue, goods, margin, kpi = 0, day = `${month}-03`) =>
    q(`INSERT INTO facts VALUES ($1, $2, $3, $4, $5::date, $6::date, $6::date, $7, $8, $9, $10, $11, $12, false)`,
      [scheme, order, staffId, no, day, `${month}-01`, brand, cleared, revenue, goods, margin, kpi])
  await fact(S_FAIR, B1, ANNA, 'HC-SO-2610-001', '2026-10', 'AKEMI', true, 4800, 4800, 0.4, 2, '2026-10-02')
  // The shared bill: ANNA the owner's part (the remainder) and BEN's, adding up to RM 4,000.
  await fact(S_FAIR, B2, ANNA, 'HC-SO-2610-002', '2026-10', 'AKEMI', true, 2000, 2000, 0.35, 0, '2026-10-02')
  await fact(S_FAIR, B2, BEN, 'HC-SO-2610-002', '2026-10', 'AKEMI', true, 2000, 2000, 0.35, 0, '2026-10-02')
  await fact(S_FAIR, B3, BEN, 'HC-SO-2610-003', '2026-10', 'ZANOTTI', false, 3000, 3000, 0.3)
  await fact(S_FAIR, B4, KRIS, 'HC-SO-2610-004', '2026-10', 'AKEMI', true, 2000, 2000, null)
  await fact(S_FAIR, B5, LEFT, 'HC-SO-2610-005', '2026-10', 'DUNLOP', true, 1000, 1000, 0.5)
  await fact(S_FAIR, B6, null, 'HC-SO-2610-006', '2026-10', 'UNCLASSIFIED', true, 700, 700, 0.2)
  await fact(S_FAIR, B7, ANNA, 'HC-SO-2609-001', '2026-09', 'AKEMI', true, 900, 900, 0.45)
  // The old scheme's facts are never read.
  await fact(S_FAIR_OLD, B7, ANNA, 'HC-SO-2609-001', '2026-09', 'AKEMI', true, 99_999, 99_999, 0.45)
  await q(`INSERT INTO hits VALUES ($1, $2, gen_random_uuid(), 2, 30)`, [L2, B1])
  await q(`INSERT INTO comm_runs(scheme_id, period_month, status) VALUES ($1, '2026-08-01', 'applied'), ($1, '2026-09-01', 'draft')`, [S_FAIR])

  // ── A body production changed since? None: every function is new. The migration, verbatim — twice ─────────
  const migration = await migrationText(MIGRATION)
  await db.exec(migration)
  const sigs = ['public.member_principal_department_scheme(uuid)', 'public.member_principal_department_arena(uuid,text,text)',
    'public.member_principal_department_booth_history(uuid)', 'public.member_principal_department_insight(uuid,text,text)',
    'public.member_principal_department_order_book(uuid,text,text)']
  const once = await Promise.all(sigs.map(md5Of))
  await db.exec(migration)
  check(await Promise.all(sigs.map(md5Of)), once, 'applying it twice changes nothing')

  // ── Who may call them ────────────────────────────────────────────────────────────────────────────────────────
  const may = (role, sig) => one(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, sig])
  check(await Promise.all(['anon', 'authenticated', 'service_role'].map(r => may(r, sigs[0]))), [false, false, true],
    'the helper is only the four reads’ (their owner) and the service role’s')
  for (const sig of sigs.slice(1)) {
    check(await Promise.all(['anon', 'authenticated', 'service_role'].map(r => may(r, sig))), [false, true, true], `${sig}: a signed-in session, never anon`)
  }
  check(await one(`SELECT bool_and(prosecdef AND provolatile = 's' AND proconfig @> ARRAY['search_path=public']) FROM pg_proc WHERE oid = ANY($1::regprocedure[])`, [sigs]),
    true, 'each runs as its owner, reads only, on the public schema')

  // ── Nobody but an active Principal account ──────────────────────────────────────────────────────────────────
  const reads = [
    ['SELECT member_principal_department_arena($1, $2, $3)', [FAIR, '2026-10', 'monthly']],
    ['SELECT member_principal_department_booth_history($1)', [FAIR]],
    ['SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-10', '2026-10']],
    ['SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, '2026-10', '2026-10']],
  ]
  for (const who of [U_HR, U_ANNA, U_GONE, null]) {
    await as(who)
    for (const [sql, params] of reads) await reject(sql, params, PRINCIPAL_ONLY, `${who ?? 'nobody'} is refused: ${sql}`)
  }
  await as(U_PRINCIPAL)
  await reject('SELECT member_principal_department_insight($1, $2, $3)', [SHOP, '2026-10', '2026-10'], /An active Revenue department is required/,
    'a sub-department of a department not paid by commission is refused')
  await reject('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-10', '2026-09'], /Choose a month, a quarter or a year/,
    'a window that ends before it begins is refused')

  // ── The Arena: everybody on the boards, nobody the reader, the current scheme ────────────────────────────────
  const arena = await one('SELECT member_principal_department_arena($1, $2, $3)', [FAIR, '2026-10', 'quarterly'])
  check(arena.asked, { staff: null, scheme: S_FAIR, period: '2026-10', window: 'quarterly', isSelf: false }, 'the boards are asked for nobody, on Fair’s current scheme')
  check([arena.selfId, arena.people.map(p => p.self), arena.principalView, arena.wholeDepartment], ['', [false], true, true], 'and nobody on them is the reader')

  // ── The fairs: every booth, nobody's brand weeks ─────────────────────────────────────────────────────────────
  const booths = await one('SELECT member_principal_department_booth_history($1)', [FAIR])
  check([booths.events.map(e => e.scheme), booths.weeks], [[S_FAIR], []], 'every booth of Fair’s scheme, and no person’s brand weeks')

  // ── Insight: every bill summed, everybody's own figures ──────────────────────────────────────────────────────
  const oct = await one('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-10', '2026-10'])
  check([oct.membershipId, oct.schemeId, oct.department, oct.from, oct.through], [FAIR, S_FAIR, 'Fair', '2026-10', '2026-10'], 'the window and the scheme')
  // Cleared: 4,800 + 2,000 + 2,000 (ANNA's and BEN's parts of the shared bill) + 2,000 (KRIS) + 1,000 (LEFT) + 700 (nobody's).
  // Held: BEN's 3,000. The director's own and the bill the ERP named nobody for are every bill's too.
  check(oct.team, { sales: 12500, held: 3000, orders: 6, kpiQty: 2, marginRevenue: 10500, marginCost: 6540, blindOrders: 1 },
    'every bill of the month, summed')
  const people = oct.people.map(p => [p.name, p.title, Number(p.sales), Number(p.held), p.uplineId, p.depth])
  check(people, [
    ['ANNA', 'Team Leader', 6800, 0, null, 1],
    ['BEN', 'Team Assistant', 2000, 3000, ANNA, 1],
    ['KRIS', 'Revenue Director', 2000, 0, null, 1],
    ['LEFT', 'Revenue Specialist', 1000, 0, null, 1],
    ['CARL', 'Revenue Specialist', 0, 0, ANNA, 1],
  ], 'everybody who sits there (CARL with nothing yet, his seat titleless: his own title) and everybody who wrote a bill (KRIS, LEFT), by sales')
  check(oct.people.reduce((s, p) => s + Number(p.sales), 0) + 700, Number(oct.team.sales), 'the people add up to every bill but the one nobody was named for')
  check(oct.kpi, { enabled: false, threshold: null }, 'KPI off: nothing to count against')
  check([oct.live, (await one('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-09', '2026-09'])).live].map(v => typeof v), ['boolean', 'boolean'],
    'whether the window is still moving')
  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [S_FAIR])
  await q(`INSERT INTO comm_kpi_thresholds VALUES ($1, 40, '2026-01-01', '2026-09-30'), ($1, 30, '2026-10-01', NULL), ($1, 60, '2026-10-01', NULL)`, [S_FAIR])
  check((await one('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-10', '2026-10'])).kpi, { enabled: true, threshold: 30 },
    'KPI on: a person’s first rung, as at the window’s last day')
  check((await one('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-09', '2026-09'])).kpi, { enabled: true, threshold: 40 },
    'September’s rung for September')
  const q3 = await one('SELECT member_principal_department_insight($1, $2, $3)', [FAIR, '2026-07', '2026-09'])
  check([Number(q3.team.sales), q3.people.map(p => [p.name, Number(p.sales)])], [900, [['ANNA', 900], ['BEN', 0], ['CARL', 0]]],
    'a quarter: its months only, never the old scheme’s; LEFT has gone and wrote nothing in it')
  const ir = await one('SELECT member_principal_department_insight($1, $2, $3)', [IR, '2026-10', '2026-10'])
  check([Number(ir.team.sales), ir.people.map(p => p.name)], [0, ['DORA']], 'IR: its own seats, no bill of Fair’s')

  // ── The bills: every one, once, with its salesperson ─────────────────────────────────────────────────────────
  const book = await one('SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, '2026-10', '2026-10'])
  check([book.from, book.through, book.paysFrom, book.closedMonths, book.brandWeeks, book.principalView, book.wholeDepartment],
    ['2026-10', '2026-10', '2026-09', ['2026-08'], {}, true, true], 'the window, when the portal pays from, the months a run closed')
  check(book.orders.map(o => [o.number, Number(o.revenue), o.seller?.name ?? null, o.own]), [
    ['HC-SO-2610-001', 4800, 'ANNA', false], ['HC-SO-2610-002', 4000, 'ANNA', false], ['HC-SO-2610-003', 3000, 'BEN', false],
    ['HC-SO-2610-004', 2000, 'KRIS', false], ['HC-SO-2610-005', 1000, 'LEFT', false], ['HC-SO-2610-006', 700, null, false],
  ], 'each bill once — a shared one whole, its parts added back — named by its salesperson; nobody’s is the reader’s')
  const shared = book.orders.find(o => o.number === 'HC-SO-2610-002')
  check(shared.share, { part: 1, holders: [{ id: ANNA, name: 'ANNA', pct: 0.5, owner: true }, { id: BEN, name: 'BEN', pct: 0.5, owner: false }] },
    'a shared bill says who holds it, and is whole here')
  const first = book.orders[0]
  check([first.ref, first.customer, first.brand, first.booth, first.venue, first.fairStart, first.fairEnd, first.organiser, first.week, Number(first.margin), first.cleared],
    ['HC10519', 'Mdm Lee', 'AKEMI', 'AKEMI', 'SETIA SPICE', '2026-10-02', '2026-10-04', 'MEGAHOME', '2026-10-02', 40, true], 'what the bill says, a margin in percent')
  check(first.lines.map(l => [l.name, l.code, Number(l.qty), Number(l.amount), l.goods, Number(l.kpiQty)]), [
    ['AKEMI MATT (Q)', 'AK-Q', 1, 4800, true, 0], ['PILLOW', 'PILLOW', 2, 0, true, 2], ['DELIVERY', 'DLV', 1, 200, false, 0],
  ], 'every line, its KPI items the whole bill’s, an unnamed line by its code')
  check([Number(first.depositNeeded), book.orders.find(o => o.number === 'HC-SO-2610-003').cleared], [1500, false], 'the deposit needed, a bill still held')
  check(book.orders.find(o => o.number === 'HC-SO-2610-006').customer, '', 'a blank customer stays blank')
  check(JSON.stringify(book).includes('cost'), false, 'no cost anywhere in it')
  check((await one('SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, '2026-09', '2026-10'])).orders.length, 7, 'two months: September’s bill too')

  console.log(`validate-whole-sub-department: ${checks} checks passed`)
} finally {
  await db.close()
}
