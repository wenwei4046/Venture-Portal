// Local PostgreSQL regression for 20261112200000 — 2990s' own KPI items (2026-11-12; the user: "这个 KPI item 是独立的，
// 属于 2990 专属的 KPI item", "Upgrade fabric … Bonus RM50 — Upgrade latex seat … Bonus by tier (units)", and of the
// upgrade's money "升级的钱只拿 bonus").
//
// Production's bodies (tests/member-sql/brand-kpi-items-production.sql, pg_get_functiondef, md5-checked: the hits,
// the writer, Comm Cal's month, both Quote contexts, the member's KPI card, and the two readers of a line the hits
// call) are loaded over stand-ins for what they read; the migration then runs VERBATIM, twice. What is under test is
// money: which bills find a brand's own item (its brand's alone, only where the bill charges for the special, once a
// sofa set, at what it charged), that the sub-department's own items are found as before and only while its switch is
// on, that Comm Cal's month takes the upgrade's money off the bill with the switch off, what the writer stores for a
// brand's item, and that the Quote and the KPI card keep to the sub-department's own. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const MIGRATION = new URL('../../supabase/migrations/20261112200000_brand_kpi_items.sql', import.meta.url)
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

const DEPT = id(90)
const FAIR = id(1)
const SCHEME = id(5)
const TAB = id(6)
const BATCH = id(7)
const PRINCIPAL = id(8)
const AKEMI = id(21)
const OWN = id(22)
const TAB_OWN = id(23)
const TAB_AKEMI = id(24)
const ETHAN = id(31)
const SHELDON = id(32)
const NOV = '2026-11-01'
const NOV_END = '2026-11-30'

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE users(id uuid PRIMARY KEY, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, payroll_source text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text, code text, is_active boolean NOT NULL DEFAULT true,
      department_id uuid);
    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, enable_kpi boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date,
      deposit_threshold_pct numeric, revenue_cost_divisor numeric(6,4) NOT NULL DEFAULT 1);
    -- comm_brands as 20261112003700 leaves it (the columns read here).
    CREATE TABLE comm_brands(id uuid PRIMARY KEY, scheme_id uuid NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
      code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      own_scheme boolean NOT NULL DEFAULT false, erp_company_id bigint,
      CONSTRAINT uq_comm_brand_code UNIQUE (scheme_id, code));
    CREATE TABLE comm_margin_bands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text,
      label text, margin_pct numeric, commission_multiplier numeric NOT NULL DEFAULT 1, monthly_incentive numeric NOT NULL DEFAULT 0);
    CREATE TABLE comm_hierarchy(staff_id uuid, scheme_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_kpi_thresholds(scheme_id uuid, min_qty integer, bonus_pct numeric,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
    CREATE TABLE comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
    CREATE TABLE comm_cost_ratio_brands(scheme_id uuid, product_code text, brand_code text, ratio numeric);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text, canonical_key text);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE comm_venue_events(venue_key text, organiser_id uuid, period_month date, start_date date);
    CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
      status text NOT NULL DEFAULT 'committed');
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date,
      customer_name text, debtor_code text, venue text, location text, brand_code text,
      order_total numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0, balance numeric,
      cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text, erp_on_hold boolean,
      sequence_in_day integer, staff_id uuid, agent_name text, manual_margin_pct numeric, raw jsonb);
    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      line_no integer, item_group text, product_code text, description2 text, qty numeric NOT NULL DEFAULT 1,
      line_amount numeric NOT NULL DEFAULT 0, cost_amount numeric, option_charge_amount numeric, brand_code text, raw jsonb);
    CREATE TABLE erp_products(erp_id text PRIMARY KEY, item_code text NOT NULL, description text);
    CREATE TABLE erp_maintenance_options(erp_company_id bigint NOT NULL DEFAULT 1, pool text NOT NULL, value text NOT NULL,
      removed_at timestamptz);
    CREATE TABLE erp_fabrics(erp_company_id bigint NOT NULL DEFAULT 1, erp_id text NOT NULL, fabric_code text NOT NULL,
      series text, active boolean NOT NULL DEFAULT true, synced_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz);

    -- Stand-ins for production's helpers.
    CREATE FUNCTION venue_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
    CREATE FUNCTION ref_no(sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
    CREATE FUNCTION paper_no(sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
    CREATE FUNCTION sales_order_gwp_free(uuid[]) RETURNS TABLE(line_id uuid, free_qty numeric) LANGUAGE sql STABLE AS
      $$ SELECT NULL::uuid, NULL::numeric WHERE false $$;
    CREATE FUNCTION member_staff_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${ETHAN}'::uuid $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION member_has_membership(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION member_director_scheme(uuid, uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION member_order_facts(p_scheme uuid, p_from date, p_until date)
    RETURNS TABLE(order_id uuid, staff_id uuid, cleared boolean) LANGUAGE sql STABLE AS
      $$ SELECT o.id, o.staff_id, true FROM sales_orders o WHERE o.period_month >= p_from AND o.period_month < p_until $$;
    CREATE FUNCTION sales_order_parts(p_orders uuid[]) RETURNS TABLE(order_id uuid, staff_id uuid, part numeric)
    LANGUAGE sql STABLE AS $$ SELECT o.id, o.staff_id, 1::numeric FROM sales_orders o WHERE o.id = ANY (p_orders) $$;
  `)

  // ── Production's bodies, as the migration was written from ─────────────────
  await db.exec('SET check_function_bodies = off')
  await db.exec((await readFile(new URL('./brand-kpi-items-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  await db.exec('SET check_function_bodies = on')

  // comm_kpi_items exactly as production holds it (2026-11-12: columns and constraints).
  await db.exec(`
    CREATE TABLE comm_kpi_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id uuid NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
      product_code text, product_name text, kpi_amount numeric(15,2) NOT NULL,
      effective_from date NOT NULL, effective_to date, created_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL DEFAULT 'sku',
      erp_product_id text REFERENCES erp_products(erp_id), option_pool text, option_value text,
      CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
      CONSTRAINT kpi_amount_non_negative CHECK (kpi_amount >= 0),
      CONSTRAINT kpi_item_identity CHECK (
        (source = 'sku' AND product_code IS NOT NULL AND btrim(product_code) <> '' AND option_pool IS NULL AND option_value IS NULL)
        OR (source = 'option' AND product_code IS NULL AND erp_product_id IS NULL
            AND option_pool = ANY (ARRAY['bedframe_specials', 'sofa_specials', 'bedframe_fabric_series', 'sofa_fabric_series'])
            AND option_value IS NOT NULL AND btrim(option_value) <> '')),
      CONSTRAINT kpi_item_source CHECK (source = ANY (ARRAY['sku', 'option'])),
      CONSTRAINT no_overlapping_kpi_item EXCLUDE USING gist (
        scheme_id WITH =, (upper(btrim(product_code))) WITH =, daterange(effective_from, effective_to, '[]') WITH &&),
      CONSTRAINT no_overlapping_kpi_option EXCLUDE USING gist (
        scheme_id WITH =, option_pool WITH =, (catalogue_value_key(option_value)) WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&) WHERE (source = 'option'));

    INSERT INTO users VALUES ('${PRINCIPAL}', 'principal', true);
    INSERT INTO departments VALUES ('${DEPT}', 'commission');
    INSERT INTO comm_sub_departments VALUES ('${FAIR}', 'Fair', 'FAIR', true, '${DEPT}');
    INSERT INTO hr_staff_costs VALUES ('${ETHAN}', 'ETHAN', 'HV101'), ('${SHELDON}', 'SHELDON TAN', 'HV102');
    INSERT INTO comm_schemes(id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES
      ('${SCHEME}', '${FAIR}', 0.3, 0.7), ('${TAB}', '${FAIR}', 0.3, 0.7);
    UPDATE comm_schemes SET is_active = false WHERE id = '${TAB}';
    INSERT INTO comm_brands(id, scheme_id, code, name, own_scheme, erp_company_id) VALUES
      ('${AKEMI}', '${SCHEME}', 'AKEMI', 'Akemi', false, NULL), ('${OWN}', '${SCHEME}', '2990S', '2990s', true, 2),
      ('${TAB_AKEMI}', '${TAB}', 'AKEMI', 'Akemi', false, NULL), ('${TAB_OWN}', '${TAB}', 'SOFAZ', 'Sofaz', true, 2);
    INSERT INTO comm_hierarchy(staff_id, scheme_id) VALUES ('${ETHAN}', '${SCHEME}'), ('${SHELDON}', '${SCHEME}');
    INSERT INTO comm_kpi_thresholds(scheme_id, min_qty, bonus_pct) VALUES ('${SCHEME}', 10, 0.2);
    INSERT INTO comm_item_groups VALUES
      ('${SCHEME}', 'MATTRESS', true), ('${SCHEME}', 'SOFA', true), ('${SCHEME}', 'ACCESSORY', true),
      ('${SCHEME}', 'BEDFRAME', true), ('${SCHEME}', 'SERVICE', false);
    INSERT INTO erp_products VALUES ('p1', 'AK-PILLOW', 'AKEMI PILLOW');
    -- The same special in both companies' pools, each in its own spelling.
    INSERT INTO erp_maintenance_options(erp_company_id, pool, value) VALUES
      (1, 'sofa_specials', 'Latex Seat'), (1, 'sofa_specials', 'NYLON FABRIC'), (1, 'sofa_specials', 'Hand Stitch'),
      (1, 'bedframe_specials', 'HB Straight'),
      (2, 'sofa_specials', 'Latex Seat'), (2, 'sofa_specials', 'Sofa Full Fabric'), (2, 'sofa_specials', 'Nylon Fabric'),
      (2, 'bedframe_specials', 'HB Straight');
    INSERT INTO sales_import_batches VALUES ('${BATCH}', '${FAIR}', '${NOV}', 'committed');

    -- The sub-department's own items, in force since August: a sofa special and a SKU.
    INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'option', 'sofa_specials', 'Latex Seat', 40, '2026-08-01');
    INSERT INTO comm_kpi_items(scheme_id, source, product_code, product_name, erp_product_id, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'sku', 'AK-PILLOW', 'AKEMI PILLOW', 'p1', 30, '2026-08-01');
  `)

  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    hits: 'public.comm_kpi_hits(uuid, uuid[], date)',
    save: 'public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])',
    month: 'public.revenue_month_orders(uuid, date)',
    quote: 'public.member_quote_context(uuid)',
    pquote: 'public.member_principal_quote_context(uuid)',
    kpi: 'public.member_kpi_for_staff(uuid, uuid, date)',
  }
  const PRODUCTION = {
    hits: '456161456dccbfd6842ad3a79b917c52',
    save: '85becfc13d24352ac162e73f80af4320',
    month: '99c8386e4549d99c963b250c4538ce80',
    quote: 'a11b580df9e5ee3ca636c1675d74e7fc',
    pquote: '92a65b713ff10d22b2c6ff1b0685e841',
    kpi: 'b5b431e78aaffd51cad678c68321166a',
  }
  for (const [name, md5] of Object.entries(PRODUCTION)) {
    check(await md5Of(SIG[name]), md5, `${name}: the fixture is production's body`)
  }

  // ── November's bills ───────────────────────────────────────────────────────
  // A bill as the ERP delivers it: its lines, and the same items whole on the order (raw.items), where the special
  // order's money is — custom_specials on every piece of the set, the set's surcharge on each.
  let seq = 0
  const bill = async (orderNo, brand, staff, lines) => {
    const items = lines.map((l, i) => ({
      line_no: i, item_code: l.code, cancelled: l.cancelled ?? false,
      ...(l.specials ? { variants: { specials: l.specials } } : {}),
      custom_specials: l.custom ?? [],
    }))
    const total = lines.reduce((a, l) => a + l.amount, 0)
    const orderId = await one(
      `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, brand_code, order_total, paid_amount, staff_id, sequence_in_day, raw)
       VALUES ($1, $2, $3, '2026-11-08', $4, $5, $5, $6, $7, $8) RETURNING id`,
      [BATCH, NOV, orderNo, brand, total, staff, ++seq, JSON.stringify({ items })])
    for (const [i, l] of lines.entries()) {
      await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, qty, line_amount, brand_code, raw)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, i, l.group, l.code, l.qty ?? 1, l.amount, brand,
          l.specials ? JSON.stringify({ variants: { specials: l.specials } }) : null])
    }
    return orderId
  }
  const sofa = (code, amount, specials, custom, more = {}) => ({ group: 'sofa', code, amount, specials, custom, ...more })
  const charge = (description, rm) => ({ description, surchargeSen: rm * 100 })
  const delivery = { group: 'service', code: 'SVC-DELIVERY', amount: 250 }

  // 2990-SO-2611-017 as production holds it: one sofa, Latex Seat RM 500 inside the sofa's RM 3,740.
  const n1 = await bill('N1', '2990S', ETHAN, [
    sofa('BOAAT-1A(P)(LHF)', 1870, ['Latex Seat'], [charge('Latex Seat', 500)]),
    sofa('BOAAT-1A(P)(RHF)', 1870, ['Latex Seat'], [charge('Latex Seat', 500)]),
    delivery,
  ])
  // 2990-SO-2611-023: Sofa Full Fabric RM 250 beside a RM 10 the special order also charges.
  const n2 = await bill('N2', '2990S', SHELDON, [
    sofa('TELLUC-2A(LHF)', 1625, ['Sofa Full Fabric'], [charge('Sofa Full Fabric', 250), charge('Miscellaneous', 10)]),
    sofa('TELLUC-L(RHF)', 1625, ['Sofa Full Fabric'], [charge('Sofa Full Fabric', 250), charge('Miscellaneous', 10)]),
    delivery,
  ])
  // The upgrade given away: named, charged nothing.
  const n3 = await bill('N3', '2990S', ETHAN, [
    sofa('QUBBU-1A(LHF)', 1495, ['Latex Seat'], [charge('Latex Seat', 0)]),
    sofa('QUBBU-2A(RHF)', 1495, ['Latex Seat'], [charge('Latex Seat', 0)]),
  ])
  // Typed into the special order by hand: charged, not one of the sofa's specials.
  const n4 = await bill('N4', '2990S', ETHAN, [
    sofa('QUBBU-1A(LHF)', 1745, null, [charge('Latex Seat', 500)]),
    sofa('QUBBU-2A(RHF)', 1745, null, [charge('Latex Seat', 500)]),
  ])
  // Two sofas on one bill, each with latex — the corner's at RM 1,000.
  const n5 = await bill('N5', '2990S', SHELDON, [
    sofa('BOAAT-2A', 3490, ['Latex Seat'], [charge('Latex Seat', 500)]),
    sofa('KABBIN-2A(LHF)', 3990, ['Latex Seat'], [charge('Latex Seat', 1000)]),
    sofa('KABBIN-L(RHF)', 0, ['Latex Seat'], [charge('Latex Seat', 1000)]),
  ])
  // One model twice: two sofas.
  const n6 = await bill('N6', '2990S', SHELDON, [
    sofa('LOTTI-2A(LHF)', 3490, ['Latex Seat'], [charge('Latex Seat', 500)], { qty: 2 }),
    sofa('LOTTI-L(RHF)', 3490, ['Latex Seat'], [charge('Latex Seat', 500)], { qty: 2 }),
  ])
  // Its sales do not cover what the special order charges.
  const n7 = await bill('N7', '2990S', ETHAN, [sofa('BOAAT-2A', 400, ['Latex Seat'], [charge('Latex Seat', 500)])])
  // The same special in other words on the line: "Latex Seat (Corner)" is the brand's Latex Seat.
  const n8 = await bill('N8', '2990S', ETHAN, [
    sofa('KABBIN-2A(LHF)', 3990, ['Latex Seat (Corner)'], [charge('latex  seat (corner)', 1000)]),
  ])
  // A bill of the sub-department's own: the same special, the same money on its special order, and two pillows.
  const a1 = await bill('A1', 'AKEMI', ETHAN, [
    sofa('8030-2A', 3000, ['Latex Seat'], [charge('Latex Seat', 500)]),
    { group: 'accessory', code: 'AK-PILLOW', amount: 200, qty: 2 },
  ])

  const NO_BRAND_ITEM = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'comm_kpi_items' AND column_name = 'brand_id'`)
  check(NO_BRAND_ITEM, [], 'before the migration an item has no brand')

  // ── The migration, verbatim — twice ────────────────────────────────────────
  const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(migration)
  await db.exec(migration)
  checks++

  const MAKES = Object.fromEntries([...migration.matchAll(/\('(public\.[^']+)',\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
    .map(m => [m[1], { from: m[2], makes: m[3] }]))
  for (const [name, sig] of Object.entries(SIG)) {
    check(MAKES[sig]?.from, PRODUCTION[name], `${name}: the migration is written from production's body`)
    check(await md5Of(sig), MAKES[sig]?.makes, `${name}: what stands is what the migration says it makes`)
  }

  // ── The user's two items ───────────────────────────────────────────────────
  const brandItems = scheme => q(
    `SELECT b.code AS brand, k.option_pool AS pool, k.option_value AS special, k.product_name AS name,
            k.kpi_amount::float AS amount, k.unit_tiers AS tiers, k.effective_from::text AS "from", k.effective_to::text AS "to"
       FROM comm_kpi_items k JOIN comm_brands b ON b.id = k.brand_id
      WHERE k.scheme_id = $1 ORDER BY k.option_value, k.effective_from`, [scheme])
  check(await brandItems(SCHEME), [
    { brand: '2990S', pool: 'sofa_specials', special: 'Latex Seat', name: 'Upgrade latex seat', amount: 50,
      tiers: [{ min_qty: 5, amount: 70 }, { min_qty: 10, amount: 100 }], from: NOV, to: null },
    { brand: '2990S', pool: 'sofa_specials', special: 'Sofa Full Fabric', name: 'Upgrade fabric', amount: 50,
      tiers: [], from: NOV, to: null },
  ], "2990S's two items, once — RM 50 a unit, latex by tier — from November")
  check(await brandItems(TAB), [], 'a brand of another name gets none')
  check(await q(`SELECT count(*)::int AS n FROM comm_kpi_items WHERE scheme_id = $1 AND brand_id IS NULL AND unit_tiers = '[]'`, [SCHEME]),
    [{ n: 2 }], "the sub-department's own items are its own still, with no tiers")

  // ── The table ──────────────────────────────────────────────────────────────
  const tiersValid = v => one(`SELECT comm_kpi_unit_tiers_valid($1::jsonb)`, [JSON.stringify(v)])
  check(await Promise.all([
    [], [{ min_qty: 5, amount: 70 }, { min_qty: 10, amount: 100 }], [{ min_qty: 2, amount: 0 }],
  ].map(tiersValid)), [true, true, true], 'tiers: none, the two the user gave, from 2 units up')
  check(await Promise.all([
    { min_qty: 5, amount: 70 }, [{ min_qty: 1, amount: 70 }], [{ min_qty: 5, amount: 70 }, { min_qty: 5, amount: 80 }],
    [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }], [{ min_qty: 2.5, amount: 70 }], [{ min_qty: 5, amount: -1 }],
    [{ min_qty: 5, amount: '70' }], [{ min_qty: 5 }], [{ min_qty: 5, amount: 70, note: 'x' }], [5],
  ].map(tiersValid)), Array(10).fill(false),
  'never: not a list, from 1 unit, a tier not above the one before, half a unit, a negative amount, words, a missing or an extra key')

  const insertItem = `INSERT INTO comm_kpi_items(scheme_id, brand_id, source, product_code, option_pool, option_value, kpi_amount, unit_tiers, effective_from)
                      VALUES ($1, $2, $3, $4, $5, $6, 10, $7::jsonb, '2026-12-01')`
  await reject(insertItem, [SCHEME, OWN, 'sku', 'AK-PILLOW', null, null, '[]'], /kpi_item_brand_kinds/, "a brand's item is never a SKU")
  await reject(insertItem, [SCHEME, OWN, 'option', null, 'bedframe_specials', 'HB Straight', '[]'], /kpi_item_brand_kinds/,
    "nor a bed frame's special")
  await reject(insertItem, [SCHEME, null, 'option', null, 'sofa_specials', 'Hand Stitch', '[{"min_qty":5,"amount":70}]'],
    /kpi_item_tiers_are_a_brands/, "only a brand's item pays by tier")
  await reject(insertItem, [SCHEME, OWN, 'option', null, 'sofa_specials', 'Nylon Fabric', '[{"min_qty":1,"amount":70}]'],
    /kpi_item_unit_tiers_valid/, 'a tier the rule refuses')
  await reject(insertItem, [SCHEME, TAB_OWN, 'option', null, 'sofa_specials', 'Nylon Fabric', '[]'], /comm_kpi_items_brand_fkey/,
    "a brand of another scheme is not this scheme's")
  await reject(`INSERT INTO comm_kpi_items(scheme_id, brand_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, $2, 'option', 'sofa_specials', ' latex  seat ', 1, '2026-12-01')`, [SCHEME, OWN],
  /no_overlapping_kpi_option/, "one item a special at a time for a brand — beside the sub-department's own Latex Seat")
  await reject(`DELETE FROM comm_brands WHERE id = $1`, [OWN], /comm_kpi_items_brand_fkey/, 'a brand with items is not deleted from under them')

  // ── What a bill's special order charges ────────────────────────────────────
  const moneyOf = async orders => (await q(
    `SELECT o.order_no, l.line_no, m.special_key, m.amount::float AS amount
       FROM sales_order_special_money($1::uuid[]) m
       JOIN sales_orders o ON o.id = m.order_id JOIN sales_order_lines l ON l.id = m.line_id
      ORDER BY 1, 2, 3`, [orders])).map(r => `${r.order_no}#${r.line_no} ${r.special_key} ${r.amount}`)
  check(await moneyOf([n1, n2, n3]), [
    'N1#0 latex seat 500', 'N1#1 latex seat 500',
    'N2#0 miscellaneous 10', 'N2#0 sofa full fabric 250', 'N2#1 miscellaneous 10', 'N2#1 sofa full fabric 250',
  ], "each piece's copy of the set's surcharge, by the special's name; one that charges nothing is not listed")
  await q(`UPDATE sales_orders SET raw = jsonb_set(raw, '{items,0,cancelled}', 'true') WHERE id = $1`, [n8])
  check(await moneyOf([n8]), [], 'a cancelled item charges nothing')
  await q(`UPDATE sales_orders SET raw = jsonb_set(raw, '{items,0,cancelled}', 'false') WHERE id = $1`, [n8])
  check(await moneyOf([n8]), ['N8#0 latex seat (corner) 1000'], 'the name as the special order spells it, in one case and one space')
  check(await moneyOf([a1]), ['A1#0 latex seat 500'], "any bill's, whose reader may read it")

  // ── The items a bill carries ───────────────────────────────────────────────
  const hitsOf = async (orders, asAt = NOV_END) => (await q(
    `SELECT o.order_no, coalesce(k.product_name, k.option_value, k.product_code) AS item, (k.brand_id IS NOT NULL) AS brand,
            h.qty::float AS qty, h.unit_amount::float AS unit
       FROM comm_kpi_hits($1, $2::uuid[], $3) h
       JOIN sales_orders o ON o.id = h.order_id JOIN comm_kpi_items k ON k.id = h.item_id
      ORDER BY 1, 2, 5`, [SCHEME, orders, asAt])).map(r => `${r.order_no} ${r.brand ? 'brand' : 'own'} ${r.item} ×${r.qty} @${r.unit}`)
  const everyBill = [n1, n2, n3, n4, n5, n6, n7, n8, a1]

  // The sub-department's KPI switch is OFF (as Fair's is): a brand's own are paid all the same.
  check(await hitsOf([n1]), ['N1 brand Upgrade latex seat ×1 @500'],
    'one sofa with a latex seat: one unit, and RM 500 — what the bill charged — off its sales')
  check(await hitsOf([n2]), ['N2 brand Upgrade fabric ×1 @250'], 'full fabric: RM 250 off; the RM 10 beside it is no item')
  check(await hitsOf([n3, n4, n7]), [], 'given away, typed by hand, or more than the bill sold: no unit')
  check(await hitsOf([n5]), ['N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @1000'],
    'two sofas on one bill: a unit each, each at its own surcharge — the corner RM 1,000')
  check(await hitsOf([n6]), ['N6 brand Upgrade latex seat ×2 @500'], 'one model twice: two units')
  check(await hitsOf([n8]), ['N8 brand Upgrade latex seat ×1 @1000'], 'the special with words in brackets is the item without them')
  check(await hitsOf([a1]), [], "the sub-department's own items are not counted while its switch is off — nor a brand's on its bill")
  check(await hitsOf([n1, n2], '2026-10-31'), [], "October's as-at: the brand's items begin in November")

  const monthOf = async () => Object.fromEntries((await q(
    `SELECT order_no, commissionable::float AS c FROM revenue_month_orders($1, $2)`, [FAIR, NOV])).map(r => [r.order_no, r.c]))
  check(await monthOf(), { N1: 3240, N2: 3000, N3: 2990, N4: 3490, N5: 5980, N6: 5980, N7: 400, N8: 2990, A1: 3200 },
    "Comm Cal's month with the switch off: the upgrade's money is off each 2990s bill's sales, the rest as they were")

  // The switch ON: the sub-department's own are found on its own bills, as before.
  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [SCHEME])
  check(await hitsOf([a1]), ['A1 own AKEMI PILLOW ×2 @30', 'A1 own Latex Seat ×1 @40'],
    "the sub-department's bill: its own special once a bill at the item's amount, its SKU a unit — never the brand's")
  check(await hitsOf([n1, n2, n5]), [
    'N1 brand Upgrade latex seat ×1 @500', 'N2 brand Upgrade fabric ×1 @250',
    'N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @1000',
  ], "a 2990s bill: the brand's items alone — never the sub-department's Latex Seat at RM 40")
  check((await hitsOf(everyBill)).length, 8, 'and all of them together: eight findings on nine bills')
  check(await monthOf(), { N1: 3240, N2: 3000, N3: 2990, N4: 3490, N5: 5980, N6: 5980, N7: 400, N8: 2990, A1: 3100 },
    "the month with the switch on: the sub-department's bill loses its own items' RM 100 too")

  // The brand switched off: its bills are the sub-department's again.
  await q(`UPDATE comm_brands SET is_active = false WHERE id = $1`, [OWN])
  check(await hitsOf([n1, n3]), ['N1 own Latex Seat ×1 @40', 'N3 own Latex Seat ×1 @40'],
    "a bill of a brand no longer on its own scheme finds the sub-department's items")
  await q(`UPDATE comm_brands SET is_active = true WHERE id = $1`, [OWN])

  // ── The Quote and the member's KPI card: the sub-department's own ──────────
  const quoteItems = async fn => ((await one(`SELECT ${fn}($1)`, [SCHEME])).kpiItems ?? [])
    .map(k => `${k.source}:${k.option_value ?? k.product_code}@${Number(k.kpi_amount)}`).sort()
  check(await quoteItems('member_quote_context'), ['option:Latex Seat@40', 'sku:AK-PILLOW@30'],
    "the Quote prices the sub-department's own KPI items — a brand on its own scheme has no calculator")
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [PRINCIPAL])
  check(await quoteItems('member_principal_quote_context'), ['option:Latex Seat@40', 'sku:AK-PILLOW@30'], "and the Principal's preview of it")
  const card = await one(`SELECT member_kpi_for_staff($1, $2, $3)`, [ETHAN, SCHEME, NOV])
  check([card.enabled, Number(card.total), card.threshold, card.items.map(i => `${i.label} ${Number(i.quantity)}`)],
    [true, 3, 10, ['AKEMI PILLOW 2', 'Latex Seat 1']],
    "the member's KPI card counts the sub-department's own items against its own threshold — not the brand's units")

  // ── The writer ─────────────────────────────────────────────────────────────
  // A scheme of its own, so nothing above moves. "Today" is the office's.
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const save = (adds = [], changes = [], removes = []) => one(
    `SELECT catalogue_save_kpi_items($1, $2::jsonb, $3::jsonb, $4::uuid[])`, [TAB, JSON.stringify(adds), JSON.stringify(changes), removes])
  const refused = async (adds, changes, pattern, what) => {
    await assert.rejects(() => save(adds, changes), pattern, what)
    checks++
  }
  const nylon = { source: 'option', option_pool: 'sofa_specials', option_value: ' nylon  fabric ', kpi_amount: 30 }

  check(await save([{ ...nylon, brand_id: TAB_OWN, label: '  Upgrade nylon  ', unit_tiers: [{ min_qty: 3, amount: 40 }] }]), 1,
    "a brand's own item")
  check(await brandItems(TAB), [{ brand: 'SOFAZ', pool: 'sofa_specials', special: 'Nylon Fabric', name: 'Upgrade nylon', amount: 30,
    tiers: [{ min_qty: 3, amount: 40 }], from: today, to: null }],
  "under its own ERP company's spelling, with its name and its tiers, from today")
  check(await save([nylon]), 1, "the sub-department's own item of the same special beside it")
  check(await q(`SELECT option_value AS special, product_name AS name, unit_tiers AS tiers FROM comm_kpi_items
                  WHERE scheme_id = $1 AND brand_id IS NULL`, [TAB]), [{ special: 'NYLON FABRIC', name: null, tiers: [] }],
  "under the ERP's one company's spelling, with no name and no tiers — as before")
  await refused([{ ...nylon, brand_id: TAB_OWN }], [], /no_overlapping_kpi_option/, 'never twice at once for one brand')
  await refused([{ ...nylon, option_value: 'Hand Stitch', brand_id: TAB_OWN }], [], /not in the sofa_specials Maintenance pool/,
    "only a special of the brand's own ERP company")
  await refused([{ source: 'sku', erp_product_id: 'p1', kpi_amount: 5, brand_id: TAB_OWN }], [], /is a sofa special/, "a brand's SKU is refused")
  await refused([{ ...nylon, option_pool: 'bedframe_specials', option_value: 'HB Straight', brand_id: TAB_OWN }], [], /is a sofa special/,
    "a brand's bed frame special too")
  await refused([{ ...nylon, option_value: 'Latex Seat', brand_id: TAB_AKEMI }], [], /not one of this sub-department's brands on their own scheme/,
    'a brand that is not on its own scheme has no items')
  await refused([{ ...nylon, option_value: 'Latex Seat', brand_id: OWN }], [], /not one of this sub-department's brands on their own scheme/,
    "nor has another scheme's brand, here")
  await refused([{ ...nylon, option_value: 'Hand Stitch', unit_tiers: [{ min_qty: 3, amount: 40 }] }], [], /Only a brand's own KPI item pays by tier/,
    "the sub-department's own item pays no tier")
  await refused([{ ...nylon, option_value: 'Latex Seat', brand_id: TAB_OWN, unit_tiers: [{ min_qty: 1, amount: 40 }] }], [],
    /A tier is a whole number of units from 2 up/, 'a tier the rule refuses, in words')

  const itemId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND brand_id = $2`, [TAB, TAB_OWN])
  check(await save([], [{ id: itemId, unit_tiers: [{ min_qty: 4, amount: 45 }, { min_qty: 8, amount: 60 }] }]), 1, 'new tiers alone')
  check((await brandItems(TAB)).map(r => [r.amount, r.tiers, r.from]),
    [[30, [{ min_qty: 4, amount: 45 }, { min_qty: 8, amount: 60 }], today]], 'begun today, it changes where it stands — its amount kept')
  check(await save([], [{ id: itemId, kpi_amount: 35 }]), 1, 'a new amount alone')
  check((await brandItems(TAB)).map(r => [r.amount, r.tiers]), [[35, [{ min_qty: 4, amount: 45 }, { min_qty: 8, amount: 60 }]]], 'its tiers kept')
  check(await save([], [{ id: itemId, kpi_amount: 35, unit_tiers: [{ min_qty: 4, amount: 45 }, { min_qty: 8, amount: 60 }] }]), 0,
    'nothing changed is no change')
  const ownId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND brand_id IS NULL`, [TAB])
  await refused([], [{ id: ownId, unit_tiers: [{ min_qty: 3, amount: 40 }] }], /Only a brand's own KPI item pays by tier/,
    "the sub-department's own item is given no tier by a change")

  // An item in force before today: the change closes it yesterday and opens today's — its brand, name and tiers with it.
  await q(`UPDATE comm_kpi_items SET effective_from = '2026-09-01' WHERE id = $1`, [itemId])
  check(await save([], [{ id: itemId, kpi_amount: 50 }]), 1, 'a new amount on an item in force since September')
  check((await brandItems(TAB)).map(r => [r.brand, r.name, r.amount, r.tiers.length, r.from, r.to === null]), [
    ['SOFAZ', 'Upgrade nylon', 35, 2, '2026-09-01', false],
    ['SOFAZ', 'Upgrade nylon', 50, 2, today, true],
  ], "the old amount ends yesterday, the new begins today — still the brand's, by its name, with its tiers")
  const liveId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND brand_id = $2 AND effective_to IS NULL`, [TAB, TAB_OWN])
  check(await save([], [], [liveId]), 1, 'removed')
  check((await brandItems(TAB)).length, 1, 'begun today, it never applied and goes; the months already run keep theirs')

  // ── Production changed since: nothing is touched ───────────────────────────
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_quote_context(p_scheme uuid) RETURNS jsonb LANGUAGE sql STABLE
                 AS $$ SELECT '{}'::jsonb $$`)
  await assert.rejects(() => db.exec(migration), /member_quote_context\(uuid\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a body that is neither production\'s nor the migration\'s own stops it')
  checks++

  console.log(`PASS: ${checks} brand KPI item checks. Production's bodies (md5-checked) + the real migration 20261112200000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}
