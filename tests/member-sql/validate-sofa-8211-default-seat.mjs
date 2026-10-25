// Local PostgreSQL regression for 20261026021000 (2026-10-25 — 8211 MODENA: the ERP sells it at one seat, DEFAULT, but
// its prices sat under the seats 24 – 35 on SKU Master, so not one of its bills was ever costed; the user: "ok, can do
// 1 and 2"). Production's costing lookup is loaded — catalogue_height_key, catalogue_sku_for_code and
// catalogue_unit_price as the repo's 20260924030000 copies, catalogue_grid_price with 20261021230200's one condition,
// each md5-checked against production's — over stand-ins for the tables it reads, holding 8211's four SKUs as
// production does on 2026-10-25. The migration then runs VERBATIM, twice. What is under test: each SKU's one price
// becomes its one DEFAULT cell (5FT, priced at none, keeps no grid); a bill at SEAT DEFAULT and a bill naming no seat
// both cost it; a sofa the migration does not name, and a grid typed since, are left as they are. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
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

/** 8211's grid as typed on SKU Master: one figure at each of 24 – 35, 0 at the inch-marked seats. */
const typed = price => [
  ...['24', '26', '28', '30', '32', '35'].map(height => ({ tier: 'PRICE_1', price, height })),
  ...['25"', '27"', '29"'].map(height => ({ tier: 'PRICE_1', price: 0, height })),
]
// catalogue_skus on production, 2026-10-25.
const SKUS = [
  ['mfg-79cb847d88f9', '8211-4FT', '4FT', typed(720)],
  ['mfg-9cc48b8822c5', '8211-5FT', '5FT', typed(0)],
  ['mfg-ee9bb4027287', '8211-6FT', '6FT', typed(1080)],
  ['mfg-11a4ab5b48b7', '8211-7FT', '7FT', typed(1260)],
]
const SOFFIO = ['mfg-23702a685c37', '8030-1A(LHF)', [
  ...['24', '26', '28', '30'].map(height => ({ tier: 'PRICE_1', price: 700, height })),
  { tier: 'PRICE_1', price: 910, height: '32' }, { tier: 'PRICE_1', price: 910, height: '35' },
]]

