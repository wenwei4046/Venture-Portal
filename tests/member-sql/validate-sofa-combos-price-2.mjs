// Local PostgreSQL regression for 20261029234700 (2026-10-29 — the user: "help me move all the p1 price sofa in combo
// to p2 as well, last time didnt move togeether"). 20261027230000 moved the sofa grids priced at PRICE_1 alone to
// PRICE_2 and left the four SOFFIO sets — the only combos with a price — at PRICE_1. Production's own bodies are
// loaded, each md5-checked: the run's catalogue_apply_combos (the repo's 20261008040000 copy with the office clock's
// CURRENT_DATE rewrite, then 20261021220000 and 20261021230000 verbatim) with the helpers it calls, and the Quote's
// member_catalogue (sofa-model-names-production.sql, then 20261019140000, 20261019160000, 20261020000000 and
// 20261021230200 verbatim) — over stand-ins for the tables they read, holding SOFFIO's modules and sets exactly as
// production does on 2026-10-29. The migration then runs VERBATIM, twice. What is under test: each live set moves to
// PRICE_2 together with its prices, everything else of it kept; a set already removed, or whose compartments hold
// something at PRICE_2, is left alone; every SOFFIO bill — each set at each tier and seat, and the bills no set takes —
// costs line for line exactly as before; and the Quote is handed the same sets at the same prices, now at PRICE_2.
// No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const migration = name => text(new URL(`${name}.sql`, migrations))
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

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
/** What production runs on 2026-10-29: md5(prosrc) of each body the costing and the Quote call. */
const PRODUCTION = {
  'public.catalogue_apply_combos(uuid)': 'bd856d49e9b677fc9bd7f88f3a3dcd51',
  'public.catalogue_match_slots(text[], jsonb)': 'c93e5bbc2c9d6a7ae714a82bce309c7a',
  'public.catalogue_combos_collide(jsonb, jsonb)': 'b4b63a260b2926ba503799aa7b8f914e',
  'public.catalogue_height_key(text)': 'd15bbca0ff85708427e948c82b4ff675',
  'public.catalogue_sku_for_code(bigint, text)': '6261c6dfd8ef4ac5f3757d338ba310b0',
  'public.catalogue_grid_price(jsonb, text, text)': '901e210be1edc909178fd18e06f5e67f',
  'public.catalogue_unit_price(bigint, text, text, text)': '4238ca41f63872829a2889e85f32989a',
  [CATALOGUE]: '9819dad8f62bb13cd70471dc52df65ef',
}

