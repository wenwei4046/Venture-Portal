// Local PostgreSQL regression for the CRM's read path (2026-10-02). The CRM
// migrations run VERBATIM against a synthetic surrounding schema; what is
// under test is who may read which customer: themselves and their downline,
// never a peer; the Boss and HOD everything; a TL their team's unassigned
// enquiries; nobody without a mapped title. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows

let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }

// The surroundings the migrations expect on Supabase: roles, auth.uid(), users, titles, staff.
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
for (const file of ['20261002010000_crm_whatsapp.sql', '20261002070000_crm_team_read_path.sql', '20261002080000_crm_read_path_only_yourself.sql', '20261002090000_crm_policies_once_per_query.sql']) {
  await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
}

// Ids that read like names: u-<who> for logins, s-<who> for staff, t-<title>.
const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
const titles = { boss: 'CEO', hod: 'Revenue Director', tl: 'Team Leader', ta: 'Team Assistant', rs: 'Revenue Specialist' }
for (const [key, name] of Object.entries(titles)) await q(`insert into titles values ($1, $2)`, [id('t', key), name])

// Boss → HOD → TL A (→ TA A → Ann, Amir) and TL B (→ Ben). Nora has no login; Zed has no mapped title.
const people = [
  ['boss', 'boss', null], ['hod', 'hod', 'boss'],
  ['tla', 'tl', 'hod'], ['taa', 'ta', 'tla'], ['ann', 'rs', 'taa'], ['amir', 'rs', 'taa'],
  ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb'], ['zed', null, 'tlb'],
]
for (const [who, title, upline] of people) {
  await q(`insert into users values ($1)`, [id('u', who)])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), title ? id('t', title) : null, upline ? id('s', upline) : null])
}
// The owner maps the titles (Settings). Until a title is mapped, its people have no role.
for (const role of ['boss', 'hod', 'tl', 'ta', 'rs']) await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])

// Customers: Ann's, Amir's, Ben's, one waiting in TL A's "To assign" list, one no team took.
const contact = async (name, assigned, team) => (await q(
  `insert into crm_contacts (channel, account_id, external_id, name, assigned_to, team_id) values ('whatsapp', 'PN1', $1, $1, $2, $3) returning id`,
  [name, assigned ? id('s', assigned) : null, team ? id('s', team) : null]))[0].id
const c = {
  ann: await contact('cust-ann', 'ann', 'tla'), amir: await contact('cust-amir', 'amir', 'tla'),
  ben: await contact('cust-ben', 'ben', 'tlb'), waitingA: await contact('cust-waiting-a', null, 'tla'),
  noTeam: await contact('cust-no-team', null, null),
}
for (const key of Object.keys(c)) await q(`insert into crm_messages (contact_id, direction, body) values ($1, 'in', 'hi')`, [c[key]])
await q(`insert into crm_appointments (contact_id, showroom, start_at) values ($1, 'kl', now())`, [c.ben])

// What a signed-in person reads, through row level security.
const as = async (who, sql) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql) } finally { await db.exec(`reset role`) }
}
const names = async who => (await as(who, `select name from crm_contacts order by name`)).map(r => r.name)

// 1. Everyone sees themselves and their downline — never a peer.
check(await names('ann'), ['cust-ann'], 'an RS sees only their own customer')
check(await names('taa'), ['cust-amir', 'cust-ann'], 'a TA sees their RS — not the TL\'s waiting list')
check(await names('tla'), ['cust-amir', 'cust-ann', 'cust-waiting-a'], 'a TL sees their team and what waits to be assigned')
check(await names('tlb'), ['cust-ben'], 'a TL never sees another TL\'s team')

// 2. The Boss and HOD see everything, including what no team took.
const everyone = ['cust-amir', 'cust-ann', 'cust-ben', 'cust-no-team', 'cust-waiting-a']
check(await names('hod'), everyone, 'the HOD sees every customer')
check(await names('boss'), everyone, 'the Boss sees every customer')

// 3. No role, no login, not signed in: nothing.
check(await names('zed'), [], 'a person whose title is not mapped sees nothing')
check(await names(null), [], 'a login not linked to a person sees nothing')
await q(`update users set is_active = false where id = $1`, [id('u', 'ann')])
check(await names('ann'), [], 'a deactivated login sees nothing')
await q(`update users set is_active = true where id = $1`, [id('u', 'ann')])

