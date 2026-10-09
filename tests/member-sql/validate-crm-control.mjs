// Local PostgreSQL regression for the Control panel's dealing rules (2026-10-09,
// mig 20261009180000). Every CRM migration runs VERBATIM; under test: Organic
// Leads, Evenly, By team %, By people (maximum / %), full-time days, the
// Principal / Director sending and undoing, and who may answer. No live I/O.
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

// 1. No rule → Organic Leads.
check(await arrive('AD-NONE'), { assigned_to: null, team_id: null }, 'an ad nobody set waits in Organic Leads')
check(await arrive(null), { assigned_to: null, team_id: null }, 'an enquiry from no ad waits in Organic Leads')

// 2. Evenly: everyone in the teams in turn.
await refused('ann', `select public.crm_save_ad_assign('AD-E', 'Even ad', 'even', '{}', 'cnt', '{}')`, [], /may not/, 'a salesperson may not assign ads')
await as('boss', `select public.crm_save_ad_assign('AD-E', 'Even ad', 'even', '{}', 'cnt', '{}')`)
const even = []
for (let i = 0; i < 5; i++) even.push(name((await arrive('AD-E')).assigned_to))
check([...even].sort(), ['amir', 'ann', 'ben', 'tla', 'tlb'], 'Evenly: five leads, one each to the five people in the teams')

// 3. By team %: 100% to Team B; inside it, everyone in turn.
await refused('boss', `select public.crm_save_ad_assign('AD-S', 'Split', 'split', $1, 'cnt', '{}')`, [JSON.stringify({ [S('tla')]: 60, [S('tlb')]: 30 })], /add up to 100/, 'team % must add up to 100')
await as('boss', `select public.crm_save_ad_assign('AD-S', 'Split', 'split', $1, 'cnt', '{}')`, [JSON.stringify({ [S('tla')]: 50, [S('tlb')]: 50 })])
const split = []
for (let i = 0; i < 4; i++) split.push(name((await arrive('AD-S')).team_id))
check(split.sort(), ['tla', 'tla', 'tlb', 'tlb'], 'By team 50/50: two leads each')

// 4. By people, maximum: Ann 1, Ben 2 — then Organic Leads.
await as('hod', `select public.crm_save_ad_assign('AD-P', 'People', 'people', '{}', 'cnt', $1)`, [JSON.stringify({ [S('ann')]: 1, [S('ben')]: 2 })])
const ppl = []
for (let i = 0; i < 4; i++) ppl.push(name((await arrive('AD-P')).assigned_to))
check(ppl, ['ann', 'ben', 'ben', null], 'By people, max: Ann 1, Ben 2, then Organic Leads')

// 5. By people, %: 75 / 25 over four leads.
await as('hod', `select public.crm_save_ad_assign('AD-Q', 'Pct', 'people', '{}', 'pct', $1)`, [JSON.stringify({ [S('amir')]: 75, [S('ben')]: 25 })])
const pct = []
for (let i = 0; i < 4; i++) pct.push(name((await arrive('AD-Q')).assigned_to))
check(pct.filter(x => x === 'amir').length, 3, 'By %: Amir takes three of four at 75%')

// 6. Full time first on the chosen days.
await q(`insert into crm_staff (staff_id, full_time) values ($1, true)`, [S('amir')])
const today = (Number((await q(`select extract(isodow from now() at time zone 'Asia/Kuala_Lumpur')::int as d`))[0].d) + 6) % 7
await as('hod', `select public.crm_save_fulltime($1, 'cnt', $2, $3)`, [S('tla'), `{${today}}`, JSON.stringify({ [S('amir')]: { [today]: 2 } })])
await as('boss', `select public.crm_save_ad_assign('AD-F', 'Full', 'split', $1, 'cnt', '{}')`, [JSON.stringify({ [S('tla')]: 100 })])
const ft = []
for (let i = 0; i < 4; i++) ft.push(name((await arrive('AD-F')).assigned_to))
check(ft.slice(0, 1), ['amir'], 'on a full-time day Amir (full time, max 2 today) takes the first lead')
check(ft.filter(x => x === 'amir').length >= 2, true, 'Amir takes his two')

// 7. The Principal sends an Organic Lead, and undoes it.
const organic = (await q(`select id from crm_contacts where ad_source_id = 'AD-NONE'`))[0].id
await refused('tla', `select public.crm_send_to($1, $2)`, [organic, S('ann')], /may not/, 'a TL may not send an Organic Lead')
await as('boss', `select public.crm_send_to($1, $2)`, [organic, S('ann')])
check(name((await q(`select assigned_to from crm_contacts where id = $1`, [organic]))[0].assigned_to), 'ann', 'sent to Ann')
check(name((await q(`select team_id from crm_contacts where id = $1`, [organic]))[0].team_id), 'tla', '…in her team')
await as('boss', `select public.crm_send_to($1, null)`, [organic])
check((await q(`select assigned_to, team_id from crm_contacts where id = $1`, [organic]))[0], { assigned_to: null, team_id: null }, 'Undo: back to Organic Leads')
await refused('boss', `select public.crm_send_to($1, $2)`, [organic, S('boss')], /takes enquiries/, 'the Principal takes no enquiries')

