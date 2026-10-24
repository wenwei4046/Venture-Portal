// Local PostgreSQL regression for 20261025039000 (2026-10-24 — Marketing ⑦-3, the chat: the lobby's thread and direct
// messages; the user's answers 35, 36, 37 and 39). Marketing's migrations up to the lobby run; then this one, twice. What
// is under test: who may call what (and that nothing edits or deletes a message); who speaks — the roster with a login —
// and who only reads the lobby; a direct message read by its two people alone, never a manager; the list — each
// teammate's last message, what is unread; a message's words (one line, 1,000 at most) and a task attached; read marks,
// forward only; a thread fifty at a time. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
async function peek(sql, params = []) {
  const [{ cu, su }] = await q('SELECT current_user AS cu, session_user AS su')
  await db.exec('RESET ROLE')
  try {
    return await q(sql, params)
  } finally {
    if (cu !== su) await db.exec(`SET ROLE ${cu}`)
  }
}
const peek1 = async (sql, params = []) => Object.values((await peek(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const VIEW = ['marketing.view']
const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), lee: id(4), siti: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), lee: id(14), siti: id(15), kai: id(16) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false),
                  set_config('test.actions', $3, false), set_config('test.flags', '{}', false)`, [user ?? '', role ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE SCHEMA storage;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA auth, storage, public TO authenticated, anon, service_role;

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  -- The other buckets' policy helpers (20261023150000 carries every storage.objects policy): none is under test here.
  CREATE FUNCTION public.test_flag(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_readable_by_hr(p text, p_owner text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');
  CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status NOT NULL);
  CREATE TABLE public.payment_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), storage_path text NOT NULL);
  CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
  CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
  CREATE TABLE public.member_request_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, object_path text);
  -- Every policy on file_objects is weighed on each write, so the tables the others read are readable (as there).
  GRANT SELECT ON public.payment_vouchers, public.payment_attachments, public.crm_contacts, public.member_requests,
    public.member_request_attachments TO authenticated, anon;

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason
  $$;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.companies(id uuid PRIMARY KEY, name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text,
    user_id uuid, title_id uuid, department_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.att_holidays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, name text NOT NULL,
    kind text, states text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'), ('${U.lee}', 'Lee', 'lee@x.my'), ('${U.siti}', 'Siti', 'siti@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'ACCOUNTANT');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', '${U.lee}', '${id(304)}', '${id(202)}', 'active'),
    ('${S.siti}', 'SITI AMINAH', 'Siti', '${U.siti}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.kai}', 'KAI MING', 'Kai', NULL, '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(await sql('20261023150000_file_storage_r2.sql'))
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261024005000_marketing_subsidiary_page.sql', '20261024006000_marketing_project_log.sql', '20261024007000_marketing_library.sql',
  '20261024007100_marketing_library_bigger_uploads.sql', '20261024007200_marketing_brand_profiles.sql', '20261024007300_marketing_library_shares.sql',
  '20261024007400_marketing_task_library.sql', '20261024007500_marketing_spaces.sql', '20261024007600_marketing_space_private_photo.sql',
  '20261024007700_marketing_space_room_pet.sql', '20261025004000_marketing_library_answers.sql', '20261025004100_marketing_builder_deletes.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql',
  '20261025034000_marketing_two_pics.sql', '20261025035000_marketing_pic_both.sql', '20261025036000_marketing_replace_person.sql',
  '20261025037000_marketing_pet_levels.sql', '20261025038000_marketing_lobby_visit.sql']
for (const m of MIGS) await db.exec(await sql(m))

const mig = await sql('20261025039000_marketing_chat.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_chat_list()', 'mkt_chat_thread(text, bigint)', 'mkt_chat_send(text, text, uuid)', 'mkt_chat_read(text, bigint)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
for (const fn of ['mkt_chat_me()', 'mkt_chat_key(uuid, text)']) {
  check(await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: the functions’ own`)
}
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_chat', 'SELECT') OR has_table_privilege('authenticated', 'public.mkt_chat', 'UPDATE')
  OR has_table_privilege('authenticated', 'public.mkt_chat', 'DELETE')`), false, 'a message is read only through the functions — nothing edits or deletes one (answer 36)')
check((await peek(`SELECT t, mode FROM public.audit_registered WHERE t IN ('mkt_chat', 'mkt_chat_reads') ORDER BY t`)).map(r => [r.t, r.mode]),
  [['mkt_chat', 'none'], ['mkt_chat_reads', 'none']], 'neither in the audit log — a DM is two people’s')
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE proname ~ '^mkt_chat_(edit|delete|remove|update)'`), 0, 'no function edits or deletes a message')

