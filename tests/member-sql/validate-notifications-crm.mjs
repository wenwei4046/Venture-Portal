// Local PostgreSQL regression for 20261014030000 (2026-10-14, the CRM tells a person's phone about their own chats —
// the user: "如果是分到你自己的（mine）… 我希望它是能够跳得出 notification … 被分到 appointment、收到 message、或者收到新的
// lead"). Every CRM migration runs VERBATIM (as the CRM's own checks load them), then the notifications migration
// (20261011180000) over stand-ins for the tables it hangs triggers on, then this one. What is under test: a customer's
// message tells whoever has the chat in Mine (given to them or shared with them) — not while muted, hidden or blocked,
// never a customer nobody has; a lead the CRM deals on arrival is "New lead · <name>" with the customer's words; a
// customer given by a person, a visit booked / moved / cancelled by somebody else, a reminder, an invitation and the
// answer to one each tell their one person; nobody hears what they did themselves; a person with no login or a
// switched-off one hears nothing; the bells never list these; the outbox hands the phone what it draws; a notice never
// stops the message it tells of. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const SECRET = 'the server holds this'

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
// The notifications migration hangs its triggers on these; nothing here writes them.
await db.exec(`
  create table public.hiring_requests (id text primary key, status text);
  create table public.meeting_room_bookings (id uuid primary key);
  create table public.member_requests (id uuid primary key, status text);
  create table public.permission_templates (id uuid primary key);
  create table public.permission_template_grants (template_id uuid);
  create table public.permission_template_tabs (template_id uuid);
  create table public.user_permission_cells (user_id uuid);
  create table public.user_permission_tabs (user_id uuid);
`)
for (const file of ['20261011180000_notifications.sql', '20261014030000_notifications_for_crm.sql']) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}
await q(`update push_config set outbox_secret_sha256 = $1`, [createHash('sha256').update(SECRET).digest('hex')])

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'ta', 'rs']) {
  await q(`insert into titles (id, name) values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD (PETER) → TL A (→ ANN, AMIR); NOEL sells with no login of his own.
for (const [who, role, upline, login] of [['BOSS', 'boss', null, true], ['PETER', 'hod', 'BOSS', true], ['TLA', 'tl', 'PETER', true],
  ['ANN', 'rs', 'TLA', true], ['AMIR', 'rs', 'TLA', true], ['NOEL', 'rs', 'TLA', false]]) {
  if (login) await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'BOSS' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, login ? id('u', who) : null, id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const U = who => id('u', who)
/** As somebody signed in (their login's session), then nobody again — a write must never inherit the last caller. */
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${U(who)}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
/** A write the database makes with somebody's session but past the row policies (a trigger's own context). */
const by = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? U(who) : ''}'`)
  try { return await q(sql, params) } finally { await db.exec(`set test.uid = ''`) }
}
const seen = new Set()
/** The CRM notices that reached `who` since the last look. */
const fresh = async who => {
  // One delivery's notices share a transaction's now(): their own moments order them.
  const rows = await q(`select id, title, body, ref_kind, ref_id, data from app_notifications where user_id = $1 and kind = 'crm'
                         order by created_at, (data ->> 'at')::timestamptz, id`, [U(who)])
  return rows.filter(r => !seen.has(r.id)).map(r => { seen.add(r.id); return { title: r.title, body: r.body, ref: r.ref_kind, refId: r.ref_id, line: r.data?.line, ch: r.data?.ch, name: r.data?.name } })
}
const quiet = async (who, what) => check(await fresh(who), [], what)
let wamid = 0
const whatsapp = (waId, name, kind, body, ad = null) => {
  const sentAt = new Date(Date.UTC(2030, 0, 7, 2, 0, ++wamid)).toISOString()
  whatsapp.lastSent = sentAt
  return { externalId: `wamid.${wamid}`, phoneNumberId: 'PN1', waId, name, kind, body, mediaId: kind === 'text' ? null : `m${wamid}`, mediaMime: null, sentAt, ad }
}
const ingest = async (...messages) => q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb) as r`, [JSON.stringify(messages)])
const contactOf = async waId => (await q(`select id from crm_contacts where external_id = $1`, [waId]))[0].id

// ── 1. A lead the CRM deals on arrival: the person it went to, with the customer's words ──
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', '帅哥'))
const chris = await contactOf('60111')
check((await q(`select assigned_to from crm_contacts where id = $1`, [chris]))[0].assigned_to, S('PETER'), 'no ad: dealt to the Revenue Director')
check(await fresh('PETER'), [{ title: 'New lead · Chrisss ❤️', body: '帅哥', ref: 'crm_contact', refId: chris, line: 'New lead · 帅哥', ch: 'whatsapp', name: 'Chrisss ❤️' }],
  'the Director hears of the new lead with the customer’s first words')
for (const who of ['BOSS', 'TLA', 'ANN']) await quiet(who, `${who} hears nothing of a lead that is not theirs`)
check((await q(`select (data ->> 'at')::timestamptz = $2::timestamptz as same from app_notifications where user_id = $1 and kind = 'crm'`, [U('PETER'), whatsapp.lastSent]))[0].same, true,
  'the lead’s moment is the customer’s message’s, so the chat’s next lines order after it')

// ── 2. Their customer's messages, named as the inbox names them ──
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', '爱我吗\n\n*really*'))
check(await fresh('PETER'), [{ title: 'Chrisss ❤️', body: '爱我吗 really', ref: 'crm_contact', refId: chris, line: '爱我吗 really', ch: 'whatsapp', name: 'Chrisss ❤️' }],
  'a message: the customer’s name and their words (one line, the bold marks gone)')
await ingest(whatsapp('60111', 'Chrisss ❤️', 'image', 'This colour?'), whatsapp('60111', 'Chrisss ❤️', 'audio', null), whatsapp('60111', 'Chrisss ❤️', 'document', null))
check((await fresh('PETER')).map(n => n.body), ['📷 Photo · This colour?', '🎤 Voice message', '📄 Document'], 'a photo with its caption, a voice note, a file')
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, sent_by) values ($1, 'out1', 'out', 'text', 'Hello!', $2)`, [chris, S('PETER')])
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, auto) values ($1, 'out2', 'out', 'text', 'Welcome', true)`, [chris])
await quiet('PETER', 'our own replies and auto-replies tell nobody')

// ── 3. Muted, hidden or blocked: not on their phone ──
for (const pref of ['muted', 'hidden', 'blocked']) {
  await q(`insert into crm_contact_prefs (staff_id, contact_id, ${pref}) values ($1, $2, true)
           on conflict (staff_id, contact_id) do update set muted = excluded.muted, hidden = excluded.hidden, blocked = excluded.blocked`, [S('PETER'), chris])
  await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', `while ${pref}`))
  await quiet('PETER', `a ${pref} chat stays off the phone`)
}
await q(`update crm_contact_prefs set muted = false, hidden = false, blocked = false where staff_id = $1 and contact_id = $2`, [S('PETER'), chris])

// ── 4. Given to somebody by a person: they hear who gave it; the giver and the one before hear nothing ──
await as('BOSS', `select public.crm_send_to($1, $2)`, [chris, S('ANN')])
check(await fresh('ANN'), [{ title: 'Chrisss ❤️', body: 'BOSS assigned this customer to you', ref: 'crm_contact', refId: chris, line: 'BOSS assigned this customer to you', ch: 'whatsapp', name: 'Chrisss ❤️' }],
  'Ann hears the Boss gave her the customer — once, not again for the manager’s move')
await quiet('BOSS', 'never the one who did it')
await quiet('PETER', 'the Director it was taken from hears nothing')
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', 'still there?'))
check((await fresh('ANN')).map(n => n.body), ['still there?'], 'the customer’s messages now reach Ann')
await quiet('PETER', '…and no longer the Director')

// ── 5. A visit for her customer: by somebody else she hears it; by herself, nothing ──
await q(`insert into crm_showrooms (id, name, active, sort_order) values ('pj', 'Petaling Jaya', true, 9)`)
const visit = (await by('BOSS', `insert into crm_appointments (contact_id, showroom, start_at) values ($1, 'pj', '2030-01-12 14:00+08') returning id`, [chris]))[0].id
check((await fresh('ANN')).map(n => [n.title, n.body]), [['Chrisss ❤️', 'BOSS booked a visit · Sat 12 Jan, 2:00 pm · Petaling Jaya']], 'booked for her: when (the office’s clock) and where, by whom')
await by('BOSS', `update crm_appointments set start_at = '2030-01-12 16:30+08' where id = $1`, [visit])
await by('BOSS', `update crm_appointments set state = 'cancelled' where id = $1`, [visit])
check((await fresh('ANN')).map(n => n.body), ['BOSS moved the visit to Sat 12 Jan, 4:30 pm · Petaling Jaya', 'BOSS cancelled the visit · Sat 12 Jan, 4:30 pm'], 'moved, then cancelled')
await by('ANN', `insert into crm_appointments (contact_id, showroom, start_at) values ($1, 'pj', '2030-01-13 11:00+08')`, [chris])
await quiet('ANN', 'a visit she booked herself tells her nothing')
await quiet('BOSS', 'nor the Boss, whose customer it is not')

// ── 6. A reminder from the Control panel ──
await as('BOSS', `select public.crm_remind($1)`, [chris])
check((await fresh('ANN')).map(n => n.body), ['BOSS reminded you to reply'], 'the reminder reaches her phone')

// ── 7. An invitation, and the answer to it ──
await as('ANN', `select public.crm_invite('share', $1, $2)`, [chris, S('AMIR')])
const invite = (await q(`select id from crm_invites where contact_id = $1 and to_staff = $2`, [chris, S('AMIR')]))[0].id
check(await fresh('AMIR'), [{ title: 'ANN invited you to a chat', body: 'Chrisss ❤️', ref: 'crm_invite', refId: `i${invite}`, line: 'ANN invited you to a chat', ch: 'whatsapp', name: 'Chrisss ❤️' }],
  'Amir is asked into the chat')
await as('ANN', `select public.crm_invite('share', $1, $2)`, [chris, S('AMIR')])
check((await fresh('AMIR')).map(n => n.title), ['ANN invited you to a chat'], 'asked again: told again')
await as('AMIR', `select public.crm_answer_invite($1, true)`, [invite])
check((await fresh('ANN')).map(n => [n.title, n.body, n.ref]), [['AMIR accepted your share invite', 'Chrisss ❤️', 'crm_invite']], 'Ann hears he accepted')
await quiet('AMIR', 'not the one who answered')
await ingest(whatsapp('60111', 'Chrisss ❤️', 'sticker', null))
check([(await fresh('ANN')).map(n => n.body), (await fresh('AMIR')).map(n => n.body)], [['Sticker'], ['Sticker']], 'a shared chat: both who have it in Mine')

// ── 8. Nobody to tell: no login, a switched-off login, a customer nobody has ──
await as('BOSS', `select public.crm_send_to($1, $2)`, [chris, S('NOEL')])
check(await q(`select count(*)::int as n from app_notifications where kind = 'crm' and user_id is null`), [{ n: 0 }], 'Noel has no login: nothing is written for him')
await as('BOSS', `select public.crm_send_to($1, $2)`, [chris, S('ANN')])
await fresh('ANN')
await q(`update users set is_active = false where id = $1`, [U('ANN')])
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', 'hello?'))
await quiet('ANN', 'a switched-off login hears nothing')
await q(`update users set is_active = true where id = $1`, [U('ANN')])
await fresh('AMIR')
await q(`update crm_contacts set assigned_to = null where id = $1`, [chris])
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', 'anyone?'))
check(await fresh('AMIR'), [], 'a customer nobody has in Mine tells nobody, not even the one it was shared with')

// ── 9. The bells never list them; the outbox hands the phone what it draws ──
const bell = (await as('ANN', `select public.notifications_mine() as r`))[0].r
check([bell.unread, bell.items.length], [0, 0], 'Ann’s bell: none of the CRM’s notices')
await q(`insert into app_notifications (user_id, kind, title, body, ref_kind, ref_id) values ($1, 'rooms', 'Grace booked a room for you', '', 'booking', 'b1')`, [U('ANN')])
const bell2 = (await as('ANN', `select public.notifications_mine() as r`))[0].r
check([bell2.unread, bell2.items.map(i => i.title)], [1, ['Grace booked a room for you']], '…while the rest stay')
await q(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, app) values ($1, 'https://fcm.googleapis.com/x', $2, 'AAAAAAAAAAAAAAAAAAAAAA', 'revenue')`,
  [U('PETER'), 'B'.repeat(87)])
