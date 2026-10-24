// Local PostgreSQL regression for 20261025101000 (2026-10-24 — Marketing ②b-2c: subtasks — ✂️ Split into subtasks, a
// delivery, Review delivery, a subtask taken back; a stage submitted only once its subtasks are approved). Marketing's
// migrations up to the chat review run; then this one, twice. What is under test: who may call what; who splits (the
// current stage's owner, accepted, on a stage that may split), to whom (somebody else on the roster with a login) and by
// when (today to the stage's deadline); who delivers (the assignee: links and/or a note, v1, v2 …); who reviews (the
// stage's owner: approve, or return with a reason — the managers told from the third return); taking one back; the stage
// held until every subtask is approved; the trail and who is told at each step; the task page's delivery. No live I/O.
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
  CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role text);
  CREATE TABLE public.permission_template_grants(template_id uuid NOT NULL, function_key text NOT NULL, action text NOT NULL);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true, template_id uuid);
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
  '20261025037000_marketing_pet_levels.sql', '20261025038000_marketing_lobby_visit.sql', '20261025039000_marketing_chat.sql',
  '20261025039500_marketing_chat_review.sql']
for (const m of MIGS) await db.exec(await sql(m))

const mig = await sql('20261025101000_marketing_subtasks.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_subtask_add(uuid, text, uuid, date)', 'mkt_subtask_deliver(uuid, text, jsonb, jsonb)', 'mkt_subtask_review(uuid, boolean, text)',
  'mkt_subtask_remove(uuid)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_subtasks', 'SELECT') OR has_table_privilege('authenticated', 'public.mkt_subtasks', 'UPDATE')`),
  false, 'a subtask moves only through the functions')
check(await peek1(`SELECT string_agg(cmd || ':' || with_check, ' | ') FROM pg_policies WHERE tablename = 'file_objects' AND policyname = 'mkt_subtask_upload'`),
  `INSERT:((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'subtask'::text) AND ( SELECT has_any_action(ARRAY['marketing.edit'::text]) AS has_any_action))`,
  'a delivery’s files: sent under subtask/ by Marketing · Edit')

// ── A task whose first stage is Mei's ─────────────────────────────────────────────────
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await as(U.josiah, MANAGER)
const made = await one(`SELECT public.mkt_task_create($1, 'quick', 'Red Truck Reels', 'social', 'Two reels for the truck event', $2::jsonb, NULL)`,
  [CAR, JSON.stringify([{ name: 'Edit', dept: 'social', who: S.mei, sla: 3 }, { name: 'Final', dept: 'social', who: S.josiah, sla: 1, appr: [S.josiah] }])])
const TASK = made.id
const today = await peek1(`SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text`)
const edit = (await peek(`SELECT due_on::text AS due, status FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [TASK]))[0]
const dayAfter = d => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
const monDay = d => { const x = new Date(d + 'T00:00:00Z'); return `${x.getUTCDate()} ${x.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}` }

const add = (user, title, who, due, actions = STAFF) => as(user, actions).then(() => one(`SELECT public.mkt_subtask_add($1, $2, $3, $4::date)`, [TASK, title, who, due]))
const addRefused = async (title, who, due, pattern, what, user = U.mei, actions = STAFF) => {
  await as(user, actions)
  await refuses(`SELECT public.mkt_subtask_add($1, $2, $3, $4::date)`, [TASK, title, who, due], pattern, what)
}
const notices = async user => (await peek(`SELECT title, body, data ->> 'type' AS type FROM public.app_notifications WHERE user_id = $1 AND data ->> 'type' = 'subtask' ORDER BY created_at, title`, [user]))
const trail = async () => (await peek(`SELECT action, stage_idx, from_to, reason, version, data FROM public.mkt_events WHERE project_id = $1 AND action IN ('subtask', 'delivered', 'delivery returned', 'delivery approved', 'subtask removed') ORDER BY id`, [TASK]))
const sub = async sid => (await peek(`SELECT status, returns, delivery, title, assignee, due_on::text AS due FROM public.mkt_subtasks WHERE id = $1`, [sid]))[0]

