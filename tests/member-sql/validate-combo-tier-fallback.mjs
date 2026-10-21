// Local PostgreSQL regression for 20261021230000 (2026-10-21 — the user: "that calculate margin must be same, depends on
// the cost in product list, commission as well"). Every sofa bill arrives at PRICE_2; the SOFFIO sets are priced at
// PRICE_1 alone, the one tier the Quote can offer for SOFFIO; a module's price falls back across tiers and a set's did
// not, so the run would have costed a SOFFIO bill at its modules while the Quote costed it at the set.
// Production's own bodies — catalogue_apply_combos (the repo's 20261008040000 copy with the office clock's
// CURRENT_DATE rewrite, md5-checked against production's), catalogue_match_slots, catalogue_combos_collide,
// catalogue_sku_for_code and catalogue_height_key (the repo's last copies, md5-checked) — run over stand-ins for the
// tables they read; 20261021220000 (case) runs verbatim first, as production ran it; then 20261021230000 runs VERBATIM,
// twice. What is under test, on bills: a set priced at another tier only is the bill's cost (the bill's tier, else
// PRICE_2, else the lowest — a module's order); the bill's own tier and an any-tier set still win; no set at the bill's
// height, a piece more, a mixed tier or a set not yet in effect still costs nothing; the call is idempotent and lets go
// of a set whose price was removed; and what landed is the md5 the file names. No live I/O.
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
const APPLY = 'public.catalogue_apply_combos(uuid)'

// ── The tables those bodies read, with the columns they name ─────────────────
await db.exec(`
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
  CREATE TABLE catalogue_combos (
    id             SERIAL PRIMARY KEY,
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    base_model     TEXT NOT NULL,
    modules        JSONB NOT NULL,
    slots_key      TEXT NOT NULL,
    tier           TEXT,
    label          TEXT,
    effective_from DATE NOT NULL DEFAULT '2026-10-21',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at     TIMESTAMPTZ
  );
  CREATE VIEW catalogue_live_combos AS
    SELECT 'portal:'::text || id::text AS erp_id, erp_company_id, base_model, modules, slots_key, tier, label,
           effective_from, created_at AS erp_created_at, true AS portal
      FROM catalogue_combos pc WHERE removed_at IS NULL;
  CREATE TABLE catalogue_combo_prices (
    erp_company_id  BIGINT NOT NULL DEFAULT 1,
    base_model      TEXT NOT NULL,
    slots_key       TEXT NOT NULL,
    tier            TEXT NOT NULL,
    price_by_height JSONB NOT NULL,
    PRIMARY KEY (erp_company_id, base_model, slots_key, tier)
  );
  CREATE TABLE sales_orders (
    id             UUID PRIMARY KEY,
    erp_company_id BIGINT,
    order_no       TEXT NOT NULL,
    order_date     DATE
  );
  CREATE TABLE sales_order_lines (
    id               UUID PRIMARY KEY,
    order_id         UUID NOT NULL REFERENCES sales_orders(id),
    line_no          INTEGER NOT NULL,
    product_code     TEXT NOT NULL,
    qty              NUMERIC NOT NULL,
    list_cost_amount NUMERIC,
    cost_amount      NUMERIC,
    cost_source      TEXT,
    cost_detail      JSONB
  )`)

