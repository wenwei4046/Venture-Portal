// Local PostgreSQL regression for 20261024002000 (2026-10-23 — Marketing's 📦 product projects, the first part: ②b of the
// Claude Design handoff "HOUZS Marketing Module Setup"). Marketing's migrations up to the canvas run, then this one, twice.
// What is under test: who may call what; the products on sale at their version in effect; a project started on it with its
// intake minutes; the page; minutes written (each kind of answer, the team, never over another's save), signed by those
// who attended, sent (every required field, the PIC, the signatures; a link nobody guesses); started before approval with
// a reason; resent after changes; approved, then changed where the PIC sees (back to the PIC) or not; no PIC sign-off
// (complete, locked, approved). No live I/O.
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

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql']
for (const m of MIGS) await db.exec(await sql(m))
const pp = await sql('20261024002000_marketing_product_projects.sql')
await db.exec(pp)
await db.exec(pp) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
const CALLS = ['mkt_product_picker()', 'mkt_product_start(uuid,uuid)', 'mkt_product_project(text)', 'mkt_minutes_fill(uuid,integer,jsonb)',
  'mkt_minutes_sign(uuid)', 'mkt_minutes_send(uuid,integer)', 'mkt_project_override(uuid,text)', 'mkt_project_resend(uuid)']
for (const fn of CALLS) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['mkt_product_in_effect(uuid)', 'mkt_minutes_value(jsonb,jsonb)', 'mkt_minutes_missing(jsonb,jsonb)', 'mkt_minutes_attendees(jsonb,jsonb)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `…the service role keeps ${fn}`)
}
for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
  check(await one(`SELECT has_table_privilege('authenticated', 'public.mkt_minutes', '${p}')`), false, `no client ${p} on mkt_minutes`)
}
check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mkt_minutes'::regclass`), true, 'mkt_minutes: row security on')
check(await peek1(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_minutes'`), 'none', 'mkt_minutes has its line in the history’s register')

// ── What the projects start from: a minutes template, a workflow, products ────────
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = async n => one(`SELECT (($1::date) + $2::integer)::text`, [TODAY, n])
const FIELDS = [
  { name: 'Project', type: 'Project link', lock: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true },
  { name: 'Attendees', type: 'People', lock: true, pic: true },
  { name: 'Objective', type: 'Long text', req: true, pic: true },
  { name: 'Budget note', type: 'Short text' },
  { name: 'Posts', type: 'Number', pic: true },
  { name: 'Shots', type: 'Table', pic: true, cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Date' }] },
  { name: 'Free', type: 'Free space' },
  { name: 'Signatures', type: 'Signature' },
]
const mkTemplate = async (name, rules) => {
  const t = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name, fields: FIELDS, rules })])
  await one(`SELECT public.mkt_minutes_publish($1, $2)`, [t.id, t.rev])
  return t.id
}
const KICKOFF = await mkTemplate('Kickoff', { sign: true, pic: true, project: true, file: true, lock: true })
const QUIET = await mkTemplate('Quiet kickoff', { sign: false, pic: false, project: true, file: true, lock: true })
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard',
  stages: [{ name: 'Design', dept: 'design', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const mkProduct = async (name, intake, effective, publish = true) => {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"recurring"}'::jsonb)`)
  const s = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name, intake, price: 4800, effectiveFrom: effective,
    groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 4, price: 1200, workflow: wf.id }] }] })])
  if (publish) await one(`SELECT public.mkt_product_publish($1, $2)`, [p.id, s.rev])
  return p.id
}
const SMA = await mkProduct('Social Media Package A', KICKOFF, TODAY)
const QUIETP = await mkProduct('Quiet package', QUIET, TODAY)
const LATER = await mkProduct('Later package', KICKOFF, await plus(5))
const DRAFT = await mkProduct('Draft package', KICKOFF, TODAY, false)
// A product whose v2 takes effect tomorrow is still sold at v1 today.
let r2 = await one(`SELECT public.mkt_product_save($1, $3, $2::jsonb)`,
  [SMA, JSON.stringify({ name: 'Social Media Package A+', effectiveFrom: await plus(1) }), await peek1(`SELECT draft_rev FROM public.mkt_products WHERE id = $1`, [SMA])])
