// Local PostgreSQL regression for the CRM desktop v2 (2026-10-15, mig 20261015100000): Channels (link state, default,
// what was saved to Meta — CRM · Manage only), an UNLINKED Page / number whose messages Inbox no longer takes in, and
// the Customer form's Range answer type. Every CRM migration runs VERBATIM, then the cases.
// No live I/O.
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
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }

// 1 · Channels: CRM · Manage links / unlinks, one default per kind; whoever sees the whole CRM reads them.
await refused('ann', `select public.crm_set_channel('page', 'PG1', 'HOUZS', false, false)`, [], /may not/, 'a salesperson may not change the channels')
await refused('tla', `select public.crm_set_channel('page', 'PG1', 'HOUZS', false, false)`, [], /may not/, 'a team leader may not either')
await as('boss', `select public.crm_set_channel('page', 'PG1', 'HOUZS Venture', true, true)`)
await as('hod', `select public.crm_set_channel('page', 'PG2', 'HOUZS Penang', true, true)`)
check(await as('boss', `select external_id, is_default from crm_channels order by external_id`), [{ external_id: 'PG1', is_default: false }, { external_id: 'PG2', is_default: true }],
  'the Director makes another Page the default — one default per kind')
check((await as('ann', `select count(*)::int as n from crm_channels`))[0].n, 0, 'a salesperson reads none')
await as('boss', `select public.crm_set_channel('page', 'PG2', null, false, null)`)
check(await as('boss', `select linked, is_default, name from crm_channels where external_id = 'PG2'`), [{ linked: false, is_default: false, name: 'HOUZS Penang' }], 'unlinked: nobody\'s default, name kept')
await refused('boss', `select public.crm_set_channel('x', 'PG2', null, true, null)`, [], /Choose the channel/, 'an unknown kind')
await as('boss', `select public.crm_note_channel_save('page', 'PG1', 'HOUZS Venture', '{"about":"Furniture"}')`)
await as('boss', `select public.crm_note_channel_save('page', 'PG1', '', '{"phone":"+60 3"}')`)
check((await as('boss', `select saved from crm_channels where external_id = 'PG1'`))[0].saved, { about: 'Furniture', phone: '+60 3' }, 'what was saved to Meta is kept, field by field')
await refused('ann', `select public.crm_note_channel_save('page', 'PG1', '', '{}')`, [], /may not/, 'a salesperson may not record a save')

// 2 · An unlinked Page's / number's messages are not taken in; a linked one's are.
const ms = (mid, page) => ({ externalId: mid, pageId: page, psid: `PS-${mid}`, name: 'Fan', kind: 'text', body: 'hi', sentAt: '2026-10-15T03:00:00.000Z', ad: null })
const counts = (await q(`select public.crm_ingest_messenger($1::jsonb, '[]'::jsonb, '[]'::jsonb, 0, '{}'::jsonb) as c`,
  [JSON.stringify([ms('m.off', 'PG2'), ms('m.on', 'PG1'), ms('m.new', 'PG9')])]))[0].c
check(counts.messages, 2, 'two messages taken in: a linked Page and one the CRM has no row for (linked by default)')
check(counts.ignored, 1, 'the unlinked Page\'s message is counted as ignored')
check((await q(`select external_id from crm_messages where external_id like 'm.%' order by 1`)).map(r => r.external_id), ['m.new', 'm.on'], 'nothing stored for the unlinked Page')
await as('boss', `select public.crm_set_channel('wa', 'PN-OFF', '+60 4', false, false)`)
const wa = (mid, pn) => ({ externalId: mid, phoneNumberId: pn, waId: '60123' + mid.length, name: 'Wa', kind: 'text', body: 'hello', sentAt: '2026-10-15T03:00:00.000Z', ad: null })
const wc = (await q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb) as c`, [JSON.stringify([wa('w.off', 'PN-OFF'), wa('w.on1', 'PN-ON')])]))[0].c
check([wc.messages, wc.ignored], [1, 1], 'WhatsApp: the unlinked number\'s message ignored, the other taken in')
check((await q(`select status from crm_channel_events order by id desc limit 1`))[0].status, 'applied', 'the delivery is still logged')

// 3 · The Customer form takes v2's Range (from–to).
const sections = JSON.stringify([{ id: 'property', title: 'Property', fields: [{ id: 'q1', label: 'Move-in budget', type: 'Range', req: 0 }] }])
check((await as('boss', `select (public.crm_save_form(null, 'Customer info', $1)).sections->0->'fields'->0->>'type' as t`, [sections]))[0].t, 'Range', 'a Range question is saved')
await refused('boss', `select public.crm_save_form(null, 'X', $1)`, [JSON.stringify([{ id: 's', title: 'S', fields: [{ id: 'a', label: 'A', type: 'Slider' }] }])], /name and a type/, 'an unknown type is still refused')

console.log(`crm desktop v2: ${checks} checks passed`)
