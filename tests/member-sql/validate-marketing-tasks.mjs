// Local PostgreSQL regression for 20261023233000 (2026-10-23 — Marketing's quick and recurring tasks, ② of the Claude
// Design handoff "HOUZS Marketing Module Setup"). Both Marketing migrations run VERBATIM, twice, over the stand-ins the
// first one's check uses. What is under test: who may start, work, approve, nudge and pause; the stage machine
// (accept → submit / complete → approve / request changes → the next stage → closed) as hm-store.js runs it; the dates
// (working days, HR's holidays); Track IDs; the notices each step sends; a recurring task's runs — made ahead, opening
// on their day, paused, resumed, ended, its series ending after its last run; the task page's reader. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
/** Read as the database itself, whoever is signed in: the tables and helpers no client reaches. */
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
const U = { josiah: id(1), mei: id(2), ali: id(3), outsider: id(4), principal: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), outsider: id(14), loaned: id(16) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.companies(id uuid PRIMARY KEY, name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text,
    user_id uuid, title_id uuid, department_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.att_holidays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, name text NOT NULL,
    kind text, states text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (route text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (route, tab_id));

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason
  $$;

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'),
    ('${U.outsider}', 'Outsider', 'out@x.my'), ('${U.principal}', 'Principal', 'principal@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES
    ('${id(101)}', 'Carres', 'CAR', true), ('${id(104)}', 'Hookka', 'HK', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Sales', 'fair');
  INSERT INTO public.titles (id, name) VALUES
    ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(305)}', 'SENIOR MARKETING EXECUTIVE'), ('${id(307)}', 'SALES ADVISOR');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.outsider}', 'OUT SIDER', NULL, '${U.outsider}', '${id(307)}', '${id(202)}', 'active'),
    ('${S.loaned}', 'LOANED PERSON', NULL, NULL, '${id(305)}', '${id(201)}', 'active');
`)

const core = (await readFile(new URL('20261023214100_marketing_core.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
const tasks = (await readFile(new URL('20261023233000_marketing_tasks.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(core)
await db.exec(tasks)
await db.exec(core)
await db.exec(tasks) // twice, in order again: nothing changes, nothing breaks
await db.exec(tasks)

const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = async n => one(`SELECT ($1::date + $2::integer)::text`, [today, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const HK = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'HK'`)
const ym = await one(`SELECT to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YYMM')`)

// ── Who may call what ─────────────────────────────────────────────────────────────
const WRITES = ['mkt_task_create(uuid,text,text,text,text,jsonb,jsonb)', 'mkt_stage_accept(uuid)', 'mkt_stage_save(uuid,jsonb)',
  'mkt_stage_submit(uuid,uuid)', 'mkt_stage_decide(uuid,boolean,text)', 'mkt_nudge(uuid)', 'mkt_series_set(uuid,text)', 'mkt_project(text)',
  'mkt_board(date,date)', 'mkt_shell()']
for (const fn of WRITES) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
const HELPERS = ['mkt_staff_name(uuid)', 'mkt_actor()', 'mkt_log(uuid,text,integer,text,text,text,text,jsonb)', 'mkt_notify(uuid,uuid,text,text,text)',
  'mkt_stage_dates(date,integer[])', 'mkt_recur_days(jsonb,date,integer)', 'mkt_next_track(text,text)', 'mkt_stage_missing(jsonb,jsonb)',
  'mkt_run_make(uuid,integer,date)', 'mkt_series_top_up(uuid)', 'mkt_series_settle(uuid)', 'mkt_top_up_due()', 'mkt_advance(uuid)',
  'mkt_open_project(uuid)']
for (const fn of HELPERS) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `${fn}: the service role keeps it`)
}
check(await peek(`SELECT route, tab_id FROM public.permission_page_tabs`), [{ route: '/marketing/new', tab_id: 'mkt.projects' }],
  'New Project is the Projects tab’s page in the database’s registry')

// ── Dates: working days, HR's holidays ────────────────────────────────────────────
await asSystem()
const dates = async (base, slas) => (await peek(`SELECT idx, starts_on::text AS s, due_on::text AS d FROM public.mkt_stage_dates($1::date, $2::integer[])`, [base, slas]))
  .map(r => [r.idx, r.s, r.d])
