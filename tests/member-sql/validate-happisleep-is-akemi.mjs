// Local PostgreSQL regression for 20261031200000 (2026-10-31 — the user: "i need akemi calculater in revenue app, is
// including with happisleep … happisleep is the subbrand of akemi, so the shena for magrin leader is same as well";
// "i dont differentiate it out with 2 calcualtor, i wnat make them into one"). The ERP brands EASE COOL and FRESH COOL
// HAPPI SLEEP, a word no portal brand is called by, so the two sold in no calculator and a bill written under it would
// carry no brand. Production's own bodies are loaded: member_catalogue as it runs today (sofa-model-names-production.sql,
// then the migrations that reshaped it, verbatim — md5 6476f6f1…), erp_sync_brand_code and catalogue_brand_of with it,
// and erp_sync_order_brand, sales_order_lines_brand and erp_sync_brand_by_prefix (the repo's last copies, md5-checked
// against production's), over stand-ins for the tables they read. The migration then runs VERBATIM, twice. What is under
// test: HAPPI SLEEP names Akemi wherever an ERP brand word is read — the Quote's catalogue (Akemi's calculator sells
// EASE COOL and FRESH COOL, under AKEMI), a bill's own brand, its lines' — while every other word answers as before, a
// brand's own code or name beats another's sub-brand, an inactive brand answers nothing, a rider stays a rider; and
// what landed is the md5 the file names. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const migration = name => text(new URL(`${name}.sql`, migrations))
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const CATALOGUE = 'public.member_catalogue(text[], uuid[], boolean, integer)'
const BRAND = 'public.erp_sync_brand_code(text)'
const PROD = { brand: '285ce8ea21feef12b5250ac6be4ba6af', catalogue: '6476f6f1fe5d51e13304562780b11d60' }
const M = {
  apex: '10000000-0000-4000-8000-000000000001',
  ease: '10000000-0000-4000-8000-000000000002',
  fresh: '10000000-0000-4000-8000-000000000003',
  latex: '10000000-0000-4000-8000-000000000004',
  frame: '10000000-0000-4000-8000-000000000005',
  soffio: '10000000-0000-4000-8000-000000000006',
}
const ORDER = '20000000-0000-4000-8000-000000000001'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

  -- What member_catalogue reads, with production's column types (validate-quote-fabric-upgrades.mjs).
  CREATE TABLE public.comm_brands(code text NOT NULL, name text NOT NULL, item_code_prefixes text[] NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
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
  CREATE TABLE public.catalogue_option_prices(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, price numeric,
    by_quantity boolean NOT NULL DEFAULT false);
  CREATE TABLE public.catalogue_combos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_company_id bigint NOT NULL DEFAULT 1,
    erp_id text, base_model text NOT NULL, modules jsonb NOT NULL, slots_key text NOT NULL, tier text NOT NULL, label text NOT NULL,
    heights text[] NOT NULL DEFAULT '{}', effective_from date NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz);
  CREATE VIEW public.catalogue_live_combos AS
    SELECT ('portal:'::text || (id)::text) AS erp_id, erp_company_id, base_model, modules, slots_key, tier, label,
           effective_from, created_at AS erp_created_at, true AS portal
      FROM public.catalogue_combos pc WHERE (removed_at IS NULL);
  CREATE TABLE public.catalogue_combo_prices(erp_company_id bigint NOT NULL DEFAULT 1, base_model text NOT NULL, slots_key text NOT NULL,
    tier text NOT NULL DEFAULT '', price_by_height jsonb NOT NULL DEFAULT '{}', updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.catalogue_fabric_upgrades(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_company_id bigint NOT NULL DEFAULT 1,
    category text NOT NULL CHECK (category IN ('SOFA', 'BEDFRAME')), name text NOT NULL, price numeric(15,2) NOT NULL CHECK (price > 0));

  -- What a bill's brand is read from (erp_sync_order_brand, sales_order_lines_brand) and the costing's combo pass writes.
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, erp_company_id bigint, order_no text NOT NULL, order_date date);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.sales_orders(id),
    line_no integer NOT NULL, product_code text NOT NULL, qty numeric NOT NULL DEFAULT 1, line_amount numeric NOT NULL DEFAULT 0,
    raw jsonb, list_cost_amount numeric, cost_amount numeric, cost_source text, cost_detail jsonb);
  CREATE TABLE public.sales_order_brand_picks(order_id uuid PRIMARY KEY, brand_code text NOT NULL);
