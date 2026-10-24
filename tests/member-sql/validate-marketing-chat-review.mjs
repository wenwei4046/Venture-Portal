// Local PostgreSQL regression for 20261025039500 (2026-10-24 — Marketing ⑦-3b: a direct message opened on a complaint;
// the user's answer 35, amended: only a personal account holding the full-access template opens one, a reason typed
// first, the record naming that person — never the shared Principal login). Marketing's migrations up to the chat run;
// then this one, twice. What is under test: who may call what (and that nothing changes or deletes a record); who may
// open a chat — a full-access title's own login, managing permissions now — and who may not (the shared Principal login,
// a manager, HR raised on Manage permissions, somebody lowered on it, an inactive login, a person who has left); the
// reason (10 to 500 characters, one line); the record — who, which two, why, when, the names as they were; the messages,
// fifty at a time, older ones only under one's own record within the hour; that it moves no read mark and tells nobody;
// the page's people and records; the chat list's 'reviewer'. No live I/O.
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
// Ultimate full access: every cell — Manage permissions among them.
const FULL = [...MANAGER, 'accounts.view', 'accounts.create', 'accounts.manage']
const LOWERED = FULL.filter(a => a !== 'accounts.manage')
const U = {
  josiah: id(1), mei: id(2), ali: id(3), lee: id(4), siti: id(5),
  ceo: id(6), kaiyee: id(7), principal: id(8), hr: id(9), ops: id(10), off: id(21), left: id(22),
}
const S = {
  josiah: id(11), mei: id(12), ali: id(13), lee: id(14), siti: id(15), kai: id(16),
  ceo: id(17), kaiyee: id(18), hr: id(19), ops: id(20), off: id(23), left: id(24),
}
const T = { ultimate: id(401), hr: id(402), opsFull: id(403), mkt: id(404) }

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

  INSERT INTO public.users (id, name, email, is_active) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my', true), ('${U.mei}', 'Mei', 'mei@x.my', true), ('${U.ali}', 'Ali', 'ali@x.my', true),
    ('${U.lee}', 'Lee', 'lee@x.my', true), ('${U.siti}', 'Siti', 'siti@x.my', true),
    ('${U.ceo}', 'Loo Wen Wei', 'ceo@x.my', true), ('${U.kaiyee}', 'Loke Kai Yee', 'ea@x.my', true),
    ('${U.principal}', 'Principal', 'principal@venture.my', true), ('${U.hr}', 'Hana', 'hr@x.my', true),
    ('${U.ops}', 'Omar', 'ops@x.my', true), ('${U.off}', 'Off', 'off@x.my', false), ('${U.left}', 'Left', 'left@x.my', true);
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance'),
    ('${id(203)}', 'Executive office', NULL), ('${id(204)}', 'HR', 'hr');
  INSERT INTO public.permission_templates (id, name, base_role) VALUES
    ('${T.ultimate}', 'Ultimate full access', 'principal'), ('${T.hr}', 'HR · Payroll', 'hr'),
    ('${T.opsFull}', 'Operations · full', 'staff'), ('${T.mkt}', 'Marketing · Manager', 'staff');
  INSERT INTO public.permission_template_grants (template_id, function_key, action) VALUES
    ('${T.ultimate}', 'accounts', 'manage'), ('${T.ultimate}', 'marketing', 'view'),
    ('${T.opsFull}', 'accounts', 'manage'), ('${T.hr}', 'team', 'edit'), ('${T.mkt}', 'marketing', 'manage');
  INSERT INTO public.titles (id, name, template_id) VALUES
    ('${id(301)}', 'MARKETING MANAGER', '${T.mkt}'), ('${id(302)}', 'VIDEOGRAPHER', NULL), ('${id(303)}', 'GRAPHIC DESIGNER', NULL),
    ('${id(304)}', 'ACCOUNTANT', NULL), ('${id(305)}', 'CHIEF EXECUTIVE OFFICER', '${T.ultimate}'),
    ('${id(306)}', 'Executive Assistant', '${T.ultimate}'), ('${id(307)}', 'HR MANAGER', '${T.hr}'),
    ('${id(308)}', 'OPERATIONS HEAD', '${T.opsFull}'), ('${id(309)}', 'DIRECTOR', '${T.ultimate}');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', '${U.lee}', '${id(304)}', '${id(202)}', 'active'),
    ('${S.siti}', 'SITI AMINAH', 'Siti', '${U.siti}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.kai}', 'KAI MING', 'Kai', NULL, '${id(302)}', '${id(201)}', 'active'),
    ('${S.ceo}', 'LOO WEN WEI', NULL, '${U.ceo}', '${id(305)}', '${id(203)}', 'active'),
    ('${S.kaiyee}', 'LOKE KAI YEE', 'Kai Yee', '${U.kaiyee}', '${id(306)}', '${id(203)}', 'active'),
    ('${S.hr}', 'HANA ISMAIL', 'Hana', '${U.hr}', '${id(307)}', '${id(204)}', 'active'),
    ('${S.ops}', 'OMAR FAIZ', 'Omar', '${U.ops}', '${id(308)}', '${id(203)}', 'active'),
    ('${S.off}', 'OFF LOGIN', NULL, '${U.off}', '${id(309)}', '${id(203)}', 'active'),
    ('${S.left}', 'LEFT ALREADY', NULL, '${U.left}', '${id(309)}', '${id(203)}', 'resigned');
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
  '20261025037000_marketing_pet_levels.sql', '20261025038000_marketing_lobby_visit.sql', '20261025039000_marketing_chat.sql']
