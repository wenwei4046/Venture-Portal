// Local PostgreSQL regression for 20261027230000 (2026-10-27 — the user, told that the ERP bills nearly every sofa at
// PRICE_2 while 148 sofa grids on SKU Master were priced at PRICE_1 alone: "help move change the p1 to p2, in venture,
// taht is actaully p2 price, fill wrong"). Production's costing lookup is loaded — catalogue_height_key,
// catalogue_sku_for_code and catalogue_unit_price as the repo's 20260924030000 copies, catalogue_grid_price with
// 20261021230200's one condition, each md5-checked against production's — over stand-ins for the tables it reads. The
// migration then runs VERBATIM, twice. What is under test: a named grid priced at PRICE_1 alone moves to PRICE_2 cell
// for cell (seat, price and order kept, a 0 still no price), and costs every tier of bill exactly as before; a ladder
// with another tier, a Console priced at both tiers, and a named grid that has gained another tier are left alone.
// No live I/O.
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

const at = (tier, price, height) => ({ tier, price, height })
// 8030-1A(LHF) as keyed on SKU Master: PRICE_1 alone, 0 at the inch-marked seats.
const SOFFIO = ['mfg-23702a685c37', '8030-1A(LHF)', '8030', [
  at('PRICE_1', 700, '24'), at('PRICE_1', 0, '25"'), at('PRICE_1', 700, '26'), at('PRICE_1', 0, '27"'),
  at('PRICE_1', 700, '28'), at('PRICE_1', 700, '30'), at('PRICE_1', 910, '32'), at('PRICE_1', 910, '35'),
]]
// 8211-4FT after 20261026021000: its one price at DEFAULT, PRICE_1.
const MODENA = ['mfg-79cb847d88f9', '8211-4FT', '8211', [at('PRICE_1', 720, 'DEFAULT')]]
// A ladder the migration does not name: P1 < P2 < P3 at seat 28.
const LADDER = ['mfg-test-8039-1a', '8039-1A(LHF)', '8039', [at('PRICE_1', 750, '28'), at('PRICE_2', 800, '28'), at('PRICE_3', 850, '28')]]
// A Console priced at both tiers, not named: the user's to settle.
const CONSOLE = ['mfg-test-8030-console', '8030-Console', '8030', [
  at('PRICE_1', 700, '24'), at('PRICE_2', 360, '24'), at('PRICE_3', 380, '24'), at('PRICE_1', 700, '26'),
]]
// Named, but it has gained a PRICE_2 cell since the list was taken: left alone.
const GAINED = ['mfg-ec74f79164ca', '9058-1A(LHF)', '9058', [at('PRICE_1', 860, '30'), at('PRICE_2', 900, '32')]]
const SKUS = [SOFFIO, MODENA, LADDER, CONSOLE, GAINED]

try {
  await db.exec(`
    CREATE TABLE public.erp_products(vp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_id text UNIQUE, erp_company_id bigint NOT NULL DEFAULT 1,
      item_code text, category text, base_model text, module_code text, removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_skus(erp_product_id text PRIMARY KEY, offered boolean NOT NULL DEFAULT false, price numeric,
      price_grid jsonb, updated_at timestamptz NOT NULL DEFAULT now());
  `)

  // ── The costing's lookup, as production runs it on 2026-10-27 ──
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

  for (const [erpId, code, model, cells] of SKUS) {
    await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code) VALUES ($1, $2, 'SOFA', $3, $4)`,
      [erpId, code, model, code.slice(model.length + 1)])
    await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price_grid) VALUES ($1, true, $2::jsonb)`, [erpId, JSON.stringify(cells)])
  }

  const cost = async (code, seat, tier) => {
    const r = (await q(`SELECT unit_price, how FROM catalogue_unit_price(1, $1, $2, $3)`, [code, seat, tier]))[0]
    return [r.unit_price === null ? null : Number(r.unit_price), r.how]
  }
  const gridOf = erpId => one(`SELECT price_grid FROM public.catalogue_skus WHERE erp_product_id = $1`, [erpId])
  const grids = () => Promise.all(SKUS.map(([erpId]) => gridOf(erpId)))
  // Every bill a sofa can carry: each tier at each seat the grids name, and a seat they do not.
  const bills = async () => {
    const out = []
    for (const [, code, , cells] of SKUS) {
      for (const seat of [...new Set(cells.map(c => c.height)), '29"']) {
        for (const tier of ['PRICE_1', 'PRICE_2', 'PRICE_3']) out.push([code, seat, tier, ...(await cost(code, seat, tier))])
      }
    }
    return out
  }

  // ── Before ──
  check(await cost('8030-1A(LHF)', '28', 'PRICE_2'), [700, 'grid'], 'before: a PRICE_2 bill falls back to the PRICE_1 figure')
  const before = await bills()

  // ── The migration, twice ──
  const file = await migration('20261027230000_sofa_prices_typed_at_price_1_are_price_2')
  await db.exec(file)
  const moved = await grids()
  check(moved[0], SOFFIO[3].map(c => ({ ...c, tier: 'PRICE_2' })), 'a named grid priced at PRICE_1 alone moves to PRICE_2, seat, price and order kept, its 0s too')
  check(moved[1], [at('PRICE_2', 720, 'DEFAULT')], "8211's one DEFAULT price moves with it")
  check(moved[2], LADDER[3], 'a ladder with another tier is left as it is')
  check(moved[3], CONSOLE[3], 'a Console priced at both tiers is left as it is')
  check(moved[4], GAINED[3], 'a named grid that has gained another tier since is left as it is')
  await db.exec(file)
  check(await grids(), moved, 'a second run changes nothing')

  // ── After: every bill costs what it did ──
  check(await bills(), before, 'every tier of bill at every seat costs exactly as before')
  check(await cost('8030-1A(LHF)', '28', 'PRICE_2'), [700, 'grid'], 'a PRICE_2 bill now reads its own tier')
  check(await cost('8030-1A(LHF)', '28', 'PRICE_1'), [700, 'grid'], 'a PRICE_1 bill falls back to PRICE_2')
  check(await cost('8030-1A(LHF)', '25"', 'PRICE_2'), [null, 'no_height'], 'a 0 is still no price')
  check(await cost('8211-4FT', 'DEFAULT', 'PRICE_2'), [720, 'grid'], '8211 at DEFAULT')
  check(await cost('8039-1A(LHF)', '28', 'PRICE_2'), [800, 'grid'], "the ladder's PRICE_2 is its own")

  console.log(`PASS: ${checks} sofa-prices-price-2 SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)
} finally {
  await db.close()
}