`)

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
const header = sig => q(`SELECT provolatile, prosecdef, proconfig, prolang FROM pg_proc WHERE oid = $1::regprocedure`, [sig])

// ── The Quote's catalogue, as production runs it (validate-quote-fabric-upgrades.mjs, then that migration) ──
const snapshot = await text(new URL('./sofa-model-names-production.sql', import.meta.url))
await db.exec(`SET check_function_bodies = off; ${snapshot} RESET check_function_bodies;`)
await db.exec(`REVOKE ALL ON FUNCTION ${CATALOGUE} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${CATALOGUE} TO service_role;`)
for (const name of ['20261019140000_sofa_model_names', '20261019160000_sofa_model_names_in_capitals', '20261020000000_quote_names_a_sofa_by_its_name']) {
  await db.exec(await migration(name))
}
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m040 = await migration('20261008040000_combo_exact_match')
for (const f of ['catalogue_height_key', 'catalogue_sku_for_code', 'catalogue_match_slots', 'catalogue_grid_price', 'catalogue_unit_price']) {
  await db.exec(lastFunction(m030, f).statement)
}
await db.exec(lastFunction(m040, 'catalogue_combos_collide').statement)
await db.exec(lastFunction(m040, 'catalogue_apply_combos').statement.replace(/\bcurrent_date\b/gi, "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date"))
for (const name of ['20261021220000_combo_modules_ignore_case', '20261021230000_combo_tier_falls_back', '20261021230200_grid_zero_is_no_price',
  '20261030030000_quote_fabric_upgrades']) {
  await db.exec(await migration(name))
}
check([await bodyMd5(CATALOGUE), await bodyMd5(BRAND)], [PROD.catalogue, PROD.brand], 'member_catalogue and erp_sync_brand_code as production runs them on 2026-10-31')

// ── A bill's brand, as production reads it ──
const m905 = await migration('20260905010000_erp_live_sync')
const m927 = await migration('20260927080000_the_bill_says_its_brand')
const bills = [
  [lastFunction(m905, 'erp_sync_brand_by_prefix'), 'a8995c8d20055f2924a8a17f82a1a717'],
  [lastFunction(m927, 'erp_sync_order_brand'), 'd0cb32176b535e5fa6927ac0e224ec5a'],
  [lastFunction(m927, 'sales_order_lines_brand'), '474ea3dc952541d61e8215473eb5550d'],
]
check(bills.map(([f]) => md5(f.body)), bills.map(([, sum]) => sum), "the repo's last copies are production's bodies")
for (const [f] of bills) await db.exec(f.statement)

// ── The brands as production holds them, and the catalogue the ERP sends ──
await q(`INSERT INTO public.comm_brands(code, name, item_code_prefixes, created_at) VALUES
           ('AKEMI', 'Akemi', '{AK-,AKE}', '2026-08-31 09:56:37+00'), ('ZANOTTI', 'Zanotti', '{}', '2026-08-31 09:56:37+00'),
           ('ERGOTEX', 'Ergotex', '{}', '2026-08-31 09:56:37+00'), ('DUNLOP', 'Dunlopillo', '{}', '2026-09-02 16:13:43+00')`)
await q(`INSERT INTO public.erp_product_models(erp_id, model_code, name, category, branding) VALUES
           ($1, 'APEX', 'APEX', 'MATTRESS', 'AKEMI'), ($2, 'EASE COOL', 'EASE COOL', 'MATTRESS', 'HAPPI SLEEP'),
           ($3, 'FRESH COOL', 'FRESH COOL', 'MATTRESS', NULL), ($4, 'MYLATEX LUXE', 'MYLATEX LUXE', 'MATTRESS', 'MYLATEX'),
           ($5, 'BF01', 'ARIA', 'BEDFRAME', 'HAPPI SLEEP'), ($6, '8030', 'SOFFIO', 'SOFA', 'ZANOTTI')`,
  [M.apex, M.ease, M.fresh, M.latex, M.frame, M.soffio])
await q(`INSERT INTO public.catalogue_models(erp_model_id, offered) SELECT erp_id, true FROM public.erp_product_models`)
// FRESH COOL's model names no brand: its SKUs' HAPPI SLEEP is the fallback catalogue_brand_of reads.
await q(`INSERT INTO public.erp_products(erp_id, item_code, category, size_code, model_erp_id, branding, base_model, module_code) VALUES
           ('mfg-apex-q', 'APEX MATT (Q)', 'MATTRESS', 'Q', $1, 'AKEMI', NULL, NULL),
           ('mfg-ease-q', 'HAPPI SLEEP EASE COOL MATT (Q)', 'MATTRESS', 'Q', $2, 'HAPPI SLEEP', NULL, NULL),
           ('mfg-ease-k', 'HAPPI SLEEP EASE COOL MATT (K)', 'MATTRESS', 'K', $2, 'HAPPI SLEEP', NULL, NULL),
           ('mfg-fresh-q', 'HAPPI SLEEP FRESH COOL MATT (Q)', 'MATTRESS', 'Q', $3, 'HAPPI SLEEP', NULL, NULL),
           ('mfg-latex-k', 'MYLATEX LUXE MATT (K)', 'MATTRESS', 'K', $4, 'MYLATEX', NULL, NULL),
           ('mfg-bf-q', 'BF01-(Q)', 'BEDFRAME', 'Q', $5, 'HAPPI SLEEP', 'BF01', NULL),
           ('mfg-1na', '8030-1NA', 'SOFA', NULL, $6, 'ZANOTTI', '8030', '1NA')`,
  [M.apex, M.ease, M.fresh, M.latex, M.frame, M.soffio])
await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price, price_grid) VALUES
           ('mfg-apex-q', true, 1500, NULL), ('mfg-ease-q', true, 930, NULL), ('mfg-ease-k', true, 1100, NULL),
           ('mfg-fresh-q', true, 930, NULL), ('mfg-latex-k', true, 800, NULL), ('mfg-bf-q', true, 600, NULL),
           ('mfg-1na', true, NULL, '[{"tier": "PRICE_2", "price": 900, "height": "35"}]')`)
