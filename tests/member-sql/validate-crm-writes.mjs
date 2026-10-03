// Local PostgreSQL regression for the CRM's writes (2026-10-03). Every CRM
// migration runs VERBATIM; under test is that each write does what it says
// and only for whoever may do it. No live I/O.
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
  `insert into crm_contacts (channel, account_id, external_id, name, assigned_to, team_id, unread) values ('whatsapp', 'PN1', $1, $1, $2, $3, 2) returning id`,
  [name, assigned ? id('s', assigned) : null, team ? id('s', team) : null]))[0].id
const c = { ann: await contact('c-ann', 'ann', 'tla'), ben: await contact('c-ben', 'ben', 'tlb'), waitA: await contact('c-wait', null, 'tla'), none: await contact('c-none', null, null) }

const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const denied = async (who, sql, params, what) => { await assert.rejects(() => as(who, sql, params), /may not|permission denied/, what); checks++ }
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const row = async (sql, params) => (await q(sql, params))[0]

// 1. Read: only the customer's own person clears the unread count.
await as('tla', `select public.crm_mark_read($1)`, [c.ann])
check((await row(`select unread from crm_contacts where id = $1`, [c.ann])).unread, 2, 'the TL looking in leaves Ann’s unread')
await as('ann', `select public.crm_mark_read($1)`, [c.ann])
check((await row(`select unread from crm_contacts where id = $1`, [c.ann])).unread, 0, 'Ann opening clears it')

// 2. Status: whoever may reply; Lost needs a reason, Other needs a note.
await as('taa', `select public.crm_set_status($1, 'lost', 'too_expensive')`, [c.ann])
check(await row(`select status, lost_reason from crm_contacts where id = $1`, [c.ann]), { status: 'lost', lost_reason: 'too_expensive' }, 'the TA marks Lost with a reason')
await as('ann', `select public.crm_set_status($1, 'won')`, [c.ann])
check(await row(`select status, lost_reason from crm_contacts where id = $1`, [c.ann]), { status: 'won', lost_reason: null }, 'Won clears the reason')
await refused('ann', `select public.crm_set_status($1, 'lost')`, [c.ann], /needs a reason/, 'Lost without a reason is refused')
await refused('ann', `select public.crm_set_status($1, 'lost', 'other', '  ')`, [c.ann], /Other/, 'Other without a note is refused')
await denied('hod', `select public.crm_set_status($1, 'won')`, [c.ann], 'the HOD reads, does not change')
await denied('tlb', `select public.crm_set_status($1, 'won')`, [c.ann], 'another TL may not')

// 3a. Showrooms: everyone in the CRM reads the list; the Boss / HOD add, rename, close; bookings take only an open one.
check((await as('ann', `select id, name, active from crm_showrooms`)).map(r => [r.id, r.name, r.active]), [['kl', 'Kuala Lumpur Showroom', true]], 'Kuala Lumpur is on the list for a salesperson')
check((await as(null, `select id from crm_showrooms`)).length, 0, 'nobody without a CRM role reads it')
await denied('ann', `select public.crm_save_showroom(null, 'Penang Showroom')`, [], 'a salesperson does not add showrooms')
await denied('tla', `select public.crm_save_showroom(null, 'Penang Showroom')`, [], 'nor does a TL')
const pg = (await as('hod', `select public.crm_save_showroom(null, ' Penang Showroom ') as r`))[0].r
check([pg.name, pg.active, pg.sort_order], ['Penang Showroom', true, 2], 'the HOD adds Penang, next in the list')
await refused('boss', `select public.crm_save_showroom(null, 'penang showroom')`, [], /already a showroom/, 'no second showroom of the same name')
await refused('ann', `select public.crm_book($1, 'Nowhere', now(), 60)`, [c.ann], /showroom that is open/, 'a showroom not on the list is refused')

