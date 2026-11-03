// Local PostgreSQL regression for 20261030030000 (2026-10-29 — the user, asked how the Quote should offer a fabric
// upgrade made on Product List › Maintenance › Fabrics: "just like them choose, like upgrade fabric enough, then i can
// edit the name and price"). The Quote's member_catalogue is loaded as production runs it (sofa-model-names-
// production.sql, then 20261019140000, 20261019160000, 20261020000000 and 20261021230200 verbatim), md5-checked, over
// stand-ins for the tables it reads; the migration then runs VERBATIM, twice. What is under test: every sofa and bed
// frame model is handed its category's upgrades in its charges — [{ value, charge }], the cheapest first — priced or
// not (a customer's price); a category with none leaves the key out; nothing else of the answer moves; what landed is
// the md5 the file names. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const migration = name => text(new URL(`${name}.sql`, migrations))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const CATALOGUE = 'public.member_catalogue(text[], uuid[], boolean, integer)'
const SOFA = '45b37e53-355c-402d-8524-1b4589da7bed'
const FRAME = '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

  -- What member_catalogue reads, with production's column types (validate-sofa-combos-price-2.mjs).
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

  -- What the costing's combo pass reads and writes of a bill (20261021230200 is loaded over it).
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, erp_company_id bigint, order_no text NOT NULL, order_date date);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.sales_orders(id), line_no integer NOT NULL,
    product_code text NOT NULL, qty numeric NOT NULL, list_cost_amount numeric, cost_amount numeric, cost_source text, cost_detail jsonb);

  -- The upgrades as 20261030020000 keeps them (the columns this reads).
  CREATE TABLE public.catalogue_fabric_upgrades(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_company_id bigint NOT NULL DEFAULT 1,
    category text NOT NULL CHECK (category IN ('SOFA', 'BEDFRAME')), name text NOT NULL, price numeric(15,2) NOT NULL CHECK (price > 0));