// 4. Messages and appointments follow their customer.
check((await as('ann', `select count(*)::int as n from crm_messages`))[0].n, 1, 'an RS reads only their customer\'s messages')
check((await as('tla', `select count(*)::int as n from crm_messages`))[0].n, 3, 'a TL reads their team\'s messages')
check((await as('tla', `select count(*)::int as n from crm_appointments`))[0].n, 0, 'a TL never reads another team\'s appointments')
check((await as('tlb', `select count(*)::int as n from crm_appointments`))[0].n, 1, 'a TL reads their own team\'s appointments')

// 5. Settings: the Boss and HOD every team's; a TL their own; nobody else.
await q(`insert into crm_team_settings (tl_id, team_share) values ($1, 60), ($2, 40)`, [id('s', 'tla'), id('s', 'tlb')])
await q(`insert into crm_assign_rules (ad_source_id, tl_ids) values ('AD1', array[$1::uuid]), ('AD2', array[$2::uuid])`, [id('s', 'tla'), id('s', 'tlb')])
const shares = async who => (await as(who, `select team_share from crm_team_settings order by team_share desc`)).map(r => r.team_share)
check(await shares('hod'), [60, 40], 'the HOD reads every team\'s settings')
check(await shares('tla'), [60], 'a TL reads only their own team\'s settings')
check(await shares('ann'), [], 'an RS reads no team settings')
check((await as('tlb', `select ad_source_id from crm_assign_rules`)).map(r => r.ad_source_id), ['AD2'], 'a TL sees only the ads handed to their team')

// 6. Full time: for the people you can see.
await q(`insert into crm_staff (staff_id, full_time) values ($1, true), ($2, true)`, [id('s', 'ann'), id('s', 'ben')])
check((await as('taa', `select count(*)::int as n from crm_staff`))[0].n, 1, 'a TA sees their own RS\'s full-time flag only')
check((await as('hod', `select count(*)::int as n from crm_staff`))[0].n, 2, 'the HOD sees everyone\'s')

// 7. Reads only: nobody signed in may write a customer, a message or a setting directly.
for (const sql of [
  `update crm_contacts set status = 'won'`,
  `insert into crm_messages (contact_id, direction, body) values ('${c.ann}', 'out', 'x')`,
  `update crm_team_settings set team_share = 100`,
  `insert into crm_role_map (title_id, crm_role) values ('${id('t', 'rs')}', 'boss')`,
]) {
  await db.exec(`set test.uid = '${id('u', 'hod')}'; set role authenticated`)
  await assert.rejects(() => q(sql), /permission denied/, `writes stay closed: ${sql}`)
  checks++
  await db.exec(`reset role`)
}
await db.exec(`set role anon`)
await assert.rejects(() => q(`select * from crm_contacts`), /permission denied/, 'anonymous reads nothing'); checks++
await db.exec(`reset role`)

// 8. Nobody signed in may ask about someone else: not their role, not their reporting line.
for (const sql of [`select public.crm_role_of('${id('s', 'tlb')}')`, `select * from public.crm_downline('${id('s', 'tlb')}')`]) {
  await db.exec(`set test.uid = '${id('u', 'tla')}'; set role authenticated`)
  await assert.rejects(() => q(sql), /permission denied/, `only about yourself: ${sql}`)
  checks++
  await db.exec(`reset role`)
}
check((await as('tla', `select public.crm_my_role() as r`))[0].r, 'tl', 'you may ask your own role')
check((await as('taa', `select count(*)::int as n from public.crm_my_downline()`))[0].n, 3, 'and your own downline (the TA and two RS)')

// 9. The WhatsApp ingest still works beside the new columns: a new customer arrives with no team.
await db.exec(`set role service_role`)
await q(`select public.crm_ingest_whatsapp($1::jsonb, '[]'::jsonb, 0, '{}'::jsonb)`, [JSON.stringify([{
  externalId: 'wamid.x', phoneNumberId: 'PN1', waId: '60111', name: 'New', kind: 'text', body: 'Hi',
  mediaId: null, mediaMime: null, sentAt: '2026-10-02T02:00:00.000Z', ad: null,
}])])
await db.exec(`reset role`)
check((await q(`select team_id, assigned_to, unread from crm_contacts where external_id = '60111'`))[0],
  { team_id: null, assigned_to: null, unread: 0 }, 'an ingested customer waits with no team')
check((await names('hod')).includes('New'), true, 'the HOD sees the new customer in Unassigned')
check((await names('tla')).includes('New'), false, 'a TL does not, until it is sent to their team')

console.log(`crm team: ${checks} checks passed`)
