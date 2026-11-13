// Local PostgreSQL regression for 20261113210000 (2026-11-13 — the Workflow Builder 2a's running-task engine,
// docs/design_handoff_workflow_builder/README.md › Interactions & behavior; the twin of src/lib/marketing/flow.ts).
// Marketing's migrations up to ②a-5 and the template side (20261113200000) run; then this one, twice. What is under test:
// who may call what; the level helpers (legacy and new shapes, any / all); dates Monday to Friday, no holidays; no Accept
// (a stage opened `todo` is worked at once, one left `todo` accepted); any vs all; three levels in order, each telling
// the next; request changes back to the stage named — the approvals from there to here cleared, the clock restarted —
// or staying; the PIC inside a mixed level; ⇄ reassign; a task's own table columns; the overdue sweep once vs repeat,
// from 9:00, only a task with a rule; done → +60 XP to everybody on it and the finish's recipients told; a product's
// deliverable copied from its version (levels, group keys, the canvas's fields by sid, overdue, finish) and never
// changed by a version published later; the plan resolving 'assign'; the readers (mkt_project, mkt_board, mkt_shell).
// No live I/O.
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
const mig = await sql('20261113210000_marketing_wf_engine_v2.sql')
await asSystem()
// A stage left `todo` from before: accepted by the migration.
const OLD = await peek1(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, owner_staff, starts_on)
  SELECT 'TSK-CAR-2611-900', 'quick', id, 'Old one', 'active', '${S.mei}', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    FROM public.mkt_subsidiaries WHERE code = 'CAR' RETURNING id`)
await db.exec(`INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, status, entered_at)
  VALUES ('${OLD}', 0, 'Old stage', 'GRAPHIC DESIGNER', 'person', '${S.mei}', 1, '[{"kind":"person","staff":"${S.josiah}"}]', 'todo', now() - interval '1 day')`)
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
check((await peek(`SELECT status, dept, accepted_at IS NOT NULL AS acc FROM public.mkt_stages WHERE project_id = $1`, [OLD]))[0],
  { status: 'accepted', dept: 'design', acc: true }, 'a stage left `todo` is accepted; a People title in dept read as its group key')

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_level_norm(jsonb)', 'mkt_level_waits(jsonb, jsonb)', 'mkt_levels_check(jsonb, uuid[], text, boolean)',
  'mkt_level_ok(uuid, text)', 'mkt_stage_back(uuid, jsonb)', 'mkt_appr_people(jsonb)', 'mkt_dept_key(text)'])
  check([await may('anon', fn), await may('authenticated', fn), await may('service_role', fn)], [false, false, true], `${fn}: a helper only`)
for (const fn of ['mkt_stage_reassign(uuid, integer, uuid, text)', 'mkt_task_column(uuid, text, text, jsonb)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in, asking its own action`)
check([await may('anon', 'mkt_overdue_sweep(timestamptz)'), await may('authenticated', 'mkt_overdue_sweep(timestamptz)'),
  await may('service_role', 'mkt_overdue_sweep(timestamptz)')], [false, false, true], 'the sweep: the service role’s alone')

// ── The helpers say what flow.ts says ───────────────────────────────────────────────────────────────────────
const norm = v => peek1(`SELECT public.mkt_level_norm($1::jsonb)`, [JSON.stringify(v)])
check(await norm({ kind: 'person', staff: S.mei }), { ids: [S.mei], rule: 'any' }, 'a legacy person level')
check(await norm({ kind: 'pic', all: true }), { ids: ['pic'], rule: 'any', picAll: true }, 'a legacy both-PICs level')
check(await norm({ kind: 'assign' }), { ids: ['assign'], rule: 'any' }, 'a legacy pick-at-assignment level')
check(await norm({ ids: [S.mei, S.mei, 'pic'], rule: 'all' }), { ids: [S.mei, 'pic'], rule: 'all' }, 'a new level, each id once')
const waits = (lv, ok) => peek1(`SELECT public.mkt_level_waits($1::jsonb, $2::jsonb)`, [JSON.stringify(lv), JSON.stringify(ok)])
check(await waits({ ids: ['a', 'b'], rule: 'any' }, {}), ['a', 'b'], 'any: everybody until one approves')
check(await waits({ ids: ['a', 'b'], rule: 'any' }, { b: 'x' }), [], '…then nobody')
check(await waits({ ids: ['a', 'b'], rule: 'all' }, { b: 'x' }), ['a'], 'all: those who have not')
check(await peek1(`SELECT public.mkt_dept_key('SENIOR VIDEOGRAPHER & VIDEO EDITOR')`), 'content', 'a title read as its group')
check(await peek1(`SELECT public.mkt_dept_key('MARKETING MANAGER')`), '', 'a manager is no group')

