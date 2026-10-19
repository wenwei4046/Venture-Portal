// Local PostgreSQL regression for 20261019110000 / 20261019120000 (2026-10-19): an ad nobody set goes to the Revenue
// Director; auto-replies are claimed once and recorded as ours. Every CRM migration runs VERBATIM. No live I/O.
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

// ── An ad nobody set: to the Revenue Director, no team ──
const arrive = async (ext, ad) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id) values ('whatsapp', 'PN1', $1, $1, $2) returning id`, [ext, ad]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  return { id: c, ...(await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0] }
}
const lead = await arrive('60111', 'AD-NEW')
check([lead.assigned_to, lead.team_id], [id('s', 'hod'), null], 'an ad nobody set: to the Revenue Director, no team')

// ── Auto-replies ──
await q(`insert into crm_auto_replies (staff_id, settings) values ($1, $2)`, [id('s', 'hod'),
  JSON.stringify({ welcome: { on: true, text: 'Hi!' }, after: { on: false, text: '', from: '08:00', to: '20:00' }, kws: [] })])
const say = async (ext, body, at) => (await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_at) values ($1, $2, 'in', 'text', $3, 'received', $4) returning id`, [lead.id, ext, body, at]))[0].id
const m1 = await say('w1', 'hello', '2026-10-20T02:00:00Z'), m2 = await say('w2', 'price?', '2026-10-20T02:01:00Z')
const due = await q(`select message_id, customer, first, settings->'welcome'->>'text' as w from public.crm_auto_reply_due('whatsapp', array['w1','w2','nope'])`)
check(due.map(d => [d.message_id, d.customer, d.first, d.w]), [[m1, '60111', true, 'Hi!'], [m2, '60111', false, 'Hi!']], 'due: both messages, the first marked, with the person’s settings')
check((await q(`select count(*)::int n from public.crm_auto_reply_due('messenger', array['w1'])`))[0].n, 0, '…of their own channel only')
const claim = async (m, b) => (await q(`select public.crm_auto_reply_claim($1, $2) as id`, [m, b]))[0].id
const out = await claim(m1, 'Hi!')
check(!!out, true, 'the first claim keeps it')
check(await claim(m2, 'Hi!'), null, 'the same words within the hour are not claimed again')
check(await claim(m1, '   '), null, 'empty words: nothing')
const row = (await q(`select direction, auto, sent_by, status, external_id from crm_messages where id = $1`, [out]))[0]
check(row, { direction: 'out', auto: true, sent_by: null, status: 'sent', external_id: null }, 'kept as an auto-reply of ours, by nobody')
await q(`select public.crm_auto_reply_done($1, 'wamid.OUT', null)`, [out])
check((await q(`select external_id from crm_messages where id = $1`, [out]))[0].external_id, 'wamid.OUT', 'Meta’s id kept, for the receipts')
const out2 = await claim(m2, 'Prices vary')
await q(`select public.crm_auto_reply_done($1, null, 'Outside the 24 hours')`, [out2])
check((await q(`select status, error from crm_messages where id = $1`, [out2]))[0], { status: 'failed', error: 'Outside the 24 hours' }, 'a refused send is marked failed, with why')
check((await q(`select count(*)::int n from crm_events where contact_id = $1 and kind = 'first_reply'`, [lead.id]))[0].n, 0, 'an auto-reply is no first reply of ours')
await q(`insert into crm_contact_prefs (staff_id, contact_id, blocked) values ($1, $2, true)`, [id('s', 'hod'), lead.id])
check((await q(`select count(*)::int n from public.crm_auto_reply_due('whatsapp', array['w1'])`))[0].n, 0, 'a chat its person blocked gets none')
for (const fn of ['crm_auto_reply_due', 'crm_auto_reply_claim', 'crm_auto_reply_done']) {
  const f = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(f.prosecdef && /service_role=X/.test(f.acl) && !/(^|[{,])(anon|authenticated)=/.test(f.acl) && !/(^|[{,])=X/.test(f.acl), true, `${fn}: the service role's alone`)
}

console.log(`crm auto-reply: ${checks} checks passed`)
