// Local PostgreSQL regression for 20261025035000 (2026-10-24 — Marketing ②b-2d-2b, the user's answer 29: "one PIC's
// approval is enough unless a step needs both — set per approval (any / all)"). Marketing's migrations up to the two PICs
// run, then this one, twice. What is under test: the minutes template's *Both PICs sign off* (kept only where a PIC signs
// off); the minutes waiting for both PICs — the first approval kept for the sending, the same PIC refused twice, either
// PIC's changes sending them back, a resending asking both again, a new second PIC after approval asked too, one PIC
// alone enough; a stage's level asking both — kept by the plan, one PIC level a stage, waiting only for the PIC yet to
// answer, a new version asking both again; who is told; the trail. No live I/O.
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
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql',
  '20261025034000_marketing_two_pics.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025035000_marketing_pic_both.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── The minutes template's rule: both PICs sign off — only where a PIC signs off ──
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const FIELDS = [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }]
const loose = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Loose', fields: FIELDS,
  rules: { sign: false, pic: false, picAll: true, project: true, file: true, lock: false } })])
check((await peek1(`SELECT rules FROM public.mkt_minutes_templates WHERE id = $1`, [loose.id])).picAll, false, 'both PICs sign off only where a PIC signs off at all')
const tpl = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff', fields: FIELDS,
  rules: { sign: false, pic: true, picAll: true, project: true, file: true, lock: false } })])
check((await peek1(`SELECT rules FROM public.mkt_minutes_templates WHERE id = $1`, [tpl.id])).picAll, true, '…and is kept there')
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [tpl.id, tpl.rev])

// ── A product, a client with two PICs ─────────────────────────────────────────────
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], form: [{ label: 'Final image', type: 'File' }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: tpl.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const ACME = (await one(`SELECT public.mkt_sub_add('Acme Sdn Bhd', 'Kelvin')`)).id
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [ACME, JSON.stringify({ whatsapp: '0123456789', pic2: 'Hana Lee', whatsapp2: '0132221111' })])

// A product project for it, its minutes sent; its two links.
async function started() {
  await as(U.josiah, MANAGER)
  const s = await one(`SELECT public.mkt_product_start($1, $2)`, [ACME, prod.id])
  const rev = await peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [s.minutes])
  await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [s.minutes, rev, JSON.stringify({ vals: { Attendees: [S.josiah] } })])
  const sent = await one(`SELECT public.mkt_minutes_send($1, $2)`, [s.minutes, rev + 1])
  return { id: s.id, minutes: s.minutes, l1: sent.link, l2: sent.link2 }
}
const status = id => peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [id])
const answer = (code, decision, name, reason = null) => one(`SELECT public.mkt_pic_answer($1, $2, $3, $4)`, [code, decision, name, reason])

// ── The minutes: both PICs sign off ──────────────────────────────────────────────
let A = await started()
await asStranger()
let p1 = await answer(A.l1, 'approve', 'Kelvin Tan')
check([p1.status, p1.both, Object.keys(p1.ok ?? {})], ['waiting_pic', true, ['1']], 'the first PIC approves: kept, the minutes wait for the second')
check(await status(A.id), 'waiting_pic', '…still waiting')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [A.l1], /You approved already — the minutes wait for Hana Lee/, 'the same PIC twice: refused, saying who it waits for')
let p2 = await one(`SELECT public.mkt_pic_page($1)`, [A.l2])
check([p2.status, p2.ok?.['1']?.name], ['waiting_pic', 'Kelvin Tan'], 'the second PIC reads whose approval is in')
p2 = await answer(A.l2, 'approve', 'Hana Lee')
check([p2.status, p2.reply.pic, Object.keys(p2.ok).sort()], ['approved', 2, ['1', '2']], 'the second approves: both in — approved')
check((await peek(`SELECT actor_name, data FROM public.mkt_events WHERE project_id = $1 AND action = 'pic approved' ORDER BY id`, [A.id]))
  .map(e => [e.actor_name, e.data.waiting ?? null]), [['Kelvin Tan (PIC)', 'Hana Lee'], ['Hana Lee (PIC)', null]], 'the trail: the first approval waiting for the second, then the second')
await as(U.josiah, MANAGER)
check(Object.keys((await one(`SELECT public.mkt_product_project($1)`, [A.id])).project.picOk).sort(), ['1', '2'], 'the product page reads whose approvals are in')