check(await dates('2027-01-08', [1, 2]), [[0, '2027-01-08', '2027-01-11'], [1, '2027-01-12', '2027-01-13']],
  'Friday + 1 working day = Monday; the next stage starts Tuesday and takes two days')
await q(`INSERT INTO public.att_holidays (day, name) VALUES ('2027-01-11', 'A holiday'), ('2027-01-12', 'Taken back')`)
await q(`UPDATE public.att_holidays SET deleted_at = now() WHERE name = 'Taken back'`)
check(await dates('2027-01-08', [1, 2]), [[0, '2027-01-08', '2027-01-12'], [1, '2027-01-13', '2027-01-14']],
  'a holiday HR keeps is skipped — one taken back is not')
check(await dates('2027-01-09', [3]), [[0, '2027-01-09', '2027-01-14']], 'a task started on a Saturday counts from Monday (the holiday skipped)')

// ── A recurring rule's days (New Project's Repeat) ────────────────────────────────
const days = async (rule, until = '2028-12-31', cap = 999) => (await peek1(`SELECT public.mkt_recur_days($1::jsonb, $2::date, $3)::text[]`, [JSON.stringify(rule), until, cap]))
check(await days({ freq: 'weekly', days: [1, 3], every: 2, start: '2026-11-02', endMode: 'date', end: '2026-11-30' }),
  ['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18', '2026-11-30'], 'every 2 weeks on Monday and Wednesday, weeks counted from the start’s')
check(await days({ freq: 'weekly', days: [5], every: 1, start: '2026-11-02', endMode: 'count', count: 3 }),
  ['2026-11-06', '2026-11-13', '2026-11-20'], 'every Friday, three runs')
check(await days({ freq: 'monthly', mday: 'last', start: '2027-01-15', endMode: 'count', count: 3 }),
  ['2027-01-31', '2027-02-28', '2027-03-31'], 'the last day of each month')
check(await days({ freq: 'monthly', mday: '15', start: '2026-11-16', endMode: 'count', count: 2 }), ['2026-12-15', '2027-01-15'],
  'the 15th, after a start past it')
check((await days({ freq: 'daily', start: '2026-11-01', endMode: 'never' }, '2026-11-10')).length, 10, 'every day, up to the day asked')
check(await days({ freq: 'daily', start: '2026-11-01', endMode: 'date', end: '2026-11-03' }, '2026-11-10', 2), ['2026-11-01', '2026-11-02'],
  'at most so many')

// ── What a stage still needs ──────────────────────────────────────────────────────
const missing = async (spec, work) => one(`SELECT public.mkt_stage_missing($1::jsonb, $2::jsonb)::text[]`, [JSON.stringify(spec), JSON.stringify(work)])
const FORM = { form: [{ label: 'Post link', type: 'Text' }, { label: 'Checked', type: 'Checkbox' }, { label: 'Read me', type: 'Note' },
  { label: 'Items', type: 'Table', cols: [{ name: 'Item', type: 'Text' }] }] }
check(await missing(FORM, {}), ['Post link', 'Checked'], 'each field not filled in — a note and a table are not asked for')
check(await missing(FORM, { vals: { 'Post link': '  ', Checked: false } }), ['Post link', 'Checked'], 'blank text and an unticked box are not filled in')
check(await missing(FORM, { vals: { 'Post link': 'https://x', Checked: true } }), [], 'all filled in')
check(await missing({ form: [] }, {}), ['a note or a link'], 'a stage with no field asks for a note or a link')
check(await missing({ form: [] }, { links: [{ url: 'https://x' }] }), [], '…a link will do')

// ── New Project: a quick task ─────────────────────────────────────────────────────
const stagesA = [
  { name: 'First draft', dept: 'social', who: S.josiah, sla: 1 },
  { name: 'Redesign', dept: 'design', who: S.ali, sla: 2, appr: [S.josiah], form: [{ label: 'Final artwork', type: 'File' }] },
  { name: 'Publish', dept: 'social', who: S.mei, sla: 1, form: [{ label: 'Post link', type: 'Text' }, { label: 'Use #houzs', type: 'Note' }] },
]
const create = (kind, stages, extra = {}) => one(`SELECT public.mkt_task_create($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
  [extra.sub ?? CAR, kind, extra.title ?? 'Price update', extra.type ?? 'social', extra.brief ?? 'Change the price on the banner', JSON.stringify(stages),
    extra.recur ? JSON.stringify(extra.recur) : null])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_task_create($1, 'quick', 'X', 'social', NULL, '[]'::jsonb)`, [CAR], /Starting a task is not open/, 'staff cannot start a task')
