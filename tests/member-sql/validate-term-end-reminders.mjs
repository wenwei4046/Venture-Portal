// Local PostgreSQL regression for 20261025046500 (2026-10-24 — asked whether a contract's end should remind HR too, the
// user: "need 30 days and 15 days before remind, 2 reminder, then for probation need same as well"). The migration runs
// VERBATIM, twice, over stand-ins for the sign-in (production's auth.uid()), the permission checks — answered per
// account from a table, so "asked as them" is really switched account by account — the people and the notices. What
// it leaves alone comes from the migrations that made it, md5-checked against production's: the probation's
// acknowledgement, its trigger and its reviews (20261024214500), probation_notice_may (20261024223000) and the sweep
// the deploy before this one runs (20261025012000). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const read = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1) // LI SEAN — the HR scope, People · Edit and the person page's box: told, and may acknowledge
const HR_SHUT = id(2) // the HR scope and People · Edit, the person page's box unticked: never told
const FIN = id(3) // People · Edit without the HR scope: never told
const IVY = id(6) // HR, may acknowledge — and on a contract herself
const DEPT_HR = id(50)
const DEPT_SALES = id(51)
const TITLE = id(60)

/** Signed in as this account (production's auth.uid() reads request.jwt.claim.sub first), or as the system ('' / null). */
const as = user => q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
const asSystem = () => as(null)
const sweep = at => one(`SELECT public.notify_term_ends($1::timestamptz)`, [at])
const told = async user =>
  (await q(`SELECT title, body, data ->> 'due' AS due FROM public.app_notifications WHERE user_id = $1 ORDER BY title, data ->> 'due'`, [user]))
    .map(r => `${r.title} | ${r.body} | ${r.due}`)
