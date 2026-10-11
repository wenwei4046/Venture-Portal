// Local PostgreSQL regression for Cold lead templates (rev 1011, mig 20261011140000): only CRM · Manage writes them, only
// an Approved one switches on, a salesperson reads only Approved + On, a changed one is a new draft, Meta's review comes
// back by Meta's name. Every CRM migration runs VERBATIM. No live I/O.
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
for (const role of ['boss', 'hod', 'tl', 'ta', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD → TL A (→ Ann, Amir) and TL B (→ Ben).
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'],
  ['ann', 'rs', 'tla'], ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
let n = 0
/** A new enquiry from an ad, dealt as the ingest deals it. */
const arrive = async (ad, at = null) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, coalesce($3::timestamptz, now()), coalesce($3::timestamptz, now())) returning id`, [`c${++n}`, ad, at]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  return (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0]
}
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const name = staff => ({ [S('ann')]: 'ann', [S('amir')]: 'amir', [S('ben')]: 'ben', [S('tla')]: 'tla', [S('tlb')]: 'tlb', [S('hod')]: 'hod' })[staff] ?? staff


const tpl = async (who, sql, params = []) => (await as(who, sql, params))[0]
// Writers: CRM · Manage only.
await refused('ann', `select public.crm_save_template(null, 'Follow up visit', 'whatsapp', 'Hi {name}')`, [], /may not/, 'a salesperson may not write templates')
await refused('tla', `select public.crm_save_template(null, 'Follow up visit', 'whatsapp', 'Hi {name}')`, [], /may not/, 'nor a TL')
const a = (await tpl('hod', `select * from public.crm_save_template(null, 'Follow up visit', 'whatsapp', 'Hi {name}, still keen?')`))
check([a.status, a.is_on], ['draft', false], 'a new template is an Off draft')
await refused('boss', `select public.crm_save_template(null, '', 'whatsapp', 'x')`, [], /name and a message/, 'a name is needed')
await refused('boss', `select public.crm_save_template(null, 'X', 'sms', 'x')`, [], /WhatsApp or Messenger/, 'WhatsApp or Messenger only')
// Only Approved switches on.
await refused('boss', `select public.crm_template_on($1, true)`, [a.id], /Only an approved/, 'a draft cannot be switched on')
const sub = await tpl('boss', `select * from public.crm_template_submitted($1, 'crm_follow_up_visit_ab12', 'm1', 'review')`, [a.id])
check([sub.status, sub.meta_name], ['review', 'crm_follow_up_visit_ab12'], 'submitted: In review, with Meta’s name')
await refused('boss', `select public.crm_template_submitted($1, 'x', 'm2', 'review')`, [a.id], /not a WhatsApp draft/, 'not submitted twice')
check((await tpl('boss', `select public.crm_template_statuses($1) as n`, [JSON.stringify([{ name: 'crm_follow_up_visit_ab12', status: 'APPROVED' }, { name: 'someone_else', status: 'APPROVED' }])])).n, 1, 'Meta approved it')
// Salespeople see it only once it is On.
const seen = async who => (await as(who, `select name from crm_templates order by name`)).map(r => r.name)
check(await seen('ann'), [], 'approved but Off: a salesperson sees nothing')
await as('hod', `select public.crm_template_on($1, true)`, [a.id])
check(await seen('ann'), ['Follow up visit'], 'On: a salesperson sees it')
const draft = await tpl('boss', `select * from public.crm_save_template(null, 'Draft one', 'messenger', 'Hello')`)
check(await seen('ann'), ['Follow up visit'], 'a draft stays out of a salesperson’s sight')
check(await seen('boss'), ['Draft one', 'Follow up visit'], 'the Principal reads every template')
await refused('boss', `select public.crm_template_submitted($1, 'x', 'm3', 'review')`, [draft.id], /not a WhatsApp draft/, 'a Messenger template is not submitted to WhatsApp')
// Renaming keeps it; new words make it a new Off draft.
const renamed = await tpl('hod', `select * from public.crm_save_template($1, 'Follow up', 'whatsapp', 'Hi {name}, still keen?')`, [a.id])
check([renamed.status, renamed.is_on, renamed.meta_name], ['approved', true, 'crm_follow_up_visit_ab12'], 'a new name only: still Approved and On')
const reworded = await tpl('hod', `select * from public.crm_save_template($1, 'Follow up', 'whatsapp', 'Hi {name}, shall we book?')`, [a.id])
check([reworded.status, reworded.is_on, reworded.meta_name], ['draft', false, null], 'new words: a new Off draft for Meta to review')
check(await seen('ann'), [], 'and salespeople no longer see it')
// Meta pausing or rejecting switches it off.
await as('boss', `select public.crm_template_submitted($1, 'crm_follow_up_cd34', 'm4', 'approved')`, [a.id])
await as('boss', `select public.crm_template_on($1, true)`, [a.id])
await as('boss', `select public.crm_template_statuses($1)`, [JSON.stringify([{ name: 'crm_follow_up_cd34', status: 'REJECTED', reason: 'PROMOTIONAL' }])])
check(await q(`select status, is_on, reject_reason from crm_templates where id = $1`, [a.id]), [{ status: 'rejected', is_on: false, reject_reason: 'PROMOTIONAL' }], 'rejected by Meta: off, with the reason')
// Nobody writes the table straight.
await refused('boss', `insert into crm_templates (name, body) values ('x', 'y')`, [], /permission denied/, 'no straight inserts')
await refused('ann', `select public.crm_delete_template($1)`, [a.id], /may not/, 'a salesperson may not delete')
await as('boss', `select public.crm_delete_template($1)`, [a.id])
check(await seen('boss'), ['Draft one'], 'deleted')

console.log(`crm templates: ${checks} checks passed`)
