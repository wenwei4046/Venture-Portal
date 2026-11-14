// Local PostgreSQL regression for 20261114121700 (2026-11-14 — the user, on Product List › Costing Setting's FAIR · COST
// RATIO: "我要这个 ratio 这边，它是可以能够被 separate by brand 去填的 … 它其实是有 4 个，如果说我调主要的一个的话，这样它就是
// override 全部").
// Production's six bodies (tests/member-sql/brand-cost-ratios-production.sql, read with pg_get_functiondef, md5-checked)
// are loaded over stand-ins for what they read; the migration then runs VERBATIM, twice. What is under test is its own
// work: a line divides by its SKU's ratio for the brand its bill answers to, else its SKU's own, else THE BRAND'S, else
// the sub-department's — in Comm Cal's month, in the Revenue app's facts and in the calculator's rules — and the Save that
// writes the brands' ratios takes only a brand of the sub-department with a ladder and a ratio in range, beside the
// ratios it already wrote. Nothing moves while no brand has one. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261114121700_brand_cost_ratios.sql', import.meta.url)
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

const FAIR = id(1), FS = id(2), BATCH = id(3), OTHER_SUB = id(4), OS = id(5)
const LUCAS = id(11), HR = id(12)
const B = { ERGOTEX: id(41), AKEMI: id(42), DUNLOP: id(43), DERIVED: id(44), RIDERS: id(45), SPACED: id(46), ZANOTTI: id(47) }
const GIVEN_LINE = id(9001)
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
    enable_margin_penalty boolean NOT NULL DEFAULT false, deposit_threshold_pct numeric, revenue_cost_divisor numeric(6,4),
    updated_at timestamptz);
  CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, code text NOT NULL,
    name text, is_active boolean NOT NULL DEFAULT true, own_scheme boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_comm_brand_code UNIQUE (scheme_id, code));
  CREATE TABLE public.comm_margin_bands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text,
    margin_pct numeric, commission_multiplier numeric NOT NULL DEFAULT 1, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE public.comm_kpi_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid);
  CREATE TABLE public.erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL DEFAULT 'erp_sync', order_no text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), order_date date NOT NULL, event_date date, period_month date NOT NULL,
    customer_name text, debtor_code text, venue text, location text, brand_code text, order_total numeric NOT NULL,
    paid_amount numeric, balance numeric, cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text,
    erp_on_hold boolean NOT NULL DEFAULT false, sequence_in_day integer, staff_id uuid, agent_name text, manual_margin_pct numeric);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_code text,
    item_group text, brand_code text, qty numeric NOT NULL DEFAULT 1, line_amount numeric, cost_amount numeric,
    option_charge_amount numeric);
  CREATE TABLE public.sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
  CREATE TABLE public.comm_salesperson_closes(staff_id uuid, sub_department_id uuid, period_month date, reopened_at timestamptz,
    penalised_orders jsonb, order_ids uuid[]);
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid, period_month date,
    status text, penalised_orders jsonb);
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_venues(venue_key text PRIMARY KEY, canonical_key text, display_name text);
  CREATE TABLE public.comm_venue_events(venue_key text, period_month date, start_date date, organiser_id uuid);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.erp_products(erp_id text PRIMARY KEY, item_code text, category text, branding text, model_erp_id uuid);
  CREATE TABLE public.erp_product_models(erp_id uuid PRIMARY KEY, category text, branding text);
  CREATE TABLE public.catalogue_models(erp_model_id uuid PRIMARY KEY, brand_code text);
  CREATE TABLE public.catalogue_gwp(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.catalogue_gwp_items(gwp_id uuid, role text, product_code text, qty numeric);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, erp_product_id text, product_code text, ratio numeric, note text,
    updated_by uuid, updated_at timestamptz, PRIMARY KEY (scheme_id, erp_product_id));
  -- As 20261107233000 made it.
  CREATE TABLE public.comm_cost_ratio_brands(scheme_id uuid NOT NULL, erp_product_id text NOT NULL REFERENCES public.erp_products(erp_id),
    product_code text NOT NULL, brand_code text NOT NULL, ratio numeric(6,4) NOT NULL, updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (scheme_id, erp_product_id, brand_code),
    CONSTRAINT cost_ratio_brand_of_scheme FOREIGN KEY (scheme_id, brand_code)
      REFERENCES public.comm_brands(scheme_id, code) ON UPDATE CASCADE ON DELETE CASCADE);
  CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
  CREATE TABLE public.permission_table_writes(table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, label text, area text, read_perms text[], mode text,
    keys text[], labels text[]);
  CREATE TABLE public.guards(fn text, table_name text);
  -- What a purchase earned free, line by line (sales_order_gwp_free's answer, set by the test).
  CREATE TABLE public.test_gwp(line_id uuid PRIMARY KEY, free_qty numeric);

  -- The permission helpers: an editor unless a check says otherwise.
  CREATE FUNCTION public.has_any_action(text[]) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT coalesce(current_setting('test.may', true), 'yes') = 'yes' $$;
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
  CREATE FUNCTION public.sales_order_gwp_free(p_orders uuid[]) RETURNS TABLE(line_id uuid, free_qty numeric) LANGUAGE sql STABLE AS
    $$ SELECT g.line_id, g.free_qty FROM public.test_gwp g JOIN public.sales_order_lines l ON l.id = g.line_id
        WHERE l.order_id = ANY (p_orders) $$;
  -- Each holder of a bill and their part: the owner the remainder, each colleague their share (production's rule).
  CREATE FUNCTION public.sales_order_parts(p_orders uuid[]) RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
  LANGUAGE sql STABLE AS $$
    SELECT so.id, so.staff_id, 1 - coalesce((SELECT sum(s.share_pct) FROM public.sales_order_shares s WHERE s.order_id = so.id), 0), so.staff_id
      FROM public.sales_orders so WHERE so.id = ANY (p_orders)
    UNION ALL
    SELECT s.order_id, s.staff_id, s.share_pct, so.staff_id
      FROM public.sales_order_shares s JOIN public.sales_orders so ON so.id = s.order_id WHERE s.order_id = ANY (p_orders)
  $$;
  CREATE FUNCTION public.sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false) $$;
  CREATE FUNCTION public.venue_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
  CREATE FUNCTION public.ref_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT $1.debtor_code $$;
  CREATE FUNCTION public.paper_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT lower($1.debtor_code) $$;
  CREATE FUNCTION public.erp_sync_brand_code(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim($1)) $$;
  -- Production's: a mattress or a sofa sells under the brand its branding names; anything else under none.
  CREATE FUNCTION public.catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text) RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN UPPER(BTRIM(COALESCE(p_category, ''))) IN ('MATTRESS', 'SOFA')
                THEN COALESCE(erp_sync_brand_code(NULLIF(BTRIM(p_model_branding), '')),
                              erp_sync_brand_code(NULLIF(BTRIM(p_sku_branding), '')))
           END $$;
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-11-14) ──
const PROD = {
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[])': 'eb9f0116074174ee38a3ea508f0e9582',
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[],jsonb)': 'a97bf8e72a9944a5c3f62409735fa483',
  'member_quote_cost_rules(uuid)': 'd300e873e6ddc7eb8c9cb5461d92533e',
  'revenue_month_orders(uuid,date)': 'ca65252e526c2eda011eb476e3d84adb',
  'member_order_facts_with_old_bills(uuid,date,date)': '33414791db34a741ce9bd6ee84c9687a',
  'member_order_facts(uuid,date,date)': '987d328c0ec4087e4ce6f3e58346a382',
}
const AFTER = {
  ...PROD,
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[],jsonb,jsonb)': '09f5809e64edcc5c307ab0a72c7c9f63',
  'member_quote_cost_rules(uuid)': '0ec88aecc9974332af01050348963b1d',
  'revenue_month_orders(uuid,date)': '2f22ddc8226a705f2c211cae21563ef1',
  'member_order_facts_with_old_bills(uuid,date,date)': 'b0840628de75ec6383fcaf06911e2247',
}
const BODIES = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, md5(replace(p.prosrc, E'\\r', '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const NAMES = ['catalogue_save_cost_setting', 'member_quote_cost_rules', 'revenue_month_orders', 'member_order_facts_with_old_bills', 'member_order_facts']
const production = (await readFile(new URL('./brand-cost-ratios-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of production.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
check(Object.fromEntries((await q(BODIES, [NAMES])).map(r => [r.sig, r.md5])), PROD, "production's six bodies")
// As production grants them (pg_proc.proacl, 2026-11-14).
await db.exec(`
  REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb) TO authenticated, service_role;
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
const aclsBefore = await q(ACLS, [NAMES])

// ── Fair's October: a bill of each brand, a bill whose lines name its brand, riders alone, a gift with purchase ──
// The SKUs: Akemi's BASTION and the pillow at a ratio of their own (0.6, 0.8 — as production has BASTION), the Trion
// frame at 0.55 on a Dunlopillo bill (a rider's ratio by brand, 20261107233000).
const LINES = {
  'HC-SO-2610-601': ['ERGOTEX', [['EG-MATT-K', 'mattress', 'ERGOTEX', 4000, 1400], ['TRION (K)', 'bedframe', null, 1000, 600],
    ['TRANSPORTATION CHARGES', 'service', null, 100, null]]],
  'HC-SO-2610-602': ['AKEMI', [['AKEMI BASTION MATT (K)', 'mattress', 'AKEMI', 4000, 1400], ['AK-PILLOW', 'accessory', 'AKEMI', 500, 80],
    ['TRION (K)', 'bedframe', null, 1000, 600]]],
  'HC-SO-2610-603': ['DUNLOP', [['DL-MATT-K', 'mattress', 'DUNLOP', 4000, 1400], ['TRION (K)', 'bedframe', null, 1000, 600]]],
  // No brand on the bill: Ergotex sells the most of it (3,000 to 500), so it answers to Ergotex.
  'HC-SO-2610-604': [null, [['EG-MATT-Q', 'mattress', 'ERGOTEX', 3000, 1050], ['AK-PILLOW', 'accessory', 'AKEMI', 500, 80]]],
  // Riders alone, no brand anywhere: no brand's ladder, so no brand's ratio.
  'HC-SO-2610-605': [null, [['TRION (K)', 'bedframe', null, 1000, 600]]],
  // The bill's brand as the ERP spaced and cased it.
  'HC-SO-2610-606': [' ergotex ', [['TRION (K)', 'bedframe', null, 1000, 600]]],
  // Zanotti's sofa and two pillows, one of them given with the purchase (Product List › GWP).
  'HC-SO-2610-607': ['ZANOTTI', [['ZN-SOFA', 'sofa', 'ZANOTTI', 5000, 2000], ['ZN-PILLOW', 'accessory', 'ZANOTTI', 200, 100, 2, 1]]],
}
const BILL_IDS = { 'HC-SO-2610-601': B.ERGOTEX, 'HC-SO-2610-602': B.AKEMI, 'HC-SO-2610-603': B.DUNLOP, 'HC-SO-2610-604': B.DERIVED,
  'HC-SO-2610-605': B.RIDERS, 'HC-SO-2610-606': B.SPACED, 'HC-SO-2610-607': B.ZANOTTI }
await db.exec(`
  INSERT INTO public.users (id, name) VALUES ('${HR}', 'hr@');
  INSERT INTO public.hr_staff_costs (id, employee_name, employee_code) VALUES ('${LUCAS}', 'LUCAS', 'HC001');
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES
    ('${FS}', '${FAIR}', 0.3, 0.7), ('${OS}', '${OTHER_SUB}', 0.3, 0.7);
  INSERT INTO public.comm_brands (scheme_id, code, name, is_active, own_scheme) VALUES
    ('${FS}', 'AKEMI', 'Akemi', true, false), ('${FS}', 'DUNLOP', 'Dunlopillo', true, false),
    ('${FS}', 'ERGOTEX', 'Ergotex', true, false), ('${FS}', 'ZANOTTI', 'Zanotti', true, false),
    ('${FS}', 'OLDBRAND', 'Old brand', false, false), ('${FS}', '2990S', '2990s', true, true),
    ('${OS}', 'NOVA', 'Nova', true, false);
  INSERT INTO public.erp_feed_settings (sub_department_id, min_order_date) VALUES ('${FAIR}', '2026-09-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FS}', 'mattress', true), ('${FS}', 'accessory', true), ('${FS}', 'bedframe', true), ('${FS}', 'sofa', true),
    ('${FS}', 'service', false);
  INSERT INTO public.erp_products (erp_id, item_code, category, branding) VALUES
    ('P-TRION-K', 'TRION (K)', 'BEDFRAME', NULL), ('P-PILLOW', 'AK-PILLOW', 'ACCESSORY', NULL),
    ('P-BASTION-K', 'AKEMI BASTION MATT (K)', 'MATTRESS', 'AKEMI');
  INSERT INTO public.comm_cost_ratios (scheme_id, erp_product_id, product_code, ratio) VALUES
    ('${FS}', 'P-PILLOW', 'AK-PILLOW', 0.8), ('${FS}', 'P-BASTION-K', 'AKEMI BASTION MATT (K)', 0.6);
  INSERT INTO public.comm_cost_ratio_brands (scheme_id, erp_product_id, product_code, brand_code, ratio) VALUES
    ('${FS}', 'P-TRION-K', 'TRION (K)', 'DUNLOP', 0.55);
  INSERT INTO public.sales_import_batches (id, sub_department_id, period_month, status) VALUES ('${BATCH}', '${FAIR}', '${OCT}', 'committed');
`)
let seq = 0
for (const [orderNo, [brand, lines]] of Object.entries(LINES)) {
  const total = lines.reduce((a, l) => a + l[3], 0)
  await q(`INSERT INTO public.sales_orders (id, batch_id, order_no, order_date, event_date, period_month, brand_code, order_total,
             paid_amount, staff_id, sequence_in_day) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $7, $8, $9)`,
    [BILL_IDS[orderNo], BATCH, orderNo, `2026-10-${String(3 + seq).padStart(2, '0')}`, OCT, brand, total, LUCAS, ++seq])
  for (const [code, group, lineBrand, amount, cost, qty = 1, given = 0] of lines) {
    const lineId = given ? GIVEN_LINE : null
    await q(`INSERT INTO public.sales_order_lines (id, order_id, product_code, item_group, brand_code, qty, line_amount, cost_amount)
             VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)`,
      [lineId, BILL_IDS[orderNo], code, group, lineBrand, qty, amount, cost])
    if (given) await q(`INSERT INTO public.test_gwp VALUES ($1, $2)`, [GIVEN_LINE, given])
  }
}

// The rule, worked out here the long way: each goods line's cost (less any part given) ÷ its SKU's ratio for the bill's
// brand, else its own, else the brand's, else the sub-department's; the month rounds the cost first, the facts do not.
const OWN = { 'AK-PILLOW': 0.8, 'AKEMI BASTION MATT (K)': 0.6 }
const SKU_BRAND = { 'TRION (K)': { DUNLOP: 0.55 } }
const ladderOf = ([brand, lines]) => {
  const own = (brand ?? '').trim().toUpperCase()
  if (own) return own
  const sold = new Map()
  for (const l of lines) if (l[2] && l[1] !== 'service') sold.set(l[2], (sold.get(l[2]) ?? 0) + l[3])
  return [...sold.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
const expected = (main, brandRatios) => {
  const month = {}, facts = {}
  for (const [orderNo, bill] of Object.entries(LINES)) {
    const ladder = ladderOf(bill)
    let base = 0, cost = 0
    for (const [code, group, , amount, lineCost, qty = 1, given = 0] of bill[1]) {
      if (group === 'service') continue
      base += amount
      const ratio = SKU_BRAND[code]?.[ladder] ?? OWN[code] ?? (ladder ? brandRatios[ladder] : undefined) ?? main
      cost += (lineCost * (1 - given / qty)) / ratio
    }
    month[orderNo] = [r2(cost), r6((base - r2(cost)) / base), 'cost']
    facts[orderNo] = r6(1 - cost / base)
  }
  return { month, facts }
}

const month = async () => Object.fromEntries((await q(`SELECT order_no, margin_cost, margin_pct, margin_source FROM public.revenue_month_orders($1, $2)`,
  [FAIR, OCT])).map(r => [r.order_no, [r2(r.margin_cost), r6(r.margin_pct), r.margin_source]]))
const facts = async () => Object.fromEntries((await q(`SELECT order_no, margin_pct FROM public.member_order_facts($1, $2, $3) ORDER BY order_no`,
  [FS, OCT, NOV])).map(r => [r.order_no, r6(r.margin_pct)]))
const rules = () => one(`SELECT public.member_quote_cost_rules($1)`, [FS])
const save = (brandRatios, { divisor = null, ratios = [], removes = [], brands = [] } = {}) =>
  one(`SELECT public.catalogue_save_cost_setting($1, $2, $3::jsonb, $4::text[], $5::jsonb, $6::jsonb)`,
    [FS, divisor, JSON.stringify(ratios), removes, JSON.stringify(brands), JSON.stringify(brandRatios)])
const SAVE6 = `SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], '[]'::jsonb, $2::jsonb)`
const brandRows = async () => (await q(`SELECT brand_code, ratio::text, updated_by FROM public.comm_brand_cost_ratios ORDER BY brand_code`))
  .map(r => [r.brand_code, r.ratio, r.updated_by])

// ── Before: every line by its SKU's ratio for the brand, else its own, else the sub-department's ──
const before = { month: await month(), facts: await facts(), rules: await rules() }
const atMain = expected(0.7, {})
check(before.month, atMain.month, 'before: the month as the rule works it out at 0.7')
check(before.facts, atMain.facts, 'before: the facts as the rule works it out at 0.7')
check(before.month['HC-SO-2610-601'], [2857.14, 0.428572, 'cost'], "before: Ergotex's bill — the mattress 1,400 and the frame 600, ÷ 0.7")
check(before.month['HC-SO-2610-607'], [2928.57, 0.436813, 'cost'], "before: Zanotti's — the sofa, and half the pillows' 100 (one of two given), ÷ 0.7")
check(before.rules, { costDivisor: 0.7, costRatios: { 'AK-PILLOW': 0.8, 'AKEMI BASTION MATT (K)': 0.6 },
  costRatioBrands: { 'TRION (K)': { DUNLOP: 0.55 } }, gwp: [] }, "before: the calculator's rules")

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const md5After = await q(BODIES, [NAMES])
const TABLE = `SELECT (SELECT count(*) FROM pg_policies WHERE tablename = 'comm_brand_cost_ratios')::int AS policies,
  (SELECT count(*) FROM public.permission_table_writes WHERE table_name = 'comm_brand_cost_ratios')::int AS writes,
  (SELECT count(*) FROM public.permission_table_reads WHERE table_name = 'comm_brand_cost_ratios')::int AS reads`
const tableAfter = await q(TABLE)
await db.exec(migration)
check(await q(BODIES, [NAMES]), md5After, 'the second run changes no body')
check(await q(TABLE), tableAfter, 'nor the table’s policies and permission rows')
check(Object.fromEntries(md5After.map(r => [r.sig, r.md5])), AFTER,
  'the bodies production runs after it: the 4- and 5-argument writers and member_order_facts untouched')

// ── The table and who may reach it ──
check(tableAfter, [{ policies: 3, writes: 3, reads: 1 }], 'its three policies (as comm_cost_ratios), its writes and its reads')
check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comm_brand_cost_ratios'::regclass`), true, 'row level security is on')
check(await q(`SELECT command, actions FROM public.permission_table_writes WHERE table_name = 'comm_brand_cost_ratios' ORDER BY command`), [
  { command: 'DELETE', actions: ['revenue.manage', 'product_list.edit'] },
  { command: 'INSERT', actions: ['revenue.manage', 'product_list.edit'] },
  { command: 'UPDATE', actions: ['revenue.manage', 'product_list.edit'] },
], 'written as comm_cost_ratios is')
check(await one(`SELECT actions FROM public.permission_table_reads WHERE table_name = 'comm_brand_cost_ratios'`),
  ['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own'], 'read as comm_cost_ratios is')
