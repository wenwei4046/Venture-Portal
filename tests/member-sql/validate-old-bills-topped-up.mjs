// Local PostgreSQL regression for 20261107200000 — an old bill topped up is the collector's (2026-11-07; the user, of
// ZNT4813: "如果那个 order 之前 below depo，but 离职了 shawn 帮忙 handle 这样就是有 com" — "bc that time below depo is
// without comm out"; asked how: built in, only the person who collected the top-up, back-pay only bills that were
// below their deposit before, each document on its own).
//
// Production's receiver (tests/member-sql/old-bills-topped-up-production.sql, pg_get_functiondef, md5-checked) is
// loaded over stand-ins for what it reads; the migration then runs VERBATIM, twice. A month is paid when listed in
// locked_months, closed to the feed when listed in closed_months or before the cutover (September 2026). Checks:
// ZNT4813 as it is in the ERP comes in, in November, Shawn's, the departed salesperson still named; PG10672, at exactly
// its deposit in March, does not; nor does one whose salesperson still works there, one the ERP says nothing about, one
// not topped up far enough, a cancelled one; with no collector recorded, or one the portal does not pay, it comes in
// nobody's, said so; a September top-up lands in October when its collector is closed for September, and so does one
// with no collector while anybody is; a paid month is passed over; nothing open, held with its payload; a re-send keeps
// the month and the collector and is never removed by the window; an alias HR made for the departed salesperson
// changes nothing; an ordinary bill re-dated out of the window is still removed; the migration refuses a body it was
// not written from. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261107200000_old_bills_topped_up.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR_SUB = id(1)
const SCHEME = id(2)
const SHAWN = id(11)
const WEI_HOW = id(12)
const LUCAS = id(13)
// The ERP's staff ids (scm.staff.id).
const JUNIE_ERP = '2f715521-6098-1aa6-11f7-56b8bc64ac30'
const SHAWN_ERP = '630af778-10b5-1907-6e84-08de695647b1'
const WEI_HOW_ERP = 'c000fb8f-cc56-5538-7d95-64dc19205659'
const SYU_ERP = '9b32eff0-468b-4f7d-af20-7385ef2bde6c'
const SEP = '2026-09-01'
const OCT = '2026-10-01'
const NOV = '2026-11-01'

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, status text NOT NULL DEFAULT 'active', resignation_date date);
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
  CREATE TABLE erp_feed_settings (sub_department_id uuid PRIMARY KEY, min_order_date date);
  CREATE TABLE comm_agent_aliases (erp_salesperson_id text, agent_key text, staff_id uuid);
  CREATE TABLE comm_schemes (id uuid PRIMARY KEY, sub_department_id uuid, deposit_threshold_pct numeric,
    is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
  CREATE TABLE comm_salesperson_closes (sub_department_id uuid, period_month date, staff_id uuid, reopened_at timestamptz);
  CREATE TABLE erp_sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, period_month date, status text, message text,
    warnings text[], payload jsonb, received_at timestamptz NOT NULL DEFAULT clock_timestamp());

  -- Stand-ins for production's helpers.
  CREATE TABLE locked_months (month date PRIMARY KEY);
  CREATE TABLE closed_months (month date PRIMARY KEY);
  CREATE TABLE lock_log (n serial, month date);
  CREATE TABLE adjustments (order_id uuid);
  CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql AS $$ SELECT '${FAIR_SUB}'::uuid $$;
  CREATE FUNCTION comm_first_paid_month(uuid) RETURNS date LANGUAGE sql AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION erp_sync_scheme_of(uuid) RETURNS uuid LANGUAGE sql AS
    $$ SELECT id FROM comm_schemes WHERE sub_department_id = $1 AND is_active AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1 $$;
  CREATE FUNCTION comm_staff_month_closed(uuid, date, uuid) RETURNS boolean LANGUAGE sql AS
    $$ SELECT EXISTS (SELECT 1 FROM comm_salesperson_closes WHERE sub_department_id = $1 AND period_month = $2
                        AND staff_id = $3 AND reopened_at IS NULL) $$;
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
    INSERT INTO erp_sync_events (doc_no, period_month, status, message, warnings, payload)
    VALUES (p_doc, p_period, p_status, p_message, p_warnings, p_payload) RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', p_status, 'periodMonth', p_period, 'message', p_message, 'warnings', to_jsonb(p_warnings), 'eventId', v_id);
  END $$;
  CREATE FUNCTION erp_sync_known_state(uuid, text, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
  CREATE FUNCTION erp_sync_after_delivery(uuid, text, jsonb, p_result jsonb, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_result $$;
  CREATE FUNCTION erp_sync_fair(p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION venue_event_for_order(text, date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION erp_sync_note_adjustment(uuid, jsonb, uuid) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO adjustments VALUES ($1) $$;
  CREATE FUNCTION erp_sync_order_brand(jsonb, uuid) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
  CREATE FUNCTION venue_key(text) RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(UPPER(BTRIM($1)), '') $$;
  CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  INSERT INTO hr_staff_costs (id, employee_name, status) VALUES
    ('${SHAWN}', 'SHAWN', 'active'), ('${WEI_HOW}', 'WEI HOW', 'inactive'), ('${LUCAS}', 'LUCAS', 'active');
  INSERT INTO comm_agent_aliases VALUES
    ('${SHAWN_ERP}', 'SHAWN', '${SHAWN}'), ('${WEI_HOW_ERP}', 'WEI HOW', '${WEI_HOW}'), (NULL, 'LUCAS', '${LUCAS}');
  INSERT INTO erp_feed_settings VALUES ('${FAIR_SUB}', '2026-08-01');
  INSERT INTO comm_schemes (id, sub_department_id, deposit_threshold_pct) VALUES ('${SCHEME}', '${FAIR_SUB}', 0.3);
`)

// ── Production's receiver, as the migration was written from ─────────────────
await db.exec((await readFile(new URL('./old-bills-topped-up-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
check(await one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = 'ingest_erp_sales_order'`),
  'd08d228c1fa90d19379cc31b027f20f7', 'the fixture is production’s body')

const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const after = await one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = 'ingest_erp_sales_order'`)
await db.exec(migration)
check(await one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = 'ingest_erp_sales_order'`), after,
  'run again, it changes nothing')
