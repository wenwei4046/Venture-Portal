// Local PostgreSQL regression for 20261014120000 (2026-10-14, the Revenue app's CRM chat button — the user: its number is
// the customers' messages not read yet, the CRM's own Inbox figure). Every CRM migration runs VERBATIM (as the CRM's own
// checks load them), then this one. What is under test: crm_my_unread() adds up the unread of one's own chats — given to
// them or shared with them — and of nobody else's, leaves a chat they hid out, reads 0 for somebody with no CRM · View,
// follows a chat when it is read or handed on; it is SECURITY INVOKER, STABLE and not the publishable key's; and
// crm_contacts joins the supabase_realtime publication once, a database without one skipping it. No live I/O.
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
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}
const MIGRATION = (await readFile(new URL('20261014120000_revenue_app_chat_badge.sql', dir), 'utf8')).replace(/\r\n/g, '\n')

// ── 0. A database with no supabase_realtime publication (this one, so far) takes the migration and skips the publication ──
await db.exec(MIGRATION)
check(await q(`select count(*)::int as n from pg_publication where pubname = 'supabase_realtime'`), [{ n: 0 }], 'no publication here: none is made')

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles (id, name) values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD (PETER) → TL A (→ ANN, AMIR); ZED sells with a login whose title holds no CRM cell.
for (const [who, role, upline] of [['BOSS', 'boss', null], ['PETER', 'hod', 'BOSS'], ['TLA', 'tl', 'PETER'], ['ANN', 'rs', 'TLA'], ['AMIR', 'rs', 'TLA'], ['ZED', 'rs', 'TLA']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'BOSS' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
// ZED holds a CRM cell but not View: the CRM's own reads close for him.
await q(`insert into test_crm_cells (uid, action, scope) values ($1, 'manage', 'all')`, [id('u', 'ZED')])
const S = who => id('s', who)
const U = who => id('u', who)
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${U(who)}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const unread = async who => (await as(who, `select public.crm_my_unread() as n`))[0].n

let wamid = 0
const whatsapp = (waId, name) => ({ externalId: `wamid.${++wamid}`, phoneNumberId: 'PN1', waId, name, kind: 'text', body: 'hello',
  mediaId: null, mediaMime: null, sentAt: new Date(Date.UTC(2030, 0, 7, 2, 0, wamid)).toISOString(), ad: null })
const customer = async (waId, owner, n) => {
  await q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb)`, [JSON.stringify([whatsapp(waId, `Customer ${waId}`)])])
  const c = (await q(`select id from crm_contacts where external_id = $1`, [waId]))[0].id
  await q(`update crm_contacts set assigned_to = $2, unread = $3 where id = $1`, [c, owner ? S(owner) : null, n])
  return c
}

// ── 1. One's own chats, added up — the CRM Inbox's figure ──
const ali = await customer('60101', 'ANN', 5)
const bala = await customer('60102', 'ANN', 2)
await customer('60103', 'ANN', 0)
const amirs = await customer('60104', 'AMIR', 4)
await customer('60105', 'PETER', 3)
await customer('60106', null, 9)
check(await unread('ANN'), 7, 'Ann: Ali 5 + Bala 2 — the messages, not the chats')
check(await unread('AMIR'), 4, 'Amir: his own one')
check(await unread('PETER'), 3, 'the Director: his own, not the 15 of everybody he may read')
check(await unread('BOSS'), 0, 'the Principal (the Boss): no chat of their own')
check(await unread('TLA'), 0, 'a team leader: their line’s chats are not theirs')
check(await unread('ZED'), 0, 'no CRM · View: nothing')

// ── 2. Shared with them counts; hidden by them does not (by anybody else, it still does) ──
await q(`insert into crm_contact_shares (contact_id, staff_id) values ($1, $2)`, [amirs, S('ANN')])
check(await unread('ANN'), 11, 'Amir’s chat shared with Ann: hers to answer too')
check(await unread('AMIR'), 4, '…and still his')
await q(`insert into crm_contact_prefs (staff_id, contact_id, hidden) values ($1, $2, true)`, [S('ANN'), ali])
check(await unread('ANN'), 6, 'Ali hidden by Ann: off her count, as off her Inbox')
await q(`insert into crm_contact_prefs (staff_id, contact_id, muted, blocked) values ($1, $2, true, true)`, [S('ANN'), bala])
check(await unread('ANN'), 6, 'muted or blocked still counts, as in her Inbox')
await q(`insert into crm_contact_prefs (staff_id, contact_id, hidden) values ($1, $2, true)`, [S('AMIR'), bala])
check(await unread('ANN'), 6, 'somebody else hiding Bala changes nothing for Ann')

// ── 3. It follows the chats: read, answered, handed on, switched off ──
await q(`update crm_contacts set unread = 0 where id = $1`, [bala])
check(await unread('ANN'), 4, 'Bala read: 4 left (Amir’s shared chat)')
await q(`update crm_contacts set assigned_to = $2 where id = $1`, [ali, S('AMIR')])
await q(`update crm_contact_prefs set hidden = false where staff_id = $1 and contact_id = $2`, [S('ANN'), ali])
check([await unread('ANN'), await unread('AMIR')], [4, 9], 'Ali handed to Amir: his now')
await q(`update users set is_active = false where id = $1`, [U('AMIR')])
check(await unread('AMIR'), 0, 'a switched-off login: nobody to the CRM, nothing')
await q(`update users set is_active = true where id = $1`, [U('AMIR')])

// ── 4. The function itself ──
const fn = (await q(`select prosecdef, provolatile, proacl::text as acl from pg_proc where proname = 'crm_my_unread'`))[0]
check([fn.prosecdef, fn.provolatile], [false, 's'], 'SECURITY INVOKER (the row policy answers) and STABLE (View as may call it)')
check(/(^|[{,])anon=/.test(fn.acl) || /(^|[{,])=X/.test(fn.acl), false, 'not the publishable key’s, nor PUBLIC’s')
check(/authenticated=X/.test(fn.acl), true, 'a signed-in member may call it')
await db.exec(`set role anon`)
await assert.rejects(db.query(`select public.crm_my_unread()`), /permission denied/, 'the publishable key is refused'); checks++
await db.exec(`reset role`)

// ── 5. With the publication there: crm_contacts joins it, once ──
await db.exec(`create publication supabase_realtime`)
await db.exec(MIGRATION)
await db.exec(MIGRATION)
check(await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`), [{ tablename: 'crm_contacts' }],
  'crm_contacts is published for Realtime — and a second run adds nothing')
check(await unread('ANN'), 4, 'and the count is unchanged by it')

console.log(`chat badge: ${checks} checks passed`)
