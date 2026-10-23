// Local PostgreSQL regression for 20261024223000 (2026-10-23 — the user: "HR 手机 app 里的提醒和推送"; and, of the topic
// list every permission change empties: "想办法让名单不要这么容易被清空"). The migration runs VERBATIM, twice, over
// stand-ins for the sign-in (production's auth.uid()), the permission checks — answered per account from a table, so
// "asked as them" is really switched account by account and put back — the people and the notices; production's
// notification_topics_sync and notification_topics_forget come from the migration that made them, md5-checked against
// production's. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1) // LI SEAN — the HR scope, People · Edit and the person page's box: told
const HR_SHUT = id(2) // the HR scope and People · Edit, the person page's box unticked: never told
const FIN = id(3) // People · Edit, no HR scope: never told
const BOSS = id(4) // may acknowledge — never opened the HR app, so holds no topic: not told
const GONE = id(5) // switched off
const HR_ON_PROB = id(6) // HR, may acknowledge — and on probation themselves
const BOOM = id(7) // the permission check fails for them
const DEPT_HR = id(50)
const DEPT_SALES = id(51)

/** Signed in as this account (production's auth.uid() reads request.jwt.claim.sub first), or as the system ('' / null). */
const as = user => q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
const asSystem = () => as(null)
const sweep = at => one(`SELECT public.notify_probation_due($1::timestamptz)`, [at])
const notices = async user =>
  (await q(`SELECT title, body, kind, ref_kind, ref_id, data ->> 'due' AS due FROM public.app_notifications WHERE user_id = $1 ORDER BY title`, [user]))
const topics = async () => (await q(`SELECT user_id, topic FROM public.notification_topics ORDER BY user_id, topic`)).map(r => `${r.user_id.slice(-2)}:${r.topic}`)

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

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL);
  -- probation_end is GENERATED in production (mig 20261024214500); the sweep only reads it, so the checks set it.
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, user_id uuid,
    department_id uuid, status text NOT NULL DEFAULT 'active', employment_status text, probation_months smallint,
    probation_end date, probation_ack_end date, created_at timestamptz NOT NULL DEFAULT now());

  -- Each account's answers: the HR scope, People · Edit, the person page's box (and the HR app's other topics).
  CREATE TABLE public.test_perm(user_id uuid PRIMARY KEY, hr boolean NOT NULL DEFAULT false, edit boolean NOT NULL DEFAULT false,
    box boolean NOT NULL DEFAULT false, hiring boolean NOT NULL DEFAULT false, rooms boolean NOT NULL DEFAULT false,
    manager boolean NOT NULL DEFAULT false, boom boolean NOT NULL DEFAULT false);
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
  BEGIN
    IF coalesce((SELECT p.boom FROM public.test_perm p WHERE p.user_id = auth.uid()), false) THEN
      RAISE EXCEPTION 'Sign in with an active portal account.' USING ERRCODE = '42501';
    END IF;
    RETURN 'hr' = ANY (p_scopes) AND coalesce((SELECT p.hr FROM public.test_perm p WHERE p.user_id = auth.uid()), false);
  END $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT ('team.edit' = ANY (p_wants) AND p.edit) OR ('hiring.approve' = ANY (p_wants) AND p.hiring)
                         OR ('rooms.edit' = ANY (p_wants) AND p.rooms)
                       FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_pages = ARRAY['/team/people/[id]'] AND p_wants = ARRAY['team.edit']
       AND coalesce((SELECT p.box FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;
  CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT p.manager FROM public.test_perm p WHERE p.user_id = auth.uid()), false)
  $$;

  -- The notices and the topics as production holds them on 2026-10-23, checks included.
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
  -- A permission table's change, as the forget triggers see one.
  CREATE TABLE public.test_permission_change(x int);
`)

// Production's two bodies, from the migration that made them (unchanged since: md5 as production's on 2026-10-23).
const made = (await readFile(new URL('20261011180000_notifications.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
const fn = name => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$fn\\$;`).exec(made)
  assert.ok(m, `${name} is in 20261011180000`)
  return m[0]
}
await db.exec(fn('notification_topics_sync'))
await db.exec(fn('notification_topics_forget'))
const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
check(await md5('public.notification_topics_sync(text[])'), '75c9bba67453cbe1fdd1adfc5506607f', 'the sync is production’s body')
check(await md5('public.notification_topics_forget()'), '3c93a19ebce2e742ea05b9fc33ae55b4', 'the forget is production’s body')
await db.exec(`CREATE TRIGGER notification_topics_forget AFTER INSERT ON public.test_permission_change
  FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();`)