for (const m of MIGS) await db.exec(await sql(m))

const mig = await sql('20261025039500_marketing_chat_review.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_chat_review_open(uuid, uuid, text)', 'mkt_chat_review_more(bigint, bigint)', 'mkt_chat_review_log()', 'mkt_chat_list()']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
for (const fn of ['mkt_chat_reviewer()', 'mkt_chat_review_page(text, bigint)']) {
  check(await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: the functions’ own`)
}
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_chat_reviews', 'SELECT') OR has_table_privilege('authenticated', 'public.mkt_chat_reviews', 'UPDATE')
  OR has_table_privilege('authenticated', 'public.mkt_chat_reviews', 'DELETE')`), false, 'a record is read only through the functions')
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE proname ~ '^mkt_chat_review_(edit|delete|remove|update|undo)'`), 0, 'no function changes or deletes a record')
check(await peek1(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_chat_reviews'`), 'none', 'registered: it is itself the log')
check(await peek1(`SELECT count(*)::int FROM public.permission_page_tabs WHERE page = '/marketing/chat-review' AND tab_id = 'mkt.overview'`), 1,
  'the page in the database’s copy of the tab registry: My Space’s tab')

const list = async (user, actions = VIEW) => { await as(user, actions); return one(`SELECT public.mkt_chat_list()`) }
const log = async (user, actions = FULL) => { await as(user, actions); return one(`SELECT public.mkt_chat_review_log()`) }
const open = async (user, a, b, why, actions = FULL) => { await as(user, actions); return one(`SELECT public.mkt_chat_review_open($1, $2, $3)`, [a, b, why]) }
const more = async (user, review, before, actions = FULL) => { await as(user, actions); return one(`SELECT public.mkt_chat_review_more($1, $2)`, [review, before]) }
const send = async (user, w, text) => { await as(user, STAFF); return one(`SELECT public.mkt_chat_send($1, $2, NULL)`, [w, text]) }

// ── Who may open a chat (answer 35, amended) ─────────────────────────────────────────
const NOT_ONE = /Only a full-access title's own login opens a direct message on a complaint/
check((await list(U.ceo, FULL)).reviewer, true, 'the CEO’s own login (Ultimate full access): may — the chat tile’s 🔍 Review')
check((await list(U.ops, ['marketing.view', 'accounts.manage'])).reviewer, true, 'a template that ticks Manage permissions is full-access too')
for (const [user, actions, who] of [
  [U.principal, FULL, 'the shared Principal login — on nobody’s People record'],
  [U.josiah, MANAGER, 'Marketing’s manager'],
  [U.mei, STAFF, 'somebody on the roster'],
  [U.hr, ['marketing.view', 'accounts.manage'], 'HR raised on Manage permissions — their title is not full-access'],
  [U.kaiyee, LOWERED, 'a full-access title lowered on Manage permissions'],
  [U.off, FULL, 'a full-access title whose login is switched off'],
  [U.left, FULL, 'a full-access title who has left (their People record is not active)'],
]) {
  check((await list(user, actions)).reviewer, false, `${who}: no 🔍 Review`)
  await as(user, actions)
  await refuses(`SELECT public.mkt_chat_review_log()`, [], NOT_ONE, `${who}: the page is not theirs`)
  await refuses(`SELECT public.mkt_chat_review_open($1, $2, 'A complaint from Mei about Ali')`, [S.mei, S.ali], NOT_ONE, `${who}: opens nothing`)
}
await as(U.ceo, ['accounts.manage'])
await refuses(`SELECT public.mkt_chat_review_log()`, [], /Marketing is not open to your account/, 'and Marketing · View first')

