// Local PostgreSQL regression for the catalogue mirror (2026-09-24): what the
// Houzs ERP says EXISTS, the price the portal types against it, what a sales
// line then costs, and what a salesperson's calculator may offer.
//
// The surrounding schema is synthetic — roles, auth.uid(), has_scope(), the
// commission and sales tables, the old hand-keyed Product List — but every
// migration under test runs VERBATIM, in order:
//
//   20260924020000  the mirror (items only), the portal's own tables, the ingest
//   20260924025000  the mattress adoption rule (brand + model name + size)
//   20260924030000  the portal's prices cost every sales line; combos at commit
//   20260924040000  member_catalogue, and the two snapshots that read it
//
// and so do the three that shaped what they reshape (20260918010000,
// 20260919010000, 20260919020000): erp_products / erp_sofa_combos,
// erp_combo_slots_key(), the cost_source CHECK and the BEFORE INSERT fill
// trigger are the real ones, not a hand copy that could drift from what the
// live database had. The rule under test is about money — no ERP price may
// enter, and every margin is measured against the portal's own — so a copied
// function that disagreed with the migration would test nothing. No live I/O.
//
// Supabase's default privileges are reproduced (every table and function a
// migration creates in `public` is granted to anon / authenticated /
// service_role), because a REVOKE in a migration only means something against
// them.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const J = v => JSON.stringify(v)
const num = v => (v === null || v === undefined ? null : Number(v))
const sorted = list => [...list].sort()

// A failed check is reported and counted, and the run goes on, so one wrong
// answer does not hide the next; the process exits nonzero at the end.
let checks = 0
const failures = []
const show = v => { try { return JSON.stringify(v) } catch { return String(v) } }
function check(actual, expected, what) {
  checks++
  try {
    assert.deepStrictEqual(actual, expected)
  } catch {
    failures.push(what)
    console.error(`FAIL  ${what}\n      expected ${show(expected)}\n      actual   ${show(actual)}`)
  }
}
async function reject(run, test, what) {
  checks++
  let error = null
  try { await run() } catch (e) { error = e }
  const ok = error !== null && (typeof test === 'function' ? test(error) : test.test(`${error.code} ${error.message}`))
  if (!ok) {
    failures.push(what)
    console.error(`FAIL  ${what}\n      ${error ? `wrong error: ${error.code} ${error.message}` : 'the statement succeeded'}`)
  }
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
const migrationSql = name => readFile(new URL(`${name}.sql`, migrations), 'utf8')
const migrate = async name => db.exec(await migrationSql(name))

// Run as an API role. `scopes` narrows the synthetic has_scope() ('none' = no
// scope at all); unset, every scope is held.
async function as(role, run, scopes = '') {
  await db.exec(`SET ROLE ${role}`)
  if (scopes) await db.exec(`SET test.scopes = '${scopes}'`)
  try {
    return await run()
  } finally {
    await db.exec('RESET test.scopes; RESET ROLE')
  }
}

// What 20260924020000's catalogue_strip_money (and the receiver's MONEY_KEYS)
// call money, plus a fabric's price and stock — none of it may be mirrored.
const MONEY_KEYS = new Set([
  'cost_price_sen', 'base_price_sen', 'price1_sen', 'sell_price_sen', 'pwp_price_sen',
  'seat_height_prices', 'prices_by_height', 'selling_prices_by_height', 'pwp_prices_by_height',
  'priceSen', 'costSen', 'sellingPriceSen', 'price', 'price_sen', 'selling_price_sen',
  'cost_price', 'costPrice', 'basePrice', 'price1', 'sellPrice', 'default_surcharge',
  'soh_sen', 'po_outstanding_sen', 'last_month_usage_sen', 'one_week_usage_sen',
  'two_weeks_usage_sen', 'one_month_usage_sen', 'shortage_sen', 'reorder_point_sen',
])
function pathsOf(value, test, path = '$') {
  if (Array.isArray(value)) return value.flatMap((v, i) => pathsOf(v, test, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(test(k) ? [`${path}.${k}`] : []),
      ...pathsOf(v, test, `${path}.${k}`),
    ])
  }
  return []
}

const FAIR = id(1)
const SCHEME = id(3)
const SEP = '2026-09-01'

// ── The ERP's catalogue, as its sender would deliver it ────────────────────
const M = {
  ult: id(101), sofa: id(102), apex: id(103), aqua: id(104), bed: id(105),
  gone: id(106), hidden: id(107), deep: id(121), free: id(122), latex: id(123), blank: id(199),
}
// Every money field the ERP's own rows carry, on one SKU, top level.
const MONEY_ON_A_SKU = {
  cost_price_sen: 180000, base_price_sen: 200000, price1_sen: 210000, sell_price_sen: 399900,
  pwp_price_sen: 5000, seat_height_prices: [{ height: '30', tier: 'PRICE_2', priceSen: 165000 }],
  cost_price: 1800, costPrice: 1800, basePrice: 2000, price1: 2100, sellPrice: 3999, price: 3999,
}
const sku = (erpId, code, category, extra = {}) => ({
  id: erpId, code, name: code, category, status: 'ACTIVE', updated_at: '2026-09-20T08:00:00Z', ...extra,
})
const P = {
  ult: sku('mfg-ult', 'AKEMI ULTIMATE MATT (K)', 'MATTRESS',
    { model_id: M.ult, size_code: 'K', size_label: 'King', branding: 'AKEMI', barcode: '955001', ...MONEY_ON_A_SKU }),
  aero: sku('mfg-aero', 'AERO-MP (K)', 'accessory', { name: 'AERO MATTRESS PROTECTOR (K)' }),
  m1a: sku('mfg-8030-1a', '8030-1A(LHF)', 'SOFA', { model_id: M.sofa, base_model: '8030', branding: 'ZANOTTI',
    name: 'SOFFIO 1A LHF', seat_height_prices: [{ height: '30', tier: 'PRICE_2', priceSen: 165000 }] }),
  m2a: sku('mfg-8030-2a', '8030-2A(RHF)', 'SOFA', { model_id: M.sofa, base_model: '8030', branding: 'ZANOTTI' }),
  mL: sku('mfg-8030-l', '8030-L(LHF)', 'SOFA', { model_id: M.sofa, branding: 'ZANOTTI' }),
  mCon: sku('mfg-8030-con', '8030-CONSOLE', 'SOFA', { model_id: M.sofa, branding: 'ZANOTTI' }),
  apex: sku('mfg-apex', 'AKEMI APEX MATT (K)', 'MATTRESS', { model_id: M.apex, size_code: 'K', branding: 'AKEMI' }),
  aqua: sku('mfg-aqua', 'DUNLOPILLO AQUA RELAXER 300 MATT (K)', 'MATTRESS',
    { model_id: M.aqua, size_code: 'K', branding: 'DUNLOPILLO' }),
  amira1: sku('mfg-amira-1', 'DUNLOPILLO AMIRA DELUXE MATT (Q)', 'MATTRESS', { size_code: 'Q', branding: 'DUNLOPILLO' }),
  amira2: sku('mfg-amira-2', 'DUNLOP AMIRA DELUXE MATT (Q)', 'MATTRESS', { size_code: 'Q', branding: 'DUNLOP' }),
  cloud: sku('mfg-cloud', 'ERGOTEX CLOUDREST MATT (Q)', 'MATTRESS', { size_code: 'Q', branding: 'ERGOTEX' }),
  bed: sku('mfg-1005-k', '1005-(K)', 'BEDFRAME', { model_id: M.bed, size_code: 'K', size_label: 'King', branding: 'BEDFRAME' }),
  ak1005: sku('mfg-ak1005', 'AKEMI 1005 MATT (K)', 'BEDFRAME', { size_code: 'K', branding: 'AKEMI' }),
  xcode: sku('mfg-xcode', 'X-CODE', 'ACCESSORY', { name: 'X CODE CUSHION' }),
  dreamOld: sku('mfg-dream-old', 'AK-DREAM MATT (Q)', 'MATTRESS', { size_code: 'Q', branding: 'AKEMI' }),
  pilA: sku('mfg-pil-a', 'PILLOW-A', 'ACCESSORY', { name: 'COMFY PILLOW' }),
  pilB: sku('mfg-pil-b', 'PILLOW-B', 'ACCESSORY', { name: 'LATEX PILLOW' }),
  retire: sku('mfg-retire', 'OLD-STOOL', 'ACCESSORY'),
  inactive: sku('mfg-inactive', 'INACTIVE-THING', 'ACCESSORY', { status: 'INACTIVE' }),
  noopt: sku('mfg-noopt', 'NO-OPTIONS-SKU', 'ACCESSORY'),
  inactLeg: sku('mfg-inactive-legacy', 'INACTIVE-LEGACY', 'ACCESSORY'),
  fresh: sku('mfg-fresh', 'FRESH-ITEM', 'ACCESSORY'),
  stool: sku('mfg-zn-stool', 'ZN-STOOL', 'SOFA'),
  arm: sku('mfg-zn-arm', 'ZN-ARM', 'SOFA'),
  chaise: sku('mfg-zn-chaise', 'ZN-CHAISE', 'SOFA'),
  unpriced: sku('mfg-unpriced', 'UNPRICED-ITEM', 'ACCESSORY'),
  rmodel: sku('mfg-rmodel', 'AKEMI RETIRED MATT (K)', 'MATTRESS', { model_id: M.gone, size_code: 'K', branding: 'AKEMI' }),
  hidden: sku('mfg-hidden', 'AKEMI HIDDEN MATT (K)', 'MATTRESS', { model_id: M.hidden, size_code: 'K', branding: 'AKEMI' }),
}
const model = (erpId, code, name, category, branding, allowed = {}, extra = {}) => ({
  id: erpId, model_code: code, name, category, branding, description: null, active: true,
  allowed_options: allowed, updated_at: '2026-09-20T08:00:00Z', ...extra,
})
const MODELS = {
  ult: model(M.ult, 'AKEMI-ULT', 'AKEMI ULTIMATE', 'MATTRESS', 'AKEMI', { sizes: ['K', 'Q'] }),
  sofa: model(M.sofa, '8030', 'SOFFIO', 'sofa', 'ZANOTTI', {
    compartments: ['1A(LHF)', '2A(RHF)', 'L(LHF)', 'CONSOLE'], sizes: ['30', '35', '40'],
    leg_heights: ['Default', '6"'], specials: ['Nylon Fabric', 'No Side Panel'],
  }, { priceSen: 12345, costSen: 999, default_surcharge: 50 }),
  apex: model(M.apex, 'AKEMI-APEX', 'AKEMI APEX', 'MATTRESS', 'AKEMI', { sizes: ['K'] }),
  aqua: model(M.aqua, 'DL-AQUA', 'DUNLOPILLO AQUA RELAXER 300', 'MATTRESS', 'DUNLOPILLO', { sizes: ['K'] }),
  bed: model(M.bed, '1005', '1005', 'BEDFRAME', 'BEDFRAME', {
    sizes: ['K'], divan_heights: ['8"', '10"', '12"', '14"'], total_heights: ['24"'], gaps: ['12"', '14"'],
    leg_heights: ['4"', 'No Leg'], specials: ['Right Drawer'],
  }),
  gone: model(M.gone, 'AKEMI-GONE', 'AKEMI RETIRED', 'MATTRESS', 'AKEMI'),
  hidden: model(M.hidden, 'AKEMI-HIDDEN', 'AKEMI HIDDEN', 'MATTRESS', 'AKEMI'),
}
// The ERP's maintenance config: a pool entry is a string or {value, active,
// priceSen, …}; the RM on it is the ERP's COST surcharge.
const POOLS = {
  divanHeights: ['8"', { value: '10"', priceSen: 3000, sellingPriceSen: 5000 }, { value: '12"', active: false, priceSen: 3500 },
    '14"', '   ', { value: '' }],
  totalHeights: ['24"', '26"'],
  gaps: ['12"', '14"'],
  legHeights: [{ value: '4"', priceSen: 500 }, 'No Leg', '6"'],
  sofaSizes: ['30', '35', '40'],
  sofaLegHeights: ['Default', { value: '6"', priceSen: 800 }],
  mattressSizes: ['K', 'Q'],
  compartments: ['1A(LHF)'],
}
// scm.special_addons rows, verbatim — option_groups is the ERP's own shape
// (backend/src/scm/routes/special-addons.ts: choices carry extraSen).
const SPECIALS = {
  nylon: { id: 'sa-nylon', code: 'Nylon Fabric', label: 'Nylon Fabric', so_description: 'NYLON', categories: ['SOFA'],
    selling_price_sen: 5000, cost_price_sen: 3000, option_groups: [], active: true, sort_order: 1 },
  drawer: { id: 'sa-drawer', code: 'Right Drawer', label: 'Right Drawer', so_description: '', categories: ['BEDFRAME', 'SOFA'],
    selling_price_sen: 15000, cost_price_sen: 9000,
    option_groups: [{ label: 'Thickness', required: true, choices: [{ label: '10"', extraSen: 2000 }, { label: '8"', extraSen: 0 }] }],
    active: true, sort_order: 2 },
  panel: { id: 'sa-panel', code: 'No Side Panel', label: 'No Side Panel', categories: ['SOFA'],
    selling_price_sen: -4000, cost_price_sen: -4000, option_groups: [], active: true, sort_order: 3 },
  old: { id: 'sa-old', code: 'Old Special', label: 'Old Special', categories: ['sofa'], active: true, sort_order: 4 },
  usb: { id: 'sa-usb', code: 'USB Port', label: 'USB Port', categories: ['ACCESSORY'], active: true, sort_order: 5 },
}
const FABRICS = {
  bo315: { id: 'fab-bo315', fabric_code: 'BO315-01', fabric_description: 'PEARL', fabric_category: 'B', series: 'BO315',
    price_tier: 'PRICE_2', sofa_price_tier: 'price_1', bedframe_price_tier: 'PRICE_3', price_sen: 4500, soh_sen: 120000,
    po_outstanding_sen: 500, last_month_usage_sen: 1, one_week_usage_sen: 1, two_weeks_usage_sen: 1,
    one_month_usage_sen: 1, shortage_sen: 0, reorder_point_sen: 10, supplier: 'S1', is_active: true },
  nb04: { id: 'fab-nb04', fabric_code: 'NB-04', price_tier: 'PRICE_2', bedframe_price_tier: 'PRICE_1', sofa_price_tier: null, is_active: true },
  pc151: { id: 'fab-pc151', fabric_code: 'PC151-01', price_tier: 'PRICE_3', is_active: true },
  old: { id: 'fab-old', fabric_code: 'OLD-01', price_tier: 'PRICE_1', is_active: false },
}
const SLOTS_1A_2A = [['1A(RHF)', '1A(LHF)'], ['2A(LHF)', '2A(RHF)']]
const COMBOS = {
  c1: { id: 'combo-1a2a', base_model: '8030', modules: SLOTS_1A_2A, tier: null, label: '1A + 2A', heights: ['30', ' ', '35'],
    prices_by_height: { 30: 250000, 35: 260000 }, selling_prices_by_height: { 30: 399900 }, pwp_prices_by_height: {},
    effective_from: '2026-01-01', created_at: '2026-01-01T00:00:00Z', customer_id: null, supplier_id: null },
  cust: { id: 'combo-cust', base_model: '8030', modules: SLOTS_1A_2A, tier: null, customer_id: 'cust-1',
    prices_by_height: { 30: 200000 }, effective_from: '2026-01-01' },
  sup: { id: 'combo-sup', base_model: '8030', modules: SLOTS_1A_2A, tier: null, supplier_id: 'sup-1',
    prices_by_height: { 30: 150000 }, effective_from: '2026-01-01' },
  c4: { id: 'combo-1al', base_model: '8030', modules: [['1A(LHF)'], ['L(LHF)']], tier: 'price_2', label: '1A + L',
    heights: ['30'], effective_from: '2026-01-01' },
  old: { id: 'combo-old', base_model: '8030', modules: [['CONSOLE'], ['L(LHF)']], tier: null, label: 'old',
    heights: ['30'], effective_from: '2026-01-01' },
}