// 3. Appointments: book (→ Appointment), move, came / cancel (→ Follow up when none stands).
const appt = (await as('ann', `select public.crm_book($1, 'kl', '2026-10-10T03:00:00Z', 60) as a`, [c.ann]))[0].a
check((await row(`select status from crm_contacts where id = $1`, [c.ann])).status, 'appointment', 'booking makes the customer Appointment')
await as('ann', `select public.crm_move_appointment($1, '2026-10-11T03:00:00Z', $2)`, [appt.id, pg.id])
check(await row(`select showroom, to_char(start_at at time zone 'UTC', 'MM-DD') as day from crm_appointments where id = $1`, [appt.id]), { showroom: pg.id, day: '10-11' }, 'moved')
await as('boss', `select public.crm_save_showroom($1, 'Penang Showroom', false)`, [pg.id])
await as('ann', `select public.crm_move_appointment($1, '2026-10-12T03:00:00Z', $2)`, [appt.id, pg.id])
check((await row(`select to_char(start_at at time zone 'UTC', 'MM-DD') as day from crm_appointments where id = $1`, [appt.id])).day, '10-12', 'a booking at a closed showroom may still change time')
await refused('ann', `select public.crm_book($1, $2, now(), 60)`, [c.ann, pg.id], /showroom that is open/, 'a closed showroom takes no new booking')
const cancelled = (await as('ann', `select public.crm_set_appointment_state($1, 'cancelled') as r`, [appt.id]))[0].r
check([cancelled.state, cancelled.contact_status], ['cancelled', 'follow_up'], 'cancelled → back to Follow up')
await refused('ann', `select public.crm_set_appointment_state($1, 'attended')`, [appt.id], /Only a booked/, 'a cancelled one cannot be marked came')
await denied('hod', `select public.crm_book($1, 'kl', now(), 60)`, [c.ann], 'the HOD does not book')
await denied('ben', `select public.crm_book($1, 'kl', now(), 60)`, [c.ann], 'a peer does not book')
const second = (await as('tla', `select public.crm_book($1, 'kl', now(), 60) as a`, [c.ann]))[0].a
check((await as('tla', `select public.crm_set_appointment_state($1, 'attended') as r`, [second.id]))[0].r.state, 'attended', 'the TL marks they came')

// 4. Assign: the team's TL, to someone in the team.
await as('tla', `select public.crm_assign_member($1, $2)`, [c.waitA, id('s', 'amir')])
check((await row(`select assigned_to from crm_contacts where id = $1`, [c.waitA])).assigned_to, id('s', 'amir'), 'TL A hands the waiting lead to Amir')
await refused('tla', `select public.crm_assign_member($1, $2)`, [c.waitA, id('s', 'ben')], /not in this team/, 'not to someone in another team')
await denied('taa', `select public.crm_assign_member($1, $2)`, [c.ann, id('s', 'amir')], 'a TA does not assign')
await denied('tlb', `select public.crm_assign_member($1, $2)`, [c.ann, id('s', 'ben')], 'another TL does not')
await denied('hod', `select public.crm_assign_member($1, $2)`, [c.ann, id('s', 'amir')], 'the HOD sends to a team instead')

// 5. Send to a team: the Boss and HOD; the team's own rules pick who (Tuesday-ish now: no ticked day → the TL's list).
const sent = (await as('hod', `select public.crm_send_to_team($1, $2) as r`, [c.none, id('s', 'tlb')]))[0].r
check(sent.team, id('s', 'tlb'), 'the HOD sends the unassigned lead to TL B')
check((await row(`select team_id from crm_contacts where id = $1`, [c.none])).team_id, id('s', 'tlb'), 'it is in team B now')
await denied('tla', `select public.crm_send_to_team($1, $2)`, [c.none, id('s', 'tla')], 'a TL does not send between teams')
await refused('hod', `select public.crm_send_to_team($1, $2)`, [c.none, id('s', 'ann')], /Choose a TL/, 'only to a TL')

