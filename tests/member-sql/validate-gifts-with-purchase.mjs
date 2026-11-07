// Local PostgreSQL regression for 20261108010000 (2026-11-08 — the user: "i want the product list tab for one more new
// tab is gwp … example, dullop mattress ecobliss, set a gwp 2 micorfibre pillow. so the margin calculator and margin
// leader will not calculate the cost in for those 2 pillow. is jsut calculate the mattress cost only"; by SKU, N a unit,
// any of several gifts, the Quote unchanged, and "gwp no need got set date funtion").
// Production's four bodies (tests/member-sql/gifts-with-purchase-production.sql, read with pg_get_functiondef,
// md5-checked — member_order_facts_with_old_bills as 20261107235500 left it) are loaded over stand-ins for what they
// read; the migration then runs VERBATIM, twice. What is under test is its own work: a GWP's allowance on a bill is
// its units a unit × the units of its buy SKUs there, taken by its gift SKUs' lines cheapest first — an unknown cost
// first — and that part of their cost leaves Comm Cal's month, the Revenue app's facts and the calculator's rules;
// a line wholly given never holds a bill as uncosted; and the Save takes only what is right. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261108010000_gifts_with_purchase.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, code, what) => {
  let got = null
  try { await q(sql, params) } catch (e) { got = e.code ?? String(e) }
  check(got, code, what)
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const r2 = v => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
const r6 = v => (v === null || v === undefined ? null : Math.round(Number(v) * 1e6) / 1e6)

