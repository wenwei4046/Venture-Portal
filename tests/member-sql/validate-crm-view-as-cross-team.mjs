// Local PostgreSQL regression for 20261112010000 (View as reaches the CRM's cross-team viewers — the owner: "我在手机版的
// crm 没有看到josiah & weijie" / "不能view as"). Every CRM migration runs VERBATIM, then the dealer's and People's days,
// then this one. Under test: crm_people() hands whoever sees everybody's CRM a `viewers` list — active People with a
// login and no CRM role whose template, or their own cell over it, gives CRM · View — and nobody else; `people` is
// unchanged. No live I/O.
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
  create table public.titles (id uuid primary key, name text, template_id uuid);
  create table public.hr_staff_costs (
    id uuid primary key, employee_name text, user_id uuid references public.users(id),
    title_id uuid references public.titles(id), reports_to uuid references public.hr_staff_costs(id), status text not null default 'active');
  -- The permission matrix's two stores, as production keeps them.
  create table public.permission_template_grants (template_id uuid, function_key text, action text, scope text);
  create table public.user_permission_cells (user_id uuid, function_key text, action text, scope text);
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
await db.exec(CRM_PERMISSION_STANDIN)
// The sub-department reach (mig 20261016180000, not a CRM migration): with crm_scope() empty here it is never asked.
await db.exec(`create function public.sub_department_reach_in(p_user uuid, p_area text) returns uuid[] language sql stable as $fn$ select '{}'::uuid[] $fn$`)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const all = (await readdir(dir)).sort()
const crm = all.filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f))
const run = async file => db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
for (const file of crm) await run(file)
for (const file of ['20261022130000_crm_member_lock.sql', '20261022160000_crm_split_skips_locked.sql', '20261022170000_crm_team_top.sql', '20261024230000_crm_fulltime_days_only.sql',
  '20261025121500_crm_ads_counted_together.sql', '20261025060000_crm_fulltime_even.sql', '20261025124500_crm_ads_together_reverted.sql', '20261025134700_crm_ads_apply_window.sql', '20261025070000_crm_fulltime_even_off.sql', '20261029220000_crm_staff_leave.sql',
  '20261108120000_crm_up_next.sql', '20261108140000_crm_up_next_faster.sql', '20261109100000_crm_people_days.sql']) await run(file)

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2, null)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Marketing's titles: no CRM role. MM's template gives nothing of the CRM; AMM's template gives CRM · View at All.
await q(`insert into titles values ($1, 'MARKETING MANAGER', $2), ($3, 'ASSISTANT MARKETING MANAGER', $4), ($5, 'MARKETING EXECUTIVE', $2)`,
  [id('t', 'mm'), id('tpl', 'mkt'), id('t', 'amm'), id('tpl', 'amm'), id('t', 'me')])
await q(`insert into permission_template_grants values ($1, 'crm', 'view', 'all'), ($1, 'marketing', 'view', 'all'), ($2, 'marketing', 'view', 'all')`,
  [id('tpl', 'amm'), id('tpl', 'mkt')])

const PEOPLE = [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'],
  ['josiah', 'mm', null], ['weijie', 'amm', null], ['mei', 'me', null], ['siti', 'me', null], ['gone', 'me', null], ['nologin', 'me', null]]
for (const [who, title, upline] of PEOPLE) {
  const login = who !== 'nologin'
  if (login) await q(`insert into users (id, is_active, role) values ($1, true, 'staff')`, [id('u', who)])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to, status) values ($1, $2, $3, $4, $5, $6)`,
    [id('s', who), who.toUpperCase(), login ? id('u', who) : null, id('t', title), upline ? id('s', upline) : null, who === 'gone' ? 'resigned' : 'active'])
}
await q(`update users set role = 'principal' where id = $1`, [id('u', 'boss')])
// Their own cells over the template: Josiah raised to CRM · View All (as the owner did, 2026-11-10); Siti raised then
// taken off (NULL); the one who left and the one with no login raised too.
await q(`insert into user_permission_cells values ($1, 'crm', 'view', 'all'), ($2, 'crm', 'view', null), ($3, 'crm', 'view', 'all'), ($4, 'crm', 'view', 'all')`,
  [id('u', 'josiah'), id('u', 'siti'), id('u', 'gone'), id('u', 'nologin')])
// Wei Jie's template gives View; his own cell lowers it to Own.
await q(`insert into user_permission_cells values ($1, 'crm', 'view', 'own')`, [id('u', 'weijie')])

const S = who => id('s', who)
const as = who => db.exec(`set test.uid = '${id('u', who)}'`)

// The migration under test, verbatim.
await run('20261112010000_crm_view_as_cross_team.sql')

{
  await as('boss')
  const r = (await q(`select crm_people() r`))[0].r
  check(r.viewers.map(v => v.id), [S('josiah'), S('weijie')], 'the Boss sees the two cross-team viewers, by name')
  const j = r.viewers[0], w = r.viewers[1]
  check([j.name, j.title, j.reach, j.editOwn, j.editAll, j.manage], ['JOSIAH', 'MARKETING MANAGER', 'all', false, false, false], 'Josiah: View at All, nothing else')
  check(w.reach, 'own', "Wei Jie: his own cell over the template's All")
  check(r.people.some(p => p.id === S('josiah') || p.id === S('weijie')), false, 'they stay out of people')
  check(r.people.map(p => p.id).sort(), [S('ann'), S('boss'), S('hod'), S('tla')].sort(), 'people is unchanged')
}
{
  await as('hod')
  check((await q(`select crm_people() r`))[0].r.viewers.length, 2, 'the Director (CRM · Manage) sees them too')
  await as('josiah')
  const j = (await q(`select crm_people() r`))[0].r
  check(j.viewers ?? [], [], 'a viewer (no Manage) is handed nobody')
}
{
  await as('tla')
  check((await q(`select crm_people() r`))[0].r.viewers, [], 'a team leader sees nobody')
  await as('ann')
  check((await q(`select crm_people() r`))[0].r.viewers, [], 'a salesperson sees nobody')
}
{
  // Siti (taken off), Mei (template without CRM), the one who left and the one with no login are never listed.
  await as('boss')
  const ids = (await q(`select crm_people() r`))[0].r.viewers.map(v => v.id)
  check([S('siti'), S('mei'), S('gone'), S('nologin')].filter(x => ids.includes(x)), [], 'only those who hold CRM · View today')
}
{
  // Whoever is given a CRM title leaves the list for people.
  await q(`update hr_staff_costs set title_id = $1 where id = $2`, [id('t', 'rs'), S('josiah')])
  await as('boss')
  const r = (await q(`select crm_people() r`))[0].r
  check([r.viewers.some(v => v.id === S('josiah')), r.people.some(p => p.id === S('josiah'))], [false, true], 'a CRM role: in people, not viewers')
  await q(`update hr_staff_costs set title_id = $1 where id = $2`, [id('t', 'mm'), S('josiah')])
}
{
  // Nobody calls the helper straight.
  const grants = await q(`select has_function_privilege('authenticated', 'public.crm_cross_viewers()', 'execute') a,
                                 has_function_privilege('anon', 'public.crm_cross_viewers()', 'execute') b,
                                 has_function_privilege('service_role', 'public.crm_cross_viewers()', 'execute') c`)
  check([grants[0].a, grants[0].b, grants[0].c], [false, false, true], 'crm_cross_viewers: the service role only')
}

console.log(`validate-crm-view-as-cross-team: ${checks} checks passed`)
