// Local PostgreSQL regression for 20261127140500 (2026-11-27 — Fair's margin ladder for Akemi and Ergotex, the month the
// penalty starts from, and a bill's commission ratio set by a Revenue Director) and 20261127140600 (Fair's penalty on from
// December). The user: "30% 到 33%（即 32.99% 这个区间），只能拿 75% 的 commission：27% 到 29.99%：50%、25% 到 26.99%：25%、
// 24.99% 以下：0%"; Dunlopillo and Zanotti keep their own ladder; "从十二月开始"; and of a bill's ⋯ in the Revenue app, a
// Revenue Director "可以选 ratio 自己填（25%、50%、75% 都可以调）… below margin 的 … 改成 [standard] … 不应该是属于 normal
// commission，他可以调成 50%" — the salesperson told.
//
// Production's facts arrive as validate-brand-cost-ratios.mjs leaves them (that test's harness, its production file and
// 20261114121700 — md5 b0840628…, production's on 2026-11-27); the two order books, notify_people and
// commission_order_period_locked are production's own (comm-ratio-production.sql, md5-checked). The migration then runs
// VERBATIM, twice. Checked: the ladder rows; a part's weight in the Revenue app's facts — the band from the month the
// penalty starts, a director's ratio in its place whatever the switch; the write's refusals in words, its row, its notices;
// the sheet's context; the books naming the ratio; the permission rows; the grants. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261127140500_fair_margin_ladder_comm_ratio.sql', import.meta.url)
const SWITCH_ON = new URL('../../supabase/migrations/20261127140600_fair_margin_penalty_from_december.sql', import.meta.url)
const BRAND_COST_RATIOS = new URL('../../supabase/migrations/20261114121700_brand_cost_ratios.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, code, what, words) => {
  let got = null
  try { await q(sql, params) } catch (e) { got = e }
  assert.ok(got, `${what}: was not refused`)
  check(got.code ?? String(got), code, what)
  if (words) check(String(got.message).includes(words), true, `${what} — says "${words}" (got "${got.message}")`)
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const n = v => (v === null || v === undefined ? null : Number(v))

const FAIR = id(1), FS = id(2), BATCH = id(3), OTHER_SUB = id(4), OS = id(5), NOV_BATCH = id(6)
const LUCAS = id(11), ANTHONY = id(13), KRIS = id(14)
const LUCAS_USER = id(31), ANTHONY_USER = id(33), KRIS_USER = id(34), PRINCIPAL_USER = id(35)
const DIRECTOR_TITLE = id(51), RS_TITLE = id(52)
const T = { RD: id(61), ULTIMATE: id(62), STAFF: id(63) }
const NOV = '2026-11-01', DEC = '2026-12-01'

// ── validate-brand-cost-ratios.mjs's stand-ins, production's facts as it found them, and 20261114121700 ──
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

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
  CREATE TABLE public.test_gwp(line_id uuid PRIMARY KEY, free_qty numeric);

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
  CREATE FUNCTION public.catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text) RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN UPPER(BTRIM(COALESCE(p_category, ''))) IN ('MATTRESS', 'SOFA')
                THEN COALESCE(erp_sync_brand_code(NULLIF(BTRIM(p_model_branding), '')),
                              erp_sync_brand_code(NULLIF(BTRIM(p_sku_branding), '')))
           END $$;