await q(`UPDATE public.catalogue_models SET enabled = '{"sizes": ["35"]}' WHERE erp_model_id = $1`, [M.soffio])
await q(`INSERT INTO public.erp_maintenance_options(pool, value) VALUES ('sofa_sizes', '35')`)

// A bill the ERP writes under HAPPI SLEEP: its header, its lines.
await q(`INSERT INTO public.sales_orders(id, erp_company_id, order_no, order_date) VALUES ($1, 1, 'HC-SO-TEST-001', '2026-11-01')`, [ORDER])
await q(`INSERT INTO public.sales_order_lines(order_id, line_no, product_code, line_amount, raw) VALUES
           ($1, 1, 'HAPPI SLEEP EASE COOL MATT (Q)', 2500, '{"brand": "HAPPI SLEEP"}'),
           ($1, 2, 'BF01-(Q)', 0, '{"brand": "BEDFRAME"}')`, [ORDER])

const brandOf = word => one(`SELECT public.erp_sync_brand_code($1)`, [word])
const WORDS = ['AKEMI', 'Akemi', ' akemi ', 'ZANOTTI', 'Dunlopillo', 'DUNLOPILLO', 'DUNLOP', 'ERGOTEX', 'MYLATEX', 'BEDFRAME',
  'SERVICE', 'NONE', 'HAPPISLEEP', 'HAPPY SLEEP', '', '   ', null]
const everyOtherWord = async () => Promise.all(WORDS.map(brandOf))
const catalogue = async (brands, priced = false) => one(`SELECT public.member_catalogue($1::text[], NULL, $2, 0)`, [brands, priced])
const sold = async brands => (await catalogue(brands)).products.map(p => `${p.code} · ${p.brand ?? 'rider'} · ${p.category}`).sort()
const orderBrand = order => one(`SELECT public.erp_sync_order_brand($1::jsonb, $2)`, [JSON.stringify(order), ORDER])

// ── Before: HAPPI SLEEP is no brand ──
check(await brandOf('HAPPI SLEEP'), null, 'before: HAPPI SLEEP names no brand')
check(await one(`SELECT public.catalogue_brand_of('MATTRESS', 'HAPPI SLEEP', 'HAPPI SLEEP')`), null, '…so a HAPPI SLEEP mattress sells under none')
check(await sold(['AKEMI']), ['APEX MATT (Q) · AKEMI · Mattress', 'BF01-(Q) · rider · Bed frame'],
  "…and Akemi's calculator has APEX and the riders, no EASE COOL, no FRESH COOL")
check(await orderBrand({ brand: 'HAPPI SLEEP' }), null, '…a bill written under HAPPI SLEEP has no brand of its own')
check(await one(`SELECT public.sales_order_lines_brand($1)`, [ORDER]), null, '…nor do its lines give it one')
const wordsBefore = await everyOtherWord()
check(wordsBefore.slice(0, 8), ['AKEMI', 'AKEMI', 'AKEMI', 'ZANOTTI', 'DUNLOP', 'DUNLOP', 'DUNLOP', 'ERGOTEX'], 'a brand by its code or its name')
const ladders = {
  zanotti: await catalogue(['ZANOTTI'], true),
  everything: await catalogue(['AKEMI', 'ZANOTTI', 'ERGOTEX', 'DUNLOP'], true),
}
const brandHeader = await header(BRAND)