check(migration.includes(`'${after}'`), true, 'the md5 the migration checks is the body it makes')

let snapshot = 0
const pay = (paidAt, sen, collectedBy = null, name = null) =>
  ({ id: `p-${++snapshot}`, paid_at: paidAt, amount_sen: sen, collected_by: collectedBy, collected_by_name: name,
     created_at: `${paidAt}T04:00:00Z` })
// A delivery as the receiver's route hands it over (lib/erp-sync/contract.ts), the ERP's rows under raw.
const deliver = async (docNo, { orderDate = '2026-03-10', total = 6000, payments = [], active = false, status = 'CONFIRMED',
  seller = 'Junie', sellerId = JUNIE_ERP } = {}) => {
  const paid = payments.reduce((sum, p) => sum + p.amount_sen, 0) / 100
  return (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify({
    docNo, orderDate, status, salespersonId: sellerId, salespersonName: seller, total, balance: total - paid,
    customerName: 'KAALIDASS A/L', venue: 'SUNWAY CARNIVAL SOLO', lines: [],
    snapshotAt: `2026-11-07T12:00:${String(++snapshot).padStart(2, '0')}Z`,
    // active: null — a delivery that does not say (before the ERP sent it).
    raw: { header: { doc_no: docNo, so_date: orderDate }, items: [], payments,
      salesperson: active === null ? { id: sellerId, name: seller } : { id: sellerId, name: seller, active } },
  })]))[0].r
}
// What a delivery says of whose it is (the brand stand-ins name none: no_brand rides along).
const whose = r => r.warnings.filter(w => w === 'unmatched_salesperson' || w === 'old_bill_no_collector')
const bill = async docNo => (await q(
  `SELECT period_month::text AS month, staff_id::text AS staff, agent_name, erp_salesperson_id, order_date::text AS sold,
          order_total::float8 AS total
     FROM sales_orders WHERE order_no = $1`, [docNo]))[0]

// ── ZNT4813, as it is in the ERP: comes in, November, Shawn's ────────────────
const znt = await deliver('HC-SO-010734', {
  payments: [pay('2026-03-10', 80000), pay('2026-11-02', 320000, SHAWN_ERP, 'Shawn')],
})
check([znt.status, znt.periodMonth], ['applied', NOV], 'ZNT4813: written, in November — the month Shawn topped it up')
check(znt.message, 'created — old bill: Junie (left) sold it on 10 Mar 2026, RM 800.00 of RM 6,000.00 paid before September 2026; '
  + 'topped up past its 30% deposit on 2 Nov 2026 (RM 3,200.00), collected by SHAWN, whose it is now',
  'and the feed’s log says whose it was and who collected it')
check(await bill('HC-SO-010734'),
  { month: NOV, staff: SHAWN, agent_name: 'Junie', erp_salesperson_id: JUNIE_ERP, sold: '2026-03-10', total: 6000 },
  'Shawn’s bill — still saying Junie sold it, on 10 March')
check(whose(znt), [], 'no unmatched salesperson: it has its person')