// ── The chat to open ───────────────────────────────────────────────────────────────
await asSystem()
await q(`INSERT INTO public.mkt_chat (thread, sender, body)
         SELECT 'dm:' || least($1::text, $2::text) || ':' || greatest($1::text, $2::text), CASE WHEN g % 2 = 0 THEN $1::text::uuid ELSE $2::text::uuid END, 'line ' || g
           FROM generate_series(1, 55) g`, [S.mei, S.ali])
const last = await send(U.ali, S.mei, 'Please stop messaging me after work')
await send(U.mei, 'lobby', 'Morning all')
await send(U.siti, S.josiah, 'Shoot moved to Friday')
const marks = await peek1(`SELECT count(*)::int FROM public.mkt_chat_reads`)
const notes = await peek1(`SELECT count(*)::int FROM public.app_notifications`)

let page = await log(U.ceo)
check(page.people.map(p => p.first), ['Ali', 'Mei', 'SIA', 'Siti'], 'the people: the roster’s with a login, by first name (not Kai — no login; not Lee — off the roster)')
check(page.people.find(p => p.first === 'Mei'), { staff: S.mei, name: 'MEI LING TAN', first: 'Mei', title: 'VIDEOGRAPHER' }, 'each with their name and title')
check(page.reviews, [], 'no records yet')

// ── The reason first ───────────────────────────────────────────────────────────────
await as(U.ceo, FULL)
for (const [a, b, what] of [[S.mei, S.mei, 'one person twice'], [S.mei, id(999), 'nobody'], [null, S.ali, 'one missing']]) {
  await refuses(`SELECT public.mkt_chat_review_open($1, $2, 'A complaint from Mei about Ali')`, [a, b], /Pick the two people whose chat it is/, `never ${what}`)
}
await refuses(`SELECT public.mkt_chat_review_open($1, $2, 'A complaint about my chat')`, [S.ceo, S.mei], /Your own chats are on your My Space/, 'never one’s own')
await refuses(`SELECT public.mkt_chat_review_open($1, $2, $3)`, [S.mei, S.ali, '  Complaint '], /10 characters at least/, 'a reason of 10 characters at least')
await refuses(`SELECT public.mkt_chat_review_open($1, $2, NULL)`, [S.mei, S.ali], /10 characters at least/, 'a reason, always')
await refuses(`SELECT public.mkt_chat_review_open($1, $2, $3)`, [S.mei, S.ali, 'x'.repeat(501)], /at most 500 characters/, '500 at most')
check(await peek1(`SELECT count(*)::int FROM public.mkt_chat_reviews`), 0, 'refused: no record')

// ── Opened: the record, then the newest fifty ─────────────────────────────────────────────
const r1 = await open(U.ceo, S.mei, S.ali, '  Ali’s complaint,\n 24 Oct:   messages after work  ')
const [lo, hi] = [S.mei, S.ali].sort()
const NAME = { [S.mei]: 'MEI LING TAN', [S.ali]: 'ALI HASSAN' }
check([r1.review.by, r1.review.reason, r1.review.a, r1.review.b],
  ['LOO WEN WEI', 'Ali’s complaint, 24 Oct: messages after work', { staff: lo, name: NAME[lo] }, { staff: hi, name: NAME[hi] }],
  'the record: who opened it (their People name), why — one line, tidied — and which two')
const row = (await peek(`SELECT by_staff, by_user, thread FROM public.mkt_chat_reviews WHERE id = $1`, [r1.review.id]))[0]
check([row.by_staff, row.by_user, row.thread], [S.ceo, U.ceo, `dm:${lo}:${hi}`], 'kept with their People record, their login and the chat’s own key')
check([r1.messages.length, r1.messages[0].body, r1.messages.at(-1).body, r1.messages.at(-1).id, r1.more], [50, 'line 7', 'Please stop messaging me after work', last.id, true],
  'the newest fifty of the two’s messages, oldest first — more before them')
