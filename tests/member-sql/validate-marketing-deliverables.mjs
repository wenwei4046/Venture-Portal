// Local PostgreSQL regression for 20261025032000 (2026-10-24 — Marketing ②b-2a: a product project's deliverables and
// their Assignment Plan; the user's answers 10 and 17). Marketing's migrations up to the groups run, then this one, twice.
// What is under test: who may call what; the work started only after the PIC's approval (or once started before it),
// each action × its quantity a deliverable with its workflow version's stages (a locked template's all the manager's,
// none split; the canvas's own fields of a stage on it); a plan checked and saved — the start day, its people, its
// approvals, its days skipping weekends and Selangor's holidays, everybody on it told once; not on the board before its
// day; replanned before it opens; once open, a stage done stays, a change of hands says why and is Accepted again; a field
// its template marks not required never asked for; the product project done with its last deliverable. No live I/O.
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

const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), outsider: id(4) }
const S = { josiah: id(11), mei: id(12), ali: id(13), outsider: id(14) }

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
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

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
    ('${U.outsider}', 'Outsider', 'out@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Sales', 'fair');
  INSERT INTO public.titles (id, name) VALUES
    ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'), ('${id(307)}', 'SALES ADVISOR');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.outsider}', 'OUT SIDER', NULL, '${U.outsider}', '${id(307)}', '${id(202)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261025031000_marketing_groups_selangor.sql']
for (const m of MIGS) await db.exec(await sql(m))
const deliv = await sql('20261025032000_marketing_deliverables.sql')
await db.exec(deliv)
await db.exec(deliv) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_product_begin(uuid)', 'mkt_deliverable_plan(uuid,jsonb)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_product_settle(uuid)', 'EXECUTE')`), false, 'mkt_product_settle is the functions’ own')
check(await one(`SELECT has_function_privilege('service_role', 'public.mkt_product_settle(uuid)', 'EXECUTE')`), true, '…the service role keeps it')

// ── What the project runs on: two workflows (one locked), a minutes template, a product ──
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = async (d, n) => one(`SELECT (($1::date) + $2::integer)::text`, [d, n])
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }, { name: 'Objective', type: 'Long text' }],
  rules: { sign: false, pic: false, project: true, file: true, lock: true } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const IMAGE_STAGES = [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], form: [{ label: 'Final image', type: 'File' }] },
  { name: 'Caption', dept: 'VIDEOGRAPHER', who: { mode: 'prev', cands: [S.ali, S.mei] }, sla: 1, appr: [{ kind: 'person', staff: S.josiah }],
    form: [{ label: 'Caption', type: 'Text' }, { label: 'Hashtags', type: 'Text', req: false }] },
  { name: 'Publish', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, appr: [{ kind: 'assign' }], split: true, form: [] },
]
const image = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard',
  stages: IMAGE_STAGES,
  canvas: { req: { pic: true }, sections: [{ emoji: '💬', title: 'Caption', stage: 1, fields: [
    { label: 'Post day', type: 'Date', stage: 1, req: true, pic: true, cal: { kind: 'post', pic: true } },
    { label: 'Mood', type: 'Text', stage: 1 }] }] } })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [image.id, image.rev])
const reel = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Reel', tname: 'Locked', locked: true,
  stages: [{ name: 'Script', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, form: [] },
    { name: 'Edit', dept: 'VIDEOGRAPHER', who: { mode: 'prev', cands: [S.mei] }, sla: 1, split: true, form: [] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [reel.id, reel.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Social Pack', intake: minutes.id, price: 1900,
  effectiveFrom: TODAY, groups: [
    { name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: 500, workflow: image.id }, { name: 'Banner', qty: 0, price: 1, workflow: image.id }] },
    { name: 'Video', items: [{ name: 'Reel', qty: 1, price: 900, workflow: reel.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const started = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])
const P = started.id

// ── The work starts: after the PIC's approval, or once started before it ─────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_product_begin($1)`, [P], /Starting the work is the manager's/, 'the staff cannot start the work')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_begin($1)`, [id(999)], /That project is not there/, 'a project there is')
await refuses(`SELECT public.mkt_product_begin($1)`, [P], /The work starts once the PIC approves the minutes/, 'not while the minutes are written')
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'waiting_pic' WHERE id = '${P}'`)
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_begin($1)`, [P], /The work starts once the PIC approves/, 'nor while the PIC has not answered')
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'approved' WHERE id = '${P}'`)
await as(U.josiah, MANAGER)
const begun = await one(`SELECT public.mkt_product_begin($1)`, [P])
check(begun.deliverables, 3, 'each action × its quantity: two image posts and a reel (a quantity of 0 makes none)')
await refuses(`SELECT public.mkt_product_begin($1)`, [P], /Its work has started already/, 'once')
const ds = await peek(`SELECT * FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [P])
const TRACK = started.track
check(ds.map(d => [d.track_id, d.kind, d.title, d.status, d.workflow_name, d.owner_staff, d.pic_name]), [
  [`${TRACK}-D01`, 'deliverable', 'Image post 1/2', 'planning', 'Image post · Standard', S.josiah, null],
  [`${TRACK}-D02`, 'deliverable', 'Image post 2/2', 'planning', 'Image post · Standard', S.josiah, null],
  [`${TRACK}-D03`, 'deliverable', 'Reel', 'planning', 'Reel · Locked', S.josiah, null],
], 'its deliverables: the product’s Track ID with -Dnn, each named for what it is, its workflow, not planned yet')
check(ds[1].deliv, { group: 'Graphic design', item: 'Image post', n: 2, of: 2 }, '…what each is of the product')
check([ds[0].workflow_version, ds[0].product_version], [1, 1], '…on the versions the product names')
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [P]), 'active', 'the product project runs')
check((await peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [P])).at(-1),
  { action: 'work started', data: { deliverables: 3 } }, '…its trail says so')
