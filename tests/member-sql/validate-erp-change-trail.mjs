// Local PostgreSQL regression for 20261013010000 — the ERP's audit trail, kept
// by the portal; a salesperson's close gives the commission; a paper keyed as
// several documents (2026-10-13; the user: "只要他开了单，任何改动只要一按 save
// 他的 sales order，我这边都要能 track 到，记录在我们自己的 audit trail 里 …
// 判断是 upsell 还是 drop sales or cancelation … 就要 deduction"; and of
// ZNT6185 on the Drops & upsells tab: "it is not a drop sales … make sure next
// time wont happen").
//
// The world the migration meets: the receiver (ingest_erp_sales_order) VERBATIM
// from 20261012200000 and erp_sync_note_adjustment VERBATIM from 20261003170000,
// over the tables they write and stand-ins for the helpers around them (a month
// is paid when listed in locked_months, closed to the feed when listed in
// closed_months or before the cutover, September 2026). August is settled by
// hand: its claim form paid ZNT6185 RM 15,700, which the ERP holds as two
// documents (RM 8,000 + RM 7,700). The old rules are driven first — and found
// the two false drops the user saw — then the migration VERBATIM, then the new
// rules. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { v: null })[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const lf = text => text.replace(/\r\n/g, '\n')

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

/** A function's CREATE statement, exactly as a migration wrote it. */
async function productionFunction(migration, name) {
  const sql = lf(await readFile(new URL(`${migration}.sql`, migrations), 'utf8'))
  const match = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const FAIR = id(1)
const SCHEME = id(2)
const AUG_FILE = id(3)
const AUG_ERP = id(4)
const LUCAS = id(11)
const ANTHONY = id(12)
const CHEA = id(13)
const MELVIN = id(14)
const HR_USER = id(21)

await db.exec(`
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;

  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text);
  CREATE TABLE comm_sub_departments (id uuid PRIMARY KEY, name text);
  CREATE TABLE comm_schemes (
    id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
  CREATE TABLE comm_item_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, item_group text NOT NULL,
    commissionable boolean NOT NULL, UNIQUE (scheme_id, item_group));
  CREATE TABLE sales_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    file_name text, source text NOT NULL DEFAULT 'erp_sync', status text NOT NULL DEFAULT 'committed', notes text);
  CREATE UNIQUE INDEX uq_batch_committed ON sales_import_batches (sub_department_id, period_month) WHERE status = 'committed';
  CREATE TABLE sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches (id),
    period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date NOT NULL,
    debtor_code text, customer_name text, agent_name text NOT NULL, agent_key text NOT NULL,
    staff_id uuid REFERENCES hr_staff_costs (id), location text, venue text, brand_code text,
    order_total numeric(15,2) NOT NULL DEFAULT 0, balance numeric(15,2), cancelled boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync', erp_status text, erp_on_hold boolean, erp_salesperson_id text,
    erp_company_id bigint, erp_snapshot_at timestamptz, erp_created_at timestamptz, synced_at timestamptz,
    raw jsonb, fair_event_id uuid, fair_source text, sequence_in_day integer,
    bill_ref text GENERATED ALWAYS AS (COALESCE(raw->'header'->>'customer_so_no', order_no)) STORED);
  CREATE TABLE sales_order_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES sales_orders (id) ON DELETE CASCADE,
    line_no integer, item_group text, product_code text, product_name text, description2 text, uom text,
    location text, qty numeric, unit_price numeric(15,2), line_amount numeric(15,2), brand_code text,
    cost_amount numeric, raw jsonb);
  CREATE TABLE comm_products (item_code text, unit_cost numeric, is_active boolean);
  CREATE TABLE comm_venues (venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE sales_order_open_bill_tags (order_id uuid, auto_suggested boolean);
  CREATE TABLE erp_feed_settings (sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE comm_agent_aliases (erp_salesperson_id text, agent_key text, staff_id uuid);
  CREATE TABLE erp_sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, period_month date, status text, message text,
    warnings text[] NOT NULL DEFAULT '{}', snapshot_at timestamptz, payload jsonb,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp());
  CREATE TABLE comm_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    status text NOT NULL);
  CREATE TABLE comm_order_releases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text NOT NULL, run_id uuid NOT NULL REFERENCES comm_runs (id),
    staff_id uuid, period_month date, order_period_month date, product_revenue numeric DEFAULT 0,
    released_at timestamptz NOT NULL DEFAULT clock_timestamp(), sub_department_id uuid NOT NULL,
    UNIQUE (sub_department_id, order_no));
  CREATE TABLE comm_salesperson_closes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    staff_id uuid NOT NULL, closed_at timestamptz NOT NULL DEFAULT now(), reopened_at timestamptz);
  CREATE TABLE comm_upsales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL, period_month date NOT NULL,
    staff_id uuid NOT NULL, amount numeric(15,2) NOT NULL, sold_on date NOT NULL, fair_event_id uuid,
    original_ref text NOT NULL, note text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz, updated_by uuid,
    kind text NOT NULL DEFAULT 'upsale', status text NOT NULL DEFAULT 'confirmed', source text NOT NULL DEFAULT 'manual',
    erp_doc_no text, erp_event_id uuid, settled_amount numeric(15,2), erp_amount numeric(15,2), original_period date,
    decided_by uuid, decided_at timestamptz,
    CONSTRAINT comm_upsales_amount_signed CHECK ((kind = 'upsale' AND amount > 0) OR (kind = 'drop' AND amount < 0)));
  CREATE UNIQUE INDEX uq_comm_upsales_pending_erp_doc ON comm_upsales (sub_department_id, erp_doc_no)
    WHERE status = 'pending' AND erp_doc_no IS NOT NULL;
  CREATE TABLE sales_order_exclusions (order_id uuid PRIMARY KEY);
  CREATE TABLE permission_table_writes (table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE permission_table_reads (table_name text PRIMARY KEY, actions text[]);

  -- Stand-ins for production's helpers.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE TABLE closed_months (month date PRIMARY KEY);
  CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION permission_writes_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION permission_reads_guard(text) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_reason text DEFAULT NULL) RETURNS text
    LANGUAGE sql AS $$ SELECT p_mode $$;
  CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql AS $$ SELECT '${FAIR}'::uuid $$;
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION erp_sync_period_locked(date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM locked_months WHERE month = $1) $$;
  CREATE FUNCTION erp_feed_month_closed(uuid, date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM closed_months WHERE month = $2) OR $2 < '2026-09-01'::date $$;
  CREATE FUNCTION erp_sync_period_closed(date) RETURNS boolean LANGUAGE sql AS
    $$ SELECT erp_feed_month_closed('${FAIR}'::uuid, $1) $$;
  CREATE FUNCTION lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_log(p_doc text, p_period date, p_status text, p_message text, p_warnings text[],
    p_snapshot timestamptz, p_payload jsonb, p_replay_of uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE v_id uuid;
  BEGIN
    INSERT INTO erp_sync_events (doc_no, period_month, status, message, warnings, snapshot_at, payload)
    VALUES (p_doc, p_period, p_status, p_message, COALESCE(p_warnings, '{}'), p_snapshot, p_payload) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', p_status, 'docNo', p_doc, 'periodMonth', p_period, 'message', p_message,
                              'warnings', to_jsonb(COALESCE(p_warnings, '{}')), 'eventId', v_id);
  END $$;
  CREATE FUNCTION erp_sync_fair(p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION venue_event_for_order(text, date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION erp_sync_order_brand(jsonb, uuid) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION venue_key(text) RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(UPPER(BTRIM($1)), '') $$;
  CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_suggest_open_bills(uuid, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION sales_order_excluded_by_hand(uuid) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM sales_order_exclusions WHERE order_id = $1) $$;

  INSERT INTO comm_sub_departments VALUES ('${FAIR}', 'Fair');
  INSERT INTO comm_schemes (id, sub_department_id) VALUES ('${SCHEME}', '${FAIR}');
  INSERT INTO comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${SCHEME}', 'MATTRESS', true), ('${SCHEME}', 'SOFA', true), ('${SCHEME}', 'SERVICE', false);
  INSERT INTO hr_staff_costs VALUES ('${LUCAS}', 'LUCAS'), ('${ANTHONY}', 'ANTHONY'), ('${CHEA}', 'CHEA HUAN'), ('${MELVIN}', 'MELVIN CHONG');
  INSERT INTO comm_agent_aliases VALUES (NULL, 'LUCAS', '${LUCAS}'), (NULL, 'ANTHONY', '${ANTHONY}'),
    (NULL, 'CHEA HUAN', '${CHEA}'), (NULL, 'MELVIN CHONG', '${MELVIN}');
  INSERT INTO erp_feed_settings VALUES ('${FAIR}', '2026-08-01');
`)

// The world before the migration: production's receiver and its old rule.
await db.exec(lf(await readFile(new URL('20261012200000_late_key_ins_land_in_an_open_month.sql', migrations), 'utf8')))
await productionFunction('20261003170000_bill_ref_no', 'erp_sync_note_adjustment')
check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'ingest_erp_sales_order'`),
  'e114d662527339a70e07fef36bacf685', 'the receiver is production\'s body')
check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'erp_sync_note_adjustment'`),
  '7ddd3e82c7e1eb53dcfb4f30f197a827', 'the old rule is production\'s body')

