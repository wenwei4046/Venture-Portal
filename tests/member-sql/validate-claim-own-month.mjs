// Local PostgreSQL regression for 20261110100000 (2026-11-10 — the user: LOUIS's October food, air
// ticket and outstation claims were approved into the Nov 2026 payroll; "我要10月"). A member claim is
// paid in the payroll of the month it is FOR. `member_review_claim` here is a stand-in holding the one
// statement the migration swaps, exactly as production's body writes it; the migration runs VERBATIM,
// twice (a second run is a no-op). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TABLE member_requests(id int PRIMARY KEY, staff_id int, sub_department_id int,
      submitted_at timestamptz, created_at timestamptz DEFAULT now(), detail jsonb);
    -- What it is handed, so the stand-in can say which day it was asked about.
    CREATE FUNCTION member_claim_payroll_month(p_staff int, p_sub int, p_from date) RETURNS date
      LANGUAGE sql AS $$ SELECT date_trunc('month', p_from)::date $$;
    CREATE FUNCTION member_review_claim(p_request uuid, p_action text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE r member_requests%ROWTYPE; v_month date;
    BEGIN
      SELECT * INTO r FROM member_requests WHERE id = (p_data->>'id')::int;
      IF p_action = 'approve' THEN
        v_month := public.member_claim_payroll_month(
          r.staff_id, r.sub_department_id,
          (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
      END IF;
      RETURN jsonb_build_object('month', v_month);
    END
    $fn$;
  `)

  const sql = await readFile(new URL('20261110100000_claim_paid_in_its_own_month.sql', migrations), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // a second run changes nothing and still passes its own check

  const own = (detail, sent) => one('SELECT member_claim_own_month($1::jsonb, $2::date)::text', [detail, sent])
  check(await own('{"claimType":"food","month":"2026-10"}', '2026-11-09'), '2026-10-01', 'food: the month claimed')
  check(await own('{"claimType":"outstation","week":"2026-10-09"}', '2026-11-09'), '2026-10-01', 'outstation: the brand week\'s month')
  check(await own('{"claimType":"outstation","week":"2026-10-30"}', '2026-11-09'), '2026-10-01', 'a fair of 30 Oct–1 Nov is October\'s')
  check(await own('{"claimType":"airbnb","week":"2026-11-06"}', '2026-11-09'), '2026-11-01', 'airbnb: its week')
  check(await own('{"claimType":"food","month":"oct"}', '2026-11-09'), '2026-11-01', 'a month that is no month: when it was sent')
  check(await own('{}', '2026-11-09'), '2026-11-01', 'no month, no week: when it was sent, as before')

  // LOUIS's three, sent 9 Nov (UTC 11:18 / 11:24 / 12:40 — the office's 9 Nov too).
  await q(`INSERT INTO member_requests(id, staff_id, sub_department_id, submitted_at, detail) VALUES
    (1, 1, 1, '2026-11-09 11:24:46+00', '{"claimType":"food","month":"2026-10"}'),
    (2, 1, 1, '2026-11-09 11:18:18+00', '{"claimType":"outstation","week":"2026-10-09"}'),
    (3, 1, 1, '2026-11-09 12:40:41+00', '{"claimType":"outstation","week":"2026-10-02","planeTicket":true}'),
    (4, 1, 1, '2026-11-09 12:00:00+00', '{"claimType":"outstation","week":"2026-11-06"}')`)
  const month = id => one(`SELECT member_review_claim(gen_random_uuid(), 'approve', jsonb_build_object('id', ${id}))->>'month'`)
  check(await month(1), '2026-10-01', 'RQ-2611-010 Food Oct → Oct payroll')
  check(await month(2), '2026-10-01', 'RQ-2611-007 Outstation Sutera 9 Oct → Oct payroll')
  check(await month(3), '2026-10-01', 'RQ-2611-013 Air ticket Sabah 2 Oct → Oct payroll')
  check(await month(4), '2026-11-01', 'a November fair stays in November')

  check(await one(`SELECT has_function_privilege('authenticated', 'member_claim_own_month(jsonb, date)', 'EXECUTE')`), false,
    'no session calls it')

  console.log(`claim-own-month: ${checks} checks passed`)
} finally {
  await db.close()
}
