// Local PostgreSQL regression for 20261025181000 (2026-10-25 — Marketing ②b-2g: a recurring product project paused and
// resumed; the spec's gap 180 and the user's answer 51 — billed every month, "paused months too"). Marketing's migrations
// up to the formal log's corrections run; then this one, twice. What is under test: who may call what; Pause and Resume
// the manager's, a recurring project's whose work started and was not stopped; a month due made before the pause; no
// month made while paused — the work made carries on: planned, its day moved; still billed; resumed from this month, its
// work made at once once its run day has passed or on its day, a month whose run day came while paused left out, carried
// from the last month made, each start as many months on; paused again and resumed in the same month — nothing left out;
// stopped while paused, closed once nothing is under way; a stopped project neither paused nor resumed; an active stopped
// one still waiting for its last month. No live I/O.
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
  '20261025151000_marketing_task_dates.sql', '20261025161000_marketing_pic_calendar.sql', '20261025171000_marketing_log_corrections.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025181000_marketing_product_pause.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
check([await may('anon', 'mkt_product_pause(uuid, boolean)'), await may('authenticated', 'mkt_product_pause(uuid, boolean)')], [false, true],
  'Pause / Resume: signed in only')
for (const fn of ['mkt_product_run_next(uuid)', 'mkt_product_runs_due()', 'mkt_product_settle(uuid)'])
  check(await may('authenticated', fn), false, `${fn}: still nobody's to call`)

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const DAY = Number(TODAY.slice(8, 10))
const MONTH = `${TODAY.slice(0, 7)}-01`
const shift = (m, n) => peek1(`SELECT (($1::date + make_interval(months => $2))::date)::text`, [m, n])
const back = n => shift(MONTH, -n)
const ym = m => m.slice(0, 7)
const label = m => peek1(`SELECT to_char($1::date, 'Mon YYYY')`, [m])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)

// A run_from is a product project's alone.
await refuses(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, run_from)
               VALUES ($1, 'TSK-CAR-2610-901', 'quick', $2, 'A quick task', 'active', 1)`, [id(901), CAR], /run_from_check/,
  'a quick task has no run to go on from')

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
async function approved(productId) {
  await as(U.josiah, MANAGER)
  const pid = (await one(`SELECT public.mkt_product_start($1, $2, 3000)`, [CAR, productId])).id
  await asSystem()
  await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [pid, pid.replace(/-/g, '')])
  await as(U.josiah, MANAGER)
  return pid
}
async function started(productId, runDay) {
  const pid = await approved(productId)
  await one(`SELECT public.mkt_product_begin($1, $2)`, [pid, runDay ?? null])
  return pid
}
const kids = parent => peek(`SELECT id, track_id, title, status, starts_on::text AS start, (deliv ->> 'run')::int AS run
                               FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [parent])