// ── Dates: Monday to Friday, no holidays ────────────────────────────────────────────────────────────────────
await db.exec(`INSERT INTO public.att_holidays (day, name, states) VALUES ('2026-11-17', 'A holiday', 'All states')`)
check(await peek(`SELECT idx, starts_on::text AS s, due_on::text AS d FROM public.mkt_stage_dates('2026-11-13', ARRAY[1, 2, 1])`),
  [{ idx: 0, s: '2026-11-13', d: '2026-11-16' }, { idx: 1, s: '2026-11-17', d: '2026-11-18' }, { idx: 2, s: '2026-11-19', d: '2026-11-19' }],
  'Friday + 1 = Monday; the next starts Tuesday — a holiday is a working day now (as flow.ts › flowDates)')

// ── A quick task: no Accept, levels of several ──────────────────────────────────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const st = (name, who, appr = [], more = {}) => ({ name, dept: '', who, sla: 1, appr, form: [], ...more })
const CREATE = `SELECT public.mkt_task_create($1, 'quick', $2, 'social', 'Do it', $3::jsonb, NULL, NULL, NULL, $4::jsonb)`
const create = async (title, stages, pic = null) => (await as(U.josiah, CREATOR), one(CREATE, [CAR, title, JSON.stringify(stages), pic ? JSON.stringify(pic) : null]))
const stagesOf = pid => peek(`SELECT idx, status, dept, appr, appr_idx, appr_ok, ver, entered_at, owner_staff, changes FROM public.mkt_stages
  WHERE project_id = $1 ORDER BY idx`, [pid])
const projOf = async pid => (await peek(`SELECT status, cur, extra_cols, link_code FROM public.mkt_projects WHERE id = $1`, [pid]))[0]
const trail = pid => peek(`SELECT action, actor_name AS actor, stage_idx AS stage, from_to, reason, data FROM public.mkt_events
  WHERE project_id = $1 ORDER BY id`, [pid])
const notices = user => peek(`SELECT title, body FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user])
const fresh = async () => { await asSystem(); await db.exec('DELETE FROM public.app_notifications') }
const submit = async (user, pid) => {
  await as(user, STAFF)
  await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [pid, JSON.stringify({ notes: 'done', vals: {} })])
  return one(`SELECT public.mkt_stage_submit($1)`, [pid])
}
const decide = async (user, pid, approve, reason = null) => {
  await as(user, MANAGER)
  return one(`SELECT public.mkt_stage_decide($1, $2, $3)`, [pid, approve, reason])
}

await as(U.josiah, CREATOR)
await refuses(CREATE, [CAR, 'Bad', JSON.stringify([st('D', S.ali, [{ ids: [S.mei, 'pic'], rule: 'any' }, { ids: ['pic'], rule: 'any' }])]), null],
  /Stage 1: the PIC twice/, 'the PIC once a stage, across levels')
await refuses(CREATE, [CAR, 'Bad', JSON.stringify([st('D', S.ali, [{ ids: [S.mei], rule: 'any' }, { ids: [S.mei, S.josiah], rule: 'all' }])]), null],
  /Stage 1: the same approver twice/, 'a person on one level only')
await refuses(CREATE, [CAR, 'Bad', JSON.stringify([st('D', S.ali, [{ ids: [], rule: 'any' }])]), null], /Stage 1: pick who approves it/,
  'a level with nobody on it')
await refuses(CREATE, [CAR, 'Bad', JSON.stringify([st('D', S.ali, [{ ids: ['assign'], rule: 'any' }])]), null], /Stage 1: pick who approves it/,
  'nobody left to be picked on a quick task')

const ANY = await create('Any one', [st('Design', S.ali, [{ ids: [S.josiah, S.mei], rule: 'any' }])])
let ss = await stagesOf(ANY.id)
check([ss[0].status, ss[0].dept, ss[0].appr], ['accepted', 'design', [{ ids: [S.josiah, S.mei], rule: 'any' }]],
  'no Accept: stage 1 is Ali’s to work at once; its group his team (design); the level in the new shape')
await fresh()
await submit(U.ali, ANY.id)
check([(await notices(U.josiah)).length, (await notices(U.mei)).length], [1, 1], 'submitted: everybody on the level is told')
check((await trail(ANY.id)).at(-1).from_to, 'SIA or Mei', 'the trail names the level: any one of them')
await as(U.ali, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, true, NULL)`, [ANY.id], /This approval is not yours/, 'Ali is not on the level')
await decide(U.mei, ANY.id, true)
check([(await projOf(ANY.id)).status, (await stagesOf(ANY.id))[0].status], ['done', 'done'], 'any: the first approval passes the level — done')

