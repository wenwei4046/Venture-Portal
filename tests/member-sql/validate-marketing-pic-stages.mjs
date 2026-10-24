// Local PostgreSQL regression for 20261025033000 (2026-10-24 — Marketing ②b-2d-1: the PIC decides a deliverable's
// stage on their link, `PIC Task Link.dc.html`). Marketing's migrations up to the deliverables run, then this one,
// twice. What is under test, as the stranger the page is (anon, no session): the work on the PIC's page — each planned
// deliverable, the stage waiting for them, only what they may see of it (never an internal field, a note, the team's
// notes); an answer only on the code's own deliverables, only while a stage waits for the PIC, only on the version
// they read; changes back to the owner or to the stage the template names; approved on to the next approval or the
// next stage; who is told; the trail. No live I/O.
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
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)
const asStranger = () => as(null, [], 'anon')

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true), ('${id(104)}', 'Hookka', 'HK', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261025031000_marketing_groups_selangor.sql',
  '20261025032000_marketing_deliverables.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025033000_marketing_pic_stages.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_pic_page(text)', 'mkt_pic_stage_answer(text,uuid,integer,text,text,text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), true, `the publishable key calls ${fn} — by name`)
}

// ── A product project, approved, its one deliverable planned for today ─────────────
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], picText: 'Check the logo size',
    form: [{ label: 'Final image', type: 'File' }, { label: 'Internal cost', type: 'Text', pic: false }, { label: 'Read the brief', type: 'Note' },
      { label: 'Designer', type: 'Person', req: false }] },
  { name: 'Caption', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, back: 0,
    appr: [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }], form: [{ label: 'Caption', type: 'Text' }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: minutes.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const HK = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'HK'`)
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
const OTHER = (await one(`SELECT public.mkt_product_start($1, $2)`, [HK, prod.id])).id
const CODE = 'a'.repeat(32), CODE2 = 'b'.repeat(32)
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'approved', link_code = '${CODE}', pic_name = 'Kelvin' WHERE id = '${P}';
  UPDATE public.mkt_projects SET status = 'approved', link_code = '${CODE2}', pic_name = 'Hana' WHERE id = '${OTHER}';`)
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
await one(`SELECT public.mkt_product_begin($1)`, [OTHER])
const D = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [P])
const D_OTHER = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [OTHER])
const plan = owners => JSON.stringify({ start: TODAY, stages: [
  { owner: owners[0], appr: [{ kind: 'pic' }], sla: 2 },
  { owner: owners[1], appr: [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }], sla: 1 },
] })
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, plan([S.ali, S.mei])])
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D_OTHER, plan([S.ali, S.mei])])

// ── What the PIC reads of the work ───────────────────────────────────────────────
await asStranger()
let page = await one(`SELECT public.mkt_pic_page($1)`, [CODE])
check(page.work.map(w => [w.title, w.status, w.stages, w.done, w.stage.name, w.stage.status, w.stage.waiting]),
  [['Image post', 'active', 2, 0, 'Design', 'todo', false]], 'the work: each deliverable planned — only this project’s — its stage now, not waiting for them yet')
check(page.work[0].stage.fields.map(f => f.name), ['Final image', 'Designer'],
  'what the PIC may see of a stage: its fields for them — never one marked internal, never a note')
check(page.work[0].stage.note, 'Check the logo size', '…and the words the template has for them')

// ── Worked, submitted to the PIC ──────────────────────────────────────────────────
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D])
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [D, JSON.stringify({ notes: 'team-only: the client is fussy',
  links: [{ url: 'https://canva.com/draft-1', label: 'Draft' }], vals: { 'Final image': 'https://canva.com/final-1', 'Internal cost': 'RM 120', Designer: S.ali } })])
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
page = await one(`SELECT public.mkt_pic_page($1)`, [CODE])
const w = page.work[0]
check([w.stage.status, w.stage.waiting, w.stage.ver], ['review', true, 1], 'submitted: waiting for the PIC, version 1')
check(w.stage.fields.map(f => [f.name, f.value]), [['Final image', 'https://canva.com/final-1'], ['Designer', 'Ali']],
  'the fields as filled in — a person by their first name')
check(w.stage.links, [{ url: 'https://canva.com/draft-1', label: 'Draft' }], '…and its links')
const raw = JSON.stringify(page)
check([raw.includes('RM 120'), raw.includes('fussy'), raw.includes(S.ali)], [false, false, false],
  'never the internal field, never the team’s notes, never a staff id')

// ── The answer: only the code's own, only waiting, only the version read ─────────
const answer = (code, project, ver, decision, name, reason = null) =>
  one(`SELECT public.mkt_pic_stage_answer($1, $2, $3, $4, $5, $6)`, [code, project, ver, decision, name, reason])
