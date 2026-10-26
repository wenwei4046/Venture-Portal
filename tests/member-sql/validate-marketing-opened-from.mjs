// Local PostgreSQL regression for 20261025201000 (2026-10-25 — Marketing ④-4c: a project opened from inside another; the
// user's answer 23: "Both — a project may be opened from inside another, its source kept, a line on the map").
// Marketing's migrations up to the option lists run; then this one, twice. What is under test: who may call what, one of
// each function; a task, a recurring task (the series keeps it, a run's page reads it) and a product project opened from
// another — the source kept, the 'created' record naming it, the source's trail saying so; opened from nowhere as before
// (an old call too); never from a project that is not there or a series' pattern — refused before anything is written
// or numbered; from a run, a done project, a product project; the pages reading it; never from itself; the source gone,
// the link emptied. No live I/O.
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
  '20261025181000_marketing_product_pause.sql', '20261025191000_marketing_option_lists.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025201000_marketing_opened_from.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid)', 'mkt_product_start(uuid, uuid, numeric, uuid)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('mkt_task_create', 'mkt_product_start')`), 2,
  'one of each — made again with where it is opened from, never a second beside the old')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const MONTH_LABEL = await peek1(`SELECT to_char($1::date, 'Mon YYYY')`, [TODAY])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const STAGES = [{ name: 'Design', dept: 'GRAPHIC DESIGNER', who: S.ali, sla: 1, appr: [S.josiah] }, { name: 'Caption', dept: 'VIDEOGRAPHER', who: S.mei, sla: 1 }]
const create = (kind, extra = {}) => one(`SELECT public.mkt_task_create($1, $2, $3, 'social', NULL, $4::jsonb, $5::jsonb, $6)`,
  [CAR, kind, extra.title ?? 'Price update', JSON.stringify(STAGES), extra.recur ? JSON.stringify(extra.recur) : null, extra.from ?? null])
const trail = (pid, actions) => peek(`SELECT action, actor_name AS actor, data FROM public.mkt_events WHERE project_id = $1 AND action = ANY ($2) ORDER BY id`, [pid, actions])
const sourceOf = pid => peek1(`SELECT source_id FROM public.mkt_projects WHERE id = $1`, [pid])
const num = track => Number(track.slice(-3))
const counts = async () => peek1(`SELECT jsonb_build_object('projects', (SELECT count(*) FROM public.mkt_projects), 'events', (SELECT count(*) FROM public.mkt_events))`)

// ── A task opened from nowhere, as before ─────────────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
const A = await create('quick', { title: 'Banner for the fair' })
check(await sourceOf(A.id), null, 'a task opened from nowhere keeps no source')
check((await trail(A.id, ['created']))[0].data, { kind: 'quick', stages: 2 }, '…its created record as it was')
const old = await one(`SELECT public.mkt_task_create($1, 'quick', 'An old call', 'social', NULL, $2::jsonb)`, [CAR, JSON.stringify(STAGES)])
check([await sourceOf(old.id), num(old.track)], [null, num(A.track) + 1], 'a call that never names one still opens a task')

// ── Opened from inside another ───────────────────────────────────────────────────────────────────────────
const B = await create('quick', { title: 'Resize for Instagram', from: A.id })
check(await sourceOf(B.id), A.id, 'the new task keeps the project it was opened from')
check((await trail(B.id, ['created']))[0].data, { kind: 'quick', stages: 2, from: A.track }, '…its created record names it by its Track ID')
check(await trail(A.id, ['opened project']), [{ action: 'opened project', actor: 'Mei', data: { id: B.id, track: B.track, title: 'Resize for Instagram' } }],
  'the project it was opened from says so on its trail: who, and the new one’s id, Track ID and title')
check(num(B.track), num(old.track) + 1, 'numbered as any task is')

// ── What it may be opened from ───────────────────────────────────────────────────────────────────────────
let was = await counts()
await refuses(`SELECT public.mkt_task_create($1, 'quick', 'Nowhere', 'social', NULL, $2::jsonb, NULL, $3)`, [CAR, JSON.stringify(STAGES), id(999)],
  /not there/, 'a project that is not there')
check(await counts(), was, '…refused, nothing is opened and no trail written')
const R = await create('recurring', { title: 'Daily reel', recur: { freq: 'daily', start: TODAY, endMode: 'count', count: 2 }, from: A.id })
const runs = await peek(`SELECT id, track_id FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])
check(runs.length, 2, 'a recurring task opened from it: its runs made as ever')
check([await sourceOf(R.id), ...(await Promise.all(runs.map(r => sourceOf(r.id))))], [A.id, null, null], '…the series keeps the source, its runs none of their own')
check((await trail(R.id, ['created']))[0].data.from, A.track, '…its created record names it')
check((await trail(A.id, ['opened project'])).map(e => [e.data.id, e.data.track, e.data.title]), [[B.id, B.track, 'Resize for Instagram'], [R.id, R.track, 'Daily reel']],
  '…and the source names the series')
was = await counts()
await refuses(`SELECT public.mkt_task_create($1, 'quick', 'From a pattern', 'social', NULL, $2::jsonb, NULL, $3)`, [CAR, JSON.stringify(STAGES), R.id],
  /not there/, 'never from a series’ pattern — its runs are the work')
check(await counts(), was, '…refused, nothing written')
const fromRun = await create('quick', { title: 'Run follow-up', from: runs[0].id })
check(await sourceOf(fromRun.id), runs[0].id, 'from a run: that run')
check(num(fromRun.track), num(R.track) + 1, 'a refused one used no number')
check((await trail(runs[0].id, ['opened project'])).map(e => e.data.track), [fromRun.track], '…the run’s own trail says so')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE id = $1`, [B.id])
await as(U.mei, CREATOR)
const afterDone = await create('quick', { title: 'Second round', from: B.id })
check(await sourceOf(afterDone.id), B.id, 'from a project that is done — the next round of it')

