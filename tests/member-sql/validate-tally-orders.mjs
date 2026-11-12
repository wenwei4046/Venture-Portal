// Local PostgreSQL regression for 20261112190000 — Comm Cal › Tally reads who has REALLY paid each bill
// (2026-11-12; the user: "need with the real commission payout, for those below depo, houzs will not pay to
// venture as well").
//
// revenue_tally_orders() runs VERBATIM (twice) over stand-ins for the tables it reads. Under test, bill by bill:
// the day its payments reached the deposit — the ERP's rule on the payments its delivery carries (day order, the
// office's day for a timestamp, the ERP's total, a refund taken off, a malformed payment skipped) — only a bill
// that carries no dated payment, or whose total is RM 0, read off the portal's gate; a bill still under its
// deposit reached on no day, whatever the portal's gate says of the bill's own total; what earns on it (its
// commissionable lines alone); whether the ERP names a fair (a file's bill cannot say); its fair
// day; the month a close released it; and that only this sub-department's committed months from p_from on come
// back. Last, who may call it. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261112190000_revenue_tally_orders.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1), IR = id(2), SCHEME = id(3), IR_SCHEME = id(4), OLD_SCHEME = id(5)
const SEP = id(11), OCT = id(12), AUG = id(13), DRAFT = id(14), IR_OCT = id(15), FILE = id(16)
const ANTHONY = id(21)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

  -- ── Stand-ins for what the function reads, with the columns it reads ──
  CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', deposit_threshold_pct numeric);
  CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text NOT NULL DEFAULT 'committed');
  CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL);
  CREATE TABLE sales_orders(id uuid PRIMARY KEY, batch_id uuid, period_month date NOT NULL, order_no text NOT NULL,
    order_date date NOT NULL, staff_id uuid, agent_name text, customer_name text, brand_code text,
    order_total numeric NOT NULL DEFAULT 0, paid_amount numeric, cancelled boolean NOT NULL DEFAULT false,
    excluded_reason text, source text NOT NULL DEFAULT 'erp_sync', raw jsonb);
  CREATE TABLE sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, item_group text, line_amount numeric);
  CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid, period_month date);
  -- Production's own: the paper's Ref No. as the ERP has it.
  CREATE FUNCTION public.ref_no(o public.sales_orders) RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(o.raw -> 'header' ->> 'customer_so_no', ''), NULLIF(o.raw -> 'header' ->> 'ref', '')) $$;

  INSERT INTO comm_schemes(id, sub_department_id, is_active, effective_from, deposit_threshold_pct) VALUES
    ('${OLD_SCHEME}', '${FAIR}', true,  '2025-01-01', 0.5),   -- an older scheme: never the one read
    ('${SCHEME}',     '${FAIR}', true,  '2026-01-01', 0.3),
    ('${IR_SCHEME}',  '${IR}',   true,  '2026-01-01', NULL);  -- no deposit gate
  INSERT INTO comm_item_groups(scheme_id, item_group, commissionable) VALUES
    ('${SCHEME}', 'MATTRESS', true), ('${SCHEME}', 'Transport', false), ('${IR_SCHEME}', 'MATTRESS', true);
  INSERT INTO hr_staff_costs(id, employee_name) VALUES ('${ANTHONY}', 'ANTHONY');
  INSERT INTO sales_import_batches(id, sub_department_id, period_month, status) VALUES
    ('${AUG}',    '${FAIR}', '2026-08-01', 'committed'),
    ('${SEP}',    '${FAIR}', '2026-09-01', 'committed'),
    ('${OCT}',    '${FAIR}', '2026-10-01', 'committed'),
    ('${DRAFT}',  '${FAIR}', '2026-10-01', 'superseded'),
    ('${FILE}',   '${FAIR}', '2026-11-01', 'committed'),
    ('${IR_OCT}', '${IR}',   '2026-10-01', 'committed');
