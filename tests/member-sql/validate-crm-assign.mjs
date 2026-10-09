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

// Hand an ad to one team, to test who in that team gets it.
const handTo = (ad, ...tls) => q(`insert into crm_assign_rules (ad_source_id, tl_ids) values ($1, $2::uuid[])`, [ad, tls.map(id)])

// 1. No ad, or an ad nobody set: evenly across every team (2026-10-03) — never left waiting.
check(await arrive(TUE), { team: 'tla', member: null, unread: 1, assigned: 1 }, 'no rule: to a team (A), its TL assigns')
check([(await arrive(TUE)).team, (await arrive(TUE, 'NEW AD')).team, (await arrive(TUE)).team], ['tlb', 'tla', 'tlb'], 'then B, A, B — evenly, ad or not')

// 2. An ad handed to team A; weekdays ticked → by each person's %, part time included.
await reset()
await handTo('ADA', 'tla')
await q(`insert into crm_team_settings (tl_id, percent_days, weekend_full_time, ratios) values
  ($1, '{1,2,3,4}', true, $2), ($3, '{}', true, '{}')`, [id('tla'), JSON.stringify({ [id('ann')]: 50, [id('amir')]: 50 }), id('tlb')])
const tue = []
for (let i = 0; i < 4; i++) tue.push(await arrive(TUE, 'ADA'))
check(tue.map(r => r.team), ['tla', 'tla', 'tla', 'tla'], 'all to team A (the ad is theirs)')
check(tue.map(r => r.member).sort(), ['amir', 'amir', 'ann', 'ann'], 'by %: 50/50, part-time Amir included')

// 3. An unticked weekday waits in the TL's To assign list.
await reset()
await handTo('ADA', 'tla')
await q(`insert into crm_team_settings (tl_id, percent_days, weekend_full_time, ratios) values ($1, '{1,4}', true, $2)`,
  [id('tla'), JSON.stringify({ [id('ann')]: 100 })])
check(await arrive(TUE, 'ADA'), { team: 'tla', member: null, unread: 1, assigned: 1 }, 'Tuesday unticked: team A, nobody yet')

// 4. Friday with the switch on: full-time RS only, in turn.
const fri = [await arrive(FRI, 'ADA'), await arrive(FRI, 'ADA'), await arrive(FRI, 'ADA'), await arrive(FRI, 'ADA')]
check(fri.map(r => r.member).sort(), ['aida', 'aida', 'ann', 'ann'], 'weekend: full-time Ann and Aida in turn, never Amir')

// 5. Friday with the switch off: by each person's %.
await q(`update crm_team_settings set weekend_full_time = false, ratios = $1`, [JSON.stringify({ [id('amir')]: 100 })])
check((await arrive(FRI, 'ADA')).member, 'amir', 'switch off: by %, so part-time Amir')

// 6. A team with no full-time RS at the weekend: the TL assigns.
await reset()
await handTo('ADB', 'tlb')
check(await arrive(FRI, 'ADB'), { team: 'tlb', member: null, unread: 1, assigned: 1 }, 'no full-time RS: waits for TL B')

// 7. An ad handed to several teams rotates evenly among them; an ad split by % follows the %.
await reset()
await handTo('AD9', 'tla', 'tlb')
const ad = [await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9'), await arrive(TUE, 'AD9')]
check(ad.map(r => r.team).sort(), ['tla', 'tla', 'tlb', 'tlb'], 'the ad rotates A, B, A, B')
await q(`insert into crm_assign_rules (ad_source_id, tl_ids, shares) values ('AD5', $1::uuid[], $2::jsonb)`,
  [[id('tla'), id('tlb')], JSON.stringify({ [id('tla')]: 75, [id('tlb')]: 25 })])
const split = []
for (let i = 0; i < 8; i++) split.push((await arrive(TUE, 'AD5')).team)
check([split.filter(x => x === 'tla').length, split.filter(x => x === 'tlb').length], [6, 2], '75 / 25: six to A, two to B — balanced on that ad alone')
// A TL named in a rule who is no longer a TL is skipped: back to even across every team.
await q(`update crm_assign_rules set tl_ids = array[$1::uuid], shares = null where ad_source_id = 'AD9'`, [id('taa')])
check((await arrive(TUE, 'AD9')).team, 'tlb', 'a rule naming nobody who is a TL: evenly across every team (B is behind)')

// 8. A returning customer keeps their team and person, and every new message counts as unread.
await reset()
await handTo('ADA', 'tla')
await q(`insert into crm_team_settings (tl_id, percent_days, ratios) values ($1, '{2}', $2)`, [id('tla'), JSON.stringify({ [id('ann')]: 100 })])
const first = await arrive(TUE, 'ADA', '60999')
await q(`update crm_contacts set assigned_to = $1 where external_id = '60999'`, [id('amir')]) // the TL moved them to Amir
const again = await arrive(TUE, 'ADA', '60999')
check([first.member, again.member, again.unread, again.assigned], ['ann', 'amir', 2, 0], 'kept with Amir, unread 2, not dealt again')

// 9. Only the ingest deals: nobody signed in may call the helpers.
await db.exec(`set role authenticated`)
for (const sql of [`select public.crm_assign_contact('${id('x')}')`, `select * from public.crm_pick_team('AD9')`]) {
  await assert.rejects(() => q(sql), /permission denied/, `closed: ${sql}`); checks++
}
await db.exec(`reset role`)

console.log(`crm assign: ${checks} checks passed`)
