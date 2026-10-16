// Local PostgreSQL regression for 20261016180000 (sub-departments per person, 2026-10-16 — the owner: "1, this
// follow by this handle department, as default", then ticks "按 sub-department" on the CRM and the Revenue team's
// tabs). Every CRM migration runs VERBATIM first, then 20261016150000 (the CRM opens to the matrix), then this
// one, twice; crm_my_role() and view_as_person() are checked against production's md5 before it swaps a
// statement in each. Each person's CRM cells are stated (test_crm_cells); the People / Permissions keys and
// actions this migration's functions ask are the test's own stand-ins (test_keys, test_actions). No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refused = async (promise, pattern, what) => {
  await assert.rejects(promise, pattern, what)
  checks++
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  -- auth.uid() reads the claim view_as_person() swaps, as production's does.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('test.uid', true), ''))::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.users (id uuid primary key, is_active boolean not null default true, role text, name text, email text, department_id uuid);
  create table public.titles (id uuid primary key, name text);
  create table public.hr_staff_costs (
    id uuid primary key, employee_name text, user_id uuid references public.users(id),
    title_id uuid references public.titles(id), reports_to uuid references public.hr_staff_costs(id), status text not null default 'active');
  create table public.comm_sub_departments (id uuid primary key, name text, is_active boolean not null default true);
  create table public.comm_schemes (id uuid primary key, sub_department_id uuid references public.comm_sub_departments(id), is_active boolean not null default true);
  create table public.comm_hierarchy (
    id uuid primary key default gen_random_uuid(), scheme_id uuid references public.comm_schemes(id), staff_id uuid references public.hr_staff_costs(id),
    upline_staff_id uuid references public.hr_staff_costs(id), title_id uuid references public.titles(id),
    effective_from date not null default '2026-01-01', effective_to date);
  create table public.comm_sub_department_directors (sub_department_id uuid, staff_id uuid);
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;

  -- The People / Permissions side, as stand-ins: who holds which key and which action.
  create table public.test_keys (uid uuid not null, key text not null);
  create table public.test_actions (uid uuid not null, want text not null);
  create function public.has_perm(p_key text) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from test_keys where uid = auth.uid() and key = p_key) $$;
  create function public.has_any_action(p_wants text[]) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from test_actions a where a.uid = auth.uid() and a.want = any (p_wants)) $$;
  create table public.permission_table_reads (table_name text primary key, actions text[] not null);
  create function public.permission_reads_guard(p_table text) returns integer language sql as $$ select 1 $$;
  -- What view_as_person() gathers besides the reach.
  create function public.current_permissions() returns text[] language sql stable as $$ select '{}'::text[] $$;
  create function public.current_actions() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.current_sensitive_fields() returns text[] language sql stable as $$ select '{}'::text[] $$;
  create function public.current_tabs() returns jsonb language sql stable as $$ select null::jsonb $$;