// 8. The Principal and the Director may answer anyone; a salesperson only their own line.
const bens = (await q(`select id from crm_contacts where assigned_to = $1 limit 1`, [S('ben')]))[0].id
check((await as('boss', `select public.crm_can_reply($1) as ok`, [bens]))[0].ok, true, 'the Principal may answer Ben’s customer')
check((await as('hod', `select public.crm_can_reply($1) as ok`, [bens]))[0].ok, true, 'the Director may too')
check((await as('ann', `select public.crm_can_reply($1) as ok`, [bens]))[0].ok, false, 'Ann may not')
// Assigned (user 2026-10-09): when and by whom, behind the salesperson's "new enquiry for you".
{
  await db.exec(`set test.uid = ''`) // the ingest: no session
  const dealt = (await q(`insert into crm_contacts (channel, account_id, external_id, name, assigned_to) values ('whatsapp', 'PN1', 'dealt-1', 'Dealt', $1)
    returning assigned_at is not null as stamped, assigned_by`, [S('ann')]))[0]
  check(dealt, { stamped: true, assigned_by: null }, 'a customer the CRM dealt is stamped with the time and no one')
  const c = (await q(`select id from crm_contacts where external_id = 'dealt-1'`))[0].id
  await as('boss', `select public.crm_send_to($1, $2)`, [c, S('ben')])
  check((await q(`select assigned_to, assigned_by from crm_contacts where id = $1`, [c]))[0], { assigned_to: S('ben'), assigned_by: S('boss') }, 'sent by the Principal: stamped with the Principal')
  await q(`update crm_contacts set unread = 1 where id = $1`, [c])
  check((await q(`select assigned_by from crm_contacts where id = $1`, [c]))[0].assigned_by, S('boss'), 'another change leaves the stamp')
}
// The Principal in Ben's chat: Move hands it to Ben's superior (they have none of their own); Share to anyone.
{
  const mv = (await as('boss', `select public.crm_invite('move', $1, $2) as r`, [bens, S('tlb')]))[0].r
  check([mv.from_staff, mv.to_staff, mv.state], [S('boss'), S('tlb'), 'pending'], 'the Principal moves Ben’s customer to Ben’s TL')
  await refused('boss', `select public.crm_invite('move', $1, $2)`, [bens, S('tla')], /direct superior/, 'not to someone else’s TL')
  const sh = (await as('boss', `select public.crm_invite('share', $1, $2) as r`, [bens, S('ann')]))[0].r
  check(sh.to_staff, S('ann'), 'the Principal shares Ben’s chat with Ann (another team)')
  await refused('tla', `select public.crm_invite('move', $1, $2)`, [bens, S('hod')], /may not|pass on/, 'a TL of another team may not move Ben’s customer')
}
// Unread (user 2026-10-09, choice B): a manager looking in leaves it; a reply from anyone clears it.
await q(`update crm_contacts set unread = 5 where id = $1`, [bens])
await as('boss', `select public.crm_mark_read($1)`, [bens])
check((await q(`select unread from crm_contacts where id = $1`, [bens]))[0].unread, 5, 'the Principal opening Ben’s chat leaves Ben’s unread')
await as('boss', `select public.crm_record_out($1, 'wamid.boss-1', 'text', 'On my way')`, [bens])
check((await q(`select unread from crm_contacts where id = $1`, [bens]))[0].unread, 0, 'the Principal answering it clears it')

// 9. Notifications read one by one, and all at once.
await as('boss', `select public.crm_read_notifs('{e1,e2}')`)
check(await as('boss', `select notif_read from crm_staff_prefs`), [{ notif_read: ['e1', 'e2'] }], 'two notifications read')
await as('boss', `select public.crm_read_notifs('{}', true)`)
check(await as('boss', `select notif_read, notifs_seen_at is not null as seen from crm_staff_prefs`), [{ notif_read: [], seen: true }], 'Mark all read')

// 10. crm_people() hands over each person's title from People (mig 20261009190000).
const crmPpl = (await as('boss', `select public.crm_people() as p`))[0].p.people
check(crmPpl.every(p => typeof p.title === 'string' && p.title.length > 0), true, 'every person comes with their People title')
check(crmPpl.find(p => p.id === S('ann')).title, (await q(`select t.name from titles t join hr_staff_costs s on s.title_id = t.id where s.id = $1`, [S('ann')]))[0].name, 'the title is the one People holds')

console.log(`crm control panel: ${checks} checks passed`)
