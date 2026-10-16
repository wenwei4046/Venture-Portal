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

// 1. rev 1011 §6.4: an ad nobody set is dealt evenly across the teams; an enquiry from no ad goes to the Revenue Director
// (mig 20261013260000 — it waited in Organic Leads before).
{
  const a = await arrive('AD-NONE'), b = await arrive('AD-NONE')
  check([name(a.team_id), name(b.team_id)].sort(), ['tla', 'tlb'], 'an ad nobody set: one enquiry to each team')
  check(!!a.assigned_to && !!b.assigned_to, true, '…each given to somebody in it')
  check(await arrive(null), { assigned_to: S('hod'), team_id: null }, 'an enquiry from no ad goes to the Revenue Director')
  // The Revenue Director is one more "team" of the default even split (mig 20261016010000; the owner, 2026-10-16), last on a tie.
  check(await arrive('AD-NONE'), { assigned_to: S('hod'), team_id: null }, 'an ad nobody set: the third enquiry to the Revenue Director, no team')
  check(name((await arrive('AD-NONE')).team_id) !== null, true, '…and the fourth back to a team')
}

// 2. Evenly: everyone in the teams in turn.
await refused('ann', `select public.crm_save_ad_assign('AD-E', 'Even ad', 'even', '{}', 'cnt', '{}', '{}')`, [], /may not/, 'a salesperson may not assign ads')
await refused('boss', `select public.crm_save_ad_assign('AD-E', 'Even ad', 'even', '{}', 'cnt', '{}')`, [], /permission denied/, 'the old six-argument writer is nobody’s')
await as('boss', `select public.crm_save_ad_assign('AD-E', 'Even ad', 'even', '{}', 'cnt', '{}', '{}')`)
const even = []
for (let i = 0; i < 6; i++) even.push(name((await arrive('AD-E')).assigned_to))
check([...even].sort(), ['amir', 'ann', 'ben', 'hod', 'tla', 'tlb'], 'Evenly: six leads, one each to the five people in the teams and the Revenue Director')
await refused('boss', `select public.crm_save_ad_assign('AD-X', 'People', 'people', '{}', 'cnt', '{}', '{}')`, [], /Unknown assignment/, 'By people is merged into By team')

// 3. By team %: 50 / 50; inside each, Evenly.
const half = JSON.stringify({ [S('tla')]: 50, [S('tlb')]: 50 }), evenIn = JSON.stringify({ [S('tla')]: 'even', [S('tlb')]: 'even' })
await refused('boss', `select public.crm_save_ad_assign('AD-S', 'Split', 'split', $1, 'cnt', '{}', $2)`, [JSON.stringify({ [S('tla')]: 60, [S('tlb')]: 30 }), evenIn], /add up to 100/, 'team % must add up to 100')
await refused('boss', `select public.crm_save_ad_assign('AD-S', 'Split', 'split', $1, 'cnt', '{}', '{}')`, [half], /By % team must add up/, 'inside a team By % is the default, and must add up to 100')
await as('boss', `select public.crm_save_ad_assign('AD-S', 'Split', 'split', $1, 'cnt', '{}', $2)`, [half, evenIn])
const split = []
for (let i = 0; i < 4; i++) split.push(name((await arrive('AD-S')).team_id))
check(split.sort(), ['tla', 'tla', 'tlb', 'tlb'], 'By team 50/50: two leads each')
// The Revenue Director's row in a split (mig 20261016010000): its key, inside it Evenly; a By max past its limit deals evenly (no row to wait in).
{
  const dk = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  await as('boss', `select public.crm_save_ad_assign('AD-D', 'Director', 'split', $1, 'cnt', '{}', $2)`, [JSON.stringify({ [S('tla')]: 50, [dk]: 50 }), JSON.stringify({ [S('tla')]: 'even', [dk]: 'even' })])
  const got = []
  for (let i = 0; i < 4; i++) { const r = await arrive('AD-D'); got.push(r.team_id === null ? name(r.assigned_to) : name(r.team_id)) }
  check(got.sort(), ['hod', 'hod', 'tla', 'tla'], 'By team 50 / Revenue Director 50: two leads each, the director’s with no team')
  await as('boss', `select public.crm_save_ad_assign('AD-DM', 'Director max', 'split', $1, 'cnt', $2, $3)`, [JSON.stringify({ [dk]: 100 }), JSON.stringify({ [S('hod')]: 1 }), JSON.stringify({ [dk]: 'cnt' })])
  check([name((await arrive('AD-DM')).assigned_to), name((await arrive('AD-DM')).assigned_to)], ['hod', 'hod'], 'the Revenue Director past their maximum: dealt evenly, never left waiting')
}

