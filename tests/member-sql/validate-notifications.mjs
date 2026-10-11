// Local PostgreSQL regression for 20261011180000 (2026-10-11, notifications and phone push — the
// user's "现在就做", "铃铛 + 手机推送"). The rooms migrations run VERBATIM (090000, 150000) and then
// this one, over stand-ins for the tables they read (hiring and member requests are stand-ins with
// the columns the triggers read). What is under test: a meeting tells the people in it — booked for
// you, added, changed, taken off, cancelled — and never the one who did it; a guest booking, a guest
// manpower request and a member's request tell whoever holds the topic; a hiring request tells its
// requester how it moved; topics are only what the caller's actions hold, and any permission change
// forgets them; each reads and marks only their own; the outbox opens only to the secret; a notice
// never stops the work it tells of. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

// People: Grace (HR, books), Jason, Kar Jun (a member), Chea Huan (has a login here), Nurul (HR, no actions).
const GRACE = id(1), JASON = id(2), KARJUN = id(3), CHEA = id(4), NURUL = id(5)
const S_GRACE = id(11), S_JASON = id(12), S_KARJUN = id(13), S_CHEA = id(14), S_NURUL = id(15)
const HR = id(21), REV = id(22), FAIR = id(31)
const SECRET = 'the server holds this'