await as(U.josiah, MANAGER)
const bad = async (stages, pattern, what, extra = {}) => {
  await assert.rejects(create(extra.kind ?? 'quick', stages, extra), err => pattern.test(String(err.message)), what)
  checks++
}
await bad(stagesA, /Pick a quick task or a recurring task/, 'a product project is not started here', { kind: 'product' })
await bad(stagesA, /Give the task a title/, 'a title', { title: '  ' })
await bad(stagesA, /Pick the kind of work/, 'a kind of work', { type: 'video' })
await bad([], /1 to 20 stages/, 'at least one stage')
await bad([{ ...stagesA[0], who: S.outsider }], /pick a person on Marketing's team/, 'somebody outside Marketing’s team')
await bad([{ ...stagesA[0], sla: 0 }], /1 to 30 working days/, 'an SLA of at least a day')
await bad([{ ...stagesA[0], appr: [S.josiah, S.mei, S.ali, S.josiah] }], /at most 3 approvals/, 'at most three approval levels')
await bad([{ ...stagesA[0], appr: [S.mei, S.mei] }], /the same approver twice/, 'nobody approves twice')
await bad([{ ...stagesA[0], form: [{ label: 'A', type: 'Text' }, { label: 'A', type: 'Date' }] }], /two fields called "A"/, 'field names are a stage’s own')
await bad([{ ...stagesA[0], form: [{ label: 'A', type: 'Video' }] }], /a field of a kind it cannot hold/, 'only the builder’s field kinds')
await bad([{ ...stagesA[0], form: [{ label: 'T', type: 'Table', cols: [] }] }], /a table has 1 to 8 columns/, 'a table has columns')

// HR keeps a holiday on the day a one-day first stage would be due: the task's dates must step over it.
await asSystem()
const firstDue = (await dates(today, [1]))[0][2]
await q(`INSERT INTO public.att_holidays (day, name) VALUES ($1::date, 'Mid-week holiday')`, [firstDue])
const withHoliday = await dates(today, [1, 2, 1])
check(withHoliday[0][2] > firstDue, true, 'the holiday moves the first stage’s due day')
await as(U.josiah, MANAGER)
const made = await create('quick', stagesA)
const TASK = made.id
check([made.track, made.open], [`TSK-CAR-${ym}-001`, TASK], 'a quick task’s Track ID; it opens itself')
const stageRows = async pid => (await peek(`SELECT idx, name, status, owner_staff, starts_on::text AS s, due_on::text AS d, appr, spec FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [pid]))
let st = await stageRows(TASK)
check(st.map(s => [s.name, s.status]), [['First draft', 'accepted'], ['Redesign', 'planned'], ['Publish', 'planned']],
  'the first stage is the creator’s own: it opens accepted; the rest wait')
check(st.map(s => [s.idx, s.s, s.d]), withHoliday, 'each stage dated from today, working days after the one before — HR’s holiday stepped over')
check(st[1].appr, [{ kind: 'person', staff: S.josiah }], 'approvers kept as the board reads them')
check(st[2].spec, { form: [{ label: 'Post link', type: 'Text' }, { label: 'Use #houzs', type: 'Note' }] }, 'the form kept clean')
const proj = async pid => (await peek(`SELECT status, cur, due_on::text AS due, starts_on::text AS starts, owner_staff FROM public.mkt_projects WHERE id = $1`, [pid]))[0]
check(await proj(TASK), { status: 'active', cur: 0, due: st[2].d, starts: today, owner_staff: S.josiah }, 'the task: open, its owner the creator, due when its last stage is')
const noticesOf = async user => (await peek(`SELECT title, body, data ->> 'type' AS type FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, title`, [user]))
check(await noticesOf(U.ali), [{ title: 'You\'re on quick task "Price update"', body: 'Stage 2 · Redesign', type: 'task' }], 'Ali hears he is on it')
check((await noticesOf(U.mei)).map(n => n.body), ['Stage 3 · Publish'], 'Mei hears too')
check(await noticesOf(U.josiah), [], 'the creator is not told what they just did')
const trail = async pid => (await peek(`SELECT action, stage_idx, from_to, reason, version, actor_name FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [pid]))
check((await trail(TASK)).map(e => [e.action, e.actor_name]), [['created', 'SIA'], ['opened', 'SIA']], 'the trail: created, the first stage opened')

await as(U.josiah, MANAGER)
check((await create('quick', [stagesA[0]], { title: 'Second' })).track, `TSK-CAR-${ym}-002`, 'the next number for Carres this month')
check((await create('quick', [stagesA[0]], { title: 'Hookka one', sub: HK })).track, `TSK-HK-${ym}-001`, 'Hookka counts its own')

// ── The stage machine ─────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_stage_accept($1)`, [TASK], /This stage is not yours/, 'only the stage’s owner accepts it')
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_stage_accept($1)`, [TASK])).id, TASK, 'accepting what is already accepted is no harm')
await refuses(`SELECT public.mkt_stage_submit($1)`, [TASK], /Fill in a note or a link/, 'a stage with no field needs a note or a link first')
await refuses(`SELECT public.mkt_stage_save($1, '{"links":[{"url":"javascript:alert(1)"}]}'::jsonb)`, [TASK], /A link starts with https/, 'links are web links')
let saved = await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [TASK, JSON.stringify({ notes: 'Canva link below', links: [{ url: 'https://canva.com/x', label: 'Draft' }], vals: { Nope: 'x' } })])
check(saved.missing, [], 'saved: nothing missing now')
check(await peek1(`SELECT work FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [TASK]),
  { notes: 'Canva link below', links: [{ url: 'https://canva.com/x', label: 'Draft' }], vals: {} }, 'the work kept — a field the stage does not have dropped')
