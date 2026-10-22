// Local PostgreSQL regression for 20261019100000 (2026-10-19, an ad's name from Ads Manager). Every CRM migration runs
// VERBATIM. Under test: the webhooks' service role keeps Meta's name for an ad nobody named; a manual name wins. No live I/O.
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
// ── The ad-name RPCs (mig 20261019100000): the webhooks' service role keeps Ads Manager's name; a manual one wins ──
await as('boss', `select public.crm_name_ad('222222', 'Video Ads-15/10')`)
check((await q(`select public.crm_ads_unnamed(array['111111','222222','abc','111111']) as u`))[0].u, ['111111'], 'unnamed: only the well-formed ad with no row, once')
check((await q(`select public.crm_meta_name_ad('111111', '  [痛点型] 乱报价  ') as k`))[0].k, true, 'keeps Meta’s name')
check((await q(`select name, source, updated_by from crm_ad_names where ad_source_id = '111111'`))[0], { name: '[痛点型] 乱报价', source: 'meta', updated_by: null }, '…trimmed, as meta, by nobody')
check((await q(`select public.crm_meta_name_ad('222222', 'Ads Manager name') as k`))[0].k, false, 'a manual name is never overwritten')
check((await q(`select name, source from crm_ad_names where ad_source_id = '222222'`))[0], { name: 'Video Ads-15/10', source: 'manual' }, '…it stays')
check((await q(`select public.crm_meta_name_ad('x1', 'n') as a, public.crm_meta_name_ad('333333', '  ') as b`))[0], { a: false, b: false }, 'a bad id or an empty name keeps nothing')
await as('boss', `select public.crm_name_ad('111111', 'Renamed by hand')`)
check((await q(`select name, source from crm_ad_names where ad_source_id = '111111'`))[0], { name: 'Renamed by hand', source: 'manual' }, 'a person may rename a meta name')
for (const fn of ['crm_ads_unnamed', 'crm_meta_name_ad']) {
  const f = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(f.prosecdef, true, `${fn}: SECURITY DEFINER`)
  check(/(^|[{,])(anon|authenticated)=/.test(f.acl) || /(^|[{,])=X/.test(f.acl), false, `${fn}: nobody's but the service role's`)
  check(/service_role=X/.test(f.acl), true, `${fn}: the service role's`)
}
await assert.rejects(as('ann', `select public.crm_meta_name_ad('555555', 'x')`), /permission denied/, 'a signed-in person cannot call it'); checks++

// ── Whether an ad is still running (mig 20261022100000): the hourly sweep keeps Ads Manager's effective_status ──
await db.exec((await readFile(new URL('20261022100000_crm_ad_status.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id) values ('whatsapp', 'PN1', '60100', 'A', '111111'), ('whatsapp', 'PN1', '60101', 'B', '444444'), ('whatsapp', 'PN1', '60102', 'C', null)`)
check([...(await q(`select public.crm_ads_to_check() as a`))[0].a].sort(), ['111111', '444444'], 'to check: every ad a customer came from, once')
check((await q(`select public.crm_meta_ad_status('111111', 'ignored', ' paused ') as k`))[0].k, true, 'keeps the status of a named ad')
check((await q(`select name, source, meta_status, status_at is not null as at from crm_ad_names where ad_source_id = '111111'`))[0], { name: 'Renamed by hand', source: 'manual', meta_status: 'PAUSED', at: true }, '…upper-cased and stamped; the manual name stays')
check((await q(`select public.crm_meta_ad_status('444444', 'Skyline', 'ACTIVE') as k`))[0].k, true, 'an unnamed ad is named by Meta and keeps its status')
check((await q(`select name, source, meta_status from crm_ad_names where ad_source_id = '444444'`))[0], { name: 'Skyline', source: 'meta', meta_status: 'ACTIVE' }, '…as meta')
check((await q(`select public.crm_meta_ad_status('666666', '', 'ACTIVE') as a, public.crm_meta_ad_status('x', 'n', 'ACTIVE') as b, public.crm_meta_ad_status('444444', 'n', ' ') as c`))[0], { a: false, b: false, c: false }, 'no row and no name, a bad id or no status keeps nothing')
for (const fn of ['crm_ads_to_check', 'crm_meta_ad_status']) {
  const f = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(f.prosecdef, true, `${fn}: SECURITY DEFINER`)
  check(/(^|[{,])(anon|authenticated)=/.test(f.acl) || /(^|[{,])=X/.test(f.acl), false, `${fn}: nobody's but the service role's`)
}
await assert.rejects(as('ann', `select public.crm_meta_ad_status('111111', 'x', 'ACTIVE')`), /permission denied/, 'a signed-in person cannot keep a status'); checks++

console.log(`crm meta ad names: ${checks} checks passed`)
