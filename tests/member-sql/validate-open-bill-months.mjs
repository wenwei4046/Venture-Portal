// Local PostgreSQL regression for Open Bill set per month, and for a month
// settled by hand taking no run (2026-09-26).
//
// `20260926030000_open_bill_per_month.sql` runs VERBATIM against a synthetic
// surrounding schema. The fixture is the user's own case: August 2026 was paid
// from the claim form with its Open Bill incentives, September keeps the
// scheme's switch off, and the portal pays from September.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(1)
const YUNY = id(31)
const AUG = '2026-08-01'
const SEP = '2026-09-01'
const OCT = '2026-10-01'

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
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION current_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'hr'::text $$;
    CREATE FUNCTION erp_sync_sub_department() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT '${FAIR}'::uuid $$;

    CREATE TABLE users(id uuid PRIMARY KEY, name text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text);
    CREATE TYPE sales_import_status AS ENUM ('draft','committed','superseded');
    CREATE TABLE sales_import_batches(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      period_month date NOT NULL, file_name text NOT NULL DEFAULT 'x',
      status sales_import_status NOT NULL DEFAULT 'committed',
      superseded_at timestamptz, source text NOT NULL DEFAULT 'erp_sync',
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, event_date date NOT NULL,
      staff_id uuid REFERENCES hr_staff_costs(id), cancelled boolean NOT NULL DEFAULT false,
      source text NOT NULL DEFAULT 'erp_sync', sequence_in_day integer);
    CREATE TABLE sales_order_open_bill_tags(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE CASCADE,
      staff_id uuid NOT NULL, event_date date NOT NULL, bill_rank smallint NOT NULL,
      auto_suggested boolean NOT NULL DEFAULT false, tagged_by uuid,
      tagged_at timestamptz NOT NULL DEFAULT now(), sub_department_id uuid,
      CONSTRAINT uq_bill_rank_per_sub_staff_day UNIQUE (sub_department_id, staff_id, event_date, bill_rank));
    CREATE TABLE comm_schemes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid NOT NULL,
      enable_open_bill boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
      effective_to date);
    CREATE TABLE comm_runs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL,
      status text NOT NULL, sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));
    CREATE TABLE comm_order_releases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES comm_runs(id),
      order_no text NOT NULL, order_period_month date NOT NULL,
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id));
    CREATE TABLE erp_feed_closed_months(sub_department_id uuid, period_month date);
    CREATE TABLE comm_cutovers(sub_department_id uuid PRIMARY KEY, first_paid_month date NOT NULL);

    -- The trigger exists in production; the migration replaces its function.
    CREATE FUNCTION guard_open_bill_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER sales_order_open_bill_tags_scope BEFORE INSERT OR UPDATE ON sales_order_open_bill_tags
      FOR EACH ROW EXECUTE FUNCTION guard_open_bill_scope();

    INSERT INTO comm_sub_departments(id, name) VALUES ('${FAIR}', 'Fair');
    INSERT INTO hr_staff_costs(id, employee_name) VALUES ('${YUNY}', 'YUNY');
    INSERT INTO comm_schemes(sub_department_id, enable_open_bill) VALUES ('${FAIR}', FALSE);
  `)
  await productionFunction('20260911020000_commission_order_sub_departments', 'commission_order_period_locked')
  await productionFunction('20260926020000_portal_pays_from_and_erp_adjustments', 'comm_first_paid_month')
  await productionFunction('20260926020000_portal_pays_from_and_erp_adjustments', 'erp_feed_month_closed')

  // … and THE MIGRATION ITSELF, VERBATIM.
  await db.exec(await readFile(new URL('20260926030000_open_bill_per_month.sql', migrations), 'utf8'))

  const on = month => one('SELECT comm_open_bill_on($1, $2)', [FAIR, month])
  const batch = (month, source = 'erp_sync', status = 'committed') =>
    one(`INSERT INTO sales_import_batches(period_month, source, status, sub_department_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [month, source, status, FAIR])
  const order = (b, month, no, day, seq, source = 'erp_sync') =>
    one(`INSERT INTO sales_orders(batch_id, period_month, order_no, event_date, staff_id, sequence_in_day, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [b, month, no, day, YUNY, seq, source])
  const tag = (o, day, rank) =>
    q(`INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank) VALUES ($1,$2,$3,$4)`,
      [o, YUNY, day, rank])
  const tags = () => q(`SELECT o.order_no, t.bill_rank, t.auto_suggested
                          FROM sales_order_open_bill_tags t JOIN sales_orders o ON o.id = t.order_id ORDER BY 1`)

  // ─── the rule ─────────────────────────────────────────────────────────────

  check([await on(AUG), await on(SEP)], [false, false], 'no month set: the scheme decides, and it is off')
  await q(`INSERT INTO comm_open_bill_months(sub_department_id, period_month, enabled) VALUES ($1,$2,TRUE)`, [FAIR, AUG])
  check([await on(AUG), await on('2026-08-29'), await on(SEP)], [true, true, false],
    'August on for itself, any day of it; September still follows the scheme')
  await reject(`INSERT INTO comm_open_bill_months(sub_department_id, period_month, enabled) VALUES ($1,'2026-08-15',TRUE)`,
    [FAIR], /month_is_first/, 'a month is its first day')

  // ─── a pick asks the order's month ────────────────────────────────────────

  const aug = await batch(AUG, 'file')
  const sep = await batch(SEP)
  const hc12935 = await order(aug, AUG, 'HC12935', '2026-08-07', null, 'file')
  const sepBill = await order(sep, SEP, 'HC-SO-2609-001', '2026-09-05', null)
  await tag(hc12935, '2026-08-07', 1)
  check((await tags()).map(t => t.order_no), ['HC12935'], 'an August bill takes its 1st-bill pick')
  check(await one(`SELECT sub_department_id FROM sales_order_open_bill_tags`), FAIR, 'stamped with its sub-department')
  await reject(`INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank) VALUES ($1,$2,'2026-09-05',1)`,
    [sepBill, YUNY], /Open Bill is disabled for this sub-department in September 2026/,
    'a September bill does not, while the scheme is off')

  // Scheme on, October switched off for itself.
  await q(`UPDATE comm_schemes SET enable_open_bill = TRUE`)
  await q(`INSERT INTO comm_open_bill_months(sub_department_id, period_month, enabled) VALUES ($1,$2,FALSE)`, [FAIR, OCT])
  check([await on(AUG), await on(SEP), await on(OCT)], [true, true, false], 'a month can be switched off under a scheme that is on')
  await q(`UPDATE comm_schemes SET enable_open_bill = FALSE`)

  // ─── the feed's suggestions ───────────────────────────────────────────────

  const augLive = await batch(AUG, 'erp_sync', 'superseded')
  const a1 = await order(augLive, AUG, 'HC-SO-A1', '2026-08-08', 1)
  await order(sep, SEP, 'HC-SO-S1', '2026-09-06', 1)
  const suggested = await one(`SELECT erp_sync_suggest_open_bill_days($1, ARRAY['2026-08-08','2026-09-06']::date[])`, [YUNY])
  check([suggested, (await tags()).map(t => t.order_no)], [1, ['HC-SO-A1', 'HC12935']],
    "the feed suggests in August, where Open Bill pays, and not in September")
  check(await one(`SELECT auto_suggested FROM sales_order_open_bill_tags WHERE order_id = $1`, [a1]), true,
    'as a suggestion')

  // ─── a file's suggestions ─────────────────────────────────────────────────

  const octFile = await batch(OCT, 'file', 'draft')
  await order(octFile, OCT, 'HC-OCT-1', '2026-10-03', 1, 'file')
  check(await one(`SELECT commit_sales_import_batch($1, TRUE)`, [octFile]), 0,
    'October switched off: committing a file suggests nothing')
  await q(`DELETE FROM comm_open_bill_months WHERE period_month = $1`, [OCT])
  const novFile = await batch('2026-11-01', 'file', 'draft')
  await order(novFile, '2026-11-01', 'HC-NOV-1', '2026-11-07', 1, 'file')
  check(await one(`SELECT commit_sales_import_batch($1, TRUE)`, [novFile]), 0,
    'November follows the scheme, which is off')
  await q(`INSERT INTO comm_open_bill_months(sub_department_id, period_month, enabled) VALUES ($1,'2026-12-01',TRUE)`, [FAIR])
  const decFile = await batch('2026-12-01', 'file', 'draft')
  await order(decFile, '2026-12-01', 'HC-DEC-1', '2026-12-05', 1, 'file')
  check(await one(`SELECT commit_sales_import_batch($1, TRUE)`, [decFile]), 1,
    'December switched on for itself: its 1st bill is suggested')

  // ─── no run for a month settled by hand ───────────────────────────────────

  check(await one(`INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1,'draft',$2) RETURNING 'ok'`, [AUG, FAIR]),
    'ok', 'without a first paid month, August may take a run')
  await q(`DELETE FROM comm_runs`)
  await q(`INSERT INTO comm_cutovers(sub_department_id, first_paid_month) VALUES ($1,$2)`, [FAIR, SEP])
  await reject(`INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1,'draft',$2)`, [AUG, FAIR],
    /August 2026 was settled by hand — the portal pays from September 2026/,
    'with the portal paying from September, August takes no run')
  const run = await one(`INSERT INTO comm_runs(period_month, status, sub_department_id) VALUES ($1,'draft',$2) RETURNING id`, [SEP, FAIR])
  check(await one(`UPDATE comm_runs SET status = 'applied' WHERE id = $1 RETURNING status`, [run]), 'applied',
    'September runs as before')
  await reject(`UPDATE comm_runs SET period_month = $1 WHERE id = $2`, [AUG, run], /settled by hand/,
    'and no run moves back into a settled month')

  console.log(`open bill per month + no run before the cutover: ${checks} checks passed`)
} finally {
  await db.close()
}