const list = async (user, actions = VIEW) => { await as(user, actions); return one(`SELECT public.mkt_chat_list()`) }
const thread = async (user, w, before = null, actions = VIEW) => { await as(user, actions); return one(`SELECT public.mkt_chat_thread($1, $2)`, [w, before]) }
const send = async (user, w, text, project = null) => { await as(user, STAFF); return one(`SELECT public.mkt_chat_send($1, $2, $3)`, [w, text, project]) }
const read = async (user, w, last) => { await as(user, STAFF); await q(`SELECT public.mkt_chat_read($1, $2)`, [w, last]) }

// ── Who speaks (answer 37) ─────────────────────────────────────────────────────────
await as(U.lee, [])
await refuses(`SELECT public.mkt_chat_list()`, [], /Marketing is not open to your account/, 'the chat: Marketing · View')
check(await list(U.lee), { me: null, lobby: { last: null, unread: false }, dms: [] }, 'off the roster: the lobby only — no direct messages')
check((await thread(U.lee, 'lobby')).messages, [], 'the lobby: anybody with View reads it')
await as(U.lee, VIEW)
await refuses(`SELECT public.mkt_chat_thread($1, NULL)`, [S.mei], /between two people on Marketing's roster/, 'off the roster: no direct messages to read')
await as(U.lee, STAFF)
await refuses(`SELECT public.mkt_chat_send('lobby', 'hello', NULL)`, [], /Only Marketing's team chats here/, 'off the roster: no word in the lobby')
await as(U.mei, VIEW)
await refuses(`SELECT public.mkt_chat_send('lobby', 'hello', NULL)`, [], /Chatting is not open to your account/, 'a message: Marketing · Edit')
await as(U.mei, STAFF)
for (const [w, what] of [[S.kai, 'somebody without a login'], [S.lee, 'somebody off the roster'], [S.mei, 'oneself'], ['everyone', 'no such place'], [id(999), 'nobody']]) {
  await refuses(`SELECT public.mkt_chat_send($1, 'hi', NULL)`, [w], /goes to the lobby or to somebody on Marketing's roster/, `never to ${what}`)
}

// ── The lobby ─────────────────────────────────────────────────────────────────────
const m1 = await send(U.mei, 'lobby', '  Who has the   Carres moodboard?\n Need it  ')
check([m1.from, m1.first, m1.body, m1.project], [S.mei, 'Mei', 'Who has the Carres moodboard? Need it', null], 'one line, its words tidied')
let ali = await list(U.ali)
check([ali.me, ali.lobby.last.body, ali.lobby.last.first, ali.lobby.unread], [S.ali, 'Who has the Carres moodboard? Need it', 'Mei', true], 'the lobby’s last message, unread to a teammate')
check((await list(U.mei)).lobby.unread, false, 'never to its sender')
check((await list(U.lee)).lobby, { last: { id: m1.id, from: S.mei, first: 'Mei', body: m1.body, project: null, at: m1.at }, unread: false },
  'off the roster: read, never unread (nobody’s mark)')
await read(U.ali, 'lobby', m1.id)
check((await list(U.ali)).lobby.unread, false, 'read: no dot')

// ── Direct messages (answer 35): two people's alone ─────────────────────────────────────────
await asSystem()
await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status) VALUES ($1, 'TSK-CAR-2610-004', 'quick', $2, 'Price banner', 'active')`,
  [id(701), await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_chat_send($1, NULL, NULL)`, [S.ali], /Write something, or attach a task/, 'words or a task')
await refuses(`SELECT public.mkt_chat_send($1, $2, NULL)`, [S.ali, 'x'.repeat(1001)], /at most 1,000/, '1,000 characters at most')
await refuses(`SELECT public.mkt_chat_send($1, 'see this', $2)`, [S.ali, id(799)], /That task is not there/, 'a task that is there')
const m2 = await send(U.mei, S.ali, 'Can you check the banner?', id(701))
check(m2.project, { id: id(701), track: 'TSK-CAR-2610-004', title: 'Price banner' }, 'a task attached: its Track ID and title')
const wave = await send(U.mei, S.ali, '👋')
ali = await list(U.ali)
check(ali.dms.map(d => [d.first, d.last?.body ?? null, d.unread]), [['Mei', '👋', true], ['SIA', null, false], ['Siti', null, false]],
  'each teammate with a login, by name: their last message with me, unread when it is theirs')
const mei = await list(U.mei)
check(mei.dms.find(d => d.staff === S.ali).unread, false, 'one’s own message is never unread')
check((await thread(U.ali, S.mei)).messages.map(m => [m.from, m.body, m.project?.track ?? null]),
  [[S.mei, 'Can you check the banner?', 'TSK-CAR-2610-004'], [S.mei, '👋', null]], 'Ali reads his messages with Mei')
check((await thread(U.mei, S.ali)).messages.length, 2, '…and so does Mei')
check((await thread(U.josiah, S.mei, null, MANAGER)).messages, [], 'a manager — even with every Marketing cell — reads only their own with Mei, never Mei’s with Ali')
check((await list(U.josiah, MANAGER)).dms.every(d => d.last === null), true, 'nor sees their last messages')
await as(U.siti, VIEW)
await refuses(`SELECT public.mkt_chat_thread($1, NULL)`, [S.siti], /between two people/, 'never one’s own self')

// ── Read marks: forward only, never past the last ───────────────────────────────────────
await read(U.ali, S.mei, m2.id)
check((await list(U.ali)).dms[0].unread, true, 'read to the first: the wave still unread')
await read(U.ali, S.mei, 1e12)
check([(await list(U.ali)).dms[0].unread, await peek1(`SELECT last FROM public.mkt_chat_reads WHERE staff = $1 AND thread LIKE 'dm:%'`, [S.ali])],
  [false, wave.id], 'read to the end — never past its last message')
await read(U.ali, S.mei, 1)
check(await peek1(`SELECT last FROM public.mkt_chat_reads WHERE staff = $1 AND thread LIKE 'dm:%'`, [S.ali]), wave.id, 'never back')
await read(U.lee, 'lobby', m1.id)
check(await peek1(`SELECT count(*)::int FROM public.mkt_chat_reads WHERE staff = $1`, [S.lee]), 0, 'off the roster: no mark')

// ── A thread, fifty at a time ────────────────────────────────────────────────────────────
await asSystem()
await q(`INSERT INTO public.mkt_chat (thread, sender, body) SELECT 'lobby', $1, 'note ' || g FROM generate_series(1, 60) g`, [S.siti])
let page = await thread(U.lee, 'lobby')
check([page.messages.length, page.messages[0].body, page.messages.at(-1).body, page.more], [50, 'note 11', 'note 60', true], 'the newest fifty, oldest first; more before them')
page = await thread(U.lee, 'lobby', page.messages[0].id)
check([page.messages.length, page.messages[0].body, page.messages.at(-1).body, page.more], [11, m1.body, 'note 10', false], 'and the rest')
check((await list(U.ali)).lobby.unread, true, 'Siti’s notes: unread to Ali')

console.log(`marketing chat: ${checks} checks passed`)
