// Local PostgreSQL regression for the Control panel's dealing rules (2026-10-09,
// mig 20261009090000). Every CRM migration runs VERBATIM; under test: Organic
// Leads, Evenly, By team %, By people (maximum / %), full-time days, the
// Principal / Director sending and undoing, and who may answer. No live I/O.
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

// 9. Notifications read one by one, and all at once.
await as('boss', `select public.crm_read_notifs('{e1,e2}')`)
check(await as('boss', `select notif_read from crm_staff_prefs`), [{ notif_read: ['e1', 'e2'] }], 'two notifications read')
await as('boss', `select public.crm_read_notifs('{}', true)`)
check(await as('boss', `select notif_read, notifs_seen_at is not null as seen from crm_staff_prefs`), [{ notif_read: [], seen: true }], 'Mark all read')

console.log(`crm control panel: ${checks} checks passed`)
