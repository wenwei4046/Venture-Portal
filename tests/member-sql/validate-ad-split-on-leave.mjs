// Local PostgreSQL regression for 20261106110000 (2026-11-06, the owner on Split leads: "为什么加起来100% 不能save?"): a By % team
// is 100 counting whoever is not locked — a member on leave keeps their % and is still counted, as Assignment draws them — and
// only the dealing skips them. The dealer's migrations run verbatim, in the order production ran them. No live I/O.
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
const run = async file => db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) await run(file)
for (const file of ['20261022130000_crm_member_lock.sql', '20261022160000_crm_split_skips_locked.sql', '20261022170000_crm_team_top.sql',
  '20261024230000_crm_fulltime_days_only.sql']) await run(file)

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD (the Revenue Director) → TL A (→ Ann, Amir) and TL B (→ Ben).
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'],
  ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const SAVE = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)', MANY = 'public.crm_save_ads(jsonb, boolean, text, jsonb, text, jsonb, jsonb)'
for (const file of ['20261025121500_crm_ads_counted_together.sql', '20261025060000_crm_fulltime_even.sql', '20261025124500_crm_ads_together_reverted.sql', '20261025134700_crm_ads_apply_window.sql', '20261029220000_crm_staff_leave.sql']) await run(file)
const md5 = async sig => (await q(`select md5(prosrc) as m from pg_proc where oid = $1::regprocedure`, [sig]))[0].m
check([await md5(SAVE), await md5(MANY)], ['492ba60af30b27d8484d3677a76bb511', '23ffd612d5326e18102d541a9610dd18'], 'the two saves as production has them')

const as = async (w, sql, params = []) => {
  await db.exec(`set test.uid = '${w ? id('u', w) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const split = JSON.stringify({ [S('tla')]: 100 }), pct = JSON.stringify({ [S('tla')]: 'pct' })
const people = shares => JSON.stringify(Object.fromEntries(Object.entries(shares).map(([w, v]) => [S(w), v])))
const saveOne = (shares, mode = pct) => as('boss', 'select public.crm_save_ad_assign($1, $1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r', ['AD', 'split', split, 'pct', people(shares), mode])
const saveMany = shares => as('boss', 'select public.crm_save_ads($1::jsonb, false, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r', [JSON.stringify({ AD2: 'Ad 2' }), 'split', split, 'pct', people(shares), pct])
const refused = async p => { try { await p; return null } catch (e) { return e.message } }
const TOO_FEW = 'Every By % team must add up to 100%.'
const SHARES = { tla: 50, ann: 30, amir: 20 }

// Before the fix: the same split, Ann on leave today, is refused though it adds up on screen.
await q(`insert into crm_staff_leave (staff_id, starts_on, ends_on) values ($1, (now() at time zone 'Asia/Kuala_Lumpur')::date, (now() at time zone 'Asia/Kuala_Lumpur')::date + 3)`, [S('ann')])
check(await refused(saveOne(SHARES)), TOO_FEW, 'the fault: 100 on screen, 70 to the database')
check(await refused(saveMany(SHARES)), TOO_FEW, '…through Save and apply to all too')

await run('20261106110000_ad_split_counts_members_on_leave.sql')

check(await refused(saveOne(SHARES)), null, 'a member on leave is still counted: it saves')
check(await refused(saveMany(SHARES)), null, '…through Save and apply to all too')
check(await refused(saveOne({ tla: 50, ann: 30, amir: 10 })), TOO_FEW, 'a split that does not add up is still refused')
// A locked member is left out, as Assignment leaves them out: their kept % is not counted.
await q(`insert into crm_staff (staff_id, locked) values ($1, true) on conflict (staff_id) do update set locked = true`, [S('amir')])
check(await refused(saveOne({ tla: 70, ann: 30, amir: 20 })), null, 'a locked member kept at 20%: the others add up to 100')
check(await refused(saveOne({ tla: 50, ann: 30, amir: 20 })), TOO_FEW, '…and their % does not make up the others')
await q(`update crm_staff set locked = false where staff_id = $1`, [S('amir')])
// The dealing is untouched: whoever is on leave gets no lead.
check((await q(`select count(*)::int as n from public.crm_deal_handlers($1) h where h = $2`, [S('tla'), S('ann')]))[0].n, 0, 'the dealer still skips a member on leave')
// Only CRM · Manage saves, as before.
check(await refused(as('ann', 'select public.crm_save_ad_assign($1, $1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r', ['AD', 'split', split, 'pct', people(SHARES), pct])) !== null, true, 'a salesperson is refused')

console.log(`ad split on leave: ${checks} checks passed`)
