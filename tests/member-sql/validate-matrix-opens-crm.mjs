// Local PostgreSQL regression for 20261016150000 (the CRM opens for whoever the permission matrix lets in,
// 2026-10-16 — the owner: permission is the title's template, then the cells changed for one person over it,
// and must not follow the title alone). Every CRM migration runs VERBATIM first (crm_my_role / crm_people are
// checked against production's md5), then this one, twice. Each person's CRM cells are stated here
// (test_crm_cells — the stand-in's "everybody View · Own" default is not what production's templates give
// somebody outside Revenue). No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.users (id uuid primary key, is_active boolean not null default true, role text);
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
`)

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
const S = who => id('s', who), T = t => id('t', t), U = who => id('u', who)
const FAIR = id('sd', 'fair'), IR = id('sd', 'ir')
await q(`insert into comm_sub_departments values ($1, 'Fair', true), ($2, 'IR', true)`, [FAIR, IR])
await q(`insert into comm_schemes values ($1, $2, true), ($3, $4, true)`, [id('sc', 'fair'), FAIR, id('sc', 'ir'), IR])

await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}
// md5 with comment lines taken out: the repo's crm_people() carries one comment production's copy does not.
const md5 = async fn => (await q(`select md5(regexp_replace(prosrc, E'\\n[ \\t]*--[^\\n]*', '', 'g')) as m from pg_proc where proname = $1`, [fn]))[0].m
check(await md5('crm_my_role'), 'a759eb74b1d30e130ca629ee5eded4cf', 'the sandbox’s crm_my_role() is production’s (2026-10-16)')
check(await md5('crm_people'), 'af636d2d26742f9e768d980d9846b36b', 'the sandbox’s crm_people() is production’s, comments aside (2026-10-16)')

// Titles: the CRM's own (mapped) and three it does not know.
for (const [t, name, role] of [['ceo', 'CHIEF EXECUTIVE OFFICER', 'boss'], ['dir', 'Revenue Director', 'hod'], ['tl', 'Team Leader', 'tl'],
  ['rs', 'Revenue Specialist', 'rs'], ['director', 'DIRECTOR', null], ['ea', 'Executive Assistant', null], ['fa', 'Finance Assistant', null]]) {
  await q(`insert into titles values ($1, $2)`, [T(t), name])
  if (role) await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [T(t), role])
}
const staff = [
  ['boss', 'ceo', 'principal'], ['peter', 'dir', null], ['kris', 'dir', null], ['anthony', 'tl', null], ['rachael', 'rs', null],
  ['cmk', 'director', 'principal'], ['kaiyee', 'ea', 'principal'], ['siti', 'fa', 'finance'],
]
for (const [who, t, kind] of staff) {
  await q(`insert into users values ($1, true, $2)`, [U(who), kind])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id) values ($1, $2, $3, $4)`, [S(who), who.toUpperCase(), U(who), T(t)])
}
await q(`insert into users values ($1, true, 'principal')`, [U('principal-at')])  // the shared principal@, no person of its own
const member = (who, t, up) => q(`insert into comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id) values ($1, $2, $3, $4)`,
  [id('sc', 'ir'), S(who), T(t), up ? S(up) : null])
await member('anthony', 'tl', null)
await member('rachael', 'rs', 'anthony')
await q(`insert into comm_sub_department_directors values ($1, $2), ($3, $4)`, [IR, S('peter'), FAIR, S('kris')])

// What each holds of the CRM row (template + their own cells), as production's would.
const ALL = [['view', 'all'], ['edit', 'all'], ['manage', 'all']]
const cells = async (who, list) => {
  await q(`delete from test_crm_cells where uid = $1`, [U(who)])
  for (const [action, scope] of list) await q(`insert into test_crm_cells values ($1, $2, $3)`, [U(who), action, scope])
}
await cells('cmk', ALL)                                   // Ultimate full access
await cells('kris', ALL)                                  // the Revenue Director template
await cells('kaiyee', [['export', 'all']])                // a template with no CRM View
await cells('siti', [['view', 'own'], ['edit', 'own']])   // Finance Assistant, CRM raised for her alone

