// Local PostgreSQL regression for 20261113200000 (2026-11-13 — the Workflow Builder 2a, its template side). The
// migration runs VERBATIM, twice, over stand-ins of what it reads on production (the tables as production has them,
// production's two drafts, the roster, mkt_field_extras as production runs it). What is under test: the drafts moved
// to the new shapes; groups and categories; the new stage (sid, a group key, levels of {ids, rule}) and canvas (by
// sid) checks; publish snapshots overdue and finish and asks a manager or a Director to approve; clone; the new
// writes (category add / rename / icon / delete, template rename, group add); the celebration GIF; who may call what.
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
const ok = (cond, what) => { assert.ok(cond, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), boss: id(4) }
// Production's staff ids in the two drafts' approvals.
const S = { josiah: '7cf4dd78-a4d7-4e2d-8052-3b0c6166fca9', weijie: 'd8a816a5-c688-4366-b6df-6b4a23e7f5fd', mei: id(12), ali: id(13), boss: id(14), gone: id(19) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text);
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, mode text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_mode) ON CONFLICT (t) DO NOTHING
  $$;
  CREATE FUNCTION public.mkt_need(p_wants text[], p_words text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public AS $fn$
  BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(p_wants), false) THEN
      RAISE EXCEPTION '%', coalesce(p_words, 'Marketing is not open to your account.') USING ERRCODE = '42501';
    END IF;
  END $fn$;
  CREATE FUNCTION public.mkt_top_up_due() RETURNS void LANGUAGE sql AS $$ SELECT $$;
  -- The roster as mkt_roster() answers it.
  CREATE TABLE public.roster(staff_id uuid PRIMARY KEY, first_name text, title text);
  CREATE FUNCTION public.mkt_roster() RETURNS TABLE(staff_id uuid, user_id uuid, full_name text, first_name text, title text,
    team text, role_label text, color text, capacity integer) LANGUAGE sql STABLE AS $$
    SELECT r.staff_id, NULL::uuid, r.first_name, r.first_name, r.title, NULL, NULL, NULL, 5 FROM public.roster r $$;

  CREATE TABLE public.mkt_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid, workflow_version integer,
    status text NOT NULL DEFAULT 'active');
  CREATE TABLE public.mkt_products(code text PRIMARY KEY, name text, groups jsonb NOT NULL DEFAULT '[]');
  CREATE TABLE public.file_objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
    owner_id text, metadata jsonb NOT NULL DEFAULT '{}');
  ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT ON public.file_objects TO authenticated;
  CREATE POLICY read_all ON public.file_objects FOR SELECT TO authenticated USING (true);

  -- mkt_workflows / mkt_workflow_versions as production has them (2026-11-13).
  CREATE TABLE public.mkt_workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text NOT NULL CHECK (action = btrim(action) AND length(action) BETWEEN 1 AND 60),
    tname text NOT NULL CHECK (tname = btrim(tname) AND length(tname) BETWEEN 1 AND 60),
    emoji text NOT NULL DEFAULT '✨', note text, promise integer CHECK (promise BETWEEN 1 AND 365),
    locked boolean NOT NULL DEFAULT false, draft jsonb NOT NULL DEFAULT '[]', draft_rev integer NOT NULL DEFAULT 1,
    version integer NOT NULL DEFAULT 0, published_rev integer, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
    canvas jsonb NOT NULL DEFAULT '{"req": {"pic": true}, "sections": []}');
  CREATE UNIQUE INDEX mkt_workflows_name ON public.mkt_workflows (lower(action), lower(tname));
  CREATE TABLE public.mkt_workflow_versions (workflow_id uuid NOT NULL REFERENCES public.mkt_workflows(id), version integer NOT NULL,
    stages jsonb NOT NULL, locked boolean NOT NULL, promise integer, published_by uuid, published_at timestamptz NOT NULL DEFAULT now(),
    canvas jsonb NOT NULL DEFAULT '{"req": {"pic": true}, "sections": []}', PRIMARY KEY (workflow_id, version));
  ALTER TABLE public.mkt_workflows ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.mkt_workflow_versions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.mkt_workflows, public.mkt_workflow_versions FROM anon, authenticated;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

  INSERT INTO public.users VALUES ('${U.josiah}', 'Sia Josiah'), ('${U.mei}', 'Mei'), ('${U.boss}', 'Boss');
  INSERT INTO public.roster VALUES ('${S.josiah}', 'JOSIAH', 'MARKETING MANAGER'), ('${S.weijie}', 'WEI JIE', 'ASSISTANT MARKETING MANAGER'),
    ('${S.mei}', 'Mei', 'GRAPHIC DESIGNER'), ('${S.ali}', 'Ali', 'CONTENT CREATOR'), ('${S.boss}', 'Boss', 'MARKETING DIRECTOR');