const runsOf = async parent => (await kids(parent)).map(k => k.run)
const pause = (pid, to) => one(`SELECT public.mkt_product_pause($1, $2)`, [pid, to])
const statusOf = pid => peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [pid])
const events = (pid, actions) => peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 AND action = ANY ($2) ORDER BY id`, [pid, actions])
const TWO_STAGES = [{ owner: S.ali, appr: [{ kind: 'person', staff: S.josiah }], sla: 2 }, { owner: S.mei, appr: [], sla: 1 }]
const planned = (did, start = TODAY) => one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [did, JSON.stringify({ start, stages: TWO_STAGES })])

// ── What Pause asks ─────────────────────────────────────────────────────────────────────────────────────
const R = await started(PLAN, 1)
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_product_pause($1, true)`, [R], /manager/, 'Marketing · Edit pauses nothing')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_pause($1, NULL)`, [R], /Pause or resume/, 'neither pause nor resume')
await refuses(`SELECT public.mkt_product_pause($1, true)`, [id(999)], /not there/, 'no such project')
const O = await started(PACK, undefined)
await refuses(`SELECT public.mkt_product_pause($1, true)`, [O], /Only a recurring project is paused/, 'a one-time project is never paused')
const notYet = await approved(PLAN)
await refuses(`SELECT public.mkt_product_pause($1, true)`, [notYet], /has not started/, 'its work not started: nothing runs yet')
await refuses(`SELECT public.mkt_product_pause($1, false)`, [R], /running already/, 'a running project is not resumed')

// ── Paused: a month whose run day has come is made first ──────────────────────────────────────────────────
const [D1] = (await kids(R)).map(k => k.id)
await planned(D1)
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [R, await back(3)]) // begun three months ago: three months due
await as(U.josiah, MANAGER)
const paused = await pause(R, true)
check(paused.project.status, 'paused', 'paused')
check(await runsOf(R), [1, 1, 2, 2, 3, 3, 4, 4], 'the months whose run day had come made first, in turn')
check((await events(R, ['run made', 'runs paused'])).map(e => e.action), ['run made', 'run made', 'run made', 'runs paused'], '…then paused')
check((await events(R, ['runs paused']))[0].data, null, 'the pause says nothing more')
await refuses(`SELECT public.mkt_product_pause($1, true)`, [R], /paused already/, 'paused twice refused')

// Two months pass while it is paused: their run days come and go — nothing made.
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [R, await back(5)])
check(await one(`SELECT public.mkt_product_runs_due()`), 0, 'paused: no month made by the sweep')
await q(`SELECT public.mkt_top_up_due()`)
check(await one(`SELECT public.mkt_product_run_next($1)`, [R]), 0, '…nor by any write, nor asked for it')
check((await kids(R)).length, 8, 'still four months’ work')

// The work made carries on: a deliverable planned, the day moved.
const run4 = (await kids(R)).filter(k => k.run === 4)
check(run4.map(k => k.status), ['active', 'planning'], 'its fourth month: one carried, one to plan')
await as(U.josiah, MANAGER)
check((await planned(run4[1].id)).track, run4[1].track_id, 'paused, its deliverable is planned as any other')
check(await statusOf(run4[1].id), 'active', '…and runs')
check((await one(`SELECT public.mkt_product_run_day($1, 2)`, [R])).project.runs.day, 2, 'paused, its run day moved for the months to come')
await one(`SELECT public.mkt_product_run_day($1, 1)`, [R])
check((await events(R, ['run day'])).map(e => e.data), [{ from: 1, to: 2 }, { from: 2, to: 1 }], '…in the trail')
check(await statusOf(R), 'paused', '…still paused')

// Billed all the same (answer 51): every month to this one, paused or not.
await asSystem()
check((await peek(`SELECT month::text AS m FROM public.mkt_bill_due($1, $2) WHERE project_id = $3 ORDER BY month`, [await back(5), MONTH, R])).map(r => r.m),
  [await back(5), await back(4), await back(3), await back(2), await back(1), MONTH], 'every month billed — the paused ones too')

// ── Resumed: from this month; a month whose run day came while paused is left out ─────────────────────────
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_product_pause($1, false)`, [R], /manager/, 'Marketing · Edit resumes nothing')
await as(U.josiah, MANAGER)
const before = await kids(R)
const resumed = await pause(R, false)
check(resumed.project.status, 'active', 'resumed')
check((await events(R, ['runs resumed']))[0].data, { from: ym(MONTH), left: 1 }, 'the trail: from this month, one month left out')
check(await runsOf(R), [1, 1, 2, 2, 3, 3, 4, 4, 6, 6], 'this month’s work made at once (its run day has passed); last month’s left out')
const run6 = (await kids(R)).filter(k => k.run === 6)
check(run6.map(k => [k.track_id.slice(-3), k.status, k.title]), [
  ['D09', 'active', `Image post 1/2 · ${await label(MONTH)}`], ['D10', 'active', `Image post 2/2 · ${await label(MONTH)}`],
], 'numbered on, its month in the title, both carried from the last month made')
const startOf = did => before.find(k => k.id === did).start
check(run6.map(k => k.start), [await shift(startOf(run4[0].id), 2), await shift(startOf(run4[1].id), 2)], 'each start two months on from the month it came from')
check((await events(R, ['run made'])).at(-1).data, { run: 6, month: ym(MONTH), made: 2, toPlan: 0 }, 'the month made, in the trail')
check(resumed.project.runs, { day: 1, first: await back(5), made: 6, until: null, next: 7 }, 'the page answered: six made, the next next month’s')
await asSystem()
check(await one(`SELECT public.mkt_product_runs_due()`), 0, 'nothing more due')
check(await peek1(`SELECT run_from FROM public.mkt_projects WHERE id = $1`, [R]), 6, 'its months go on from this month’s run')