`)

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
const S = who => id('s', who), T = t => id('t', t), U = who => id('u', who)
const FAIR = id('sd', 'fair'), IR = id('sd', 'ir'), OLD = id('sd', 'old')
await q(`insert into comm_sub_departments values ($1, 'Fair', true), ($2, 'IR', true), ($3, 'Closed', false)`, [FAIR, IR, OLD])
await q(`insert into comm_schemes values ($1, $2, true), ($3, $4, true), ($5, $6, true)`, [id('sc', 'fair'), FAIR, id('sc', 'ir'), IR, id('sc', 'old'), OLD])

await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const file = async name => (await readFile(new URL(name, dir), 'utf8')).replace(/\r\n/g, '\n')
for (const f of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) await db.exec(await file(f))
await db.exec(await file('20261016150000_matrix_opens_the_crm.sql'))
// view_as_person() as its migration made it (production has not changed it since).
const vap = await file('20261011050000_view_as_person.sql')
await db.exec(vap.slice(vap.indexOf('CREATE OR REPLACE FUNCTION public.view_as_person'), vap.indexOf('REVOKE ALL ON FUNCTION public.view_as_person')))
const md5 = async fn => (await q(`select md5(prosrc) as m from pg_proc where proname = $1`, [fn]))[0].m
check(await md5('crm_my_role'), '21fae64b9dff5bd85cbc86cadab8641e', 'the sandbox’s crm_my_role() is production’s after 20261016150000')
check(await md5('view_as_person'), '642f4cb28ba8e965e8ba533ffb29b5e3', 'the sandbox’s view_as_person() is production’s')

// Titles: the CRM's own (mapped) and three it does not know.
for (const [t, name, role] of [['ceo', 'CHIEF EXECUTIVE OFFICER', 'boss'], ['dir', 'Revenue Director', 'hod'], ['tl', 'Team Leader', 'tl'],
  ['rs', 'Revenue Specialist', 'rs'], ['director', 'DIRECTOR', null], ['hrx', 'HR EXECUTIVE', null], ['fa', 'Finance Assistant', null]]) {
  await q(`insert into titles values ($1, $2)`, [T(t), name])
  if (role) await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [T(t), role])
}
const staff = [
  ['boss', 'ceo', 'principal'], ['peter', 'dir', 'revenue_member'], ['kris', 'dir', 'revenue_member'], ['anthony', 'tl', null], ['rachael', 'rs', null],
  ['cmk', 'director', 'principal'], ['sean', 'hrx', 'hr'], ['siti', 'fa', 'finance'], ['faironly', 'rs', null], ['gone', 'rs', null],
]
for (const [who, t, kind] of staff) {
  await q(`insert into users (id, is_active, role, name, email) values ($1, true, $2, $3, $4)`, [U(who), kind, who.toUpperCase(), `${who}@x`])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id) values ($1, $2, $3, $4)`, [S(who), who.toUpperCase(), U(who), T(t)])
}
await q(`insert into users (id, is_active, role, name, email) values ($1, true, 'principal', 'Principal', 'principal@x')`, [U('principal-at')])
const member = (who, scheme, t, up, from = '2026-01-01', to = null) => q(
  `insert into comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id, effective_from, effective_to) values ($1, $2, $3, $4, $5, $6)`,
  [id('sc', scheme), S(who), T(t), up ? S(up) : null, from, to])
await member('anthony', 'ir', 'tl', null)
await member('rachael', 'ir', 'rs', 'anthony')
await member('faironly', 'fair', 'rs', null)
// GONE left IR last year, and joins Fair only next year: today he handles nothing → every sub-department.
await member('gone', 'ir', 'rs', null, '2025-01-01', '2025-12-31')
await member('gone', 'fair', 'rs', null, '2099-01-01')
// SEAN (HR) directs the closed sub-department only: a closed one handles nothing.
await q(`insert into comm_sub_department_directors values ($1, $2), ($3, $4), ($5, $6)`, [IR, S('peter'), FAIR, S('kris'), OLD, S('sean')])

const ALL = [['view', 'all'], ['edit', 'all'], ['manage', 'all']]
const cells = async (who, list) => {
  await q(`delete from test_crm_cells where uid = $1`, [U(who)])
  for (const [action, scope] of list) await q(`insert into test_crm_cells values ($1, $2, $3)`, [U(who), action, scope])
}
await cells('cmk', ALL)
await cells('kris', ALL)
await cells('sean', [['export', 'all']])
await cells('siti', [['view', 'own'], ['edit', 'own']])
// The owner's login manages permissions; SEAN reads People (team + Logins & invites · View); SITI nothing of it.
for (const [who, key] of [['boss', 'permissions_manage'], ['boss', 'team'], ['boss', 'view_switch'], ['principal-at', 'view_switch'], ['sean', 'team']]) {
  await q(`insert into test_keys values ($1, $2)`, [U(who), key])
}
for (const [who, want] of [['boss', 'accounts.manage'], ['sean', 'accounts.view'], ['siti', 'team.view:own'], ['principal-at', 'accounts.manage']]) {
  await q(`insert into test_actions values ($1, $2)`, [U(who), want])
}

// ── This migration, verbatim — and again, which changes nothing ───────────
const sql = await file('20261016180000_sub_department_reach.sql')
await db.exec(sql)
const once = [await md5('crm_my_role'), await md5('view_as_person')]
await db.exec(sql)
check([await md5('crm_my_role'), await md5('view_as_person')], once, 'a second run swaps nothing more')