// 4. By max inside each team: Ann 1 in Team A, Ben 1 in Team B. A full team HOLDS the lead (Over the limit) — never another team.
const maxIn = JSON.stringify({ [S('tla')]: 'cnt', [S('tlb')]: 'cnt' })
await refused('hod', `select public.crm_save_ad_assign('AD-P', 'Max', 'split', $1, 'cnt', '{}', $2)`, [half, maxIn], /maximum in every By max team/, 'a By max team needs somebody’s maximum')
await as('hod', `select public.crm_save_ad_assign('AD-P', 'Max', 'split', $1, 'cnt', $2, $3)`, [half, JSON.stringify({ [S('ann')]: 1, [S('ben')]: 1 }), maxIn])
const ppl = []
for (let i = 0; i < 4; i++) { const r = await arrive('AD-P'); ppl.push([name(r.assigned_to), name(r.team_id)]) }
check(ppl, [['ann', 'tla'], ['ben', 'tlb'], [null, 'tla'], [null, 'tlb']], 'By max: Ann 1, Ben 1, then each team holds its next lead')
check((await q(`select count(*)::int as n from crm_contacts where ad_source_id = 'AD-P' and held_reason = 'limit'`))[0].n, 2, 'two leads wait Over the limit')
// Raising Ann's limit deals Team A's held lead to her at once; Team B's waits for Ben.
const saved = (await as('hod', `select public.crm_save_ad_assign('AD-P', 'Max', 'split', $1, 'cnt', $2, $3) as r`, [half, JSON.stringify({ [S('ann')]: 2, [S('ben')]: 1 }), maxIn]))[0].r
check(saved.dealt, 1, 'saving deals the one held lead that now fits')
check((await q(`select assigned_to, held_reason from crm_contacts where ad_source_id = 'AD-P' and team_id = $1 order by created_at, id`, [S('tla')])).map(r => [name(r.assigned_to), r.held_reason]),
  [['ann', null], ['ann', null]], 'Team A’s held lead went to Ann and is no longer Over the limit')
check((await q(`select held_reason from crm_contacts where ad_source_id = 'AD-P' and team_id = $1 and assigned_to is null`, [S('tlb')])).map(r => r.held_reason), ['limit'], 'Team B’s still waits')
{ // Anybody given a held lead by hand takes it off the limit list.
  const held = (await q(`select id from crm_contacts where ad_source_id = 'AD-P' and held_reason = 'limit'`))[0].id
  await as('boss', `select public.crm_send_to($1, $2)`, [held, S('tlb')])
  check((await q(`select held_reason from crm_contacts where id = $1`, [held]))[0].held_reason, null, 'sent by hand: no longer Over the limit')
}

// 5. By % inside a team: Amir 75 / Ann 25 over four leads.
await as('hod', `select public.crm_save_ad_assign('AD-Q', 'Pct', 'split', $1, 'cnt', $2, $3)`,
  [JSON.stringify({ [S('tla')]: 100 }), JSON.stringify({ [S('amir')]: 75, [S('ann')]: 25 }), JSON.stringify({ [S('tla')]: 'pct' })])
const pct = []
for (let i = 0; i < 4; i++) pct.push(name((await arrive('AD-Q')).assigned_to))
check(pct.filter(x => x === 'amir').length, 3, 'By %: Amir takes three of four at 75%')

// 6. Full time = days per person, in turn; it overrides every inside mode (By max included — nothing is held for it).
await refused('tla', `select public.crm_set_full_time($1, true)`, [S('amir')], /may not/, 'a TL may not set who is full time')
for (const who of ['amir', 'ann', 'tla']) await as('boss', `select public.crm_set_full_time($1, true)`, [S(who)])
check((await q(`select count(*)::int as n from crm_staff where full_time and staff_id = $1`, [S('tla')]))[0].n, 1, 'a TL may be full time (rev 1011)')
await refused('boss', `select public.crm_set_full_time($1, true)`, [S('hod')], /team member/, 'the Director is not a team member')
const today = (Number((await q(`select extract(isodow from now() at time zone 'Asia/Kuala_Lumpur')::int as d`))[0].d) + 6) % 7
await as('hod', `select public.crm_save_fulltime($1, 'turns', $2, $3)`, [S('tla'), `{${today}}`, JSON.stringify({ [S('amir')]: { [today]: 1 }, [S('ann')]: { [today]: 1 } })])
await as('boss', `select public.crm_save_ad_assign('AD-F', 'Full', 'split', $1, 'cnt', $2, $3)`,
  [JSON.stringify({ [S('tla')]: 100 }), JSON.stringify({ [S('tla')]: 1 }), JSON.stringify({ [S('tla')]: 'cnt' })])