// ── SOFFIO (8030) as production holds it on 2026-10-29 ──────────────────────
const MODEL = '45b37e53-355c-402d-8524-1b4589da7bed'
const seatGrid = (low, high, low30 = low) => [
  ['24', low], ['26', low], ['28', low], ['30', low30], ['32', high], ['35', high], ['25"', low], ['27"', low], ['29"', 0],
].map(([height, price]) => ({ tier: 'PRICE_2', price, height }))
const consoleGrid = ['24', '28', '30', '32', '35'].flatMap(height => [{ tier: 'PRICE_2', price: 360, height }, { tier: 'PRICE_3', price: 380, height }])
// [erp_id, item code, module, active, grid] — every cell at PRICE_2 since 20261027230000 / 231000.
const MODULES = [
  ['mfg-23702a685c37', '8030-1A(LHF)', '1A(LHF)', true, seatGrid(700, 910)],
  ['mfg-ddfdffda031b', '8030-1A(RHF)', '1A(RHF)', true, seatGrid(700, 910)],
  ['mfg-4312d0202bd0', '8030-2A(LHF)', '2A(LHF)', true, seatGrid(1250, 1670)],
  ['mfg-e7d0c3846762', '8030-1S', '1S', true, seatGrid(874, 1150, 920)],
  ['mfg-d15e6b8bf162', '8030-2S', '2S', true, seatGrid(1254, 1650, 1320)],
  ['mfg-25a05999f0b8', '8030-3S', '3S', true, seatGrid(1752, 2280, 1760)],
  ['mfg-d6803a91b16e', '8030-Console', 'Console', true, consoleGrid],
  ['mfg-f6cb1af0db77', '8030-CONSOLE', 'CONSOLE', false, consoleGrid],
  ['mfg-3490f794be4b', '8030-STOOL', 'STOOL', true, seatGrid(500, 600)],
]
// [id, compartments, label, tier, seat heights, made, removed, prices (null: none — a removed set's went with it)]
const SETS = [
  ['1296bb2d-80fb-4a75-be46-005aa6e89684', [['1A(LHF)', '1A(RHF)'], ['2A(LHF)', '2A(RHF)']], '1A+2A', 'PRICE_2', ['28', '30', '35'],
    '2026-09-23 17:47:05.335241+00', '2026-10-21 06:24:34.138814+00', null],
  ['e2c26125-fc85-432f-9321-e547a21e596e', [['1S'], ['2S'], ['3S']], '1S+2S+3S', 'PRICE_2', ['28', '30', '35'],
    '2026-09-23 17:47:05.335241+00', '2026-10-21 06:31:48.436326+00', null],
  ['21064da5-2423-41b1-ab26-571f58898fcc', [['1A(RHF)'], ['2A(LHF)']], '1A(RHF) + 2A(LHF)', 'PRICE_1', ['24', '26', '28', '30', '35'],
    '2026-10-21 06:30:58.879629+00', null, { 24: 1752, 26: 1752, 28: 1752, 30: 1760, 35: 2280 }],
  ['a8adebac-7d1c-4056-bcc9-f451e1b2539d', [['1S'], ['2S'], ['3S']], '1S + 2S + 3S', 'PRICE_1', ['24', '25"', '26', '27"', '28', '30', '32', '35'],
    '2026-10-21 06:32:22.738627+00', null, { 24: 3880, 26: 3880, 28: 3880, 30: 4000, 32: 5080, 35: 5080, '25"': 3880, '27"': 3880 }],
  ['13d48e86-ba6e-46b9-b867-33231919bf2a', [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']], '1A(LHF) + 1A(RHF) + CONSOLE', 'PRICE_1', ['24', '25"', '26', '28', '30', '35'],
    '2026-10-21 06:35:18.719825+00', null, { 24: 1744, 26: 1744, 28: 1744, 30: 1744, 35: 2140, '25"': 0 }],
  ['aad8c7ba-475d-480d-bf4d-10a4c9656eda', [['1A(LHF)'], ['1A(RHF)']], '1A(LHF) + 1A(RHF)', 'PRICE_1', ['24', '28', '30', '35'],
    '2026-10-21 06:37:19.945915+00', null, { 24: 1324, 28: 1324, 30: 1324, 35: 1720 }],
]
const LIVE = SETS.filter(s => s[6] === null)
const KEYED_BY = id(901)
/** The slots key production generates for a set (erp_combo_slots_key): its slots as written, in order. */
const slotsKey = modules => JSON.stringify(modules).replace(/","/g, '", "').replace(/\],\[/g, '], [')

/** A database holding production's bodies over stand-ins, with SOFFIO as production has it. */
async function soffio() {
  const db = new PGlite()
  const q = async (sql, params = []) => (await db.query(sql, params)).rows
  const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

    -- What member_catalogue and the costing read, with production's column types (validate-grid-zero-is-no-price.mjs).
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
      brand_code text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.erp_maintenance_options(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, sort_order integer NOT NULL DEFAULT 0,
      removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_option_prices(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, price numeric);

    -- The sets as production keeps them (20261008010000): one live set per model, compartments and tier, read through
    -- catalogue_live_combos (production's definition) and priced in catalogue_combo_prices under the same tier.
    CREATE TABLE public.catalogue_combos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_company_id bigint NOT NULL DEFAULT 1,
      erp_id text, base_model text NOT NULL, modules jsonb NOT NULL, slots_key text NOT NULL,
      tier text NOT NULL CHECK (tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3')), label text NOT NULL, heights text[] NOT NULL DEFAULT '{}',
      effective_from date NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz);
    CREATE UNIQUE INDEX catalogue_combos_live_key ON public.catalogue_combos (erp_company_id, base_model, slots_key, tier) WHERE removed_at IS NULL;
    CREATE VIEW public.catalogue_live_combos AS
      SELECT ('portal:'::text || (id)::text) AS erp_id, erp_company_id, base_model, modules, slots_key, tier, label,
             effective_from, created_at AS erp_created_at, true AS portal
        FROM public.catalogue_combos pc WHERE (removed_at IS NULL);
    CREATE TABLE public.catalogue_combo_prices(erp_company_id bigint NOT NULL DEFAULT 1, base_model text NOT NULL, slots_key text NOT NULL,
      tier text NOT NULL DEFAULT '', price_by_height jsonb NOT NULL DEFAULT '{}', updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (erp_company_id, base_model, slots_key, tier),
      CONSTRAINT catalogue_combo_prices_tier_valid CHECK (tier IN ('', 'PRICE_1', 'PRICE_2', 'PRICE_3')));

    -- What catalogue_apply_combos reads and writes of a bill.
    CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, erp_company_id bigint, order_no text NOT NULL, order_date date);
    CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.sales_orders(id), line_no integer NOT NULL,
      product_code text NOT NULL, qty numeric NOT NULL, list_cost_amount numeric, cost_amount numeric, cost_source text, cost_detail jsonb);
  `)

  // ── The Quote's catalogue, as production runs it ──
  const snapshot = await text(new URL('./sofa-model-names-production.sql', import.meta.url))
  await db.exec(`SET check_function_bodies = off; ${snapshot} RESET check_function_bodies;`)
  await db.exec(`REVOKE ALL ON FUNCTION ${CATALOGUE} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${CATALOGUE} TO service_role;`)
  for (const name of ['20261019140000_sofa_model_names', '20261019160000_sofa_model_names_in_capitals', '20261020000000_quote_names_a_sofa_by_its_name']) {
    await db.exec(await migration(name))
  }
  // ── The costing's lookups and the run's combo pass ──
  const m030 = await migration('20260924030000_catalogue_costs_the_margin')
  const m040 = await migration('20261008040000_combo_exact_match')
  for (const f of [lastFunction(m030, 'catalogue_height_key'), lastFunction(m030, 'catalogue_sku_for_code'),
    lastFunction(m030, 'catalogue_match_slots'), lastFunction(m030, 'catalogue_grid_price'), lastFunction(m030, 'catalogue_unit_price'),
    lastFunction(m040, 'catalogue_combos_collide')]) await db.exec(f.statement)
  // The office clock (20261009000000) rewrote catalogue_apply_combos' CURRENT_DATE in place; production runs the result.
  const apply = lastFunction(m040, 'catalogue_apply_combos')
  await db.exec(apply.statement.replace(/\bcurrent_date\b/gi, "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date"))
  for (const name of ['20261021220000_combo_modules_ignore_case', '20261021230000_combo_tier_falls_back', '20261021230200_grid_zero_is_no_price']) {
    await db.exec(await migration(name))
  }

  await q(`INSERT INTO public.comm_brands(code, name) VALUES ('ZANOTTI', 'Zanotti')`)
  await q(`INSERT INTO public.erp_product_models(erp_id, model_code, name, category, branding) VALUES ($1, '8030', 'SOFFIO', 'SOFA', 'ZANOTTI')`, [MODEL])
  await q(`INSERT INTO public.catalogue_models(erp_model_id, offered, enabled) VALUES ($1, true, '{"sizes": ["24", "28", "30", "35"]}')`, [MODEL])
  for (const [erpId, code, module, active, grid] of MODULES) {
    await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code, model_erp_id, branding, active)
             VALUES ($1, $2, 'SOFA', '8030', $3, $4, 'ZANOTTI', $5)`, [erpId, code, module, MODEL, active])
    await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price_grid) VALUES ($1, true, $2::jsonb)`, [erpId, JSON.stringify(grid)])
  }
  for (const [setId, modules, label, tier, heights, made, removed, prices] of SETS) {
    await q(`INSERT INTO public.catalogue_combos(id, base_model, modules, slots_key, tier, label, heights, effective_from, created_at, removed_at)
             VALUES ($1, '8030', $2::jsonb, $3, $4, $5, $6, $7, $8, $9)`,
      [setId, JSON.stringify(modules), slotsKey(modules), tier, label, heights, removed ? '2026-08-09' : '2026-10-01', made, removed])
    if (prices) {
      await q(`INSERT INTO public.catalogue_combo_prices(base_model, slots_key, tier, price_by_height, updated_by, updated_at)
               VALUES ('8030', $1, $2, $3::jsonb, $4, $5)`, [slotsKey(modules), tier, JSON.stringify(prices), KEYED_BY, made])
    }
  }
  return { db, q, one }
}

const { db, q, one } = await soffio()
let guards
try {
  const bodies = Object.keys(PRODUCTION)
  check(await Promise.all(bodies.map(sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])))
    .then(sums => Object.fromEntries(bodies.map((sig, i) => [sig, sums[i]]))), PRODUCTION, "every body loaded is production's")
  check(await one(`SELECT slots_key FROM public.catalogue_combos WHERE id = 'aad8c7ba-475d-480d-bf4d-10a4c9656eda'`), '[["1A(LHF)"], ["1A(RHF)"]]',
    "a set's slots key reads as production's")

  // ── Bills: every set at every tier, at each seat it is priced at, one it is not, and the 25" its 0 does not price ──
  let orders = 0
  const bill = async (codes, { tier = 'PRICE_2', height = '35', date = '2026-10-21', tiers = [] } = {}) => {
    const order = id(++orders)
    await q(`INSERT INTO public.sales_orders(id, erp_company_id, order_no, order_date) VALUES ($1, 1, $2, $3)`, [order, `HC-SO-TEST-${orders}`, date])
    for (const [n, code] of codes.entries()) {
      const lineTier = tiers[n] ?? tier
      // The line's own cost, as the feed leaves it: the Product List's cell at the bill's seat and tier.
      const own = await one(`SELECT unit_price FROM catalogue_unit_price(1, $1, $2, $3)`, [code, height, lineTier])
      await q(`INSERT INTO public.sales_order_lines(id, order_id, line_no, product_code, qty, list_cost_amount, cost_amount, cost_source, cost_detail)
               VALUES ($1, $2, $3, $4, 1, $5, $5, CASE WHEN $5::numeric IS NULL THEN NULL ELSE 'catalogue' END, $6::jsonb)`,
        [id(100000 + orders * 10 + n), order, n, code, own, JSON.stringify({ how: 'grid', tier: lineTier, height })])
    }
    return order
  }
  const PIECES = {
    '1A(RHF) + 2A(LHF)': ['8030-1A(RHF)', '8030-2A(LHF)'],
    '1S + 2S + 3S': ['8030-1S', '8030-2S', '8030-3S'],
    // Bills carry the live console, 8030-Console; the set was made on the inactive CONSOLE (matched ignoring case).
    '1A(LHF) + 1A(RHF) + CONSOLE': ['8030-1A(LHF)', '8030-Console', '8030-1A(RHF)'],
    '1A(LHF) + 1A(RHF)': ['8030-1A(LHF)', '8030-1A(RHF)'],
  }
  const bills = []
  for (const [, , label, , heights] of LIVE) {
    for (const tier of ['PRICE_1', 'PRICE_2', 'PRICE_3']) {
      for (const height of [...new Set([...heights, '32', '29"'])]) bills.push(await bill(PIECES[label], { tier, height }))
    }
  }
  // …and the bills no set takes: a piece more, two tiers on one sofa, a day before the sets count.
  bills.push(await bill([...PIECES['1A(LHF) + 1A(RHF)'], '8030-STOOL']))
  bills.push(await bill(PIECES['1S + 2S + 3S'], { tiers: ['PRICE_1', 'PRICE_2', 'PRICE_2'] }))
  bills.push(await bill(PIECES['1A(RHF) + 2A(LHF)'], { date: '2026-09-30' }))

  const run = async () => {
    let lines = 0
    for (const order of bills) lines += await one(`SELECT catalogue_apply_combos($1)`, [order])
    return lines
  }
  const costs = () => q(`SELECT o.order_no, l.line_no, l.cost_amount::text AS cost, l.cost_source, l.cost_detail
                           FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l.order_id ORDER BY o.order_no, l.line_no`)
  const quote = async () => (await one(`SELECT public.member_catalogue(ARRAY['ZANOTTI'], NULL, true, 0)`)).combos
  const sets = () => q(`SELECT id::text, base_model, modules, slots_key, tier, label, heights, effective_from::text, created_by, created_at::text, removed_at::text
                          FROM public.catalogue_combos ORDER BY created_at, id`)
  const prices = () => q(`SELECT base_model, slots_key, tier, price_by_height, updated_by, updated_at::text FROM public.catalogue_combo_prices ORDER BY slots_key, tier`)

  // ── Before ──
  await run()
  const costsBefore = await costs()
  const taken = costsBefore.filter(r => r.cost_source === 'catalogue_combo')
  check(new Set(taken.map(r => r.cost_detail.combo.label)).size, 4, 'before: each of the four sets costs bills at every tier')
  check([...new Set(taken.map(r => r.cost_detail.combo.tier))].sort(), ['PRICE_1', 'PRICE_2', 'PRICE_3'], '…its PRICE_1 price found from a bill of any tier')
  const soffio35 = costsBefore.filter(r => r.cost_detail?.combo?.label === '1A(LHF) + 1A(RHF) + CONSOLE' && r.cost_detail.combo.height === '35'
    && r.cost_detail.combo.tier === 'PRICE_2')
  check(soffio35.map(r => Number(r.cost)).reduce((a, b) => a + b, 0), 2140, "…SOFFIO's 1A(LHF) + 1A(RHF) + Console at 35 on a PRICE_2 bill: the set's RM 2,140")
  const quoteBefore = await quote()
  check(quoteBefore.map(c => [c.label, c.tier]).sort(), LIVE.map(s => [s[2], 'PRICE_1']).sort(), 'before: the Quote is handed the four sets at PRICE_1')
  const setsBefore = await sets()
  const pricesBefore = await prices()

  // ── The migration, twice ──
  const file = await migration('20261029234700_sofa_combos_typed_at_price_1_are_price_2')
  await db.exec(file)
  const setsAfter = await sets()
  check(setsAfter.map(s => [s.label, s.tier, s.removed_at !== null]),
    SETS.map(([, , label, tier, , , removed]) => [label, removed ? tier : 'PRICE_2', removed !== null]),
    'the four live sets are PRICE_2; the two removed stay as they were')
  check(setsAfter.map(({ tier, ...rest }) => rest), setsBefore.map(({ tier, ...rest }) => rest),
    'nothing else of any set moves: compartments, label, seat heights, effective date, when made')
  const pricesAfter = await prices()
  check(pricesAfter.map(p => p.tier), ['PRICE_2', 'PRICE_2', 'PRICE_2', 'PRICE_2'], "each set's prices moved with it")
  check(pricesAfter.map(({ tier, ...rest }) => rest), pricesBefore.map(({ tier, ...rest }) => rest),
    '…every price as it was, the 0 at 25" too, and who keyed them and when')
  await db.exec(file)
  check([await sets(), await prices()], [setsAfter, pricesAfter], 'a second run changes nothing')

  // ── After: the run and the Quote ──
  check(await run() > 0, true, 'the bills are costed again')
  check(await costs(), costsBefore, 'every bill costs line for line exactly as before — each set at each tier and seat, and the bills no set takes')
  check((await quote()).map(c => ({ ...c, tier: 'PRICE_1' })), quoteBefore, 'the Quote is handed the same sets at the same prices…')
  check((await quote()).map(c => c.tier), ['PRICE_2', 'PRICE_2', 'PRICE_2', 'PRICE_2'], '…now at PRICE_2, the tier its modules are priced at')
  check(await one(`SELECT count(*)::int FROM public.catalogue_live_combos WHERE tier = 'PRICE_1'`), 0, 'no live set is left at PRICE_1')

  // ── Left alone: a set removed since, and a set whose compartments hold something at PRICE_2 ──
  guards = await soffio()
  const g = guards
  // 1A(LHF) + 1A(RHF) removed on Edit prices (catalogue_remove_combos: the row kept, its prices deleted).
  await g.q(`UPDATE public.catalogue_combos SET removed_at = now() WHERE id = 'aad8c7ba-475d-480d-bf4d-10a4c9656eda'`)
  await g.q(`DELETE FROM public.catalogue_combo_prices WHERE slots_key = '[["1A(LHF)"], ["1A(RHF)"]]'`)
  // 1S + 2S + 3S given a live PRICE_2 set of its own since; 1A(RHF) + 2A(LHF) a PRICE_2 price under its compartments.
  await g.q(`INSERT INTO public.catalogue_combos(base_model, modules, slots_key, tier, label, effective_from) VALUES ('8030', '[["1S"], ["2S"], ["3S"]]', '[["1S"], ["2S"], ["3S"]]', 'PRICE_2', '1S + 2S + 3S', '2026-10-29')`)
  await g.q(`INSERT INTO public.catalogue_combo_prices(base_model, slots_key, tier, price_by_height) VALUES ('8030', '[["1A(RHF)"], ["2A(LHF)"]]', 'PRICE_2', '{"35": 2200}')`)
  await g.db.exec(file)
  check(await g.q(`SELECT label, tier, removed_at IS NOT NULL AS removed FROM public.catalogue_combos WHERE id IN
      ('aad8c7ba-475d-480d-bf4d-10a4c9656eda', 'a8adebac-7d1c-4056-bcc9-f451e1b2539d', '21064da5-2423-41b1-ab26-571f58898fcc', '13d48e86-ba6e-46b9-b867-33231919bf2a') ORDER BY created_at`),
    [{ label: '1A(RHF) + 2A(LHF)', tier: 'PRICE_1', removed: false }, { label: '1S + 2S + 3S', tier: 'PRICE_1', removed: false },
      { label: '1A(LHF) + 1A(RHF) + CONSOLE', tier: 'PRICE_2', removed: false }, { label: '1A(LHF) + 1A(RHF)', tier: 'PRICE_1', removed: true }],
    'a removed set stays as it is; a set whose compartments hold a live PRICE_2 set or a PRICE_2 price stays at PRICE_1; the others move')
  check(await g.q(`SELECT slots_key, tier, price_by_height FROM public.catalogue_combo_prices ORDER BY slots_key, tier`), [
    { slots_key: '[["1A(LHF)"], ["1A(RHF)"], ["CONSOLE"]]', tier: 'PRICE_2', price_by_height: { 24: 1744, 26: 1744, 28: 1744, 30: 1744, 35: 2140, '25"': 0 } },
    { slots_key: '[["1A(RHF)"], ["2A(LHF)"]]', tier: 'PRICE_1', price_by_height: { 24: 1752, 26: 1752, 28: 1752, 30: 1760, 35: 2280 } },
    { slots_key: '[["1A(RHF)"], ["2A(LHF)"]]', tier: 'PRICE_2', price_by_height: { 35: 2200 } },
    { slots_key: '[["1S"], ["2S"], ["3S"]]', tier: 'PRICE_1', price_by_height: { 24: 3880, 26: 3880, 28: 3880, 30: 4000, 32: 5080, 35: 5080, '25"': 3880, '27"': 3880 } },
  ], '…and a set left alone keeps its prices where they were: a set and its prices never part')

  console.log(`PASS: ${checks} sofa-combos-price-2 SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)
} finally {
  await db.close()
  await guards?.db.close()
}