const as = async (who, text, params = []) => {
  await db.exec(`set test.uid = '${who ? U(who) : ''}'; set role authenticated`)
  try { return await q(text, params) } finally { await db.exec(`reset role`) }
}
const reach = async who => (await as(who, `select public.my_sub_department_reach() as r`))[0].r
const myRole = async who => (await as(who, `select public.crm_my_role() as r`))[0].r
const people = async who => (await as(who, `select public.crm_people() as p`))[0].p
const setTicks = (who, target, ticks) => as(who, `select public.permission_user_reach_set($1, $2::jsonb)`, [U(target), JSON.stringify(ticks)])
const every = { crm: [FAIR, IR], comm_cal: [FAIR, IR], sales_groups: [FAIR, IR], rules: [FAIR, IR] }
const only = sub => ({ crm: [sub], comm_cal: [sub], sales_groups: [sub], rules: [sub] })

// 1. The default: what they handle — every active sub-department for somebody who handles none.
check(await reach('kris'), only(FAIR), 'KRIS directs Fair: Fair, in every area')
check(await reach('peter'), only(IR), 'PETER directs IR here: IR')
check(await reach('anthony'), only(IR), 'ANTHONY is an IR member today: IR')
check(await reach('faironly'), only(FAIR), 'a Fair-only salesperson: Fair')
check(await reach('cmk'), every, 'CHAI MENG KEAT handles none: every sub-department')
check(await reach('principal-at'), every, 'the shared principal@ (no person): every one')
check(await reach('gone'), every, 'a membership that ended, or starts next year, is not handled today')
check(await reach('sean'), every, 'a closed sub-department is neither handled nor reached')
check(await reach(null), null, 'no sign-in: no answer')

// 2. The CRM lands everybody where 20261016150000 did.
check([await myRole('cmk'), await myRole('kris'), await myRole('peter'), await myRole('anthony'), await myRole('rachael'),
  await myRole('faironly'), await myRole('siti'), await myRole('principal-at'), await myRole('sean')],
['boss', null, 'hod', 'tl', 'rs', null, 'boss', 'boss', null],
'the company’s level at the top by its cells, IR by the structure, Fair-only people out, no CRM View out')

// 3. One person ticked on: KRIS opened to IR's CRM — at the top, by his cells; Comm Cal stays Fair.
await setTicks('boss', 'kris', [{ area: 'crm', sub: IR, granted: true }])
check((await reach('kris')).crm, [FAIR, IR], 'KRIS reaches IR in the CRM now')
check((await reach('kris')).comm_cal, [FAIR], '…and in no other area')
check(await myRole('kris'), 'boss', 'he is in IR’s CRM, at the top')
check((await people('kris')).people.some(p => p.id === S('kris') && p.role === 'boss'), true, 'and in his own list')

// 4. One person ticked off: ANTHONY held back from IR's CRM is out of it; the others' lists still know the structure.
await setTicks('boss', 'anthony', [{ area: 'crm', sub: IR, granted: false }])
check(await myRole('anthony'), null, 'ANTHONY held back from IR in the CRM is out')
check((await reach('anthony')).sales_groups, [IR], '…and still reaches IR on Sales Groups')
check((await q(`select public.crm_role_of($1) as r`, [S('anthony')]))[0].r, 'tl', 'crm_role_of (other people) still reads the structure')

// 5. The whole list replaces: sending none puts the default back.
await setTicks('boss', 'anthony', [])
check(await myRole('anthony'), 'tl', 'an empty list puts him back on what he handles')
check((await q(`select count(*)::int as n from user_sub_department_reach where user_id = $1`, [U('anthony')]))[0].n, 0, 'and keeps no row for him')
await setTicks('boss', 'kris', [{ area: 'crm', sub: IR, granted: true }, { area: 'rules', sub: FAIR, granted: false }])
check(await reach('kris'), { crm: [FAIR, IR], comm_cal: [FAIR], sales_groups: [FAIR], rules: [] }, 'one save, every area of his')
await setTicks('boss', 'kris', [{ area: 'crm', sub: IR, granted: true }, { area: 'rules', sub: FAIR, granted: false }])
check((await q(`select count(*)::int as n from user_sub_department_reach where user_id = $1`, [U('kris')]))[0].n, 2, 'saving the same twice keeps two rows')

