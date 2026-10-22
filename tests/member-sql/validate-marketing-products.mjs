// Local PostgreSQL regression for 20261023235900 (2026-10-23 — Marketing's Product Builder, ③ of the Claude Design handoff
// "HOUZS Marketing Module Setup"). The five Marketing migrations run VERBATIM, twice, over the stand-ins the first one's
// check uses. What is under test: only the manager builds — and so sees the prices; a product's code made; its draft
// saved part by part and never over somebody else's save; publishing asks what the five sections do and keeps each
// version whole with the workflow and minutes versions it starts on; retired and reactivated; the reader. No live I/O.
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
const products = await sql('20261023235900_marketing_products.sql')
for (const m of [core, tasks, workflows, minutes, products, core, tasks, workflows, minutes, products]) await db.exec(m) // twice, in order
await db.exec(products)

const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const yy = await one(`SELECT to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YY')`)

// ── Who may call what ─────────────────────────────────────────────────────────────
const CALLS = ['mkt_products()', 'mkt_product_save(uuid,integer,jsonb)', 'mkt_product_publish(uuid,integer)', 'mkt_product_status(uuid,text)']
for (const fn of CALLS) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['mkt_product_groups(jsonb,boolean)', 'mkt_product_included(jsonb)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `${fn}: the service role keeps it`)
}
for (const t of ['mkt_products', 'mkt_product_versions']) {
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', '${p}')`), false, `no client ${p} on ${t} — its prices are the manager’s`)
  }
  check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`), true, `${t}: row security on`)
}
check(await peek(`SELECT t, area, mode FROM public.audit_registered WHERE t LIKE 'mkt_product%' ORDER BY t`),
  [{ t: 'mkt_product_versions', area: 'Marketing', mode: 'none' }, { t: 'mkt_products', area: 'Marketing', mode: 'none' }],
  'both tables have their line in the history’s register')
check(await peek(`SELECT page FROM public.permission_page_tabs WHERE tab_id = 'mkt.tracking' ORDER BY page`),
  [{ page: '/marketing/minutes' }, { page: '/marketing/products' }, { page: '/marketing/workflows' }],
  'the Product Builder is the manager’s tools’ page in the database’s registry')

// ── Only the manager — and so its prices ──────────────────────────────────────────
const save = (pid, rev, patch) => one(`SELECT public.mkt_product_save($1, $2, $3::jsonb)`, [pid, rev, JSON.stringify(patch)])
const publish = (pid, rev) => one(`SELECT public.mkt_product_publish($1, $2)`, [pid, rev])
const status = (pid, to) => one(`SELECT public.mkt_product_status($1, $2)`, [pid, to])
const book = () => one(`SELECT public.mkt_products()`)
const row = pid => peek(`SELECT * FROM public.mkt_products WHERE id = $1`, [pid]).then(r => r[0])

for (const [who, actions, what] of [[U.mei, STAFF, 'staff'], [U.outsider, [], 'somebody outside Marketing'], [null, MANAGER, 'nobody signed in']]) {
  await as(who, actions)
  await refuses(`SELECT public.mkt_products()`, [], /The Product Builder is the manager's/, `${what} cannot read the products or their prices`)
  await refuses(`SELECT public.mkt_product_save(NULL, NULL, '{}'::jsonb)`, [], /The Product Builder is the manager's/, `${what} cannot make a product`)
}

// What a product links: a workflow and a minutes template, made and published by the manager.
await as(U.josiah, MANAGER)
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Design photo', tname: 'Simple',
  stages: [{ name: 'Design', dept: 'design', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }] }] })])
const wfDraft = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Reels video', tname: 'Standard',
  stages: [{ name: 'Edit', dept: 'content', who: { mode: 'assign' }, sla: 3 }] })])
const mins = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff', rules: { project: true },
  fields: [{ name: 'Project (from Projects)', type: 'Project link' }, { name: 'Attendees', type: 'People', lock: true }, { name: 'Objective', type: 'Long text', req: true, pic: true }] })])

// ── A product made ────────────────────────────────────────────────────────────────
check((await book()).products, [], 'nothing built yet')
const p1 = await save(null, null, { kind: 'recurring' })
check([p1.code, p1.rev], [`PRD-${yy}001`, 1], 'a new product’s code is made: PRD-<YY><NNN>')
const p2 = await save(null, null, {})
check(p2.code, `PRD-${yy}002`, '…and the next one’s')
let r = await row(p1.id)
check([r.name, r.kind, r.status, r.version, r.price], ['', 'recurring', 'draft', 0, null], 'a draft, unnamed, never published')

// ── Saved part by part, never over somebody else's save ───────────────────────────
const GROUPS = [
  { name: 'Graphic design', items: [{ name: 'Image posts', qty: 4, price: 450, workflow: wf.id }, { name: 'Banners', qty: 0, price: 600.5, workflow: wf.id }] },
]
await refuses(`SELECT public.mkt_product_save($1, 0, '{"name":"X"}'::jsonb)`, [p1.id],
  /Sia Josiah changed this product since you opened it — reload to see it/, 'a save made on an older draft is refused, with who saved since')
let rev = (await save(p1.id, 1, { name: ' Social Media Package A ', description: 'Monthly social media.', groups: GROUPS })).rev
r = await row(p1.id)
check([rev, r.name, r.groups[0].items[1].price], [2, 'Social Media Package A', 600.5], 'named, described, what it includes')
check(r.groups[0].items[0], { name: 'Image posts', qty: 4, price: 450, workflow: wf.id }, 'an action: its quantity, unit price and workflow')
rev = (await save(p1.id, rev, { price: 4800, cost: 3100.25, intake: mins.id, effectiveFrom: '2026-11-01' })).rev
r = await row(p1.id)
check([r.price, r.cost, r.intake_id, r.effective_from instanceof Date ? r.effective_from.toISOString().slice(0, 10) : String(r.effective_from).slice(0, 10)],
  ['4800.00', '3100.25', mins.id, '2026-11-01'], 'the price and cost in ringgit and sen, the intake, the day it takes effect')
rev = (await save(p1.id, rev, { cost: null })).rev
check((await row(p1.id)).cost, null, 'a cost taken off')
for (const [patch, pattern, what] of [
  [{ price: -1 }, /A price in ringgit and sen/, 'no negative price'],
  [{ price: 12.345 }, /A price in ringgit and sen/, 'two decimals at most'],
  [{ price: '4800' }, /A price in ringgit and sen/, 'a price is a number'],
  [{ cost: 1e13 }, /A cost in ringgit and sen/, 'within decimal(15,2)'],
  [{ kind: 'weekly' }, /One-time or recurring monthly/, 'one-time or recurring'],
  [{ intake: '00000000-0000-4000-8000-000000000999' }, /That minutes template is not there/, 'an intake that is there'],
  [{ effectiveFrom: 'soon' }, /A day for it to take effect/, 'a day'],
  [{ name: 'x'.repeat(81) }, /at most 80 characters/, 'a short name'],
  [{ groups: [{ name: 'G', items: [{ name: 'A', qty: 1000 }] }] }, /A quantity of 0 to 999/, 'a quantity under a thousand'],
  [{ groups: [{ name: 'G', items: [{ name: 'A', qty: 1, price: 1.001 }] }] }, /A unit price in ringgit and sen/, 'a unit price in sen'],
  [{ groups: [{ name: 'G', items: [{ name: 'A', qty: 1, workflow: '00000000-0000-4000-8000-000000000999' }] }] }, /that workflow is not there/, 'a workflow that is there'],
  [{ groups: Array.from({ length: 13 }, (_, i) => ({ name: `G${i}`, items: [] })) }, /at most 12 categories/, 'twelve categories at most'],
]) await refuses(`SELECT public.mkt_product_save($1, $2, $3::jsonb)`, [p1.id, rev, JSON.stringify(patch)], pattern, what)

// ── Published: what the five sections ask, checked whole ──────────────────────────
const tryPublish = async (patch, pattern, what) => {
  if (patch) rev = (await save(p1.id, rev, patch)).rev
  await refuses(`SELECT public.mkt_product_publish($1, $2)`, [p1.id, rev], pattern, what)
}
await tryPublish(null, /"Image posts": its workflow is not published yet/, 'each workflow published first')
await one(`SELECT public.mkt_workflow_publish($1, 1)`, [wf.id])
await tryPublish(null, /Its intake minutes template is not published yet/, 'the intake published first')
await one(`SELECT public.mkt_minutes_publish($1, 1)`, [mins.id])
await tryPublish({ name: '' }, /Name the product/, 'a name')
await tryPublish({ name: 'Social Media Package A', groups: [{ name: 'Graphic design', items: [{ name: 'Image posts', qty: 0, price: 450, workflow: wf.id }] }] },
  /Add what the product includes/, 'something included')
await tryPublish({ groups: [{ name: 'Graphic design', items: [{ name: 'Image posts', qty: 4, price: 450 }] }] }, /"Image posts": link a workflow/, 'a workflow for every action')
await tryPublish({ groups: [...GROUPS, { name: 'Video', items: [{ name: 'Reels', qty: 2, price: 1200, workflow: wfDraft.id }] }] },
  /"Reels": its workflow is not published yet/, 'every linked workflow published')
await tryPublish({ groups: GROUPS, price: null }, /Set its list price/, 'a price')
await tryPublish({ price: 4800, effectiveFrom: null }, /Pick the day it takes effect/, 'a day')
rev = (await save(p1.id, rev, { effectiveFrom: '2026-11-01' })).rev
const v1 = await publish(p1.id, rev)
check([v1.version, v1.live], [1, 0], 'published as v1')
r = await row(p1.id)
check([r.status, r.version], ['active', 1], 'on sale')
const ver = (await peek(`SELECT * FROM public.mkt_product_versions WHERE product_id = $1`, [p1.id]))[0]
check([ver.name, ver.price, ver.cost, ver.intake_version, ver.note], ['Social Media Package A', '4800.00', null, 1, '4 image posts / month'],
  'the version kept whole: what it included, in words')
check(ver.groups[0].items[0].workflowVersion, 1, 'each action carries the workflow version its projects start on')
await refuses(`SELECT public.mkt_product_publish($1, $2)`, [p1.id, rev], /Nothing has changed since v1/, 'the same draft is not published twice')

// ── Retired: no new projects; those running keep their version ────────────────────
await asSystem()
await q(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, product_id, product_version) VALUES ('MKT-CAR-2610-001', 'product', $1, 'Carres social', $2, 1)`,
  [CAR, p1.id])