// 6. Team settings: its TL, the Boss and HOD — never another TL; %s only for the team's people.
await as('tla', `select public.crm_save_team_settings($1, '{1,3}', false, $2)`, [id('s', 'tla'), JSON.stringify({ [id('s', 'ann')]: 60, [id('s', 'amir')]: 40 })])
check(await row(`select percent_days, weekend_full_time, edited_by from crm_team_settings where tl_id = $1`, [id('s', 'tla')]),
  { percent_days: [1, 3], weekend_full_time: false, edited_by: id('s', 'tla') }, 'TL A saves their days, switch and %s')
await as('hod', `select public.crm_save_team_settings($1, '{1,2,3,4}', true, '{}')`, [id('s', 'tla')])
check((await row(`select edited_by from crm_team_settings where tl_id = $1`, [id('s', 'tla')])).edited_by, id('s', 'hod'), 'the HOD can change it, and is named')
await denied('tlb', `select public.crm_save_team_settings($1, '{}', true, '{}')`, [id('s', 'tla')], 'TL B cannot touch team A')
await denied('taa', `select public.crm_save_team_settings($1, '{}', true, '{}')`, [id('s', 'tla')], 'a TA cannot either')
await refused('tla', `select public.crm_save_team_settings($1, '{5}', true, '{}')`, [id('s', 'tla')], /Monday to Thursday/, 'Friday is not a % day')
await refused('tla', `select public.crm_save_team_settings($1, '{}', true, $2)`, [id('s', 'tla'), JSON.stringify({ [id('s', 'ben')]: 10 })], /someone in this team/, 'no % for someone outside the team')

// 7. The split between teams and the ad rules: the Boss and HOD only.
await as('boss', `select public.crm_save_team_shares($1)`, [JSON.stringify({ [id('s', 'tla')]: 70, [id('s', 'tlb')]: 30 })])
check((await q(`select team_share from crm_team_settings order by team_share desc`)).map(r => r.team_share), [70, 30], 'the Boss splits 70 / 30')
await denied('tla', `select public.crm_save_team_shares($1)`, [JSON.stringify({ [id('s', 'tla')]: 100 })], 'a TL cannot give their team more')
await as('hod', `select public.crm_save_ad_rule('AD9', 'Sofa Clearance', array[$1::uuid])`, [id('s', 'tlb')])
check(await row(`select ad_label, tl_ids from crm_assign_rules where ad_source_id = 'AD9'`), { ad_label: 'Sofa Clearance', tl_ids: [id('s', 'tlb')] }, 'the HOD hands an ad to TL B')
await refused('hod', `select public.crm_save_ad_rule('AD9', null, array[$1::uuid])`, [id('s', 'ann')], /only be handed to TLs/, 'not to an RS')
await as('hod', `select public.crm_save_ad_rule('AD9', null, '{}')`)
check((await q(`select count(*)::int as n from crm_assign_rules`))[0].n, 0, 'no TLs left: the rule goes')
await denied('tla', `select public.crm_save_ad_rule('AD9', null, array[$1::uuid])`, [id('s', 'tla')], 'a TL cannot hand themselves an ad')

// 8. Full time: the HOD only, and only for an RS.
await as('hod', `select public.crm_set_full_time($1, true)`, [id('s', 'amir')])
check((await row(`select full_time from crm_staff where staff_id = $1`, [id('s', 'amir')])).full_time, true, 'the HOD makes Amir full time')
await denied('boss', `select public.crm_set_full_time($1, false)`, [id('s', 'amir')], 'not the Boss — the HOD decides (2026-10-02)')
await denied('tla', `select public.crm_set_full_time($1, false)`, [id('s', 'amir')], 'not the TL')
await refused('hod', `select public.crm_set_full_time($1, true)`, [id('s', 'taa')], /Only an RS/, 'a TA is not full time or part time')

// 9. Still no direct writes.
await denied('hod', `update crm_contacts set status = 'won'`, [], 'no direct update')
await denied('tla', `insert into crm_appointments (contact_id, showroom, start_at) values ('${c.ann}', 'x', now())`, [], 'no direct insert')

console.log(`crm writes: ${checks} checks passed`)