check(await q(`SELECT fn, table_name FROM public.guards ORDER BY fn`), [
  { fn: 'reads', table_name: 'comm_brand_cost_ratios' }, { fn: 'reads', table_name: 'comm_brand_cost_ratios' },
  { fn: 'writes', table_name: 'comm_brand_cost_ratios' }, { fn: 'writes', table_name: 'comm_brand_cost_ratios' },
], 'both guards put on it, on each run')
check(await q(`SELECT label, area, read_perms, mode, keys, labels FROM public.audit_tables WHERE table_name = 'comm_brand_cost_ratios'`), [
  { label: 'Brand costing ratios', area: 'Catalogue', read_perms: ['product_list'], mode: 'all',
    keys: ['scheme_id', 'brand_code'], labels: ['brand_code'] },
], 'its line in the audit')
check((await q(ACLS, [NAMES])).filter(r => r.sig !== 'catalogue_save_cost_setting(uuid,numeric,jsonb,text[],jsonb,jsonb)'), aclsBefore,
  'every body it changed is granted as before: the calculator’s rules and the facts the service role’s alone')
check(await one(`SELECT has_function_privilege('authenticated', 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb, jsonb)', 'EXECUTE')`), true,
  'a sign-in may call the new Save (it asks Product List · Edit itself)')
