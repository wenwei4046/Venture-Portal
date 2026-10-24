// Local PostgreSQL regression for 20261025131000 (2026-10-24 — Marketing ②b-2f: a recurring product's months; the user's
// answer 12 — a recurring product picks its run day — and the handoff's "Opens a new task every month for the same team").
// Marketing's migrations up to billing run; then this one, twice. What is under test: the run day asked when the work starts
// (a recurring product's alone; today's unless another, the 28th at most); each month made on its run day from the month
// before — a planned deliverable carried (the same people and approvals, its start a month on), an unplanned one or one
// whose people left waiting to be planned, its owner told; months behind made in turn; nothing before its day nor past
// the month it was stopped; the run day moved by the manager; a stopped project closing once its last month is made and
// done. No live I/O.
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
const mig = await sql('20261025131000_marketing_product_runs.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
for (const [fn, signedIn] of [['mkt_product_runs_made(uuid)', false], ['mkt_product_run_next(uuid)', false], ['mkt_product_runs_due()', false],
  ['mkt_product_begin(uuid, integer)', true], ['mkt_product_run_day(uuid, integer)', true]]) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, signedIn], `${fn}: who calls it`)
}
check(await peek1(`SELECT has_function_privilege('service_role', 'public.mkt_product_runs_due()', 'EXECUTE')`), true, 'the hourly sweep calls the months due')
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE proname = 'mkt_product_begin'`), 1, 'mkt_product_begin re-made, the one-argument one gone')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const DAY = Number(TODAY.slice(8, 10))
const MONTH = `${TODAY.slice(0, 7)}-01`
const back = n => peek1(`SELECT (($1::date - make_interval(months => $2))::date)::text`, [MONTH, n])
const label = m => peek1(`SELECT to_char($1::date, 'Mon YYYY')`, [m])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)

// ── A recurring social media plan (two image posts a month) and a one-time post pack ──────────────────────
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'person', staff: S.josiah }], form: [] },
  { name: 'Caption', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, appr: [], form: [] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
async function product(kind, name, price) {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind })])
  const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name, intake: minutes.id, price,
    effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: price / 2, workflow: wf.id }] }] })])
  await one(`SELECT public.mkt_product_publish($1, $2)`, [p.id, saved.rev])
  return p.id
}
const PLAN = await product('recurring', 'Social Media', 3000)
const PACK = await product('one', 'Post pack', 500)
async function started(productId, runDay) {
  await as(U.josiah, MANAGER)
  const id = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, productId])).id
  await asSystem()
  await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [id, id.replace(/-/g, '')])
  await as(U.josiah, MANAGER)
  if (runDay === undefined) await one(`SELECT public.mkt_product_begin($1)`, [id])
  else await one(`SELECT public.mkt_product_begin($1, $2)`, [id, runDay])
  return id
}
const kids = parent => peek(`SELECT id, track_id, title, status, starts_on::text AS start, deliv FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [parent])

// ── The run day: asked when the work starts — a recurring one's alone ─────────────────────────────────────
await as(U.josiah, MANAGER)
const bad = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, PLAN])).id
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2 WHERE id = $1`, [bad, 'd'.repeat(32)])
await as(U.josiah, MANAGER)
for (const day of [0, 29, 31]) await refuses(`SELECT public.mkt_product_begin($1, $2)`, [bad, day], /run day from the 1st to the 28th/, `a run day of ${day} refused`)
const R = await started(PLAN, 1)
check(await peek(`SELECT run_day, bill_from::text AS from FROM public.mkt_projects WHERE id = $1`, [R]), [{ run_day: 1, from: MONTH }],
  'begun: its run day, billed from this month')
check((await kids(R)).map(k => [k.track_id.slice(-3), k.status, k.deliv.run]), [['D01', 'planning', 1], ['D02', 'planning', 1]], 'its first month’s deliverables are run 1')
check(await peek1(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'work started'`, [R]), { deliverables: 2, runDay: 1 }, 'the trail names its run day')
const O = await started(PACK)
check([await peek1(`SELECT run_day FROM public.mkt_projects WHERE id = $1`, [O]), (await kids(O)).map(k => k.deliv.run ?? null)], [null, [null, null]],
  'a one-time project has no run day and no runs')
