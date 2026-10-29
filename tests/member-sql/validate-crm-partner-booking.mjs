// Local PostgreSQL regression for 20261029190000 (2026-10-29, the owner: a booking link for The Conts' own salespeople —
// no sign-in, the CRM's showrooms and slots, "2 个 slot 满了之后，crm 也无法再预约"). Every CRM migration runs VERBATIM. What
// is under test: the link answers only its own code while on; a booking takes its slot and the CRM's limit counts it both
// ways (crm_slot_check, crm_slot_counts); the booker changes or cancels by the reference; the publishable key reaches only
// the five page functions; CRM · Manage turns the link on, gives it a new address and cancels a booking. No live I/O.
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
check(files.includes('20261013220000_crm_closures_both_ways.sql') || files.length > 20, true, 'the CRM migrations load')
for (const file of files) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
// A showroom kept for its past visits' names (mig 20261024150000, not among the loaded ones), then this migration.
await db.exec(`alter table crm_showrooms add column if not exists deleted_at timestamptz`)
await db.exec((await readFile(new URL('20261029190000_crm_partner_booking.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))

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
const U = who => id('u', who)
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${U(who)}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const anon = async (sql, params = []) => { await db.exec(`set role anon`); try { return await q(sql, params) } finally { await db.exec(`reset role`) } }

// A showroom open every day at 11:00 and 14:00, two a slot.
await q(`insert into crm_showrooms (id, name, active, sort_order, slots, cap, weekly, blocks) values ('kl', 'KL Showroom', true, 1, '{11:00,14:00}', 2, '{}', '[]')
         on conflict (id) do update set slots = excluded.slots, cap = excluded.cap, weekly = excluded.weekly, blocks = excluded.blocks, active = true`)
const day = new Date(Date.now() + 3 * 86400000)
const ymd = new Date(day.getTime() + 8 * 3600000).toISOString().slice(0, 10)
const at = hm => `${ymd}T${hm}:00+08:00`

// ── 1. The link: off at first, opens only its own code ──
const code = (await q(`select code from crm_partner_links where id = 'the_conts'`))[0].code
check(/^pc-[A-HJ-NP-Z2-9]{8}$/.test(code), true, 'The Conts has a code of 8 letters and digits')
check((await anon(`select crm_partner_page($1) as r`, [code]))[0].r, { on: false }, 'off at first: the page is closed')
await as('PETER', `select crm_partner_link_set('the_conts', true, false)`)
const page = (await anon(`select crm_partner_page($1) as r`, [code]))[0].r
check([page.on, page.name, page.rooms.map(r => r.id)], [true, 'The Conts', ['kl']], 'on: the partner and the open showrooms')
check((await anon(`select crm_partner_page('pc-AAAAAAAA') as r`))[0].r, { on: false }, 'a wrong code: closed')
await assert.rejects(as('ANN', `select crm_partner_link_set('the_conts', false, false)`), /may not/i, 'a salesperson cannot change the link'); checks++

// ── 2. Booking through the link takes the CRM's slot ──
const book = (ref, start, extra = {}) => anon(`select crm_partner_book($1, $2, 'kl', $3::timestamptz, $4, '012', $5, $6, $7::jsonb, 'Bring keys', 'Hot lead') as r`,
  [code, ref, start, extra.booker ?? 'Jason (Conts)', extra.customer ?? 'Mr Lim', extra.phone ?? '012-3456789', JSON.stringify(extra.info ?? { project: 'Setia Sky', evil: 'x' })]).then(r => r[0].r)
const b1 = await book(null, at('11:00'))
check(/^TC-[A-HJ-NP-Z2-9]{6}$/.test(b1.ref), true, 'a reference TC-XXXXXX')
check([b1.showroomName, b1.customer, b1.info, b1.remarks, b1.note], ['Kuala Lumpur Showroom', 'Mr Lim', { project: 'Setia Sky' }, 'Bring keys', 'Hot lead'], 'kept as sent, unknown info keys left out')
check(await as('ANN', `select count(*)::int as n from crm_partner_bookings`), [{ n: 1 }], 'anybody in the CRM reads it (the calendar)')
check(await as('ZED', `select count(*)::int as n from crm_partner_bookings`), [{ n: 0 }], 'no CRM · View: nothing')
check((await as('ANN', `select booked from crm_slot_counts('kl', $1::timestamptz, $2::timestamptz)`, [at('00:00'), at('23:59')])).map(r => r.booked), [1], 'the CRM counts it in the slot')
await book(null, at('11:00'), { customer: 'Ms Tan' })
await assert.rejects(book(null, at('11:00'), { customer: 'Third' }), /full/, 'two in the slot: the link is refused a third'); checks++
await assert.rejects(q(`select crm_slot_check('kl', $1::timestamptz)`, [at('11:00')]), /full/, '…and so is the CRM (crm_slot_check counts both)'); checks++
check((await anon(`select crm_partner_day($1, 'kl', $2::date, 7) as r`, [code, ymd]))[0].r.map(x => x.booked), [2], 'the page reads the counts only')
await assert.rejects(book(null, at('12:00')), /does not take bookings/, 'a time the showroom does not offer'); checks++
await assert.rejects(book(null, new Date(Date.now() - 3600000).toISOString()), /still to come/, 'a time gone by'); checks++
await assert.rejects(book(null, at('14:00'), { phone: 'abc' }), /phone/, "the customer's phone is required"); checks++

// ── 3. The booker changes and cancels by the reference ──
const moved = await book(b1.ref, at('14:00'))
check([moved.ref, new Date(moved.start).toISOString()], [b1.ref, new Date(at('14:00')).toISOString()], 'moved to 14:00, same reference')
check((await anon(`select crm_partner_get($1, $2) as r`, [code, b1.ref.toLowerCase()]))[0].r.ref, b1.ref, 'found by its reference, any case')
await assert.rejects(anon(`select crm_partner_get($1, 'TC-ZZZZZZ')`, [code]), /No booking/, 'a wrong reference'); checks++
check((await anon(`select crm_partner_cancel($1, $2) as r`, [code, b1.ref]))[0].r.state, 'cancelled', 'cancelled through the link')
check(await q(`select count(*)::int as n from crm_partner_bookings where state = 'booked' and start_at = $1::timestamptz`, [at('14:00')]), [{ n: 0 }], 'its slot is free again')

// ── 4. The CRM's side ──
const other = (await q(`select id from crm_partner_bookings where state = 'booked' limit 1`))[0].id
await assert.rejects(as('ANN', `select crm_partner_booking_cancel($1)`, [other]), /may not/i, 'a salesperson cannot cancel it'); checks++
await as('PETER', `select crm_partner_booking_cancel($1)`, [other])
check((await q(`select state, cancelled_by from crm_partner_bookings where id = $1`, [other]))[0], { state: 'cancelled', cancelled_by: 'crm' }, 'CRM · Manage cancels one')
check((await as('ANN', `select crm_partner_links_read() as r`))[0].r, [], 'the link and its code: not for a salesperson')
check((await as('PETER', `select crm_partner_links_read() as r`))[0].r.map(l => [l.id, l.on]), [['the_conts', true]], '…CRM · Manage reads them')
await db.exec(`set test.uid = '${U('ANN')}'; set role authenticated`)
await assert.rejects(db.query(`select * from crm_partner_links`), /permission denied/, 'nobody reads the table itself'); checks++
await db.exec(`reset role; set test.uid = ''`)
const fresh = (await as('PETER', `select crm_partner_link_set('the_conts', null, true) as r`))[0].r
check(fresh.code !== code && fresh.on, true, 'a new address, still on')
check((await anon(`select crm_partner_page($1) as r`, [code]))[0].r, { on: false }, 'the old address stops opening')
await as('PETER', `select crm_partner_link_set('the_conts', false, false)`)
await assert.rejects(anon(`select crm_partner_book($1, null, 'kl', $2::timestamptz, 'x', '', 'y', '0123456', '{}', '', '')`, [fresh.code, at('14:00')]), /closed/, 'off: no booking'); checks++

// ── 5. What the publishable key reaches ──
await db.exec(`set role anon`)
await assert.rejects(db.query(`select * from crm_partner_bookings`), /permission denied/, 'anon reads no table'); checks++
await assert.rejects(db.query(`select crm_partner_link_set('the_conts', true, true)`), /permission denied/, "nor the CRM's functions"); checks++
await assert.rejects(db.query(`select crm_slot_check('kl', now())`), /permission denied/, 'nor the slot check'); checks++
await assert.rejects(db.query(`select crm_partner_of('x')`), /permission denied/, 'nor the helpers'); checks++
await db.exec(`reset role`)

console.log(`crm partner booking: ${checks} checks passed`)
