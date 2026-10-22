// Local PostgreSQL regression for 20261023235500 (2026-10-23 — Marketing's Workflow Builder, ③ of the Claude Design
// handoff "HOUZS Marketing Module Setup"). The three Marketing migrations run VERBATIM, twice, over the stand-ins the
// first one's check uses. What is under test: only the manager builds; a template made, saved part by part and never
// over somebody else's save; the draft kept as typed (🔓 hand-offs and subtasks survive the lock); publishing checks the
// whole workflow, applies the lock and keeps each version whole; clones; the limits a stage keeps; a project naming
// only a published version; the reader. No live I/O.
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
for (const m of [core, tasks, workflows, core, tasks, workflows]) await db.exec(m) // twice, in order: nothing changes, nothing breaks
await db.exec(workflows)

const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)

// ── Who may call what ─────────────────────────────────────────────────────────────
const CALLS = ['mkt_workflows()', 'mkt_workflow_save(uuid,integer,jsonb)', 'mkt_workflow_publish(uuid,integer)', 'mkt_workflow_clone(uuid)']
for (const fn of CALLS) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_workflow_check(jsonb,boolean,boolean)', 'EXECUTE')`), false,
  'the check is the functions’ own')
check(await one(`SELECT has_function_privilege('service_role', 'public.mkt_workflow_check(jsonb,boolean,boolean)', 'EXECUTE')`), true,
  '…the service role keeps it')
