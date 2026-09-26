// Local PostgreSQL regression for "the portal pays from a month" and for the
// drops and upsells the ERP reveals on settled bills (2026-09-26).
//
// `20260926010000` and `20260926020000` run VERBATIM — the receiver, the
// guard, member_order_facts — against a synthetic surrounding schema, because
// what is under test is which month pays a bill, whether it can be paid twice,
// and what a change after settlement is worth. No live I/O.
//
// The fixture is the cutover the user chose: June to August 2026 were paid
// from the claim forms, the portal pays from September.
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
const SCHEME = id(5)
const CH = id(31)
const HAWOARD = id(32)
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
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id));
    CREATE TABLE comm_organisers(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id));
    CREATE TABLE comm_venue_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_key text NOT NULL REFERENCES comm_venues(venue_key) ON UPDATE CASCADE ON DELETE CASCADE,
      period_month date NOT NULL, organiser_id uuid REFERENCES comm_organisers(id) ON DELETE RESTRICT,
      notes text, erp_organiser_text text,
      source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','erp')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id),
      CONSTRAINT comm_venue_events_month_is_first CHECK (period_month = date_trunc('month', period_month)::date),
      CONSTRAINT uq_comm_venue_events UNIQUE (venue_key, period_month));

    CREATE TABLE sales_import_batches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      period_month date NOT NULL, file_name text NOT NULL, file_hash text, sheet_name text,
      row_count integer NOT NULL DEFAULT 0, order_count integer NOT NULL DEFAULT 0,
      out_of_period_count integer NOT NULL DEFAULT 0, cancelled_count integer NOT NULL DEFAULT 0,
      unmatched_agent_count integer NOT NULL DEFAULT 0,
      status sales_import_status NOT NULL DEFAULT 'committed', notes text,
      imported_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      superseded_at timestamptz, source text NOT NULL DEFAULT 'erp_sync', last_synced_at timestamptz,
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
      source text NOT NULL DEFAULT 'erp_sync', debtor_code text, customer_name text, location text,
      brand_code text, balance numeric, erp_status text, erp_on_hold boolean, erp_salesperson_id text,
      erp_company_id bigint, erp_snapshot_at timestamptz, erp_created_at timestamptz,
      synced_at timestamptz, raw jsonb, sequence_in_day integer, manual_margin_pct numeric,
      created_at timestamptz NOT NULL DEFAULT now(),
      paid_amount numeric GENERATED ALWAYS AS (order_total - COALESCE(balance, 0)) STORED);

    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      line_no integer, item_group text, product_code text, product_name text, description2 text,
      uom text, location text, qty numeric, unit_price numeric, line_amount numeric NOT NULL DEFAULT 0,
      brand_code text, cost_amount numeric, raw jsonb,
      UNIQUE (order_id, line_no));

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
      enable_open_bill boolean NOT NULL DEFAULT false, enable_kpi boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01',
      effective_to date, deposit_threshold_pct numeric, revenue_cost_divisor numeric);
    CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
    CREATE TABLE comm_kpi_items(scheme_id uuid, product_code text, effective_from date, effective_to date);

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
      order_id uuid PRIMARY KEY, staff_id uuid, event_date date, bill_rank smallint,
      auto_suggested boolean, tagged_by uuid, tagged_at timestamptz DEFAULT now());
    CREATE TABLE comm_products(item_code text, unit_cost numeric, is_active boolean);

    CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE FUNCTION erp_sync_brand_by_prefix(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE FUNCTION erp_sync_resequence_day(text, date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
    CREATE FUNCTION erp_sync_suggest_open_bills(uuid, date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;

    INSERT INTO comm_sub_departments(id,name) VALUES ($$${FAIR_SUB}$$,'Fair');
    INSERT INTO hr_staff_costs(id, employee_name) VALUES ($$${CH}$$, 'CHEA HUAN'), ($$${HAWOARD}$$, 'LIM YAU WEI');
    INSERT INTO comm_schemes(id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor)
      VALUES ($$${SCHEME}$$, $$${FAIR_SUB}$$, 0.3, 0.7);
    INSERT INTO comm_item_groups(scheme_id, item_group, commissionable) VALUES
      ($$${SCHEME}$$, 'mattress', true), ($$${SCHEME}$$, 'bedframe', true), ($$${SCHEME}$$, 'service', false);
    INSERT INTO erp_feed_settings(sub_department_id, min_order_date) VALUES ($$${FAIR_SUB}$$, '2026-06-01');
    INSERT INTO comm_agent_aliases(agent_key, staff_id) VALUES ('CHEA HUAN', $$${CH}$$);
    INSERT INTO comm_venues(venue_key,display_name) VALUES ('THE COMMUNE KULAI','Commune Kulai');
  `)

  await productionFunction('20260917020000_venue_feed_window_pay_preview', 'venue_key')
  await productionFunction('20260918020000_venue_aliases', 'venue_group_key')
  await productionFunction('20260911020000_commission_order_sub_departments', 'commission_order_period_locked')
  await productionFunction('20260911020000_commission_order_sub_departments', 'erp_sync_period_locked')
  await productionFunction('20260911020000_commission_order_sub_departments', 'lock_commission_order_periods')
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_refresh_batch')
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_log')
  await productionFunction('20260918040000_venue_organisers', 'venue_event_organiser')

  for (const file of [
    '20260920050000_the_fair_sets_the_month',
    '20260923010000_the_claim_form_confirms_the_fair',
    '20260923020000_venue_key_once_per_call',
    '20260924060000_comm_upsales',
    '20260926010000_close_a_month_to_the_erp_feed',
    // … and THE MIGRATION ITSELF, VERBATIM.
    '20260926020000_portal_pays_from_and_erp_adjustments',
  ]) {
    await db.exec(await readFile(new URL(`${file}.sql`, migrations), 'utf8'))
  }

  const thisMonth = await one(`SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text`)

  let snapshot = 0
  const deliver = async (docNo, orderDate, lines, extra = {}) =>
    (await q('SELECT ingest_erp_sales_order($1::jsonb) AS r', [JSON.stringify({
      docNo, orderDate, venue: 'THE COMMUNE KULAI', salespersonName: 'Chea Huan',
      total: lines.reduce((a, l) => a + l.amount, 0), balance: 0,
      lines: lines.map((l, i) => ({ lineNo: i + 1, itemCode: l.code ?? 'AKEMI', itemGroup: l.group, qty: 1, unitPrice: l.amount, amount: l.amount, cost: 1 })),
      snapshotAt: `2026-09-26T02:${String(Math.floor(++snapshot / 60)).padStart(2, '0')}:${String(snapshot % 60).padStart(2, '0')}Z`,
      ...extra,
    })]))[0].r
  const pending = async docNo => (await q(
    `SELECT kind, amount::float AS amount, status, source, settled_amount::float AS settled,
            erp_amount::float AS erp, original_period::text AS original, period_month::text AS month,
            staff_id, original_ref
       FROM comm_upsales WHERE erp_doc_no = $1 AND status = 'pending'`, [docNo]))[0]
  const closed = month => one('SELECT erp_feed_month_closed($1, $2)', [FAIR_SUB, month])

  // ─── the first month the portal pays ──────────────────────────────────────

  check(await closed(AUG), false, 'with no cutover, August is open to the feed')
  const setTo = await one('SELECT comm_set_first_paid_month($1, $2, $3)', [FAIR_SUB, SEP, 'June–August paid from the claim forms'])
  check(setTo.firstPaidMonth, SEP, 'the portal pays from September')
  check([await closed(JUL), await closed(AUG), await closed(SEP)], [true, true, false],
    'every month before it is closed to the feed; September is not')
  await reject('SELECT comm_set_first_paid_month($1, $2)', [FAIR_SUB, '2026-09-15'], /first day/, 'a month is its first day')
  check(await one('SELECT comm_clear_first_paid_month($1)', [FAIR_SUB]), true, 'the cutover can be taken back')
  check(await closed(AUG), false, 'and August is open again')

  // ─── a bill of a month that was then settled ──────────────────────────────

  // Delivered while August was still the feed's: RM 9,000 of goods and RM 1,000 of transport.
  check((await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 9000 }, { group: 'service', amount: 1000 }])).status,
    'applied', 'an August bill arrives before the cutover')

  await one('SELECT comm_set_first_paid_month($1, $2)', [FAIR_SUB, SEP])

  // The customer drops RM 2,000 of goods.
  const dropped = await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 7000 }, { group: 'service', amount: 1000 }])
  check([dropped.status, dropped.periodMonth], ['held', AUG], 'a change to a settled bill is held, nothing written')
  check(await pending('HC-SO-A'), {
    kind: 'drop', amount: -2000, status: 'pending', source: 'erp', settled: 9000, erp: 7000,
    original: AUG, month: thisMonth, staff_id: CH, original_ref: 'HC-SO-A',
  }, 'and the goods it lost become a pending drop in the month it is noticed — transport never counted')
  check(Number(await one(`SELECT order_total FROM sales_orders WHERE order_no = 'HC-SO-A'`)), 10000,
    'the settled bill itself is untouched')

  // The ERP keeps saving: one open question per document, kept up to date.
  await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 9500 }, { group: 'service', amount: 1000 }])
  check((await pending('HC-SO-A'))?.kind, 'upsale', 'adding back more than was dropped turns it into an upsell')
  check((await pending('HC-SO-A'))?.amount, 500, 'of the difference from what was settled')
  check(Number(await one(`SELECT count(*) FROM comm_upsales WHERE erp_doc_no = 'HC-SO-A'`)), 1,
    'still one row for the document')

  await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 9000 }, { group: 'bedframe', amount: 0 }])
  check(await pending('HC-SO-A'), undefined, 'back to what was settled, there is nothing to ask')

  const gone = await deliver('HC-SO-A', null, [], { deleted: true })
  check([gone.status, (await pending('HC-SO-A'))?.amount], ['held', -9000], 'deleted in the ERP: the whole settled amount is a drop')

  // HR confirms it. The next change is measured from what was paid since.
  await q(`UPDATE comm_upsales SET status = 'confirmed', period_month = $1 WHERE erp_doc_no = 'HC-SO-A'`, [SEP])
  await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 9000 }])
  check((await pending('HC-SO-A'))?.amount, 9000, 'reinstated after a confirmed drop: the whole bill is an upsell again')
  check((await pending('HC-SO-A'))?.settled, 0, 'measured from what the confirmed drop left')

  // Dismissed: the ERP's figure stands, and saving the document again asks nothing.
  await q(`UPDATE comm_upsales SET status = 'dismissed' WHERE erp_doc_no = 'HC-SO-A' AND status = 'pending'`)
  await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 9000 }], { status: 'DELIVERED' })
  check(await pending('HC-SO-A'), undefined, 'a dismissed difference is not asked about again')
  await deliver('HC-SO-A', '2026-08-20', [{ group: 'mattress', amount: 8500 }])
  check((await pending('HC-SO-A'))?.amount, -500, 'but a new change is, measured from the figure that was let stand')

  // Undo (reopenErpAdjustment): a paid change goes back to wait — never beside another open question.
  await reject(`UPDATE comm_upsales SET status = 'pending' WHERE erp_doc_no = 'HC-SO-A' AND status = 'confirmed'`, [],
    /uq_comm_upsales_pending_erp_doc/, 'a paid change cannot go back to wait while the ERP has asked again')
  await q(`DELETE FROM comm_upsales WHERE erp_doc_no = 'HC-SO-A' AND status = 'pending'`)
  await q(`UPDATE comm_upsales SET status = 'pending' WHERE erp_doc_no = 'HC-SO-A' AND status = 'confirmed'`)
  check((await pending('HC-SO-A'))?.amount, -9000, 'with nothing else waiting, a paid change goes back to wait')
  await q(`UPDATE comm_upsales SET status = 'confirmed' WHERE erp_doc_no = 'HC-SO-A' AND status = 'pending'`)

  // ─── a month worked out by hand ───────────────────────────────────────────

  // The claim form's HC11366 replaces August's live batch; the ERP document
  // for it stays behind in the retired batch.
  check((await deliver('HC-SO-2609-091', '2026-08-31', [{ group: 'mattress', amount: 8290 }, { group: 'service', amount: 998 }],
    { raw: { header: { customer_so_no: 'HC11366' } } })).status, 'held',
    'with August settled, even a first delivery dated in it is held')
  await one('SELECT comm_clear_first_paid_month($1)', [FAIR_SUB])
  await deliver('HC-SO-2609-091', '2026-08-31', [{ group: 'mattress', amount: 8290 }, { group: 'service', amount: 998 }],
    { raw: { header: { customer_so_no: 'HC11366' } } })
  await one('SELECT comm_set_first_paid_month($1, $2)', [FAIR_SUB, SEP])
  const hand = await one(
    `INSERT INTO sales_import_batches(period_month, file_name, source, status, sub_department_id)
     VALUES ($1, 'SALARY CLAIM FORM_AUGUST''26.xlsx', 'file', 'draft', $2) RETURNING id`, [AUG, FAIR_SUB])
  const handRow = await one(
    `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, event_date, agent_name, agent_key,
                              staff_id, order_total, balance, source)
     VALUES ($1, $2, 'HC11366', '2026-08-31', '2026-08-31', 'LIM YAU WEI', 'LIM YAU WEI', $3, 8290, 5002, 'file')
     RETURNING id`, [hand, AUG, HAWOARD])
  await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, line_amount)
           VALUES ($1, 1, 'mattress', 'CLAIM FORM', 8290)`, [handRow])
  await q('SELECT commit_sales_import_batch($1, FALSE)', [hand])
  check(await one(`SELECT status::text FROM sales_import_batches WHERE id = $1`, [hand]), 'committed',
    'a month before the cutover takes its hand-worked orders')

  await deliver('HC-SO-2609-091', '2026-08-31', [{ group: 'mattress', amount: 7800 }, { group: 'service', amount: 998 }],
    { raw: { header: { customer_so_no: 'HC11366' } } })
  const handDrop = await pending('HC-SO-2609-091')
  check([handDrop?.kind, handDrop?.amount, handDrop?.settled, handDrop?.staff_id, handDrop?.original_ref],
    ['drop', -490, 8290, HAWOARD, 'HC11366'],
    'measured against the hand-worked row under the same paper, and owed by whoever that row paid')

  // ─── a bill the portal pays is never carried back into a settled month ────

  // An August bill the claim form left unpaid (under its deposit) waits in
  // September. The ERP's next save still dates it in August, at no fair: it
  // must reach the bill where it waits, not be held against August for good.
  check((await deliver('HC-SO-B', '2026-09-05', [{ group: 'mattress', amount: 6000 }], { balance: 6000 })).status,
    'applied', 'a bill waiting on its deposit lives in September')
  const waited = await deliver('HC-SO-B', '2026-08-30', [{ group: 'mattress', amount: 6000 }], { balance: 1000 })
  check([waited.status, waited.periodMonth], ['applied', SEP],
    'its next save, dated in the settled month, is written where the bill waits')
  check(await q(`SELECT period_month::text AS month, paid_amount::float AS paid FROM sales_orders WHERE order_no = 'HC-SO-B'`),
    [{ month: SEP, paid: 5000 }], 'and its payment is there for the deposit gate')
  check(await pending('HC-SO-B'), undefined, 'a bill of a paying month is not a drop or an upsell')

  // ─── a month a run paid ───────────────────────────────────────────────────

  await deliver('HC-SO-SEP1', '2026-09-10', [{ group: 'mattress', amount: 5000 }])
  const run = await one(
    `INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1, 'applied', $2) RETURNING id`, [SEP, FAIR_SUB])
  await q(
    `INSERT INTO comm_order_releases(run_id, order_no, staff_id, period_month, order_period_month, product_revenue, sub_department_id)
     VALUES ($1, 'HC-SO-SEP1', $2, $3, $3, 5000, $4)`, [run, CH, SEP, FAIR_SUB])
  await reject(`UPDATE comm_upsales SET status = 'pending' WHERE erp_doc_no = 'HC-SO-A' AND status = 'confirmed'`, [],
    /has paid/, 'what a run paid cannot go back to wait')
  const paidChange = await deliver('HC-SO-SEP1', '2026-09-10', [{ group: 'mattress', amount: 4000 }])
  check(paidChange.status, 'held', 'a change to a bill a run paid is held')
  check([(await pending('HC-SO-SEP1'))?.amount, (await pending('HC-SO-SEP1'))?.settled], [-1000, 5000],
    'and measured against what the run paid on')

  // A pending row may still be answered after its month's run paid — it was never paid itself.
  await q(`UPDATE comm_upsales SET period_month = '2026-10-01' WHERE erp_doc_no = 'HC-SO-SEP1' AND status = 'pending'`)
  checks++
  await q(`UPDATE comm_upsales SET period_month = $1 WHERE erp_doc_no = 'HC-SO-SEP1' AND status = 'pending'`, [SEP])
  await reject(`UPDATE comm_upsales SET status = 'confirmed' WHERE erp_doc_no = 'HC-SO-SEP1'`, [], /has paid/,
    'but it cannot be confirmed into a month whose run has paid')

  // Reopen the run: the change is written instead, and the question goes away.
  await q(`UPDATE comm_runs SET status = 'computed' WHERE id = $1`, [run])
  const replayed = await deliver('HC-SO-SEP1', '2026-09-10', [{ group: 'mattress', amount: 4000 }])
  check([replayed.status, await pending('HC-SO-SEP1')], ['applied', undefined],
    'a change the month takes in directly leaves no drop waiting')

  // ─── the member app counts a settled month where it was settled ───────────

  const facts = await q(
    `SELECT order_no, source_period::text AS source, recognition_month::text AS recognised, cleared
       FROM member_order_facts($1, NULL, NULL) ORDER BY order_no`, [SCHEME])
  const byNo = Object.fromEntries(facts.map(f => [f.order_no, f]))
  check([byNo['HC11366']?.recognised, byNo['HC11366']?.cleared], [AUG, true],
    'a bill of a month before the cutover is recognised in its own month, settled')
  check(byNo['HC-SO-SEP1']?.recognised, SEP, "a September bill stays September's")

  console.log(`pays from + ERP drops/upsells: ${checks} checks passed`)
} finally {
  await db.close()
}
