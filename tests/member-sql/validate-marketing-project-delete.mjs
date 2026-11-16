// Local PostgreSQL regression for 20261117120000 (2026-11-17 — a project or a task soft-deleted from Projects by a
// manager, hidden from every reader the pages use, put back by Undo within the hour). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => {
  const at = new Error('at').stack
  try { return (await db.query(sql, params)).rows } catch (e) { e.message += `\n${at}`; throw e }
}
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
for (const m of ['20261025211000_marketing_new_drafts.sql', '20261025221000_marketing_task_minutes.sql', '20261025231000_marketing_task_pic.sql',
  '20261025235000_marketing_task_pic_stage.sql', '20261113200000_marketing_wf_builder_v2.sql']) await db.exec(await sql(m))
await db.exec(await sql('20261113210000_marketing_wf_engine_v2.sql'))
const mig = await sql('20261117120000_marketing_project_delete.sql')
await asSystem()
await db.exec(await sql('20261114000000_marketing_approver_anyone.sql'))
await db.exec(mig)

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_project_delete(uuid)', 'mkt_project_restore(uuid)', 'mkt_board(date, date)', 'mkt_search(text)',
  'mkt_sub_feed(uuid, integer)', 'mkt_project(text)', 'mkt_product_project(text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed-in only`)
for (const fn of ['mkt_board_rows(date, date)', 'mkt_search_rows(text)', 'mkt_sub_feed_rows(uuid, integer)', 'mkt_project_rows(text)',
  'mkt_product_project_rows(text)', 'mkt_hide_deleted(jsonb)', 'mkt_key_deleted(text)'])
  check([await may('anon', fn), await may('authenticated', fn), await may('service_role', fn)], [false, false, true], `${fn}: a helper only`)

// ── Two quick tasks; the second made a child of the first (as a deliverable is of its product project) ─────────────
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const st = (name, who) => ({ name, dept: '', who, sla: 1, appr: [], form: [] })
const CREATE = `SELECT public.mkt_task_create($1, 'quick', $2, 'social', 'Do it', $3::jsonb, NULL, NULL, NULL, NULL)`
await as(U.josiah, CREATOR)
const A = await one(CREATE, [CAR, 'Raya visual', JSON.stringify([st('Design', S.ali), st('Post', S.mei)])])
const B = await one(CREATE, [CAR, 'Raya resize', JSON.stringify([st('Design', S.ali)])])
const C = await one(CREATE, [CAR, 'Price banner', JSON.stringify([st('Design', S.ali)])])
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET kind = 'deliverable', parent_id = '${A.id}' WHERE id = '${B.id}'`)
const statusOf = pid => peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [pid])
const before = { a: await statusOf(A.id), b: await statusOf(B.id) }

const board = async () => { await as(U.mei, VIEW); return one(`SELECT public.mkt_board(NULL, NULL)`) }
let b = await board()
check([A.id, B.id, C.id].every(x => b.projects.some(p => p.id === x)), true, 'all three on the board')
check(b.stages.some(s => s.project === A.id), true, 'A’s stages on the board')

// ── Only a manager deletes ───────────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_project_delete($1)`, [A.id], /Only Marketing's managers delete projects/, 'Edit deletes nothing')
await as(U.mei, VIEW)
await refuses(`SELECT public.mkt_project_delete($1)`, [A.id], /Only Marketing's managers delete projects/, 'View deletes nothing')
check(await statusOf(A.id), before.a, 'nothing moved')

await as(U.josiah, MANAGER)
const del = await one(`SELECT public.mkt_project_delete($1)`, [A.id])
check([del.trackId, del.title, del.rows], [A.track, 'Raya visual', 2], 'A deleted with its child')
check([await statusOf(A.id), await statusOf(B.id), await statusOf(C.id)], ['cancelled', 'cancelled', before.a], 'soft: cancelled, C untouched')
check(await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE deleted_batch = $1 AND deleted_by = $2`, [del.batch, U.josiah]), 2,
  'one batch, who deleted it')
check(await peek1(`SELECT count(*)::int FROM public.mkt_stages WHERE project_id = $1`, [A.id]), 2, 'its stages kept (soft)')
await refuses(`SELECT public.mkt_project_delete($1)`, [A.id], /not there any more/, 'deleted twice: refused')

b = await board()
check([b.projects.some(p => p.id === A.id), b.projects.some(p => p.id === B.id), b.projects.some(p => p.id === C.id)],
  [false, false, true], 'the board hides A and B')
check(b.stages.some(s => s.project === A.id || s.project === B.id), false, '…and their stages')
check(b.stages.some(s => s.project === C.id), true, '…not C’s')
await as(U.mei, VIEW)
check(await one(`SELECT public.mkt_project($1)`, [A.track]), null, 'its page by Track ID: not found')
check(await one(`SELECT public.mkt_project($1)`, [A.id]), null, 'its page by id: not found')
check((await one(`SELECT public.mkt_project($1)`, [C.track])) !== null, true, 'C’s page opens')
check(await one(`SELECT public.mkt_product_project($1)`, [A.id]), null, 'nor as a product project')
const found = await one(`SELECT public.mkt_search('Raya')`)
check(found.projects.length, 0, 'the search finds neither')
const feed = await one(`SELECT public.mkt_sub_feed($1, 50)`, [CAR])
check(feed.some(e => e.project.id === A.id || e.project.id === B.id), false, 'the subsidiary’s feed hides them')
check(feed.some(e => e.project.id === C.id), true, '…not C')
await as(null, [], 'anon')
await refuses(`SELECT public.mkt_project_delete($1)`, [C.id], /permission denied|managers/, 'anon deletes nothing')

// ── Undo ─────────────────────────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_project_restore($1)`, [del.batch], /Only Marketing's managers/, 'Edit puts nothing back')
await as(U.josiah, MANAGER)
check(await one(`SELECT public.mkt_project_restore($1)`, [del.batch]), { rows: 2 }, 'put back')
check([await statusOf(A.id), await statusOf(B.id)], [before.a, before.b], 'as they were')
check(await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE deleted_at IS NOT NULL OR deleted_batch IS NOT NULL`), 0, 'no mark left')
await refuses(`SELECT public.mkt_project_restore($1)`, [del.batch], /no longer be put back/, 'twice: refused')
b = await board()
check([A.id, B.id].every(x => b.projects.some(p => p.id === x)), true, 'back on the board')

// After an hour it stays deleted.
await as(U.josiah, MANAGER)
const del2 = await one(`SELECT public.mkt_project_delete($1)`, [C.id])
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET deleted_at = now() - interval '2 hours' WHERE id = '${C.id}'`)
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_project_restore($1)`, [del2.batch], /no longer be put back/, 'past the hour: refused')

console.log(`validate-marketing-project-delete: ${checks} checks passed`)