for (const t of ['mkt_workflows', 'mkt_workflow_versions']) {
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', '${p}')`), false, `no client ${p} on ${t}`)
  }
  check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`), true, `${t}: row security on`)
}
check(await peek(`SELECT t, area, mode FROM public.audit_registered WHERE t LIKE 'mkt_workflow%' ORDER BY t`),
  [{ t: 'mkt_workflow_versions', area: 'Marketing', mode: 'none' }, { t: 'mkt_workflows', area: 'Marketing', mode: 'none' }],
  'both tables have their line in the history’s register')
check(await peek(`SELECT page, tab_id FROM public.permission_page_tabs ORDER BY page`),
  [{ page: '/marketing/new', tab_id: 'mkt.projects' }, { page: '/marketing/workflows', tab_id: 'mkt.tracking' }],
  'the Workflow Builder is the manager’s tools’ page in the database’s registry')

// ── Only the manager builds ───────────────────────────────────────────────────────
const save = (wid, rev, patch) => one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [wid, rev, JSON.stringify(patch)])
const publish = (wid, rev) => one(`SELECT public.mkt_workflow_publish($1, $2)`, [wid, rev])
const clone = wid => one(`SELECT public.mkt_workflow_clone($1)`, [wid])
const list = async () => (await one(`SELECT public.mkt_workflows()`)).workflows
const row = wid => peek(`SELECT * FROM public.mkt_workflows WHERE id = $1`, [wid]).then(r => r[0])
const versions = wid => peek(`SELECT version, stages, locked, promise, published_by FROM public.mkt_workflow_versions WHERE workflow_id = $1 ORDER BY version`, [wid])

for (const [who, actions, what] of [[U.mei, STAFF, 'staff'], [U.outsider, [], 'somebody outside Marketing'], [null, MANAGER, 'nobody signed in']]) {
  await as(who, actions)
  await refuses(`SELECT public.mkt_workflows()`, [], /The Workflow Builder is the manager's/, `${what} cannot read the builder`)
  await refuses(`SELECT public.mkt_workflow_save(NULL, NULL, '{"action":"A","tname":"B","stages":[]}'::jsonb)`, [],
    /The Workflow Builder is the manager's/, `${what} cannot make a template`)
}

// ── A template made ───────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
check(await list(), [], 'nothing built yet')
const SHOT_LIST = { label: 'Shot list', type: 'Table', cols: [{ name: 'Shot', type: 'Text' }, { name: 'Done', type: 'Checkbox' }], rows: [['Opening', ''], ['', '']] }
const REELS = [
  { name: 'Script', dept: 'content', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'person', staff: S.josiah }], picText: ' Content team is writing the script ' },
  { name: 'Shoot', dept: 'content', who: { mode: 'assign' }, sla: 1 },
  { name: 'Edit', dept: 'content', who: { mode: 'prev', cands: [S.mei, S.ali, S.mei] }, sla: 3, split: true },
  { name: 'Final', dept: 'content', who: { mode: 'assign' }, sla: 1, appr: [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }], back: 2,
    form: [{ label: 'Final video', type: 'File' }, SHOT_LIST, { label: 'Use the brand’s music only', type: 'Note' }] },
]
const reels = await save(null, null, { action: ' Reels video ', tname: 'Full production', emoji: '🎞️', note: 'Used by Ads and Social Media', promise: 10, stages: REELS })
check(reels.rev, 1, 'a new template’s first save')
let r = await row(reels.id)
check([r.action, r.tname, r.emoji, r.note, r.promise, r.locked, r.version, r.published_rev], ['Reels video', 'Full production', '🎞️',
  'Used by Ads and Social Media', 10, false, 0, null], 'the action and the template named, never published')
check(r.draft[1], { name: 'Shoot', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '', form: [] },
  'a stage written clean: nobody named, no approval, stay on this stage')
check(r.draft[2].who, { mode: 'prev', cands: [S.mei, S.ali] }, 'a 🔓 stage keeps its candidates, each once')
check(r.draft[0].picText, 'Content team is writing the script', 'what the PIC sees, trimmed')
check(r.draft[3].appr, [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }], 'two approval levels, in order')
check(r.draft[3].back, 2, 'changes go back to an earlier stage')
check(r.draft[3].form[1], SHOT_LIST, 'a table with its preset rows')

await refuses(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'REELS VIDEO', tname: ' full production', stages: [] })],
  /"REELS VIDEO · full production" is there already/, 'a template’s name is its action’s own, whatever the case')
const design = await save(null, null, { action: 'Design photo', tname: 'Simple',
  stages: [{ name: 'Design', dept: 'design', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }] }] })
check((await row(design.id)).emoji, '✨', 'a template given no emoji has the builder’s')
const brand = await save(null, null, { action: 'Brand book', tname: 'Standard', stages: [] })
check((await row(brand.id)).draft, [], 'a template may start with no stages')

// ── Saved part by part, never over somebody else's save ───────────────────────────
await refuses(`SELECT public.mkt_workflow_save($1, 0, '{"tname":"X"}'::jsonb)`, [reels.id],
  /Sia Josiah changed this template since you opened it — reload to see it/, 'a save made on an older draft is refused, with who saved since')
const before = (await row(reels.id)).draft
check((await save(reels.id, 1, { promise: 12 })).rev, 2, 'each save counts')
r = await row(reels.id)
check([r.promise, r.tname, r.draft], [12, 'Full production', before], 'only what was sent changes')
check((await save(reels.id, 2, { promise: null })).rev, 3, 'the promise taken off')
check((await row(reels.id)).promise, null, '…null clears it')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"promise":0}'::jsonb)`, [reels.id], /A promise of 1 to 365 working days/, 'a promise of at least a day')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"promise":"10"}'::jsonb)`, [reels.id], /A promise of 1 to 365 working days/, 'a promise is a number')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"locked":"yes"}'::jsonb)`, [reels.id], /Locked or not/, 'locked is yes or no')
await refuses(`SELECT public.mkt_workflow_save($1, 3, $2::jsonb)`, [reels.id, JSON.stringify({ note: 'x'.repeat(121) })], /A note of at most 120/, 'a short note')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"emoji":"🎞️🎞️🎞️🎞️🎞️🎞️🎞️🎞️🎞️"}'::jsonb)`, [reels.id], /One emoji/, 'one emoji')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"tname":"Simple"}'::jsonb)`, [design.id], /changed this template/, 'another template’s count is its own')
await refuses(`SELECT public.mkt_workflow_save($1, 3, '{"tname":"  "}'::jsonb)`, [reels.id], /Name the action and the template/, 'a template keeps a name')
check((await save(reels.id, 3, { locked: true })).rev, 4, 'the whole workflow locked')
r = await row(reels.id)
check([r.locked, r.draft[2].who.mode, r.draft[2].split], [true, 'prev', true], 'the draft keeps the 🔓 hand-off and the subtasks while locked')

// ── Published: checked whole, the lock applied, each version kept ─────────────────
const v1 = await publish(reels.id, 4)
check([v1.version, v1.rev, v1.live], [1, 4, 0], 'published as v1')
let vs = await versions(reels.id)
check(vs.length, 1, 'one version kept')
check([vs[0].locked, vs[0].promise, vs[0].published_by], [true, null, U.josiah], 'locked, with its promise, by whom')
check(vs[0].stages[2].who, { mode: 'assign', cands: [] }, 'locked: the 🔓 stage is the manager’s to assign')
check(vs[0].stages[2].split, false, 'locked: no subtasks')
check(vs[0].stages[3].form[1].rows, [['Opening', ''], ['', '']], 'the preset rows go with the version')
check((await row(reels.id)).draft[2].who.mode, 'prev', 'the draft still has its 🔓 hand-off for when it is unlocked')
await refuses(`SELECT public.mkt_workflow_publish($1, 4)`, [reels.id], /Nothing has changed since v1/, 'the same draft is not published twice')
check((await save(reels.id, 4, { locked: false })).rev, 5, 'unlocked')
await refuses(`SELECT public.mkt_workflow_publish($1, 4)`, [reels.id], /changed this template since you opened it/, 'publishes only the draft its publisher saw')
check((await publish(reels.id, 5)).version, 2, 'published as v2')
vs = await versions(reels.id)
check([vs[0].stages[2].who.mode, vs[1].stages[2].who], ['assign', { mode: 'prev', cands: [S.mei, S.ali] }],
  'v1 stays as it was; v2 has the 🔓 hand-off back')