await one(`SELECT public.mkt_stage_submit($1)`, [TASK])
st = await stageRows(TASK)
check(st.map(s => s.status), ['done', 'todo', 'planned'], 'no approver: completed, the next stage opened for its owner')
check((await proj(TASK)).cur, 1, 'the task moved on')
check((await noticesOf(U.ali)).map(n => [n.title, n.type]), [['You\'re on quick task "Price update"', 'task'], ['Your turn: Redesign', 'open']], 'Ali hears it is his turn')

await as(U.ali, VIEW)
await refuses(`SELECT public.mkt_stage_accept($1)`, [TASK], /Working on a stage is not open/, 'Marketing · Edit to work a stage')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_stage_save($1, '{}'::jsonb)`, [TASK], /Accept the stage first/, 'nothing saved before accepting')
await one(`SELECT public.mkt_stage_accept($1)`, [TASK])
await refuses(`SELECT public.mkt_stage_submit($1)`, [TASK], /Fill in Final artwork/, 'the stage’s fields first')
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [TASK, JSON.stringify({ vals: { 'Final artwork': 'https://drive.google.com/a' } })])
await one(`SELECT public.mkt_stage_save($1, '{"notes":"Logo on the left"}'::jsonb)`, [TASK])
check(await peek1(`SELECT work FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [TASK]),
  { notes: 'Logo on the left', links: [], vals: { 'Final artwork': 'https://drive.google.com/a' } }, 'a save sends what changed: the field filled before stays')
await one(`SELECT public.mkt_stage_submit($1)`, [TASK])
st = await stageRows(TASK)
check(st[1].status, 'review', 'with an approver: to review')
check(await peek1(`SELECT ver FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [TASK]), 1, 'version 1')
check((await noticesOf(U.josiah)).map(n => [n.title, n.type]), [['Ali submitted Redesign v1 for your approval', 'review']], 'the approver hears')
await refuses(`SELECT public.mkt_stage_save($1, '{}'::jsonb)`, [TASK], /with its approver now/, 'nothing changed while it is reviewed')

await as(U.mei, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, true)`, [TASK], /This approval is not yours/, 'only the approver now decides')
await as(U.josiah, STAFF)
await refuses(`SELECT public.mkt_stage_decide($1, true)`, [TASK], /Approving is not open/, 'Marketing · Approve to decide')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, false, '  ')`, [TASK], /Say what to change/, 'changes need a reason')
await one(`SELECT public.mkt_stage_decide($1, false, 'Make the logo bigger')`, [TASK])
const changes = await peek1(`SELECT changes FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [TASK])
check([changes.by, changes.reason, changes.ver, changes.staff], ['SIA', 'Make the logo bigger', 1, S.josiah], 'the changes asked, by whom, on which version')
check((await noticesOf(U.ali)).at(-1), { title: 'Changes requested on Redesign', body: '"Make the logo bigger"', type: 'changes' }, 'Ali hears why')

