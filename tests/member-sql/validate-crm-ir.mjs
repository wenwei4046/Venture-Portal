// Local PostgreSQL regression for "the CRM is IR only" (2026-10-09, mig 20261009110000).
// Every CRM migration runs VERBATIM, with a Revenue Department of two sub-departments
// (Fair, IR) the way Revenue › Hierarchy keeps them. Under test: who is in the CRM, the
// title and line they have THERE, IR's director as the HOD, teams, what each person sees,
// dealing, Move to one's IR superior — and the old People-based answers when no
// sub-department is set. No live I/O.
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
  -- Revenue › Hierarchy: sub-departments, their schemes, memberships and directors.
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
const S = who => id('s', who), T = t => id('t', t)
const FAIR = id('sd', 'fair'), IR = id('sd', 'ir')
// The sub-departments exist BEFORE the migration: it names IR in crm_settings.
await q(`insert into comm_sub_departments values ($1, 'Fair', true), ($2, 'IR', true)`, [FAIR, IR])
await q(`insert into comm_schemes values ($1, $2, true), ($3, $4, true), ($5, $4, false)`, [id('sc', 'fair'), FAIR, id('sc', 'ir'), IR, id('sc', 'ir-old')])

// The CRM asks the permission matrix (20261010030000): each person holds their role's seeded cells.
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}

// Titles and the CRM roles they map to (as production: a Senior RS is an RS).
for (const [t, name, role] of [['ceo', 'CHIEF EXECUTIVE OFFICER', 'boss'], ['dir', 'Revenue Director', 'hod'], ['tl', 'Team Leader', 'tl'],
  ['ta', 'Team Assistant', 'ta'], ['rs', 'Revenue Specialist', 'rs'], ['srs', 'Senior Revenue Specialist', 'rs']]) {
  await q(`insert into titles values ($1, $2)`, [T(t), name])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [T(t), role])
}
// People (company title, reports_to as People keeps it — deliberately NOT IR's line).
const staff = [
  ['boss', 'ceo', null], ['peter', 'dir', 'boss'], ['kris', 'dir', 'boss'],
  ['anthony', 'tl', null], ['chea', 'tl', null], ['rachael', 'srs', null], ['zack', 'rs', 'chea'],
  ['faironly', 'rs', 'anthony'], ['ended', 'rs', 'anthony'], ['oldscheme', 'rs', 'anthony'],
]
for (const [who, t, up] of staff) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [S(who), who.toUpperCase(), id('u', who), T(t), up ? S(up) : null])
}
// IR: ANTHONY's team — CHEA HUAN is a Team Assistant THERE (a Team Leader in People), RACHAEL an RS under him, ZACK under RACHAEL.
const member = (scheme, who, t, up, from = '2026-01-01', to = null) =>
  q(`insert into comm_hierarchy (scheme_id, staff_id, title_id, upline_staff_id, effective_from, effective_to) values ($1, $2, $3, $4, $5, $6)`,
    [id('sc', scheme), S(who), T(t), up ? S(up) : null, from, to])
await member('ir', 'anthony', 'tl', null)
await member('ir', 'chea', 'ta', 'anthony')
await member('ir', 'rachael', 'rs', 'chea')
await member('ir', 'zack', 'rs', 'rachael')
await member('ir', 'ended', 'rs', 'anthony', '2026-01-01', '2026-02-01')        // left IR
await member('ir-old', 'oldscheme', 'rs', 'anthony')                            // only on a scheme no longer active
// Fair: CHEA HUAN leads there; FAIRONLY is Fair's only.
await member('fair', 'chea', 'tl', null)
await member('fair', 'faironly', 'rs', 'chea')
await q(`insert into comm_sub_department_directors values ($1, $2), ($1, $3), ($4, $2)`, [FAIR, S('peter'), S('kris'), IR])

const role = async who => (await q(`select public.crm_role_of($1) as r`, [S(who)]))[0].r
const upOf = async who => (await q(`select public.crm_upline_of($1) as u`, [S(who)]))[0].u
const teamOf = async who => (await q(`select public.crm_team_of($1) as t`, [S(who)]))[0].t
const down = async who => (await q(`select public.crm_downline($1) as d`, [S(who)])).map(r => r.d).sort()
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const ids = (...who) => who.map(S).sort()

// 1. The migration named IR.
check((await q(`select public.crm_scope() as s`))[0].s, IR, 'the CRM is IR')

