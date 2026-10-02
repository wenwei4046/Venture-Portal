// Local PostgreSQL regression for the WhatsApp ingest (2026-10-02). The
// migration runs VERBATIM against a synthetic surrounding schema; what is
// under test is that a delivery lands once, a closed customer reopens only on
// a NEW message, statuses never step back, every delivery is logged, and
// nobody but the service role can read or write. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]

let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const reject = async (sql, pattern, what) => { await assert.rejects(() => q(sql), pattern, what); checks++ }

// The surroundings the migration expects on Supabase.
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create table public.hr_staff_costs (id uuid primary key default gen_random_uuid(), employee_name text);
  grant usage on schema public to anon, authenticated, service_role;
`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261002010000_crm_whatsapp.sql', import.meta.url), 'utf8'))

const msg = (externalId, extra = {}) => ({
  externalId, phoneNumberId: 'PN1', waId: '60123456789', name: 'Tan Mei Ling', kind: 'text', body: 'Hi',
  mediaId: null, mediaMime: null, sentAt: '2026-10-02T02:00:00.000Z', ad: null, ...extra,
})
const ingest = async (messages = [], statuses = [], ignored = 0) =>
  one(`select public.crm_ingest_whatsapp($1::jsonb, $2::jsonb, $3, $4::jsonb)`,
    [JSON.stringify(messages), JSON.stringify(statuses), ignored, JSON.stringify({ test: true })])

// 1. A first message makes the customer and the message, with the ad that brought them.
check(await ingest([msg('wamid.1', { ad: { sourceId: 'AD9', headline: 'Akemi Fair', sourceUrl: 'u' } })]),
  { messages: 1, duplicates: 0, statuses: 0, ignored: 0 }, 'first message lands')
check(await q(`select name, phone, status, ad_source_id, ad_headline from crm_contacts`),
  [{ name: 'Tan Mei Ling', phone: '+60123456789', status: 'new', ad_source_id: 'AD9', ad_headline: 'Akemi Fair' }], 'customer made')
check(await one(`select count(*)::int from crm_messages where direction = 'in' and status = 'received'`), 1, 'message stored as received')

// 2. Meta re-delivers: nothing changes, logged as a duplicate.
check(await ingest([msg('wamid.1')]), { messages: 0, duplicates: 1, statuses: 0, ignored: 0 }, 're-delivery is a duplicate')
check(await one(`select count(*)::int from crm_messages`), 1, 'still one message')

// 3. The first ad stays even when a later message comes from another ad; the name updates.
await ingest([msg('wamid.2', { name: 'Mei Ling Tan', ad: { sourceId: 'AD10', headline: 'Sofa', sourceUrl: 'v' } })])
check(await q(`select name, ad_source_id from crm_contacts`), [{ name: 'Mei Ling Tan', ad_source_id: 'AD9' }], 'first ad kept, name refreshed')

// 4. A Lost customer who writes again comes back to Follow up, remembering why they were lost.
await q(`update crm_contacts set status = 'lost', lost_reason = 'too_expensive'`)
await ingest([msg('wamid.3', { body: 'Still on sale?', sentAt: '2026-10-03T02:00:00.000Z' })])
check(await q(`select status, previous_status, lost_reason from crm_contacts`),
  [{ status: 'follow_up', previous_status: 'lost', lost_reason: 'too_expensive' }], 'reopened as Follow up, was Lost')

// 5. …but an OLD message re-delivered after the salesperson closed them does not reopen them.
await q(`update crm_contacts set status = 'won', previous_status = null`)
check((await ingest([msg('wamid.2')])).duplicates, 1, 'old message re-delivered')
check(await one(`select status from crm_contacts`), 'won', 'a re-delivery never reopens')

// 6. The 24-hour window follows the latest customer message, never an older one.
await ingest([msg('wamid.4', { sentAt: '2026-10-01T00:00:00.000Z' })])
check(await one(`select to_char(last_customer_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')  from crm_contacts`), '2026-10-03T02:00', 'window keeps the latest')

// 7. Statuses of our own messages: forward only; failed always lands with the reason.
const contact = await one(`select id from crm_contacts`)
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, status) values ($1, 'wamid.out1', 'out', 'text', 'Hello', 'sent'), ($1, 'wamid.out2', 'out', 'text', 'Hi', 'sent')`, [contact])
check((await ingest([], [{ externalId: 'wamid.out1', status: 'read', at: 'x', error: null }])).statuses, 1, 'read lands')
check((await ingest([], [{ externalId: 'wamid.out1', status: 'delivered', at: 'x', error: null }])).statuses, 0, 'a late delivered does not undo read')
await ingest([], [{ externalId: 'wamid.out2', status: 'failed', at: 'x', error: '131047 Re-engagement message' }])
check(await q(`select external_id, status, error from crm_messages where direction = 'out' order by external_id`), [
  { external_id: 'wamid.out1', status: 'read', error: null },
  { external_id: 'wamid.out2', status: 'failed', error: '131047 Re-engagement message' },
], 'statuses settle correctly')
check((await ingest([], [{ externalId: 'wamid.1', status: 'read', at: 'x', error: null }])).statuses, 0, 'a status never touches an incoming message')

// 8. Every delivery is logged, with what it did.
check(await ingest([], [], 2), { messages: 0, duplicates: 0, statuses: 0, ignored: 2 }, 'nothing to apply')
check(await q(`select status, count(*)::int as n from crm_channel_events group by status order by status`), [
  // applied: wamid.1, .2, .3, .4, the read, the failure · duplicate: two re-deliveries ·
  // ignored: the late "delivered", the status on an incoming message, the empty delivery.
  { status: 'applied', n: 6 }, { status: 'duplicate', n: 2 }, { status: 'ignored', n: 3 },
], 'every delivery logged')

// 9. Locked: only the service role may run the ingest; nobody else reads the tables.
await db.exec(`set role authenticated`)
await reject(`select * from public.crm_contacts`, /permission denied/, 'a signed-in user cannot read customers')
await reject(`select * from public.crm_messages`, /permission denied/, 'a signed-in user cannot read messages')
await reject(`select public.crm_ingest_whatsapp('[]', '[]', 0, '{}')`, /permission denied/, 'a signed-in user cannot ingest')
await db.exec(`reset role; set role anon`)
await reject(`select * from public.crm_channel_events`, /permission denied/, 'anonymous cannot read the log')
await db.exec(`reset role; set role service_role`)
check(typeof (await ingest([], [], 0)), 'object', 'the service role may ingest')
await db.exec(`reset role`)

console.log(`crm whatsapp: ${checks} checks passed`)
