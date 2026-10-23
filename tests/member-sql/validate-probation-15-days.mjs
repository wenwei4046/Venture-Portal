// Local PostgreSQL regression for 20261025012000 (2026-10-24 — asked whether the probation reminder should be the 15
// days the user's own reply to LI SEAN promised, the user: "go with 15 days"). notify_probation_due is loaded as
// production runs it (20261024223000 verbatim, over 20261011180000's notification bodies — md5-checked), the migration
// is applied VERBATIM, twice, over the same stand-ins validate-probation-push.mjs uses. No live I/O.
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
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1) // LI SEAN — the HR scope, People · Edit and the person page's box: told
const DEPT_HR = id(50)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, user_id uuid,
    department_id uuid, status text NOT NULL DEFAULT 'active', employment_status text, probation_months smallint,
    probation_end date, probation_ack_end date, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '${HR}'::uuid $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '${HR}'::uuid $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '${HR}'::uuid $$;
  CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '' CHECK (length(body) <= 400),
    ref_kind text NOT NULL, ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
    push_taken_at timestamptz, pushed_at timestamptz, data jsonb,
    CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance', 'crm', 'hiring', 'it', 'marketing', 'memo', 'review', 'rooms', 'share'])),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite',
      'hiring_request', 'it_request', 'member_request', 'memo', 'mkt_project', 'share_request'])));
  CREATE TABLE public.notification_topics (user_id uuid NOT NULL REFERENCES public.users(id), topic text NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, topic),
    CONSTRAINT notification_topics_topic_check CHECK (topic = ANY (ARRAY['hiring.guest', 'it.requests', 'member.requests', 'rooms.guest'])));
`)

// Production's bodies, as the migrations that made them leave them.
const made = await read('20261011180000_notifications.sql')
for (const name of ['notification_topics_sync', 'notification_topics_forget']) {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$fn\\$;`).exec(made)
  assert.ok(m, `${name} is in 20261011180000`)
  await db.exec(m[0])
}
await db.exec(await read('20261024223000_probation_push.sql'))
const md5 = () => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.notify_probation_due(timestamptz)'::regprocedure`)
check(await md5(), '582befa4a2f7e0296f1a9bdd2a244113', 'the sweep is production’s body')

const file = await read('20261025012000_probation_notice_15_days.sql')
await db.exec(file)
await db.exec(file) // twice: nothing changes, nothing breaks
check(await md5(), 'f17f28df7e64b27d8da1d6108bb4cb18', 'the sweep as production runs it now — 20261024223000’s, the 14 a 15')
check(await one(`SELECT has_function_privilege('authenticated', 'public.notify_probation_due(timestamptz)', 'EXECUTE')`), false, 'nobody signed in calls it')
check(await one(`SELECT has_function_privilege('anon', 'public.notify_probation_due(timestamptz)', 'EXECUTE')`), false, '…nor the publishable key')
check(await one(`SELECT has_function_privilege('service_role', 'public.notify_probation_due(timestamptz)', 'EXECUTE')`), true, 'the sweep’s service role calls it')

await db.exec(`
  INSERT INTO public.users (id, name, email) VALUES ('${HR}', 'LI SEAN', 'li@x.my');
  INSERT INTO public.departments (id, name) VALUES ('${DEPT_HR}', 'HR');
  INSERT INTO public.notification_topics (user_id, topic) VALUES ('${HR}', 'people.probation');
`)
const staff = (n, name, end, ack = null) => q(`INSERT INTO public.hr_staff_costs (id, employee_name, department_id, employment_status, probation_months, probation_end, probation_ack_end)
  VALUES ($1, $2, $3, 'probation', 3, $4, $5)`, [id(100 + n), name, DEPT_HR, end, ack])
await staff(1, 'FIFTEEN', '2026-11-08') // 24 Oct + 15: due now
await staff(2, 'SIXTEEN', '2026-11-09') // 24 Oct + 16: not yet
await staff(3, 'FOURTEEN', '2026-11-07') // 24 Oct + 14: due, as before
await staff(4, 'ACKED', '2026-11-08', '2026-11-08') // acknowledged for this end

const told = async () => (await q(`SELECT title, body FROM public.app_notifications ORDER BY title`)).map(r => `${r.title} | ${r.body}`)
check(await one(`SELECT public.notify_probation_due('2026-10-24T00:30:00Z'::timestamptz)`), 0, 'before 9:00 the office’s time: nothing, as before')
check(await one(`SELECT public.notify_probation_due('2026-10-24T02:00:00Z'::timestamptz)`), 2, '10:00, 24 Oct: the probations 14 and 15 days away')
check(await told(), [
  'Probation ending · FIFTEEN | Ends 8 Nov 2026 · in 15 days · HR',
  'Probation ending · FOURTEEN | Ends 7 Nov 2026 · in 14 days · HR',
], 'FIFTEEN is told now (14 days would have waited a day); SIXTEEN not yet; ACKED never')
check(await one(`SELECT public.notify_probation_due('2026-10-25T02:00:00Z'::timestamptz)`), 1, 'the next day SIXTEEN’s 15 days open')
check(await one(`SELECT public.notify_probation_due('2026-10-25T03:00:00Z'::timestamptz)`), 0, 'and nobody is told twice')

// ── The guard: a body production changed since is never overwritten ────────────
await db.exec(`CREATE OR REPLACE FUNCTION public.notify_probation_due(p_now timestamptz DEFAULT NULL) RETURNS integer LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public AS $fn$ BEGIN RETURN 0; END $fn$;`)
await assert.rejects(db.exec(file), err => /notify_probation_due is not the body this migration replaces/.test(String(err.message)), 'a drifted body stops the migration')
checks++

console.log(`probation 15 days: ${checks} checks passed`)