// ── Production's bodies ─────────────────────────────────────────────────────
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m040 = await migration('20261008040000_combo_exact_match')
const helpers = [
  [lastFunction(m030, 'catalogue_height_key'), 'd15bbca0ff85708427e948c82b4ff675'],
  [lastFunction(m030, 'catalogue_sku_for_code'), '6261c6dfd8ef4ac5f3757d338ba310b0'],
  [lastFunction(m030, 'catalogue_match_slots'), 'ca383219b703c0d15d9a72466cda3a66'],
  [lastFunction(m040, 'catalogue_combos_collide'), '162a457c511ac7cca35745e519379284'],
]
check(helpers.map(([f]) => md5(f.body)), helpers.map(([, sum]) => sum), "the repo's last copies of the helpers are production's")
for (const [f] of helpers) await db.exec(f.statement)
// The office clock (20261009000000) rewrote catalogue_apply_combos' CURRENT_DATE in place; production runs the result.
const apply = lastFunction(m040, 'catalogue_apply_combos')
const officeClock = s => s.replace(/\bcurrent_date\b/gi, "(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date")
check(md5(officeClock(apply.body)), 'ae3f3890f510043a7d503e44ec762ada', "the repo's copy, as the office clock rewrote it, is production's body")
await db.exec(officeClock(apply.statement))
check(await bodyMd5(APPLY), 'ae3f3890f510043a7d503e44ec762ada', 'loaded as production runs it')
await db.exec(await migration('20261021220000_combo_modules_ignore_case'))

