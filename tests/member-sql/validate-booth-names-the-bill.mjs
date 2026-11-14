// Local PostgreSQL regression for 20261114123500 (2026-11-14 — the user: "你应该是可以 capture 得到每一张销售单都是在什么 brand
// 的 booth 开单的，所以你就可以跟着那个 brand 的 margin 去计算"; of a bill opened at one brand's booth selling another's goods:
// "全跟 booth").
// Production's five bodies (tests/member-sql/booth-names-the-bill-production.sql, read with pg_get_functiondef,
// md5-checked) are loaded over stand-ins for the tables they read; the migration then runs VERBATIM, twice. What is under
// test is its own work: a bill's brand is its booth's — after another ERP company's, ahead of the products' Branding and
// both picks — a cancelled booth or one that names no brand changes nothing, and the bills already stamped otherwise are
// restamped (a line keeps its product's brand). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261114123500_booth_names_the_bill.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const SCHEME = id(1), BATCH = id(2), OLD_BATCH = id(3)
const BILL = { CROSS: id(11), CANCELLED: id(12), NO_BOOTH: id(13), COMPANY: id(14), SAME: id(15), PICKED: id(16), WORDLESS: id(17), OLD_COPY: id(18) }

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, code text NOT NULL, name text,
    is_active boolean NOT NULL DEFAULT true, sub_brands text[] NOT NULL DEFAULT '{}', item_code_prefixes text[] NOT NULL DEFAULT '{}',
    erp_company_id bigint, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL DEFAULT 'erp_sync', order_no text NOT NULL,
    period_month date NOT NULL DEFAULT '2026-09-01', brand_code text, erp_company_id bigint, raw jsonb);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, line_no integer,
    product_code text, line_amount numeric NOT NULL DEFAULT 0, brand_code text, raw jsonb);
  CREATE TABLE public.sales_order_brand_picks(order_id uuid PRIMARY KEY, brand_code text);
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-11-14) ──
const PROD = {
  'erp_sync_order_brand(jsonb,uuid)': 'c1c371268abf92b9cbe27824bc080057',
  'sales_order_restamp_brand(uuid)': '19433c3e1a804498a93eeb0fd5b7aa27',
  'erp_sync_brand_code(text)': 'b0df3385c53987a71ca25a28e17d056e',
  'sales_order_lines_brand(uuid)': '474ea3dc952541d61e8215473eb5550d',
  'erp_sync_brand_by_prefix(text)': 'a8995c8d20055f2924a8a17f82a1a717',
}
const AFTER = { ...PROD, 'erp_sync_order_brand(jsonb,uuid)': 'dfee8025b6a9616d3ae30bed7e61ac6b' }
const BODIES = `SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, md5(replace(p.prosrc, E'\\r', '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = ANY ($1) ORDER BY 1`
const NAMES = ['erp_sync_order_brand', 'sales_order_restamp_brand', 'erp_sync_brand_code', 'sales_order_lines_brand', 'erp_sync_brand_by_prefix']
const production = (await readFile(new URL('./booth-names-the-bill-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec('SET check_function_bodies = off')
for (const block of production.split(/\n(?=-- [a-z_]+\()/).slice(1)) await db.exec(block)
await db.exec('SET check_function_bodies = on')
check(Object.fromEntries((await q(BODIES, [NAMES])).map(r => [r.sig, r.md5])), PROD, "production's five bodies")
const ACLS = `SELECT p.proacl::text AS acl, p.prosecdef AS definer FROM pg_proc p WHERE p.oid = 'public.erp_sync_order_brand(jsonb, uuid)'::regprocedure`
await db.exec(`REVOKE ALL ON FUNCTION public.erp_sync_order_brand(jsonb, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.erp_sync_order_brand(jsonb, uuid) TO authenticated, service_role;`)
const aclBefore = await q(ACLS)

// ── Fair's brands, 2990s' company, and the bills as the feed stamped them ──
// A booth's word as the ERP writes it: DUNLOPILLO is Dunlopillo's name, HAPPI SLEEP Akemi's sub-brand.
await db.exec(`
  INSERT INTO public.comm_brands (scheme_id, code, name, sub_brands, item_code_prefixes, erp_company_id, created_at) VALUES
    ('${SCHEME}', 'AKEMI', 'Akemi', '{HAPPI SLEEP}', '{AK-}', NULL, '2026-01-01'),
    ('${SCHEME}', 'DUNLOP', 'Dunlopillo', '{}', '{DL-}', NULL, '2026-01-02'),
    ('${SCHEME}', 'ERGOTEX', 'Ergotex', '{}', '{}', NULL, '2026-01-03'),
    ('${SCHEME}', 'ZANOTTI', 'Zanotti', '{}', '{ZN-}', NULL, '2026-01-04'),
    ('${SCHEME}', '2990S', '2990s', '{2990S SOFA}', '{}', 2, '2026-11-11');
`)
const raw = ({ branding = null, vp = null, booth = null, status = 'confirmed' } = {}) =>
  JSON.stringify({ header: { branding }, vpBrand: vp, fair: booth === undefined ? null : { brand: booth, status } })
const bill = (orderId, orderNo, brand, r, { company = 1, batch = BATCH } = {}) =>
  q(`INSERT INTO public.sales_orders (id, batch_id, order_no, brand_code, erp_company_id, raw) VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, batch, orderNo, brand, company, r])
// HC-SO-2609-190 as production holds it: an Akemi mattress and a frame at the ZANOTTI booth, an Akemi bill.
await bill(BILL.CROSS, 'HC-SO-2609-190', 'AKEMI', raw({ branding: 'AKEMI', booth: 'ZANOTTI' }))
// Its older copy, in a batch since superseded: restamped as well.
await bill(BILL.OLD_COPY, 'HC-SO-2609-190', 'AKEMI', raw({ branding: 'AKEMI', booth: 'ZANOTTI' }), { batch: OLD_BATCH })
// The office withdrew from the booth: no fair, the products' brand stands.
await bill(BILL.CANCELLED, 'HC-SO-2609-191', 'AKEMI', raw({ branding: 'AKEMI', booth: 'ZANOTTI', status: 'cancelled' }))
// No booth picked (keyed after the fair closed): the Branding stands.
await bill(BILL.NO_BOOTH, 'HC-SO-2609-192', 'DUNLOP', raw({ branding: 'DUNLOPILLO', booth: undefined }))
// 2990's Home's own document at a Zanotti booth: the company's brand, whatever the booth.
await bill(BILL.COMPANY, '2990-SO-2611-001', '2990S', raw({ branding: 'ZANOTTI', booth: 'ZANOTTI' }), { company: 2 })
// The booth and the products agree: nothing to do.
await bill(BILL.SAME, 'HC-SO-2611-002', 'DUNLOP', raw({ branding: 'DUNLOPILLO', booth: 'DUNLOPILLO' }))
// Pillows alone, picked by the salesperson as Akemi's, at the Ergotex booth: the booth now.
await bill(BILL.PICKED, 'HC-SO-2611-003', 'AKEMI', raw({ vp: 'AKEMI', booth: 'ERGOTEX' }))
// A hall of several booths: the ERP sends a word that names no brand — nothing changes.
await bill(BILL.WORDLESS, 'HC-SO-2611-004', 'AKEMI', raw({ branding: 'AKEMI', booth: 'BIGHOME' }))
await db.exec(`
  INSERT INTO public.sales_order_lines (order_id, line_no, product_code, line_amount, brand_code, raw) VALUES
    ('${BILL.CROSS}', 1, 'AK-SOLITUDE (Q)', 4000, 'AKEMI', '{"brand":"AKEMI"}'),
    ('${BILL.CROSS}', 2, 'TRION (A)-(Q)', 1000, 'AKEMI', '{}'),
    ('${BILL.PICKED}', 1, 'AK-PILLOW', 200, 'AKEMI', '{}');
`)
const brands = async () => Object.fromEntries((await q(`SELECT order_no || CASE WHEN batch_id = '${OLD_BATCH}' THEN ' (old)' ELSE '' END AS k, brand_code
  FROM public.sales_orders ORDER BY 1`)).map(r => [r.k, r.brand_code]))
const lines = async orderId => (await q(`SELECT product_code, brand_code FROM public.sales_order_lines WHERE order_id = $1 ORDER BY line_no`, [orderId]))
  .map(r => [r.product_code, r.brand_code])
const brandOf = (order, orderId = null) => one(`SELECT public.erp_sync_order_brand($1::jsonb, $2)`, [JSON.stringify(order), orderId])

// ── Before: the Branding first, the booth last ──
check(await brandOf({ brand: 'AKEMI', fair: { brand: 'ZANOTTI', status: 'confirmed' } }), 'AKEMI', 'before: the products’ Branding beats the booth')
const before = await brands()

// ── The migration, twice ──
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const md5After = await q(BODIES, [NAMES])
const afterFirst = await brands()
await db.exec(migration)
check(await q(BODIES, [NAMES]), md5After, 'the second run changes no body')
check(await brands(), afterFirst, 'nor any bill')
check(Object.fromEntries(md5After.map(r => [r.sig, r.md5])), AFTER, 'the body production runs after it; the rest untouched')
check(await q(ACLS), aclBefore, 'granted and owned as before (SECURITY DEFINER, the feed and the restamp call it)')

// ── The rule ──
const BOOTH = { brand: 'ZANOTTI', status: 'confirmed' }
check(await brandOf({ brand: 'AKEMI', fair: BOOTH }), 'ZANOTTI', "the booth beats the products' Branding")
check(await brandOf({ brandPick: 'AKEMI', fair: { brand: 'ERGOTEX' } }), 'ERGOTEX', "… and the salesperson's pick")
check(await brandOf({ brand: 'AKEMI', fair: { brand: 'DUNLOPILLO', status: 'confirmed' } }), 'DUNLOP', 'a booth named by its brand’s name')
check(await brandOf({ brand: 'DUNLOP', fair: { brand: 'Happi Sleep' } }), 'AKEMI', '… or a sub-brand')
check(await brandOf({ brand: 'AKEMI', fair: { ...BOOTH, status: 'cancelled' } }), 'AKEMI', 'a cancelled booth names nothing: the Branding')
check(await brandOf({ brand: 'AKEMI', fair: { ...BOOTH, status: 'CANCELLED' } }), 'AKEMI', '… in any case')
check(await brandOf({ brand: 'AKEMI', fair: { brand: 'BIGHOME' } }), 'AKEMI', 'a booth word that names no brand: the Branding')
check(await brandOf({ brand: 'AKEMI', fair: null }), 'AKEMI', 'no booth: the Branding')
check(await brandOf({ brandPick: 'DUNLOPILLO' }), 'DUNLOP', "no booth, no Branding: the salesperson's pick")
await q(`INSERT INTO public.sales_order_brand_picks VALUES ($1, 'ERGOTEX')`, [BILL.NO_BOOTH])
check(await brandOf({}, BILL.NO_BOOTH), 'ERGOTEX', "… else the portal's pick")
check(await brandOf({ fair: BOOTH }, BILL.NO_BOOTH), 'ZANOTTI', "… which a booth now beats too")
await q(`DELETE FROM public.sales_order_brand_picks`)
check(await brandOf({}), null, 'nothing at all: none (the caller reads the lines)')
check(await brandOf({ companyId: 2, brand: 'AKEMI', fair: BOOTH }), '2990S', "another ERP company's order is its company's brand, whatever the booth")
check(await brandOf({ brand: 'AKEMI', fair: BOOTH }, BILL.COMPANY), '2990S', '… read off the stored bill too')

// ── The bills it restamped ──
check(afterFirst, {
  ...before,
  'HC-SO-2609-190': 'ZANOTTI',
  'HC-SO-2609-190 (old)': 'ZANOTTI',
  'HC-SO-2611-003': 'ERGOTEX',
}, "the Akemi mattress at the Zanotti booth is Zanotti's, its older copy too; the picked pillows at the Ergotex booth Ergotex's; a cancelled booth, no booth, 2990's Home, a booth that agrees and a word that names no brand — untouched")
check(await lines(BILL.CROSS), [['AK-SOLITUDE (Q)', 'AKEMI'], ['TRION (A)-(Q)', 'ZANOTTI']],
  "the mattress line keeps its product's brand; the frame, which names none, follows the bill")
check(await lines(BILL.PICKED), [['AK-PILLOW', 'ERGOTEX']], 'the pillows, naming none of their own, follow the bill')

console.log(`OK booth names the bill: ${checks} checks`)
