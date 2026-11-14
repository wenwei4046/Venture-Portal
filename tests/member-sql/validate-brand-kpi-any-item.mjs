// Local PostgreSQL regression for 20261114230000 — 2990s' own KPI items of every kind (2026-11-14; the user: "我只需要
// 像 Fair 一样选 KPI 就好，不需要去选它的 cost"; "by model、by special 或者是 by compartment"; asked: "扣掉再发 bonus",
// a compartment "每组沙发算 1 个").
//
// Production's bodies as they stood before 20261112200000 (tests/member-sql/brand-kpi-items-production.sql, md5-checked)
// are loaded over stand-ins for what they read; the chain 20261112200000, 20261114030000, 20261114040000 and
// 20261114100000 then runs verbatim — leaving the hits and the writer as production holds them on 2026-11-14
// (md5-checked) — and member_kpi_for_staff is loaded as production holds it (brand-kpi-any-item-production.sql,
// md5-checked). This migration then runs verbatim, twice. Under test is money: what each kind of a brand's item finds
// on its bills and takes off them, that a piece is one whole item, that the sub-department's own items and the brand's
// two sofa specials find what they found before, the writer, and the Revenue app's codes. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrationFile = name => new URL(`../../supabase/migrations/${name}`, import.meta.url)
const CHAIN = [
  '20261112200000_brand_kpi_items.sql', '20261114030000_brand_kpi_named.sql', '20261114040000_brand_kpi_cost.sql',
  '20261114100000_brand_kpi_corner_cost.sql',
]
const MIGRATION = migrationFile('20261114230000_brand_kpi_any_item.sql')
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
  // The world 20261112200000 was written over (validate-brand-kpi-items.mjs's, as production holds it) — the SKU master
  // with its company, category and base model, and two companies' fabric lists.
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
    CREATE TABLE erp_products(erp_id text PRIMARY KEY, item_code text NOT NULL, description text,
      erp_company_id bigint NOT NULL DEFAULT 1, category text, base_model text, removed_at timestamptz);
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
    -- The SKU master: Houzs' (company 1) and 2990s' (company 2) — a sofa's base model its code before the first '-'.
    INSERT INTO erp_products(erp_id, item_code, description, erp_company_id, category, base_model) VALUES
      ('p1', 'AK-PILLOW', 'AKEMI PILLOW', 1, 'ACCESSORY', 'AK-PILLOW'),
      ('p2', 'SQUARE PILLOW-M', 'SOFA SQUARE PILLOW-M (16"X16")', 2, 'ACCESSORY', 'SQUARE PILLOW'),
      ('p-svc2', 'SVC-DELIVERY', 'Delivery fee', 2, 'SERVICE', 'SVC-DELIVERY'),
      ('b-1l', 'BOAAT-1A(P)(LHF)', 'SOFA BOAAT 1A(P)(LHF)', 2, 'SOFA', 'Boaat'),
      ('b-1r', 'BOAAT-1A(P)(RHF)', 'SOFA BOAAT 1A(P)(RHF)', 2, 'SOFA', 'Boaat'),
      ('b-2a', 'BOAAT-2A', 'SOFA BOAAT 2A', 2, 'SOFA', 'Boaat'),
      ('b-cnr', 'BOAAT-CNR', 'SOFA BOAAT CNR', 2, 'SOFA', 'Boaat'),
      ('q-2l', 'BOOQIT-2A(LHF)', 'SOFA BOOQIT 2A(LHF)', 2, 'SOFA', 'Booqit'),
      ('q-cnr', 'BOOQIT-CNR', 'SOFA BOOQIT CNR', 2, 'SOFA', 'Booqit'),
      ('q-2r', 'BOOQIT-2A(RHF)', 'SOFA BOOQIT 2A(RHF)', 2, 'SOFA', 'Booqit'),
      ('x-2l', 'XAMMAR-2A(LHF)', 'SOFA XAMMAR 2A(LHF)', 2, 'SOFA', 'Xammar'),
      ('x-cnr', 'XAMMAR-CNR', 'SOFA XAMMAR CNR', 2, 'SOFA', 'Xammar'),
      ('x-2a', 'XAMMAR-2A', 'SOFA XAMMAR 2A', 2, 'SOFA', 'Xammar'),
      ('x-2r', 'XAMMAR-2A(RHF)', 'SOFA XAMMAR 2A(RHF)', 2, 'SOFA', 'Xammar'),
      ('k-2l', 'KABBIN-2A(LHF)', 'SOFA KABBIN 2A(LHF)', 2, 'SOFA', 'KABBIN'),
      ('k-cnr', 'KABBIN-CNR', 'SOFA KABBIN CNR', 2, 'SOFA', 'KABBIN'),
      ('k-1r', 'KABBIN-1A(RHF)', 'SOFA KABBIN 1A(RHF)', 2, 'SOFA', 'KABBIN'),
      ('l-2a', 'LOTTI-2A', 'SOFA LOTTI 2A', 2, 'SOFA', 'Lotti'),
      ('l-cnr', 'LOTTI-CNR', 'SOFA LOTTI CNR', 2, 'SOFA', 'Lotti'),
      ('t-2l', 'TELLUC-2A(LHF)', 'SOFA TELLUC 2A(LHF)', 2, 'SOFA', 'Telluc'),
      ('t-lr', 'TELLUC-L(RHF)', 'SOFA TELLUC L(RHF)', 2, 'SOFA', 'Telluc'),
      ('u-1l', 'QUBBU-1A(LHF)', 'SOFA QUBBU 1A(LHF)', 2, 'SOFA', 'Qubbu'),
      ('u-2r', 'QUBBU-2A(RHF)', 'SOFA QUBBU 2A(RHF)', 2, 'SOFA', 'Qubbu'),
      ('a-q', 'ARIA-(Q)', 'BEDFRAME ARIA (Q)', 2, 'BEDFRAME', 'aria'),
      ('gone', 'RETRO-2A', 'SOFA RETRO 2A', 2, 'SOFA', 'Retro');
    UPDATE erp_products SET removed_at = now() WHERE erp_id = 'gone';
    INSERT INTO erp_maintenance_options(erp_company_id, pool, value) VALUES
      (1, 'sofa_specials', 'Latex Seat'), (1, 'sofa_specials', 'NYLON FABRIC'), (1, 'sofa_specials', 'Hand Stitch'),
      (2, 'sofa_specials', 'Latex Seat'), (2, 'sofa_specials', 'Sofa Full Fabric'), (2, 'sofa_specials', 'Nylon Fabric'),
      (2, 'bedframe_specials', 'HB Straight');
    -- The fabric lists: a code may be on both, in another series on each; 2990s' EZ fabrics have no series.
    INSERT INTO erp_fabrics(erp_company_id, erp_id, fabric_code, series) VALUES
      (1, 'f1', 'AV-01', 'AVANI'), (1, 'f2', 'X1-01', 'AVANI'),
      (2, 'g1', 'EZ-007', NULL), (2, 'g2', 'BROWNIE-02', 'HOMELY'), (2, 'g3', 'HG1313-02', 'BELONG'), (2, 'g4', 'X1-01', 'HOMELY'),
      (2, 'g5', 'Velvet Interlace - Bronze', NULL);
    INSERT INTO sales_import_batches VALUES ('${BATCH}', '${FAIR}', '${NOV}', 'committed');

    -- The sub-department's own items, in force since August: a sofa special, a SKU and a sofa fabric series.
    INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'option', 'sofa_specials', 'Latex Seat', 40, '2026-08-01');
    INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, product_name, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'option', 'sofa_fabric_series', 'AVANI', 'AVANI · Sofa fabric', 45, '2026-08-01');
    INSERT INTO comm_kpi_items(scheme_id, source, product_code, product_name, erp_product_id, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'sku', 'AK-PILLOW', 'AKEMI PILLOW', 'p1', 30, '2026-08-01');
  `)

  // ── The chain production ran, and the Revenue app's list as production holds it ──
  for (const name of CHAIN) await db.exec(await read(migrationFile(name)))
  await db.exec('SET check_function_bodies = off')
  await db.exec(await read(new URL('./brand-kpi-any-item-production.sql', import.meta.url)))
  await db.exec('SET check_function_bodies = on')
  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    hits: 'public.comm_kpi_hits(uuid, uuid[], date)',
    save: 'public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])',
    member: 'public.member_kpi_for_staff(uuid, uuid, date)',
  }
  // Production's bodies on 2026-11-14 (pg_proc, md5 of prosrc).
  const PRODUCTION = {
    hits: 'b7710762d784f1e7707a137a7c43c92b', save: '4c676def8a63d5d41008619e2bdc0d41', member: 'a20392fb1acc51891dee50e72d01de07',
  }
  for (const [name, md5] of Object.entries(PRODUCTION)) {
    check(await md5Of(SIG[name]), md5, `${name}: the world holds production's body`)
  }

  // ── November's bills ───────────────────────────────────────────────────────
  // A bill as the ERP delivers it: its lines (their variants on the line), and the same items whole on the order
  // (raw.items), where the special order's money is — custom_specials on every piece of a sofa set.
  let seq = 0
  const bill = async (orderNo, brand, staff, lines) => {
    const variants = l => (l.specials || l.fabric
      ? { variants: { ...(l.specials ? { specials: l.specials } : {}), ...(l.fabric ? { fabricCode: l.fabric } : {}) } }
      : null)
    const items = lines.map((l, i) => ({
      line_no: i, item_code: l.code, cancelled: false, ...(variants(l) ?? {}), custom_specials: l.custom ?? [],
    }))
    const total = lines.reduce((a, l) => a + l.amount, 0)
    const orderId = await one(
      `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, brand_code, order_total, paid_amount, staff_id, sequence_in_day, raw)
       VALUES ($1, $2, $3, '2026-11-08', $4, $5, $5, $6, $7, $8) RETURNING id`,
      [BATCH, NOV, orderNo, brand, total, staff, ++seq, JSON.stringify({ items })])
    for (const [i, l] of lines.entries()) {
      const raw = variants(l)
      await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, qty, line_amount, brand_code, raw)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, i, l.group, l.code, l.qty ?? 1, l.amount, brand, raw ? JSON.stringify(raw) : null])
    }
    return orderId
  }
  const charge = (description, rm) => ({ description, surchargeSen: rm * 100 })
  const sofa = (code, amount, more = {}) => ({ group: 'sofa', code, amount, ...more })
  const LATEX = ['Latex Seat']
  const FABRIC = ['Sofa Full Fabric']
  const latex = rm => ({ specials: LATEX, custom: [charge('Latex Seat', rm)] })

  // A Boaat sofa named with Latex Seat in an EZ fabric, two square pillows, its delivery.
  const b1 = await bill('B1', '2990S', ETHAN, [
    sofa('BOAAT-1A(P)(LHF)', 1870, { ...latex(500), fabric: 'EZ-007' }),
    sofa('BOAAT-1A(P)(RHF)', 1870, { ...latex(500), fabric: 'EZ-007' }),
    { group: 'accessory', code: 'SQUARE PILLOW-M', amount: 50, qty: 2 },
    { group: 'service', code: 'SVC-DELIVERY', amount: 250 },
  ])
  // A corner sofa (2A + CNR + 2A) with Latex Seat in a HOMELY fabric (BROWNIE-02).
  const b2 = await bill('B2', '2990S', ETHAN, [
    sofa('BOOQIT-2A(LHF)', 2000, { ...latex(1000), fabric: 'BROWNIE-02' }),
    sofa('BOOQIT-CNR', 1500, { ...latex(1000), fabric: 'BROWNIE-02' }),
    sofa('BOOQIT-2A(RHF)', 2000, { ...latex(1000), fabric: 'BROWNIE-02' }),
  ])
  // A U: two corner pieces in one sofa.
  const b3 = await bill('B3', '2990S', SHELDON, [
    sofa('XAMMAR-2A(LHF)', 1500), sofa('XAMMAR-CNR', 1000), sofa('XAMMAR-2A', 1500), sofa('XAMMAR-CNR', 1000),
    sofa('XAMMAR-2A(RHF)', 1500),
  ])
  // Two corner sofas alike on one bill: every piece twice.
  const b4 = await bill('B4', '2990S', SHELDON, [
    sofa('KABBIN-2A(LHF)', 6000, { qty: 2 }), sofa('KABBIN-CNR', 2000, { qty: 2 }), sofa('KABBIN-1A(RHF)', 3000, { qty: 2 }),
  ])
  // A corner piece that is a KPI item by its SKU.
  const b5 = await bill('B5', '2990S', ETHAN, [sofa('LOTTI-2A', 2200), sofa('LOTTI-CNR', 1200)])
  // A corner sofa of a model that is a KPI item.
  const b6 = await bill('B6', '2990S', SHELDON, [sofa('BOAAT-2A', 2000), sofa('BOAAT-CNR', 1000)])
  // Two bed frames, HB Straight charged RM 150, in a BELONG fabric.
  const b7 = await bill('B7', '2990S', ETHAN, [
    { group: 'bedframe', code: 'ARIA-(Q)', amount: 1600, qty: 2, specials: ['HB Straight'], custom: [charge('HB Straight', 150)], fabric: 'HG1313-02' },
  ])
  // A pillow taken back.
  const b8 = await bill('B8', '2990S', SHELDON, [{ group: 'accessory', code: 'SQUARE PILLOW-M', amount: -25, qty: -1 }])
  // X1-01: HOMELY on 2990s' list, AVANI on Houzs'.
  const b9 = await bill('B9', '2990S', SHELDON, [sofa('TELLUC-2A(LHF)', 1600, { fabric: 'X1-01' })])
  // As before: Latex Seat RM 500 on a sofa of no model that is an item; Sofa Full Fabric RM 250.
  const n1 = await bill('N1', '2990S', ETHAN, [
    sofa('QUBBU-1A(LHF)', 1495, latex(500)), sofa('QUBBU-2A(RHF)', 1495, latex(500)),
  ])
  const n2 = await bill('N2', '2990S', SHELDON, [
    sofa('TELLUC-2A(LHF)', 1625, { specials: FABRIC, custom: [charge('Sofa Full Fabric', 250)] }),
    sofa('TELLUC-L(RHF)', 1625, { specials: FABRIC, custom: [charge('Sofa Full Fabric', 250)] }),
  ])
  // The sub-department's own bills: X1-01 is AVANI on Houzs' list; EZ-007 is on no Houzs list.
  const a1 = await bill('A1', 'AKEMI', ETHAN, [
    sofa('8030-2A', 3000, { ...latex(500), fabric: 'X1-01' }), { group: 'accessory', code: 'AK-PILLOW', amount: 200, qty: 2 },
  ])
  const a2 = await bill('A2', 'AKEMI', SHELDON, [sofa('9000-2A', 2000, { fabric: 'EZ-007' })])
  const before = [n1, n2, a1, a2]
  const brandBills = [b1, b2, b3, b4, b5, b6, b7, b8, b9]
  const allBills = [...brandBills, ...before]

  const hitsOf = async (orders, asAt = NOV_END) => (await q(
    `SELECT o.order_no, coalesce(k.product_name, k.option_value, k.product_code) AS item, (k.brand_id IS NOT NULL) AS brand,
            h.qty::float AS qty, round(h.unit_amount, 2)::float AS unit
       FROM comm_kpi_hits($1, $2::uuid[], $3) h
       JOIN sales_orders o ON o.id = h.order_id JOIN comm_kpi_items k ON k.id = h.item_id
      ORDER BY 1, 2, 5`, [SCHEME, orders, asAt])).map(r => `${r.order_no} ${r.brand ? 'brand' : 'own'} ${r.item} ×${r.qty} @${r.unit}`)
  const monthOf = async () => Object.fromEntries((await q(
    `SELECT order_no, commissionable::float AS c FROM revenue_month_orders($1, $2)`, [FAIR, NOV])).map(r => [r.order_no, r.c]))

  // Fair's own KPI is on (2026-11-13, 18:43): the sub-department's bill finds its own.
  await q(`UPDATE comm_schemes SET enable_kpi = true WHERE id = $1`, [SCHEME])

  const asBefore = await hitsOf(allBills)
  check(asBefore, [
    'A1 own AKEMI PILLOW ×2 @30', 'A1 own AVANI · Sofa fabric ×1 @45', 'A1 own Latex Seat ×1 @40',
    'B1 brand Upgrade latex seat ×1 @500', 'B2 brand Upgrade latex seat ×1 @1000',
    'N1 brand Upgrade latex seat ×1 @500', 'N2 brand Upgrade fabric ×1 @250',
  ], "before: the brand's two sofa specials as billed, the sub-department's own as their amounts")
  const monthBefore = await monthOf()

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

  // With the brand's two sofa specials alone, nothing moves.
  check(await hitsOf(allBills), asBefore, 'every bill finds what it found before')
  check(await monthOf(), monthBefore, "and Comm Cal's month is as it was")

  // ── The table ──────────────────────────────────────────────────────────────
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'models', 'Boaat', 10, '2026-11-01')`, [SCHEME], /kpi_item_pool_is_a_brands/,
    "the sub-department's own item is no model")
  await reject(`INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from)
                VALUES ($1, 'option', 'colours', 'Red', 10, '2026-11-01')`, [SCHEME], /kpi_item_identity/,
    'a pool not among the six is refused')

  // ── 2990s' items of every kind, in force from November ─────────────────────
  await q(`INSERT INTO comm_kpi_items(scheme_id, brand_id, source, product_code, product_name, erp_product_id, kpi_amount, effective_from)
           VALUES ($1, $2, 'sku', 'SQUARE PILLOW-M', 'Square pillow', 'p2', 10, '2026-11-01'),
                  ($1, $2, 'sku', 'LOTTI-CNR', 'Lotti corner', 'l-cnr', 5, '2026-11-01'),
                  ($1, $2, 'sku', 'SVC-DELIVERY', 'Delivery', 'p-svc2', 5, '2026-11-01')`, [SCHEME, OWN])
  await q(`INSERT INTO comm_kpi_items(scheme_id, brand_id, source, option_pool, option_value, product_name, kpi_amount, effective_from)
           VALUES ($1, $2, 'option', 'models', 'Boaat', NULL, 40, '2026-11-01'),
                  ($1, $2, 'option', 'compartments', 'CNR', NULL, 30, '2026-11-01'),
                  ($1, $2, 'option', 'bedframe_specials', 'HB Straight', NULL, 20, '2026-11-01'),
                  ($1, $2, 'option', 'sofa_fabric_series', 'EZ', 'EZ · Sofa fabric', 50, '2026-11-01'),
                  ($1, $2, 'option', 'sofa_fabric_series', 'HOMELY', 'HOMELY · Sofa fabric', 60, '2026-11-01'),
                  ($1, $2, 'option', 'bedframe_fabric_series', 'BELONG', 'BELONG · Bed frame fabric', 15, '2026-11-01')`,
  [SCHEME, OWN])

  check(await hitsOf([b1]), [
    'B1 brand Boaat ×1 @3740', 'B1 brand Delivery ×1 @0', 'B1 brand EZ · Sofa fabric ×1 @0',
    'B1 brand Square pillow ×2 @25', 'B1 brand Upgrade latex seat ×1 @0',
  ], 'a model: the whole sofa (both pieces) once a set; its latex seat found but nothing more off — its charge is in the '
    + "sofa's money; an EZ fabric (no series on the list: its code's family) found, nothing off; a SKU per unit at its "
    + 'line; a delivery found, nothing off its commissionable sales')
  check(await hitsOf([b2]), [
    'B2 brand CNR ×1 @1500', 'B2 brand HOMELY · Sofa fabric ×1 @0', 'B2 brand Upgrade latex seat ×1 @0',
  ], "a compartment: the corner piece's money once a set; BROWNIE-02 is HOMELY on 2990s' list")
  check(await hitsOf([b3]), ['B3 brand CNR ×1 @2000'], 'a U with two corners: one sofa, one unit — both corners come off')
  check(await hitsOf([b4]), ['B4 brand CNR ×2 @1000'], 'two corner sofas alike on a bill: two units')
  check(await hitsOf([b5]), ['B5 brand Lotti corner ×1 @1200'], "a piece that is a SKU item is no compartment's")
  check(await hitsOf([b6]), ['B6 brand Boaat ×1 @3000'], "a sofa of a model that is an item is its model's, corner and all")
  check(await hitsOf([b7]), ['B7 brand BELONG · Bed frame fabric ×2 @0', 'B7 brand HB Straight ×2 @150'],
    "a bed frame's special per bed frame at its charge; its fabric series per bed frame, nothing off")
  check(await hitsOf([b8]), ['B8 brand Square pillow ×-1 @25'], 'a pillow taken back takes its unit back')
  check(await hitsOf([b9]), ['B9 brand HOMELY · Sofa fabric ×1 @0'], "X1-01 on a 2990s bill: 2990s' list says HOMELY")
  check(await hitsOf(before), asBefore.filter(h => !h.startsWith('B')),
    "the sub-department's own bills and the brand's sofa-special bills find what they found before")
  check(await hitsOf([a2]), [], "EZ-007 on a Houzs bill: on no Houzs list, and a Houzs bill reads no code's family")
  check(await hitsOf([b1, b7], '2026-10-31'), [], "October's as-at: the brand's items begin in November")

  const month = await monthOf()
  check([month.B1, month.B2, month.B3, month.B4, month.B5, month.B6, month.B7, month.B8, month.N1, month.A1], [
    0, 4000, 4500, 9000, 2200, 0, 1300, 0, 2490, monthBefore.A1,
  ], "Comm Cal's month: each bill's commissionable sales less what its items take off")

  // The Revenue app's list: every item a code of its own.
  const kpi = await one(`SELECT member_kpi_for_staff($1, $2, $3)`, [ETHAN, SCHEME, NOV])
  const byCode = Object.fromEntries(kpi.items.map(i => [i.productCode, [i.label, Number(i.quantity), i.brand ?? null]]))
  check(kpi.items.every(i => typeof i.productCode === 'string' && i.productCode.length > 0), true, 'no item without a code')
  check(new Set(kpi.items.map(i => i.productCode)).size, kpi.items.length, 'no two items share a code')
  check([
    byCode['2990S · SQUARE PILLOW-M'], byCode['2990S · Boaat · Model'], byCode['2990S · CNR · Compartment'],
    byCode['2990S · HB Straight · Bed frame'], byCode['2990S · EZ · Sofa fabric'], byCode['2990S · BELONG · Bed frame fabric'],
    byCode['2990S · Latex Seat'], byCode['AK-PILLOW'],
  ], [
    ['Square pillow', 2, '2990S'], ['Boaat', 1, '2990S'], ['CNR', 1, '2990S'], ['HB Straight', 2, '2990S'],
    ['EZ · Sofa fabric', 1, '2990S'], ['BELONG · Bed frame fabric', 2, '2990S'], ['Upgrade latex seat', 3, '2990S'],
    ['AKEMI PILLOW', 2, null],
  ], "ETHAN's November: a SKU by its code, every other kind by its value and kind, a sofa special as before")

  // ── The writer ─────────────────────────────────────────────────────────────
  // A scheme of its own, so nothing above moves. "Today" is the office's.
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const save = (adds = [], changes = [], removes = []) => one(
    `SELECT catalogue_save_kpi_items($1, $2::jsonb, $3::jsonb, $4::uuid[])`, [TAB, JSON.stringify(adds), JSON.stringify(changes), removes])
  const refused = async (adds, changes, pattern, what) => {
    await assert.rejects(() => save(adds, changes), pattern, what)
    checks++
  }
  const stored = () => q(
    `SELECT k.source, k.option_pool AS pool, coalesce(k.option_value, k.product_code) AS value, k.product_name AS name,
            k.kpi_amount::float AS amount, k.cost_amount, k.corner_cost_amount, k.effective_from::text AS "from"
       FROM comm_kpi_items k WHERE k.scheme_id = $1 AND k.brand_id IS NOT NULL ORDER BY 1, 2, 3`, [TAB])
  const brandOpt = (pool, value, more = {}) => ({ source: 'option', option_pool: pool, option_value: value, kpi_amount: 50, brand_id: TAB_OWN, ...more })

  check(await save([
    { source: 'sku', erp_product_id: 'p2', kpi_amount: 10, brand_id: TAB_OWN },
    brandOpt('models', 'boaat'), brandOpt('compartments', 'cnr'), brandOpt('compartments', '1a'),
    brandOpt('sofa_fabric_series', 'ez'), brandOpt('bedframe_fabric_series', 'homely'),
    brandOpt('bedframe_specials', 'hb straight', { label: 'Headboard straight' }),
    // A family read off a code with spaces round its '-': no space kept on its name.
    brandOpt('sofa_fabric_series', ' velvet  interlace '),
  ]), 8, "eight of a brand's items, of every kind")
  check(await stored(), [
    { source: 'option', pool: 'bedframe_fabric_series', value: 'HOMELY', name: 'HOMELY · Bed frame fabric', amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    { source: 'option', pool: 'bedframe_specials', value: 'HB Straight', name: 'Headboard straight', amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    { source: 'option', pool: 'compartments', value: '1A', name: null, amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    { source: 'option', pool: 'compartments', value: 'CNR', name: null, amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    { source: 'option', pool: 'models', value: 'Boaat', name: null, amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    { source: 'option', pool: 'sofa_fabric_series', value: 'EZ', name: 'EZ · Sofa fabric', amount: 50, cost_amount: null, corner_cost_amount: null, from: today },
    {
      source: 'option', pool: 'sofa_fabric_series', value: 'Velvet Interlace', name: 'Velvet Interlace · Sofa fabric', amount: 50,
      cost_amount: null, corner_cost_amount: null, from: today,
    },
    { source: 'sku', pool: null, value: 'SQUARE PILLOW-M', name: 'SOFA SQUARE PILLOW-M (16"X16")', amount: 10, cost_amount: null, corner_cost_amount: null, from: today },
  ], "each in the master's own spelling — a model its live SKUs', a compartment as the costing reads a piece (1A(P)(LHF) "
    + 'is 1A), a series its list\'s or its code\'s family — named as asked, else as the master names it; no cost')
  await refused([{ source: 'sku', erp_product_id: 'p1', kpi_amount: 10, brand_id: TAB_OWN }], [], /SKU p1 is not in the SKU Master/,
    "another company's SKU is no SKU of the brand's")
  await refused([brandOpt('models', 'Nope')], [], /"Nope" is no model of the SKU Master/, 'a model the master has not')
  await refused([brandOpt('compartments', 'XYZ')], [], /"XYZ" is no sofa compartment of the SKU Master/, 'a compartment no sofa has')
  await refused([brandOpt('sofa_fabric_series', 'AVANI')], [], /"AVANI" is not a fabric series on the ERP's fabric list/,
    "another company's series is none of the brand's")
  await refused([brandOpt('models', 'BOAAT')], [], /no_overlapping_kpi_option|exclusion/, 'a model already on the list, again')
  await refused([{ source: 'option', option_pool: 'models', option_value: 'Boaat', kpi_amount: 10 }], [],
    /Only a brand's own KPI item is a model or a compartment/, "the sub-department's own item is no model")
  await refused([{ source: 'option', option_pool: 'sofa_specials', option_value: 'Hand Stitch', kpi_amount: 10, unit_tiers: [{ min_qty: 5, amount: 70 }] }], [],
    /Only a brand's own KPI item pays by tier/, "the sub-department's own item still pays no tier")

  const cnrId = await one(`SELECT id FROM comm_kpi_items WHERE scheme_id = $1 AND option_value = 'CNR'`, [TAB])
  check(await save([], [{ id: cnrId, cost_amount: 500, corner_cost_amount: 1000 }]), 0,
    'a cost or a corner cost sent by a page from before is neither written nor refused')
  check(await one(`SELECT coalesce(cost_amount, corner_cost_amount) FROM comm_kpi_items WHERE id = $1`, [cnrId]), null, 'it has none')
  check(await save([], [{ id: cnrId, kpi_amount: 60, unit_tiers: [{ min_qty: 5, amount: 70 }] }]), 1, 'a new bonus and a tier')
  check(await one(`SELECT kpi_amount::float || ' / ' || unit_tiers::text FROM comm_kpi_items WHERE id = $1`, [cnrId]),
    '60 / [{"amount": 70, "min_qty": 5}]', 'stored where it stands — begun today')

  // ── Production changed since: nothing is touched ───────────────────────────
  // 20261114100000 run again stops at the bodies this migration made…
  await assert.rejects(async () => db.exec(await read(migrationFile(CHAIN[3]))),
    /is md5 [0-9a-f]{32}, not the body this migration was written from/, '20261114100000 run again stops at the bodies this one made')
  await db.exec('ROLLBACK')
  checks++
  check([await md5Of(SIG.hits), await md5Of(SIG.save), await md5Of(SIG.member)],
    [MAKES[SIG.hits]?.makes, MAKES[SIG.save]?.makes, MAKES[SIG.member]?.makes], 'and those bodies stand')
  // …and this one stops at a body somebody changed since.
  await db.exec(`CREATE OR REPLACE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
    RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric)
    LANGUAGE sql STABLE SET search_path TO 'public' AS $f$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, 0::numeric, 0::numeric WHERE false $f$`)
  await assert.rejects(() => db.exec(migration), /comm_kpi_hits\(uuid, uuid\[\], date\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a changed body is refused')
  await db.exec('ROLLBACK')
  checks++
  check(await md5Of(SIG.save), MAKES[SIG.save]?.makes, 'and nothing else was touched')

  console.log(`PASS: ${checks} brand KPI any-item checks. Production's bodies (md5-checked) + the chain 20261112200000 … 20261114100000 + the real migration 20261114230000 (twice); synthetic surroundings. No live I/O.`)
} finally {
  await db.close()
}
