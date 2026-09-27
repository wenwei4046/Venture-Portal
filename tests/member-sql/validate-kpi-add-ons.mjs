// Local PostgreSQL regression for Product List › Costing Setting and
// › Add-on / KPI Items (2026-09-27).
//
// `20260927050000` runs VERBATIM against a synthetic surrounding schema. What
// is under test is money: which KPI items a bill carries (a SKU by code, a
// bed frame special per bed frame, a sofa special once per bill), that a bill
// pays them only when its sales cover them, that their amount comes off the
// bill's sales in the month page and the member facts alike, and that each
// line's cost is divided by its SKU's own ratio. No live I/O.
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
    INSERT INTO erp_products VALUES ('mfg-special', 'SPECIAL-SKU', 'Special mattress', NULL),
                                    ('mfg-pillow', 'AK-CS PIL', 'Akemi cushion pillow', NULL);
    INSERT INTO erp_maintenance_options(pool, value) VALUES
      ('bedframe_specials', 'HB Straight'), ('bedframe_specials', 'No Side Panel'),
      ('sofa_specials', 'Nylon Fabric'), ('sofa_specials', 'Wooden Arm');
  `)

  await productionFunction('20260917020000_venue_feed_window_pay_preview', 'venue_key')
  await productionFunction('20260924030000_catalogue_costs_the_margin', 'catalogue_value_key')
  await productionFunction('20260924030000_catalogue_costs_the_margin', 'catalogue_line_facts')

  // A row written before the migration: a SKU item, as every one then was.
  await q(`INSERT INTO comm_kpi_items(scheme_id, product_code, kpi_amount, effective_from, effective_to)
           VALUES ($1, 'LEGACY', 10, '2026-01-01', '2026-01-31')`, [SCHEME])

  // The migration references the member app's surroundings (memberships,
  // permissions) in functions this file does not call.
  await db.exec('SET check_function_bodies = off')
  await db.exec(await readFile(new URL('20260927050000_cost_ratios_and_kpi_add_ons.sql', migrations), 'utf8'))
  await db.exec('SET check_function_bodies = on')
  checks++

  // ─── the tables ───────────────────────────────────────────────────────────

  await q(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
           VALUES ($1, 'option', 'bedframe_specials', 'HB Straight', 200, '2026-08-01')`, [SCHEME])
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'bedframe_specials', ' hb  STRAIGHT ', 150, '2026-09-01')`, [SCHEME],
    /no_overlapping_kpi_option/, 'one live row per special, however it is spelled')
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, product_code, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'sku', 'X', 'bedframe_specials', 'HB Straight', 1, '2026-09-01')`, [SCHEME],
    /kpi_item_identity/, 'a SKU item names a code and nothing else')
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'carpet_specials', 'Fringe', 1, '2026-09-01')`, [SCHEME],
    /kpi_item_identity/, 'only a bed frame or a sofa special')
  check(await one(`SELECT source FROM comm_kpi_items WHERE product_code = 'LEGACY'`), 'sku', 'a row written before the migration is a SKU item')

  await q(`INSERT INTO comm_cost_ratios(scheme_id, erp_product_id, product_code, ratio) VALUES ($1, 'mfg-special', 'SPECIAL-SKU', 0.6)`, [SCHEME])
  await reject(`INSERT INTO comm_cost_ratios(scheme_id, erp_product_id, product_code, ratio) VALUES ($1, 'mfg-pillow', ' special-sku ', 0.5)`, [SCHEME],
    /uq_comm_cost_ratio_code/, 'one ratio per code in a scheme, so a line never finds two')
  await reject(`INSERT INTO comm_cost_ratios(scheme_id, erp_product_id, product_code, ratio) VALUES ($1, 'mfg-pillow', 'AK-CS PIL', 0)`, [SCHEME],
    /cost_ratio_range/, 'a ratio is above zero')

  await q(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
           VALUES ($1, 'option', 'sofa_specials', 'Nylon Fabric', 150, '2026-08-01'),
                  ($1, 'option', 'sofa_specials', 'Wooden Arm', 99, '2026-10-01')`, [SCHEME])
  await q(`INSERT INTO comm_kpi_items(scheme_id, source, product_code, kpi_amount, effective_from)
           VALUES ($1, 'sku', 'AK-CS PIL', 50, '2026-08-01')`, [SCHEME])

  // ─── September's bills ───────────────────────────────────────────────────

  const batch = await one(`INSERT INTO sales_import_batches(period_month, sub_department_id) VALUES ($1, $2) RETURNING id`, [SEP, FAIR_SUB])
  const bill = async (orderNo, lines, total = lines.reduce((a, l) => a + l.amount, 0)) => {
    const order = await one(
      `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, event_date, staff_id, order_total, balance)
       VALUES ($1, $2, $3, '2026-09-12', '2026-09-12', $4, $5, 0) RETURNING id`,
      [batch, SEP, orderNo, CH, total])
    let n = 0
    for (const l of lines) {
      await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, description2, qty, line_amount, cost_amount, raw)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [order, ++n, l.group, l.code ?? 'X', l.d2 ?? null, l.qty ?? 1, l.amount, l.cost ?? null, l.raw ? JSON.stringify(l.raw) : null])
    }
    return order
  }
  const hb = { variants: { specials: ['HB Straight'] } }
  const nylon = { variants: { specials: ['Nylon Fabric'] } }

  // The user's own example: RM 10,000 with HB Straight on the bed frame.
  const b1 = await bill('B1', [{ group: 'mattress', code: 'M1', amount: 10_000, cost: 4_550 },
                               { group: 'bedframe', code: 'TRION', amount: 0, cost: 0, raw: hb }])
  // Two bed frames with HB Straight, the ERP's own grammar, a "(…)" on it.
  const b2 = await bill('B2', [{ group: 'mattress', code: 'M1', amount: 5_000, cost: 2_100 },
                               { group: 'bedframe', code: 'CODY', amount: 0, cost: 0, qty: 2,
                                 d2: 'PC151-01 / DIVAN 8" + NO LEG / SPECIAL: HB Straight (to wall)' }])
  // A sofa of three modules, each printing Nylon Fabric.
  const b3 = await bill('B3', [1, 2, 3].map(i => ({ group: 'sofa', code: `5530-${i}`, amount: 1_000, cost: 490, raw: nylon })))
  // A RM 0.00 exchange that still prints it.
  const b4 = await bill('B4', [{ group: 'sofa', code: '5530-1', amount: 0, cost: 0, raw: nylon }])
  // Four free pillows beside a mattress, and a SKU ratio on the mattress.
  const b5 = await bill('B5', [{ group: 'mattress', code: 'SPECIAL-SKU', amount: 6_400, cost: 1_800 },
                               { group: 'accessory', code: ' ak-cs pil ', amount: 0, cost: 0, qty: 4 }])
  // A sofa that happens to print "HB Straight" is not a bed frame.
  const b6 = await bill('B6', [{ group: 'sofa', code: '5530-9', amount: 2_000, cost: 700, raw: hb }])

  const hitsOf = async (orders, asAt = SEP_END) => q(
    `SELECT o.order_no, coalesce(k.option_value, k.product_code) AS item, h.qty::float AS qty, (h.qty * h.unit_amount)::float AS amount
       FROM comm_kpi_hits($1, $2::uuid[], $3) h
       JOIN sales_orders o ON o.id = h.order_id JOIN comm_kpi_items k ON k.id = h.item_id
      ORDER BY 1, 2`, [SCHEME, orders, asAt])

  check(await hitsOf([b1]), [{ order_no: 'B1', item: 'HB Straight', qty: 1, amount: 200 }], 'a bed frame special in raw.variants')
  check(await hitsOf([b2]), [{ order_no: 'B2', item: 'HB Straight', qty: 2, amount: 400 }],
    'per bed frame, read from the description grammar, a trailing (…) set aside')
  check(await hitsOf([b3]), [{ order_no: 'B3', item: 'Nylon Fabric', qty: 1, amount: 150 }], 'a sofa special once per bill')
  check(await hitsOf([b4]), [], 'a RM 0.00 exchange covers nothing, so it pays no KPI')
  check(await hitsOf([b5]), [{ order_no: 'B5', item: 'AK-CS PIL', qty: 4, amount: 200 }], 'a SKU by its code, trimmed and in any case')
  check(await hitsOf([b6]), [], 'a special only in its own category')
  check(await hitsOf([b3], '2026-07-31'), [], 'an item not yet in force at the as-at')

  // ─── what the Comm Cal month says ────────────────────────────────────────

  const month = async () => Object.fromEntries((await q(
    `SELECT order_no, commissionable::float AS c, margin_cost::float AS cost, margin_pct::float AS m
       FROM revenue_month_orders($1, $2)`, [FAIR_SUB, SEP])).map(r => [r.order_no, r]))

  let m = await month()
  check([m.B1.c, m.B3.c, m.B5.c], [10_000, 3_000, 6_400], 'KPI switched off: nothing comes off')
  check(m.B5.cost, 3_000, 'but the SKU ratio already judges the cost: 1,800 ÷ 0.6')
  check(m.B1.cost, 6_500, 'and every other SKU at the default: 4,550 ÷ 0.7')

  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [SCHEME])
  m = await month()
  check([m.B1.c, m.B2.c, m.B3.c, m.B4.c, m.B5.c, m.B6.c], [9_800, 4_600, 2_850, 0, 6_200, 2_000],
    "KPI on: each bill's items off its sales, the exchange paid as it is")
  check(Math.round(m.B1.m * 10_000) / 10_000, Math.round((3_300 / 9_800) * 10_000) / 10_000,
    'its margin judged on 9,800 — the user\'s 33.7%')

  // ─── what the member app says ────────────────────────────────────────────

  const facts = Object.fromEntries((await q(
    `SELECT order_no, revenue::float AS revenue, goods_revenue::float AS goods, kpi_qty::float AS kpi
       FROM member_order_facts($1, NULL, NULL)`, [SCHEME])).map(r => [r.order_no, r]))
  check([facts.B1.revenue, facts.B1.goods, facts.B1.kpi], [9_800, 9_800, 1], 'the member facts agree with the month')
  check([facts.B2.kpi, facts.B3.kpi, facts.B4.kpi, facts.B5.kpi], [2, 1, 0, 4], 'and count the KPI items the run counts')

  // ─── the Product List's writers ──────────────────────────────────────────
  // A scheme of their own, so nothing above moves. "Today" is the office's.

  const TAB = id(6)
  await q(`INSERT INTO comm_schemes(id, sub_department_id, revenue_cost_divisor) VALUES ($1, $2, 0.7)`, [TAB, FAIR_SUB])
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const yesterday = await one(`SELECT (((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) - 1)::text`)
  const daysAgo = n => q(`SELECT (((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) - $1::int)::text AS d`, [n]).then(r => r[0].d)
  const saveCost = (divisor, ratios, removes = []) =>
    one(`SELECT catalogue_save_cost_setting($1, $2, $3::jsonb, $4::text[])`, [TAB, divisor, JSON.stringify(ratios), removes])
  const ratioRows = () => q(`SELECT erp_product_id, product_code, ratio::float AS ratio FROM comm_cost_ratios WHERE scheme_id = $1 ORDER BY 1`, [TAB])

  check(await saveCost(0.65, [{ erp_product_id: 'mfg-special', ratio: 0.6 }]), 2, 'the ratio and one SKU, in one call')
  check(Number(await one(`SELECT revenue_cost_divisor FROM comm_schemes WHERE id = $1`, [TAB])), 0.65, "the sub-department's ratio")
  check(await ratioRows(), [{ erp_product_id: 'mfg-special', product_code: 'SPECIAL-SKU', ratio: 0.6 }],
    "a SKU's own ratio, its code read from the SKU master")
  check(await saveCost(0.65, [{ erp_product_id: 'mfg-special', ratio: 0.6 }]), 1, 'an unchanged ratio is not a write')
  await q(`UPDATE erp_products SET item_code = 'SPECIAL-SKU-2' WHERE erp_id = 'mfg-special'`)
  await saveCost(null, [{ erp_product_id: 'mfg-special', ratio: 0.55 }])
  check(await ratioRows(), [{ erp_product_id: 'mfg-special', product_code: 'SPECIAL-SKU-2', ratio: 0.55 }],
    'saving a SKU the ERP renamed follows it to its new code')
  await q(`UPDATE erp_products SET item_code = 'SPECIAL-SKU' WHERE erp_id = 'mfg-special'`)
  await reject(`SELECT catalogue_save_cost_setting($1, NULL, '[{"erp_product_id":"nobody","ratio":0.6}]'::jsonb, '{}')`, [TAB],
    /not in the SKU Master/, 'a SKU the master does not hold')
  await reject(`SELECT catalogue_save_cost_setting($1, 0, '[]'::jsonb, '{}')`, [TAB], /above 0/, 'a ratio of nothing')
  check(await saveCost(null, [], ['mfg-special']), 1, 'a SKU back to the ratio of its sub-department')
  check([await ratioRows(), Number(await one(`SELECT revenue_cost_divisor FROM comm_schemes WHERE id = $1`, [TAB]))], [[], 0.65],
    "and the sub-department's ratio left alone")

  const saveKpi = (adds, changes = [], removes = []) =>
    one(`SELECT catalogue_save_kpi_items($1, $2::jsonb, $3::jsonb, $4::uuid[])`,
      [TAB, JSON.stringify(adds), JSON.stringify(changes), removes])
  const kpiRows = () => q(
    `SELECT source, coalesce(option_value, product_code) AS item, product_name AS name, kpi_amount::float AS amount,
            effective_from::text AS "from", effective_to::text AS "to"
       FROM comm_kpi_items WHERE scheme_id = $1 ORDER BY 2, 5`, [TAB])
  const kpiId = async (item, from) => one(
    `SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND coalesce(option_value, product_code) = $2 AND effective_from = $3`,
    [TAB, item, from])

  check(await saveKpi([{ source: 'sku', erp_product_id: 'mfg-pillow', kpi_amount: 50 },
                       { source: 'option', option_pool: 'bedframe_specials', option_value: ' hb  STRAIGHT ', kpi_amount: 200 }]), 2,
    'two items added in one call')
  check(await kpiRows(), [
    { source: 'sku', item: 'AK-CS PIL', name: 'Akemi cushion pillow', amount: 50, from: today, to: null },
    { source: 'option', item: 'HB Straight', name: null, amount: 200, from: today, to: null },
  ], "in force from today: a SKU under its master's code and name, a special under its pool's spelling")
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"option","option_pool":"bedframe_specials","option_value":"Gold Trim","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /not in the bedframe_specials Maintenance pool/, 'only a special its pool holds')
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"option","option_pool":"bedframe_specials","option_value":"HB Straight","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /no_overlapping_kpi_option/, 'never twice at once')
  await reject(`SELECT catalogue_save_kpi_items($1, '[{"source":"model","kpi_amount":1}]'::jsonb, '[]'::jsonb, '{}')`,
    [TAB], /a SKU or a special/, 'a SKU or a special, nothing else')

  // Begun today: a change is the row itself.
  check(await saveKpi([], [{ id: await kpiId('AK-CS PIL', today), kpi_amount: 60 }]), 1, 'a new amount on an item begun today')
  check((await kpiRows()).filter(r => r.item === 'AK-CS PIL').map(r => [r.amount, r.from, r.to]), [[60, today, null]],
    'changes it where it stands')

  // Begun before today: the old amount keeps its days.
  const tenDaysAgo = await daysAgo(10)
  await q(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
           VALUES ($1, 'option', 'sofa_specials', 'Nylon Fabric', 150, $2)`, [TAB, tenDaysAgo])
  const nylonBefore = await kpiId('Nylon Fabric', tenDaysAgo)
  check(await saveKpi([], [{ id: nylonBefore, kpi_amount: 180 }]), 1, 'a new amount on an item begun before today')
  check((await kpiRows()).filter(r => r.item === 'Nylon Fabric').map(r => [r.amount, r.from, r.to]),
    [[150, tenDaysAgo, yesterday], [180, today, null]], 'closes it yesterday and opens the new amount today')
  check(await saveKpi([], [{ id: await kpiId('Nylon Fabric', today), kpi_amount: 180 }]), 0, 'an unchanged amount is not a write')

  // Removed: begun before today closes yesterday; begun today goes.
  const fiveDaysAgo = await daysAgo(5)
  await q(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
           VALUES ($1, 'option', 'sofa_specials', 'Wooden Arm', 99, $2)`, [TAB, fiveDaysAgo])
  check(await saveKpi([], [], [await kpiId('Wooden Arm', fiveDaysAgo), await kpiId('Nylon Fabric', today)]), 2, 'two removed')
  check((await kpiRows()).filter(r => r.source === 'option' && r.item !== 'HB Straight').map(r => [r.item, r.amount, r.from, r.to]), [
    ['Nylon Fabric', 150, tenDaysAgo, yesterday],
    ['Wooden Arm', 99, fiveDaysAgo, yesterday],
  ], 'the month already run keeps them; the amount begun today never was')
  await reject(`SELECT catalogue_save_kpi_items($1, '[]'::jsonb, '[]'::jsonb, $2::uuid[])`, [TAB, [nylonBefore]],
    /changed since the page was opened/, 'an item no longer in force')
  await reject(`SELECT catalogue_save_kpi_items($1, '[]'::jsonb, $2::jsonb, '{}')`,
    [SCHEME, JSON.stringify([{ id: await kpiId('AK-CS PIL', today), kpi_amount: 1 }])],
    /changed since the page was opened/, "never another sub-department's item")

  console.log(`PASS: ${checks} KPI add-on and cost ratio checks. Real migration 20260927050000; synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}