`)

/** The last CREATE of a function in a migration, whole. */
function lastFunction(sql, name) {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\([\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
  let m, found = null
  while ((m = re.exec(sql))) found = sql.slice(m.index, sql.indexOf(m[1], m.index + m[0].length) + m[1].length) + ';'
  assert(found, `no CREATE FUNCTION ${name}`)
  return found
}

// ── The Quote's catalogue, as production runs it (validate-sofa-combos-price-2.mjs) ──
const snapshot = await text(new URL('./sofa-model-names-production.sql', import.meta.url))
await db.exec(`SET check_function_bodies = off; ${snapshot} RESET check_function_bodies;`)
await db.exec(`REVOKE ALL ON FUNCTION ${CATALOGUE} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${CATALOGUE} TO service_role;`)
for (const name of ['20261019140000_sofa_model_names', '20261019160000_sofa_model_names_in_capitals', '20261020000000_quote_names_a_sofa_by_its_name']) {
  await db.exec(await migration(name))
}
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m040 = await migration('20261008040000_combo_exact_match')
for (const f of ['catalogue_height_key', 'catalogue_sku_for_code', 'catalogue_match_slots', 'catalogue_grid_price', 'catalogue_unit_price']) {
  await db.exec(lastFunction(m030, f))
}
await db.exec(lastFunction(m040, 'catalogue_combos_collide'))
await db.exec(lastFunction(m040, 'catalogue_apply_combos').replace(/\bcurrent_date\b/gi, "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date"))
for (const name of ['20261021220000_combo_modules_ignore_case', '20261021230000_combo_tier_falls_back', '20261021230200_grid_zero_is_no_price']) {
  await db.exec(await migration(name))
}
const bodyMd5 = () => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [CATALOGUE])
check(await bodyMd5(), '9819dad8f62bb13cd70471dc52df65ef', 'member_catalogue as production runs it on 2026-10-29')

// ── A sofa and a bed frame, each with one offered SKU and a charged option ──
await q(`INSERT INTO public.comm_brands(code, name) VALUES ('ZANOTTI', 'Zanotti')`)
await q(`INSERT INTO public.erp_product_models(erp_id, model_code, name, category, branding, allowed_options) VALUES
           ($1, '8030', 'SOFFIO', 'SOFA', 'ZANOTTI', '{}'), ($2, 'BF01', 'ARIA', 'BEDFRAME', NULL, '{}')`, [SOFA, FRAME])
await q(`INSERT INTO public.catalogue_models(erp_model_id, offered, enabled) VALUES
           ($1, true, '{"sizes": ["35"], "leg_heights": ["5\\""]}'), ($2, true, '{"divan_heights": ["12\\""]}')`, [SOFA, FRAME])
await q(`INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code, model_erp_id, branding) VALUES
           ('mfg-1na', '8030-1NA', 'SOFA', '8030', '1NA', $1, 'ZANOTTI'), ('mfg-bf', 'BF01-(K)', 'BEDFRAME', 'BF01', NULL, $2, NULL)`, [SOFA, FRAME])
await q(`INSERT INTO public.catalogue_skus(erp_product_id, offered, price, price_grid) VALUES
           ('mfg-1na', true, NULL, '[{"tier": "PRICE_2", "price": 900, "height": "35"}]'), ('mfg-bf', true, 700, NULL)`)
await q(`INSERT INTO public.erp_maintenance_options(pool, value) VALUES ('sofa_sizes', '35'), ('sofa_leg_heights', '5"'), ('bedframe_divan_heights', '12"')`)
await q(`INSERT INTO public.catalogue_option_prices(pool, value, price) VALUES ('sofa_leg_heights', '5"', 200), ('bedframe_divan_heights', '12"', 100)`)
await q(`INSERT INTO public.catalogue_fabric_upgrades(category, name, price) VALUES
           ('SOFA', 'Leather', 500), ('SOFA', 'Upgrade fabric', 200), ('BEDFRAME', 'Upgrade fabric', 150)`)

const answer = async priced => one(`SELECT public.member_catalogue(ARRAY['ZANOTTI'], NULL, $1, 0)`, [priced])
const chargesOf = (a, id) => a.models.find(m => m.id === id)?.charges
const without = (a, key) => JSON.parse(JSON.stringify(a), (k, v) => (k === key ? undefined : v))

const before = { snapshot: await answer(false), priced: await answer(true) }
check(Object.keys(chargesOf(before.snapshot, SOFA)), ['leg_heights'], 'before: a sofa is charged its leg alone')

// ── The migration, verbatim, twice ──
const file = await migration('20261030030000_quote_fabric_upgrades')
await db.exec(file)
await db.exec(file)
const landed = await bodyMd5()
check(landed, /v_catalogue <> '([0-9a-f]{32})'/.exec(file)?.[1], "member_catalogue is the file's")

const after = { snapshot: await answer(false), priced: await answer(true) }
for (const [kind, a] of Object.entries(after)) {
  check(chargesOf(a, SOFA).fabric_upgrades, [{ value: 'Upgrade fabric', charge: 200 }, { value: 'Leather', charge: 500 }],
    `${kind}: a sofa is handed its category's upgrades, the cheapest first`)
  check(chargesOf(a, FRAME).fabric_upgrades, [{ value: 'Upgrade fabric', charge: 150 }], `${kind}: a bed frame its own`)
  check(chargesOf(a, SOFA).leg_heights, chargesOf(before[kind], SOFA).leg_heights, `${kind}: its options charged as before`)
  check(without(a, 'fabric_upgrades'), before[kind], `${kind}: nothing else of the answer moves`)
}

// A category with no upgrade leaves the key out, as an option list nothing charges.
await q(`DELETE FROM public.catalogue_fabric_upgrades WHERE category = 'BEDFRAME'`)
check(Object.keys(chargesOf(await answer(false), FRAME)), ['divan_heights'], 'no bed frame upgrade: no key')
check(await one(`SELECT public.catalogue_fabric_upgrade_charges(1, 'bedframe')`), null, 'the helper answers nothing')
check(await one(`SELECT public.catalogue_fabric_upgrade_charges(1, ' sofa ')`), [{ value: 'Upgrade fabric', charge: 200 }, { value: 'Leather', charge: 500 }],
  'a category named any way')

// Who may call the helper: the service role, as member_catalogue.
check(await one(`SELECT has_function_privilege('authenticated', 'public.catalogue_fabric_upgrade_charges(bigint, text)', 'EXECUTE')`), false,
  'not a signed-in member')
check(await one(`SELECT has_function_privilege('service_role', 'public.catalogue_fabric_upgrade_charges(bigint, text)', 'EXECUTE')`), true,
  'the service role')

console.log(`quote fabric upgrades: ${checks} checks passed`)
