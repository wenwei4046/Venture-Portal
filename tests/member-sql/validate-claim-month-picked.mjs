// Local PostgreSQL regression for 20261110240000 (2026-11-10 — the user, on RQ-2611-020, an Other claim
// for the fair of 30 Oct – 1 Nov approved into the Nov 2026 payroll: "HR 要算进oct payroll 的"). HR may pick
// the payroll month; left empty, the month is worked out as before. `member_review_claim` here is a
// stand-in holding the statement the migration swaps exactly as production's body writes it (md5 10c93a93…);
// the migration runs VERBATIM, twice (a second run is a no-op). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows

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
    -- The months that can no longer take pay for anybody here (locked, closed, or their row moved on).
    CREATE TABLE shut_months(m date PRIMARY KEY);
    -- Production's rule in miniature: from the month handed, the first one still open.
    CREATE FUNCTION member_claim_payroll_month(p_staff int, p_sub int, p_from date) RETURNS date
      LANGUAGE plpgsql AS $$
      DECLARE v date := date_trunc('month', p_from)::date;
      BEGIN
        FOR i IN 1..24 LOOP
          IF NOT EXISTS (SELECT 1 FROM shut_months WHERE m = v) THEN RETURN v; END IF;
          v := (v + interval '1 month')::date;
        END LOOP;
        RETURN NULL;
      END $$;
    CREATE FUNCTION member_claim_own_month(p_detail jsonb, p_sent date) RETURNS date
      LANGUAGE sql AS $$ SELECT coalesce(date_trunc('month', (p_detail->>'week')::date), date_trunc('month', p_sent))::date $$;
    CREATE FUNCTION member_review_claim(p_request uuid, p_action text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE r member_requests%ROWTYPE; v_month date; v_name text := 'ADRIAN';
    BEGIN
      SELECT * INTO r FROM member_requests WHERE id = (p_data->>'id')::int;
      IF p_action = 'approve' THEN
    v_month := public.member_claim_payroll_month(
      r.staff_id, r.sub_department_id,
      public.member_claim_own_month(r.detail,
        (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date));
    IF v_month IS NULL THEN
      RAISE EXCEPTION 'No payroll month is open for %. Request a payment from Finance instead', v_name;
    END IF;
      END IF;
      RETURN jsonb_build_object('month', v_month);
    END
    $fn$;
  `)

  const sql = await readFile(new URL('20261110240000_claim_payroll_month_picked.sql', migrations), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // a second run changes nothing and still passes its own check

  const approve = async (data) =>
    (await q(`SELECT member_review_claim(gen_random_uuid(), 'approve', $1::jsonb)->>'month' AS m`, [JSON.stringify(data)]))[0].m
  const refusal = async (data) => {
    try { await approve(data); return null } catch (e) { return e.message }
  }

  // RQ-2611-020: an Other claim (no week), sent 10 Nov.
  await q(`INSERT INTO member_requests(id, staff_id, sub_department_id, submitted_at, detail) VALUES
    (1, 1, 1, '2026-11-10 09:39:52+00', '{"claimType":"other"}'),
    (2, 1, 1, '2026-11-10 09:39:52+00', '{"claimType":"outstation","week":"2026-10-30"}')`)

  check(await approve({ id: 1 }), '2026-11-01', 'no month picked: the month it was sent, as before')
  check(await approve({ id: 1, month: '' }), '2026-11-01', 'an empty pick is no pick')
  check(await approve({ id: 2 }), '2026-10-01', 'no month picked: a fair claim keeps its own month')
  check(await approve({ id: 1, month: '2026-10' }), '2026-10-01', 'HR picks October: October')
  check(await approve({ id: 2, month: '2026-11' }), '2026-11-01', 'HR may pick a later month too')
  check(await approve({ id: 1, month: ' 2026-10 ' }), '2026-10-01', 'spaces around the pick are fine')

  await q(`INSERT INTO shut_months VALUES ('2026-10-01')`)
  check(await refusal({ id: 1, month: '2026-10' }),
    'ADRIAN\'s October 2026 payroll can no longer take a claim. Pick another month',
    'a picked month that cannot take pay is refused, never moved on')
  check(await approve({ id: 2 }), '2026-11-01', 'unpicked, a shut month still moves on as before')

  check(await refusal({ id: 1, month: '2026-13' }), 'Pick the payroll month the claim is paid in', 'no month 13')
  check(await refusal({ id: 1, month: 'Oct 2026' }), 'Pick the payroll month the claim is paid in', 'YYYY-MM only')

  const src = (await q(`SELECT prosrc FROM pg_proc WHERE proname = 'member_review_claim'`))[0].prosrc
  check((src.match(/HR picked the month/g) ?? []).length, 1, 'swapped once, not twice')

  console.log(`validate-claim-month-picked: ${checks} checks passed`)
} finally {
  await db.close()
}