async function as(user, actions = [], role = 'authenticated', manager = false) {
  await db.exec(`RESET ROLE`)
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false),
                        set_config('test.manager', '${manager ? 'yes' : ''}', false)`)
  await db.exec(`SET ROLE ${role}`)
}
/** Their notices — read as them, then nobody is signed in again (so the next write has no one to leave out). */
const mine = async user => {
  await as(user)
  const r = (await q(`SELECT public.notifications_mine() AS r`))[0].r
  await db.exec(`RESET ROLE`)
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  return r
}
const titlesOf = async user => (await mine(user)).items.map(i => i.title).reverse()
/** Let the clock move on before a write whose notice must come out newer: PGlite's now() counts in milliseconds, two
 *  writes in the same one share it, and the newest-first list then puts their notices either way round (CI, 2026-10-11). */
const tick = () => new Promise(resolve => setTimeout(resolve, 3))

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE EXTENSION btree_gist;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, template_id uuid);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, title_id uuid, designation text, home_sub_department_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE permission_templates(id uuid PRIMARY KEY);
    CREATE TABLE permission_template_grants(template_id uuid, cell text);
    CREATE TABLE permission_template_tabs(template_id uuid, tab_id text, action text);
    CREATE TABLE user_permission_cells(user_id uuid, cell text);
    CREATE TABLE user_permission_tabs(user_id uuid, tab_id text, action text, granted boolean);
    -- The two tables the triggers read, as far as they read them.
    CREATE TABLE hiring_requests(id text PRIMARY KEY, status text NOT NULL DEFAULT 'submitted', source text NOT NULL DEFAULT 'portal',
      requested_by uuid, requester_name text NOT NULL, requester_company text, answers jsonb NOT NULL DEFAULT '{}', hired_names text[] NOT NULL DEFAULT '{}');
    CREATE TABLE member_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL, kind text NOT NULL, status text NOT NULL DEFAULT 'draft',
      title text NOT NULL);
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.manager', true) = 'yes' $$;
    CREATE FUNCTION public.current_tabs() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULL::jsonb $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
    GRANT ALL ON hiring_requests, member_requests TO authenticated, anon;
  `)
  await q(`INSERT INTO users(id, name, email) VALUES ($1, 'Grace account', 'g@x'), ($2, 'Jason account', 'j@x'), ($3, 'Kar Jun account', 'k@x'),
    ($4, 'Chea Huan account', 'c@x'), ($5, 'Nurul account', 'n@x')`, [GRACE, JASON, KARJUN, CHEA, NURUL])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO comm_sub_departments(id, name, department_id) VALUES ($1, 'Fair', $2)`, [FAIR, REV])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, department_id, user_id) VALUES
    ($1, 'Grace Lim', $6, $7), ($2, 'Jason Ong', $6, $8), ($3, 'Kar Jun', $11, $9), ($4, 'Chea Huan', $11, $10), ($5, 'Nurul Huda', $6, $12)`,
    [S_GRACE, S_JASON, S_KARJUN, S_CHEA, S_NURUL, HR, GRACE, JASON, KARJUN, CHEA, REV, NURUL])

  for (const f of ['20261011090000_meeting_rooms.sql', '20261011150000_rooms_on_behalf_and_app_ticks.sql', '20261011180000_notifications.sql']) {
    await db.exec((await readFile(new URL(f, migrations), 'utf8')).replace(/\r\n/g, '\n'))
  }
  // The test's own secret in place of the server's.
  await q(`UPDATE push_config SET outbox_secret_sha256 = $1`, [createHash('sha256').update(SECRET).digest('hex')])

  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const D1 = await one(`SELECT (($1::date) + 1)::text`, [today])

  // ── Topics: only what the caller's own actions hold ──
  await as(GRACE, ['hiring.approve', 'rooms.edit'], 'authenticated', true)
  check((await q(`SELECT public.notification_topics_sync(ARRAY['hiring.guest', 'rooms.guest', 'member.requests', 'bogus']) AS t`))[0].t,
    ['hiring.guest', 'member.requests', 'rooms.guest'], 'HR keeps the three its actions hold, never a made-up one')
  await as(KARJUN, ['revenue_app.view'])
  check((await q(`SELECT public.notification_topics_sync(ARRAY['hiring.guest', 'rooms.guest', 'member.requests']) AS t`))[0].t, [],
    'a member asking for HR’s topics gets none')
  await as(NURUL, ['rooms.edit'])
  check((await q(`SELECT public.notification_topics_sync(ARRAY['rooms.guest']) AS t`))[0].t, ['rooms.guest'], 'Nurul holds Meeting rooms · Edit only')

  // ── A meeting ──
  await as(GRACE, ['rooms.view', 'rooms.create', 'rooms.edit'])
  const room = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Meeting Room 1', 8, 'Level 3', '', true) AS r`))[0].r
  const BOOK = `SELECT public.meeting_rooms_book($1, $2, $3::date, $4, $5, $6, $7, $8, $9::uuid[], '[]'::jsonb, NULL, 'portal', NULL) AS r`
  const b = (await q(BOOK, [null, room.id, D1, 600, 660, 'Interview', HR, S_CHEA, [S_CHEA, S_JASON]]))[0].r
  check(await titlesOf(CHEA), ['Grace Lim booked a room for you'], 'booked for Chea Huan: he hears Grace booked it')
  check(await titlesOf(JASON), ['Grace Lim added you to a meeting'], 'Jason, attending, hears he was added')
  check((await mine(JASON)).items[0].body, `Interview · Meeting Room 1 · ${await one(`SELECT to_char($1::date, 'Dy FMDD Mon')`, [D1])} · 10:00–11:00`,
    'with what, where and when (the day as the app writes it: Sun 5 Oct)')
  check(await titlesOf(GRACE), [], 'never the one who did it')

  await as(GRACE, ['rooms.view', 'rooms.create', 'rooms.edit'])
  await q(BOOK, [b.id, room.id, D1, 630, 690, 'Interview', HR, S_CHEA, [S_CHEA, S_KARJUN]])
  check(await titlesOf(KARJUN), ['Grace Lim added you to a meeting'], 'Kar Jun, added on the change, hears he was added')
  check(await titlesOf(JASON), ['Grace Lim added you to a meeting', 'You were taken off a meeting'], 'Jason, dropped, hears so')
  check(await titlesOf(CHEA), ['Grace Lim booked a room for you', 'Meeting changed · Interview'], 'Chea Huan, still in it, hears it moved')

  await as(CHEA, ['rooms.view', 'rooms.create'])
  await q(`SELECT public.meeting_rooms_cancel($1)`, [b.id])
  check((await titlesOf(KARJUN)).at(-1), 'Meeting cancelled · Interview', 'Chea Huan cancels: Kar Jun hears it')
  check((await mine(KARJUN)).items[0].body.endsWith('by Chea Huan'), true, 'and who cancelled it')
  check(await titlesOf(GRACE), [], 'Grace, who is neither in it nor for it, hears nothing')
  check((await titlesOf(CHEA)).length, 2, 'nor does Chea Huan, who cancelled it')

  // A guest booking: whoever holds rooms.guest.
  await db.exec('RESET ROLE')
  await q(`INSERT INTO meeting_room_bookings(ref, room_id, day, start_min, end_min, title, source, booked_by_name, pax, guest_company, guest_department)
           VALUES ('BK-G900', $1, $2, 1020, 1080, 'Showroom kickoff', 'guest', 'Wong Mei Yee', 5, 'HOUZS Interior', 'Project')`, [room.id, D1])
  check((await titlesOf(NURUL)).at(-1), 'New guest booking · HOUZS Interior', 'a guest booking tells the rooms.guest holders')
  check((await titlesOf(GRACE)).at(-1), 'New guest booking · HOUZS Interior', 'Grace too')
  check(await titlesOf(KARJUN).then(t => t.some(x => x.startsWith('New guest'))), false, 'not a member')

  // ── A hiring request ──
  await as(null, [], 'anon')
  await q(`INSERT INTO hiring_requests(id, source, requester_name, requester_company, answers) VALUES ('HR-301', 'guest', 'Wong', 'HOUZS Interior', '{"position": "Sales Executive", "dept": "Project"}')`)
  await db.exec('RESET ROLE')
  const gr = (await mine(GRACE)).items[0]
  check([gr.title, gr.body, gr.refKind, gr.refId], ['New manpower request · HOUZS Interior', 'HR-301 · Sales Executive · Project · Wong', 'hiring_request', 'HR-301'],
    'a guest request tells hiring.guest')
  check(await titlesOf(NURUL).then(t => t.some(x => x.startsWith('New manpower'))), false, 'not somebody without the topic')
  await q(`INSERT INTO hiring_requests(id, requested_by, requester_name, answers) VALUES ('HR-302', $1, 'Kar Jun', '{"position": "Fair Promoter"}')`, [S_KARJUN])
  await as(GRACE, ['hiring.approve'])
  await q(`UPDATE hiring_requests SET status = 'acknowledged' WHERE id = 'HR-302'`)
  await tick()
  await q(`UPDATE hiring_requests SET status = 'filled', hired_names = ARRAY['Ali', 'Siti'] WHERE id = 'HR-302'`)
  await db.exec('RESET ROLE')
  const kj = (await mine(KARJUN)).items.filter(i => i.refId === 'HR-302').reverse()
  check(kj.map(i => [i.title, i.body]), [['HR acknowledged your request HR-302', 'Fair Promoter'], ['HR-302 is filled', 'Hired: Ali, Siti']],
    'the requester hears each step')
  await as(KARJUN)
  await q(`UPDATE hiring_requests SET status = 'cancelled' WHERE id = 'HR-302'`)
  check((await mine(KARJUN)).items.filter(i => i.refId === 'HR-302').length, 2, 'not of a step they took themselves')

  // ── A member's request, for HR ──
  await db.exec('RESET ROLE')
  const claim = await one(`INSERT INTO member_requests(staff_id, kind, status, title) VALUES ($1, 'claim', 'submitted', 'Travel · RM 120.00') RETURNING id`, [S_KARJUN])
  check((await mine(GRACE)).items[0].title, 'New claim · Kar Jun', 'a claim sent tells member.requests')
  await q(`UPDATE member_requests SET status = 'needs_info' WHERE id = $1`, [claim])
  await tick()
  await q(`UPDATE member_requests SET status = 'submitted' WHERE id = $1`, [claim])
  check((await mine(GRACE)).items[0].title, 'Claim answered · Kar Jun', 'and again when the member answers')

  // ── Reading and marking: one's own ──
  check((await mine(KARJUN)).unread > 0, true, 'unread counted')
  await as(KARJUN)
  check(await one(`SELECT public.notifications_read(NULL)`) > 0, true, 'marks all of theirs read')
  check((await mine(KARJUN)).unread, 0, 'none left unread')
  check((await mine(GRACE)).unread > 0, true, 'Grace’s are untouched')

  // ── Any permission change forgets every topic ──
  await db.exec('RESET ROLE')
  check(await one(`SELECT count(*)::int FROM notification_topics`), 4, 'four topics held')
  await q(`INSERT INTO user_permission_tabs VALUES ($1, 'hr.meeting_rooms', 'edit', false)`, [NURUL])
  check(await one(`SELECT count(*)::int FROM notification_topics`), 0, 'a box changed: every topic forgotten until the HR app is opened again')
  await as(GRACE, ['hiring.approve'], 'authenticated', true)
  await q(`SELECT public.notification_topics_sync(ARRAY['hiring.guest', 'member.requests'])`)
  await db.exec('RESET ROLE')
  await q(`UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2`, [id(99), S_GRACE])
  check(await one(`SELECT count(*)::int FROM notification_topics`), 0, 'a person given another title: forgotten too')

  // ── A device, and the outbox ──
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }
  await as(KARJUN)
  await q(`SELECT public.push_subscribe($1, $2, $3, 'revenue')`, [sub.endpoint, sub.p256dh, sub.auth])
  await reject(`SELECT public.push_subscribe('http://plain.example', $1, $2, 'revenue')`, [sub.p256dh, sub.auth], /push_subscriptions_endpoint_check/, 'https only')
  await reject(`SELECT public.push_subscribe($1, $2, $3, 'tv')`, ['https://x.example/1', sub.p256dh, sub.auth], /Say which app/, 'one of the two apps')
  await as(null, [], 'anon')
  await reject(`SELECT public.push_outbox_take('guess', 10)`, [], /Not this caller/, 'the outbox opens only to the secret')
  await db.exec('RESET ROLE')
  await q(`UPDATE app_notifications SET pushed_at = NULL, push_taken_at = NULL`)
  await q(`INSERT INTO meeting_room_bookings(ref, room_id, day, start_min, end_min, title, source, booked_by_user, booked_by_staff, booked_by_name, internal_staff, pax)
           VALUES ('BK-X1', $1, $2, 480, 510, 'Early sync', 'portal', $3, $4, 'Grace Lim', ARRAY[$5]::uuid[], 2)`, [room.id, D1, GRACE, S_GRACE, S_KARJUN])
  await as(null, [], 'anon')
  const due = (await q(`SELECT public.push_outbox_take($1, 50) AS r`, [SECRET]))[0].r
  check(due.every(n => n.subs.length === 1 && n.subs[0].endpoint === sub.endpoint && n.subs[0].app === 'revenue'), true, 'only notices for somebody with a device come out, with it')
  check(due.length, (await (async () => { await db.exec('RESET ROLE'); return one(`SELECT count(*)::int FROM app_notifications n JOIN users u ON u.id = n.user_id WHERE u.id = $1 AND n.created_at > now() - interval '1 day'`, [KARJUN]) })()), 'all of Kar Jun’s')
  check(await one(`SELECT count(*)::int FROM app_notifications WHERE pushed_at IS NULL AND user_id <> $1`, [KARJUN]), 0, 'nobody else’s wait: they have no device')
  await as(null, [], 'anon')
  check((await q(`SELECT public.push_outbox_take($1, 50) AS r`, [SECRET]))[0].r, [], 'taken once: not again for five minutes')
  await q(`SELECT public.push_outbox_done($1, $2::uuid[], $3::text[])`, [SECRET, due.map(n => n.id), [sub.endpoint]])
  await db.exec('RESET ROLE')
  check(await one(`SELECT count(*)::int FROM app_notifications WHERE pushed_at IS NULL`), 0, 'delivered ones are done')
  check(await one(`SELECT count(*)::int FROM push_subscriptions`), 0, 'a device the push service says is gone is forgotten')

  // ── A notice never stops the work it tells of ──
  await db.exec(`ALTER TABLE app_notifications RENAME TO app_notifications_away`)
  await as(GRACE, ['rooms.view', 'rooms.create', 'rooms.edit'])
  const still = (await q(BOOK, [null, room.id, D1, 1140, 1200, 'Late call', HR, S_CHEA, [S_CHEA]]))[0].r
  check(/^BK-\d+$/.test(still.ref), true, 'with the notices gone, the booking still stands')
  await db.exec('RESET ROLE')
  await db.exec(`ALTER TABLE app_notifications_away RENAME TO app_notifications`)

  // ── Doors ──
  const may = (role, fn) => one(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`)
  check(await Promise.all(['public.push_outbox_take(text, integer)', 'public.push_outbox_done(text, uuid[], text[])'].map(f => may('anon', f))), [true, true],
    'the outbox is the guest page’s server too (and asks the secret)')
  check(await Promise.all(['public.notifications_mine(integer)', 'public.notifications_read(uuid[])', 'public.push_subscribe(text, text, text, text)',
    'public.push_unsubscribe(text)', 'public.notification_topics_sync(text[])'].map(f => may('anon', f))), [false, false, false, false, false], 'the rest asks a sign-in')
  check(await Promise.all(['public.notify_people(uuid[], text, text, text, text, text)', 'public.notify_topic(text, text, text, text, text, text)',
    'public.push_outbox_ok(text)'].map(f => may('authenticated', f))), [false, false, false], 'the helpers are nobody’s door')
  check(await Promise.all(['app_notifications', 'push_subscriptions', 'notification_topics', 'push_config'].map(t =>
    one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT') OR has_table_privilege('anon', 'public.${t}', 'SELECT')`))),
    [false, false, false, false], 'no table is read straight')

  console.log(`notifications: ${checks} checks passed`)
} finally {
  await db.close()
}