// ── ✂️ Split into subtasks: the current stage's owner, accepted, on a stage that may split ─────────────────
await addRefused('Subtitles', S.siti, edit.due, /Accept the stage first/, 'not before the stage is accepted')
await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [TASK])
await addRefused('Subtitles', S.siti, edit.due, /This stage is not yours/, 'only its owner splits it', U.ali)
await addRefused('Subtitles', S.siti, edit.due, /Edit does not split into subtasks/, 'only a stage that may split (a quick task’s stages do not)')
await asSystem()
await q(`UPDATE public.mkt_stages SET split = true WHERE project_id = $1 AND idx = 0`, [TASK])
await addRefused('Subtitles', S.siti, edit.due, /Working on a stage is not open/, 'Marketing · Edit to split', U.mei, VIEW)
await addRefused('   ', S.siti, edit.due, /Name the deliverable/, 'a deliverable named')
await addRefused('x'.repeat(121), S.siti, edit.due, /120 characters at most/, '120 characters at most')
for (const [who, what] of [[S.mei, 'oneself'], [S.kai, 'somebody without a login'], [S.lee, 'somebody off the roster'], [null, 'nobody']]) {
  await addRefused('Subtitles', who, edit.due, /A subtask goes to somebody else on Marketing's roster/, `never to ${what}`)
}
await addRefused('Subtitles', S.siti, dayBefore(today), /Give it a deadline — today or later/, 'not in the past')
await addRefused('Subtitles', S.siti, null, /Give it a deadline/, 'a deadline, always')
await addRefused('Subtitles', S.siti, dayAfter(edit.due), new RegExp(`Must be on or before ${monDay(edit.due)} — the Edit stage deadline`),
  'on or before the stage’s own deadline — the handoff’s words')

const s1 = await add(U.mei, '  Subtitles   BM + EN ', S.siti, edit.due)
check([s1.id, s1.track], [TASK, made.track], 'split: the task back, as every stage write answers')
check(await sub(s1.subtask), { status: 'working', returns: 0, delivery: {}, title: 'Subtitles BM + EN', assignee: S.siti, due: edit.due }, 'one line, tidied; Siti working on it')
check((await trail()).map(e => [e.action, e.stage_idx, e.from_to, e.data.title]), [['subtask', 0, 'Siti', 'Subtitles BM + EN']], 'the trail: a subtask to Siti')
check(await notices(U.siti), [{ title: 'Mei gave you a subtask: Subtitles BM + EN', body: `${made.track} · Red Truck Reels · due ${monDay(edit.due)}`, type: 'subtask' }],
  'Siti is told, with its deadline')

// ── The stage waits for its subtasks ─────────────────────────────────────────────────────
await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [TASK, JSON.stringify({ notes: 'Cut both reels' })])
await refuses(`SELECT public.mkt_stage_submit($1)`, [TASK], /Its subtasks are not all approved yet/, 'not submitted while a subtask is out')

// ── A delivery: the assignee's files, links and/or a note ──────────────────────────────────────
const deliver = (user, sid, note, links, files = []) => as(user, STAFF).then(() =>
  one(`SELECT public.mkt_subtask_deliver($1, $2, $3::jsonb, $4::jsonb)`, [sid, note, JSON.stringify(links), JSON.stringify(files)]))
const deliverRefused = async (user, sid, note, links, pattern, what, actions = STAFF, files = []) => {
  await as(user, actions)
  await refuses(`SELECT public.mkt_subtask_deliver($1, $2, $3::jsonb, $4::jsonb)`, [sid, note, JSON.stringify(links), JSON.stringify(files)], pattern, what)
}
const key = (n, name) => `subtask/${id(5000 + n)}/${name}`
const put = (name, size = 2048, type = 'application/x-subrip') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])
const rowsOf = name => peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [name])
const takeBack = name => q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [name]).then(r => r.length)
const LINK = { url: 'https://drive.google.com/file/d/subs', label: 'subtitles_BM_EN.srt' }
const SRT = key(1, 'subtitles_BM_EN.srt'), SRT2 = key(2, 'subtitles_BM_EN_v2.srt'), STRAY = key(3, 'old.srt')
const ALIS = key(4, 'thumb.png'), MINE_LIB = `library/${id(5005)}/subs.srt`, NEVER = key(6, 'never.srt')

await as(U.siti, VIEW)
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, '{"size":1,"mimetype":"text/plain"}')`, [key(9, 'x.srt')],
  /row-level security/, 'Marketing · View sends nothing under subtask/')
await as(U.siti, STAFF)
for (const k of [SRT, SRT2, STRAY, MINE_LIB]) await put(k)
for (let i = 0; i < 11; i++) await put(key(100 + i, `part${i}.srt`))
await as(U.ali, STAFF)
await put(ALIS, 4096, 'image/png')

await deliverRefused(U.ali, s1.subtask, 'here', [LINK], /This subtask is not yours/, 'only its assignee delivers')
await deliverRefused(U.siti, s1.subtask, 'here', [LINK], /Working on a subtask is not open/, 'Marketing · Edit to deliver', VIEW)
await deliverRefused(U.siti, s1.subtask, '  ', [], /Add a file or a link to what you made, or a note/, 'something delivered')
await deliverRefused(U.siti, s1.subtask, null, [{ url: 'ftp://files/x' }], /A link starts with https:\/\//, 'links are web links')
await deliverRefused(U.siti, s1.subtask, null, Array.from({ length: 11 }, (_, i) => ({ url: `https://x.my/${i}` })), /Ten links at most/, 'ten links at most')
await deliverRefused(U.siti, id(999), 'here', [LINK], /That subtask is not there/, 'a subtask that is there')
for (const [path, what] of [[ALIS, 'another person’s upload'], [MINE_LIB, 'one’s own file outside subtask/'], [NEVER, 'a file never sent']]) {
  await deliverRefused(U.siti, s1.subtask, null, [], /That file has not arrived — upload it again/, `never ${what}`, STAFF, [{ path, name: 'x' }])
}
await deliverRefused(U.siti, s1.subtask, null, [], /Ten files at most/, 'ten files at most', STAFF,
  Array.from({ length: 11 }, (_, i) => ({ path: key(100 + i, `part${i}.srt`), name: `part${i}.srt` })))
