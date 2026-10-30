// Local PostgreSQL regression for 20261031001500 (2026-10-31 — the user, of bills whose bed frame is still KIV:
// "最主要是我不要让他们算虚高 … 补钱容易，扣钱很难"; then "只要 detect 到 bed frame 它是 KIV 的话 … 就拿最贵的 bed frame 按照这样子的
// costing 去计算它的 margin: King size 拿 1000 块, Queen size 拿 820 块, Super single 拿 600 块, Single 拿 550 块").
// Production's costing bodies — the repo's copies, md5-checked against production's — over stand-ins for the tables
// they read; then the migration runs VERBATIM, twice. What is under test: the table and what it refuses; the four
// seeded once and never written over; a KIV frame's size read off its code, else off its words (SUPER SINGLE no
// SINGLE, 3.5FT no 5FT, the dearest of two named), else — none, SK, SP, a size not set — the dearest of the four; a
// line priced exactly as before when it is no KIV frame, and a KIV frame priced as before while the four are unset;
// the registrations; what landed is the md5 the file names. No live I/O.
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
function lastFunction(sql, name) {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\([\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
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
const LINE_COST = 'public.catalogue_line_cost(bigint, text, text, text, jsonb, numeric)'
const KIV_COST = 'public.catalogue_kiv_cost(bigint, text, text, jsonb)'

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

  -- ── The tables the costing reads, with the columns it names ─────────────
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
  CREATE TABLE catalogue_skus (
    erp_product_id TEXT PRIMARY KEY,
    offered        BOOLEAN NOT NULL DEFAULT FALSE,
    price          NUMERIC,
    price_grid     JSONB,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE erp_fabrics (
    erp_company_id BIGINT NOT NULL DEFAULT 1, erp_id TEXT NOT NULL, fabric_code TEXT NOT NULL,
    series TEXT, sofa_tier TEXT, bedframe_tier TEXT, price_tier TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), removed_at TIMESTAMPTZ,
    PRIMARY KEY (erp_company_id, erp_id))`)

// ── Production's costing, as it runs on 2026-10-31 ──────────────────────────
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m1006 = await migration('20261006050000_option_prices_are_charges')
const writes = await migration('20261009020000_writes_ask_for_the_action')
const reads = await migration('20261009080000_reads_ask_for_the_action')
const grid0 = lastFunction(m030, 'catalogue_grid_price')
// 20261021230200 swapped one statement into it: a cell priced 0 is no price.
const anchor = "\n       AND (c->>'price') ~ '^\\d+(\\.\\d+)?$'"
assert(grid0.body.includes(anchor), 'the grid lookup still reads a figure as it did')
const zero = s => s.replace(anchor, () => anchor + "\n       AND (c->>'price')::NUMERIC > 0")
const bodies = [
  [lastFunction(m030, 'catalogue_value_key'), '1ea7b76ef890a99929c2b6c06c24321c'],
  [lastFunction(m030, 'catalogue_height_key'), 'd15bbca0ff85708427e948c82b4ff675'],
  [lastFunction(m030, 'catalogue_sku_for_code'), '6261c6dfd8ef4ac5f3757d338ba310b0'],
  [{ statement: zero(grid0.statement), body: zero(grid0.body) }, '901e210be1edc909178fd18e06f5e67f'],
  [lastFunction(m030, 'catalogue_unit_price'), '4238ca41f63872829a2889e85f32989a'],
  [lastFunction(m030, 'catalogue_fabric_tier'), 'cb1d3294390b61e570ebdf6fde5b2ea9'],
  [lastFunction(m030, 'catalogue_line_facts'), '85e7986827c8adb666a14515ae88d3f7'],
  [lastFunction(m1006, 'catalogue_line_surcharge'), 'adb2b97fa0e5bc312adbf87c29696cfd'],
  [lastFunction(m030, 'catalogue_line_cost'), '5b764573b0f693f2250959ccb52054d1'],
  [lastFunction(writes, 'permission_writes_guard'), '06a8d5af3653f6769612d89991867367'],
  [lastFunction(reads, 'permission_reads_guard'), '2d4b528468300c9e79286f07032c97ca'],
]
check(bodies.map(([f]) => md5(f.body)), bodies.map(([, sum]) => sum), "the repo's copies are production's bodies")
for (const [f] of bodies) await db.exec(f.statement)

// ── The catalogue ───────────────────────────────────────────────────────────
await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model) VALUES
           ('mfg-cody-k', 'CODY-(K)', 'BEDFRAME', 'CODY'),
           ('mfg-kiv-lv2', 'BEDFRAME KIV LV2', 'BEDFRAME', 'BEDFRAME KIV LV2'),
           ('mfg-kiv-lv1-q', 'BEDFRAME KIV LV1-(Q)', 'BEDFRAME', 'BEDFRAME KIV LV1'),
           ('mfg-kiv-lv3-sk', 'BEDFRAME KIV LV3-(SK)', 'BEDFRAME', 'BEDFRAME KIV LV3'),
           ('mfg-matt', 'AKEMI ARMOUR MATT (K)', 'MATTRESS', 'ARMOUR'),
           ('mfg-8030', '8030-1A(LHF)', 'SOFA', '8030')`)
await q(`INSERT INTO catalogue_skus (erp_product_id, price, price_grid) VALUES
           ('mfg-cody-k', 550, NULL), ('mfg-matt', 1880, NULL),
           ('mfg-8030', NULL, '[{"height":"28","tier":"PRICE_2","price":900}]'::jsonb),
           -- A KIV SKU somebody priced on the SKU Master: the four win over it.
           ('mfg-kiv-lv1-q', 300, NULL)`)

/** What catalogue_line_cost says of a line: [cost, unit, detail]. */
async function cost(code, description2 = null, qty = 1, raw = {}, group = 'bedframe') {
  const r = (await q(`SELECT cost, unit_price, detail FROM catalogue_line_cost(1, $1, $2, $3, $4::jsonb, $5)`,
    [code, group, description2, JSON.stringify(raw), qty]))[0]
  return [r.cost === null ? null : Number(r.cost), r.unit_price === null ? null : Number(r.unit_price), r.detail]
}

// The lines under test, read before the migration: what every one of them said then.
const LINES = [
  ['BEDFRAME KIV LV2', 'DIVAN 8" / GAP 14" / T.Heights 22"', 2],
  ['BEDFRAME KIV LV1-(Q)', null, 1],
  ['BEDFRAME KIV', 'QUEEN LVL1', 1],
  ['CODY-(K)', 'PC151-01 / DIVAN 8" + LEG 4" / GAP 12"', 1],
  ['AKEMI ARMOUR MATT (K)', null, 2],
  ['8030-1A(LHF)', 'BO315-21 / SEAT 28 / LEG DEFAULT', 1, {}, 'sofa'],
  ['8030-1A(LHF)', 'LEG DEFAULT', 1, {}, 'sofa'],
]
const before = []
for (const [code, d2, qty, raw, group] of LINES) before.push(await cost(code, d2, qty, raw, group))
check(before.slice(0, 3).map(([c, , d]) => [c, d.reason]), [[null, 'unpriced'], [300, undefined], [null, 'not_in_sku_master']],
  'before: a KIV frame is Cost pending — unless somebody priced its SKU')

// ── The migration, twice ────────────────────────────────────────────────────
const file = await migration('20261031001500_kiv_bed_frames_cost_the_dearest')
await db.exec(file)
const landed = [await bodyMd5(LINE_COST), await bodyMd5(KIV_COST)]
// Somebody's change on the Product List since: the second run writes nothing over it.
await q(`UPDATE catalogue_kiv_costs SET cost = 1100 WHERE size_code = 'K'`)
await db.exec(file)
check([await bodyMd5(LINE_COST), await bodyMd5(KIV_COST)], landed, 'a second run changes neither body')
const fileMd5 = name => {
  const m = file.match(new RegExp(String.raw`\('public\.` + name + String.raw`\([^)]*\)', '([0-9a-f]{32})'\)`))
  return m?.[1]
}
check(landed, [fileMd5('catalogue_line_cost'), fileMd5('catalogue_kiv_cost')], 'what landed is the md5 the file names')
check((await q(`SELECT size_code, cost::text AS cost FROM catalogue_kiv_costs
                 ORDER BY array_position(ARRAY['K', 'Q', 'SS', 'S'], size_code)`)).map(r => [r.size_code, r.cost]),
  [['K', '1100.00'], ['Q', '820.00'], ['SS', '600.00'], ['S', '550.00']],
  "the user's four, seeded once: a change made since stays")
await q(`UPDATE catalogue_kiv_costs SET cost = 1000 WHERE size_code = 'K'`)

// ── The table refuses ───────────────────────────────────────────────────────
await reject(`INSERT INTO catalogue_kiv_costs (size_code, cost) VALUES ('SK', 1500)`, [], /check/i, 'a size outside the four')
await reject(`UPDATE catalogue_kiv_costs SET cost = 0 WHERE size_code = 'S'`, [], /check/i, 'a frame costing nothing')
await reject(`INSERT INTO catalogue_kiv_costs (size_code, cost) VALUES ('K', 900)`, [], /duplicate|unique/i, 'a size twice')

// ── The registrations ───────────────────────────────────────────────────────
check((await q(`SELECT command, actions FROM permission_table_writes WHERE table_name = 'catalogue_kiv_costs' ORDER BY command`))
  .map(r => [r.command, r.actions]),
  [['DELETE', ['product_list.edit']], ['INSERT', ['product_list.edit']], ['UPDATE', ['product_list.edit']]], 'written with Product List · Edit')
check(await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'catalogue_kiv_costs'`),
  ['product_list.edit', 'product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage'],
  "read as catalogue_option_prices is: the Product List, and whoever writes a sales line")
check(await one(`SELECT mode FROM audit_tables WHERE table_name = 'catalogue_kiv_costs'`), 'all', 'every change in the history')
check((await q(`SELECT polname FROM pg_policy WHERE polrelid = 'catalogue_kiv_costs'::regclass ORDER BY polname`)).map(r => r.polname),
  ['catalogue_kiv_costs_hr_select', 'catalogue_kiv_costs_principal_all', 'catalogue_kiv_costs_product_list',
    'needs_action_delete', 'needs_action_insert', 'needs_action_select', 'needs_action_update'],
  'its row policies, and the guards asking the action of every write and read')

// ── A KIV frame costs the dearest of its size ───────────────────────────────
const kiv = async (code, d2 = null, qty = 1, raw = {}) => {
  const [c, unit, d] = await cost(code, d2, qty, raw)
  return { cost: c, unit, how: d.how, size: d.size ?? null, named: d.named ?? null, from: d.size_from ?? null }
}
check(await kiv('BEDFRAME KIV LV2', 'DIVAN 8" / GAP 14" / T.Heights 22"', 2),
  { cost: 2000, unit: 1000, how: 'kiv', size: null, named: null, from: null },
  "no size anywhere (September's and October's KIV LV2): the dearest of the four, per frame")
check(await kiv('BEDFRAME KIV LV1-(Q)'), { cost: 820, unit: 820, how: 'kiv', size: 'Q', named: ['Q'], from: 'code' },
  "the code's size — and the four win over a price somebody typed on the KIV SKU")
check(await kiv('BEDFRAME KIV', 'QUEEN LVL1'), { cost: 820, unit: 820, how: 'kiv', size: 'Q', named: ['Q'], from: 'words' }, 'QUEEN')
check((await kiv('BEDFRAME KIV', 'SINGLE LVL1')).unit, 550, 'SINGLE')
check((await kiv('BEDFRAME KIV', 'LV1 K/COL:KIV/DIVAN:8INCH KIV/GAP:10INCH')).unit, 1000, 'a lone K — and KIV is no K')
check((await kiv('BEDFRAME KIV', 'lv 1 q/col:kiv/divan:8inch kiv/gap:10inch')).unit, 820, 'a lone q, in any case')
check((await kiv('BEDFRAME KIV', 'King level 3, Color: TBC/ Divan: TBC/ Gap:14”')).unit, 1000, 'King')
check(await kiv('BEDFRAME KIV', 'SUPER SINGLE, col tbc'), { cost: 600, unit: 600, how: 'kiv', size: 'SS', named: ['SS'], from: 'words' },
  'SUPER SINGLE is no SINGLE')
check((await kiv('BEDFRAME KIV', 'LVL2 3.5FT')).unit, 600, '3.5FT is no 5FT')
check((await kiv('BEDFRAME KIV', '5FT LVL2')).unit, 820, '5FT is a Queen')
check(await kiv('BEDFRAME KIV', 'Q or K, tbc'), { cost: 1000, unit: 1000, how: 'kiv', size: 'K', named: ['K', 'Q'], from: 'words' },
  'two sizes named: the dearest of them')
check(await kiv('BEDFRAME KIV LV3-(SK)'), { cost: 1000, unit: 1000, how: 'kiv', size: null, named: ['SK'], from: 'code' },
  'a size the four do not set (SK): the dearest of the four')
check((await kiv('BEDFRAME KIV', 'tbc')).unit, 1000, 'nothing said: the dearest')
check((await kiv('BEDFRAME KIV', 'tbc', 1, { description: 'BEDFRAME KIV QUEEN' })).unit, 820, "the ERP's own description is read too")
check((await kiv('  bedframe kiv lv2 ', 'Queen')).unit, 820, 'the code trimmed, in any case')
check((await kiv('BEDFRAME KIV', 'QUEEN LVL1', 3)).cost, 2460, 'per frame × the frames')

// A size the Product List clears costs the dearest; a change follows at once.
await q(`DELETE FROM catalogue_kiv_costs WHERE size_code = 'S'`)
check((await kiv('BEDFRAME KIV', 'SINGLE LVL1')).unit, 1000, 'a size not set: the dearest')
await q(`INSERT INTO catalogue_kiv_costs (size_code, cost) VALUES ('S', 500)`)
await q(`UPDATE catalogue_kiv_costs SET cost = 1050 WHERE size_code = 'K'`)
check([(await kiv('BEDFRAME KIV', 'SINGLE LVL1')).unit, (await kiv('BEDFRAME KIV LV2')).unit], [500, 1050], 'a change on the Product List follows at once')

// ── Everything else is priced exactly as before ─────────────────────────────
const after = []
for (const [code, d2, qty, raw, group] of LINES.slice(3)) after.push(await cost(code, d2, qty, raw, group))
check(after, before.slice(3), 'a line that is no KIV frame: the same cost, unit and detail as before')
await q(`DELETE FROM catalogue_kiv_costs`)
const unset = []
for (const [code, d2, qty, raw, group] of LINES.slice(0, 3)) unset.push(await cost(code, d2, qty, raw, group))
check(unset, before.slice(0, 3), 'the four all unset: a KIV frame prices as it did before')
check(await q(`SELECT * FROM catalogue_kiv_cost(1, 'CODY-(K)', NULL, '{}'::jsonb)`), [], 'no row for a frame that is no KIV')

console.log(`validate-kiv-costs: ${checks} checks passed`)