await db.exec(`
  INSERT INTO public.users (id, name, email, is_active) VALUES
    ('${HR}', 'LI SEAN', 'li@x.my', true), ('${HR_SHUT}', 'Shut', 'shut@x.my', true), ('${FIN}', 'Finance', 'fin@x.my', true),
    ('${BOSS}', 'Boss', 'boss@x.my', true), ('${GONE}', 'Gone', 'gone@x.my', false), ('${HR_ON_PROB}', 'IVY', 'ivy@x.my', true),
    ('${BOOM}', 'Boom', 'boom@x.my', true);
  INSERT INTO public.test_perm (user_id, hr, edit, box, boom) VALUES
    ('${HR}', true, true, true, false), ('${HR_SHUT}', true, true, false, false), ('${FIN}', false, true, true, false),
    ('${BOSS}', true, true, true, false), ('${GONE}', true, true, true, false), ('${HR_ON_PROB}', true, true, true, false),
    ('${BOOM}', true, true, true, true);
  INSERT INTO public.departments (id, name) VALUES ('${DEPT_HR}', 'HR'), ('${DEPT_SALES}', 'Sales');
`)

const file = (await readFile(new URL('20261024223000_probation_push.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(file)
await db.exec(file) // twice: nothing changes, nothing breaks

// ── The kind, the reference and the topic: widened, nothing dropped ─────────────
const def = name => one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = $1`, [name])
const vals = async name => [...(await def(name)).matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
check(await vals('app_notifications_kind_check'), ['attendance', 'crm', 'hiring', 'it', 'marketing', 'memo', 'people', 'review', 'rooms', 'share'], 'kinds: nine kept, people added')
check(await vals('app_notifications_ref_kind_check'), ['att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite', 'hiring_request', 'hr_staff',
  'it_request', 'member_request', 'memo', 'mkt_project', 'share_request'], 'references: eleven kept, hr_staff added')
check(await vals('notification_topics_topic_check'), ['hiring.guest', 'it.requests', 'member.requests', 'people.probation', 'rooms.guest'], 'topics: four kept, people.probation added')

// ── Who may call what ───────────────────────────────────────────────────────────
for (const sig of ['notify_probation_due(timestamptz)', 'probation_notice_may(uuid)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${sig}', 'EXECUTE')`), false, `the publishable key cannot call ${sig}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE')`), false, `nobody signed in calls ${sig}`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${sig}', 'EXECUTE')`), true, `the sweep's service role calls ${sig}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.notification_topics_sync(text[])', 'EXECUTE')`), true, 'the HR app still keeps its topics')
check(await one(`SELECT has_function_privilege('anon', 'public.notification_topics_sync(text[])', 'EXECUTE')`), false, '…never the publishable key')

// ── Asked as them, and put back ─────────────────────────────────────────────────
await db.exec(`CREATE FUNCTION public.test_may_then_me(p uuid) RETURNS text LANGUAGE plpgsql AS $$
  DECLARE m boolean; BEGIN m := public.probation_notice_may(p); RETURN m::text || '/' || coalesce(auth.uid()::text, 'nobody'); END $$;`)
await asSystem()
check(await one(`SELECT public.test_may_then_me($1)`, [HR]), 'true/nobody', 'HR may — and the sweep is nobody again after')
check(await one(`SELECT public.test_may_then_me($1)`, [HR_SHUT]), 'false/nobody', 'the person page’s box unticked: may not')
check(await one(`SELECT public.test_may_then_me($1)`, [FIN]), 'false/nobody', 'People · Edit without the HR scope: may not')
check(await one(`SELECT public.test_may_then_me($1)`, [GONE]), 'false/nobody', 'a switched-off account: may not')
check(await one(`SELECT public.test_may_then_me($1)`, [BOOM]), 'false/nobody', 'a check that fails says no, and puts the sweep back')
check(await one(`SELECT public.test_may_then_me(NULL)`), 'false/nobody', 'nobody: may not')
await as(FIN)
check(await one(`SELECT public.test_may_then_me($1)`, [HR]), `true/${FIN}`, 'asked inside somebody’s session: theirs again after')
check(await one(`SELECT public.test_may_then_me($1)`, [BOOM]), `false/${FIN}`, '…after a failure too')

// ── The HR app keeps people.probation for whoever may — and only the topics it manages ─
await asSystem()
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES ('${FIN}', 'it.requests'), ('${FIN}', 'rooms.guest')`)
await as(HR)
check(await one(`SELECT public.notification_topics_sync(ARRAY['people.probation', 'hiring.guest'])`), ['people.probation'], 'HR keeps people.probation (hiring.guest is not theirs)')
await as(HR_SHUT)
check(await one(`SELECT public.notification_topics_sync(ARRAY['people.probation'])`), [], 'the box unticked: not kept')
await as(FIN)
check(await one(`SELECT public.notification_topics_sync(ARRAY['people.probation'])`), [], 'no HR scope: not kept')
check(await topics(), ['01:people.probation', '03:it.requests'], 'the sync took FIN’s rooms.guest (its own topic, no longer theirs) — never it.requests, it_desk_listen’s')
await as(HR)
check(await one(`SELECT public.notification_topics_sync(ARRAY[]::text[])`), [], 'HR’s app asks nothing')
check(await topics(), ['03:it.requests'], '…and people.probation goes with it')
await asSystem()
await refuses(`SELECT public.notification_topics_sync(ARRAY['people.probation'])`, [], /active account/, 'nobody signed in keeps no topic')

// ── A permission change forgets every topic but people.probation ────────────────
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES
  ('${HR}', 'people.probation'), ('${HR}', 'rooms.guest'), ('${HR_ON_PROB}', 'people.probation'), ('${HR_ON_PROB}', 'member.requests')`)