`)

// mkt_field_extras as production runs it (md5 f9dd9a976d85b4f86fa07f41bee58db2), from the migration that made it.
const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const canvasMig = await sql('20261024001000_marketing_canvas.sql')
const groupsMig = await sql('20261025031000_marketing_groups_selangor.sql')
const fe = src => src.match(/CREATE OR REPLACE FUNCTION public\.mkt_field_extras[\s\S]*?\n\$fn\$;/g)
const extras = (fe(groupsMig) ?? fe(canvasMig))
await db.exec(extras[extras.length - 1])

// Production's two drafts, word for word (2026-11-13).
const DESIGN_COPY = { id: '0ce7d496-6f7e-4b68-88a6-572d9301c885', draft: [{ sec: { pic: true, req: true, emoji: '🎯', locked: false }, sla: 2,
  who: { mode: 'assign', cands: [] }, appr: [{ kind: 'pic' }], back: null, dept: 'GRAPHIC DESIGNER', form: [], name: 'design', split: false, picText: '' }],
  tname: 'Standard copy', canvas: { req: { pic: true }, sections: [] } }
const DESIGN_STD = { id: 'df932ebc-b69a-490e-8e19-6efc20043e2c', tname: 'Standard', draft: [
  { sec: { pic: true, req: true, emoji: '🎯', locked: false }, sla: 3, who: { mode: 'assign', cands: [] },
    appr: [{ kind: 'person', staff: S.josiah }, { kind: 'person', staff: S.weijie }, { kind: 'pic' }], back: null, dept: 'CONTENT CREATOR',
    form: [{ pic: true, req: true, type: 'Text', label: 'content direction' }, { pic: true, req: true, cols: [{ name: 'Item', type: 'Text' },
      { name: 'Qty', type: 'Number' }, { name: 'Done', type: 'Checkbox' }, { name: 'Column 4', type: 'Checkbox' }], rows: [['ggb', '', '', '']], type: 'Table', label: 'asdada' }],
    name: 'content planing', split: false, picText: '' },
  { sec: { pic: true, req: true, emoji: '🎯', locked: false }, sla: 1, who: { mode: 'prev', cands: [] }, appr: [], back: null,
    dept: 'SENIOR VIDEOGRAPHER & VIDEO EDITOR', form: [], name: 'New stage', split: false, picText: '' },
  { sec: { pic: true, req: true, emoji: '🎯', locked: false }, sla: 1, who: { mode: 'assign', cands: [] }, appr: [], back: null,
    dept: 'SENIOR VIDEOGRAPHER & VIDEO EDITOR', form: [], name: 'New stage', split: false, picText: '' }],
  canvas: { req: { pic: true }, sections: [{ pic: false, req: false, emoji: '📝', stage: null, title: 'New section', locked: false,
    fields: [{ pic: false, req: false, type: 'Text', label: 'Notes', stage: 0 }, { pic: false, req: false, type: 'Text', label: 'New field', stage: 2 }] }] } }
for (const [w, at] of [[DESIGN_STD, '2026-11-02T10:07:31Z'], [DESIGN_COPY, '2026-11-02T10:09:59Z']]) {
  await q(`INSERT INTO public.mkt_workflows (id, action, tname, draft, canvas, created_at) VALUES ($1, 'design', $2, $3::jsonb, $4::jsonb, $5)`,
    [w.id, w.tname, JSON.stringify(w.draft), JSON.stringify(w.canvas), at])
}

const mig = await sql('20261113200000_marketing_wf_builder_v2.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
const CALLS = ['mkt_workflows()', 'mkt_workflow_save(uuid,integer,jsonb)', 'mkt_workflow_publish(uuid,integer)', 'mkt_workflow_clone(uuid)',
  'mkt_workflow_rename(uuid,text)', 'mkt_wf_category_add(text,text)', 'mkt_wf_category_rename(uuid,text)', 'mkt_wf_category_icon(uuid,text)',
  'mkt_wf_category_delete(uuid)', 'mkt_group_add(text)']
for (const fn of CALLS) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['mkt_workflow_check(jsonb,boolean,boolean)', 'mkt_canvas_check(jsonb,text[],boolean)', 'mkt_canvas_sid(jsonb,text[])',
  'mkt_wf_overdue(jsonb)', 'mkt_wf_finish(jsonb,text,text)', 'mkt_wf_stage_sections(jsonb)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
}
check(await one(`SELECT count(*)::int FROM pg_proc WHERE proname IN ('mkt_canvas_stage') OR (proname = 'mkt_canvas_check' AND pronargs = 3 AND proargtypes[1] = 'integer'::regtype)`),
  0, 'the index-based canvas helpers are gone')
for (const t of ['mkt_groups', 'mkt_workflow_categories']) {
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', '${p}')`), false, `no client ${p} on ${t}`)
  }
  check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`), true, `${t}: row security on`)
}
check(await peek(`SELECT t, mode FROM public.audit_registered ORDER BY t`),
  [{ t: 'mkt_groups', mode: 'none' }, { t: 'mkt_workflow_categories', mode: 'none' }], 'both new tables have their line in the register')

await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_workflows()`, [], /The Workflow Builder is the manager's/, 'staff cannot read the builder')
await refuses(`SELECT public.mkt_group_add('X')`, [], /manager's/, 'staff cannot add a group')
await refuses(`SELECT public.mkt_wf_category_add('X', NULL)`, [], /manager's/, 'staff cannot add a category')

// ── Groups, seeded ────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const book = async () => one(`SELECT public.mkt_workflows()`)
let b = await book()
check(b.groups, [{ key: 'content', name: 'Content', hue: 295 }, { key: 'social', name: 'Social Media', hue: 235 }, { key: 'design', name: 'Design', hue: 350 },
  { key: 'ads', name: 'Ads', hue: 270 }, { key: 'brand', name: 'Brand', hue: 195 }], 'Marketing’s five groups, with their hues')

// ── The two drafts, moved ─────────────────────────────────────────────────────────
check(b.categories.map(c => [c.name, c.emoji]), [['design', '✨']], 'one category per action, its first template’s emoji')
const cat = b.categories[0].id
const std = b.workflows.find(w => w.id === DESIGN_STD.id)
const cp = b.workflows.find(w => w.id === DESIGN_COPY.id)
check([std.categoryId, cp.categoryId], [cat, cat], 'both templates in it')
const sids = std.draft.map(s => s.sid)
ok(sids.every(s => /^s[0-9a-f]{12}$/.test(s)) && new Set(sids).size === 3, 'every stage a sid of its own')
check(std.draft.map(s => s.dept), ['content', 'content', 'content'], 'a CONTENT CREATOR and a VIDEOGRAPHER → Content')
check(cp.draft[0].dept, 'design', 'a GRAPHIC DESIGNER → Design')
check(std.draft[0].appr, [{ ids: [S.josiah], rule: 'any' }, { ids: [S.weijie], rule: 'any' }, { ids: ['pic'], rule: 'any' }],
  'each old level a level of its own')
check(cp.draft[0].appr, [{ ids: ['pic'], rule: 'any' }], 'the PIC, a level of one')
ok(!('form' in std.draft[0]) && !('sec' in std.draft[0]), 'no form, no section on the stage any more')
const secs = std.canvas.sections
check(secs.map(s => [s.title, s.stage, s.req, s.pic]), [['content planing', sids[0], true, true], ['New stage', sids[1], true, true],
  ['New stage', sids[2], true, true], ['New section', null, false, false]], 'a section per stage, then the canvas’s own')
check(secs[0].fields.map(f => [f.label, f.type, f.stage, f.req, f.pic]), [['content direction', 'Text', sids[0], true, true],
  ['asdada', 'Table', sids[0], true, true]], 'the stage’s fields in its section, filled in at its stage')
check(secs[0].fields[1].cols.map(c => [c.name, c.type, c.stage, c.req, c.pic]), [['Item', 'Text', sids[0], false, true],
  ['Qty', 'Number', sids[0], false, true], ['Done', 'Checkbox', sids[0], false, true], ['Column 4', 'Checkbox', sids[0], false, true]],
'each column filled in at the stage, shown to the PIC as its table')
check(secs[0].fields[1].rows, [['ggb', '', '', '']], 'its preset rows kept')
check(secs[3].fields.map(f => [f.label, f.stage]), [['Notes', sids[0]], ['New field', sids[2]]], 'the canvas’s own fields: their stage index → sid')
ok([...secs.map(s => s.id), ...secs.flatMap(s => s.fields.map(f => f.id))].every(x => /^[a-z0-9]{1,40}$/.test(x)), 'every section and field an id')
check(std.finish, { notify: ['all'], after: 'close', picText: 'Your design is ready', celebration: 'fireworks', gifPath: null }, 'the finish spelt out')
check(std.overdue, { days: 1, notify: ['doer', 'mm'], action: 'remind', repeat: true }, 'the overdue rule’s defaults')

// ── Saved: the new stage shape ────────────────────────────────────────────────────
const save = (wid, rev, patch) => one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [wid, rev, JSON.stringify(patch)])
const row = wid => peek(`SELECT * FROM public.mkt_workflows WHERE id = $1`, [wid]).then(r => r[0])
const STAGES = [
  { sid: 'sscript01', name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 2, appr: [{ ids: [S.josiah, S.weijie], rule: 'all' }], picText: 'Writing' },
  { sid: 'sedit0001', name: 'Edit', dept: 'design', who: { mode: 'prev', cands: [S.mei, S.ali] }, sla: 3, appr: [], split: true },
  { sid: 'sfinal001', name: 'Final', dept: 'content', who: { mode: 'assign' }, sla: 1, appr: [{ ids: [S.josiah], rule: 'any' }, { ids: ['pic'], rule: 'any' }], back: 0 },
]
const CANVAS = { req: { pic: true }, sections: [
  { id: 'xscript', emoji: '🎯', title: 'Script', stage: 'sscript01', req: true, pic: true, fields: [
    { id: 'fbody', label: 'Body', type: 'Text', stage: 'sscript01', req: true, pic: true },
    { id: 'fshots', label: 'Shots', type: 'Table', stage: 'sscript01', req: false, pic: true, rows: [['A', '']], cols: [
      { id: 'kshot', name: 'Shot', type: 'Text', stage: 'sscript01', req: true, pic: true },
      { id: 'knote', name: 'Edit notes', type: 'Text', stage: 'sedit0001', req: false, pic: false }] }] },
  { id: 'xfinal', emoji: '🎞️', title: 'Final', stage: 'sfinal001', fields: [{ id: 'fcut', label: 'Final cut', type: 'File', stage: 'sfinal001', req: true }] }] }
let r = await save(std.id, 1, { stages: STAGES, canvas: CANVAS, promise: 8 })
check(r.rev, 2, 'saved')
let w = await row(std.id)
check(w.draft[0], { sid: 'sscript01', name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 2,
  appr: [{ ids: [S.josiah, S.weijie], rule: 'all' }], split: false, back: null, picText: 'Writing' }, 'a stage written clean')
check(w.draft[2].back, 0, 'changes go back to an earlier stage')
check(w.canvas.sections[0].fields[1].cols[1], { id: 'knote', name: 'Edit notes', type: 'Text', stage: 'sedit0001', req: false, pic: false },
  'a column keeps its own stage, ⭐ and 👁')
check(w.canvas.sections[1].fields[0].stage, 'sfinal001', 'a field names its stage by sid')

// An older client's levels still read.
r = await save(std.id, 2, { stages: [{ ...STAGES[0], appr: [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }] }, STAGES[1], STAGES[2]] })
check((await row(std.id)).draft[0].appr, [{ ids: [S.josiah], rule: 'any' }, { ids: ['pic'], rule: 'any' }], 'a {kind} level reads as a level of one')
// A stage taken out: its fields belong to none.
r = await save(std.id, 3, { stages: [STAGES[0], STAGES[2]] })
w = await row(std.id)
check(w.canvas.sections[0].fields[1].cols[1].stage, null, 'a column of a stage taken out belongs to none')
r = await save(std.id, 4, { stages: STAGES })