// ── August, settled by hand ──────────────────────────────────────────────────
// The claim form (a committed FILE batch) and the ERP's own August documents
// (the batch the claim form superseded — frozen, the month closed to the feed).
await q(`INSERT INTO sales_import_batches (id, sub_department_id, period_month, source, status) VALUES
  ($1, $3, '2026-08-01', 'file', 'committed'), ($2, $3, '2026-08-01', 'erp_sync', 'superseded')`, [AUG_FILE, AUG_ERP, FAIR])

async function bill({ batch, no, paper = null, staff, agent, status = 'CONFIRMED', lines, date = '2026-08-27', source = 'erp_sync' }) {
  const total = lines.reduce((a, l) => a + l.amount, 0)
  const orderId = await one(`
    INSERT INTO sales_orders (batch_id, period_month, order_no, order_date, event_date, agent_name, agent_key, staff_id,
                              order_total, cancelled, source, erp_status, erp_on_hold, raw)
    VALUES ($1, '2026-08-01', $2, $3, $3, $4, UPPER($4), $5, $6, false, $7, $8, false, $9) RETURNING id`,
  [batch, no, date, agent, staff, total, source, source === 'erp_sync' ? status : null,
    paper ? JSON.stringify({ header: { customer_so_no: paper } }) : null])
  for (const [i, l] of lines.entries()) {
    await q(`INSERT INTO sales_order_lines (order_id, line_no, item_group, product_code, product_name, qty, unit_price, line_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, [orderId, i + 1, l.group, l.code, l.code, l.qty ?? 1, l.amount])
  }
  return orderId
}

// ZNT6185: one paper, RM 15,700 on the claim form; two documents in the ERP.
await bill({ batch: AUG_FILE, no: 'ZNT6185', staff: ANTHONY, agent: 'ANTHONY', source: 'file',
  lines: [{ group: 'SOFA', code: 'ZNT6185', amount: 15700 }] })
const D1 = await bill({ batch: AUG_ERP, no: 'HC-SO-013384', paper: 'ZNT6185', staff: ANTHONY, agent: 'ANTHONY',
  lines: [{ group: 'SOFA', code: '8030-1A(LHF)', amount: 8000 }] })
const D2 = await bill({ batch: AUG_ERP, no: 'HC-SO-013385', paper: 'ZNT6185', staff: ANTHONY, agent: 'ANTHONY', status: 'IN_PRODUCTION',
  lines: [{ group: 'SOFA', code: '9028-1A(RHF)', amount: 7700 }, { group: 'SERVICE', code: 'DISPOSE', amount: 300, qty: 6 }] })
// HC11556: one paper, one document — RM 16,388 on the claim form.
await bill({ batch: AUG_FILE, no: 'HC11556', staff: CHEA, agent: 'CHEA HUAN', source: 'file',
  lines: [{ group: 'MATTRESS', code: 'HC11556', amount: 16388 }] })
await bill({ batch: AUG_ERP, no: 'HC-SO-013335', paper: 'HC11556', staff: CHEA, agent: 'CHEA HUAN',
  lines: [{ group: 'MATTRESS', code: 'AKEMI ULTIMATE MATT (K)', amount: 16388, qty: 2 }] })
// HC8972: RM 10,399 on the claim form, cancelled in the ERP since.
await bill({ batch: AUG_FILE, no: 'HC8972', staff: MELVIN, agent: 'MELVIN CHONG', source: 'file',
  lines: [{ group: 'MATTRESS', code: 'HC8972', amount: 10399 }] })
await bill({ batch: AUG_ERP, no: 'HC-SO-013367', paper: 'HC8972', staff: MELVIN, agent: 'MELVIN CHONG',
  lines: [{ group: 'MATTRESS', code: 'AKEMI IMMORTAL MATT (K)', amount: 10399 }] })

let snapshot = 0
const at = () => {
  snapshot++
  return `2026-10-0${1 + Math.floor(snapshot / 50)}T${String(Math.floor(snapshot / 60) % 24).padStart(2, '0')}:${String(snapshot % 60).padStart(2, '0')}:00Z`
}
/** A delivery in the receiver's canonical shape (src/lib/erp-sync/contract.ts). */
const deliver = async (docNo, { date = '2026-08-27', agent, status = 'CONFIRMED', lines, paper = null, deleted = false, onHold = false }) => {
  const payload = deleted
    ? { docNo, deleted: true, snapshotAt: at() }
    : {
        docNo, snapshotAt: at(), status, onHold, orderDate: date, salespersonName: agent, customerName: 'A CUSTOMER',
        total: lines.reduce((a, l) => a + l.amount, 0), balance: 0, venue: 'MID VALLEY',
        lines: lines.map((l, i) => ({
          lineNo: i + 1, itemGroup: l.group, itemCode: l.code, description: l.code, description2: l.variant ?? null,
          qty: l.qty ?? 1, unitPrice: l.amount, amount: l.amount,
        })),
        raw: { header: { customer_so_no: paper } },
      }
  return (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify(payload)]))[0].r
}
const pending = async () => (await q(`
  SELECT erp_doc_no AS doc, amount::float AS amount, settled_amount::float AS settled, erp_amount::float AS erp
    FROM comm_upsales WHERE status = 'pending' ORDER BY erp_doc_no`))

// ── The old rule, as production ran it on 2026-10-12 ────────────────────────
check((await deliver('HC-SO-013384', { agent: 'ANTHONY', status: 'IN_PRODUCTION', paper: 'ZNT6185',
  lines: [{ group: 'SOFA', code: '8030-1A(LHF)', amount: 8000 }] })).status, 'held', 'an August document is held')
await deliver('HC-SO-013385', { agent: 'ANTHONY', status: 'READY_TO_SHIP', paper: 'ZNT6185',
  lines: [{ group: 'SOFA', code: '9028-1A(RHF)', amount: 7700, variant: 'LHF' }, { group: 'SERVICE', code: 'DISPOSE', amount: 300, qty: 6 }] })
await deliver('HC-SO-013335', { agent: 'CHEA HUAN', paper: 'HC11556',
  lines: [{ group: 'MATTRESS', code: 'AKEMI ULTIMATE MATT (K)', amount: 8194, qty: 2 }] })
// Three minutes later the ERP saved it again, moving nothing that earns.
await deliver('HC-SO-013335', { agent: 'CHEA HUAN', status: 'IN_PRODUCTION', paper: 'HC11556',
  lines: [{ group: 'MATTRESS', code: 'AKEMI ULTIMATE MATT (K)', amount: 8194, qty: 2 }] })
await deliver('HC-SO-013367', { agent: 'MELVIN CHONG', status: 'CANCELLED', paper: 'HC8972',
  lines: [{ group: 'MATTRESS', code: 'AKEMI IMMORTAL MATT (K)', amount: 10399 }] })
check(await pending(), [
  { doc: 'HC-SO-013335', amount: -8194, settled: 16388, erp: 8194 },
  { doc: 'HC-SO-013367', amount: -10399, settled: 10399, erp: 0 },
  // The false drops: each document against the whole paper.
  { doc: 'HC-SO-013384', amount: -7700, settled: 15700, erp: 8000 },
  { doc: 'HC-SO-013385', amount: -8000, settled: 15700, erp: 7700 },
], 'the old rule measured each of ZNT6185\'s documents against the whole paper')

// ── THE MIGRATION ITSELF, VERBATIM ───────────────────────────────────────────
const migration = lf(await readFile(new URL('20261013010000_erp_change_trail.sql', migrations), 'utf8'))
await db.exec(migration)

const ingest = await one(`SELECT prosrc FROM pg_proc WHERE proname = 'ingest_erp_sales_order'`)
check(ingest.match(/RETURN erp_sync_after_delivery\(/g).length, 14, 'every way out of the receiver goes through erp_sync_after_delivery')
check(ingest.includes('DELETE FROM comm_upsales'), false, 'an applied write no longer clears the question itself')
check(ingest.includes('v_before := erp_sync_known_state(v_sub_id, v_doc_no, CASE WHEN v_found THEN v_existing.id END);'), true,
  'the receiver reads what the portal knew of the document')

// The trail of the held deliveries, rebuilt.
const trailOf = async doc => (await q(`
  SELECT kind, outcome, commissionable_before::float AS before, commissionable_after::float AS after,
         status_before, status_after, settled_amount::float AS settled, settled_by, settled_period::text AS settled_period
    FROM sales_order_erp_changes WHERE order_no = $1 ORDER BY received_at, id`, [doc]))
check(await trailOf('HC-SO-013384'), [{ kind: 'changed', outcome: 'held', before: 8000, after: 8000,
  status_before: 'CONFIRMED', status_after: 'IN_PRODUCTION', settled: 8000, settled_by: 'hand', settled_period: '2026-08-01' }],
'a status change is in the trail, and HC-SO-013384 carries its own RM 8,000 of the paper')
check((await trailOf('HC-SO-013385'))[0]?.settled, 7700, 'HC-SO-013385 carries the other RM 7,700')
check(await trailOf('HC-SO-013335'), [
  { kind: 'drop', outcome: 'held', before: 16388, after: 8194,
    status_before: 'CONFIRMED', status_after: 'CONFIRMED', settled: 16388, settled_by: 'hand', settled_period: '2026-08-01' },
  { kind: 'changed', outcome: 'held', before: 8194, after: 8194,
    status_before: 'CONFIRMED', status_after: 'IN_PRODUCTION', settled: 16388, settled_by: 'hand', settled_period: '2026-08-01' },
], 'RM 16,388 → RM 8,194 is a drop in the trail; the save after it moved nothing that earns')
check((await trailOf('HC-SO-013367')).map(r => [r.kind, r.before, r.after]), [['cancelled', 10399, 0]], 'a cancellation is one')

// The questions waiting, asked again: ZNT6185's stop; the real ones say why.
check(await pending(), [
  { doc: 'HC-SO-013335', amount: -8194, settled: 16388, erp: 8194 },
  { doc: 'HC-SO-013367', amount: -10399, settled: 10399, erp: 0 },
], 'ZNT6185\'s two documents ask nothing — each carries its own part of the paper')
check(await q(`SELECT erp_doc_no AS doc, erp_reason, settled_by, settled_period::text AS settled_period FROM comm_upsales
               WHERE status = 'pending' ORDER BY erp_doc_no`), [
  { doc: 'HC-SO-013335', erp_reason: 'amount', settled_by: 'hand', settled_period: '2026-08-01' },
  { doc: 'HC-SO-013367', erp_reason: 'cancelled', settled_by: 'hand', settled_period: '2026-08-01' },
], 'each says why, and what gave the commission')
// 20261013020000: a row points at a question only when it moved what earns.
const linked = async () => (await q(`
  SELECT c.order_no AS doc, c.kind FROM sales_order_erp_changes c JOIN comm_upsales u ON u.id = c.adjustment_id
   WHERE u.status = 'pending' ORDER BY c.order_no, c.received_at`))
check(await linked(), [{ doc: 'HC-SO-013335', kind: 'changed' }, { doc: 'HC-SO-013367', kind: 'cancelled' }],
  '20261013010000 alone linked each bill\'s latest row — for HC-SO-013335 a save that moved nothing')
const links = lf(await readFile(new URL('20261013020000_erp_change_trail_links.sql', migrations), 'utf8'))
await db.exec(links)
check(await linked(), [{ doc: 'HC-SO-013335', kind: 'drop' }, { doc: 'HC-SO-013367', kind: 'cancelled' }],
  'the question belongs to the drop that opened it')

// Run again: nothing moves.
const before = await one(`SELECT count(*)::int FROM sales_order_erp_changes`)
await db.exec(migration)
await db.exec(links)
check(await one(`SELECT count(*)::int FROM sales_order_erp_changes`), before, 'the migrations run twice to the same end')
check(await pending().then(rows => rows.length), 2, 'and ask the same questions')
check(await linked(), [{ doc: 'HC-SO-013335', kind: 'drop' }, { doc: 'HC-SO-013367', kind: 'cancelled' }], 'and keep the same links')

// ── A split paper under the new rule ────────────────────────────────────────
// A real change to one of ZNT6185's documents asks only that document's part.
await deliver('HC-SO-013385', { agent: 'ANTHONY', status: 'READY_TO_SHIP', paper: 'ZNT6185',
  lines: [{ group: 'SOFA', code: '9028-1A(RHF)', amount: 7000, variant: 'LHF' }, { group: 'SERVICE', code: 'DISPOSE', amount: 300, qty: 6 }] })
check((await pending()).find(p => p.doc === 'HC-SO-013385'), { doc: 'HC-SO-013385', amount: -700, settled: 7700, erp: 7000 },
  'RM 7,700 → RM 7,000 asks −700, not −8,700')
check((await pending()).some(p => p.doc === 'HC-SO-013384'), false, 'its sibling asks nothing')
check((await trailOf('HC-SO-013385')).at(-1).kind, 'drop', 'and the trail says drop')

// Not a change: the ERP's RM 7,000 stands; a later save at RM 7,000 asks
// nothing, a later change is measured from it.
await q(`UPDATE comm_upsales SET status = 'dismissed', decided_at = clock_timestamp() WHERE erp_doc_no = 'HC-SO-013385' AND status = 'pending'`)
await deliver('HC-SO-013385', { agent: 'ANTHONY', status: 'DELIVERED', paper: 'ZNT6185',
  lines: [{ group: 'SOFA', code: '9028-1A(RHF)', amount: 7000, variant: 'LHF' }, { group: 'SERVICE', code: 'DISPOSE', amount: 300, qty: 6 }] })
check((await pending()).some(p => p.doc === 'HC-SO-013385'), false, 'after "Not a change" the same figure asks nothing')
await deliver('HC-SO-013385', { agent: 'ANTHONY', status: 'DELIVERED', paper: 'ZNT6185',
  lines: [{ group: 'SOFA', code: '9028-1A(RHF)', amount: 6500, variant: 'LHF' }, { group: 'SERVICE', code: 'DISPOSE', amount: 300, qty: 6 }] })
check((await pending()).find(p => p.doc === 'HC-SO-013385'), { doc: 'HC-SO-013385', amount: -500, settled: 7000, erp: 6500 },
  'a later change is measured from the figure let stand')

// ── A month still open: the trail, and nothing to answer ────────────────────
const OCT_DOC = 'HC-SO-2610-001'
const mattress = amount => [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount }, { group: 'SERVICE', code: 'TRANSPORT', amount: 100 }]
let r = await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', lines: mattress(5000) })
check([r.status, r.message], ['applied', 'created'], 'a new October bill lands in October')
const octBill = await one(`SELECT id FROM sales_orders WHERE order_no = $1`, [OCT_DOC])
check(await trailOf(OCT_DOC), [{ kind: 'opened', outcome: 'applied', before: null, after: 5000,
  status_before: null, status_after: 'CONFIRMED', settled: null, settled_by: null, settled_period: null }], 'opened')
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', lines: mattress(5000) })
check((await trailOf(OCT_DOC)).length, 1, 'the same document sent again is no change')
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', lines: mattress(4000) })
check((await trailOf(OCT_DOC)).at(-1), { kind: 'drop', outcome: 'applied', before: 5000, after: 4000,
  status_before: 'CONFIRMED', status_after: 'CONFIRMED', settled: null, settled_by: null, settled_period: null },
'a drop before anything was given: in the trail, nothing to answer — October counts it as it is now')
check((await pending()).some(p => p.doc === OCT_DOC), false, 'nothing to answer')
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'IN_PRODUCTION', lines: mattress(4000) })
check((await trailOf(OCT_DOC)).at(-1).kind, 'changed', 'a status change earns nothing more or less')
const transportOnly = [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 4000 }, { group: 'SERVICE', code: 'TRANSPORT', amount: 250 }]
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'IN_PRODUCTION', lines: transportOnly })
check((await q(`SELECT kind, total_before::float AS b, total_after::float AS a FROM sales_order_erp_changes
                WHERE order_no = $1 ORDER BY received_at DESC LIMIT 1`, [OCT_DOC]))[0],
{ kind: 'changed', b: 4100, a: 4250 }, 'transport moves the bill\'s total, never what earns')

// ── LUCAS closed for October: the commission is given ───────────────────────
const RUN = await one(`INSERT INTO comm_runs (sub_department_id, period_month, status) VALUES ($1, '2026-10-01', 'computed') RETURNING id`, [FAIR])
const close = async () => {
  await q(`INSERT INTO comm_salesperson_closes (sub_department_id, period_month, staff_id) VALUES ($1, '2026-10-01', $2)`, [FAIR, LUCAS])
  await q(`INSERT INTO comm_order_releases (order_no, run_id, staff_id, period_month, order_period_month, product_revenue, sub_department_id)
           VALUES ($1, $2, $3, '2026-10-01', '2026-10-01', 1, $4)`, [OCT_DOC, RUN, LUCAS, FAIR])
}
await close()
check(await one(`SELECT commissionable::float FROM comm_order_releases WHERE order_no = $1`, [OCT_DOC]), 4000,
  'the release keeps what the bill earned when it was released (not the run\'s product revenue)')
check((await pending()).some(p => p.doc === OCT_DOC), false, 'closing asks nothing of an unchanged bill')

const nextMonth = await one(`SELECT GREATEST(date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::date, '2026-11-01'::date)::text`)
const question = async doc => (await q(`
  SELECT amount::float AS amount, settled_amount::float AS settled, erp_amount::float AS erp, erp_reason, settled_by,
         settled_period::text AS settled_period, period_month::text AS month, staff_id
    FROM comm_upsales WHERE erp_doc_no = $1 AND status = 'pending'`, [doc]))[0] ?? null

r = await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'IN_PRODUCTION', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 3000 }] })
check(r.status, 'applied', 'October is still open: the change is written over the bill')
check(await question(OCT_DOC), { amount: -1000, settled: 4000, erp: 3000, erp_reason: 'amount', settled_by: 'close',
  settled_period: '2026-10-01', month: nextMonth, staff_id: LUCAS },
'after the close, RM 4,000 → RM 3,000 is a drop to answer, payable from November')
const last = (await q(`SELECT kind, settled_amount::float AS settled, settled_by, adjustment_id FROM sales_order_erp_changes
                       WHERE order_no = $1 ORDER BY received_at DESC LIMIT 1`, [OCT_DOC]))[0]
check([last.kind, last.settled, last.settled_by], ['drop', 4000, 'close'], 'the trail says the commission had been given')
check(last.adjustment_id, await one(`SELECT id FROM comm_upsales WHERE erp_doc_no = $1 AND status = 'pending'`, [OCT_DOC]),
  'and points at the question it opened')
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'READY_TO_SHIP', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 3000 }] })
check((await q(`SELECT kind, adjustment_id FROM sales_order_erp_changes WHERE order_no = $1 ORDER BY received_at DESC LIMIT 1`, [OCT_DOC]))[0],
  { kind: 'changed', adjustment_id: null }, 'a save that moves nothing that earns points at no question')
check(await question(OCT_DOC).then(x => x.amount), -1000, 'and the question stands as it was')

// Paid in a month after the close's, never in it.
await refused(`UPDATE comm_upsales SET status = 'confirmed', period_month = '2026-10-01' WHERE erp_doc_no = $1 AND status = 'pending'`,
  [OCT_DOC], '23ADJ', 'a change cannot be paid in the month whose close gave the commission')
await q(`UPDATE comm_upsales SET status = 'confirmed', period_month = '2026-11-01', decided_at = clock_timestamp()
         WHERE erp_doc_no = $1 AND status = 'pending'`, [OCT_DOC])
check(await question(OCT_DOC), null, 'paid in November')

// Cancelled in the ERP: what is left of the commission comes back.
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'CANCELLED', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 3000 }] })
check((await trailOf(OCT_DOC)).at(-1).kind, 'cancelled', 'the trail says cancelled')
check(await question(OCT_DOC).then(x => [x.amount, x.settled, x.erp, x.erp_reason]), [-3000, 3000, 0, 'cancelled'],
  'a cancellation deducts what is still given: RM 4,000 less the RM 1,000 already taken back')
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', status: 'CONFIRMED', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 3000 }] })
check((await trailOf(OCT_DOC)).at(-1).kind, 'reinstated', 'back again: reinstated')
check(await question(OCT_DOC), null, 'and nothing to answer any more')

// Reopened: the question goes with the close; closed again: it is asked anew.
await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 2500 }] })
check(await question(OCT_DOC).then(x => x.amount), -500, 'RM 3,000 → RM 2,500 asks −500')
await q(`DELETE FROM comm_order_releases WHERE order_no = $1`, [OCT_DOC])
await q(`UPDATE comm_salesperson_closes SET reopened_at = now() WHERE staff_id = $1 AND reopened_at IS NULL`, [LUCAS])
check(await question(OCT_DOC), null, 'reopening the close takes its question back — October counts the bill as it is now')
await close()
check(await one(`SELECT commissionable::float FROM comm_order_releases WHERE order_no = $1`, [OCT_DOC]), 2500, 'closed again at RM 2,500')
check(await question(OCT_DOC).then(x => [x.amount, x.erp_reason, x.settled_by]), [1000, 'amount', 'close'],
  'the RM 1,000 taken back in November is owed back: the new close paid on RM 2,500 already')

// ── Deleted, a hold, and a bill the portal never held ───────────────────────
await deliver('HC-SO-2610-002', { date: '2026-10-06', agent: 'LUCAS', lines: mattress(1200) })
await deliver('HC-SO-2610-002', { date: '2026-10-06', agent: 'LUCAS', lines: mattress(1200), onHold: true })
check((await trailOf('HC-SO-2610-002')).at(-1).kind, 'on_hold', 'a hold earns nothing')
await deliver('HC-SO-2610-002', { deleted: true })
check((await trailOf('HC-SO-2610-002')).at(-1).kind, 'deleted', 'deleted while on hold: still said as deleted')
check((await trailOf('HC-SO-2610-002')).at(-1).after, 0, 'earning nothing')
await deliver('HC-SO-2610-003', { date: '2026-10-06', agent: 'LUCAS', lines: mattress(900) })
await deliver('HC-SO-2610-003', { deleted: true })
check((await trailOf('HC-SO-2610-003')).at(-1).kind, 'deleted', 'deleted in the ERP')

await q(`INSERT INTO locked_months VALUES ('2026-07-01')`)
r = await deliver('HC-SO-2607-001', { date: '2026-07-20', agent: 'LUCAS', lines: mattress(800) })
check(r.status, 'skipped', 'dated before the feed window: never in the portal')
check((await trailOf('HC-SO-2607-001')).length, 0, 'and never in the trail')

// ── A fault in the trail is never the delivery's ────────────────────────────
await db.exec(`ALTER TABLE sales_order_erp_changes ADD CONSTRAINT trail_refuses CHECK (false) NOT VALID`)
r = await deliver(OCT_DOC, { date: '2026-10-05', agent: 'LUCAS', lines: [{ group: 'MATTRESS', code: 'AKEMI EQUINOX MATT (Q)', amount: 2400 }] })
check(r.status, 'applied', 'the delivery is applied')
check(await one(`SELECT order_total::float FROM sales_orders WHERE id = $1`, [octBill]), 2400, 'and written over the bill')
check((await one(`SELECT warnings FROM erp_sync_events WHERE id = $1`, [r.eventId])).at(-1), 'change_trail_failed',
  'the fault is a warning on its delivery')
await db.exec(`ALTER TABLE sales_order_erp_changes DROP CONSTRAINT trail_refuses`)

console.log(`ERP change trail: ${checks} checks passed`)
