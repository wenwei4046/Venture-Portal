// Local PostgreSQL regression for 20261112180000 (2026-11-12 — the Minutes Builder v2, docs/design_handoff_minutes_builder_v2/):
// field ids backfilled, hints, a kind changed, locked fields kept, a table's starting rows and what the staff may add, the
// version's name, Discard, Duplicate, nestable folders, the reader; and the minutes' table answers following the template.
// The first Marketing migrations run first (a template made the old way), then v2 twice. No live I/O.
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
const minutes = await sql('20261023235800_marketing_minutes.sql')
for (const m of [core, tasks, workflows, minutes, core, tasks, workflows, minutes]) await db.exec(m) // twice, in order: nothing changes
await db.exec(minutes)

// ── Minutes Builder v2 (20261112180000): a template made the old way first, then the migration — twice ─────────────
const save = (tid, rev, patch) => one(`SELECT public.mkt_minutes_save($1, $2, $3::jsonb)`, [tid, rev, JSON.stringify(patch)])
const publish = (tid, rev) => one(`SELECT public.mkt_minutes_publish($1, $2)`, [tid, rev])
const list = async () => one(`SELECT public.mkt_minutes_templates()`)
const row = tid => peek(`SELECT * FROM public.mkt_minutes_templates WHERE id = $1`, [tid]).then(r => r[0])

await as(U.josiah, MANAGER)
const OLD = [
  { name: 'Project (from Projects)', type: 'Project link', pic: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true },
  { name: 'Attendees', type: 'People', pic: true, lock: true },
  { name: 'Objective', type: 'Long text', req: true, pic: true },
  { name: 'Signatures', type: 'Signature', req: true, pic: true },
]
const old = await save(null, null, { name: 'Kickoff', fields: OLD, rules: { project: true, file: true, lock: true } })
await publish(old.id, old.rev)
let oldRev = (await save(old.id, old.rev, { name: 'Kickoff (renamed)' })).rev

await asSystem()
await db.exec(`
  CREATE TABLE public.mkt_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, name text, intake_id uuid, status text);
  CREATE TABLE public.mkt_minutes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid, template_version integer, status text NOT NULL);
`)
const v2 = await sql('20261112180000_marketing_minutes_builder_v2.sql')
await db.exec(v2)
await db.exec(v2) // twice: nothing changes