const [D1, D2, D3] = ds.map(d => d.id)
const stagesOf = async d => peek(`SELECT idx, name, dept, mode, cands, sla, appr, split, spec, status, owner_staff, starts_on::text AS starts,
  due_on::text AS due, entered_at, accepted_at FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [d])
let st1 = await stagesOf(D1)
check(st1.map(s => [s.name, s.dept, s.mode, s.cands, s.sla, s.split, s.status, s.owner_staff]), [
  ['Design', 'GRAPHIC DESIGNER', 'assign', [], 2, false, 'planned', null],
  ['Caption', 'VIDEOGRAPHER', 'prev', [S.ali, S.mei], 1, false, 'planned', null],
  ['Publish', 'VIDEOGRAPHER', 'assign', [], 1, true, 'planned', null],
], 'its stages as the template’s version has them: who picks, the candidates, the days, subtasks')
check(st1.map(s => s.appr), [[{ kind: 'pic' }], [{ kind: 'person', staff: S.josiah }], [{ kind: 'assign' }]], '…and who approves each')
check(st1[1].spec.form.map(f => [f.label, f.req, f.section ?? null]), [
  ['Caption', true, null], ['Hashtags', false, null], ['Post day', true, 'Caption'], ['Mood', false, 'Caption'],
], 'a stage’s fields: its own, then the canvas’s own fields of it, with their section')
check(st1[1].spec.form[2].cal, { kind: 'post', label: 'Post day', pic: true }, '…a date with its kind on the calendar')
const st3 = await stagesOf(D3)
check(st3.map(s => [s.mode, s.split]), [['assign', false], ['assign', false]], 'a locked template: every stage the manager’s to assign, none split')

// ── Not on the board, read on the product's page ─────────────────────────────────
await as(U.mei, STAFF)
let board = await one(`SELECT public.mkt_board()`)
check(board.projects.map(p => p.trackId), [TRACK], 'a deliverable not planned is not on the board — its product project is')
let page = await one(`SELECT public.mkt_product_project($1)`, [TRACK])
check(page.deliverables.map(d => [d.trackId, d.title, d.status, d.stages, d.done, d.stage.name, d.stage.status, d.stage.owner]), [
  [`${TRACK}-D01`, 'Image post 1/2', 'planning', 3, 0, 'Design', 'planned', null],
  [`${TRACK}-D02`, 'Image post 2/2', 'planning', 3, 0, 'Design', 'planned', null],
  [`${TRACK}-D03`, 'Reel', 'planning', 2, 0, 'Script', 'planned', null],
], 'the product’s page lists its deliverables, each where it stands')
let task = await one(`SELECT public.mkt_project($1)`, [`${TRACK}-D03`])
check([task.project.kind, task.project.parent.trackId, task.project.deliv.item, task.project.locked],
  ['deliverable', TRACK, 'Reel', true], 'a deliverable’s page names its product, what it is of it, its template locked')
await refuses(`SELECT public.mkt_stage_accept($1)`, [D1], /That task is not open \(planning\)/, 'nobody works on a deliverable not planned')

// ── The plan: checked ─────────────────────────────────────────────────────────────
// A Selangor holiday is skipped, another state's is not.
await asSystem()
const START = await one(`SELECT d::date::text FROM generate_series(($1::date) + 7, ($1::date) + 20, '1 day') d WHERE extract(isodow FROM d) = 1 LIMIT 1`, [TODAY])
await db.exec(`INSERT INTO public.att_holidays (day, name, states) VALUES ('${await plus(START, 1)}', 'Selangor day', 'Selangor'),
  ('${await plus(START, 2)}', 'Penang day', 'Penang')`)
await as(U.mei, STAFF)
const plan = (stages, start = START, reasons = undefined) => JSON.stringify({ start, stages, ...(reasons ? { reasons } : {}) })
const GOOD = [
  { owner: S.ali, appr: [{ kind: 'pic' }], sla: 2 },
  { owner: null, appr: [{ kind: 'person', staff: S.josiah }], sla: 1 },
  { owner: S.mei, appr: [{ kind: 'person', staff: S.josiah }], sla: 1, split: true, extra: ' + talent ' },
]
await refuses(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D1, plan(GOOD)], /Planning the work is the manager's/, 'the staff do not plan')
await as(U.josiah, MANAGER)
const bad = async (p, pattern, what, d = D1) => refuses(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [d, p], pattern, what)
await bad(plan(GOOD.slice(0, 2)), /The plan names 2 stages; this deliverable has 3/, 'a stage each')
await bad(JSON.stringify({ stages: GOOD }), /Pick the day it starts/, 'a start day')
await bad(plan(GOOD, await plus(TODAY, -1)), /Pick the day it starts — today or later/, 'today or later')
await bad(plan(GOOD, await plus(TODAY, 401)), /within the next 400 days/, 'not too far ahead')
await bad(plan([{ ...GOOD[0], owner: null }, GOOD[1], GOOD[2]]), /Stage 1 \(Design\): choose someone/, 'the first stage is always somebody’s')
await bad(plan([GOOD[0], GOOD[1], { ...GOOD[2], owner: null }]), /Stage 3 \(Publish\): choose someone/, '…and a stage the manager assigns')
await bad(plan([{ ...GOOD[0], owner: S.outsider }, GOOD[1], GOOD[2]]), /Stage 1 \(Design\): pick a person on Marketing's team/, 'somebody on the team')
await bad(plan([GOOD[0], GOOD[1], { ...GOOD[2], appr: [{ kind: 'assign' }] }]), /Stage 3 \(Publish\): pick who approves it/, 'an approval picked at assignment is picked')
await bad(plan([GOOD[0], GOOD[1], { ...GOOD[2], appr: [{ kind: 'person', staff: S.outsider }] }]), /pick who approves it/, '…from the team')
await bad(plan([{ ...GOOD[0], appr: [{ kind: 'pic' }, { kind: 'pic' }] }, GOOD[1], GOOD[2]]), /the same approval twice/, 'one approval once')
await bad(plan([{ ...GOOD[0], appr: [{ kind: 'pic' }, { kind: 'person', staff: S.josiah }, { kind: 'person', staff: S.mei }, { kind: 'person', staff: S.ali }] }, GOOD[1], GOOD[2]]),
  /at most 3 approvals/, 'at most three levels')
await bad(plan([{ ...GOOD[0], sla: 0 }, GOOD[1], GOOD[2]]), /1 to 30 working days/, 'one to thirty days')
await bad(plan([{ ...GOOD[0], appr: 'pic' }, GOOD[1], GOOD[2]]), /not a list of approvals/, 'approvals are a list')

// ── Saved ─────────────────────────────────────────────────────────────────────────
await asSystem()
await db.exec(`DELETE FROM public.app_notifications`)
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D1, plan(GOOD)])).reassigned, 0, 'a plan saved')
st1 = await stagesOf(D1)
// Mon START: Design's 2 days — Tue is Selangor's holiday (skipped), Wed Penang's (kept) — due Thu; Caption Fri, its one day;
// Publish Mon, past the weekend (as every task's: the first stage's start day is not one of its days, a later stage's is).
const dayOf = async n => plus(START, n)
check(st1.map(s => [s.starts, s.due]), [
  [START, await dayOf(3)], [await dayOf(4), await dayOf(4)], [await dayOf(7), await dayOf(7)],
], 'its dates: from the start day, each stage its working days, the weekend and Selangor’s holiday skipped (not Penang’s)')
check(st1.map(s => [s.owner_staff, s.status, s.split]), [[S.ali, 'todo', false], [null, 'planned', false], [S.mei, 'planned', true]],
  'its people — the second picked by the first when it finishes — stage 1 its person’s to Accept')
check(st1[2].appr, [{ kind: 'person', staff: S.josiah }], '…its approvals as planned')
check((await peek(`SELECT extra FROM public.mkt_stages WHERE project_id = $1 AND idx = 2`, [D1]))[0].extra, '+ talent', '…the words beside a person, tidied')
check(await peek1(`SELECT (entered_at AT TIME ZONE 'Asia/Kuala_Lumpur')::text FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [D1]),
  `${START} 00:00:00`, 'stage 1 opens on the start day')
