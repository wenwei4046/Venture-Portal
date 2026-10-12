// Local PostgreSQL regression for 20261012200000 — a late key-in whose sale
// month is paid or closed to the feed lands in a month still open (2026-10-12;
// the user: late key-ins "will go in the table as well … commission will jump
// to the same month, then show up with different colour"; "can go for b").
//
// The receiver (ingest_erp_sales_order) runs VERBATIM from the migration, on
// the tables it writes and stand-ins for the helpers around it: a month is
// paid when listed in locked_months, closed to the feed when listed in
// closed_months or before the cutover (September 2026), and every lock taken is
// recorded. Checks: a new document of an open sale month lands there, as
// before; of a paid month, in the month it was keyed, the log saying why; of a
// closed month (before the cutover), in the first month still open; its
// re-sends keep it there; nothing open — still held, unwritten; a bill already
// in a paid month is still held and its change noted; a draft is still
// skipped. No live I/O.
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

const FAIR_SUB = id(1)
const LUCAS = id(11)
const SEP = '2026-09-01'
const OCT = '2026-10-01'

await db.exec(`
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text);
  CREATE TABLE sales_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    file_name text, source text NOT NULL DEFAULT 'erp_sync', status text NOT NULL DEFAULT 'committed', notes text);
  CREATE UNIQUE INDEX uq_batch_committed ON sales_import_batches (sub_department_id, period_month) WHERE status = 'committed';
  CREATE TABLE sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches (id),
    period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date NOT NULL,
    debtor_code text, customer_name text, agent_name text NOT NULL, agent_key text NOT NULL,
    staff_id uuid REFERENCES hr_staff_costs (id), location text, venue text, brand_code text,
    order_total numeric NOT NULL DEFAULT 0, balance numeric, cancelled boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync', erp_status text, erp_on_hold boolean, erp_salesperson_id text,
    erp_company_id bigint, erp_snapshot_at timestamptz, erp_created_at timestamptz, synced_at timestamptz,
    raw jsonb, fair_event_id uuid, fair_source text, sequence_in_day integer);
  CREATE TABLE sales_order_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES sales_orders (id) ON DELETE CASCADE,
    line_no integer, item_group text, product_code text, product_name text, description2 text, uom text,
    location text, qty numeric, unit_price numeric, line_amount numeric, brand_code text, cost_amount numeric, raw jsonb);
  CREATE TABLE comm_products (item_code text, unit_cost numeric, is_active boolean);
  CREATE TABLE comm_venues (venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE sales_order_open_bill_tags (order_id uuid, auto_suggested boolean);
  CREATE TABLE comm_upsales (sub_department_id uuid, erp_doc_no text, status text);
  CREATE TABLE erp_feed_settings (sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE comm_agent_aliases (erp_salesperson_id text, agent_key text, staff_id uuid);
  CREATE TABLE erp_sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, period_month date, status text, message text,
    payload jsonb, received_at timestamptz NOT NULL DEFAULT clock_timestamp());

  -- Stand-ins for production's helpers.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE TABLE closed_months (month date PRIMARY KEY);
  CREATE TABLE lock_log (n serial, month date);
  CREATE TABLE adjustments (order_id uuid);
  CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql AS $$ SELECT '${FAIR_SUB}'::uuid $$;
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION erp_sync_period_locked(date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $1) $$;
  CREATE FUNCTION erp_sync_period_closed(date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM closed_months WHERE month = $1) OR $1 < '2026-09-01'::date $$;
  CREATE FUNCTION lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO lock_log (month) SELECT DISTINCT d FROM unnest($2) d WHERE d IS NOT NULL ORDER BY d $$;
  CREATE FUNCTION erp_sync_log(p_doc text, p_period date, p_status text, p_message text, p_warnings text[],
    p_snapshot timestamptz, p_payload jsonb, p_replay_of uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO erp_sync_events (doc_no, period_month, status, message, payload)
    VALUES (p_doc, p_period, p_status, p_message, p_payload) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', p_status, 'periodMonth', p_period, 'message', p_message, 'eventId', v_id);
  END $$;
  CREATE FUNCTION erp_sync_fair(p jsonb) RETURNS uuid LANGUAGE sql AS
    $$ SELECT CASE WHEN p IS NULL OR p->>'startDate' IS NULL THEN NULL ELSE md5(p->>'startDate')::uuid END $$;
  CREATE FUNCTION venue_event_for_order(text, date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION erp_sync_note_adjustment(uuid, jsonb, uuid) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO adjustments VALUES ($1) $$;
  CREATE FUNCTION erp_sync_order_brand(jsonb, uuid) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION venue_key(text) RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(UPPER(BTRIM($1)), '') $$;
  CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_suggest_open_bills(uuid, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  INSERT INTO hr_staff_costs VALUES ('${LUCAS}', 'LUCAS');
  INSERT INTO comm_agent_aliases VALUES (NULL, 'LUCAS', '${LUCAS}');
  INSERT INTO erp_feed_settings VALUES ('${FAIR_SUB}', '2026-08-01');
`)

await db.exec((await readFile(new URL('../../supabase/migrations/20261012200000_late_key_ins_land_in_an_open_month.sql', import.meta.url), 'utf8'))
  .replace(/\r\n/g, '\n'))

