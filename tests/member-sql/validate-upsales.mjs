// Local PostgreSQL regression for `comm_upsales` — the upsales HR records by
// hand (2026-09-24). The migration runs VERBATIM against a synthetic
// surrounding schema; what is under test is who may change an upsale and when,
// because a run that has paid must keep paying on what the rows said then.
// No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(1)
const HR_USER = id(9)
const YUNY = id(21)
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

const upsale = (period, amount = 300, ref = 'HC5315') =>
  one(
    `INSERT INTO comm_upsales(sub_department_id, period_month, staff_id, amount, sold_on, original_ref)
     VALUES ($1, $2, $3, $4, '2026-08-29', $5) RETURNING id`,
    [FAIR, period, YUNY, amount, ref],
  )

try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_key text);
    CREATE TABLE comm_runs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL,
      status text NOT NULL, sub_department_id uuid NOT NULL);
    CREATE TABLE comm_order_releases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES comm_runs(id),
      order_no text NOT NULL, order_period_month date NOT NULL, sub_department_id uuid NOT NULL);

    INSERT INTO comm_sub_departments VALUES ('${FAIR}', 'Fair');
    INSERT INTO hr_staff_costs VALUES ('${YUNY}', 'YUNY');
  `)
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [HR_USER])

  await productionFunction('20260911020000_commission_order_sub_departments', 'commission_order_period_locked')

  // THE MIGRATION ITSELF, VERBATIM.
  await db.exec(await readFile(new URL('20260924060000_comm_upsales.sql', migrations), 'utf8'))

  // ─── what an upsale is ────────────────────────────────────────────────────

  const first = await upsale(AUG)
  check(await one('SELECT amount::text FROM comm_upsales WHERE id=$1', [first]), '300.00',
    'an upsale is recorded with its amount')
  check(await one('SELECT created_by FROM comm_upsales WHERE id=$1', [first]), HR_USER,
    'and says who recorded it')

  await reject(
    `INSERT INTO comm_upsales(sub_department_id, period_month, staff_id, amount, sold_on, original_ref)
     VALUES ($1, $2, $3, 0, '2026-08-29', 'HC1')`, [FAIR, AUG, YUNY], /amount_positive/,
    'a zero upsale is refused')
  await reject(
    `INSERT INTO comm_upsales(sub_department_id, period_month, staff_id, amount, sold_on, original_ref)
     VALUES ($1, '2026-08-15', $2, 100, '2026-08-29', 'HC1')`, [FAIR, YUNY], /month_is_first/,
    'a month is its first day')
  await reject(
    `INSERT INTO comm_upsales(sub_department_id, period_month, staff_id, amount, sold_on, original_ref)
     VALUES ($1, $2, $3, 100, '2026-08-29', '   ')`, [FAIR, AUG, YUNY], /ref_present/,
    'an upsale names the bill it was added to')

  // ─── a month whose run has paid ───────────────────────────────────────────

  const sepRow = await upsale(SEP, 150, 'HC11066')
  const run = await one(
    `INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1, 'applied', $2) RETURNING id`,
    [AUG, FAIR])

  await reject(
    `INSERT INTO comm_upsales(sub_department_id, period_month, staff_id, amount, sold_on, original_ref)
     VALUES ($1, $2, $3, 500, '2026-08-29', 'PG10617')`, [FAIR, AUG, YUNY], /has paid/,
    'nothing is added to a paid month')
  await reject('UPDATE comm_upsales SET amount = 400 WHERE id=$1', [first], /has paid/,
    'nothing in a paid month changes')
  await reject('DELETE FROM comm_upsales WHERE id=$1', [first], /has paid/,
    'nothing in a paid month is removed')
  await reject(`UPDATE comm_upsales SET period_month = $2 WHERE id=$1`, [sepRow, AUG], /has paid/,
    'nothing is moved into a paid month')
  check(Number(await one('SELECT count(*) FROM comm_upsales WHERE period_month=$1', [AUG])), 1,
    'the paid month still holds exactly what it paid')

  // A month a paid run carried a bill OUT of is locked too — the same rule as
  // every other input of a run.
  await q(`INSERT INTO comm_order_releases(run_id, order_no, order_period_month, sub_department_id)
           VALUES ($1, 'HC-SO-1', $2, $3)`, [run, SEP, FAIR])
  await reject('UPDATE comm_upsales SET amount = 175 WHERE id=$1', [sepRow], /has paid/,
    'a month a paid run released a bill from is locked as well')

  // Reopening the run lets both months move again.
  await q(`UPDATE comm_runs SET status='computed' WHERE id=$1`, [run])
  await q('UPDATE comm_upsales SET amount = 350, note = $2 WHERE id=$1', [first, 'second mattress'])
  check(await one('SELECT amount::text FROM comm_upsales WHERE id=$1', [first]), '350.00',
    'a reopened month can be corrected')
  check(await one('SELECT updated_by FROM comm_upsales WHERE id=$1', [first]), HR_USER,
    'and the correction says who made it')
  await q('DELETE FROM comm_upsales WHERE id=$1', [sepRow])
  check(Number(await one('SELECT count(*) FROM comm_upsales')), 1, 'and an upsale can be removed')

  // ─── the fair it was sold at is a reference, not a dependency ─────────────

  const fair = await one(`INSERT INTO comm_venue_events(venue_key) VALUES ('BCCK') RETURNING id`)
  await q('UPDATE comm_upsales SET fair_event_id=$2 WHERE id=$1', [first, fair])
  await q('DELETE FROM comm_venue_events WHERE id=$1', [fair])
  check(await one('SELECT fair_event_id FROM comm_upsales WHERE id=$1', [first]), null,
    'deleting a fair leaves the upsale standing, without the fair')

  console.log(`upsales: ${checks} checks passed`)
} finally {
  await db.close()
}