const Rdefault = await started(PLAN)
check(await peek1(`SELECT run_day FROM public.mkt_projects WHERE id = $1`, [Rdefault]), Math.min(DAY, 28), 'no day asked: today’s, the 28th at most')

// D01 planned (Ali designs, Mei captions, Josiah approves the design), D02 left to plan.
const [D1, D2] = (await kids(R)).map(k => k.id)
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D1, JSON.stringify({ start: TODAY, stages: [
  { owner: S.ali, appr: [{ kind: 'person', staff: S.josiah }], sla: 2 }, { owner: S.mei, appr: [], sla: 1 }] })])

// ── Each month on its run day: nothing before it ───────────────────────────────────────────────────────────
await asSystem()
check(await one(`SELECT public.mkt_product_runs_due()`), 0, 'next month’s run day has not come: nothing made')
check((await kids(R)).length, 2, '…still its first month’s two')

// Begun two months ago: last month's and this month's are due — made in turn, each from the month before.
const TWO = await back(2), ONE = await back(1)
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [R, TWO])
check(await one(`SELECT public.mkt_product_runs_due()`), 2, 'two months behind: both made')
const all = await kids(R)
check(all.map(k => [k.track_id.slice(-3), k.status, k.deliv.run, k.title]), [
  ['D01', 'active', 1, 'Image post 1/2'], ['D02', 'planning', 1, 'Image post 2/2'],
  ['D03', 'active', 2, `Image post 1/2 · ${await label(ONE)}`], ['D04', 'planning', 2, `Image post 2/2 · ${await label(ONE)}`],
  ['D05', 'active', 3, `Image post 1/2 · ${await label(MONTH)}`], ['D06', 'planning', 3, `Image post 2/2 · ${await label(MONTH)}`],
], 'each month the same deliverables, numbered on, its month in the title: a planned one carried, an unplanned one to plan')
const D3 = all[2].id, D5 = all[4].id
const startOf = async id => peek1(`SELECT starts_on::text FROM public.mkt_projects WHERE id = $1`, [id])
const plus1 = async d => peek1(`SELECT (($1::date + interval '1 month')::date)::text`, [d])
check(await startOf(D3), await plus1(TODAY), 'carried: its start a month on')
check(await startOf(D5), await plus1(await startOf(D3)), '…and the next a month on again')
check(await peek(`SELECT idx, owner_staff AS owner, appr, status FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [D3]), [
  { idx: 0, owner: S.ali, appr: [{ kind: 'person', staff: S.josiah }], status: 'todo' },
  { idx: 1, owner: S.mei, appr: [], status: 'planned' },
], 'the same people and approvals; stage 1 waits for its start day')
check(await peek1(`SELECT count(*)::int FROM public.mkt_stages WHERE project_id = $1 AND starts_on IS NOT NULL AND due_on IS NOT NULL`, [D3]), 2, 'its stages dated again')
check(await peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [D3]), [
  { action: 'carried', data: { from: all[0].track_id, start: await startOf(D3) } }], 'the deliverable’s trail: its plan carried, from which')
check(await peek(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'run made' ORDER BY id`, [R]).then(r => r.map(x => x.data)), [
  { run: 2, month: ONE.slice(0, 7), made: 2, toPlan: 1 }, { run: 3, month: MONTH.slice(0, 7), made: 2, toPlan: 1 },
], 'the project’s trail: each month made, how many, how many to plan')
check(await peek(`SELECT user_id, title FROM public.app_notifications WHERE title LIKE 'Plan %' ORDER BY created_at`).then(r => r.map(x => [x.user_id, x.title])), [
  [U.josiah, `Plan ${await label(ONE)}'s work · 1 deliverable`], [U.josiah, `Plan ${await label(MONTH)}'s work · 1 deliverable`],
], 'its owner told what is left to plan')
check(await peek1(`SELECT count(*)::int FROM public.app_notifications WHERE user_id IN ($1, $2) AND title LIKE 'You''re on the plan for "Image post 1/2 · %'`, [U.ali, U.mei]), 4,
  'the people carried hear they are on it')