await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_submit($1)`, [TASK])
check(await peek1(`SELECT ver FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [TASK]), 2, 'resubmitted: version 2')
check(await peek1(`SELECT changes FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [TASK]), null, 'the changes asked are behind it')

// Nudge: the manager's, to whoever it waits on, once an hour.
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_nudge($1)`, [TASK], /Nudging is not open/, 'Marketing · Manage to nudge')
await as(U.principal, MANAGER)
let nudge = await one(`SELECT public.mkt_nudge($1)`, [TASK])
check([nudge.who, nudge.already], ['SIA', false], 'it waits on its approver: he is nudged')
check((await noticesOf(U.josiah)).at(-1), { title: 'Principal nudged you: Redesign', body: `TSK-CAR-${ym}-001 · Price update`, type: 'nudge' },
  'the nudge says who and what — the Principal by their login’s name')
check((await one(`SELECT public.mkt_nudge($1)`, [TASK])).already, true, 'not twice within the hour')
check((await noticesOf(U.josiah)).filter(n => n.type === 'nudge').length, 1, '…one notice')

await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_stage_decide($1, true)`, [TASK])
st = await stageRows(TASK)
check(st.map(s => s.status), ['done', 'done', 'todo'], 'approved by the last approver: done, the next opened')
check((await noticesOf(U.mei)).at(-1).title, 'Your turn: Publish', 'Mei’s turn')

await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [TASK])
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [TASK, JSON.stringify({ vals: { 'Post link': 'https://fb.com/p/1' } })])
await one(`SELECT public.mkt_stage_submit($1)`, [TASK])
check(await proj(TASK), { status: 'done', cur: 2, due: st[2].d, starts: today, owner_staff: S.josiah }, 'the last stage done: the task closed')
await refuses(`SELECT public.mkt_stage_accept($1)`, [TASK], /That task is not open \(done\)/, 'a closed task takes nothing more')
check((await trail(TASK)).map(e => [e.action, e.stage_idx, e.from_to, e.reason, e.version]), [
  ['created', null, null, null, null], ['opened', 0, 'SIA', null, null], ['completed', 0, null, null, null], ['opened', 1, 'Ali', null, null],
  ['accepted', 1, null, null, null], ['submitted', 1, 'SIA', null, 'v1'], ['changes', 1, 'Ali', 'Make the logo bigger', 'v1'],
  ['submitted', 1, 'SIA', null, 'v2'], ['nudged', 1, 'SIA', null, null], ['approved', 1, null, null, 'v2'], ['opened', 2, 'Mei', null, null],
  ['accepted', 2, null, null, null], ['completed', 2, null, null, null], ['closed', null, null, null, null],
], 'the whole trail, in order')

// Changes go back to the stage the builder named; it runs forward again from there.
await as(U.josiah, MANAGER)
await bad([{ ...stagesA[0], back: 0 }], /changes go back to an earlier stage/, 'only to an earlier stage')
const BACK = (await create('quick', [
  { name: 'Script', dept: 'content', who: S.mei, sla: 1 },
  { name: 'Edit', dept: 'content', who: S.ali, sla: 1, appr: [S.josiah], back: 0 },
], { title: 'Reel' })).id
check((await stageRows(BACK)).map(s => s.spec), [{ form: [] }, { form: [], back: 0 }], 'where changes go, kept with the stage')
const workStage = async (user, project, note) => {
  await as(user, STAFF)
  await one(`SELECT public.mkt_stage_accept($1)`, [project])
  await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [project, JSON.stringify({ notes: note })])
  await one(`SELECT public.mkt_stage_submit($1)`, [project])
}
await workStage(U.mei, BACK, 'Script v1')
await workStage(U.ali, BACK, 'Cut v1')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_stage_decide($1, false, 'The hook is weak — rewrite the opening')`, [BACK])
check((await stageRows(BACK)).map(s => s.status), ['changes', 'planned'], 'back to the script: it takes the changes, the edit waits for it again')
check((await proj(BACK)).cur, 0, 'the task stands on the script again')
check((await noticesOf(U.mei)).at(-1), { title: 'Changes requested on Edit — back to Script', body: '"The hook is weak — rewrite the opening"', type: 'changes' },
  'the script’s owner hears why, and from which stage')
