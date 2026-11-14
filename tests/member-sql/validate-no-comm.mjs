// Local PostgreSQL regression for 20261114200000 — a bill's menu › Don't count
// this bill… › No commission (2026-11-14; the user: "Down count（HR 那边）我觉得要
// 分为两种：1. 一种是指完全不出 commission，但他还是有算在 revenue，还有算在 margin
// 等等 2. 另外一种是不算 commission，同时也不算进 revenue、不算进 margin，跟他完全
// 没有关系"; asked who else goes unpaid: "整张单谁都不拿钱").
//
// The few production tables the list touches, stand-ins for the helpers it
// calls (period locks, the permission registry), Half comm's migration (the
// list No commission takes a half off), then the migration VERBATIM, twice.
// Checks: No commission puts the bill on the list with who and why; saying it
// again only changes why; it takes a half comm off; a bill that does not count
// is refused (23EXC); a paid month is refused both ways (23RUN), also straight
// on the table; Commission again takes it off; nothing on the bill itself
// changes; the bill leaving the portal takes its row; the registry rows. No
// live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
async function refused(sql, params, code, what) {
  try {
    await q(sql, params)
  } catch (error) {
    check(error.code ?? error.message, code, what)
    return
  }
  assert.fail(`${what}: was not refused`)
}

const SUB = id(1)
const BATCH = id(2)
const PAID_BATCH = id(3)
const SHAWN = id(11)
const HR_USER = id(21)
const NOV = '2026-11-01'
const OCT = '2026-10-01'

await db.exec(`
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;

  CREATE TABLE users (id uuid PRIMARY KEY, name text);
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text);
  CREATE TABLE sales_import_batches (
    id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL);
  CREATE TABLE sales_orders (
    id uuid PRIMARY KEY, order_no text NOT NULL, batch_id uuid NOT NULL REFERENCES sales_import_batches (id),
    period_month date NOT NULL, staff_id uuid REFERENCES hr_staff_costs (id),
    cancelled boolean NOT NULL DEFAULT false, order_total numeric NOT NULL DEFAULT 0);
  CREATE TABLE permission_table_writes (table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE permission_table_reads (table_name text PRIMARY KEY, actions text[]);

  -- Stand-ins for production's helpers: a month is locked when listed.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE FUNCTION has_any_action(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $2) $$;
  CREATE FUNCTION permission_writes_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION permission_reads_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE TABLE audit_tables (table_name text PRIMARY KEY, label text);
  CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}') RETURNS text LANGUAGE sql AS
    $$ INSERT INTO audit_tables VALUES (p_table, p_label) ON CONFLICT (table_name) DO UPDATE SET label = EXCLUDED.label RETURNING p_mode $$;
`)

