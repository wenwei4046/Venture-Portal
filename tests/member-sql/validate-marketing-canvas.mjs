// Local PostgreSQL regression for 20261024001000 (2026-10-23 — Marketing's Canvas Template Editor, ③ of the Claude Design
// handoff "HOUZS Marketing Module Setup"). The Marketing migrations up to the Workflow Builder run, a template is made, then
// the canvas migration runs over it, twice. What is under test: only the functions call the helpers; a template made
// before keeps its stages and gets the empty canvas; a stage's section and a field's settings written clean (a note never
// required, a calendar mark only on a date, options only on a choice); the manager's own sections and their limits; the
// canvas following the stages there are; publishing checks it whole and keeps it with the version; a clone copies it.
// No live I/O.
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
const core = await sql('20261023214100_marketing_core.sql')
const tasks = await sql('20261023234000_marketing_tasks.sql')
const workflows = await sql('20261023235500_marketing_workflows.sql')
const canvasMig = await sql('20261024001000_marketing_canvas.sql')
for (const m of [core, tasks, workflows]) await db.exec(m)

const save = (wid, rev, patch) => one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [wid, rev, JSON.stringify(patch)])
const publish = (wid, rev) => one(`SELECT public.mkt_workflow_publish($1, $2)`, [wid, rev])
const clone = wid => one(`SELECT public.mkt_workflow_clone($1)`, [wid])
const list = async () => (await one(`SELECT public.mkt_workflows()`)).workflows
const row = wid => peek(`SELECT * FROM public.mkt_workflows WHERE id = $1`, [wid]).then(r => r[0])
const versions = wid => peek(`SELECT version, stages, canvas FROM public.mkt_workflow_versions WHERE workflow_id = $1 ORDER BY version`, [wid])

// A template made before the canvas: it gets the empty canvas, and its stages are read as they were.
await as(U.josiah, MANAGER)
const old = await save(null, null, { action: 'Design photo', tname: 'Simple',
  stages: [{ name: 'Design', dept: 'design', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], form: [{ label: 'Final image', type: 'File' }] }] })
await asSystem()
for (const m of [canvasMig, canvasMig]) await db.exec(m) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_workflows()', 'mkt_workflow_save(uuid,integer,jsonb)', 'mkt_workflow_publish(uuid,integer)', 'mkt_workflow_clone(uuid)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['mkt_field_extras(jsonb,text,text,boolean,text,boolean)', 'mkt_canvas_stage(jsonb,integer)', 'mkt_canvas_check(jsonb,integer,boolean)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `…not the publishable key’s`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `…the service role keeps ${fn}`)
}
const EMPTY = { req: { pic: true }, sections: [] }
let r = await row(old.id)
check(r.canvas, EMPTY, 'a template made before the canvas has the empty one')

await as(U.mei, ['marketing.view', 'marketing.edit'])
await refuses(`SELECT public.mkt_workflow_save($1, 1, '{"canvas":{}}'::jsonb)`, [old.id], /The Workflow Builder is the manager's/, 'the staff cannot set a canvas')
await as(U.josiah, MANAGER)
check((await list())[0].canvas, EMPTY, 'the reader answers each template’s canvas')
check((await list())[0].draft[0].form[0], { label: 'Final image', type: 'File' }, '…a draft saved before keeps its fields as they were')

// ── A stage's section and a field's settings ──────────────────────────────────────
const STAGES = [
  { name: 'Script', dept: 'content', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }],
    form: [{ label: 'Topic', type: 'Text' }, { label: 'Body', type: 'Text', req: false, pic: false }, { label: 'Read the brief first', type: 'Note', req: true }] },
  { name: 'Shoot', dept: 'content', who: { mode: 'assign' }, sla: 1, sec: { emoji: '🎬', locked: true, req: false, pic: false },
    form: [{ label: 'Shoot date', type: 'Date', cal: { label: ' ', tone: 'content', pic: true } }, { label: 'Location', type: 'Multi-select', opts: [' Showroom ', '', 'LRT', 'showroom'] },
      { label: 'Spare', type: 'Text', cal: { label: 'x', tone: 'ads' }, opts: ['x'] }] },
  { name: 'Edit', dept: 'content', who: { mode: 'assign' }, sla: 3, form: [{ label: 'Final video', type: 'File' }] },
]
const reels = await save(null, null, { action: 'Reels video', tname: 'Full production', stages: STAGES })
r = await row(reels.id)
check(r.draft[0].sec, { emoji: '🎯', locked: false, req: true, pic: true }, 'a stage’s section: 🎯, not locked, required, shown to the PIC — unless set')
check(r.draft[1].sec, { emoji: '🎬', locked: true, req: false, pic: false }, '…as set')
check(r.draft[0].form, [
  { label: 'Topic', type: 'Text', req: true, pic: true },
  { label: 'Body', type: 'Text', req: false, pic: false },
  { label: 'Read the brief first', type: 'Note', req: false, pic: true },
], 'a stage’s fields: required and shown unless set — a note is never required')
check(r.draft[1].form[0], { label: 'Shoot date', type: 'Date', req: true, pic: true, cal: { label: 'Shoot date', tone: 'content', pic: true } },
  'a date on the calendar: named as the field when left blank, a team’s colour, the PIC’s calendar too')