const ALL = await create('All of them', [st('Design', S.ali, [{ ids: [S.josiah, S.mei], rule: 'all' }]), st('Post', S.mei)])
await submit(U.ali, ALL.id)
await decide(U.josiah, ALL.id, true)
ss = await stagesOf(ALL.id)
check([ss[0].status, Object.keys(ss[0].appr_ok)], ['review', [S.josiah]], 'all: one approval kept, the level still waits')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, true, NULL)`, [ALL.id], /This approval is not yours/, '…never twice by the same person')
await decide(U.mei, ALL.id, true)
ss = await stagesOf(ALL.id)
check([ss[0].status, ss[1].status, (await projOf(ALL.id)).cur], ['done', 'accepted', 1], '…the last one passes it: the next stage open, worked at once')

// Three levels in order, each telling the next.
const THREE = await create('Three levels', [st('Design', S.ali, [{ ids: [S.mei], rule: 'any' }, { ids: [S.josiah], rule: 'any' },
  { ids: [S.ali], rule: 'all' }])])
await fresh()
await submit(U.ali, THREE.id)
check([(await notices(U.mei)).length, (await notices(U.josiah)).length], [1, 0], 'level 1 told, level 2 not yet')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, true, NULL)`, [THREE.id], /This approval is not yours/, 'level 2 waits its turn')
await decide(U.mei, THREE.id, true)
check([(await stagesOf(THREE.id))[0].appr_idx, (await notices(U.josiah)).length], [1, 1], 'level 1 passed → level 2, told')
await decide(U.josiah, THREE.id, true)
check((await stagesOf(THREE.id))[0].appr_idx, 2, '→ level 3')
check((await stagesOf(THREE.id))[0].status, 'review', 'level 3 waits for Ali')
await decide(U.ali, THREE.id, true)
check((await projOf(THREE.id)).status, 'done', '…the last level: done')

// Request changes: back to the stage named, the approvals from there to here cleared, the clock restarted.
const BACK = await create('Back to one', [st('Script', S.ali, [{ ids: [S.josiah], rule: 'any' }]),
  st('Edit', S.mei, [{ ids: [S.josiah, S.mei], rule: 'all' }]), st('Final', S.ali, [{ ids: [S.josiah, S.mei], rule: 'all' }], { back: 0 })])
await submit(U.ali, BACK.id)
await decide(U.josiah, BACK.id, true)
await submit(U.mei, BACK.id)
await decide(U.josiah, BACK.id, true)
await decide(U.mei, BACK.id, true)
await submit(U.ali, BACK.id)
await decide(U.josiah, BACK.id, true)
const before = (await stagesOf(BACK.id))[0].entered_at
await fresh()
await decide(U.mei, BACK.id, false, 'Start again')
ss = await stagesOf(BACK.id)
check([(await projOf(BACK.id)).cur, ss.map(s => s.status), ss.map(s => s.appr_ok), ss.map(s => s.appr_idx)],
  [0, ['changes', 'planned', 'planned'], [{}, {}, {}], [0, 0, 0]], 'back to Script; Edit and Final wait again, every approval cleared')
check(ss[0].entered_at > before, true, 'its clock restarted')
check((await notices(U.ali)).map(n => n.title), ['Changes requested on Final — back to Script'], 'its doer told')
// …or it stays, its own approvals cleared.
const STAY = await create('Stays', [st('Design', S.ali, [{ ids: [S.josiah, S.mei], rule: 'all' }])])
await submit(U.ali, STAY.id)
await decide(U.josiah, STAY.id, true)
await decide(U.mei, STAY.id, false, 'Smaller logo')
ss = await stagesOf(STAY.id)
check([ss[0].status, ss[0].appr_ok, ss[0].changes.reason], ['changes', {}, 'Smaller logo'], 'no back: it stays, Josiah’s approval taken back')
await submit(U.ali, STAY.id)
check((await stagesOf(STAY.id))[0].ver, 2, 'submitted again: version 2, asked again')

