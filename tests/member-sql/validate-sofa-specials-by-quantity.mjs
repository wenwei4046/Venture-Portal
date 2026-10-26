// Local PostgreSQL regression for 20261026173700 (2026-10-26 — the user, on Maintenance › Sofa › Specials: "我要它能够
// 选择两种：一种是整 set 沙发的 … 另一种是 by quantity 的 … 所以它需要在 quotation 那边的 quantity 可以放 plus 和 minus";
// asked how a bill counts it: "ERP 那边，他们填下去的时候就会直接写 Total 的价钱。我放这个价钱，只是给他们在做 quotation 的
// 时候比较简单 … detect 到这个 special order 是 600，自然而然这个 600 就不会算进 margin 里面了").
// Production's own bodies — the repo's last copies, md5-checked against production's — run over stand-ins for the
// tables they read; then 20261026173700 runs VERBATIM, twice. What is under test: a special's price may be charged by
// quantity, a sofa special's only (the CHECK); the Quote's charge list says which (catalogue_model_charges); and on a
// bill a sofa's SPECIALS are what its special order charges — the ERP's custom_specials on the delivered items, one per
// special per sofa however many pieces carry it, times the piece's quantity, a Custom / other extra charge too, never a
// cancelled piece or a bed frame's — while its leg height is still Maintenance's price once per sofa; a special the
// bill charges nothing for is charged nothing whatever Maintenance prices it; a re-delivery without it lets go; the call
// is idempotent; and what landed is the md5 the file names. No live I/O.
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
const CHARGES = 'public.catalogue_model_charges(bigint, text, jsonb, jsonb)'

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

// ── Production's bodies ─────────────────────────────────────────────────────
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
check(await bodyMd5(APPLY), '55af81ff0c49ad4ff38aef13130863b9', 'catalogue_apply_sofa_charges loaded as production runs it')

const mig = await migration('20261026173700_sofa_specials_by_quantity')
await db.exec(mig)
await db.exec(mig)
check(await bodyMd5(CHARGES), '8bc593720b73c69ef87d2f79541399a2', 'catalogue_model_charges: production’s body, one statement swapped')
check(await bodyMd5(APPLY), 'cbab7a6e35a7b1c8dbd391326311ec70', 'catalogue_apply_sofa_charges: the file’s body')

