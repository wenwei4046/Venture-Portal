// Local PostgreSQL regression for 20261021020100 (2026-10-20 — the user: "i want add on a button to get submit for IT
// support or help"; everybody sends a title, the details, screenshots or files, as a bug, a new feature or a suggestion;
// "as Revenue Director 的 view … 左边这里 category 就会多一个 IT request"; "我们也可以帮做 annotation … 他也能看到自己
// submit 的 case status。如果我们给它 fix 了，他那边就可以收到 fix 的通知"). The migration runs VERBATIM, twice, over
// stand-ins for the sign-in, the people, the permission check, the storage schema and the notices (production's
// notify_people and notify_topic bodies). No live I/O.
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

const SENDER = id(1) // CHEA HUAN, a Team Leader — no cell: sends and follows their own
const DESK = id(2) // PETER, the Revenue Director — IT requests · View and Edit
const VIEWER = id(3) // IT requests · View only
const OTHER = id(4) // a colleague with no cell
const GONE = id(5) // switched off
const EDIT = ['it_requests.view', 'it_requests.edit']

/** Signed in as somebody holding these actions (the stand-in has_any_action reads them), as the database role. */
async function as(user, actions = [], role = null) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null)
const put = (name, meta = {}) => q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('it-requests', $1, $2)`, [name, JSON.stringify(meta)])
const submit = (category, title, details = '', files = [], app = 'revenue', device = 'iPhone · Safari') =>
  one(`SELECT public.it_request_submit($1, $2, $3, $4::jsonb, $5, $6)`, [category, title, details, JSON.stringify(files), app, device])
const note = (rid, body, files = [], status = null) =>
  one(`SELECT public.it_request_note($1, $2, $3::jsonb, $4)`, [rid, body, JSON.stringify(files), status])
const notices = async user => {
  await db.exec('RESET ROLE')
  return (await q(`SELECT kind, title, body, ref_kind, ref_id FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user]))
}
const clearNotices = async () => { await db.exec('RESET ROLE'); await db.exec('DELETE FROM public.app_notifications') }

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
    owner uuid, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated;
  GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, user_id uuid,
    title_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());

  -- The permission check: any wanted 'fn.action' among the actions handed in.
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- The notices as production holds them on 2026-10-20 (checks included), and its two writers, body for body.
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '' CHECK (length(body) <= 400),
    ref_kind text NOT NULL, ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
    push_taken_at timestamptz, pushed_at timestamptz, data jsonb,
    CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['hiring', 'rooms', 'review', 'memo', 'crm', 'attendance'])),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['hiring_request', 'booking', 'member_request', 'memo',
      'crm_contact', 'crm_invite', 'att_today', 'att_request'])));
  CREATE TABLE public.notification_topics (user_id uuid NOT NULL REFERENCES public.users(id), topic text NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, topic),
    CONSTRAINT notification_topics_topic_check CHECK (topic = ANY (ARRAY['hiring.guest', 'rooms.guest', 'member.requests'])));
  CREATE FUNCTION public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
  BEGIN
    INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
    SELECT u.id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id
      FROM public.users u
     WHERE u.id IN (SELECT DISTINCT x FROM unnest(p_users) x WHERE x IS NOT NULL)
       AND u.is_active
       AND u.id IS DISTINCT FROM auth.uid();
  END
  $fn$;
  CREATE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
  BEGIN
    PERFORM public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic), p_kind, p_title, p_body, p_ref_kind, p_ref_id);
  END
  $fn$;
`)
await db.exec(`
  INSERT INTO public.users (id, name, email, is_active) VALUES
    ('${SENDER}', 'Chea Huan login', 'chea@x.my', true), ('${DESK}', 'Peter login', 'peter@x.my', true),
    ('${VIEWER}', NULL, 'viewer@x.my', true), ('${OTHER}', 'Other', 'other@x.my', true), ('${GONE}', 'Gone', 'gone@x.my', false);
  INSERT INTO public.titles (id, name) VALUES ('${id(31)}', 'Team Leader'), ('${id(32)}', 'Revenue Director');
  INSERT INTO public.hr_staff_costs (employee_name, user_id, title_id) VALUES
    ('CHEA HUAN', '${SENDER}', '${id(31)}'), ('PETER', '${DESK}', '${id(32)}'), ('OTHER ONE', '${OTHER}', NULL);