await one(`SELECT public.mkt_product_publish($1, $2)`, [SMA, r2.rev])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
await db.exec(`UPDATE public.mkt_subsidiaries SET pic_name = 'Kelvin', pic_whatsapp = '+60 12-345 6789' WHERE code = 'CAR'`)

// ── The picker: products on sale, at their version in effect ──────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_product_picker()`, [], /Starting a product project is the manager's/, 'the staff cannot pick a product')
await as(U.josiah, MANAGER)
const picked = await one(`SELECT public.mkt_product_picker()`)
check(picked.map(p => [p.name, p.version]).sort(), [['Quiet package', 1], ['Social Media Package A', 1]],
  'the products on sale today, each at its version in effect — not one taking effect later, not a draft')
check(picked.find(p => p.version === 1 && p.name.startsWith('Social')).intake, { id: KICKOFF, name: 'Kickoff', version: 1, fields: FIELDS.length },
  '…with the intake minutes it names')

// ── Started ───────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_product_start($1, $2)`, [CAR, SMA], /Starting a product project is the manager's/, 'the staff cannot start one')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_start($1, $2)`, [id(999), SMA], /Pick who the project is for/, 'for a subsidiary there is')
for (const [p, what] of [[LATER, 'a product taking effect later'], [DRAFT, 'a product never published']]) {
  await refuses(`SELECT public.mkt_product_start($1, $2)`, [CAR, p], /That product is not on sale today/, `not ${what}`)
}
const st = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, SMA])
const YM = await one(`SELECT to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YYMM')`)
check(st.track, `MKT-CAR-${YM}-001`, 'a product project’s Track ID')
let proj = (await peek(`SELECT * FROM public.mkt_projects WHERE id = $1`, [st.id]))[0]
check([proj.kind, proj.status, proj.product_id, proj.product_version, proj.owner_staff, proj.pic_name, proj.pic_whatsapp, proj.link_code],
  ['product', 'minutes', SMA, 1, S.josiah, 'Kelvin', '+60 12-345 6789', null], 'made on the version in effect, the subsidiary’s PIC, no link yet')
check(proj.title.startsWith('Carres · Social Media Package A · '), true, 'named for whom, what and the month')
let min = (await peek(`SELECT * FROM public.mkt_minutes WHERE project_id = $1`, [st.id]))[0]
check([min.intake, min.title, min.template_id, min.template_version, min.status, min.vals], [true, 'Kickoff', KICKOFF, 1, 'draft', { Attendees: [S.josiah] }],
  'its intake minutes: the product’s template at the version it names; whoever started it attends')

// ── The page ──────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
let page = await one(`SELECT public.mkt_product_project($1)`, [st.track.toLowerCase()])
check([page.project.track, page.project.status, page.project.product.name, page.minutes.length, page.minutes[0].template.name],
  [st.track, 'minutes', 'Social Media Package A', 1, 'Kickoff'], 'the staff read the project, its product and its minutes')
check(page.minutes[0].template.fields.length, FIELDS.length, '…with the template’s fields')
check(page.trail.map(e => e.action), ['created'], '…and the trail')
await as(U.outsider, [])
await refuses(`SELECT public.mkt_product_project($1)`, [st.track], /Marketing is not open to your account/, 'nobody outside Marketing reads it')