check(await one(`SELECT public.mkt_product_runs_due()`), 0, 'nothing more due')
const unplanned = all[3].id
check(await peek(`SELECT owner_staff AS owner, status, starts_on FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [unplanned]), [
  { owner: null, status: 'planned', starts_on: null }, { owner: null, status: 'planned', starts_on: null }], 'one to plan: no dates, nobody yet')
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [unplanned, JSON.stringify({ start: TODAY, stages: [
  { owner: S.siti, appr: [], sla: 2 }, { owner: S.mei, appr: [], sla: 1 }] })])).track, all[3].track_id, 'the manager plans it as any other')

// ── Somebody who left: their month waits to be planned; the others kept as a start ─────────────────────────
await asSystem()
await q(`UPDATE public.hr_staff_costs SET status = 'inactive' WHERE id = $1`, [S.mei])
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [R, await back(3)])
await q(`SELECT public.mkt_top_up_due()`) // any Marketing write asks for what is due
const run4 = (await kids(R)).filter(k => k.deliv.run === 4)
check(run4.map(k => k.status), ['planning', 'planning'], 'Mei has left: next month’s copy of hers waits to be planned')
check(await peek(`SELECT owner_staff AS owner FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [run4[0].id]).then(r => r.map(x => x.owner)),
  [S.ali, null], '…Ali kept, Mei taken off')
await q(`UPDATE public.hr_staff_costs SET status = 'active' WHERE id = $1`, [S.mei])

// ── The run day changed by the manager, for the months not made yet ──────────────────────────────────────
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_product_run_day($1, 10)`, [R], /manager/, 'Marketing · Edit moves no run day')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_run_day($1, 30)`, [R], /from the 1st to the 28th/, 'a day past the 28th refused')
await refuses(`SELECT public.mkt_product_run_day($1, 10)`, [O], /Only a recurring project/, 'a one-time project has no run day')
const moved = await one(`SELECT public.mkt_product_run_day($1, 10)`, [R])
check(moved.project.runs, { day: 10, first: await back(3), made: 4, until: null }, 'its page: the day, its first month, how many made')
check(await peek1(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'run day'`, [R]), { from: 1, to: 10 }, 'the trail: from → to')
await as(U.ali, STAFF)
check((await one(`SELECT public.mkt_product_project($1)`, [R])).project.runs.day, 10, 'the staff see its months too (the work’s, not money)')

// ── Stopped: no month past it; it closes once its last month's work is made and done ─────────────────────
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_stop($1)`, [R])
await refuses(`SELECT public.mkt_product_run_day($1, 12)`, [R], /stopped/, 'a stopped project’s day stays')
await asSystem()
check(await one(`SELECT public.mkt_product_runs_due()`), 0, 'stopped this month, this month made: nothing more')
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [R])
await q(`SELECT public.mkt_product_settle($1)`, [R])
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [R]), 'done', 'every month made and done: closed')

if (DAY < 28) {
  // Stopped before this month's run day: this month is billed — its work is made on its day, and only then it closes.
  const W = await started(PLAN, 1)
  await asSystem()
  await q(`UPDATE public.mkt_projects SET bill_from = $2, run_day = $3 WHERE id = $1`, [W, ONE, DAY + 1])
  await as(U.josiah, MANAGER)
  check((await one(`SELECT public.mkt_product_stop($1)`, [W])).project.status, 'active', 'stopped before this month’s run day: open')
  await asSystem()
  await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [W])
  await q(`SELECT public.mkt_product_settle($1)`, [W])
  check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [W]), 'active', '…its last month’s work not made yet: still open')
  await q(`UPDATE public.mkt_projects SET run_day = 1 WHERE id = $1`, [W])
  check(await one(`SELECT public.mkt_product_runs_due()`), 1, 'its day come: this month’s work made')
  await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [W])
  await q(`SELECT public.mkt_product_settle($1)`, [W])
  check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [W]), 'done', '…and done: closed')
}

// ── Begun last month: this month made on the next ask ───────────────────────────────────────────────────────
const L = await started(PLAN, 1)
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [L, ONE])
check(await one(`SELECT public.mkt_product_runs_due()`), 1, 'its month made on the next ask')

console.log(`marketing product runs: ${checks} checks passed`)