let d1 = (await peek(`SELECT status, cur, starts_on::text AS starts, due_on::text AS due FROM public.mkt_projects WHERE id = $1`, [D1]))[0]
check(d1, { status: 'active', cur: 0, starts: START, due: await dayOf(7) }, 'the deliverable runs, from its start day to its last stage’s')
check((await peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [D1])).map(e => [e.action, e.data]), [['planned', { start: START }]],
  'its trail: planned, from when')
const notes = await peek(`SELECT user_id, title, body FROM public.app_notifications ORDER BY user_id`)
check(notes.map(n => [n.user_id, n.title]), [
  [U.mei, 'You\'re on the plan for "Image post 1/2"'], [U.ali, 'You\'re on the plan for "Image post 1/2"'],
].sort((a, b) => a[0].localeCompare(b[0])), 'everybody on it hears once — not the manager who planned it')
check(notes.find(n => n.user_id === U.ali).body, `${TRACK}-D01 · Stage 1 · Design · starts ${Number(START.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(START.slice(5, 7)) - 1]}`,
  '…at the first stage they are on, and when it starts')
await as(U.mei, STAFF)
board = await one(`SELECT public.mkt_board()`)
check(board.projects.map(p => p.trackId), [TRACK], 'a deliverable before its start day is not on the board yet')