// ── Written in ────────────────────────────────────────────────────────────────────
const fill = (rev, patch) => one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [min.id, rev, JSON.stringify(patch)])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_minutes_fill($1, 1, '{"notes":"x"}'::jsonb)`, [min.id], /Writing the minutes is the manager's/, 'the staff do not write the minutes')
await as(U.josiah, MANAGER)
const bad = (patch, pattern, what) => refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [min.id, min.rev, JSON.stringify(patch)], pattern, what)
await bad({ vals: { Nope: 'x' } }, /"Nope" is not on these minutes/, 'only the template’s fields')
await bad({ vals: { 'Meeting date': '2026-02-30' } }, /"Meeting date": a date/, 'a real date')
await bad({ vals: { Posts: 'four' } }, /"Posts": a number/, 'a number')
await bad({ vals: { Attendees: [S.outsider] } }, /"Attendees": somebody who is not on the team/, 'attendees from the team')
await bad({ vals: { Shots: { rows: [['Opening']] } } }, /"Shots": a row is one short line per column/, 'a table’s rows fit its columns')
await bad({ vals: { Project: 'x' } }, /"Project" is not written in/, 'the project link fills itself')
await bad({ whatsapp: 'call me' }, /A WhatsApp number, digits only/, 'a WhatsApp number')
await refuses(`SELECT public.mkt_minutes_fill($1, 0, '{"notes":"x"}'::jsonb)`, [min.id], /changed these minutes since you opened them/, 'never over another’s save')
let f1 = await fill(1, { vals: { 'Meeting date': await plus(2), Attendees: [S.josiah, S.mei, S.mei], Posts: ' 6 ', Objective: 'Year-end walk-ins',
  Shots: { rows: [['Opening', await plus(3)], ['', '']] }, Free: { cols: ['Item', 'Owner'], rows: [['Props', 'Mei']] } }, notes: 'Kelvin wants red', pic: ' Kelvin Tan ' })
check([f1.rev, f1.status, f1.reapproval], [2, 'minutes', false], 'saved, counted')
min = (await peek(`SELECT * FROM public.mkt_minutes WHERE id = $1`, [min.id]))[0]
check(min.vals.Attendees, [S.josiah, S.mei], 'attendees, each once')
check([min.vals.Posts, min.notes], ['6', 'Kelvin wants red'], 'a number as written, the notes')
check((await peek1(`SELECT pic_name FROM public.mkt_projects WHERE id = $1`, [st.id])), 'Kelvin Tan', 'the PIC named on the intake minutes')
f1 = await fill(2, { vals: { Objective: null } })
check((await peek1(`SELECT vals ? 'Objective' FROM public.mkt_minutes WHERE id = $1`, [min.id])), false, 'a field cleared')

// ── Signed ────────────────────────────────────────────────────────────────────────
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_minutes_sign($1)`, [min.id], /Only those who attended sign/, 'somebody who did not attend cannot sign')
await as(U.mei, STAFF)
check((await one(`SELECT public.mkt_minutes_sign($1)`, [min.id])).rev, 3, 'an attendee signs — the minutes’ count stays (nobody’s save is refused for it)')
check((await one(`SELECT public.mkt_minutes_sign($1)`, [min.id])).rev, 3, '…twice is once')
check(Object.keys((await peek(`SELECT signed FROM public.mkt_minutes WHERE id = $1`, [min.id]))[0].signed), [S.mei], 'Mei signed')

// ── Sent ──────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const send = rev => one(`SELECT public.mkt_minutes_send($1, $2)`, [min.id, rev])
await refuses(`SELECT public.mkt_minutes_send($1, 3)`, [min.id], /Still to fill in: Objective/, 'every required field filled')
await fill(3, { vals: { Objective: 'Year-end walk-ins' } })
await refuses(`SELECT public.mkt_minutes_send($1, 4)`, [min.id], /Waiting for signatures: SIA./, 'every attendee signed')
await one(`SELECT public.mkt_minutes_sign($1)`, [min.id])
// Taking an attendee off takes their signature away.
await fill(4, { vals: { Attendees: [S.josiah] } })
check(Object.keys((await peek(`SELECT signed FROM public.mkt_minutes WHERE id = $1`, [min.id]))[0].signed), [S.josiah], 'an attendee taken off no longer signs')
await fill(5, { vals: { Attendees: [S.josiah, S.mei] } })
await as(U.mei, STAFF)
await one(`SELECT public.mkt_minutes_sign($1)`, [min.id])
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_minutes_send($1, 5)`, [min.id], /changed these minutes since you opened them/, 'sent as the caller saw them')
await fill(6, { whatsapp: null })
await refuses(`SELECT public.mkt_minutes_send($1, 7)`, [min.id], /Add the PIC's WhatsApp/, 'the PIC reachable on WhatsApp when they approve on the link')
await fill(7, { whatsapp: '+60 12-345 6789' })
const sent = await send(8)
check([sent.status, sent.minutes, /^[0-9a-f]{32}$/.test(sent.link)], ['waiting_pic', 'sent', true], 'sent: the project waits for the PIC on a link nobody guesses')
proj = (await peek(`SELECT * FROM public.mkt_projects WHERE id = $1`, [st.id]))[0]
check([proj.link_code, proj.link_sent_at !== null], [sent.link, true], 'the link kept, and when it went')
await refuses(`SELECT public.mkt_minutes_send($1, 9)`, [min.id], /These minutes were sent already/, 'sent once')
// Changed while the PIC has not answered: they read the latest.
check((await fill(9, { vals: { Objective: 'Year-end walk-ins, Penang too' } })).status, 'waiting_pic', 'edited while waiting: still waiting')

// ── Started before approval ───────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_project_override($1, 'Urgent launch')`, [st.id], /Starting before the PIC approves is the manager's/, 'the staff cannot')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_project_override($1, 'now')`, [st.id], /Say why — 5 to 300 characters/, 'a reason')
check((await one(`SELECT public.mkt_project_override($1, ' Launch is Monday ')`, [st.id])).override.reason, 'Launch is Monday', 'started before approval, the reason kept')
await refuses(`SELECT public.mkt_project_override($1, 'Launch is Monday')`, [st.id], /started before approval already/, 'once')