await db.exec(`INSERT INTO public.test_permission_change VALUES (1)`)
check(await topics(), ['01:people.probation', '06:people.probation'], 'rooms.guest, member.requests and it.requests forgotten; people.probation stays')

// ── The sweep ───────────────────────────────────────────────────────────────────
// Holders: HR and HR_ON_PROB may; HR_SHUT, FIN and GONE hold the topic (left from before) but may not; BOSS may, holds none.
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES ('${HR_SHUT}', 'people.probation'), ('${FIN}', 'people.probation'),
  ('${GONE}', 'people.probation'), ('${BOOM}', 'people.probation')`)
const staff = async (n, name, end, more = {}) => {
  const row = { status: 'active', employment_status: 'probation', dept: DEPT_HR, ack: null, user: null, ...more }
  await q(`INSERT INTO public.hr_staff_costs (id, employee_name, user_id, department_id, status, employment_status, probation_months, probation_end, probation_ack_end)
           VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'probation' THEN 3 END, $7, $8)`,
  [id(100 + n), name, row.user, row.dept, row.status, row.employment_status, end, row.ack])
  return id(100 + n)
}
const ALI = await staff(1, 'ALI', '2026-11-06') // today + 14: due
const BEN = await staff(2, 'BEN', '2026-11-07') // today + 15: not yet
await staff(3, 'CHI', '2026-10-26', { ack: '2026-10-26' }) // acknowledged for this end
const DEV = await staff(4, 'DEV', '2026-10-30', { ack: '2026-10-20' }) // acknowledged for an earlier end: due again
await staff(5, 'EVE', '2026-10-22') // ended yesterday: past
await staff(6, 'FAY', '2026-10-25', { status: 'inactive' })
await staff(7, 'GUY', null) // no hire date yet: no end
await staff(8, 'HAN', '2026-10-25', { employment_status: 'permanent' })
const IVY = await staff(9, 'IVY', '2026-10-23', { user: HR_ON_PROB, dept: DEPT_SALES }) // ends today — her own
const JAY = await staff(10, 'JAY', '2026-10-24', { dept: null }) // tomorrow, no department

// 08:30 the office's time (00:30 UTC): never a phone before 9.
await asSystem()
check(await sweep('2026-10-23T00:30:00Z'), 0, 'before 9:00: nothing written')
check(await one(`SELECT count(*)::int FROM public.app_notifications`), 0, '…not a row')

// 10:00 the office's time.
check(await sweep('2026-10-23T02:00:00Z'), 7, 'four for HR, three for IVY (never her own)')
check(await one(`SELECT coalesce(auth.uid()::text, 'nobody')`), 'nobody', 'the sweep is nobody again after asking as each holder')
check(await notices(HR), [
  { title: 'Probation ending · ALI', body: 'Ends 6 Nov 2026 · in 14 days · HR', kind: 'people', ref_kind: 'hr_staff', ref_id: ALI, due: `probation:${ALI}:2026-11-06` },
  { title: 'Probation ending · DEV', body: 'Ends 30 Oct 2026 · in 7 days · HR', kind: 'people', ref_kind: 'hr_staff', ref_id: DEV, due: `probation:${DEV}:2026-10-30` },
  { title: 'Probation ending · IVY', body: 'Ends 23 Oct 2026 · today · Sales', kind: 'people', ref_kind: 'hr_staff', ref_id: IVY, due: `probation:${IVY}:2026-10-23` },
  { title: 'Probation ending · JAY', body: 'Ends 24 Oct 2026 · tomorrow', kind: 'people', ref_kind: 'hr_staff', ref_id: JAY, due: `probation:${JAY}:2026-10-24` },
], 'HR: the due ones, in the bell’s own words — not BEN (15 days), CHI (acknowledged), EVE (past), FAY, GUY, HAN')
check((await notices(HR_ON_PROB)).map(n => n.title), ['Probation ending · ALI', 'Probation ending · DEV', 'Probation ending · JAY'], 'IVY is never told of her own')
for (const [who, what] of [[HR_SHUT, 'the box unticked'], [FIN, 'no HR scope'], [GONE, 'switched off'], [BOSS, 'no topic'], [BOOM, 'a failing check']])
  check(await notices(who), [], `${what}: told nothing`)
check(await one(`SELECT count(*)::int FROM public.app_notifications WHERE read_at IS NULL AND pushed_at IS NULL`), 7, 'unread and unsent: the flush sends them')

check(await sweep('2026-10-23T09:00:00Z'), 0, 'the same day again: nobody told twice')
check(await sweep('2026-10-24T02:00:00Z'), 2, 'the next day: BEN’s window opens — for HR and IVY; JAY (today now) was told already')
check((await notices(HR)).map(n => n.title).includes('Probation ending · BEN'), true, 'HR hears of BEN')

// Extended: the end moves past the window — then its new window opens, and HR is told again for the new end.
await q(`UPDATE public.hr_staff_costs SET probation_months = 4, probation_end = '2026-12-06' WHERE id = $1`, [ALI])
check(await sweep('2026-11-21T02:00:00Z'), 0, 'extended to 6 Dec: nothing until its window')
check(await sweep('2026-11-22T02:00:00Z'), 2, '22 Nov: told again, for the new end')
check((await q(`SELECT data ->> 'due' AS due FROM public.app_notifications WHERE user_id = $1 AND ref_id = $2 ORDER BY due`, [HR, ALI])).map(r => r.due),
  [`probation:${ALI}:2026-11-06`, `probation:${ALI}:2026-12-06`], 'one notice per end')

// Acknowledged before its window opens: never told.
const KIM = await staff(11, 'KIM', '2026-12-01', { ack: '2026-12-01' })
check(await sweep('2026-11-22T03:00:00Z'), 0, 'acknowledged ahead of its window: nobody told')
check(await one(`SELECT count(*)::int FROM public.app_notifications WHERE ref_id = $1`, [KIM]), 0, '…not a row for KIM')

// Lost the right since: passed over at once, though the topic is still kept.
await q(`UPDATE public.test_perm SET box = false WHERE user_id = $1`, [HR_ON_PROB])
const LEO = await staff(12, 'LEO', '2026-12-01')
check(await sweep('2026-11-22T04:00:00Z'), 1, 'LEO: HR alone now — IVY’s box was unticked')
check(await one(`SELECT count(*)::int FROM public.app_notifications WHERE ref_id = $1 AND user_id = $2`, [LEO, HR_ON_PROB]), 0, 'IVY is not told of LEO')

// Nobody holds the topic: nothing to do.
await db.exec(`DELETE FROM public.notification_topics WHERE topic = 'people.probation'`)
await staff(13, 'MAY', '2026-11-30')
check(await sweep('2026-11-22T05:00:00Z'), 0, 'no holder: nothing written')

// ── The guard: a body production changed since is never overwritten ────────────
await db.exec(`CREATE OR REPLACE FUNCTION public.notification_topics_forget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn$ BEGIN DELETE FROM public.notification_topics WHERE topic <> 'it.requests'; RETURN NULL; END $fn$;`)
await assert.rejects(db.exec(file), err => /notification_topics_forget is not the body this migration replaces/.test(String(err.message)), 'a drifted body stops the migration')
checks++

console.log(`probation push: ${checks} checks passed`)
