// Local PostgreSQL regression for 20261121100000 — an old bill changed in the ERP is an upsell or a drop to answer
// (2026-11-21; the user, of HC-SO-009046 — LUIS, Ref HC10418 + HC10419, opened 10 Nov 2025, TRION RM 1,040 + CASUAL
// RM 520 added on 19 Nov 2026: "一旦在 ERP 的任何一个 SO 有任何改动数字的话，都要把它同步到 portal 里面 … 现在这个 SO 是 2025
// 年的旧单 … 可是它就没有进去 portal"; the proposal taken as written: "可以，找你建议做").
//
// The migration's new function, erp_sync_old_bill_change(), is cut from the migration file VERBATIM and run over
// production's own erp_order_state, erp_sync_lines_value, erp_order_change_kind, erp_sync_note_change,
// sales_order_bill_ref and sales_order_ref_no (pg_get_functiondef, 2026-11-21) and stand-ins for the rest. The swap
// in ingest_erp_sales_order was dry-run on production (BEGIN … ROLLBACK): the function is asked where the receiver
// answers "dated before the feed window" for a document it never kept. Checks: the first sight of HC-SO-009046 keeps
// the bill as settled by hand (the lines keyed before September 2026) and asks LUIS's RM 1,560 upsell in the month
// still open, Ref HC10418, settled by hand in November 2025; a later save that takes a line off makes it RM 1,040; the
// same save again asks nothing new; a figure let stand is measured from, a confirmed one counted; a cancellation is a
// drop to answer, never taken back directly; nothing is asked on a bill under its deposit then, one the ERP rewrote
// line by line, one nobody the portal pays sold or whose salesperson has left; a deleted one and one the portal once
// kept as its own bill are not this rule's; the log says what the rule found and keeps the payload; a fault is a
// warning on the delivery. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261121100000_old_bill_changes.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1)
const SCHEME = id(2)
const LUIS = id(11)
const GONE = id(12)
const LUIS_ERP = '8e92ce87-ef5e-ca80-7efa-e4f5ed1877e0'
const GONE_ERP = 'aaaaaaaa-0000-4000-8000-000000000012'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, status text NOT NULL DEFAULT 'active', resignation_date date);
  CREATE TABLE comm_agent_aliases (erp_salesperson_id text, agent_key text, staff_id uuid);
  CREATE TABLE comm_schemes (id uuid PRIMARY KEY, sub_department_id uuid, deposit_threshold_pct numeric);
  CREATE TABLE comm_item_groups (scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE erp_sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, status text, message text,
    warnings text[] NOT NULL DEFAULT '{}', payload jsonb, received_at timestamptz NOT NULL DEFAULT clock_timestamp());
  CREATE TABLE sales_order_erp_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, order_no text NOT NULL,
    order_id uuid, event_id uuid REFERENCES erp_sync_events (id), saved_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    outcome text NOT NULL CHECK (outcome IN ('applied', 'held')), period_month date,
    kind text NOT NULL CHECK (kind IN ('opened', 'upsell', 'drop', 'cancelled', 'deleted', 'on_hold', 'reinstated', 'changed')),
    total_before numeric, total_after numeric, commissionable_before numeric, commissionable_after numeric,
    status_before text, status_after text, state_before jsonb, state_after jsonb NOT NULL,
    settled_amount numeric, settled_period date, settled_by text, adjustment_id uuid, money_moved boolean);
  CREATE TABLE comm_upsales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    staff_id uuid NOT NULL REFERENCES hr_staff_costs (id), amount numeric NOT NULL, sold_on date NOT NULL,
    original_ref text NOT NULL CHECK (btrim(original_ref) <> ''), note text,
    created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL DEFAULT 'upsale', status text NOT NULL DEFAULT 'confirmed', source text NOT NULL DEFAULT 'manual',
    erp_doc_no text, erp_event_id uuid REFERENCES erp_sync_events (id), settled_amount numeric, erp_amount numeric,
    original_period date, decided_by uuid, decided_at timestamptz, erp_reason text, settled_period date,
    settled_by text, answered_by_feed boolean NOT NULL DEFAULT false, settled_order_id uuid,
    CONSTRAINT comm_upsales_amount_signed CHECK ((kind = 'upsale' AND amount > 0) OR (kind = 'drop' AND amount < 0)),
    CONSTRAINT comm_upsales_erp_reason_known CHECK (erp_reason IS NULL OR erp_reason IN ('amount', 'cancelled', 'deleted', 'on_hold', 'not_counted', 'reinstated')),
    CONSTRAINT comm_upsales_settled_by_known CHECK (settled_by IS NULL OR settled_by IN ('run', 'close', 'hand', 'frozen')),
    CONSTRAINT comm_upsales_status_known CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    CONSTRAINT comm_upsales_month_is_first CHECK (period_month = date_trunc('month', period_month)::date));
  CREATE UNIQUE INDEX uq_comm_upsales_pending_erp_doc ON comm_upsales (sub_department_id, erp_doc_no)
    WHERE status = 'pending' AND erp_doc_no IS NOT NULL;

  -- Stand-ins.
  CREATE FUNCTION erp_sync_scheme_of(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM comm_schemes WHERE sub_department_id = $1 $$;
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION erp_sync_settled_basis(uuid) RETURNS TABLE(amount numeric, period date, settled_by text, staff_id uuid, settled_at timestamptz)
    LANGUAGE sql AS $$ SELECT NULL::numeric, NULL::date, NULL::text, NULL::uuid, NULL::timestamptz WHERE false $$;

  -- Production's own (2026-11-21).
  CREATE OR REPLACE FUNCTION public.erp_sync_lines_value(p_lines jsonb, p_scheme uuid)
   RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
      SELECT COALESCE(ROUND(SUM(COALESCE(NULLIF(l->>'amount', '')::NUMERIC, 0)), 2), 0)
        FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_lines) = 'array' THEN p_lines ELSE '[]'::JSONB END) l
        JOIN comm_item_groups g
          ON g.scheme_id = p_scheme
         AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(COALESCE(l->>'itemGroup', '')))
         AND g.commissionable;
  $function$;
  CREATE OR REPLACE FUNCTION public.erp_order_state(p_order jsonb, p_scheme uuid)
   RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
      WITH h AS (
          SELECT UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED')) AS status,
                 COALESCE((p_order->>'onHold')::BOOLEAN, FALSE) AS on_hold,
                 COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) AS deleted
      ), l AS (
          SELECT JSONB_BUILD_OBJECT(
                     'lineNo', COALESCE(NULLIF(x.line->>'lineNo', '')::INTEGER, x.ord::INTEGER),
                     'itemGroup', COALESCE(NULLIF(BTRIM(x.line->>'itemGroup'), ''), 'UNGROUPED'),
                     'itemCode', COALESCE(NULLIF(BTRIM(x.line->>'itemCode'), ''), '(none)'),
                     'description', NULLIF(x.line->>'description', ''),
                     'variant', NULLIF(x.line->>'description2', ''),
                     'qty', COALESCE(NULLIF(x.line->>'qty', '')::NUMERIC, 0),
                     'unitPrice', ROUND(COALESCE(NULLIF(x.line->>'unitPrice', '')::NUMERIC, 0), 2),
                     'amount', ROUND(COALESCE(NULLIF(x.line->>'amount', '')::NUMERIC, 0), 2)) AS line
            FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'lines') = 'array' THEN p_order->'lines' ELSE '[]'::JSONB END)
                 WITH ORDINALITY AS x(line, ord)
      )
      SELECT JSONB_BUILD_OBJECT(
          'status', h.status,
          'onHold', h.on_hold,
          'deleted', h.deleted,
          'total', ROUND(COALESCE(NULLIF(p_order->>'total', '')::NUMERIC, 0), 2),
          'balance', ROUND(NULLIF(p_order->>'balance', '')::NUMERIC, 2),
          'commissionable', CASE WHEN h.deleted OR h.on_hold OR h.status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') THEN 0
                                 ELSE erp_sync_lines_value(p_order->'lines', p_scheme) END,
          'salespersonId', NULLIF(BTRIM(p_order->>'salespersonId'), ''),
          'salesperson', COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), '(no salesperson)'),
          'customer', NULLIF(p_order->>'customerName', ''),
          'orderDate', NULLIF(p_order->>'orderDate', ''),
          'venue', NULLIF(BTRIM(p_order->>'venue'), ''),
          'fairDate', NULLIF(p_order->'raw'->'fair'->>'fairDate', ''),
          'lines', COALESCE((SELECT JSONB_AGG(l.line ORDER BY (l.line->>'lineNo')::INTEGER, l.line->>'itemCode', (l.line->>'amount')::NUMERIC)
                               FROM l), '[]'::JSONB))
        FROM h;
  $function$;
  CREATE OR REPLACE FUNCTION public.erp_order_change_kind(p_before jsonb, p_after jsonb)
   RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
  AS $function$
      SELECT CASE
          WHEN p_before IS NULL THEN 'opened'
          WHEN COALESCE((p_after->>'deleted')::BOOLEAN, FALSE) AND NOT COALESCE((p_before->>'deleted')::BOOLEAN, FALSE) THEN 'deleted'
          WHEN s.after_out AND NOT s.before_out THEN
              CASE WHEN UPPER(COALESCE(p_after->>'status', '')) = 'CANCELLED' THEN 'cancelled' ELSE 'on_hold' END
          WHEN s.before_out AND NOT s.after_out THEN 'reinstated'
          WHEN COALESCE((p_after->>'commissionable')::NUMERIC, 0) > COALESCE((p_before->>'commissionable')::NUMERIC, 0) THEN 'upsell'
          WHEN COALESCE((p_after->>'commissionable')::NUMERIC, 0) < COALESCE((p_before->>'commissionable')::NUMERIC, 0) THEN 'drop'
          ELSE 'changed'
      END
        FROM (SELECT
                COALESCE((p_before->>'deleted')::BOOLEAN, FALSE) OR COALESCE((p_before->>'onHold')::BOOLEAN, FALSE)
                  OR UPPER(COALESCE(p_before->>'status', '')) IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED') AS before_out,
                COALESCE((p_after->>'deleted')::BOOLEAN, FALSE) OR COALESCE((p_after->>'onHold')::BOOLEAN, FALSE)
                  OR UPPER(COALESCE(p_after->>'status', '')) IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED') AS after_out) s;
  $function$;
  CREATE OR REPLACE FUNCTION public.erp_sync_note_change(p_sub_department_id uuid, p_doc_no text, p_order_id uuid, p_event_id uuid, p_outcome text, p_period date, p_before jsonb, p_after jsonb, p_saved_at timestamp with time zone, p_received_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
   RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
  AS $function$
  DECLARE
      v_id      UUID;
      v_settled NUMERIC(15, 2);
      v_period  DATE;
      v_by      TEXT;
      v_adjust  UUID;
  BEGIN
      IF p_after IS NULL OR p_before IS NOT DISTINCT FROM p_after THEN
          RETURN NULL;
      END IF;
      IF p_order_id IS NOT NULL THEN
          SELECT b.amount, b.period, b.settled_by INTO v_settled, v_period, v_by
            FROM erp_sync_settled_basis(p_order_id) b;
          IF v_settled IS NOT NULL AND erp_order_change_kind(p_before, p_after) NOT IN ('changed', 'opened') THEN
              SELECT u.id INTO v_adjust
                FROM comm_upsales u
               WHERE u.sub_department_id = p_sub_department_id AND u.erp_doc_no = p_doc_no
                 AND (u.status = 'pending' OR (u.answered_by_feed AND u.erp_event_id = p_event_id))
               ORDER BY (u.status = 'pending') DESC, u.created_at DESC
               LIMIT 1;
          END IF;
      END IF;

      INSERT INTO sales_order_erp_changes (
          sub_department_id, order_no, order_id, event_id, saved_at, received_at, outcome, period_month, kind,
          total_before, total_after, commissionable_before, commissionable_after, status_before, status_after,
          state_before, state_after, settled_amount, settled_period, settled_by, adjustment_id)
      VALUES (
          p_sub_department_id, p_doc_no, p_order_id, p_event_id, p_saved_at, COALESCE(p_received_at, NOW()), p_outcome,
          p_period, erp_order_change_kind(p_before, p_after),
          (p_before->>'total')::NUMERIC, (p_after->>'total')::NUMERIC,
          (p_before->>'commissionable')::NUMERIC, (p_after->>'commissionable')::NUMERIC,
          p_before->>'status', p_after->>'status',
          p_before, p_after,
          v_settled, v_period, v_by, v_adjust)
      RETURNING id INTO v_id;
      RETURN v_id;
  END;
  $function$;
  CREATE OR REPLACE FUNCTION public.sales_order_ref_no(p_header jsonb)
   RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
  AS $function$
      SELECT COALESCE(NULLIF(BTRIM(p_header->>'customer_so_no'), ''),
                      NULLIF(BTRIM(p_header->>'ref'), ''));
  $function$;
  CREATE OR REPLACE FUNCTION public.sales_order_bill_ref(p_order_no text, p_customer_so_no text)
   RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
  AS $function$
      SELECT COALESCE(
          UPPER(REGEXP_REPLACE(SUBSTRING(p_customer_so_no FROM '[A-Za-z]{2,4}\\s*-?\\s*[0-9]{3,}'), '[\\s-]', '', 'g')),
          UPPER(REGEXP_REPLACE(BTRIM(p_order_no), '\\s', '', 'g')));
  $function$;

  INSERT INTO hr_staff_costs (id, employee_name, status, resignation_date) VALUES
    ('${LUIS}', 'LUIS TEO', 'active', NULL), ('${GONE}', 'GONE', 'active', '2026-10-31');
  INSERT INTO comm_agent_aliases VALUES ('${LUIS_ERP}', 'LUIS TEO', '${LUIS}'), ('${GONE_ERP}', 'GONE', '${GONE}');
  INSERT INTO comm_schemes VALUES ('${SCHEME}', '${FAIR}', 0.30);
  INSERT INTO comm_item_groups VALUES ('${SCHEME}', 'mattress', true), ('${SCHEME}', 'bedframe', true),
    ('${SCHEME}', 'accessory', true), ('${SCHEME}', 'transport', false);
`)

// The migration's new function, exactly as the file has it.
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r/g, '')
const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.erp_sync_old_bill_change')
const end = migration.indexOf('-- ── 2. The receiver asks it')
assert.ok(start > 0 && end > start, 'the migration carries the function')
await db.exec(migration.slice(start, end))
check(await one(`SELECT has_function_privilege('anon', 'public.erp_sync_old_bill_change(uuid, text, jsonb, uuid, jsonb)', 'EXECUTE')`),
  false, 'anon may not call it')
check(await one(`SELECT has_function_privilege('authenticated', 'public.erp_sync_old_bill_change(uuid, text, jsonb, uuid, jsonb)', 'EXECUTE')`),
  true, 'a replay (HR) may')

// The month the office is in, as the function reads it.
const officeMonth = await one(`SELECT GREATEST(DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE)::DATE, '2026-09-01'::date)::text`)

const L1 = { lineNo: 1, itemGroup: 'mattress', itemCode: 'AKEMI ULTIMATE MATT (K)', qty: 1, unitPrice: 3888, amount: 3888 }
const L2 = { lineNo: 2, itemGroup: 'bedframe', itemCode: 'TRION (A) (HB STR)-(K)', qty: 1, unitPrice: 1040, amount: 1040 }
const L3 = { lineNo: 3, itemGroup: 'bedframe', itemCode: 'CASUAL-(Q)', qty: 1, unitPrice: 520, amount: 520 }
const L4 = { lineNo: 4, itemGroup: 'accessory', itemCode: 'AERO-MP (K)', qty: 1, unitPrice: 200, amount: 200 }
const T5 = { lineNo: 5, itemGroup: 'transport', itemCode: 'TRANSPORT', qty: 1, unitPrice: 100, amount: 100 }
const OLD = '2025-11-10T03:00:00Z'
const NEW = '2026-11-19T10:01:00Z'
const PAID = [{ id: 'p1', paid_at: '2025-11-10', amount_sen: 200000 }]

const order = ({ doc = 'HC-SO-009046', lines, keyed, status = 'CONFIRMED', payments = PAID, sp = LUIS_ERP, name = 'LUIS',
  deleted = false, snapshot = '2026-11-21T01:00:00Z', ref = 'HC10418 + HC10419' }) => ({
  docNo: doc, orderDate: '2025-11-10', status, onHold: false, deleted, salespersonId: sp, salespersonName: name,
  customerName: 'Jwen Ma', snapshotAt: snapshot,
  total: lines.reduce((s, l) => s + l.amount, 0),
  lines,
  raw: {
    header: { customer_so_no: ref },
    items: lines.map(l => ({ line_no: l.lineNo, created_at: keyed[l.lineNo] })),
    payments,
    salesperson: { id: sp, name, active: true },
  },
})

// The receiver's side, as the swap makes it: the delivery is logged skipped, then the rule is asked with what the
// portal knew of the document before (erp_sync_known_state: the trail's latest state).
const deliver = async (o) => {
  const ev = await one(`INSERT INTO erp_sync_events (doc_no, status, message)
    VALUES ($1, 'skipped', 'dated before the feed window (2026-08-01) — its salesperson still works here') RETURNING id`, [o.docNo])
  const before = (await q(`SELECT state_after FROM sales_order_erp_changes WHERE sub_department_id = $1 AND order_no = $2
    ORDER BY received_at DESC, saved_at DESC NULLS LAST, id DESC LIMIT 1`, [FAIR, o.docNo]))[0]?.state_after ?? null
  const note = await one(`SELECT erp_sync_old_bill_change($1, $2, $3, $4, $5)`, [FAIR, o.docNo, o, ev, before])
  const event = (await q(`SELECT message, warnings, payload IS NOT NULL AS kept FROM erp_sync_events WHERE id = $1`, [ev]))[0]
  return { ev, note, event }
}
const pending = async (doc = 'HC-SO-009046') => (await q(
  `SELECT amount::float AS amount, kind, staff_id, period_month::text AS period, original_ref, settled_amount::float AS settled,
          erp_amount::float AS erp, settled_by, settled_period::text AS settled_period, original_period::text AS original_period,
          erp_reason, source, note
     FROM comm_upsales WHERE erp_doc_no = $1 AND status = 'pending'`, [doc]))[0] ?? null
const trail = async (doc = 'HC-SO-009046') => (await q(
  `SELECT kind, commissionable_before::float AS cb, commissionable_after::float AS ca, outcome, order_id, adjustment_id IS NOT NULL AS asked,
          period_month::text AS period
     FROM sales_order_erp_changes WHERE order_no = $1 ORDER BY received_at, saved_at NULLS FIRST, id`, [doc]))

// ── HC-SO-009046: first seen with the upsell already in ──────────────────────────────────────────────────────────
let r = await deliver(order({ lines: [L1, L2, L3], keyed: { 1: OLD, 2: NEW, 3: NEW } }))
check(r.note, `old bill: upsell of RM 1,560.00 since it was settled by hand in November 2025 — asked on ${new Date(officeMonth).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}'s Drops & upsells`, 'the rule says what it found')
check(r.event.message.startsWith('dated before the feed window (2026-08-01) — old bill: upsell of RM 1,560.00'), true,
  'the log says it, in place of the topped-up rule\'s reason')
check(r.event.kept, true, 'and keeps the payload')
check(await pending(), {
  amount: 1560, kind: 'upsale', staff_id: LUIS, period: officeMonth, original_ref: 'HC10418', settled: 3888, erp: 5448,
  settled_by: 'frozen', settled_period: '2025-11-01', original_period: '2025-11-01', erp_reason: 'amount', source: 'erp',
  note: 'The ERP changed HC-SO-009046 — an old bill of November 2025, its commission settled by hand then',
}, 'LUIS\'s RM 1,560 upsell waits on the month still open, settled by hand in November 2025')
check(await trail(), [
  { kind: 'opened', cb: null, ca: 3888, outcome: 'held', order_id: null, asked: false, period: '2025-11-01' },
  { kind: 'upsell', cb: 3888, ca: 5448, outcome: 'held', order_id: null, asked: true, period: '2025-11-01' },
], 'the bill as settled is kept once, the change points at its question')

// ── A later save takes CASUAL off ──────────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, snapshot: '2026-11-21T02:00:00Z', ref: 'HC10418' }))
check((await pending()).amount, 1040, 'measured from the bill as settled: RM 1,040')
check(await one(`SELECT count(*)::int FROM comm_upsales WHERE erp_doc_no = 'HC-SO-009046'`), 1, 'one question per document')
check((await trail()).map(t => t.kind), ['opened', 'upsell', 'drop'], 'the save is on the trail')

// ── The same save again ────────────────────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, snapshot: '2026-11-21T02:00:00Z', ref: 'HC10418' }))
check((await trail()).length, 3, 'nothing changed, nothing on the trail')
check((await pending()).amount, 1040, 'the question as it was')

// ── A line that earns nothing moves no question ──────────────────────────────────────────────────────────────────
r = await deliver(order({ lines: [L1, L2, T5], keyed: { 1: OLD, 2: NEW, 5: NEW }, snapshot: '2026-11-21T03:00:00Z', ref: 'HC10418' }))
check((await pending()).amount, 1040, 'transport is not commissionable')

// ── Let stand, then another line ─────────────────────────────────────────────────────────────────────────────────
await db.exec(`UPDATE comm_upsales SET status = 'dismissed', decided_at = now() WHERE erp_doc_no = 'HC-SO-009046' AND status = 'pending'`)
r = await deliver(order({ lines: [L1, L2, L4], keyed: { 1: OLD, 2: NEW, 4: NEW }, snapshot: '2026-11-21T04:00:00Z', ref: 'HC10418' }))
check((await pending()).amount, 200, 'a figure let stand is what the next change is measured from')
check((await pending()).settled, 4928, 'the ERP\'s figure that stood')

// ── Paid, then cancelled ─────────────────────────────────────────────────────────────────────────────────────────
await db.exec(`UPDATE comm_upsales SET status = 'confirmed', decided_at = now() WHERE erp_doc_no = 'HC-SO-009046' AND status = 'pending'`)
r = await deliver(order({ lines: [L1, L2, L4], keyed: { 1: OLD, 2: NEW, 4: NEW }, status: 'CANCELLED', snapshot: '2026-11-21T05:00:00Z', ref: 'HC10418' }))
const drop = await pending()
check([drop.amount, drop.kind, drop.erp_reason, drop.erp], [-5128, 'drop', 'cancelled', 0],
  'a cancellation takes back all that was given — as a question, never directly')
check(drop.note.startsWith('The ERP cancelled HC-SO-009046'), true, 'and says so')
check((await trail()).at(-1).kind, 'cancelled', 'on the trail')

// ── Under its deposit when the portal started paying ─────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-UNDER', lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, payments: [{ id: 'p', paid_at: '2025-11-10', amount_sen: 50000 }] }))
check(await pending('HC-SO-UNDER'), null, 'no commission was given, so nothing to change')
check(r.note, 'old bill: under its deposit when the portal started paying, so no commission was given on it — nothing to change', 'said so')
r = await deliver(order({ doc: 'HC-SO-UNDER', lines: [L1, L2, L3], keyed: { 1: OLD, 2: NEW, 3: NEW }, payments: [{ id: 'p', paid_at: '2025-11-10', amount_sen: 50000 }, { id: 'q', paid_at: '2026-11-20', amount_sen: 300000 }] }))
check(await pending('HC-SO-UNDER'), null, 'nor later — the bill keeps what it was when first kept')

// ── The ERP rewrote every line ───────────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-REWRITTEN', lines: [L1, L2], keyed: { 1: NEW, 2: NEW } }))
check(await pending('HC-SO-REWRITTEN'), null, 'what it was cannot be told: kept as it is now')
check(r.note, 'old bill: kept as settled by hand in November 2025 (every line keyed since September 2026, so as it is now); no change to its commission', 'said so')
check((await trail('HC-SO-REWRITTEN')).map(t => [t.kind, t.ca]), [['opened', 4928]], 'kept once')
r = await deliver(order({ doc: 'HC-SO-REWRITTEN', lines: [L1, L2, L3], keyed: { 1: NEW, 2: NEW, 3: NEW }, snapshot: '2026-11-21T02:00:00Z' }))
check((await pending('HC-SO-REWRITTEN')).amount, 520, 'a later change is asked')

// ── Nothing keyed since: no change ───────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-QUIET', lines: [L1, T5], keyed: { 1: OLD, 5: OLD } }))
check([await pending('HC-SO-QUIET'), (await trail('HC-SO-QUIET')).length], [null, 1], 'an old bill saved as it was asks nothing')

// ── Nobody the portal pays ───────────────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-STRANGER', lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, sp: 'nobody', name: 'SOMEBODY' }))
check(await pending('HC-SO-STRANGER'), null, 'no alias: nothing asked')
check(r.note, 'old bill: upsell of RM 1,040.00 since it was settled by hand, but SOMEBODY is nobody the portal pays — nothing asked', 'said so')
r = await deliver(order({ doc: 'HC-SO-LEFT', lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, sp: GONE_ERP, name: 'GONE' }))
check(await pending('HC-SO-LEFT'), null, 'a salesperson who has left is paid nothing here')

// ── Matched by name when the ERP id is unknown ───────────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-BYNAME', lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, sp: 'unknown-id', name: 'Luis  Teo' }))
check((await pending('HC-SO-BYNAME')).staff_id, LUIS, 'the alias by name, as the receiver matches')

// ── Not this rule's ──────────────────────────────────────────────────────────────────────────────────────────────
r = await deliver(order({ doc: 'HC-SO-DELETED', lines: [L1, L2], keyed: { 1: OLD, 2: NEW }, deleted: true }))
check([r.note, (await trail('HC-SO-DELETED')).length], [null, 0], 'a deleted document is not read')
await db.exec(`INSERT INTO sales_order_erp_changes (sub_department_id, order_no, outcome, kind, state_after)
  VALUES ('${FAIR}', 'HC-SO-ONCE-OURS', 'applied', 'opened', '{"commissionable": 100}')`)
r = await deliver(order({ doc: 'HC-SO-ONCE-OURS', lines: [L1, L2], keyed: { 1: OLD, 2: NEW } }))
check([r.note, (await trail('HC-SO-ONCE-OURS')).length, await pending('HC-SO-ONCE-OURS')], [null, 1, null],
  'a document the portal once kept as its own bill is left alone')

// ── A fault is a warning on the delivery ─────────────────────────────────────────────────────────────────────────
await db.exec(`CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'no'; END $$;
  CREATE TRIGGER refuse BEFORE INSERT ON comm_upsales FOR EACH ROW WHEN (NEW.erp_doc_no = 'HC-SO-FAULT') EXECUTE FUNCTION refuse();`)
r = await deliver(order({ doc: 'HC-SO-FAULT', lines: [L1, L2], keyed: { 1: OLD, 2: NEW } }))
check([r.note, r.event.warnings], [null, ['old_bill_change_failed']], 'never the delivery\'s failure')

console.log(`old bill changes: ${checks} checks passed`)
