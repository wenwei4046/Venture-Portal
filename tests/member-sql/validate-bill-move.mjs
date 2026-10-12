// Local PostgreSQL regression for 20261012170000 — right-click a bill › Move
// to another salesperson (2026-10-12; the user: "together with rightclick …
// can select move this order to other sales person").
//
// The few production tables the move touches, stand-ins for the helpers it
// calls (period locks, Open Bill months, the feed's suggestions), then the
// migration VERBATIM. Checks: a move makes the bill its new holder's and an
// ERP re-send or an agent match never puts the old name back; moving on keeps
// where it came from; moving back (or to nobody) hands it to the salesperson
// the ERP names; a paid month and a bill that does not count are refused; the
// new holder's share goes; the Open Bill pick leaves with the bill and comes
// back with it while its rank is free. No live I/O.
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
const ADRIAN = id(11)
const ANTHONY = id(12)
const LUCAS = id(13)
const NOBODY_YET = id(14)
const HR_USER = id(21)
const SEP = '2026-09-01'
const AUG = '2026-08-01'

await db.exec(`
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;

  CREATE TABLE users (id uuid PRIMARY KEY, name text);
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text);
  CREATE TABLE sales_import_batches (
    id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
    status text NOT NULL DEFAULT 'committed', source text NOT NULL DEFAULT 'erp_sync');
  CREATE TABLE sales_orders (
    id uuid PRIMARY KEY, order_no text NOT NULL, batch_id uuid NOT NULL REFERENCES sales_import_batches (id),
    period_month date NOT NULL, staff_id uuid REFERENCES hr_staff_costs (id), agent_key text NOT NULL,
    erp_salesperson_id text, event_date date NOT NULL, cancelled boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync');
  CREATE TABLE comm_agent_aliases (agent_key text PRIMARY KEY, staff_id uuid, erp_salesperson_id text);
  CREATE TABLE sales_order_shares (
    order_id uuid REFERENCES sales_orders (id) ON DELETE CASCADE, staff_id uuid, share_pct numeric,
    PRIMARY KEY (order_id, staff_id));
  CREATE TABLE sales_order_open_bill_tags (
    id serial PRIMARY KEY, order_id uuid UNIQUE REFERENCES sales_orders (id) ON DELETE CASCADE,
    sub_department_id uuid, staff_id uuid, event_date date, bill_rank smallint, auto_suggested boolean,
    tagged_by uuid, tagged_at timestamptz,
    CONSTRAINT uq_bill_rank_per_sub_staff_day UNIQUE (sub_department_id, staff_id, event_date, bill_rank));
  CREATE TABLE permission_table_writes (table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE permission_table_reads (table_name text PRIMARY KEY, actions text[]);

  -- Stand-ins for production's helpers: a month is locked when listed; Open
  -- Bill pays in a month when listed; the feed's suggestions and batch counts
  -- are recorded, not worked out.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE TABLE open_bill_months (month date PRIMARY KEY);
  CREATE TABLE suggested (staff_id uuid, event_date date);
  CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $2) $$;
  CREATE FUNCTION comm_open_bill_on(uuid, date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM open_bill_months WHERE month = $2) $$;
  CREATE FUNCTION erp_sync_suggest_open_bills(p_staff uuid, p_day date) RETURNS integer LANGUAGE sql AS
    $$ INSERT INTO suggested VALUES (p_staff, p_day) RETURNING 0 $$;
  CREATE FUNCTION erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION permission_writes_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION permission_reads_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}') RETURNS text LANGUAGE sql AS $$ SELECT p_mode $$;
`)

await db.exec(
  (await readFile(new URL('../../supabase/migrations/20261012170000_move_a_bill_to_another_salesperson.sql', import.meta.url), 'utf8'))
    .replace(/\r\n/g, '\n'),
)

await q(`INSERT INTO users VALUES ($1, 'HR')`, [HR_USER])
await q(`INSERT INTO hr_staff_costs VALUES ($1, 'ADRIAN'), ($2, 'ANTHONY'), ($3, 'LUCAS'), ($4, 'MEI TING')`,
  [ADRIAN, ANTHONY, LUCAS, NOBODY_YET])
await q(`INSERT INTO sales_import_batches (id, sub_department_id, period_month) VALUES ($1, $3, $4), ($2, $3, $5)`,
  [BATCH, PAID_BATCH, SUB, SEP, AUG])
