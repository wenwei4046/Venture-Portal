// Local PostgreSQL regression for 20261025052000 (2026-10-24 — the user: "当它已经 expired 之后，到时候按一下 renew，就可以
// 再选一次是几个月，对不对？同时要 attach 一个新的 contract"; "我们 select 那个 state 的时候，我要他能够 attach 一个 form … 当然包括
// letter 的 type"). The migration runs VERBATIM, twice, over the roster's contract columns, its acknowledgement and the
// old probation sweep exactly as the migrations that made them write them (20261025013000, 20261025046500,
// 20261025012000), with stand-ins for the sign-in (production's auth.uid()) and the permission check — answered per
// account from a table. No live I/O.
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
const statement = (sql, re, what) => {
  const m = re.exec(sql)
  assert.ok(m, what)
  return m[0]
}

const DOC = id(1) // HR with Documentation · Create — offered the letter types
const FIN = id(2) // Finance, no Documentation · Create — refused them
const as = user => q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
/** A staff row's contract as the database keeps it, dates as text. */
const contract = async staff =>
  (await q(`SELECT employment_status AS status, contract_start::text AS start, contract_months AS months, contract_end::text AS ends,
                   contract_ack_end::text AS ack FROM public.hr_staff_costs WHERE id = $1`, [staff]))[0]

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
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, user_id uuid,
    status text NOT NULL DEFAULT 'active', hire_date date, employment_status text, probation_months smallint);
  -- As production since mig 20261009050100: no table-wide SELECT for a session, the columns one by one.
  GRANT INSERT, UPDATE ON public.hr_staff_costs TO authenticated;
  GRANT SELECT (id, employee_name, status, hire_date, employment_status) ON public.hr_staff_costs TO authenticated;

  -- Each account's answer to Documentation · Create.
  CREATE TABLE public.test_perm(user_id uuid PRIMARY KEY, doc_create boolean NOT NULL DEFAULT false);
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT 'documentation.create' = ANY (p_wants) AND coalesce((SELECT p.doc_create FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;

  -- The Data center's letter types as production holds them (20261011070000).
  CREATE TABLE public.hr_letter_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, compulsory boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, deleted_at timestamptz);
`)

// ── What it changes, as the migrations before it made it ────────────────────────
const contractStatus = await read('20261025013000_people_contract_status.sql')
await db.exec(statement(contractStatus, /ALTER TABLE public\.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_months[\s\S]*?STORED;/, 'the contract’s columns are in 20261025013000'))
await db.exec(statement(contractStatus, /ALTER TABLE public\.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_employment_status_check;[\s\S]*?ELSE contract_months IS NULL END\);/, '…and its checks'))
await db.exec(statement(contractStatus, /GRANT SELECT \(contract_months, contract_end\) ON public\.hr_staff_costs TO authenticated;/, '…and its grant'))
const reminders = await read('20261025046500_people_term_end_reminders.sql')
await db.exec(statement(reminders, /ALTER TABLE public\.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_ack_end[\s\S]*?EXECUTE FUNCTION public\.hr_staff_costs_contract_ack\(\);/, 'the contract’s acknowledgement is in 20261025046500'))
await db.exec(statement(await read('20261025012000_probation_notice_15_days.sql'), /CREATE OR REPLACE FUNCTION public\.notify_probation_due\([\s\S]*?\n\$fn\$;/, 'the old sweep is in 20261025012000'))
check(await md5('public.hr_staff_costs_contract_ack()'), 'be1aa384fc20dd7a8329410814254624', 'the acknowledgement’s trigger as production runs it')
check(await md5('public.notify_probation_due(timestamptz)'), 'f17f28df7e64b27d8da1d6108bb4cb18', 'the old sweep as production runs it')

const STAFF = {
  ana: id(10), // hired 1 Oct 2026 on a 12-month contract, renewed
  bob: id(11), // hired 31 Dec 2026: a renewal from 31 Jan counts months the database's way
  cai: id(12), // on a contract, then made permanent, then on a contract again
}
await db.exec(`
  INSERT INTO public.users (id, name, email) VALUES ('${DOC}', 'HR', 'hr@x.my'), ('${FIN}', 'Finance', 'fin@x.my');
  INSERT INTO public.test_perm (user_id, doc_create) VALUES ('${DOC}', true), ('${FIN}', false);
  INSERT INTO public.hr_staff_costs (id, employee_name, hire_date, employment_status, contract_months) VALUES
    ('${STAFF.ana}', 'ANA', '2026-10-01', 'contract', 12),
    ('${STAFF.bob}', 'BOB', '2026-12-31', 'contract', 1),
    ('${STAFF.cai}', 'CAI', '2026-03-01', 'contract', 6);
  INSERT INTO public.hr_letter_types (name, compulsory, sort_order, deleted_at) VALUES
    ('Offer letter', true, 1, NULL), ('Contract for Service', false, 3, NULL), ('Warning letter', false, 2, NULL),
    ('Old form', false, 4, now());
`)
check((await q(`SELECT contract_months AS months, contract_end::text AS ends FROM public.hr_staff_costs WHERE id = $1`, [STAFF.ana]))[0],
  { months: 12, ends: '2027-09-30' }, 'before: a contract counts from the hire date')
// Acknowledged for its end, as contract_acknowledge writes it.
await db.exec(`SELECT set_config('app.contract_ack', '${STAFF.ana}', false);
  UPDATE public.hr_staff_costs SET contract_ack_end = contract_end, contract_ack_name = 'HR', contract_ack_at = now() WHERE id = '${STAFF.ana}';
  SELECT set_config('app.contract_ack', '', false);`)

// ── The migration, verbatim — twice: the second run changes nothing ─────────────
const file = await read('20261025052000_people_contract_renew.sql')
await db.exec(file)
const MADE = ['public.hr_staff_costs_contract_start()', 'public.hr_letter_type_choices()']
const first = await Promise.all(MADE.map(md5))
await db.exec(file)
check(await Promise.all(MADE.map(md5)), first, 'a second run leaves the same bodies')
check(await one(`SELECT count(*)::int FROM pg_trigger WHERE tgname = 'hr_staff_costs_contract_start'`), 1, 'one trigger after two runs')

// ── The end of every contract is where it was ───────────────────────────────────
check(await contract(STAFF.ana), { status: 'contract', start: null, months: 12, ends: '2027-09-30', ack: '2027-09-30' }, 'with no start: from the hire date, as before')
check(await contract(STAFF.bob), { status: 'contract', start: null, months: 1, ends: '2027-01-30', ack: null }, '31 Dec + 1 month − 1 day')

// ── Renew: the day after the end, the months chosen again ───────────────────────
await db.exec(`UPDATE public.hr_staff_costs SET contract_start = '2027-10-01', contract_months = 12 WHERE id = '${STAFF.ana}'`)
check(await contract(STAFF.ana), { status: 'contract', start: '2027-10-01', months: 12, ends: '2028-09-30', ack: '2027-09-30' },
  'renewed: 1 Oct 2027 + 12 months − 1 day; the acknowledgement stays the old end’s, so the new end is reminded again')
await db.exec(`UPDATE public.hr_staff_costs SET contract_months = 18 WHERE id = '${STAFF.ana}'`)
check((await contract(STAFF.ana)).ends, '2029-03-31', 'the card’s period changed after a renewal counts from the renewal')
await db.exec(`UPDATE public.hr_staff_costs SET contract_start = '2027-01-31', contract_months = 1 WHERE id = '${STAFF.bob}'`)
check((await contract(STAFF.bob)).ends, '2027-02-27', '31 Jan + 1 month is 28 Feb in Postgres, so the last day is 27 Feb (contractEnd’s twin)')
await db.exec(`UPDATE public.hr_staff_costs SET contract_start = '2028-02-29', contract_months = 12 WHERE id = '${STAFF.bob}'`)
check((await contract(STAFF.bob)).ends, '2029-02-27', 'a leap day + 12 months is 28 Feb, so the last day is 27 Feb')
// A renewal written over what the page read: the same statement a second time matches nothing.
const stale = await q(`UPDATE public.hr_staff_costs SET contract_start = '2028-10-01', contract_months = 6
  WHERE id = $1 AND employment_status = 'contract' AND contract_months = 12 AND contract_end = '2028-09-30' RETURNING id`, [STAFF.ana])
check(stale.length, 0, 'a renewal over an end that moved since writes nothing')

// ── Off a contract there is no start; a contract filed again counts from the hire date ──
await db.exec(`UPDATE public.hr_staff_costs SET contract_start = '2026-09-01', contract_months = 6 WHERE id = '${STAFF.cai}'`)
check((await contract(STAFF.cai)).ends, '2027-02-28', 'CAI renewed from 1 Sep')
await db.exec(`UPDATE public.hr_staff_costs SET employment_status = 'permanent', contract_months = NULL WHERE id = '${STAFF.cai}'`)
check(await contract(STAFF.cai), { status: 'permanent', start: null, months: null, ends: null, ack: null }, 'made permanent: the start goes with the contract')
await db.exec(`UPDATE public.hr_staff_costs SET employment_status = 'contract', contract_months = 6 WHERE id = '${STAFF.cai}'`)
check(await contract(STAFF.cai), { status: 'contract', start: null, months: 6, ends: '2026-08-31', ack: null }, 'on a contract again: from the hire date')
await db.exec(`UPDATE public.hr_staff_costs SET employment_status = 'permanent', contract_months = NULL, contract_start = '2027-01-01' WHERE id = '${STAFF.cai}'`)
check((await contract(STAFF.cai)).start, null, 'a start sent with another status is dropped')
const filed = await one(`INSERT INTO public.hr_staff_costs (employee_name, hire_date, employment_status, contract_start) VALUES ('DEE', '2026-01-01', 'part_time', '2026-06-01') RETURNING contract_start`)
check(filed, null, 'a row filed on another status carries no start')
await db.exec(`ALTER TABLE public.hr_staff_costs DISABLE TRIGGER hr_staff_costs_contract_start`)
await refuses(`UPDATE public.hr_staff_costs SET contract_start = '2027-01-01' WHERE id = $1`, [STAFF.cai], /hr_staff_costs_contract_start_check/,
  'and the check stands behind the trigger: a start only on a contract')
await db.exec(`ALTER TABLE public.hr_staff_costs ENABLE TRIGGER hr_staff_costs_contract_start`)

// ── A session reads the start ───────────────────────────────────────────────────
check(await one(`SELECT has_column_privilege('authenticated', 'public.hr_staff_costs', 'contract_start', 'SELECT')`), true, 'authenticated reads contract_start')
await db.exec(`SET ROLE authenticated`)
check(await one(`SELECT contract_start::text FROM public.hr_staff_costs WHERE id = $1`, [STAFF.ana]), '2027-10-01', '…as a session')
await db.exec(`RESET ROLE`)

// ── The letter types People's forms offer ───────────────────────────────────────
await as(DOC)
check(await one(`SELECT public.hr_letter_type_choices()`), [
  { id: await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Offer letter'`), name: 'Offer letter', compulsory: true },
  { id: await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Warning letter'`), name: 'Warning letter', compulsory: false },
  { id: await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Contract for Service'`), name: 'Contract for Service', compulsory: false },
], 'Documentation · Create: the live types, in the Data center’s order, a deleted one left out')
await as(FIN)
await refuses(`SELECT public.hr_letter_type_choices()`, [], /Filing a letter needs Documentation · Create/, 'anybody else is refused')
await as(null)
await refuses(`SELECT public.hr_letter_type_choices()`, [], /Filing a letter needs Documentation · Create/, 'and so is nobody')
check(await one(`SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = 'public.hr_letter_type_choices()'::regprocedure`), true, 'STABLE, as its owner')
check(await one(`SELECT has_function_privilege('anon', 'public.hr_letter_type_choices()', 'EXECUTE')`), false, 'anon may not call it')
check(await one(`SELECT has_function_privilege('authenticated', 'public.hr_letter_type_choices()', 'EXECUTE')`), true, 'a session may')

// ── The sweep nothing calls any more is gone ────────────────────────────────────
check(await one(`SELECT to_regprocedure('public.notify_probation_due(timestamptz)') IS NULL`), true, 'notify_probation_due is dropped')

console.log(`validate-contract-renew: ${checks} checks passed`)