const ft = []
for (let i = 0; i < 4; i++) ft.push(name((await arrive('AD-F')).assigned_to))
check([...ft].sort(), ['amir', 'amir', 'ann', 'ann'], 'on a full-time day Amir and Ann take turns — past the TL’s By max of 1, nothing held')
check(ft[0] !== ft[1] && ft[1] !== ft[2], true, '…one after the other')
// Part time leaves the allocation: Ann's ticked days go, and Amir takes them all.
await as('boss', `select public.crm_set_full_time($1, false)`, [S('ann')])
check(Object.keys((await q(`select vals from crm_fulltime_rules where tl_id = $1`, [S('tla')]))[0].vals).map(name), ['amir'], 'switching Ann off clears her ticked days')
check(name((await arrive('AD-F')).assigned_to), 'amir', 'the next full-time lead is Amir’s')

// 7. The Principal sends an Organic Lead, and undoes it.
const organic = (await q(`select id from crm_contacts where ad_source_id is null`))[0].id
await refused('tla', `select public.crm_send_to($1, $2)`, [organic, S('ann')], /may not/, 'a TL may not send an Organic Lead')
await as('boss', `select public.crm_send_to($1, $2)`, [organic, S('ann')])
check(name((await q(`select assigned_to from crm_contacts where id = $1`, [organic]))[0].assigned_to), 'ann', 'sent to Ann')
check(name((await q(`select team_id from crm_contacts where id = $1`, [organic]))[0].team_id), 'tla', '…in her team')
await as('boss', `select public.crm_send_to($1, null)`, [organic])
check((await q(`select assigned_to, team_id from crm_contacts where id = $1`, [organic]))[0], { assigned_to: null, team_id: null }, 'Undo: back to Organic Leads')
// The Principal may be sent a customer since 2026-10-13 (their Mine); somebody with no CRM role still may not.
await as('boss', `select public.crm_send_to($1, $2)`, [organic, S('boss')])
check((await q(`select assigned_to from crm_contacts where id = $1`, [organic]))[0].assigned_to, S('boss'), 'the Principal can be given a customer (Mine)')
await as('boss', `select public.crm_send_to($1, null)`, [organic])

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
// The NEWEST 500 read keys are kept (rev 1010 §6): 600 read one after another keep k101…k600, oldest first;
// one read again moves to the end.
{
  const keys = Array.from({ length: 600 }, (_, i) => `k${i + 1}`)
  for (let i = 0; i < keys.length; i += 100) await as('boss', `select public.crm_read_notifs($1)`, [keys.slice(i, i + 100)])
  const kept = (await as('boss', `select notif_read from crm_staff_prefs`))[0].notif_read
  check([kept.length, kept[0], kept[499]], [500, 'k101', 'k600'], 'the newest 500 read keys are kept, oldest first')
  await as('boss', `select public.crm_read_notifs('{k200}')`)
  const again = (await as('boss', `select notif_read from crm_staff_prefs`))[0].notif_read
  check([again.length, again[499], again.filter(k => k === 'k200').length], [500, 'k200', 1], 'a key read again moves to the end, once')
}

// 10. crm_people() hands over each person's title from People (mig 20261009190000).
const crmPpl = (await as('boss', `select public.crm_people() as p`))[0].p.people
check(crmPpl.every(p => typeof p.title === 'string' && p.title.length > 0), true, 'every person comes with their People title')
check(crmPpl.find(p => p.id === S('ann')).title, (await q(`select t.name from titles t join hr_staff_costs s on s.title_id = t.id where s.id = $1`, [S('ann')]))[0].name, 'the title is the one People holds')

