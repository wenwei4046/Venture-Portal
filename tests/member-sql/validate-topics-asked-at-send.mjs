// Local PostgreSQL regression for 20261025003000 (2026-10-24 — the user, of the topic list every permission change
// empties: "想办法让名单不要这么容易被清空"; 20261024223000 had spared people.probation alone). The migration runs
// VERBATIM, twice, over stand-ins for the sign-in (production's auth.uid()) and the permission checks — answered per
// account from a table, so "asked as them" is really switched account by account and put back. Production's
// notify_people / notify_topic come from the migration that made them and notification_topics_sync / _forget /
// probation_notice_may from 20261024223000, run verbatim too — each md5-checked against production's. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const read = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1) // LI SEAN — every right and every box
const HIRE_SHUT = id(2) // Hiring · Approve, the Hiring requests page's Approve box unticked
const NO_ROOMS = id(3) // Meeting rooms · View only, no Edit
const MEMBER_SHUT = id(4) // Member services' key, its page's Manage box unticked
const IT_DESK = id(5) // IT requests · View, nothing else
const GONE = id(6) // every right — switched off
const BOOM = id(7) // the permission check fails for them
const ACTOR = id(8) // every right — and the one doing the write that tells

/** Signed in as this account (production's auth.uid() reads request.jwt.claim.sub first), or as the system ('' / null). */
const as = user => q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
const asSystem = () => as(null)
const me = () => one(`SELECT coalesce(auth.uid()::text, 'nobody')`)
const topics = async () => (await q(`SELECT user_id, topic FROM public.notification_topics ORDER BY user_id, topic`)).map(r => `${r.user_id.slice(-2)}:${r.topic}`)
const told = async ref => (await q(`SELECT user_id FROM public.app_notifications WHERE ref_id = $1 ORDER BY user_id`, [ref])).map(r => r.user_id.slice(-2))
const tell = (topic, ref) => q(`SELECT public.notify_topic($1, 'rooms', 'A guest booking', 'Room A · 10:00', 'booking', $2)`, [topic, ref])

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
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, user_id uuid,
    department_id uuid, status text NOT NULL DEFAULT 'active', employment_status text, probation_months smallint,
    probation_end date, probation_ack_end date, created_at timestamptz NOT NULL DEFAULT now());

  -- Each account's answers: an action, and the box on the page that action is used on.
  CREATE TABLE public.test_perm(user_id uuid PRIMARY KEY,
    hr boolean NOT NULL DEFAULT false, edit boolean NOT NULL DEFAULT false, box boolean NOT NULL DEFAULT false,
    hiring boolean NOT NULL DEFAULT false, hiring_box boolean NOT NULL DEFAULT false,
    rooms boolean NOT NULL DEFAULT false, rooms_box boolean NOT NULL DEFAULT false,
    manager boolean NOT NULL DEFAULT false, member_box boolean NOT NULL DEFAULT false,
    it boolean NOT NULL DEFAULT false, boom boolean NOT NULL DEFAULT false);
  CREATE FUNCTION public.test_answer(p_col text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
  DECLARE v boolean;
  BEGIN
    IF coalesce((SELECT p.boom FROM public.test_perm p WHERE p.user_id = auth.uid()), false) THEN
      RAISE EXCEPTION 'Sign in with an active portal account.' USING ERRCODE = '42501';
    END IF;
    EXECUTE format('SELECT %I FROM public.test_perm WHERE user_id = $1', p_col) INTO v USING auth.uid();
    RETURN coalesce(v, false);
  END $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT 'hr' = ANY (p_scopes) AND public.test_answer('hr')
  $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT ('team.edit' = ANY (p_wants) AND public.test_answer('edit'))
        OR ('hiring.approve' = ANY (p_wants) AND public.test_answer('hiring'))
        OR ('rooms.edit' = ANY (p_wants) AND public.test_answer('rooms'))
        OR ('it_requests.view' = ANY (p_wants) AND public.test_answer('it'))
  $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT CASE
      WHEN p_pages = ARRAY['/team/people/[id]'] AND p_wants = ARRAY['team.edit'] THEN public.test_answer('box')
      WHEN p_pages = ARRAY['/hiring/requests'] AND p_wants = ARRAY['hiring.approve'] THEN public.test_answer('hiring_box')
      WHEN p_pages = ARRAY['/admin/rooms'] AND p_wants = ARRAY['rooms.edit'] THEN public.test_answer('rooms_box')
      WHEN p_pages = ARRAY['/member-admin'] AND p_wants = ARRAY['member.manage'] THEN public.test_answer('member_box')
      ELSE false END
  $$;
  CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_key = 'member_requests_manage' AND public.test_answer('manager')
  $$;

  -- The notices and the topics as production made them (20261011180000's checks, as widened since).
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
  -- The audit register's line for the topics (20261011180000's words).
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, reason text);
  INSERT INTO public.audit_tables VALUES ('notification_topics',
    'Worked out from each account''s own permissions when it opens the HR app, forgotten on any permission change.');