const deliver = batch => one('SELECT ingest_erp_catalogue($1::jsonb)', [J({ companyId: 1, full: false, ...batch })])
const removedCount = () => one(`SELECT (SELECT count(*) FROM erp_products WHERE removed_at IS NOT NULL)
  + (SELECT count(*) FROM erp_product_models WHERE removed_at IS NOT NULL)
  + (SELECT count(*) FROM erp_maintenance_options WHERE removed_at IS NOT NULL)
  + (SELECT count(*) FROM erp_fabrics WHERE removed_at IS NOT NULL)
  + (SELECT count(*) FROM erp_sofa_combos WHERE removed_at IS NOT NULL)`)
const catalogueRow = async erpId => (await q(
  `SELECT price::text AS price, price_grid, offered, adopted_from, note FROM catalogue_skus WHERE erp_product_id = $1`,
  [erpId]))[0] ?? null

try {
  // ══ The synthetic surroundings ════════════════════════════════════════════
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN COALESCE(current_setting('test.scopes', true), '') = '' THEN TRUE
                  ELSE p_scopes && string_to_array(current_setting('test.scopes', true), ',') END $$;

    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE comm_sub_departments(
      id uuid PRIMARY KEY, name text NOT NULL, code text, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY, sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL, effective_to date);
    CREATE TABLE comm_brands(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id uuid NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
      code text NOT NULL, name text NOT NULL, item_code_prefixes text[] NOT NULL DEFAULT '{}', note text,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_comm_brand_code UNIQUE (scheme_id, code));
    CREATE TABLE comm_item_groups(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL REFERENCES comm_schemes(id),
      item_group text NOT NULL, commissionable boolean NOT NULL DEFAULT false);

    CREATE TYPE sales_import_status AS ENUM ('draft','committed','superseded');
    CREATE TABLE sales_import_batches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      period_month date NOT NULL, file_name text NOT NULL DEFAULT 'erp',
      status sales_import_status NOT NULL DEFAULT 'committed');
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES sales_import_batches(id) ON DELETE CASCADE,
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL,
      cancelled boolean NOT NULL DEFAULT false, erp_company_id bigint, raw jsonb,
      CONSTRAINT uq_sales_order_per_batch UNIQUE (batch_id, order_no));
    -- 20260831010000's shape; cost_source and its CHECK arrive with 20260919010000.
    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      line_no integer NOT NULL, item_group text NOT NULL, product_code text NOT NULL, product_name text,
      description2 text, uom text, location text,
      qty numeric(15,3) NOT NULL DEFAULT 0, unit_price numeric(15,2) NOT NULL DEFAULT 0,
      line_amount numeric(15,2) NOT NULL DEFAULT 0, brand_code text, cost_amount numeric(15,2), raw jsonb,
      CONSTRAINT uq_sales_order_line UNIQUE (order_id, line_no));

    -- The old hand-keyed Product List (20260831010000 + cost_grid of
    -- 20260915060000); erp_item_code arrives with 20260918010000.
    CREATE TABLE comm_products(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_code text NOT NULL, product_name text,
      brand_code text, item_group text, unit_cost numeric(15,2), is_active boolean NOT NULL DEFAULT true,
      note text, updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), cost_grid jsonb,
      CONSTRAINT unit_cost_non_negative CHECK (unit_cost IS NULL OR unit_cost >= 0),
      CONSTRAINT comm_products_cost_grid_check CHECK (cost_grid IS NULL OR jsonb_typeof(cost_grid) = 'array'));
    CREATE UNIQUE INDEX uq_comm_products_item_code ON comm_products ((UPPER(BTRIM(item_code))));
    CREATE TABLE member_product_options(
      product_id uuid PRIMARY KEY REFERENCES comm_products(id) ON DELETE CASCADE,
      category text NOT NULL, size text NOT NULL DEFAULT '', color text NOT NULL DEFAULT '',
      gift boolean NOT NULL DEFAULT false, available boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id));

    -- A month's run has paid when a check says so.
    CREATE TABLE test_paid_months(sub_department_id uuid NOT NULL, period_month date NOT NULL);
    CREATE FUNCTION commission_order_period_locked(p_sub_department_id uuid, p_period date)
      RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM test_paid_months
                      WHERE sub_department_id = p_sub_department_id AND period_month = p_period) $$;

    INSERT INTO comm_sub_departments(id, name, code) VALUES ('${FAIR}', 'Fair', 'FAIR');
    INSERT INTO comm_schemes(id, sub_department_id, effective_from) VALUES ('${SCHEME}', '${FAIR}', '2026-01-01');
    INSERT INTO comm_brands(scheme_id, code, name) VALUES
      ('${SCHEME}', 'AKEMI', 'AKEMI'), ('${SCHEME}', 'DUNLOP', 'DUNLOPILLO'),
      ('${SCHEME}', 'ERGOTEX', 'ERGOTEX'), ('${SCHEME}', 'ZANOTTI', 'ZANOTTI');
    INSERT INTO comm_item_groups(scheme_id, item_group, commissionable) VALUES
      ('${SCHEME}', 'MATTRESS', true), ('${SCHEME}', 'BEDFRAME', true), ('${SCHEME}', 'SOFA', true),
      ('${SCHEME}', 'ACCESSORY', true), ('${SCHEME}', 'SERVICE', false);
  `)
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_brand_code')

  // The live shape before the catalogue: the ERP-code bridge, the v1 SKU-master
  // mirror (erp_products / erp_sofa_combos with ERP money, erp_combo_slots_key,
  // the cost_source CHECK) and the one-cost-lookup fill trigger.
  await migrate('20260918010000_product_erp_code_and_recost')
  await migrate('20260919010000_erp_sku_master_mirror')
  await migrate('20260919020000_one_cost_lookup')

  // The old hand-keyed list the catalogue adopts from on first sight.
  const legacy = async (code, { erp = null, brand = null, cost = null, grid = null, active = true, option = null } = {}) => {
    const productId = await one(
      `INSERT INTO comm_products(item_code, erp_item_code, brand_code, unit_cost, cost_grid, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
      [code, erp, brand, cost, grid === null ? null : J(grid), active])
    if (option) {
      await q(`INSERT INTO member_product_options(product_id, category, available, gift) VALUES ($1, $2, $3, $4)`,
        [productId, option.category, option.available ?? true, option.gift ?? false])
    }
    return productId
  }
  const LEG = {
    ult: await legacy('AK-ULTIMATE MATT (K)', { erp: 'AKEMI ULTIMATE MATT (K)', brand: 'AKEMI', cost: 1800, option: { category: 'Mattress' } }),
    aero: await legacy('aero-mp  (k)', { cost: 45, option: { category: 'Protector', gift: true } }),
    m1a: await legacy('8030-1A(LHF)', { brand: 'ZANOTTI', option: { category: 'Sofa' }, grid: [
      { height: '35', tier: 'PRICE_2', cost: 1700 }, { height: '30', tier: 'PRICE_2', cost: 1650 },
      { height: '30', tier: 'PRICE_1', cost: 'n/a' }, { height: '', tier: 'PRICE_2', cost: 99 }, { height: '30', tier: '', cost: 5 }] }),
    m2a: await legacy('8030-2A(RHF)', { brand: 'ZANOTTI', option: { category: 'Sofa' }, grid: [
      { height: '30', tier: 'PRICE_2', cost: 1200 }, { height: '35', tier: 'PRICE_2', cost: 1250 }] }),
    xBridge: await legacy('X-LEGACY-A', { erp: 'X-CODE', cost: 10, option: { category: 'Accessory', gift: true } }),
    xOwn: await legacy('X-CODE', { cost: 20, option: { category: 'Accessory', gift: true } }),
    noopt: await legacy('NO-OPTIONS-SKU', { cost: 77 }),
    inactLeg: await legacy('INACTIVE-LEGACY', { cost: 66, active: false, option: { category: 'Accessory' } }),
    apex: await legacy('AK-APEX MATT (K)', { brand: 'AKEMI', cost: 1500, option: { category: 'Mattress' } }),
    aqua: await legacy('DL-AQUA RELAXER 300(K)', { brand: 'DUNLOP', cost: 2100, option: { category: 'Mattress', available: false } }),
    amira: await legacy('DL-AMIRA DELUXE (Q)', { brand: 'DUNLOP', cost: 1900, option: { category: 'Mattress' } }),
    cloud1: await legacy('EG-CLOUDREST MATT (Q)', { brand: 'ERGOTEX', cost: 1300, option: { category: 'Mattress' } }),
    cloud2: await legacy('EG-CLOUDREST (Q)', { brand: 'ERGOTEX', cost: 1350, option: { category: 'Mattress' } }),
    hok: await legacy('HOK-1005 (K)', { cost: 900, option: { category: 'Bed frame' } }),
    ak1005: await legacy('AK-1005 MATT (K)', { brand: 'AKEMI', cost: 950, option: { category: 'Mattress' } }),
    dream: await legacy('AK-DREAM MATT (Q)', { brand: 'AKEMI', cost: 1100, option: { category: 'Mattress' } }),
    sleep: await legacy('EG-SLEEPWELL MATT (K)', { brand: 'ERGOTEX', cost: 1600, option: { category: 'Mattress' } }),
  }

  // ══ 20260924020000 — the mirror, items only ═══════════════════════════════
  const mirror020 = await migrationSql('20260924020000_erp_catalogue_mirror')

  // It reshapes two tables it assumes are empty, and says so before it starts.
  await db.exec('BEGIN')
  await q(`INSERT INTO erp_products(item_code, erp_id) VALUES ('GUARD', 'mfg-guard')`)
  await reject(() => db.exec(mirror020), /hold rows/, 'the reshape refuses to run over a mirror that already holds rows')
  await db.exec('ROLLBACK')

  await db.exec(mirror020)

  const first = await deliver({
    snapshotAt: '2026-09-24T01:00:00Z',
    products: [...Object.values(P), { id: '', code: 'NO-ID' }, { id: 'mfg-no-code', code: '  ' }],
    models: [...Object.values(MODELS), { id: 'not-a-uuid', model_code: 'BAD' }, { id: M.blank, model_code: ' ' }],
    maintenance: { effective_from: '2026-09-01', pools: POOLS },
    specials: Object.values(SPECIALS),
    fabrics: Object.values(FABRICS),
    combos: Object.values(COMBOS),
  })
  check(first, {
    status: 'applied', companyId: 1, full: false,
    products: 28, productsNew: 28, productsRemoved: 0,
    models: 7, modelsNew: 7, modelsRemoved: 0,
    maintenanceOptions: 16, maintenanceNew: 16, maintenanceRemoved: 0,
    specials: 5, specialsNew: 5, specialsRemoved: 0,
    fabrics: 4, fabricsNew: 4, fabricsRemoved: 0,
    combos: 3, combosNew: 3, combosRemoved: 0,
    adopted: { skus: 8, models: 2 },
  }, 'a first delivery upserts every section, skips unreadable rows, customer and supplier combos, and adopts on first sight')

  check(await one('SELECT count(*) FROM erp_products'), 28, 'a SKU with no id or no code is not mirrored')
  check(await q(`SELECT erp_id, category, base_model, module_code, size_display, brand_code, active
                   FROM erp_products WHERE erp_id IN ('mfg-8030-1a', 'mfg-8030-l', 'mfg-aero', 'mfg-ult', 'mfg-inactive')
                  ORDER BY erp_id`), [
    { erp_id: 'mfg-8030-1a', category: 'SOFA', base_model: '8030', module_code: '1A(LHF)', size_display: null, brand_code: 'ZANOTTI', active: true },
    { erp_id: 'mfg-8030-l', category: 'SOFA', base_model: '8030', module_code: 'L(LHF)', size_display: null, brand_code: 'ZANOTTI', active: true },
    { erp_id: 'mfg-aero', category: 'ACCESSORY', base_model: 'AERO', module_code: null, size_display: null, brand_code: null, active: true },
    { erp_id: 'mfg-inactive', category: 'ACCESSORY', base_model: 'INACTIVE', module_code: null, size_display: null, brand_code: null, active: false },
    { erp_id: 'mfg-ult', category: 'MATTRESS', base_model: 'AKEMI ULTIMATE MATT (K)', module_code: null, size_display: 'King', brand_code: 'AKEMI', active: true },
  ], 'a SKU keeps the ERP base model, splits a sofa module at the first dash, and only a sofa has a module')
  check(await one(`SELECT model_erp_id::text FROM erp_products WHERE erp_id = 'mfg-ult'`), M.ult, 'a SKU names its model')

  // ── money never enters ─────────────────────────────────────────────────────
  const raws = await q(`
    SELECT 'erp_products' AS t, erp_id AS k, raw FROM erp_products
    UNION ALL SELECT 'erp_product_models', erp_id::text, raw FROM erp_product_models
    UNION ALL SELECT 'erp_maintenance_options', pool || ':' || value, raw FROM erp_maintenance_options
    UNION ALL SELECT 'erp_fabrics', erp_id, raw FROM erp_fabrics
    UNION ALL SELECT 'erp_sofa_combos', erp_id, raw FROM erp_sofa_combos`)
  check(raws.flatMap(r => pathsOf(r.raw, k => MONEY_KEYS.has(k)).map(p => `${r.t}(${r.k})${p}`)), [],
    'no money key the ERP sends reaches any raw column, at any depth')
  check(sorted(Object.keys(await one(`SELECT raw FROM erp_products WHERE erp_id = 'mfg-ult'`))),
    sorted(Object.keys(P.ult).filter(k => !MONEY_KEYS.has(k))), 'a SKU keeps every item fact it was sent')
  check(await q(`SELECT DISTINCT jsonb_object_keys(raw) AS k FROM erp_maintenance_options
                  WHERE pool NOT LIKE '%specials' ORDER BY 1`), [{ k: 'active' }, { k: 'value' }],
    'a Maintenance pool entry keeps its value and its flag, never its priceSen')
  // 020000's strip dropped a fixed list of TOP-LEVEL keys, so a special's
  // option-group surcharges (the ERP's own special_addons shape) got into raw.
  // 030000 §0b closes that and scrubs them — checked there; this is the gap.
  check(pathsOf(await one(`SELECT raw FROM erp_maintenance_options WHERE pool = 'bedframe_specials' AND value = 'Right Drawer'`),
    k => /sen$/i.test(k)), ['$.option_groups[0].choices[0].extraSen', '$.option_groups[0].choices[1].extraSen'],
    "020000 alone lets a special's nested option-group surcharges into raw — the gap 20260924030000 §0b closes")
  check(await one(`SELECT count(*) FROM erp_products
                    WHERE cost_price IS NOT NULL OR base_price IS NOT NULL OR price_1 IS NOT NULL
                       OR sell_price IS NOT NULL OR seat_height_costs IS NOT NULL`), 0,
    'the retired money columns stay NULL, unwritten')
  check(await one(`SELECT count(*) FROM erp_sofa_combos WHERE cost_by_height <> '{}' OR selling_by_height <> '{}'`), 0,
    "a combo's retired cost and selling grids stay empty")

  // ── each section's shape ───────────────────────────────────────────────────
  check(await q(`SELECT pool, value, sort_order, active FROM erp_maintenance_options
                  WHERE pool = 'bedframe_divan_heights' ORDER BY sort_order`), [
    { pool: 'bedframe_divan_heights', value: '8"', sort_order: 1, active: true },
    { pool: 'bedframe_divan_heights', value: '10"', sort_order: 2, active: true },
    { pool: 'bedframe_divan_heights', value: '12"', sort_order: 3, active: false },
    { pool: 'bedframe_divan_heights', value: '14"', sort_order: 4, active: true },
  ], 'a pool keeps its order and its inactive entries, and drops blanks')
  check((await q(`SELECT DISTINCT pool FROM erp_maintenance_options ORDER BY pool`)).map(r => r.pool), [
    'bedframe_divan_heights', 'bedframe_gaps', 'bedframe_leg_heights', 'bedframe_specials', 'bedframe_total_heights',
    'sofa_leg_heights', 'sofa_sizes', 'sofa_specials',
  ], "only the Bedframe and Sofa pools are mirrored, never Products Maintenance's")
  check(await q(`SELECT pool, value, erp_id, sort_order FROM erp_maintenance_options
                  WHERE pool LIKE '%specials' ORDER BY pool, sort_order`), [
    { pool: 'bedframe_specials', value: 'Right Drawer', erp_id: 'sa-drawer', sort_order: 2 },
    { pool: 'sofa_specials', value: 'Nylon Fabric', erp_id: 'sa-nylon', sort_order: 1 },
    { pool: 'sofa_specials', value: 'Right Drawer', erp_id: 'sa-drawer', sort_order: 2 },
    { pool: 'sofa_specials', value: 'No Side Panel', erp_id: 'sa-panel', sort_order: 3 },
    { pool: 'sofa_specials', value: 'Old Special', erp_id: 'sa-old', sort_order: 4 },
  ], 'a special lands once per category it applies to; an accessory-only special is not mirrored')
  check(await q(`SELECT erp_id, sofa_tier, bedframe_tier, price_tier, active FROM erp_fabrics ORDER BY erp_id`), [
    { erp_id: 'fab-bo315', sofa_tier: 'PRICE_1', bedframe_tier: 'PRICE_3', price_tier: 'PRICE_2', active: true },
    { erp_id: 'fab-nb04', sofa_tier: null, bedframe_tier: 'PRICE_1', price_tier: 'PRICE_2', active: true },
    { erp_id: 'fab-old', sofa_tier: null, bedframe_tier: null, price_tier: 'PRICE_1', active: false },
    { erp_id: 'fab-pc151', sofa_tier: null, bedframe_tier: null, price_tier: 'PRICE_3', active: true },
  ], "a fabric carries its PRICE_1/2/3 tiers and its flag, and nothing it costs")
  check(await q(`SELECT erp_id, base_model, tier, heights, modules FROM erp_sofa_combos ORDER BY erp_id`), [
    { erp_id: 'combo-1a2a', base_model: '8030', tier: null, heights: ['30', '35'], modules: SLOTS_1A_2A },
    { erp_id: 'combo-1al', base_model: '8030', tier: 'PRICE_2', heights: ['30'], modules: [['1A(LHF)'], ['L(LHF)']] },
    { erp_id: 'combo-old', base_model: '8030', tier: null, heights: ['30'], modules: [['CONSOLE'], ['L(LHF)']] },
  ], "a customer's or a supplier's combo is skipped; a combo's heights are the keys of its grid, never its values")
  check(await one(`SELECT slots_key FROM erp_sofa_combos WHERE erp_id = 'combo-1a2a'`),
    await one(`SELECT erp_combo_slots_key($1::jsonb)`, [J([['2A(RHF)', '2A(LHF)'], ['1A(LHF)', '1A(RHF)']])]),
    "a combo's key does not depend on how its slots were spelled")
  check(await q(`SELECT category, allowed_options FROM erp_product_models WHERE erp_id = $1`, [M.sofa]),
    [{ category: 'SOFA', allowed_options: MODELS.sofa.allowed_options }], "a model's allowed options are mirrored verbatim")

  // ── adoption: first sight inherits the old list ───────────────────────────
  check(await catalogueRow('mfg-ult'), { price: '1800.00', price_grid: null, offered: true, adopted_from: LEG.ult,
    note: 'Carried over from the old Product List' }, 'a SKU adopts the old row its ERP bridge code names')
  check(await catalogueRow('mfg-aero'), { price: '45.00', price_grid: null, offered: true, adopted_from: LEG.aero,
    note: 'Carried over from the old Product List' }, 'a SKU adopts the old row of its own code, case and spaces folded')
  check(await catalogueRow('mfg-8030-1a'), { price: null, offered: true, adopted_from: LEG.m1a,
    note: 'Carried over from the old Product List',
    price_grid: [{ height: '30', tier: 'PRICE_2', price: 1650 }, { height: '35', tier: 'PRICE_2', price: 1700 }] },
  "a sofa module adopts its seat-height grid as the portal's price, dropping cells with no height, tier or figure")
  check((await catalogueRow('mfg-xcode')).adopted_from, LEG.xBridge, 'an ERP bridge code beats a row of the same own code')
  check((await catalogueRow('mfg-dream-old')).adopted_from, LEG.dream, 'an old spelling the ERP kept is adopted by its own code')
  check([(await catalogueRow('mfg-noopt')).offered, (await catalogueRow('mfg-inactive-legacy')).offered], [false, false],
    'an old row nobody made available, or that was inactive, is adopted unticked')
  check(await catalogueRow('mfg-fresh'), null, 'a SKU the old list never had arrives with no price and unticked')
  check(await q(`SELECT erp_product_id FROM catalogue_skus
                  WHERE erp_product_id IN ('mfg-apex', 'mfg-aqua', 'mfg-amira-1', 'mfg-amira-2', 'mfg-cloud', 'mfg-1005-k')`), [],
    'before 20260924025000 a mattress spelled differently is not adopted')
  check(await q(`SELECT erp_model_id::text, offered, enabled, gift, calc_category FROM catalogue_models ORDER BY erp_model_id`), [
    { erp_model_id: M.ult, offered: true, enabled: {}, gift: false, calc_category: 'Mattress' },
    { erp_model_id: M.sofa, offered: true, enabled: { sizes: ['30', '35'] }, gift: false, calc_category: 'Sofa' },
  ], 'a model the old list sold from is offered; a sofa is ticked for exactly the heights its adopted grids price')

  // ── a second delivery: in place, and never over a portal decision ─────────
  const firstSeen = await q(`SELECT vp_id, first_seen_at::text FROM erp_products WHERE erp_id = 'mfg-ult'`)
  await q(`UPDATE catalogue_skus SET price = 1999, offered = false, note = 'typed by the Principal' WHERE erp_product_id = 'mfg-ult'`)
  await q(`UPDATE comm_products SET unit_cost = 1234 WHERE id = $1`, [LEG.ult])
  P.fresh2 = sku('mfg-fresh-2', 'FRESH-TWO', 'ACCESSORY')
  const second = await deliver({ products: [P.ult, { ...P.xcode, code: 'X-CODE-2' }, P.fresh2], models: [MODELS.ult] })
  check([second.products, second.productsNew, second.models, second.modelsNew, second.adopted],
    [3, 1, 1, 0, { skus: 0, models: 0 }], 'a re-delivery counts only the SKU it has never seen as new')
  check(await one('SELECT count(*) FROM erp_products'), 29, 'a re-delivery updates in place, no duplicates')
  check(await q(`SELECT vp_id, first_seen_at::text FROM erp_products WHERE erp_id = 'mfg-ult'`), firstSeen,
    "a re-delivery keeps a SKU's portal id and when it was first seen")
  check(await catalogueRow('mfg-ult'), { price: '1999.00', price_grid: null, offered: false, adopted_from: LEG.ult,
    note: 'typed by the Principal' }, 'a re-delivery never overwrites a price or a tick typed in the portal')
  check([await one(`SELECT item_code FROM erp_products WHERE erp_id = 'mfg-xcode'`), (await catalogueRow('mfg-xcode')).price],
    ['X-CODE-2', '10.00'], 'a code renamed in the ERP keeps its portal price (keyed on the ERP id)')
  await deliver({ products: [P.xcode] })
  await q(`UPDATE catalogue_skus SET offered = true WHERE erp_product_id = 'mfg-ult'`)

  // ── full: true retires what a carried section omits, and only that ────────
  const everyProduct = () => Object.values(P).filter(p => p.id !== 'mfg-retire')
  const fullPools = {
    divanHeights: ['8"', { value: '10"', priceSen: 3000 }, { value: '12"', active: false }],
    totalHeights: ['24"', '26"'],
    gaps: [],
    legHeights: [{ value: '4"', priceSen: 500 }, 'No Leg', '6"'],
    sofaSizes: ['30', '35', '40'],
  }
  const full = await deliver({
    full: true,
    products: everyProduct(),
    models: Object.values(MODELS).filter(m => m.id !== M.gone).map(m => (m.id === M.hidden ? { ...m, id: m.id.toUpperCase() } : m)),
    maintenance: { pools: fullPools },
    specials: Object.values(SPECIALS).filter(s => s.id !== 'sa-old'),
    fabrics: Object.values(FABRICS).filter(f => f.id !== 'fab-old'),
    combos: [COMBOS.c1, COMBOS.c4, COMBOS.cust],
  })
  check([full.productsRemoved, full.modelsRemoved, full.maintenanceRemoved, full.specialsRemoved, full.fabricsRemoved, full.combosRemoved],
    [1, 1, 1, 1, 1, 1], 'a full delivery retires, per carried section, exactly what it omitted')
  check(await q(`
    SELECT 'sku' AS kind, erp_id AS k FROM erp_products WHERE removed_at IS NOT NULL
    UNION ALL SELECT 'model', erp_id::text FROM erp_product_models WHERE removed_at IS NOT NULL
    UNION ALL SELECT 'option', pool || ':' || value FROM erp_maintenance_options WHERE removed_at IS NOT NULL
    UNION ALL SELECT 'fabric', erp_id FROM erp_fabrics WHERE removed_at IS NOT NULL
    UNION ALL SELECT 'combo', erp_id FROM erp_sofa_combos WHERE removed_at IS NOT NULL
    ORDER BY 1, 2`), [
    { kind: 'combo', k: 'combo-old' }, { kind: 'fabric', k: 'fab-old' }, { kind: 'model', k: M.gone },
    { kind: 'option', k: 'bedframe_divan_heights:14"' }, { kind: 'option', k: 'sofa_specials:Old Special' },
    { kind: 'sku', k: 'mfg-retire' },
  ], 'retired rows are kept with removed_at — never deleted — an empty pool and an omitted pool retire nothing, and a model sent with an upper-case id is not mistaken for a missing one')

  const beforeEmpty = await removedCount()
  const empty = await deliver({ full: true, products: [], models: [], specials: [], fabrics: [], combos: [],
    maintenance: { pools: { divanHeights: [], gaps: [] } } })
  check([empty.productsRemoved, empty.modelsRemoved, empty.maintenanceRemoved, empty.specialsRemoved, empty.fabricsRemoved,
    empty.combosRemoved, await removedCount()], [0, 0, 0, 0, 0, 0, beforeEmpty],
  'an EMPTY section retires nothing, even on a full delivery')
  const partial = await deliver({ products: [P.ult], models: [MODELS.ult], specials: [SPECIALS.nylon],
    fabrics: [FABRICS.bo315], combos: [COMBOS.c1], maintenance: { pools: { divanHeights: ['8"'] } } })
  check([partial.productsRemoved, partial.modelsRemoved, partial.maintenanceRemoved, partial.specialsRemoved,
    partial.fabricsRemoved, partial.combosRemoved, await removedCount()], [0, 0, 0, 0, 0, 0, beforeEmpty],
  'a delivery that is not full retires nothing')
  await deliver({ fabrics: [FABRICS.old] })
  check(await one(`SELECT removed_at FROM erp_fabrics WHERE erp_id = 'fab-old'`), null, 'a retired row that comes back is live again')

  // ══ 20260924025000 — a mattress by brand, model and size ══════════════════
  await migrate('20260924025000_catalogue_adopt_mattress_rule')

  check(await q(`SELECT catalogue_legacy_mattress_key('AKEMI', 'AK-APEX MATT (K)') AS a,
                        catalogue_legacy_mattress_key('DUNLOP', 'DL-AQUA RELAXER 300(K)') AS b,
                        catalogue_erp_mattress_key('DUNLOP', 'DUNLOPILLO', 'DUNLOPILLO AQUA RELAXER 300 MATT (K)') AS c,
                        catalogue_erp_mattress_key('AKEMI', 'AKEMI', 'AK-DREAM MATT (Q)') AS d,
                        catalogue_legacy_mattress_key(NULL, 'HOK-1005 (K)') AS e`),
  [{ a: 'AKEMI|APEX|K', b: 'DUNLOP|AQUA RELAXER 300|K', c: 'DUNLOP|AQUA RELAXER 300|K', d: null, e: null }],
  'the two keys agree on a mattress; an ERP code must begin with its own branding; no brand, no key')
  check(await catalogueRow('mfg-apex'), { price: '1500.00', price_grid: null, offered: true, adopted_from: LEG.apex,
    note: 'Carried over from the old Product List (brand · model · size)' },
  'AK-APEX MATT (K) → AKEMI APEX MATT (K): adopted by the migration itself, for SKUs already mirrored')
  check(await catalogueRow('mfg-aqua'), { price: '2100.00', price_grid: null, offered: false, adopted_from: LEG.aqua,
    note: 'Carried over from the old Product List (brand · model · size)' },
  'DL-AQUA RELAXER 300(K) → DUNLOPILLO AQUA RELAXER 300 MATT (K): DUNLOPILLO lands on DUNLOP by the brand name')
  check([await catalogueRow('mfg-amira-1'), await catalogueRow('mfg-amira-2')], [null, null],
    'two ERP SKUs on one key adopt nothing')
  check(await catalogueRow('mfg-cloud'), null, 'two old rows on one key adopt nothing')
  check(await catalogueRow('mfg-1005-k'), null, 'a bed frame (HOK-1005 (K) → 1005-(K)) is not adopted by this rule')
  check(await catalogueRow('mfg-ak1005'), null, 'the rule is for mattresses: a bed frame spelled like one is not adopted')
  check(await q(`SELECT offered, calc_category FROM catalogue_models WHERE erp_model_id = $1`, [M.apex]),
    [{ offered: true, calc_category: 'Mattress' }], 'the adopted mattress offers its model')

  P.dream = sku('mfg-dream', 'AKEMI DREAM MATT (Q)', 'MATTRESS', { size_code: 'Q', branding: 'AKEMI' })
  P.sleep = sku('mfg-sleep', 'ERGOTEX SLEEPWELL MATT (K)', 'MATTRESS', { size_code: 'K', branding: 'ERGOTEX' })
  const later = await deliver({ products: [P.dream, P.sleep] })
  check([later.adopted, (await catalogueRow('mfg-sleep'))?.adopted_from, await catalogueRow('mfg-dream')],
    [{ skus: 1, models: 0 }, LEG.sleep, null],
    'the rule runs on every delivery, and never hands an old row a SKU already adopted to a second one')

  // A model the sender splits into a later delivery than its SKUs.
  M.late = id(108)
  LEG.late = await legacy('ZN2-1A', { brand: 'ZANOTTI', grid: [{ height: '30', tier: 'PRICE_2', cost: 800 }], option: { category: 'Sofa' } })
  P.late = sku('mfg-zn2-1a', 'ZN2-1A', 'SOFA', { model_id: M.late, branding: 'ZANOTTI' })
  MODELS.late = model(M.late, 'ZN2', 'LATE', 'SOFA', 'ZANOTTI', { sizes: ['30'] })
  const skusFirst = await deliver({ products: [P.late] })
  const modelAfter = await deliver({ models: [MODELS.late] })
  check([skusFirst.adopted, modelAfter.adopted,
    await q(`SELECT offered, enabled FROM catalogue_models WHERE erp_model_id = $1`, [M.late])],
  [{ skus: 1, models: 0 }, { skus: 0, models: 1 }, [{ offered: true, enabled: { sizes: ['30'] } }]],
  'a model that arrives after its SKUs is adopted by the delivery that brings it')

  // Lines that landed under the old cost chain, to cross 030000.
  const SEP_BATCH = await one(`INSERT INTO sales_import_batches(sub_department_id, period_month, status)
                               VALUES ($1, $2, 'committed') RETURNING id`, [FAIR, SEP])
  const order = (no, date = '2026-09-10', cancelled = false) => one(
    `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, cancelled, erp_company_id)
     VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`, [SEP_BATCH, SEP, no, date, cancelled])
  const line = async (orderId, no, group, code, d2 = null, qty = 1, { raw = null, cost = null, source = null, amount = 0 } = {}, runner = db) =>
    (await runner.query(
      `INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, description2, qty, line_amount, raw, cost_amount, cost_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING id`,
      [orderId, no, group, code, d2, qty, amount, raw === null ? null : J(raw), cost, source])).rows[0].id
  const oOld = await order('SO-OLD')
  const old1 = await line(oOld, 1, 'accessory', 'X-CODE', null, 1, { raw: { cost: 12 }, cost: 12 })
  const old2 = await line(oOld, 2, 'mattress', 'AK-APEX MATT (K)')
  const oldState = async () => q(`SELECT cost_amount::text AS cost, cost_source FROM sales_order_lines
                                   WHERE id = ANY($1::uuid[]) ORDER BY line_no`, [[old1, old2]])
  check(await oldState(), [{ cost: '12.00', cost_source: 'erp_line' }, { cost: '1500.00', cost_source: 'product_list' }],
    'before 20260924030000 the old chain stamps the ERP cost and the old list')

  // ══ 20260924030000 — the portal's prices cost every line ══════════════════
  await migrate('20260924030000_catalogue_costs_the_margin')

  const columnsOf = async t => (await q(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [t]))
    .map(r => r.column_name)
  check((await columnsOf('erp_products')).filter(c => ['cost_price', 'base_price', 'price_1', 'sell_price', 'seat_height_costs',
    'uom', 'unit_m3', 'erp_snapshot_at'].includes(c)), [], "erp_products' money columns are gone")
  check((await columnsOf('erp_sofa_combos')).filter(c => ['cost_by_height', 'selling_by_height', 'customer_id', 'supplier_id',
    'erp_snapshot_at'].includes(c)), [], "erp_sofa_combos' money and customer / supplier columns are gone")
  check(await one(`SELECT count(*) FROM pg_proc WHERE proname IN ('erp_resolve_unit_cost', 'ingest_erp_products')`), 0,
    'the ERP-cost resolver and the v1 ingest are gone')
  check(await oldState(), [{ cost: '12.00', cost_source: 'erp_line' }, { cost: '1500.00', cost_source: 'product_list' }],
    'a line already landed keeps its cost and its truthful old provenance until somebody recosts')
  await reject(() => q(`UPDATE sales_order_lines SET cost_source = 'bogus' WHERE id = $1`, [old1]),
    /sales_order_lines_cost_source_valid/, 'cost_source still refuses a provenance nobody defined')
  check(await q(`SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger
                  WHERE tgrelid = 'sales_order_lines'::regclass AND NOT tgisinternal ORDER BY tgname`), [
    { tgname: 'sales_order_lines_apply_combos', tgdeferrable: true, tginitdeferred: true },
    { tgname: 'sales_order_lines_fill_cost', tgdeferrable: false, tginitdeferred: false },
  ], 'the fill trigger stays BEFORE INSERT; the combo trigger is deferred to commit')

  COMBOS.c6 = { id: 'combo-1a2a-p2', base_model: '8030', modules: SLOTS_1A_2A, tier: 'PRICE_2', label: '1A + 2A (P2)',
    heights: ['30'], prices_by_height: { 30: 240000 }, effective_from: '2026-02-01', created_at: '2026-02-01T00:00:00Z' }
  const after030 = await deliver({ products: [P.ult], combos: [COMBOS.c6] })
  check([after030.status, after030.combosNew, await one(`SELECT tier FROM erp_sofa_combos WHERE erp_id = 'combo-1a2a-p2'`)],
    ['applied', 1, 'PRICE_2'], 'the ingest redefined without the dropped columns still applies')

  // ── §0b: the strip reaches every depth ────────────────────────────────────
  check(await one(`SELECT count(*) FROM erp_maintenance_options WHERE raw::text ~ 'extraSen'`), 0,
    "030000 scrubs what 020000's top-level strip let into raw: the option-group surcharges are gone")
  const deep = await deliver({
    specials: [{ id: 'sa-deep', code: 'Deep Special', label: 'Deep Special', categories: ['BEDFRAME'], active: true, sort_order: 9,
      option_groups: [{ label: 'Width', choices: [{ label: 'Wide', extraSen: 900, priceRM: 9 }] }] }],
    models: [model(M.deep, 'DEEP', 'DEEP', 'BEDFRAME', 'BEDFRAME', { specials: [{ value: 'Deep Special', priceSen: 100 }] })],
    fabrics: [FABRICS.bo315],
  })
  check(deep.status, 'applied', 'a delivery with money nested anywhere still applies')
  check(await one(`SELECT raw->'option_groups' FROM erp_maintenance_options WHERE value = 'Deep Special'`),
    [{ label: 'Width', choices: [{ label: 'Wide' }] }],
    "a special's option-group surcharges never reach raw through 030000's ingest; the item facts around them stay")
  check(await one(`SELECT allowed_options FROM erp_product_models WHERE erp_id = $1`, [M.deep]),
    { specials: [{ value: 'Deep Special' }] }, 'a money key inside allowed_options never reaches the column')
  check(await q(`SELECT sofa_tier, bedframe_tier, price_tier, raw ? 'sofa_price_tier' AS raw_tier,
                        raw ? 'price_sen' OR raw ? 'soh_sen' AS raw_money
                   FROM erp_fabrics WHERE erp_id = 'fab-bo315'`),
    [{ sofa_tier: 'PRICE_1', bedframe_tier: 'PRICE_3', price_tier: 'PRICE_2', raw_tier: true, raw_money: false }],
    "a fabric's price TIER is a label, not money: it survives the deeper strip, in the columns and in raw, while its price and stock go")
  check((await q(`SELECT catalogue_is_money_key(k) AS money FROM unnest(ARRAY['extraSen', 'priceRM', 'selling_price_sen',
                   'seat_height_prices', 'default_surcharge', 'sofa_price_tier', 'priceTier', 'label', 'chosen']) k`))
    .map(x => x.money), [true, true, true, true, true, false, false, false, false],
    "catalogue_is_money_key: the ERP's pattern, a price tier excepted, keys never values")

  // The Product List, as the Principal typed it.
  await db.exec(`
    UPDATE catalogue_skus SET price_grid = '[{"height":"30","tier":"PRICE_1","price":1500},{"height":"30","tier":"PRICE_2","price":1650},
      {"height":"30","tier":"PRICE_3","price":1800},{"height":"35","tier":"PRICE_2","price":1700}]'
     WHERE erp_product_id = 'mfg-8030-1a';
    INSERT INTO catalogue_skus(erp_product_id, price_grid) VALUES ('mfg-8030-l', '[{"height":"30","tier":"PRICE_2","price":900}]');
    INSERT INTO catalogue_skus(erp_product_id, price) VALUES ('mfg-8030-con', 300);
    INSERT INTO catalogue_skus(erp_product_id, offered, price) VALUES ('mfg-1005-k', true, 800);
    INSERT INTO catalogue_skus(erp_product_id, price_grid) VALUES ('mfg-zn-stool', '[{"height":"30","tier":"PRICE_2","price":400}]');
    INSERT INTO catalogue_skus(erp_product_id, price, price_grid) VALUES ('mfg-zn-arm', 480,
      '[{"height":"30","tier":"PRICE_1","price":500},{"height":"30","tier":"PRICE_3","price":530},{"height":"35","tier":"PRICE_2","price":520}]');
    INSERT INTO catalogue_skus(erp_product_id, price_grid) VALUES ('mfg-zn-chaise',
      '[{"height":"30","tier":"PRICE_2","price":700},{"height":"35","tier":"PRICE_2","price":720}]');
    INSERT INTO catalogue_skus(erp_product_id, offered, price) VALUES ('mfg-retire', true, 55);
    INSERT INTO catalogue_option_prices(pool, value, price) VALUES
      ('bedframe_divan_heights', '10"', 30), ('bedframe_leg_heights', '4"', 15), ('bedframe_total_heights', '24"', 20),
      ('sofa_leg_heights', '6"', 25), ('sofa_specials', 'Nylon Fabric', 40), ('sofa_specials', 'No Side Panel', -40),
      ('bedframe_specials', 'Right Drawer', 60);
  `)

  // ── what a line says it is ────────────────────────────────────────────────
  const facts = async (d2, raw = null) => (await q(
    `SELECT fabric, seat, leg, divan, gap, total, specials, parsed_from FROM catalogue_line_facts($1, $2::jsonb)`,
    [d2, raw === null ? null : J(raw)]))[0]
  const blank = { fabric: null, seat: null, leg: null, divan: null, gap: null, total: null, specials: [], parsed_from: null }
  check(await facts('BO315-01 PEARL / SEAT 35 / LEG DEFAULT / SPECIAL: Nylon Fabric'),
    { ...blank, fabric: 'BO315-01', seat: '35', leg: 'DEFAULT', specials: ['Nylon Fabric'], parsed_from: 'description2' },
    "a sofa module's summary: fabric, seat, leg, specials")
  check(await facts('NB-04 / DIVAN 8" + LEG 4" / GAP 12" / T.Heights 24"'),
    { ...blank, fabric: 'NB-04', leg: '4"', divan: '8"', gap: '12"', total: '24"', parsed_from: 'description2' },
    "a bed frame's summary: divan + leg, gap, total height")
  check(await facts('PC151-01 / DIVAN 10" + NO LEG / GAP 14" / T.Heights 24"'),
    { ...blank, fabric: 'PC151-01', leg: 'No Leg', divan: '10"', gap: '14"', total: '24"', parsed_from: 'description2' },
    'NO LEG reads as the pool value No Leg')
  check(await facts('Divan:10”+NoLeg/Gap:12”/Col:TBC'), blank, 'hand-typed AutoCount-era text parses to nothing')
  check(await facts(null), blank, 'no description, no facts')
  check(await facts('BO315-01 PEARL / SEAT 35 / LEG DEFAULT',
    { variants: { fabricCode: 'ZZ-99', seatHeight: '30', legHeight: 'Default', specials: ['Nylon Fabric', ' '] } }),
  { ...blank, fabric: 'ZZ-99', seat: '30', leg: 'Default', specials: ['Nylon Fabric'], parsed_from: 'variants' },
  'raw.variants win over description2')
  check(await facts(null, { variants: { fabricCode: ' ', fabricColor: 'BO315-01', seatHeight: '', depth: '30',
    legHeight: ' ', sofaLegHeight: '6"', specials: 'Nylon Fabric' } }),
  { ...blank, fabric: 'BO315-01', seat: '30', leg: '6"', specials: ['Nylon Fabric'], parsed_from: 'variants' },
  'a blank variant key falls through to its alternative, as a missing one does')
  check(await q(`SELECT catalogue_value_key(E'\\t No  Leg\\n') AS v, catalogue_value_key('DIVAN 10”') AS d,
                        catalogue_code_key(E'\\taero-mp  (k)\\n') AS c, catalogue_height_key('75 CM') AS h`),
  [{ v: 'no leg', d: 'divan 10"', c: 'AERO-MP (K)', h: '75cm' }], 'the comparison keys fold case, curly quotes and any whitespace')

  // ── a SKU's portal price ──────────────────────────────────────────────────
  const unit = async (code, height = null, tier = null) => (await q(
    `SELECT unit_price, erp_product_id, how FROM catalogue_unit_price(1, $1, $2, $3)`, [code, height, tier]))
    .map(r => [num(r.unit_price), r.how, r.erp_product_id])
  check(await unit('8030-1A(LHF)', '30', 'PRICE_1'), [[1500, 'grid', 'mfg-8030-1a']], 'a grid cell at (height, tier)')
  check(await unit('8030-1A(LHF)', '30', null), [[1650, 'grid', 'mfg-8030-1a']], 'no tier reads PRICE_2')
  check(await unit('8030-1A(LHF)', '35', 'PRICE_3'), [[1700, 'grid', 'mfg-8030-1a']], 'a tier the grid lacks falls back to PRICE_2')
  check(await unit('8030-1A(LHF)', '35"', 'PRICE_2'), [[1700, 'grid', 'mfg-8030-1a']], 'an inch mark does not change the height')
  check(await unit('ZN-ARM', '30', 'PRICE_2'), [[500, 'grid', 'mfg-zn-arm']], 'no PRICE_2 at that height reads the lowest tier')
  check(await unit('ZN-ARM', '40', 'PRICE_2'), [[480, 'price', 'mfg-zn-arm']], 'a height the grid lacks falls back to the flat price')
  check(await unit('ZN-STOOL', null, 'PRICE_2'), [[400, 'grid', 'mfg-zn-stool']], 'a one-height grid answers without a height')
  check(await one(`SELECT catalogue_grid_price($1::jsonb, '30', 'PRICE_3')`,
    [J([{ height: '30', price: 999 }, { height: '30', tier: 'PRICE_2', price: 1650 }])]), '1650',
  'a cell with no tier never outranks one that has it')
  check(await unit('ZN-CHAISE', null, 'PRICE_2'), [[null, 'no_height', 'mfg-zn-chaise']], 'a grid with no height to read it at is no_height')
  check(await unit('UNPRICED-ITEM'), [[null, 'unpriced', 'mfg-unpriced']], 'in the SKU master, no portal price: unpriced')
  check(await unit('GHOST-CODE'), [], 'not in the SKU master: no row')
  check(await unit('akemi ultimate matt (k)'), [[1999, 'price', 'mfg-ult']], 'a code is found whatever its case')
  check(await unit('OLD-STOOL'), [[55, 'price', 'mfg-retire']], 'a retired SKU still prices what it sold')
  check(await q(`SELECT comm_product_unit_cost('AKEMI ULTIMATE MATT (K)')::text AS unit_cost,
                        comm_product_cost_source('AKEMI ULTIMATE MATT (K)') AS source,
                        comm_product_unit_cost('GHOST-CODE') AS ghost`),
  [{ unit_cost: '1999.00', source: 'catalogue', ghost: null }], "the old lookup's names answer with the portal's price")

  // ── the fill trigger: every line at the portal's prices ───────────────────
  const L = async lineId => {
    const r = (await q(`SELECT cost_amount, list_cost_amount, cost_source, cost_detail FROM sales_order_lines WHERE id = $1`, [lineId]))[0]
    return { cost: num(r.cost_amount), list: num(r.list_cost_amount), source: r.cost_source, detail: r.cost_detail }
  }
  const oA = await order('SO-A')
  const lineA = await line(oA, 1, 'mattress', 'AKEMI ULTIMATE MATT (K)', null, 2, { raw: { cost: 999, line_cost_sen: 99900 }, cost: 999, amount: 5998 })
  check(await L(lineA), { cost: 3998, list: 3998, source: 'catalogue', detail: { how: 'price', erp_product_id: 'mfg-ult', unit: 1999 } },
    "a line is costed at the portal's price × qty, never at the ERP's own cost on the line")

  const oBF = await order('SO-BF')
  const lineB = await line(oBF, 1, 'bedframe', '1005-(K)', 'NB-04 / DIVAN 10" + LEG 4" / GAP 12" / T.Heights 24"')
  check(await L(lineB), { cost: 865, list: 865, source: 'catalogue', detail: {
    how: 'price', erp_product_id: 'mfg-1005-k', unit: 800, tier: 'PRICE_1', fabric: 'NB-04', surcharge: 65,
    parsed_from: 'description2', options: [
      { pool: 'bedframe_divan_heights', value: '10"', price: 30 },
      { pool: 'bedframe_leg_heights', value: '4"', price: 15 },
      { pool: 'bedframe_total_heights', value: '24"', price: 20 }] } },
  "a bed frame is its price + the portal's divan, leg and total-height surcharges (a gap adds nothing)")
  const lineC = await line(oBF, 2, 'bedframe', '1005-(K)', 'PC151-01 / DIVAN 10" + NO LEG / GAP 14" / T.Heights 24"', 2)
  check(await L(lineC), { cost: 1700, list: 1700, source: 'catalogue', detail: {
    how: 'price', erp_product_id: 'mfg-1005-k', unit: 800, tier: 'PRICE_3', fabric: 'PC151-01', surcharge: 50,
    parsed_from: 'description2', options: [
      { pool: 'bedframe_divan_heights', value: '10"', price: 30 },
      { pool: 'bedframe_leg_heights', value: 'No Leg' },
      { pool: 'bedframe_total_heights', value: '24"', price: 20 }] } },
  'an option with no portal price adds nothing and is named with no price; (unit + surcharges) × qty')
  const lineI = await line(oBF, 3, 'bedframe', '1005-(K)', 'NB-04 / DIVAN 8" + LEG 4" / GAP 12" / T.Heights 24" / SPECIAL: Right Drawer (10")')
  check((await L(lineI)).cost, 895, 'a special printed with its choice is priced as the special')

  const oD = await order('SO-D')
  const lineD = await line(oD, 1, 'sofa', '8030-CONSOLE', 'BO315-01 PEARL / SEAT 30 / LEG 6" / SPECIAL: Nylon Fabric + No Side Panel')
  check(await L(lineD), { cost: 325, list: 325, source: 'catalogue', detail: {
    how: 'price', erp_product_id: 'mfg-8030-con', unit: 300, height: '30', tier: 'PRICE_1', fabric: 'BO315-01', surcharge: 25,
    parsed_from: 'description2', options: [
      { pool: 'sofa_leg_heights', value: '6"', price: 25 },
      { pool: 'sofa_specials', value: 'Nylon Fabric', price: 40 },
      { pool: 'sofa_specials', value: 'No Side Panel', price: -40 }] } },
  "a sofa module is its price + its leg height and specials; a negative surcharge takes money off")

  const oVar = await order('SO-VAR')
  const lineV = await line(oVar, 1, 'sofa', '8030-1A(LHF)', 'BO315-01 PEARL / SEAT 35', 1,
    { raw: { variants: { fabricCode: 'ZZ-99', seatHeight: '30', legHeight: 'Default' } } })
  check([(await L(lineV)).cost, (await L(lineV)).detail.parsed_from, (await L(lineV)).detail.tier], [1650, 'variants', 'PRICE_2'],
    "the trigger reads the line's variants over its summary; an unknown fabric costs at PRICE_2")
  const oTier = await order('SO-TIER')
  const lineT = await line(oTier, 1, 'sofa', '8030-1A(LHF)', 'BO315-01 PEARL / SEAT 30')
  check([(await L(lineT)).cost, (await L(lineT)).detail.tier], [1500, 'PRICE_1'], "the fabric's sofa tier picks the grid cell")

  const oM = await order('SO-MANUAL')
  const lineE = await line(oM, 1, 'mattress', 'AKEMI ULTIMATE MATT (K)', null, 1, { cost: 123, source: 'manual', amount: 3000 })
  check(await L(lineE), { cost: 123, list: null, source: 'manual', detail: null }, 'a manual line is left alone')

  const oGap = await order('SO-GAP')
  const lineF = await line(oGap, 1, 'accessory', 'GHOST-CODE', null, 1, { amount: 100 })
  const lineG = await line(oGap, 2, 'accessory', 'UNPRICED-ITEM', null, 1, { amount: 50 })
  const lineH = await line(oGap, 3, 'sofa', 'ZN-CHAISE', 'ZZ-99 / LEG DEFAULT', 1, { amount: 30 })
  const lineS = await line(oGap, 4, 'sofa', 'GHOST-SOFA', 'BO315-01 PEARL / SEAT 30')
  check([await L(lineF), await L(lineG), await L(lineH), await L(lineS)], [
    { cost: null, list: null, source: null, detail: { reason: 'not_in_sku_master' } },
    { cost: null, list: null, source: null, detail: { reason: 'unpriced', erp_product_id: 'mfg-unpriced' } },
    { cost: null, list: null, source: null, detail: { reason: 'no_height', erp_product_id: 'mfg-zn-chaise', tier: 'PRICE_2',
      fabric: 'ZZ-99', parsed_from: 'description2' } },
    { cost: null, list: null, source: null, detail: { reason: 'not_in_sku_master', height: '30', fabric: 'BO315-01',
      parsed_from: 'description2' } },
  ], 'a line nothing can price lands with no cost, and says why and what it was read as')
  const oCancel = await order('SO-CANCELLED', '2026-09-11', true)
  await line(oCancel, 1, 'accessory', 'GHOST-CANCELLED', null, 1, { amount: 999 })
  const oHand = await order('SO-HAND')
  const lineHand = await line(oHand, 1, 'bedframe', '1005-(K)', 'Divan:10”+NoLeg/Gap:12”/Col:TBC')
  check(await L(lineHand), { cost: 800, list: 800, source: 'catalogue',
    detail: { how: 'price', erp_product_id: 'mfg-1005-k', unit: 800, tier: 'PRICE_2' } },
  'a hand-typed line is costed on its SKU alone')
  const oRet = await order('SO-RETIRED')
  const lineRet = await line(oRet, 1, 'accessory', 'OLD-STOOL')
  check((await L(lineRet)).cost, 55, 'a retired SKU still costs a line')

  // ── combos, at commit ─────────────────────────────────────────────────────
  check(await q(`SELECT catalogue_match_slots(ARRAY['1A(LHF)','2A(RHF)','L(LHF)'], $1::jsonb) AS a,
                        catalogue_match_slots(ARRAY['2A(RHF)','1A(LHF)'], $1::jsonb) AS b,
                        catalogue_match_slots(ARRAY['1A(LHF)'], '[["1A(LHF)"],["1A(LHF)"]]') AS c,
                        catalogue_match_slots(ARRAY['1A(LHF)','1A(LHF)'], '[["1A(LHF)"],["1A(LHF)"]]') AS d,
                        catalogue_match_slots(ARRAY['X','Y'], '[["X","Y"],["X"]]') AS e,
                        catalogue_match_slots(ARRAY['1A(LHF)','2A(RHF)'], '["1A(LHF)","2A(RHF)"]') AS f,
                        catalogue_match_slots(ARRAY['1A(LHF)','L(LHF)'], $1::jsonb) AS g,
                        catalogue_match_slots(ARRAY['A','B','C'], '[["A","B"],["A","C"]]') AS h,
                        catalogue_match_slots(ARRAY['1A(LHF)'], '[["1A(LHF)"],[],[" "]]') AS i`, [J(SLOTS_1A_2A)]),
  [{ a: [1, 2], b: [1, 2], c: null, d: [1, 2], e: [1, 2], f: [1, 2], g: null, h: [1, 2], i: [1] }],
  "slot matching: subset coverage, any order, one module per slot, the flat legacy form; where OR-sets overlap the ERP's "
  + 'augmenting path decides which module stays an extra (A, B consumed, C left); an empty slot is dropped')

  const priceCombo = (erpId, byHeight) => q(
    `INSERT INTO catalogue_combo_prices(base_model, slots_key, tier, price_by_height)
     SELECT base_model, slots_key, COALESCE(tier, ''), $2::jsonb FROM erp_sofa_combos WHERE erp_id = $1
     ON CONFLICT (erp_company_id, base_model, slots_key, tier) DO UPDATE SET price_by_height = EXCLUDED.price_by_height`,
    [erpId, J(byHeight)])
  const unpriceCombo = erpId => q(
    `DELETE FROM catalogue_combo_prices cp USING erp_sofa_combos sc
      WHERE sc.erp_id = $1 AND cp.base_model = sc.base_model AND cp.slots_key = sc.slots_key AND cp.tier = COALESCE(sc.tier, '')`,
    [erpId])
  await priceCombo('combo-1a2a', { 30: 2500 })

  const build = async (no, modules) => {
    const orderId = await order(no)
    const ids = []
    let beforeCommit = null
    await db.transaction(async tx => {
      for (const [i, [code, seat, qty]] of modules.entries()) {
        ids.push(await line(orderId, i + 1, 'sofa', code, `ZZ-99 / SEAT ${seat} / LEG DEFAULT`, qty, {}, tx))
      }
      beforeCommit = (await tx.query(`SELECT cost_source FROM sales_order_lines WHERE order_id = $1 ORDER BY line_no`, [orderId]))
        .rows.map(r => r.cost_source)
    })
    return { orderId, ids, beforeCommit }
  }
  const costs = async ids => Promise.all(ids.map(async i => { const l = await L(i); return [l.cost, l.source] }))

  const o1 = await build('SO-COMBO-1', [['8030-1A(LHF)', 30, 1], ['8030-2A(RHF)', 30, 1], ['8030-L(LHF)', 30, 1]])
  check(o1.beforeCommit, ['catalogue', 'catalogue', 'catalogue'], 'inside the transaction every module is at its own price')
  check(await costs(o1.ids), [[1447.37, 'catalogue_combo'], [1052.63, 'catalogue_combo'], [900, 'catalogue']],
    "at commit the matched modules carry the combo's price, spread by their own costs, and the extra keeps its own")
  check(await q(`SELECT list_cost_amount::text AS list, cost_detail->'combo' AS combo FROM sales_order_lines
                  WHERE id = ANY($1::uuid[]) ORDER BY line_no`, [o1.ids]), [
    { list: '1650.00', combo: { erp_id: 'combo-1a2a', label: '1A + 2A', price: 2500, sets: 1, height: '30', tier: 'PRICE_2', lines: 2 } },
    { list: '1200.00', combo: { erp_id: 'combo-1a2a', label: '1A + 2A', price: 2500, sets: 1, height: '30', tier: 'PRICE_2', lines: 2 } },
    { list: '900.00', combo: null },
  ], "each matched line keeps its own price and says which combo spread onto it")

  const o2 = await build('SO-COMBO-2', [['8030-1A(LHF)', 30, 2], ['8030-2A(RHF)', 30, 2]])
  check(await costs(o2.ids), [[2894.74, 'catalogue_combo'], [2105.26, 'catalogue_combo']],
    'two sets cost the combo twice: the costs sum to price × sets')
  const o3 = await build('SO-COMBO-3', [['8030-1A(LHF)', 30, 1], ['8030-2A(RHF)', 30, 2]])
  check(await costs(o3.ids), [[1650, 'catalogue'], [2400, 'catalogue']], 'mixed quantities keep their own costs')
  const o4 = await build('SO-COMBO-4', [['8030-1A(LHF)', 30, 1], ['8030-L(LHF)', 30, 1]])
  check(await costs(o4.ids), [[1650, 'catalogue'], [900, 'catalogue']], 'a combo the portal has not priced does nothing')
  const o5 = await build('SO-COMBO-5', [['8030-1A(LHF)', 35, 1], ['8030-2A(RHF)', 35, 1]])
  check(await costs(o5.ids), [[1700, 'catalogue'], [1250, 'catalogue']], 'a combo not priced at that seat height does nothing')
  const o6 = await build('SO-COMBO-6', [['8030-1A(LHF)', 30, 1], ['8030-2A(RHF)', 35, 1]])
  check(await costs(o6.ids), [[1650, 'catalogue'], [1250, 'catalogue']], 'two seat heights in one build take no combo')

  const applyO1 = async () => { await q('SELECT catalogue_apply_combos($1)', [o1.orderId]); return costs(o1.ids) }
  check(await applyO1(), [[1447.37, 'catalogue_combo'], [1052.63, 'catalogue_combo'], [900, 'catalogue']],
    're-applying the combos changes nothing')
  check(await applyO1(), [[1447.37, 'catalogue_combo'], [1052.63, 'catalogue_combo'], [900, 'catalogue']],
    '…however many times')
  await priceCombo('combo-1a2a', { 30: 3000 })
  const dearer = await applyO1()
  check([dearer[0][0] + dearer[1][0], dearer[0][1]], [3000, 'catalogue_combo'], 'the combo wins even when it is dearer than its modules')
  await priceCombo('combo-1a2a-p2', { 30: 2400 })
  const tiered = await applyO1()
  check([tiered[0][0] + tiered[1][0], await one(`SELECT cost_detail->'combo'->>'erp_id' FROM sales_order_lines WHERE id = $1`, [o1.ids[0]])],
    [2400, 'combo-1a2a-p2'], 'a combo for the build\'s tier beats an any-tier one')
  await unpriceCombo('combo-1a2a-p2')
  await unpriceCombo('combo-1a2a')
  check([await applyO1(), await one(`SELECT cost_detail ? 'combo' FROM sales_order_lines WHERE id = $1`, [o1.ids[0]])],
    [[[1650, 'catalogue'], [1200, 'catalogue'], [900, 'catalogue']], false],
    'a combo that is no longer priced lets go of its lines')
  await priceCombo('combo-1a2a', { 30: 0, '30"': 2500 })
  check(await applyO1(), [[1447.37, 'catalogue_combo'], [1052.63, 'catalogue_combo'], [900, 'catalogue']],
    'a zero under one spelling of the height never hides a usable price under another')
  await priceCombo('combo-1a2a', { 30: 2500 })
  await applyO1()
  await q('SELECT catalogue_apply_combos($1)', [o2.orderId])

  // ── recost: the Product List reaches a month already landed ───────────────
  await q(`UPDATE catalogue_skus SET price = 2100 WHERE erp_product_id = 'mfg-ult'`)
  check((await L(lineA)).cost, 3998, 'changing a price moves nothing by itself')
  const recost = async (period = SEP) => {
    const r = (await q(`SELECT * FROM recost_sales_order_lines($1, $2)`, [FAIR, period]))[0]
    return [r.lines_costed, r.lines_still_blind, r.orders_with_cost]
  }
  const firstRecost = await recost()
  check(firstRecost.slice(1), [6, 14], 'a recost reports the lines still blind and the bills fully costed')
  check(firstRecost[0], 3, 'a recost counts the lines whose cost MOVED: the repriced mattress, the line the ERP had costed, the one only the old list named')
  check([(await L(lineA)).cost, (await L(lineA)).list], [4200, 4200], 'a recost re-prices a line at the new price')
  check(await L(old1), { cost: 10, list: 10, source: 'catalogue', detail: { how: 'price', erp_product_id: 'mfg-xcode', unit: 10 } },
    "a line the ERP costed is re-priced at the portal's price")
  check(await L(old2), { cost: null, list: null, source: null, detail: { reason: 'not_in_sku_master' } },
    'a line only the old list could name loses its cost on recost, and says why')
  check(await L(lineE), { cost: 123, list: null, source: 'manual', detail: null }, 'a recost leaves a manual line alone')
  check(await costs(o1.ids), [[1447.37, 'catalogue_combo'], [1052.63, 'catalogue_combo'], [900, 'catalogue']],
    'a recost re-applies the combos')
  check(await recost(), [0, 6, 14],
    'a second recost with no price changed re-prices nothing — 20260924030000 recost_sales_order_lines "Returns lines changed"; '
    + 'its UPDATE resets every combo line to its own cost before catalogue_apply_combos puts the same share back, so each is counted every time')
  await q(`INSERT INTO test_paid_months VALUES ($1, $2)`, [FAIR, SEP])
  await q(`UPDATE catalogue_skus SET price = 2200 WHERE erp_product_id = 'mfg-ult'`)
  await reject(() => recost(), e => e.code === '23RUN', 'a month whose run has paid refuses the recost (23RUN)')
  check((await L(lineA)).cost, 4200, 'and nothing moved')
  await q('DELETE FROM test_paid_months')
  await q(`UPDATE catalogue_skus SET price = 2100 WHERE erp_product_id = 'mfg-ult'`)
  check(await recost('2026-10-01'), [0, 0, 0], 'a month with no committed batch has nothing to recost')

  // ── the work lists ────────────────────────────────────────────────────────
  check(await q(`SELECT item_code, lines::int, revenue::text, in_sku_master, has_price, reason, erp_product_id
                   FROM revenue_costing_gaps('2026-09-01', '2026-10-01') ORDER BY item_code`), [
    { item_code: 'AK-APEX MATT (K)', lines: 1, revenue: '0.00', in_sku_master: false, has_price: false, reason: 'not_in_sku_master', erp_product_id: null },
    { item_code: 'GHOST-CODE', lines: 1, revenue: '100.00', in_sku_master: false, has_price: false, reason: 'not_in_sku_master', erp_product_id: null },
    { item_code: 'GHOST-SOFA', lines: 1, revenue: '0.00', in_sku_master: false, has_price: false, reason: 'not_in_sku_master', erp_product_id: null },
    { item_code: 'UNPRICED-ITEM', lines: 1, revenue: '50.00', in_sku_master: true, has_price: false, reason: 'unpriced', erp_product_id: 'mfg-unpriced' },
    { item_code: 'ZN-CHAISE', lines: 1, revenue: '30.00', in_sku_master: true, has_price: true, reason: 'no_height', erp_product_id: 'mfg-zn-chaise' },
  ], 'Costing gaps names every blind code and why — a cancelled bill is not a gap')
  check(await q(`SELECT product_code, commissionable, in_sku_master, has_price, reason FROM revenue_uncosted_products($1, $2)
                  WHERE product_code IN ('GHOST-CODE', 'UNPRICED-ITEM', 'ZN-CHAISE') ORDER BY product_code`, [FAIR, SEP]), [
    { product_code: 'GHOST-CODE', commissionable: true, in_sku_master: false, has_price: false, reason: 'not_in_sku_master' },
    { product_code: 'UNPRICED-ITEM', commissionable: true, in_sku_master: true, has_price: false, reason: 'unpriced' },
    { product_code: 'ZN-CHAISE', commissionable: true, in_sku_master: true, has_price: true, reason: 'no_height' },
  ], "a month's blind products say the same")

  // ══ 20260924040000 — what a member may quote ══════════════════════════════
  await migrate('20260924040000_member_catalogue')
  check(await q(`SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('member_data_snapshot', 'member_principal_snapshot')
                  ORDER BY proname`), [
    { proname: 'member_data_snapshot', prosecdef: true }, { proname: 'member_principal_snapshot', prosecdef: true },
  ], 'both snapshots are redefined')

  // The Modular ticks.
  await q(`INSERT INTO catalogue_models(erp_model_id, offered, enabled) VALUES ($1, true, $2::jsonb)`, [M.bed, J({
    divan_heights: ['8"', '10”', '12"', '14"'], leg_heights: ['4"', 'No Leg', '6"'], total_heights: ['24"'], gaps: [],
    specials: ['Right Drawer', 'Nylon Fabric'] })])
  await q(`UPDATE catalogue_models SET enabled = $2::jsonb WHERE erp_model_id = $1`, [M.sofa, J({
    sizes: ['30', '40'], leg_heights: ['Default', '6"', '9"'], specials: ['Nylon Fabric', 'No Side Panel', 'Right Drawer', 'Old Special'] })])
  await q(`INSERT INTO catalogue_models(erp_model_id, offered) VALUES ($1, true), ($2, false)`, [M.gone, M.hidden])
  await q(`UPDATE catalogue_models SET offered = true WHERE erp_model_id = $1`, [M.aqua])
  await db.exec(`
    INSERT INTO catalogue_skus(erp_product_id, offered, price) VALUES
      ('mfg-pil-a', true, 25), ('mfg-pil-b', true, 30), ('mfg-inactive', true, 5),
      ('mfg-rmodel', true, 1000), ('mfg-hidden', true, 1000);
    UPDATE catalogue_skus SET offered = true WHERE erp_product_id = 'mfg-aqua';
  `)
  const vp = async erpId => one(`SELECT vp_id FROM erp_products WHERE erp_id = $1`, [erpId])
  const catalogue = (brands, ids = null, priced = false, suggest = 0) =>
    one(`SELECT member_catalogue($1::text[], $2::uuid[], $3, $4)`, [brands, ids, priced, suggest])
  const codes = answer => sorted(answer.products.map(p => p.code))
  const product = (answer, code) => answer.products.find(p => p.code === code)

  const akemi = await catalogue(['AKEMI'])
  check(codes(akemi), ['1005-(K)', 'AERO-MP (K)', 'AK-DREAM MATT (Q)', 'AKEMI APEX MATT (K)', 'AKEMI ULTIMATE MATT (K)',
    'PILLOW-A', 'PILLOW-B', 'X-CODE'],
  'AKEMI + riders: only ticked, active, live SKUs whose model is offered and live')
  check([sorted(Object.keys(akemi)), akemi.products.flatMap(p => Object.keys(p).filter(k => k === 'price' || k === 'grid'))],
    [['models', 'products'], []], 'the unpriced answer carries no price and no grid')
  check(JSON.stringify(akemi).includes('"price"'), false, 'no price anywhere in it')
  check(Object.fromEntries(['AKEMI ULTIMATE MATT (K)', 'AERO-MP (K)', '1005-(K)', 'PILLOW-A', 'X-CODE'].map(c => {
    const p = product(akemi, c)
    return [c, [p.name, p.size, p.category, p.brand, p.gift]]
  })), {
    'AKEMI ULTIMATE MATT (K)': ['AKEMI ULTIMATE', 'King', 'Mattress', 'AKEMI', false],
    'AERO-MP (K)': ['AERO-MP', 'King', 'Protector', null, true],
    '1005-(K)': ['1005', 'King', 'Bed frame', null, false],
    'PILLOW-A': ['PILLOW-A', '', 'Pillow', null, true],
    'X-CODE': ['X-CODE', '', 'Accessory', null, true],
  }, 'a mattress by its model name + size word, an accessory by its code without the size; a bed frame and an accessory are riders')
  const versionOf = erpId => one(`SELECT CONCAT(to_jsonb(s.updated_at) #>> '{}', ':', COALESCE(to_jsonb(cm.updated_at) #>> '{}', ''))
                                    FROM catalogue_skus s JOIN erp_products e ON e.erp_id = s.erp_product_id
                                    LEFT JOIN catalogue_models cm ON cm.erp_model_id = e.model_erp_id
                                   WHERE s.erp_product_id = $1`, [erpId])
  check([product(akemi, 'AKEMI ULTIMATE MATT (K)').version, product(akemi, 'X-CODE').version],
    [await versionOf('mfg-ult'), await versionOf('mfg-xcode')], "a SKU's version is its own and its model's last edit")
  check(akemi.models, [{ id: M.bed, kind: 'BEDFRAME', options: {
    leg_heights: ['4"', 'No Leg'], specials: ['Right Drawer'], divan_heights: ['8"', '10"'], total_heights: ['24"'], gaps: [] } }],
  "a bed frame's dropdowns are its ticks ∩ what the ERP allows ∩ the live pool: not an inactive or removed value, not one the ERP does not allow, nothing unticked")

  const sofa = await catalogue(['AKEMI', 'ZANOTTI'])
  check(codes(sofa).filter(c => c.startsWith('8030')), ['8030-1A(LHF)', '8030-2A(RHF)'], 'a sofa brand adds its ticked modules')
  const m1a = product(sofa, '8030-1A(LHF)')
  check([m1a.name, m1a.size, m1a.category, m1a.brand, m1a.kind, m1a.baseModel, m1a.moduleCode],
    ['8030 SOFFIO', '1A(LHF)', 'Sofa', 'ZANOTTI', 'SOFA', '8030', '1A(LHF)'], 'a sofa module is "<model code> <name>" + its module')
  check(sorted(m1a.options.map(o => `${o.height}/${o.tier}`)), ['30/PRICE_1', '30/PRICE_2', '30/PRICE_3'],
    "a sofa module's choices are its grid's heights among the model's ticked sizes — a ticked height nobody priced is not one")
  check(product(sofa, '8030-2A(RHF)').options, [{ height: '30', tier: 'PRICE_2' }], '…for every module of the model')
  check(sofa.models.find(m => m.id === M.sofa), { id: M.sofa, kind: 'SOFA', options: {
    leg_heights: ['Default', '6"'], specials: ['Nylon Fabric', 'No Side Panel'] } },
  "a sofa's dropdowns are its leg heights and specials, never a bed frame's")
  const dunlop = await catalogue(['DUNLOP'])
  check([codes(dunlop).filter(c => c.includes('MATT')), product(dunlop, 'DUNLOPILLO AQUA RELAXER 300 MATT (K)').brand],
    [['DUNLOPILLO AQUA RELAXER 300 MATT (K)'], 'DUNLOP'], 'a brand sells only its own mattresses, found through the scheme\'s brand names')

  const priced = await catalogue(['AKEMI', 'ZANOTTI'], null, true)
  check(sorted(Object.keys(priced)), ['combos', 'models', 'optionPrices', 'products'], 'the priced answer adds option prices and combos')
  check([product(priced, 'AKEMI ULTIMATE MATT (K)').price, product(priced, 'AKEMI ULTIMATE MATT (K)').grid,
    product(priced, '8030-1A(LHF)').grid.length], [2100, null, 4], 'and every SKU its price or grid')
  check(priced.optionPrices.find(o => o.value === 'No Side Panel'), { pool: 'sofa_specials', value: 'No Side Panel', price: -40 },
    'every portal surcharge travels, a deduction too')
  check(priced.combos.map(c => [c.erpId, c.priceByHeight]), [['combo-1a2a', { 30: 2500 }]],
    'only a combo the portal priced, live, of a model in the answer')
  const { optionPrices, combos, ...pricedCore } = priced
  check(JSON.parse(JSON.stringify(pricedCore), (k, v) => (k === 'price' || k === 'grid' ? undefined : v)), sofa,
    'pricing adds the money and nothing else')

  const ult = await vp('mfg-ult')
  check(codes(await catalogue(['AKEMI'], [ult])), ['AKEMI ULTIMATE MATT (K)'], 'p_ids narrows the answer to the quote')
  check(codes(await catalogue(['AKEMI'], [ult], false, 1)), ['AKEMI ULTIMATE MATT (K)', 'PILLOW-A'], 'p_suggest adds a gift pillow')
  check(codes(await catalogue(['AKEMI'], [ult], false, 5)), ['AKEMI ULTIMATE MATT (K)', 'PILLOW-A', 'PILLOW-B'],
    '…only pillows that are gifts, however many are asked for')
  check(codes(await catalogue(['AKEMI'], [await vp('mfg-aqua')])), [], "a SKU of a brand the member does not sell cannot be quoted by id")
  check([await catalogue([]), await catalogue(null), await catalogue([], null, true)],
    [{ products: [], models: [] }, { products: [], models: [] }, { products: [], models: [] }],
    'no brand, no catalogue — not even riders')

  // ── who may call what ─────────────────────────────────────────────────────
  const denied = e => e.code === '42501'
  await reject(() => as('authenticated', () => catalogue(['AKEMI'])), denied, 'a session cannot call member_catalogue')
  await reject(() => as('authenticated', () => catalogue(['AKEMI'], null, true)), denied, '…least of all priced')
  await reject(() => as('anon', () => catalogue(['AKEMI'])), denied, 'nor can anon')
  await reject(() => as('authenticated', () => deliver({ products: [P.ult] })), denied, 'a session cannot call ingest_erp_catalogue')
  await reject(() => as('authenticated', () => q('SELECT catalogue_adopt_legacy(1)')), denied, 'a session cannot run the adoption')
  await reject(() => as('authenticated', () => q(`SELECT catalogue_model_options(1, 'sofa_specials', '[]', '[]')`)), denied,
    'a session cannot call catalogue_model_options')
  check(await as('service_role', () => catalogue(['AKEMI', 'ZANOTTI'], null, true)), priced, 'the service role reads the priced catalogue')
  check((await as('service_role', () => deliver({ products: [P.ult] }))).status, 'applied', 'the service role delivers')

  // ── row security: nobody writes the mirror through a session ───────────────
  check(await as('authenticated', () => q(`SELECT (SELECT count(*) FROM erp_products) AS mirror,
                                                  (SELECT count(*) FROM catalogue_skus) AS prices`), 'none'),
    [{ mirror: 0, prices: 0 }], 'without the admin or hr scope a session reads nothing')
  check(await as('authenticated', async () => [
    await one('SELECT count(*) > 0 FROM erp_products'),
    await one('SELECT count(*) > 0 FROM catalogue_skus'),
    (await db.query(`UPDATE catalogue_skus SET price = 1 WHERE erp_product_id = 'mfg-ult'`)).affectedRows,
  ], 'hr'), [true, true, 0], 'hr reads the mirror and the prices, and changes no price')
  await reject(() => as('authenticated', () => q(`INSERT INTO catalogue_option_prices(pool, value, price) VALUES ('sofa_sizes', '30', 1)`), 'hr'),
    /row-level security/, 'hr cannot key a surcharge')
  check(await as('authenticated', async () => (await db.query(
    `UPDATE catalogue_skus SET note = 'checked' WHERE erp_product_id = 'mfg-ult'`)).affectedRows, 'admin'), 1, 'the Principal can')
  await reject(() => as('authenticated', () => q(`INSERT INTO erp_products(erp_id, item_code) VALUES ('mfg-typed', 'TYPED')`), 'admin'),
    /row-level security/, 'not even the Principal writes the mirror')

  // ── an empty ERP list restricts nothing (the ERP's own hasRestriction) ────
  await deliver({
    models: [model(M.free, 'FREE', 'FREE', 'BEDFRAME', 'BEDFRAME', { sizes: ['K'], leg_heights: [], divan_heights: [] })],
    products: [sku('mfg-free-k', 'FREE-(K)', 'BEDFRAME', { model_id: M.free, size_code: 'K' })],
  })
  await q(`INSERT INTO catalogue_models(erp_model_id, offered, enabled) VALUES ($1, true, $2::jsonb)
           ON CONFLICT (erp_model_id) DO UPDATE SET offered = true, enabled = EXCLUDED.enabled`, [M.free, J({
    leg_heights: ['4"', '6"', 'Gold Leg'], divan_heights: ['8"', '12"'], specials: ['Right Drawer'] })])
  await q(`INSERT INTO catalogue_skus(erp_product_id, offered, price) VALUES ('mfg-free-k', true, 500)
           ON CONFLICT (erp_product_id) DO UPDATE SET offered = true, price = 500`)
  check((await catalogue(['AKEMI'])).models.find(m => m.id === M.free)?.options ?? null, {
    leg_heights: ['4"', '6"'], specials: ['Right Drawer'], divan_heights: ['8"'], total_heights: [], gaps: [] },
    'a model the ERP leaves unrestricted (an empty or missing list) offers its ticks within the live pool — "no restriction", not "nothing"')

  // ── who is a rider ────────────────────────────────────────────────────────
  await deliver({
    models: [model(M.latex, 'MYLATEX-LUXE', 'MYLATEX LUXE', 'MATTRESS', 'MYLATEX', { sizes: ['K'] })],
    products: [sku('mfg-latex-k', 'MYLATEX LUXE MATT (K)', 'MATTRESS', { model_id: M.latex, size_code: 'K', branding: 'MYLATEX' })],
  })
  await q(`INSERT INTO catalogue_models(erp_model_id, offered) VALUES ($1, true)
           ON CONFLICT (erp_model_id) DO UPDATE SET offered = true`, [M.latex])
  await q(`INSERT INTO catalogue_skus(erp_product_id, offered, price) VALUES ('mfg-latex-k', true, 900)
           ON CONFLICT (erp_product_id) DO UPDATE SET offered = true, price = 900`)
  const latex = async brands => product(await catalogue(brands), 'MYLATEX LUXE MATT (K)') ?? null
  check(await latex(['AKEMI', 'ZANOTTI', 'DUNLOP']), null,
    'a mattress whose ERP branding matches no brand is sold under nothing — never a rider by accident')
  await q(`UPDATE catalogue_models SET brand_code = 'RIDER' WHERE erp_model_id = $1`, [M.latex])
  check((await latex(['AKEMI']))?.brand, null, 'marked Rider on Modular it joins any cart, with no brand of its own')
  await q(`UPDATE catalogue_models SET brand_code = 'AKEMI' WHERE erp_model_id = $1`, [M.latex])
  check([(await latex(['AKEMI']))?.brand, await latex(['DUNLOP'])], ['AKEMI', null], 'given a ladder, it sells under that brand only')
  await q(`UPDATE catalogue_models SET brand_code = 'RIDER' WHERE erp_model_id = $1`, [M.bed])
  check([product(await catalogue(['DUNLOP']), '1005-(K)')?.brand, product(await catalogue(['DUNLOP']), '1005-(K)')?.code],
    [null, '1005-(K)'], "a bed frame marked Rider stays a rider — the override is never read as a brand nobody sells")

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} of ${checks} catalogue SQL checks failed:`)
    for (const what of failures) console.error(`  - ${what}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${checks} catalogue SQL checks. Synthetic surroundings; real migrations 20260924020000, 025000, 030000 and 040000 (and the three before them). No live database connection.`)
  }
} finally {
  await db.close()
}