await deliver(U.siti, s1.subtask, '  BM and EN in one file ', [LINK, { url: '  ' }], [{ path: SRT, name: '  subtitles_BM_EN.srt ' }, { path: SRT, name: 'again' }, { path: ' ' }])
let row = await sub(s1.subtask)
const SRT_FILE = { path: SRT, name: 'subtitles_BM_EN.srt', size: 2048, mime: 'application/x-subrip' }
check([row.status, row.delivery.v, row.delivery.files, row.delivery.links, row.delivery.note], ['ready', 1, [SRT_FILE], [LINK], 'BM and EN in one file'],
  'delivered: v1 — its file (once, its size and type the bucket’s), its links (blank ones dropped) and note')
check((await trail()).at(-1), { action: 'delivered', stage_idx: 0, from_to: 'Mei', reason: null, version: 'v1',
  data: { subtask: s1.subtask, title: 'Subtitles BM + EN', links: [LINK], files: ['subtitles_BM_EN.srt'] } }, 'the trail: delivered to Mei, v1, what it holds')
check((await notices(U.mei)).map(n => n.title), ['Siti delivered Subtitles BM + EN'], 'Mei is told')
await deliverRefused(U.siti, s1.subtask, 'again', [LINK], /Delivered already — waiting for Mei to review it/, 'once, until it is reviewed')
await as(U.siti, STAFF)
check(await takeBack(SRT), 0, 'a file delivered is filed — its sender cannot take it back from under the review')
check(await takeBack(STRAY), 1, 'one never delivered is its sender’s to take back')
await as(U.mei, VIEW)
check(await one(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [SRT]), 1, 'the reviewer reads it (Marketing · View)')
const page = await one(`SELECT public.mkt_project($1)`, [made.track])
check(page.subtasks.map(t => [t.title, t.status, t.delivery?.v, t.delivery?.files, t.delivery?.links]), [['Subtitles BM + EN', 'ready', 1, [SRT_FILE], [LINK]]],
  'the task page reads the delivery')

