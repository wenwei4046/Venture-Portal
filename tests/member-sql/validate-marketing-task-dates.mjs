// Local PostgreSQL regression for 20261025151000 (2026-10-24 — Marketing ⑧-1: a task's dates on the calendar and its
// posts; the user's answers 15 and 16, the handoff's "Dates sync from task fields marked Show on calendar"). Marketing's
// migrations up to campaigns run; then this one, twice. What is under test: who may call what; the board's dates — each
// Date field marked for the calendar once filled, its kind, the PIC's or not — never a date not marked, an emptied one
// gone; a post marked posted only once its task is done, by its owner (the task's, the stage's) or the manager, with an
// https link, never a shoot day or a date off the calendar; the board and the task page reading the mark; the trail; the
// mark taken back; a done task off the board after 60 days but on it for the range its dates are in. No live I/O.
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
  '20261025039500_marketing_chat_review.sql', '20261025101000_marketing_subtasks.sql', '20261025113000_marketing_stage_files.sql']
for (const m of MIGS) await db.exec(await sql(m))


await db.exec(await sql('20261025121000_marketing_billing.sql'))
await db.exec(await sql('20261025131000_marketing_product_runs.sql'))
await db.exec(await sql('20261025141000_marketing_campaigns.sql'))
const mig = await sql('20261025151000_marketing_task_dates.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
for (const fn of ['mkt_post_mark(uuid, integer, text, text)', 'mkt_post_unmark(uuid, integer, text)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)

// ── A workflow whose stage keeps four dates — three marked for the calendar ───────────────────────────────
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Schedule', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [], form: [
    { label: 'Post day', type: 'Date', cal: { kind: 'post', pic: true } },
    { label: 'Shoot day', type: 'Date', cal: { kind: 'shoot', pic: false } },
    { label: 'Ads go-live', type: 'Date', cal: { kind: 'ads_live', pic: false } },
    { label: 'Draft due', type: 'Date' },
  ] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: minutes.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Social', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, saved.rev])
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2 WHERE id = $1`, [P, P.replace(/-/g, '')])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
const D = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [P])
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, JSON.stringify({ start: TODAY, stages: [{ owner: S.ali, appr: [], sla: 2 }] })])
const POST = await plus(10), SHOOT = await plus(4), LIVE = await plus(12)
await asSystem()
await q(`UPDATE public.mkt_stages SET work = $2::jsonb WHERE project_id = $1 AND idx = 0`,
  [D, JSON.stringify({ vals: { 'Post day': POST, 'Shoot day': SHOOT, 'Ads go-live': LIVE, 'Draft due': await plus(2) } })])

// ── The board: each marked date once filled — its kind, the PIC's or not, a post's mark ──────────────────────
await as(U.mei, STAFF)
const dates = async () => (await one(`SELECT public.mkt_board()`)).dates.filter(d => d.project === D)
check((await dates()).map(d => [d.field, d.kind, d.day, d.pic, d.posted ?? null, d.stage]), [
  ['Shoot day', 'shoot', SHOOT, false, null, 0], ['Post day', 'post', POST, true, null, 0], ['Ads go-live', 'ads_live', LIVE, false, null, 0],
], 'the three dates marked for the calendar, by day — never one it is not marked for')
await asSystem()
await q(`UPDATE public.mkt_stages SET work = work #- '{vals,Shoot day}' WHERE project_id = $1 AND idx = 0`, [D])
await as(U.mei, STAFF)
check((await dates()).map(d => d.field), ['Post day', 'Ads go-live'], 'a date emptied: off the board')

// ── A post marked posted: once done, by its owner, with its link ─────────────────────────────────────────────
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_post_mark($1, 0, 'Post day', 'https://instagram.com/p/abc')`, [D], /once its task is done/, 'not done yet: not posted')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE id = $1`, [D])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_post_mark($1, 0, 'Post day', 'https://instagram.com/p/abc')`, [D], /Only its owner/, 'somebody else on the team: refused')
await as(null, [], 'authenticated')
await refuses(`SELECT public.mkt_post_mark($1, 0, 'Post day', 'https://instagram.com/p/abc')`, [D], /Marketing/, 'nobody from Marketing: refused')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_post_mark($1, 0, 'Shoot day', 'https://instagram.com/p/abc')`, [D], /not a post day/, 'a shoot day is no post')
await refuses(`SELECT public.mkt_post_mark($1, 0, 'Draft due', 'https://instagram.com/p/abc')`, [D], /not a post day/, 'a date not on the calendar is no post')
await refuses(`SELECT public.mkt_post_mark($1, 1, 'Post day', 'https://instagram.com/p/abc')`, [D], /not a post day/, 'no such stage')
for (const bad of ['', 'instagram.com/p/abc', 'ftp://x.y/z', 'https://a b', `https://x.my/${'a'.repeat(500)}`]) {
  await refuses(`SELECT public.mkt_post_mark($1, 0, 'Post day', $2)`, [D, bad], /link/, `a link like "${bad.slice(0, 20)}" refused`)
}
const marked = await one(`SELECT public.mkt_post_mark($1, 0, 'Post day', ' https://instagram.com/p/abc ')`, [D])
check([Object.keys(marked), marked['0:Post day'].link, marked['0:Post day'].name, marked['0:Post day'].by], [['0:Post day'], 'https://instagram.com/p/abc', 'Ali', U.ali],
  'marked by the stage’s owner: when, by whom, the link')
await as(U.mei, STAFF)
check((await dates()).find(d => d.field === 'Post day').posted.link, 'https://instagram.com/p/abc', 'the board shows it posted')
check((await one(`SELECT public.mkt_project($1)`, [D])).project.posted['0:Post day'].name, 'Ali', 'the task page reads it')
check(await peek(`SELECT action, stage_idx AS stage, data FROM public.mkt_events WHERE project_id = $1 AND action IN ('posted', 'unposted') ORDER BY id`, [D]),
  [{ action: 'posted', stage: 0, data: { field: 'Post day', link: 'https://instagram.com/p/abc' } }], 'the trail keeps it')
await refuses(`SELECT public.mkt_post_unmark($1, 0, 'Post day')`, [D], /Only its owner/, 'somebody else takes back nothing')
await as(U.ali, STAFF)
check(await one(`SELECT public.mkt_post_unmark($1, 0, 'Post day')`, [D]), {}, 'its owner takes it back')
await refuses(`SELECT public.mkt_post_unmark($1, 0, 'Post day')`, [D], /not marked posted/, 'nothing to take back twice')
await as(U.josiah, MANAGER)
check(Object.keys(await one(`SELECT public.mkt_post_mark($1, 0, 'Post day', 'https://fb.com/1')`, [D])), ['0:Post day'], 'the manager marks it too')
check(await peek(`SELECT action FROM public.mkt_events WHERE project_id = $1 AND action IN ('posted', 'unposted') ORDER BY id`, [D]).then(r => r.map(x => x.action)),
  ['posted', 'unposted', 'posted'], 'each mark and its taking back on the trail')

// ── Off the board long after, on it for the range its dates are in ─────────────────────────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET updated_at = now() - interval '90 days' WHERE id IN ($1, $2)`, [D, P])
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() - interval '90 days' WHERE id = $1`, [P])
await as(U.mei, STAFF)
check((await dates()).length, 0, 'done and untouched for 90 days: off the board')
check((await one(`SELECT public.mkt_board($1::date, $2::date)`, [await plus(8), await plus(14)])).dates.filter(d => d.project === D).map(d => d.field),
  ['Post day', 'Ads go-live'], '…on it for the range its dates are in')

console.log(`marketing task dates: ${checks} checks passed`)