// ── PG10672, its linked bill: exactly at its deposit in March ────────────────
const pg = await deliver('HC-SO-010733', {
  total: 14000, payments: [pay('2026-03-10', 420000), pay('2026-11-02', 580000, SHAWN_ERP, 'Shawn')],
})
check(pg.status, 'skipped', 'PG10672 does not come in: each document on its own')
check(pg.message, 'dated before the feed window (2026-08-01) — it had its 30% deposit before September 2026 '
  + '(RM 4,200.00 of RM 14,000.00), so its commission was settled by hand then', 'the log says why')
check(await bill('HC-SO-010733'), undefined, 'and nothing is written')

// ── Not an old bill topped up: skipped, as before, the reason said ───────────
const topUp = [pay('2026-03-10', 80000), pay('2026-11-02', 320000, SHAWN_ERP, 'Shawn')]
check((await deliver('HC-SO-010800', { payments: topUp, active: true })).message,
  'dated before the feed window (2026-08-01) — its salesperson still works here', 'an active salesperson’s old bill stays out')
check((await deliver('HC-SO-010801', { payments: topUp, active: null })).message,
  'dated before the feed window (2026-08-01) — the ERP did not say whether its salesperson has left',
  'a delivery that does not say stays out')
check((await deliver('HC-SO-010802', { payments: [pay('2026-03-10', 80000), pay('2026-10-05', 50000, SHAWN_ERP)] })).message,
  'dated before the feed window (2026-08-01) — not topped up past its 30% deposit since September 2026 (RM 1,300.00 of RM 6,000.00 paid)',
  'not far enough: out')
check((await deliver('HC-SO-010803', { payments: [pay('2026-03-10', 80000), pay('2026-08-20', 320000, SHAWN_ERP)] })).message,
  'dated before the feed window (2026-08-01) — it had its 30% deposit before September 2026 (RM 4,000.00 of RM 6,000.00), '
  + 'so its commission was settled by hand then', 'topped up in August, a month settled by hand: out')
check((await deliver('HC-SO-010804', { payments: topUp, status: 'CANCELLED' })).message,
  'dated before the feed window (2026-08-01) — not a sale in the ERP (cancelled)', 'a cancelled one: out')
check(Number(await one(`SELECT count(*) FROM sales_orders WHERE order_no BETWEEN 'HC-SO-010800' AND 'HC-SO-010804'`)), 0,
  'none of them written')

// ── Nobody recorded, or nobody the portal pays: in, nobody's ─────────────────
const nobody = await deliver('HC-SO-006572', {
  total: 15500, payments: [pay('2025-06-04', 450000), pay('2026-11-03', 1100000)], orderDate: '2025-06-04',
})
check([nobody.status, nobody.periodMonth], ['applied', NOV], 'no collector recorded: still written')
check(whose(nobody), ['old_bill_no_collector'], 'flagged — HR moves it')
check((await bill('HC-SO-006572')).staff, null, 'nobody’s')
check(nobody.message.endsWith('(RM 11,000.00), the ERP not saying who collected it — nobody\'s until HR moves it'), true,
  'and the log says so')
const syu = await deliver('HC-SO-008957', {
  total: 8880, orderDate: '2025-11-04', payments: [pay('2025-11-04', 250000), pay('2026-11-04', 638000, SYU_ERP, 'Syu')],
})
check([(await bill('HC-SO-008957')).staff, whose(syu)], [null, ['old_bill_no_collector']], 'a collector the portal does not know: nobody’s')
check(syu.message.endsWith('collected by Syu, whom the portal does not pay — nobody\'s until HR moves it'), true, 'said so')
await deliver('HC-SO-008302', {
  total: 8900, orderDate: '2025-09-16', seller: 'Kingsley', sellerId: 'k-1',
  payments: [pay('2025-09-16', 160000), pay('2026-11-01', 260000, WEI_HOW_ERP, 'Wei How')],
})
check((await bill('HC-SO-008302')).staff, null, 'a collector who has left too: nobody’s')

// ── The month it lands in ────────────────────────────────────────────────────
await q(`INSERT INTO comm_salesperson_closes VALUES ($1, $2, $3, NULL)`, [FAIR_SUB, SEP, SHAWN])
const sepShawn = await deliver('HC-SO-002309', {
  total: 6049, orderDate: '2024-08-11', seller: 'YANG', sellerId: 'y-1',
  payments: [pay('2024-08-11', 177000), pay('2026-09-04', 427900, SHAWN_ERP, 'Shawn')],
})
check([sepShawn.status, sepShawn.periodMonth], ['applied', OCT], 'topped up in September, Shawn closed for September: October')
const sepNobody = await deliver('HC-SO-013029', {
  total: 7000, orderDate: '2026-07-30', seller: 'MAYSON', sellerId: 'm-1',
  payments: [pay('2026-07-30', 196000), pay('2026-09-12', 504000)],
})
check(sepNobody.periodMonth, OCT, 'no collector, somebody closed for September: October, where HR can still give it to anybody')
const oct = await deliver('HC-SO-012458', {
  total: 4290, orderDate: '2026-06-19', seller: 'SIA JONAS', sellerId: 's-1',
  payments: [pay('2026-06-19', 120000), pay('2026-10-23', 309000, SHAWN_ERP)],
})
check(oct.periodMonth, OCT, 'topped up in October, nobody closed there: October')
check((await q('SELECT month::text FROM lock_log ORDER BY n')).map(r => r.month).includes(OCT), true,
  'the month’s lock is taken before it is written')

