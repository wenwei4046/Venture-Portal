// Local PostgreSQL regression for 20261114020000 — 2990s' own KPI items in the Revenue app (2026-11-12; the user, of a
// 2990s bill: "他唯一不会出现的，只是所谓的 margin arena，但他会出现到 sales arena、brand arena，同时还有 KPI item 的
// arena"; of the switch: "2990s 独立照发").
//
// Production's bodies are loaded over stand-ins for what they read: the hits, the special orders' money and the
// member's KPI summary as 20261112200000 leaves them (its own fixture, then that migration verbatim), and the facts,
// their wrapper and both order books as production holds them (brand-kpi-member-production.sql, md5-checked). The
// migration then runs VERBATIM, twice. What is under test: with the sub-department's KPI switch OFF a 2990s bill that
// charges for an upgrade counts its unit and leaves the upgrade's money out of its sales — in the facts, in both
// order books, in the KPI summary — while every other bill reads exactly as before; a shared bill splits both; the
// summary's threshold is the sub-department's own ladder, read against its own units; with the switch on the two
// stand side by side; a brand switched off, or a month before its items, counts nothing. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const KPI_ITEMS = new URL('../../supabase/migrations/20261112200000_brand_kpi_items.sql', import.meta.url)
const MIGRATION = new URL('../../supabase/migrations/20261114020000_brand_kpi_member.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const num = v => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const DEPT = id(90)
const FAIR = id(1)
const SCHEME = id(5)
const BATCH_NOV = id(7)
const BATCH_OCT = id(9)
const PRINCIPAL = id(8)
const AKEMI = id(21)
const OWN = id(22)
const ETHAN = id(31)
const SHELDON = id(32)
const OCT = '2026-10-01'
const NOV = '2026-11-01'
const DEC = '2026-12-01'

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE users(id uuid PRIMARY KEY, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, payroll_source text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text, is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text, title_id uuid,
      status text NOT NULL DEFAULT 'active');
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text, code text, is_active boolean NOT NULL DEFAULT true,
      department_id uuid);
    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, enable_kpi boolean NOT NULL DEFAULT false,
      enable_margin_penalty boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date,
      deposit_threshold_pct numeric, revenue_cost_divisor numeric(6,4) NOT NULL DEFAULT 1);
    -- comm_brands as 20261112003700 leaves it (the columns read here).
    CREATE TABLE comm_brands(id uuid PRIMARY KEY, scheme_id uuid NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
      code text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      own_scheme boolean NOT NULL DEFAULT false, erp_company_id bigint,
      CONSTRAINT uq_comm_brand_code UNIQUE (scheme_id, code));
    CREATE TABLE comm_margin_bands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text,
      band_key text, label text, margin_pct numeric, commission_multiplier numeric NOT NULL DEFAULT 1,
      monthly_incentive numeric NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0);
    CREATE TABLE comm_hierarchy(staff_id uuid, scheme_id uuid, title_id uuid, upline_staff_id uuid,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_kpi_thresholds(scheme_id uuid, min_qty integer, bonus_pct numeric,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
    CREATE TABLE comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
    CREATE TABLE comm_cost_ratio_brands(scheme_id uuid, product_code text, brand_code text, ratio numeric);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text, canonical_key text);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_key text, organiser_id uuid,
      period_month date, start_date date, end_date date, erp_organiser_text text);
    CREATE TABLE erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
    CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
      status text NOT NULL DEFAULT 'committed');
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      source text NOT NULL DEFAULT 'erp_sync', created_at timestamptz NOT NULL DEFAULT now(),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date,
      customer_name text, debtor_code text, venue text, location text, brand_code text,
      order_total numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0, balance numeric,
      cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text, erp_on_hold boolean,
      sequence_in_day integer, staff_id uuid, agent_name text, manual_margin_pct numeric, bill_ref text, raw jsonb,
      fair_source text, fair_event_id uuid, erp_company_id bigint);
    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      line_no integer, item_group text, product_code text, product_name text, description2 text,
      qty numeric NOT NULL DEFAULT 1, line_amount numeric NOT NULL DEFAULT 0, cost_amount numeric,
      option_charge_amount numeric, brand_code text, raw jsonb);
    CREATE TABLE sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
    CREATE TABLE comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid);
    CREATE TABLE comm_salesperson_closes(staff_id uuid, sub_department_id uuid, period_month date, reopened_at timestamptz,
      penalised_orders jsonb, order_ids uuid[]);
    CREATE TABLE comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, sub_department_id uuid,
      period_month date, status text, penalised_orders jsonb);
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
    CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
    -- Each holder of a bill and their part: the owner the remainder, each colleague their share (production's rule).
    CREATE FUNCTION sales_order_parts(p_orders uuid[]) RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
    LANGUAGE sql STABLE AS $$
      SELECT so.id, so.staff_id, 1 - coalesce((SELECT sum(s.share_pct) FROM sales_order_shares s WHERE s.order_id = so.id), 0), so.staff_id
        FROM sales_orders so WHERE so.id = ANY (p_orders)
      UNION ALL
      SELECT s.order_id, s.staff_id, s.share_pct, so.staff_id
        FROM sales_order_shares s JOIN sales_orders so ON so.id = s.order_id WHERE s.order_id = ANY (p_orders)
    $$;
    CREATE FUNCTION sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date) RETURNS boolean
    LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false) $$;
    CREATE FUNCTION member_erp_brand_weeks(uuid, uuid) RETURNS TABLE(week date, brand text) LANGUAGE sql STABLE AS
      $$ SELECT NULL::date, NULL::text WHERE false $$;
    CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT upper(btrim($1)) $$;
    CREATE FUNCTION member_principal_department_scheme(uuid) RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT c.id FROM comm_schemes c WHERE c.sub_department_id = $1 AND c.is_active LIMIT 1 $$;
    CREATE FUNCTION member_insight_window(text, text) RETURNS daterange LANGUAGE sql IMMUTABLE AS
      $$ SELECT daterange(($1 || '-01')::date, (($2 || '-01')::date + interval '1 month')::date) $$;
  `)

  // ── The hits and the KPI summary as 20261112200000 leaves them ─────────────
  // Its own fixture (production's bodies it was written from), comm_kpi_items as production held it, then that
  // migration verbatim. Bodies it remakes read tables this file has no use for: not checked at creation.
  await db.exec('SET check_function_bodies = off')
  await db.exec((await readFile(new URL('./brand-kpi-items-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
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
    INSERT INTO hr_staff_costs(id, employee_name, employee_code) VALUES ('${ETHAN}', 'ETHAN', 'HV101'), ('${SHELDON}', 'SHELDON TAN', 'HV102');
    INSERT INTO comm_schemes(id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES ('${SCHEME}', '${FAIR}', 0.3, 0.7);
    INSERT INTO comm_brands(id, scheme_id, code, name, own_scheme, erp_company_id) VALUES
      ('${AKEMI}', '${SCHEME}', 'AKEMI', 'Akemi', false, NULL), ('${OWN}', '${SCHEME}', '2990S', '2990s', true, 2);
    INSERT INTO comm_hierarchy(staff_id, scheme_id) VALUES ('${ETHAN}', '${SCHEME}'), ('${SHELDON}', '${SCHEME}');
    -- The sub-department's own ladder: four units.
    INSERT INTO comm_kpi_thresholds(scheme_id, min_qty, bonus_pct) VALUES ('${SCHEME}', 4, 0.2), ('${SCHEME}', 9, 0.4);
    INSERT INTO comm_item_groups VALUES
      ('${SCHEME}', 'SOFA', true), ('${SCHEME}', 'ACCESSORY', true), ('${SCHEME}', 'SERVICE', false);
    INSERT INTO erp_products VALUES ('p1', 'AK-PILLOW', 'AKEMI PILLOW');
    INSERT INTO erp_maintenance_options(erp_company_id, pool, value) VALUES
      (1, 'sofa_specials', 'Latex Seat'), (2, 'sofa_specials', 'Latex Seat'), (2, 'sofa_specials', 'Sofa Full Fabric');
    INSERT INTO sales_import_batches VALUES ('${BATCH_OCT}', '${FAIR}', '${OCT}', 'committed'), ('${BATCH_NOV}', '${FAIR}', '${NOV}', 'committed');

    -- The sub-department's own items, in force since August: a sofa special and a SKU.
    INSERT INTO comm_kpi_items(scheme_id, source, option_pool, option_value, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'option', 'sofa_specials', 'Latex Seat', 40, '2026-08-01');
    INSERT INTO comm_kpi_items(scheme_id, source, product_code, product_name, erp_product_id, kpi_amount, effective_from) VALUES
      ('${SCHEME}', 'sku', 'AK-PILLOW', 'AKEMI PILLOW', 'p1', 30, '2026-08-01');
  `)
  await db.exec((await readFile(KPI_ITEMS, 'utf8')).replace(/\r\n/g, '\n'))

  // ── The facts, their wrapper and both order books, as production holds them ─
  await db.exec((await readFile(new URL('./brand-kpi-member-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  await db.exec('SET check_function_bodies = on')

  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    facts: 'public.member_order_facts_with_old_bills(uuid, date, date)',
    book: 'public.member_order_book_for_staff(uuid, uuid, date, date)',
    pbook: 'public.member_principal_department_order_book(uuid, text, text)',
    insight: 'public.member_principal_department_insight(uuid, text, text)',
    kpi: 'public.member_kpi_for_staff(uuid, uuid, date)',
  }
  const PRODUCTION = {
    facts: 'c839f5c6887b77dda97f86898e6f1da3',
    book: '3a4b29f5ca1f1b674536cc4d606e9993',
    pbook: '59e5b8cc4abd4586fc02387ccf1d4d9c',
    insight: '6cc446a75ff9a772c3c2c332db7f16da',
    // What 20261112200000 makes of it.
    kpi: '2c34201f1ed847022e3bc6b306b574f1',
  }
  for (const [name, md5] of Object.entries(PRODUCTION)) {
    check(await md5Of(SIG[name]), md5, `${name}: the fixture is production's body`)
  }
  check(await md5Of('public.member_order_facts(uuid, date, date)'), '987d328c0ec4087e4ce6f3e58346a382', "the facts' wrapper is production's")
  check(await md5Of('public.member_scoreboard_range(uuid, date, date)'), '8a3ad7360a1a875436d84201aedbe114', "the scoreboard is production's")
  check(await md5Of('public.comm_kpi_hits(uuid, uuid[], date)'), '2f12a0cd2714f2bd831c71d310fcb66b', 'the hits are what 20261112200000 makes')

  // ── The bills ──────────────────────────────────────────────────────────────
  // A bill as the ERP delivers it: its lines, and the same items whole on the order (raw.items), where the special
  // order's money is. Paid in full unless said (the deposit gate is 30%).
  let seq = 0
  const bill = async (orderNo, brand, staff, lines, more = {}) => {
    const items = lines.map((l, i) => ({
      line_no: i, item_code: l.code, cancelled: false,
      ...(l.specials ? { variants: { specials: l.specials } } : {}),
      custom_specials: l.custom ?? [],
    }))
    const total = lines.reduce((a, l) => a + l.amount, 0)
    const month = more.month ?? NOV
    const orderId = await one(
      `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, brand_code, order_total, paid_amount, staff_id, sequence_in_day, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [month === NOV ? BATCH_NOV : BATCH_OCT, month, orderNo, month === NOV ? '2026-11-08' : '2026-10-20', brand, total,
        more.paid ?? total, staff, ++seq, JSON.stringify({ items })])
    for (const [i, l] of lines.entries()) {
      await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, product_name, qty, line_amount, brand_code, raw)
               VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
        [orderId, i, l.group, l.code, l.qty ?? 1, l.amount, brand,
          l.specials ? JSON.stringify({ variants: { specials: l.specials } }) : null])
    }
    return orderId
  }
  const sofa = (code, amount, specials, custom) => ({ group: 'sofa', code, amount, specials, custom })
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
  ])
  // The upgrade given away: named, charged nothing.
  const n3 = await bill('N3', '2990S', ETHAN, [
    sofa('QUBBU-1A(LHF)', 1495, ['Latex Seat'], [charge('Latex Seat', 0)]),
    sofa('QUBBU-2A(RHF)', 1495, ['Latex Seat'], [charge('Latex Seat', 0)]),
  ])
  // ETHAN's bill, half SHELDON's: the fabric upgrade is half a unit each.
  const s1 = await bill('S1', '2990S', ETHAN, [
    sofa('TELLUC-2A(LHF)', 1620, ['Sofa Full Fabric'], [charge('Sofa Full Fabric', 250)]),
    sofa('TELLUC-L(RHF)', 1620, ['Sofa Full Fabric'], [charge('Sofa Full Fabric', 250)]),
  ])
  await q('INSERT INTO sales_order_shares VALUES ($1, $2, 0.5)', [s1, SHELDON])
  // Under its deposit: no sale yet.
  const d1 = await bill('D1', '2990S', ETHAN, [
    sofa('LOTTI-2A', 3490, ['Latex Seat'], [charge('Latex Seat', 500)]),
  ], { paid: 100 })
  // A bill of the sub-department's own: the same special, the same money on its special order, and two pillows.
  const a1 = await bill('A1', 'AKEMI', ETHAN, [
    sofa('8030-2A', 3000, ['Latex Seat'], [charge('Latex Seat', 500)]),
    { group: 'accessory', code: 'AK-PILLOW', amount: 200, qty: 2 },
  ])
  // October, before the brand's items are in force.
  const o1 = await bill('O1', '2990S', ETHAN, [
    sofa('BOAAT-2A', 3490, ['Latex Seat'], [charge('Latex Seat', 500)]),
  ], { month: OCT })

  // ── What is read ───────────────────────────────────────────────────────────
  const NAME = { [n1]: 'N1', [n2]: 'N2', [n3]: 'N3', [s1]: 'S1', [d1]: 'D1', [a1]: 'A1', [o1]: 'O1' }
  const WHO = { [ETHAN]: 'ETHAN', [SHELDON]: 'SHELDON' }
  /** The facts of a window: bill · holder → [sales, KPI units, cleared]. */
  const facts = async (from = NOV, until = DEC) => Object.fromEntries((await q(
    `SELECT f.order_id, f.staff_id, f.revenue, f.kpi_qty, f.cleared, f.full_revenue
       FROM member_order_facts_with_old_bills($1, $2, $3) f ORDER BY f.order_no, f.staff_id`, [SCHEME, from, until]))
    .map(f => [`${NAME[f.order_id]} ${WHO[f.staff_id]}`, [num(f.revenue), num(f.kpi_qty), f.cleared, num(f.full_revenue)]]))
  /**
   * What must not move, as fingerprints: every column of every bill that is not the brand's, and of the brand's own
   * every column but its sales, its units and the base no margin is read on.
   */
  const rest = async () => (await q(
    `SELECT md5(string_agg(f::text, ';' ORDER BY f.order_no, f.staff_id) FILTER (WHERE f.brand <> '2990S')) AS others,
            md5(string_agg(concat_ws('|', f.order_id, f.staff_id, f.order_no, f.order_date, f.source_period, f.recognition_month,
              f.brand, f.cleared, f.margin_pct, f.manual, f.no_sales_cost, f.old_bill, f.weight), ';'
              ORDER BY f.order_no, f.staff_id) FILTER (WHERE f.brand = '2990S')) AS own
       FROM member_order_facts_with_old_bills($1, $2, $3) f`, [SCHEME, OCT, DEC]))[0]
  /** A member's book: bill → [sales, KPI units, its lines' units — the most first: a set's unit is on one of its pieces]. */
  const book = async staff => Object.fromEntries(((await one(
    'SELECT member_order_book_for_staff($1, $2, $3, $4)', [staff, SCHEME, NOV, DEC])).orders)
    .map(o => [o.number, [num(o.revenue), num(o.kpiQty), o.lines.map(l => num(l.kpiQty)).sort((a, b) => b - a)]]))
  /** The sub-department's book: bill → [sales, KPI units, each line's units]. */
  const wholeBook = async () => Object.fromEntries(((await one(
    'SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, '2026-11', '2026-11'])).orders)
    .map(o => [o.number, [num(o.revenue), num(o.kpiQty), o.lines.map(l => num(l.kpiQty)).sort((a, b) => b - a)]]))
  /** The member's KPI summary of a month, without its clock. */
  const summary = async (staff, month = NOV) => {
    const { asOf: _asOf, ...answer } = await one('SELECT member_kpi_for_staff($1, $2, $3)', [staff, SCHEME, month])
    return { ...answer, items: answer.items.map(i => ({ ...i, quantity: num(i.quantity) })), total: num(answer.total),
      ...('ladderTotal' in answer ? { ladderTotal: num(answer.ladderTotal) } : {}) }
  }
  const OFF = { schemeId: SCHEME, period: '2026-11', enabled: false, items: [], total: 0, threshold: null, hit: null }
  /** The whole sub-department's month: [everybody's sales, everybody's KPI units, whether KPI counts and its threshold]. */
  const whole = async (month = '2026-11') => {
    const d = await one('SELECT member_principal_department_insight($1, $2, $2)', [FAIR, month])
    return [num(d.team.sales), num(d.team.kpiQty), d.kpi]
  }

  // ── Before: the switch is off, and the Revenue app asks for no KPI item ────
  const BEFORE = {
    'A1 ETHAN': [3200, 0, true, 3200],
    'D1 ETHAN': [3490, 0, false, 3490],
    'N1 ETHAN': [3740, 0, true, 3740],
    'N2 SHELDON': [3250, 0, true, 3250],
    'N3 ETHAN': [2990, 0, true, 2990],
    'S1 ETHAN': [1620, 0, true, 3240],
    'S1 SHELDON': [1620, 0, true, 3240],
  }
  check(await facts(), BEFORE, 'before: every bill counts all it sold, and no KPI unit')
  check(await summary(ETHAN), OFF, 'before: the KPI summary is off')
  check((await book(ETHAN)).N1, [3740, 0, [0, 0, 0]], "before: the member's book counts no unit on the bill")
  check((await wholeBook()).N1, [3740, 0, [0, 0, 0]], "before: the sub-department's book neither")
  // Every cleared bill of the month: 3,200 + 3,740 + 3,250 + 2,990 + 3,240.
  check(await whole(), [16420, 0, { enabled: false, threshold: null }], 'before: the whole sub-department says KPI is not counted')
  const restBefore = await rest()

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

  // ── After, the switch still off: the brand's own items count ───────────────
  const AFTER = {
    ...BEFORE,
    // Under its deposit it is still no sale; its unit is not counted anywhere a sale is.
    'D1 ETHAN': [2990, 1, false, 2990],
    // Latex Seat RM 500 off the sofa's RM 3,740; one unit.
    'N1 ETHAN': [3240, 1, true, 3240],
    // Sofa Full Fabric RM 250 off RM 3,250 (the RM 10 beside it is no KPI item's).
    'N2 SHELDON': [3000, 1, true, 3000],
    // Shared half and half: RM 1,495 and half a unit each.
    'S1 ETHAN': [1495, 0.5, true, 2990],
    'S1 SHELDON': [1495, 0.5, true, 2990],
  }
  check(await facts(), AFTER, "after: a 2990s bill that charges for an upgrade counts its unit, the upgrade's money off its sales")
  check(await rest(), restBefore, "after: no bill of another brand moved, and of the brand's own nothing but its sales and units")
  check((await facts(OCT, NOV))['O1 ETHAN'], [3490, 0, true, 3490], 'a bill of a month before the items is as it was')

  check(await book(ETHAN), {
    A1: [3200, 0, [0, 0]],
    D1: [2990, 1, [1]],
    N1: [3240, 1, [1, 0, 0]],
    N3: [2990, 0, [0, 0]],
    S1: [1495, 0.5, [0.5, 0]],
  }, "the member's book: the unit on one piece of the sofa, a shared bill's by their part")
  check((await book(SHELDON)).S1, [1495, 0.5, [0.5, 0]], "the colleague's book: their half")
  check(await wholeBook(), {
    A1: [3200, 0, [0, 0]],
    D1: [2990, 1, [1]],
    N1: [3240, 1, [1, 0, 0]],
    N2: [3000, 1, [1, 0]],
    N3: [2990, 0, [0, 0]],
    S1: [2990, 1, [1, 0]],
  }, "the sub-department's book: each bill whole")

  const FABRIC = { productCode: '2990S · Sofa Full Fabric', label: 'Upgrade fabric', brand: '2990S' }
  const LATEX = { productCode: '2990S · Latex Seat', label: 'Upgrade latex seat', brand: '2990S' }
  check(await summary(ETHAN), {
    schemeId: SCHEME, period: '2026-11', enabled: true,
    // N1's latex seat; half of S1's fabric. D1 is under its deposit; N3's upgrade was given away.
    items: [{ ...FABRIC, quantity: 0.5 }, { ...LATEX, quantity: 1 }],
    total: 1.5, ladderTotal: 0, threshold: null, hit: null,
  }, "the summary is on with the brand's own items alone, and no ladder")
  check(await summary(SHELDON), {
    schemeId: SCHEME, period: '2026-11', enabled: true,
    items: [{ ...FABRIC, quantity: 1.5 }, { ...LATEX, quantity: 0 }],
    total: 1.5, ladderTotal: 0, threshold: null, hit: null,
  }, "a colleague's: their own bill and their half")
  check(await summary(ETHAN, OCT), { ...OFF, period: '2026-10' }, 'a month before the items: off, as it was')
  // The upgrades' RM 500 + 250 + 250 off the month's sales; three units on the cleared bills (D1 is under its deposit).
  check(await whole(), [15420, 3, { enabled: true, threshold: null }], 'the whole sub-department: KPI counts, with no ladder')
  check(await whole('2026-10'), [3490, 0, { enabled: false, threshold: null }], 'the whole sub-department, a month before the items: not counted')

  // ── The switch on: the sub-department's own beside the brand's ─────────────
  await q('UPDATE comm_schemes SET enable_kpi = true WHERE id = $1', [SCHEME])
  check(await facts(), {
    ...AFTER,
    // Its own special once a bill (RM 40) and two pillows (RM 30 each): RM 100 off, three units.
    'A1 ETHAN': [3100, 3, true, 3100],
  }, 'switch on: the sub-department\'s own items are found on its own bills, a 2990s bill as before')
  check(await summary(ETHAN), {
    schemeId: SCHEME, period: '2026-11', enabled: true,
    items: [
      { productCode: 'AK-PILLOW', label: 'AKEMI PILLOW', quantity: 2 },
      { productCode: 'Latex Seat', label: 'Latex Seat', quantity: 1 },
      { ...FABRIC, quantity: 0.5 }, { ...LATEX, quantity: 1 },
    ],
    // 4.5 units in all, three of them the sub-department's own: a ladder of four is not reached.
    total: 4.5, ladderTotal: 3, threshold: 4, hit: false,
  }, "switch on: its own items first, then the brand's; the ladder reads its own units alone")
  // Its own RM 100 off A1 too, and A1's three units.
  check(await whole(), [15320, 6, { enabled: true, threshold: 4 }], "switch on: the whole sub-department reads its own ladder's first rung")
  await q('UPDATE comm_kpi_thresholds SET min_qty = 3 WHERE scheme_id = $1 AND min_qty = 4', [SCHEME])
  check((await summary(ETHAN)).hit, true, 'a ladder of three is reached by its own three')
  await q('UPDATE comm_kpi_thresholds SET min_qty = 4 WHERE scheme_id = $1 AND min_qty = 3', [SCHEME])
  await q('UPDATE comm_schemes SET enable_kpi = false WHERE id = $1', [SCHEME])
  check(await facts(), AFTER, 'switch off again: as after the migration')

  // ── The brand switched off: no brand of its own scheme, no item of its own ─
  await q('UPDATE comm_brands SET is_active = false WHERE id = $1', [OWN])
  check(await summary(ETHAN), OFF, 'the brand switched off: the summary is off')
  check(await whole(), [16420, 0, { enabled: false, threshold: null }], 'the brand switched off: the whole sub-department as before')
  check((await facts())['N1 ETHAN'].slice(0, 2), [3740, 0], 'the brand switched off: the bill counts all it sold, no unit')
  await q('UPDATE comm_brands SET is_active = true WHERE id = $1', [OWN])
  check(await facts(), AFTER, 'the brand back on: as after the migration')

  // ── A body changed since is refused ────────────────────────────────────────
  const made = await one('SELECT pg_get_functiondef(to_regprocedure($1))', [SIG.book])
  await db.exec(made.replace('WITH scheme AS (', '-- changed on the database since\n WITH scheme AS ('))
  await assert.rejects(() => db.exec(migration),
    /member_order_book_for_staff\(uuid, uuid, date, date\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a body changed since the migration was written is refused')
  checks++

  console.log(`PASS: ${checks} brand KPI member checks. Production's bodies (md5-checked) + the real migrations 20261112200000 and 20261114020000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}
