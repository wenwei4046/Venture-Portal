// Local PostgreSQL regression for 20261027020300 (2026-10-27 — the user, showing the ERP's New Sales Order, its
// Special Orders ticked from a list: "只要他的 description 能 match 到 … 在这边就自然而然从 sales order 那边扣除那个
// Special Order 的 total amount", "有些是 full set 的，直接用它的价钱减 300 块 … 如果有些是 by seat / by compartment，就看它
// 有哪几个 compartment … 1A 是一个 back cushion，2A 就是两个 back cushion"; a whole sofa "都当 1 个"; the special
// order's own money "只照 Maintenance").
// Production's own bodies — the repo's last copies, md5-checked against production's — run over stand-ins for the
// tables they read; 20261026173700 brings catalogue_apply_sofa_charges to what production runs today (cbab7a6e…);
// then 20261027020300 runs VERBATIM, twice. What is under test: on a bill each special any piece of a sofa names is
// charged Maintenance's price, matched by name — a Full set one once per sofa × the sofas, a By quantity one once per
// compartment (each piece's back cushions, the ERP's SOFA_MODULES, × its quantity: 1A / 1B / 1NA / 1S one, 2A / 2NA /
// 2S two, 3S three, a chaise or a corner one, a console or a stool none, a whole sofa one); the leg height still once
// per sofa; the bill's own special-order money never read; a re-delivery without the special lets go; idempotent; what
// landed is the md5 the file names. No live I/O.
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
function lastFunction(sql, name, args = '') {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\(` + args + String.raw`[\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
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
const APPLY = 'public.catalogue_apply_sofa_charges(uuid)'

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
  CREATE TABLE erp_maintenance_options (
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    pool           TEXT NOT NULL,
    value          TEXT NOT NULL,
    label          TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    removed_at     TIMESTAMPTZ,
    PRIMARY KEY (erp_company_id, pool, value)
  );
  CREATE TABLE catalogue_option_prices (
    erp_company_id BIGINT NOT NULL DEFAULT 1,
    pool           TEXT NOT NULL,
    value          TEXT NOT NULL,
    price          NUMERIC NOT NULL,
    updated_by     UUID,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (erp_company_id, pool, value),
    FOREIGN KEY (erp_company_id, pool, value) REFERENCES erp_maintenance_options (erp_company_id, pool, value),
    CONSTRAINT catalogue_option_prices_charge_not_negative CHECK (price >= 0),
    CONSTRAINT catalogue_option_prices_unpriced_pools CHECK (pool <> 'sofa_sizes')
  );
  CREATE TABLE sales_orders (
    id             UUID PRIMARY KEY,
    erp_company_id BIGINT,
    order_no       TEXT NOT NULL,
    raw            JSONB
  );
  CREATE TABLE sales_order_lines (
    id                   UUID PRIMARY KEY,
    order_id             UUID NOT NULL REFERENCES sales_orders(id),
    line_no              INTEGER NOT NULL,
    item_group           TEXT,
    product_code         TEXT NOT NULL,
    description2         TEXT,
    raw                  JSONB,
    qty                  NUMERIC NOT NULL,
    line_amount          NUMERIC,
    option_charge_amount NUMERIC NOT NULL DEFAULT 0,
    cost_detail          JSONB
  )`)

// ── Production's bodies, then production's catalogue_apply_sofa_charges of 2026-10-26 ──
const m030 = await migration('20260924030000_catalogue_costs_the_margin')
const m040 = await migration('20260924040000_member_catalogue')
const m1005 = await migration('20261005020000_bedframe_charges_follow_modular')
const m1006 = await migration('20261006050000_option_prices_are_charges')
const bodies = [
  [lastFunction(m030, 'catalogue_value_key'), '1ea7b76ef890a99929c2b6c06c24321c'],
  [lastFunction(m030, 'catalogue_sku_for_code'), '6261c6dfd8ef4ac5f3757d338ba310b0'],
  [lastFunction(m030, 'catalogue_line_facts'), '85e7986827c8adb666a14515ae88d3f7'],
  [lastFunction(m030, 'catalogue_option_price'), '3c189c4f0b4fb0174ace07b74a98da36'],
  [lastFunction(m040, 'catalogue_model_options'), 'baf5b2f98fd7c2fe9afe77a72512f619'],
  [lastFunction(m1005, 'catalogue_model_charges', String.raw`p_company BIGINT, p_pool TEXT, p_enabled`), '5b6c299a088c8510929f868ae7185457'],
  [lastFunction(m1006, 'catalogue_apply_sofa_charges'), '55af81ff0c49ad4ff38aef13130863b9'],
]
check(bodies.map(([f]) => md5(f.body)), bodies.map(([, sum]) => sum), "the repo's last copies are production's bodies")
for (const [f] of bodies) await db.exec(f.statement)
await db.exec(await migration('20261026173700_sofa_specials_by_quantity'))
check(await bodyMd5(APPLY), 'cbab7a6e35a7b1c8dbd391326311ec70', 'catalogue_apply_sofa_charges as production runs it on 2026-10-26')

const mig = await migration('20261027020300_sofa_specials_by_compartment')
await db.exec(mig)
await db.exec(mig)
check(await bodyMd5(APPLY), 'c0146d4639ed8963daf6b9f6479af167', 'catalogue_apply_sofa_charges: the file’s body')

// ── The catalogue as production has it on 2026-10-27 ────────────────────────
for (const code of ['9028-2A(LHF)', '9028-L(RHF)', '9058-L(LHF)', '8030-1A(LHF)', '8030-1NA', '8030-1A(RHF)', '8030-CNR',
  '8030-Console', '8030-STOOL', '8030-3S', '8030-1A(P)(LHF)', '8030-2NA', '8030-1S', '8030-2S']) {
  await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model, module_code) VALUES ($1, $1, 'SOFA', $2, $3)`,
    [code, code.split('-')[0], code.slice(code.indexOf('-') + 1)])
}
for (const [pool, value] of [['sofa_leg_heights', '5"'], ['sofa_specials', 'Change 8030 Backcushion'], ['sofa_specials', 'Nylon Fabric'],
  ['sofa_specials', 'Seat and Backcushion Firmer'], ['sofa_specials', 'Seat Base Fully Cover with no Leg'], ['sofa_specials', 'Seat slightly soft']]) {
  await q(`INSERT INTO erp_maintenance_options (pool, value, label) VALUES ($1, $2, $2)`, [pool, value])
}
await q(`INSERT INTO catalogue_option_prices (pool, value, price, by_quantity) VALUES
           ('sofa_leg_heights', '5"', 200, FALSE),
           ('sofa_specials', 'Change 8030 Backcushion', 200, TRUE),
           ('sofa_specials', 'Seat and Backcushion Firmer', 300, FALSE),
           ('sofa_specials', 'Seat Base Fully Cover with no Leg', 300, FALSE)`)

// ── Bills ───────────────────────────────────────────────────────────────────
/** A sofa piece as the ERP sends it: the item (sales_orders.raw.items) and its portal line. */
const piece = (code, { qty = 1, amount = 0, specials = [], leg = 'Default', surcharges = {}, extra = null } = {}) => ({
  code, qty, amount, specials, leg, surcharges, extra,
})
const desc2 = p => [`LEG ${p.leg.toUpperCase()}`, p.specials.length ? `SPECIAL: ${p.specials.join(' + ')}` : null].filter(Boolean).join(' / ')
async function bill(n, pieces) {
  const orderId = id(n * 100)
  const items = pieces.map(p => ({
    item_code: p.code, item_group: 'sofa', qty: p.qty, unit_price_sen: p.amount * 100, total_sen: p.amount * 100,
    custom_specials: [
      ...p.specials.map(sp => ({ description: sp, surchargeSen: p.surcharges[sp] ?? 0 })),
      ...(p.extra ? [{ description: p.extra[0], surchargeSen: p.extra[1] }] : []),
    ],
  }))
  await q(`DELETE FROM sales_order_lines WHERE order_id = $1`, [orderId])
  await q(`DELETE FROM sales_orders WHERE id = $1`, [orderId])
  await q(`INSERT INTO sales_orders (id, erp_company_id, order_no, raw) VALUES ($1, 1, $2, $3::jsonb)`,
    [orderId, `HC-SO-TEST-${n}`, JSON.stringify({ items })])
  let line = 0
  for (const p of pieces) {
    await q(`INSERT INTO sales_order_lines (id, order_id, line_no, item_group, product_code, description2, raw, qty, line_amount)
             VALUES ($1, $2, $3, 'SOFA', $4, $5, $6::jsonb, $7, $8)`,
      [id(n * 100 + line + 1), orderId, line, p.code, desc2(p),
        JSON.stringify({ variants: { specials: p.specials, legHeight: p.leg } }), p.qty, p.amount])
    line++
  }
  return orderId
}
const apply = orderId => one(`SELECT catalogue_apply_sofa_charges($1)`, [orderId])
const lines = async orderId => (await q(`SELECT product_code, option_charge_amount::float8 AS charge, cost_detail FROM sales_order_lines
                                          WHERE order_id = $1 ORDER BY line_no`, [orderId]))
const BOTH = ['Nylon Fabric', 'Change 8030 Backcushion', 'Seat and Backcushion Firmer']

// HC-SO-2610-124's shape: 9028 2A(LHF) + L(RHF), the three specials ticked on both pieces, the special order RM 0.
// Three compartments (2A two, the chaise one): Change 8030 Backcushion RM 200 × 3 + Seat and Backcushion Firmer RM 300
// once = RM 900, on the line that sells; Nylon Fabric has no price.
const A = await bill(1, [piece('9028-2A(LHF)', { amount: 4738, specials: BOTH }), piece('9028-L(RHF)', { specials: BOTH })])
check(await apply(A), 2, 'two lines charged')
let got = await lines(A)
check(got.map(l => l.charge), [900, 0], 'RM 900 out of the sofa’s RM 4,738, on the line that sells')
check(got[0].cost_detail, {
  charges: [
    { pool: 'sofa_specials', value: 'Change 8030 Backcushion', price: 200, count: 3, by_quantity: true },
    { pool: 'sofa_specials', value: 'Seat and Backcushion Firmer', price: 300, count: 1 },
  ],
  charge_set: { sets: 1, compartments: 3, total: 900, lines: 2 },
}, 'each part its price and count; the set its sofas and compartments')
check(await apply(A), 4, 'a second call counts the lines it reset and charged again')
check((await lines(A)).map(l => [l.charge, l.cost_detail]), got.map(l => [l.charge, l.cost_detail]), 'idempotent: the same charge and explanation')

// The special order's own money is not read: RM 600 written on the special, a Custom / other RM 150 — Maintenance still.
const A2 = await bill(1, [
  piece('9028-2A(LHF)', { amount: 4738, specials: BOTH, surcharges: { 'Change 8030 Backcushion': 60000 }, extra: ['Seat slightly soft', 15000] }),
  piece('9028-L(RHF)', { specials: BOTH, surcharges: { 'Change 8030 Backcushion': 60000 } }),
])
await apply(A2)
check((await lines(A2)).map(l => l.charge), [900, 0], 'only Maintenance: the bill’s RM 600 and RM 150 are not what is charged')

// A re-delivery without the specials lets go of the charge; the costing's own explanation stays.
const A3 = await bill(1, [piece('9028-2A(LHF)', { amount: 4738, specials: ['Nylon Fabric'] }), piece('9028-L(RHF)', { specials: ['Nylon Fabric'] })])
await q(`UPDATE sales_order_lines SET option_charge_amount = 900, cost_detail = '{"charges": [], "charge_set": {"total": 900}, "how": "grid"}'::jsonb
          WHERE order_id = $1 AND line_no = 0`, [A3])
check(await apply(A3), 1, 'a charge left from before is released')
check((await lines(A3)).map(l => [l.charge, l.cost_detail]), [[0, { how: 'grid' }], [0, null]], 'its explanation goes with it, the costing’s stays')

// Two SOFFIO sofas (×2 every piece), leg 5": the leg and Seat Base Fully Cover once per sofa, Change 8030 Backcushion
// once per compartment — 1A, 1NA, 1A, each one, × 2 = 6.
const SOFFIO = ['Seat Base Fully Cover with no Leg', 'Change 8030 Backcushion']
const B = await bill(2, [
  piece('8030-1A(LHF)', { qty: 2, leg: '5"', specials: SOFFIO }),
  piece('8030-1NA', { qty: 2, amount: 10000, leg: '5"', specials: SOFFIO }),
  piece('8030-1A(RHF)', { qty: 2, leg: '5"', specials: SOFFIO }),
])
await apply(B)
got = await lines(B)
check(got.map(l => l.charge), [0, 2200, 0], 'leg RM 200 × 2 + Seat Base RM 300 × 2 + Change 8030 RM 200 × 6 = RM 2,200')
check(got[1].cost_detail.charge_set, { sets: 2, compartments: 6, total: 2200, lines: 3 }, 'two sofas, six compartments')
check(got[1].cost_detail.charges.map(c => [c.value, c.count]), [['5"', 2], ['Change 8030 Backcushion', 6], ['Seat Base Fully Cover with no Leg', 2]],
  'each part says how many times')

// Every module the ERP's SOFA_MODULES names: a corner one, a console and a stool none, a 3S three, a powered 1A one, a
// 2NA two, a 1S one, a 2S two — 10 compartments.
const C = await bill(3, ['8030-CNR', '8030-Console', '8030-STOOL', '8030-3S', '8030-1A(P)(LHF)', '8030-2NA', '8030-1S', '8030-2S']
  .map((code, i) => piece(code, { amount: i === 3 ? 9000 : 0, specials: ['Change 8030 Backcushion'] })))
await apply(C)
check((await lines(C))[3].cost_detail.charge_set.compartments, 10, 'CNR 1, Console 0, Stool 0, 3S 3, 1A(P)(LHF) 1, 2NA 2, 1S 1, 2S 2')
check((await lines(C)).reduce((a, l) => a + l.charge, 0), 2000, 'RM 200 × 10')

// A whole sofa (no module of the ERP's): one — the user: "都当 1 个".
const D = await bill(4, [piece('8211-6FT', { qty: 1, amount: 3000, specials: ['Change 8030 Backcushion', 'Seat Base Fully Cover with no Leg'] })])
await apply(D)
check((await lines(D)).map(l => [l.charge, l.cost_detail.charge_set]), [[500, { sets: 1, compartments: 1, total: 500, lines: 1 }]],
  'a whole sofa is one compartment: RM 200 + RM 300')

// A sofa of a console and a stool only has no compartment: a special charged by quantity is nothing on it.
const E = await bill(5, [piece('8030-Console', { amount: 800, specials: ['Change 8030 Backcushion'] }), piece('8030-STOOL', { specials: ['Change 8030 Backcushion'] })])
check(await apply(E), 0, 'no compartment, no charge')

// Two sofas of different models on one bill are two sets, each its own compartments.
const F = await bill(6, [
  piece('9058-L(LHF)', { amount: 3000, specials: ['Change 8030 Backcushion'] }),
  piece('8030-2NA', { amount: 2000, specials: ['Change 8030 Backcushion'] }),
])
await apply(F)
check((await lines(F)).map(l => l.charge), [200, 400], 'the chaise one, the 2NA two')

// A special spelled differently on the bill is the same special.
const G = await bill(7, [piece('8030-1NA', { amount: 2000, specials: ['change 8030  backcushion'] })])
await apply(G)
check((await lines(G)).map(l => l.charge), [200], 'matched by name as every option is')

console.log(`sofa specials by compartment: ${checks} checks passed`)