`)

const file = (await readFile(new URL('20261021020100_it_requests.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(file)
await db.exec(file) // twice: nothing changes, nothing breaks

// ── The notices' kinds and the desk's topic: widened, nothing dropped ──────────
const def = name => one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = $1`, [name])
for (const k of ['hiring', 'rooms', 'review', 'memo', 'crm', 'attendance', 'it']) check((await def('app_notifications_kind_check')).includes(`'${k}'`), true, `notice kind ${k}`)
for (const k of ['hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite', 'att_today', 'att_request', 'it_request'])
  check((await def('app_notifications_ref_kind_check')).includes(`'${k}'`), true, `notice ref ${k}`)
for (const k of ['hiring.guest', 'rooms.guest', 'member.requests', 'it.requests']) check((await def('notification_topics_topic_check')).includes(`'${k}'`), true, `topic ${k}`)
for (const c of ['app_notifications_kind_check', 'app_notifications_ref_kind_check', 'notification_topics_topic_check'])
  check([...(await def(c)).matchAll(/'([^']+)'/g)].every(m => /^[a-z_.]+$/.test(m[1])), true, `${c} read back as it was written, the second run too`)
check([...(await def('app_notifications_kind_check')).matchAll(/'([^']+)'/g)].length, 7, 'seven kinds: six kept, one added')
check(await one(`SELECT count(*)::int FROM storage.buckets WHERE id = 'it-requests' AND NOT public AND file_size_limit = 52428800`), 1, 'the bucket: private, 50 MB a file')

// ── Who may call what ──────────────────────────────────────────────────────────
for (const fn of ['it_request_submit(text,text,text,jsonb,text,text)', 'my_it_requests()', 'it_requests_desk()', 'it_request_file(uuid)',
  'it_request_note(uuid,text,jsonb,text)', 'it_desk_listen()', 'it_request_object_readable(text)', 'it_request_object_removable(text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['it_request_who(uuid)', 'it_request_files_check(jsonb)', 'it_request_file_in(uuid,uuid,jsonb)', 'it_requests_json(uuid[])'])
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions' own`)
for (const t of ['it_requests', 'it_request_notes', 'it_request_files'])
  check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT')`), false, `${t}: no client grant`)

// ── Who hears of new requests ──────────────────────────────────────────────────
await as(DESK, EDIT, 'authenticated'); check(await one(`SELECT public.it_desk_listen()`), true, 'the desk listens')
await as(VIEWER, ['it_requests.view'], 'authenticated'); check(await one(`SELECT public.it_desk_listen()`), true, 'View alone listens too')
await as(OTHER, [], 'authenticated'); check(await one(`SELECT public.it_desk_listen()`), false, 'nobody else')
await asSystem()
check((await q(`SELECT user_id FROM public.notification_topics WHERE topic = 'it.requests' ORDER BY user_id`)).map(r => r.user_id), [DESK, VIEWER], 'the topic: the desk and the viewer')

// ── Sending one: who, and what it must say ─────────────────────────────────────
await as(null, [], 'authenticated')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', '[]', 'revenue', '')`, [], /Sign in/, 'no sign-in sends nothing')
await as(GONE, [], 'authenticated')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', '[]', 'revenue', '')`, [], /Sign in/, 'a switched-off account sends nothing')
await as(SENDER, [], 'authenticated')
await refuses(`SELECT public.it_request_submit('other', 'x', '', '[]', 'revenue', '')`, [], /bug, a new feature or a suggestion/, 'a category of the three')
await refuses(`SELECT public.it_request_submit('bug', '   ', '', '[]', 'revenue', '')`, [], /Add a title/, 'a title')
await refuses(`SELECT public.it_request_submit('bug', $1, '', '[]', 'revenue', '')`, ['x'.repeat(121)], /120 characters/, 'a short title')
await refuses(`SELECT public.it_request_submit('bug', 'x', $1, '[]', 'revenue', '')`, ['y'.repeat(5001)], /5,000 characters/, 'details within 5,000')

// Files: in the sender's own folder of the bucket, there, filed once.
await asSystem()
await put(`${SENDER}/a1/shot.png`, { size: 1234, mimetype: 'image/png' })
await put(`${SENDER}/a2/log.pdf`, { size: 2048, mimetype: 'application/pdf' })
await put(`${OTHER}/b1/theirs.png`, { size: 10, mimetype: 'image/png' })
await as(SENDER, [], 'authenticated')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', $1::jsonb, 'revenue', '')`, [JSON.stringify([{ path: `${OTHER}/b1/theirs.png`, name: 'theirs.png' }])],
  /did not finish uploading/, 'never somebody else’s upload')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', $1::jsonb, 'revenue', '')`, [JSON.stringify([{ path: `${SENDER}/zz/missing.png`, name: 'missing.png' }])],
  /did not finish uploading/, 'never a file that is not there')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', $1::jsonb, 'revenue', '')`,
  [JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ path: `${SENDER}/a1/shot.png`, name: `${i}.png` })))], /up to 10 files/, 'ten at most')