const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  -- Production's auth.uid(), body for body.
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  -- Supabase's default: every new function callable by everybody, until a migration says otherwise.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL);
  -- probation_end and contract_end are GENERATED in production (20261024214500, 20261025013000); what is checked here
  -- only reads them, so the checks set them.
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL,
    first_name text, last_name text, employee_code text, designation text, title_id uuid, user_id uuid, department_id uuid,
    status text NOT NULL DEFAULT 'active', hire_date date, employment_status text, probation_months smallint, probation_end date,
    probation_ack_end date, probation_ack_by uuid, probation_ack_name text, probation_ack_at timestamptz,
    contract_months smallint, contract_end date, created_at timestamptz NOT NULL DEFAULT now());
  -- As production since mig 20261009050100: no table-wide SELECT for a session, the columns one by one.
  GRANT INSERT, UPDATE ON public.hr_staff_costs TO authenticated;
  GRANT SELECT (id, employee_name, status, employment_status, contract_months, contract_end) ON public.hr_staff_costs TO authenticated;

  -- Each account's answers: the HR scope, People · Edit, the person page's box.
  CREATE TABLE public.test_perm(user_id uuid PRIMARY KEY, hr boolean NOT NULL DEFAULT false, edit boolean NOT NULL DEFAULT false,
    box boolean NOT NULL DEFAULT false);
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT 'hr' = ANY (p_scopes) AND coalesce((SELECT p.hr FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT 'team.edit' = ANY (p_wants) AND coalesce((SELECT p.edit FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_pages = ARRAY['/team/people/[id]'] AND p_wants = ARRAY['team.edit']
       AND coalesce((SELECT p.box FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;
  CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    IF public.tab_write_open(p_pages, p_wants) IS NOT TRUE THEN
      RAISE EXCEPTION 'People · Edit is unticked for you on %', p_pages[1] USING ERRCODE = '42501';
    END IF;
  END $$;

  -- The notices and the topics as production holds them on 2026-10-24, checks included.
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '' CHECK (length(body) <= 400),
    ref_kind text NOT NULL, ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
    push_taken_at timestamptz, pushed_at timestamptz, data jsonb,
    CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance', 'crm', 'hiring', 'it', 'marketing', 'memo', 'people', 'review', 'rooms', 'share'])),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite',
      'hiring_request', 'hr_staff', 'it_request', 'member_request', 'memo', 'mkt_project', 'share_request'])));
  CREATE TABLE public.notification_topics (user_id uuid NOT NULL REFERENCES public.users(id), topic text NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, topic),
    CONSTRAINT notification_topics_topic_check CHECK (topic = ANY (ARRAY['hiring.guest', 'it.requests', 'member.requests', 'people.probation', 'rooms.guest'])));
`)

// ── What this migration leaves alone, as production runs it ─────────────────────
const statement = (sql, re, what) => {
  const m = re.exec(sql)
  assert.ok(m, what)
  return m[0]
}
const status = await read('20261024214500_people_employment_status.sql')
await db.exec(statement(status, /CREATE OR REPLACE FUNCTION public\.hr_staff_costs_probation_ack\(\)[\s\S]*?\n\$fn\$;/, 'the probation’s trigger is in 20261024214500'))
await db.exec(statement(status, /DROP TRIGGER IF EXISTS hr_staff_costs_probation_ack[\s\S]*?EXECUTE FUNCTION public\.hr_staff_costs_probation_ack\(\);/, '…and its trigger'))
await db.exec(statement(status, /CREATE OR REPLACE FUNCTION public\.probation_reviews\(\)[\s\S]*?\n\$fn\$;/, 'probation_reviews is in 20261024214500'))
await db.exec(statement(status, /CREATE OR REPLACE FUNCTION public\.probation_acknowledge\([\s\S]*?\n\$fn\$;/, 'probation_acknowledge is in 20261024214500'))
await db.exec(statement(await read('20261024223000_probation_push.sql'), /CREATE OR REPLACE FUNCTION public\.probation_notice_may\([\s\S]*?\n\$fn\$;/, 'probation_notice_may is in 20261024223000'))
await db.exec(statement(await read('20261025012000_probation_notice_15_days.sql'), /CREATE OR REPLACE FUNCTION public\.notify_probation_due\([\s\S]*?\n\$fn\$;/, 'the 15-day sweep is in 20261025012000'))
const LEFT_ALONE = {
  'public.hr_staff_costs_probation_ack()': '731101efcbf13b982cd70d683a0cb452',
  'public.probation_reviews()': '7fe61bf1c99fda3bb78a8aeb0a6aa324',
  'public.probation_acknowledge(uuid)': 'cc5950d21ddb4109e2591bd0db630587',
  'public.probation_notice_may(uuid)': '684261a7856b0d223ee60e5ef185b7c7',
  'public.notify_probation_due(timestamptz)': 'f17f28df7e64b27d8da1d6108bb4cb18',
}
for (const [sig, sum] of Object.entries(LEFT_ALONE)) check(await md5(sig), sum, `${sig} as production runs it`)

await db.exec(`
  INSERT INTO public.users (id, name, email, is_active) VALUES
    ('${HR}', 'li', 'li@x.my', true), ('${HR_SHUT}', 'Shut', 'shut@x.my', true), ('${FIN}', 'Finance', 'fin@x.my', true),
    ('${IVY}', 'ivy', 'ivy@x.my', true);
  INSERT INTO public.test_perm (user_id, hr, edit, box) VALUES
    ('${HR}', true, true, true), ('${HR_SHUT}', true, true, false), ('${FIN}', false, true, true), ('${IVY}', true, true, true);
  INSERT INTO public.departments (id, name) VALUES ('${DEPT_HR}', 'HR'), ('${DEPT_SALES}', 'Sales');
  INSERT INTO public.titles (id, name) VALUES ('${TITLE}', 'Revenue Specialist');
  INSERT INTO public.hr_staff_costs (employee_name, user_id, department_id, employment_status) VALUES ('LI SEAN', '${HR}', '${DEPT_HR}', 'permanent');
`)

// ── The migration, verbatim — twice: the second run changes nothing ─────────────
const file = await read('20261025046500_people_term_end_reminders.sql')
await db.exec(file)
const MADE = ['public.hr_staff_costs_contract_ack()', 'public.contract_reviews()', 'public.contract_acknowledge(uuid)', 'public.notify_term_ends(timestamptz)']
const first = await Promise.all(MADE.map(md5))
await db.exec(file)
check(await Promise.all(MADE.map(md5)), first, 'applied again, every body is the same')
check(first, [
  'be1aa384fc20dd7a8329410814254624', 'f9a9733627e0792707db973bea9f5f10', 'a1ec21303a4e3ac023f87344acb633b4', '976fc8bc965e0b1bc298e527e268ce41',
], 'the four bodies production is given (md5)')
for (const [sig, sum] of Object.entries(LEFT_ALONE)) check(await md5(sig), sum, `${sig} untouched`)
check(await one(`SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('hr_staff_costs_contract_ack', 'hr_staff_costs_probation_ack')`), 2, 'both acknowledgements keep their trigger, once')

// ── Who may call what, and read what ────────────────────────────────────────────
for (const sig of ['contract_reviews()', 'contract_acknowledge(uuid)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${sig}', 'EXECUTE')`), false, `the publishable key cannot call ${sig}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE')`), true, `a sign-in calls ${sig} (it asks who)`)
}
check(await one(`SELECT has_function_privilege('anon', 'public.notify_term_ends(timestamptz)', 'EXECUTE')`), false, 'the publishable key cannot call the sweep')
check(await one(`SELECT has_function_privilege('authenticated', 'public.notify_term_ends(timestamptz)', 'EXECUTE')`), false, 'nobody signed in calls the sweep')
check(await one(`SELECT has_function_privilege('service_role', 'public.notify_term_ends(timestamptz)', 'EXECUTE')`), true, 'the sweep’s service role calls it')
for (const col of ['contract_ack_end', 'contract_ack_by', 'contract_ack_name', 'contract_ack_at'])
  check(await one(`SELECT has_column_privilege('authenticated', 'public.hr_staff_costs', $1, 'SELECT')`, [col]), true, `a sign-in reads ${col}`)