// ── The catalogue as production has it on 2026-10-26 ────────────────────────
for (const [code, base, module] of [['9058-L(LHF)', '9058', 'L(LHF)'], ['9058-2A(RHF)', '9058', '2A(RHF)'],
  ['8030-1A(LHF)', '8030', '1A(LHF)'], ['8030-1NA', '8030', '1NA'], ['8030-1A(RHF)', '8030', '1A(RHF)']]) {
  await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model, module_code) VALUES ($1, $1, 'SOFA', $2, $3)`, [code, base, module])
}
await q(`INSERT INTO erp_products (erp_id, item_code, category, base_model) VALUES ('CELENE (A)-(K)', 'CELENE (A)-(K)', 'BEDFRAME', 'CELENE (A)')`)
for (const [pool, value, sort] of [['sofa_leg_heights', '5"', 0], ['sofa_specials', 'Change 8030 Backcushion', 0], ['sofa_specials', 'Nylon Fabric', 0],
  ['sofa_specials', 'Seat Base Fully Cover with no Leg', 0], ['bedframe_specials', 'Divan Full Cover', 0]]) {
  await q(`INSERT INTO erp_maintenance_options (pool, value, label, sort_order) VALUES ($1, $2, $2, $3)`, [pool, value, sort])
}

// ── How a special is charged: a sofa special's choice alone ─────────────────
await q(`INSERT INTO catalogue_option_prices (pool, value, price) VALUES ('sofa_leg_heights', '5"', 200), ('sofa_specials', 'Seat Base Fully Cover with no Leg', 300)`)
check((await q(`SELECT value, by_quantity FROM catalogue_option_prices ORDER BY value`)).map(r => [r.value, r.by_quantity]),
  [['5"', false], ['Seat Base Fully Cover with no Leg', false]], 'a price is charged once unless it says otherwise')
await q(`INSERT INTO catalogue_option_prices (pool, value, price, by_quantity) VALUES ('sofa_specials', 'Change 8030 Backcushion', 200, TRUE)`)
for (const [pool, value] of [['bedframe_specials', 'Divan Full Cover'], ['sofa_leg_heights', '5"']]) {
  const err = await q(`INSERT INTO catalogue_option_prices (pool, value, price, by_quantity) VALUES ($1, $2, 125, TRUE)
                        ON CONFLICT (erp_company_id, pool, value) DO UPDATE SET by_quantity = TRUE`, [pool, value]).then(() => null, e => e.code)
  check(err, '23514', `${pool} is never charged by quantity`)
}

// ── The Quote's charge list says which ──────────────────────────────────────
const charges = await one(`SELECT catalogue_model_charges(1, 'sofa_specials', $1::jsonb, '[]'::jsonb)`,
  [JSON.stringify(['Change 8030 Backcushion', 'Nylon Fabric', 'Seat Base Fully Cover with no Leg'])])
check(charges, [
  { value: 'Change 8030 Backcushion', charge: 200, byQuantity: true },
  { value: 'Seat Base Fully Cover with no Leg', charge: 300 },
], 'a special charged by quantity says so; one with no price is no charge; the rest as before')
check(await one(`SELECT catalogue_model_charges(1, 'sofa_leg_heights', '["5\\""]'::jsonb, '[]'::jsonb)`),
  [{ value: '5"', charge: 200 }], 'a leg height is charged as it was')

// ── Bills ───────────────────────────────────────────────────────────────────
/** A sofa piece as the ERP sends it: the item (sales_orders.raw.items) and its portal line. */
const piece = (code, { qty = 1, amount = 0, specials = [], leg = 'Default', surcharges = {}, cancelled = false, extra = null } = {}) => ({
  code, qty, amount, specials, leg, surcharges, cancelled, extra,
})
const desc2 = p => [`LEG ${p.leg.toUpperCase()}`, p.specials.length ? `SPECIAL: ${p.specials.join(' + ')}` : null].filter(Boolean).join(' / ')
async function bill(n, pieces, others = []) {
  const orderId = id(n * 100)
  const items = [...pieces.map(p => ({
    item_code: p.code, item_group: 'sofa', qty: p.qty, cancelled: p.cancelled, unit_price_sen: p.amount * 100, total_sen: p.amount * 100,
    special_order_price_sen: 0,
    custom_specials: [
      ...p.specials.map(sp => ({ description: sp, surchargeSen: p.surcharges[sp] ?? 0 })),
      ...(p.extra ? [{ description: p.extra[0], surchargeSen: p.extra[1] }] : []),
    ],
  })), ...others]
  await q(`DELETE FROM sales_order_lines WHERE order_id = $1`, [orderId])
  await q(`DELETE FROM sales_orders WHERE id = $1`, [orderId])
  await q(`INSERT INTO sales_orders (id, erp_company_id, order_no, raw) VALUES ($1, 1, $2, $3::jsonb)`,
    [orderId, `HC-SO-TEST-${n}`, JSON.stringify({ items })])
  let line = 0
  for (const p of pieces.filter(x => !x.cancelled)) {
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

// HC-SO-2610-343's shape: 9058 L(LHF) + 2A(RHF), Change 8030 Backcushion and Nylon Fabric on both pieces. As it came on
// 2026-10-26 the special order is 0 — and Maintenance prices the special (200, by quantity): nothing is charged.
const A = await bill(1, [
  piece('9058-L(LHF)', { amount: 4588, specials: ['Change 8030 Backcushion', 'Nylon Fabric'] }),
  piece('9058-2A(RHF)', { specials: ['Change 8030 Backcushion', 'Nylon Fabric'] }),
])
await apply(A)
check((await lines(A)).map(l => [l.charge, l.cost_detail]), [[0, null], [0, null]],
  'a special the bill charges nothing for is charged nothing, whatever Maintenance prices it')

// The salesperson writes the total, RM 600, on the special order — the ERP prints it on every piece of the set.
const A2 = await bill(1, [
  piece('9058-L(LHF)', { amount: 4588, specials: ['Change 8030 Backcushion', 'Nylon Fabric'], surcharges: { 'Change 8030 Backcushion': 60000 } }),
  piece('9058-2A(RHF)', { specials: ['Change 8030 Backcushion', 'Nylon Fabric'], surcharges: { 'Change 8030 Backcushion': 60000 } }),
])
check(await apply(A2), 2, 'two lines charged')
let got = await lines(A2)
check(got.map(l => l.charge), [600, 0], 'the special order once for the sofa, RM 600 — not once a piece — on the line that sells')
check(got[0].cost_detail, {
  charges: [{ pool: 'sofa_specials', value: 'Change 8030 Backcushion', price: 600, special_order: true }],
  charge_set: { unit: 0, sets: 1, special_order: 600, total: 600, lines: 2 },
}, 'and says it is the bill’s special order')
// Again (a Recost): both lines let go and are charged again — production's own count, 2 + 2 — to the same figures.
check(await apply(A2), 4, 'a second call counts the lines it reset and charged again')
check((await lines(A2)).map(l => [l.charge, l.cost_detail]), got.map(l => [l.charge, l.cost_detail]), 'idempotent: the same charge and explanation')

// The ERP's surcharge written as a number, not a string, reads the same.
await q(`UPDATE sales_orders SET raw = jsonb_set(raw, '{items,0,custom_specials,0,surchargeSen}', '60000'::jsonb) WHERE id = $1`, [A2])
await apply(A2)
check((await lines(A2)).map(l => l.charge), [600, 0], 'a surcharge as a JSON number')

// A re-delivery that drops the special order lets go of the charge.
const A3 = await bill(1, [
  piece('9058-L(LHF)', { amount: 4588, specials: ['Change 8030 Backcushion'] }),
  piece('9058-2A(RHF)', { specials: ['Change 8030 Backcushion'] }),
])
check(await apply(A3), 0, 'nothing left to charge')
await q(`UPDATE sales_order_lines SET option_charge_amount = 600, cost_detail = '{"charges": [], "charge_set": {"total": 600}, "how": "grid"}'::jsonb
          WHERE order_id = $1 AND line_no = 0`, [A3])
check(await apply(A3), 1, 'a charge left from before is released')
check((await lines(A3)).map(l => [l.charge, l.cost_detail]), [[0, { how: 'grid' }], [0, null]], 'its explanation goes with it, the costing’s stays')

// Two SOFFIO sofas (×2 every piece), leg 5" at Maintenance's RM 200, Seat Base Fully Cover's RM 300 special order on
// every piece, and a Custom / other "Seat slightly soft" RM 150 on one; a cancelled piece with a special order and a bed
// frame's special order on the same bill.
const B = await bill(2, [
  piece('8030-1A(LHF)', { qty: 2, leg: '5"', specials: ['Seat Base Fully Cover with no Leg'], surcharges: { 'Seat Base Fully Cover with no Leg': 30000 } }),
  piece('8030-1NA', { qty: 2, amount: 10000, leg: '5"', specials: ['Seat Base Fully Cover with no Leg'], surcharges: { 'Seat Base Fully Cover with no Leg': 30000 },
    extra: ['Seat slightly soft', 15000] }),
  piece('8030-1A(RHF)', { qty: 2, leg: '5"', specials: ['Seat Base Fully Cover with no Leg'], surcharges: { 'Seat Base Fully Cover with no Leg': 30000 } }),
  piece('8030-1A(RHF)', { qty: 1, leg: '5"', specials: ['Change 8030 Backcushion'], surcharges: { 'Change 8030 Backcushion': 99900 }, cancelled: true }),
], [{ item_code: 'CELENE (A)-(K)', item_group: 'bedframe', qty: 1, special_order_price_sen: 12500,
  custom_specials: [{ description: 'Divan Full Cover', surchargeSen: 12500 }] }])
await apply(B)
got = await lines(B)
check(got.map(l => l.charge), [0, 1300, 0],
  'leg RM 200 × 2 sofas + Seat Base RM 300 × 2 + Seat slightly soft RM 150 × 2 = RM 1,300, on the piece that sells')
check(got[1].cost_detail.charges, [
  { pool: 'sofa_leg_heights', value: '5"', price: 200 },
  { pool: 'sofa_specials', value: 'Seat Base Fully Cover with no Leg', price: 600, special_order: true },
  { pool: 'sofa_specials', value: 'Seat slightly soft', price: 300, special_order: true },
], 'the leg at Maintenance’s price, each special order as the bill writes it; never the cancelled piece’s, never the bed frame’s')
check(got[1].cost_detail.charge_set, { unit: 200, sets: 2, special_order: 900, total: 1300, lines: 3 }, 'the set says how it adds up')

// Two sofas of different models on one bill are two sets, each its own special order.
const C = await bill(3, [
  piece('9058-L(LHF)', { amount: 3000, specials: ['Change 8030 Backcushion'], surcharges: { 'Change 8030 Backcushion': 40000 } }),
  piece('8030-1NA', { amount: 2000, specials: ['Change 8030 Backcushion'], surcharges: { 'Change 8030 Backcushion': 20000 } }),
])
await apply(C)
check((await lines(C)).map(l => l.charge), [400, 200], 'one special order per sofa, each its own')

// A bill with no delivered items (a file import) charges its leg as before and no special.
const D = await bill(4, [piece('8030-1NA', { amount: 2000, leg: '5"', specials: ['Change 8030 Backcushion'] })])
await q(`UPDATE sales_orders SET raw = NULL WHERE id = $1`, [D])
await apply(D)
check((await lines(D)).map(l => [l.charge, l.cost_detail?.charge_set]), [[200, { unit: 200, sets: 1, special_order: 0, total: 200, lines: 1 }]],
  'no items: the leg at Maintenance’s price, no special order')

console.log(`sofa specials by quantity: ${checks} checks passed`)