let snapshot = 0
const fairOf = (day, start, end) => ({ fairDate: day, startDate: start, endDate: end, venue: 'MID VALLEY' })
const deliver = async (docNo, orderDate, fair = null, extra = {}) =>
  (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify({
    docNo, orderDate, salespersonName: 'Lucas', total: 5000, balance: 5000, lines: [], venue: 'MID VALLEY',
    snapshotAt: `2026-10-12T01:00:${String(++snapshot).padStart(2, '0')}Z`,
    ...(fair ? { fair } : {}), ...extra,
  })]))[0].r
const monthOf = async docNo =>
  (await q(`SELECT period_month::text AS month FROM sales_orders WHERE order_no = $1`, [docNo]))[0]?.month
const SEP_FAIR = fairOf('2026-09-27', '2026-09-25', '2026-09-29')

// ── A sale month still open: where it was sold, as before ────────────────────
const open = await deliver('HC-SO-2610-301', '2026-10-10', fairOf('2026-09-26', '2026-09-25', '2026-09-29'))
check([open.status, open.periodMonth, open.message], ['applied', SEP, 'created'],
  'September is open: a September fair’s bill keyed in October is September’s, as before')

// ── September paid: a new late key-in lands in October ───────────────────────
await q('INSERT INTO locked_months VALUES ($1)', [SEP])
await q('DELETE FROM lock_log')
const late = await deliver('HC-SO-2610-302', '2026-10-20', SEP_FAIR)
check([late.status, late.periodMonth], ['applied', OCT], 'September paid: it lands in October, the month it was keyed')
check(late.message, 'created — keyed late: sold in September 2026, which is paid, so it counts in October 2026',
  'and the feed’s log says why')
check(await monthOf('HC-SO-2610-302'), OCT, 'it is written, in October')
check(await q(`SELECT fair_event_id::text AS fair, fair_source, order_date::text AS keyed FROM sales_orders WHERE order_no = 'HC-SO-2610-302'`),
  [{ fair: await one(`SELECT md5('2026-09-25')::uuid::text`), fair_source: 'erp', keyed: '2026-10-20' }],
  'it keeps its September fair — Comm Cal reads Late key-in · Sep 2026 fair from it')
check((await q('SELECT month::text FROM lock_log ORDER BY n')).map(r => r.month).includes(OCT), true,
  'October’s lock is taken before it is written')

// Its re-sends keep it in October — never held for September.
const resent = await deliver('HC-SO-2610-302', '2026-10-20', SEP_FAIR, { total: 5200 })
check([resent.status, resent.periodMonth, resent.message], ['applied', OCT, 'updated'], 'a re-send keeps it in October')
check(Number(await one(`SELECT order_total FROM sales_orders WHERE order_no = 'HC-SO-2610-302'`)), 5200, 'and writes the change')

// ── Before the cutover (closed to the feed): the first month still open ──────
const august = await deliver('HC-SO-2609-303', '2026-09-28', fairOf('2026-08-30', '2026-08-28', '2026-08-31'))
check([august.status, august.periodMonth], ['applied', OCT],
  'an August fair keyed in September, September paid: the first month still open is October')
check(august.message, 'created — keyed late: sold in August 2026, which is closed to the ERP feed, so it counts in October 2026',
  'closed, not paid, the log says')

// A bill with no fair day, dated into a paid month, is the same late key-in.
const undated = await deliver('HC-SO-2610-305', '2026-09-30')
check([undated.status, undated.periodMonth], ['applied', OCT], 'a document dated into a paid month lands in the next open one')

// ── Nothing open up to the office's month: held, as before ───────────────────
await q(`INSERT INTO locked_months SELECT d::date FROM generate_series('2026-10-01'::date, '2030-12-01'::date, interval '1 month') d`)
const stuck = await deliver('HC-SO-2610-304', '2026-10-21', SEP_FAIR)
check([stuck.status, stuck.periodMonth], ['held', SEP], 'every month paid: held under its sale month')
check(stuck.message, 'the month\'s commission run is applied or locked — reopen it and replay', 'with the old reason')
check(await monthOf('HC-SO-2610-304'), undefined, 'and not written')
await q(`DELETE FROM locked_months WHERE month >= '2026-10-01'`)

// ── A bill already in a paid month: held, its change a drop or an upsell ─────
const paidResend = await deliver('HC-SO-2610-301', '2026-10-10', fairOf('2026-09-26', '2026-09-25', '2026-09-29'), { total: 4800 })
check([paidResend.status, paidResend.periodMonth], ['held', SEP], 'a re-send of a bill in a paid month is still held')
check(Number(await one('SELECT count(*) FROM adjustments')), 1, 'and noted as a drop or an upsell')
check(await monthOf('HC-SO-2610-301'), SEP, 'it never moves to October')

// ── A new draft is still not a sale ──────────────────────────────────────────
check((await deliver('HC-SO-2610-306', '2026-10-22', SEP_FAIR, { status: 'DRAFT' })).status, 'skipped',
  'a new draft is skipped, paid month or not')

// ── Before the feed window: still skipped ────────────────────────────────────
check((await deliver('HC-SO-2607-307', '2026-07-20', fairOf('2026-07-18', '2026-07-17', '2026-07-19'))).status, 'skipped',
  'a document dated before the feed window is still not kept')

console.log(`validate-late-key-in: ${checks} checks passed`)