try {
  await db.exec(`
    CREATE TABLE public.erp_products(vp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_id text UNIQUE, erp_company_id bigint NOT NULL DEFAULT 1,
      item_code text, category text, base_model text, module_code text, removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_skus(erp_product_id text PRIMARY KEY, offered boolean NOT NULL DEFAULT false, price numeric,
      price_grid jsonb, updated_at timestamptz NOT NULL DEFAULT now());
  `)

  // ── The costing's lookup, as production runs it on 2026-10-25 ──
  const m030 = await migration('20260924030000_catalogue_costs_the_margin')
  const key = lastFunction(m030, 'catalogue_height_key')
  const sku = lastFunction(m030, 'catalogue_sku_for_code')
  const unit = lastFunction(m030, 'catalogue_unit_price')
  const grid0 = lastFunction(m030, 'catalogue_grid_price')
  // 20261021230200 swapped one statement into it: a cell priced 0 is no price.
  const anchor = "\n       AND (c->>'price') ~ '^\\d+(\\.\\d+)?$'"
  const zero = "\n       AND (c->>'price')::NUMERIC > 0"
  assert(grid0.body.includes(anchor), 'the grid lookup still reads a figure as it did')
  // A function, not a string: the anchor ends in `$'`, which a replacement string reads as "the rest of the text".
  const swap = s => s.replace(anchor, () => anchor + zero)
  const grid = { statement: swap(grid0.statement), body: swap(grid0.body) }
  const costing = [key, sku, grid, unit]
  check(costing.map(f => md5(f.body)),
    ['d15bbca0ff85708427e948c82b4ff675', '6261c6dfd8ef4ac5f3757d338ba310b0', '901e210be1edc909178fd18e06f5e67f', '4238ca41f63872829a2889e85f32989a'],
    "the bodies are production's")
  for (const f of costing) await db.exec(f.statement)

  for (const [erpId, code, module, cells] of SKUS) {
    await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code) VALUES ($1, $2, 'SOFA', '8211', $3)`, [erpId, code, module])
    await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price_grid) VALUES ($1, $2, $3::jsonb)`, [erpId, code !== '8211-5FT', JSON.stringify(cells)])
  }
  await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code) VALUES ($1, $2, 'SOFA', '8030', '1A(LHF)')`, SOFFIO.slice(0, 2))
  await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price_grid) VALUES ($1, true, $2::jsonb)`, [SOFFIO[0], JSON.stringify(SOFFIO[2])])

  // A bill's line: always PRICE_2, as every sofa bill arrives (the ERP's fabric list).
  const cost = async (code, seat) => {
    const r = (await q(`SELECT unit_price, how FROM catalogue_unit_price(1, $1, $2, 'PRICE_2')`, [code, seat]))[0]
    return [r.unit_price === null ? null : Number(r.unit_price), r.how]
  }
  const gridOf = erpId => one(`SELECT price_grid FROM public.catalogue_skus WHERE erp_product_id = $1`, [erpId])
  const grids = () => Promise.all(SKUS.map(([erpId]) => gridOf(erpId)))

  // ── Before: the price waits at seats 8211 is never sold at ──
  check(await cost('8211-6FT', 'DEFAULT'), [null, 'no_height'], 'before: a bill at SEAT DEFAULT is Cost pending')
  check(await cost('8211-6FT', null), [null, 'no_height'], '…and so is a bill naming no seat')
  check(await cost('8211-6FT', '28'), [1080, 'grid'], '…while 28, a seat no 8211 bill names, has the price')

  // ── The migration, twice ──
  const file = await migration('20261026021000_sofa_8211_priced_at_default')
  await db.exec(file)
  const moved = await grids()
  check(moved, [
    [{ height: 'DEFAULT', tier: 'PRICE_1', price: 720 }],
    null,
    [{ height: 'DEFAULT', tier: 'PRICE_1', price: 1080 }],
    [{ height: 'DEFAULT', tier: 'PRICE_1', price: 1260 }],
  ], 'each SKU keeps its one price at DEFAULT alone, at the tier it was typed at; 5FT, priced at none, keeps no grid')
  await db.exec(file)
  check(await grids(), moved, 'a second run changes nothing')
  check(await gridOf(SOFFIO[0]), SOFFIO[2], 'a sofa the migration does not name keeps its grid as typed')

  // ── After: both kinds of 8211 bill cost it ──
  check(await cost('8211-6FT', 'DEFAULT'), [1080, 'grid'], 'a bill at SEAT DEFAULT costs 6FT its price — PRICE_2 falls back to PRICE_1')
  check(await cost('8211-6FT', null), [1080, 'grid'], 'a bill naming no seat reads the one seat there is')
  check(await cost('8211-4FT', 'default'), [720, 'grid'], "the bill's spelling of DEFAULT folds")
  check(await cost('8211-7FT', '  '), [1260, 'grid'], 'a blank seat is no seat')
  check(await cost('8211-6FT', '28'), [null, 'no_height'], 'a seat 8211 is never sold at no longer has a price')
  check(await cost('8211-5FT', 'DEFAULT'), [null, 'unpriced'], '5FT, which had a 0 at every seat, is unpriced')
  check(await cost('8030-1A(LHF)', null), [null, 'no_height'], 'SOFFIO, priced at six seats, still needs the bill to name one')
  check(await cost('8030-1A(LHF)', '35'), [910, 'grid'], '…and costs the seat it names')

  // ── A grid typed since 2026-10-25 is left alone ──
  const since = [
    ['mfg-79cb847d88f9', typed(720).map(c => (c.height === '35' ? { ...c, price: 750 } : c))],   // two prices
    ['mfg-9cc48b8822c5', [{ tier: 'PRICE_1', price: 'call', height: '24' }]],                     // a word, not a figure
    ['mfg-ee9bb4027287', [...typed(1080), { tier: 'PRICE_2', price: 1100, height: '30' }]],       // a second tier
    ['mfg-11a4ab5b48b7', [...typed(1260), { tier: 'PRICE_1', price: 1260, height: 'Default' }]],  // DEFAULT priced already
  ]
  for (const [erpId, cells] of since) await q(`UPDATE public.catalogue_skus SET price_grid = $2::jsonb WHERE erp_product_id = $1`, [erpId, JSON.stringify(cells)])
  await db.exec(file)
  check(await grids(), since.map(([, cells]) => cells), 'two prices, a word, a second tier or a DEFAULT already there: nothing moves')

  console.log(`PASS: ${checks} 8211-default-seat SQL checks. Production's bodies verbatim; the migration verbatim, three times. No live database connection.`)
} finally {
  await db.close()
}
