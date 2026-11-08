// Local PostgreSQL regression for 20261108120000 (Insight › Up next). Every CRM migration runs VERBATIM, then this one.
// Under test: the queue IS the real dealer (crm_up_next's answer against really dealing the same leads), nothing of the
// preview stays; Skip, Pause, Give to…, leave to the half hour; who may read and write; crm_events. No live I/O.
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
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const all = (await readdir(dir)).sort()
const crm = all.filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f))
for (const file of crm) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
// The dealer's later migrations, in production's order.
for (const file of ['20261022130000_crm_member_lock.sql', '20261022160000_crm_split_skips_locked.sql', '20261022170000_crm_team_top.sql', '20261024230000_crm_fulltime_days_only.sql',
  '20261025121500_crm_ads_counted_together.sql', '20261025060000_crm_fulltime_even.sql', '20261025124500_crm_ads_together_reverted.sql', '20261025134700_crm_ads_apply_window.sql', '20261025070000_crm_fulltime_even_off.sql', '20261029220000_crm_staff_leave.sql']) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
const PEOPLE = [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'], ['amy', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['bob', 'rs', 'tlb']]
for (const [who, role, upline] of PEOPLE) {
  await q(`insert into users (id, is_active, role) values ($1, true, $2)`, [id('u', who), role])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const as = who => db.exec(`set test.uid = '${id('u', who)}'`)
const noOne = () => db.exec(`set test.uid = ''`)
const ad = 'ad-1'
const split = { [S('tla')]: 50, [S('tlb')]: 50 }
await q(`insert into crm_ad_assign (ad_source_id, ad_label, mode, team_split, people_mode, people) values ($1, 'Ad 1', 'split', $2::jsonb, 'cnt', '{}'::jsonb)`, [ad, JSON.stringify(split)])

// The migration under test, verbatim.
await db.exec((await readFile(new URL('20261108120000_crm_up_next.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
await db.exec((await readFile(new URL('20261108140000_crm_up_next_faster.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))

const read = async (who, a = ad, line = null) => { await as(who); return (await q(`select crm_up_next($1, null, 10, $2) r`, [a, line]))[0].r }
const names = Object.fromEntries(PEOPLE.map(([w]) => [S(w), w]))
const queue = r => r.queue.map(x => names[x.staff])
const contacts = async () => Number((await q(`select count(*) n from crm_contacts`))[0].n)
const deal = async () => {
  await noOne()
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, ad_source_id, last_customer_at) values ('whatsapp', 'real', gen_random_uuid()::text, $1, now()) returning id`, [ad]))[0].id
  const r = (await q(`select crm_assign_contact($1) r`, [c]))[0].r
  await q(`update crm_contacts set assigned_at = clock_timestamp() where id = $1`, [c])
  return names[r.member]
}

// The queue is the real dealer, and nothing stays.
{
  const n0 = await contacts()
  const r = await read('hod')
  check(r.queue.length, 10, 'ten places')
  check(await contacts(), n0, 'the preview leaves no contact')
  check(Number((await q(`select count(*) n from crm_events where kind = 'assigned' and contact_id not in (select id from crm_contacts)`))[0].n), 0, 'and no event')
  const want = queue(r).slice(0, 6), got = []
  for (let i = 0; i < 6; i++) got.push(await deal())
  check(got, want, 'really dealing six leads gives the six the screen said')
  const r2 = await read('hod')
  check(r2.queue.every(x => r2.people.find(p => p.staff === x.staff)?.why === null), true, 'whoever is dealt is in turn')
  check(r2.people.filter(p => p.why === null).every(p => r2.queue.some(x => x.staff === p.staff)), true, 'whoever is in turn is dealt within ten leads')
}
// Skip: this one lead to the next person; they keep their place after.
{
  const before = queue(await read('hod'))
  const first = before[0]
  await as('hod'); await q(`select crm_up_next_skip($1, $2)`, [ad, S(first)])
  const after = queue(await read('hod'))
  check(after[0] !== first, true, 'the skipped person is not next')
  check(after.includes(first), true, 'they stay in the queue')
  const dealt = await deal()
  check(dealt, after[0], 'the real lead goes to who the screen said')
  check(Number((await q(`select count(*) n from crm_deal_overrides where kind = 'skip' and used_at is null`))[0].n), 0, 'the skip is used by that lead')
}
// Pause: no leads until Resume, kept across reads.
{
  await as('hod'); await q(`select crm_up_next_pause($1, true)`, [S('ann')])
  const r = await read('hod')
  check(queue(r).includes('ann'), false, 'paused is not dealt')
  check(r.people.find(p => p.staff === S('ann')).why, 'paused', 'and says so')
  await as('hod'); await q(`select crm_up_next_pause($1, false)`, [S('ann')])
  check(queue(await read('hod')).includes('ann'), true, 'resumed is back')
}
// Give to…: once; Undo clears it; then the split carries on.
{
  await as('hod'); await q(`select crm_up_next_give($1, $2)`, [ad, S('bob')])
  const r = await read('hod')
  check([queue(r)[0], r.queue[0].how], ['bob', 'pinned'], 'pinned first')
  await as('hod'); await q(`select crm_up_next_undo($1)`, [ad])
  check((await read('hod')).queue[0].how !== 'pinned', true, 'Undo clears the pin')
  await as('hod'); await q(`select crm_up_next_give($1, $2)`, [ad, S('amy')])
  check(await deal(), 'amy', 'the real lead goes to the pin')
  check((await read('hod')).queue[0].how !== 'pinned', true, 'only once')
}
// Undo clears the pin.
{
  await as('hod'); await q(`select crm_up_next_give($1, $2)`, [ad, S('bob')])
  await as('hod'); await q(`select crm_up_next_undo($1)`, [ad])
  check((await read('hod')).queue[0].how !== 'pinned', true, 'Undo clears it')
}
// Leave to the half hour: out while NOW is inside; a later one is upcoming and still dealt.
{
  await as('hod')
  await q(`select crm_up_next_save_leave(null, $1, now() - interval '1 hour', now() + interval '1 hour', 'Sick', '')`, [S('ann')])
  let r = await read('hod')
  check(queue(r).includes('ann'), false, 'on leave is not dealt')
  check(r.people.find(p => p.staff === S('ann')).leave.reason, 'Sick', 'the reason reaches the screen')
  const lid = r.people.find(p => p.staff === S('ann')).leave.id
  await as('hod'); await q(`select crm_up_next_end_leave($1)`, [lid])
  check(queue(await read('hod')).includes('ann'), true, 'End leave puts them back')
  await as('hod')
  await q(`select crm_up_next_save_leave(null, $1, now() + interval '2 days', now() + interval '3 days', 'Other', 'Course')`, [S('bob')])
  r = await read('hod')
  check([r.upcoming.length, r.upcoming[0].note, queue(r).includes('bob')], [1, 'Course', true], 'upcoming, and still dealt')
  await as('hod')
  await assert.rejects(q(`select crm_up_next_save_leave(null, $1, now(), now() + interval '1 day', 'Other', ' ')`, [S('amy')]), /Write the reason/); checks++
  await assert.rejects(q(`select crm_up_next_save_leave(null, $1, now() + interval '1 day', now(), 'Annual', '')`, [S('amy')]), /before From/); checks++
  await assert.rejects(q(`select crm_up_next_save_leave(null, $1, now() + interval '2 days', now() + interval '3 days', 'Annual', '')`, [S('bob')]), /overlaps/); checks++
  // The old days-only function writes the same record.
  await q(`select crm_save_leave(null, $1, ((now() at time zone 'Asia/Kuala_Lumpur')::date + 20), ((now() at time zone 'Asia/Kuala_Lumpur')::date + 20), 'old')`, [S('amy')])
  const old = (await q(`select to_char(from_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI') a, to_char(to_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI') b from crm_staff_leave where note = 'old'`))[0]
  check([old.a, old.b], ['00:00', '23:59'], 'days alone are whole days')
}
// Who may: a leader their own line; a salesperson nothing.
{
  await as('rs') ; await db.exec(`set test.uid = '${id('u', 'ann')}'`)
  await assert.rejects(q(`select crm_up_next($1)`, [ad]), /./); checks++
  await assert.rejects(q(`select crm_up_next_skip($1, $2)`, [ad, S('amy')]), /./); checks++
  const r = await read('tla')
  check(r.queue.every(x => [S('tla'), S('ann'), S('amy')].includes(x.staff)), true, 'a leader reads only their line')
  check(r.queue.length > 0, true, 'and reads it')
  check(r.people.every(p => [S('tla'), S('ann'), S('amy')].includes(p.staff)), true, 'in the lists too')
  // Not ticked: a leader only looks.
  await as('tla')
  for (const [sql, args] of [['select crm_up_next_pause($1, true)', [S('ann')]], ['select crm_up_next_give($1, $2)', [ad, S('amy')]], ['select crm_up_next_undo($1)', [ad]],
    ["select crm_up_next_save_leave(null, $1, now() + interval '30 days', now() + interval '31 days', 'Sick', '')", [S('amy')]]]) { await assert.rejects(q(sql, args), /./); checks++ }
  // A salesperson or a leader cannot switch it; CRM · Manage does, in CRM › Settings.
  await as('tla'); await assert.rejects(q(`select crm_set_up_next($1, true)`, [S('tla')]), /./); checks++
  await as('hod'); await q(`select crm_set_up_next($1, true)`, [S('tla')])
  await as('tla')
  await q("select crm_up_next_save_leave(null, $1, now() + interval '30 days', now() + interval '31 days', 'Sick', '')", [S('amy')])
  check(Number((await q(`select count(*) n from crm_staff_leave where staff_id = $1 and reason = 'Sick'`, [S('amy')]))[0].n) > 0, true, "a ticked leader fills in their people's leave")
  await assert.rejects(q(`select crm_up_next_pause($1, true)`, [S('bob')]), /./); checks++
  await assert.rejects(q(`select crm_up_next_pause($1, true)`, [S('tla')]), /./); checks++
  // Switched off again: back to looking only.
  await as('hod'); await q(`select crm_set_up_next($1, false)`, [S('tla')])
  await as('tla'); await assert.rejects(q(`select crm_up_next_pause($1, true)`, [S('ann')]), /./); checks++
  await as('hod'); await q(`select crm_set_up_next($1, true)`, [S('tla')])
  await as('tla')
  await q(`select crm_up_next_give($1, $2)`, [ad, S('amy')])
  check((await q(`select team_only from crm_deal_overrides where kind = 'pin' and used_at is null and cleared_at is null`))[0].team_only, true, "a leader's pin stays inside their team")
  check(await (async () => { const seq = queue(await read('tla')); return seq[0] })(), 'amy', 'first of their line')
  await as('tla'); await q(`select crm_up_next_undo($1)`, [ad])
  await noOne()
  const v = (await read('boss', ad, S('tlb')))
  check(v.queue.every(x => [S('tlb'), S('bob')].includes(x.staff)), true, "View as reads that person's line")
}
// Every action is on the record: who, when, before, after.
{
  const rows = await q(`select actor, data, at from crm_events where kind = 'up_next' order by id`)
  const acts = new Set(rows.map(r => r.data.action))
  for (const a of ['skip', 'pause', 'resume', 'give', 'undo', 'access', 'leave_added', 'leave_changed']) check(acts.has(a), true, `${a} is recorded`)
  check(rows.every(r => r.at && 'before' in r.data && 'after' in r.data), true, 'with when, before and after')
  check(rows.find(r => r.data.action === 'pause').actor, S('hod'), 'and who')
}
// The migration runs on what it finds only once its anchors are there.
console.log(`validate-crm-up-next: ${checks} checks passed`)