check(await one(`SELECT has_function_privilege('anon', 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb, jsonb)', 'EXECUTE')`), false,
  'the publishable key may not')
check(await one(`SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
  WHERE p.oid = 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb, jsonb)'::regprocedure AND a.grantee = 0)`), false, 'nor PUBLIC')
check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb, jsonb)'::regprocedure`), true,
  'the Save is SECURITY DEFINER')
check(await one(`SELECT has_function_privilege('authenticated', 'public.member_quote_cost_rules(uuid)', 'EXECUTE')`), false, 'no ratio reaches a browser')

// ── Nothing moves while no brand has a ratio ──
check(await month(), before.month, "Comm Cal's month as before")
check(await facts(), before.facts, "the Revenue app's facts as before")
check(await rules(), { ...before.rules, brandDivisors: {} }, "the calculator's rules: the same, and no brand's ratio")

// ── The Save ──
await db.exec(`SET test.uid = '${HR}'`)
await db.exec(`SET test.may = 'no'`)
await refuses(SAVE6, [FS, '[]'], '42501', 'without Product List · Edit the Save is refused')
await db.exec(`SET test.may = 'yes'`)
check(await save([
  { brand_code: 'ERGOTEX', ratio: 0.6 },
  { brand_code: 'DUNLOP', ratio: 0.65 },
  { brand_code: 'ZANOTTI', ratio: 0.5 },
]), 3, 'three brands’ ratios written')
check(await brandRows(), [['DUNLOP', '0.6500', HR], ['ERGOTEX', '0.6000', HR], ['ZANOTTI', '0.5000', HR]], 'each with who set it')
check(await save([{ brand_code: 'ERGOTEX', ratio: 0.6 }]), 0, 'the same ratio again touches nothing')