// ── Review delivery: the stage's owner — return with a reason, approve ──────────────────────────
const review = (user, sid, approve, reason, actions = STAFF) => as(user, actions).then(() => one(`SELECT public.mkt_subtask_review($1, $2, $3)`, [sid, approve, reason]))
const reviewRefused = async (user, sid, approve, reason, pattern, what) => {
  await as(user, STAFF)
  await refuses(`SELECT public.mkt_subtask_review($1, $2, $3)`, [sid, approve, reason], pattern, what)
}
await reviewRefused(U.siti, s1.subtask, true, null, /Only Edit's owner reviews its subtasks/, 'only the stage’s owner reviews')
await reviewRefused(U.mei, s1.subtask, false, '  ', /Say what needs to change/, 'a reason to return it')
await review(U.mei, s1.subtask, false, ' Fix the timing at 0:42 ')
row = await sub(s1.subtask)
check([row.status, row.returns], ['revising', 1], 'returned once: Siti revises')
check((await trail()).at(-1), { action: 'delivery returned', stage_idx: 0, from_to: 'Siti', reason: 'Fix the timing at 0:42', version: 'v1',
  data: { subtask: s1.subtask, title: 'Subtitles BM + EN', returns: 1 } }, 'the trail: returned, why, which version')
check((await notices(U.siti)).at(-1), { title: 'Mei returned your delivery: Subtitles BM + EN', body: 'Fix the timing at 0:42', type: 'subtask' }, 'Siti is told why')
await reviewRefused(U.mei, s1.subtask, true, null, /Nothing delivered to review/, 'nothing to review while it is being revised')
await deliver(U.siti, s1.subtask, null, [], [{ path: SRT2, name: 'subtitles_BM_EN_v2.srt' }])
row = await sub(s1.subtask)
check([row.delivery.v, row.delivery.files.map(f => f.path), row.delivery.links, row.delivery.note], [2, [SRT2], [], null], 'delivered again: v2, whole — nothing kept from v1')
check([await rowsOf(SRT), await rowsOf(SRT2)], [0, 1], 'v1’s file not sent again: its bytes’ row goes')
await review(U.mei, s1.subtask, false, 'Still off at 0:42')
check((await notices(U.josiah)).length, 0, 'twice returned: the manager not told yet')
await deliver(U.siti, s1.subtask, 'Same file, the timing fixed in the link', [LINK], [{ path: SRT2, name: 'subtitles_BM_EN_v2.srt' }])
check([(await sub(s1.subtask)).delivery.files.map(f => f.path), await rowsOf(SRT2)], [[SRT2], 1], 'v3 sends v2’s file again: kept')
await review(U.mei, s1.subtask, false, 'Use the new font')
check((await sub(s1.subtask)).returns, 3, 'three times returned')
check(await notices(U.josiah), [{ title: "Siti's delivery has been returned 3 times", body: `Subtitles BM + EN · ${made.track} · Red Truck Reels`, type: 'subtask' }],
  'the third return: Marketing’s manager is told (the handoff’s “Rachel has been notified”)')
await deliver(U.siti, s1.subtask, null, [LINK], [{ path: SRT2, name: 'subtitles_BM_EN_v2.srt' }])
await review(U.mei, s1.subtask, true, null)
check((await sub(s1.subtask)).status, 'approved', 'approved')
await as(U.siti, STAFF)
check([await takeBack(SRT2), await rowsOf(SRT2)], [0, 1], 'the approved file stays filed')
check((await trail()).at(-1), { action: 'delivery approved', stage_idx: 0, from_to: 'Siti', reason: null, version: 'v4', data: { subtask: s1.subtask, title: 'Subtitles BM + EN' } },
  'the trail: approved, v4')
check((await notices(U.siti)).at(-1).title, 'Mei approved your delivery: Subtitles BM + EN', 'Siti is told')
await deliverRefused(U.siti, s1.subtask, 'more', [LINK], /Approved already/, 'an approved delivery stays')

// ── A subtask taken back ─────────────────────────────────────────────────────────────────
const s2 = await add(U.mei, 'Thumbnail', S.ali, edit.due)
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_subtask_remove($1)`, [s2.subtask], /Only Edit's owner takes a subtask back/, 'only the stage’s owner takes one back')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_subtask_remove($1)`, [s1.subtask], /Approved already — it stays/, 'never one approved')
await refuses(`SELECT public.mkt_stage_submit($1)`, [TASK], /Its subtasks are not all approved yet/, 'the thumbnail still out')
await deliver(U.ali, s2.subtask, null, [], [{ path: ALIS, name: 'thumb.png' }])
await as(U.mei, STAFF)
await one(`SELECT public.mkt_subtask_remove($1)`, [s2.subtask])
check(await peek1(`SELECT count(*)::int FROM public.mkt_subtasks WHERE id = $1`, [s2.subtask]), 0, 'taken back: gone')
check(await rowsOf(ALIS), 0, 'its delivered file’s bytes’ row with it')
check((await trail()).at(-1), { action: 'subtask removed', stage_idx: 0, from_to: 'Ali', reason: null, version: null, data: { subtask: s2.subtask, title: 'Thumbnail' } },
  'the trail keeps it')
check((await notices(U.ali)).map(n => n.title), ['Mei gave you a subtask: Thumbnail', 'Mei took back a subtask: Thumbnail'], 'Ali is told both')

// ── Every subtask approved: the stage goes on ────────────────────────────────────────────────
await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_submit($1)`, [TASK])
check(await peek1(`SELECT cur FROM public.mkt_projects WHERE id = $1`, [TASK]), 1, 'submitted: the stage done, Final next')
await addRefused('More', S.siti, edit.due, /This stage is not yours/, 'the next stage is not Mei’s to split')

// ── A task closed: nothing moves ─────────────────────────────────────────────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET cur = 0 WHERE id = $1`, [TASK])
await q(`UPDATE public.mkt_stages SET status = 'accepted' WHERE project_id = $1 AND idx = 0`, [TASK])
const s3 = await add(U.mei, 'Teaser cut', S.siti, edit.due)
await deliverRefused(U.siti, s3.subtask, null, [], /That file is another subtask's/, 'never a file another subtask delivered', STAFF, [{ path: SRT2 }])
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'cancelled' WHERE id = $1`, [TASK])
await deliverRefused(U.siti, s3.subtask, 'done', [LINK], /That task is not open \(cancelled\)/, 'a cancelled task takes no delivery')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_subtask_remove($1)`, [s3.subtask], /That task is not open/, 'nor anything else')

console.log(`marketing subtasks: ${checks} checks passed`)
