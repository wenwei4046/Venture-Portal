// Local PostgreSQL regression for dealing a new enquiry on arrival
// (2026-10-03). Every CRM migration runs VERBATIM; under test is that a NEW
// WhatsApp customer lands in the right team and with the right person —
// Mode 1 ad rules, Mode 2 team %, the TL's ticked days, the weekend switch,
// full time — that a returning customer keeps theirs, and that the unread
// count grows. Same rules as src/lib/member/crm-team.ts. No live I/O.
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
  create table public.users (id uuid primary key, is_active boolean not null default true);
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

const id = who => {
  const hex = Buffer.from(who).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['tl', 'ta', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id(`t-${role}`), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id(`t-${role}`), role])
}
// TL A → TA A → Ann (full time), Amir (part time), Aida (full time). TL B → Ben (part time).
for (const [who, title, upline] of [['tla', 'tl', null], ['taa', 'ta', 'tla'], ['ann', 'rs', 'taa'], ['amir', 'rs', 'taa'], ['aida', 'rs', 'taa'], ['tlb', 'tl', null], ['ben', 'rs', 'tlb']]) {
  await q(`insert into hr_staff_costs (id, employee_name, title_id, reports_to) values ($1, $2, $3, $4)`, [id(who), who, id(`t-${title}`), upline ? id(upline) : null])
}
await q(`insert into crm_staff (staff_id, full_time) values ($1, true), ($2, true)`, [id('ann'), id('aida')])
const name = async uuid => (await q(`select employee_name from hr_staff_costs where id = $1`, [uuid]))[0]?.employee_name ?? null

// Days, in Malaysia time (UTC+8): Tue 6 Oct and Fri 2 Oct 2026, 11:00.
const TUE = '2026-10-06T03:00:00.000Z', FRI = '2026-10-02T03:00:00.000Z'
let n = 0
const arrive = async (sentAt, ad = null, waId = null) => {
  n++
  const r = await q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb) as r`, [JSON.stringify([{
    externalId: `wamid.${n}`, phoneNumberId: 'PN1', waId: waId ?? `6011${n}`, name: `c${n}`, kind: 'text', body: 'Hi',
    mediaId: null, mediaMime: null, sentAt, ad: ad ? { sourceId: ad, headline: ad, sourceUrl: null } : null,
  }])])
  const c = (await q(`select team_id, assigned_to, unread from crm_contacts where external_id = $1`, [waId ?? `6011${n}`]))[0]
  return { team: await name(c.team_id), member: await name(c.assigned_to), unread: c.unread, assigned: r[0].r.assigned }
}
const reset = async () => { await q(`delete from crm_contacts`); await q(`delete from crm_team_settings`); await q(`delete from crm_assign_rules`) }

// 1. No rules at all: nobody can take it — it waits for the Boss or HOD.
check(await arrive(TUE), { team: null, member: null, unread: 1, assigned: 0 }, 'no rule, no %: waits unassigned')

// 2. Mode 2: each team's %; weekdays ticked → by each person's %, part time included.
await reset()
await q(`insert into crm_team_settings (tl_id, team_share, percent_days, weekend_full_time, ratios) values
  ($1, 100, '{1,2,3,4}', true, $2), ($3, 0, '{}', true, '{}')`, [id('tla'), JSON.stringify({ [id('ann')]: 50, [id('amir')]: 50 }), id('tlb')])
const tue = []
for (let i = 0; i < 4; i++) tue.push(await arrive(TUE))
check(tue.map(r => r.team), ['tla', 'tla', 'tla', 'tla'], 'all to team A (100%)')
check(tue.map(r => r.member).sort(), ['amir', 'amir', 'ann', 'ann'], 'by %: 50/50, part-time Amir included')

// 3. An unticked weekday waits in the TL's To assign list.
await reset()
await q(`insert into crm_team_settings (tl_id, team_share, percent_days, weekend_full_time, ratios) values ($1, 100, '{1,4}', true, $2)`,
  [id('tla'), JSON.stringify({ [id('ann')]: 100 })])
check(await arrive(TUE), { team: 'tla', member: null, unread: 1, assigned: 1 }, 'Tuesday unticked: team A, nobody yet')

// 4. Friday with the switch on: full-time RS only, in turn.
const fri = [await arrive(FRI), await arrive(FRI), await arrive(FRI), await arrive(FRI)]
check(fri.map(r => r.member).sort(), ['aida', 'aida', 'ann', 'ann'], 'weekend: full-time Ann and Aida in turn, never Amir')

// 5. Friday with the switch off: by each person's %.
await q(`update crm_team_settings set weekend_full_time = false, ratios = $1`, [JSON.stringify({ [id('amir')]: 100 })])
check((await arrive(FRI)).member, 'amir', 'switch off: by %, so part-time Amir')

// 6. A team with no full-time RS at the weekend: the TL assigns.
await reset()
await q(`insert into crm_team_settings (tl_id, team_share) values ($1, 100)`, [id('tlb')])
check(await arrive(FRI), { team: 'tlb', member: null, unread: 1, assigned: 1 }, 'no full-time RS: waits for TL B')

// 7. Mode 1: an ad handed to TLs rotates evenly among them — it wins over the %.
await reset()
await q(`insert into crm_team_settings (tl_id, team_share) values ($1, 100), ($2, 0)`, [id('tla'), id('tlb')])
await q(`insert into crm_assign_rules (ad_source_id, tl_ids) values ('AD9', array[$1::uuid, $2::uuid])`, [id('tla'), id('tlb')])
const ad = [await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9')]
check(ad.map(r => r.team).sort(), ['tla', 'tla', 'tlb', 'tlb'], 'the ad rotates A, B, A, B — even though B has 0%')
check((await arrive(TUE, 'OTHER')).team, 'tla', 'another ad still goes by the %')
// A TL named in a rule who is no longer a TL is skipped.
await q(`update crm_assign_rules set tl_ids = array[$1::uuid]`, [id('taa')])
check((await arrive(TUE, 'AD9')).team, 'tla', 'a rule naming someone who is not a TL falls back to the %')

// 8. A returning customer keeps their team and person, and every new message counts as unread.
await reset()
await q(`insert into crm_team_settings (tl_id, team_share, percent_days, ratios) values ($1, 100, '{2}', $2)`, [id('tla'), JSON.stringify({ [id('ann')]: 100 })])
const first = await arrive(TUE, null, '60999')
await q(`update crm_contacts set assigned_to = $1 where external_id = '60999'`, [id('amir')]) // the TL moved them to Amir
const again = await arrive(TUE, null, '60999')
check([first.member, again.member, again.unread, again.assigned], ['ann', 'amir', 2, 0], 'kept with Amir, unread 2, not dealt again')

// 9. Only the ingest deals: nobody signed in may call the helpers.
await db.exec(`set role authenticated`)
for (const sql of [`select public.crm_assign_contact('${id('x')}')`, `select * from public.crm_pick_team('AD9')`]) {
  await assert.rejects(() => q(sql), /permission denied/, `closed: ${sql}`); checks++
}
await db.exec(`reset role`)

console.log(`crm assign: ${checks} checks passed`)