// ── Comm Cal's month: each bill's lines by its brand's ratio, unless the SKU has one of its own ──
const byBrand = expected(0.7, { ERGOTEX: 0.6, DUNLOP: 0.65, ZANOTTI: 0.5 })
check(await month(), byBrand.month, 'the month as the rule works it out')
check(await month(), {
  ...before.month,
  'HC-SO-2610-601': [3333.33, 0.333334, 'cost'],
  'HC-SO-2610-603': [3244.76, 0.351048, 'cost'],
  'HC-SO-2610-604': [1850, 0.471429, 'cost'],
  'HC-SO-2610-606': [1000, 0, 'cost'],
  'HC-SO-2610-607': [4100, 0.211538, 'cost'],
}, "the month: Ergotex's mattress 1,400 ÷ 0.6 and its frame 600 ÷ 0.6 = 3,333.33; Akemi's has none set — BASTION its own 0.6, the pillow its own 0.8, the frame 0.7 — unmoved; Dunlopillo's mattress ÷ 0.65 while its frame keeps its own 0.55 for Dunlopillo; a bill with no brand answers to the brand it sells the most of (Ergotex's 1,050 ÷ 0.6), its Akemi pillow its own 0.8; riders alone answer to no brand (0.7); ' ergotex ' is Ergotex; Zanotti's sofa ÷ 0.5 and the pillow's part not given (50) ÷ 0.5")