// ── This migration, verbatim — and again, which changes nothing ───────────
const sql = (await readFile(new URL('20261016150000_matrix_opens_the_crm.sql', dir), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(sql)
const once = [await md5('crm_my_role'), await md5('crm_people')]
await db.exec(sql)
check([await md5('crm_my_role'), await md5('crm_people')], once, 'a second run swaps nothing more')
check((await q(`select prosrc like '%crm_sees_all()%' as k from pg_proc where proname = 'crm_people'`))[0].k, true, 'crm_people keeps its permission check')

const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? U(who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const myRole = async who => (await as(who, `select public.crm_my_role() as r`))[0].r
const can = async who => (await as(who, `select public.crm_my_can() as c`))[0].c
const people = async who => (await as(who, `select public.crm_people() as p`))[0].p
const ids = list => list.map(p => p.id).sort()

// 1. A director whose template opens the CRM is in it — at the top, as himself.
check(await myRole('cmk'), 'boss', 'CHAI MENG KEAT: no CRM title, every CRM cell → the top of the CRM')
check(await can('cmk'), { viewAll: true, editOwn: true, editAll: true, manage: true }, 'what he may do is his cells')
const cmk = await people('cmk')
check([cmk.me, cmk.role], [S('cmk'), 'boss'], 'he signs in as himself')
check(cmk.people.find(p => p.id === S('cmk'))?.role, 'boss', 'and is in his own list')
check(ids(cmk.people), [S('anthony'), S('boss'), S('cmk'), S('peter'), S('rachael')].sort(), 'he sees the CRM as the CEO does, and himself')

// 2. The cells, not the title: no CRM View → not in it, whatever the title.
check(await myRole('kaiyee'), null, 'an Executive Assistant whose cells hold no CRM View is not in the CRM')
check((await people('kaiyee')).people, [], 'and sees nobody')

// 3. Raised for one person (the second layer): View · Own opens her own CRM, nothing more.
check(await myRole('siti'), 'boss', 'a Finance Assistant given CRM View for herself is in')
check(await can('siti'), { viewAll: false, editOwn: true, editAll: false, manage: false }, 'with her own cells only')
check(ids((await people('siti')).people), [S('siti')], 'she sees herself — no line, nobody else')

// 4. Lowered for one person: an RS whose own cells take CRM View away is out.
check(await myRole('rachael'), 'rs', 'RACHAEL is an RS by IR')
await cells('rachael', [['edit', 'own']])
check(await myRole('rachael'), null, 'her own cells without View close the CRM to her')
await q(`delete from test_crm_cells where uid = $1`, [U('rachael')])

// 5. Fair's director: his template opens it too (the owner unticks his CRM cells to keep him out).
check(await myRole('kris'), 'boss', 'KRIS (Fair\'s director, not IR\'s) holds every CRM cell → in, at the top')
await cells('kris', [['export', 'all']])
check(await myRole('kris'), null, 'with his CRM cells unticked for him alone, he is out')

// 6. The structure still places everybody it knows; the Principal's login is still the CEO.
check([await myRole('boss'), await myRole('peter'), await myRole('anthony'), await myRole('rachael')], ['boss', 'hod', 'tl', 'rs'], 'IR\'s and the CEO\'s roles are as before')
check((await as('principal-at', `select public.crm_me() as m`))[0].m, S('boss'), 'the shared principal@ is the CEO')
check(await myRole('principal-at'), 'boss', 'and the Boss')

// 7. Others see the structure: an outsider is nobody's to send a customer to, and in no salesperson's list.
check((await q(`select public.crm_role_of($1) as r`, [S('cmk')]))[0].r, null, 'crm_role_of (other people) still knows only the structure')
check(ids((await people('anthony')).people), [S('anthony'), S('rachael')], 'ANTHONY\'s list is his line, as before')

// 8. The customers: the matrix's reach, through the same row policy.
const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, assigned_to) values ('whatsapp', 'PN1', 'mx-1', 'Customer', $1) returning id`, [S('rachael')]))[0].id
const sees = async who => (await as(who, `select count(*)::int as n from crm_contacts where id = $1`, [c]))[0].n
check([await sees('cmk'), await sees('siti'), await sees('kaiyee'), await sees('anthony')], [1, 0, 0, 1],
  'View · All sees RACHAEL\'s customer; View · Own (not hers) and no View do not; her TL does')

console.log(`PASS: ${checks} matrix-opens-the-CRM checks. Every CRM migration verbatim, then this one twice; no live database.`)