`)

let n = 100
/** A bill; \`pay\` = its payments as the delivery carries them, \`raw\` = the rest of the document. */
async function bill(no, batch, month, date, total, paid, { pay, raw = {}, lines = [['MATTRESS', total]], ...over } = {}) {
  const bid = id(++n)
  const doc = { ...raw, ...(pay === undefined ? {} : { payments: pay }) }
  await db.query(
    `INSERT INTO sales_orders(id, batch_id, period_month, order_no, order_date, staff_id, agent_name, customer_name, brand_code,
                              order_total, paid_amount, cancelled, excluded_reason, source, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [bid, batch, month, no, date, over.staff ?? null, over.agent ?? 'KIM', over.customer ?? 'MR TAN', over.brand ?? 'AKEMI',
     total, paid, over.cancelled ?? false, over.excluded ?? null, over.source ?? 'erp_sync', JSON.stringify(doc)],
  )
  for (const [group, amount] of lines) {
    await db.query(`INSERT INTO sales_order_lines(order_id, item_group, line_amount) VALUES ($1, $2, $3)`, [bid, group, amount])
  }
  return bid
}
const paid = (day, sen) => ({ paid_at: day, amount_sen: sen })
const fair = day => ({ fair: { projectId: 7, name: 'MID VALLEY', ...(day ? { fairDate: day } : {}) } })

// ── October's bills ──
// Paid in full at the fair, keyed the same week: reached on its payment's day.
await bill('A-FULL', OCT, '2026-10-01', '2026-10-05', 5000, 5000, { pay: [paid('2026-10-04', 500000)], raw: fair('2026-10-04'), staff: ANTHONY })
// RM 500 of RM 5,000 at the fair, topped up to RM 2,000 on 3 Nov: reached that day (30% = RM 1,500).
await bill('B-TOPUP', OCT, '2026-10-01', '2026-10-06', 5000, 2000, { pay: [paid('2026-10-05', 50000), paid('2026-11-03', 150000)], raw: fair('2026-10-05') })
// Still under its deposit.
await bill('C-BELOW', OCT, '2026-10-01', '2026-10-07', 18400, 1000, { pay: [paid('2026-10-07', 100000)], raw: fair('2026-10-07') })
// Exactly at 30%.
await bill('D-EXACT', OCT, '2026-10-01', '2026-10-08', 1000, 300, { pay: [paid('2026-10-08', 30000)], raw: fair(null) })
// A payment stamped 31 Oct 17:30 UTC is 1 Nov in the office.
await bill('E-STAMP', OCT, '2026-10-01', '2026-10-30', 2000, 2000, { pay: [paid('2026-10-31T17:30:00+00:00', 200000)], raw: fair('2026-10-30') })
// Payments out of order, a refund between them, one with no date and one with no amount.
await bill('F-MIXED', OCT, '2026-10-01', '2026-10-10', 10000, 3500, {
  pay: [paid('2026-10-20', 250000), paid('2026-10-10', 200000), paid('2026-10-12', -150000), { paid_at: null, amount_sen: 900000 }, { paid_at: 'soon', amount_sen: 900000 }, paid('2026-10-25', 'x'), paid('2026-10-28', 50000)],
  raw: fair('2026-10-10'),
})
// The ERP's total (total_revenue_sen) is what 30% is measured on, not the bill's own.
await bill('G-TOTAL', OCT, '2026-10-01', '2026-10-11', 4000, 1500, { pay: [paid('2026-10-11', 150000)], raw: { ...fair('2026-10-11'), header: { total_revenue_sen: 600000, local_total_sen: 400000, customer_so_no: 'HC777' } } })
// No payments on the delivery, yet the gate is met: read off the gate, on its order date.
await bill('H-NOPAY', OCT, '2026-10-01', '2026-10-12', 3000, 3000, { raw: fair('2026-10-12') })
// A bill of RM 0 (a gift on its own): nothing to reach.
await bill('I-ZERO', OCT, '2026-10-01', '2026-10-13', 0, 0, { pay: [], raw: fair('2026-10-13'), lines: [['MATTRESS', 0]] })
// The ERP names no fair.
await bill('J-NOFAIR', OCT, '2026-10-01', '2026-10-14', 1780, 1780, { pay: [paid('2026-10-14', 178000)], raw: { fair: null } })
// Transport earns nothing; a group the scheme never heard of neither.
await bill('K-LINES', OCT, '2026-10-01', '2026-10-15', 2600, 2600, { pay: [paid('2026-10-15', 260000)], raw: fair('2026-10-15'), lines: [['mattress ', 2000], ['Transport', 400], ['MYSTERY', 200]] })
// Cancelled, and taken out by hand: still returned, said so.
await bill('L-CANCEL', OCT, '2026-10-01', '2026-10-16', 900, 900, { pay: [paid('2026-10-16', 90000)], raw: fair('2026-10-16'), cancelled: true })
await bill('M-OUT', OCT, '2026-10-01', '2026-10-17', 900, 900, { pay: [paid('2026-10-17', 90000)], raw: fair('2026-10-17'), cancelled: true, excluded: 'manual' })
// Its one payment carries no day, and the gate is met: read off the gate.
await bill('N-UNDATED', OCT, '2026-10-01', '2026-10-21', 800, 800, { pay: [{ paid_at: null, amount_sen: 80000 }], raw: fair('2026-10-21') })
// No payments carried and the gate is NOT met: no day.
await bill('O-NONE', OCT, '2026-10-01', '2026-10-22', 2000, 100, { raw: fair('2026-10-22') })
// A bill of RM 0 that carries a dated payment of nothing: there is no deposit to measure — the gate answers.
await bill('P-ZEROPAID', OCT, '2026-10-01', '2026-10-23', 0, 0, { pay: [paid('2026-10-23', 0)], raw: fair('2026-10-23'), lines: [['MATTRESS', 0]] })
// ── Other months and batches ──
await bill('S-SEP', SEP, '2026-09-01', '2026-10-10', 3888, 3888, { pay: [paid('2026-09-19', 388800)], raw: fair('2026-09-19') })
await bill('T-AUG', AUG, '2026-08-01', '2026-08-20', 1000, 1000, { pay: [paid('2026-08-20', 100000)], raw: fair('2026-08-20') })
await bill('U-DRAFT', DRAFT, '2026-10-01', '2026-10-18', 1000, 1000, { pay: [paid('2026-10-18', 100000)], raw: fair('2026-10-18') })
await bill('V-FILE', FILE, '2026-11-01', '2026-11-02', 1200, 1200, { source: 'file', raw: {} })
await bill('W-IR', IR_OCT, '2026-10-01', '2026-10-19', 9000, 0, { pay: [], raw: fair(null) })