const bad = (args, pattern, what) => refuses(`SELECT public.mkt_pic_stage_answer($1, $2, $3, $4, $5, $6)`, args, pattern, what)
await bad(['nope', D, 1, 'approve', 'Kelvin Tan', null], /This link is closed/, 'a code of nobody’s')
await bad(['c'.repeat(32), D, 1, 'approve', 'Kelvin Tan', null], /This link is closed/, '…however well formed')
await bad([CODE2, D, 1, 'approve', 'Hana Lee', null], /Nothing is waiting for your approval on it now/, 'another project’s PIC cannot answer it')
await bad([CODE, D_OTHER, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting for your approval on it now/, '…nor this PIC another project’s deliverable')
await bad([CODE, D, 0, 'approve', 'Kelvin Tan', null], /sent a newer version since you opened this page/, 'only the version they read')
await bad([CODE, D, 1, 'approve', 'Ke', null], /Type your full name to sign off/, 'a full name to approve')
await bad([CODE, D, 1, 'changes', 'Kelvin Tan', 'meh'], /Say what should change — 5 to 1,000/, 'a reason for changes')
await bad([CODE, D, 1, 'maybe', 'Kelvin Tan', null], /Approve, or say what should change/, 'approve or changes')

// ── Changes: back to the stage's owner ───────────────────────────────────────────
await asSystem()
await db.exec(`DELETE FROM public.app_notifications`)
await asStranger()
page = await answer(CODE, D, 1, 'changes', 'Kelvin Tan', 'The logo is too small')
check([page.work[0].stage.status, page.work[0].stage.waiting, page.work[0].last.action, page.work[0].last.reason],
  ['changes', false, 'pic changes', 'The logo is too small'], 'their changes: the stage back with its owner, their words on their page')
let st = (await peek(`SELECT status, changes FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [D]))[0]
check([st.status, st.changes.by, st.changes.staff, st.changes.reason], ['changes', 'Kelvin Tan (PIC)', null, 'The logo is too small'], '…as an approver’s changes, by the PIC')
let ev = (await peek(`SELECT actor_user, actor_name, action, stage_name, from_to, reason, version FROM public.mkt_events WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [D]))[0]
check(ev, { actor_user: null, actor_name: 'Kelvin Tan (PIC)', action: 'pic changes', stage_name: 'Design', from_to: 'Ali', reason: 'The logo is too small', version: 'v1' },
  'the trail names the PIC')
check((await peek(`SELECT user_id, title FROM public.app_notifications ORDER BY title`)).map(n => [n.user_id, n.title]), [
  [U.ali, 'Changes requested on Design'], [U.josiah, 'Kelvin Tan (PIC) asked for changes on Design'],
], 'the stage’s owner hears it, and the deliverable’s')
await bad([CODE, D, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting for your approval on it now/, 'one answer per sending')

// ── Approved: the stage done, the next one open ─────────────────────────────────
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
await bad([CODE, D, 1, 'approve', 'Kelvin Tan', null], /newer version/, 'version 2 now — the PIC reloads')
page = await answer(CODE, D, 2, 'approve', 'Kelvin Tan')
check([page.work[0].done, page.work[0].stage.name, page.work[0].stage.status, page.work[0].last.action],
  [1, 'Caption', 'todo', 'pic approved'], 'approved, its last level: the stage done, the next one open')
ev = (await peek(`SELECT actor_name, action, stage_name, version FROM public.mkt_events WHERE project_id = $1 AND action = 'pic approved'`, [D]))[0]
check(ev, { actor_name: 'Kelvin Tan (PIC)', action: 'pic approved', stage_name: 'Design', version: 'v2' }, '…the trail says who and which version')

// ── A person first, then the PIC; their changes go back to the stage the template names ──
await as(U.mei, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D])
await one(`SELECT public.mkt_stage_save($1, '{"vals":{"Caption":"Year-end sale!"}}'::jsonb)`, [D])
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
await bad([CODE, D, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting for your approval on it now/, 'a person’s approval comes first')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_stage_decide($1, true)`, [D])
await asStranger()
page = await one(`SELECT public.mkt_pic_page($1)`, [CODE])
check([page.work[0].stage.name, page.work[0].stage.waiting], ['Caption', true], 'then the PIC’s turn')
page = await answer(CODE, D, 1, 'changes', 'Kelvin', 'Start over with a bigger logo')
const stages = await peek(`SELECT idx, status, changes FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [D])
check(stages.map(s => [s.idx, s.status]), [[0, 'changes'], [1, 'planned']], 'back to the stage the template names; the one between waits again')
check([stages[0].changes.from, stages[0].changes.by], ['Caption', 'Kelvin (PIC)'], '…saying where it came from')
check(await peek1(`SELECT cur FROM public.mkt_projects WHERE id = $1`, [D]), 0, '…where the work stands now')

// ── A closed project's link ──────────────────────────────────────────────────────
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'cancelled' WHERE id = '${P}'`)
await asStranger()
check(await one(`SELECT public.mkt_pic_page($1)`, [CODE]), null, 'a cancelled project’s link is closed')
await bad([CODE, D, 1, 'approve', 'Kelvin Tan', null], /This link is closed/, '…and takes no answer')

console.log(`marketing PIC stages: ${checks} checks passed`)