// ── A product project opened from a task, and a task from a product project ───────────────────────────────
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [], form: [] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const draft = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [draft.id, JSON.stringify({ name: 'Post pack', intake: minutes.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: 250, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [draft.id, saved.rev])
const PACK = draft.id

await as(U.mei, CREATOR)
await refuses(`SELECT public.mkt_product_start($1, $2, 500, $3)`, [CAR, PACK, A.id], /manager/, 'starting one from a task is still the manager’s')
await as(U.josiah, MANAGER)
was = await counts()
await refuses(`SELECT public.mkt_product_start($1, $2, 500, $3)`, [CAR, PACK, id(998)], /not there/, 'a project that is not there')
await refuses(`SELECT public.mkt_product_start($1, $2, 500, $3)`, [CAR, PACK, R.id], /not there/, '…nor a series’ pattern')
check(await counts(), was, '…refused, nothing written')
const P = await one(`SELECT public.mkt_product_start($1, $2, 500, $3)`, [CAR, PACK, A.id])
check(await sourceOf(P.id), A.id, 'a product project opened from a task keeps it')
check((await trail(P.id, ['created']))[0].data, { product: 'Post pack', version: 1, from: A.track }, '…its created record names it')
check((await trail(A.id, ['opened project'])).at(-1), { action: 'opened project', actor: 'SIA', data: { id: P.id, track: P.track, title: `Carres · Post pack · ${MONTH_LABEL}` } },
  '…the task’s trail names the product project, as titled')
const P0 = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, PACK])
check(await sourceOf(P0.id), null, 'one started from nowhere, as before')
await as(U.mei, CREATOR)
const fromP = await create('quick', { title: 'Teaser', from: P.id })
check(await sourceOf(fromP.id), P.id, 'a task opened from a product project')
check((await trail(P.id, ['opened project'])).map(e => e.data.track), [fromP.track], '…on the product project’s trail')

// ── Read on its page ─────────────────────────────────────────────────────────────────────────────────────
await as(U.ali, ['marketing.view'])
const page = key => one(`SELECT public.mkt_project($1)`, [key])
const SRC_A = { id: A.id, trackId: A.track, title: 'Banner for the fair', kind: 'quick', status: 'active', owner: 'Mei' }
check((await page(B.track)).project.source, SRC_A,
  'a task’s page: the project it was opened from — its id, Track ID, title, kind, where it stands, whose')
check((await page(A.track)).project.source, null, '…none when opened from nowhere')
check((await page(runs[1].track_id)).project.source, SRC_A,
  'a run’s page: its series’ source')
check((await page(R.track)).project.source?.id, A.id, '…the series’ own page too')
check((await page(fromRun.track)).project.source, { id: runs[0].id, trackId: runs[0].track_id, title: 'Daily reel', kind: 'recurring', status: 'active', owner: 'Mei' },
  'opened from a run: that run')
check((await page(fromP.track)).project.source.kind, 'product', 'opened from a product project: its kind says so')
const product = key => one(`SELECT public.mkt_product_project($1)`, [key])
check((await product(P.track)).project.source, SRC_A, 'a product project’s page: where it was opened from')
check((await product(P0.track)).project.source, null, '…none from nowhere')

// ── The link itself ──────────────────────────────────────────────────────────────────────────────────────
await asSystem()
await refuses(`UPDATE public.mkt_projects SET source_id = id WHERE id = $1`, [A.id], /source_check/, 'a project is never opened from itself')
await refuses(`UPDATE public.mkt_projects SET source_id = $2 WHERE id = $1`, [A.id, id(997)], /source_id_fkey/, '…nor from one that is not there')
// Gone, the link only: the projects opened from it stay.
await as(U.mei, CREATOR)
const child = await create('quick', { title: 'Opened from the one to go', from: afterDone.id })
await asSystem()
await q(`DELETE FROM public.mkt_events WHERE project_id = $1`, [afterDone.id])
await q(`DELETE FROM public.mkt_stages WHERE project_id = $1`, [afterDone.id])
await q(`DELETE FROM public.mkt_projects WHERE id = $1`, [afterDone.id])
check([await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE id = $1`, [child.id]), await sourceOf(child.id)], [1, null],
  'its source gone, the project opened from it stays — its link emptied')

console.log(`marketing opened-from: ${checks} checks passed`)