// The closes that paid them: A in October, S (September's, keyed in October) in September; B's top-up in November.
await db.exec(`
  INSERT INTO comm_order_releases(order_no, sub_department_id, period_month) VALUES
    ('A-FULL', '${FAIR}', '2026-10-01'), ('S-SEP', '${FAIR}', '2026-09-01'), ('B-TOPUP', '${FAIR}', '2026-11-01'),
    ('A-FULL', '${IR}',   '2026-12-01');   -- another sub-department's release of the same number is not this one's
`)

const sql = await readFile(MIGRATION, 'utf8')
await db.exec(sql)
await db.exec(sql) // CREATE OR REPLACE: twice is once

const rows = await q(`SELECT * FROM revenue_tally_orders($1, $2)`, [FAIR, '2026-09-01'])
const by = Object.fromEntries(rows.map(r => [r.order_no, r]))
const day = v => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

// ── Which bills ──
check(rows.map(r => r.order_no), ['A-FULL', 'B-TOPUP', 'C-BELOW', 'D-EXACT', 'F-MIXED', 'S-SEP', 'G-TOTAL', 'H-NOPAY', 'I-ZERO', 'J-NOFAIR', 'K-LINES', 'L-CANCEL', 'M-OUT', 'N-UNDATED', 'O-NONE', 'P-ZEROPAID', 'E-STAMP', 'V-FILE'],
  'this sub-department, committed batches, months from p_from on, by order date')
check(rows.some(r => ['T-AUG', 'U-DRAFT', 'W-IR'].includes(r.order_no)), false, 'not an earlier month, a superseded batch, another sub-department')
check((await q(`SELECT order_no FROM revenue_tally_orders($1, $2)`, [FAIR, '2026-08-01'])).some(r => r.order_no === 'T-AUG'), true, 'p_from decides how far back')

