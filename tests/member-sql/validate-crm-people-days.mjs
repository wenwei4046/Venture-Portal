// Local PostgreSQL regression for 20261109100000 (Assignment › People, Calendar's leave, Team activity — docs/design_handoff_crm).
// Every CRM migration runs VERBATIM, then Up next's, then this one. Under test: crm_people says login and paused; a
// person's Full time days are kept where the dealer reads them (their team's row), the team's days follow, days ⇔ full
// time; who may set them; Lock and the days are logged in crm_events. No live I/O.
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
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const all = (await readdir(dir)).sort()
const crm = all.filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f))
for (const file of crm) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
// The dealer's later migrations, in production's order.
for (const file of ['20261022130000_crm_member_lock.sql', '20261022160000_crm_split_skips_locked.sql', '20261022170000_crm_team_top.sql', '20261024230000_crm_fulltime_days_only.sql',
  '20261025121500_crm_ads_counted_together.sql', '20261025060000_crm_fulltime_even.sql', '20261025124500_crm_ads_together_reverted.sql', '20261025134700_crm_ads_apply_window.sql', '20261025070000_crm_fulltime_even_off.sql', '20261029220000_crm_staff_leave.sql']) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
const PEOPLE = [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'], ['amy', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['bob', 'rs', 'tlb']]
for (const [who, role, upline] of PEOPLE) {
  await q(`insert into users (id, is_active, role) values ($1, true, $2)`, [id('u', who), role])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const as = who => db.exec(`set test.uid = '${id('u', who)}'`)
const noOne = () => db.exec(`set test.uid = ''`)
const ad = 'ad-1'
const split = { [S('tla')]: 50, [S('tlb')]: 50 }
await q(`insert into crm_ad_assign (ad_source_id, ad_label, mode, team_split, people_mode, people) values ($1, 'Ad 1', 'split', $2::jsonb, 'cnt', '{}'::jsonb)`, [ad, JSON.stringify(split)])

// The migration under test, verbatim.
await db.exec((await readFile(new URL('20261108120000_crm_up_next.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await db.exec((await readFile(new URL('20261108140000_crm_up_next_faster.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))

// The migration under test, verbatim.
await db.exec((await readFile(new URL('20261109100000_crm_people_days.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))

const row = async tl => (await q(`select days, vals from crm_fulltime_rules where tl_id = $1`, [S(tl)]))[0]
const events = async action => (await q(`select data from crm_events where kind = 'up_next' and data->>'action' = $1 order by at`, [action])).map(r => r.data)

// crm_people: login and paused.
{
  await q(`update hr_staff_costs set user_id = null where id = $1`, [S('bob')])
  await as('hod'); await q(`select crm_up_next_pause($1, true)`, [S('amy')])
  const people = (await q(`select crm_people() r`))[0].r.people
  const of = who => people.find(p => p.id === S(who))
  check([of('ann').login, of('bob').login], [true, false], 'login: a People record with a user id or not')
  check([of('ann').paused, of('amy').paused], [false, true], 'paused: Up next\'s flag')
  await q(`select crm_up_next_pause($1, false)`, [S('amy')])
}
// A person's days: kept in their team's row; the team's days are every member's.
{
  await as('hod')
  await q(`select crm_set_person_days($1, array[0,1,2])`, [S('ann')])
  let r = await row('tla')
  check([r.days, r.vals[S('ann')]], [[0, 1, 2], { 0: 1, 1: 1, 2: 1 }], 'ann Mon–Wed in Team A\'s row')
  await q(`select crm_set_person_days($1, array[4, 4, 9])`, [S('amy')])
  r = await row('tla')
  check([r.days, r.vals[S('amy')]], [[0, 1, 2, 4], { 4: 1 }], 'amy Friday (twice and a 9 ignored); the team\'s days are both')
  check((await q(`select full_time from crm_staff where staff_id = $1`, [S('ann')]))[0].full_time, true, 'days make them full time')
  await q(`select crm_set_person_days($1, '{}')`, [S('ann')])
  r = await row('tla')
  check([r.days, S('ann') in r.vals], [[4], false], 'none: off the row, the team\'s days follow')
  check((await q(`select full_time from crm_staff where staff_id = $1`, [S('ann')]))[0].full_time, false, 'and part time')
  const ev = await events('days')
  check(ev.map(e => [e.staff, e.before.days, e.after.days]), [[S('ann'), [], [0, 1, 2]], [S('amy'), [], [4]], [S('ann'), [0, 1, 2], []]], 'each change in crm_events with before → after')
  await q(`select crm_set_person_days($1, array[4])`, [S('amy')])
  check((await events('days')).length, 3, 'an unchanged save logs nothing')
}
// The dealer reads the same row: on a Friday only Team A's ticked person is in its turn.
{
  const fri = `2026-11-06 10:00+08`
  const pick = (await q(`select crm_fulltime_pick($1, $2::timestamptz) r`, [S('tla'), fri]))[0].r
  check(pick, S('amy'), 'the dealer picks the person ticked for Friday')
}
// Who may: CRM · Manage on anybody; a salesperson on nobody.
{
  await as('ann')
  let refused = false
  try { await q(`select crm_set_person_days($1, array[1])`, [S('bob')]) } catch { refused = true }
  check(refused, true, 'a salesperson cannot set another\'s days')
}
// Lock is logged too.
{
  await as('hod'); await q(`select crm_set_locked($1, true)`, [S('bob')])
  await q(`select crm_set_locked($1, true)`, [S('bob')])
  await q(`select crm_set_locked($1, false)`, [S('bob')])
  check((await events('lock')).length + (await events('unlock')).length, 2, 'lock and unlock logged, an unchanged one not')
}

console.log(`crm people days: ${checks} checks passed`)