// ── The Revenue app's facts: the same lines, the same ratios ──
check(await facts(), byBrand.facts, "Insight, the Arena and Today take each bill's margin as Comm Cal does")
check((await facts())['HC-SO-2610-602'], before.facts['HC-SO-2610-602'], 'Akemi’s bill, unmoved: no ratio for Akemi')

// ── The calculator's rules ──
check(await rules(), { ...before.rules, brandDivisors: { DUNLOP: 0.65, ERGOTEX: 0.6, ZANOTTI: 0.5 } },
  "the calculator's rules carry them, { brand: ratio }")

// ── What the Save refuses ──
await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: 'AKEMI', ratio: 0.7 }, { brand_code: 'AKEMI', ratio: 0.6 }])], '22023', 'a brand named twice')
await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: 'NOWHERE', ratio: 0.7 }])], '22023', 'a brand the sub-department does not have')
await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: 'OLDBRAND', ratio: 0.7 }])], '22023', 'a brand no longer active')
await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: '2990S', ratio: 0.7 }])], '22023', 'a brand on its own scheme: its bills stand in no margin')
await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: 'NOVA', ratio: 0.7 }])], '22023', 'another sub-department’s brand')
await refuses(SAVE6, [FS, JSON.stringify([{ ratio: 0.7 }])], '22023', 'a ratio for no brand')
for (const ratio of [0, 10.5, -1]) {
  await refuses(SAVE6, [FS, JSON.stringify([{ brand_code: 'AKEMI', ratio }])], '22023', `a ratio of ${ratio}`)
}
check(await brandRows(), [['DUNLOP', '0.6500', HR], ['ERGOTEX', '0.6000', HR], ['ZANOTTI', '0.5000', HR]], 'a refused Save leaves every row as it was')