// ── The day the deposit was reached ──
check(day(by['A-FULL'].reached_on), '2026-10-04', 'paid in full: its payment day')
check(day(by['B-TOPUP'].reached_on), '2026-11-03', 'topped up: the day the top-up took it to 30%')
check(by['B-TOPUP'].deposit_met, true, 'and the portal gate is met now')
check(day(by['C-BELOW'].reached_on), null, 'under its deposit: no day')
check(by['C-BELOW'].deposit_met, false, 'and the gate holds it')
check(day(by['D-EXACT'].reached_on), '2026-10-08', 'exactly 30% is at it')
check(day(by['E-STAMP'].reached_on), '2026-11-01', 'a timestamp is read as the office day')
// 10 Oct +2,000 (20%) · 12 Oct −1,500 (5%) · 20 Oct +2,500 (30%) → reached on the 20th; the undated, the unreadable and the amountless add nothing.
check(day(by['F-MIXED'].reached_on), '2026-10-20', 'day order, the refund taken off, malformed payments skipped')
check(day(by['G-TOTAL'].reached_on), null, 'the ERP total (RM 6,000) is what 30% is of — RM 1,500 is 25%')
check(by['G-TOTAL'].deposit_met, true, 'while the portal gate, on the bill’s own RM 4,000, is met')
check(day(by['H-NOPAY'].reached_on), '2026-10-12', 'no payments carried and the gate met: its order date')
check(day(by['I-ZERO'].reached_on), '2026-10-13', 'a bill of RM 0: its order date')
check(day(by['N-UNDATED'].reached_on), '2026-10-21', 'a payment with no day is no dated payment: the gate, its order date')
check([day(by['O-NONE'].reached_on), by['O-NONE'].deposit_met], [null, false], 'no payments carried and the gate not met: no day')
check(day(by['P-ZEROPAID'].reached_on), '2026-10-23', 'RM 0 with a dated payment: nothing to measure, the gate answers')
check(day(by['V-FILE'].reached_on), '2026-11-02', 'a file’s bill: its order date')

// ── What earns, the fair, the paper, the people ──
check(Number(by['K-LINES'].goods), 2000, 'only the commissionable group — matched whatever its case and spaces')
check(Number(by['A-FULL'].goods), 5000, 'the goods of an ordinary bill')
check([by['A-FULL'].has_fair, by['J-NOFAIR'].has_fair, by['V-FILE'].has_fair], [true, false, true], 'the ERP names a fair or does not; a file cannot say')
check([day(by['A-FULL'].fair_date), day(by['D-EXACT'].fair_date), day(by['J-NOFAIR'].fair_date)], ['2026-10-04', null, null], 'the fair day, when the ERP names one')
check(by['G-TOTAL'].ref_no, 'HC777', 'the paper’s Ref No.')
check([by['A-FULL'].salesperson, by['B-TOPUP'].salesperson], ['ANTHONY', 'KIM'], 'the roster’s name, else the ERP’s')
check([by['L-CANCEL'].cancelled, by['M-OUT'].excluded_reason], [true, 'manual'], 'a cancelled or excluded bill says so')
check([Number(by['B-TOPUP'].order_total), Number(by['B-TOPUP'].paid_amount)], [5000, 2000], 'its total and what is paid')

// ── The month a close released it ──
check([day(by['A-FULL'].released_month), day(by['S-SEP'].released_month), day(by['B-TOPUP'].released_month), day(by['C-BELOW'].released_month)],
  ['2026-10-01', '2026-09-01', '2026-11-01', null], 'this sub-department’s release, or none')
check([day(by['S-SEP'].period_month), day(by['S-SEP'].order_date)], ['2026-09-01', '2026-10-10'], 'a September bill keyed in October keeps both dates')

// ── No deposit gate: every bill is met, on its order date ──
const ir = await q(`SELECT * FROM revenue_tally_orders($1, $2)`, [IR, '2026-01-01'])
check(ir.map(r => [r.order_no, r.deposit_met, day(r.reached_on)]), [['W-IR', true, '2026-10-19']], 'a scheme with no deposit')

// ── Who may call it ──
const may = role => one(`SELECT has_function_privilege($1, 'public.revenue_tally_orders(uuid, date)', 'EXECUTE')`, [role])
check([await may('anon'), await may('authenticated'), await may('service_role')], [false, true, true], 'signed-in sessions and the service role; never the publishable key')
check(await one(`SELECT prosecdef FROM pg_proc WHERE proname = 'revenue_tally_orders'`), false, 'SECURITY INVOKER: the caller’s own row policies answer')
check(await one(`SELECT provolatile FROM pg_proc WHERE proname = 'revenue_tally_orders'`), 's', 'STABLE: it writes nothing')

console.log(`validate-tally-orders: ${checks} checks passed`)