// ── The PIC's answer (their page comes next — set here as it will be) ─────────────
await refuses(`SELECT public.mkt_project_resend($1)`, [st.id], /Nothing was sent back to resend/, 'nothing to resend while waiting')
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'changes', pic_reply = '{"decision":"changes","name":"Kelvin","reason":"Add Penang"}' WHERE id = '${st.id}'`)
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_project_resend($1)`, [st.id])).status, 'waiting_pic', 'resent after the changes they asked for')
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'approved' WHERE id = '${st.id}'`)
await db.exec(`UPDATE public.mkt_minutes SET status = 'completed', completed_at = now(), completed_by = 'Kelvin Tan' WHERE id = '${min.id}'`)
await as(U.josiah, MANAGER)
let rev = (await peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [min.id]))
const internal = await fill(rev, { vals: { 'Budget note': 'RM 300 boost' }, whatsapp: '+60 11-111 1111', notes: 'call Tuesday' })
check([internal.reapproval, internal.status], [false, 'approved'], 'approved, then an internal change: no re-approval')
const seen = await fill(rev + 1, { vals: { 'Meeting date': await plus(4) } })
check([seen.reapproval, seen.status, seen.minutes], [true, 'waiting_pic', 'sent'], 'approved, then a change the PIC sees: back to the PIC')
check((await peek(`SELECT action, reason FROM public.mkt_events WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [st.id]))[0],
  { action: 'edited after approval', reason: 'Meeting date' }, '…in the trail, with what changed')

// ── No PIC sign-off: the minutes complete, locked, the project approved ───────────
const qp = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, QUIETP])
check(qp.track, `MKT-CAR-${YM}-002`, 'the next Track ID')
const qm = (await peek(`SELECT * FROM public.mkt_minutes WHERE project_id = $1`, [qp.id]))[0]
await one(`SELECT public.mkt_minutes_fill($1, 1, $2::jsonb)`, [qm.id, JSON.stringify({ vals: { 'Meeting date': TODAY, Objective: 'Brand refresh' } })])
const qs = await one(`SELECT public.mkt_minutes_send($1, 2)`, [qm.id])
check([qs.status, qs.minutes], ['approved', 'completed'], 'no PIC sign-off: complete, and approved')
check((await peek(`SELECT locked, completed_by FROM public.mkt_minutes WHERE id = $1`, [qm.id]))[0], { locked: true, completed_by: 'SIA' },
  'locked as the template says, completed by the manager')
await refuses(`SELECT public.mkt_minutes_fill($1, 3, '{"notes":"x"}'::jsonb)`, [qm.id], /These minutes are locked/, 'locked minutes are not written over')
await refuses(`SELECT public.mkt_minutes_sign($1)`, [qm.id], /These minutes are complete/, 'complete minutes are not signed')

// The quick tasks' page reader is untouched: a product project is read by its own.
check(await one(`SELECT public.mkt_product_project($1)`, ['TSK-CAR-0000-001']), null, 'nothing for a Track ID there is not')

console.log(`marketing product projects: ${checks} checks passed`)
