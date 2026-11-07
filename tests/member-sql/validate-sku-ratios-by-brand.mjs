// Local PostgreSQL regression for 20261107233000 (2026-11-07 — the user, on Product List › Costing Setting: a bed frame
// "right click 出来后 spread out，也就是 by brand 可以有不同的除法 … Trion … 0.6 … 0.7 … 0.5", because "不要同一个 item 在不同的
// brand 卖不一样的 margin … 有人会作弊"; set per SKU — "在 Costing Setting 的 SKU 清单上对 Trion 按 special add … 再按 brand 各填一个
// 除法" — and "if didnt set, then just follow the defauly rate").
// Production's five bodies (tests/member-sql/sku-ratios-by-brand-production.sql, read with pg_get_functiondef, md5-checked)
// are loaded over stand-ins for what they read; the migration then runs VERBATIM, twice. What is under test is its own
// work: a line divides by its SKU's ratio for the brand its bill answers to, else its own, else the sub-department's —
// in Comm Cal's month, in the Revenue app's facts and in the calculator's rules — and the Save that writes them takes
// only a rider, a brand of the sub-department and a ratio in range. Nothing moves while no SKU has one. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261107233000_sku_ratios_by_brand.sql', import.meta.url)
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
const M = { RIDER_MATT: id(31), PLAIN_MATT: id(32), AKEMI_MATT: id(33), FRAME_MODEL: id(34) }
const B = { DUNLOP: id(41), ERGOTEX: id(42), AKEMI: id(43), DERIVED: id(44), TIE: id(45), RIDERS_ONLY: id(46), SPACED: id(47) }
const OCT = '2026-10-01', NOV = '2026-11-01'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

  -- ── Stand-ins for what production's bodies read ──
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text);
  CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, enable_kpi boolean NOT NULL DEFAULT false,
    deposit_threshold_pct numeric, revenue_cost_divisor numeric, updated_at timestamptz);
  CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, code text, name text,
    is_active boolean NOT NULL DEFAULT true);
  CREATE UNIQUE INDEX uq_comm_brand_code ON public.comm_brands (scheme_id, code);
  CREATE TABLE public.erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL DEFAULT 'erp_sync', order_no text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), order_date date NOT NULL, event_date date, period_month date NOT NULL,
    customer_name text, debtor_code text, venue text, location text, brand_code text, order_total numeric NOT NULL,
    paid_amount numeric, balance numeric, cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text,
    erp_on_hold boolean NOT NULL DEFAULT false, sequence_in_day integer, staff_id uuid, agent_name text, manual_margin_pct numeric);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_code text,
    item_group text, brand_code text, line_amount numeric, cost_amount numeric, option_charge_amount numeric);
  CREATE TABLE public.sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, erp_product_id text, product_code text, ratio numeric, note text,
    updated_by uuid, updated_at timestamptz, PRIMARY KEY (scheme_id, erp_product_id));
  CREATE TABLE public.comm_venues(venue_key text PRIMARY KEY, canonical_key text, display_name text);
  CREATE TABLE public.comm_venue_events(venue_key text, period_month date, start_date date, organiser_id uuid);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.erp_products(erp_id text PRIMARY KEY, item_code text, category text, branding text, model_erp_id uuid);
  CREATE TABLE public.erp_product_models(erp_id uuid PRIMARY KEY, category text, branding text);
  CREATE TABLE public.catalogue_models(erp_model_id uuid PRIMARY KEY, brand_code text);
  CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
  CREATE TABLE public.permission_table_writes(table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, label text, area text, read_perms text[], mode text,
    keys text[], labels text[]);
  CREATE TABLE public.guards(fn text, table_name text);

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
  CREATE FUNCTION public.erp_sync_brand_code(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim($1)) $$;
  -- Production's: a mattress or a sofa sells under the brand its branding names; anything else under none.
  CREATE FUNCTION public.catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text) RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN UPPER(BTRIM(COALESCE(p_category, ''))) IN ('MATTRESS', 'SOFA')
                THEN COALESCE(erp_sync_brand_code(NULLIF(BTRIM(p_model_branding), '')),
                              erp_sync_brand_code(NULLIF(BTRIM(p_sku_branding), '')))
           END $$;
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-11-07) ──
const PROD = {
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[])': 'eb9f0116074174ee38a3ea508f0e9582',
  'member_quote_cost_rules(uuid)': '2e7e32cdb544b400461cacc750934314',
  'revenue_month_orders(uuid,date)': '3cca3cc89e13641177d59dfb8718522e',
  'member_order_facts_with_old_bills(uuid,date,date)': 'a44fa5e5eb5934a60a8927a886ab69cf',
  'member_order_facts(uuid,date,date)': '987d328c0ec4087e4ce6f3e58346a382',
}
const BODIES = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, md5(replace(p.prosrc, E'\\r', '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const NAMES = ['catalogue_save_cost_setting', 'member_quote_cost_rules', 'revenue_month_orders', 'member_order_facts_with_old_bills', 'member_order_facts']
const production = (await readFile(new URL('./sku-ratios-by-brand-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of production.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
check(Object.fromEntries((await q(BODIES, [NAMES])).map(r => [r.sig, r.md5])), PROD, "production's five bodies")
// As production grants them (pg_proc.proacl, 2026-11-07).
await db.exec(`
  REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) TO authenticated, service_role;
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

// ── Fair's October: bills of each brand with a Trion bed frame on them, and one with none ──
await db.exec(`
  INSERT INTO public.users (id, name) VALUES ('${HR}', 'hr@');
  INSERT INTO public.hr_staff_costs (id, employee_name, employee_code) VALUES ('${LUCAS}', 'LUCAS', 'HC001');
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES
    ('${FS}', '${FAIR}', 0.3, 0.7), ('${OS}', '${OTHER_SUB}', 0.3, 0.7);
  INSERT INTO public.comm_brands (scheme_id, code, name, is_active) VALUES
    ('${FS}', 'AKEMI', 'Akemi', true), ('${FS}', 'DUNLOP', 'Dunlopillo', true), ('${FS}', 'ERGOTEX', 'Ergotex', true),
    ('${FS}', 'OLDBRAND', 'Old brand', false), ('${OS}', 'NOVA', 'Nova', true);
  INSERT INTO public.erp_feed_settings (sub_department_id, min_order_date) VALUES ('${FAIR}', '2026-09-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FS}', 'mattress', true), ('${FS}', 'accessory', true), ('${FS}', 'bedframe', true), ('${FS}', 'service', false);
  INSERT INTO public.erp_product_models (erp_id, category, branding) VALUES
    ('${M.RIDER_MATT}', 'MATTRESS', NULL), ('${M.PLAIN_MATT}', 'MATTRESS', NULL), ('${M.AKEMI_MATT}', 'MATTRESS', 'AKEMI'),
    ('${M.FRAME_MODEL}', 'BEDFRAME', NULL);
  INSERT INTO public.catalogue_models (erp_model_id, brand_code) VALUES ('${M.RIDER_MATT}', 'RIDER'), ('${M.PLAIN_MATT}', NULL);
  INSERT INTO public.erp_products (erp_id, item_code, category, branding, model_erp_id) VALUES
    ('P-TRION-K', 'TRION (K)', 'BEDFRAME', NULL, NULL),
    ('P-PILLOW', 'AK-PILLOW', 'ACCESSORY', NULL, NULL),
    ('P-AK-MATT', 'AK-MATT-K', 'MATTRESS', 'AKEMI', '${M.AKEMI_MATT}'),
    ('P-RIDER-MATT', 'TOPPER-K', 'MATTRESS', NULL, '${M.RIDER_MATT}'),
    ('P-PLAIN-MATT', 'PLAIN-MATT-K', 'MATTRESS', NULL, '${M.PLAIN_MATT}'),
    -- The ERP files it a mattress; its model is a bed frame — the model's category is the one read.
    ('P-FRAME-AS-MATT', 'DIVAN-K', 'MATTRESS', NULL, '${M.FRAME_MODEL}');
  -- The pillow has a ratio of its own (0.8); the bed frame has none — it divides by the sub-department's 0.7.
  INSERT INTO public.comm_cost_ratios (scheme_id, erp_product_id, product_code, ratio) VALUES ('${FS}', 'P-PILLOW', 'AK-PILLOW', 0.8);
  INSERT INTO public.sales_import_batches (id, sub_department_id, period_month, status) VALUES ('${BATCH}', '${FAIR}', '${OCT}', 'committed');
  INSERT INTO public.sales_orders (id, batch_id, order_no, order_date, event_date, period_month, brand_code, order_total, paid_amount, staff_id, sequence_in_day) VALUES
    ('${B.DUNLOP}', '${BATCH}', 'HC-SO-2610-501', '2026-10-03', '2026-10-03', '${OCT}', 'DUNLOP', 5000, 5000, '${LUCAS}', 1),
    ('${B.ERGOTEX}', '${BATCH}', 'HC-SO-2610-502', '2026-10-04', '2026-10-04', '${OCT}', 'ERGOTEX', 5000, 5000, '${LUCAS}', 1),
    ('${B.AKEMI}', '${BATCH}', 'HC-SO-2610-503', '2026-10-05', '2026-10-05', '${OCT}', 'AKEMI', 5500, 5500, '${LUCAS}', 1),
    ('${B.DERIVED}', '${BATCH}', 'HC-SO-2610-504', '2026-10-06', '2026-10-06', '${OCT}', NULL, 3500, 3500, '${LUCAS}', 1),
    ('${B.TIE}', '${BATCH}', 'HC-SO-2610-505', '2026-10-07', '2026-10-07', '${OCT}', '', 2500, 2500, '${LUCAS}', 1),
    ('${B.RIDERS_ONLY}', '${BATCH}', 'HC-SO-2610-506', '2026-10-08', '2026-10-08', '${OCT}', NULL, 1000, 1000, '${LUCAS}', 1),
    ('${B.SPACED}', '${BATCH}', 'HC-SO-2610-507', '2026-10-09', '2026-10-09', '${OCT}', ' dunlop ', 1000, 1000, '${LUCAS}', 1);
  INSERT INTO public.sales_order_lines (id, order_id, product_code, item_group, brand_code, line_amount, cost_amount) VALUES
    -- Dunlopillo's bill: the mattress 1,400 ÷ 0.7 = 2,000; the frame 600.
    (gen_random_uuid(), '${B.DUNLOP}', 'DL-MATT-K', 'mattress', 'DUNLOP', 4000, 1400),
    (gen_random_uuid(), '${B.DUNLOP}', 'TRION (K)', 'bedframe', NULL, 1000, 600),
    -- Ergotex's: the same frame, written in small letters.
    (gen_random_uuid(), '${B.ERGOTEX}', 'EG-MATT-K', 'mattress', 'ERGOTEX', 4000, 1400),
    (gen_random_uuid(), '${B.ERGOTEX}', 'trion (k) ', 'bedframe', NULL, 1000, 600),
    -- Akemi's: the frame and the pillow, which has its own 0.8.
    (gen_random_uuid(), '${B.AKEMI}', 'AK-MATT-K', 'mattress', 'AKEMI', 4000, 1400),
    (gen_random_uuid(), '${B.AKEMI}', 'TRION (K)', 'bedframe', NULL, 1000, 600),
    (gen_random_uuid(), '${B.AKEMI}', 'AK-PILLOW', 'accessory', 'AKEMI', 500, 80),
    -- No brand on the bill: Dunlopillo sells the most of it (3,000 to 500), so the pillow answers to Dunlopillo.
    (gen_random_uuid(), '${B.DERIVED}', 'DL-MATT-Q', 'mattress', 'DUNLOP', 3000, 1050),
    (gen_random_uuid(), '${B.DERIVED}', 'AK-PILLOW', 'accessory', 'AKEMI', 500, 80),
    -- A tie (1,000 each): the brand whose first line comes first — Dunlopillo's line is …0001.
    ('${id(9001)}', '${B.TIE}', 'DL-MATT-S', 'mattress', 'DUNLOP', 1000, 350),
    ('${id(9002)}', '${B.TIE}', 'AK-MATT-S', 'mattress', 'AKEMI', 1000, 350),
    ('${id(9003)}', '${B.TIE}', 'TRION (K)', 'bedframe', NULL, 500, 300),
    -- Riders alone, no brand anywhere: no brand's ladder, so no brand's ratio.
    (gen_random_uuid(), '${B.RIDERS_ONLY}', 'TRION (K)', 'bedframe', NULL, 1000, 600),
    -- The bill's brand as the ERP spaced and cased it.
    (gen_random_uuid(), '${B.SPACED}', 'TRION (K)', 'bedframe', NULL, 1000, 600),
    -- A service line is no part of any margin.
    (gen_random_uuid(), '${B.DUNLOP}', 'TRANSPORTATION CHARGES', 'service', NULL, 100, NULL);
`)

const month = async () => Object.fromEntries((await q(`SELECT order_no, margin_cost, margin_pct, margin_source FROM public.revenue_month_orders($1, $2)`,
  [FAIR, OCT])).map(r => [r.order_no, [r2(r.margin_cost), r6(r.margin_pct), r.margin_source]]))
const FACTS = `SELECT order_no, brand, round(margin_pct, 6)::text AS margin, revenue, goods_revenue FROM public.member_order_facts($1, $2, $3) ORDER BY order_no`
const facts = async () => Object.fromEntries((await q(FACTS, [FS, OCT, NOV])).map(r => [r.order_no, [r.brand, r.margin === null ? null : Number(r.margin)]]))
const rules = () => one(`SELECT public.member_quote_cost_rules($1)`, [FS])
const save = (brands, ratios = []) => one(`SELECT public.catalogue_save_cost_setting($1, NULL, $2::jsonb, '{}'::text[], $3::jsonb)`,
  [FS, JSON.stringify(ratios), JSON.stringify(brands)])
const brandRows = async () => (await q(`SELECT erp_product_id, product_code, brand_code, ratio::text, updated_by
  FROM public.comm_cost_ratio_brands ORDER BY erp_product_id, brand_code`)).map(r => [r.erp_product_id, r.product_code, r.brand_code, r.ratio, r.updated_by])

// ── Before: every line by its own ratio, else the sub-department's ──
const before = { month: await month(), facts: await facts(), rules: await rules() }
check(before.month['HC-SO-2610-501'], [2857.14, 0.428572, 'cost'], "before: Dunlopillo's bill — the frame 600 ÷ 0.7 (the % taken on the cost rounded)")
check(before.month['HC-SO-2610-503'], [2957.14, 0.462338, 'cost'], "before: Akemi's — the pillow 80 ÷ its own 0.8")
check(before.rules, { costDivisor: 0.7, costRatios: { 'AK-PILLOW': 0.8 } }, "before: the calculator's rules")

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const md5After = await q(BODIES, [NAMES])
const tableAfter = await q(`SELECT (SELECT count(*) FROM pg_policies WHERE tablename = 'comm_cost_ratio_brands')::int AS policies,
  (SELECT count(*) FROM public.permission_table_writes WHERE table_name = 'comm_cost_ratio_brands')::int AS writes,
  (SELECT count(*) FROM public.permission_table_reads WHERE table_name = 'comm_cost_ratio_brands')::int AS reads`)
await db.exec(migration)
check(await q(BODIES, [NAMES]), md5After, 'the second run changes no body')
check(await q(`SELECT (SELECT count(*) FROM pg_policies WHERE tablename = 'comm_cost_ratio_brands')::int AS policies,
  (SELECT count(*) FROM public.permission_table_writes WHERE table_name = 'comm_cost_ratio_brands')::int AS writes,
  (SELECT count(*) FROM public.permission_table_reads WHERE table_name = 'comm_cost_ratio_brands')::int AS reads`), tableAfter,
  'nor the table’s policies and permission rows')
check(Object.fromEntries(md5After.map(r => [r.sig, r.md5])), {
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[])': 'eb9f0116074174ee38a3ea508f0e9582',
  'catalogue_save_cost_setting(uuid,numeric,jsonb,text[],jsonb)': 'a97bf8e72a9944a5c3f62409735fa483',
  'member_quote_cost_rules(uuid)': '49c4eff9990a4bc0f48c550ecd5fda6e',
  'revenue_month_orders(uuid,date)': '33b6bd204e8345202879f058bde05933',
  'member_order_facts_with_old_bills(uuid,date,date)': '3bd13b6f3d7d2b9a8e87d97850d2df4c',
  'member_order_facts(uuid,date,date)': '987d328c0ec4087e4ce6f3e58346a382',
}, 'the bodies production runs after it: the 4-argument writer and member_order_facts untouched')

// ── The table and who may reach it ──
check(tableAfter, [{ policies: 3, writes: 3, reads: 1 }], 'its three policies (as comm_cost_ratios), its writes and its reads')
check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comm_cost_ratio_brands'::regclass`), true, 'row level security is on')
check(await q(`SELECT command, actions FROM public.permission_table_writes WHERE table_name = 'comm_cost_ratio_brands' ORDER BY command`), [
  { command: 'DELETE', actions: ['revenue.manage', 'product_list.edit'] },
  { command: 'INSERT', actions: ['revenue.manage', 'product_list.edit'] },
  { command: 'UPDATE', actions: ['revenue.manage', 'product_list.edit'] },
], 'written as comm_cost_ratios is')
check(await one(`SELECT actions FROM public.permission_table_reads WHERE table_name = 'comm_cost_ratio_brands'`),
  ['product_list.edit', 'product_list.view', 'revenue.edit', 'revenue.manage', 'revenue.view:own'], 'read as comm_cost_ratios is')
check(await q(`SELECT fn, table_name FROM public.guards ORDER BY fn`), [
  { fn: 'reads', table_name: 'comm_cost_ratio_brands' }, { fn: 'reads', table_name: 'comm_cost_ratio_brands' },
  { fn: 'writes', table_name: 'comm_cost_ratio_brands' }, { fn: 'writes', table_name: 'comm_cost_ratio_brands' },
], 'both guards put on it, on each run')
check(await q(`SELECT label, area, read_perms, mode, keys, labels FROM public.audit_tables WHERE table_name = 'comm_cost_ratio_brands'`), [
  { label: 'Costing ratios by brand', area: 'Catalogue', read_perms: ['product_list'], mode: 'all',
    keys: ['scheme_id', 'erp_product_id', 'brand_code'], labels: ['product_code', 'brand_code'] },
], 'its line in the audit')
check((await q(ACLS, [NAMES])).filter(r => r.sig !== 'catalogue_save_cost_setting(uuid,numeric,jsonb,text[],jsonb)'), aclsBefore,
  'every body it changed is granted as before: the calculator’s rules and the facts the service role’s alone')
check(await one(`SELECT has_function_privilege('authenticated', 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)', 'EXECUTE')`), true,
  'a sign-in may call the new Save (it asks Product List · Edit itself)')
check(await one(`SELECT has_function_privilege('anon', 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)', 'EXECUTE')`), false,
  'the publishable key may not')
check(await one(`SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
  WHERE p.oid = 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)'::regprocedure AND a.grantee = 0)`), false, 'nor PUBLIC')
check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = 'public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[], jsonb)'::regprocedure`), true,
  'the Save is SECURITY DEFINER')
check(await one(`SELECT has_function_privilege('authenticated', 'public.member_quote_cost_rules(uuid)', 'EXECUTE')`), false, 'no ratio reaches a browser')

// ── Nothing moves while no SKU has a ratio by brand ──
check(await month(), before.month, "Comm Cal's month as before")
check(await facts(), before.facts, "the Revenue app's facts as before")
check(await rules(), { ...before.rules, costRatioBrands: {} }, "the calculator's rules: the same, and no ratio by brand")

// ── The Save ──
await db.exec(`SET test.uid = '${HR}'`)
await db.exec(`SET test.may = 'no'`)
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], '[]'::jsonb)`, [FS], '42501',
  'without Product List · Edit the Save is refused')
await db.exec(`SET test.may = 'yes'`)
check(await save([
  { erp_product_id: 'P-TRION-K', brand_code: 'DUNLOP', ratio: 0.6 },
  { erp_product_id: 'P-TRION-K', brand_code: 'ERGOTEX', ratio: 0.5 },
  { erp_product_id: 'P-PILLOW', brand_code: 'DUNLOP', ratio: 0.5 },
]), 3, 'three ratios by brand written')
check(await brandRows(), [
  ['P-PILLOW', 'AK-PILLOW', 'DUNLOP', '0.5000', HR],
  ['P-TRION-K', 'TRION (K)', 'DUNLOP', '0.6000', HR],
  ['P-TRION-K', 'TRION (K)', 'ERGOTEX', '0.5000', HR],
], 'each with the code a sales line carries, read from the SKU Master, and who set it')
check(await save([{ erp_product_id: 'P-TRION-K', brand_code: 'DUNLOP', ratio: 0.6 }]), 0, 'the same ratio again touches nothing')

// ── Comm Cal's month: each bill's frame by the ratio of the brand it answers to ──
check(await month(), {
  ...before.month,
  'HC-SO-2610-501': [3000, 0.4, 'cost'],
  'HC-SO-2610-502': [3200, 0.36, 'cost'],
  'HC-SO-2610-504': [1660, 0.525714, 'cost'],
  'HC-SO-2610-505': [1500, 0.4, 'cost'],
  'HC-SO-2610-507': [1000, 0, 'cost'],
}, "the month: Dunlopillo's frame 600 ÷ 0.6 = 1,000 (2,000 + 1,000); Ergotex's ÷ 0.5 = 1,200, in small letters too; Akemi's has none set, so 0.7 — and its pillow its own 0.8; a bill with no brand answers to the one it sells the most of, so its pillow 80 ÷ Dunlopillo's 0.5 = 160; on a tie, the brand whose first line comes first (300 ÷ 0.6); riders alone answer to no brand (0.7); ' dunlop ' is Dunlopillo")
check(before.month['HC-SO-2610-506'], [857.14, 0.14286, 'cost'], 'riders alone: 600 ÷ 0.7, as before')

// ── The Revenue app's facts: the same lines, the same ratios ──
check(await facts(), {
  'HC-SO-2610-501': ['DUNLOP', 0.4],
  'HC-SO-2610-502': ['ERGOTEX', 0.36],
  'HC-SO-2610-503': ['AKEMI', before.facts['HC-SO-2610-503'][1]],
  'HC-SO-2610-504': ['UNCLASSIFIED', 0.525714],
  'HC-SO-2610-505': ['UNCLASSIFIED', 0.4],
  'HC-SO-2610-506': ['UNCLASSIFIED', before.facts['HC-SO-2610-506'][1]],
  'HC-SO-2610-507': ['dunlop', 0],
}, "Insight, the Arena and Today take each bill's margin as Comm Cal does")
check(before.facts['HC-SO-2610-503'], ['AKEMI', 0.462338], 'Akemi’s bill, unmoved: no ratio for Akemi, the pillow its own')

// ── The calculator's rules ──
check(await rules(), { costDivisor: 0.7, costRatios: { 'AK-PILLOW': 0.8 },
  costRatioBrands: { 'TRION (K)': { DUNLOP: 0.6, ERGOTEX: 0.5 }, 'AK-PILLOW': { DUNLOP: 0.5 } } },
  "the calculator's rules carry them, { code: { brand: ratio } }")

// ── What the Save refuses ──
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-TRION-K', brand_code: 'AKEMI', ratio: 0.7 }, { erp_product_id: 'P-TRION-K', brand_code: 'AKEMI', ratio: 0.6 }])],
  '22023', 'a SKU’s brand named twice')
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-NOWHERE', brand_code: 'AKEMI', ratio: 0.7 }])], '23503', 'a SKU not in the SKU Master')
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-TRION-K', brand_code: 'OLDBRAND', ratio: 0.7 }])], '22023', 'a brand no longer active')
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-TRION-K', brand_code: 'NOVA', ratio: 0.7 }])], '22023', 'another sub-department’s brand')
for (const ratio of [0, 10.5, -1]) {
  await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
    [FS, JSON.stringify([{ erp_product_id: 'P-TRION-K', brand_code: 'AKEMI', ratio }])], '22023', `a ratio of ${ratio}`)
}
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-AK-MATT', brand_code: 'DUNLOP', ratio: 0.6 }])], '22023', 'a mattress with a brand sells under it')
await refuses(`SELECT public.catalogue_save_cost_setting($1, NULL, '[]'::jsonb, '{}'::text[], $2::jsonb)`,
  [FS, JSON.stringify([{ erp_product_id: 'P-PLAIN-MATT', brand_code: 'DUNLOP', ratio: 0.6 }])], '22023', 'a brandless mattress Modular does not mark Rider')
check(await brandRows(), [
  ['P-PILLOW', 'AK-PILLOW', 'DUNLOP', '0.5000', HR],
  ['P-TRION-K', 'TRION (K)', 'DUNLOP', '0.6000', HR],
  ['P-TRION-K', 'TRION (K)', 'ERGOTEX', '0.5000', HR],
], 'a refused Save leaves every row as it was')

// ── What it takes: any rider ──
check(await save([
  { erp_product_id: 'P-RIDER-MATT', brand_code: 'AKEMI', ratio: 0.65 },
  { erp_product_id: 'P-FRAME-AS-MATT', brand_code: 'AKEMI', ratio: 0.65 },
]), 2, 'a brandless mattress marked Rider on Modular, and a SKU the ERP calls a mattress whose model is a bed frame')
check(await save([{ erp_product_id: 'P-AK-MATT', brand_code: 'DUNLOP', ratio: null }]), 0, 'taking a ratio off is never refused, even where none is')

// ── Changing one, taking one off, and the SKUs' own ratios in the same Save ──
check(await save([
  { erp_product_id: 'P-TRION-K', brand_code: 'DUNLOP', ratio: 0.55 },
  { erp_product_id: 'P-TRION-K', brand_code: 'ERGOTEX', ratio: null },
], [{ erp_product_id: 'P-TRION-K', ratio: 0.75 }]), 3, 'the frame’s Dunlopillo ratio changed, its Ergotex one taken off, its own ratio set')
check((await brandRows()).filter(r => r[0] === 'P-TRION-K'), [['P-TRION-K', 'TRION (K)', 'DUNLOP', '0.5500', HR]], 'only Dunlopillo’s is left')
check((await month())['HC-SO-2610-502'], [r2(1400 / 0.7 + 600 / 0.75), r6(1 - (1400 / 0.7 + 600 / 0.75) / 5000), 'cost'],
  "Ergotex's bill: the brand unset again follows the frame's own ratio (600 ÷ 0.75)")
check((await month())['HC-SO-2610-506'], [800, 0.2, 'cost'], 'riders alone: the frame’s own ratio, 600 ÷ 0.75')
check((await month())['HC-SO-2610-501'][0], r2(2000 + 600 / 0.55), "Dunlopillo's bill: 600 ÷ 0.55")

// ── A SKU the ERP renamed: the next Save follows it ──
await db.exec(`UPDATE public.erp_products SET item_code = 'TRION-K' WHERE erp_id = 'P-TRION-K'`)
check(await save([]), 0, 'a Save with nothing of the frame in it')
check((await brandRows()).filter(r => r[0] === 'P-TRION-K').map(r => r[1]), ['TRION-K'], 'still moves its ratios by brand to the code its new bills carry')

console.log(`OK SKU ratios by brand: ${checks} checks`)