await refuses(`SELECT public.it_request_submit('bug', 'x', '', $1::jsonb, 'revenue', '')`,
  [JSON.stringify([{ path: `${SENDER}/a1/shot.png`, name: 'a.png' }, { path: `${SENDER}/a1/shot.png`, name: 'b.png' }])], /there twice/, 'a file once')
await asSystem()
check(await one(`SELECT count(*)::int FROM public.it_requests`), 0, 'a refused send leaves nothing behind')
check(Number(await one(`SELECT last_value FROM public.it_request_ref_seq`)), 1, '…and takes no number: the first is still to come')

await as(SENDER, [], 'authenticated')
const r1 = await submit('bug', '  Quote page freezes ', ' Tap + twice on step 2. ', [{ path: `${SENDER}/a1/shot.png`, name: 'shot.png', contentType: 'image/gif', size: 999 }])
check([r1.ref, r1.category, r1.title, r1.details, r1.status, r1.senderName, r1.senderTitle, r1.app, r1.device, r1.mine],
  ['IT-0001', 'bug', 'Quote page freezes', 'Tap + twice on step 2.', 'new', 'CHEA HUAN', 'Team Leader', 'revenue', 'iPhone · Safari', true], 'sent: as it reads')
check(r1.files.map(f => [f.name, f.contentType, f.size, f.noteId]), [['shot.png', 'image/png', 1234, null]], 'its file: the bucket’s type and size, not the browser’s')
check(r1.notes, [], 'no thread yet')
await refuses(`SELECT public.it_request_submit('bug', 'again', '', $1::jsonb, 'revenue', '')`, [JSON.stringify([{ path: `${SENDER}/a1/shot.png`, name: 'shot.png' }])],
  /on a request already/, 'a file is filed once')
check(await notices(DESK), [{ kind: 'it', title: 'New IT request · Bug', body: 'IT-0001 · Quote page freezes — CHEA HUAN', ref_kind: 'it_request', ref_id: r1.id }], 'the desk is told')
check((await notices(VIEWER)).length, 1, 'whoever listens is told')
check(await notices(SENDER), [], 'never the sender')
check(await notices(OTHER), [], 'nobody else')
await clearNotices()

