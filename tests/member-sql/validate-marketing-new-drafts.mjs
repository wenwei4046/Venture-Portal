// Local PostgreSQL regression for 20261025211000 (2026-10-25 — Marketing: New Project kept as a draft while it is typed; the
// user: "New Project 一有输入就会自动进 draft（草稿）那边，这样的话内容就不会丢了"). Marketing's migrations up to the
// opened-from one run; then this one, twice. What is under test: who may call what; the table nobody's but the functions';
// a draft kept, listed (its kind, title, subsidiary, product — never its form), opened whole, saved again on its count and
// never over another window's save; what a draft may hold (an object, 512 KB at most); the caller's own alone; dropped;
// thirty a login. No live I/O.
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
const U = { josiah: id(1), mei: id(2), ali: id(3) }
const S = { josiah: id(11), mei: id(12), ali: id(13) }

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

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text, ignore text[], omit text[]);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason, p_ignore, p_omit)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason,
        ignore = excluded.ignore, omit = excluded.omit
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

  INSERT INTO public.users (id, name, email) VALUES ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
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
  '20261025039500_marketing_chat_review.sql', '20261025101000_marketing_subtasks.sql', '20261025113000_marketing_stage_files.sql',
  '20261025121000_marketing_billing.sql', '20261025131000_marketing_product_runs.sql', '20261025141000_marketing_campaigns.sql',
  '20261025151000_marketing_task_dates.sql', '20261025161000_marketing_pic_calendar.sql', '20261025171000_marketing_log_corrections.sql',
  '20261025181000_marketing_product_pause.sql', '20261025191000_marketing_option_lists.sql', '20261025201000_marketing_opened_from.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025211000_marketing_new_drafts.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_new_drafts()', 'mkt_new_draft(uuid)', 'mkt_new_draft_save(uuid, integer, jsonb)', 'mkt_new_draft_drop(uuid)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mkt_new_drafts'::regclass`), true, 'the table keeps row security on')
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_new_drafts', 'SELECT')
                    OR has_table_privilege('authenticated', 'public.mkt_new_drafts', 'INSERT')
                    OR has_table_privilege('anon', 'public.mkt_new_drafts', 'SELECT')`), false,
  'nobody reads or writes the table but the functions')
check(await peek1(`SELECT jsonb_build_object('area', area, 'mode', mode, 'why', reason IS NOT NULL) FROM public.audit_registered WHERE t = 'mkt_new_drafts'`),
  { area: 'Marketing', mode: 'none', why: true }, 'on the audit register — not followed, the reason said')

const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const list = () => one(`SELECT public.mkt_new_drafts()`)
const get = d => one(`SELECT public.mkt_new_draft($1)`, [d])
const save = (d, rev, data) => one(`SELECT public.mkt_new_draft_save($1, $2, $3::jsonb)`, [d, rev, JSON.stringify(data)])
const drop = d => one(`SELECT public.mkt_new_draft_drop($1)`, [d])
const rows = () => peek1(`SELECT count(*)::int FROM public.mkt_new_drafts`)
const SUB = id(501)
const FORM = { v: 1, mode: 'task', sub: SUB, title: '  Raya banner  ', brief: 'New price', stages: [{ name: 'Design' }] }