// ── SOFFIO (8030) as production has it on 2026-10-21 ────────────────────────
for (const [code, module] of [['8030-1A(LHF)', '1A(LHF)'], ['8030-1A(RHF)', '1A(RHF)'], ['8030-Console', 'Console'], ['8030-STOOL', 'STOOL']]) {
  await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model, module_code) VALUES ($1, $1, 'SOFA', '8030', $2)`, [code, module])
}
await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model, module_code, active) VALUES ('8030-CONSOLE', '8030-CONSOLE', 'SOFA', '8030', 'CONSOLE', FALSE)`)
const SET = [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']]
const SET_KEY = '[["1A(LHF)"], ["1A(RHF)"], ["CONSOLE"]]'
const addSet = async (tier, priceByHeight, extra = {}) => {
  const comboId = await one(
    `INSERT INTO catalogue_combos (base_model, modules, slots_key, tier, label, effective_from)
     VALUES ('8030', $1::jsonb, $2, $3, $4, $5) RETURNING id`,
    [JSON.stringify(extra.modules ?? SET), extra.key ?? SET_KEY, tier, extra.label ?? '1A(LHF) + 1A(RHF) + CONSOLE', extra.from ?? '2026-10-21'])
  await q(`INSERT INTO catalogue_combo_prices (base_model, slots_key, tier, price_by_height) VALUES ('8030', $1, $2, $3::jsonb)`,
    [extra.key ?? SET_KEY, tier ?? '', JSON.stringify(priceByHeight)])
  return comboId
}
const dropSet = async comboId => {
  const row = (await q(`SELECT slots_key, COALESCE(tier, '') AS tier FROM catalogue_combos WHERE id = $1`, [comboId]))[0]
  await q(`DELETE FROM catalogue_combo_prices WHERE base_model = '8030' AND slots_key = $1 AND tier = $2`, [row.slots_key, row.tier])
  await q(`UPDATE catalogue_combos SET removed_at = now() WHERE id = $1`, [comboId])
}
// Production's two live sets at PRICE_1 (made 2026-10-21 06:35 and 06:37 UTC).
const P1 = await addSet('PRICE_1', { 24: 1744, 26: 1744, 28: 1744, 30: 1744, 35: 2140, '25"': 0 })
await addSet('PRICE_1', { 24: 1324, 28: 1324, 30: 1324, 35: 1720 },
  { modules: [['1A(LHF)'], ['1A(RHF)']], key: '[["1A(LHF)"], ["1A(RHF)"]]', label: '1A(LHF) + 1A(RHF)' })

// A bill as the feed leaves it: each line at its own Product List cost, its seat height and fabric tier read.
let orders = 0
const OWN = { '8030-1A(LHF)': 910, '8030-1A(RHF)': 910, '8030-Console': 700, '8030-STOOL': 600 }
async function bill(lines, { date = '2026-10-21', tier = 'PRICE_2', height = '35' } = {}) {
  const order = id(++orders)
  await q(`INSERT INTO sales_orders (id, erp_company_id, order_no, order_date) VALUES ($1, 1, $2, $3)`, [order, `HC-SO-TEST-${orders}`, date])
  let n = 0
  for (const line of lines) {
    const [code, qty = 1, lineTier = tier] = Array.isArray(line) ? line : [line]
    const own = OWN[code] * qty
    await q(`INSERT INTO sales_order_lines (id, order_id, line_no, product_code, qty, list_cost_amount, cost_amount, cost_source, cost_detail)
             VALUES ($1, $2, $3, $4, $5, $6, $6, 'catalogue', $7::jsonb)`,
      [id(1000 + orders * 10 + n), order, n, code, qty, own, JSON.stringify({ how: 'grid', tier: lineTier, height })])
    n++
  }
  return order
}
const applyTo = order => one(`SELECT catalogue_apply_combos($1)`, [order])
const costs = async order => (await q(
  `SELECT cost_amount::text AS cost, cost_source AS source, cost_detail->'combo'->>'label' AS combo FROM sales_order_lines WHERE order_id = $1 ORDER BY line_no`,
  [order])).map(r => [Number(r.cost), r.source, r.combo ?? null])
const SOFFIO = ['8030-1A(LHF)', '8030-Console', '8030-1A(RHF)']
const SET_COSTS = [[772.79, 'catalogue_combo', '1A(LHF) + 1A(RHF) + CONSOLE'], [594.44, 'catalogue_combo', '1A(LHF) + 1A(RHF) + CONSOLE'], [772.77, 'catalogue_combo', '1A(LHF) + 1A(RHF) + CONSOLE']]
const OWN_COSTS = [[910, 'catalogue', null], [700, 'catalogue', null], [910, 'catalogue', null]]

// ── Before: the bill at PRICE_2 misses the PRICE_1 set the Quote costs it at ─
const before = await bill(SOFFIO)
check(await applyTo(before), 0, 'before: a PRICE_2 SOFFIO bill takes no set')
check(await costs(before), OWN_COSTS, '…every module at its own cost: 19.8% at RM 4,490')
const quoteLike = await bill(SOFFIO, { tier: 'PRICE_1' })
check(await applyTo(quoteLike), 3, 'before: the same sale at PRICE_1 — what the Quote can offer — takes the set')
check(await costs(quoteLike), SET_COSTS, '…RM 2,140 spread by the modules’ own costs: 31.9%')

// ── The migration, twice ────────────────────────────────────────────────────
const file = await migration('20261021230000_combo_tier_falls_back')
await db.exec(file)
check(await bodyMd5(APPLY), 'bd856d49e9b677fc9bd7f88f3a3dcd51', 'what landed is the md5 the file names')
await db.exec(file)
check(await bodyMd5(APPLY), 'bd856d49e9b677fc9bd7f88f3a3dcd51', 'a second run changes nothing')
check(await q(`SELECT p.provolatile, l.lanname, p.proconfig, p.prosecdef FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = $1::regprocedure`, [APPLY]),
  [{ provolatile: 'v', lanname: 'plpgsql', proconfig: ['search_path=public'], prosecdef: false }], 'it keeps its language, its search_path, and runs as the caller')

// ── After ───────────────────────────────────────────────────────────────────
check(await applyTo(before), 3, 'the PRICE_2 bill now takes the PRICE_1 set — the only tier it is priced at')
check(await costs(before), SET_COSTS, '…at the same RM 2,140 as the Quote: one margin, the Product List’s')
check(await applyTo(before), 6, 'a second call lets go of the three lines and costs them again (it counts both)…')
check(await costs(before), SET_COSTS, '…and lands on the same cents')
check(await one(`SELECT cost_detail->'combo'->>'tier' FROM sales_order_lines WHERE order_id = $1 AND line_no = 0`, [before]), 'PRICE_2',
  'the line still says the tier it was billed at')
check(await applyTo(quoteLike), 6, 'the PRICE_1 sale still takes its own set (let go, taken again)')
check(await costs(quoteLike), SET_COSTS, '…at the same price')

// The bill's own tier wins; else PRICE_2; else the lowest — a module's order (catalogue_grid_price).
const P2 = await addSet('PRICE_2', { 35: 2000 })
const atP2 = await bill(SOFFIO)
await applyTo(atP2)
check((await costs(atP2)).reduce((s, [c]) => s + c, 0), 2000, 'a set priced at the bill’s own tier wins: 2,000 at PRICE_2')
const atP1 = await bill(SOFFIO, { tier: 'PRICE_1' })
await applyTo(atP1)
check((await costs(atP1)).reduce((s, [c]) => s + c, 0), 2140, '…and at PRICE_1, PRICE_1’s')
const atP3 = await bill(SOFFIO, { tier: 'PRICE_3' })
await applyTo(atP3)
check(Math.round((await costs(atP3)).reduce((s, [c]) => s + c, 0) * 100) / 100, 2000, 'a PRICE_3 bill with no PRICE_3 price falls back to PRICE_2, not to the cheaper PRICE_1')
await dropSet(P2)
const P3 = await addSet('PRICE_3', { 35: 2300 })
const lowest = await bill(SOFFIO)
await applyTo(lowest)
check(Math.round((await costs(lowest)).reduce((s, [c]) => s + c, 0) * 100) / 100, 2140, 'with PRICE_1 and PRICE_3 priced, a PRICE_2 bill takes the lowest tier: PRICE_1')
const ownP3 = await bill(SOFFIO, { tier: 'PRICE_3' })
await applyTo(ownP3)
check(Math.round((await costs(ownP3)).reduce((s, [c]) => s + c, 0) * 100) / 100, 2300, '…and a PRICE_3 bill its own PRICE_3')
await dropSet(P3)
const ANY = await addSet(null, { 35: 1900 })
const anyTier = await bill(SOFFIO, { tier: 'PRICE_3' })
await applyTo(anyTier)
check(Math.round((await costs(anyTier)).reduce((s, [c]) => s + c, 0) * 100) / 100, 1900, 'an any-tier set is the bill’s tier too: it beats a fallback to PRICE_1')
const exactP1 = await bill(SOFFIO, { tier: 'PRICE_1' })
await applyTo(exactP1)
check(Math.round((await costs(exactP1)).reduce((s, [c]) => s + c, 0) * 100) / 100, 2140, '…but a set written for the bill’s own tier beats an any-tier one')
await dropSet(ANY)

// What still costs nothing.
const at32 = await bill(SOFFIO, { height: '32' })
check([await applyTo(at32), await costs(at32)], [0, OWN_COSTS.map(([c, s]) => [c, s, null])], 'no tier priced at the bill’s seat height: no set')
const early = await bill(SOFFIO, { date: '2026-10-20' })
check([await applyTo(early), await costs(early)], [0, OWN_COSTS], 'a set not yet in effect on the bill’s date: no set')
const extra = await bill([...SOFFIO, '8030-STOOL'])
check(await applyTo(extra), 0, 'a piece more is not the set, whatever the tier')
const mixed = await bill([['8030-1A(LHF)', 1, 'PRICE_1'], '8030-Console', '8030-1A(RHF)'])
check(await applyTo(mixed), 0, 'two tiers on one sofa: no set — the bill’s tier is not guessed')
const pair = await bill(['8030-1A(LHF)', '8030-1A(RHF)'])
await applyTo(pair)
check((await costs(pair)).map(([c, s]) => [c, s]), [[860, 'catalogue_combo'], [860, 'catalogue_combo']], 'the 1A(LHF) + 1A(RHF) set too: 1,720 at PRICE_1 for a PRICE_2 bill')

// A set whose price is taken away lets go of the bill on its next call.
await dropSet(P1)
check(await applyTo(before), 3, 'its price removed, the call puts the lines back…')
check(await costs(before), OWN_COSTS, '…at their own costs')

console.log(`PASS: ${checks} combo-tier SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)