// ── The backfill ──────────────────────────────────────────────────────────────────
let r = await row(old.id)
const ver = (await peek(`SELECT name, fields FROM public.mkt_minutes_versions WHERE template_id = $1`, [old.id]))[0]
check(r.fields.every(f => /^f[0-9a-f]{12}$/.test(f.id)), true, 'every draft field has an id')
check(r.fields.map(f => f.id), ver.fields.map(f => f.id), 'the same field carries the same id in the draft and its version')
check(new Set(r.fields.map(f => f.id)).size, r.fields.length, 'ids once a template')
check(ver.name, 'Kickoff (renamed)', 'a version published before keeps the template’s name as the migration found it')
check(r.sort, 1, 'a place in the rail')

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_minutes_duplicate(uuid)', 'mkt_minutes_discard(uuid,integer)', 'mkt_minutes_move(uuid,uuid)',
  'mkt_minutes_folder_save(uuid,uuid,text)', 'mkt_minutes_folder_delete(uuid)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_minutes_locks_kept(jsonb,jsonb)', 'EXECUTE')`), false,
  'the locked-field check is the save’s own')
for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
  check(await one(`SELECT has_table_privilege('authenticated', 'public.mkt_minutes_folders', '${p}')`), false, `no client ${p} on the folders`)
}
check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mkt_minutes_folders'::regclass`), true, 'folders: row security on')
check(await peek1(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_minutes_folders'`), 'none', 'folders have their line in the register')
await as(U.mei, STAFF)
for (const [call, what] of [
  [`SELECT public.mkt_minutes_duplicate('${old.id}')`, 'duplicate'], [`SELECT public.mkt_minutes_discard('${old.id}', 1)`, 'discard'],
  [`SELECT public.mkt_minutes_move('${old.id}', NULL)`, 'move'], [`SELECT public.mkt_minutes_folder_save(NULL, NULL, 'X')`, 'make a folder'],
  [`SELECT public.mkt_minutes_folder_delete('${id(999)}')`, 'delete a folder']]) {
  await refuses(call, [], /The Minutes Builder is the manager's/, `the staff cannot ${what}`)
}

// ── Fields: an id each, a hint, a kind that may change ───────────────────────────
await as(U.josiah, MANAGER)
const F = (fid, name, type, extra = {}) => ({ id: fid, name, type, req: false, pic: true, ...extra })
const BASE = [F('p', 'Project (from Projects)', 'Project link', { lock: true }), F('d', 'Meeting date', 'Date', { req: true }),
  F('a', 'Attendees', 'People', { lock: true }), F('s', 'Signatures', 'Signature', { req: true })]
const t = await save(null, null, { name: 'Shoot briefing', fields: BASE, rules: {} })
let rev = t.rev
const bad = async (fields, pattern, what) => {
  await assert.rejects(save(t.id, rev, { fields }), err => pattern.test(String(err.message)), what)
  checks++
}
await bad([{ ...BASE[0], id: undefined }, ...BASE.slice(1)], /A field without a key of its own/, 'a field has an id')
await bad([BASE[0], { ...BASE[1], id: 'p' }, ...BASE.slice(2)], /A field without a key of its own/, 'an id once a template')
await bad([...BASE, F('h', 'Notes', 'Long text', { help: 'x'.repeat(121) })], /a hint of at most 120 characters/, 'a hint of 120 at most')
rev = (await save(t.id, rev, { fields: [...BASE.slice(0, 3), F('h', 'Notes', 'Long text', { help: '  Write   what\nwas decided ' }), F('e', 'Empty', 'Short text', { help: '  ' }), BASE[3]] })).rev
r = await row(t.id)
check(r.fields[3].help, 'Write what was decided', 'a hint kept on one line, its spaces tidied')
check('help' in r.fields[4], false, 'no hint is no key')
// Its kind changed.
rev = (await save(t.id, rev, { fields: r.fields.map(f => (f.id === 'e' ? { ...f, type: 'Number' } : f)) })).rev
check((await row(t.id)).fields[4].type, 'Number', 'a field’s kind changes after it was made')
r = await row(t.id)
await bad(r.fields.map(f => (f.id === 'e' ? { ...f, type: 'Signature' } : f)), /Only one Signature field allowed/, 'signatures once')
await bad(r.fields.map(f => (f.id === 'e' ? { ...f, type: 'Project link' } : f)), /Only one Project link field allowed/, 'the project once')
await bad([...r.fields, F('c1', 'Run', 'Campaign period'), F('c2', 'Run 2', 'Campaign period')], /Only one Campaign period field allowed/, 'a campaign period once')
// The locked ones stay as they were.
await bad(r.fields.map(f => (f.id === 'a' ? { ...f, type: 'Short text', lock: false } : f)), /"Attendees" is kept by every minutes/, 'the attendees not retyped')
await bad(r.fields.map(f => (f.id === 'a' ? { ...f, name: 'Who came' } : f)), /"Attendees" is kept by every minutes/, 'the attendees not renamed')
await bad(r.fields.map(f => (f.id === 'a' ? { ...f, lock: false } : f)), /"Attendees" is kept by every minutes/, 'the attendees not unlocked')
await bad(r.fields.filter(f => f.id !== 'p'), /"Project \(from Projects\)" is kept by every minutes/, 'the project not removed')
check((await row(t.id)).draft_rev, rev, 'nothing refused was saved')

// ── A table's starting rows and what the staff may add ───────────────────────────
const cols = [{ name: 'Task', type: 'Text' }, { name: 'Deadline', type: 'Date' }]
await bad([...r.fields, F('t', 'Actions', 'Table', { cols, rows: [['a']] })], /a starting row is one cell per column/, 'rows aligned to the columns')
await bad([...r.fields, F('t', 'Actions', 'Table', { cols, rows: Array.from({ length: 51 }, () => ['', '']) })], /at most 50 starting rows/, '50 rows at most')
rev = (await save(t.id, rev, { fields: [...r.fields, F('t', 'Actions', 'Table', { cols, rows: [['Book the shoot', ''], ['', '']] })] })).rev
r = await row(t.id)
const tbl = r.fields.find(f => f.id === 't')
check([tbl.rows, tbl.staffRows, tbl.staffCols], [[['Book the shoot', ''], ['', '']], true, false], 'starting rows kept; staff add rows, not columns, unless set')
rev = (await save(t.id, rev, { fields: r.fields.map(f => (f.id === 't' ? { ...f, staffRows: false, staffCols: true } : f)) })).rev
check((await row(t.id)).fields.find(f => f.id === 't').staffRows, false, 'Staff can add rows turned off')
check('rows' in (await row(t.id)).fields.find(f => f.id === 'd'), false, 'only a table keeps rows')

// ── Published under its name; the reader ─────────────────────────────────────────
rev = (await save(t.id, rev, { name: 'Shoot brief' })).rev
await publish(t.id, rev)
check(await peek1(`SELECT name FROM public.mkt_minutes_versions WHERE template_id = $1 AND version = 1`, [t.id]), 'Shoot brief', 'a version keeps its name')
await asSystem()
await q(`INSERT INTO public.mkt_products (code, name, intake_id, status) VALUES ('PRD-26001', 'Reels', $1, 'active'), ('PRD-26002', 'Old', $1, 'retired')`, [t.id])
await q(`INSERT INTO public.mkt_minutes (template_id, template_version, status) VALUES ($1, 1, 'draft'), ($1, 1, 'completed'), ($1, 1, 'sent')`, [t.id])
await as(U.josiah, MANAGER)
let rd = await list()
let it = rd.templates.find(x => x.id === t.id)
check([it.published.name, it.published.fields.length, it.usedBy, it.open, it.openOnLive, it.folder], ['Shoot brief', 7, ['Reels'], 2, 2, null],
  'the reader: the version as published, what uses it (never a retired product), the open minutes')
check(rd.folders, [], 'no folders yet')

// ── Discard: back to the version ─────────────────────────────────────────────────
await refuses(`SELECT public.mkt_minutes_discard($1, $2)`, [t.id, rev], /Nothing has changed since v1/, 'nothing to discard')
rev = (await save(t.id, rev, { name: 'Shoot brief 2', fields: (await row(t.id)).fields.slice(0, 3).concat((await row(t.id)).fields.slice(-1)) })).rev
await refuses(`SELECT public.mkt_minutes_discard($1, $2)`, [t.id, rev - 1], /changed this template since you opened it/, 'discards only the draft its user saw')
const back = await one(`SELECT public.mkt_minutes_discard($1, $2)`, [t.id, rev])
check(back.rev, rev + 1, 'a new draft count')
r = await row(t.id)
check([r.name, r.fields.length, r.published_rev === r.draft_rev], ['Shoot brief', 7, true], 'name, fields and rules as v1; nothing to publish')
rev = back.rev
const fresh = await save(null, null, { name: 'Never', fields: BASE, rules: {} })
await refuses(`SELECT public.mkt_minutes_discard($1, $2)`, [fresh.id, fresh.rev], /Never published/, 'a template never published has no version to go back to')

// ── Duplicate ────────────────────────────────────────────────────────────────────
const d1 = await one(`SELECT public.mkt_minutes_duplicate($1)`, [t.id])
const d2 = await one(`SELECT public.mkt_minutes_duplicate($1)`, [t.id])
check([d1.name, d2.name], ['Shoot brief copy', 'Shoot brief copy 2'], 'named "… copy", then "… copy 2"')
const c = await row(d1.id)
check([c.version, c.published_rev, c.fields.length], [0, null, 7], 'a new draft, never published, its fields copied')
check(c.fields.some(f => r.fields.some(g => g.id === f.id)), false, 'its fields given new ids')
rd = await list()
const order = rd.templates.map(x => x.name)
check(order.indexOf('Shoot brief copy 2'), order.indexOf('Shoot brief') + 1, 'the copy sits after the original')

// ── Folders ──────────────────────────────────────────────────────────────────────
const top = await one(`SELECT public.mkt_minutes_folder_save(NULL, NULL, '  Project   minutes ')`)
check(top.name, 'Project minutes', 'a folder named, its spaces tidied')
let parent = top.id
for (let i = 2; i <= 8; i++) parent = (await one(`SELECT public.mkt_minutes_folder_save(NULL, $1, $2)`, [parent, `Level ${i}`])).id
await refuses(`SELECT public.mkt_minutes_folder_save(NULL, $1, 'Level 9')`, [parent], /at most 8 deep/, 'eight deep at most')
await refuses(`SELECT public.mkt_minutes_folder_save(NULL, $1, 'X')`, [id(999)], /That folder is not there any more/, 'inside a folder that is there')
await refuses(`SELECT public.mkt_minutes_folder_save(NULL, NULL, ' ')`, [], /Name the folder/, 'a folder keeps a name')
const inner = await one(`SELECT public.mkt_minutes_folder_save(NULL, $1, 'Recurring')`, [top.id])
check((await one(`SELECT public.mkt_minutes_folder_save($1, NULL, 'Renamed')`, [inner.id])).parent, top.id, 'renamed where it is')
await q(`SELECT public.mkt_minutes_move($1, $2)`, [t.id, inner.id])
r = await row(t.id)
check([r.folder_id, r.draft_rev], [inner.id, rev], 'moved into a folder — no new draft count, nothing to publish')
await refuses(`SELECT public.mkt_minutes_move($1, $2)`, [t.id, id(999)], /That folder is not there any more/, 'only into a folder that is there')
const made = await save(null, null, { name: 'Made inside', fields: BASE, rules: {}, folder: inner.id })
check((await row(made.id)).folder_id, inner.id, 'a template made inside a folder')
// A folder deleted: what was in it moves up a level.
await q(`SELECT public.mkt_minutes_folder_delete($1)`, [top.id])
check((await row(t.id)).folder_id, inner.id, 'a template two levels down stays in its folder')
check(await peek1(`SELECT parent_id FROM public.mkt_minutes_folders WHERE id = $1`, [inner.id]), null, 'its subfolder moved up a level')
await q(`SELECT public.mkt_minutes_folder_delete($1)`, [inner.id])
check([(await row(t.id)).folder_id, (await row(made.id)).folder_id], [null, null], 'its templates moved up — out of every folder')
await q(`SELECT public.mkt_minutes_folder_delete($1)`, [inner.id])
checks++ // a folder gone already is no error
rd = await list()
check(rd.folders.map(f => f.name).sort(), ['Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8'], 'the folders left')

// ── The minutes follow the builder: a table's answer ─────────────────────────────
const value = (field, v) => one(`SELECT public.mkt_minutes_value($1::jsonb, $2::jsonb)`, [JSON.stringify(field), JSON.stringify(v)])
const T = { name: 'Actions', type: 'Table', cols, rows: [['Book', ''], ['', '']], staffRows: true, staffCols: false }
check(await value(T, { rows: [['a', 'b']] }), { rows: [['a', 'b']] }, 'an answer as before')
await refuses(`SELECT public.mkt_minutes_value($1::jsonb, $2::jsonb)`, [JSON.stringify(T), JSON.stringify({ xcols: ['Owner'], rows: [['a', 'b', 'c']] })],
  /its columns are set by the template/, 'no columns of their own unless the template lets them')
const TC = { ...T, staffCols: true }
check(await value(TC, { xcols: ['Owner'], rows: [['a', 'b', 'c']] }), { xcols: ['Owner'], rows: [['a', 'b', 'c']] }, 'the staff’s own column kept')
await refuses(`SELECT public.mkt_minutes_value($1::jsonb, $2::jsonb)`, [JSON.stringify(TC), JSON.stringify({ xcols: ['Owner'], rows: [['a', 'b']] })],
  /a row is one short line per column/, 'each row a cell for their column too')
await refuses(`SELECT public.mkt_minutes_value($1::jsonb, $2::jsonb)`,
  [JSON.stringify(TC), JSON.stringify({ xcols: Array.from({ length: 7 }, (_, i) => `X${i}`), rows: [] })], /8 columns at most/, 'eight columns in all')
const TR = { ...T, staffRows: false }
check(await value(TR, { rows: [['a', ''], ['', 'b']] }), { rows: [['a', ''], ['', 'b']] }, 'the starting rows written in')
await refuses(`SELECT public.mkt_minutes_value($1::jsonb, $2::jsonb)`, [JSON.stringify(TR), JSON.stringify({ rows: [['a', ''], ['', ''], ['', '']] })],
  /its rows are set by the template/, 'no rows added when the template says so')
check(await value({ ...TR, rows: undefined }, { rows: [['', ''], ['', '']] }), { rows: [['', ''], ['', '']] }, 'two rows when it has none saved')
const missing = (fields, vals) => one(`SELECT public.mkt_minutes_missing($1::jsonb, $2::jsonb)`, [JSON.stringify(fields), JSON.stringify(vals)])
check(await missing([{ ...T, req: true }], {}), [], 'a required table whose starting rows hold something is filled')
check(await missing([{ ...T, req: true, rows: [['', ''], ['', '']] }], {}), ['Actions'], '…blank starting rows are not')
check(await missing([{ ...T, req: true }], { Actions: { rows: [['', ''], ['', '']] } }), ['Actions'], '…and an answer emptied is empty')

console.log(`marketing minutes builder v2: ${checks} checks passed`)