// ── The migration, twice ──
const file = await migration('20261031200000_happisleep_sells_as_akemi')
const named = /v_md5 <> '([0-9a-f]{32})'/.exec(file)?.[1]
check(file.includes(`NOT IN ('${PROD.brand}', '${named}')`), true, "the file was written from production's body")
await db.exec(file)
check(await bodyMd5(BRAND), named, 'what landed is the md5 the file names')
await db.exec(file)
check(await bodyMd5(BRAND), named, 'a second run changes nothing')
check(await q(`SELECT code, sub_brands FROM public.comm_brands ORDER BY created_at, code`), [
  { code: 'AKEMI', sub_brands: ['HAPPI SLEEP'] }, { code: 'ERGOTEX', sub_brands: [] },
  { code: 'ZANOTTI', sub_brands: [] }, { code: 'DUNLOP', sub_brands: [] },
], "Akemi's sub-brand is HAPPI SLEEP, once; no other brand has one")
check(await header(BRAND), brandHeader, 'erp_sync_brand_code keeps its language, volatility, rights and settings')

// ── After: HAPPI SLEEP is Akemi ──
check(await brandOf('HAPPI SLEEP'), 'AKEMI', 'HAPPI SLEEP names Akemi')
check(await brandOf('  happi sleep '), 'AKEMI', '…whatever its case and spaces')
check(await everyOtherWord(), wordsBefore, 'every other word answers as before')
check(await one(`SELECT public.catalogue_brand_of('MATTRESS', 'HAPPI SLEEP', 'HAPPI SLEEP')`), 'AKEMI', 'a HAPPI SLEEP mattress sells under Akemi')
check(await one(`SELECT public.catalogue_brand_of('MATTRESS', NULL, 'HAPPI SLEEP')`), 'AKEMI', '…its SKUs saying so when its model does not')
check(await one(`SELECT public.catalogue_brand_of('BEDFRAME', 'HAPPI SLEEP', 'HAPPI SLEEP')`), null, 'a bed frame stays a rider, whatever its branding')
check(await sold(['AKEMI']), [
  'APEX MATT (Q) · AKEMI · Mattress', 'BF01-(Q) · rider · Bed frame',
  'HAPPI SLEEP EASE COOL MATT (K) · AKEMI · Mattress', 'HAPPI SLEEP EASE COOL MATT (Q) · AKEMI · Mattress',
  'HAPPI SLEEP FRESH COOL MATT (Q) · AKEMI · Mattress',
], "Akemi's calculator sells EASE COOL and FRESH COOL, under AKEMI — one calculator")
check((await catalogue(['AKEMI'], true)).products.filter(p => p.name === 'EASE COOL').map(p => [p.size, Number(p.price)]),
  [['King', 1100], ['Queen', 930]], '…priced as the Product List prices them')
check(await catalogue(['ZANOTTI'], true), ladders.zanotti, "no other brand's calculator moves")
const everything = await catalogue(['AKEMI', 'ZANOTTI', 'ERGOTEX', 'DUNLOP'], true)
check(everything.products.filter(p => !p.code.startsWith('HAPPI SLEEP ')), ladders.everything.products,
  '…and every product sold before is sold as it was')
check((await sold(['AKEMI'])).some(p => p.startsWith('MYLATEX')), false, 'a branding no brand answers to still sells under none')
check(await orderBrand({ brand: 'HAPPI SLEEP' }), 'AKEMI', "a bill written under HAPPI SLEEP is Akemi's")
check(await orderBrand({ fair: { brand: 'HAPPI SLEEP', status: 'open' } }), 'AKEMI', "…and so is one written at a HAPPI SLEEP booth")
check(await one(`SELECT public.sales_order_lines_brand($1)`, [ORDER]), 'AKEMI', '…and its lines name Akemi')

// A brand's own code or name before another brand's sub-brand of the same word; an inactive brand answers nothing.
await q(`INSERT INTO public.comm_brands(code, name, sub_brands, created_at) VALUES ('OLD', 'Old', '{AKEMI,ZANOTTI}', '2026-01-01')`)
check([await brandOf('AKEMI'), await brandOf('Zanotti')], ['AKEMI', 'ZANOTTI'], "an older brand's sub-brand never takes a word a brand is called by")
await q(`DELETE FROM public.comm_brands WHERE code = 'OLD'`)
await q(`UPDATE public.comm_brands SET is_active = false WHERE code = 'AKEMI'`)
check(await brandOf('HAPPI SLEEP'), null, "an inactive brand's sub-brand names nothing")
await q(`UPDATE public.comm_brands SET is_active = true WHERE code = 'AKEMI'`)
await q(`INSERT INTO public.comm_brands(code, name) VALUES ('NEW', 'New')`)
check(await one(`SELECT sub_brands FROM public.comm_brands WHERE code = 'NEW'`), [], 'a new brand starts with no sub-brand')

console.log(`PASS: ${checks} HappiSleep-is-Akemi SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)
