// Local PostgreSQL regression for 20261113220000 (2026-11-13 — the user: a product in the Product Builder publishes on
// its basics — a name, a type, something included, a list price above 0, the day it takes effect; an action need not
// be linked to a published workflow). Marketing's migrations through the Workflow Builder 2a's engine
// (20261113210000) run, then this one, twice. What is under test: publishing with an action unlinked and one linked to
// a workflow not published (the version keeps `workflow: null` / no workflowVersion); the basics still refused; the
// work started — only the actions on a published workflow made, numbered over those, the rest on the trail
// (`work started`.notMade, `not made`) and the owner told; nothing on a published workflow → the work refused, nothing
// made; a recurring product's next month made from the month before (never the skipped action). No live I/O.
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
for (const m of ['20261025211000_marketing_new_drafts.sql', '20261025221000_marketing_task_minutes.sql', '20261025231000_marketing_task_pic.sql',
  '20261025235000_marketing_task_pic_stage.sql', '20261113200000_marketing_wf_builder_v2.sql']) await db.exec(await sql(m))
await db.exec(await sql('20261113210000_marketing_wf_engine_v2.sql'))
// The body this migration swaps in: mkt_product_groups is production's (md5 b42bba32…, the same as its migration copy).
check(await peek1(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'mkt_product_groups'`), 'b42bba32449b01a686b548e44d457488',
  'mkt_product_groups is production’s body before the swap')
const mine = await sql('20261113220000_marketing_product_publish_basics.sql')
await db.exec(mine)
await db.exec(mine) // twice: nothing changes, nothing breaks
const src = async fn => peek1(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn])
check([(await src('mkt_product_groups')).includes('link a workflow'), (await src('mkt_product_begin')).includes('v_skip')], [false, true],
  'the swaps are in')

// ── A workflow published, one not; the intake ─────────────────────────────────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: false, project: true, file: false, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const cat = await one(`SELECT public.mkt_wf_category_add('Image post', NULL)`)
const wf = await peek(`SELECT id, draft_rev FROM public.mkt_workflows WHERE id = $1`, [cat.id])
const STAGES = [{ sid: 'sdesign01', name: 'Design', dept: 'design', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ ids: [S.josiah], rule: 'any' }] }]
const saved = await one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [cat.id, wf[0].draft_rev, JSON.stringify({ stages: STAGES })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [cat.id, saved.rev])
const draftWf = await one(`SELECT public.mkt_wf_category_add('Reel', NULL)`)
check(await peek1(`SELECT version FROM public.mkt_workflows WHERE id = $1`, [draftWf.id]), 0, 'Reel’s workflow is not published')

// ── Published on its basics ───────────────────────────────────────────────────────────────────────────────
const product = async (kind, groups) => {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind })])
  return { id: p.id, rev: (await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name: `Pack ${kind} ${p.id.slice(0, 4)}`,
    intake: minutes.id, price: 900, effectiveFrom: TODAY, groups })])).rev }
}
const GROUPS = [{ name: 'Design', items: [
  { name: 'Image post', qty: 2, price: 300, workflow: cat.id },
  { name: 'Poster', qty: 1, price: 200 },
  { name: 'Reel', qty: 3, price: 100, workflow: draftWf.id }] }]
const one1 = await product('one', GROUPS)
const pub = await one(`SELECT public.mkt_product_publish($1, $2)`, [one1.id, one1.rev])
check(pub.version, 1, 'published with an action unlinked and one on a workflow not published')
const items = (await peek(`SELECT groups FROM public.mkt_product_versions WHERE product_id = $1 AND version = 1`, [one1.id]))[0].groups[0].items
check(items.map(it => [it.name, it.workflow ?? 'none', it.workflowVersion ?? 'none']),
  [['Image post', cat.id, 1], ['Poster', 'none', 'none'], ['Reel', draftWf.id, 'none']],
  'the version keeps workflow: null for the unlinked action, and no workflowVersion for the unpublished one')
check([Object.prototype.hasOwnProperty.call(items[1], 'workflow'), items[1].workflow], [true, null], '…the null key itself kept')
check(Object.prototype.hasOwnProperty.call((await peek(`SELECT groups FROM public.mkt_products WHERE id = $1`, [one1.id]))[0].groups[0].items[1], 'workflow'),
  false, 'a draft save stores no null workflow key (as before)')
// The basics are still asked.
const bare = await product('one', [{ name: 'Design', items: [{ name: 'Poster', qty: 0, price: 1 }] }])
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, bare.rev], /Add what the product includes/, 'something included, still')
const resave = async (rev, patch) => (await one(`SELECT public.mkt_product_save($1, $2, $3::jsonb)`, [bare.id, rev, JSON.stringify(patch)])).rev
let r2 = await resave(bare.rev, { groups: [{ name: 'Design', items: [{ name: '', qty: 1 }] }] })
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, r2], /Name each action/, 'each action named, still')
r2 = await resave(r2, { groups: [{ name: 'Design', items: [{ name: 'Poster', qty: 1 }] }], price: null })
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, r2], /Set its list price/, 'a price above 0, still')
r2 = await resave(r2, { price: 10, intake: null })
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, r2], /Pick its intake minutes template/, 'the intake, kept')
r2 = await resave(r2, { intake: minutes.id, effectiveFrom: null })
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, r2], /Pick the day it takes effect/, 'the day, kept')
r2 = await resave(r2, { effectiveFrom: TODAY })
check((await one(`SELECT public.mkt_product_publish($1, $2)`, [bare.id, r2])).version, 1, 'nothing linked at all: published too')

// ── The work started: only what runs on a published workflow is made ──────────────────────────────────────
const start = async productId => {
  await as(U.josiah, MANAGER)
  const id = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, productId])).id
  await asSystem()
  await db.exec(`UPDATE public.mkt_projects SET status = 'approved' WHERE id = '${id}'`)
  return id
}
const P = await start(one1.id)
await as(U.mei, MANAGER) // somebody else starts the work: the owner (Josiah) is told
const began = await one(`SELECT public.mkt_product_begin($1)`, [P])
check([began.deliverables, began.notMade], [2, ['Poster', 'Reel ×3']], 'two Image posts made; Poster and Reel ×3 not')
const D = await peek(`SELECT track_id, title, status, workflow_id FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [P])
const track = await peek1(`SELECT track_id FROM public.mkt_projects WHERE id = $1`, [P])
check(D.map(d => [d.track_id, d.title, d.status, d.workflow_id]),
  [[`${track}-D01`, 'Image post 1/2', 'planning', cat.id], [`${track}-D02`, 'Image post 2/2', 'planning', cat.id]],
  'numbered over the ones made, each on its workflow')
check(await peek1(`SELECT count(*)::int FROM public.mkt_stages s JOIN public.mkt_projects d ON d.id = s.project_id WHERE d.parent_id = $1`, [P]), 2,
  'each made with its workflow’s stages; nothing made without stages')
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [P]), 'active', 'the project is under way')
const trail = await peek(`SELECT action, reason, data FROM public.mkt_events WHERE project_id = $1 AND action IN ('work started', 'not made') ORDER BY id`, [P])
check(trail.map(e => [e.action, e.reason, e.data]), [
  ['work started', null, { deliverables: 2, notMade: ['Poster', 'Reel ×3'] }],
  ['not made', 'Poster, Reel ×3 — no workflow linked', { notMade: ['Poster', 'Reel ×3'] }]], 'the trail says what was not made')