// Changes from one after the other approved: back at once; resent, everybody approves again.
A = await started()
await asStranger()
await answer(A.l1, 'approve', 'Kelvin Tan')
p2 = await answer(A.l2, 'changes', 'Hana Lee', 'Add the Raya dates')
check([p2.status, p2.reply.pic], ['changes', 2], 'either PIC’s changes send the minutes back at once')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_project_resend($1)`, [A.id])
await asStranger()
p1 = await one(`SELECT public.mkt_pic_page($1)`, [A.l1])
check([p1.status, p1.ok], ['waiting_pic', null], 'resent: the approvals of the last sending no longer count')
p1 = await answer(A.l1, 'approve', 'Kelvin Tan')
check(p1.status, 'waiting_pic', '…so the first PIC approves again, and it waits for the second')

// After approval: a new second PIC must sign off too.
await answer(A.l2, 'approve', 'Hana Lee')
check(await status(A.id), 'approved', 'both in: approved')
await as(U.josiah, MANAGER)
const rev = await peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [A.minutes])
const filled = await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [A.minutes, rev, JSON.stringify({ pic2: 'Aisyah' })])
check([filled.reapproval, await status(A.id)], [true, 'waiting_pic'], 'a new second PIC after approval: both PICs sign off again')

// One PIC on the project: their approval is all it takes.
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [ACME, JSON.stringify({ pic2: null, whatsapp2: null })])
A = await started()
check(A.l2, null, 'one PIC: one link')
await asStranger()
p1 = await answer(A.l1, 'approve', 'Kelvin Tan')
check([p1.status, p1.both], ['approved', false], 'both asked, one PIC: their approval approves')

// ── A stage that asks both PICs ──────────────────────────────────────────────────
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [ACME, JSON.stringify({ pic2: 'Hana Lee', whatsapp2: '0132221111' })])
A = await started()
await asStranger()
await answer(A.l1, 'approve', 'Kelvin Tan')
await answer(A.l2, 'approve', 'Hana Lee')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [A.id])
const D = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [A.id])
const plan = appr => JSON.stringify({ start: TODAY, stages: [{ owner: S.ali, appr, sla: 2 }] })
await refuses(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, plan([{ kind: 'pic' }, { kind: 'pic', all: true }])],
  /the same approval twice/, 'one PIC level a stage, either or both')
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, plan([{ kind: 'pic', all: true }])])
check(await peek1(`SELECT appr FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [D]), [{ kind: 'pic', all: true }], 'the plan keeps both')
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D])
await one(`SELECT public.mkt_stage_save($1, '{"vals":{"Final image":"https://canva.com/v1"}}'::jsonb)`, [D])
await one(`SELECT public.mkt_stage_submit($1)`, [D])
const stageAnswer = (code, ver, decision, name, reason = null) => one(`SELECT public.mkt_pic_stage_answer($1, $2, $3, $4, $5, $6)`, [code, D, ver, decision, name, reason])
await asStranger()
p1 = await one(`SELECT public.mkt_pic_page($1)`, [A.l1])
check([p1.work[0].stage.waiting, p1.work[0].stage.both, p1.work[0].stage.ok], [true, true, null], 'waiting for both, nobody in yet')
p1 = await stageAnswer(A.l1, 1, 'approve', 'Kelvin Tan')
check([p1.work[0].stage.status, p1.work[0].stage.waiting, Object.keys(p1.work[0].stage.ok)], ['review', false, ['1']],
  'the first PIC approves: the stage waits — no longer for them')
await refuses(`SELECT public.mkt_pic_stage_answer($1, $2, 1, 'approve', 'Kelvin Tan', NULL)`, [A.l1, D], /You approved this version already — it waits for Hana Lee/,
  'the same PIC twice: refused')
p2 = await one(`SELECT public.mkt_pic_page($1)`, [A.l2])
check([p2.work[0].stage.waiting, p2.work[0].stage.ok?.['1']?.name], [true, 'Kelvin Tan'], 'the second PIC: waiting for them, the first’s approval in')
await as(U.josiah, MANAGER)
const task = await one(`SELECT public.mkt_project($1)`, [D])
check([task.project.pic2, Object.keys(task.stages[0].picOk)], ['Hana Lee', ['1']], 'the task page reads the second PIC and whose approval is in')
check((await peek(`SELECT title FROM public.app_notifications WHERE title LIKE '%approved Design — waiting for%'`)).map(n => n.title),
  ['Kelvin Tan (PIC) approved Design — waiting for Hana Lee'], 'the stage’s owner hears who approved and who it waits for')

// Changes from the second: back at once; resubmitted, both again.
await asStranger()
p2 = await stageAnswer(A.l2, 1, 'changes', 'Hana Lee', 'Brighter, please')
check(p2.work[0].stage.status, 'changes', 'the other PIC’s changes send it back at once')
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
p1 = await one(`SELECT public.mkt_pic_page($1)`, [A.l1])
check([p1.work[0].stage.ver, p1.work[0].stage.waiting, p1.work[0].stage.ok], [2, true, null], 'a new version: both answer again')
await stageAnswer(A.l2, 2, 'approve', 'Hana Lee')
p1 = await stageAnswer(A.l1, 2, 'approve', 'Kelvin Tan')
check([p1.work[0].status, p1.work[0].stage.status], ['done', 'done'], 'both in: the stage done')
check((await peek(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'pic approved' ORDER BY id`, [D])).map(e => [e.data.pic, e.data.waiting ?? null]),
  [[1, 'Hana Lee'], [2, 'Kelvin'], [1, null]], 'the trail: each approval, the first of a version waiting for the other')

console.log(`marketing both PICs: ${checks} checks passed`)