`)

// Production's bodies, from the migrations that made them (md5 as production's on 2026-10-24).
const made = await read('20261011180000_notifications.sql')
const fn = name => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$fn\\$;`).exec(made)
  assert.ok(m, `${name} is in 20261011180000`)
  return m[0]
}
for (const name of ['notify_people', 'notify_topic', 'notification_topics_sync', 'notification_topics_forget']) await db.exec(fn(name))
await db.exec(await read('20261024223000_probation_push.sql'))
const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
check(await md5('public.notify_people(uuid[],text,text,text,text,text)'), '50259847648f421acbe03abd41dd0d95', 'notify_people is production’s body')
check(await md5('public.notify_topic(text,text,text,text,text,text)'), 'fdb51debc1205ed88a96898f7a8e494f', 'notify_topic is production’s body')
check(await md5('public.notification_topics_sync(text[])'), '29b2feb9e4d2dfdc242de41a3fc15891', 'the sync is production’s body')
check(await md5('public.notification_topics_forget()'), '0d5d4691acc6054822870ec1e140d66f', 'the forget is production’s body')
check(await md5('public.probation_notice_may(uuid)'), '684261a7856b0d223ee60e5ef185b7c7', 'the probation helper is production’s body')
await db.exec(`CREATE TRIGGER notification_topics_forget AFTER INSERT ON public.test_permission_change
  FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();`)

await db.exec(`
  INSERT INTO public.users (id, name, email, is_active) VALUES
    ('${HR}', 'LI SEAN', 'li@x.my', true), ('${HIRE_SHUT}', 'Hire shut', 'h@x.my', true), ('${NO_ROOMS}', 'No rooms', 'r@x.my', true),
    ('${MEMBER_SHUT}', 'Member shut', 'm@x.my', true), ('${IT_DESK}', 'IT desk', 'it@x.my', true), ('${GONE}', 'Gone', 'g@x.my', false),
    ('${BOOM}', 'Boom', 'b@x.my', true), ('${ACTOR}', 'Actor', 'a@x.my', true);
  INSERT INTO public.test_perm (user_id, hr, edit, box, hiring, hiring_box, rooms, rooms_box, manager, member_box, it, boom) VALUES
    ('${HR}',          true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false),
    ('${HIRE_SHUT}',   true,  true,  true,  true,  false, true,  true,  false, false, false, false),
    ('${NO_ROOMS}',    false, false, false, false, false, false, true,  false, false, false, false),
    ('${MEMBER_SHUT}', false, false, false, false, false, false, false, true,  false, false, false),
    ('${IT_DESK}',     false, false, false, false, false, false, false, false, false, true,  false),
    ('${GONE}',        true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false),
    ('${BOOM}',        true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true),
    ('${ACTOR}',       true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false);
`)

const file = await read('20261025003000_topics_asked_at_send.sql')
await db.exec(file)
await db.exec(file) // twice: nothing changes, nothing breaks