check(await peek(`SELECT title, body FROM public.app_notifications WHERE user_id = $1`, [U.josiah]),
  [{ title: 'Not made: 2 actions with no workflow', body: `${track} · Poster, Reel ×3` }], 'the owner is told')
await refuses(`SELECT public.mkt_product_begin($1)`, [P], /Its work has started already/, 'never twice')

// Nothing on a published workflow: the work is refused, nothing made.
const P2 = await start(bare.id)
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_begin($1)`, [P2], /Nothing on v1 of this product runs on a published workflow yet/, 'nothing to make: refused')
check([await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE parent_id = $1`, [P2]), await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [P2])],
  [0, 'approved'], '…nothing made, the project still approved')

// ── A recurring product: its next month is made from the month before ─────────────────────────────────────
const rec = await product('recurring', GROUPS)
await one(`SELECT public.mkt_product_publish($1, $2)`, [rec.id, rec.rev])
const R = await start(rec.id)
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_product_begin($1, 1)`, [R])).deliverables, 2, 'a recurring one: the first month made, the same two')
await asSystem()
// Its first month was last month: this month's is due (run day the 1st).
await db.exec(`UPDATE public.mkt_projects SET bill_from = (date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) - interval '1 month')::date
  WHERE id = '${R}'`)
check(await one(`SELECT public.mkt_product_run_next($1)`, [R]), 2, 'the next month made')
const months = await peek(`SELECT deliv ->> 'item' AS item, deliv ->> 'run' AS run, workflow_id FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [R])
check(months.map(m => [m.item, m.run, m.workflow_id]),
  [['Image post', '1', cat.id], ['Image post', '1', cat.id], ['Image post', '2', cat.id], ['Image post', '2', cat.id]],
  'month 2 copies month 1 — only what was made; the skipped actions never come back')

console.log(`marketing product basics: ${checks} checks passed`)
