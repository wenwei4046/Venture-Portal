// Local PostgreSQL regression for the Messenger ingest (2026-10-03). Every CRM
// migration runs VERBATIM; under test: a Page message lands once, keeps its
// ad, is dealt to a team, adds to unread; deliveries and reads move our
// messages forward only; only the service role may ingest. No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

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
`)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => f >= '20261002010000' && /^2026100[23]\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec(await readFile(new URL(file, dir), 'utf8'))
}
const TL = '00000000-0000-4000-8000-000000000001', RS = '00000000-0000-4000-8000-000000000002', T_TL = '00000000-0000-4000-8000-0000000000a1', T_RS = '00000000-0000-4000-8000-0000000000a2'
await q(`insert into titles values ($1, 'tl'), ($2, 'rs')`, [T_TL, T_RS])
await q(`insert into crm_role_map (title_id, crm_role) values ($1, 'tl'), ($2, 'rs')`, [T_TL, T_RS])
await q(`insert into hr_staff_costs (id, employee_name, title_id) values ($1, 'tl', $2)`, [TL, T_TL])
await q(`insert into hr_staff_costs (id, employee_name, title_id, reports_to) values ($1, 'rs', $2, $3)`, [RS, T_RS, TL])
await q(`insert into crm_team_settings (tl_id, team_share, percent_days, weekend_full_time, ratios) values ($1, 100, '{1,2,3,4}', false, $2)`, [TL, JSON.stringify({ [RS]: 100 })])

const msg = (mid, extra = {}) => ({ externalId: mid, pageId: 'PAGE1', psid: 'PSID1', name: null, kind: 'text', body: 'Hi', sentAt: '2026-10-06T03:00:00.000Z', ad: null, ...extra })
const ingest = async (messages = [], delivered = [], reads = []) =>
  (await q(`select public.crm_ingest_messenger($1::jsonb, $2::jsonb, $3::jsonb, 0, '{}'::jsonb) as r`,
    [JSON.stringify(messages), JSON.stringify(delivered), JSON.stringify(reads)]))[0].r

// 1. A first message: the customer, the ad, dealt to the team, one unread.
check(await ingest([msg('m_1', { ad: { sourceId: 'AD7', headline: 'Sofa Clearance', sourceUrl: null } })]),
  { messages: 1, duplicates: 0, statuses: 0, ignored: 0, assigned: 1 }, 'lands and is dealt')
check((await q(`select channel, account_id, external_id, ad_source_id, ad_headline, team_id, assigned_to, unread, phone from crm_contacts`))[0],
  { channel: 'messenger', account_id: 'PAGE1', external_id: 'PSID1', ad_source_id: 'AD7', ad_headline: 'Sofa Clearance', team_id: TL, assigned_to: RS, unread: 1, phone: null },
  'one customer per Page and PSID, with the ad, in the team, unread 1')

// 2. A re-delivery changes nothing.
check((await ingest([msg('m_1')])).duplicates, 1, 're-delivery is a duplicate')

// 3. Our messages: delivered by mid, then read up to the watermark — never back.
const contact = (await q(`select id from crm_contacts`))[0].id
await q(`insert into crm_messages (contact_id, external_id, direction, body, status, sent_at) values
  ($1, 'm_out1', 'out', 'Yes!', 'sent', '2026-10-06T03:05:00Z'), ($1, 'm_out2', 'out', 'Come by', 'sent', '2026-10-06T04:00:00Z')`, [contact])
await ingest([], [{ externalId: 'm_out1' }])
await ingest([], [], [{ pageId: 'PAGE1', psid: 'PSID1', watermark: '2026-10-06T03:30:00.000Z' }])
check((await q(`select external_id, status from crm_messages where direction = 'out' order by external_id`)).map(r => [r.external_id, r.status]),
  [['m_out1', 'read'], ['m_out2', 'sent']], 'read up to the watermark only')
await ingest([], [{ externalId: 'm_out1' }])
check((await q(`select status from crm_messages where external_id = 'm_out1'`))[0].status, 'read', 'a late delivered never undoes read')

// 4. A Lost customer who writes again comes back to Follow up; unread grows.
await q(`update crm_contacts set status = 'lost', lost_reason = 'no_response', unread = 0`)
await ingest([msg('m_2', { sentAt: '2026-10-07T03:00:00.000Z' })])
check((await q(`select status, previous_status, unread, assigned_to from crm_contacts`))[0], { status: 'follow_up', previous_status: 'lost', unread: 1, assigned_to: RS }, 'reopened, kept with the same person')

// 5. Every delivery is logged; only the service role may ingest.
check(Number((await q(`select count(*) from crm_channel_events where channel = 'messenger'`))[0].count), 6, 'every delivery logged')
await db.exec(`set role authenticated`)
await assert.rejects(() => q(`select public.crm_ingest_messenger('[]', '[]', '[]', 0, '{}')`), /permission denied/, 'a signed-in user cannot ingest'); checks++
await db.exec(`reset role`)

// 6. A status that beat the reply to the database is picked up when the reply is recorded.
const ev = p => q(`insert into crm_channel_events (channel, status, counts, payload) values ('messenger', 'ignored', '{}', $1::jsonb)`, [JSON.stringify(p)])
await ev({ entry: [{ id: 'PAGE1', messaging: [{ delivery: { mids: ['m_early'], watermark: 1 } }] }] })
await ev({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.E1', status: 'sent' }, { id: 'wamid.E1', status: 'read' }, { id: 'wamid.OTHER', status: 'failed' }] } }] }] })
await ev({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.E2', status: 'delivered' }, { id: 'wamid.E2', status: 'failed' }] } }] }] })
const early = async id => (await q(`select public.crm_early_status($1) as s`, [id]))[0].s
check([await early('m_early'), await early('wamid.E1'), await early('wamid.E2'), await early('m_never')], ['delivered', 'read', 'failed', null], 'early statuses found, the furthest wins, failed wins, none is null')
await db.exec(`set role authenticated`)
await assert.rejects(() => q(`select public.crm_early_status('m_early')`), /permission denied/, 'not callable by a signed-in user'); checks++
await db.exec(`reset role`)

console.log(`crm messenger: ${checks} checks passed`)