// 11. rev 1011's migration over rules saved before it: By people → By team (the people's teams, an even split, the old
// max / % inside), a Max / % full-time row → turns (any value on a chosen day = ticked). Running it again is harmless.
{
  await q(`insert into crm_ad_assign (ad_source_id, mode, people_mode, people) values ('AD-OLD', 'people', 'cnt', $1)`,
    [JSON.stringify({ [S('ann')]: 2, [S('ben')]: 1, [S('amir')]: 0 })])
  await q(`insert into crm_fulltime_rules (tl_id, mode, days, vals) values ($1, 'cnt', '{0,2}', $2)`,
    [S('tlb'), JSON.stringify({ [S('ben')]: { 0: 3, 1: 5, 2: 0 } })])
  await db.exec((await readFile(new URL('20261011130000_crm_dealer_rev1011.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
  const r = (await q(`select mode, team_split, team_modes from crm_ad_assign where ad_source_id = 'AD-OLD'`))[0]
  check([r.mode, Object.values(r.team_split).reduce((a, b) => a + b, 0), Object.keys(r.team_split).map(name).sort()], ['split', 100, ['tla', 'tlb']], 'By people became By team over the people’s teams, adding to 100')
  check(Object.values(r.team_modes), ['cnt', 'cnt'], '…each team By max, as the old maximums were')
  const f = (await q(`select mode, vals from crm_fulltime_rules where tl_id = $1`, [S('tlb')]))[0]
  check([f.mode, f.vals[S('ben')]['0'], f.vals[S('ben')]['1'], f.vals[S('ben')]['2']], ['turns', 1, 0, 0], 'Max full time became turns: ticked only on a chosen day with a value')
}

// 12. A WhatsApp customer with a username comes only with their BSUID (mig 20261012100000): no phone made up from it;
// the number the salesperson types in is kept when they write again.
{
  const wa = (externalId, waId) => q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb)`, [JSON.stringify([{
    externalId, phoneNumberId: 'PN-U', waId, name: 'Carrie', kind: 'text', body: 'Hi',
    mediaId: null, mediaMime: null, sentAt: '2026-10-12T03:00:00.000Z', ad: null,
  }])])
  await wa('wamid.u1', 'MY.1052914074449222')
  await wa('wamid.u2', '60123450000')
  check((await q(`select external_id, phone from crm_contacts where account_id = 'PN-U' order by external_id`)), [
    { external_id: '60123450000', phone: '+60123450000' },
    { external_id: 'MY.1052914074449222', phone: null },
  ], 'a number becomes the phone; a BSUID leaves it empty')
  await q(`update crm_contacts set phone = '+60198887777' where external_id = 'MY.1052914074449222'`)
  await wa('wamid.u3', 'MY.1052914074449222')
  check((await q(`select phone, unread from crm_contacts where external_id = 'MY.1052914074449222'`))[0], { phone: '+60198887777', unread: 2 }, 'the hand-typed number stays when they write again')
}

// 13. Round 2: a blocked date with set hours closes only those slots (mig 20261013210000); one without hours, the day.
{
  await q(`insert into crm_showrooms (id, name, active, sort_order, slots, cap, weekly, blocks) values ('pch', 'Puchong', true, 9, '{11:00,13:00,15:00,17:00}', 2, '{}',
    '[{"a":"2026-10-07","b":"2026-10-07","why":"Training","t1":"14:00","t2":"17:00"},{"a":"2026-10-09","b":"2026-10-09","why":"Stock take"}]'::jsonb)`)
  const at = async hm => { try { await q(`select public.crm_slot_check('pch', ($1 || '+08')::timestamptz, null)`, [`2026-10-07 ${hm}`]); return 'open' } catch (e) { return e.message } }
  check([await at('11:00'), await at('13:00'), await at('15:00'), await at('17:00')],
    ['open', 'open', 'Puchong is closed at that time.', 'open'], 'set hours 2–5 pm: 3 pm closed, 11, 1 and 5 pm open')
  let whole = 'open'; try { await q(`select public.crm_slot_check('pch', '2026-10-09 11:00+08'::timestamptz, null)`) } catch (e) { whole = e.message }
  check(whole, 'Puchong is closed that day.', 'a block without hours still closes the whole day')
}

// 14. A customer's Messenger photo keeps Meta's address so the chat shows it (mig 20261013240000); any other host, none.
{
  const msg = (mid, url) => ({ externalId: mid, pageId: 'PG1', psid: 'PS-photo', name: 'Photo Fan', kind: 'image', body: null, sentAt: '2026-10-13T03:00:00.000Z', ad: null, mediaUrl: url })
  await q(`select public.crm_ingest_messenger($1::jsonb, '[]'::jsonb, '[]'::jsonb, 0, '{}'::jsonb)`,
    [JSON.stringify([msg('m.photo1', 'https://scontent.xx.fbcdn.net/v/a.jpg?x=1'), msg('m.photo2', 'https://evil.example.com/a.jpg')])])
  check(await q(`select external_id, media_url from crm_messages where external_id like 'm.photo%' order by external_id`), [
    { external_id: 'm.photo1', media_url: 'https://scontent.xx.fbcdn.net/v/a.jpg?x=1' },
    { external_id: 'm.photo2', media_url: null },
  ], "Meta's CDN address kept, another host's dropped")
}

console.log(`crm control panel: ${checks} checks passed`)