// ── Nobody without New Project ───────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_new_drafts()`, [], /not open to your account/, 'Marketing · View and Edit alone: no drafts read')
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, '{}'::jsonb)`, [], /not open to your account/, '…none kept')
await refuses(`SELECT public.mkt_new_draft($1)`, [id(1)], /not open to your account/, '…none opened')
await refuses(`SELECT public.mkt_new_draft_drop($1)`, [id(1)], /not open to your account/, '…none dropped')
await as(null, CREATOR)
await refuses(`SELECT public.mkt_new_drafts()`, [], /not open to your account/, 'not signed in: none')

// ── A draft kept, read, saved again ──────────────────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
check(await list(), [], 'none yet')
const A = await save(null, null, FORM)
check([A.rev, typeof A.id, typeof A.updatedAt], [1, 'string', 'string'], 'a new draft: its id, count 1, when')
const listed = await list()
check(listed.map(d => ({ id: d.id, rev: d.rev, mode: d.mode, title: d.title, sub: d.sub, product: d.product })),
  [{ id: A.id, rev: 1, mode: 'task', title: 'Raya banner', sub: SUB, product: null }],
  'the list: its kind, its title tidied, its subsidiary — no product on a task')
check(Object.keys(listed[0]).sort(), ['createdAt', 'id', 'mode', 'product', 'rev', 'sub', 'title', 'updatedAt'], '…and never its form')
check((await get(A.id)).data, FORM, 'opened: the form as it was typed, whole')
const A2 = await save(A.id, 1, { ...FORM, title: 'Raya banner v2' })
check([A2.id, A2.rev], [A.id, 2], 'saved again on its count: the same draft, count 2')
check((await get(A.id)).data.title, 'Raya banner v2', '…what is kept is the last save')
await refuses(`SELECT public.mkt_new_draft_save($1, 1, '{"title": "older"}'::jsonb)`, [A.id], /changed in another window/,
  'a save on an older count — another window saved since — is refused')
check((await get(A.id)).data.title, 'Raya banner v2', '…and writes nothing over it')
await refuses(`SELECT public.mkt_new_draft_save($1, NULL, '{}'::jsonb)`, [A.id], /changed in another window/, '…nor one with no count')

// ── What a draft holds ───────────────────────────────────────────────────────────────────────────────────
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, '[]'::jsonb)`, [], /Nothing to keep/, 'a list is no form')
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, 'null'::jsonb)`, [], /Nothing to keep/, '…nor nothing')
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, NULL)`, [], /Nothing to keep/, '…nor a NULL')
const BIG = { v: 1, brief: 'x'.repeat(524288) }
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, $1::jsonb)`, [JSON.stringify(BIG)], /512 KB at most/, 'more than 512 KB is refused')
const B = await save(null, null, { v: 1, mode: 'product', sub: SUB, product: id(601), title: 42 })
const bRow = (await list()).find(d => d.id === B.id)
check([bRow.mode, bRow.product, bRow.title], ['product', id(601), null],
  'a product project’s draft names its product; a title that is not words reads as none')
const C = await save(null, null, { v: 1, mode: 'something else', sub: 7 })
const cRow = (await list()).find(d => d.id === C.id)
check([cRow.mode, cRow.sub], [null, null], 'a kind it does not know reads as none, a subsidiary that is not words too')
const D = await save(null, null, { v: 1, title: 'y'.repeat(300) })
check((await list()).find(d => d.id === D.id).title.length, 140, 'the list cuts a long title to 140')
check((await list()).map(d => d.id), [D.id, C.id, B.id, A.id], 'newest first')

// ── The caller's own alone ───────────────────────────────────────────────────────────────────────────────
await as(U.ali, CREATOR)
check(await list(), [], 'another login sees none of them')
check(await get(A.id), null, '…opens none')
await refuses(`SELECT public.mkt_new_draft_save($1, 2, '{}'::jsonb)`, [A.id], /not there any more/, '…saves over none')
check(await drop(A.id), { dropped: false }, '…drops none')
await as(U.mei, CREATOR)
check((await get(A.id)).rev, 2, 'still Mei’s, as she left it')

// ── Dropped ──────────────────────────────────────────────────────────────────────────────────────────────
check(await drop(B.id), { dropped: true }, 'Discard drops it')
check([await get(B.id), (await list()).some(d => d.id === B.id)], [null, false], '…gone from the list')
check(await drop(B.id), { dropped: false }, 'dropped again: nothing happens')
await refuses(`SELECT public.mkt_new_draft_save($1, 1, '{}'::jsonb)`, [B.id], /not there any more/, 'a dropped draft is never saved again')

// ── Thirty a login ───────────────────────────────────────────────────────────────────────────────────────
const have = (await list()).length
for (let i = have; i < 30; i++) await save(null, null, { v: 1, title: `Draft ${i}` })
check((await list()).length, 30, 'thirty kept')
await refuses(`SELECT public.mkt_new_draft_save(NULL, NULL, '{"v": 1}'::jsonb)`, [], /30 drafts — discard one/, 'a thirty-first is refused')
const A3 = await save(A.id, 2, { ...FORM, title: 'Still saved' })
check(A3.rev, 3, '…a draft already kept still saves')
await as(U.ali, CREATOR)
check((await save(null, null, { v: 1 })).rev, 1, '…and another login keeps its own')
await as(U.mei, CREATOR)
await drop(D.id)
check((await save(null, null, { v: 1, title: 'Room again' })).rev, 1, 'one dropped, one kept again')
check(await rows(), 31, 'thirty of Mei’s and one of Ali’s')

console.log(`marketing new drafts: ${checks} checks passed`)