await refuses(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, product_id, product_version) VALUES ('MKT-CAR-2610-002', 'product', $1, 'X', $2, 2)`,
  [CAR, p1.id], /foreign key/, 'a project names a version that was published')
await as(U.josiah, MANAGER)
const ret = await status(p1.id, 'retire')
check([ret.status, ret.live, ret.version], ['retired', 1, 1], 'retired: the project running keeps v1')
await refuses(`SELECT public.mkt_product_save($1, $2, '{"name":"Y"}'::jsonb)`, [p1.id, rev], /A retired product is read-only — reactivate it first/, 'read-only once retired')
await refuses(`SELECT public.mkt_product_status($1, 'retire')`, [p1.id], /Only a product on sale is retired/, 'retired once')
check((await status(p1.id, 'reactivate')).status, 'active', 'reactivated')
await refuses(`SELECT public.mkt_product_status($1, 'reactivate')`, [p2.id], /Only a retired product is reactivated/, 'a draft is not reactivated')
await refuses(`SELECT public.mkt_product_status($1, 'sell')`, [p1.id], /Retire or reactivate/, 'retire or reactivate — nothing else')

// ── The reader ────────────────────────────────────────────────────────────────────
const b = await book()
check(b.products.map(p => [p.code, p.status]), [[`PRD-${yy}001`, 'active'], [`PRD-${yy}002`, 'draft']], 'on sale first, then drafts')
const bp = b.products[0]
check([bp.price, bp.live, bp.changed, bp.history.length, bp.history[0].note, bp.history[0].by], [4800, 1, false, 1, '4 image posts / month', 'Sia Josiah'],
  'its price, the projects on it, its history')
check(b.workflows.map(w => [w.action, w.version, w.stages, w.days, w.pic]), [['Design photo', 1, 1, 2, 1], ['Reels video', 0, 1, 3, 0]],
  'the workflow picker: each template, published or not, its stages, days and PIC approvals')
check(b.minutes.map(t => [t.name, t.version, t.fields]), [['Kickoff', 1, 3]], 'the intake picker')

console.log(`marketing products: ${checks} checks passed`)
