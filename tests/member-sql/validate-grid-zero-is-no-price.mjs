// Local PostgreSQL regression for 20261021230200 (2026-10-21 — 8069 and 9058 carry most seats at 0 on the Product
// List; a Recost would have costed 15 October lines at RM 0. The user: "0 = 还没定价"). Production's own bodies are
// loaded: member_catalogue as it runs today (sofa-model-names-production.sql, then 20261019140000, 20261019160000 and
// 20261020000000 verbatim — md5 99957d19…), and catalogue_grid_price, catalogue_unit_price and catalogue_sku_for_code
// (the repo's last copies, md5-checked against production's), over stand-ins for the tables they read. The migration
// then runs VERBATIM, twice. What is under test: a cell priced 0 is no price — the run's lookup passes over it (the
// tier fallback goes on; with none the line is Cost pending, no_height) and the Quote is not offered that seat — while
// a priced cell, a blank, a flat figure of 0 and every other answer stay; and what landed is the md5 the file names.
// No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const migration = name => text(new URL(`${name}.sql`, migrations))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
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

const CATALOGUE = 'public.member_catalogue(text[], uuid[], boolean, integer)'
const GRID = 'public.catalogue_grid_price(jsonb, text, text)'
const bodyMd5 = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
const header = sig => q(`SELECT provolatile, prosecdef, proconfig, prolang FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
const M = { soffio: id(1), m8069: id(2) }

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

    -- The tables member_catalogue and the costing read, with production's column types (validate-sofa-model-names.mjs).
    CREATE TABLE public.comm_brands(code text, name text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.erp_product_models(erp_id uuid PRIMARY KEY, erp_company_id bigint NOT NULL DEFAULT 1, model_code text,
      name text, category text, branding text, removed_at timestamptz, allowed_options jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE public.erp_products(vp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_id text UNIQUE, erp_company_id bigint NOT NULL DEFAULT 1,
      item_code text, category text, base_model text, module_code text, size_code text, size_label text, fabric_color text,
      model_erp_id uuid, branding text, description text, removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_skus(erp_product_id text PRIMARY KEY, offered boolean NOT NULL DEFAULT false, price numeric,
      price_grid jsonb, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.catalogue_models(erp_model_id uuid PRIMARY KEY REFERENCES public.erp_product_models(erp_id),
      offered boolean NOT NULL DEFAULT false, enabled jsonb NOT NULL DEFAULT '{}'::jsonb, gift boolean, calc_category text,
      brand_code text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT catalogue_models_calc_category_valid CHECK (calc_category IS NULL OR calc_category = ANY (ARRAY['Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'])),
      CONSTRAINT catalogue_models_enabled_is_object CHECK (jsonb_typeof(enabled) = 'object'));
    CREATE TABLE public.erp_maintenance_options(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, sort_order integer NOT NULL DEFAULT 0,
      removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_option_prices(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, price numeric);
    CREATE TABLE public.catalogue_live_combos(erp_company_id bigint NOT NULL DEFAULT 1, erp_id text, base_model text, modules jsonb,
      slots_key text, tier text, label text, effective_from date, erp_created_at timestamptz, portal boolean);
    CREATE TABLE public.catalogue_combo_prices(erp_company_id bigint NOT NULL DEFAULT 1, base_model text, slots_key text, tier text, price_by_height jsonb);
  `)

  // ── member_catalogue as production runs it today ──
  const production = await text(new URL('./sofa-model-names-production.sql', import.meta.url))
  await db.exec(`SET check_function_bodies = off; ${production} RESET check_function_bodies;`)
  await db.exec(`REVOKE ALL ON FUNCTION ${CATALOGUE} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${CATALOGUE} TO service_role;`)
  for (const name of ['20261019140000_sofa_model_names', '20261019160000_sofa_model_names_in_capitals', '20261020000000_quote_names_a_sofa_by_its_name']) {
    await db.exec(await migration(name))
  }
  check(await bodyMd5(CATALOGUE), '99957d1999e752def202b3d2006ff683', 'member_catalogue is the body production runs on 2026-10-21')

  // ── The costing's cell lookup, as production runs it ──
  const m030 = await migration('20260924030000_catalogue_costs_the_margin')
  const costing = [
    [lastFunction(m030, 'catalogue_sku_for_code'), '6261c6dfd8ef4ac5f3757d338ba310b0'],
    [lastFunction(m030, 'catalogue_grid_price'), '0429a421eecc81194e855f1a87da7344'],
    [lastFunction(m030, 'catalogue_unit_price'), '4238ca41f63872829a2889e85f32989a'],
  ]
  check(costing.map(([f]) => md5(f.body)), costing.map(([, sum]) => sum), "the repo's last copies are production's bodies")
  for (const [f] of costing) await db.exec(f.statement)

  // ── 8069 as the Product List has it: seat 28 priced, 30 and 35 at 0; SOFFIO priced at 30 and 35 ──
  const grid8069 = [{ tier: 'PRICE_1', height: '28', price: 750 }, { tier: 'PRICE_1', height: '30', price: 0 }, { tier: 'PRICE_1', height: '35', price: 0 }]
  const gridSoffio = [{ tier: 'PRICE_1', height: '30', price: 700 }, { tier: 'PRICE_1', height: '35', price: 910 }]
  await q(`INSERT INTO public.comm_brands(code, name) VALUES ('ZANOTTI', 'Zanotti')`)
  await q(`INSERT INTO public.erp_product_models(erp_id, model_code, name, category, branding) VALUES ($1, '8030', 'SOFFIO', 'SOFA', 'ZANOTTI'), ($2, '8069', '8069', 'SOFA', 'ZANOTTI')`, [M.soffio, M.m8069])
  await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code, model_erp_id, branding) VALUES
    ('p-8030', '8030-1A(LHF)', 'SOFA', '8030', '1A(LHF)', $1, 'ZANOTTI'), ('p-8069', '8069-1A(LHF)', 'SOFA', '8069', '1A(LHF)', $2, 'ZANOTTI'),
    ('p-pillow', 'AMN-SOFA PILLOW', 'ACCESSORY', NULL, NULL, NULL, NULL)`, [M.soffio, M.m8069])
  await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price, price_grid) VALUES ('p-8030', true, NULL, $1::jsonb), ('p-8069', true, NULL, $2::jsonb), ('p-pillow', true, 0, NULL)`,
    [JSON.stringify(gridSoffio), JSON.stringify(grid8069)])
  await q(`INSERT INTO public.catalogue_models(erp_model_id, offered, enabled) VALUES ($1, true, '{"sizes": ["30", "35"]}'), ($2, true, '{"sizes": ["28", "30", "35"]}')`, [M.soffio, M.m8069])

  const cell = (grid, height, tier = 'PRICE_2') => one(`SELECT catalogue_grid_price($1::jsonb, $2, $3)`, [JSON.stringify(grid), height, tier])
  const unit = async code => {
    const r = (await q(`SELECT unit_price, how FROM catalogue_unit_price(1, $1, $2, 'PRICE_2')`, [code, '35']))[0]
    return [r.unit_price === null ? null : Number(r.unit_price), r.how]
  }
  const offered = async () => {
    const answer = await one(`SELECT public.member_catalogue(ARRAY['ZANOTTI'], NULL, false, 0)`)
    return Object.fromEntries(answer.products.filter(p => p.kind === 'SOFA').map(p => [p.code, (p.options ?? []).map(o => o.height).sort()]))
  }

  // ── Before: a 0 is a price ──
  check(await cell(grid8069, '35'), '0', "before: 8069's seat 35 costs RM 0")
  check(await unit('8069-1A(LHF)'), [0, 'grid'], '…and the line is costed at it')
  check(await offered(), { '8030-1A(LHF)': ['30', '35'], '8069-1A(LHF)': ['28', '30', '35'] }, '…and the Quote offers those seats')
  const catalogueHeader = await header(CATALOGUE)
  const gridHeader = await header(GRID)

  // ── The migration, twice ──
  const file = await migration('20261021230200_grid_zero_is_no_price')
  await db.exec(file)
  check([await bodyMd5(GRID), await bodyMd5(CATALOGUE)], ['901e210be1edc909178fd18e06f5e67f', '9819dad8f62bb13cd70471dc52df65ef'], 'what landed is the md5 the file names')
  await db.exec(file)
  check([await bodyMd5(GRID), await bodyMd5(CATALOGUE)], ['901e210be1edc909178fd18e06f5e67f', '9819dad8f62bb13cd70471dc52df65ef'], 'a second run changes nothing')
  check([await header(CATALOGUE), await header(GRID)], [catalogueHeader, gridHeader], 'each keeps its language, volatility, rights and settings')
  check([await one(`SELECT has_function_privilege('authenticated', '${CATALOGUE}', 'EXECUTE')`),
    await one(`SELECT has_function_privilege('service_role', '${CATALOGUE}', 'EXECUTE')`)], [false, true], "member_catalogue is still the service role's alone")
  const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = '${GRID}'::regprocedure`)
  check(md5(src.replace(`\n       AND (c->>'price')::NUMERIC > 0`, '')), '0429a421eecc81194e855f1a87da7344', 'the lookup gained the one condition, nothing else moved')

  // ── After: a 0 is no price ──
  check(await cell(grid8069, '35'), null, "8069's seat 35 is no price…")
  check(await unit('8069-1A(LHF)'), [null, 'no_height'], '…so the line is Cost pending, as with a blank')
  check(await cell(grid8069, '28'), '750', 'a priced seat still costs its price')
  check(await cell([{ tier: 'PRICE_1', height: '35', price: 0 }, { tier: 'PRICE_3', height: '35', price: 900 }], '35', 'PRICE_1'), '900',
    'a 0 at the asked tier is passed over: the fallback goes on to a tier priced there')
  check(await cell([{ tier: 'PRICE_2', height: '35', price: '' }], '35'), null, 'a blank is still no price')
  check(await cell(gridSoffio, '35', 'PRICE_2'), '910', "SOFFIO's PRICE_1 still answers a PRICE_2 bill (the module fallback)")
  check(await one(`SELECT unit_price::text FROM catalogue_unit_price(1, 'AMN-SOFA PILLOW', NULL, NULL)`), '0', "a SKU's one flat figure of 0 is unchanged")
  check(await offered(), { '8030-1A(LHF)': ['30', '35'], '8069-1A(LHF)': ['28'] }, 'the Quote is offered a seat only where it is priced above 0')
  const priced = await one(`SELECT public.member_catalogue(ARRAY['ZANOTTI'], NULL, true, 0)`)
  check(priced.products.find(p => p.code === '8069-1A(LHF)').grid.length, 3, "the priced answer still carries the grid as typed; the costing decides what a 0 is")

  console.log(`PASS: ${checks} grid-zero SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)
} finally {
  await db.close()
}