// The PIC inside a mixed level.
const PIC = { name: 'Kelvin Tan', whatsapp: '+60 12-345 6789' }
const MIX = await create('Mixed level', [st('Design', S.ali, [{ ids: [S.josiah, 'pic'], rule: 'all' }], { picText: 'Logo ok?' })], PIC)
const code = (await projOf(MIX.id)).link_code
await submit(U.ali, MIX.id)
const pageOf = async () => { await as(null, [], 'anon'); return one(`SELECT public.mkt_pic_page($1)`, [code]) }
check((await pageOf()).work[0].stage.waiting, true, 'the PIC’s page: waiting for them')
check((await pageOf()).work[0].stageNames, ['Design'], '…every step named for the step bar')
check((await pageOf()).work[0].brief, 'Do it', '…and 📋 Requirements as written (no template hides them)')
await decide(U.josiah, MIX.id, true)
check([(await stagesOf(MIX.id))[0].status, (await pageOf()).work[0].stage.waiting], ['review', true], 'Josiah in, still waiting for the PIC')
await as(null, [], 'anon')
await one(`SELECT public.mkt_pic_stage_answer($1, $2, 1, 'approve', 'Kelvin Tan', NULL)`, [code, MIX.id])
check((await projOf(MIX.id)).status, 'done', 'the PIC’s approval passes the level')
const MIX2 = await create('Mixed any', [st('Design', S.ali, [{ ids: [S.josiah, 'pic'], rule: 'any' }])], PIC)
await submit(U.ali, MIX2.id)
await decide(U.josiah, MIX2.id, true)
await as(null, [], 'anon')
await refuses(`SELECT public.mkt_pic_stage_answer($1, $2, 1, 'approve', 'Kelvin Tan', NULL)`, [(await projOf(MIX2.id)).link_code, MIX2.id],
  /Nothing is waiting for your approval/, 'any: once Josiah approved, nothing waits for the PIC')