const read = async name => (await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
// Half comm's list first — No commission takes a half off.
await db.exec(await read('20261110160000_half_comm.sql'))
const migration = await read('20261114200000_bill_no_commission.sql')
// A second run changes nothing.
await db.exec(migration)
await db.exec(migration)

await q(`INSERT INTO users VALUES ($1, 'HR')`, [HR_USER])
await q(`INSERT INTO hr_staff_costs VALUES ($1, 'SHAWN')`, [SHAWN])
await q(`INSERT INTO sales_import_batches VALUES ($1, $3, $4), ($2, $3, $5)`, [BATCH, PAID_BATCH, SUB, NOV, OCT])
const bill = async (n, over = {}) => {
  const orderId = id(100 + n)
  await q(`INSERT INTO sales_orders (id, order_no, batch_id, period_month, staff_id, cancelled, order_total)
           VALUES ($1, $2, $3, $4, $5, $6, 2700)`,
  [orderId, `HC-SO-2611-${String(n).padStart(3, '0')}`, over.batch ?? BATCH, over.month ?? NOV, SHAWN, over.cancelled ?? false])
  return orderId
}
await db.exec(`SET request.jwt.claim.sub = '${HR_USER}'`)

const none = async (orderId, note = null) => one('SELECT revenue_no_comm_order($1, $2)', [orderId, note])
const again = async orderId => one('SELECT revenue_comm_again_order($1)', [orderId])
const listed = async orderId => Number(await one('SELECT count(*) FROM sales_order_no_comm WHERE order_id = $1', [orderId]))

// ── No commission ────────────────────────────────────────────────────────────
const b44 = await bill(44)
check(await none(b44, '  keyed for ANTHONY  '), { orderNo: 'HC-SO-2611-044', changed: true, halfCommOff: false },
  'No commission puts the bill on the list')
check(await q('SELECT note, set_by, set_by_name FROM sales_order_no_comm WHERE order_id = $1', [b44]),
  [{ note: 'keyed for ANTHONY', set_by: HR_USER, set_by_name: 'HR' }], 'with who and why, trimmed')
check(await q('SELECT cancelled, order_total FROM sales_orders WHERE id = $1', [b44]),
  [{ cancelled: false, order_total: '2700' }], 'nothing on the bill itself changes — it still counts, its sales whole')

check(await none(b44, 'ZNT6430 — not his'), { orderNo: 'HC-SO-2611-044', changed: false, halfCommOff: false },
  'saying it again changes nothing on the list…')
check(await one('SELECT note FROM sales_order_no_comm WHERE order_id = $1', [b44]), 'ZNT6430 — not his', '…but why')
check(await none(b44), { orderNo: 'HC-SO-2611-044', changed: false, halfCommOff: false }, 'and without a why keeps the one it had')
check(await one('SELECT note FROM sales_order_no_comm WHERE order_id = $1', [b44]), 'ZNT6430 — not his', 'the why stays')

const b46 = await bill(46)
check(await none(b46, '   '), { orderNo: 'HC-SO-2611-046', changed: true, halfCommOff: false }, 'a blank why is no why')
check(await one('SELECT note FROM sales_order_no_comm WHERE order_id = $1', [b46]), null, 'stored as nothing')

// ── A half-comm bill: nothing is left to halve ───────────────────────────────
const b48 = await bill(48)
await one('SELECT revenue_half_comm_order($1, $2)', [b48, 'discount'])
check(await none(b48), { orderNo: 'HC-SO-2611-048', changed: true, halfCommOff: true }, 'No commission on a half-comm bill says it took the half off')
check(Number(await one('SELECT count(*) FROM sales_order_half_comm WHERE order_id = $1', [b48])), 0, 'the half is off the list')
check(await listed(b48), 1, 'and the bill pays nothing')

// ── Refusals ─────────────────────────────────────────────────────────────────
const out = await bill(80, { cancelled: true })
await refused('SELECT revenue_no_comm_order($1, NULL)', [out], '23EXC', 'a bill that does not count has no commission to take off')
check(await listed(out), 0, 'and is not listed')
await refused('SELECT revenue_no_comm_order($1, NULL)', [id(999)], 'P0001', 'a bill no longer in the portal')

const paid = await bill(90, { batch: PAID_BATCH, month: OCT })
await q(`INSERT INTO sales_order_no_comm (order_id) VALUES ($1)`, [paid])
await q(`INSERT INTO locked_months VALUES ($1)`, [OCT])
await refused('SELECT revenue_no_comm_order($1, NULL)', [await bill(91, { batch: PAID_BATCH, month: OCT })], '23RUN', 'a paid month cannot take a bill’s commission off')
await refused('SELECT revenue_comm_again_order($1)', [paid], '23RUN', 'nor pay one again')
await refused('DELETE FROM sales_order_no_comm WHERE order_id = $1', [paid], '23RUN', 'not even straight on the table')
await refused('INSERT INTO sales_order_no_comm (order_id) VALUES ($1)', [await bill(92, { batch: PAID_BATCH, month: OCT })], '23RUN', 'either way')
await refused('UPDATE sales_order_no_comm SET order_id = $2 WHERE order_id = $1', [b44, b46], 'P0001', 'a row belongs to one bill')

// ── Commission again ─────────────────────────────────────────────────────────
check(await again(b44), { orderNo: 'HC-SO-2611-044', changed: true }, 'Commission again takes it off')
check(await listed(b44), 0, 'the bill is off the list')
check(await again(b44), { orderNo: 'HC-SO-2611-044', changed: false }, 'and again changes nothing')
check(await q('SELECT cancelled FROM sales_orders WHERE id = $1', [b44]), [{ cancelled: false }], 'the bill counted all along')

// ── A bill that leaves the portal takes its row ──────────────────────────────
await q('DELETE FROM sales_orders WHERE id = $1', [b46])
check(await listed(b46), 0, 'cascade')

// ── The registry rows the app's twins read ───────────────────────────────────
check(await q("SELECT command, actions FROM permission_table_writes WHERE table_name = 'sales_order_no_comm' ORDER BY command"), [
  { command: 'DELETE', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
  { command: 'INSERT', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
  { command: 'UPDATE', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
], 'writing the list is Revenue’s work')
check(await one("SELECT actions FROM permission_table_reads WHERE table_name = 'sales_order_no_comm'"),
  ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'], 'reading it is whoever reads the month’s bills')
check(await one("SELECT label FROM audit_tables WHERE table_name = 'sales_order_no_comm'"), 'Bills paid no commission', 'its history is kept')
check(await q(`SELECT polname::text AS name FROM pg_policy WHERE polrelid = 'sales_order_no_comm'::regclass ORDER BY 1`),
  [{ name: 'sales_order_no_comm_read' }, { name: 'sales_order_no_comm_write' }], 'its row policies')
check(await one(`SELECT has_function_privilege('anon', 'revenue_no_comm_order(uuid, text)', 'EXECUTE')`), false, 'the anon key cannot call it')
check(await one(`SELECT has_function_privilege('anon', 'revenue_comm_again_order(uuid)', 'EXECUTE')`), false, 'nor undo it')
check(await one(`SELECT has_function_privilege('authenticated', 'revenue_no_comm_order(uuid, text)', 'EXECUTE')`), true, 'a signed-in user can')

console.log(`validate-no-comm: ${checks} checks passed`)