check(vs[1].stages[2].split, true, '…and the subtasks')

// What publishing refuses — each on a draft the builder keeps.
let rev = 1
const tryPublish = async (stages, pattern, what) => {
  rev = (await save(brand.id, rev, { stages })).rev
  await refuses(`SELECT public.mkt_workflow_publish($1, $2)`, [brand.id, rev], pattern, what)
}
const st = (extra = {}) => ({ name: 'A stage', dept: 'brand', who: { mode: 'assign' }, sla: 1, ...extra })
await refuses(`SELECT public.mkt_workflow_publish($1, 1)`, [brand.id], /Add a stage first/, 'a workflow has a stage')
await tryPublish([st({ name: '' })], /Stage 1: give it a name/, 'every stage named')
await tryPublish([st({ who: { mode: 'prev', cands: [S.ali] } })], /Stage 1: there is no stage before it to pick its person/, 'the first stage cannot be 🔓')
await tryPublish([st(), st({ who: { mode: 'prev', cands: [] } })], /Stage 2: a 🔓 stage needs at least one candidate/, 'a 🔓 stage has candidates')
await tryPublish([st(), st({ who: { mode: 'prev', cands: [S.outsider] } })], /Stage 2: a candidate is not on Marketing's team/,
  'a candidate off the team is kept in the draft, refused on publishing')
await tryPublish([st({ appr: [{ kind: 'person', staff: S.outsider }] })], /Stage 1: an approval nobody on the team can give/,
  'an approver off the team: the same')
await tryPublish([st({ form: [{ label: ' ', type: 'Text' }] })], /Stage 1: name each field/, 'every field named')
check((await row(brand.id)).version, 0, 'nothing refused was published')
rev = (await save(brand.id, rev, { locked: true, stages: [st(), st({ who: { mode: 'prev', cands: [] } })] })).rev
check((await publish(brand.id, rev)).version, 1, 'locked, a 🔓 stage with no candidates is the manager’s to assign: published')

// ── The limits a stage keeps (drafts too) ─────────────────────────────────────────
let n = 0
const bad = async (stages, pattern, what) => {
  await assert.rejects(save(null, null, { action: 'Limits', tname: `T${++n}`, stages }), err => pattern.test(String(err.message)), what)
  checks++
}
await bad({}, /Not a list of stages/, 'a list')
await bad(Array.from({ length: 21 }, () => st()), /at most 20 stages/, 'at most 20 stages')
await bad([st({ dept: 'sales' })], /Stage 1: pick its team/, 'one of Marketing’s teams')
await bad([st({ name: 'x'.repeat(81) })], /a name of at most 80 characters/, 'a short name')
await bad([st({ sla: 0 })], /1 to 30 working days/, 'a day at least')
await bad([st({ sla: 31 })], /1 to 30 working days/, 'thirty at most')
await bad([st({ appr: [{ kind: 'pic' }, { kind: 'assign' }, { kind: 'assign' }, { kind: 'person', staff: S.josiah }] })], /at most 3 approval levels/,
  'three approval levels at most')
await bad([st({ appr: [{ kind: 'pic' }, { kind: 'pic' }] })], /the PIC approves it once/, 'the PIC once')
await bad([st({ appr: [{ kind: 'person', staff: S.josiah }, { kind: 'person', staff: S.josiah }] })], /the same approver twice/, 'nobody approves twice')
await bad([st({ appr: [{ kind: 'boss' }] })], /an approval nobody on the team can give/, 'only the builder’s approvals')
await bad([st({ appr: [{ kind: 'person', staff: 'josiah' }] })], /an approval nobody on the team can give/, 'a person is somebody')
await bad([st({ who: { mode: 'prev', cands: ['abc'] } })], /a candidate is not on Marketing's team/, 'a candidate is somebody')
await bad([st({ who: { mode: 'prev', cands: Array.from({ length: 21 }, (_, i) => id(900 + i)) } })], /at most 20 candidates/, 'twenty candidates at most')
await bad([st({ form: [{ label: 'A', type: 'Video' }] })], /a field of a kind it cannot hold/, 'only the builder’s field kinds')
await bad([st({ form: [{ label: 'A', type: 'Text' }, { label: 'A', type: 'Date' }] })], /two fields called "A"/, 'field names are a stage’s own')
await bad([st({ form: Array.from({ length: 21 }, (_, i) => ({ label: `F${i}`, type: 'Text' })) })], /at most 20 fields/, 'twenty fields at most')
await bad([st({ form: [{ label: 'x'.repeat(301), type: 'Note' }] })], /name each field/, 'a note of 300 characters at most')
await bad([st({ form: [{ label: 'T', type: 'Table', cols: [] }] })], /a table has 1 to 8 columns/, 'a table has columns')
await bad([st({ form: [{ label: 'T', type: 'Table', cols: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, type: 'Text' })) }] })],
  /a table has 1 to 8 columns/, 'eight columns at most')