// ── The bodies as production runs them after this migration ────────────────────
check(await md5('public.notification_topic_may(uuid,text)'), '5bd3decefb4fb753a3ef464573ff0b66', 'the helper as production runs it')
check(await md5('public.notify_topic(text,text,text,text,text,text)'), '5a9bbaa9340cfad42ed1960a275c3e56', 'notify_topic as production runs it')
check(await md5('public.notification_topics_sync(text[])'), '931c63761257d74fbe3b0162f2d71464', 'the sync as production runs it')
check(await md5('public.notification_topics_forget()'), '36538c930687a9f4d1eabdf37dc2b64a', 'the forget as production runs it')
check(await md5('public.notify_people(uuid[],text,text,text,text,text)'), '50259847648f421acbe03abd41dd0d95', 'notify_people untouched')
check(await one(`SELECT reason FROM public.audit_tables WHERE table_name = 'notification_topics'`),
  "Worked out from each account's own permissions when it opens the HR app (or IT requests), and asked again, as them, whenever a topic tells; only a switched-off account's are forgotten.",
  'the audit register no longer says a permission change forgets them')

// ── Who may call what ───────────────────────────────────────────────────────────
for (const sig of ['notification_topic_may(uuid,text)', 'notify_topic(text,text,text,text,text,text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${sig}', 'EXECUTE')`), false, `the publishable key cannot call ${sig}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE')`), false, `nobody signed in calls ${sig}`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${sig}', 'EXECUTE')`), true, `the service role calls ${sig}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.notification_topics_sync(text[])', 'EXECUTE')`), true, 'the HR app still keeps its topics')
check(await one(`SELECT has_function_privilege('anon', 'public.notification_topics_sync(text[])', 'EXECUTE')`), false, '…never the publishable key')

// ── May they hold it? Asked as them, and put back ───────────────────────────────
const may = async (user, topic) => one(`SELECT public.notification_topic_may($1, $2)`, [user, topic])
await asSystem()
const grid = async user => Object.fromEntries(await Promise.all(
  ['hiring.guest', 'rooms.guest', 'member.requests', 'it.requests', 'people.probation'].map(async t => [t, await may(user, t)])))
const ALL = { 'hiring.guest': true, 'rooms.guest': true, 'member.requests': true, 'it.requests': true, 'people.probation': true }
const NONE = { 'hiring.guest': false, 'rooms.guest': false, 'member.requests': false, 'it.requests': false, 'people.probation': false }
check(await grid(HR), ALL, 'every right and every box: every topic')
check(await grid(HIRE_SHUT), { ...ALL, 'hiring.guest': false, 'member.requests': false, 'it.requests': false },
  'Hiring requests’ Approve box unticked: no hiring.guest (rooms and the probation still)')
check(await grid(NO_ROOMS), NONE, 'Meeting rooms without Edit: no rooms.guest (the box alone opens nothing)')
check(await grid(MEMBER_SHUT), NONE, 'Member services’ key with its Manage box unticked: no member.requests')
check(await grid(IT_DESK), { ...NONE, 'it.requests': true }, 'IT requests · View: it.requests alone')
check(await grid(GONE), NONE, 'switched off: nothing')
check(await grid(BOOM), NONE, 'a check that fails says no')
check(await may(HR, 'crm.leads'), false, 'a topic nobody keeps: no')
check(await may(null, 'rooms.guest'), false, 'nobody: no')
check(await me(), 'nobody', 'the system is nobody again after asking as each of them, a failure too')
await as(ACTOR)
check([await may(NO_ROOMS, 'rooms.guest'), await may(HR, 'rooms.guest'), await may(BOOM, 'rooms.guest')], [false, true, false], 'asked inside somebody’s session…')
check(await me(), ACTOR, '…theirs again after, a failure too')