// A table on the PIC's link: its rows, only the columns shown to them, never a Person column.
const PT = await create('Shot list', [st('Shoot', S.ali, ['pic'], { form: [{ label: 'Shots', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Who', type: 'Person' }] }] })], PIC)
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [PT.id, JSON.stringify({ notes: 'Shot list in', vals: { Shots: JSON.stringify([['Wide', S.mei], ['Close', S.ali]]) } })])
check(await peek1(`SELECT work -> 'vals' -> 'Shots' FROM public.mkt_stages WHERE project_id = $1`, [PT.id]), { rows: [['Wide', S.mei], ['Close', S.ali]] },
  'a table saved as the page sends it (its rows as JSON): kept as rows')
await one(`SELECT public.mkt_stage_submit($1)`, [PT.id])
await as(null, [], 'anon')
const ptPage = await one(`SELECT public.mkt_pic_page($1)`, [(await projOf(PT.id)).link_code])
check(ptPage.work[0].stage.fields.find(x => x.name === 'Shots').value, { cols: ['Shot'], rows: [['Wide'], ['Close']] },
  'the PIC reads its rows, the Person column left out')

// ── Reassign ────────────────────────────────────────────────────────────────────────────────────────────────
const RE = await create('Reassign me', [st('Design', S.ali), st('Post', S.ali)])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_stage_reassign($1, 0, $2, 'x')`, [RE.id, S.mei], /the manager's/, 'staff cannot reassign')
await fresh()
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_reassign($1, 0, $2, NULL)`, [RE.id, S.ali], /is on it already/, 'the same person')
await one(`SELECT public.mkt_stage_reassign($1, 0, $2, 'Ali is on leave')`, [RE.id, S.mei])
check((await stagesOf(RE.id))[0].owner_staff, S.mei, 'Mei does it now')
check([(await notices(U.mei))[0].title.startsWith('Your turn: Design'), (await notices(U.ali))[0].title], [true, 'Design of "Reassign me" moved to Mei'],
  'the new person and the old told')
check((await trail(RE.id)).at(-1), { action: 'reassigned', actor: 'SIA', stage: 0, from_to: 'Ali → Mei', reason: 'Ali is on leave', data: null },
  'a line on the trail')
await submit(U.mei, RE.id)
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_reassign($1, 0, $2, NULL)`, [RE.id, S.ali], /is done/, 'a done stage stays')
await one(`SELECT public.mkt_stage_reassign($1, 1, $2, NULL)`, [RE.id, S.mei])

// ── The doer's own table columns ────────────────────────────────────────────────────────────────────────────
const TB = await create('Shots', [st('Shoot', S.ali, [], { form: [{ label: 'Shots', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }] }] })])
const col = (user, op, c) => as(user, STAFF).then(() => one(`SELECT public.mkt_task_column($1, 'Shots', $2, $3::jsonb)`, [TB.id, op, JSON.stringify(c)]))
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_task_column($1, 'Shots', 'add', '{"name":"Lens"}'::jsonb)`, [TB.id], /This stage is not yours/, 'only the doer now')
let r = await col(U.ali, 'add', { name: 'Lens', type: 'Text' })
check(r.cols.map(c => [c.name, c.type, c.by]), [['Lens', 'Text', S.ali]], 'a column of this task only')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_task_column($1, 'Shots', 'add', '{"name":"shot"}'::jsonb)`, [TB.id], /has a column "shot" already/, 'a name once')
await refuses(`SELECT public.mkt_task_column($1, 'Nope', 'add', '{"name":"x"}'::jsonb)`, [TB.id], /not this stage's/, 'a table of its stage')
for (let i = 2; i <= 8; i += 1) r = await col(U.ali, 'add', { name: `C${i}`, type: 'Number' })
await refuses(`SELECT public.mkt_task_column($1, 'Shots', 'add', '{"name":"C9"}'::jsonb)`, [TB.id], /At most 8 columns/, 'at most 8 a table')
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [TB.id, JSON.stringify({ vals: { Shots: { rows: [['A', '50mm', '1', '2', '3', '4', '5', '6', '7']] } } })])
r = await col(U.ali, 'remove', { id: r.cols[0].id })
check([r.cols.length, (await peek1(`SELECT work -> 'vals' -> 'Shots' -> 'rows' FROM public.mkt_stages WHERE project_id = $1`, [TB.id]))],
  [7, [['A', '1', '2', '3', '4', '5', '6', '7']]], 'taken off, its cells with it')
check((await projOf(TB.id)).extra_cols.Shots.length, 7, 'kept on the project')

// ── The overdue sweep ───────────────────────────────────────────────────────────────────────────────────────
const OD = await create('Late one', [st('Design', S.ali), st('Post', S.mei)])
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET overdue = '{"days":2,"notify":["doer","mm","next"],"action":"reassign","repeat":false}' WHERE id = '${OD.id}'`)
await db.exec(`UPDATE public.mkt_stages SET due_on = '2026-11-10', entered_at = '2026-11-01' WHERE project_id = '${OD.id}' AND idx = 0`)
await db.exec('DELETE FROM public.app_notifications')
const sweep = at => as(null, [], 'service_role').then(() => one(`SELECT public.mkt_overdue_sweep($1::timestamptz)`, [at]))
check(await sweep('2026-11-12T09:30:00+08:00'), 0, 'late 1 day (past 18:00 on the 10th): not yet 2')
check(await sweep('2026-11-13T08:30:00+08:00'), 0, 'late 3 days but before 9:00: nobody woken')
check(await sweep('2026-11-13T09:30:00+08:00'), 1, 'late 3 days ≥ 2, from 9:00: told')
check([(await notices(U.ali)).map(n => n.title), (await notices(U.josiah)).map(n => n.title), (await notices(U.mei)).map(n => n.title)],
  [['⏰ Design is 3d overdue'], ['⏰ Design is 3d overdue · reassign it?'], ['⏰ Design is 3d overdue']], 'the doer, the manager (asked to reassign), the next')
check((await trail(OD.id)).at(-1).action, 'overdue', 'a line on the trail')
check(await sweep('2026-11-14T10:00:00+08:00'), 0, 'once: never again')
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET overdue = overdue || '{"repeat":true}' WHERE id = '${OD.id}'`)
check(await sweep('2026-11-13T15:00:00+08:00'), 0, 'repeat: not twice a day')
check(await sweep('2026-11-14T10:00:00+08:00'), 1, 'repeat: again the next day')
const NOD = await create('No rule', [st('Design', S.ali)])
await asSystem()
await db.exec(`UPDATE public.mkt_stages SET due_on = '2026-11-01' WHERE project_id = '${NOD.id}'`)
await db.exec('DELETE FROM public.app_notifications')
await sweep('2026-11-20T10:00:00+08:00')
check((await trail(NOD.id)).at(-1).action, 'overdue', 'a task with no overdue settings (a quick task) gets the default: late 1 day …')
const noRule = async u => (await notices(u)).filter(n => n.body.endsWith('· No rule')).map(n => n.title)
check([await noRule(U.ali), await noRule(U.josiah), await noRule(U.mei)], [['⏰ Design is 19d overdue'], ['⏰ Design is 19d overdue'], []],
  '… the person on it and the managers told (2026-11-13: "当事人 & manager"), nobody else')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_overdue_sweep()`, [], /permission denied/, 'a person cannot call the sweep')

// ── Done: +60 XP each, the finish's recipients told ─────────────────────────────────────────────────────────
const FIN = await create('Finish me', [st('Design', S.ali, [{ ids: [S.josiah], rule: 'any' }]), st('Post', S.mei)])
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET finish = '{"notify":["all"],"after":"feedback","picText":"Ready","celebration":"cheers"}' WHERE id = '${FIN.id}'`)
await submit(U.ali, FIN.id)
await decide(U.josiah, FIN.id, true)
await fresh()
await submit(U.mei, FIN.id)
check(await peek(`SELECT staff, xp FROM public.mkt_pet_log WHERE project_id = $1 AND kind = 'done' ORDER BY staff`, [FIN.id]),
  [S.ali, S.josiah, S.mei].sort().map(s => ({ staff: s, xp: 60 })), '+60 XP to everybody on it (doers and approvers)')
check([(await notices(U.ali)).map(n => n.title), (await notices(U.josiah)).map(n => n.title)],
  [['🏁 Done: Finish me'], ['🏁 Done: Finish me']], 'everybody on it told (Mei finished it herself)')
check((await trail(FIN.id)).at(-1).data, { xp: 60, told: 2 }, 'the trail: closed')

// ── A product's deliverable: copied from its version, never changed by a later one ─────────────────────────
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: false, project: true, file: false, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const cat = await one(`SELECT public.mkt_wf_category_add('Image post', NULL)`)
let wf = await peek(`SELECT id, draft_rev FROM public.mkt_workflows WHERE id = $1`, [cat.id])
const STAGES = [
  { sid: 'sdesign01', name: 'Design', dept: 'design', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ ids: [S.josiah, 'pic'], rule: 'all' }] },
  { sid: 'spost0001', name: 'Post', dept: 'social', who: { mode: 'prev', cands: [S.ali, S.mei] }, sla: 1, appr: [{ ids: ['assign'], rule: 'any' }] }]
const CANVAS = { req: { pic: true }, sections: [
  { id: 'xdesign', emoji: '🎨', title: 'Design', stage: 'sdesign01', req: false, pic: true, fields: [
    { id: 'fimage', label: 'Image', type: 'File', stage: 'sdesign01', req: true, pic: true },
    { id: 'fsizes', label: 'Sizes', type: 'Table', stage: 'sdesign01', req: false, pic: false, cols: [
      { id: 'kw', name: 'Width', type: 'Number', stage: 'sdesign01', req: true, pic: true }] }] },
  { id: 'xpost', emoji: '📣', title: 'Post', stage: 'spost0001', pic: false, fields: [{ id: 'fcap', label: 'Caption', type: 'Text', stage: 'spost0001', req: true, pic: true }] }] }
let saved = await one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [cat.id, wf[0].draft_rev, JSON.stringify({ stages: STAGES, canvas: CANVAS,
  overdue: { days: 2, notify: ['doer'], action: 'remind', repeat: false }, finish: { notify: ['mm'], after: 'close', picText: 'Done!', celebration: 'confetti' } })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [cat.id, saved.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Pack', intake: minutes.id, price: 900,
  effectiveFrom: TODAY, groups: [{ name: 'Design', items: [{ name: 'Image post', qty: 1, price: 900, workflow: cat.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'approved' WHERE id = '${P}'`)
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
const D = (await peek(`SELECT id, overdue, finish FROM public.mkt_projects WHERE parent_id = $1`, [P]))[0]
check([D.overdue.days, D.overdue.repeat, D.finish.picText, D.finish.notify], [2, false, 'Done!', ['mm']], 'the version’s overdue and finish on the deliverable')
const dst = await peek(`SELECT idx, dept, mode, appr, spec FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [D.id])
check(dst.map(s => [s.dept, s.mode, s.appr]), [['design', 'assign', STAGES[0].appr], ['social', 'prev', STAGES[1].appr]],
  'its stages: the group keys, the levels as the version has them (assign waits for the plan)')
check(dst[0].spec.sid, 'sdesign01', 'each stage keeps its sid')
check(dst[0].spec.form.map(f => [f.label, f.section, f.sectionTitle, f.req, f.pic]), [['Image', 'xdesign', 'Design', true, true], ['Sizes', 'xdesign', 'Design', false, false]],
  'its fields: the canvas’s of its sid — ⭐ either, 👁 both (Sizes hidden from the PIC)')
check(dst[0].spec.form[1].cols[0], { id: 'kw', name: 'Width', type: 'Number', stage: 'sdesign01', req: true, pic: true }, 'a table’s columns with their own stage')
check(dst[1].spec.form.map(f => [f.label, f.pic]), [['Caption', false]], 'a field in a section the PIC does not see: hidden')
// A new version published: the running deliverable keeps its own.
wf = await peek(`SELECT draft_rev FROM public.mkt_workflows WHERE id = $1`, [cat.id])
saved = await one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [cat.id, wf[0].draft_rev, JSON.stringify({
  stages: [{ ...STAGES[0], sla: 5, appr: [] }, STAGES[1]], overdue: { days: 5, notify: ['mm'], action: 'remind', repeat: true } })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [cat.id, saved.rev])
check([(await peek1(`SELECT overdue ->> 'days' FROM public.mkt_projects WHERE id = $1`, [D.id])),
  (await peek(`SELECT appr FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [D.id]))[0].appr],
  ['2', STAGES[0].appr], 'a version published later never changes the running task')