// ── Reading them ───────────────────────────────────────────────────────────────
await as(SENDER, [], 'authenticated')
check((await one(`SELECT public.my_it_requests()`)).map(r => r.ref), ['IT-0001'], 'the sender’s own')
await as(OTHER, [], 'authenticated')
check(await one(`SELECT public.my_it_requests()`), [], 'nobody else’s')
await refuses(`SELECT public.it_requests_desk()`, [], /not open to your account/, 'the desk is IT requests · View’s')
await as(VIEWER, ['it_requests.view'], 'authenticated')
const desk1 = await one(`SELECT public.it_requests_desk()`)
check(desk1.map(r => [r.ref, r.mine, r.senderName]), [['IT-0001', false, 'CHEA HUAN']], 'View reads everybody’s')

// ── The thread: replies, notes, statuses ───────────────────────────────────────
await as(OTHER, [], 'authenticated')
await refuses(`SELECT public.it_request_note($1, 'me too', '[]', null)`, [r1.id], /not yours/, 'a colleague writes nothing on it')
await as(VIEWER, ['it_requests.view'], 'authenticated')
await refuses(`SELECT public.it_request_note($1, 'hm', '[]', null)`, [r1.id], /not yours/, 'View alone writes nothing')
await as(SENDER, [], 'authenticated')
await refuses(`SELECT public.it_request_note($1, 'done?', '[]', 'fixed')`, [r1.id], /Only IT sets/, 'the sender sets no status')
await refuses(`SELECT public.it_request_note($1, '  ', '[]', null)`, [r1.id], /Write a note, attach a file or change the status/, 'nothing to write')
const r2 = await note(r1.id, 'Still happening on Android too.', [{ path: `${SENDER}/a2/log.pdf`, name: 'log.pdf' }])
check(r2.notes.map(n => [n.side, n.authorName, n.body, n.statusFrom, n.statusTo, n.mine]), [['sender', 'CHEA HUAN', 'Still happening on Android too.', null, null, true]], 'a reply')
check(r2.files.map(f => [f.name, f.noteId === r2.notes[0].id]), [['shot.png', false], ['log.pdf', true]], 'its file is the reply’s')
check((await notices(DESK)).map(n => [n.title, n.body]), [['IT-0001 · CHEA HUAN replied', 'Quote page freezes — “Still happening on Android too.”']], 'the desk is told of a reply')
check(await notices(SENDER), [], 'not the sender')
await clearNotices()

await as(DESK, EDIT, 'authenticated')
await refuses(`SELECT public.it_request_note($1, 'x', '[]', 'done')`, [r1.id], /Pick a status/, 'a status of the four')
const r3 = await note(r1.id, 'Looking at it.', [], 'in_progress')
check([r3.status, r3.statusByName], ['in_progress', 'PETER'], 'in progress, by whom')
check(r3.notes.at(-1), { ...r3.notes.at(-1), side: 'it', authorName: 'PETER', body: 'Looking at it.', statusFrom: 'new', statusTo: 'in_progress', mine: true }, 'the note says so')
check((await notices(SENDER)).map(n => [n.kind, n.title, n.body, n.ref_kind, n.ref_id]),
  [['it', 'IT-0001 · In progress', 'Quote page freezes — “Looking at it.”', 'it_request', r1.id]], 'the sender is told')
await clearNotices()
await as(DESK, EDIT, 'authenticated')
const r4 = await note(r1.id, 'Found it.', [], 'in_progress')
check([r4.status, r4.notes.at(-1).statusTo, r4.notes.at(-1).side], ['in_progress', null, 'it'], 'the same status again moves nothing: a note')
check((await notices(SENDER)).map(n => n.title), ['IT-0001 · IT replied'], 'told of the note')
await clearNotices()
await as(DESK, EDIT, 'authenticated')
const r5 = await note(r1.id, '', [], 'fixed')
check([r5.status, r5.notes.at(-1).body, r5.notes.at(-1).statusFrom, r5.notes.at(-1).statusTo], ['fixed', '', 'in_progress', 'fixed'], 'fixed, no words needed')
check((await notices(SENDER)).map(n => [n.title, n.body]), [['IT-0001 · Fixed', 'Quote page freezes']], 'the sender hears it is fixed')
check(await notices(VIEWER), [], 'IT’s own notes tell nobody at the desk')
await clearNotices()
await as(DESK, EDIT, 'authenticated')
check((await note(r1.id, 'Not fixed after all.', [], 'new')).status, 'new', 'reopened')
check((await notices(SENDER)).map(n => n.title), ['IT-0001 · Reopened'], 'told it is open again')
await clearNotices()

