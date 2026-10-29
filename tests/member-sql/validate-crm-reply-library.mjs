// Local PostgreSQL regression for 20261029170000 (2026-10-29, the owner: "reply library … 存入一些不错的话术，让业务参考"). The
// CRM migrations up to the 19th run VERBATIM, then this one. What is under test: everybody in the CRM reads the library;
// only CRM · Manage saves it, whole — rows kept by id, new ones added, the rest removed, in the order sent — and gets the
// saved list back with the new ids; titles and words are required, keywords trimmed; nobody writes the table directly;
// the publishable key is refused. No live I/O.
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
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const files = (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()
check(files.includes('20261014251500_crm_recent_emoji.sql'), true, 'the CRM migrations load')
for (const file of files) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles (id, name) values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
for (const [who, role, upline] of [['BOSS', 'boss', null], ['PETER', 'hod', 'BOSS'], ['TLA', 'tl', 'PETER'], ['ANN', 'rs', 'TLA'], ['AMIR', 'rs', 'TLA'], ['ZED', 'rs', 'TLA']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'BOSS' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
// ZED holds a CRM cell but not View.
await q(`insert into test_crm_cells (uid, action, scope) values ($1, 'manage', 'all')`, [id('u', 'ZED')])
const S = who => id('s', who)
await db.exec((await readFile(new URL('20261029170000_crm_reply_library.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
const U = who => id('u', who)
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${U(who)}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const save = async (who, items) => (await as(who, `select public.crm_save_reply_library($1::jsonb) as r`, [JSON.stringify(items)]))[0].r
const titles = async () => (await q(`select title from crm_reply_library order by sort_order`)).map(r => r.title)

// ── 1. CRM · Manage saves the whole list and gets it back with ids ──
const first = await save('PETER', [
  { id: null, title: ' Price ', category: 'Pricing', body: 'Hi {name}, from RM 9,999', keywords: [' price ', '', '几钱'] },
  { id: null, title: 'Rental', category: '', body: 'We rent it out, {name}', keywords: [] },
])
check(first.map(r => [r.title, r.category, r.body, r.keywords]), [['Price', 'Pricing', 'Hi {name}, from RM 9,999', ['price', '几钱']], ['Rental', '', 'We rent it out, {name}', []]],
  'trimmed, empty keywords left out, in the order sent')
check(first.every(r => /^[0-9a-f-]{36}$/.test(r.id)), true, 'each new row comes back with its id')
const again = await save('BOSS', [{ ...first[1], title: 'Rental v2' }, { id: null, title: 'Visit', category: 'Visit', body: 'See you at {showroom}', keywords: ['visit'] }])
check(again[0].id, first[1].id, 'a row sent with its id is kept (updated, not re-made)')
check(await titles(), ['Rental v2', 'Visit'], 'reordered; Price, not sent, is removed')

// ── 2. Everybody in the CRM reads it ──
check((await as('ANN', `select title from crm_reply_library order by sort_order`)).map(r => r.title), ['Rental v2', 'Visit'], 'a salesperson reads the library')
check(await as('ZED', `select count(*)::int as n from crm_reply_library`), [{ n: 0 }], 'no CRM · View: reads nothing')

// ── 3. Who may not, and what is refused ──
await assert.rejects(save('ANN', []), /reply library|may not/i, 'a salesperson (no Manage) cannot save'); checks++
check(await titles(), ['Rental v2', 'Visit'], '…and nothing changed')
await assert.rejects(save('PETER', [{ id: null, title: ' ', body: 'x' }]), /title/, 'a reply needs a title'); checks++
await assert.rejects(save('PETER', [{ id: null, title: 'T', body: '' }]), /words/, 'a reply needs its words'); checks++
await assert.rejects(save('PETER', [{ id: null, title: 'T', body: 'x', category: 'c'.repeat(41) }]), /category/, 'a category is up to 40'); checks++
check(await titles(), ['Rental v2', 'Visit'], 'a refused save changes nothing')
await db.exec(`set test.uid = '${U('ANN')}'; set role authenticated`)
await assert.rejects(db.query(`insert into crm_reply_library (title, body) values ('x', 'y')`), /permission denied/, 'no direct write to the table'); checks++
await db.exec(`reset role; set test.uid = ''`)
await db.exec(`set role anon`)
await assert.rejects(db.query(`select public.crm_save_reply_library('[]')`), /permission denied/, 'the publishable key is refused'); checks++
await db.exec(`reset role`)
check(await save('PETER', []), [], 'an empty list empties the library')

console.log(`crm reply library: ${checks} checks passed`)