// ── Replanned before it opens: no reasons asked ───────────────────────────────────
await as(U.josiah, MANAGER)
const LATER = await plus(START, 7)
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D1, plan([{ ...GOOD[0], owner: S.mei }, GOOD[1], GOOD[2]], LATER)])
st1 = await stagesOf(D1)
check([st1[0].owner_staff, st1[0].starts, st1[0].status], [S.mei, LATER, 'todo'], 'before it opens, the plan changes freely — another day, another person')
check((await peek(`SELECT action FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [D1])).map(e => e.action), ['planned', 'replanned'], '…the trail says replanned')

// ── Opened today; the manager's own first stage is accepted already ──────────────
const D2PLAN = [{ owner: S.josiah, appr: [{ kind: 'pic' }], sla: 1 }, { owner: S.ali, appr: [{ kind: 'person', staff: S.josiah }], sla: 1 },
  { owner: S.mei, appr: [], sla: 1 }]
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D2, plan(D2PLAN, TODAY)])
let st2 = await stagesOf(D2)
check([st2[0].status, st2[0].accepted_at !== null], ['accepted', true], 'a start day of today opens it now — the manager’s own stage accepted')
await as(U.mei, STAFF)
board = await one(`SELECT public.mkt_board()`)
check(board.projects.map(p => [p.trackId, p.kind, p.parent]).sort(), [[TRACK, 'product', null], [`${TRACK}-D02`, 'deliverable', P]],
  'open, it is on the board — naming its product project')

// ── Once open: the start day stays, a change of hands says why ───────────────────
await as(U.josiah, MANAGER)
await bad(plan(D2PLAN, await plus(TODAY, 1)), /It has opened — its start day stays/, 'the start day stays', D2)
await bad(plan([{ ...D2PLAN[0], owner: S.ali }, D2PLAN[1], D2PLAN[2]], TODAY), /Stage 1 \(Design\): say why it changes hands/, 'a change of hands says why', D2)
await bad(plan([{ ...D2PLAN[0], owner: S.ali }, D2PLAN[1], D2PLAN[2]], TODAY, { 0: 'MC' }), /say why it changes hands — 5 to 300/, '…in a few words', D2)
await bad(plan([{ ...D2PLAN[0], sla: 3 }, D2PLAN[1], D2PLAN[2]], TODAY), /Stage 1 \(Design\) has begun — its working days stay/, 'a stage begun keeps its days', D2)
await asSystem()
await db.exec(`DELETE FROM public.app_notifications`)
await as(U.josiah, MANAGER)
const moved = await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D2,
  plan([{ ...D2PLAN[0], owner: S.ali }, D2PLAN[1], { ...D2PLAN[2], sla: 2 }], TODAY, { 0: 'Josiah is at the fair all week' })])
check(moved.reassigned, 1, 'changed hands, with its reason')
st2 = await stagesOf(D2)
check([st2[0].owner_staff, st2[0].status, st2[0].accepted_at, st2[2].sla], [S.ali, 'todo', null, 2],
  'the stage now open is the new person’s to Accept again; a stage not begun takes its new days')
const ev = (await peek(`SELECT action, stage_idx, stage_name, from_to, reason, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [D2])).slice(1)
check(ev.map(e => [e.action, e.stage_idx, e.from_to, e.reason]), [
  ['reassigned', 0, 'SIA → Ali', 'Josiah is at the fair all week'], ['plan changed', null, null, null],
], 'the trail: who it moved from and to, and why; the rest of the plan changed')
check((await peek(`SELECT user_id, title FROM public.app_notifications`)).map(n => [n.user_id, n.title]), [[U.ali, 'Your turn: Design']],
  'the new person hears it is their turn (the one it moved from is the manager — nobody tells themselves)')

// ── Worked: a stage done stays; waiting for its approval, its people stay ────────
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D2])
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [D2, JSON.stringify({ vals: { 'Final image': 'https://canva.com/x' } })])
await one(`SELECT public.mkt_stage_submit($1)`, [D2])
check(await peek1(`SELECT status FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [D2]), 'review', 'submitted to its PIC')
await as(U.josiah, MANAGER)
await bad(plan([{ ...D2PLAN[0], owner: S.mei }, D2PLAN[1], { ...D2PLAN[2], sla: 2 }], TODAY, { 0: 'Ali is away now' }),
  /Stage 1 \(Design\) waits for its approval — change it after/, 'a stage waiting for its approval keeps its people', D2)

// ── A field its template marks not required is never asked for ───────────────────
check(await peek1(`SELECT public.mkt_stage_missing($1::jsonb, '{}'::jsonb)`, [JSON.stringify(st1[1].spec)]), ['Caption', 'Post day'],
  'what a stage asks for: its required fields — never one marked not required')
check(await peek1(`SELECT public.mkt_stage_missing('{"form":[{"label":"Topic","type":"Text"}]}'::jsonb, '{}'::jsonb)`), ['Topic'],
  '…a quick task’s fields, required as ever')
check(await peek1(`SELECT public.mkt_stage_missing('{"form":[{"label":"Mood","type":"Text","req":false}]}'::jsonb, '{}'::jsonb)`), [],
  '…a stage of only optional fields asks nothing (no note demanded either)')

// ── Done with its last deliverable ────────────────────────────────────────────────
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'cancelled' WHERE id IN ('${D1}', '${D2}')`)
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D3, plan([{ owner: S.josiah, sla: 1 }, { owner: S.josiah, sla: 1 }], TODAY)])
for (let i = 0; i < 2; i++) {
  if (i) await one(`SELECT public.mkt_stage_accept($1)`, [D3])
  await one(`SELECT public.mkt_stage_save($1, '{"notes":"done"}'::jsonb)`, [D3])
  await one(`SELECT public.mkt_stage_submit($1)`, [D3])
}
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [D3]), 'done', 'its last stage done, the deliverable is')
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [P]), 'done', '…and a one-time product project with its last deliverable')
check((await peek(`SELECT action FROM public.mkt_events WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [P]))[0].action, 'closed', '…its trail says closed')
await as(U.josiah, MANAGER)
await bad(plan([{ owner: S.mei, sla: 1 }, { owner: S.josiah, sla: 1 }], TODAY, { 0: 'Too late now' }), /Its product project is not running \(done\)/, 'a product project done takes no plan', D3)
page = await one(`SELECT public.mkt_product_project($1)`, [TRACK])
check(page.deliverables.map(d => [d.title, d.status, d.done, d.stages]), [
  ['Image post 1/2', 'cancelled', 0, 3], ['Image post 2/2', 'cancelled', 0, 3], ['Reel', 'done', 2, 2],
], 'the product’s page: each deliverable’s stages done ÷ all')

// ── The constraints ──────────────────────────────────────────────────────────────
await asSystem()
await assert.rejects(q(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title) VALUES ('MKT-CAR-2610-099-D01', 'deliverable', '${CAR}', 'x')`),
  /mkt_projects_parent_check/, 'a deliverable has its product project')
checks++
await assert.rejects(q(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title) VALUES ('MKT-CAR-2610-099-X01', 'quick', '${CAR}', 'x')`),
  /mkt_projects_track_id_check/, 'a Track ID of its own shape')
checks++

console.log(`marketing deliverables: ${checks} checks passed`)
