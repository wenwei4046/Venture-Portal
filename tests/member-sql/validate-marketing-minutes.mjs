// Local PostgreSQL regression for 20261023235800 (2026-10-23 — Marketing's Minutes Builder, ③ of the Claude Design handoff
// "HOUZS Marketing Module Setup"). The four Marketing migrations run VERBATIM, twice, over the stand-ins the first one's
// check uses. What is under test: only the manager builds; a template made, saved part by part and never over somebody
// else's save; the project and the attendees every minutes keep; publishing checks the whole template and keeps each
// version whole; the limits; the reader. No live I/O.
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

// ── Who may call what ─────────────────────────────────────────────────────────────
const CALLS = ['mkt_minutes_templates()', 'mkt_minutes_save(uuid,integer,jsonb)', 'mkt_minutes_publish(uuid,integer)']
for (const fn of CALLS) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_minutes_check(jsonb,jsonb,boolean)', 'EXECUTE')`), false,
  'the check is the functions’ own')
check(await one(`SELECT has_function_privilege('service_role', 'public.mkt_minutes_check(jsonb,jsonb,boolean)', 'EXECUTE')`), true,
  '…the service role keeps it')
for (const t of ['mkt_minutes_templates', 'mkt_minutes_versions']) {
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', '${p}')`), false, `no client ${p} on ${t}`)
  }
  check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`), true, `${t}: row security on`)
}
check(await peek(`SELECT t, area, mode FROM public.audit_registered WHERE t LIKE 'mkt_minutes%' ORDER BY t`),
  [{ t: 'mkt_minutes_templates', area: 'Marketing', mode: 'none' }, { t: 'mkt_minutes_versions', area: 'Marketing', mode: 'none' }],
  'both tables have their line in the history’s register')
check(await peek(`SELECT page FROM public.permission_page_tabs WHERE tab_id = 'mkt.tracking' ORDER BY page`),
  [{ page: '/marketing/minutes' }, { page: '/marketing/workflows' }], 'the Minutes Builder is the manager’s tools’ page in the database’s registry')

// ── Only the manager builds ───────────────────────────────────────────────────────
const save = (tid, rev, patch) => one(`SELECT public.mkt_minutes_save($1, $2, $3::jsonb)`, [tid, rev, JSON.stringify(patch)])
const publish = (tid, rev) => one(`SELECT public.mkt_minutes_publish($1, $2)`, [tid, rev])
const list = async () => (await one(`SELECT public.mkt_minutes_templates()`)).templates
const row = tid => peek(`SELECT * FROM public.mkt_minutes_templates WHERE id = $1`, [tid]).then(r => r[0])
const versions = tid => peek(`SELECT version, fields, rules, published_by FROM public.mkt_minutes_versions WHERE template_id = $1 ORDER BY version`, [tid])

for (const [who, actions, what] of [[U.mei, STAFF, 'staff'], [U.outsider, [], 'somebody outside Marketing'], [null, MANAGER, 'nobody signed in']]) {
  await as(who, actions)
  await refuses(`SELECT public.mkt_minutes_templates()`, [], /The Minutes Builder is the manager's/, `${what} cannot read the builder`)
  await refuses(`SELECT public.mkt_minutes_save(NULL, NULL, '{"name":"A","fields":[]}'::jsonb)`, [], /The Minutes Builder is the manager's/,
    `${what} cannot make a template`)
}

// ── A template made ───────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
check(await list(), [], 'nothing built yet')
const BASE = [
  { name: 'Project (from Projects)', type: 'Project link', req: false, pic: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true },
  { name: 'Attendees', type: 'People', req: false, pic: true, lock: true },
]
const KICKOFF = [...BASE,
  { name: 'Objective', type: 'Long text', req: true, pic: true },
  { name: 'Budget', type: 'Number', req: false, pic: false },
  { name: 'Shot list', type: 'Table', req: false, pic: false, cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due date', type: 'Date' }] },
  { name: 'Signatures', type: 'Signature', req: true, pic: true },
]
const kick = await save(null, null, { name: ' Kickoff ', fields: KICKOFF, rules: { sign: true, pic: 'yes', project: true, file: true, lock: true, extra: true } })
check(kick.rev, 1, 'a new template’s first save')
let r = await row(kick.id)
check([r.name, r.version, r.published_rev], ['Kickoff', 0, null], 'named, never published')
check(r.fields[0], { name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true }, 'the project: locked, always required')
check(r.fields[2], { name: 'Attendees', type: 'People', req: true, pic: true, lock: true }, 'the attendees: locked, always required')
check(r.fields[4], { name: 'Budget', type: 'Number', req: false, pic: false, lock: false }, 'a field as set')
check(r.fields[5].cols, [{ name: 'Shot', type: 'Text' }, { name: 'Due date', type: 'Date' }], 'a table’s columns')
check(r.rules, { sign: true, pic: false, project: true, file: true, lock: true }, 'the five rules, yes or no — nothing else kept')
await refuses(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'KICKOFF', fields: [] })],
  /"KICKOFF" is there already/, 'a template’s name is its own, whatever the case')

// ── Saved part by part, never over somebody else's save ───────────────────────────
await refuses(`SELECT public.mkt_minutes_save($1, 0, '{"name":"X"}'::jsonb)`, [kick.id],
  /Sia Josiah changed this template since you opened it — reload to see it/, 'a save made on an older draft is refused, with who saved since')
check((await save(kick.id, 1, { name: 'Kickoff meeting' })).rev, 2, 'renamed')
r = await row(kick.id)
check([r.name, r.fields.length, r.rules.sign], ['Kickoff meeting', 7, true], 'only what was sent changes')
check((await save(kick.id, 2, { rules: { sign: false, pic: true, project: true, file: false, lock: true } })).rev, 3, 'the rules changed')
check((await row(kick.id)).rules, { sign: false, pic: true, project: true, file: false, lock: true }, '…as sent')

// ── Published: checked whole ──────────────────────────────────────────────────────
const v1 = await publish(kick.id, 3)
check([v1.version, v1.rev], [1, 3], 'published as v1')
await refuses(`SELECT public.mkt_minutes_publish($1, 3)`, [kick.id], /Nothing has changed since v1/, 'the same draft is not published twice')
let rev = (await save(kick.id, 3, { fields: [...KICKOFF.slice(0, 4), { name: 'Decisions', type: 'Long text', req: true, pic: true }, KICKOFF[6]] })).rev
await refuses(`SELECT public.mkt_minutes_publish($1, 3)`, [kick.id], /changed this template since you opened it/, 'publishes only the draft its publisher saw')
check((await publish(kick.id, rev)).version, 2, 'published as v2')
const vs = await versions(kick.id)
check([vs.length, vs[0].fields.length, vs[1].fields.length, vs[0].published_by], [2, 7, 6, U.josiah], 'each version kept whole, v1 as it was')

// What publishing refuses — each on a draft the builder keeps.
const tryPublish = async (fields, pattern, what) => {
  rev = (await save(kick.id, rev, { fields })).rev
  await refuses(`SELECT public.mkt_minutes_publish($1, $2)`, [kick.id, rev], pattern, what)
}
await tryPublish([...BASE, { name: ' ', type: 'Short text' }], /Name each field/, 'every field named')
await tryPublish([...BASE, { name: 'Notes', type: 'Short text' }, { name: 'notes', type: 'Long text' }], /Two fields called "notes"/,
  'a draft may hold two fields of one name while typed; a version may not')
await tryPublish([...BASE, { name: 'Plan', type: 'Table', cols: [{ name: '', type: 'Text' }] }], /name each column/, 'every column named')
await tryPublish(BASE.slice(1), /Minutes keep the project they are for and their attendees/, 'the project kept')
await tryPublish([BASE[0], BASE[1], { ...BASE[2], lock: false }], /Minutes keep the project they are for and their attendees/, 'the attendees kept')
check((await row(kick.id)).version, 2, 'nothing refused was published')

// ── The limits ────────────────────────────────────────────────────────────────────
let n = 0
const bad = async (fields, pattern, what) => {
  await assert.rejects(save(null, null, { name: `Limits ${++n}`, fields }), err => pattern.test(String(err.message)), what)
  checks++
}
await bad({}, /Not a list of fields/, 'a list')
await bad(Array.from({ length: 41 }, (_, i) => ({ name: `F${i}`, type: 'Short text' })), /at most 40 fields/, 'forty fields at most')
await bad([{ name: 'A', type: 'Video' }], /a kind minutes cannot hold/, 'only the builder’s kinds')
await bad([{ name: 'x'.repeat(61), type: 'Short text' }], /Name each field/, 'a short name')
await bad([{ name: 'T', type: 'Table', cols: [] }], /a table has 1 to 8 columns/, 'a table has columns')
await bad([{ name: 'T', type: 'Table', cols: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, type: 'Text' })) }], /a table has 1 to 8 columns/,
  'eight columns at most')
await bad([{ name: 'T', type: 'Table', cols: [{ name: 'C', type: 'Checkbox' }] }], /name each column/, 'only the builder’s column kinds')
await bad([BASE[0], { ...BASE[0], name: 'Another project' }], /Minutes link one project and keep one set of signatures/, 'one project')
await bad([KICKOFF[6], { ...KICKOFF[6], name: 'More signatures' }], /Minutes link one project and keep one set of signatures/, 'one set of signatures')
await refuses(`SELECT public.mkt_minutes_save(NULL, NULL, '{"name":"  ","fields":[]}'::jsonb)`, [], /Name the template/, 'a template keeps a name')

// ── The reader ────────────────────────────────────────────────────────────────────
const draft = await save(null, null, { name: 'Shoot briefing', fields: BASE, rules: {} })
const all = await list()
check(all.map(t => t.name), ['Kickoff meeting', 'Shoot briefing'], 'as they were made')
const k = all.find(t => t.id === kick.id)
check([k.version, k.changed, k.publishedBy, k.updatedBy], [2, true, 'Sia Josiah', 'Sia Josiah'], 'its version; drafts saved since')
check([all.find(t => t.id === draft.id).version, all.find(t => t.id === draft.id).changed], [0, true], 'a template never published has something to publish')

console.log(`marketing minutes: ${checks} checks passed`)
