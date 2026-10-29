// Local PostgreSQL regression for Rules › KPI items › a FABRIC SERIES
// (2026-10-29, the user: "kpi item can selected with fabric series as well.
// for sofa and bedframe"; a sofa's "每组算一次").
//
// `20260927050000` (the KPI items as production runs them: comm_kpi_hits md5
// 1f0394c4…, catalogue_save_kpi_items 2256b26c…) and then `20261030010000`
// run VERBATIM — the second twice — against a synthetic surrounding schema.
// What is under test is money: which fabric series a bill carries (its line's
// fabric looked up on the ERP's fabric list), a bed frame's per bed frame, a
// sofa's once per sofa set, only on a bill whose sales cover it; that the
// month page and the member facts take it off the bill's sales as the run
// does; that the specials are found as before; and what the writer stores.
// No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR_SUB = id(1)
const SCHEME = id(5)
const TAB = id(6)
const CH = id(31)
const SEP = '2026-09-01'
const SEP_END = '2026-09-30'

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

async function productionFunction(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const match = new RegExp(
    `create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`,
    'i',
  ).exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    -- The permission registry the migration's last step writes (20261009080000), and its guard.
    CREATE TABLE permission_table_reads(table_name text PRIMARY KEY, actions text[] NOT NULL);
    CREATE FUNCTION may_read(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text, canonical_key text);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE comm_venue_events(venue_key text, organiser_id uuid, period_month date, start_date date);
    CREATE TABLE sales_import_batches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL,
      status text NOT NULL DEFAULT 'committed', sub_department_id uuid NOT NULL);
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date NOT NULL,
      agent_name text NOT NULL DEFAULT 'CHEA HUAN', staff_id uuid REFERENCES hr_staff_costs(id), venue text,
      order_total numeric NOT NULL DEFAULT 0, balance numeric, cancelled boolean NOT NULL DEFAULT false,
      excluded_reason text, customer_name text, debtor_code text, location text, brand_code text,
      erp_status text, erp_on_hold boolean, sequence_in_day integer, manual_margin_pct numeric,
      created_at timestamptz NOT NULL DEFAULT now(),
      paid_amount numeric GENERATED ALWAYS AS (order_total - COALESCE(balance, 0)) STORED);
    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      line_no integer, item_group text, product_code text, description2 text,
      qty numeric, line_amount numeric NOT NULL DEFAULT 0, brand_code text, cost_amount numeric, raw jsonb);
    CREATE TABLE sales_order_open_bill_tags(order_id uuid PRIMARY KEY, bill_rank smallint, auto_suggested boolean);
    CREATE TABLE comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, period_month date,
      sub_department_id uuid);
    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY, sub_department_id uuid NOT NULL,
      enable_kpi boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date,
      deposit_threshold_pct numeric, revenue_cost_divisor numeric(6,4) NOT NULL DEFAULT 1,
      updated_at timestamptz);
    CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
    CREATE TABLE erp_products(erp_id text PRIMARY KEY, item_code text NOT NULL, description text, removed_at timestamptz);
    CREATE TABLE erp_maintenance_options(erp_company_id int NOT NULL DEFAULT 1, pool text NOT NULL,
      value text NOT NULL, removed_at timestamptz);
    -- The ERP's fabric list as the mirror holds it (20260924020000 §4).
    CREATE TABLE erp_fabrics (
      erp_company_id BIGINT NOT NULL DEFAULT 1, erp_id TEXT NOT NULL, fabric_code TEXT NOT NULL,
      description TEXT, category TEXT, series TEXT, sofa_tier TEXT, bedframe_tier TEXT, price_tier TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), removed_at TIMESTAMPTZ, raw JSONB,
      PRIMARY KEY (erp_company_id, erp_id));
    CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT NULL::date $$;

    -- comm_kpi_items exactly as the foundation created it (20260831010000).
    CREATE TABLE comm_kpi_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL, product_name TEXT, kpi_amount DECIMAL(15,2) NOT NULL,
      effective_from DATE NOT NULL, effective_to DATE, created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT kpi_amount_non_negative CHECK (kpi_amount >= 0),
      CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
      CONSTRAINT no_overlapping_kpi_item EXCLUDE USING gist (
        scheme_id WITH =, (UPPER(BTRIM(product_code))) WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&));

    INSERT INTO comm_sub_departments VALUES ('${FAIR_SUB}', 'Fair');
    INSERT INTO hr_staff_costs VALUES ('${CH}', 'CHEA HUAN', 'HV031');
    INSERT INTO comm_schemes(id, sub_department_id, revenue_cost_divisor) VALUES ('${SCHEME}', '${FAIR_SUB}', 0.7);
    INSERT INTO comm_item_groups VALUES
      ('${SCHEME}', 'mattress', true), ('${SCHEME}', 'bedframe', true), ('${SCHEME}', 'sofa', true),
      ('${SCHEME}', 'accessory', true), ('${SCHEME}', 'service', false);
    INSERT INTO erp_maintenance_options(pool, value) VALUES
      ('bedframe_specials', 'HB Straight'), ('sofa_specials', 'Nylon Fabric');
    INSERT INTO erp_fabrics(erp_id, fabric_code, description, series, removed_at, synced_at) VALUES
      ('f1', 'PC151-01', 'PC151-01', 'PC151', NULL, '2026-10-27'),
      ('f2', 'PC151-18', 'PC151-18', 'PC151', NULL, '2026-10-27'),
      ('f3', 'KS-08', 'KS-08 SEA PINK', 'KS', NULL, '2026-10-27'),
      ('f4', 'AM275-1-IVORY', 'merged into AM275-01', NULL, NULL, '2026-10-27'),
      -- One code listed twice: the live row's series is the line's.
      ('f5', 'BN125-04', 'BN125-04', 'OLD BN', '2026-10-01', '2026-10-28'),
      ('f6', 'bn125-04 ', 'BN125-04', 'BN125', NULL, '2026-10-20'),
      ('f7', 'OT-01', 'OLD TWEED 01', 'OLD-TWEED', '2026-10-01', '2026-10-01');
  `)

  await productionFunction('20260917020000_venue_feed_window_pay_preview', 'venue_key')
  await productionFunction('20260924030000_catalogue_costs_the_margin', 'catalogue_value_key')
  await productionFunction('20260924030000_catalogue_costs_the_margin', 'catalogue_line_facts')
  await productionFunction('20261009080000_reads_ask_for_the_action', 'permission_reads_guard')

  await db.exec('SET check_function_bodies = off')
  await db.exec(await readFile(new URL('20260927050000_cost_ratios_and_kpi_add_ons.sql', migrations), 'utf8'))
  const migration = await readFile(new URL('20261030010000_kpi_items_fabric_series.sql', migrations), 'utf8')
  await db.exec(migration)
  // Verbatim again: it may be run twice.
  await db.exec(migration)
  await db.exec('SET check_function_bodies = on')
  checks++

  // ─── the table and the registry ──────────────────────────────────────────

  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'mattress_fabric_series', 'PC151', 1, '2026-09-01')`, [SCHEME],
    /kpi_item_identity/, "only a bed frame's or a sofa's fabric series")
  check(await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'erp_fabrics'`),
    ['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'],
    "the fabric list is read behind Revenue · View too")

  // In force since August, as Rules › KPI items would have left them.
  await q(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, product_name, kpi_amount, effective_from) VALUES
             ($1, 'option', 'sofa_fabric_series', 'PC151', 'PC151 · Sofa fabric', 50, '2026-08-01'),
             ($1, 'option', 'bedframe_fabric_series', 'PC151', 'PC151 · Bed frame fabric', 30, '2026-08-01'),
             ($1, 'option', 'bedframe_fabric_series', 'KS', 'KS · Bed frame fabric', 20, '2026-08-01'),
             ($1, 'option', 'bedframe_fabric_series', 'BN125', 'BN125 · Bed frame fabric', 15, '2026-08-01'),
             ($1, 'option', 'bedframe_fabric_series', 'OLD BN', 'OLD BN · Bed frame fabric', 999, '2026-08-01'),
             ($1, 'option', 'sofa_specials', 'Nylon Fabric', NULL, 150, '2026-08-01')`, [SCHEME])
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'sofa_fabric_series', ' pc151 ', 1, '2026-09-01')`, [SCHEME],
    /no_overlapping_kpi_option/, 'one live row per series in a pool, however it is spelled')

  // ─── September's bills ───────────────────────────────────────────────────

  const batch = await one(`INSERT INTO sales_import_batches(period_month, sub_department_id) VALUES ($1, $2) RETURNING id`, [SEP, FAIR_SUB])
  const order = async (orderNo, total) => one(
    `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, event_date, staff_id, order_total, balance)
     VALUES ($1, $2, $3, '2026-09-12', '2026-09-12', $4, $5, 0) RETURNING id`, [batch, SEP, orderNo, CH, total])
  const putLines = async (orderId, lines) => {
    let n = 0
    for (const l of lines) {
      await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, description2, qty, line_amount, cost_amount, raw)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [orderId, ++n, l.group, l.code, l.d2 ?? null, l.qty ?? 1, l.amount, l.cost ?? null, l.raw ? JSON.stringify(l.raw) : null])
    }
  }
  const bill = async (orderNo, lines) => {
    const o = await order(orderNo, lines.reduce((a, l) => a + l.amount, 0))
    await putLines(o, lines)
    return o
  }
  const fabric = (code, specials) => ({ variants: { fabricCode: code, ...(specials ? { specials } : {}) } })

  // One SOFFIO sofa, three pieces in PC151: one set.
  const f1 = await bill('F1', ['1A(LHF)', 'CNR', '1A(RHF)'].map(m => ({ group: 'sofa', code: `8030-${m}`, amount: 1_000, cost: 400, raw: fabric('PC151-01') })))
  // Two sofas in PC151 on one bill, one read from the ERP's description grammar: two sets.
  const f2 = await bill('F2', [
    { group: 'sofa', code: '8030-2A', amount: 2_000, cost: 800, raw: fabric('pc151-01 ') },
    { group: 'sofa', code: '9058-1A(LHF)', amount: 1_500, cost: 600, d2: 'PC151-18 / SEAT 30 / LEG DEFAULT' },
  ])
  // One model ×2 everywhere: two sofas.
  const f3 = await bill('F3', ['1A(LHF)', '1A(RHF)'].map(m => ({ group: 'sofa', code: `8030-${m}`, qty: 2, amount: 2_000, cost: 800, raw: fabric('PC151-01') })))
  // Two bed frames in PC151 beside a mattress: per bed frame.
  const f4 = await bill('F4', [
    { group: 'mattress', code: 'AK-APEX', amount: 5_000, cost: 2_000 },
    { group: 'bedframe', code: 'CODY-(Q)', qty: 2, amount: 0, cost: 0, raw: fabric('PC151-18') },
  ])
  // Keyed with its fabric TBC.
  const f5 = await bill('F5', [
    { group: 'mattress', code: 'AK-APEX', amount: 4_000, cost: 1_600 },
    { group: 'bedframe', code: 'TRION-(K)', amount: 0, cost: 0, raw: fabric('TBC') },
  ])
  // A code the list holds twice: the live row's series.
  const f6 = await bill('F6', [
    { group: 'mattress', code: 'AK-APEX', amount: 3_000, cost: 1_200 },
    { group: 'bedframe', code: 'CODY-(K)', amount: 0, cost: 0, raw: fabric('BN125-04') },
  ])
  // A returned sofa takes its set back; the exchange of a piece is none.
  const f7 = await bill('F7', ['1A(LHF)', '2A'].map(m => ({ group: 'sofa', code: `8030-${m}`, qty: -1, amount: -1_000, cost: -400, raw: fabric('PC151-01') })))
  const f8 = await bill('F8', [
    { group: 'sofa', code: '8030-1A(LHF)', qty: -1, amount: -900, cost: -400, raw: fabric('PC151-01') },
    { group: 'sofa', code: '8030-1A(RHF)', qty: 1, amount: 1_000, cost: 400, raw: fabric('PC151-01') },
  ])
  // PC151 on a mattress is no sofa's or bed frame's.
  const f9 = await bill('F9', [{ group: 'mattress', code: 'AK-APEX', amount: 3_000, cost: 1_200, raw: fabric('PC151-01') }])
  // A sofa special and the fabric series on one sofa: both, each its own way.
  const f10 = await bill('F10', [
    { group: 'sofa', code: '8030-1A', amount: 2_000, cost: 800, raw: fabric('PC151-01', ['Nylon Fabric']) },
    { group: 'sofa', code: '9058-2A', amount: 2_000, cost: 800, raw: fabric('PC151-18', ['Nylon Fabric']) },
  ])
  // A RM 0.00 exchange in the series covers nothing.
  const f11 = await bill('F11', [{ group: 'sofa', code: '8030-1A', amount: 0, cost: 0, raw: fabric('PC151-01') }])

  const hitsOf = async (orders, asAt = SEP_END) => q(
    `SELECT o.order_no, k.option_pool AS pool, coalesce(k.option_value, k.product_code) AS item,
            h.qty::float AS qty, (h.qty * h.unit_amount)::float AS amount
       FROM comm_kpi_hits($1, $2::uuid[], $3) h
       JOIN sales_orders o ON o.id = h.order_id JOIN comm_kpi_items k ON k.id = h.item_id
      ORDER BY 1, 2, 3`, [SCHEME, orders, asAt])

  check(await hitsOf([f1]), [{ order_no: 'F1', pool: 'sofa_fabric_series', item: 'PC151', qty: 1, amount: 50 }],
    'one sofa, three pieces in the series: once per set')
  check(await hitsOf([f2]), [
    { order_no: 'F2', pool: 'sofa_fabric_series', item: 'PC151', qty: 1, amount: 50 },
    { order_no: 'F2', pool: 'sofa_fabric_series', item: 'PC151', qty: 1, amount: 50 },
  ], 'two sofas in the series on one bill: twice ("Sofa 每组算一次"), the description grammar read too')
  check(await hitsOf([f3]), [{ order_no: 'F3', pool: 'sofa_fabric_series', item: 'PC151', qty: 2, amount: 100 }],
    'one model ×2 everywhere: two sets')
  check(await hitsOf([f4]), [{ order_no: 'F4', pool: 'bedframe_fabric_series', item: 'PC151', qty: 2, amount: 60 }],
    "a bed frame's series per bed frame — the sofa's PC151 item is not a bed frame's")
  check(await hitsOf([f5]), [], 'a fabric keyed TBC carries no series')
  check(await hitsOf([f6]), [{ order_no: 'F6', pool: 'bedframe_fabric_series', item: 'BN125', qty: 1, amount: 15 }],
    "a code listed twice reads the live row's series, never the removed one's")
  check(await hitsOf([f7]), [{ order_no: 'F7', pool: 'sofa_fabric_series', item: 'PC151', qty: -1, amount: -50 }],
    'a returned sofa takes its set back')
  check(await hitsOf([f8, f9, f11]), [], 'an exchanged piece, a mattress and a RM 0.00 exchange carry none')
  check(await hitsOf([f10]), [
    { order_no: 'F10', pool: 'sofa_fabric_series', item: 'PC151', qty: 1, amount: 50 },
    { order_no: 'F10', pool: 'sofa_fabric_series', item: 'PC151', qty: 1, amount: 50 },
    { order_no: 'F10', pool: 'sofa_specials', item: 'Nylon Fabric', qty: 1, amount: 150 },
  ], 'the special once per bill beside the series once per sofa set')
  check(await hitsOf([f1], '2026-07-31'), [], 'an item not yet in force at the as-at')

  // The ERP saves F5 again with its fabric: the order comes back whole, its lines replaced.
  await q(`DELETE FROM sales_order_lines WHERE order_id = $1`, [f5])
  await putLines(f5, [
    { group: 'mattress', code: 'AK-APEX', amount: 4_000, cost: 1_600 },
    { group: 'bedframe', code: 'TRION-(K)', amount: 0, cost: 0, raw: fabric('KS-08') },
  ])
  check(await hitsOf([f5]), [{ order_no: 'F5', pool: 'bedframe_fabric_series', item: 'KS', qty: 1, amount: 20 }],
    'filled in on the ERP, the fabric is found the next time the month is worked out')

  // ─── what the Comm Cal month and the member facts say ────────────────────

  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [SCHEME])
  const month = Object.fromEntries((await q(
    `SELECT order_no, commissionable::float AS c FROM revenue_month_orders($1, $2)`, [FAIR_SUB, SEP])).map(r => [r.order_no, r.c]))
  check([month.F1, month.F2, month.F3, month.F4, month.F5, month.F6, month.F10, month.F11],
    [2_950, 3_400, 3_900, 4_940, 3_980, 2_985, 3_750, 0], "each bill's fabric series off its sales")
  const facts = Object.fromEntries((await q(
    `SELECT order_no, kpi_qty::float AS kpi FROM member_order_facts($1, NULL, NULL)`, [SCHEME])).map(r => [r.order_no, r.kpi]))
  check([facts.F1, facts.F2, facts.F3, facts.F4, facts.F7, facts.F8, facts.F10], [1, 2, 2, 2, -1, 0, 3],
    'and the member facts count the units the run counts')

  // ─── the writer ──────────────────────────────────────────────────────────
  // A scheme of its own, so nothing above moves. "Today" is the office's.

  await q(`INSERT INTO comm_schemes(id, sub_department_id, revenue_cost_divisor) VALUES ($1, $2, 0.7)`, [TAB, FAIR_SUB])
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const saveKpi = adds => one(`SELECT catalogue_save_kpi_items($1, $2::jsonb, '[]'::jsonb, '{}'::uuid[])`, [TAB, JSON.stringify(adds)])
  const rows = () => q(`SELECT option_pool AS pool, option_value AS item, product_name AS name, kpi_amount::float AS amount,
                               effective_from::text AS "from"
                          FROM comm_kpi_items WHERE scheme_id = $1 ORDER BY 1, 2`, [TAB])

  check(await saveKpi([
    { source: 'option', option_pool: 'sofa_fabric_series', option_value: ' pc151 ', kpi_amount: 50 },
    { source: 'option', option_pool: 'bedframe_fabric_series', option_value: 'PC151', kpi_amount: 30 },
    { source: 'option', option_pool: 'bedframe_specials', option_value: 'hb straight', kpi_amount: 200 },
  ]), 3, 'a sofa series, a bed frame series of the same name and a special, in one call')
  check(await rows(), [
    { pool: 'bedframe_fabric_series', item: 'PC151', name: 'PC151 · Bed frame fabric', amount: 30, from: today },
    { pool: 'bedframe_specials', item: 'HB Straight', name: null, amount: 200, from: today },
    { pool: 'sofa_fabric_series', item: 'PC151', name: 'PC151 · Sofa fabric', amount: 50, from: today },
  ], "a series under the fabric list's spelling, named with whose it is; a special as before")
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"option","option_pool":"sofa_fabric_series","option_value":"Velvet Gold","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /not a fabric series on the ERP's fabric list/, 'only a series the fabric list holds')
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"option","option_pool":"sofa_fabric_series","option_value":"PC151","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /no_overlapping_kpi_option/, 'never twice at once')
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"model","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /a SKU, a special or a fabric series/, 'a SKU, a special or a fabric series, nothing else')
  // A new amount keeps the name: the row begun today changes where it stands.
  const sofaId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND option_pool = 'sofa_fabric_series'`, [TAB])
  check(await one(`SELECT catalogue_save_kpi_items($1, '[]'::jsonb, $2::jsonb, '{}')`, [TAB, JSON.stringify([{ id: sofaId, kpi_amount: 60 }])]), 1,
    'a new amount on a series')
  check((await rows()).filter(r => r.pool === 'sofa_fabric_series').map(r => [r.name, r.amount]), [['PC151 · Sofa fabric', 60]],
    'keeps its name')

  console.log(`PASS: ${checks} KPI fabric series checks. Real migrations 20260927050000 + 20261030010000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}