// ── A topic's notice: only those who may now — never whoever is doing it ────────
await asSystem()
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES
  ('${HR}', 'rooms.guest'), ('${NO_ROOMS}', 'rooms.guest'), ('${GONE}', 'rooms.guest'), ('${BOOM}', 'rooms.guest'), ('${ACTOR}', 'rooms.guest'),
  ('${HR}', 'hiring.guest'), ('${HIRE_SHUT}', 'hiring.guest'),
  ('${MEMBER_SHUT}', 'member.requests'), ('${HR}', 'member.requests'),
  ('${IT_DESK}', 'it.requests'), ('${HR}', 'it.requests'), ('${NO_ROOMS}', 'it.requests')`)
await tell('rooms.guest', 'b-guest')
check(await told('b-guest'), ['01', '08'], 'a guest’s booking (nobody signed in): HR and ACTOR — not the holder who lost Edit, the switched off or the failing')
await as(ACTOR)
await tell('rooms.guest', 'b-actor')
check(await told('b-actor'), ['01'], 'ACTOR’s own write: never told of it — notify_people still reads them as the one doing it')
check(await me(), ACTOR, 'and ACTOR is ACTOR again after')
await asSystem()
await tell('hiring.guest', 'h-1')
check(await told('h-1'), ['01'], 'a guest’s manpower request: HR, not the holder whose Approve box is unticked')
await tell('member.requests', 'm-1')
check(await told('m-1'), ['01'], 'a member’s request: HR, not the manager whose Manage box is unticked')
await tell('it.requests', 'i-1')
check(await told('i-1'), ['01', '05'], 'an IT request: the desk and HR, not a holder without View')
await tell('people.probation', 'p-none')
check(await told('p-none'), [], 'a topic nobody holds: nobody')

// ── A permission change forgets only the switched off ───────────────────────────
const before = await topics()
await db.exec(`INSERT INTO public.test_permission_change VALUES (1)`)
check(await topics(), before.filter(t => !t.startsWith('06:')), 'every topic stays but the switched-off account’s')
// Lost a right since: still kept, passed over at once.
await q(`UPDATE public.test_perm SET rooms = false WHERE user_id = $1`, [HR])
await db.exec(`INSERT INTO public.test_permission_change VALUES (2)`)
check((await topics()).includes('01:rooms.guest'), true, 'HR’s rooms.guest survives the change…')
await tell('rooms.guest', 'b-after')
check(await told('b-after'), ['08'], '…but HR is passed over now Edit is gone')
await q(`UPDATE public.test_perm SET rooms = true WHERE user_id = $1`, [HR])

// ── The HR app keeps its viewer's topics by the same question ───────────────────
await as(HIRE_SHUT)
check(await one(`SELECT public.notification_topics_sync(ARRAY['hiring.guest', 'rooms.guest', 'people.probation'])`), ['people.probation', 'rooms.guest'],
  'the Approve box unticked: hiring.guest not kept, rooms.guest and people.probation kept')
check((await topics()).filter(t => t.startsWith('02:')), ['02:people.probation', '02:rooms.guest'], '…and the stale hiring.guest is gone')
await as(NO_ROOMS)
check(await one(`SELECT public.notification_topics_sync(ARRAY['rooms.guest'])`), [], 'no Edit: rooms.guest not kept')
check((await topics()).filter(t => t.startsWith('03:')), ['03:it.requests'], 'the sync took NO_ROOMS’s rooms.guest — never it.requests, it_desk_listen’s')
await asSystem()
await assert.rejects(q(`SELECT public.notification_topics_sync(ARRAY['rooms.guest'])`), /active account/, 'nobody signed in keeps no topic')
checks++

// ── The probation's own sweep is unchanged ──────────────────────────────────────
await db.exec(`INSERT INTO public.notification_topics (user_id, topic) VALUES ('${HR}', 'people.probation') ON CONFLICT DO NOTHING`)
await q(`INSERT INTO public.hr_staff_costs (id, employee_name, status, employment_status, probation_months, probation_end) VALUES ($1, 'ALI', 'active', 'probation', 3, '2026-10-31')`, [id(100)])
check(await one(`SELECT public.notify_probation_due('2026-10-24T02:00:00Z'::timestamptz)`), 2, 'the probation sweep tells HR and HIRE_SHUT (both may acknowledge)')

// ── The guard: a body production changed since is never overwritten ────────────
await db.exec(`CREATE OR REPLACE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN RETURN; END $fn$;`)
await assert.rejects(db.exec(file), err => /notify_topic is not the body this migration replaces/.test(String(err.message)), 'a drifted body stops the migration')
checks++

console.log(`topics asked at send: ${checks} checks passed`)