const FAIR = id(1), FS = id(2), BATCH = id(3), LUCAS = id(11), HR = id(12)
const B = { ECO: id(41), PAST: id(42), ALONE: id(43), NOCOST: id(44), CHEAP: id(45), TWO: id(46) }
const OCT = '2026-10-01', NOV = '2026-11-01'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

  -- ── Stand-ins for what production's bodies read ──
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text, title_id uuid);
  CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, enable_kpi boolean NOT NULL DEFAULT false,
    enable_margin_penalty boolean NOT NULL DEFAULT false, deposit_threshold_pct numeric, revenue_cost_divisor numeric,
    updated_at timestamptz);
  CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, code text, name text,
    is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.comm_margin_bands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text,
    margin_pct numeric, commission_multiplier numeric, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE public.erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL DEFAULT 'erp_sync', order_no text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), order_date date NOT NULL, event_date date, period_month date NOT NULL,
    customer_name text, debtor_code text, venue text, location text, brand_code text, order_total numeric NOT NULL,
    paid_amount numeric, balance numeric, cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text,
    erp_on_hold boolean NOT NULL DEFAULT false, sequence_in_day integer, staff_id uuid, agent_name text, manual_margin_pct numeric);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_code text,
    item_group text, brand_code text, qty numeric NOT NULL DEFAULT 1, line_amount numeric, cost_amount numeric, option_charge_amount numeric);
  CREATE TABLE public.sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
  CREATE TABLE public.comm_salesperson_closes(staff_id uuid, sub_department_id uuid, period_month date, reopened_at timestamptz,
    penalised_orders jsonb, order_ids uuid[]);
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid, period_month date, status text,
    penalised_orders jsonb);
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, erp_product_id text, product_code text, ratio numeric);
  CREATE TABLE public.comm_cost_ratio_brands(scheme_id uuid, erp_product_id text, product_code text, brand_code text, ratio numeric);
  CREATE TABLE public.comm_venues(venue_key text PRIMARY KEY, canonical_key text, display_name text);
  CREATE TABLE public.comm_venue_events(venue_key text, period_month date, start_date date, organiser_id uuid);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.erp_products(erp_id text PRIMARY KEY, item_code text, category text);
  CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
  CREATE TABLE public.permission_table_writes(table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, label text, area text, read_perms text[], mode text,
    keys text[], labels text[]);
  CREATE TABLE public.guards(fn text, table_name text);

  CREATE FUNCTION public.has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.has_perm(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}') RETURNS text LANGUAGE sql AS $$
    INSERT INTO public.audit_tables VALUES (p_table, p_label, p_area, p_read, p_mode, p_keys, p_labels)
    ON CONFLICT (table_name) DO UPDATE SET label = EXCLUDED.label RETURNING p_mode $$;
  CREATE FUNCTION public.permission_writes_guard(text) RETURNS integer LANGUAGE sql AS
    $$ INSERT INTO public.guards VALUES ('writes', $1) RETURNING 0 $$;
  CREATE FUNCTION public.permission_reads_guard(text) RETURNS integer LANGUAGE sql AS
    $$ INSERT INTO public.guards VALUES ('reads', $1) RETURNING 0 $$;

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
  -- Production's (20261107230000): a bill the feed dated before its window, in a month from it on.
  CREATE FUNCTION public.sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false) $$;
  CREATE FUNCTION public.venue_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
  CREATE FUNCTION public.ref_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT $1.debtor_code $$;
  CREATE FUNCTION public.paper_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT lower($1.debtor_code) $$;
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-11-08) ──
const PROD = {
  'member_quote_cost_rules(uuid)': '49c4eff9990a4bc0f48c550ecd5fda6e',
  'revenue_month_orders(uuid,date)': '33b6bd204e8345202879f058bde05933',
  'member_order_facts_with_old_bills(uuid,date,date)': 'c4daa35e4b387d744a5bef3b8edbc23f',
  'member_order_facts(uuid,date,date)': '987d328c0ec4087e4ce6f3e58346a382',
}
const BODIES = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, md5(replace(p.prosrc, E'\\r', '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const NAMES = ['member_quote_cost_rules', 'revenue_month_orders', 'member_order_facts_with_old_bills', 'member_order_facts',
  'catalogue_save_gwp', 'sales_order_gwp_free']
const production = (await readFile(new URL('./gifts-with-purchase-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of production.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
check(Object.fromEntries((await q(BODIES, [NAMES])).map(r => [r.sig, r.md5])), PROD, "production's four bodies")
// As production grants them (pg_proc.proacl, 2026-11-08).
await db.exec(`
  REVOKE ALL ON FUNCTION public.revenue_month_orders(uuid, date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.revenue_month_orders(uuid, date) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.member_quote_cost_rules(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.member_quote_cost_rules(uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) TO service_role;
  REVOKE ALL ON FUNCTION public.member_order_facts(uuid, date, date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.member_order_facts(uuid, date, date) TO service_role;
`)
const ACLS = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, p.proacl::text AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const READERS = ['member_quote_cost_rules', 'revenue_month_orders', 'member_order_facts_with_old_bills', 'member_order_facts']
const aclsBefore = await q(ACLS, [READERS])

// ── Fair's October: the user's mattress with its pillows, past the allowance, alone, uncosted, cheapest first, two ──
await db.exec(`
  INSERT INTO public.users (id, name) VALUES ('${HR}', 'principal@');
  INSERT INTO public.hr_staff_costs (id, employee_name, employee_code) VALUES ('${LUCAS}', 'LUCAS', 'HC001');
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES ('${FS}', '${FAIR}', 0.3, 0.7);
  INSERT INTO public.comm_brands (scheme_id, code, name) VALUES ('${FS}', 'DUNLOP', 'Dunlopillo');
  INSERT INTO public.erp_feed_settings (sub_department_id, min_order_date) VALUES ('${FAIR}', '2026-09-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FS}', 'mattress', true), ('${FS}', 'accessory', true), ('${FS}', 'service', false);
  INSERT INTO public.erp_products (erp_id, item_code, category) VALUES
    ('P-ECO-Q', 'ECOBLISS (Q)', 'MATTRESS'), ('P-ECO-K', 'ECOBLISS (K)', 'MATTRESS'),
    ('P-MF', 'MF PILLOW', 'ACCESSORY'), ('P-LATEX', 'LATEX PILLOW', 'ACCESSORY'), ('P-BOLSTER', 'BOLSTER', 'ACCESSORY');
  INSERT INTO public.sales_import_batches (id, sub_department_id, period_month, status) VALUES ('${BATCH}', '${FAIR}', '${OCT}', 'committed');
  INSERT INTO public.sales_orders (id, batch_id, order_no, order_date, event_date, period_month, brand_code, order_total, paid_amount, staff_id, sequence_in_day) VALUES
    ('${B.ECO}', '${BATCH}', 'HC-SO-2610-601', '2026-10-03', '2026-10-03', '${OCT}', 'DUNLOP', 3000, 3000, '${LUCAS}', 1),
    ('${B.PAST}', '${BATCH}', 'HC-SO-2610-602', '2026-10-04', '2026-10-04', '${OCT}', 'DUNLOP', 3500, 3500, '${LUCAS}', 1),
    ('${B.ALONE}', '${BATCH}', 'HC-SO-2610-603', '2026-10-05', '2026-10-05', '${OCT}', 'DUNLOP', 300, 300, '${LUCAS}', 1),
    ('${B.NOCOST}', '${BATCH}', 'HC-SO-2610-604', '2026-10-06', '2026-10-06', '${OCT}', 'DUNLOP', 3000, 3000, '${LUCAS}', 1),
    ('${B.CHEAP}', '${BATCH}', 'HC-SO-2610-605', '2026-10-07', '2026-10-07', '${OCT}', 'DUNLOP', 3000, 3000, '${LUCAS}', 1),
    ('${B.TWO}', '${BATCH}', 'HC-SO-2610-606', '2026-10-08', '2026-10-08', '${OCT}', 'DUNLOP', 6000, 6000, '${LUCAS}', 1);
  INSERT INTO public.sales_order_lines (id, order_id, product_code, item_group, brand_code, qty, line_amount, cost_amount) VALUES
    -- The user's: a Queen ECOBLISS (1,400 → 2,000) and its two microfibre pillows (35 each), at RM 0 as the ERP bills them.
    (gen_random_uuid(), '${B.ECO}', 'ECOBLISS (Q)', 'mattress', 'DUNLOP', 1, 3000, 1400),
    (gen_random_uuid(), '${B.ECO}', 'MF PILLOW', 'accessory', 'DUNLOP', 2, 0, 70),
    -- A King with three pillows: one is past the allowance (35 ÷ 0.7 = 50), written in small letters.
    (gen_random_uuid(), '${B.PAST}', 'ECOBLISS (K)', 'mattress', 'DUNLOP', 1, 3500, 1600),
    (gen_random_uuid(), '${B.PAST}', ' mf pillow ', 'accessory', 'DUNLOP', 3, 0, 105),
    -- Pillows sold with no mattress: no purchase, no gift.
    (gen_random_uuid(), '${B.ALONE}', 'MF PILLOW', 'accessory', 'DUNLOP', 2, 300, 70),
    -- Two pillows with no cost yet, wholly given: the bill's margin is known without them.
    (gen_random_uuid(), '${B.NOCOST}', 'ECOBLISS (Q)', 'mattress', 'DUNLOP', 1, 3000, 1400),
    (gen_random_uuid(), '${B.NOCOST}', 'MF PILLOW', 'accessory', 'DUNLOP', 2, 0, NULL),
    -- Cheapest first: an uncosted microfibre, then one at 20; the latex (60) is counted (60 ÷ 0.7 = 85.71).
    (gen_random_uuid(), '${B.CHEAP}', 'ECOBLISS (Q)', 'mattress', 'DUNLOP', 1, 3000, 1400),
    ('${id(9001)}', '${B.CHEAP}', 'LATEX PILLOW', 'accessory', 'DUNLOP', 1, 0, 60),
    ('${id(9002)}', '${B.CHEAP}', 'MF PILLOW', 'accessory', 'DUNLOP', 1, 0, 20),
    ('${id(9003)}', '${B.CHEAP}', 'MF PILLOW', 'accessory', 'DUNLOP', 1, 0, NULL),
    -- Two mattresses earn four; a bolster is no gift of it.
    (gen_random_uuid(), '${B.TWO}', 'ECOBLISS (Q)', 'mattress', 'DUNLOP', 2, 6000, 2800),
    (gen_random_uuid(), '${B.TWO}', 'MF PILLOW', 'accessory', 'DUNLOP', 4, 0, 140),
    (gen_random_uuid(), '${B.TWO}', 'BOLSTER', 'accessory', 'DUNLOP', 1, 0, 35),
    (gen_random_uuid(), '${B.TWO}', 'TRANSPORTATION CHARGES', 'service', NULL, 1, 0, NULL);
`)

const month = async () => Object.fromEntries((await q(`SELECT order_no, margin_cost, margin_pct, lines_without_cost FROM public.revenue_month_orders($1, $2)`,
  [FAIR, OCT])).map(r => [r.order_no, [r2(r.margin_cost), r6(r.margin_pct), Number(r.lines_without_cost)]]))
const FACTS = `SELECT order_no, round(margin_pct, 6)::text AS margin, no_sales_cost, full_revenue, weight FROM public.member_order_facts_with_old_bills($1, $2, $3) ORDER BY order_no`
const facts = async () => Object.fromEntries((await q(FACTS, [FS, OCT, NOV])).map(r => [r.order_no, r.margin === null ? null : Number(r.margin)]))
const factsRest = async () => (await q(FACTS, [FS, OCT, NOV])).map(r => [r.order_no, r.no_sales_cost, String(r.full_revenue), String(r.weight)])
const wrapper = async () => (await q(`SELECT order_no, round(margin_pct, 6)::text AS margin FROM public.member_order_facts($1, $2, $3) ORDER BY order_no`,
  [FS, OCT, NOV])).map(r => [r.order_no, r.margin === null ? null : Number(r.margin)])
const rules = () => one(`SELECT public.member_quote_cost_rules($1)`, [FS])
const save = (gwpId, changes) => one(`SELECT public.catalogue_save_gwp($1, $2::jsonb)`, [gwpId, JSON.stringify(changes)])
const items = async () => (await q(`SELECT role, erp_product_id, product_code FROM public.catalogue_gwp_items ORDER BY role, erp_product_id`))
  .map(r => [r.role, r.erp_product_id, r.product_code])

// ── Before: every pillow costs the margin ──
const before = { month: await month(), facts: await facts(), rest: await factsRest(), rules: await rules() }
check(before.month['HC-SO-2610-601'], [2100, 0.3, 0], "before: the user's bill — the mattress 2,000 and its pillows 100")
check(before.month['HC-SO-2610-604'], [null, null, 1], 'before: the uncosted pillows hold the bill')
check(before.facts['HC-SO-2610-604'], null, 'before: the facts hold it too')
check(before.rules, { costDivisor: 0.7, costRatios: {}, costRatioBrands: {} }, "before: the calculator's rules")

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const md5After = await q(BODIES, [NAMES])
const tablesAfter = async () => q(`SELECT
  (SELECT count(*) FROM pg_policies WHERE tablename = 'catalogue_gwp')::int AS gwp_policies,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'catalogue_gwp_items')::int AS item_policies,
  (SELECT count(*) FROM public.permission_table_writes WHERE table_name LIKE 'catalogue_gwp%')::int AS writes,
  (SELECT count(*) FROM public.permission_table_reads WHERE table_name LIKE 'catalogue_gwp%')::int AS reads,
  (SELECT count(*) FROM public.audit_tables WHERE table_name LIKE 'catalogue_gwp%')::int AS audits`)
const firstTables = await tablesAfter()
await db.exec(migration)
check(await q(BODIES, [NAMES]), md5After, 'the second run changes no body')
check(await tablesAfter(), firstTables, 'nor the tables’ policies, permission rows and audit lines')
check(Object.fromEntries(md5After.map(r => [r.sig, r.md5])), {
  'catalogue_save_gwp(uuid,jsonb)': '9769e1ae67c9a0516e2613d3a924c539',
  'sales_order_gwp_free(uuid[])': '658722b990b11b99acc37995ce8dc8f3',
  'member_quote_cost_rules(uuid)': '9973901db6f5109566723a1ed4ad2b67',
  'revenue_month_orders(uuid,date)': '99c8386e4549d99c963b250c4538ce80',
  'member_order_facts_with_old_bills(uuid,date,date)': '6904a0dd72dcc3abe5b4463071bbe077',
  'member_order_facts(uuid,date,date)': '987d328c0ec4087e4ce6f3e58346a382',
}, 'the bodies production runs after it: member_order_facts untouched')

// ── The tables and who may reach them ──
check(firstTables, [{ gwp_policies: 3, item_policies: 3, writes: 6, reads: 2, audits: 2 }], 'three policies each, their writes, reads and audit lines')
for (const t of ['catalogue_gwp', 'catalogue_gwp_items']) {
  check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`, [`public.${t}`]), true, `${t}: row level security is on`)
}
check(await q(`SELECT table_name, command, actions FROM public.permission_table_writes ORDER BY table_name, command`), [
  { table_name: 'catalogue_gwp', command: 'DELETE', actions: ['product_list.edit'] },
  { table_name: 'catalogue_gwp', command: 'INSERT', actions: ['product_list.edit'] },
  { table_name: 'catalogue_gwp', command: 'UPDATE', actions: ['product_list.edit'] },
  { table_name: 'catalogue_gwp_items', command: 'DELETE', actions: ['product_list.edit'] },
  { table_name: 'catalogue_gwp_items', command: 'INSERT', actions: ['product_list.edit'] },
  { table_name: 'catalogue_gwp_items', command: 'UPDATE', actions: ['product_list.edit'] },
], 'written with Product List · Edit')
check((await q(`SELECT DISTINCT fn, table_name FROM public.guards ORDER BY fn, table_name`)).length, 4, 'both guards on both tables')
check((await q(ACLS, [READERS])), aclsBefore, 'every reader it changed granted as before: the rules and the facts the service role’s alone')
check(await one(`SELECT has_function_privilege('authenticated', 'public.catalogue_save_gwp(uuid, jsonb)', 'EXECUTE')`), true,
  'a sign-in may call the Save (the tables’ policies decide)')
check(await one(`SELECT has_function_privilege('anon', 'public.catalogue_save_gwp(uuid, jsonb)', 'EXECUTE')`), false, 'the publishable key may not')
check(await one(`SELECT has_function_privilege('anon', 'public.sales_order_gwp_free(uuid[])', 'EXECUTE')`), false, 'nor read what a bill earned free')
check(await one(`SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
  WHERE p.proname IN ('catalogue_save_gwp', 'sales_order_gwp_free') AND a.grantee = 0)`), false, 'nor PUBLIC either one')
check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = 'public.catalogue_save_gwp(uuid, jsonb)'::regprocedure`), false,
  'the Save runs as its caller')

// ── Nothing moves while there is no GWP ──
check(await month(), before.month, "Comm Cal's month as before")
check(await facts(), before.facts, "the Revenue app's facts as before")
check(await factsRest(), before.rest, 'every other column of theirs, the weights included')
check(await rules(), { ...before.rules, gwp: [] }, "the calculator's rules: the same, and no GWP")

// ── The Save makes one ──
await db.exec(`SET test.uid = '${HR}'`)
const eco = await save(null, { qty: 2, buy: ['P-ECO-Q', 'P-ECO-K', 'P-ECO-Q'], gift: ['P-MF', 'P-LATEX'] })
check(typeof eco === 'string' && eco.length === 36, true, 'a new GWP has an id')
check(await items(), [
  ['buy', 'P-ECO-K', 'ECOBLISS (K)'], ['buy', 'P-ECO-Q', 'ECOBLISS (Q)'],
  ['gift', 'P-LATEX', 'LATEX PILLOW'], ['gift', 'P-MF', 'MF PILLOW'],
], 'its SKUs once each, with the codes a line carries, read from the SKU Master')
check(await q(`SELECT qty_per_unit, created_by, updated_by FROM public.catalogue_gwp`), [{ qty_per_unit: 2, created_by: HR, updated_by: HR }],
  'two a unit, and who made it')

// ── What a purchase earns free, line by line ──
const free = async (bill) => (await q(`SELECT l.product_code, f.free_qty::text AS free FROM public.sales_order_gwp_free(ARRAY[$1::uuid]) f
  JOIN public.sales_order_lines l ON l.id = f.line_id ORDER BY l.id`, [bill])).map(r => [r.product_code.trim(), Number(r.free)])
check(await free(B.ECO), [['MF PILLOW', 2]], "the user's two pillows")
check(await free(B.PAST), [['mf pillow', 2]], 'two of three — the code read in any case and spacing')
check(await free(B.ALONE), [], 'none without the mattress')
check(await free(B.CHEAP), [['MF PILLOW', 1], ['MF PILLOW', 1]], 'the uncosted one, then the cheapest; the latex not')
check((await q(`SELECT f.line_id FROM public.sales_order_gwp_free(ARRAY[$1::uuid]) f ORDER BY 1`, [B.CHEAP])).map(r => r.line_id),
  [id(9002), id(9003)], '— the lines at 20 and with no cost')
check(await free(B.TWO), [['MF PILLOW', 4]], 'two mattresses, four pillows; the bolster no gift of it')

// ── Comm Cal's month: their cost out ──
check(await month(), {
  ...before.month,
  'HC-SO-2610-601': [2000, 0.333333, 0],
  'HC-SO-2610-602': [2335.71, 0.332654, 0],
  'HC-SO-2610-604': [2000, 0.333333, 0],
  'HC-SO-2610-605': [2085.71, 0.304763, 0],
  'HC-SO-2610-606': [4050, 0.325, 1],
}, "the month: the user's bill is the mattress's cost alone (2,000); three pillows, one counted (2,285.71 + 50); the uncosted pair given, so the bill has a margin and no line without a cost; cheapest first, the latex counted (2,000 + 85.71); two mattresses' four pillows given, the bolster counted (4,000 + 50) and the transport still a line without a cost")
check(before.month['HC-SO-2610-603'], [100, 0.666667, 0], 'pillows sold alone: their cost, as before')

// ── The Revenue app's facts: the same ──
check(await facts(), {
  'HC-SO-2610-601': 0.333333,
  'HC-SO-2610-602': 0.332653,
  'HC-SO-2610-603': before.facts['HC-SO-2610-603'],
  'HC-SO-2610-604': 0.333333,
  'HC-SO-2610-605': 0.304762,
  'HC-SO-2610-606': 0.325,
}, 'Insight, the Arena and Today take each bill’s margin as Comm Cal does')
check(await wrapper(), Object.entries(await facts()).sort(), 'member_order_facts reads it')

// ── The calculator's rules ──
check(await rules(), { ...before.rules, gwp: [{ id: eco, perUnit: 2, buy: ['ECOBLISS (K)', 'ECOBLISS (Q)'], gift: ['LATEX PILLOW', 'MF PILLOW'] }] },
  "the calculator's rules carry it, [{ id, perUnit, buy, gift }]")

// ── Only what changed ──
check(await save(eco, { qty: 1 }), eco, 'one a unit now')
check(await items(), [
  ['buy', 'P-ECO-K', 'ECOBLISS (K)'], ['buy', 'P-ECO-Q', 'ECOBLISS (Q)'],
  ['gift', 'P-LATEX', 'LATEX PILLOW'], ['gift', 'P-MF', 'MF PILLOW'],
], '— its SKUs untouched')
check((await month())['HC-SO-2610-601'], [2050, 0.316667, 0], "the user's bill: one pillow given, one counted (50)")
check(await save(eco, { gift: ['P-LATEX'] }), eco, 'the gifts changed to the latex alone')
check((await items()).filter(r => r[0] === 'gift'), [['gift', 'P-LATEX', 'LATEX PILLOW']], '— the microfibre taken off')
check((await month())['HC-SO-2610-601'], before.month['HC-SO-2610-601'], '— so the microfibre pillows count again')
check(await save(eco, { qty: 2, gift: ['P-MF', 'P-LATEX'] }), eco, 'back to two, either pillow')

// ── A SKU the ERP renamed: the next Save follows it ──
await db.exec(`UPDATE public.erp_products SET item_code = 'MF PILLOW V2' WHERE erp_id = 'P-MF'`)
await save(eco, { qty: 3 })
check((await items()).find(r => r[1] === 'P-MF'), ['gift', 'P-MF', 'MF PILLOW V2'], 'its code is the one new bills carry')
await db.exec(`UPDATE public.erp_products SET item_code = 'MF PILLOW' WHERE erp_id = 'P-MF'`)
await save(eco, { qty: 2 })

// ── What the Save refuses ──
const tryChanges = (gwpId, changes) => [`SELECT public.catalogue_save_gwp($1, $2::jsonb)`, [gwpId, JSON.stringify(changes)]]
await refuses(...tryChanges(null, { qty: 2, buy: ['P-ECO-Q'] }), '22023', 'a new GWP with no gifts')
await refuses(...tryChanges(null, { buy: ['P-ECO-Q'], gift: ['P-MF'] }), '22023', 'a new GWP with no units')
for (const qty of [0, 101, 1.5, '2']) {
  await refuses(...tryChanges(eco, { qty }), '22023', `units of ${JSON.stringify(qty)}`)
}
await refuses(...tryChanges(eco, { buy: [] }), '22023', 'nothing bought')
await refuses(...tryChanges(eco, { gift: 'P-MF' }), '22023', 'gifts that are no list')
await refuses(...tryChanges(eco, { gift: ['P-NOWHERE'] }), '23503', 'a SKU not in the SKU Master')
await refuses(...tryChanges(eco, { gift: ['P-MF', 'P-ECO-Q'] }), '22023', 'a SKU both bought and given')
await refuses(...tryChanges(id(77), { qty: 2 }), 'P0002', 'a GWP no longer on the list')
await refuses(...tryChanges(id(77), { remove: true }), 'P0002', '— nor removed')
await refuses(`SELECT public.catalogue_save_gwp($1, NULL)`, [eco], '22023', 'nothing to save')
check(await items(), [
  ['buy', 'P-ECO-K', 'ECOBLISS (K)'], ['buy', 'P-ECO-Q', 'ECOBLISS (Q)'],
  ['gift', 'P-LATEX', 'LATEX PILLOW'], ['gift', 'P-MF', 'MF PILLOW'],
], 'a refused Save leaves it as it was')

// ── Two GWPs on one bill, each its own allowance ──
const bolster = await save(null, { qty: 1, buy: ['P-ECO-Q'], gift: ['P-BOLSTER'] })
check((await month())['HC-SO-2610-606'], [4000, 0.333333, 1], "two mattresses: four pillows by one GWP, the bolster by another")
check(await save(bolster, { remove: true }), bolster, 'taken away')

// ── Taken off the list: every month as before ──
check(await save(eco, { remove: true }), eco, 'the GWP taken away')
check(await q(`SELECT count(*)::int AS n FROM public.catalogue_gwp_items`), [{ n: 0 }], '— its SKUs with it')
check(await month(), before.month, "Comm Cal's month as it was")
check(await facts(), before.facts, "the Revenue app's facts as they were")
check(await rules(), { ...before.rules, gwp: [] }, "the calculator's rules carry none")

console.log(`OK gifts with purchase: ${checks} checks`)
