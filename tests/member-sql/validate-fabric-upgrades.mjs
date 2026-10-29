// Local PostgreSQL regression for 20261030020000 (2026-10-29 — the user, on Product List › Maintenance › Fabrics:
// "我可以选择 fabric，选到某一个 fabric series 的话它是加多少钱，比如 additional 可能加 200 块。所以这 200 块本身是没有算进
// margin 里面的 same as special order concept. this setting is for sofa and bedframe category"; an upgrade made first
// and its series ticked under it, "先建 upgrade 再勾 series"; a sofa "一组 sofa 加一次", a bed frame per frame; and, of
// a fabric keyed TBC first: when the ERP fills it in, the charge must follow).
// Production's bodies — the repo's last copies, md5-checked against production's — run over stand-ins for the
// tables they read; 20261026173700, 20261027020300 and 20261027024500 bring catalogue_apply_sofa_charges to what
// production runs (cefb19e6…); then 20261030020000 runs VERBATIM, twice. What is under test: the two tables and what
// they refuse (a name twice, a series in two upgrades of a category, a charge of 0); the writer — adds, only what
// changed, a series moved in one Save, removes; a bed frame charged its fabric's upgrade per frame, beside its
// options; a sofa once per sofa × the sofas, an upgrade any piece is in once; the fabric found as Rules › KPI items
// finds it (trimmed, any case, the live row first, a removed fabric still its series); TBC charged nothing until
// the order comes back with its fabric; bills with no upgrade exactly as before; what landed is the md5 the file
// names. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const migration = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
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

