// Local PostgreSQL regression for 20261019140000 (2026-10-19 — the user, on Product List › SKU Master (Sofa) and a
// sofa's Modular window: "sofa category same as mattress have the model name … then it can be add and edit, on
// here"). Production's member_catalogue and every function it calls are loaded from
// `sofa-model-names-production.sql` (md5-checked), the catalogue's tables stand in with the columns those functions
// name, then the migration runs VERBATIM, twice. What is under test: a name typed on Modular is catalogue_models'
// own (trimmed, 1–80 characters, NULL = none); the Quote names a sofa "5066 ROMA" by it, as an ERP-named one reads
// "8030 SOFFIO"; no name of the portal's leaves every model as the ERP names it; a name never moves a model's
// calculator section; the swap refuses a body production no longer runs, keeps the function the service role's
// alone, and a second run changes nothing. Then 20261019160000, verbatim twice: a name saved before the window kept
// capitals reads in capitals, and nothing else moves. No live I/O.
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

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = '20261019140000_sofa_model_names'
const BEFORE = 'a4261ebbc85d1a2f9aaf867bde9ad2f5'
const AFTER = '7ad51e775f94d16c69533b34b496d29e'
const SIG = 'public.member_catalogue(text[], uuid[], boolean, integer)'

const M = { sofa: id(1), named: id(2), apex: id(3), pillow: id(4) }
const bodyMd5 = async () => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)
/** The Quote's unpriced answer for one brand: product code → the name it is sold under. */
async function names(priced = false) {
  const answer = await one(`SELECT public.member_catalogue(ARRAY['ZANOTTI', 'AKEMI'], NULL, $1, 0)`, [priced])
  return Object.fromEntries(answer.products.map(p => [p.code, p.name]))
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

    -- The tables member_catalogue and its helpers read, with production's column types.
    CREATE TABLE public.comm_brands(code text, name text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.erp_product_models(erp_id uuid PRIMARY KEY, erp_company_id bigint NOT NULL DEFAULT 1, model_code text,
      name text, category text, branding text, removed_at timestamptz, allowed_options jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE public.erp_products(vp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_id text UNIQUE, erp_company_id bigint NOT NULL DEFAULT 1,
      item_code text, category text, base_model text, module_code text, size_code text, size_label text, fabric_color text,
      model_erp_id uuid, branding text, description text, removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_skus(erp_product_id text PRIMARY KEY, offered boolean NOT NULL DEFAULT false, price numeric,
      price_grid jsonb, updated_at timestamptz NOT NULL DEFAULT now());
    -- catalogue_models as production holds it before the migration (its two checks included).
    CREATE TABLE public.catalogue_models(erp_model_id uuid PRIMARY KEY REFERENCES public.erp_product_models(erp_id),
      offered boolean NOT NULL DEFAULT false, enabled jsonb NOT NULL DEFAULT '{}'::jsonb, gift boolean, calc_category text,
      brand_code text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT catalogue_models_calc_category_valid CHECK (calc_category IS NULL OR calc_category = ANY (ARRAY['Mattress', 'Bed frame', 'Sofa', 'Pillow', 'Protector', 'Accessory', 'Other'])),
      CONSTRAINT catalogue_models_enabled_is_object CHECK (jsonb_typeof(enabled) = 'object'));
    CREATE TABLE public.erp_maintenance_options(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, sort_order integer NOT NULL DEFAULT 0,
      removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_option_prices(erp_company_id bigint NOT NULL DEFAULT 1, pool text, value text, price numeric);
    -- A table standing in for the view of the same name (only the priced answer reads it).
    CREATE TABLE public.catalogue_live_combos(erp_company_id bigint NOT NULL DEFAULT 1, erp_id text, base_model text, modules jsonb,
      slots_key text, tier text, label text, effective_from date, erp_created_at timestamptz, portal boolean);
    CREATE TABLE public.catalogue_combo_prices(erp_company_id bigint NOT NULL DEFAULT 1, base_model text, slots_key text, tier text, price_by_height jsonb);
  `)

  // Production's own text. Its SQL functions name one another out of order, as pg_get_functiondef lists them.
  const production = await text(new URL('./sofa-model-names-production.sql', import.meta.url))
  await db.exec(`SET check_function_bodies = off; ${production} RESET check_function_bodies;`)
  for (const [, name, args, sum] of production.matchAll(/^-- (\w+)\((.*)\) md5\(prosrc\) ([0-9a-f]{32})$/gm)) {
    check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.${name}(${args.replace(/\b(p_\w+|p) /g, '')})'::regprocedure`), sum, `${name} is production's`)
  }
  check(await bodyMd5(), BEFORE, 'member_catalogue is the body production ran on 2026-10-19')
  // Who may call it, as on production: the service role alone.
  await db.exec(`REVOKE ALL ON FUNCTION ${SIG} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${SIG} TO service_role;`)

  // ── The catalogue: four models, each offered with one SKU ticked ──
  await db.exec(`
    INSERT INTO public.comm_brands(code, name, created_at) VALUES ('ZANOTTI', 'Zanotti', '2026-01-01'), ('AKEMI', 'Akemi', '2026-01-02');
    INSERT INTO public.erp_product_models(erp_id, model_code, name, category, branding) VALUES
      ('${M.sofa}', '5066', '5066', 'SOFA', 'ZANOTTI'),
      ('${M.named}', '8030', 'SOFFIO', 'SOFA', 'ZANOTTI'),
      ('${M.apex}', 'APEX', 'APEX', 'MATTRESS', 'AKEMI'),
      ('${M.pillow}', 'LATEX PILLOW', 'Latex Pillow', 'ACCESSORY', NULL);
    INSERT INTO public.erp_products(erp_id, item_code, category, base_model, module_code, size_code, model_erp_id, branding) VALUES
      ('p-5066', '5066-1S', 'SOFA', '5066', '1S', NULL, '${M.sofa}', 'ZANOTTI'),
      ('p-8030', '8030-2S', 'SOFA', '8030', '2S', NULL, '${M.named}', 'ZANOTTI'),
      ('p-apex', 'AKEMI APEX MATT (Q)', 'MATTRESS', NULL, NULL, 'Q', '${M.apex}', 'AKEMI'),
      ('p-pillow', 'LATEX PILLOW', 'ACCESSORY', NULL, NULL, NULL, '${M.pillow}', NULL);
    INSERT INTO public.catalogue_skus(erp_product_id, offered, price) VALUES ('p-5066', true, 900), ('p-8030', true, 1100), ('p-apex', true, 1500), ('p-pillow', true, 40);
    INSERT INTO public.catalogue_models(erp_model_id, offered) VALUES ('${M.sofa}', true), ('${M.named}', true), ('${M.apex}', true), ('${M.pillow}', true);
  `)
  const before = await names()
  check(before, { '5066-1S': '5066', '8030-2S': '8030 SOFFIO', 'AKEMI APEX MATT (Q)': 'APEX', 'LATEX PILLOW': 'LATEX PILLOW' },
    'before: a sofa the ERP names reads "8030 SOFFIO", one it does not reads its number')
  const header = async () => q(`SELECT provolatile, prosecdef, proconfig, prolang FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)
  const headerBefore = await header()

  // ── A body production no longer runs is refused, and nothing is changed ──
  const drifted = (await one(`SELECT pg_get_functiondef('${SIG}'::regprocedure)`)).replace('v_company  BIGINT := 1;', 'v_company  BIGINT := 1; -- changed straight on production')
  await db.exec(drifted)
  const migration = await text(new URL(`${MIGRATION}.sql`, migrations))
  await assert.rejects(() => db.exec(migration), /member_catalogue changed on production since 2026-10-19/, 'a drifted body is refused')
  checks++
  check(await one(`SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'catalogue_models' AND column_name = 'model_name'`), 0,
    'the refusal leaves the table as it was (one transaction)')
  await db.exec(drifted.replace('v_company  BIGINT := 1; -- changed straight on production', 'v_company  BIGINT := 1;'))
  check(await bodyMd5(), BEFORE, 'production\'s body back in place')

  // ── The migration, verbatim, twice ──
  await db.exec(migration)
  check(await bodyMd5(), AFTER, 'member_catalogue landed as written')
  await db.exec(migration)
  check(await bodyMd5(), AFTER, 'a second run changes nothing')
  check(await one(`SELECT count(*)::int FROM pg_constraint WHERE conname = 'catalogue_models_model_name_valid'`), 1, 'one check, not two')
  const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)
  check(src.split('COALESCE(cm.model_name, m.name) AS model_name').length - 1, 1, 'the one expression is swapped')
  check(md5(src.replace('COALESCE(cm.model_name, m.name) AS model_name', 'm.name AS model_name')), BEFORE, 'and nothing else in the body moved')
  check(await header(), headerBefore, 'nor its language, volatility, rights or settings')
  check([await one(`SELECT has_function_privilege('authenticated', '${SIG}', 'EXECUTE')`),
    await one(`SELECT has_function_privilege('anon', '${SIG}', 'EXECUTE')`),
    await one(`SELECT has_function_privilege('service_role', '${SIG}', 'EXECUTE')`)], [false, false, true],
  'still the service role\'s alone')

  // ── No name of the portal's: every model reads as the ERP names it ──
  check(await names(), before, 'with no name typed the Quote reads exactly as before')

  // ── A name typed on Modular ──
  await db.exec(`UPDATE public.catalogue_models SET model_name = 'ROMA' WHERE erp_model_id = '${M.sofa}'`)
  await db.exec(`UPDATE public.catalogue_models SET model_name = 'SOFFIO PLUS' WHERE erp_model_id = '${M.named}'`)
  const after = await names()
  check(after['5066-1S'], '5066 ROMA', 'a sofa reads its code and the portal\'s name, as an ERP-named one does')
  check(after['8030-2S'], '8030 SOFFIO PLUS', 'the portal\'s name wins over the ERP\'s')
  check((await names(true))['5066-1S'], '5066 ROMA', 'the priced answer names it the same')
  await db.exec(`UPDATE public.catalogue_models SET model_name = '5066' WHERE erp_model_id = '${M.sofa}'`)
  check((await names())['5066-1S'], '5066', 'a name that is the code itself is not said twice')
  await db.exec(`UPDATE public.catalogue_models SET model_name = NULL WHERE erp_model_id = '${M.named}'`)
  check((await names())['8030-2S'], '8030 SOFFIO', 'cleared, the ERP\'s own name is back')

  // A name never moves a section: the pillow stays a Pillow whatever it is called.
  await db.exec(`UPDATE public.catalogue_models SET model_name = 'Cloud Bolster' WHERE erp_model_id = '${M.pillow}'`)
  const pillow = (await one(`SELECT public.member_catalogue(ARRAY['AKEMI'], NULL, false, 0)`)).products.find(p => p.code === 'LATEX PILLOW')
  check([pillow.category, pillow.gift], ['Pillow', true], 'the calculator section reads the ERP\'s name, never the portal\'s')

  // ── The column's own check ──
  for (const [bad, why] of [[' ROMA', 'a leading space'], ['ROMA ', 'a trailing space'], ['', 'an empty name'], ['x'.repeat(81), '81 characters']]) {
    await reject(`UPDATE public.catalogue_models SET model_name = $1 WHERE erp_model_id = '${M.sofa}'`, [bad], /catalogue_models_model_name_valid/, `refused: ${why}`)
  }
  await db.exec(`UPDATE public.catalogue_models SET model_name = '${'x'.repeat(80)}' WHERE erp_model_id = '${M.sofa}'`)
  check(await one(`SELECT char_length(model_name) FROM public.catalogue_models WHERE erp_model_id = '${M.sofa}'`), 80, '80 characters fit')
  await db.exec(`INSERT INTO public.erp_product_models(erp_id, model_code, name, category) VALUES ('${id(9)}', '9999', '9999', 'SOFA');
    INSERT INTO public.catalogue_models(erp_model_id) VALUES ('${id(9)}')`)
  check(await one(`SELECT model_name FROM public.catalogue_models WHERE erp_model_id = '${id(9)}'`), null, 'a model starts with no name of the portal\'s')

  // ── 20261019160000: a name saved before the window kept capitals reads in capitals (the user, of 5071's "aaaa":
  // "AAAA 大写"). Verbatim, twice; a name already in capitals, a model with none and every other column stay. ──
  await db.exec(`UPDATE public.catalogue_models SET model_name = 'aaaa', updated_at = '2026-10-19 15:38:13+00' WHERE erp_model_id = '${M.sofa}';
    UPDATE public.catalogue_models SET model_name = 'Soffio Plus' WHERE erp_model_id = '${M.named}';
    UPDATE public.catalogue_models SET model_name = NULL WHERE erp_model_id = '${M.pillow}';
    INSERT INTO public.erp_product_models(erp_id, model_code, name, category) VALUES ('${id(10)}', '5543', 'ALTAY', 'SOFA');
    INSERT INTO public.catalogue_models(erp_model_id, offered, model_name) VALUES ('${id(10)}', true, 'NOVA PLUS')`)
  const capitals = await text(new URL('20261019160000_sofa_model_names_in_capitals.sql', migrations))
  const rows = async () => q(`SELECT erp_model_id, offered, enabled, gift, calc_category, brand_code, updated_at, model_name
    FROM public.catalogue_models ORDER BY erp_model_id`)
  const beforeCaps = await rows()
  await db.exec(capitals)
  const afterCaps = await rows()
  check(Object.fromEntries(afterCaps.map(r => [r.erp_model_id, r.model_name])), {
    [M.sofa]: 'AAAA', [M.named]: 'SOFFIO PLUS', [M.apex]: null, [M.pillow]: null, [id(9)]: null, [id(10)]: 'NOVA PLUS',
  }, 'every name in capitals; none stays none')
  check(afterCaps.map(({ model_name: _, ...r }) => r), beforeCaps.map(({ model_name: _, ...r }) => r), 'nothing else on a row moved')
  check((await names())['5066-1S'], '5066 AAAA', 'the Quote reads it in capitals')
  await db.exec(capitals)
  check(await rows(), afterCaps, 'a second run changes nothing')

  console.log(`validate-sofa-model-names: ${checks} checks passed`)
} finally {
  await db.close()
}