check(r.draft[1].form[1].opts, ['Showroom', 'LRT', 'showroom'], 'a choice’s options trimmed, blanks dropped — a draft may hold one twice')
check(r.draft[1].form[2], { label: 'Spare', type: 'Text', req: true, pic: true }, 'a calendar mark only on a date, options only on a choice')

const bad = async (stages, pattern, what) => refuses(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`,
  [reels.id, (await row(reels.id)).draft_rev, JSON.stringify({ stages })], pattern, what)
const withField = f => [{ ...STAGES[0], form: [f] }]
await bad(withField({ label: 'D', type: 'Date', cal: { label: 'x'.repeat(41), tone: 'ads' } }), /Stage 1: a name on the calendar of at most 40/, 'a short name on the calendar')
await bad(withField({ label: 'D', type: 'Date', cal: { label: 'Shoot', tone: 'pink' } }), /Stage 1: pick the date's colour on the calendar/, 'a team’s colour')
await bad(withField({ label: 'C', type: 'Select', opts: Array.from({ length: 31 }, (_, i) => `o${i}`) }), /at most 30 options/, 'at most 30 options')
await bad(withField({ label: 'C', type: 'Select', opts: ['x'.repeat(41)] }), /an option of at most 40 characters/, 'short options')
await bad(withField({ label: 'C', type: 'Select', opts: 'a, b' }), /not a list of options/, 'options are a list')
await bad([{ ...STAGES[0], sec: { emoji: '🎞️🎞️🎞️🎞️🎞️🎞️🎞️🎞️🎞️' } }], /Stage 1: its section takes one emoji/, 'a section takes one emoji')

// ── The manager's own sections ────────────────────────────────────────────────────
const CAPTION = {
  emoji: '💬', title: ' Caption ', stage: 0, locked: true, req: true, pic: true,
  fields: [
    { label: 'Caption', type: 'Text', stage: 0, req: true, pic: true },
    { label: 'Posting date', type: 'Date', stage: 0, req: true, pic: true, cal: { label: 'Posting date', tone: 'social', pic: true } },
    { label: 'Hashtags', type: 'Select', stage: 2, opts: ['#houzs'] },
  ],
}
let rev = (await row(reels.id)).draft_rev
check((await save(reels.id, rev, { canvas: { req: { pic: false }, sections: [CAPTION, { title: 'Internal notes', stage: 9, fields: [{ label: 'Notes', type: 'Text', stage: 7 }] }] } })).rev, rev + 1,
  'the canvas saved on its own')
r = await row(reels.id)
check(r.canvas, {
  req: { pic: false },
  sections: [
    { emoji: '💬', title: 'Caption', stage: 0, locked: true, req: true, pic: true, fields: [
      { label: 'Caption', type: 'Text', stage: 0, req: true, pic: true },
      { label: 'Posting date', type: 'Date', stage: 0, req: true, pic: true, cal: { label: 'Posting date', tone: 'social', pic: true } },
      { label: 'Hashtags', type: 'Select', stage: 2, req: false, pic: false, opts: ['#houzs'] },
    ] },
    { emoji: '📝', title: 'Internal notes', stage: null, locked: false, req: false, pic: false, fields: [{ label: 'Notes', type: 'Text', stage: null, req: false, pic: false }] },
  ],
}, 'the canvas written clean: the title trimmed, a stage out of range dropped, unset switches off, the Requirements hidden from the PIC')
check(r.draft.length, 3, '…and the stages left as they were')

const badCanvas = async (canvas, pattern, what) => refuses(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`,
  [reels.id, (await row(reels.id)).draft_rev, JSON.stringify({ canvas })], pattern, what)