// ── People ───────────────────────────────────────────────────────────────────────
// Today is Saturday 24 Oct 2026 (the office's), for the first sweeps.
const staff = async (n, name, kind, end, more = {}) => {
  const row = { status: 'active', dept: DEPT_HR, user: null, ...more }
  await q(`INSERT INTO public.hr_staff_costs (id, employee_name, first_name, last_name, employee_code, title_id, user_id, department_id, status,
             hire_date, employment_status, probation_months, probation_end, contract_months, contract_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-01-01', $10,
                   CASE WHEN $10 = 'probation' THEN 3 END, CASE WHEN $10 = 'probation' THEN $11::date END,
                   CASE WHEN $10 = 'contract' THEN 12 END, CASE WHEN $10 = 'contract' THEN $11::date END)`,
  [id(100 + n), name, name, 'T', `HV${100 + n}`, TITLE, row.user, row.dept, row.status, kind, end])
  return id(100 + n)
}
/** An acknowledgement as its function leaves one — given at `at`, for `end` (the trigger lets its own function write). */
const acked = async (who, kind, end, at, by = HR) => {
  await q(`SELECT set_config('app.${kind}_ack', $1, false)`, [who])
  await q(`UPDATE public.hr_staff_costs SET ${kind}_ack_end = $2, ${kind}_ack_by = $3, ${kind}_ack_name = 'LI SEAN', ${kind}_ack_at = $4 WHERE id = $1`, [who, end, by, at])
  await q(`SELECT set_config('app.${kind}_ack', '', false)`)
}

// ── A contract's acknowledgement is contract_acknowledge's alone ────────────────
await asSystem()
const CON = await staff(1, 'CON', 'contract', '2026-11-23')
await refuses(`UPDATE public.hr_staff_costs SET contract_ack_end = '2026-11-23' WHERE id = $1`, [CON], /acknowledged with Acknowledge, never written straight/,
  'a straight write of the acknowledgement is refused, even for the owner')
await q(`INSERT INTO public.hr_staff_costs (id, employee_name, employment_status, contract_months, contract_end, contract_ack_end, contract_ack_name)
         VALUES ($1, 'NEW', 'contract', 12, '2027-01-31', '2027-01-31', 'Forged')`, [id(99)])