// ── Taking one off; the SKUs' ratios in the same Save ──
check(await save([{ brand_code: 'AKEMI', ratio: null }, { brand_code: 'NOWHERE', ratio: null }]), 0,
  'taking off a ratio that is not there is never refused, and touches nothing')
check(await save([{ brand_code: 'ZANOTTI', ratio: null }], {
  ratios: [{ erp_product_id: 'P-PILLOW', ratio: 0.75 }],
  brands: [{ erp_product_id: 'P-TRION-K', brand_code: 'ERGOTEX', ratio: 0.5 }],
}), 3, "Zanotti's taken off, the pillow's own ratio changed and the frame given one for Ergotex — one Save")
check(await brandRows(), [['DUNLOP', '0.6500', HR], ['ERGOTEX', '0.6000', HR]], 'Zanotti follows the sub-department again')
check((await month())['HC-SO-2610-607'], before.month['HC-SO-2610-607'], "Zanotti's bill back at 0.7")
check((await month())['HC-SO-2610-601'][0], r2(1400 / 0.6 + 600 / 0.5), "Ergotex's bill: the frame's own ratio for Ergotex (0.5) ahead of Ergotex's (0.6)")
check((await month())['HC-SO-2610-602'][0], r2(1400 / 0.6 + 80 / 0.75 + 600 / 0.7), "Akemi's: the pillow's own ratio, now 0.75")

