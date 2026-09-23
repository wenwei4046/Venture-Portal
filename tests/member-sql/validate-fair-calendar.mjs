// Local PostgreSQL regression for the fair calendar: which month a bill is
// paid in.
//
// The surrounding schema is synthetic, but the migration
// `20260920050000_the_fair_sets_the_month.sql` is executed VERBATIM —
// constraints, functions and triggers —
// because the thing under test is a rule about money moving between payrolls
// and a hand-copied constraint that drifts from the migration would test
// nothing. No live I/O.
//
// The fixture is the August 2026 reconciliation: the Kuching fair ran 28–31
// August and its bills reached the ERP between 1 and 16 September, which is
// how RM 674,744 of August's sales came to sit in September's payroll.
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
const AUG = '2026-08-01'
const SEP = '2026-09-01'

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern) => {
  await assert.rejects(() => q(sql, params), pattern)
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

const bill = async (docNo, orderDate, venue, batch, total = 1000) =>
  one(
    `INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, event_date,
                              agent_name, agent_key, venue, order_total)
     VALUES ($1, date_trunc('month',$2::date)::date, $3, $4, $4, 'AGENT', 'AGENT', $5, $6)
     RETURNING id`,
    [batch, orderDate, docNo, orderDate, venue, total],
  )

const fair = async (venue, month, start, end, organiser = null) =>
  one(
    `INSERT INTO comm_venue_events(venue_key, period_month, start_date, end_date, organiser_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [venue, month, start, end, organiser],
  )

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE TABLE users(id uuid PRIMARY KEY);
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

    -- The shape 20260918040000 left behind: a month, an organiser, no days.
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
      cancelled boolean NOT NULL DEFAULT false, excluded_reason text);

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

    INSERT INTO comm_sub_departments(id,name) VALUES ($$${FAIR_SUB}$$,'Fair'), ($$${IR_SUB}$$,'IR');
    INSERT INTO comm_venues(venue_key,display_name) VALUES
      ('BORNEO CONVENTION CENTRE KUCHING','BCCK'),
      ('MIDVALLEY SOUTHKEY JB','MVEC Southkey'),
      ('SPICE ARENA','Spice Arena'),
      ('PISA SPICE ARENA','Pisa Spice Arena');
    UPDATE comm_venues SET canonical_key='SPICE ARENA' WHERE venue_key='PISA SPICE ARENA';
  `)

  await productionFunction('20260917020000_venue_feed_window_pay_preview', 'venue_key')
  await productionFunction('20260918020000_venue_aliases', 'venue_group_key')
  await productionFunction('20260911020000_commission_order_sub_departments', 'commission_order_period_locked')
  await productionFunction('20260905010000_erp_live_sync', 'erp_sync_refresh_batch')
  await productionFunction('20260918040000_venue_organisers', 'venue_event_organiser')

  // THE MIGRATION ITSELF, VERBATIM.
  await db.exec(
    await readFile(new URL('20260920050000_the_fair_sets_the_month.sql', migrations), 'utf8'),
  )
  await db.exec(
    await readFile(new URL('20260923010000_the_claim_form_confirms_the_fair.sql', migrations), 'utf8'),
  )
  await db.exec(
    await readFile(new URL('20260923020000_venue_key_once_per_call.sql', migrations), 'utf8'),
  )

  const augBatch = await one(
    `INSERT INTO sales_import_batches(period_month,file_name,sub_department_id)
     VALUES ($1,'aug',$2) RETURNING id`, [AUG, FAIR_SUB])
  const sepBatch = await one(
    `INSERT INTO sales_import_batches(period_month,file_name,sub_department_id)
     VALUES ($1,'sep',$2) RETURNING id`, [SEP, FAIR_SUB])

  // ─── the window's own rules ───────────────────────────────────────────────

  await reject(
    `INSERT INTO comm_venue_events(venue_key,period_month,start_date,end_date)
     VALUES ('SPICE ARENA','2026-08-01','2026-08-09',NULL)`, [], /window_paired/)

  await reject(
    `INSERT INTO comm_venue_events(venue_key,period_month,start_date,end_date)
     VALUES ('SPICE ARENA','2026-08-01','2026-08-09','2026-08-07')`, [], /window_ordered/)

  await reject(
    `INSERT INTO comm_venue_events(venue_key,period_month,start_date,end_date)
     VALUES ('SPICE ARENA','2026-10-01','2026-08-07','2026-08-09')`, [], /window_in_month/)

  // A fair over month end may be filed under either month it touched.
  const straddle = await fair('SPICE ARENA', SEP, '2026-08-30', '2026-09-02')
  await q('DELETE FROM comm_venue_events WHERE id=$1', [straddle])
  checks++

  // One hall, one month, two fairs — the case the old UNIQUE could not hold.
  const rex = await fair('MIDVALLEY SOUTHKEY JB', AUG, '2026-08-14', '2026-08-16')
  const bighome = await fair('MIDVALLEY SOUTHKEY JB', AUG, '2026-08-29', '2026-08-31')
  check(Number(await one(
    `SELECT count(*) FROM comm_venue_events WHERE venue_key='MIDVALLEY SOUTHKEY JB'`)), 2,
    'one venue may hold two fairs in a month')

  await reject(
    `INSERT INTO comm_venue_events(venue_key,period_month,start_date,end_date)
     VALUES ('MIDVALLEY SOUTHKEY JB','2026-08-01','2026-08-15','2026-08-18')`, [],
    /no_overlap|exclusion/i)

  // Undated rows keep their old guarantee: one answer per (place, month).
  await q(`INSERT INTO comm_venue_events(venue_key,period_month) VALUES ('SPICE ARENA','2026-08-01')`)
  await reject(
    `INSERT INTO comm_venue_events(venue_key,period_month) VALUES ('SPICE ARENA','2026-08-01')`,
    [], /uq_comm_venue_events_undated/)

  // ─── which fair a bill belongs to ─────────────────────────────────────────

  const kuching = await fair('BORNEO CONVENTION CENTRE KUCHING', AUG, '2026-08-28', '2026-08-31')

  check(await one(`SELECT venue_event_for_order('BORNEO CONVENTION CENTRE KUCHING','2026-08-29')`),
    kuching, 'a bill written during the fair belongs to it')
  check(await one(`SELECT venue_event_for_order('BORNEO CONVENTION CENTRE KUCHING','2026-09-16')`),
    kuching, 'a bill keyed 16 days late still belongs to it')
  check(await one(`SELECT venue_event_for_order('BORNEO CONVENTION CENTRE KUCHING','2026-10-16')`),
    null, 'a bill keyed beyond the grace window belongs to nothing')
  check(await one(`SELECT venue_event_for_order('BORNEO CONVENTION CENTRE KUCHING','2026-08-20')`),
    null, 'a bill dated before the fair is not placed in a fair that had not opened')

  check(await one(`SELECT venue_event_for_order('MIDVALLEY SOUTHKEY JB','2026-08-15')`), rex,
    'the fair that was open on the day wins')
  check(await one(`SELECT venue_event_for_order('MIDVALLEY SOUTHKEY JB','2026-08-22')`), rex,
    'between two fairs, the bill belongs to the one that just closed')
  check(await one(`SELECT venue_event_for_order('MIDVALLEY SOUTHKEY JB','2026-09-03')`), bighome,
    'after the second fair, the bill belongs to the second')

  // An alias resolves to the place, so a fair typed once covers every spelling.
  const spice = await fair('SPICE ARENA', SEP, '2026-09-04', '2026-09-06')
  check(await one(`SELECT venue_event_for_order('PISA SPICE ARENA','2026-09-05')`), spice,
    'a merged spelling belongs to the place its fair was typed against')

  // ─── the stamp, on every write path ───────────────────────────────────────

  const during = await bill('HC11363', '2026-08-29', 'HOMELOVE BCCK KUCHING', augBatch)
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [during]), null,
    'a venue the register has never seen belongs to no fair')

  const late = await bill('HC13440', '2026-09-02', 'BORNEO CONVENTION CENTRE KUCHING', sepBatch, 6999)
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [late]), kuching,
    'a bill inserted after the calendar exists is stamped on the way in')
  check(await one('SELECT fair_source FROM sales_orders WHERE id=$1', [late]), 'venue_match',
    'and says how it was decided')

  // A human's answer survives the resolver.
  await q(`UPDATE sales_orders SET fair_event_id=$1, fair_source='manual' WHERE id=$2`, [spice, late])
  await q(`UPDATE sales_orders SET venue='BORNEO CONVENTION CENTRE KUCHING' WHERE id=$1`, [late])
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [late]), spice,
    'a fair a human picked is never re-resolved')
  await q(`UPDATE sales_orders SET fair_source=NULL WHERE id=$1`, [late])
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [late]), kuching,
    'clearing the manual flag hands the bill back to the resolver')

  // ─── typing a fair re-stamps the bills already there ──────────────────────

  const early = await bill('HC11446', '2026-09-05', 'MIDVALLEY SOUTHKEY JB', sepBatch, 4500)
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [early]), bighome,
    'an existing bill is stamped by the fair that already covered it')

  const lateFair = await fair('MIDVALLEY SOUTHKEY JB', SEP, '2026-09-04', '2026-09-06')
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [early]), lateFair,
    'adding a nearer fair re-stamps the bills at that place')

  await q('DELETE FROM comm_venue_events WHERE id=$1', [lateFair])
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [early]), bighome,
    'removing a fair hands its bills back to whatever still covers them')

  // ─── what would move, and moving it ───────────────────────────────────────

  const moves = await q(
    `SELECT order_no, from_period::text, to_period::text, locked
       FROM revenue_fair_calendar_moves($1) ORDER BY order_no`, [FAIR_SUB])
  check(moves.map(r => [r.order_no, r.from_period, r.to_period, r.locked]), [
    ['HC11446', SEP, AUG, false],
    ['HC13440', SEP, AUG, false],
  ], 'both September-keyed bills belong to an August fair')

  check(Number(await one(
    `SELECT count(*) FROM revenue_fair_calendar_moves($1)`, [IR_SUB])), 0,
    'another sub-department is not touched')

  // months_touched is a DATE[]; read it back as text so the assertion does not
  // depend on the runner's timezone.
  const applied = (await q(
    `SELECT orders_moved, value_moved,
            (SELECT array_agg(m::text ORDER BY m) FROM unnest(months_touched) m) AS months
       FROM revenue_apply_fair_calendar($1)`, [FAIR_SUB]))[0]
  check(applied.orders_moved, 2, 'both bills moved')
  check(Number(applied.value_moved), 11499, 'and their value with them')
  check(applied.months, [AUG, SEP], 'both months were touched')

  check(Number(await one(
    `SELECT count(*) FROM sales_orders o JOIN sales_import_batches b ON b.id=o.batch_id
      WHERE b.period_month <> o.period_month`)), 0,
    'the batch moved with the month — the run reads orders by batch')

  check(Number(await one(
    `SELECT count(*) FROM sales_orders WHERE period_month=$1`, [AUG])), 3,
    'August now holds every bill written at an August fair')

  check((await q('SELECT * FROM revenue_apply_fair_calendar($1)', [FAIR_SUB]))[0].orders_moved, 0,
    'running it again moves nothing')

  // ─── moving only what a human confirmed (20260923010000) ──────────────────
  //
  // With September's fairs untyped, the 45-day grace hands a September bill
  // at Kuching to the August fair. The claim form is what tells them apart.

  const guess = await bill('HC70001', '2026-09-20', 'BORNEO CONVENTION CENTRE KUCHING', sepBatch, 3000)
  const claimed = await bill('HC70002', '2026-09-20', 'BORNEO CONVENTION CENTRE KUCHING', sepBatch, 7000)
  await q(`UPDATE sales_orders SET fair_source='manual' WHERE id=$1`, [claimed])

  const split = await q(
    `SELECT order_no, confirmed FROM revenue_fair_calendar_moves($1) ORDER BY order_no`, [FAIR_SUB])
  check(split.map(r => [r.order_no, r.confirmed]), [
    ['HC70001', false],
    ['HC70002', true],
  ], 'the preview says which move a human confirmed')

  const kuchingRow = (await q(
    `SELECT bills_to_move, confirmed_to_move, confirmed_value_to_move
       FROM revenue_fair_calendar() WHERE fair_id=$1`, [kuching]))[0]
  check([kuchingRow.bills_to_move, kuchingRow.confirmed_to_move, Number(kuchingRow.confirmed_value_to_move)],
    [2, 1, 7000], 'the calendar counts confirmed moves per fair')

  const confirmedOnly = (await q(
    `SELECT orders_moved, value_moved FROM revenue_apply_fair_calendar($1, TRUE)`, [FAIR_SUB]))[0]
  check([confirmedOnly.orders_moved, Number(confirmedOnly.value_moved)], [1, 7000],
    'confirmed-only moves only the claimed bill')
  check(await one('SELECT period_month::text FROM sales_orders WHERE id=$1', [claimed]), AUG,
    "the claimed bill is in the fair's month")
  check(await one('SELECT period_month::text FROM sales_orders WHERE id=$1', [guess]), SEP,
    'the guessed bill stayed where it was')
  check(Number(await one(
    `SELECT count(*) FROM sales_orders o JOIN sales_import_batches b ON b.id=o.batch_id
      WHERE b.period_month <> o.period_month`)), 0,
    'the claimed bill took its batch with it')
  check((await q('SELECT * FROM revenue_apply_fair_calendar($1, TRUE)', [FAIR_SUB]))[0].orders_moved, 0,
    'confirmed-only has nothing left to move')

  // A typed September fair takes the guess back; the pinned bill does not budge.
  const kuchingSep = await fair('BORNEO CONVENTION CENTRE KUCHING', SEP, '2026-09-18', '2026-09-20')
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [guess]), kuchingSep,
    "typing next month's fair re-stamps the guess")
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [claimed]), kuching,
    "and leaves the claim form's answer alone")
  check(Number(await one(`SELECT count(*) FROM revenue_fair_calendar_moves($1)`, [FAIR_SUB])), 0,
    'nothing disagrees any more')
  await q('DELETE FROM sales_orders WHERE id = ANY($1)', [[guess, claimed]])
  await q('DELETE FROM comm_venue_events WHERE id=$1', [kuchingSep])

  // ─── a run that has paid refuses the move ─────────────────────────────────

  const back = await bill('HC13930', '2026-09-07', 'BORNEO CONVENTION CENTRE KUCHING', sepBatch, 5000)
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [back]), kuching,
    'a new late bill is stamped to the August fair')

  await q(`INSERT INTO comm_runs(period_month,status,sub_department_id) VALUES ($1,'applied',$2)`,
    [AUG, FAIR_SUB])
  await reject('SELECT * FROM revenue_apply_fair_calendar($1)', [FAIR_SUB], /has paid/)
  check(await one('SELECT period_month::text FROM sales_orders WHERE id=$1', [back]), SEP,
    'and the bill stayed where it was')

  // A run somebody has reopened lets it through again.
  await q(`UPDATE comm_runs SET status='computed' WHERE period_month=$1`, [AUG])
  check((await q('SELECT * FROM revenue_apply_fair_calendar($1)', [FAIR_SUB]))[0].orders_moved, 1,
    'reopening the run releases the move')

  // A carry-forward release into a paid run locks the month it came from too.
  const run = await one(
    `INSERT INTO comm_runs(period_month,status,sub_department_id) VALUES ($1,'applied',$2) RETURNING id`,
    [SEP, FAIR_SUB])
  await q(
    `INSERT INTO comm_order_releases(run_id,order_no,period_month,order_period_month,sub_department_id)
     VALUES ($1,'HC13930',$2,$3,$4)`, [run, SEP, AUG, FAIR_SUB])
  const blocked = await bill('HC13988', '2026-09-08', 'BORNEO CONVENTION CENTRE KUCHING', sepBatch)
  await reject('SELECT * FROM revenue_apply_fair_calendar($1)', [FAIR_SUB], /has paid/)
  check(await one('SELECT period_month::text FROM sales_orders WHERE id=$1', [blocked]), SEP,
    'a month a paid run carried a bill out of is locked as well')

  // ─── the work list ────────────────────────────────────────────────────────

  await q('DELETE FROM comm_order_releases')
  await q('DELETE FROM comm_runs')
  const orphan = await bill('HC99999', '2026-07-04', 'SPICE ARENA', augBatch, 2500)
  check(await one('SELECT fair_event_id FROM sales_orders WHERE id=$1', [orphan]), null,
    'a bill no fair covers is left unplaced')
  const gaps = await q(
    `SELECT venue_key, period_month::text, bills FROM revenue_fair_calendar_gaps()`)
  check(gaps.map(g => [g.venue_key, g.period_month, g.bills]), [
    // A spelling the venue register has never seen is a gap too — which is
    // how an unregistered venue surfaces rather than going quietly missing.
    ['HOMELOVE BCCK KUCHING', '2026-08-01', 1],
    ['SPICE ARENA', '2026-07-01', 1],
  ], 'and shows up on the work list under the month its ERP date gives it')

  const calendar = await q(
    `SELECT display_name, bills, bills_to_move FROM revenue_fair_calendar()
      WHERE start_date IS NOT NULL ORDER BY display_name`)
  check(calendar.map(c => [c.display_name, c.bills, c.bills_to_move]), [
    ['BCCK', 3, 1],
    ['MVEC Southkey', 1, 0],
    ['MVEC Southkey', 0, 0],
    ['Spice Arena', 0, 0],
  ], 'the calendar counts what each fair sold and what is still in the wrong month')

  console.log(`fair calendar: ${checks} checks passed`)
} finally {
  await db.close()
}