await q(`INSERT INTO comm_agent_aliases VALUES ('ADRIAN', $1, 'EMP-7'), ('LUCAS', $2, NULL)`, [ADRIAN, LUCAS])
const bill = async (n, over = {}) => {
  const o = { batch: BATCH, month: SEP, staff: ADRIAN, agent: 'ADRIAN', sp: 'EMP-7', cancelled: false, ...over }
  await q(`INSERT INTO sales_orders (id, order_no, batch_id, period_month, staff_id, agent_key, erp_salesperson_id, event_date, cancelled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-09-14', $8)`,
  [id(100 + n), `HC-SO-2609-0${n}`, o.batch, o.month, o.staff, o.agent, o.sp, o.cancelled])
  return id(100 + n)
}
const staffOf = order => one('SELECT staff_id FROM sales_orders WHERE id = $1', [order])
const move = async (order, to, note = null) => (await q('SELECT revenue_move_order($1, $2, $3) AS r', [order, to, note]))[0].r
await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [HR_USER])

// ── A move, kept through the ERP and an agent match ──────────────────────────
const b70 = await bill(70)
const first = await move(b70, ANTHONY, 'keyed under the wrong name')
check([first.changed, first.staffId, first.fromStaffId, first.movedBack], [true, ANTHONY, ADRIAN, false], 'moved to ANTHONY')
check(await staffOf(b70), ANTHONY, 'the bill is ANTHONY’s')
check(await q('SELECT staff_id, from_staff_id, note, moved_by, moved_by_name FROM sales_order_reassignments WHERE order_id = $1', [b70]),
  [{ staff_id: ANTHONY, from_staff_id: ADRIAN, note: 'keyed under the wrong name', moved_by: HR_USER, moved_by_name: 'HR' }],
  'the move remembers whose it was, who moved it and why')
check(await q('SELECT staff_id FROM suggested ORDER BY staff_id'), [{ staff_id: ADRIAN }, { staff_id: ANTHONY }],
  'both salespeople’s day is suggested again')

// The ERP re-sends the document: ingest_erp_sales_order writes the alias's person.
await q('UPDATE sales_orders SET staff_id = $1, cancelled = false WHERE id = $2', [ADRIAN, b70])
check(await staffOf(b70), ANTHONY, 'an ERP re-send keeps the move')
// An agent matched on Data source rewrites every bill of it — but this one.
const b71 = await bill(71, { staff: null, agent: 'STRAY', sp: null })
await q("UPDATE sales_orders SET staff_id = $1 WHERE agent_key IN ('ADRIAN', 'STRAY')", [LUCAS])
check([await staffOf(b70), await staffOf(b71)], [ANTHONY, LUCAS], 'a match moves the agent’s other bills, not the moved one')

// ── On again, then back ──────────────────────────────────────────────────────
const again = await move(b70, LUCAS)
check([again.changed, again.fromStaffId, await staffOf(b70)], [true, ANTHONY, LUCAS], 'moved on to LUCAS')
check(await one('SELECT from_staff_id FROM sales_order_reassignments WHERE order_id = $1', [b70]), ADRIAN,
  'moving on keeps where it first came from')
check((await move(b70, LUCAS)).changed, false, 'moving a bill to its holder changes nothing')
const back = await move(b70, ADRIAN)
check([back.changed, back.movedBack, await staffOf(b70)], [true, true, ADRIAN], 'moved back to the ERP’s salesperson')
check(Number(await one('SELECT count(*) FROM sales_order_reassignments WHERE order_id = $1', [b70])), 0, 'the move came off')
await move(b70, ANTHONY)
const toNobody = await move(b70, null)
check([toNobody.movedBack, await staffOf(b70)], [true, ADRIAN], 'moving to nobody hands it back too')

// Taking the row off by hand hands it back to the alias — by the ERP's id first.
await move(b70, ANTHONY)
await q("UPDATE comm_agent_aliases SET staff_id = $1 WHERE agent_key = 'ADRIAN'", [LUCAS])
await q('DELETE FROM sales_order_reassignments WHERE order_id = $1', [b70])
check(await staffOf(b70), LUCAS, 'a row taken off hands the bill to whoever the alias names now')
await q("UPDATE comm_agent_aliases SET staff_id = $1 WHERE agent_key = 'ADRIAN'", [ADRIAN])
await q('UPDATE sales_orders SET staff_id = $1 WHERE id = $2', [ADRIAN, b70])

// ── A bill nobody was matched to ─────────────────────────────────────────────
const b72 = await bill(72, { staff: null, agent: 'NEW AGENT', sp: null })
const matched = await move(b72, NOBODY_YET)
check([matched.fromStaffId, await staffOf(b72)], [null, NOBODY_YET], 'an unmatched bill can be given to somebody')
check([(await move(b72, null)).movedBack, await staffOf(b72)], [true, null], 'and handed back to nobody')