const bad = async (stages, pattern, what) =>
  refuses(`SELECT public.mkt_workflow_save($1, 5, $2::jsonb)`, [std.id, JSON.stringify({ stages })], pattern, what)
await bad([{ ...STAGES[0], dept: 'GRAPHIC DESIGNER' }], /pick its group from the list/, 'a group is one of Marketing’s')
await bad([{ ...STAGES[0], appr: [{ ids: [S.josiah], rule: 'any' }, { ids: [S.josiah], rule: 'any' }] }], /somebody approves on two levels/, 'a person on one level only')
await bad([{ ...STAGES[0], appr: [{ ids: ['pic'], rule: 'any' }, { ids: ['pic'], rule: 'any' }] }], /the PIC approves it once/, 'the PIC once a stage')
await bad([{ ...STAGES[0], appr: [{ ids: [] }, { ids: [] }, { ids: [] }, { ids: [] }] }], /at most 3 approval levels/, 'three levels at most')
await bad([{ ...STAGES[0], appr: [{ ids: ['someone'] }] }], /an approval nobody on the team can give/, 'an approver is somebody')
await bad([STAGES[0], { ...STAGES[1], sid: 'sscript01' }], /two stages with the same key/, 'a key once')
await bad([{ ...STAGES[0], sid: 'X!' }], /not a stage's key/, 'a key is short letters and digits')
check((await save(std.id, 5, { stages: [{ name: 'No key', sla: 1 }] })).rev, 6, 'a stage sent without a key…')
ok(/^s[0-9a-f]{12}$/.test((await row(std.id)).draft[0].sid), '…gets one')
check((await save(std.id, 6, { stages: [{ ...STAGES[0], appr: [{ ids: [], rule: 'any' }] }] })).rev, 7, 'a draft keeps a level being chosen')
r = await save(std.id, 7, { stages: STAGES, canvas: CANVAS })

// The canvas check.
const badCanvas = async (canvas, pattern, what) =>
  refuses(`SELECT public.mkt_workflow_save($1, 8, $2::jsonb)`, [std.id, JSON.stringify({ canvas })], pattern, what)
await badCanvas({ sections: [{ title: 'T', fields: [{ label: 'x', type: 'Video' }] }] }, /a field of a kind it cannot hold/, 'the ten kinds only')
await badCanvas({ sections: [{ title: 'T', fields: [{ label: 'x', type: 'Table', cols: [] }] }] }, /a table has 1 to 12 columns/, 'a table has columns')
await badCanvas({ sections: [{ title: 'T', fields: [{ label: 'x', type: 'Table', cols: [{ name: 'c', type: 'Video' }] }] }] }, /name each column/, 'a column’s kind')

// ── Overdue and finish ────────────────────────────────────────────────────────────
check((await save(std.id, 8, { overdue: { days: 3, notify: ['next', 'doer', 'boss'], action: 'reassign', repeat: false } })).rev, 9, 'the overdue rule saved')
check((await row(std.id)).overdue, { days: 3, notify: ['doer', 'next'], action: 'reassign', repeat: false }, '…the people it knows, in order')
await refuses(`SELECT public.mkt_workflow_save($1, 9, '{"overdue":{"days":11}}'::jsonb)`, [std.id], /Late by 1 to 10 working days/, 'late by at most 10')
check((await save(std.id, 9, { finish: { notify: ['pic', 'all'], after: 'feedback', picText: 'Done!', celebration: 'custom' } })).rev, 10, 'the finish saved')
check((await row(std.id)).finish, { notify: ['all', 'pic'], after: 'feedback', picText: 'Done!', celebration: 'fireworks', gifPath: null },
  'a custom celebration with no GIF falls back to fireworks')
const GIF = 'workflow/00000000-0000-4000-8000-000000000777/party.gif'
await refuses(`SELECT public.mkt_workflow_save($1, 10, $2::jsonb)`, [std.id, JSON.stringify({ finish: { celebration: 'custom', gifPath: GIF } })],
  /That GIF has not arrived/, 'a GIF that was never sent')
// The upload policy: the manager's, under workflow/, an image ≤ 4 MB.
const put = (name, meta) => q(`INSERT INTO public.file_objects (bucket_id, name, owner_id, metadata) VALUES ('marketing', $1, auth.uid()::text, $2::jsonb)`,
  [name, JSON.stringify(meta)])
await assert.rejects(put('workflow/x/big.gif', { size: 4_000_001, mimetype: 'image/gif' }), /row-level security/); checks++
await assert.rejects(put('workflow/x/a.mp4', { size: 10, mimetype: 'video/mp4' }), /row-level security/); checks++
await as(U.mei, STAFF)
await assert.rejects(put('workflow/x/a.gif', { size: 10, mimetype: 'image/gif' }), /row-level security/); checks++
await as(U.josiah, MANAGER)
await put(GIF, { size: 120_000, mimetype: 'image/gif' })
checks++
check((await save(std.id, 10, { finish: { celebration: 'custom', gifPath: GIF } })).rev, 11, 'a GIF the manager just sent')
check((await row(std.id)).finish.gifPath, GIF, '…kept, in use')

// ── Published: a manager or a Director approves; overdue and finish snapshotted ───
const publish = (wid, rev) => one(`SELECT public.mkt_workflow_publish($1, $2)`, [wid, rev])
// Stage 2's shortlist is on the roster; its approval is empty — fine. Make an approver not a manager:
r = await save(std.id, 11, { stages: [{ ...STAGES[0], appr: [{ ids: [S.mei], rule: 'any' }] }, STAGES[1], STAGES[2]] })
await refuses(`SELECT public.mkt_workflow_publish($1, 12)`, [std.id], /not a Marketing manager or a Director/, 'a designer does not approve')
r = await save(std.id, 12, { stages: [{ ...STAGES[0], appr: [{ ids: [], rule: 'any' }] }, STAGES[1], STAGES[2]] })
await refuses(`SELECT public.mkt_workflow_publish($1, 13)`, [std.id], /choose who approves each level/, 'a level with nobody on it')
r = await save(std.id, 13, { stages: [{ ...STAGES[0], appr: [{ ids: [S.boss, S.weijie], rule: 'all' }] }, STAGES[1], STAGES[2]],
  canvas: { sections: [{ title: 'Loose', fields: [{ label: 'Who knows', type: 'Text', stage: null }] }] } })
await refuses(`SELECT public.mkt_workflow_publish($1, 14)`, [std.id], /"Who knows" — pick the stage that fills it in/, 'a field with no stage')
r = await save(std.id, 14, { canvas: { sections: [{ title: 'T', fields: [{ label: 'Tbl', type: 'Table', stage: 'sedit0001', cols: [{ name: 'c', type: 'Text' }] }] }] } })
await refuses(`SELECT public.mkt_workflow_publish($1, 15)`, [std.id], /the column "c" — pick the stage/, 'a column with no stage')
r = await save(std.id, 15, { canvas: CANVAS, locked: true })
const v1 = await publish(std.id, 16)
check([v1.version, v1.live], [1, 0], 'published as v1 — a Director approves beside the AMM')
const ver = (await peek(`SELECT * FROM public.mkt_workflow_versions WHERE workflow_id = $1`, [std.id]))[0]
check(ver.stages[1].who, { mode: 'assign', cands: [] }, 'the lock applied to the version')
check(ver.overdue, { days: 3, notify: ['doer', 'next'], action: 'reassign', repeat: false }, 'the overdue rule snapshotted')
check(ver.finish.gifPath, GIF, 'the finish snapshotted')
check(ver.canvas.sections[0].fields[1].cols.map(c => c.stage), ['sscript01', 'sedit0001'], 'the canvas by sid')
b = await book()
const pub = b.workflows.find(x => x.id === std.id)
check([pub.pubStages.length, pub.pubPromise, pub.version], [3, 8, 1], 'the reader hands the last version’s stages and promise')

// ── Clone, rename ─────────────────────────────────────────────────────────────────
const c1 = await one(`SELECT public.mkt_workflow_clone($1)`, [std.id])
w = await row(c1.id)
check([w.category_id, w.tname, w.version, w.finish.gifPath, w.overdue.days], [cat, 'Standard copy 2', 0, GIF, 3],
  'a clone: same category, the next free name, its GIF and overdue rule kept')
const rn = await one(`SELECT public.mkt_workflow_rename($1, ' Quick ')`, [c1.id])
check([rn.rev, (await row(c1.id)).tname], [2, 'Quick'], 'renamed from the picker, its draft counted')
await refuses(`SELECT public.mkt_workflow_rename($1, 'standard')`, [c1.id], /is there already/, 'a name once a category, whatever the case')

// ── Categories ────────────────────────────────────────────────────────────────────
const add = await one(`SELECT public.mkt_wf_category_add(' Reels video ', NULL)`)
w = await row(add.id)
check([w.action, w.tname, w.promise, w.emoji], ['Reels video', 'Standard', 3, '📦'], 'a category made with a Standard template, the first emoji free')
check(w.draft.map(s => [s.name, s.dept, s.who.mode, s.sla, s.appr]), [['Stage 1', 'design', 'assign', 2, []]], '…of one stage')
check(w.canvas.sections.map(s => [s.emoji, s.title, s.stage]), [['🎯', 'Stage 1', w.draft[0].sid]], '…and its section on the canvas')
await refuses(`SELECT public.mkt_wf_category_add('REELS VIDEO', NULL)`, [], /"REELS VIDEO" already exists/, 'a name once, whatever the case')
await q(`SELECT public.mkt_wf_category_rename($1, 'Reels')`, [add.category])
check((await row(add.id)).action, 'Reels', 'renaming a category renames its templates’ action')
await q(`SELECT public.mkt_wf_category_icon($1, '🎞️')`, [add.category])
check((await row(add.id)).emoji, '🎞️', '…and its icon theirs')
await refuses(`SELECT public.mkt_wf_category_rename($1, 'Design')`, [add.category], /"Design" already exists/, 'renamed onto another’s name')
await refuses(`SELECT public.mkt_wf_category_delete($1)`, [cat], /"Standard" was published/, 'a category with a published template stays')
// A product's draft linking one of its templates.
await peek(`INSERT INTO public.mkt_products (code, name, groups) VALUES ('PRD-1', 'Reels pack', $1::jsonb)`,
  [JSON.stringify([{ items: [{ workflow: add.id }] }])])
await refuses(`SELECT public.mkt_wf_category_delete($1)`, [add.category], /The product "Reels pack" links a template/, 'a linked template stays')
await peek(`DELETE FROM public.mkt_products`)
await q(`SELECT public.mkt_wf_category_delete($1)`, [add.category])
check(await peek1(`SELECT count(*)::int FROM public.mkt_workflows WHERE category_id = $1`, [add.category]), 0, 'deleted with its drafts')
// The Product Builder's + New action workflow: a category by its name, found or made.
const pb = await save(null, null, { action: 'design', tname: 'From products', stages: [{ name: 'design', sla: 2, appr: [{ kind: 'pic' }] }] })
check((await row(pb.id)).category_id, cat, 'a template made by its action’s name joins the category')
const pb2 = await save(null, null, { action: 'Brand book', tname: 'Standard', stages: [] })
w = await row(pb2.id)
check([w.action, (await book()).categories.some(c => c.name === 'Brand book')], ['Brand book', true], '…or makes it')

// ── + New group ───────────────────────────────────────────────────────────────────
const g1 = await one(`SELECT public.mkt_group_add(' Video  production ')`)
const g2 = await one(`SELECT public.mkt_group_add('Events')`)
check([g1, g2], [{ key: 'video_production', name: 'Video production', hue: 60 }, { key: 'events', name: 'Events', hue: 150 }], 'a new group: its key, the next hue')
await refuses(`SELECT public.mkt_group_add('events')`, [], /"events" already exists/, 'a group name once')
const g3 = await one(`SELECT public.mkt_group_add('活动')`)
check(g3.key, 'g', 'a name with no letters to key on gets one')
check((await save(pb.id, 1, { stages: [{ name: 'Edit', dept: 'events', sla: 1 }] })).rev, 2, 'a new group may be picked')

console.log(`marketing workflow builder v2: ${checks} checks passed`)