// 2. Roles come from IR: IR's title wins over People's, IR's director is the HOD, nobody outside IR is in.
check(await role('boss'), 'boss', 'the Principal is still the Boss')
check(await role('peter'), 'hod', 'IR\'s director is the HOD')
check(await role('kris'), null, 'Fair\'s director only is not in the CRM')
check(await role('anthony'), 'tl', 'ANTHONY leads in IR')
check(await role('chea'), 'ta', 'CHEA HUAN is a Team Assistant in IR, whatever People says')
check(await role('rachael'), 'rs', 'a Senior RS is an RS')
check(await role('faironly'), null, 'Fair only = not in the CRM')
check(await role('ended'), null, 'a membership that ended = not in the CRM')
check(await role('oldscheme'), null, 'a membership on an inactive scheme = not in the CRM')

// 3. The line is IR's; the top of a team reports to IR's director.
check(await upOf('anthony'), S('peter'), 'a team\'s leader reports to IR\'s director')
check(await upOf('chea'), S('anthony'), 'CHEA HUAN reports to ANTHONY in IR')
check(await upOf('zack'), S('rachael'), 'ZACK reports to RACHAEL in IR (People says CHEA HUAN)')
check(await upOf('peter'), null, 'the director reports to nobody in the CRM')
check(await teamOf('zack'), S('anthony'), 'ZACK is in ANTHONY\'s team')
check(await teamOf('chea'), S('anthony'), 'CHEA HUAN is in ANTHONY\'s team, not a team of his own')
check(await down('anthony'), ids('anthony', 'chea', 'rachael', 'zack'), 'ANTHONY\'s line: everyone below him in IR')
check(await down('chea'), ids('chea', 'rachael', 'zack'), 'CHEA HUAN\'s line (Fair\'s FAIRONLY is not in it)')
check((await q(`select count(*)::int as n from public.crm_all_handlers()`))[0].n, 4, 'one team of four takes enquiries')

// 4. What each sees: the Principal everyone in the CRM, a leader their IR line, with IR's titles.
const people = async who => (await as(who, `select public.crm_people() as p`))[0].p
const boss = await people('boss')
check(boss.people.map(p => p.id).sort(), ids('boss', 'peter', 'anthony', 'chea', 'rachael', 'zack'), 'the Principal sees IR, its director and themselves')
check(boss.people.find(p => p.id === S('chea')).title, 'Team Assistant', 'CHEA HUAN\'s title is his IR title')
check(boss.people.find(p => p.id === S('rachael')).title, 'Revenue Specialist', 'RACHAEL\'s IR title')
check(boss.people.find(p => p.id === S('anthony')).uplineId, S('peter'), 'the screen\'s line agrees: ANTHONY under PETER')
check((await people('peter')).role, 'hod', 'PETER signs in as the HOD')
check((await people('chea')).people.map(p => p.id).sort(), ids('chea', 'rachael', 'zack'), 'CHEA HUAN sees his IR line only')
check((await people('kris')).people, [], 'KRIS sees nobody')
check((await people('faironly')).people, [], 'a Fair-only salesperson sees nobody')

// 5. Dealing: an ad set Evenly goes to IR's people only.
await as('boss', `select public.crm_save_ad_assign('AD-E', 'Even', 'even', '{}', 'cnt', '{}')`)
const dealt = []
for (let k = 0; k < 4; k++) {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id) values ('whatsapp', 'PN1', $1, $1, 'AD-E') returning id`, [`e${k}`]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  dealt.push((await q(`select assigned_to from crm_contacts where id = $1`, [c]))[0].assigned_to)
}
check(dealt.slice().sort(), ids('anthony', 'chea', 'rachael', 'zack'), 'four enquiries, one to each of ANTHONY\'s team')

// 6. Move goes to one's IR superior.
const zacks = (await q(`select id from crm_contacts where assigned_to = $1`, [S('zack')]))[0].id
await refused('zack', `select public.crm_invite('move', $1, $2)`, [zacks, S('chea')], /direct superior only/, 'ZACK may not move to CHEA HUAN (People\'s line)')
await as('zack', `select public.crm_invite('move', $1, $2)`, [zacks, S('rachael')])
check((await q(`select to_staff from crm_invites where contact_id = $1 and kind = 'move'`, [zacks]))[0].to_staff, S('rachael'), 'ZACK moves to RACHAEL, his IR superior')

// 7. No sub-department set: the old People-based answers.
await q(`update crm_settings set sub_department_id = null`)
check(await role('chea'), 'tl', 'unset: CHEA HUAN is People\'s Team Leader again')
check(await role('kris'), 'hod', 'unset: every Revenue Director is a HOD')
check(await upOf('zack'), S('chea'), 'unset: the line is People\'s reports_to')

console.log(`crm IR only: ${checks} checks passed`)