const due = (await q(`select public.push_outbox_take($1, 200) as r`, [SECRET]))[0].r.filter(n => n.kind === 'crm' && n.subs.length)
check(due[0].data.line, 'New lead · 帅哥', 'the outbox hands the push what the phone draws')
check([due[0].refKind, due[0].refId, due[0].data.ch, due[0].data.name, typeof due[0].data.at], ['crm_contact', chris, 'whatsapp', 'Chrisss ❤️', 'string'], '…the chat it opens, the channel, the name, the time')

// ── 10. A notice never stops the message it tells of ──
await q(`update crm_contacts set assigned_to = $2 where id = $1`, [chris, S('ANN')])
await db.exec(`alter table app_notifications rename to app_notifications_away`)
await ingest(whatsapp('60111', 'Chrisss ❤️', 'text', 'kept anyway'))
await db.exec(`alter table app_notifications_away rename to app_notifications`)
check((await q(`select body from crm_messages where contact_id = $1 order by sent_at desc limit 1`, [chris]))[0].body, 'kept anyway', 'the message is kept though its notice failed')

// ── 11. The helpers are the triggers' own ──
for (const fn of ['notify_crm_people(uuid[], text, text, text, text, jsonb)', 'notify_crm_logins(uuid[])', 'notify_crm_preview(text, text)', 'notify_crm_name(text, text)',
  'notify_crm_message()', 'notify_crm_event()', 'notify_crm_invite()']) {
  check((await q(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') as a, has_function_privilege('anon', 'public.${fn}', 'execute') as b`))[0],
    { a: false, b: false }, `${fn} is not the browser’s`)
}

console.log(`notifications for the crm: ${checks} checks passed`)
