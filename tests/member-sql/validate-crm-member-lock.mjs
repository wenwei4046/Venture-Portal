// Local PostgreSQL regression for 20261022130000 (2026-10-22, a member locked out of the dealing). Every CRM migration
// runs VERBATIM, then the lock. Under test: the dealer skips a locked member; only CRM · Manage locks. No live I/O.
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
// The CRM asks the permission matrix (20261010030000): each person holds their role's seeded cells.
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
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
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
// ── A member locked out of the dealing (mig 20261022130000) ──
await db.exec((await readFile(new URL('20261022130000_crm_member_lock.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await q(`insert into users values ($1, true, null)`, [id('u', 'bob')])
await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, 'bob', $2, $3, $4)`, [id('s', 'bob'), id('u', 'bob'), id('t', 'rs'), id('s', 'tla')])
const handlers = async () => (await q(`select array(select h::text from crm_deal_handlers($1) h order by 1) as h`, [id('s', 'tla')]))[0].h
check((await handlers()).length, 3, 'the team deals to its TL and both RSs')
await as('boss', `select public.crm_set_locked($1, true)`, [id('s', 'ann')])
check((await handlers()).includes(id('s', 'ann')), false, 'a locked member is not dealt to')
check((await q(`select locked, full_time from crm_staff where staff_id = $1`, [id('s', 'ann')]))[0], { locked: true, full_time: false }, '…kept on crm_staff, full time untouched')
const picks = []
for (let k = 0; k < 6; k++) picks.push((await q(`select member::text from crm_pick_inside($1, '999999', now() - interval '30 days', 'pct', $2::jsonb, now())`, [id('s', 'tla'), JSON.stringify({ [id('s', 'ann')]: 90, [id('s', 'bob')]: 10 })]))[0].member)
check(picks.every(p => p === id('s', 'bob')), true, 'By %: the locked 90% goes to the rest of the team')
await assert.rejects(as('ann', `select public.crm_set_locked($1, false)`, [id('s', 'ann')]), /./, 'a salesperson cannot unlock themselves'); checks++
await assert.rejects(as('boss', `select public.crm_set_locked($1, true)`, [id('s', 'boss')]), /team member or a Revenue Director/, 'the Principal is not lockable'); checks++
await as('boss', `select public.crm_set_locked($1, false)`, [id('s', 'ann')])
check((await handlers()).includes(id('s', 'ann')), true, 'unlocked, dealt to again')
for (const fn of ['crm_staff_locked', 'crm_deal_handlers']) {
  const f = (await q(`select proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(/(^|[{,])(anon|authenticated)=/.test(f.acl) || /(^|[{,])=X/.test(f.acl), false, `${fn}: nobody's but the service role's`)
}
for (const fn of ['crm_pick_inside', 'crm_fulltime_pick', 'crm_assign_contact']) {
  const src = (await q(`select prosrc from pg_proc where proname = $1`, [fn]))[0].prosrc
  check(/crm_deal_handlers/.test(src), true, `${fn} picks from crm_deal_handlers`)
}

// ── A By % team keeps a locked member's % and still saves (mig 20261022160000: the check sums crm_deal_handlers) ──
await db.exec((await readFile(new URL('20261022160000_crm_split_skips_locked.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await as('boss', 'select public.crm_set_locked($1, true)', [id('s', 'ann')])
const people = { [id('s', 'tla')]: 50, [id('s', 'bob')]: 50, [id('s', 'ann')]: 40 }
const saved = await as('boss', 'select public.crm_save_ad_assign($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb) as r', ['424242', 'Ad', 'split', JSON.stringify({ [id('s', 'tla')]: 100 }), 'pct', JSON.stringify(people), JSON.stringify({ [id('s', 'tla')]: 'pct' })])
check(!!saved[0].r, true, 'a By % team adding up to 100 without its locked member saves, the locked % kept')
await assert.rejects(as('boss', 'select public.crm_save_ad_assign($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb)', ['434343', 'Ad', 'split', JSON.stringify({ [id('s', 'tla')]: 100 }), 'pct', JSON.stringify({ [id('s', 'tla')]: 50, [id('s', 'bob')]: 40 }), JSON.stringify({ [id('s', 'tla')]: 'pct' })]), /100/, 'the others must still add up to 100'); checks++
check(!!(await as('boss', 'select public.crm_save_ad_assign($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb) as r', ['454545', 'Ad', 'split', JSON.stringify({ [id('s', 'tla')]: 100 }), 'pct', JSON.stringify({ [id('s', 'tla')]: 33.33, [id('s', 'bob')]: 66.67 }), JSON.stringify({ [id('s', 'tla')]: 'pct' })]))[0].r, true, 'shares to the hundredth add up exactly')

// ── Everybody reporting straight to the Revenue Director is a team (mig 20261022170000, crm_is_team_top) ──
await db.exec((await readFile(new URL('20261022170000_crm_team_top.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await q('insert into users values ($1, true, null)', [id('u', 'solo')])
await q("insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, 'solo', $2, $3, $4)", [id('s', 'solo'), id('u', 'solo'), id('t', 'rs'), id('s', 'hod')])
check((await q('select crm_is_team_top($1) as a, crm_is_team_top($2) as b, crm_is_team_top($3) as c', [id('s', 'solo'), id('s', 'tla'), id('s', 'bob')]))[0], { a: true, b: true, c: false }, 'an RS reporting to the Revenue Director heads a team; a TL does; an RS under a TL does not')
check((await q('select crm_team_of($1)::text as t', [id('s', 'solo')]))[0].t, id('s', 'solo'), 'their team is their own')
check((await q('select array(select h::text from crm_all_handlers() h) as h'))[0].h.includes(id('s', 'solo')), true, 'they take enquiries')
check((await q('select crm_team_of($1)::text as t', [id('s', 'bob')]))[0].t, id('s', 'tla'), "a TL's team is unchanged")

console.log(`crm member lock: ${checks} checks passed`)
