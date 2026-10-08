// Local PostgreSQL regression for the salesperson CRM redesign (2026-10-09,
// mig 20261009030000). Every CRM migration runs VERBATIM; under test: visit
// outcomes (Won amount, No show), the showroom's slots / limit / closures,
// customer details, each person's own prefs / labels / quick replies, share and
// move invitations and what a share opens, replies with a quote, reactions,
// and the Won / Lost events. No live I/O.
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
  -- The app-wide audit register (mig 20261008190000) is not under test here.
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec(await readFile(new URL(file, dir), 'utf8'))
}

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'ta', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD → TL A (→ TA A → Ann, Amir) and TL B (→ Ben).
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['taa', 'ta', 'tla'],
  ['ann', 'rs', 'taa'], ['amir', 'rs', 'taa'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1)`, [id('u', who)])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const contact = async (name, assigned, team) => (await q(
  `insert into crm_contacts (channel, account_id, external_id, name, assigned_to, team_id, unread) values ('whatsapp', 'PN1', $1, $1, $2, $3, 1) returning id`,
  [name, assigned ? id('s', assigned) : null, team ? id('s', team) : null]))[0].id
const c = { ann: await contact('c-ann', 'ann', 'tla'), amir: await contact('c-amir', 'amir', 'tla'), ben: await contact('c-ben', 'ben', 'tlb') }

const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const denied = async (who, sql, params, what) => { await assert.rejects(() => as(who, sql, params), /may not|permission denied/, what); checks++ }
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const row = async (sql, params) => (await q(sql, params))[0]
// Office time is UTC+8: 11:00 in Kuala Lumpur is 03:00 UTC.
const at = (ymd, hhmm) => `${ymd}T${hhmm}:00+08:00`

// 1. Showrooms: slots, limit, closures. Kuala Lumpur takes 11/13/15/17/19 every day, 2 per slot.
check((await row(`select slots, cap, weekly, blocks from crm_showrooms where id = 'kl'`)),
  { slots: ['11:00', '13:00', '15:00', '17:00', '19:00'], cap: 2, weekly: [], blocks: [] }, 'Kuala Lumpur starts with five slots, two per slot')
const thu = '2026-10-15' // a Thursday
await as('ann', `select public.crm_book($1, 'kl', $2)`, [c.ann, at(thu, '11:00')])
await as('amir', `select public.crm_book($1, 'kl', $2)`, [c.amir, at(thu, '11:00')])
await refused('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at(thu, '11:00')], /full/, 'a third booking in a two-per-slot time is refused')
await refused('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at(thu, '12:00')], /does not take bookings at that time/, 'a time that is not a slot is refused')
await denied('ann', `select public.crm_save_showroom_full('kl', 'Kuala Lumpur Showroom', 'Jalan Ampang', '{11:00,13:00@01234}', 1, '{0}', '[{"a":"2026-10-20","b":"2026-10-21","why":"Training"}]')`, [], 'a salesperson may not change a showroom')
await as('hod', `select public.crm_save_showroom_full('kl', 'Kuala Lumpur Showroom', 'Jalan Ampang', '{11:00,13:00@01234}', 1, '{0}', '[{"a":"2026-10-20","b":"2026-10-21","why":"Training"}]')`)
check(await row(`select address, slots, cap, weekly from crm_showrooms where id = 'kl'`),
  { address: 'Jalan Ampang', slots: ['11:00', '13:00@01234'], cap: 1, weekly: [0] }, 'the HOD saves address, slots, limit and Sunday closures')
await refused('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at('2026-10-18', '11:00')], /closed that day/, 'Sunday is closed every week')
await refused('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at('2026-10-20', '11:00')], /closed that day/, 'a blocked date is closed')
await refused('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at('2026-10-17', '13:00')], /does not take bookings/, '13:00 is Monday to Friday only (a Saturday is refused)')
await as('ben', `select public.crm_book($1, 'kl', $2)`, [c.ben, at('2026-10-16', '13:00')])
check((await row(`select status from crm_contacts where id = $1`, [c.ben])).status, 'appointment', 'a Friday 13:00 books, and the customer is Appointment')
await refused('hod', `select public.crm_save_showroom_full('kl', 'KL', '', '{9am}', 2, '{}', '[]')`, [], /HH:MM/, 'a slot that is not HH:MM is refused')

// 2. A visit's outcome.
const apptOf = async who => (await row(`select id from crm_appointments where contact_id = $1 order by created_at desc limit 1`, [c[who]])).id
const annVisit = await apptOf('ann')
await refused('ann', `select public.crm_visit_outcome($1, true, 'won')`, [annVisit], /amount/, 'Won needs an amount')
await refused('ann', `select public.crm_visit_outcome($1, true, 'lost', null, 'no_response')`, [annVisit], /Unreachable is for a No show/, 'Unreachable only after a No show')
await denied('ben', `select public.crm_visit_outcome($1, true, 'follow_up')`, [annVisit], 'another team may not mark Ann’s visit')
await as('ann', `select public.crm_visit_outcome($1, true, 'won', 3200)`, [annVisit])
check(await row(`select status, won_amount::text from crm_contacts where id = $1`, [c.ann]), { status: 'won', won_amount: '3200.00' }, 'Show up → Won keeps the amount')
check(await row(`select state, outcome from crm_appointments where id = $1`, [annVisit]), { state: 'attended', outcome: 'won' }, 'the visit is attended, outcome won')
check((await q(`select kind, (data->>'amount')::numeric::text as amount, owner = $2 as own from crm_events where contact_id = $1`, [c.ann, id('s', 'ann')])),
  [{ kind: 'won', amount: '3200.00', own: true }], 'Won is an event with its amount, under Ann')
await refused('ann', `select public.crm_visit_outcome($1, true, 'follow_up')`, [annVisit], /already marked/, 'a marked visit is not marked again')
const amirVisit = await apptOf('amir')
await refused('amir', `select public.crm_visit_outcome($1, false, 'won', 100)`, [amirVisit], /cannot be Won/, 'a No show is never Won')
await as('amir', `select public.crm_visit_outcome($1, false, 'lost', null, 'no_response')`, [amirVisit])
check(await row(`select status, lost_reason from crm_contacts where id = $1`, [c.amir]), { status: 'lost', lost_reason: 'no_response' }, 'No show → Lost · Unreachable')
check((await row(`select state from crm_appointments where id = $1`, [amirVisit])).state, 'no_show', 'the visit stays as a No show')
check((await q(`select kind from crm_events where contact_id = $1`, [c.amir])).map(r => r.kind), ['lost'], 'Lost is an event')

// 3. Customer details.
await as('ann', `select public.crm_save_details($1, 'Mr. Lim', '012-345 6789', 'Condo', '3R 2R', 'Mont Kiara', 'Full renovation', '50,000')`, [c.ann])
check(await row(`select name, phone, property_type, unit_size, unit_location, requirement, budget from crm_contacts where id = $1`, [c.ann]),
  { name: 'Mr. Lim', phone: '012-345 6789', property_type: 'Condo', unit_size: '3R 2R', unit_location: 'Mont Kiara', requirement: 'Full renovation', budget: '50,000' }, 'details save, and rename the customer')
await refused('ann', `select public.crm_save_details($1, '  ', '', '', '', '', '', '')`, [c.ann], /needs a name/, 'a customer keeps a name')
await refused('ann', `select public.crm_save_details($1, 'X', '', 'Villa', '', '', '', '')`, [c.ann], /Condo or Landed/, 'property type is Condo or Landed')
await denied('ben', `select public.crm_save_details($1, 'X', '', '', '', '', '', '')`, [c.ann], 'another team may not edit Ann’s customer')

// 4. Each person's own: prefs, labels, quick replies.
await as('ann', `select public.crm_set_pref($1, true, true)`, [c.ann])
check(await as('ann', `select pinned, muted, hidden from crm_contact_prefs`), [{ pinned: true, muted: true, hidden: false }], 'Ann pins and mutes her chat')
check(await as('taa', `select count(*)::int as n from crm_contact_prefs`), [{ n: 0 }], 'her TA does not see Ann’s pins')
await denied('ben', `select public.crm_set_pref($1, true)`, [c.ann], 'a chat one cannot see is not pinned')
const labels = (await as('ann', `select public.crm_save_labels('[{"name":"Hot lead","color":"#BD4A19"},{"name":"VIP","color":"#A46312"}]')`))[0].crm_save_labels
check(labels.map(l => l.name), ['Hot lead', 'VIP'], 'labels save in order')
await as('ann', `select public.crm_set_label($1, $2, true)`, [c.ann, labels[0].id])
check(await as('ann', `select count(*)::int as n from crm_contact_labels`), [{ n: 1 }], 'a label goes on a customer')
await denied('ben', `select public.crm_set_label($1, $2, true)`, [c.ben, labels[0].id], 'someone else’s label is not theirs to use')
await refused('ann', `select public.crm_save_labels('[{"name":"VIP","color":"#A46312"},{"name":"vip","color":"#387557"}]')`, [], /duplicate|unique/, 'two labels of one name are refused')
const kept = (await as('ann', `select public.crm_save_labels($1)`, [JSON.stringify([labels[1]])]))[0].crm_save_labels
check(kept.map(l => l.name), ['VIP'], 'a label left out is deleted')
check(await as('ann', `select count(*)::int as n from crm_contact_labels`), [{ n: 0 }], '…and comes off every customer')
const qr = (await as('ann', `select public.crm_save_quick_replies('[{"shortcut":"Price","message":"Our prices depend on size."},{"shortcut":"","message":"half typed"}]')`))[0].crm_save_quick_replies
check(qr.map(r => r.shortcut), ['Price'], 'quick replies save; a half-typed row is not kept')
await as('ann', `select public.crm_save_auto_replies('{"welcome":{"on":true,"text":"Hi!"}}')`)
check(await as('ann', `select settings->'welcome'->>'text' as t from crm_auto_replies`), [{ t: 'Hi!' }], 'auto-reply settings save')

// 5. Share and Move.
await refused('ann', `select public.crm_invite('share', $1, $2)`, [c.ann, id('s', 'ben')], /own team/, 'a share stays inside one’s own team')
const share = (await as('ann', `select public.crm_invite('share', $1, $2)`, [c.ann, id('s', 'amir')]))[0].crm_invite
check(await as('amir', `select count(*)::int as n from crm_contacts where id = $1`, [c.ann]), [{ n: 0 }], 'before accepting, Amir does not see Ann’s customer')
check((await as('amir', `select contact_name, state from crm_invites`)).map(r => [r.contact_name, r.state]), [['Mr. Lim', 'pending']], 'Amir sees the invitation and the customer’s name')
await denied('ben', `select public.crm_answer_invite($1, true)`, [share.id], 'only the invitee answers')
await as('amir', `select public.crm_answer_invite($1, true)`, [share.id])
check(await as('amir', `select count(*)::int as n from crm_contacts where id = $1`, [c.ann]), [{ n: 1 }], 'after accepting, Amir reads Ann’s customer')
check((await as('amir', `select public.crm_can_reply($1) as ok`, [c.ann]))[0].ok, true, '…and may reply')
await refused('amir', `select public.crm_answer_invite($1, true)`, [share.id], /already answered/, 'an answered invitation stays answered')
check((await q(`select kind from crm_events where contact_id = $1 order by id`, [c.ann])).map(r => r.kind), ['won', 'shared'], 'the share is an event')
await refused('ann', `select public.crm_invite('move', $1, $2)`, [c.ann, id('s', 'tla')], /direct superior/, 'a move goes to the direct superior only')
const move = (await as('ben', `select public.crm_invite('move', $1, $2)`, [c.ben, id('s', 'tlb')]))[0].crm_invite
check((await row(`select assigned_to = $2 as still from crm_contacts where id = $1`, [c.ben, id('s', 'ben')])).still, true, 'nothing moves before the TL accepts')
await as('tlb', `select public.crm_answer_invite($1, true)`, [move.id])
check((await row(`select assigned_to = $2 as moved from crm_contacts where id = $1`, [c.ben, id('s', 'tlb')])).moved, true, 'accepted: the customer is the TL’s')

// 6. Replies with a quote, and reactions.
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, sent_at) values ($1, 'wamid.in1', 'in', 'text', 'Price?', now())`, [c.ann])
const inMsg = (await row(`select id from crm_messages where external_id = 'wamid.in1'`)).id
const out = (await as('ann', `select public.crm_record_out($1, 'wamid.out1', 'text', 'RM 3,200', $2)`, [c.ann, inMsg]))[0].crm_record_out
check(out.reply_to, inMsg, 'a reply keeps the quoted message')
await refused('ann', `select public.crm_record_out($1, 'wamid.out2', 'text', 'x', $2)`, [c.amir, inMsg], /not in this chat|may not/, 'a quote from another chat is refused')
await as('ann', `select public.crm_set_reaction($1, '👍')`, [inMsg])
check((await row(`select my_reaction from crm_messages where id = $1`, [inMsg])).my_reaction, '👍', 'our reaction is kept')
await denied('ben', `select public.crm_set_reaction($1, '❤️')`, [inMsg], 'another team may not react')
await as('ann', `select public.crm_hide_message($1)`, [inMsg])
check(await as('ann', `select count(*)::int as n from crm_message_hides`), [{ n: 1 }], 'delete for me hides it for Ann only')

// 7. Notifications: last read.
await as('ann', `select public.crm_seen_notifications()`)
check(await as('ann', `select (notifs_seen_at is not null) as seen from crm_staff_prefs`), [{ seen: true }], 'opening notifications is remembered')

console.log(`crm redesign: ${checks} checks passed`)
