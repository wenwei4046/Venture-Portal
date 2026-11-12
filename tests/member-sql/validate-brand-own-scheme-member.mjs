// Local PostgreSQL regression for 20261112013000 — 2990s in the Revenue app: in the sales, in no margin (2026-11-12;
// the user: "依然算作 Fair 的 revenue … 唯一不同的是看不到 margin" and "他唯一不会出现的，只是所谓的 margin arena，但他会
// 出现到 sales arena、brand arena，同时还有 KPI item 的 arena").
//
// Production's bodies (tests/member-sql/brand-own-scheme-member-production.sql, pg_get_functiondef, md5-checked: the
// facts and their wrapper, the two scoreboards, the Arena, both order books) are loaded over stand-ins for what they
// read; the migration then runs VERBATIM, twice. Checks: before it a 2990s bill is a bill waiting for a cost — blind
// on every board, *Cost pending* in the books; after it the bill keeps its sales, its part of a shared bill and its
// deposit gate, and is in no margin — not in a month's margin, not among the bills waiting for a cost, never *No
// sales* — the books flag it `ownScheme`, the Arena flags the brand; every other bill reads exactly as before; the
// brand switched off, it is an uncosted bill again; a body changed since is refused. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261112013000_brand_own_scheme_member.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const num = v => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1)
const SCHEME = id(2)
const BATCH = id(3)
const AKEMI = id(5)
const OWN = id(6)
const ETHAN = id(11)
const SHELDON = id(12)
// October 2026: a month that has passed, whenever this runs (the facts read no bill dated after today).
const OCT = '2026-10-01'
const NOV = '2026-11-01'
const BILL = { A1: id(41), N1: id(42), N2: id(43), N3: id(44), U1: id(45) }

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE TABLE titles (id uuid PRIMARY KEY, name text, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, title_id uuid, status text NOT NULL DEFAULT 'active');
  CREATE TABLE comm_sub_departments (id uuid PRIMARY KEY, name text);
  CREATE TABLE comm_schemes (id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, enable_kpi boolean NOT NULL DEFAULT false,
    enable_margin_penalty boolean NOT NULL DEFAULT false, deposit_threshold_pct numeric, revenue_cost_divisor numeric);
  -- comm_brands as 20261112003700 leaves it.
  CREATE TABLE comm_brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, code text, name text,
    is_active boolean NOT NULL DEFAULT true, own_scheme boolean NOT NULL DEFAULT false, erp_company_id bigint);
  CREATE TABLE comm_margin_bands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text,
    band_key text, label text, margin_pct numeric, commission_multiplier numeric NOT NULL DEFAULT 1,
    monthly_incentive numeric NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE comm_hierarchy (staff_id uuid, scheme_id uuid, title_id uuid, upline_staff_id uuid,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
  CREATE TABLE erp_feed_settings (sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE sales_import_batches (id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text);
  CREATE TABLE comm_organisers (id uuid PRIMARY KEY, name text);
  CREATE TABLE comm_venue_events (id uuid PRIMARY KEY, start_date date, end_date date, organiser_id uuid, erp_organiser_text text);
  CREATE TABLE sales_orders (id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL DEFAULT 'erp_sync', order_no text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), order_date date NOT NULL, period_month date NOT NULL, customer_name text,
    venue text, brand_code text, order_total numeric NOT NULL, paid_amount numeric NOT NULL DEFAULT 0,
    cancelled boolean NOT NULL DEFAULT false, staff_id uuid, agent_name text, manual_margin_pct numeric, bill_ref text,
    raw jsonb, fair_source text, fair_event_id uuid, erp_company_id bigint);
  CREATE TABLE sales_order_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, line_no integer, product_code text,
    product_name text, item_group text, brand_code text, qty numeric NOT NULL DEFAULT 1, line_amount numeric, cost_amount numeric,
    option_charge_amount numeric);
  CREATE TABLE sales_order_shares (order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE comm_order_releases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
  CREATE TABLE comm_salesperson_closes (staff_id uuid, sub_department_id uuid, period_month date, reopened_at timestamptz,
    penalised_orders jsonb, order_ids uuid[]);
  CREATE TABLE comm_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, sub_department_id uuid, period_month date,
    status text, penalised_orders jsonb);
  CREATE TABLE comm_item_groups (scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE comm_cost_ratios (scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE comm_cost_ratio_brands (scheme_id uuid, product_code text, brand_code text, ratio numeric);
  CREATE TABLE member_arena_brand_weeks (staff_id uuid, sub_department_id uuid, period_month date, weeks jsonb, counts jsonb);

  -- Stand-ins for production's helpers.
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
  RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE AS
    $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::numeric, NULL::numeric WHERE false $$;
  CREATE FUNCTION sales_order_gwp_free(uuid[]) RETURNS TABLE(line_id uuid, free_qty numeric) LANGUAGE sql STABLE AS
    $$ SELECT NULL::uuid, NULL::numeric WHERE false $$;
  -- Each holder of a bill and their part: the owner the remainder, each colleague their share (production's rule).
  CREATE FUNCTION sales_order_parts(p_orders uuid[]) RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
  LANGUAGE sql STABLE AS $$
    SELECT so.id, so.staff_id, 1 - coalesce((SELECT sum(s.share_pct) FROM sales_order_shares s WHERE s.order_id = so.id), 0), so.staff_id
      FROM sales_orders so WHERE so.id = ANY (p_orders)
    UNION ALL
    SELECT s.order_id, s.staff_id, s.share_pct, so.staff_id
      FROM sales_order_shares s JOIN sales_orders so ON so.id = s.order_id WHERE s.order_id = ANY (p_orders)
  $$;
  CREATE FUNCTION sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false) $$;
  CREATE FUNCTION member_erp_brand_weeks(uuid, uuid) RETURNS TABLE(week date, brand text) LANGUAGE sql STABLE AS
    $$ SELECT NULL::date, NULL::text WHERE false $$;
  CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT upper(btrim($1)) $$;
  CREATE FUNCTION member_principal_department_scheme(uuid) RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT c.id FROM comm_schemes c WHERE c.sub_department_id = $1 LIMIT 1 $$;
  CREATE FUNCTION member_insight_window(text, text) RETURNS daterange LANGUAGE sql IMMUTABLE AS
    $$ SELECT daterange(($1 || '-01')::date, (($2 || '-01')::date + interval '1 month')::date) $$;

  INSERT INTO comm_sub_departments VALUES ('${FAIR}', 'Fair');
  INSERT INTO comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES ('${SCHEME}', '${FAIR}', 0.3, 0.7);
  INSERT INTO comm_brands (id, scheme_id, code, name, own_scheme, erp_company_id) VALUES
    ('${AKEMI}', '${SCHEME}', 'AKEMI', 'Akemi', false, NULL), ('${OWN}', '${SCHEME}', '2990S', '2990s', true, 2);
  INSERT INTO comm_margin_bands (scheme_id, brand_id, kind, band_key, label, margin_pct, monthly_incentive) VALUES
    ('${SCHEME}', '${AKEMI}', 'incentive', 'tier1', 'Incentive Tier 1', 0.36, 300);
  INSERT INTO erp_feed_settings VALUES ('${FAIR}', '2026-08-01');
  INSERT INTO comm_item_groups VALUES ('${SCHEME}', 'mattress', true), ('${SCHEME}', 'sofa', true), ('${SCHEME}', 'service', false);
  INSERT INTO hr_staff_costs (id, employee_name) VALUES ('${ETHAN}', 'ETHAN'), ('${SHELDON}', 'SHELDON TAN');
  INSERT INTO comm_hierarchy (staff_id, scheme_id) VALUES ('${ETHAN}', '${SCHEME}'), ('${SHELDON}', '${SCHEME}');
  INSERT INTO sales_import_batches VALUES ('${BATCH}', '${FAIR}', '${OCT}', 'committed');

  -- October: ETHAN's Akemi bill (RM 5,000, cost 2,100 ÷ 0.7 = 3,000 → 40%); his 2990s bill; a 2990s bill he shares half
  -- with SHELDON; SHELDON's 2990s bill still under its deposit; SHELDON's Akemi bill nobody has costed.
  INSERT INTO sales_orders (id, batch_id, order_no, order_date, period_month, customer_name, brand_code, order_total, paid_amount, staff_id, agent_name, erp_company_id) VALUES
    ('${BILL.A1}', '${BATCH}', 'HC-SO-2610-001', '2026-10-05', '${OCT}', 'MS A', 'AKEMI', 5000, 5000, '${ETHAN}', 'Ethan', 1),
    ('${BILL.N1}', '${BATCH}', '2990-SO-2610-017', '2026-10-06', '${OCT}', 'MR N1', '2990S', 4240, 4240, '${ETHAN}', 'Ethan', 2),
    ('${BILL.N2}', '${BATCH}', '2990-SO-2610-020', '2026-10-07', '${OCT}', 'MR N2', '2990S', 3490, 3490, '${ETHAN}', 'Ethan', 2),
    ('${BILL.N3}', '${BATCH}', '2990-SO-2610-021', '2026-10-08', '${OCT}', 'MR N3', '2990S', 3240, 500, '${SHELDON}', 'Sheldon Tan', 2),
    ('${BILL.U1}', '${BATCH}', 'HC-SO-2610-002', '2026-10-09', '${OCT}', 'MS U', 'AKEMI', 2000, 2000, '${SHELDON}', 'Sheldon Tan', 1);
  INSERT INTO sales_order_lines (order_id, line_no, product_code, product_name, item_group, brand_code, qty, line_amount, cost_amount) VALUES
    ('${BILL.A1}', 1, 'AK-APEX (Q)', 'APEX', 'mattress', 'AKEMI', 1, 5000, 2100),
    ('${BILL.N1}', 1, '2990-SF-01', '2990 SOFA', 'sofa', '2990S', 1, 3990, NULL),
    ('${BILL.N1}', 2, 'DELIVERY', 'Delivery', 'service', NULL, 1, 250, NULL),
    ('${BILL.N2}', 1, '2990-SF-02', '2990 SOFA 2', 'sofa', '2990S', 1, 3490, NULL),
    ('${BILL.N3}', 1, '2990-SF-03', '2990 SOFA 3', 'sofa', '2990S', 1, 3240, NULL),
    ('${BILL.U1}', 1, 'AK-NEW (Q)', 'NEW MODEL', 'mattress', 'AKEMI', 1, 2000, NULL);
  INSERT INTO sales_order_shares VALUES ('${BILL.N2}', '${SHELDON}', 0.5);
`)

// ── Production's bodies, as the migration was written from ───────────────────
await db.exec((await readFile(new URL('./brand-own-scheme-member-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
const SIG = {
  facts: 'public.member_order_facts_with_old_bills(uuid, date, date)',
  wrapper: 'public.member_order_facts(uuid, date, date)',
  board: 'public.member_scoreboard(uuid, date)',
  range: 'public.member_scoreboard_range(uuid, date, date)',
  arena: 'public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)',
  book: 'public.member_order_book_for_staff(uuid, uuid, date, date)',
  dept: 'public.member_principal_department_order_book(uuid, text, text)',
}
const PRODUCTION = {
  facts: '6904a0dd72dcc3abe5b4463071bbe077', wrapper: '987d328c0ec4087e4ce6f3e58346a382', board: '86c5cf201f42a5ac0ec3a13910c2b17d',
  range: '8a3ad7360a1a875436d84201aedbe114', arena: '051de9ea5b73791a8ee5b0edd556fe94', book: 'fd6297bdaa9b3ab0839613fc1e2ec221',
  dept: 'c56232677b0541b8aec7a564d4a33cc1',
}
check(Object.fromEntries(await Promise.all(Object.entries(SIG).map(async ([k, sig]) => [k, await md5Of(sig)]))), PRODUCTION,
  'the fixture is production’s bodies')

// ── The readers ──────────────────────────────────────────────────────────────
const facts = async () => (await q(
  `SELECT order_no, staff_id::text AS staff, brand, cleared, revenue, goods_revenue, margin_pct, no_sales_cost, full_revenue, weight
     FROM member_order_facts_with_old_bills($1, $2, $3) ORDER BY order_no, staff_id`, [SCHEME, OCT, NOV]))
  .map(r => ({ no: r.order_no, staff: r.staff === ETHAN ? 'ETHAN' : 'SHELDON', brand: r.brand, cleared: r.cleared, revenue: num(r.revenue),
    goods: num(r.goods_revenue), margin: r.margin_pct === null ? null : Math.round(Number(r.margin_pct) * 10000) / 10000,
    noSalesCost: num(r.no_sales_cost), full: num(r.full_revenue), weight: num(r.weight) }))
const board = async () => Object.fromEntries((await q(
  `SELECT staff_id::text AS staff, order_count, sales, held, margin_revenue, margin_cost, blind_orders FROM member_scoreboard($1, $2)`, [SCHEME, OCT]))
  .map(r => [r.staff === ETHAN ? 'ETHAN' : 'SHELDON', { orders: r.order_count, sales: num(r.sales), held: num(r.held),
    marginRevenue: num(r.margin_revenue), marginCost: num(r.margin_cost), blind: r.blind_orders }]))
const range = async () => Object.fromEntries((await q(
  `SELECT staff_id::text AS staff, sales, margin_revenue, margin_cost, blind_orders FROM member_scoreboard_range($1, $2, $3)`, [SCHEME, OCT, NOV]))
  .map(r => [r.staff === ETHAN ? 'ETHAN' : 'SHELDON', { sales: num(r.sales), marginRevenue: num(r.margin_revenue),
    marginCost: num(r.margin_cost), blind: r.blind_orders }]))
const arena = async () => one('SELECT member_arena_for_staff($1, $2, $3, $4, $5, true)', [ETHAN, FAIR, SCHEME, '2026-10', 'monthly'])
const scoreOf = s => ({ sales: num(s.sales), held: num(s.held), orders: s.orders, marginRevenue: num(s.marginRevenue),
  marginCost: num(s.marginCost), blind: s.blindOrders })
const arenaPeople = async () => Object.fromEntries((await arena()).people.map(p => [p.name, {
  ...scoreOf(p), brands: Object.fromEntries(Object.entries(p.brands).map(([code, s]) => [code, scoreOf(s)])) }]))
const book = async () => one('SELECT member_order_book_for_staff($1, $2, $3, $4)', [ETHAN, SCHEME, OCT, NOV])
const dept = async () => one('SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, '2026-10', '2026-10'])
const billsOf = b => Object.fromEntries(b.orders.map(o => [o.number, { brand: o.brand, revenue: num(o.revenue), margin: o.margin,
  noSales: o.noSales, cleared: o.cleared, full: num(o.fullRevenue), ...(o.ownScheme === undefined ? {} : { ownScheme: o.ownScheme }),
  ...(o.share ? { part: Number(o.share.part) } : {}) }]))

// ── Before: a 2990s bill is a bill waiting for a cost ────────────────────────
const factsBefore = await facts()
check(factsBefore.filter(f => f.brand === '2990S').map(f => [f.no, f.staff, f.revenue, f.margin, f.noSalesCost]), [
  ['2990-SO-2610-017', 'ETHAN', 3990, null, null], ['2990-SO-2610-020', 'ETHAN', 1745, null, null],
  ['2990-SO-2610-020', 'SHELDON', 1745, null, null], ['2990-SO-2610-021', 'SHELDON', 3240, null, null],
], 'before: its sales are counted — its part of a shared bill too — and it waits for a cost nobody will give it')
const boardBefore = await board()
check(boardBefore, {
  ETHAN: { orders: 3, sales: 10735, held: 0, marginRevenue: 5000, marginCost: 3000, blind: 2 },
  SHELDON: { orders: 2, sales: 3745, held: 3240, marginRevenue: 0, marginCost: 0, blind: 2 },
}, 'before: two bills of each read as waiting for a cost')
const bookBefore = await book()
check([billsOf(bookBefore)['2990-SO-2610-017'], bookBefore.margins.overall, bookBefore.margins.brands],
  [{ brand: '2990S', revenue: 3990, margin: null, noSales: false, cleared: true, full: 3990 }, 40, { AKEMI: 40 }],
  'before: the book reads it as a bill with no margin yet — Cost pending in the app')
check((await arena()).brands, [{ code: '2990S', name: '2990s' }, { code: 'AKEMI', name: 'Akemi' }], 'before: the Arena names every brand alike')
const akemiBefore = factsBefore.filter(f => f.brand !== '2990S')

// ── The migration, verbatim, twice ───────────────────────────────────────────
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const MADE = [SIG.facts, SIG.book, SIG.dept, SIG.arena]
const made = await Promise.all(MADE.map(md5Of))
check(made.map(md5 => migration.includes(`'${md5}'`)), [true, true, true, true], 'the md5s the migration checks are the bodies it makes')
check(await Promise.all([SIG.wrapper, SIG.board, SIG.range].map(md5Of)), [PRODUCTION.wrapper, PRODUCTION.board, PRODUCTION.range],
  'the wrapper and the scoreboards are not touched: they read the facts')

// The facts.
const factsAfter = await facts()
check(factsAfter.filter(f => f.brand === '2990S'), [
  { no: '2990-SO-2610-017', staff: 'ETHAN', brand: '2990S', cleared: true, revenue: 3990, goods: 3990, margin: null, noSalesCost: 0, full: 3990, weight: 1 },
  { no: '2990-SO-2610-020', staff: 'ETHAN', brand: '2990S', cleared: true, revenue: 1745, goods: 1745, margin: null, noSalesCost: 0, full: 3490, weight: 1 },
  { no: '2990-SO-2610-020', staff: 'SHELDON', brand: '2990S', cleared: true, revenue: 1745, goods: 1745, margin: null, noSalesCost: 0, full: 3490, weight: 1 },
  { no: '2990-SO-2610-021', staff: 'SHELDON', brand: '2990S', cleared: false, revenue: 3240, goods: 3240, margin: null, noSalesCost: 0, full: 3240, weight: 1 },
], 'a 2990s bill: its sales, its part, its deposit as before — no margin, and no cost waited for (a no-sales cost of 0)')
check(factsAfter.filter(f => f.brand !== '2990S'), akemiBefore, 'every other bill reads exactly as before — the uncosted Akemi bill still waits')

// The boards.
check(await board(), {
  ETHAN: { orders: 3, sales: 10735, held: 0, marginRevenue: 5000, marginCost: 3000, blind: 0 },
  SHELDON: { orders: 2, sales: 3745, held: 3240, marginRevenue: 0, marginCost: 0, blind: 1 },
}, 'the month’s board: the same sales and margin; only the bill really waiting for a cost is counted as waiting')
check(await range(), {
  ETHAN: { sales: 10735, marginRevenue: 5000, marginCost: 3000, blind: 0 },
  SHELDON: { sales: 3745, marginRevenue: 0, marginCost: 0, blind: 1 },
}, 'a range of months alike')
const people = await arenaPeople()
check(people.ETHAN, {
  sales: 10735, held: 0, orders: 3, marginRevenue: 5000, marginCost: 3000, blind: 0,
  brands: {
    '2990S': { sales: 5735, held: 0, orders: 2, marginRevenue: 0, marginCost: 0, blind: 0 },
    AKEMI: { sales: 5000, held: 0, orders: 1, marginRevenue: 5000, marginCost: 3000, blind: 0 },
  },
}, 'the Arena: 2990s is ranked on sales (and by brand), with nothing to rank on a margin board and nothing waiting')
check(people['SHELDON TAN'].brands, {
  '2990S': { sales: 1745, held: 3240, orders: 1, marginRevenue: 0, marginCost: 0, blind: 0 },
  AKEMI: { sales: 2000, held: 0, orders: 1, marginRevenue: 0, marginCost: 0, blind: 1 },
}, 'a bill under its deposit is held as any bill; Akemi’s uncosted bill still holds Akemi')
check((await arena()).brands, [{ code: '2990S', name: '2990s', ownScheme: true }, { code: 'AKEMI', name: 'Akemi', ownScheme: false }],
  'the Arena says which brand follows its own scheme')

// The books.
const bookAfter = await book()
check(billsOf(bookAfter), {
  'HC-SO-2610-001': { brand: 'AKEMI', revenue: 5000, margin: 40, noSales: false, cleared: true, full: 5000 },
  '2990-SO-2610-017': { brand: '2990S', revenue: 3990, margin: null, noSales: false, cleared: true, full: 3990, ownScheme: true },
  '2990-SO-2610-020': { brand: '2990S', revenue: 1745, margin: null, noSales: false, cleared: true, full: 3490, ownScheme: true, part: 0.5 },
}, 'the member’s book flags the bill — never *No sales* — and every other bill carries no flag')
check([bookAfter.margins.overall, bookAfter.margins.brands, bookAfter.margins.months], [40, { AKEMI: 40 }, { '2026-10': { overall: 40, brands: { AKEMI: 40 } } }],
  'his margins are Akemi’s alone: 2990s is no brand of any margin')
const deptAfter = await dept()
check([billsOf(deptAfter)['2990-SO-2610-020'], billsOf(deptAfter)['2990-SO-2610-021'], billsOf(deptAfter)['HC-SO-2610-002']], [
  { brand: '2990S', revenue: 3490, margin: null, noSales: false, cleared: true, full: 3490, ownScheme: true, part: 1 },
  { brand: '2990S', revenue: 3240, margin: null, noSales: false, cleared: false, full: 3240, ownScheme: true },
  { brand: 'AKEMI', revenue: 2000, margin: null, noSales: false, cleared: true, full: 2000 },
], 'the whole sub-department’s book: a shared bill once, at its whole, flagged; an uncosted Akemi bill unflagged')
check([deptAfter.margins.overall, deptAfter.margins.brands], [40, { AKEMI: 40 }], 'and its margins leave 2990s out')

// A margin keyed on the bill by hand, a cost typed on its line: still no margin.
await q(`UPDATE sales_orders SET manual_margin_pct = 0.5 WHERE id = $1`, [BILL.N1])
await q(`UPDATE sales_order_lines SET cost_amount = 1000 WHERE order_id = $1 AND line_no = 1`, [BILL.N1])
check((await facts()).filter(f => f.no === '2990-SO-2610-017').map(f => [f.margin, f.noSalesCost]), [[null, 0]],
  'whatever its lines cost, or a margin keyed on the bill, it is judged on none')
await q(`UPDATE sales_orders SET manual_margin_pct = NULL WHERE id = $1`, [BILL.N1])
await q(`UPDATE sales_order_lines SET cost_amount = NULL WHERE order_id = $1 AND line_no = 1`, [BILL.N1])

// Run again: nothing changes.
await db.exec(migration)
check(await Promise.all(MADE.map(md5Of)), made, 'run again, the functions are the same')
check(await facts(), factsAfter, 'and the facts')

// ── The brand switched off: an uncosted bill again ───────────────────────────
await q(`UPDATE comm_brands SET is_active = false WHERE code = '2990S'`)
check([(await board()).ETHAN.blind, billsOf(await book())['2990-SO-2610-017'].ownScheme, (await arena()).brands.map(b => b.code)], [2, undefined, ['AKEMI']],
  'with the brand off, its bills wait for a cost again and nothing is flagged — the way back')
await q(`UPDATE comm_brands SET is_active = true WHERE code = '2990S'`)
// Another scheme's brand of the same code is not this scheme's.
await q(`UPDATE comm_brands SET scheme_id = $1 WHERE code = '2990S'`, [id(99)])
check((await board()).ETHAN.blind, 2, 'a brand on its own scheme in ANOTHER scheme says nothing of this scheme’s bills')
await q(`UPDATE comm_brands SET scheme_id = $1 WHERE code = '2990S'`, [SCHEME])
check((await board()).ETHAN.blind, 0, 'back on this scheme, they are judged again')

// ── The migration refuses a body it was not written from, and a database without the brand's own scheme ──
await db.exec(`CREATE OR REPLACE FUNCTION member_arena_for_staff(p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean)
  RETURNS jsonb LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN NULL; END $$`)
await assert.rejects(db.exec(migration), /member_arena_for_staff\(uuid, uuid, uuid, text, text, boolean\) is md5 .*, not the body this migration was written from/)
checks++
await db.exec('ROLLBACK')
await db.exec('ALTER TABLE comm_brands RENAME COLUMN own_scheme TO own_scheme_gone')
await assert.rejects(db.exec(migration), /comm_brands\.own_scheme is not here: apply 20261112003700_brand_own_scheme first/)
checks++

console.log(`validate-brand-own-scheme-member: ${checks} checks passed`)