// 6. Who may set them, and what.
await refused(setTicks('sean', 'kris', []), /Only whoever manages permissions/, 'reading People is not managing permissions')
await refused(setTicks(null, 'kris', []), /Only whoever manages permissions/, 'no sign-in')
await refused(setTicks('boss', 'kris', [{ area: 'quotes', sub: IR, granted: true }]), /is not a sub-department of an area/, 'an area the CRM and Revenue do not have')
await refused(setTicks('boss', 'kris', [{ area: 'crm', sub: id('sd', 'nope'), granted: true }]), /is not a sub-department of an area/, 'a sub-department that does not exist')
await refused(setTicks('boss', 'kris', [{ area: 'crm', sub: IR }]), /is not a sub-department of an area/, 'on or off must be said')
await refused(setTicks('boss', 'kris', [{ area: 'crm', sub: IR, granted: true }, { area: 'crm', sub: IR, granted: false }]), /is listed twice/, 'twice')
await refused(as('boss', `select public.permission_user_reach_set($1, '{}'::jsonb)`, [U('kris')]), /must be sent as a list/, 'not a list')
await refused(as('boss', `select public.permission_user_reach_set($1, '[]'::jsonb)`, [id('u', 'nobody')]), /That account is gone/, 'an account that is not there')
check((await reach('kris')).crm, [FAIR, IR], 'a refused save changed nothing')

// 7. A person's window: their own, or whoever reads people's permissions.
const win = async (who, target) => (await as(who, `select public.person_sub_department_reach($1) as w`, [U(target)]))[0].w
const kris = await win('sean', 'kris')
check(kris.subs.map(s => s.name), ['Fair', 'IR'], 'the active sub-departments, alphabetical (the closed one left out)')
check(kris.handled, [FAIR], 'what he handles')
check(kris.ticks.map(t => [t.area, t.sub, t.granted]), [['crm', IR, true], ['rules', FAIR, false]], 'and his own ticks')
check((await win('siti', 'siti')).handled, [], 'SITI reads her own')
await refused(win('siti', 'kris'), /Only whoever reads people/, 'but nobody else’s')
await refused(win('faironly', 'faironly'), /Only whoever reads people/, 'and somebody with no People action reads none, not even their own')

// 8. Viewing as a person answers their reach too.
const viewed = (await as('principal-at', `select public.view_as_person($1) as v`, [U('kris')]).catch(e => [{ v: { error: e.message } }]))[0].v
check(viewed.error ?? null, 'A Revenue member is viewed in the Revenue app', 'a Revenue app account is not viewed in the portal (unchanged)')
const viewedSiti = (await as('principal-at', `select public.view_as_person($1) as v`, [U('siti')]))[0].v
check(viewedSiti.reach, every, 'viewing as SITI answers her reach')
check(viewedSiti.tabs, null, 'and the rest as before')
check((await as('principal-at', `select public.my_sub_department_reach() as r`))[0].r, every, 'and gives the viewer’s own back afterwards')

// 9. Only the app's three are callable by a signed-in session.
const may = async fn => (await q(`select has_function_privilege('authenticated', $1, 'execute') as m`, [fn]))[0].m
check([await may('public.my_sub_department_reach()'), await may('public.person_sub_department_reach(uuid)'), await may('public.permission_user_reach_set(uuid, jsonb)')],
  [true, true, true], 'the app calls these three')
check([await may('public.sub_departments_handled(uuid)'), await may('public.sub_department_reach_in(uuid, text)'), await may('public.my_sub_departments(text)')],
  [false, false, false], 'the rest only from the database’s own functions')
check((await q(`select has_function_privilege('anon', 'public.my_sub_department_reach()', 'execute') as m`))[0].m, false, 'nothing for the publishable key')
check((await q(`select actions from permission_table_reads where table_name = 'user_sub_department_reach'`))[0].actions,
  ['accounts.manage', 'accounts.view', 'team.view:own'], 'its rows are read as a person’s boxes are')

console.log(`PASS: ${checks} sub-department reach checks. Every CRM migration verbatim, then 20261016150000, then this one twice; no live database.`)
