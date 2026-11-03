// Local PostgreSQL regression for 20261030083500 (2026-10-30 — the user, shown nine October bills reading "No cost ·
// Cost pending" in the Revenue app though their cost was known, each a gift on a bill of its own at RM 0: "show, no
// sales. but consider margin negative as well. make sure in the calculation of monthly").
// Production's six bodies (tests/member-sql/no-sales-margin-production.sql, read with pg_get_functiondef, md5-checked)
// are loaded over stand-ins for what they read; the migration then runs VERBATIM, twice. What is under test is the
// six functions' own work: a bill with no sales carries what its goods cost, and every month's margin takes it in —
// person by person, brand by brand, bill by bill — while nothing else any of them answered moves. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261030083500_no_sales_bills_count_in_the_month_margin.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const r2 = v => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)

const FAIR = id(1), FS = id(2), BATCH = id(3), TITLE = id(4)
const LUCAS = id(11), BEN = id(12), ANTHONY = id(13)
const B = { SOLD: id(21), GIFT: id(22), GIFT_NO_COST: id(23), DUNLOP_GIFT: id(24), SHARED_GIFT: id(25), TRANSPORT: id(26), NO_COST: id(27), BEN_SOLD: id(28),
  SEPTEMBER: id(29), OVER_CHARGED: id(30), FREE_SAMPLE: id(31) }