await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_save($1, '{"notes":"Script v2"}'::jsonb)`, [BACK])
await one(`SELECT public.mkt_stage_submit($1)`, [BACK])
check((await stageRows(BACK)).map(s => s.status), ['done', 'todo'], 'fixed: the edit opens again for its owner')
await workStage(U.ali, BACK, 'Cut v2')
check(await peek1(`SELECT ver FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [BACK]), 2, 'the edit’s next version')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_stage_decide($1, true)`, [BACK])
check((await proj(BACK)).status, 'done', 'approved: done')

// Somebody with no login cannot be nudged.
await as(U.josiah, MANAGER)
const LOAN = (await create('quick', [{ name: 'Ads', dept: 'ads', who: S.loaned, sla: 1 }], { title: 'Loaned' })).id
await refuses(`SELECT public.mkt_nudge($1)`, [LOAN], /LOANED has no login yet/, 'a person with no login is not nudged')

// The Free space: anybody on the task, block by block; a manager anywhere.
const free = (project, op, block) => one(`SELECT public.mkt_free_block($1, $2, $3::jsonb)`, [project, op, JSON.stringify(block)])
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_free_block($1, 'put', '{"id":"abc123","type":"text","text":"hi"}'::jsonb)`, [LOAN],
  /Only the people on this task/, 'somebody not on the task does not write in its free space')
await refuses(`SELECT public.mkt_free_block($1, 'put', '{"id":"x","type":"text"}'::jsonb)`, [TASK], /A block needs its id/, 'each block has its id')
await refuses(`SELECT public.mkt_free_block($1, 'put', '{"id":"abc123","type":"poem"}'::jsonb)`, [TASK], /A text, a heading/, 'four kinds of block')
let blocks = await free(TASK, 'put', { id: 'note01', type: 'check', text: 'Send the final to Kelvin', done: false })
check(blocks.map(b => [b.id, b.type, b.text, b.done, b.by]), [['note01', 'check', 'Send the final to Kelvin', false, 'Ali']], 'Ali, on the task, adds a to-do')
await as(U.mei, STAFF)
blocks = await free(TASK, 'put', { id: 'note02', type: 'text', text: 'Kelvin prefers WhatsApp' })
blocks = await free(TASK, 'put', { id: 'note01', type: 'check', text: 'Send the final to Kelvin', done: true })
check(blocks.map(b => [b.id, b.done, b.by]), [['note01', true, 'Ali'], ['note02', false, 'Mei']],
  'Mei ticks Ali’s to-do and adds her own — neither undoes the other')
await as(U.josiah, MANAGER)
blocks = await free(LOAN, 'put', { id: 'note03', type: 'heading', text: 'Budget' })
check(blocks.length, 1, 'a manager writes on any task')
blocks = await free(TASK, 'remove', { id: 'note02' })
check(blocks.map(b => b.id), ['note01'], 'a block removed')
await as(U.mei, VIEW)
check((await one(`SELECT public.mkt_project($1)`, [TASK])).project.free.map(b => b.text), ['Send the final to Kelvin'], 'the task page reads them')

// ── The task page's reader ────────────────────────────────────────────────────────
await as(U.outsider, [])
await refuses(`SELECT public.mkt_project($1)`, [TASK], /Marketing is not open/, 'Marketing · View to read a task')
await as(U.mei, VIEW)
let page = await one(`SELECT public.mkt_project($1)`, [`tsk-car-${ym}-001`])
check([page.project.id, page.project.brief, page.project.createdBy, page.sub.code], [TASK, 'Change the price on the banner', 'Sia Josiah', 'CAR'],
  'by its Track ID, in any case: the task, its brief, who started it, whom it is for')