// ── "如果说我调主要的一个的话，这样它就是 override 全部": the page sends the main ratio and every brand back to it ──
check(await save([{ brand_code: 'ERGOTEX', ratio: null }, { brand_code: 'DUNLOP', ratio: null }], { divisor: 0.65 }), 3,
  'the main ratio and the two brands that had their own')
check(await one(`SELECT revenue_cost_divisor::text FROM public.comm_schemes WHERE id = $1`, [FS]), '0.6500', 'the sub-department divides by 0.65')
check(await brandRows(), [], 'no brand has a ratio of its own: every one divides by the main')
check((await month())['HC-SO-2610-603'][0], r2(1400 / 0.65 + 600 / 0.55), "Dunlopillo's bill: its mattress ÷ the main 0.65, its frame still its own 0.55 for Dunlopillo")
check((await month())['HC-SO-2610-605'][0], r2(600 / 0.65), 'riders alone: ÷ the main 0.65')
check(await rules(), { costDivisor: 0.65, costRatios: { 'AK-PILLOW': 0.75, 'AKEMI BASTION MATT (K)': 0.6 },
  costRatioBrands: { 'TRION (K)': { DUNLOP: 0.55, ERGOTEX: 0.5 } }, gwp: [], brandDivisors: {} }, "the calculator's rules follow")

// ── A brand renamed carries its ratio; a brand deleted takes it ──
check(await save([{ brand_code: 'ZANOTTI', ratio: 0.5 }]), 1, "Zanotti's ratio set again")
await db.exec(`UPDATE public.comm_brands SET code = 'ZNT' WHERE scheme_id = '${FS}' AND code = 'ZANOTTI'`)
check(await brandRows(), [['ZNT', '0.5000', HR]], 'a brand recoded carries its ratio along')
await db.exec(`DELETE FROM public.comm_brands WHERE scheme_id = '${FS}' AND code = 'ZNT'`)
check(await brandRows(), [], 'a brand deleted takes its ratio')

console.log(`OK brand cost ratios: ${checks} checks`)
