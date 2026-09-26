// Local PostgreSQL regression for closing a month to the ERP feed and for
// possible double claims (2026-09-26).
//
// `20260926010000_close_a_month_to_the_erp_feed.sql` runs VERBATIM — the
// receiver included — against a synthetic surrounding schema, on top of the
// fair-calendar migrations it rewrites, because what is under test is which
// month a bill is paid in and whether one bill can be paid twice. No live I/O.
//
// The fixture is August 2026: worked out by hand from the claim form while the
// ERP kept re-sending its bills — Kuching's 28–31 August fair keyed into
// September, a bill whose deposit the sales admin had not entered, and a
// customer's second document under the first one's paper number.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR_SUB = id(1)
const IR_SUB = id(2)
const CH = id(31)
const JUL = '2026-07-01'
const AUG = '2026-08-01'
const SEP = '2026-09-01'

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

async function productionFunction(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const match = new RegExp(
    `create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`,
    'i',
  ).exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const fair = async (venue, month, start, end) =>
  one(
    `INSERT INTO comm_venue_events(venue_key, period_month, start_date, end_date)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [venue, month, start, end],
  )

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION current_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'hr'::text $$;

    CREATE TABLE users(id uuid PRIMARY KEY, name text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text);
    CREATE TYPE sales_import_status AS ENUM ('draft','committed','superseded');

    CREATE TABLE comm_venues(
      venue_key text PRIMARY KEY, display_name text NOT NULL, organizer text, notes text,
      canonical_key text REFERENCES comm_venues(venue_key),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id));

    CREATE TABLE comm_organisers(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id));

    CREATE TABLE comm_venue_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_key text NOT NULL REFERENCES comm_venues(venue_key) ON UPDATE CASCADE ON DELETE CASCADE,
      period_month date NOT NULL,
      organiser_id uuid REFERENCES comm_organisers(id) ON DELETE RESTRICT,
      notes text, erp_organiser_text text,
      source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','erp')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id),
      CONSTRAINT comm_venue_events_month_is_first
        CHECK (period_month = date_trunc('month', period_month)::date),
      CONSTRAINT uq_comm_venue_events UNIQUE (venue_key, period_month));

    CREATE TABLE sales_import_batches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      period_month date NOT NULL, file_name text NOT NULL, file_hash text, sheet_name text,
      row_count integer NOT NULL DEFAULT 0, order_count integer NOT NULL DEFAULT 0,
      out_of_period_count integer NOT NULL DEFAULT 0, cancelled_count integer NOT NULL DEFAULT 0,
      unmatched_agent_count integer NOT NULL DEFAULT 0,
      status sales_import_status NOT NULL DEFAULT 'committed', notes text,
      imported_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      superseded_at timestamptz, source text NOT NULL DEFAULT 'erp_sync',
      last_synced_at timestamptz,
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));
    CREATE UNIQUE INDEX uq_sales_batch_committed_per_sub_period
      ON sales_import_batches(sub_department_id, period_month) WHERE status = 'committed';

    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL,
      event_date date NOT NULL, agent_name text NOT NULL, agent_key text NOT NULL,
      staff_id uuid REFERENCES hr_staff_costs(id), venue text, order_total numeric NOT NULL DEFAULT 0,
      cancelled boolean NOT NULL DEFAULT false, excluded_reason text,
      source text NOT NULL DEFAULT 'erp_sync', debtor_code text,
      customer_name text, location text, brand_code text,
      balance numeric, erp_status text, erp_on_hold boolean,
      erp_salesperson_id text, erp_company_id bigint,
      erp_snapshot_at timestamptz, erp_created_at timestamptz,
      synced_at timestamptz, raw jsonb, sequence_in_day integer);

    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE);

    CREATE TABLE comm_runs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL,
      status text NOT NULL, sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));

    CREATE TABLE comm_order_releases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES comm_runs(id),
      order_no text NOT NULL, staff_id uuid, period_month date NOT NULL,
      order_period_month date NOT NULL, product_revenue numeric NOT NULL DEFAULT 0,
      released_at timestamptz NOT NULL DEFAULT now(),
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));

    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL,
      enable_open_bill boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
      effective_to date);

    CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT '${FAIR_SUB}'::uuid $$;

    CREATE TABLE erp_sync_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, period_month date,
      status text, message text, warnings text[], snapshot_at timestamptz, payload jsonb,
      replay_of uuid, replayed_at timestamptz, replay_result text,
      received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      sub_department_id uuid NOT NULL DEFAULT erp_sync_sub_department());
    CREATE TABLE erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
    CREATE TABLE comm_agent_aliases(erp_salesperson_id text, agent_key text, staff_id uuid);
    CREATE TABLE sales_order_open_bill_tags(
      order_id uuid, staff_id uuid, event_date date, bill_rank smallint,
      auto_suggested boolean, tagged_by uuid, tagged_at timestamptz DEFAULT now(),
      PRIMARY KEY (order_id));

    CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE plpgsql
      AS $$ BEGIN NULL; END $$;
    CREATE FUNCTION erp_sync_suggest_open_bills(uuid, date) RETURNS void LANGUAGE plpgsql
      AS $$ BEGIN NULL; END $$;

    INSERT INTO comm_sub_departments(id,name) VALUES ($$${FAIR_SUB}$$,'Fair'), ($$${IR_SUB}$$,'IR');
    INSERT INTO hr_staff_costs(id, employee_name) VALUES ($$${CH}$$, 'CHEA HUAN');
    INSERT INTO comm_schemes(sub_department_id) VALUES ($$${FAIR_SUB}$$);
    INSERT INTO erp_feed_settings(sub_department_id, min_order_date) VALUES ($$${FAIR_SUB}$$, '2026-08-01');
    INSERT INTO comm_agent_aliases(agent_key, staff_id) VALUES ('CHEA HUAN', $$${CH}$$);
    INSERT INTO comm_venues(venue_key,display_name) VALUES
      ('BORNEO CONVENTION CENTRE KUCHING','BCCK'),
      ('MIDVALLEY SOUTHKEY JB','MVEC Southkey'),
      ('THE COMMUNE KULAI','Commune Kulai');
  `)

  await productionFunction('20260917020000_venue_feed_window_pay_preview', 'venue_key')
  await productionFunction('20260918020000_venue_aliases', 'venue_group_key')
  await productionFunction('20260911020000_commission_order_sub_departments', 'commission_order_period_locked')
  await productionFunction('20260911020000_commission_order_sub_departments', 'erp_sync_period_locked')
  await productionFunction('20260911020000_commission_order_sub_departments', 'lock_commission_order_periods')
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_refresh_batch')
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_log')
  await productionFunction('20260918040000_venue_organisers', 'venue_event_organiser')

  // What this migration rewrites, as production has it now …
  for (const file of [
    '20260920050000_the_fair_sets_the_month',
    '20260923010000_the_claim_form_confirms_the_fair',
    '20260923020000_venue_key_once_per_call',
  ]) {
    await db.exec(await readFile(new URL(`${file}.sql`, migrations), 'utf8'))
  }
  // … and THE MIGRATION ITSELF, VERBATIM.
  await db.exec(await readFile(new URL('20260926010000_close_a_month_to_the_erp_feed.sql', migrations), 'utf8'))

  const kuching = await fair('BORNEO CONVENTION CENTRE KUCHING', AUG, '2026-08-28', '2026-08-31')

  let snapshot = 0
  const deliver = async (docNo, orderDate, extra = {}) =>
    (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify({
      docNo, orderDate, venue: 'BORNEO CONVENTION CENTRE KUCHING', salespersonName: 'Chea Huan',
      total: 9288, balance: 9288, lines: [],
      snapshotAt: `2026-09-26T01:${String(Math.floor(++snapshot / 60)).padStart(2, '0')}:${String(snapshot % 60).padStart(2, '0')}Z`,
      ...extra,
    })]))[0].r
  const row = async docNo => (await q(
    `SELECT o.period_month::text AS month, o.order_total::float AS total, o.cancelled, b.source,
            b.status::text AS batch
       FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
      WHERE o.order_no = $1 AND o.source = 'erp_sync'`, [docNo]))[0]
  const closed = async month => one('SELECT erp_feed_month_closed($1, $2)', [FAIR_SUB, month])

  // ─── the feed, open ───────────────────────────────────────────────────────

  check((await deliver('HC-SO-2609-091', '2026-09-16', { raw: { header: { customer_so_no: 'HC11366' } } })).status,
    'applied', 'Kuching keyed on 16 September: the feed writes it')
  await q(`UPDATE sales_orders SET fair_source = 'manual' WHERE order_no = 'HC-SO-2609-091'`)
  await q('SELECT * FROM revenue_apply_fair_calendar($1, TRUE)', [FAIR_SUB])
  check(await row('HC-SO-2609-091'), { month: AUG, total: 9288, cancelled: false, source: 'erp_sync', batch: 'committed' },
    'the claim form puts it back in the fair\'s month')
  // A bill no fair claims: its order date decides, as it always has.
  check((await deliver('HC-SO-013600', '2026-08-20', { venue: 'THE COMMUNE KULAI' })).status, 'applied',
    'a bill with no fair lands in its order date\'s month')

  // ─── close August ─────────────────────────────────────────────────────────

  check(await closed(AUG), false, 'nothing is closed until somebody closes it')
  const closedRow = await one('SELECT erp_feed_close_month($1, $2, $3)', [FAIR_SUB, AUG, 'paid from the claim form'])
  check([closedRow.periodMonth, closedRow.note], [AUG, 'paid from the claim form'], 'closing says what it closed')
  check(await closed(AUG), true, 'August is closed')
  check(await closed(SEP), false, 'September is not')
  await one('SELECT erp_feed_close_month($1, $2)', [FAIR_SUB, AUG])
  check(Number(await one('SELECT count(*) FROM erp_feed_closed_months')), 1, 'closing twice is one closure')
  await reject('SELECT erp_feed_close_month($1, $2)', [IR_SUB, AUG], /Only the sub-department/,
    'a sub-department the ERP does not feed cannot be closed to it')
  await reject('SELECT erp_feed_close_month($1, $2)', [FAIR_SUB, '2026-08-15'], /first day/,
    'a month is its first day')

  // A re-send of a bill that lives in August is held, payload and all.
  const heldResend = await deliver('HC-SO-2609-091', '2026-09-16', { total: 8290, balance: 5002 })
  check([heldResend.status, heldResend.periodMonth], ['held', AUG], 'a re-send into a closed month is held under it')
  check((await row('HC-SO-2609-091')).total, 9288, 'and the bill is exactly what it was')
  check(Boolean(await one(
    `SELECT payload IS NOT NULL FROM erp_sync_events WHERE id = $1`, [heldResend.eventId])), true,
    'the delivery is kept for a replay')

  // Re-dated out of August with no fair to keep it there: still held.
  const movedOut = await deliver('HC-SO-013600', '2026-09-02', { venue: 'THE COMMUNE KULAI' })
  check([movedOut.status, movedOut.periodMonth], ['held', AUG],
    'a delivery that would carry a bill OUT of a closed month is held as well, under that month')
  check((await row('HC-SO-013600')).month, AUG, 'and the bill stays in August')

  // A new document dated into August.
  const newIn = await deliver('HC-SO-2609-200', '2026-08-31', { venue: 'MIDVALLEY SOUTHKEY JB' })
  check([newIn.status, newIn.periodMonth], ['held', AUG], 'a new document dated in a closed month is held')
  check(await row('HC-SO-2609-200'), undefined, 'and not written')

  // A brand-new draft is still just not a sale.
  check((await deliver('HC-SO-2609-201', '2026-08-30', { status: 'DRAFT' })).status, 'skipped',
    'a new draft is skipped, closed month or not')

  // Before the feed window the portal keeps nothing — closed or not.
  await one('SELECT erp_feed_close_month($1, $2)', [FAIR_SUB, JUL])
  check((await deliver('HC-SO-2607-001', '2026-07-20')).status, 'skipped',
    'a document before the feed window is skipped rather than held')
  await one('SELECT erp_feed_reopen_month($1, $2)', [FAIR_SUB, JUL])

  // A delete in the ERP.
  const deleted = await deliver('HC-SO-2609-091', null, { deleted: true })
  check([deleted.status, deleted.periodMonth], ['held', AUG], 'a delete in a closed month is held')
  check((await row('HC-SO-2609-091')).cancelled, false, 'and the bill is not excluded')

  // September keeps flowing.
  check((await deliver('HC-SO-2609-150', '2026-09-20', { venue: 'THE COMMUNE KULAI' })).status, 'applied',
    'every other month keeps syncing')
  check((await row('HC-SO-2609-150')).month, SEP, 'into its own month')

  // ─── the fair calendar leaves a closed month alone ────────────────────────

  const lateKuching = await deliver('HC-SO-2609-160', '2026-09-10')
  check(lateKuching.status, 'applied', 'a Kuching bill keyed in September lands in September')
  const move = (await q(
    `SELECT from_period::text AS f, to_period::text AS t, locked FROM revenue_fair_calendar_moves($1)
      WHERE order_no = 'HC-SO-2609-160'`, [FAIR_SUB]))[0]
  check(move, { f: SEP, t: AUG, locked: true }, 'the calendar still sees the move, and says it cannot be made')
  check((await q('SELECT orders_moved FROM revenue_apply_fair_calendar($1)', [FAIR_SUB]))[0].orders_moved, 0,
    'moving refuses to write into a closed month')
  check((await row('HC-SO-2609-160')).month, SEP, 'the bill stays in September')
  check((await q(`SELECT bills_to_move FROM revenue_fair_calendar() WHERE fair_id = $1`, [kuching]))[0].bills_to_move, 0,
    'and the calendar does not count a move nobody can make')

  // ─── reopen and replay ────────────────────────────────────────────────────

  const reopened = await one('SELECT erp_feed_reopen_month($1, $2)', [FAIR_SUB, AUG])
  check(reopened, { reopened: true, held: 4 }, 'reopening says how much is waiting')
  check(await closed(AUG), false, 'August is open again')

  // What replayHeldErpEvents does: the last held delivery of each document.
  const replay = await q(
    `SELECT DISTINCT ON (doc_no) id, doc_no, payload FROM erp_sync_events
      WHERE status = 'held' AND period_month = $1 AND replayed_at IS NULL
      ORDER BY doc_no, received_at DESC`, [AUG])
  const replayed = []
  for (const r of replay) {
    const out = (await q('SELECT ingest_erp_sales_order($1::jsonb, $2) AS r', [JSON.stringify(r.payload), r.id]))[0].r
    replayed.push([r.doc_no, out.status])
  }
  check(replayed, [['HC-SO-013600', 'applied'], ['HC-SO-2609-091', 'applied'], ['HC-SO-2609-200', 'applied']],
    'every held document goes through as if the ERP had just sent it')
  check((await row('HC-SO-2609-091')).cancelled, true, 'the last word on HC11366 was a delete, and now it is excluded')
  check((await row('HC-SO-013600')).month, SEP, 'the re-dated bill moves the way the ERP said')
  check((await row('HC-SO-2609-200')).month, AUG, 'the new document lands in August')
  check((await q('SELECT orders_moved FROM revenue_apply_fair_calendar($1)', [FAIR_SUB]))[0].orders_moved, 1,
    'and the calendar may move the Kuching bill again')

  // ─── a closed month takes its hand-worked orders ──────────────────────────

  const augLive = await one(
    `SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND period_month=$2 AND status='committed'`,
    [FAIR_SUB, AUG])
  const stage = async () => {
    const batch = await one(
      `INSERT INTO sales_import_batches(period_month, file_name, source, status, sub_department_id)
       VALUES ($1, 'SALARY CLAIM FORM_AUGUST''26.xlsx', 'file', 'draft', $2) RETURNING id`, [AUG, FAIR_SUB])
    await q(
      `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, event_date, agent_name, agent_key,
                                staff_id, venue, order_total, balance, source)
       VALUES ($1, $2, 'HC11366', '2026-08-31', '2026-08-31', 'CHEA HUAN', 'CHEA HUAN', $3,
               'BORNEO CONVENTION CENTRE KUCHING', 8290, 5002, 'file')`, [batch, AUG, CH])
    return batch
  }
  const staged = await stage()
  await reject('SELECT commit_sales_import_batch($1, FALSE)', [staged], /fed live from the ERP/,
    'an open live month refuses a file')
  await one('SELECT erp_feed_close_month($1, $2)', [FAIR_SUB, AUG])
  await q('SELECT commit_sales_import_batch($1, FALSE)', [staged])
  check(await one(`SELECT status::text FROM sales_import_batches WHERE id=$1`, [staged]), 'committed',
    'a closed month takes the hand-worked orders as its batch')
  check(await one(`SELECT status::text FROM sales_import_batches WHERE id=$1`, [augLive]), 'superseded',
    'and the live batch is retired, not deleted')
  check(Number(await one(`SELECT count(*) FROM sales_orders WHERE batch_id=$1`, [augLive])) > 0, true,
    'its rows are still there to go back to')
  check(Number(await one(`SELECT count(*) FROM revenue_fair_calendar_moves($1) m
      JOIN sales_orders o ON o.id = m.order_id WHERE o.batch_id = $2`, [FAIR_SUB, augLive])), 0,
    'the calendar never moves a retired row')

  const heldAgain = await deliver('HC-SO-013350', '2026-08-26', { venue: 'MIDVALLEY SOUTHKEY JB' })
  check(heldAgain.status, 'held', 'the feed is still held off a closed, hand-worked month')
  await one('SELECT erp_feed_reopen_month($1, $2)', [FAIR_SUB, AUG])
  const fileHeld = await deliver('HC-SO-013350', '2026-08-26', { venue: 'MIDVALLEY SOUTHKEY JB' })
  check([fileHeld.status, fileHeld.message.includes('imported from a file')], ['held', true],
    'reopened, the month is still the file\'s until that import is retired')

  // ─── possible double claims ───────────────────────────────────────────────

  const ref = (orderNo, cell) => one('SELECT sales_order_bill_ref($1, $2)', [orderNo, cell])
  check(await ref('HC-SO-013345', 'HC12850+ZNT5996'), 'HC12850', "a cell's first paper number is the bill's own")
  check(await ref('HC-SO-013385', 'ZNT 6185'), 'ZNT6185', 'spaces do not make a different bill')
  check(await ref('HC-SO-013404', 'Refer HC8978'), 'HC8978', 'words before the number are not the number')
  check(await ref('HC-SO-2609-090', null), 'HC-SO-2609-090', 'no paper number: the document is its own')
  check(await ref('HC12843', null), 'HC12843', 'a hand-worked row is its paper number')

  // The ERP keys HC11366 again in September — the bill August already paid.
  check((await deliver('HC-SO-2610-001', '2026-09-25', {
    venue: 'THE COMMUNE KULAI', raw: { header: { customer_so_no: 'HC 11366' } } })).status, 'applied',
    'the feed delivers the same paper into September')
  // A RM 0 "refer" document and an excluded one never pay, so never double-pay.
  await deliver('HC-SO-2610-002', '2026-09-25', {
    venue: 'THE COMMUNE KULAI', total: 0, raw: { header: { customer_so_no: 'Refer HC11366' } } })
  await deliver('HC-SO-2610-003', '2026-09-25', {
    venue: 'THE COMMUNE KULAI', status: 'CANCELLED', raw: { header: { customer_so_no: 'HC11366' } } })

  const claims = async () => (await q(
    `SELECT bill_ref, order_no, period_month::text AS month, source, dismissed
       FROM revenue_possible_double_claims($1) ORDER BY month, order_no`, [FAIR_SUB]))
  check(await claims(), [
    { bill_ref: 'HC11366', order_no: 'HC11366', month: AUG, source: 'file', dismissed: false },
    { bill_ref: 'HC11366', order_no: 'HC-SO-2610-001', month: SEP, source: 'erp_sync', dismissed: false },
  ], "August's hand-worked HC11366 and September's HC11366 are one bill twice")

  check(await one('SELECT revenue_dismiss_double_claim($1, $2, $3)', [FAIR_SUB, 'HC11366', 'separate order']), 2,
    'a human checks the pair')
  check((await claims()).every(c => c.dismissed), true, 'and the pair stops asking')

  await deliver('HC-SO-2610-004', '2026-09-26', {
    venue: 'THE COMMUNE KULAI', total: 500, raw: { header: { customer_so_no: 'HC11366' } } })
  check((await claims()).every(c => !c.dismissed), true, 'a third bill under that paper asks again')
  check(await one('SELECT revenue_restore_double_claim($1, $2)', [FAIR_SUB, 'HC11366']), true,
    'an answer can be taken back')
  check(Number(await one('SELECT count(*) FROM comm_double_claim_dismissals')), 0, 'and is gone')

  // A bill a run paid is a claim wherever its row sits now.
  const run = await one(
    `INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1,'applied',$2) RETURNING id`,
    [JUL, FAIR_SUB])
  await q(
    `INSERT INTO comm_order_releases(run_id, order_no, period_month, order_period_month, sub_department_id)
     VALUES ($1, 'HC-SO-2609-150', $2, $2, $3)`, [run, JUL, FAIR_SUB])
  await q(`UPDATE sales_orders SET raw = '{"header":{"customer_so_no":"HC11371"}}' WHERE order_no = 'HC-SO-2609-150'`)
  await deliver('HC-SO-2610-005', '2026-09-27', {
    venue: 'THE COMMUNE KULAI', raw: { header: { customer_so_no: 'HC11371' } } })
  const paidPair = (await q(
    `SELECT order_no, paid_by_run FROM revenue_possible_double_claims($1)
      WHERE bill_ref = 'HC11371' ORDER BY order_no`, [FAIR_SUB]))
  check(paidPair.map(p => [p.order_no, p.paid_by_run]), [['HC-SO-2609-150', true], ['HC-SO-2610-005', false]],
    'a new bill under a paper a run already paid is a double claim, and says which one was paid')

  check(Number(await one('SELECT count(*) FROM revenue_possible_double_claims($1)', [IR_SUB])), 0,
    'another sub-department is not asked about Fair\'s bills')

  console.log(`closed month + double claims: ${checks} checks passed`)
} finally {
  await db.close()
}
