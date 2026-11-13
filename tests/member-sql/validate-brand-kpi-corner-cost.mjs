// Local PostgreSQL regression for 20261114100000 — a brand's own KPI item takes off ONLY its cost, and a sofa with a
// corner its corner cost (2026-11-14; the user: "only follow the cost set in venture", and of the price list's corner
// prices: "yes need to be corner as well, if that is a compartment of corner sofa. then consider yes").
//
// Production's bodies as they stood before 20261112200000 (tests/member-sql/brand-kpi-items-production.sql, md5-checked)
// are loaded over stand-ins for what they read; 20261112200000, 20261114030000 and 20261114040000 then run verbatim —
// the chain production ran, which leaves the hits and the writer as production holds them on 2026-11-14 (md5-checked) —
// and this migration verbatim, twice. What is under test is money: with no cost nothing moves; with a cost exactly the
// cost comes off, whatever the bill charged; a sofa with a corner piece (CNR) takes the corner cost, and only that
// sofa; an item with neither cost is as billed; and what the writer stores. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrationFile = name => new URL(`../../supabase/migrations/${name}`, import.meta.url)
const CHAIN = ['20261112200000_brand_kpi_items.sql', '20261114030000_brand_kpi_named.sql', '20261114040000_brand_kpi_cost.sql']
const MIGRATION = migrationFile('20261114100000_brand_kpi_corner_cost.sql')
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const read = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

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
  // The world 20261112200000 was written over (validate-brand-kpi-items.mjs's, as production holds it).
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

  await db.exec('SET check_function_bodies = off')
  await db.exec(await read(new URL('./brand-kpi-items-production.sql', import.meta.url)))
  await db.exec('SET check_function_bodies = on')

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
    INSERT INTO erp_maintenance_options(erp_company_id, pool, value) VALUES
      (1, 'sofa_specials', 'Latex Seat'), (1, 'sofa_specials', 'NYLON FABRIC'), (1, 'sofa_specials', 'Hand Stitch'),
      (2, 'sofa_specials', 'Latex Seat'), (2, 'sofa_specials', 'Sofa Full Fabric'), (2, 'sofa_specials', 'Nylon Fabric');
    INSERT INTO sales_import_batches VALUES ('${BATCH}', '${FAIR}', '${NOV}', 'committed');

    -- The sub-department's own items, in force since August: a sofa special and a SKU.
    INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'option', 'sofa_specials', 'Latex Seat', 40, '2026-08-01');
    INSERT INTO comm_kpi_items(scheme_id, source, product_code, product_name, erp_product_id, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'sku', 'AK-PILLOW', 'AKEMI PILLOW', 'p1', 30, '2026-08-01');
  `)

  // ── The chain production ran: 20261112200000, 20261114030000, 20261114040000 ──
  for (const name of CHAIN) await db.exec(await read(migrationFile(name)))
  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    hits: 'public.comm_kpi_hits(uuid, uuid[], date)',
    save: 'public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])',
  }
  // Production's bodies on 2026-11-14 (pg_proc, md5 of prosrc): what 20261114040000 made.
  const PRODUCTION = { hits: 'bea109da50baac1a36105406b50f9fd5', save: 'a85779d3bbc5083962183aa9433a6880' }
  for (const [name, md5] of Object.entries(PRODUCTION)) {
    check(await md5Of(SIG[name]), md5, `${name}: the chain leaves production's body`)
  }

  // ── November's bills ───────────────────────────────────────────────────────
  // A bill as the ERP delivers it: its lines, and the same items whole on the order (raw.items), where the special
  // order's money is — custom_specials on every piece of the set, the set's surcharge on each.
  let seq = 0
  const bill = async (orderNo, brand, staff, lines) => {
    const items = lines.map((l, i) => ({
      line_no: i, item_code: l.code, cancelled: false,
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
  const charge = (description, rm) => ({ description, surchargeSen: rm * 100 })
  const sofa = (code, amount, specials, custom, more = {}) => ({ group: 'sofa', code, amount, specials, custom, ...more })
  const latex = rm => [charge('Latex Seat', rm)]
  const fabric = rm => [charge('Sofa Full Fabric', rm)]
  const delivery = { group: 'service', code: 'SVC-DELIVERY', amount: 250 }
  const LATEX = ['Latex Seat']
  const FABRIC = ['Sofa Full Fabric']

  // 2990-SO-2611-017 as production holds it: one sofa, Latex Seat RM 500 inside the sofa's RM 3,740.
  const n1 = await bill('N1', '2990S', ETHAN, [
    sofa('BOAAT-1A(P)(LHF)', 1870, LATEX, latex(500)), sofa('BOAAT-1A(P)(RHF)', 1870, LATEX, latex(500)), delivery,
  ])
  // 2990-SO-2611-023: Sofa Full Fabric RM 250 on a chaise sofa — an L is no corner.
  const n2 = await bill('N2', '2990S', SHELDON, [
    sofa('TELLUC-2A(LHF)', 1625, FABRIC, fabric(250)), sofa('TELLUC-L(RHF)', 1625, FABRIC, fabric(250)), delivery,
  ])
  // Named, and its price in the remark: the special order charges nothing.
  const n3 = await bill('N3', '2990S', ETHAN, [
    sofa('QUBBU-1A(LHF)', 1495, LATEX, latex(0)), sofa('QUBBU-2A(RHF)', 1495, LATEX, latex(0)),
  ])
  // Two sofas, no corner piece on either: the second charged RM 1,000 (as the old test's "corner" bill).
  const n5 = await bill('N5', '2990S', SHELDON, [
    sofa('BOAAT-2A', 3490, LATEX, latex(500)),
    sofa('KABBIN-2A(LHF)', 3990, LATEX, latex(1000)), sofa('KABBIN-L(RHF)', 0, LATEX, latex(1000)),
  ])
  // A corner sofa: 2A + CNR + 2A, every piece naming the latex seat, the special order RM 1,000.
  const c1 = await bill('C1', '2990S', ETHAN, [
    sofa('BOOQIT-2A(LHF)', 2000, LATEX, latex(1000)), sofa('BOOQIT-CNR', 1500, LATEX, latex(1000)),
    sofa('BOOQIT-2A(RHF)', 2000, LATEX, latex(1000)),
  ])
  // A corner sofa whose corner piece names nothing: the sofa has a corner all the same.
  const c2 = await bill('C2', '2990S', ETHAN, [
    sofa('KABBIN-2A(LHF)', 3000, LATEX, latex(1000)), sofa('KABBIN-CNR', 1000, null, []),
    sofa('KABBIN-1A(RHF)', 1500, LATEX, latex(1000)),
  ])
  // Two sofas on one bill, fabric on both: a corner sofa and a three-seater.
  const c3 = await bill('C3', '2990S', SHELDON, [
    sofa('LOTTI-2A(LHF)', 2200, FABRIC, fabric(250)), sofa('LOTTI-CNR', 1200, FABRIC, fabric(250)),
    sofa('LOTTI-2A(RHF)', 2200, FABRIC, fabric(250)), sofa('BOAAT-3S', 2990, FABRIC, fabric(125)),
  ])
  // A corner piece of ANOTHER model on the bill: the latex sofa has no corner.
  const c4 = await bill('C4', '2990S', ETHAN, [sofa('BOAAT-2A', 3490, LATEX, latex(500)), sofa('XAMMAR-CNR', 900, null, [])])
  // The corner piece's code with brackets and a space: its module is still CNR.
  const c5 = await bill('C5', '2990S', SHELDON, [
    sofa('XAMMAR-2A(LHF)', 2600, LATEX, latex(1000)), sofa('XAMMAR-CNR (P)', 1400, LATEX, latex(1000)),
  ])
  // CNR elsewhere in a code is no corner: the module is the code after its last '-'.
  const c6 = await bill('C6', '2990S', ETHAN, [sofa('CNRX-2A', 3490, LATEX, latex(500))])
  // A corner sofa whose sales cannot cover a RM 1,000 corner cost.
  const c7 = await bill('C7', '2990S', ETHAN, [sofa('BOOQIT-2A', 500, LATEX, []), sofa('BOOQIT-CNR', 300, LATEX, [])])
  // A bill of the sub-department's own with a corner piece: its own items are found as before.
  const a1 = await bill('A1', 'AKEMI', ETHAN, [
    sofa('8030-2A', 3000, LATEX, latex(500)), sofa('8030-CNR', 1000, LATEX, latex(500)),
    { group: 'accessory', code: 'AK-PILLOW', amount: 200, qty: 2 },
  ])
  const allBills = [n1, n2, n3, n5, c1, c2, c3, c4, c5, c6, c7, a1]

  const hitsOf = async (orders, asAt = NOV_END) => (await q(
    `SELECT o.order_no, coalesce(k.product_name, k.option_value, k.product_code) AS item, (k.brand_id IS NOT NULL) AS brand,
            h.qty::float AS qty, h.unit_amount::float AS unit
       FROM comm_kpi_hits($1, $2::uuid[], $3) h
       JOIN sales_orders o ON o.id = h.order_id JOIN comm_kpi_items k ON k.id = h.item_id
      ORDER BY 1, 2, 5`, [SCHEME, orders, asAt])).map(r => `${r.order_no} ${r.brand ? 'brand' : 'own'} ${r.item} ×${r.qty} @${r.unit}`)
  const monthOf = async () => Object.fromEntries((await q(
    `SELECT order_no, commissionable::float AS c FROM revenue_month_orders($1, $2)`, [FAIR, NOV])).map(r => [r.order_no, r.c]))
  const setCosts = (costs) => q(
    `UPDATE comm_kpi_items SET cost_amount = ($2::jsonb ->> option_value)::numeric,
                               corner_cost_amount = ($3::jsonb ->> option_value)::numeric
      WHERE brand_id = $1`, [OWN, JSON.stringify(costs.cost ?? {}), JSON.stringify(costs.corner ?? {})])

  // Fair's own KPI is on (2026-11-13, 18:43): the sub-department's bill finds its own.
  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [SCHEME])

  // As production reads them now: the cost, or what the bill charged when that is more (none set yet: as billed).
  const asBilled = await hitsOf(allBills)
  check(asBilled, [
    'A1 own AKEMI PILLOW ×2 @30', 'A1 own Latex Seat ×1 @40',
    'C1 brand Upgrade latex seat ×1 @1000', 'C2 brand Upgrade latex seat ×1 @1000',
    'C3 brand Upgrade fabric ×1 @125', 'C3 brand Upgrade fabric ×1 @250',
    'C4 brand Upgrade latex seat ×1 @500', 'C5 brand Upgrade latex seat ×1 @1000', 'C6 brand Upgrade latex seat ×1 @500',
    'C7 brand Upgrade latex seat ×1 @0',
    'N1 brand Upgrade latex seat ×1 @500', 'N2 brand Upgrade fabric ×1 @250', 'N3 brand Upgrade latex seat ×1 @0',
    'N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @1000',
  ], 'before: no cost on either item — every unit takes off what its special order charges')
  const monthBefore = await monthOf()
  // With costs under 20261114040000: the dearer of the cost and the charge.
  await q(`UPDATE comm_kpi_items SET cost_amount = CASE option_value WHEN 'Latex Seat' THEN 500 ELSE 125 END WHERE brand_id = $1`, [OWN])
  check(await hitsOf([n2, n5]), ['N2 brand Upgrade fabric ×1 @250', 'N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @1000'],
    'before, with a cost: a bill charging more than the cost took the more off')
  await q(`UPDATE comm_kpi_items SET cost_amount = NULL WHERE brand_id = $1`, [OWN])

  check(await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'comm_kpi_items' AND column_name = 'corner_cost_amount'`), [],
    'before the migration an item has no corner cost')

  // ── The migration, verbatim — twice ────────────────────────────────────────
  const migration = await read(MIGRATION)
  await db.exec(migration)
  await db.exec(migration)
  checks++
  const MAKES = Object.fromEntries([...migration.matchAll(/\('(public\.[^']+)',\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
    .map(m => [m[1], { from: m[2], makes: m[3] }]))
  for (const [name, sig] of Object.entries(SIG)) {
    check(MAKES[sig]?.from, PRODUCTION[name], `${name}: written from production's body`)
    check(await md5Of(sig), MAKES[sig]?.makes, `${name}: what stands is what the migration says it makes`)
  }
  const hitsDef = await one(`SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure($1)`, [SIG.hits])
  check([
    hitsDef.includes('), corners AS ('), hitsDef.includes('LEFT JOIN corners cn'), hitsDef.includes('k.corner_cost_amount'),
    hitsDef.includes('i.corner_cost_amount'), hitsDef.includes('GREATEST(COALESCE(MAX(mo.amount), 0), COALESCE(m.cost_amount, 0))'),
  ], [true, true, true, true, false], 'the hits: the corners read, the corner cost carried, the dearer of the two gone')

  // No cost is set: nothing moves.
  check(await q(`SELECT count(*)::int AS n FROM comm_kpi_items WHERE corner_cost_amount IS NOT NULL OR cost_amount IS NOT NULL`),
    [{ n: 0 }], 'the migration sets no cost')
  check(await hitsOf(allBills), asBilled, 'with no cost every unit is as billed, as before')
  check(await monthOf(), monthBefore, "and so is Comm Cal's month")

  // ── The table ──────────────────────────────────────────────────────────────
  const setCorner = `UPDATE comm_kpi_items SET corner_cost_amount = $2 WHERE id = (SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND `
  await reject(`${setCorner} brand_id IS NULL AND source = 'sku')`, [SCHEME, 10], /kpi_item_corner_cost_is_a_brands/,
    "the sub-department's own item has no corner cost")
  for (const [bad, why] of [[0, 'nothing'], [-5, 'less than nothing'], [1000000.01, 'more than RM 1,000,000']]) {
    await reject(`${setCorner} brand_id = '${OWN}' AND option_value = 'Latex Seat')`, [SCHEME, bad], /kpi_item_corner_cost_in_range/,
      `a corner cost is never ${why}`)
  }

  // ── Only the cost (the user: "only follow the cost set in venture") ────────
  // The user's list: latex seat RM 500, full fabric RM 125 — no corner cost yet.
  await setCosts({ cost: { 'Latex Seat': 500, 'Sofa Full Fabric': 125 } })
  check(await hitsOf([n1, n3]), ['N1 brand Upgrade latex seat ×1 @500', 'N3 brand Upgrade latex seat ×1 @500'],
    'charged its cost, or nothing (the price in the remark): the cost comes off')
  check(await hitsOf([n2]), ['N2 brand Upgrade fabric ×1 @125'], 'charged RM 250 for a RM 125 upgrade: RM 125 off — the rest earns')
  check(await hitsOf([n5]), ['N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @500'],
    'two sofas, one charged RM 1,000 with no corner piece: RM 500 off each')
  check(await hitsOf([c1, c2, c5]), ['C1 brand Upgrade latex seat ×1 @500', 'C2 brand Upgrade latex seat ×1 @500', 'C5 brand Upgrade latex seat ×1 @500'],
    'a corner sofa with no corner cost set: its cost')
  check(await hitsOf([a1]), ['A1 own AKEMI PILLOW ×2 @30', 'A1 own Latex Seat ×1 @40'], "the sub-department's own bill is as it was")
  const withCost = await monthOf()
  check([withCost.N2, withCost.N5, withCost.C1], [3125, 6480, 5000],
    "Comm Cal's month: RM 250 − 125 back in N2's sales, RM 1,000 − 500 in N5's, RM 1,000 − 500 in C1's")

  // ── The corner cost (the user: "yes need to be corner as well") ────────────
  await setCosts({ cost: { 'Latex Seat': 500, 'Sofa Full Fabric': 125 }, corner: { 'Latex Seat': 1000, 'Sofa Full Fabric': 250 } })
  check(await hitsOf([c1]), ['C1 brand Upgrade latex seat ×1 @1000'], 'a sofa with a CNR piece: its corner cost')
  check(await hitsOf([c2]), ['C2 brand Upgrade latex seat ×1 @1000'], 'its corner piece naming nothing: a corner sofa all the same')
  check(await hitsOf([c3]), ['C3 brand Upgrade fabric ×1 @125', 'C3 brand Upgrade fabric ×1 @250'],
    'two sofas on one bill: the corner sofa at its corner cost, the three-seater at its cost')
  check(await hitsOf([c4]), ['C4 brand Upgrade latex seat ×1 @500'], "another model's corner piece makes no corner of this sofa")
  check(await hitsOf([c5]), ['C5 brand Upgrade latex seat ×1 @1000'], 'XAMMAR-CNR (P): a corner — its brackets and the space read away')
  check(await hitsOf([c6]), ['C6 brand Upgrade latex seat ×1 @500'], "CNRX-2A: no corner — the module is the code after the last '-'")
  check(await hitsOf([n2, n5]), ['N2 brand Upgrade fabric ×1 @125', 'N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @500'],
    'no CNR piece — an L, or a sofa merely charged RM 1,000 — is no corner')
  check(await hitsOf([c7]), [], 'a corner sofa whose sales do not cover its corner cost pays no KPI item')
  check(await hitsOf([a1]), ['A1 own AKEMI PILLOW ×2 @30', 'A1 own Latex Seat ×1 @40'],
    "the sub-department's own items never read a corner — 8030-CNR beside them changes nothing")
  const withCorner = await monthOf()
  check([withCorner.C1, withCorner.C2, withCorner.C3, withCorner.C7], [4500, 4500, 8215, 800],
    "Comm Cal's month: RM 1,000 off each latex corner sofa, RM 250 + RM 125 off C3, nothing off the bill that cannot cover it")

  // The corner cost alone: the other sofas as billed, the corner ones at it.
  await setCosts({ corner: { 'Latex Seat': 900 } })
  check(await hitsOf([n1, n3, n5, c1]), [
    'C1 brand Upgrade latex seat ×1 @900', 'N1 brand Upgrade latex seat ×1 @500', 'N3 brand Upgrade latex seat ×1 @0',
    'N5 brand Upgrade latex seat ×1 @500', 'N5 brand Upgrade latex seat ×1 @1000',
  ], 'a corner cost with no cost: a corner sofa takes it, every other sofa what its special order charges')
  check(await hitsOf([c3]), ['C3 brand Upgrade fabric ×1 @125', 'C3 brand Upgrade fabric ×1 @250'],
    'and an item with neither is as billed on a corner sofa too')

  // Every cost cleared: back to as billed.
  await setCosts({})
  check(await hitsOf(allBills), asBilled, 'every cost cleared: every finding as billed again')
  check(await monthOf(), monthBefore, "and Comm Cal's month as it was")
  check(await hitsOf([c1], '2026-10-31'), [], "October's as-at: the brand's items begin in November, as before")

  // ── The writer ─────────────────────────────────────────────────────────────
  // A scheme of its own, so nothing above moves. "Today" is the office's.
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const save = (adds = [], changes = [], removes = []) => one(
    `SELECT catalogue_save_kpi_items($1, $2::jsonb, $3::jsonb, $4::uuid[])`, [TAB, JSON.stringify(adds), JSON.stringify(changes), removes])
  const refused = async (adds, changes, pattern, what) => {
    await assert.rejects(() => save(adds, changes), pattern, what)
    checks++
  }
  const costsOf = () => q(
    `SELECT k.option_value AS special, k.cost_amount::float AS cost, k.corner_cost_amount::float AS corner,
            k.kpi_amount::float AS amount, k.effective_from::text AS "from", (k.effective_to IS NULL) AS live
       FROM comm_kpi_items k WHERE k.scheme_id = $1 AND k.brand_id IS NOT NULL ORDER BY k.option_value, k.effective_from`, [TAB])
  const special = (value, more = {}) => ({ source: 'option', option_pool: 'sofa_specials', option_value: value, kpi_amount: 50, ...more })

  check(await save([
    special('Latex Seat', { brand_id: TAB_OWN, label: 'Upgrade latex seat', cost_amount: 500, corner_cost_amount: 1000 }),
    special('Sofa Full Fabric', { brand_id: TAB_OWN, corner_cost_amount: 250 }),
    special('Nylon Fabric', { brand_id: TAB_OWN, cost_amount: 100, corner_cost_amount: 0 }),
  ]), 3, "three of a brand's items added")
  check(await costsOf(), [
    { special: 'Latex Seat', cost: 500, corner: 1000, amount: 50, from: today, live: true },
    { special: 'Nylon Fabric', cost: 100, corner: null, amount: 50, from: today, live: true },
    { special: 'Sofa Full Fabric', cost: null, corner: 250, amount: 50, from: today, live: true },
  ], 'each with its cost and its corner cost as sent — 0, or none, is none')
  await refused([special('Hand Stitch', { corner_cost_amount: 100 })], [], /Only a brand's own KPI item has a cost/,
    "the sub-department's own item is given no corner cost by an add")
  await refused([special('Latex Seat', { brand_id: TAB_OWN, corner_cost_amount: -1 })], [], /A corner cost is RM 0\.01 to RM 1,000,000 a unit/,
    'a corner cost below nothing is refused, in words')

  const latexId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND option_value = 'Latex Seat'`, [TAB])
  check(await save([], [{ id: latexId, corner_cost_amount: 1200 }]), 1, 'a corner cost alone')
  check((await costsOf()).filter(r => r.special === 'Latex Seat').map(r => [r.cost, r.corner, r.amount]), [[500, 1200, 50]],
    'its cost and its bonus kept — begun today, changed where it stands')
  check(await save([], [{ id: latexId, corner_cost_amount: 1200 }]), 0, 'the same corner cost is no change')
  check(await save([], [{ id: latexId, cost_amount: 500 }]), 0, 'nor is a change that names only the cost it has')
  check(await save([], [{ id: latexId, kpi_amount: 60 }]), 1, 'a new bonus alone')
  check((await costsOf()).filter(r => r.special === 'Latex Seat').map(r => [r.cost, r.corner, r.amount]), [[500, 1200, 60]],
    'which leaves both costs as stored')
  check(await save([], [{ id: latexId, corner_cost_amount: 1199.996 }]), 0, 'a corner cost is kept to the sen: RM 1,199.996 is RM 1,200.00')
  await refused([], [{ id: latexId, corner_cost_amount: 1000001 }], /A corner cost is RM 0\.01 to RM 1,000,000 a unit/,
    'a corner cost above RM 1,000,000 is refused, in words')
  const ownId = await one(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                           VALUES ($1, 'option', 'sofa_specials', 'Hand Stitch', 30, '2026-08-01') RETURNING id`, [TAB])
  await refused([], [{ id: ownId, corner_cost_amount: 100 }], /Only a brand's own KPI item has a cost/,
    "the sub-department's own item is given no corner cost by a change")
  check(await save([], [{ id: latexId, corner_cost_amount: 0 }]), 1, 'a corner cost of 0 takes it away')
  check((await costsOf()).filter(r => r.special === 'Latex Seat').map(r => [r.cost, r.corner]), [[500, null]], 'its cost stays')

  // An item in force before today: the change closes it yesterday and opens today's — its corner cost with it.
  await q(`UPDATE comm_kpi_items SET effective_from = '2026-10-01', corner_cost_amount = 1000 WHERE id = $1`, [latexId])
  check(await save([], [{ id: latexId, kpi_amount: 70 }]), 1, 'a new bonus on an item in force since October')
  check((await costsOf()).filter(r => r.special === 'Latex Seat').map(r => [r.cost, r.corner, r.amount, r.live]), [
    [500, 1000, 60, false], [500, 1000, 70, true],
  ], "the old row ends yesterday, today's carries the cost and the corner cost")
  const liveId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND option_value = 'Latex Seat' AND effective_to IS NULL`, [TAB])
  await q(`UPDATE comm_kpi_items SET effective_to = '2026-10-31' WHERE scheme_id = $1 AND option_value = 'Latex Seat' AND id <> $2`, [TAB, liveId])
  await q(`UPDATE comm_kpi_items SET effective_from = '2026-11-01' WHERE id = $1`, [liveId])
  check(await save([], [{ id: liveId, corner_cost_amount: 1100 }]), 1, 'a new corner cost on an item in force since November')
  check((await costsOf()).filter(r => r.special === 'Latex Seat').map(r => [r.corner, r.live]), [[1000, false], [1000, false], [1100, true]],
    'the old corner cost ends yesterday, the new begins today')

  // ── Production changed since: nothing is touched ───────────────────────────
  // 20261114040000 run again stops at the bodies this migration made…
  await assert.rejects(async () => db.exec(await read(migrationFile(CHAIN[2]))),
    /is md5 [0-9a-f]{32}, not the body this migration was written from/, '20261114040000 run again stops at the bodies this one made')
  await db.exec('ROLLBACK')
  checks++
  check([await md5Of(SIG.hits), await md5Of(SIG.save)], [MAKES[SIG.hits]?.makes, MAKES[SIG.save]?.makes], 'and those bodies stand')
  // …and this one stops at a body somebody changed since.
  await db.exec(`CREATE OR REPLACE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
    RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric)
    LANGUAGE sql STABLE SET search_path TO 'public' AS $f$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, 0::numeric, 0::numeric WHERE false $f$`)
  await assert.rejects(() => db.exec(migration), /comm_kpi_hits\(uuid, uuid\[\], date\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a changed body is refused')
  await db.exec('ROLLBACK')
  checks++
  check(await md5Of(SIG.save), MAKES[SIG.save]?.makes, 'and nothing else was touched')

  console.log(`PASS: ${checks} brand KPI corner cost checks. Production's bodies (md5-checked) + the chain 20261112200000, 20261114030000 and 20261114040000 + the real migration 20261114100000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}
