// Local PostgreSQL regression for 20261112003700 — 2990s, a brand that follows its own commission scheme (2026-11-11;
// the user: "只要是 … 2990s 的 sales order，whereby 他们是 under revenue team 的 member，这笔 sales order 就要出现在他们
// 自己的记录里。如果不是 revenue team 的人，就不需要 export 过来" — the rest "做的是 2990s 自己公司的 sales team").
//
// Production's bodies (tests/member-sql/brand-own-scheme-production.sql, pg_get_functiondef, md5-checked: the receiver,
// erp_sync_order_brand, erp_sync_brand_code, sales_order_restamp_brand) are loaded over stand-ins for what they read;
// the migration then runs VERBATIM, twice. Checks: the brand and its rates are made once and never again; the bills
// already here that nobody on the team sold go, with their trail — never one in a paid month, nor a released one, nor
// the feed's own company's; the team's own are stamped 2990S, lines too; a NEW 2990s document is kept only for
// somebody on the team in the month of the sale (matched by the ERP's id or by name, a place on the scheme that month
// or a director, not resigned before the sale) and is otherwise skipped with nothing written — no fair, no month, no
// payload; a bill already here is updated whoever the ERP names; the company decides the brand over the ERP's Branding,
// the booth and a restamp; no catalogue model sells under the brand (catalogue_brand_of — the ERP's "2990s Sofa" models
// stay brandless, so the Quote gains no calculator without a ladder) while booths and lines read its words; the brand
// switched off, everything is kept as before; the migration refuses a body it was not written from. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261112003700_brand_own_scheme.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR_SUB = id(1)
const IR_SUB = id(2)
const FAIR_SCHEME = id(3)
const IR_SCHEME = id(4)
const AKEMI = id(5)
// Fair's rank catalogue, as production holds it.
const RANK = { F: id(21), E: id(22), D: id(23), C: id(24), B: id(25), A: id(26), SS: id(27) }
const SHELDON = id(31)   // on Fair's team, matched by the ERP's id
const ETHAN = id(32)     // on Fair's team, matched by name alone
const PETER = id(33)     // a director of Fair: no place on the ladder
const LEAVER = id(34)    // resigned 15 Oct 2026, the place left open
const NEWBIE = id(35)    // a place from 10 Nov 2026
const EX = id(36)        // a place that ended 30 Sep 2026
const IR_ONLY = id(37)   // matched, a place in IR alone
const SHELDON_ERP = 'aaaaaaaa-0000-4000-8000-000000000031'
const PETER_ERP = 'aaaaaaaa-0000-4000-8000-000000000033'
const LEAVER_ERP = 'aaaaaaaa-0000-4000-8000-000000000034'
const NEWBIE_ERP = 'aaaaaaaa-0000-4000-8000-000000000035'
const EX_ERP = 'aaaaaaaa-0000-4000-8000-000000000036'
const IR_ERP = 'aaaaaaaa-0000-4000-8000-000000000037'
const NG_ERP = 'bbbbbbbb-0000-4000-8000-000000000001'  // 2990s' own salesperson: nobody the portal knows
const SEP = '2026-09-01'
const OCT = '2026-10-01'
const NOV = '2026-11-01'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, status text NOT NULL DEFAULT 'active', resignation_date date);
  CREATE TABLE comm_sub_departments (id uuid PRIMARY KEY, name text NOT NULL, code text);
  CREATE TABLE comm_schemes (id uuid PRIMARY KEY, sub_department_id uuid, deposit_threshold_pct numeric,
    is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
  CREATE TABLE comm_brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL REFERENCES comm_schemes (id), code text NOT NULL,
    name text NOT NULL, item_code_prefixes text[] NOT NULL DEFAULT '{}', note text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), sub_brands text[] NOT NULL DEFAULT '{}', UNIQUE (scheme_id, code));
  CREATE TABLE comm_rank_defs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL REFERENCES comm_schemes (id),
    product_rate numeric NOT NULL, label text NOT NULL DEFAULT 'Rank ?', sort_order integer NOT NULL DEFAULT 0,
    group_incentive_amount numeric NOT NULL DEFAULT 0, group_subsidy_cap numeric NOT NULL DEFAULT 0);
  CREATE TABLE comm_hierarchy (staff_id uuid NOT NULL, scheme_id uuid NOT NULL, effective_from date NOT NULL, effective_to date);
  CREATE TABLE comm_sub_department_directors (sub_department_id uuid NOT NULL, staff_id uuid NOT NULL);
  CREATE TABLE sales_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    file_name text, source text NOT NULL DEFAULT 'erp_sync', status text NOT NULL DEFAULT 'committed', notes text);
  CREATE UNIQUE INDEX uq_batch_committed ON sales_import_batches (sub_department_id, period_month) WHERE status = 'committed';
  CREATE TABLE sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches (id),
    period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date NOT NULL,
    debtor_code text, customer_name text, agent_name text NOT NULL, agent_key text NOT NULL,
    staff_id uuid REFERENCES hr_staff_costs (id), location text, venue text, brand_code text,
    order_total numeric NOT NULL DEFAULT 0, balance numeric, cancelled boolean NOT NULL DEFAULT false,
    excluded_reason text, source text NOT NULL DEFAULT 'erp_sync', erp_status text, erp_on_hold boolean,
    erp_salesperson_id text, erp_company_id bigint, erp_snapshot_at timestamptz, erp_created_at timestamptz,
    synced_at timestamptz, raw jsonb, fair_event_id uuid, fair_source text, sequence_in_day integer);
  CREATE TABLE sales_order_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES sales_orders (id) ON DELETE CASCADE,
    line_no integer, item_group text, product_code text, product_name text, description2 text, uom text,
    location text, qty numeric, unit_price numeric, line_amount numeric, brand_code text, cost_amount numeric, raw jsonb,
    cost_source text, cost_detail jsonb);
  CREATE TABLE comm_item_groups (scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE catalogue_skus (erp_product_id text, price numeric, price_grid jsonb);
  CREATE TABLE sales_order_brand_picks (order_id uuid PRIMARY KEY, brand_code text);
  CREATE TABLE sales_order_erp_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, order_no text NOT NULL,
    order_id uuid REFERENCES sales_orders (id) ON DELETE SET NULL, kind text NOT NULL DEFAULT 'opened');
  CREATE TABLE comm_order_releases (order_no text, sub_department_id uuid);
  CREATE TABLE erp_booths (erp_project_id bigint PRIMARY KEY, company_id bigint NOT NULL, brand text, brand_code text);
  CREATE TABLE comm_products (item_code text, unit_cost numeric, is_active boolean);
  CREATE TABLE comm_venues (venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE erp_feed_settings (sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE comm_agent_aliases (erp_salesperson_id text, agent_key text, staff_id uuid);
  CREATE TABLE comm_salesperson_closes (sub_department_id uuid, period_month date, staff_id uuid, reopened_at timestamptz);
  CREATE TABLE erp_sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, period_month date, status text, message text,
    warnings text[], payload jsonb, received_at timestamptz NOT NULL DEFAULT clock_timestamp());

  -- Stand-ins for production's helpers.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE TABLE fair_log (n serial, fair jsonb);
  CREATE TABLE reseq_log (agent_key text, event_date date);
  CREATE TABLE refresh_log (batch_id uuid);
  CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql AS $$ SELECT '${FAIR_SUB}'::uuid $$;
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION comm_staff_month_closed(uuid, date, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $2) $$;
  CREATE FUNCTION erp_sync_period_locked(date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $1) $$;
  CREATE FUNCTION erp_sync_period_closed(date) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 < '2026-09-01'::date $$;
  CREATE FUNCTION lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_log(p_doc text, p_period date, p_status text, p_message text, p_warnings text[],
    p_snapshot timestamptz, p_payload jsonb, p_replay_of uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO erp_sync_events (doc_no, period_month, status, message, warnings, payload)
    VALUES (p_doc, p_period, p_status, p_message, p_warnings, p_payload) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', p_status, 'periodMonth', p_period, 'message', p_message, 'warnings', to_jsonb(p_warnings), 'eventId', v_id);
  END $$;
  CREATE FUNCTION erp_sync_known_state(uuid, text, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
  CREATE FUNCTION erp_sync_after_delivery(uuid, text, jsonb, p_result jsonb, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_result $$;
  -- The fair register: every call is kept, so a skipped delivery can be shown to have kept no fair.
  CREATE FUNCTION erp_sync_fair(p jsonb) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fair_log (fair) VALUES (p); RETURN NULL; END $$;
  CREATE FUNCTION venue_event_for_order(text, date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION erp_sync_note_adjustment(uuid, jsonb, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_old_bill(uuid, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
  CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION sales_order_lines_brand(uuid) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION venue_key(text) RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(UPPER(BTRIM($1)), '') $$;
  CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE sql AS $$ INSERT INTO reseq_log VALUES ($1, $2) $$;
  CREATE FUNCTION erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO refresh_log VALUES ($1) $$;
  -- The registry of who may read a table, and its guard (which re-makes the table's restrictive policy).
  CREATE TABLE permission_table_reads (table_name text PRIMARY KEY, actions text[] NOT NULL);
  CREATE TABLE guarded (table_name text);
  CREATE FUNCTION permission_reads_guard(text) RETURNS void LANGUAGE sql AS $$ INSERT INTO guarded VALUES ($1) $$;
  INSERT INTO permission_table_reads VALUES ('comm_rank_defs', '{revenue.manage,revenue.view:own}');
  -- What the two lists of uncosted products ask besides the bills.
  CREATE FUNCTION catalogue_sku_for_code(bigint, text) RETURNS TABLE (erp_id text) LANGUAGE sql AS $$ SELECT NULL::text WHERE false $$;
  CREATE FUNCTION has_any_action(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

  INSERT INTO comm_sub_departments VALUES ('${FAIR_SUB}', 'Fair', 'FAIR'), ('${IR_SUB}', 'IR', NULL);
  INSERT INTO comm_schemes (id, sub_department_id, deposit_threshold_pct, effective_from) VALUES
    ('${FAIR_SCHEME}', '${FAIR_SUB}', 0.3, '2026-01-01'), ('${IR_SCHEME}', '${IR_SUB}', 0.3, '2026-09-01');
  INSERT INTO comm_brands (id, scheme_id, code, name, sub_brands, created_at) VALUES
    ('${AKEMI}', '${FAIR_SCHEME}', 'AKEMI', 'Akemi', '{HAPPI SLEEP}', '2026-01-01');
  INSERT INTO comm_rank_defs (id, scheme_id, product_rate, label, sort_order) VALUES
    ('${RANK.F}', '${FAIR_SCHEME}', 0.05, 'Rank F', 10), ('${RANK.E}', '${FAIR_SCHEME}', 0.06, 'Rank E', 20),
    ('${RANK.D}', '${FAIR_SCHEME}', 0.07, 'Rank D', 30), ('${RANK.C}', '${FAIR_SCHEME}', 0.08, 'Rank C', 40),
    ('${RANK.B}', '${FAIR_SCHEME}', 0.09, 'Rank B', 50), ('${RANK.A}', '${FAIR_SCHEME}', 0.10, 'Rank A', 60),
    ('${RANK.SS}', '${FAIR_SCHEME}', 0.12, 'Rank SS', 70);
  INSERT INTO hr_staff_costs (id, employee_name, status, resignation_date) VALUES
    ('${SHELDON}', 'SHELDON TAN', 'active', NULL), ('${ETHAN}', 'ETHAN', 'active', NULL), ('${PETER}', 'PETER', 'active', NULL),
    ('${LEAVER}', 'LEAVER', 'resigned', '2026-10-15'), ('${NEWBIE}', 'NEWBIE', 'active', NULL),
    ('${EX}', 'EX MEMBER', 'active', NULL), ('${IR_ONLY}', 'IR ONLY', 'active', NULL);
  INSERT INTO comm_hierarchy (staff_id, scheme_id, effective_from, effective_to) VALUES
    ('${SHELDON}', '${FAIR_SCHEME}', '2026-01-01', NULL), ('${ETHAN}', '${FAIR_SCHEME}', '2026-01-01', NULL),
    ('${LEAVER}', '${FAIR_SCHEME}', '2026-01-01', NULL), ('${NEWBIE}', '${FAIR_SCHEME}', '2026-11-10', NULL),
    ('${EX}', '${FAIR_SCHEME}', '2026-01-01', '2026-09-30'), ('${IR_ONLY}', '${IR_SCHEME}', '2026-09-01', NULL);
  INSERT INTO comm_sub_department_directors VALUES ('${FAIR_SUB}', '${PETER}');
  INSERT INTO comm_agent_aliases VALUES
    ('${SHELDON_ERP}', 'SHELDON TAN', '${SHELDON}'), (NULL, 'ETHAN', '${ETHAN}'), ('${PETER_ERP}', 'PETER', '${PETER}'),
    ('${LEAVER_ERP}', 'LEAVER', '${LEAVER}'), ('${NEWBIE_ERP}', 'NEWBIE', '${NEWBIE}'), ('${EX_ERP}', 'EX MEMBER', '${EX}'),
    ('${IR_ERP}', 'IR ONLY', '${IR_ONLY}');
  INSERT INTO erp_feed_settings VALUES ('${FAIR_SUB}', '2026-08-01');
  INSERT INTO erp_booths VALUES (2289, 2, '2990s Sofa', '2990S SOFA'), (305, 1, 'Akemi', 'AKEMI'), (400, 2, 'Somebody Else', 'SOMEBODY ELSE');
`)

// ── Production's bodies, as the migration was written from ───────────────────
await db.exec((await readFile(new URL('./brand-own-scheme-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
const md5Of = name => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = $1`, [name])
check([await md5Of('ingest_erp_sales_order'), await md5Of('erp_sync_order_brand'), await md5Of('erp_sync_brand_code'),
  await md5Of('sales_order_restamp_brand'), await md5Of('revenue_uncosted_products'), await md5Of('revenue_costing_gaps'),
  await md5Of('catalogue_brand_of')],
  ['d8395b13f77fd3f4b3380b8ec0be9954', 'd0cb32176b535e5fa6927ac0e224ec5a', 'b0df3385c53987a71ca25a28e17d056e',
    '19433c3e1a804498a93eeb0fd5b7aa27', '89e2715b6230847840d30b8770ded97d', '1348d459ad65cd4efe6a4fdc5ff356ee',
    'c57e06e354ec2b08906c081d8d3d9977'],
  'the fixture is production’s bodies')
// The brand a catalogue model sells under (Product List › Modular, the Quote's catalogue): its category, the model's
// branding, the SKU's.
const catalogueBrand = async (category, model, sku = null) => one('SELECT catalogue_brand_of($1, $2, $3)', [category, model, sku])
check([await catalogueBrand('SOFA', '2990s Sofa'), await catalogueBrand('MATTRESS', '2990s Mattress', '2990s Mattress'),
  await catalogueBrand('MATTRESS', 'Akemi'), await catalogueBrand('MATTRESS', null, 'Happi Sleep'), await catalogueBrand('BEDFRAME', 'Akemi')],
  [null, null, 'AKEMI', 'AKEMI', null],
  'before: the ERP’s 2990s models sell under no brand; a mattress under its brand or its sub-brand; a bed frame under none')
// The products a month still has no cost for: Comm Cal's list (a sub-department's month) and the Product List's (a date range).
const uncosted = async month => (await q('SELECT product_code FROM revenue_uncosted_products($1, $2) ORDER BY 1', [FAIR_SUB, month])).map(r => r.product_code)
const gaps = async (from, to) => (await q('SELECT item_code FROM revenue_costing_gaps($1, $2) ORDER BY 1', [from, to])).map(r => r.item_code)

let snapshot = 0
// A delivery as the receiver's route hands it over (lib/erp-sync/contract.ts).
const deliver = async (docNo, { company = 2, orderDate = '2026-11-05', seller = 'Sheldon Tan', sellerId = SHELDON_ERP, total = 2990,
  status = 'CONFIRMED', brand = null, fair = null, lines = [{ itemCode: '2990-SF-01', brand: '2990s Sofa', qty: 1, amount: 2990 }] } = {}) =>
  (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify({
    docNo, companyId: company, orderDate, status, salespersonId: sellerId, salespersonName: seller, total, balance: 0,
    customerName: 'A CUSTOMER', venue: 'PENANG WATERFRONT', brand, fair, lines,
    snapshotAt: new Date(Date.UTC(2026, 10, 11, 4, 0, ++snapshot)).toISOString(),
    raw: { header: { doc_no: docNo, so_date: orderDate, company_id: company, branding: brand }, fair },
  })]))[0].r
const bill = async docNo => (await q(
  `SELECT period_month::text AS month, staff_id::text AS staff, agent_name, brand_code AS brand, erp_company_id::int AS company,
          cancelled
     FROM sales_orders WHERE order_no = $1`, [docNo]))[0]
const lineBrands = async docNo => (await q(
  `SELECT l.brand_code FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id WHERE o.order_no = $1 ORDER BY l.line_no`,
  [docNo])).map(r => r.brand_code)

// ── What the feed left since 10 Nov, before the migration ────────────────────
// Company 2's orders came in like any order: 2990s' own salespeople as unmatched agents, the team's under no brand.
const ng = { seller: 'NG PENG CHUEN', sellerId: NG_ERP }
const sofaAndPillow = [{ itemCode: '2990-SF-01', brand: '2990s Sofa', qty: 1, amount: 2990 }, { itemCode: 'HS-PILLOW', brand: 'HAPPI SLEEP', qty: 1, amount: 100 }]
await deliver('2990-SO-2610-001', { ...ng, orderDate: '2026-10-12' })
await deliver('2990-SO-2610-002', { ...ng, orderDate: '2026-10-12' })
await deliver('2990-SO-2611-003', { seller: 'Scarlett Chong', sellerId: 'bbbbbbbb-0000-4000-8000-000000000002', orderDate: '2026-11-03',
  fair: { brand: 'Akemi', status: 'confirmed' } })                                    // written at the Akemi booth: stamped AKEMI
await deliver('2990-SO-2609-004', { ...ng, orderDate: '2026-09-20' })                // its month is then paid by a run
await deliver('2990-SO-2610-005', { ...ng, orderDate: '2026-10-20' })                // released by a close, however that came about
await deliver('2990-SO-2611-021', { orderDate: '2026-11-03' })
await deliver('2990-SO-2611-022', { orderDate: '2026-11-04', total: 3090, lines: sofaAndPillow })
await deliver('2990-SO-2610-057', { orderDate: '2026-10-25' })
await q(`UPDATE sales_orders SET cancelled = true, excluded_reason = 'manual' WHERE order_no = '2990-SO-2610-057'`)  // HR: Don't count
await deliver('HC-SO-2611-900', { company: 1, seller: 'Mystery Seller', sellerId: 'cccccccc-0000-4000-8000-000000000001',
  lines: [{ itemCode: 'AK-1', brand: 'Akemi', qty: 1, amount: 5000 }] })               // the feed's own company, unmatched: HR's to match
await deliver('HC-SO-2611-901', { company: 1, brand: 'Akemi', lines: [{ itemCode: 'AK-1', brand: 'Akemi', qty: 1, amount: 5000 }] })
await q(`INSERT INTO locked_months VALUES ('2026-09-01')`)
await q(`INSERT INTO comm_order_releases VALUES ('2990-SO-2610-005', $1)`, [FAIR_SUB])
await q(`INSERT INTO sales_order_erp_changes (sub_department_id, order_no, order_id)
         SELECT $1, o.order_no, o.id FROM sales_orders o`, [FAIR_SUB])
check([(await bill('2990-SO-2610-001')).staff, (await bill('2990-SO-2611-003')).brand, (await bill('2990-SO-2611-021')).brand,
  await lineBrands('2990-SO-2611-021'), (await bill('2990-SO-2611-022')).brand, await lineBrands('2990-SO-2611-022')],
  [null, 'AKEMI', null, [null], 'AKEMI', ['AKEMI', 'AKEMI']],
  'before: 2990s’ own salespeople are unmatched agents of Fair’s months; a team member’s 2990s bill carries no brand, or the brand of a pillow on it')
check([await uncosted(NOV), await gaps('2026-11-01', '2026-12-01')], [['2990-SF-01', 'AK-1', 'HS-PILLOW'], ['2990-SF-01', 'AK-1', 'HS-PILLOW']],
  'and their products wait for a cost on both lists')
await q('DELETE FROM reseq_log'); await q('DELETE FROM refresh_log'); await q('DELETE FROM fair_log')

// ── The migration, verbatim, twice ───────────────────────────────────────────
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const MADE = ['ingest_erp_sales_order', 'erp_sync_order_brand', 'revenue_uncosted_products', 'revenue_costing_gaps', 'catalogue_brand_of']
const madeNow = async () => Promise.all(MADE.map(md5Of))
const made = await madeNow()
const BRAND = await one(`SELECT id::text FROM comm_brands WHERE code = '2990S'`)
const rates = async () => Object.fromEntries((await q(
  `SELECT label, brand_rates FROM comm_rank_defs WHERE scheme_id = $1 ORDER BY sort_order`, [FAIR_SCHEME]))
  .map(r => [r.label, r.brand_rates[BRAND] ?? null]))

check((await q(`SELECT scheme_id::text, name, own_scheme, erp_company_id::int AS company, sub_brands, is_active FROM comm_brands WHERE code = '2990S'`))[0],
  { scheme_id: FAIR_SCHEME, name: '2990s', own_scheme: true, company: 2, sub_brands: ['2990S SOFA', '2990S MATTRESS'], is_active: true },
  'the brand: 2990S on Fair’s scheme, its own scheme, the ERP’s company 2')
check(await rates(), { 'Rank F': 0.04, 'Rank E': 0.05, 'Rank D': 0.06, 'Rank C': 0.07, 'Rank B': 0.08, 'Rank A': null, 'Rank SS': null },
  'its rates: a point under each rank’s own — Team Leader 8% … Revenue Specialist 4%; the two ranks nobody named, none')
check((await q(`SELECT own_scheme, erp_company_id FROM comm_brands WHERE code = 'AKEMI'`))[0], { own_scheme: false, erp_company_id: null },
  'every other brand: not on its own scheme, no company')
check([await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'comm_rank_defs'`), (await q('SELECT table_name FROM guarded')).map(r => r.table_name)],
  [['revenue.edit', 'revenue.manage', 'revenue.view:own'], ['comm_rank_defs']],
  'Revenue · Edit reads the rank catalogue now — the run reads the rates under it — and the table’s read guard is made again')

// The bills already here.
check([await bill('2990-SO-2610-001'), await bill('2990-SO-2610-002'), await bill('2990-SO-2611-003')], [undefined, undefined, undefined],
  'the bills nobody on the team sold are gone — the one stamped AKEMI at the Akemi booth too')
check(Number(await one(`SELECT count(*) FROM sales_order_erp_changes WHERE order_no IN ('2990-SO-2610-001', '2990-SO-2610-002', '2990-SO-2611-003')`)), 0,
  'with their rows of the ERP audit trail')
check(Number(await one(`SELECT count(*) FROM sales_order_lines l WHERE NOT EXISTS (SELECT 1 FROM sales_orders o WHERE o.id = l.order_id)`)), 0,
  'and their lines')
check([(await bill('2990-SO-2609-004'))?.staff, (await bill('2990-SO-2610-005'))?.staff], [null, null],
  'never one in a month a run has paid, nor one a close released')
check([(await bill('2990-SO-2609-004')).brand, (await bill('2990-SO-2610-005')).brand], [null, '2990S'],
  'a paid month’s bill is not restamped either; the released one, in an open month, is')
check(Number(await one(`SELECT count(*) FROM sales_order_erp_changes WHERE order_no IN ('2990-SO-2609-004', '2990-SO-2610-005', '2990-SO-2611-021')`)), 3,
  'the trail of every bill that stayed is kept')
check([(await bill('HC-SO-2611-900')).staff, (await bill('HC-SO-2611-900')).brand, (await bill('HC-SO-2611-901')).brand], [null, 'AKEMI', 'AKEMI'],
  'the feed’s own company is untouched: its unmatched agent still waits for HR, its brands as they were')
check((await q(`SELECT agent_key, event_date::text FROM reseq_log ORDER BY 1, 2`)),
  [{ agent_key: 'NG PENG CHUEN', event_date: '2026-10-12' }, { agent_key: 'SCARLETT CHONG', event_date: '2026-11-03' }],
  'each name’s day is numbered again, once')
check(Number(await one('SELECT count(DISTINCT batch_id) FROM refresh_log')), 2, 'and each month’s counters refreshed — October’s and November’s')
check([await bill('2990-SO-2611-021'), await lineBrands('2990-SO-2611-021')],
  [{ month: NOV, staff: SHELDON, agent_name: 'Sheldon Tan', brand: '2990S', company: 2, cancelled: false }, ['2990S']],
  'the team’s own bill is stamped 2990S, its line with it')
check([(await bill('2990-SO-2611-022')).brand, await lineBrands('2990-SO-2611-022')], ['2990S', ['2990S', 'AKEMI']],
  'a bill a pillow had made Akemi’s is 2990s’ — the line keeps the brand its own product names')
check([(await bill('2990-SO-2610-057')).brand, (await bill('2990-SO-2610-057')).cancelled], ['2990S', true],
  'a bill HR took out by hand is stamped too, and stays out')
check([await uncosted(NOV), await gaps('2026-11-01', '2026-12-01')], [['AK-1'], ['AK-1']],
  'no cost is waited for on a 2990s bill: its lines leave both lists — the pillow on it too; every other bill’s stay')
check((await q('SELECT erp_project_id::int AS p, brand_code FROM erp_booths ORDER BY 1')),
  [{ p: 305, brand_code: 'AKEMI' }, { p: 400, brand_code: 'SOMEBODY ELSE' }, { p: 2289, brand_code: '2990S' }],
  'the 2990s booth reads as the brand’s; a booth whose name is no brand stays as the ERP wrote it')

// No product list, no calculator: the words are the brand's, but no catalogue model sells under it.
check([await one(`SELECT erp_sync_brand_code('2990s Sofa')`), await one(`SELECT erp_sync_brand_code('2990S MATTRESS')`),
  await one(`SELECT erp_sync_brand_code('2990s')`)], ['2990S', '2990S', '2990S'],
  'a booth, a bill and a line read “2990s Sofa” / “2990s Mattress” as the brand’s')
check([await catalogueBrand('SOFA', '2990s Sofa'), await catalogueBrand('MATTRESS', '2990s Mattress', '2990s Mattress'),
  await catalogueBrand('SOFA', null, '2990S'), await catalogueBrand('MATTRESS', 'Akemi'), await catalogueBrand('MATTRESS', null, 'Happi Sleep'),
  await catalogueBrand('MATTRESS', '2990s Mattress', 'Akemi'), await catalogueBrand('BEDFRAME', 'Akemi')],
  [null, null, null, 'AKEMI', 'AKEMI', 'AKEMI', null],
  'the catalogue does not: the ERP’s 2990s models still sell under no brand — no calculator without a ladder — and every other brand answers as before')
check([await one(`SELECT catalogue_ladder_brand('2990s Sofa')`), await one(`SELECT catalogue_ladder_brand('Happi Sleep')`),
  await one(`SELECT catalogue_ladder_brand('Nobody')`), await one(`SELECT catalogue_ladder_brand(NULL)`)], [null, 'AKEMI', null, null],
  'catalogue_ladder_brand: a brand with a ladder, never one on its own scheme')
check((await q(`SELECT has_function_privilege('anon', 'catalogue_ladder_brand(text)', 'EXECUTE') AS anon,
  has_function_privilege('authenticated', 'catalogue_ladder_brand(text)', 'EXECUTE') AS signed_in,
  has_function_privilege('service_role', 'catalogue_ladder_brand(text)', 'EXECUTE') AS service`))[0],
  { anon: false, signed_in: true, service: true }, 'asked by the Quote’s catalogue (the service role) and Costing Setting’s save, never the publishable key')

// Run again — after HR cleared a rate on Rules: nothing changes, nothing is seeded again.
await q(`UPDATE comm_rank_defs SET brand_rates = brand_rates - $1 WHERE id = $2`, [BRAND, RANK.F])
const before = await q(`SELECT (SELECT count(*) FROM sales_orders)::int AS bills, (SELECT count(*) FROM comm_brands)::int AS brands,
  (SELECT count(*) FROM sales_order_erp_changes)::int AS trail`)
await db.exec(migration)
check(await madeNow(), made, 'run again, the functions are the same')
check(await q(`SELECT (SELECT count(*) FROM sales_orders)::int AS bills, (SELECT count(*) FROM comm_brands)::int AS brands,
  (SELECT count(*) FROM sales_order_erp_changes)::int AS trail`), before, 'no bill, brand or trail row moves')
check(await rates(), { 'Rank F': null, 'Rank E': 0.05, 'Rank D': 0.06, 'Rank C': 0.07, 'Rank B': 0.08, 'Rank A': null, 'Rank SS': null },
  'and a rate cleared on Rules is not seeded back')
check(made.map(md5 => migration.includes(`'${md5}'`)), [true, true, true, true, true], 'the md5s the migration checks are the bodies it makes')
await q(`UPDATE comm_rank_defs SET brand_rates = brand_rates || jsonb_build_object($1::text, 0.04) WHERE id = $2`, [BRAND, RANK.F])
await q('DELETE FROM locked_months')

// ── A new 2990s document: only the team's is kept ────────────────────────────
const events = async () => Number(await one('SELECT count(*) FROM erp_sync_events'))
const batches = async () => Number(await one('SELECT count(*) FROM sales_import_batches'))
await q('DELETE FROM fair_log')
const kept = await batches()
const own = await deliver('2990-SO-2612-100', { ...ng, orderDate: '2026-12-02', fair: { brand: '2990s Sofa', status: 'confirmed' } })
check([own.status, own.message, own.warnings], ['skipped', '2990s order — NG PENG CHUEN is not on the Fair team', []],
  '2990s’ own salesperson: a successful delivery the portal declines to keep, and says why')
check([await bill('2990-SO-2612-100'), await batches(), Number(await one('SELECT count(*) FROM fair_log')),
  (await q(`SELECT payload IS NULL AS dropped, period_month::text AS month FROM erp_sync_events WHERE doc_no = '2990-SO-2612-100'`))[0]],
  [undefined, kept, 0, { dropped: true, month: '2026-12-01' }],
  'nothing written: no bill, no month made for December, no fair kept, no payload held')

const sheldon = await deliver('2990-SO-2611-101', { orderDate: '2026-11-08', brand: 'Akemi', fair: { brand: 'Akemi', status: 'confirmed' } })
check([sheldon.status, sheldon.message], ['applied', 'created'], 'a team member’s 2990s order comes in')
check(await bill('2990-SO-2611-101'), { month: NOV, staff: SHELDON, agent_name: 'Sheldon Tan', brand: '2990S', company: 2, cancelled: false },
  'theirs, in its month — and 2990S whatever the ERP’s Branding and the booth say: the company decides')
check(await lineBrands('2990-SO-2611-101'), ['2990S'], 'its line reads as the brand’s (2990s Sofa is the brand’s sub-brand)')
check(Number(await one('SELECT count(*) FROM fair_log')), 1, 'and its fair is kept, as any bill’s')

check((await deliver('2990-SO-2611-102', { seller: 'ethan', sellerId: 'dddddddd-0000-4000-8000-000000000009' })).status, 'applied',
  'matched by name alone (the ERP id is one HR never matched): in')
check((await bill('2990-SO-2611-102')).staff, ETHAN, 'ETHAN’s')
check([(await deliver('2990-SO-2611-103', { seller: 'Peter', sellerId: PETER_ERP })).status, (await bill('2990-SO-2611-103')).staff],
  ['applied', PETER], 'a director of the sub-department holds no place on the ladder and is on the team')

const ir = await deliver('2990-SO-2611-104', { seller: 'IR Only', sellerId: IR_ERP })
check([ir.status, ir.message, await bill('2990-SO-2611-104')], ['skipped', '2990s order — IR Only is not on the Fair team', undefined],
  'matched, but a place in another sub-department alone: not Fair’s')
check((await deliver('2990-SO-2611-105', { seller: '  ', sellerId: null })).message, '2990s order — it names no salesperson',
  'an order naming nobody is nobody’s on the team')

// The month of the sale.
check([(await deliver('2990-SO-2610-110', { seller: 'Leaver', sellerId: LEAVER_ERP, orderDate: '2026-10-10' })).status,
  (await deliver('2990-SO-2610-111', { seller: 'Leaver', sellerId: LEAVER_ERP, orderDate: '2026-10-15' })).status,
  (await deliver('2990-SO-2610-112', { seller: 'Leaver', sellerId: LEAVER_ERP, orderDate: '2026-10-16' })).status],
  ['applied', 'applied', 'skipped'], 'somebody who resigned: sold up to their last day, in; after it, not theirs to sell');
check([(await deliver('2990-SO-2611-113', { seller: 'Newbie', sellerId: NEWBIE_ERP, orderDate: '2026-11-03' })).status,
  (await deliver('2990-SO-2610-114', { seller: 'Newbie', sellerId: NEWBIE_ERP, orderDate: '2026-10-28' })).status],
  ['applied', 'skipped'], 'a place opened on the 10th covers its whole month — the month a run reads the team for — not the month before')
check([(await deliver('2990-SO-2609-115', { seller: 'Ex Member', sellerId: EX_ERP, orderDate: '2026-09-29' })).status,
  (await deliver('2990-SO-2610-116', { seller: 'Ex Member', sellerId: EX_ERP, orderDate: '2026-10-02' })).status],
  ['applied', 'skipped'], 'a place that ended in September: September’s sale in, October’s not')
// The sale day the ERP names (fair.fairDate, one of the fair's days) is the day of the sale, over the day it was keyed.
const fairOct = { brand: '2990s Sofa', status: 'confirmed', startDate: '2026-10-29', endDate: '2026-11-02' }
check([(await deliver('2990-SO-2611-117', { seller: 'Newbie', sellerId: NEWBIE_ERP, orderDate: '2026-11-12', fair: { ...fairOct, fairDate: '2026-10-30' } })).status,
  (await deliver('2990-SO-2610-118', { seller: 'Newbie', sellerId: NEWBIE_ERP, orderDate: '2026-10-31', fair: { ...fairOct, fairDate: '2026-11-01' } })).status],
  ['skipped', 'applied'], 'sold on 30 Oct and keyed in November: October’s team; sold on 1 Nov and dated October: November’s')

// A draft, and a company no brand stands for.
check((await deliver('2990-SO-2611-119', { ...ng, status: 'DRAFT' })).message, '2990s order — NG PENG CHUEN is not on the Fair team',
  'a draft of theirs is declined for the same reason')
check((await deliver('2990-SO-2611-120', { status: 'DRAFT' })).message, 'draft — not a sale yet', 'a team member’s draft is a draft, as before')
const hc = await deliver('HC-SO-2611-902', { company: 1, seller: 'Brand New', sellerId: 'cccccccc-0000-4000-8000-000000000002',
  lines: [{ itemCode: 'AK-1', brand: 'Akemi', qty: 1, amount: 5000 }] })
check([hc.status, hc.warnings.includes('unmatched_salesperson'), (await bill('HC-SO-2611-902')).brand], ['applied', true, 'AKEMI'],
  'the feed’s own company: an unmatched salesperson’s order is kept for HR to match, as ever')
const other = await deliver('X3-SO-2611-001', { company: 3, ...ng, lines: [{ itemCode: 'X-1', brand: null, qty: 1, amount: 100 }] })
check([other.status, (await bill('X3-SO-2611-001')).brand], ['applied', null], 'a company no brand stands for: kept, as every order was')
const none = await deliver('HC-SO-2611-903', { company: null, ...ng })
check(none.status, 'applied', 'a delivery that names no company: kept')

// ── A bill already here is updated, whoever the ERP names now ────────────────
const resent = await deliver('2990-SO-2611-101', { ...ng, orderDate: '2026-11-08', total: 3190 })
check([resent.status, resent.message], ['applied', 'updated'], 'a re-send of a bill the portal holds is written, not skipped')
check([(await bill('2990-SO-2611-101')).staff, (await bill('2990-SO-2611-101')).brand], [SHELDON, '2990S'],
  'still its holder’s (a name nobody matched changes nobody), still 2990S')
const paid = await deliver('2990-SO-2610-005', { ...ng, orderDate: '2026-10-20', total: 3000 })
check([paid.status, (await bill('2990-SO-2610-005')).brand], ['applied', '2990S'],
  'the released bill the migration left is updated like any bill, and takes its brand')

// ── The company decides the brand: a restamp too ─────────────────────────────
const ID = async docNo => one('SELECT id::text FROM sales_orders WHERE order_no = $1', [docNo])
check([await one('SELECT sales_order_restamp_brand($1)', [await ID('2990-SO-2611-022')]), (await bill('2990-SO-2611-022')).brand,
  await lineBrands('2990-SO-2611-022')], ['2990S', '2990S', ['2990S', 'AKEMI']],
  'a restamp (no company in its JSON) reads the stored bill’s company: still 2990S')
check(await one('SELECT sales_order_restamp_brand($1)', [await ID('HC-SO-2611-901')]), 'AKEMI', 'the feed’s own bill restamps as before')
await q(`INSERT INTO sales_order_brand_picks VALUES ($1, 'AKEMI')`, [await ID('2990-SO-2611-021')])
check(await one(`SELECT erp_sync_order_brand('{"brandPick": "Akemi"}'::jsonb, $1)`, [await ID('2990-SO-2611-021')]), '2990S',
  'nor does a pick — the ERP’s or the portal’s — move a 2990s bill to another brand')
check([await one(`SELECT erp_sync_order_brand('{"companyId": 2}'::jsonb, NULL)`), await one(`SELECT erp_sync_order_brand('{"companyId": "2"}'::jsonb, NULL)`),
  await one(`SELECT erp_sync_order_brand('{"companyId": 1, "brand": "Happi Sleep"}'::jsonb, NULL)`),
  await one(`SELECT erp_sync_order_brand('{"companyId": "two", "brandPick": "Akemi"}'::jsonb, NULL)`),
  await one(`SELECT erp_sync_order_brand('{}'::jsonb, NULL)`)], ['2990S', '2990S', 'AKEMI', 'AKEMI', null],
  'the company first; else Branding, the pick, the booth, as before; a company that is no number is no company')

// ── The rates' shape, and one brand a company ────────────────────────────────
const valid = async v => one('SELECT comm_brand_rates_valid($1::jsonb)', [JSON.stringify(v)])
check([await valid({}), await valid({ [BRAND]: 0.08 }), await valid({ [BRAND]: 0 }), await valid({ [BRAND]: 1 })], [true, true, true, true],
  'an object of brand id → a rate from 0 to 1')
check([await valid({ [BRAND]: 8 }), await valid({ [BRAND]: -0.01 }), await valid({ [BRAND]: '0.08' }), await valid({ '2990S': 0.08 }),
  await valid({ [BRAND.toUpperCase()]: 0.08 }), await valid([0.08]), await valid(null)], [false, false, false, false, false, false, false],
  'refused: 8 for 8%, a negative, a rate in quotes, a code for a key, an upper-case id, a list, null')
await assert.rejects(q(`UPDATE comm_rank_defs SET brand_rates = jsonb_build_object($1::text, 8) WHERE id = $2`, [BRAND, RANK.B]),
  /comm_rank_defs_brand_rates_valid/)
checks++
await assert.rejects(q(`INSERT INTO comm_brands (scheme_id, code, name, erp_company_id) VALUES ($1, 'TWIN', 'Twin', 2)`, [FAIR_SCHEME]),
  /uq_comm_brand_erp_company/)
checks++
check((await q(`SELECT has_function_privilege('anon', 'erp_sync_outside_team(uuid, jsonb, date)', 'EXECUTE') AS anon,
  has_function_privilege('authenticated', 'erp_sync_outside_team(uuid, jsonb, date)', 'EXECUTE') AS signed_in,
  has_function_privilege('service_role', 'erp_sync_outside_team(uuid, jsonb, date)', 'EXECUTE') AS service`))[0],
  { anon: false, signed_in: true, service: true }, 'the rule is the receiver’s to ask: the service role and whoever replays, never the publishable key')

// ── The brand switched off: everything is kept, as before ────────────────────
await q(`UPDATE comm_brands SET is_active = false WHERE code = '2990S'`)
const off = await deliver('2990-SO-2611-130', { ...ng })
check([off.status, off.warnings.includes('unmatched_salesperson'), (await bill('2990-SO-2611-130')).brand], ['applied', true, null],
  'with the brand off, a 2990s order is an order like any other again — the way back')
check((await uncosted(NOV)).includes('2990-SF-01'), true, 'and its products wait for a cost again')
check([await one(`SELECT erp_sync_brand_code('2990s Sofa')`), await catalogueBrand('SOFA', '2990s Sofa'), await catalogueBrand('MATTRESS', 'Akemi')],
  [null, null, 'AKEMI'], 'its words are nobody’s again; the catalogue answers as it always did')
await q(`UPDATE comm_brands SET is_active = true WHERE code = '2990S'`)
// A brand of the same words WITH a ladder (were 2990s ever given one): its models sell under it, as any brand's.
await q(`UPDATE comm_brands SET own_scheme = false WHERE code = '2990S'`)
check(await catalogueBrand('SOFA', '2990s Sofa'), '2990S', 'off its own scheme, the brand is a brand like any other in the catalogue')
await q(`UPDATE comm_brands SET own_scheme = true WHERE code = '2990S'`)

// ── The migration refuses a body it was not written from ─────────────────────
// (The five are checked in name order; each refusal leaves the transaction to be rolled back.)
await db.exec(`DROP FUNCTION revenue_costing_gaps(date, date);
  CREATE FUNCTION revenue_costing_gaps(p_from date, p_to date) RETURNS void LANGUAGE sql AS $$ SELECT $$`)
await assert.rejects(db.exec(migration), /revenue_costing_gaps\(date, date\) is md5 .*, not the body this migration was written from/)
checks++
await db.exec('ROLLBACK')
await db.exec(`CREATE OR REPLACE FUNCTION ingest_erp_sales_order(p_order jsonb, p_replay_of uuid DEFAULT NULL::uuid)
  RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)
await assert.rejects(db.exec(migration), /ingest_erp_sales_order\(jsonb, uuid\) is md5 .*, not the body this migration was written from/)
checks++
await db.exec('ROLLBACK')
await db.exec(`CREATE OR REPLACE FUNCTION erp_sync_order_brand(p_order jsonb, p_order_id uuid DEFAULT NULL::uuid)
  RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$`)
await assert.rejects(db.exec(migration), /erp_sync_order_brand\(jsonb, uuid\) is md5 .*, not the body this migration was written from/)
checks++
await db.exec('ROLLBACK')
await db.exec(`CREATE OR REPLACE FUNCTION catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text)
  RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$`)
await assert.rejects(db.exec(migration), /catalogue_brand_of\(text, text, text\) is md5 .*, not the body this migration was written from/)
checks++

console.log(`validate-brand-own-scheme: ${checks} checks passed`)