check([page.stages.length, page.stages[1].work, page.stages[2].spec.form.length], [3, { notes: 'Logo on the left', links: [], vals: { 'Final artwork': 'https://drive.google.com/a' } }, 2],
  'its stages with their forms and work')
check([page.events.filter(e => e.action !== 'free').length, page.events.filter(e => e.action === 'free').length], [14, 4],
  'its trail — the free space’s writes among it, without their words')
check(page.series, null, 'a quick task is no series’')
check(await one(`SELECT public.mkt_project('TSK-CAR-0000-999')`), null, 'nothing for a Track ID that is not there')

// ── A recurring task ──────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
await bad([stagesA[0]], /Pick how often it repeats/, 'a rule', { kind: 'recurring', recur: { freq: 'hourly' } })
await bad([stagesA[0]], /today or later/, 'not in the past', { kind: 'recurring', recur: { freq: 'daily', start: '2020-01-01', endMode: 'never' } })
await bad([stagesA[0]], /Pick the days of the week/, 'weekly needs days', { kind: 'recurring', recur: { freq: 'weekly', days: [], start: today, endMode: 'never' } })
await bad([stagesA[0]], /After 1 to 60 runs/, 'at most 60 runs', { kind: 'recurring', recur: { freq: 'daily', start: today, endMode: 'count', count: 61 } })
await bad([stagesA[0]], /not before it starts/, 'an end after the start', { kind: 'recurring', recur: { freq: 'daily', start: today, endMode: 'date', end: '2020-01-01' } })
await bad([stagesA[0]], /Pick when it ends/, 'an end', { kind: 'recurring', recur: { freq: 'daily', start: today } })