// ── A file's path, for its reader ──────────────────────────────────────────────
const shot = r1.files[0].id
await as(SENDER, [], 'authenticated')
check((await one(`SELECT public.it_request_file($1)`, [shot])).path, `${SENDER}/a1/shot.png`, 'the sender opens their file')
await as(VIEWER, ['it_requests.view'], 'authenticated')
check((await one(`SELECT public.it_request_file($1)`, [shot])).name, 'shot.png', 'View opens it')
await as(OTHER, [], 'authenticated')
await refuses(`SELECT public.it_request_file($1)`, [shot], /not yours to open/, 'nobody else')

// ── The bucket's policies, as each reader ──────────────────────────────────────
await as(SENDER, [], 'authenticated')
await q(`INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('it-requests', $1, $2)`, [`${SENDER}/c1/draft.png`, SENDER]); checks++
await refuses(`INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('it-requests', $1, $2)`, [`${OTHER}/c2/x.png`, SENDER], /row-level security/,
  'an upload goes only into one’s own folder')
const sees = async (user, actions) => {
  await as(user, actions, 'authenticated')
  return (await q(`SELECT name FROM storage.objects WHERE bucket_id = 'it-requests' ORDER BY name`)).map(r => r.name)
}
check(await sees(SENDER, []), [`${SENDER}/a1/shot.png`, `${SENDER}/a2/log.pdf`, `${SENDER}/c1/draft.png`], 'the sender: their own, filed or not')
check(await sees(VIEWER, ['it_requests.view']), [`${SENDER}/a1/shot.png`, `${SENDER}/a2/log.pdf`], 'View: every filed one, no draft')
check(await sees(OTHER, []), [`${OTHER}/b1/theirs.png`], 'anybody else: only their own')
await as(SENDER, [], 'authenticated')
check((await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'it-requests' AND name = $1`, [`${SENDER}/c1/draft.png`])).affectedRows, 1, 'an upload nobody filed may go')
check((await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'it-requests' AND name = $1`, [`${SENDER}/a1/shot.png`])).affectedRows, 0, 'a filed one stays')

// ── The desk's own request: the sender's side, until they set its status ───────
await as(DESK, EDIT, 'authenticated')
const own = await submit('feature', 'Export the desk to Excel', '', [], 'revenue', '')
check([own.ref, own.mine], ['IT-0002', true], 'the desk sends one too')
check(await notices(DESK), [], 'not told of their own')
check((await notices(VIEWER)).map(n => n.title), ['New IT request · New feature'], 'the other listener is')
await clearNotices()
await as(DESK, EDIT, 'authenticated')
check((await note(own.id, 'More detail: by month.')).notes.at(-1).side, 'sender', 'on their own request they write as its sender')
check((await notices(VIEWER)).map(n => n.title), ['IT-0002 · PETER replied'], 'the desk hears of it')
await clearNotices()

// ── Twenty a day each ──────────────────────────────────────────────────────────
await as(OTHER, [], 'authenticated')
for (let i = 0; i < 20; i++) await submit('suggestion', `Idea ${i + 1}`)
await refuses(`SELECT public.it_request_submit('suggestion', 'one more', '', '[]', 'revenue', '')`, [], /20 requests in a day/, 'the twenty-first waits for tomorrow')
await asSystem()
check(await one(`SELECT max(ref) FROM public.it_requests`), 'IT-0022', 'refs run on')

console.log(`validate-it-requests: ${checks} checks passed`)