// Paused again and resumed in the same month: this month's work is made already — nothing left out.
await as(U.josiah, MANAGER)
await pause(R, true)
const again = await pause(R, false)
check((await events(R, ['runs resumed'])).at(-1).data, { from: ym(await shift(MONTH, 1)), left: 0 }, 'resumed in the same month: from next month, nothing left out')
check(again.project.runs.next, 7, '…its next run next month’s')
check((await kids(R)).length, 10, '…nothing made again')

// ── Stopped while paused: billed to this month; it closes once nothing of it is under way ───────────────────
await pause(R, true)
const stopped = await one(`SELECT public.mkt_product_stop($1)`, [R])
check([stopped.project.status, stopped.project.runs.until], ['paused', MONTH], 'stopped while paused: billed to this month, its work under way')
await refuses(`SELECT public.mkt_product_pause($1, false)`, [R], /stopped — no month is left to resume/, 'a stopped project is not resumed')
await refuses(`SELECT public.mkt_product_run_day($1, 3)`, [R], /stopped/, '…nor its day moved')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [R])
await q(`SELECT public.mkt_product_settle($1)`, [R])
check(await statusOf(R), 'done', 'every deliverable done: closed — no month left to wait for')
check((await events(R, ['closed'])).length, 1, '…in the trail')

// Paused since last month, then stopped: closed without this month's work — none is made again.
const X = await started(PLAN, 1)
await pause(X, true)
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [X, await back(1)]) // a month passes while it is paused
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_stop($1)`, [X])
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [X])
await q(`SELECT public.mkt_product_settle($1)`, [X])
check([await statusOf(X), await runsOf(X)], ['done', [1, 1]], 'paused since last month and stopped: closed without this month’s work')

// A stopped project that runs is not paused either.
const T = await started(PLAN, 1)
await one(`SELECT public.mkt_product_stop($1)`, [T])
await refuses(`SELECT public.mkt_product_pause($1, true)`, [T], /stopped — no month is left to pause/, 'a stopped project is not paused')

if (DAY < 28) {
  // ── Resumed before this month's run day: its work waits for the day ─────────────────────────────────────────
  const W = await started(PLAN, 1)
  await pause(W, true)
  await asSystem()
  await q(`UPDATE public.mkt_projects SET bill_from = $2, run_day = $3 WHERE id = $1`, [W, await back(1), DAY + 1])
  await as(U.josiah, MANAGER)
  const w = await pause(W, false)
  check([(await events(W, ['runs resumed']))[0].data, w.project.runs.next], [{ from: ym(MONTH), left: 0 }, 2], 'resumed before this month’s run day: nothing left out, this month next')
  check(await runsOf(W), [1, 1], '…its work not made before its day')
  await asSystem()
  await q(`UPDATE public.mkt_projects SET run_day = 1 WHERE id = $1`, [W])
  check(await one(`SELECT public.mkt_product_runs_due()`), 1, 'its day come: this month’s work made')
  check(await runsOf(W), [1, 1, 2, 2], '…the month after the last')

  // ── Stopped while running, before this month's run day: it still waits for that month's work (②b-2f kept) ────
  const V = await started(PLAN, 1)
  await asSystem()
  await q(`UPDATE public.mkt_projects SET bill_from = $2, run_day = $3 WHERE id = $1`, [V, await back(1), DAY + 1])
  await as(U.josiah, MANAGER)
  await one(`SELECT public.mkt_product_stop($1)`, [V])
  await asSystem()
  await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [V])
  await q(`SELECT public.mkt_product_settle($1)`, [V])
  check(await statusOf(V), 'active', 'running and stopped before this month’s run day: still open for that month’s work')
}

console.log(`marketing product pause: ${checks} checks passed`)