check(r1.messages.every(m => [S.mei, S.ali].includes(m.from)), true, 'their messages alone — not the lobby, not anybody else’s')
check((await open(U.ceo, S.ali, S.mei, 'The same complaint, again')).review.a.staff, lo, 'either order: the same chat')

// ── Nothing else moves ───────────────────────────────────────────────────────────────
check([await peek1(`SELECT count(*)::int FROM public.mkt_chat_reads`), await peek1(`SELECT count(*)::int FROM public.app_notifications`)], [marks, notes],
  'no read mark moves and nobody is told (answer 39)')
check((await list(U.mei, STAFF)).dms.find(d => d.staff === S.ali).unread, true, 'Ali’s message is still unread to Mei')
await as(U.ceo, FULL)
await refuses(`SELECT public.mkt_chat_thread($1, NULL)`, [S.mei], /between two people on Marketing's roster/, 'the chat itself stays closed to them — a record is the only way in')

// ── Older ones, under one's own record within the hour ─────────────────────────────────────
const older = await more(U.ceo, r1.review.id, r1.messages[0].id)
check([older.messages.length, older.messages[0].body, older.messages.at(-1).body, older.more], [6, 'line 1', 'line 6', false], 'and the rest')
await as(U.kaiyee, FULL)
await refuses(`SELECT public.mkt_chat_review_more($1, NULL)`, [r1.review.id], /Open the chat again, with its reason/, 'never under somebody else’s record — another full-access login gives a reason of their own')
await as(U.principal, FULL)
await refuses(`SELECT public.mkt_chat_review_more($1, NULL)`, [r1.review.id], NOT_ONE, 'nor the shared Principal login')
await asSystem()
await q(`UPDATE public.mkt_chat_reviews SET at = now() - interval '61 minutes' WHERE id = $1`, [r1.review.id])
await as(U.ceo, FULL)
await refuses(`SELECT public.mkt_chat_review_more($1, NULL)`, [r1.review.id], /one stays open for an hour/, 'an hour on: open it again, with its reason')

// ── The records ──────────────────────────────────────────────────────────────────────
const r3 = await open(U.kaiyee, S.siti, S.josiah, 'Siti asked HR to look at her chat with Josiah')
check(r3.messages.map(m => m.body), ['Shoot moved to Friday'], 'another full-access login opens another chat')
await asSystem()
await q(`UPDATE public.hr_staff_costs SET employee_name = 'MEI LING TAN (MRS)' WHERE id = $1`, [S.mei])
await q(`UPDATE public.hr_staff_costs SET department_id = $1 WHERE id = $2`, [id(202), S.ali])
page = await log(U.ceo)
check(page.reviews.map(r => [r.by, r.reason]), [
  ['LOKE KAI YEE', 'Siti asked HR to look at her chat with Josiah'],
  ['LOO WEN WEI', 'The same complaint, again'],
  ['LOO WEN WEI', 'Ali’s complaint, 24 Oct: messages after work'],
], 'every record, newest first — whoever opened it')
check([page.reviews.at(-1).a.name, page.reviews.at(-1).b.name], [NAME[lo], NAME[hi]], 'the names as they were (Mei’s has changed since)')
check(page.people.map(p => p.first), ['Ali', 'Mei', 'SIA', 'Siti'], 'Ali has left the roster — still to pick: he is in a direct chat')
check((await log(U.kaiyee)).reviews.length, 3, 'every full-access login reads every record')

// ── Somebody on the roster with a full-access title: never their own chats ──────────────────────
await asSystem()
await q(`UPDATE public.titles SET template_id = $1 WHERE id = $2`, [T.ultimate, id(301)])
check((await log(U.josiah)).people.map(p => p.first), ['Ali', 'Mei', 'Siti'], 'Josiah made full-access: everybody but himself to pick')
await as(U.josiah, FULL)
await refuses(`SELECT public.mkt_chat_review_open($1, $2, 'Siti asked to look at it')`, [S.siti, S.josiah], /Your own chats are on your My Space/,
  'and his own chat is not opened this way')

console.log(`marketing chat review: ${checks} checks passed`)