`)
const brandCostRatios = (await readFile(new URL('./brand-cost-ratios-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of brandCostRatios.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
await db.exec((await readFile(BRAND_COST_RATIOS, 'utf8')).replace(/\r\n/g, '\n'))

// ── What 20261127140500's own work reads besides ──
await db.exec(`
  ALTER TABLE public.users ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  ALTER TABLE public.hr_staff_costs ADD COLUMN user_id uuid, ADD COLUMN status text NOT NULL DEFAULT 'active';
  ALTER TABLE public.comm_margin_bands ADD COLUMN band_key text, ADD COLUMN label text,
    ADD COLUMN monthly_incentive numeric NOT NULL DEFAULT 0, ADD CONSTRAINT uq_comm_margin_band UNIQUE (brand_id, band_key);
  ALTER TABLE public.sales_orders ADD COLUMN fair_event_id uuid, ADD COLUMN fair_source text, ADD COLUMN raw jsonb,
    ADD COLUMN bill_ref text;
  ALTER TABLE public.sales_order_lines ADD COLUMN product_name text, ADD COLUMN line_no integer;
  ALTER TABLE public.comm_venue_events ADD COLUMN id uuid, ADD COLUMN end_date date, ADD COLUMN erp_organiser_text text;
  ALTER TABLE public.comm_runs ADD COLUMN scheme_id uuid;
  ALTER TABLE public.comm_order_releases ADD COLUMN run_id uuid, ADD COLUMN order_period_month date;
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text, code text);
  CREATE TABLE public.app_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, kind text, title text,
    body text, ref_kind text, ref_id text, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['not_mine_request'::text, 'share_request'::text])));
  CREATE TABLE public.permission_functions(key text PRIMARY KEY, label text, section text, actions text[], scopes text[],
    description text, sort_order integer);
  CREATE TABLE public.permission_defs(key text PRIMARY KEY, label text, section text, scope text, description text, sort_order integer);
  CREATE TABLE public.permission_cell_keys(function_key text, action text, legacy_key text, min_scope text, gate text,
    PRIMARY KEY (function_key, action, legacy_key));
  CREATE TABLE public.permission_key_actions(legacy_key text, function_key text, action text, PRIMARY KEY (legacy_key, function_key, action));
  CREATE TABLE public.role_default_permissions(role text, permission_key text, PRIMARY KEY (role, permission_key));
  CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, key text UNIQUE, version integer NOT NULL DEFAULT 1, updated_at timestamptz);
  CREATE TABLE public.permission_template_grants(template_id uuid, function_key text, action text, scope text,
    PRIMARY KEY (template_id, function_key, action));
  CREATE TABLE public.permission_template_tabs(template_id uuid, tab_id text, action text, PRIMARY KEY (template_id, tab_id, action));
  CREATE TABLE public.permission_tab_cells(tab_id text, action text, cell text, PRIMARY KEY (tab_id, action, cell));

  -- The permission helper, as narrow as a check needs: everything unless 'test.may' says no, but the actions 'test.deny' names.
  CREATE OR REPLACE FUNCTION public.has_any_action(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('test.may', true), 'yes') = 'yes'
       AND EXISTS (SELECT 1 FROM unnest(p) a WHERE a <> ALL (string_to_array(coalesce(current_setting('test.deny', true), ''), ',')))
  $$;
  -- The sub-departments the caller reaches on Comm Cal: every one, unless 'test.reach' names none ('none') or one.
  CREATE FUNCTION public.my_sub_departments(p_area text) RETURNS uuid[] LANGUAGE sql STABLE AS $$
    SELECT CASE coalesce(nullif(current_setting('test.reach', true), ''), 'all')
      WHEN 'all' THEN ARRAY(SELECT id FROM public.comm_sub_departments)
      WHEN 'none' THEN '{}'::uuid[]
      ELSE ARRAY[current_setting('test.reach', true)::uuid] END
  $$;
  -- current_permissions(): production's member-app list, the one statement the migration swaps.
  CREATE FUNCTION public.current_permissions() RETURNS text[] LANGUAGE plpgsql STABLE AS $$
  BEGIN
    RETURN ARRAY(SELECT key FROM (VALUES ('member_portal'), ('comm_ratio'), ('treasury')) v(key)
      WHERE key = 'treasury' OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests','rev_training']));
  END
  $$;
  -- What the two books read besides the facts.
  CREATE FUNCTION public.member_insight_window(p_from text, p_until text) RETURNS daterange LANGUAGE sql IMMUTABLE AS $$
    SELECT daterange(to_date(p_from || '-01', 'YYYY-MM-DD'), (to_date(p_until || '-01', 'YYYY-MM-DD') + interval '1 month')::date)
  $$;
  CREATE FUNCTION public.member_principal_department_scheme(p_sub uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT id FROM public.comm_schemes WHERE sub_department_id = p_sub AND is_active LIMIT 1
  $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub uuid, p_staff uuid) RETURNS TABLE(week date, brand text) LANGUAGE sql STABLE AS
    $$ SELECT NULL::date, NULL::text WHERE false $$;
`)

// ── Production's own: the two books, notify_people, the run lock ──
const PROD = {
  'member_order_book_for_staff(uuid,uuid,date,date)': 'aecfce0eb43330edbfe21719b67bf982',
  'member_principal_department_order_book(uuid,text,text)': '61a66ec7ccf065ace8e56aa84c309d35',
  'member_order_facts_with_old_bills(uuid,date,date)': 'b0840628de75ec6383fcaf06911e2247',
  'notify_people(uuid[],text,text,text,text,text)': '50259847648f421acbe03abd41dd0d95',
  'commission_order_period_locked(uuid,date)': '1cc2abf204556e6e500458bc2ed65e1c',
}
const BODIES = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, md5(replace(p.prosrc, E'\\r', '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const NAMES = ['member_order_book_for_staff', 'member_principal_department_order_book', 'member_order_facts_with_old_bills', 'notify_people', 'commission_order_period_locked']
const production = (await readFile(new URL('./comm-ratio-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
for (const block of production.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
check(Object.fromEntries((await q(BODIES, [NAMES])).map(r => [r.sig, r.md5])), PROD, "production's bodies, as the migration was written from")
await db.exec(`
  REVOKE ALL ON FUNCTION public.member_order_book_for_staff(uuid, uuid, date, date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.member_order_book_for_staff(uuid, uuid, date, date) TO service_role;
  REVOKE ALL ON FUNCTION public.member_principal_department_order_book(uuid, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.member_principal_department_order_book(uuid, text, text) TO authenticated, service_role;
`)

// ── Fair, its ladders as production holds them, and November's bills ──
// A bill's Revenue-team margin = 1 − (cost ÷ 0.7) ÷ price: at RM 10,000 a cost of 0.7 × (1 − m) × 10,000 reads m exactly.
const costFor = m => Math.round(0.7 * (1 - m) * 10000 * 100) / 100
const BILLS = {
  // order no      id        brand      margin  who
  'HC-SO-2611-701': [id(701), 'AKEMI', 0.31, LUCAS],     // new ladder: Tier 1 × 0.75 — old: nothing
  'HC-SO-2611-702': [id(702), 'AKEMI', 0.28, LUCAS],     // Tier 2 × 0.5 — old: nothing
  'HC-SO-2611-703': [id(703), 'AKEMI', 0.26, LUCAS],     // Tier 3 × 0.25 — old: × 0.5
  'HC-SO-2611-704': [id(704), 'AKEMI', 0.245, LUCAS],    // Tier 4 × 0 — old: × 0.25
  'HC-SO-2611-705': [id(705), 'AKEMI', 0.33, LUCAS],     // Standard: nothing
  'HC-SO-2611-706': [id(706), 'AKEMI', 0.30, LUCAS],     // 30.00% is Tier 1's
  'HC-SO-2611-707': [id(707), 'ZANOTTI', 0.26, LUCAS],   // Zanotti keeps its own: × 0.5
  'HC-SO-2611-708': [id(708), 'ERGOTEX', 0.2999, LUCAS], // 29.99% is Tier 2's
  'HC-SO-2611-709': [id(709), 'AKEMI', 0.40, ANTHONY],   // ANTHONY's, shared half with LUCAS
  'HC-SO-2611-710': [id(710), 'AKEMI', 0.40, KRIS],      // a Revenue Director's own bill
  'HC-SO-2611-711': [id(711), 'AKEMI', 0.40, LUCAS],     // cancelled
}
const B = Object.fromEntries(Object.entries(BILLS).map(([no, [bill]]) => [no.slice(-3), bill]))
await db.exec(`
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES
    ('${FS}', '${FAIR}', 0.3, 0.7), ('${OS}', '${OTHER_SUB}', 0.3, 0.7);
  INSERT INTO public.comm_brands (scheme_id, code, name, is_active, own_scheme) VALUES
    ('${FS}', 'AKEMI', 'Akemi', true, false), ('${FS}', 'DUNLOP', 'Dunlopillo', true, false),
    ('${FS}', 'ERGOTEX', 'Ergotex', true, false), ('${FS}', 'ZANOTTI', 'Zanotti', true, false),
    ('${FS}', '2990S', '2990s', true, true), ('${OS}', 'NOVA', 'Nova', true, false);
  INSERT INTO public.erp_feed_settings (sub_department_id, min_order_date) VALUES ('${FAIR}', '2026-08-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FS}', 'mattress', true), ('${FS}', 'accessory', true), ('${FS}', 'service', false);
  INSERT INTO public.hr_staff_costs (id, employee_name, employee_code) VALUES ('${LUCAS}', 'LUCAS', 'HC001');
  INSERT INTO public.comm_sub_departments (id, name, code) VALUES ('${FAIR}', 'Fair', 'FAIR'), ('${OTHER_SUB}', 'IR', NULL);
  INSERT INTO public.titles (id, is_department_head) VALUES ('${DIRECTOR_TITLE}', true), ('${RS_TITLE}', false);
  INSERT INTO public.users (id, name) VALUES ('${LUCAS_USER}', 'lucas@'), ('${ANTHONY_USER}', 'anthony@'),
    ('${KRIS_USER}', 'kris@'), ('${PRINCIPAL_USER}', 'Principal');
  INSERT INTO public.hr_staff_costs (id, employee_name, employee_code, title_id, user_id) VALUES
    ('${ANTHONY}', 'ANTHONY', 'HC002', '${RS_TITLE}', '${ANTHONY_USER}'),
    ('${KRIS}', 'KRIS', 'HC900', '${DIRECTOR_TITLE}', '${KRIS_USER}');
  UPDATE public.hr_staff_costs SET user_id = '${LUCAS_USER}', title_id = '${RS_TITLE}' WHERE id = '${LUCAS}';
  INSERT INTO public.sales_import_batches (id, sub_department_id, period_month, status) VALUES ('${NOV_BATCH}', '${FAIR}', '${NOV}', 'committed');
  INSERT INTO public.permission_templates (id, key) VALUES ('${T.RD}', 'revenue_director'), ('${T.ULTIMATE}', 'ultimate'), ('${T.STAFF}', 'staff_basic');
  -- Ultimate full access stores its ticks; the Revenue Director template does not yet.
  INSERT INTO public.permission_template_tabs (template_id, tab_id, action) VALUES ('${T.ULTIMATE}', 'rev.insight', 'view');
`)
for (const [code, rows] of [['AKEMI', 'AE'], ['ERGOTEX', 'AE'], ['DUNLOP', 'DZ'], ['ZANOTTI', 'DZ']]) {
  const upper = rows === 'AE'
    ? [['incentive_tier_2', 'Incentive Tier 2', 'incentive', 0.43, 1, 1500, 10], ['incentive_tier_1', 'Incentive Tier 1', 'incentive', 0.36, 1, 1000, 20],
       ['standard', 'Standard margin', 'reference', 0.33, 1, 0, 30], ['low', 'Low margin', 'reference', 0.30, 1, 0, 40]]
    : [['incentive_tier_2', 'Incentive Tier 2', 'incentive', 0.36, 1, 1500, 10], ['incentive_tier_1', 'Incentive Tier 1', 'incentive', 0.33, 1, 1000, 20],
       ['low', 'Standard Margin', 'reference', 0.30, 1, 0, 40]]
  const lower = [['below_tier_1', 'Below margin Tier 1', 'penalty', 0.27, 0.5, 0, 50], ['below_tier_2', 'Below margin Tier 2', 'penalty', 0.25, 0.25, 0, 60],
    ['below_tier_3', 'Below margin Tier 3', 'penalty', 0.24, 0, 0, 70]]
  for (const [key, label, kind, pct, mult, amount, sort] of [...upper, ...lower]) {
    await q(`INSERT INTO public.comm_margin_bands (scheme_id, brand_id, band_key, label, kind, margin_pct, commission_multiplier,
               monthly_incentive, sort_order) SELECT $1, b.id, $2, $3, $4, $5, $6, $7, $8 FROM public.comm_brands b
              WHERE b.scheme_id = $1 AND b.code = $9`, [FS, key, label, kind, pct, mult, amount, sort, code])
  }
}
let day = 2
for (const [orderNo, [bill, brand, margin, staff]] of Object.entries(BILLS)) {
  await q(`INSERT INTO public.sales_orders (id, batch_id, order_no, order_date, event_date, period_month, brand_code, order_total,
             paid_amount, staff_id, customer_name, cancelled) VALUES ($1, $2, $3, $4, $4, $5, $6, 10000, 10000, $7, 'Walk-in', $8)`,
    [bill, NOV_BATCH, orderNo, `2026-11-${String(day++).padStart(2, '0')}`, NOV, brand, staff, orderNo === 'HC-SO-2611-711'])
  await q(`INSERT INTO public.sales_order_lines (order_id, product_code, product_name, item_group, brand_code, qty, line_amount, cost_amount, line_no)
           VALUES ($1, $2, $2, 'mattress', $3, 1, 10000, $4, 1)`, [bill, `${brand}-MATT-K`, brand, costFor(margin)])
}
await q(`INSERT INTO public.sales_order_shares (order_id, staff_id, share_pct) VALUES ($1, $2, 0.5)`, [B['709'], LUCAS])

// ── Read back: each November part's weight, the bands, the permission rows ──
const weights = async () => Object.fromEntries((await q(`SELECT order_no, staff_id, weight, revenue, margin_pct
    FROM public.member_order_facts_with_old_bills($1, $2, $3) WHERE recognition_month = $2 ORDER BY order_no, staff_id`, [FS, NOV, DEC]))
  .map(r => [`${r.order_no.slice(-3)}${r.staff_id === LUCAS ? '' : r.staff_id === ANTHONY ? ':A' : ':K'}`, n(r.weight)]))
const bands = async code => (await q(`SELECT b.band_key, b.label, b.kind, b.margin_pct::float8 AS pct, b.commission_multiplier::float8 AS mult
    FROM public.comm_margin_bands b JOIN public.comm_brands br ON br.id = b.brand_id WHERE br.scheme_id = $1 AND br.code = $2
   ORDER BY b.margin_pct DESC, b.band_key`, [FS, code])).map(r => [r.band_key, r.label, r.kind, r.pct, r.mult])
const setScheme = (on, from) => q(`UPDATE public.comm_schemes SET enable_margin_penalty = $2, margin_penalty_from = $3 WHERE id = $1`, [FS, on, from])
const as = async (user, settings = {}) => {
  await db.exec(`SELECT set_config('test.uid', '${user ?? ''}', false), set_config('test.may', '${settings.may ?? 'yes'}', false),
    set_config('test.deny', '${settings.deny ?? ''}', false), set_config('test.reach', '${settings.reach ?? 'all'}', false)`)
}
const ALL_ONE = Object.fromEntries(['701', '702', '703', '704', '705', '706', '707', '708', '709', '709:A', '710:K'].map(k => [k, 1]))

check(await weights(), ALL_ONE, 'before: the penalty is off — every part counts whole')
const dunlopBefore = await bands('DUNLOP'), zanottiBefore = await bands('ZANOTTI')

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const PERMISSION_ROWS = `SELECT (SELECT count(*) FROM public.permission_functions)::int AS functions,
  (SELECT count(*) FROM public.permission_defs)::int AS defs, (SELECT count(*) FROM public.permission_cell_keys)::int AS cells,
  (SELECT count(*) FROM public.permission_key_actions)::int AS key_actions, (SELECT count(*) FROM public.role_default_permissions)::int AS roles,
  (SELECT count(*) FROM public.permission_template_grants)::int AS grants, (SELECT count(*) FROM public.permission_template_tabs)::int AS tabs,
  (SELECT count(*) FROM public.permission_tab_cells)::int AS tab_cells, (SELECT count(*) FROM public.comm_margin_bands)::int AS bands,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'sales_order_comm_ratios')::int AS policies,
  (SELECT version FROM public.permission_templates WHERE key = 'revenue_director') AS rd_version`
const after = { bodies: await q(BODIES, [[...NAMES, 'current_permissions', 'member_comm_ratio_set', 'member_comm_ratio_context', 'comm_ratio_refusal']]), rows: await q(PERMISSION_ROWS) }
await db.exec(migration)
const again = { bodies: await q(BODIES, [[...NAMES, 'current_permissions', 'member_comm_ratio_set', 'member_comm_ratio_context', 'comm_ratio_refusal']]), rows: await q(PERMISSION_ROWS) }
check(again.bodies, after.bodies, 'the second run changes no body')
check({ ...again.rows[0], rd_version: null }, { ...after.rows[0], rd_version: null }, 'nor a row it adds')
check(after.bodies.find(r => r.sig === 'commission_order_period_locked(uuid,date)').md5, PROD['commission_order_period_locked(uuid,date)'], 'the run lock is not touched')

// ── 1. The ladder ──
const AE_AFTER = [
  ['incentive_tier_2', 'Incentive Tier 2', 'incentive', 0.43, 1], ['incentive_tier_1', 'Incentive Tier 1', 'incentive', 0.36, 1],
  ['standard', 'Standard margin', 'reference', 0.33, 1],
  ['below_tier_1', 'Below margin Tier 1', 'penalty', 0.3299, 0.75], ['below_tier_2', 'Below margin Tier 2', 'penalty', 0.2999, 0.5],
  ['below_tier_3', 'Below margin Tier 3', 'penalty', 0.2699, 0.25], ['below_tier_4', 'Below margin Tier 4', 'penalty', 0.2499, 0],
]
check(await bands('AKEMI'), AE_AFTER, "Akemi: the user's ladder — Standard 33%, then 75 / 50 / 25 / 0 below it, no Low margin row")
check(await bands('ERGOTEX'), AE_AFTER, 'Ergotex: the same ladder')
check(await bands('DUNLOP'), dunlopBefore, 'Dunlopillo keeps its own')
check(await bands('ZANOTTI'), zanottiBefore, 'Zanotti keeps its own')
check(await one(`SELECT enable_margin_penalty FROM public.comm_schemes WHERE id = $1`, [FS]), false, 'the switch stays as it was (20261127140600 turns it on)')
await refuses(`UPDATE public.comm_schemes SET margin_penalty_from = '2026-12-15' WHERE id = $1`, [FS], '23514', 'the month the penalty starts is a 1st')

// ── 2. The Revenue app's facts: the band from the month the penalty starts; the director's ratio in its place ──
check(await weights(), ALL_ONE, 'after, the switch still off: nothing cut')
await setScheme(true, null)
check(await weights(), { ...ALL_ONE, '701': 0.75, '702': 0.5, '703': 0.25, '704': 0, '706': 0.75, '707': 0.5, '708': 0.5 },
  "on for every month: Akemi's and Ergotex's new ladder (30.00% and 29.99% at their tiers), Zanotti's own; the director's bill whole")
await setScheme(true, DEC)
check(await weights(), ALL_ONE, 'on from December: November’s bills are paid whole')
await setScheme(true, NOV)
check((await weights())['703'], 0.25, 'on from November: November’s are cut')
const facts703 = await q(`SELECT revenue, weight FROM public.member_order_facts_with_old_bills($1, $2, $3) WHERE order_no = 'HC-SO-2611-703'`, [FS, NOV, DEC])
check([n(facts703[0].revenue), n(facts703[0].weight)], [2500, 0.25], 'a part counts its sales at its cut: RM 10,000 × 0.25')

// ── 3. The write ──
const set = (bill, ratio, note = null) => q(`SELECT public.member_comm_ratio_set($1, $2, $3) AS r`, [bill, ratio, note]).then(r => r[0].r)
const notices = () => q(`SELECT user_id, kind, title, body, ref_kind, ref_id FROM public.app_notifications ORDER BY created_at, title`)

await as(null)
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['704']], '42501', 'nobody signed in', 'not open to your account')
await as(KRIS_USER, { deny: 'comm_ratio.edit' })
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['704']], '42501', 'without Commission ratio · Edit', 'not open to your account')
await as(KRIS_USER, { reach: OTHER_SUB })
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['704']], '42501', 'a sub-department out of reach', 'do not look after')
await as(KRIS_USER)
await refuses(`SELECT public.member_comm_ratio_set($1, 0.5, NULL)`, [B['710']], '42501', 'a director on their own bill', 'your own bill')
await as(PRINCIPAL_USER)
await refuses(`SELECT public.member_comm_ratio_set($1, 0.5, NULL)`, [B['710']], '42501', "anybody on a Revenue Director's own bill", 'own bills are never cut')
await as(LUCAS_USER)
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['704']], '42501', 'one’s own bill', 'your own bill')
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['709']], '42501', 'a bill one holds a share of', 'your own bill')
await as(KRIS_USER)
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['711']], '42501', 'a bill that does not count', 'does not count')
await refuses(`SELECT public.member_comm_ratio_set($1, 1.2, NULL)`, [B['704']], '22023', 'a ratio over 100%', '0% to 100%')
await refuses(`SELECT public.member_comm_ratio_set($1, -0.1, NULL)`, [B['704']], '22023', 'a ratio under 0%', '0% to 100%')
await refuses(`SELECT public.member_comm_ratio_set($1, 0.5, $2)`, [B['704'], 'x'.repeat(501)], '22023', 'why past 500 characters', '500 characters')
check(await notices(), [], 'a refusal tells nobody')

// Below margin, raised to the standard: paid in full, counted in full — whatever its band says.
check(await set(B['704'], 1, 'Repeat customer, approved'), { orderId: B['704'], orderNo: 'HC-SO-2611-704', ratio: 1, changed: true }, 'KRIS raises 24.5% to 100%')
check((await weights())['704'], 1, 'its part counts whole again')
check(await q(`SELECT ratio::float8 AS ratio, note, set_by, set_by_name FROM public.sales_order_comm_ratios WHERE order_id = $1`, [B['704']]),
  [{ ratio: 1, note: 'Repeat customer, approved', set_by: KRIS_USER, set_by_name: 'KRIS' }], 'the row: the ratio, why, who')
check(await notices(), [{ user_id: LUCAS_USER, kind: 'share', title: "KRIS set HC-SO-2611-704's commission to 100%",
  body: 'Its sales count 100% too. Why: Repeat customer, approved', ref_kind: 'comm_ratio', ref_id: B['704'] }], 'LUCAS is told, with why')
check(await set(B['704'], 1, 'Repeat customer, approved'), { orderId: B['704'], orderNo: 'HC-SO-2611-704', ratio: 1, changed: false }, 'saying it again changes nothing')
check((await notices()).length, 1, '— and tells nobody again')

// A normal bill cut to half — whatever the switch says.
check((await set(B['705'], 0.5)).changed, true, 'KRIS cuts a Standard bill to 50%')
await setScheme(false, null)
check((await weights())['705'], 0.5, 'its part counts half with the switch off too')
check((await weights())['704'], 1, 'and 704 whole')
await setScheme(true, NOV)
check(await set(B['705'], 0.333333), { orderId: B['705'], orderNo: 'HC-SO-2611-705', ratio: 0.3333, changed: true }, 'any other % — kept to four decimals')
check((await notices()).at(-1).title, "KRIS set HC-SO-2611-705's commission to 33.33%", 'said as a percentage')

// A shared bill: both holders told, both parts at the ratio.
await set(B['709'], 0.75)
check(Object.fromEntries(Object.entries(await weights()).filter(([k]) => k.startsWith('709'))), { '709': 0.75, '709:A': 0.75 }, 'every part of a shared bill at the ratio')
check((await notices()).filter(x => x.ref_id === B['709']).map(x => x.user_id).sort(), [ANTHONY_USER, LUCAS_USER].sort(), 'both holders told')

// Taken off: the margin decides again.
check((await set(B['704'], null)).changed, true, 'taken off')
check((await weights())['704'], 0, 'its band cuts it again (Tier 4 × 0)')
check((await notices()).at(-1), { user_id: LUCAS_USER, kind: 'share', title: 'KRIS took the commission ratio off HC-SO-2611-704',
  body: 'Its margin decides its commission again.', ref_kind: 'comm_ratio', ref_id: B['704'] }, 'told it is off')
check((await set(B['704'], null)).changed, false, 'taking off what is not there changes nothing')

// The Principal's shared login: no staff record — named by the login, never its own bill.
await as(PRINCIPAL_USER)
check((await set(B['703'], 1)).changed, true, 'the Principal sets one')
check(await one(`SELECT set_by_name FROM public.sales_order_comm_ratios WHERE order_id = $1`, [B['703']]), 'Principal', 'named by the login')

// ── 4. What a paid month and a close gave stand ──
await as(KRIS_USER)
await q(`INSERT INTO public.sales_import_batches (id, sub_department_id, period_month, status) VALUES ($1, $2, '2026-10-01', 'committed')`, [id(7), FAIR])
await q(`INSERT INTO public.sales_orders (id, batch_id, order_no, order_date, event_date, period_month, brand_code, order_total, paid_amount, staff_id)
         VALUES ($1, $2, 'HC-SO-2610-799', '2026-10-05', '2026-10-05', '2026-10-01', 'AKEMI', 1000, 1000, $3)`, [id(799), id(7), LUCAS])
await q(`INSERT INTO public.comm_runs (sub_department_id, period_month, status, scheme_id) VALUES ($1, '2026-10-01', 'applied', $2)`, [FAIR, FS])
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [id(799)], '42501', 'a month whose run has paid', 'The run for October 2026 has paid')
await as(null)
await refuses(`INSERT INTO public.sales_order_comm_ratios (order_id, ratio) VALUES ($1, 1)`, [id(799)], '23RUN', '— and straight to the table (23RUN)')
await q(`INSERT INTO public.comm_salesperson_closes (staff_id, sub_department_id, period_month, order_ids) VALUES ($1, $2, $3, ARRAY[$4::uuid])`, [LUCAS, FAIR, NOV, B['702']])
await as(KRIS_USER)
await refuses(`SELECT public.member_comm_ratio_set($1, 1, NULL)`, [B['702']], '42501', 'a bill a standing close gave', "LUCAS's November 2026 is closed")
await as(null)
await refuses(`INSERT INTO public.sales_order_comm_ratios (order_id, ratio) VALUES ($1, 1)`, [B['702']], '23CLS', '— and straight to the table (23CLS)')
await q(`UPDATE public.comm_salesperson_closes SET reopened_at = now()`)

// ── 5. The sheet's context ──
await as(KRIS_USER)
const context = async bill => one(`SELECT public.member_comm_ratio_context($1)`, [bill])
check(await context(B['701']), { orderId: B['701'], orderNo: 'HC-SO-2611-701', month: '2026-11', margin: 31,
  ladder: { label: 'Below margin Tier 1', multiplier: 0.75 }, ratio: null, refusal: null }, '701: 31% margin, Tier 1 × 0.75, nothing set')
const c709 = await context(B['709'])
check([c709.ratio.pct, c709.ratio.by, typeof c709.ratio.at, c709.ratio.note, c709.refusal], [0.75, 'KRIS', 'string', null, null], '709: the ratio set, who, when')
await setScheme(true, DEC)
check((await context(B['701'])).ladder, { label: null, multiplier: 1 }, 'before December the ladder alone cuts nothing')
await setScheme(true, NOV)
check((await context(B['710'])).refusal, 'You cannot adjust the commission of your own bill.', "KRIS's own bill, to KRIS: why not, in words")
await as(PRINCIPAL_USER)
check((await context(B['710'])).refusal, "HC-SO-2611-710 is KRIS's own bill — a Revenue Director's own bills are never cut.", "— and to anybody else")
await as(KRIS_USER, { deny: 'comm_ratio.view,comm_ratio.edit' })
await refuses(`SELECT public.member_comm_ratio_context($1)`, [B['701']], '42501', 'the context needs the cell too')
await as(KRIS_USER, { reach: 'none' })
await refuses(`SELECT public.member_comm_ratio_context($1)`, [B['701']], '22023', 'a bill out of reach is not there')

// ── 6. The books name the ratio ──
await as(null)
const book = await one(`SELECT public.member_order_book_for_staff($1, $2, $3, $4)`, [LUCAS, FS, NOV, DEC])
const byNo = Object.fromEntries(book.orders.map(o => [o.number.slice(-3), o]))
check([byNo['705'].ratio.pct, byNo['705'].ratio.by, byNo['705'].weight], [0.3333, 'KRIS', 0.3333], "LUCAS's book: 705's ratio and its weight")
check([byNo['703'].ratio.pct, byNo['703'].ratio.by, byNo['703'].weight], [1, 'Principal', undefined], '703 raised to 100%: a ratio, no weight')
check([byNo['701'].ratio, byNo['701'].weight], [undefined, 0.75], '701: no ratio, its band')
const whole = await one(`SELECT public.member_principal_department_order_book($1, '2026-11', '2026-11')`, [FAIR])
const wholeNo = Object.fromEntries(whole.orders.map(o => [o.number.slice(-3), o]))
check([wholeNo['709'].ratio.pct, wholeNo['709'].weight, wholeNo['702'].ratio], [0.75, 0.75, undefined], "the whole sub-department's book: the shared bill once, at its ratio")

// ── 7. The registry, the notice, the grants ──
check(await q(`SELECT key, label, section, actions, scopes FROM public.permission_functions`),
  [{ key: 'comm_ratio', label: 'Commission ratio', section: 'People', actions: ['view', 'edit'], scopes: ['all'] }], 'the function')
check(await q(`SELECT legacy_key, function_key, action FROM public.permission_key_actions ORDER BY action`),
  [{ legacy_key: 'comm_ratio', function_key: 'comm_ratio', action: 'edit' }, { legacy_key: 'comm_ratio', function_key: 'comm_ratio', action: 'view' }], 'its key opens both')
check(await q(`SELECT role, permission_key FROM public.role_default_permissions`), [{ role: 'principal', permission_key: 'comm_ratio' }], 'the Principal login holds it')
check(await q(`SELECT t.key, g.action, g.scope FROM public.permission_template_grants g JOIN public.permission_templates t ON t.id = g.template_id ORDER BY 1, 2`),
  [{ key: 'revenue_director', action: 'edit', scope: 'all' }, { key: 'revenue_director', action: 'view', scope: 'all' },
   { key: 'ultimate', action: 'edit', scope: 'all' }, { key: 'ultimate', action: 'view', scope: 'all' }], 'the Revenue Director and Ultimate full access templates')
check(await q(`SELECT t.key, x.tab_id, x.action FROM public.permission_template_tabs x JOIN public.permission_templates t ON t.id = x.template_id
                WHERE x.tab_id = 'rev.comm_ratio' ORDER BY 1, 3`),
  [{ key: 'ultimate', tab_id: 'rev.comm_ratio', action: 'edit' }, { key: 'ultimate', tab_id: 'rev.comm_ratio', action: 'view' }],
  'a template storing its ticks gets the box ticked; one that does not, none')
check(await q(`SELECT tab_id, action, cell FROM public.permission_tab_cells ORDER BY action`),
  [{ tab_id: 'rev.comm_ratio', action: 'edit', cell: 'comm_ratio.edit' }, { tab_id: 'rev.comm_ratio', action: 'view', cell: 'comm_ratio.view' }], 'the box’s cells')
check(await one(`SELECT array_to_string(public.current_permissions(), ',')`), 'member_portal,comm_ratio,treasury', 'a Revenue app account may hold the key')
check(await one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'app_notifications_ref_kind_check'`),
  "CHECK ((ref_kind = ANY (ARRAY['comm_ratio'::text, 'not_mine_request'::text, 'share_request'::text])))", 'the notice’s ref kind, the old ones kept')