check(await q(`SELECT contract_ack_end, contract_ack_name FROM public.hr_staff_costs WHERE id = $1`, [id(99)]), [{ contract_ack_end: null, contract_ack_name: null }],
  'a new row starts unacknowledged, whatever it was filed with')

await as(FIN)
await refuses(`SELECT public.contract_reviews()`, [], /Contract reminders need People · Edit/, 'no HR scope: no contract reminders')
await refuses(`SELECT public.contract_acknowledge($1)`, [CON], /needs People · Edit/, '…nor Acknowledge')
await as(HR_SHUT)
await refuses(`SELECT public.contract_acknowledge($1)`, [CON], /unticked/, 'the person page’s box unticked: Acknowledge refused')
await as(HR)
const PRO = await staff(2, 'PRO', 'probation', '2026-11-30')
await refuses(`SELECT public.contract_acknowledge($1)`, [PRO], /not on a contract any more/, 'a probation is not a contract')
const NOEND = await staff(3, 'NOEND', 'contract', null)
await refuses(`SELECT public.contract_acknowledge($1)`, [NOEND], /no end yet — fill in their hire date first/, 'no end, nothing to acknowledge')
const answer = await one(`SELECT public.contract_acknowledge($1)`, [CON])
check([answer.endsOn, answer.ackName, typeof answer.ackAt], ['2026-11-23', 'LI SEAN', 'string'], 'acknowledged: the end, the name on their People record, the moment')
check(await q(`SELECT contract_ack_end::text, contract_ack_by, contract_ack_name FROM public.hr_staff_costs WHERE id = $1`, [CON]),
  [{ contract_ack_end: '2026-11-23', contract_ack_by: HR, contract_ack_name: 'LI SEAN' }], '…kept on the row, by whom')
check(await one(`SELECT coalesce(current_setting('app.contract_ack', true), '')`), '', 'the write’s name put back after')

const reviews = await one(`SELECT public.contract_reviews()`)
check(reviews.map(r => r.name), ['CON', 'NEW', 'NOEND'], 'everybody active on a contract, soonest end first — never a probation')
check(reviews[0], {
  id: CON, name: 'CON', firstName: 'CON', lastName: 'T', code: 'HV101', department: 'HR', title: 'Revenue Specialist', hireDate: '2026-01-01',
  months: 12, endsOn: '2026-11-23', ackEnd: '2026-11-23', ackName: 'LI SEAN', ackAt: reviews[0].ackAt,
}, 'a row as the bell reads it — the probation_reviews() shape')

// Off a contract, its acknowledgement goes; a probation's own trigger keeps to its own columns.
await asSystem()
await q(`UPDATE public.hr_staff_costs SET employment_status = 'permanent', contract_months = NULL, contract_end = NULL WHERE id = $1`, [CON])
check(await q(`SELECT contract_ack_end, contract_ack_by, contract_ack_name, contract_ack_at FROM public.hr_staff_costs WHERE id = $1`, [CON]),
  [{ contract_ack_end: null, contract_ack_by: null, contract_ack_name: null, contract_ack_at: null }], 'made permanent: the contract’s acknowledgement cleared')
await acked(PRO, 'probation', '2026-11-30', '2026-10-24T03:00:00Z')
await q(`UPDATE public.hr_staff_costs SET employment_status = 'contract', probation_months = NULL, probation_end = NULL, contract_months = 6, contract_end = '2026-12-31' WHERE id = $1`, [PRO])
check(await q(`SELECT probation_ack_end, contract_ack_end FROM public.hr_staff_costs WHERE id = $1`, [PRO]), [{ probation_ack_end: null, contract_ack_end: null }],
  'a probation turned contract: neither acknowledgement carried over')
await db.exec(`DELETE FROM public.hr_staff_costs WHERE employee_name <> 'LI SEAN'`)

