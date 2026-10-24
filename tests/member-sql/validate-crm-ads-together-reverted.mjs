// Local PostgreSQL regression for 20261025124500 / 125000 (2026-10-24: ads counted together, taken back the same evening —
// the owner: "wait, revert this function first, back to previous"). The dealer's migrations run VERBATIM in the order
// production ran them — 20261025121500 (counted together), then Kaiyee's 20261025060000 (Full time evenly, written over it),
// then the revert and the drop. Under test: the three functions are production's bodies of before, with Full time evenly
// kept; each ad counts only its own leads again; the column and the two functions are gone. No live I/O.
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
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'],
  ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const who = staff => Object.fromEntries(['hod', 'tla', 'ann', 'amir', 'tlb', 'ben'].map(w => [S(w), w]))[staff] ?? staff
const md5 = async sig => (await q(`select md5(prosrc) as m from pg_proc where oid = $1::regprocedure`, [sig]))[0].m
const src = async sig => (await q(`select prosrc as s from pg_proc where oid = $1::regprocedure`, [sig]))[0].s
const ASSIGN = 'public.crm_assign_contact(uuid)', SAVE = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'
const GIVEN = 'public.crm_campaign_given(text, timestamptz)'

check([await md5(ASSIGN), await md5(SAVE), await md5(GIVEN)],
  ['b7f7ac547b456e774fac2e48e510c196', '107965abc3eb0cb0cf2ca4d3196f9c29', 'f485e7e495108e723c593a906f880252'], "production's bodies before the switch")

// As production ran them: counted together, then Full time evenly written over it, then the revert.
await run('20261025121500_crm_ads_counted_together.sql')
await run('20261025060000_crm_fulltime_even.sql')
check(await md5(ASSIGN), '0324fccd74b7bae8275e90a500202dc8', 'the dealer with both, as production had it at the revert')
await run('20261025124500_crm_ads_together_reverted.sql')

// 1. The three functions: production's bodies of before; the dealer keeps Full time evenly and nothing of counting together.
check([await md5(SAVE), await md5(GIVEN)], ['107965abc3eb0cb0cf2ca4d3196f9c29', 'f485e7e495108e723c593a906f880252'], 'Save and the count are as before')
check(await md5(ASSIGN), '802442b943a5d3fe293c6692b3886b89', 'the dealer is as production runs it after the revert')
const body = await src(ASSIGN)
check([body.includes('crm_counted_leads'), body.includes('crm_fulltime_even(v_at)')], [false, true], 'no counting together, Full time evenly kept')

// 2. Each ad counts only its own again: a fresh ad's first lead goes the same way every time.
let n = 0
const arrive = async ad => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, now(), now()) returning id`, [`c${++n}`, ad]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  const r = (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0]
  return [who(r.team_id), who(r.assigned_to)]
}
const as = async (w, sql, params = []) => {
  await db.exec(`set test.uid = '${w ? id('u', w) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const split = JSON.stringify({ [S('tla')]: 50, [S('tlb')]: 50 }), evenly = JSON.stringify({ [S('tla')]: 'even', [S('tlb')]: 'even' })
for (const ad of ['AP-1', 'AP-2']) await as('boss', 'select public.crm_save_ad_assign($1, $1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb)', [ad, 'split', split, 'pct', '{}', evenly])
check([await arrive('AP-1'), await arrive('AP-2')], [['tla', 'amir'], ['tla', 'amir']], 'apart again: each ad starts at nothing — Team A, its first by id, twice')
check((await as('boss', 'select public.crm_save_ad_assign($1, $1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r', ['AP-1', 'split', split, 'pct', '{}', evenly]))[0].r.together, false,
  'Save leaves `together` alone (the column is still there until 125000)')

// 3. The column and the two functions go.
await run('20261025125000_crm_ads_together_dropped.sql')
check((await q(`select count(*)::int as n from information_schema.columns where table_name = 'crm_ad_assign' and column_name = 'together'`))[0].n, 0, 'crm_ad_assign.together is gone')
check((await q(`select count(*)::int as n from pg_proc where proname in ('crm_save_ads_together', 'crm_counted_leads')`))[0].n, 0, 'crm_save_ads_together and crm_counted_leads are gone')
check([await md5(ASSIGN), await md5(SAVE), await md5(GIVEN)],
  ['802442b943a5d3fe293c6692b3886b89', '107965abc3eb0cb0cf2ca4d3196f9c29', 'f485e7e495108e723c593a906f880252'], 'the dealer runs on, unchanged by the drop')
check(await arrive('AP-1'), ['tlb', 'ben'], "a second lead of AP-1 balances against AP-1's own: Team B")

console.log(`crm ads together reverted: ${checks} checks passed`)