await badCanvas({ sections: {} }, /Not a list of sections/, 'sections are a list')
await badCanvas({ sections: Array.from({ length: 13 }, () => ({ title: 'S' })) }, /at most 12 sections of its own/, 'at most 12 sections')
await badCanvas({ sections: [{ title: 'x'.repeat(61) }] }, /Section 1: give it a name \(at most 60 characters\)/, 'a short title')
await badCanvas({ sections: [{ title: 'S', fields: Array.from({ length: 21 }, (_, i) => ({ label: `f${i}`, type: 'Text' })) }] }, /"S": at most 20 fields/, 'at most 20 fields')
await badCanvas({ sections: [{ title: 'S', fields: [{ label: 'n', type: 'Number' }] }] }, /"S": a field of a kind it cannot hold/, 'the seven kinds of answer the canvas offers')
await badCanvas({ sections: [{ title: 'S', fields: [{ label: 'T', type: 'Table' }] }] }, /a field of a kind it cannot hold/, '…no table of its own')

// The stages change: a section or a field of a stage taken out belongs to none until picked again.
rev = (await row(reels.id)).draft_rev
await save(reels.id, rev, { stages: STAGES.slice(0, 2) })
r = await row(reels.id)
check([r.canvas.sections[0].stage, r.canvas.sections[0].fields.map(f => f.stage)], [0, [0, 0, null]], 'a field of a stage taken out belongs to none')

// ── Published: the canvas checked whole, kept with the version ────────────────────
rev = (await row(reels.id)).draft_rev
await refuses(`SELECT public.mkt_workflow_publish($1, $2)`, [reels.id, rev], /Stage 2: the option "showroom" is there twice/, 'a stage’s choice: an option once (the stages are checked first)')
const stages2 = structuredClone(r.draft)
stages2[1].form[1].opts = ['Showroom', 'LRT']
await save(reels.id, rev, { stages: stages2 })
rev = (await row(reels.id)).draft_rev
await refuses(`SELECT public.mkt_workflow_publish($1, $2)`, [reels.id, rev], /"Caption": "Hashtags" — pick the stage that fills it in/, 'every field has a stage to fill it in')
const fixed = structuredClone(r.canvas)
fixed.sections[0].fields[2].stage = 1
fixed.sections[1].fields[0].stage = 1
const tryPublish = async (canvas, pattern, what) => {
  const at = (await row(reels.id)).draft_rev
  await save(reels.id, at, { canvas })
  await refuses(`SELECT public.mkt_workflow_publish($1, $2)`, [reels.id, at + 1], pattern, what)
}
await tryPublish({ ...fixed, sections: [{ ...fixed.sections[0], title: '' }, fixed.sections[1]] }, /Section 1: give it a name/, 'every section named')
await tryPublish({ ...fixed, sections: [{ ...fixed.sections[0], fields: [...fixed.sections[0].fields, { label: 'Caption', type: 'Text', stage: 0 }] }] },
  /"Caption": two fields called "Caption"/, 'a field once in its section')
await tryPublish({ ...fixed, sections: [{ ...fixed.sections[0], fields: [{ label: '', type: 'Text', stage: 0 }] }] }, /"Caption": name each field/, 'every field named')
await tryPublish({ ...fixed, sections: [{ ...fixed.sections[0], fields: [{ label: 'Pick', type: 'Select', stage: 0, opts: [] }] }] },
  /"Caption": "Pick" — give the choice its options/, 'a choice with its options')
const at = (await row(reels.id)).draft_rev
await save(reels.id, at, { canvas: fixed })
const v1 = await publish(reels.id, at + 1)
check(v1.version, 1, 'published as v1')
const [ver] = await versions(reels.id)
check(ver.canvas, (await row(reels.id)).canvas, 'the version keeps the canvas as it was published')
check(ver.stages[1].sec, { emoji: '🎬', locked: true, req: false, pic: false }, '…and each stage’s section')
check(ver.stages[1].form[0].cal, { label: 'Shoot date', tone: 'content', pic: true }, '…and each field’s settings')
check((await list()).find(w => w.id === reels.id).canvas.sections[0].title, 'Caption', 'the reader answers the draft’s canvas')

// Cloned: the canvas comes too.
const copy = await clone(reels.id)
check((await row(copy.id)).canvas, (await row(reels.id)).canvas, 'a clone has the canvas too')

// The draft count still guards the canvas.
await refuses(`SELECT public.mkt_workflow_save($1, 1, '{"canvas":{}}'::jsonb)`, [reels.id], /changed this template since you opened it/, 'never over somebody else’s save')

console.log(`marketing canvas: ${checks} checks passed`)