// ── The sweep ─────────────────────────────────────────────────────────────────────
// Holders: HR and IVY may; HR_SHUT and FIN hold the topic but may not.
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES
  ('${HR}', 'people.probation'), ('${IVY}', 'people.probation'), ('${HR_SHUT}', 'people.probation'), ('${FIN}', 'people.probation')`)

// Before the deploy: 20261025012000's sweep told of a probation 12 days from its end, in its own key.
const OLD = await staff(10, 'OLD', 'probation', '2026-11-05') // 24 Oct + 12
check(await one(`SELECT public.notify_probation_due('2026-10-24T01:30:00Z'::timestamptz)`), 2, '9:30, the sweep before this deploy: OLD, to HR and IVY')

const P30 = await staff(11, 'P30', 'probation', '2026-11-23') // + 30: the first reminder opens today
const P31 = await staff(12, 'P31', 'probation', '2026-11-24') // + 31: tomorrow
const P15 = await staff(13, 'P15', 'probation', '2026-11-08') // + 15: straight to the second
const C30 = await staff(20, 'C30', 'contract', '2026-11-23', { dept: DEPT_SALES }) // + 30
const C20 = await staff(21, 'C20', 'contract', '2026-11-13') // + 20, the first acknowledged yesterday
await acked(C20, 'contract', '2026-11-13', '2026-10-23T03:00:00Z')
const C10 = await staff(22, 'C10', 'contract', '2026-11-03') // + 10, only the first was acknowledged (20 days before)
await acked(C10, 'contract', '2026-11-03', '2026-10-14T03:00:00Z')
const C05 = await staff(23, 'C05', 'contract', '2026-10-29') // + 5, the second acknowledged (10 days before)
await acked(C05, 'contract', '2026-10-29', '2026-10-19T03:00:00Z')
// + 14, acknowledged at 01:00 on 23 Oct the office's time — 22 Oct by UTC's clock, the first reminder's day: the
// office's day decides, so it answered the second.
const C14 = await staff(24, 'C14', 'contract', '2026-11-07')
await acked(C14, 'contract', '2026-11-07', '2026-10-22T17:00:00Z')
const CRN = await staff(25, 'CRN', 'contract', '2026-11-01') // + 8, acknowledged for the end before its renewal
await acked(CRN, 'contract', '2026-10-01', '2026-09-20T03:00:00Z')
await staff(26, 'CPAST', 'contract', '2026-10-23') // ended yesterday
await staff(27, 'CGONE', 'contract', '2026-11-01', { status: 'inactive' })
await staff(28, 'CNONE', 'contract', null) // no hire date yet: no end
const CIVY = await staff(29, 'CIVY', 'contract', '2026-11-18', { user: IVY, dept: DEPT_SALES }) // + 25 — IVY's own
await staff(30, 'PERM', 'permanent', null)

check(await sweep('2026-10-24T00:59:00Z'), 0, '08:59 the office’s time: never a phone before 9')
check(await sweep('2026-10-24T02:00:00Z'), 11, '10:00: P30, P15, C30, C10, CRN to two each, CIVY to HR alone')
check(await one(`SELECT coalesce(auth.uid()::text, 'nobody')`), 'nobody', 'the sweep is nobody again after asking as each holder')
check(await told(HR), [
  `Contract ending · C10 | Ends 3 Nov 2026 · in 10 days · HR | contract:${C10}:2026-11-03:15`,
  `Contract ending · C30 | Ends 23 Nov 2026 · in 30 days · Sales | contract:${C30}:2026-11-23:30`,
  `Contract ending · CIVY | Ends 18 Nov 2026 · in 25 days · Sales | contract:${CIVY}:2026-11-18:30`,
  `Contract ending · CRN | Ends 1 Nov 2026 · in 8 days · HR | contract:${CRN}:2026-11-01:15`,
  `Probation ending · OLD | Ends 5 Nov 2026 · in 12 days · HR | probation:${OLD}:2026-11-05`,
  `Probation ending · P15 | Ends 8 Nov 2026 · in 15 days · HR | probation:${P15}:2026-11-08:15`,
  `Probation ending · P30 | Ends 23 Nov 2026 · in 30 days · HR | probation:${P30}:2026-11-23:30`,
], 'HR: each in the bell’s own words — OLD only from before (never again), not P31 (31 days), C20 (its first acknowledged), C05 or C14 (their second acknowledged), CPAST, CGONE, CNONE')
check((await told(IVY)).map(l => l.split(' | ')[0]), [
  'Contract ending · C10', 'Contract ending · C30', 'Contract ending · CRN', 'Probation ending · OLD', 'Probation ending · P15', 'Probation ending · P30',
], 'IVY: the same — never her own contract')
check(await told(HR_SHUT), [], 'the person page’s box unticked: told nothing')
check(await told(FIN), [], 'no HR scope: told nothing')
check(await sweep('2026-10-24T07:00:00Z'), 0, 'the same day again: nobody told twice')
check(await sweep('2026-10-25T02:00:00Z'), 2, 'Sunday: P31’s first reminder opens — to HR and IVY')

// 8 Nov — 15 days before P30 and C30 end. HR acknowledged P30’s first reminder on 25 Oct, and C30’s second this morning.
await acked(P30, 'probation', '2026-11-23', '2026-10-25T03:00:00Z')
await acked(C30, 'contract', '2026-11-23', '2026-11-08T00:30:00Z')
check(await sweep('2026-11-08T02:00:00Z'), 5, '8 Nov: P30’s second (its first acknowledged) and C20’s to two each, CIVY’s to HR')
const on8Nov = (await told(HR)).filter(l => l.endsWith(':15') && /P30|P31|C20|CIVY|C30/.test(l))
check(on8Nov, [
  `Contract ending · C20 | Ends 13 Nov 2026 · in 5 days · HR | contract:${C20}:2026-11-13:15`,
  `Contract ending · CIVY | Ends 18 Nov 2026 · in 10 days · Sales | contract:${CIVY}:2026-11-18:15`,
  `Probation ending · P30 | Ends 23 Nov 2026 · in 15 days · HR | probation:${P30}:2026-11-23:15`,
], 'the first reminder’s acknowledgement never answers the second; C30’s second, acknowledged this morning, is not sent')
check((await told(HR)).filter(l => l.includes(`probation:${P31}:`)).length, 1, 'P31 is 16 days from its end on 8 Nov: still its first, told once')
check(await sweep('2026-11-09T02:00:00Z'), 2, '9 Nov: P31’s second opens')

// Renewed: C30's contract runs a year more — its acknowledgement was for the old end, so the new end is reminded again.
await q(`UPDATE public.hr_staff_costs SET contract_months = 24, contract_end = '2027-11-23' WHERE id = $1`, [C30])
check(await sweep('2027-10-23T02:00:00Z'), 0, 'renewed to 23 Nov 2027: nothing until 30 days before it')
check(await sweep('2027-10-24T02:00:00Z'), 2, '24 Oct 2027: the new end’s first reminder')
check((await told(HR)).filter(l => l.includes(`contract:${C30}:`)).map(l => l.split(' | ')[2]),
  [`contract:${C30}:2026-11-23:30`, `contract:${C30}:2027-11-23:30`], 'one notice per end and reminder')

// Lost the right since: passed over at once, though the topic is still kept.
await q(`UPDATE public.test_perm SET box = false WHERE user_id = $1`, [IVY])
const LATE = await staff(40, 'LATE', 'probation', '2027-11-20')
check(await sweep('2027-10-24T03:00:00Z'), 1, 'LATE: HR alone now — IVY’s box was unticked')
check(await one(`SELECT count(*)::int FROM public.app_notifications WHERE ref_id = $1 AND user_id = $2`, [LATE, IVY]), 0, 'IVY is not told of LATE')

// Nobody holds the topic: nothing to do.
await db.exec(`DELETE FROM public.notification_topics WHERE topic = 'people.probation'`)
await staff(41, 'NOBODY', 'contract', '2027-11-01')
check(await sweep('2027-10-24T04:00:00Z'), 0, 'no holder: nothing written')

console.log(`term end reminders: ${checks} checks passed`)