const runStages = [{ name: 'Post', dept: 'social', who: S.mei, sla: 1, appr: [S.josiah] }, { name: 'Boost', dept: 'ads', who: S.ali, sla: 1 }]
const rec = await create('recurring', runStages, { title: 'Daily post', recur: { freq: 'daily', start: today, endMode: 'count', count: 3 } })
const SERIES = rec.id
check(rec.track, `RCR-CAR-${ym}-005`, 'a recurring task shares Carres’ numbers')
const runs = await peek(`SELECT id, track_id, run_no, starts_on::text AS s, status FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [SERIES])
check(runs.map(r => [r.track_id, r.s, r.status]), [[`${rec.track}-R01`, today, 'active'], [`${rec.track}-R02`, await plus(1), 'active'], [`${rec.track}-R03`, await plus(2), 'active']],
  'its three runs made ahead, one a day, each with its Track ID')
check(rec.open, runs[0].id, 'the first run is the one to open')
check((await peek1(`SELECT recur FROM public.mkt_projects WHERE id = $1`, [SERIES])).runs, [today, await plus(1), await plus(2)], 'the series keeps the days it opens runs on')
check((await stageRows(SERIES)).map(s => [s.name, s.status, s.d]), [['Post', 'planned', null], ['Boost', 'planned', null]], 'the series’ stages are the pattern, undated')
check((await stageRows(runs[1].id)).map(s => [s.idx, s.s, s.d]), await dates(await plus(1), [1, 1]), 'a run’s stages dated from its day')
check((await noticesOf(U.mei)).at(-1), { title: 'You\'re on recurring task "Daily post"', body: 'Stage 1 · Post', type: 'task' }, 'Mei hears once, not per run')

await as(U.mei, STAFF)
let shell = await one(`SELECT public.mkt_shell()`)
const board = await one(`SELECT public.mkt_board()`)
check(board.projects.filter(p => p.series === SERIES).map(p => p.run), [1], 'only the run open today is on the board')
check(board.projects.some(p => p.id === SERIES), true, 'the series is, to draw the runs it will open')
check(shell.counts.myspace, 1, 'Mei’s plate: today’s run, not tomorrow’s')
await refuses(`SELECT public.mkt_stage_accept($1)`, [runs[1].id], /It opens on/, 'a run cannot be accepted before its day')
await refuses(`SELECT public.mkt_stage_accept($1)`, [SERIES], /worked run by run/, 'a series is worked run by run')
await one(`SELECT public.mkt_stage_accept($1)`, [runs[0].id])

page = await one(`SELECT public.mkt_project($1)`, [runs[0].id])
check([page.series.id, page.series.runs.map(r => [r.run, r.stage])], [SERIES, [[1, 'accepted'], [2, 'todo'], [3, 'todo']]], 'a run’s page knows its series and the other runs')

// Paused: the runs not yet open wait; resumed: they open again — one whose day passed meanwhile is skipped.
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_series_set($1, 'pause')`, [SERIES], /Pausing or ending a recurring task is not open/, 'Marketing · Manage to pause')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_series_set($1, 'resume')`, [SERIES], /Only a paused series can be resumed/, 'resume only what is paused')
await one(`SELECT public.mkt_series_set($1, 'pause')`, [SERIES])
const runStatus = async () => (await peek(`SELECT run_no, status FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [SERIES])).map(r => [r.run_no, r.status])
check(await runStatus(), [[1, 'active'], [2, 'paused'], [3, 'paused']], 'paused: today’s run carries on, the others wait')
check((await peek1(`SELECT recur FROM public.mkt_projects WHERE id = $1`, [SERIES])).status, 'paused', 'the series says so')
await asSystem()
await q(`UPDATE public.mkt_projects SET starts_on = $2::date WHERE series_id = $1 AND run_no = 2`, [SERIES, today]) // its day came during the pause
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_series_set($1, 'resume')`, [SERIES])
check(await runStatus(), [[1, 'active'], [2, 'cancelled'], [3, 'active']], 'resumed: the run whose day passed is skipped, the next opens on its day')

// The last run done: the series ends by itself.
await asSystem()
await q(`UPDATE public.mkt_projects SET starts_on = $2::date WHERE series_id = $1 AND run_no = 3`, [SERIES, today]) // its day has come
const finishRun = async run => {
  await as(U.mei, STAFF)
  await one(`SELECT public.mkt_stage_accept($1)`, [run])
  await one(`SELECT public.mkt_stage_save($1, '{"notes":"Posted"}'::jsonb)`, [run])
  await one(`SELECT public.mkt_stage_submit($1)`, [run])
  await as(U.josiah, MANAGER)
  await one(`SELECT public.mkt_stage_decide($1, true)`, [run])
  await as(U.ali, STAFF)
  await one(`SELECT public.mkt_stage_accept($1)`, [run])
  await one(`SELECT public.mkt_stage_save($1, '{"notes":"Boosted RM 50"}'::jsonb)`, [run])
  await one(`SELECT public.mkt_stage_submit($1)`, [run])
}
await finishRun(runs[0].id)
check((await proj(SERIES)).status, 'active', 'one run left open: the series runs on')
await finishRun(runs[2].id)
check((await proj(SERIES)).status, 'done', 'its last run done: the series has ended')
check((await peek1(`SELECT recur FROM public.mkt_projects WHERE id = $1`, [SERIES])).status, 'ended', '…and says so')
check((await trail(SERIES)).map(e => e.action), ['created', 'paused', 'resumed', 'ended'], 'the series’ own trail')

// A series without an end keeps 60 days of runs made; ending it cancels those not yet open.
await as(U.josiah, MANAGER)
const forever = await create('recurring', [runStages[1]], { title: 'Daily boost', recur: { freq: 'daily', start: today, endMode: 'never' } })
check(await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE series_id = $1`, [forever.id]), 61, 'every day of the next 60 made')
check((await peek1(`SELECT recur FROM public.mkt_projects WHERE id = $1`, [forever.id])).runs.length, 401, 'its days known 400 days ahead')
await asSystem()
await peek(`DELETE FROM public.mkt_projects WHERE series_id = $1 AND run_no > 20`, [forever.id]) // as if the days had gone by
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [forever.open]) // any Marketing write tops it up
check(await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE series_id = $1`, [forever.id]), 61, 'topped up again by the next write')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_series_set($1, 'end')`, [forever.id])
check(await peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE series_id = $1 AND status = 'cancelled'`, [forever.id]), 60, 'ended: the runs not yet open cancelled')
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [forever.open]), 'active', '…today’s carries on')
await refuses(`SELECT public.mkt_series_set($1, 'end')`, [forever.id], /has ended already/, 'an ended series stays ended')
await refuses(`SELECT public.mkt_series_set($1, 'stop')`, [SERIES], /has ended already|Pause, resume or end/, 'pause, resume or end — nothing else')

console.log(`marketing tasks: ${checks} checks passed`)