// The plan resolves 'assign' and takes several on a level.
await refuses(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D.id, JSON.stringify({ start: TODAY, stages: [
  { owner: S.ali, sla: 2, appr: STAGES[0].appr }, { owner: '', sla: 1, appr: [{ ids: ['assign'], rule: 'any' }] }] })],
  /Stage 2 \(Post\): pick who approves it/, 'the plan picks who “picked at assignment” is')
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D.id, JSON.stringify({ start: TODAY, stages: [
  { owner: S.ali, sla: 2, appr: STAGES[0].appr }, { owner: '', sla: 1, appr: [{ ids: [S.josiah, S.mei], rule: 'any' }] }] })])
ss = await stagesOf(D.id)
check([ss[0].status, ss[1].appr], ['accepted', [{ ids: [S.josiah, S.mei], rule: 'any' }]], 'planned: stage 1 worked at once (no Accept), several on a level')

// ── The readers ─────────────────────────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const page = await one(`SELECT public.mkt_project($1)`, [D.id])
check([page.manages, page.me, page.project.overdue.days, page.project.finish.picText, page.project.wf, page.project.sections.map(s => s.title)],
  [true, S.josiah, 2, 'Done!', { category: 'Image post', tname: 'Standard', version: 1 }, ['Design', 'Post']], 'mkt_project: settings, workflow, sections, the viewer')
check([page.stages[0].levels, page.stages[0].apprOk, page.stages[0].picText], [STAGES[0].appr, {}, null], 'each stage’s levels, approvals, PIC words')
const board = await one(`SELECT public.mkt_board($1::date, $2::date)`, [TODAY, TODAY])
const bs = board.stages.find(s => s.project === ALL.id && s.idx === 0)
check([bs.levels, Object.keys(bs.apprOk).sort()], [[{ ids: [S.josiah, S.mei], rule: 'all' }], [S.josiah, S.mei].sort()], 'mkt_board: levels and approvals')
// My turn in the shell: the level now's people.
const W = await create('Waits on two', [st('Design', S.ali, [{ ids: [S.josiah, S.mei], rule: 'all' }])])
await submit(U.ali, W.id)
await as(U.mei, STAFF)
const meiTurn = (await one(`SELECT public.mkt_shell()`)).counts.myspace
await decide(U.mei, W.id, true)
await as(U.mei, STAFF)
check((await one(`SELECT public.mkt_shell()`)).counts.myspace, meiTurn - 1, 'approved her part: off Mei’s turn while it still waits for Josiah')

console.log(`marketing wf engine v2: ${checks} checks passed`)