// ── Refusals ─────────────────────────────────────────────────────────────────
const b73 = await bill(73, { cancelled: true })
await refused('SELECT revenue_move_order($1, $2, NULL)', [b73, ANTHONY], '23EXC', 'a bill that does not count is refused')
const b74 = await bill(74, { batch: PAID_BATCH, month: AUG })
await q('INSERT INTO locked_months VALUES ($1)', [AUG])
await refused('SELECT revenue_move_order($1, $2, NULL)', [b74, ANTHONY], '23RUN', 'a paid month is refused')
await refused('INSERT INTO sales_order_reassignments (order_id, staff_id) VALUES ($1, $2)', [b74, ANTHONY], '23RUN',
  'and the table refuses it too')
await refused('SELECT revenue_move_order($1, $2, NULL)', [id(999), ANTHONY], 'P0001', 'a bill no longer here says so')

// ── Shares ───────────────────────────────────────────────────────────────────
const b75 = await bill(75)
await q('INSERT INTO sales_order_shares VALUES ($1, $2, 0.3), ($1, $3, 0.2)', [b75, ANTHONY, LUCAS])
const shared = await move(b75, ANTHONY)
check([Number(shared.shareTaken), await staffOf(b75)], [0.3, ANTHONY], 'the new holder’s part goes — they hold it all')
check(await q('SELECT staff_id, share_pct::text FROM sales_order_shares WHERE order_id = $1', [b75]),
  [{ staff_id: LUCAS, share_pct: '0.2' }], 'the other holder keeps theirs')

// ── Open Bill: the pick leaves with the bill and comes back with it ──────────
await q('INSERT INTO open_bill_months VALUES ($1)', [SEP])
const b76 = await bill(76)
await q(`INSERT INTO sales_order_open_bill_tags (order_id, sub_department_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by)
         VALUES ($1, $2, $3, '2026-09-14', 1, false, $4)`, [b76, SUB, ADRIAN, HR_USER])
const picked = await move(b76, ANTHONY)
check([picked.openBillRank, Number(await one('SELECT count(*) FROM sales_order_open_bill_tags WHERE order_id = $1', [b76]))], [1, 0],
  'the pick ranked ADRIAN’s day: it leaves with the bill')
check(await one('SELECT open_bill_rank FROM sales_order_reassignments WHERE order_id = $1', [b76]), 1, 'and is remembered')
await move(b76, LUCAS)
check(await one('SELECT open_bill_rank FROM sales_order_reassignments WHERE order_id = $1', [b76]), 1,
  'moving on keeps the first holder’s pick')
const restored = await move(b76, ADRIAN)
check([restored.openBillBack, await one('SELECT bill_rank FROM sales_order_open_bill_tags WHERE order_id = $1', [b76]),
  await one('SELECT auto_suggested FROM sales_order_open_bill_tags WHERE order_id = $1', [b76])], [1, 1, false],
  'moved back, the pick comes back as it was made')

// …unless somebody claimed the rank by hand meanwhile.
const b77 = await bill(77)
await q(`INSERT INTO sales_order_open_bill_tags (order_id, sub_department_id, staff_id, event_date, bill_rank, auto_suggested)
         VALUES ($1, $2, $3, '2026-09-14', 2, false)`, [b77, SUB, ADRIAN])
await move(b77, ANTHONY)
const b78 = await bill(78)
await q(`INSERT INTO sales_order_open_bill_tags (order_id, sub_department_id, staff_id, event_date, bill_rank, auto_suggested)
         VALUES ($1, $2, $3, '2026-09-14', 2, false)`, [b78, SUB, ADRIAN])
const taken = await move(b77, ADRIAN)
check([taken.movedBack, taken.openBillBack, Number(await one('SELECT count(*) FROM sales_order_open_bill_tags WHERE order_id = $1', [b77]))],
  [true, null, 0], 'a rank taken by hand meanwhile is not taken back')

// ── The registry rows the app's twins read ───────────────────────────────────
check(await q("SELECT command, actions FROM permission_table_writes WHERE table_name = 'sales_order_reassignments' ORDER BY command"), [
  { command: 'DELETE', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
  { command: 'INSERT', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
  { command: 'UPDATE', actions: ['revenue.create', 'revenue.edit', 'revenue.manage'] },
], 'writing the moves is Revenue’s work')
check(await one("SELECT actions FROM permission_table_reads WHERE table_name = 'sales_order_reassignments'"),
  ['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'], 'reading them is whoever reads the month’s bills')

console.log(`validate-bill-move: ${checks} checks passed`)