check(await q(`SELECT table_name, actions FROM public.permission_table_reads WHERE table_name = 'sales_order_comm_ratios'`),
  [{ table_name: 'sales_order_comm_ratios', actions: ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'] }], 'the table’s readers')
check(await q(`SELECT table_name, label, mode FROM public.audit_tables WHERE table_name = 'sales_order_comm_ratios'`),
  [{ table_name: 'sales_order_comm_ratios', label: "Bills' commission ratios", mode: 'all' }], 'its history')
check(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'sales_order_comm_ratios'`), true, 'RLS on')
const may = (fn, role) => one(`SELECT has_function_privilege($2, $1, 'EXECUTE')`, [fn, role])
check([await may('public.member_comm_ratio_set(uuid,numeric,text)', 'authenticated'), await may('public.member_comm_ratio_set(uuid,numeric,text)', 'anon'),
  await may('public.member_comm_ratio_context(uuid)', 'authenticated'), await may('public.member_comm_ratio_context(uuid)', 'anon'),
  await may('public.comm_ratio_refusal(uuid)', 'authenticated'), await may('public.comm_ratio_refusal(uuid)', 'service_role')],
  [true, false, true, false, false, true], 'who may call what: a signed-in session the two, nobody the refusal helper but the service role')
check([await one(`SELECT has_table_privilege('authenticated', 'public.sales_order_comm_ratios', 'SELECT')`),
  await one(`SELECT has_table_privilege('authenticated', 'public.sales_order_comm_ratios', 'INSERT')`),
  await one(`SELECT has_table_privilege('anon', 'public.sales_order_comm_ratios', 'SELECT')`)], [true, false, false], 'the table: read, never written, by a session')

// ── 20261127140600: Fair's penalty on, from December ──
await setScheme(false, null)
const switchOn = (await readFile(SWITCH_ON, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(switchOn)
await db.exec(switchOn)
check(await q(`SELECT enable_margin_penalty, margin_penalty_from::text FROM public.comm_schemes WHERE id = $1`, [FS]),
  [{ enable_margin_penalty: true, margin_penalty_from: DEC }], 'Fair: on, from December — twice the same')
check(await q(`SELECT enable_margin_penalty FROM public.comm_schemes WHERE id = $1`, [OS]), [{ enable_margin_penalty: false }], 'no other scheme touched')
check(Object.fromEntries(Object.entries(await weights()).filter(([k]) => ['701', '702', '706', '707', '708'].includes(k))),
  { '701': 1, '702': 1, '706': 1, '707': 1, '708': 1 }, "November's bills whole; only the ratios a director set count")

console.log(`validate-comm-ratio: ${checks} checks passed`)