await q(`INSERT INTO locked_months VALUES ($1)`, [OCT])
const passed = await deliver('HC-SO-003361', {
  total: 4338, orderDate: '2024-10-28', seller: 'SHU HUI', sellerId: 'sh-1',
  payments: [pay('2024-10-28', 125700), pay('2026-10-07', 308100, SHAWN_ERP)],
})
check(passed.periodMonth, NOV, 'a month a run paid is passed over')
await q(`INSERT INTO locked_months SELECT d::date FROM generate_series('2026-11-01'::date, '2030-12-01'::date, interval '1 month') d`)
const stuck = await deliver('HC-SO-006904', {
  total: 7100, orderDate: '2025-06-30', seller: 'SHU HUI', sellerId: 'sh-1',
  payments: [pay('2025-06-30', 200000), pay('2026-10-04', 510000, SHAWN_ERP)],
})
check([stuck.status, stuck.periodMonth], ['held', OCT], 'nothing open: held under the month it was topped up in')
check(stuck.message, 'an old bill topped up, and no month from October 2026 on is open — reopen one and replay', 'said so')
check([await bill('HC-SO-006904'), (await q(`SELECT payload IS NOT NULL AS kept FROM erp_sync_events WHERE doc_no = 'HC-SO-006904'`))[0].kept],
  [undefined, true], 'not written, its payload kept for the replay')
await q(`DELETE FROM locked_months`)

// ── A re-send: the month, and the collector, stay ────────────────────────────
const resent = await deliver('HC-SO-010734', {
  total: 6200, payments: [pay('2026-03-10', 80000), pay('2026-11-02', 320000, SHAWN_ERP, 'Shawn'), pay('2026-11-06', 50000)],
})
check([resent.status, resent.periodMonth, resent.message], ['applied', NOV, 'updated'], 'a re-send is written, in November')
check([(await bill('HC-SO-010734')).staff, (await bill('HC-SO-010734')).total], [SHAWN, 6200],
  'still Shawn’s, the change written — never removed by the window')

// An alias HR made for the departed salesperson changes nothing: the collector's it stays.
await q(`INSERT INTO comm_agent_aliases VALUES ($1, 'JUNIE', $2)`, [JUNIE_ERP, LUCAS])
await deliver('HC-SO-010734', { total: 6200, payments: [pay('2026-03-10', 80000), pay('2026-11-02', 320000, SHAWN_ERP, 'Shawn')] })
check((await bill('HC-SO-010734')).staff, SHAWN, 'Junie matched to LUCAS: still Shawn’s')
const fresh = await deliver('HC-SO-010735', { payments: [pay('2026-03-10', 80000), pay('2026-11-02', 320000)] })
check([(await bill('HC-SO-010735')).staff, whose(fresh)], [null, ['old_bill_no_collector']],
  'and a new one with nobody recorded is still nobody’s, not LUCAS’s')

// ── An ordinary bill re-dated out of the window is still removed ─────────────
await deliver('HC-SO-2611-001', { orderDate: '2026-11-05', active: true, seller: 'Lucas', sellerId: null, payments: [pay('2026-11-05', 300000)] })
check((await bill('HC-SO-2611-001')).month, NOV, 'an ordinary November bill')
const redated = await deliver('HC-SO-2611-001', { orderDate: '2026-07-05', active: true, seller: 'Lucas', sellerId: null,
  payments: [pay('2026-11-05', 300000)] })
check([redated.status, redated.message], ['applied', 'removed: re-dated before the feed window (2026-08-01)'],
  're-dated before the window: removed, as before')

// ── The migration refuses a body it was not written from ─────────────────────
await db.exec(`CREATE OR REPLACE FUNCTION ingest_erp_sales_order(p_order jsonb, p_replay_of uuid DEFAULT NULL::uuid)
  RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)
await assert.rejects(db.exec(migration), /not the body this migration was written from/)
checks++

console.log(`validate-old-bills-topped-up: ${checks} checks passed`)