/** The last CREATE of a function in a migration: the whole statement, and its body (what pg_proc.prosrc holds). */
function lastFunction(sql, name, args = '') {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\(` + args + String.raw`[\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
  let m, found = null
  while ((m = re.exec(sql))) {
    const start = m.index + m[0].length
    const end = sql.indexOf(m[1], start)
    found = { statement: sql.slice(m.index, end + m[1].length) + ';', body: sql.slice(start, end) }
  }
  assert(found, `no CREATE FUNCTION ${name}`)
  return found
}
const bodyMd5 = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
const APPLY = 'public.catalogue_apply_sofa_charges(uuid)'
const CHARGE = 'public.catalogue_line_option_charge(bigint, text, text, text, jsonb, numeric)'

// ── The surroundings: roles, the session, the permission registry ───────────
await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION may_read(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION may_write(text, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE TABLE permission_table_writes (table_name text NOT NULL, command text NOT NULL, actions text[] NOT NULL,
    PRIMARY KEY (table_name, command));
  CREATE TABLE permission_table_reads (table_name text PRIMARY KEY, actions text[] NOT NULL);
  -- audit_register as the registry records it; the trigger audit_attach adds is not under test.
  CREATE TABLE audit_tables (table_name text PRIMARY KEY, label text, area text, mode text, read_keys text[],
    key_columns text[], label_columns text[]);
  CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
                                 p_keys text[] DEFAULT NULL, p_labels text[] DEFAULT NULL)
  RETURNS integer LANGUAGE sql AS $$
    INSERT INTO audit_tables VALUES (p_table, p_label, p_area, p_mode, p_read, p_keys, p_labels)
    ON CONFLICT (table_name) DO UPDATE SET label = EXCLUDED.label, key_columns = EXCLUDED.key_columns,
      label_columns = EXCLUDED.label_columns
    RETURNING 1 $$;
  CREATE TABLE users (id uuid PRIMARY KEY);

  -- ── The tables those bodies read, with the columns they name ─────────────
  CREATE TABLE erp_products (
    erp_id         TEXT PRIMARY KEY,
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    item_code      TEXT NOT NULL,
    category       TEXT,
    base_model     TEXT,
    module_code    TEXT,
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    removed_at     TIMESTAMPTZ
  );
  CREATE TABLE erp_maintenance_options (
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    pool           TEXT NOT NULL,
    value          TEXT NOT NULL,
    label          TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    removed_at     TIMESTAMPTZ,
    PRIMARY KEY (erp_company_id, pool, value)
  );
  CREATE TABLE catalogue_option_prices (
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    pool           TEXT NOT NULL,
    value          TEXT NOT NULL,
    price          NUMERIC NOT NULL,
    updated_by     UUID,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (erp_company_id, pool, value),
    FOREIGN KEY (erp_company_id, pool, value) REFERENCES erp_maintenance_options (erp_company_id, pool, value),
    CONSTRAINT catalogue_option_prices_charge_not_negative CHECK (price >= 0),
    CONSTRAINT catalogue_option_prices_unpriced_pools CHECK (pool <> 'sofa_sizes')
  );
  -- The ERP's fabric list as the mirror holds it (20260924020000 §4).
  CREATE TABLE erp_fabrics (
    erp_company_id BIGINT NOT NULL DEFAULT 1, erp_id TEXT NOT NULL, fabric_code TEXT NOT NULL,
    description TEXT, category TEXT, series TEXT, sofa_tier TEXT, bedframe_tier TEXT, price_tier TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), removed_at TIMESTAMPTZ, raw JSONB,
    PRIMARY KEY (erp_company_id, erp_id));
  CREATE TABLE sales_orders (
    id             UUID PRIMARY KEY,
    erp_company_id BIGINT,
    order_no       TEXT NOT NULL,
    raw            JSONB
  );
  CREATE TABLE sales_order_lines (
    id                   UUID PRIMARY KEY,
    order_id             UUID NOT NULL REFERENCES sales_orders(id),
    line_no              INTEGER NOT NULL,
    item_group           TEXT,
    product_code         TEXT NOT NULL,
    description2         TEXT,
    raw                  JSONB,
    qty                  NUMERIC NOT NULL,
    line_amount          NUMERIC,
    option_charge_amount NUMERIC NOT NULL DEFAULT 0,
    cost_detail          JSONB
  )`)

// ── Production's bodies, then production's catalogue_apply_sofa_charges ─────
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m040 = await migration('20260924040000_member_catalogue')
const m1005 = await migration('20261005020000_bedframe_charges_follow_modular')
const m1006 = await migration('20261006050000_option_prices_are_charges')
const writes = await migration('20261009020000_writes_ask_for_the_action')
const reads = await migration('20261009080000_reads_ask_for_the_action')
const bodies = [
  [lastFunction(m030, 'catalogue_value_key'), '1ea7b76ef890a99929c2b6c06c24321c'],
  [lastFunction(m030, 'catalogue_sku_for_code'), '6261c6dfd8ef4ac5f3757d338ba310b0'],
  [lastFunction(m030, 'catalogue_line_facts'), '85e7986827c8adb666a14515ae88d3f7'],
  [lastFunction(m030, 'catalogue_option_price'), '3c189c4f0b4fb0174ace07b74a98da36'],
  [lastFunction(m040, 'catalogue_model_options'), 'baf5b2f98fd7c2fe9afe77a72512f619'],
  [lastFunction(m1005, 'catalogue_model_charges', String.raw`p_company BIGINT, p_pool TEXT, p_enabled`), '5b6c299a088c8510929f868ae7185457'],
  [lastFunction(m1006, 'catalogue_line_charge', String.raw`p_company BIGINT, p_category TEXT,\s+p_divan TEXT, p_leg TEXT, p_gap TEXT, p_total TEXT,\s+p_specials`),
    'a75cdfcb604a66bdd8e109c065730f40'],
  [lastFunction(m1006, 'catalogue_line_option_charge'), '29346dbf860b2efa9f02cb208f14f13f'],
  [lastFunction(m1006, 'catalogue_apply_sofa_charges'), '55af81ff0c49ad4ff38aef13130863b9'],
  [lastFunction(writes, 'permission_writes_guard'), '06a8d5af3653f6769612d89991867367'],
  [lastFunction(reads, 'permission_reads_guard'), '2d4b528468300c9e79286f07032c97ca'],
]
check(bodies.map(([f]) => md5(f.body)), bodies.map(([, sum]) => sum), "the repo's last copies are production's bodies")
for (const [f] of bodies) await db.exec(f.statement)
for (const name of ['20261026173700_sofa_specials_by_quantity', '20261027020300_sofa_specials_by_compartment',
  '20261027024500_sofa_corner_has_no_back_cushion']) await db.exec(await migration(name))
check([await bodyMd5(CHARGE), await bodyMd5(APPLY)], ['29346dbf860b2efa9f02cb208f14f13f', 'cefb19e6d7f7b7479dd752e5d9ac9d60'],
  'the two bodies as production runs them on 2026-10-29')

// ── The catalogue ───────────────────────────────────────────────────────────
for (const code of ['8030-1A(LHF)', '8030-1NA', '8030-1A(RHF)', '9028-2A(LHF)', '9028-L(RHF)']) {
  await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model, module_code) VALUES ($1, $1, 'SOFA', $2, $3)`,
    [code, code.split('-')[0], code.slice(code.indexOf('-') + 1)])
}
await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model) VALUES ('BF-KING', 'BF-KING', 'BEDFRAME', 'BF')`)
await q(`INSERT INTO erp_maintenance_options (pool, value, label) VALUES ('sofa_leg_heights', '5"', '5"'), ('bedframe_divan_heights', '12"', '12"')`)
await q(`INSERT INTO catalogue_option_prices (pool, value, price) VALUES ('sofa_leg_heights', '5"', 200), ('bedframe_divan_heights', '12"', 100)`)
await q(`INSERT INTO erp_fabrics (erp_id, fabric_code, series, removed_at, synced_at) VALUES
           ('f1', 'PC151-01', 'PC151', NULL, '2026-10-27'),
           ('f2', 'PC151-18', 'PC151', NULL, '2026-10-27'),
           ('f3', 'KS-08', 'KS', NULL, '2026-10-27'),
           ('f4', 'LX-01', 'LX', NULL, '2026-10-27'),
           -- One code listed twice: the live row's series is the line's.
           ('f5', 'BN125-04', 'OLD BN', '2026-10-01', '2026-10-28'),
           ('f6', 'bn125-04 ', 'BN125', NULL, '2026-10-20'),
           ('f7', 'ZZ-01', NULL, NULL, '2026-10-27'),
           -- Gone from the ERP's list since: still the series it was sold in.
           ('f8', 'RM-01', 'RM', '2026-10-01', '2026-10-01'),
           ('f9', 'ZL-02', 'ZL', NULL, '2026-10-27')`)

// ── Bills ───────────────────────────────────────────────────────────────────
/** A sofa piece as the ERP sends it, its fabric in the line's variants (TBC until the ERP fills it in). */
const piece = (code, { qty = 1, amount = 0, leg = 'Default', fabric = 'TBC' } = {}) => ({ code, qty, amount, leg, fabric })
async function bill(n, pieces) {
  const orderId = id(n * 100)
  // As a delivery from the ERP: the whole order again, its lines replaced.
  await q(`DELETE FROM sales_order_lines WHERE order_id = $1`, [orderId])
  await q(`DELETE FROM sales_orders WHERE id = $1`, [orderId])
  await q(`INSERT INTO sales_orders (id, erp_company_id, order_no, raw) VALUES ($1, 1, $2, '{}'::jsonb)`, [orderId, `HC-SO-TEST-${n}`])
  let line = 0
  for (const p of pieces) {
    await q(`INSERT INTO sales_order_lines (id, order_id, line_no, item_group, product_code, description2, raw, qty, line_amount)
             VALUES ($1, $2, $3, 'SOFA', $4, $5, $6::jsonb, $7, $8)`,
      [id(n * 100 + line + 1), orderId, line, p.code, `${p.fabric} / LEG ${p.leg.toUpperCase()}`,
        JSON.stringify({ variants: { fabricCode: p.fabric, legHeight: p.leg, specials: [] } }), p.qty, p.amount])
    line++
  }
  return orderId
}
const apply = orderId => one(`SELECT catalogue_apply_sofa_charges($1)`, [orderId])
const lines = async orderId => (await q(`SELECT product_code, option_charge_amount::float8 AS charge, cost_detail FROM sales_order_lines
                                          WHERE order_id = $1 ORDER BY line_no`, [orderId]))
const soffio = (opts = {}) => ['8030-1A(LHF)', '8030-1NA', '8030-1A(RHF)'].map(code =>
  piece(code, { ...opts, amount: code === '8030-1NA' ? 6000 : 0, fabric: typeof opts.fabric === 'function' ? opts.fabric(code) : opts.fabric }))
const frame = (description2, raw = null, qty = 1) => q(
  `SELECT amount::float8 AS amount, unit::float8 AS unit, parts FROM catalogue_line_option_charge(1, 'BF-KING', 'BEDFRAME', $1, $2::jsonb, $3)`,
  [description2, raw === null ? null : JSON.stringify(raw), qty]).then(r => r[0])

// Before: what production charges today, to hold the new bodies to.
const BEFORE_SOFA = await bill(1, soffio({ leg: '5"', fabric: 'PC151-01' }))
await apply(BEFORE_SOFA)
const before = {
  sofa: await lines(BEFORE_SOFA),
  frame: await frame('PC151-01 / DIVAN 12" + LEG 6"', null, 2),
}
check(before.sofa.map(l => l.charge), [0, 200, 0], 'today: the leg once, on the line that sells')
check(before.frame, { amount: 200, unit: 100, parts: [{ pool: 'bedframe_divan_heights', value: '12"', price: 100 }] },
  'today: the divan per frame')

// ── The migration, verbatim, twice ──────────────────────────────────────────
const mig = await migration('20261030020000_fabric_upgrades')
await db.exec(mig)
await db.exec(mig)
check([await bodyMd5(CHARGE), await bodyMd5(APPLY)], ['3f97dee2c547c8af6b2a56c88cd8cd90', '174b99f3b8e622ccd0f0666da120acad'],
  "the bodies are the file's")
check([md5(lastFunction(mig, 'catalogue_line_option_charge').body), md5(lastFunction(mig, 'catalogue_apply_sofa_charges').body)],
  ['3f97dee2c547c8af6b2a56c88cd8cd90', '174b99f3b8e622ccd0f0666da120acad'], 'and the md5s its last check names')

// With no upgrade set, nothing moves.
await apply(BEFORE_SOFA)
check(await lines(BEFORE_SOFA), before.sofa, 'a sofa with no upgrade: charged exactly as before')
check(await frame('PC151-01 / DIVAN 12" + LEG 6"', null, 2), before.frame, 'a bed frame with no upgrade: exactly as before')

// ── The registry ────────────────────────────────────────────────────────────
check(await q(`SELECT table_name, command, actions FROM permission_table_writes ORDER BY 1, 2`), [
  ...['DELETE', 'INSERT', 'UPDATE'].map(command => ({ table_name: 'catalogue_fabric_upgrade_series', command, actions: ['product_list.edit'] })),
  ...['DELETE', 'INSERT', 'UPDATE'].map(command => ({ table_name: 'catalogue_fabric_upgrades', command, actions: ['product_list.edit'] })),
], 'written behind Product List · Edit')
check((await q(`SELECT table_name, actions FROM permission_table_reads ORDER BY 1`)).map(r => [r.table_name, r.actions]), [
  ['catalogue_fabric_upgrade_series', ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']],
  ['catalogue_fabric_upgrades', ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage']],
], "read by the Product List and by whoever writes a sales line, as Maintenance's prices")
check((await q(`SELECT tablename || ' ' || policyname || ' ' || permissive || ' ' || cmd AS p FROM pg_policies
                 WHERE tablename LIKE 'catalogue_fabric_upgrade%' ORDER BY 1`)).map(r => r.p), [
  'catalogue_fabric_upgrade_series catalogue_fabric_upgrade_series_hr_select PERMISSIVE SELECT',
  'catalogue_fabric_upgrade_series catalogue_fabric_upgrade_series_principal_all PERMISSIVE ALL',
  'catalogue_fabric_upgrade_series catalogue_fabric_upgrade_series_product_list PERMISSIVE ALL',
  'catalogue_fabric_upgrade_series needs_action_delete RESTRICTIVE DELETE',
  'catalogue_fabric_upgrade_series needs_action_insert RESTRICTIVE INSERT',
  'catalogue_fabric_upgrade_series needs_action_select RESTRICTIVE SELECT',
  'catalogue_fabric_upgrade_series needs_action_update RESTRICTIVE UPDATE',
  'catalogue_fabric_upgrades catalogue_fabric_upgrades_hr_select PERMISSIVE SELECT',
  'catalogue_fabric_upgrades catalogue_fabric_upgrades_principal_all PERMISSIVE ALL',
  'catalogue_fabric_upgrades catalogue_fabric_upgrades_product_list PERMISSIVE ALL',
  'catalogue_fabric_upgrades needs_action_delete RESTRICTIVE DELETE',
  'catalogue_fabric_upgrades needs_action_insert RESTRICTIVE INSERT',
  'catalogue_fabric_upgrades needs_action_select RESTRICTIVE SELECT',
  'catalogue_fabric_upgrades needs_action_update RESTRICTIVE UPDATE',
], 'the policies of catalogue_option_prices, and the guards the registry asks for')
check(await q(`SELECT table_name, area, read_keys, key_columns, label_columns FROM audit_tables ORDER BY 1`), [
  { table_name: 'catalogue_fabric_upgrade_series', area: 'Catalogue', read_keys: ['product_list'], key_columns: ['upgrade_id', 'series'], label_columns: ['category', 'series'] },
  { table_name: 'catalogue_fabric_upgrades', area: 'Catalogue', read_keys: ['product_list'], key_columns: ['id'], label_columns: ['category', 'name'] },
], 'both in the audit, opened to the Product List')

// ── The writer, as the Principal ────────────────────────────────────────────
const ME = id(900)
await q(`INSERT INTO users (id) VALUES ($1)`, [ME])
await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [ME])
const save = (category, adds = [], changes = [], removes = []) =>
  one(`SELECT catalogue_save_fabric_upgrades($1, $2::jsonb, $3::jsonb, $4::uuid[])`,
    [category, JSON.stringify(adds), JSON.stringify(changes), `{${removes.join(',')}}`])
const saving = (pattern, what, ...args) => assert.rejects(() => save(...args), pattern, what).then(() => { checks++ })
const upgrades = async category => (await q(
  `SELECT u.id, u.name, u.price::float8 AS price, u.updated_by,
          COALESCE((SELECT array_agg(x.series ORDER BY x.series) FROM catalogue_fabric_upgrade_series x WHERE x.upgrade_id = u.id), '{}') AS series
     FROM catalogue_fabric_upgrades u WHERE u.category = $1 ORDER BY u.name`, [category]))
const named = async (category, name) => (await upgrades(category)).find(u => u.name === name)

check(await save('SOFA', [{ name: 'Upgrade fabric', price: 200, series: ['PC151', 'KS'] }]), 3, 'one upgrade and its two series')
check(await save('BEDFRAME', [
  { name: '  Upgrade   fabric ', price: 150, series: ['PC151', 'BN125'] },
  { name: 'Old', price: 999, series: ['OLD BN'] },
  { name: 'Removed fabric', price: 50, series: ['RM'] },
]), 7, "a bed frame's apart from a sofa's: the same name, the same series")
check((await upgrades('BEDFRAME')).map(u => [u.name, u.price, u.series, u.updated_by]), [
  ['Old', 999, ['OLD BN'], ME], ['Removed fabric', 50, ['RM'], ME], ['Upgrade fabric', 150, ['BN125', 'PC151'], ME],
], 'a name kept tidy, written by whoever saved')
const SOFA_UP = (await named('SOFA', 'Upgrade fabric')).id

await saving(/There is already an upgrade named Upgrade fabric/, 'a name once per category, spelled any way',
  'SOFA', [{ name: 'upgrade  FABRIC', price: 300, series: [] }])
await saving(/ks is already in Upgrade fabric/, 'a series in one upgrade of a category at most',
  'SOFA', [{ name: 'Leather', price: 500, series: ['ks'] }])
await saving(/a charge above 0/, 'a charge above 0', 'SOFA', [{ name: 'Free', price: 0, series: [] }])
await saving(/An upgrade has no name/, 'a name', 'SOFA', [{ name: '   ', price: 10, series: [] }])
await saving(/a sofa's or a bed frame's/, "a sofa's or a bed frame's only", 'MATTRESS', [{ name: 'X', price: 10, series: [] }])
await saving(/taken off since the page was opened/, 'a change to an upgrade gone since', 'SOFA', [], [{ id: id(999), price: 10 }])
check((await upgrades('SOFA')).length, 1, 'a refused Save writes nothing')

// KS moves to a new upgrade in the same Save; ZL is ticked onto the first.
check(await save('SOFA', [{ name: 'Leather', price: 500, series: ['LX', 'KS'] }],
  [{ id: SOFA_UP, drop_series: ['ks'], add_series: ['ZL', 'pc151'] }]), 5,
'KS unticked and ticked again elsewhere, ZL added — PC151 already there, not twice')
check((await upgrades('SOFA')).map(u => [u.name, u.price, u.series]),
  [['Leather', 500, ['KS', 'LX']], ['Upgrade fabric', 200, ['PC151', 'ZL']]], 'a series moved in one Save')

// Only what changed: a charge leaves the name, a name leaves the charge.
await save('SOFA', [], [{ id: SOFA_UP, price: 250 }])
check((await named('SOFA', 'Upgrade fabric')).price, 250, 'the charge alone')
await save('SOFA', [], [{ id: SOFA_UP, name: 'Fabric upgrade' }, { id: (await named('SOFA', 'Leather')).id, price: 500 }])
check((await upgrades('SOFA')).map(u => [u.name, u.price]), [['Fabric upgrade', 250], ['Leather', 500]], 'the name alone')
await save('SOFA', [], [{ id: SOFA_UP, name: 'Upgrade fabric', price: 200 }])

// Taken off: its series go with it.
await save('SOFA', [{ name: 'Temp', price: 10, series: ['TMP'] }])
const TEMP = (await named('SOFA', 'Temp')).id
check(await save('SOFA', [], [], [TEMP]), 1, 'one upgrade taken off')
check(await one(`SELECT count(*)::int FROM catalogue_fabric_upgrade_series WHERE upgrade_id = $1`, [TEMP]), 0, 'and its series')

// What the tables refuse whoever writes them.
await reject(`INSERT INTO catalogue_fabric_upgrade_series (upgrade_id, category, series) VALUES ($1, 'SOFA', 'pc151')`,
  [(await named('SOFA', 'Leather')).id], /catalogue_fabric_upgrade_series_one_upgrade/, 'the index holds a series to one upgrade')
await reject(`INSERT INTO catalogue_fabric_upgrade_series (upgrade_id, category, series) VALUES ($1, 'BEDFRAME', 'NEW')`,
  [SOFA_UP], /foreign key/, "a series stands under an upgrade of its own category")
await reject(`INSERT INTO catalogue_fabric_upgrades (category, name, price) VALUES ('SOFA', 'Nothing', 0)`, [], /check constraint/,
  'no upgrade at RM 0')

// ── A bed frame: per frame, beside its options ──────────────────────────────
const UPGRADE_150 = { pool: 'bedframe_fabric_upgrades', value: 'Upgrade fabric', series: 'PC151', price: 150 }
check(await frame('PC151-01 / DIVAN 12" + LEG 6"', null, 2), {
  amount: 500, unit: 250, parts: [{ pool: 'bedframe_divan_heights', value: '12"', price: 100 }, UPGRADE_150],
}, 'PC151: the divan RM 100 and the upgrade RM 150, per frame × 2')
check((await frame(null, { variants: { fabricCode: ' pc151-18 ', divanHeight: '12"' } })).unit, 250,
  "the fabric in the line's variants, trimmed, any case")
check((await frame('TBC / DIVAN 12" + LEG 6"')).unit, 100, 'a fabric keyed TBC: the divan alone')
check((await frame('KS-08 / DIVAN 12" + LEG 6"')).unit, 100, "KS is a sofa's upgrade, not a bed frame's")
check((await frame('ZZ-01 / DIVAN 12" + LEG 6"')).unit, 100, 'a fabric in no series')
check((await frame('BN125-04 / DIVAN 12" + LEG 6"')).parts[1], { ...UPGRADE_150, series: 'BN125' },
  "a code listed twice: the live row's series (BN125's RM 150, not OLD BN's RM 999)")
check((await frame('RM-01 / LEG 6"')).parts, [{ pool: 'bedframe_fabric_upgrades', value: 'Removed fabric', series: 'RM', price: 50 }],
  'a fabric gone from the list since: the series it was sold in')
check(await q(`SELECT amount::float8 AS amount, parts FROM catalogue_line_option_charge(1, '8030-1NA', 'SOFA', 'PC151-01 / LEG 5"', NULL, 1)`),
  [{ amount: 0, parts: [] }], 'a sofa is charged once per sofa, not per line')

// ── A sofa: once per sofa × the sofas ───────────────────────────────────────
const SOFA_200 = { pool: 'sofa_fabric_upgrades', value: 'Upgrade fabric', series: 'PC151', price: 200, count: 1 }
const LEG_200 = { pool: 'sofa_leg_heights', value: '5"', price: 200, count: 1 }
check(await apply(BEFORE_SOFA), 6, 'the three pieces reset and charged again')
let got = await lines(BEFORE_SOFA)
check(got.map(l => l.charge), [0, 400, 0], 'SOFFIO in PC151, leg 5": RM 200 + RM 200, on the line that sells')
check(got[1].cost_detail, { charges: [SOFA_200, LEG_200], charge_set: { sets: 1, compartments: 3, total: 400, lines: 3 } },
  'the upgrade a part of its own, naming its series')
await apply(BEFORE_SOFA)
check(await lines(BEFORE_SOFA), got, 'idempotent')

const TWO = await bill(2, soffio({ qty: 2, fabric: 'PC151-01' }))
await apply(TWO)
check((await lines(TWO)).map(l => l.charge), [0, 400, 0], 'two sofas (×2 every piece): RM 200 × 2')
check((await lines(TWO))[1].cost_detail.charges, [{ ...SOFA_200, count: 2 }], 'counted twice')

const MIXED = await bill(3, soffio({ fabric: code => ({ '8030-1A(LHF)': 'ZL-02', '8030-1NA': 'PC151-18', '8030-1A(RHF)': 'pc151-01' })[code] }))
await apply(MIXED)
check((await lines(MIXED))[1].cost_detail.charges, [{ ...SOFA_200, series: 'ZL' }],
  'pieces in two series of one upgrade: the upgrade once, by the first piece’s series')
check((await lines(MIXED)).reduce((a, l) => a + l.charge, 0), 200, 'RM 200, not RM 600')

const TWO_UPGRADES = await bill(4, soffio({ fabric: code => (code === '8030-1NA' ? 'LX-01' : 'PC151-01') }))
await apply(TWO_UPGRADES)
check((await lines(TWO_UPGRADES))[1].cost_detail.charges.map(c => [c.value, c.series, c.price]),
  [['Leather', 'LX', 500], ['Upgrade fabric', 'PC151', 200]], 'pieces in two upgrades: each once')
check((await lines(TWO_UPGRADES))[1].charge, 700, 'RM 500 + RM 200')

const TWO_SOFAS = await bill(5, [piece('9028-2A(LHF)', { amount: 3000, fabric: 'KS-08' }), piece('9028-L(RHF)', { fabric: 'KS-08' }),
  piece('8030-1NA', { amount: 2000, fabric: 'PC151-01' })])
await apply(TWO_SOFAS)
check((await lines(TWO_SOFAS)).map(l => l.charge), [500, 0, 200], 'two sofas of two models: each its own upgrade')

const BED_SERIES = await bill(6, soffio({ fabric: 'BN125-04' }))
check(await apply(BED_SERIES), 0, "a bed frame's series charges no sofa")

// Keyed TBC, then the ERP saves the order again with its fabric: the whole order comes back.
const TBC = await bill(7, soffio({ leg: '5"' }))
await apply(TBC)
check((await lines(TBC)).map(l => l.charge), [0, 200, 0], 'TBC: the leg alone')
await bill(7, soffio({ leg: '5"', fabric: 'PC151-01' }))
await apply(TBC)
check((await lines(TBC)).map(l => l.charge), [0, 400, 0], 'the fabric filled in: the upgrade charged')

// An upgrade taken off lets go of what it charged.
await save('SOFA', [], [], [(await named('SOFA', 'Leather')).id])
await apply(TWO_UPGRADES)
check((await lines(TWO_UPGRADES)).map(l => l.charge), [0, 200, 0], 'Leather gone: Upgrade fabric alone')
await apply(TWO_SOFAS)
check((await lines(TWO_SOFAS)).map(l => l.charge), [0, 0, 200], "and the 9028 in KS: nothing, its explanation with it")
check((await lines(TWO_SOFAS))[0].cost_detail, {}, 'no charge, nothing said')

console.log(`fabric upgrades: ${checks} checks passed`)