await bad([st({ form: [{ label: 'T', type: 'Table', cols: [{ name: ' ', type: 'Text' }] }] })], /name each column/, 'each column named')
await bad([st({ form: [{ label: 'T', type: 'Table', cols: [{ name: 'C', type: 'File' }] }] })], /name each column/, 'only the builder’s column kinds')
await bad([st({ form: [{ ...SHOT_LIST, rows: [['Only one cell']] }] })], /a preset row is one short line per column/, 'a preset row fills each column')
await bad([st({ form: [{ ...SHOT_LIST, rows: [['A', 5]] }] })], /a preset row is one short line per column/, 'a preset cell is words')
await bad([st({ form: [{ ...SHOT_LIST, rows: [['x'.repeat(201), '']] }] })], /a preset row is one short line per column/, 'a preset cell is short')
await bad([st({ form: [{ ...SHOT_LIST, rows: Array.from({ length: 51 }, () => ['', '']) }] })], /at most 50 preset rows/, 'fifty preset rows at most')
await bad([st({ picText: 'x'.repeat(121) })], /what the PIC sees — at most 120 characters/, 'a short line for the PIC')
const backs = await save(null, null, { action: 'Limits', tname: 'Backs', stages: [st(), st({ back: 5 }), st({ back: 0 }), st({ back: -1 }), st({ back: '0' })] })
check((await row(backs.id)).draft.map(s => s.back), [null, null, 0, null, null], 'changes go back only to an earlier stage — anything else stays')

// ── Clones ────────────────────────────────────────────────────────────────────────
const c1 = await clone(reels.id)
check([c1.tname, c1.rev], ['Full production copy', 1], 'a clone is the action’s new template, “… copy”')
const c2 = await clone(reels.id)
check(c2.tname, 'Full production copy 2', 'a second clone is numbered')
r = await row(c1.id)
check([r.action, r.emoji, r.note, r.locked, r.version, r.draft], ['Reels video', '🎞️', 'Used by Ads and Social Media', false, 0, (await row(reels.id)).draft],
  'the clone carries the draft, never a version')
check((await save(c1.id, 1, { tname: 'Quick edit', stages: REELS.filter(s => ['Script', 'Final'].includes(s.name)).map(s => ({ ...s, back: null })) })).rev, 2,
  'renamed and cut down')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_workflow_clone($1)`, [reels.id], /The Workflow Builder is the manager's/, 'staff cannot clone')
await refuses(`SELECT public.mkt_workflow_publish($1, 2)`, [c1.id], /The Workflow Builder is the manager's/, 'staff cannot publish')

// ── A project names a version that was published ──────────────────────────────────
await asSystem()
await refuses(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, workflow_id, workflow_version)
  VALUES ('MKT-CAR-2610-001', 'product', $1, 'Reels for Carres', $2, 3)`, [CAR, reels.id], /foreign key/, 'not a version that was never published')
await q(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, workflow_id, workflow_version)
  VALUES ('MKT-CAR-2610-001', 'product', $1, 'Reels for Carres', $2, 2), ('MKT-CAR-2610-002', 'product', $1, 'Reels done', $2, 1)`, [CAR, reels.id])
await q(`UPDATE public.mkt_projects SET status = 'done' WHERE track_id = 'MKT-CAR-2610-002'`)

// ── The reader ────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const all = await list()
check(all.map(w => `${w.action} · ${w.tname}`), ['Brand book · Standard', 'Design photo · Simple', 'Limits · Backs', 'Reels video · Full production',
  'Reels video · Quick edit', 'Reels video · Full production copy 2'], 'by action, then as they were made')
const rv = all.find(w => w.id === reels.id)
check([rv.version, rv.rev, rv.changed, rv.live, rv.publishedBy, rv.updatedBy, rv.locked, rv.promise], [2, 5, false, 1, 'Sia Josiah', 'Sia Josiah', false, null],
  'its version, its draft, nothing new since, one project running on it')
check(all.find(w => w.id === c1.id).changed, true, 'a template never published has something to publish')
check(all.find(w => w.id === c1.id).version, 0, '…at no version yet')

console.log(`marketing workflows: ${checks} checks passed`)