const SEP = '2026-09-01', OCT = '2026-10-01', NOV = '2026-11-01'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

  -- ── Stand-ins for what production's bodies read ──
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, title_id uuid, status text NOT NULL DEFAULT 'active');
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, enable_kpi boolean NOT NULL DEFAULT false,
    deposit_threshold_pct numeric, revenue_cost_divisor numeric);
  CREATE TABLE public.comm_hierarchy(scheme_id uuid, staff_id uuid, title_id uuid, effective_from date, effective_to date);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, order_no text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    period_month date NOT NULL, cancelled boolean NOT NULL DEFAULT false, order_date date NOT NULL, order_total numeric NOT NULL,
    paid_amount numeric NOT NULL DEFAULT 0, staff_id uuid, brand_code text, manual_margin_pct numeric, bill_ref text, customer_name text,
    fair_source text, raw jsonb NOT NULL DEFAULT '{}', venue text, fair_event_id uuid);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, line_no integer, product_code text,
    product_name text, item_group text, qty numeric, line_amount numeric, cost_amount numeric, option_charge_amount numeric);
  CREATE TABLE public.sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, period_month date, status text);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
  CREATE TABLE public.comm_salesperson_closes(staff_id uuid, sub_department_id uuid, period_month date, reopened_at timestamptz);
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE public.comm_venue_events(id uuid PRIMARY KEY, start_date date, end_date date, organiser_id uuid, erp_organiser_text text);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, code text, name text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.comm_margin_bands(scheme_id uuid, brand_id uuid, kind text, band_key text, label text, margin_pct numeric, monthly_incentive numeric);
  CREATE TABLE public.member_arena_brand_weeks(staff_id uuid, sub_department_id uuid, period_month date, weeks jsonb, counts jsonb);

  CREATE FUNCTION public.comm_first_paid_month(uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
  RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE AS
    $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::numeric, NULL::numeric WHERE false $$;
  -- Each holder of a bill and their part: the owner the remainder, each colleague their share (production's rule).
  CREATE FUNCTION public.sales_order_parts(p_orders uuid[]) RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
  LANGUAGE sql STABLE AS $$
    SELECT so.id, so.staff_id, 1 - coalesce((SELECT sum(s.share_pct) FROM public.sales_order_shares s WHERE s.order_id = so.id), 0), so.staff_id
      FROM public.sales_orders so WHERE so.id = ANY (p_orders)
    UNION ALL
    SELECT s.order_id, s.staff_id, s.share_pct, so.staff_id
      FROM public.sales_order_shares s JOIN public.sales_orders so ON so.id = s.order_id WHERE s.order_id = ANY (p_orders)
  $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub uuid, p_staff uuid) RETURNS TABLE(week date, brand text) LANGUAGE sql STABLE AS
    $$ SELECT NULL::date, NULL::text WHERE false $$;
  CREATE FUNCTION public.erp_sync_brand_code(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim($1)) $$;
  CREATE FUNCTION public.member_principal_department_scheme(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${FS}'::uuid $$;
  CREATE FUNCTION public.member_insight_window(p_from text, p_until text) RETURNS daterange LANGUAGE sql STABLE AS
    $$ SELECT daterange((p_from || '-01')::date, ((p_until || '-01')::date + interval '1 month')::date) $$;
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-10-30) ──
const PROD = {
  member_order_facts: '100ac1c83635cbf163069dff6e52e26b',
  member_scoreboard: '80bc6819f6f93eae002d4cf1b06f3808',
  member_scoreboard_range: 'f8d61d1177ab8982ecd2fe7770dec580',
  member_order_book_for_staff: 'ef349e49b1c5a003f8831b0e9aa7cde5',
  member_arena_for_staff: '4211a03044b601342c1be49ece19e8bd',
  member_principal_department_order_book: '70f0a8f669bff28250ecb6fa2577772d',
}
const BODIES = `SELECT proname, md5(prosrc) AS md5 FROM pg_proc WHERE proname = ANY ($1) ORDER BY proname`
const production = (await readFile(new URL('./no-sales-margin-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of production.split(/\n(?=-- member_[a-z_]+\()/).slice(1)) await db.exec(block)
for (const r of await q(BODIES, [Object.keys(PROD)])) check(r.md5, PROD[r.proname], `${r.proname}: production's body`)
// As production grants it: the service role's alone.
await db.exec(`REVOKE ALL ON FUNCTION public.member_order_facts(uuid, date, date) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.member_order_facts(uuid, date, date) TO service_role;`)

// ── Fair's October: a sale, gifts on bills of their own, a shared gift, transport alone, a sale with no cost ──
await db.exec(`
  INSERT INTO public.titles (id, name) VALUES ('${TITLE}', 'Revenue Specialist');
  INSERT INTO public.hr_staff_costs (id, employee_name, title_id) VALUES
    ('${LUCAS}', 'LUCAS', '${TITLE}'), ('${BEN}', 'BEN', '${TITLE}'), ('${ANTHONY}', 'ANTHONY', '${TITLE}');
  INSERT INTO public.comm_sub_departments (id, name) VALUES ('${FAIR}', 'Fair');
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES ('${FS}', '${FAIR}', 0.3, 0.7);
  INSERT INTO public.comm_hierarchy (scheme_id, staff_id, title_id, effective_from) VALUES
    ('${FS}', '${LUCAS}', '${TITLE}', '2026-01-01'), ('${FS}', '${BEN}', '${TITLE}', '2026-01-01'), ('${FS}', '${ANTHONY}', '${TITLE}', '2026-01-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FS}', 'mattress', true), ('${FS}', 'accessory', true), ('${FS}', 'bedframe', true), ('${FS}', 'service', false);
  INSERT INTO public.comm_brands (scheme_id, code, name) VALUES ('${FS}', 'AKEMI', 'Akemi'), ('${FS}', 'DUNLOP', 'Dunlopillo');
  INSERT INTO public.sales_import_batches (id, sub_department_id, status) VALUES ('${BATCH}', '${FAIR}', 'committed');
  INSERT INTO public.sales_orders (id, batch_id, order_no, period_month, order_date, order_total, paid_amount, staff_id, brand_code) VALUES
    ('${B.SOLD}', '${BATCH}', 'HC-SO-2610-001', '${OCT}', '2026-10-03', 4000, 4000, '${LUCAS}', 'AKEMI'),
    ('${B.GIFT}', '${BATCH}', 'HC-SO-2610-034', '${OCT}', '2026-10-05', 200, 200, '${LUCAS}', 'AKEMI'),
    ('${B.GIFT_NO_COST}', '${BATCH}', 'HC-SO-2610-040', '${OCT}', '2026-10-06', 0, 0, '${LUCAS}', 'AKEMI'),
    ('${B.DUNLOP_GIFT}', '${BATCH}', 'HC-SO-2610-095', '${OCT}', '2026-10-07', 0, 0, '${ANTHONY}', 'DUNLOP'),
    ('${B.SHARED_GIFT}', '${BATCH}', 'HC-SO-2610-096', '${OCT}', '2026-10-07', 0, 0, '${LUCAS}', 'AKEMI'),
    ('${B.TRANSPORT}', '${BATCH}', 'HC-SO-2610-097', '${OCT}', '2026-10-08', 150, 150, '${LUCAS}', 'AKEMI'),
    ('${B.NO_COST}', '${BATCH}', 'HC-SO-2610-098', '${OCT}', '2026-10-09', 3000, 3000, '${LUCAS}', 'AKEMI'),
    ('${B.BEN_SOLD}', '${BATCH}', 'HC-SO-2610-099', '${OCT}', '2026-10-09', 2000, 2000, '${BEN}', 'AKEMI'),
    ('${B.SEPTEMBER}', '${BATCH}', 'HC-SO-2609-300', '${SEP}', '2026-09-20', 1000, 1000, '${LUCAS}', 'AKEMI'),
    ('${B.OVER_CHARGED}', '${BATCH}', 'HC-SO-2610-100', '${OCT}', '2026-10-10', 300, 300, '${BEN}', 'AKEMI'),
    ('${B.FREE_SAMPLE}', '${BATCH}', 'HC-SO-2610-101', '${OCT}', '2026-10-10', 0, 0, '${ANTHONY}', 'AKEMI');
  INSERT INTO public.sales_order_shares (order_id, staff_id, share_pct) VALUES ('${B.SHARED_GIFT}', '${BEN}', 0.5);
  -- A frame line of 300 whose leg and divan were charged 500: its margin base is −200 — no sales, never less.
  INSERT INTO public.sales_order_lines (order_id, line_no, product_code, product_name, item_group, qty, line_amount, cost_amount, option_charge_amount) VALUES
    ('${B.OVER_CHARGED}', 1, 'TRION (K)', 'TRION BED FRAME', 'bedframe', 1, 300, 140, 500),
    ('${B.FREE_SAMPLE}', 1, 'AK-SAMPLE', 'AKEMI FABRIC SAMPLE', 'accessory', 1, 0, 0, NULL);
  -- Costs are the Product List's (÷ 0.7 is the team's): the mattress 1,400 → 2,000; a pillow 150 → 214.29.
  INSERT INTO public.sales_order_lines (order_id, line_no, product_code, product_name, item_group, qty, line_amount, cost_amount) VALUES
    ('${B.SOLD}', 1, 'AK-MATT-K', 'AKEMI MATTRESS', 'mattress', 1, 4000, 1400),
    ('${B.GIFT}', 1, 'AK-PILLOW', 'AKEMI PILLOW', 'accessory', 1, 0, 150),
    ('${B.GIFT}', 2, 'TRANSPORTATION CHARGES', 'TRANSPORTATION CHARGES', 'service', 1, 200, NULL),
    ('${B.GIFT_NO_COST}', 1, 'BEDFRAME KIV', 'BEDFRAME KIV', 'bedframe', 1, 0, NULL),
    ('${B.DUNLOP_GIFT}', 1, 'DL-PILLOW', 'DUNLOPILLO PILLOW', 'accessory', 1, 0, 70),
    ('${B.SHARED_GIFT}', 1, 'AK-PROTECTOR', 'AKEMI PROTECTOR', 'accessory', 2, 0, 140),
    ('${B.TRANSPORT}', 1, 'TRANSPORTATION CHARGES', 'TRANSPORTATION CHARGES', 'service', 1, 150, NULL),
    ('${B.NO_COST}', 1, 'AK-MATT-Q', 'AKEMI MATTRESS', 'mattress', 1, 3000, NULL),
    ('${B.BEN_SOLD}', 1, 'AK-MATT-S', 'AKEMI MATTRESS', 'mattress', 1, 2000, 700),
    ('${B.SEPTEMBER}', 1, 'AK-MATT-S', 'AKEMI MATTRESS', 'mattress', 1, 1000, 350);
`)

const FACT_COLUMNS = 'order_id, staff_id, order_no, order_date, source_period, recognition_month, brand, cleared, revenue, goods_revenue, margin_pct, kpi_qty, manual'
const facts = () => q(`SELECT ${FACT_COLUMNS} FROM public.member_order_facts($1, $2, $3) ORDER BY order_no, staff_id`, [FS, OCT, NOV])
const board = async (sql, params) => Object.fromEntries((await q(sql, params)).map(r => [r.staff_id,
  [r2(r.margin_revenue), r2(r.margin_cost), Number(r.blind_orders)]]))
const scoreboard = () => board(`SELECT * FROM public.member_scoreboard($1, $2)`, [FS, OCT])
const scoreboardRange = () => board(`SELECT * FROM public.member_scoreboard_range($1, $2, $3)`, [FS, OCT, NOV])
const arena = async () => {
  const a = await one(`SELECT public.member_arena_for_staff($1, $2, $3, '2026-10', 'monthly', true)`, [LUCAS, FAIR, FS])
  return Object.fromEntries(a.people.map(p => [p.name, {
    all: [r2(p.marginRevenue), r2(p.marginCost), p.blindOrders],
    ...Object.fromEntries(Object.entries(p.brands).map(([brand, s]) => [brand, [r2(s.marginRevenue), r2(s.marginCost), s.blindOrders]])),
  }]))
}
const book = (staff, from = OCT) => one(`SELECT public.member_order_book_for_staff($1, $2, $3, $4)`, [staff, FS, from, NOV])
const wholeBook = () => one(`SELECT public.member_principal_department_order_book($1, '2026-10', '2026-10')`, [FAIR])
const flags = b => Object.fromEntries(b.orders.map(o => [o.number, o.noSales]))
const stripped = b => ({ ...b, asOf: null, orders: b.orders.map(({ noSales, ...o }) => o) })

// ── Before: a bill with no sales is in nobody's margin ──
const factsBefore = await facts()
check(factsBefore.map(r => r.order_no), ['HC-SO-2610-001', 'HC-SO-2610-034', 'HC-SO-2610-040', 'HC-SO-2610-095', 'HC-SO-2610-096',
  'HC-SO-2610-096', 'HC-SO-2610-098', 'HC-SO-2610-099', 'HC-SO-2610-100', 'HC-SO-2610-101'],
  'the facts: every bill with goods, a shared one per holder; transport alone is none of it')
check(r2(factsBefore.find(r => r.order_no === 'HC-SO-2610-100').goods_revenue), -200, 'the over-charged frame’s margin base is below nothing')
check(await scoreboard(), { [LUCAS]: [4000, 2000, 1], [BEN]: [2000, 1000, 0], [ANTHONY]: [0, 0, 0] },
  'before: LUCAS’s gifts count nowhere — only the uncosted sale is pending')
const scoreBefore = await scoreboard()
const arenaBefore = await arena()
const booksBefore = { lucas: await book(LUCAS), ben: await book(BEN), anthony: await book(ANTHONY), whole: await wholeBook() }
check('margins' in booksBefore.lucas || 'noSales' in booksBefore.lucas.orders[0], false, 'before: the book says nothing of a bill with no sales')

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const md5After = await q(BODIES, [Object.keys(PROD)])
await db.exec(migration)
check(await q(BODIES, [Object.keys(PROD)]), md5After, 'the second run changes nothing')
const AFTER = {
  member_order_facts: '137eb24ba94e9c5bb49789225ff4c271',
  member_scoreboard: '86c5cf201f42a5ac0ec3a13910c2b17d',
  member_scoreboard_range: '8a3ad7360a1a875436d84201aedbe114',
  member_order_book_for_staff: 'ece458d6f851856de44959f14fe88840',
  member_arena_for_staff: '051de9ea5b73791a8ee5b0edd556fe94',
  member_principal_department_order_book: '5d14f2b5eb1d10cc763429ab6431a44f',
}
for (const r of md5After) check(r.md5, AFTER[r.proname], `${r.proname}: the body production runs after it`)

// ── member_order_facts: one more column, nothing else moved ──
check(await facts(), factsBefore, 'every column the facts had answers as before')
check((await q(`SELECT order_no, staff_id, round(no_sales_cost, 2)::text AS cost FROM public.member_order_facts($1, $2, $3) ORDER BY order_no, staff_id`,
  [FS, OCT, NOV])).map(r => [r.order_no, r.staff_id, r.cost]), [
  ['HC-SO-2610-001', LUCAS, null],
  ['HC-SO-2610-034', LUCAS, '214.29'],
  ['HC-SO-2610-040', LUCAS, null],
  ['HC-SO-2610-095', ANTHONY, '100.00'],
  ['HC-SO-2610-096', LUCAS, '100.00'],
  ['HC-SO-2610-096', BEN, '100.00'],
  ['HC-SO-2610-098', LUCAS, null],
  ['HC-SO-2610-099', BEN, null],
  ['HC-SO-2610-100', BEN, '200.00'],
  ['HC-SO-2610-101', ANTHONY, '0.00'],
], 'no_sales_cost: a sale none; a gift what its goods cost on the team basis (150 ÷ 0.7), the transport beside it no part of it; a gift still uncosted none; a shared gift split by part; the over-charged frame its cost (140 ÷ 0.7); a sample that cost nothing, nothing')
check(await one(`SELECT has_function_privilege('authenticated', 'public.member_order_facts(uuid, date, date)', 'EXECUTE')`), false, 'a sign-in still cannot call the facts')
check(await one(`SELECT has_function_privilege('anon', 'public.member_order_facts(uuid, date, date)', 'EXECUTE')`), false, 'nor the publishable key')
check(await one(`SELECT has_function_privilege('service_role', 'public.member_order_facts(uuid, date, date)', 'EXECUTE')`), true, 'the service role still can')
check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = 'public.member_order_facts(uuid, date, date)'::regprocedure`), true, 'still SECURITY DEFINER')
check((await one(`SELECT obj_description('public.member_order_facts(uuid, date, date)'::regprocedure, 'pg_proc')`)).includes('no_sales_cost'), true, 'its comment says so')

// ── The month's margin: a gift's cost counts; an uncosted gift holds it back as an uncosted sale does ──
const scoreAfter = { [LUCAS]: [4000, 2314.29, 2], [BEN]: [2000, 1300, 0], [ANTHONY]: [0, 100, 0] }
check(await scoreboard(), scoreAfter, 'the scoreboard: LUCAS 2,000 + 214.29 + his half of the shared gift (100); BEN the other half and the over-charged frame’s 200 — its revenue none, never −200; ANTHONY’s gift a cost with no sales, the free sample nothing; LUCAS’s uncosted gift pending')
check(await scoreboardRange(), scoreAfter, 'the range reads the same')
check(Object.keys(scoreBefore).sort(), Object.keys(scoreAfter).sort(), 'the same people')

const arenaAfter = await arena()
check(arenaAfter.LUCAS, { all: [4000, 2314.29, 2], AKEMI: [4000, 2314.29, 2] }, 'the Arena: LUCAS, and his Akemi')
check(arenaAfter.BEN, { all: [2000, 1300, 0], AKEMI: [2000, 1300, 0] }, 'the Arena: BEN, his half of the shared gift and the over-charged frame in')
check(arenaAfter.ANTHONY, { all: [0, 100, 0], DUNLOP: [0, 100, 0], AKEMI: [0, 0, 0] },
  'the Arena: a brand with a gift and no sale has a cost and no margin revenue; a sample that cost nothing is no part of it')
check(arenaBefore.LUCAS, { all: [4000, 2000, 1], AKEMI: [4000, 2000, 1] }, 'the Arena before, for the record')

// ── The bills: which have no sales, and the margin they make together ──
const lucas = await book(LUCAS)
check(flags(lucas), { 'HC-SO-2610-001': false, 'HC-SO-2610-034': true, 'HC-SO-2610-040': false, 'HC-SO-2610-096': true, 'HC-SO-2610-098': false },
  'noSales: the costed gifts; an uncosted gift and an uncosted sale are pending, not "no sales"')
check(lucas.margins, { overall: 42.1429, brands: { AKEMI: 42.1429 }, months: { '2026-10': { overall: 42.1429, brands: { AKEMI: 42.1429 } } } },
  'LUCAS’s margin: (4,000 − 2,314.29) ÷ 4,000, as percentages only — the month’s the same')
const twoMonths = await book(LUCAS, SEP)
check(twoMonths.margins, {
  overall: 43.7143, brands: { AKEMI: 43.7143 },
  months: { '2026-09': { overall: 50, brands: { AKEMI: 50 } }, '2026-10': { overall: 42.1429, brands: { AKEMI: 42.1429 } } },
}, 'the two-month book Today reads: both months together (5,000 − 2,814.29) ÷ 5,000, and each month its own, for the app to cut')
check(stripped(lucas), { ...stripped(booksBefore.lucas), margins: lucas.margins }, 'every other field of the book as before')
check(lucas.orders.some(o => 'cost' in o || 'no_sales_cost' in o), false, 'no bill carries a cost')
const ben = await book(BEN)
check([flags(ben), ben.margins], [{ 'HC-SO-2610-096': true, 'HC-SO-2610-099': false, 'HC-SO-2610-100': true },
  { overall: 35, brands: { AKEMI: 35 }, months: { '2026-10': { overall: 35, brands: { AKEMI: 35 } } } }],
  'BEN: his half of the shared gift and the over-charged frame have no sales; (2,000 − 1,300) ÷ 2,000 — never ÷ 1,800')
const anthony = await book(ANTHONY)
check([flags(anthony), anthony.margins], [{ 'HC-SO-2610-095': true, 'HC-SO-2610-101': true },
  { overall: null, brands: { DUNLOP: null }, months: { '2026-10': { overall: null, brands: { DUNLOP: null } } } }],
  'ANTHONY: a gift and no sale — a cost, no margin to read; a sample that cost nothing names no brand among the margins')
const whole = await wholeBook()
check([flags(whole)['HC-SO-2610-096'], flags(whole)['HC-SO-2610-100']], [true, true], 'the whole sub-department: the shared gift once, whole; the over-charged frame')
check(whole.margins, { overall: 38.0952, brands: { AKEMI: 39.7619, DUNLOP: null },
  months: { '2026-10': { overall: 38.0952, brands: { AKEMI: 39.7619, DUNLOP: null } } } },
  'the whole sub-department: Akemi (6,000 − 3,614.29) ÷ 6,000; everybody (6,000 − 3,714.29) ÷ 6,000')
check(stripped(whole), { ...stripped(booksBefore.whole), margins: whole.margins }, 'every other field of the whole book as before')

console.log(`OK no-sales margin: ${checks} checks`)
