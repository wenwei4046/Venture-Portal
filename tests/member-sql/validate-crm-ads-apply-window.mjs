// Local PostgreSQL regression for 20261025134700 (2026-10-24: Save and apply to all opens a window — the ads ticked, then
// Standard or Count together). The dealer's migrations run VERBATIM in the order production ran them: 20261025121500
// (counted together), Kaiyee's 20261025060000 (Full time evenly, written over it), 20261025124500 (taken back), then this.
// Under test: the three functions are 20261025121500's bodies again with Full time evenly kept; Standard saves each ad on its
// own; Count together makes the ads ticked the together ads (one not ticked leaves), each joining or leaving counting from
// now; only CRM · Manage may; crm_save_ads_together is gone. No live I/O.
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
const run = async file => db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) await run(file)
for (const file of ['20261022130000_crm_member_lock.sql', '20261022160000_crm_split_skips_locked.sql', '20261022170000_crm_team_top.sql',
  '20261024230000_crm_fulltime_days_only.sql']) await run(file)

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD (the Revenue Director) → TL A (→ Ann, Amir) and TL B (→ Ben).
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'],
  ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const who = staff => Object.fromEntries(['hod', 'tla', 'ann', 'amir', 'tlb', 'ben'].map(w => [S(w), w]))[staff] ?? staff
const md5 = async sig => (await q(`select md5(prosrc) as m from pg_proc where oid = $1::regprocedure`, [sig]))[0].m
const src = async sig => (await q(`select prosrc as s from pg_proc where oid = $1::regprocedure`, [sig]))[0].s
const ASSIGN = 'public.crm_assign_contact(uuid)', SAVE = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'
const GIVEN = 'public.crm_campaign_given(text, timestamptz)'
const as = async (w, sql, params = []) => {
  await db.exec(`set test.uid = '${w ? id('u', w) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
let n = 0
/** A new enquiry from an ad (nobody has Full time days here), dealt as the ingest deals it: the team and who got it. */
const arrive = async ad => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, now(), now()) returning id`, [`c${++n}`, ad]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  const r = (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0]
  return [who(r.team_id), who(r.assigned_to)]
}
const split = JSON.stringify({ [S('tla')]: 50, [S('tlb')]: 50 }), evenly = JSON.stringify({ [S('tla')]: 'even', [S('tlb')]: 'even' })
const saveOne = (ad, sp = split) => as('boss', 'select public.crm_save_ad_assign($1, $1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r', [ad, 'split', sp, 'pct', '{}', evenly])
const apply = (ads, together, w = 'boss', sp = split) => as(w, 'select public.crm_save_ads($1::jsonb, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb) as r',
  [JSON.stringify(Object.fromEntries(ads.map(a => [a, `Ad ${a}`]))), together, 'split', sp, 'pct', '{}', evenly])
const together = async () => (await q(`select ad_source_id from crm_ad_assign where together order by 1`)).map(r => r.ad_source_id)
const fresh = async ad => (await q(`select started_at > now() - interval '1 minute' as f from crm_ad_assign where ad_source_id = $1`, [ad]))[0].f
// PGlite's now() is one instant per transaction and only to the millisecond: an earlier start is laid down by hand.
const backdate = ad => q(`update crm_ad_assign set started_at = now() - interval '2 days' where ad_source_id = $1`, [ad])

// ── As production ran them: counted together, Full time evenly written over it, taken back ──
check([await md5(ASSIGN), await md5(SAVE), await md5(GIVEN)],
  ['b7f7ac547b456e774fac2e48e510c196', '107965abc3eb0cb0cf2ca4d3196f9c29', 'f485e7e495108e723c593a906f880252'], "production's bodies before 20261025121500")
for (const file of ['20261025121500_crm_ads_counted_together.sql', '20261025060000_crm_fulltime_even.sql', '20261025124500_crm_ads_together_reverted.sql']) await run(file)
check([await md5(ASSIGN), await md5(SAVE), await md5(GIVEN)],
  ['802442b943a5d3fe293c6692b3886b89', '107965abc3eb0cb0cf2ca4d3196f9c29', 'f485e7e495108e723c593a906f880252'], 'production now, the bodies this migration checks')
await saveOne('BEFORE-1')

await run('20261025134700_crm_ads_apply_window.sql')

// 1. The three functions: 20261025121500's again, the dealer keeping Full time evenly; the old Save and apply to all is gone.
check([await md5(ASSIGN), await md5(SAVE), await md5(GIVEN)],
  ['0324fccd74b7bae8275e90a500202dc8', '492ba60af30b27d8484d3677a76bb511', 'dc3345f46681864d61423fad44818dfd'], 'counted together again, as production had it with Full time evenly')
const body = await src(ASSIGN)
check([body.includes('crm_counted_leads'), body.includes('crm_fulltime_even(v_at)')], [true, true], 'the held count goes through crm_counted_leads; Full time evenly stays')
check((await q(`select count(*)::int as n from pg_proc where proname = 'crm_save_ads_together'`))[0].n, 0, 'crm_save_ads_together is gone')
check(await together(), [], 'nothing is counted together until the window says so')

// 2. Apart, as before: each ad counts only its own leads, so a fresh ad's first lead goes the same way every time.
check((await apply(['ST-1', 'ST-2'], false))[0].r, { saved: 2, dealt: 0, left: 0 }, 'Standard saves every ad ticked')
check(await together(), [], '…each on its own')
check([await arrive('ST-1'), await arrive('ST-2')], [['tla', 'amir'], ['tla', 'amir']], 'Standard: each ad starts at nothing — Team A, its first by id, twice')

// 3. Count together: the ads ticked are the together ads; the next lead of any of them goes by all of their leads.
check((await apply(['TG-1', 'TG-2'], true))[0].r, { saved: 2, dealt: 0, left: 0 }, 'Count together saves every ad ticked')
check(await together(), ['TG-1', 'TG-2'], '…and counts them together')
check([await arrive('TG-1'), await arrive('TG-2'), await arrive('TG-2'), await arrive('TG-1')],
  [['tla', 'amir'], ['tlb', 'ben'], ['tla', 'ann'], ['tlb', 'tlb']], "together: Team B's turn on the other ad, Ann after Amir — across the two ads")
const given = async ad => (await q(`select coalesce(sum(g.n), 0)::int as n from crm_campaign_given($1, now() - interval '1 day') g`, [ad]))[0].n
check([await given('TG-1'), await given('ST-1')], [4, 1], "a together ad's count is every together ad's leads; an ad apart counts its own")

// 4. Ticked again without one: it leaves and counts alone from now; one joining counts from now; one staying keeps its start.
await backdate('TG-1'); await backdate('TG-2')
check((await apply(['TG-2', 'TG-3'], true))[0].r, { saved: 2, dealt: 0, left: 1 }, 'TG-1 not ticked leaves the together ads')
check(await together(), ['TG-2', 'TG-3'], '…the ads ticked are the together ads')
check([await fresh('TG-1'), await fresh('TG-2'), await fresh('TG-3')], [true, false, true], 'leaving and joining count from now; staying keeps its start')

// 5. Standard on a together ad takes it out; Save on its own keeps it while nothing changed (20261025121500's rule).
await backdate('TG-3')
check((await apply(['TG-3'], false))[0].r.left, 0, 'Standard leaves the others as they are')
check([await together(), await fresh('TG-3')], [['TG-2'], true], 'TG-3 counts alone from now')
check((await saveOne('TG-2'))[0].r.together, true, 'Save with nothing changed keeps an ad together')
check((await saveOne('TG-2', JSON.stringify({ [S('tla')]: 60, [S('tlb')]: 40 })))[0].r.together, false, 'Save with a changed split takes it out')

// 6. Only CRM · Manage; two ads at least to count together; the setting is checked as Save checks it.
await assert.rejects(apply(['TG-1', 'TG-2'], true, 'ann'), /./, 'a salesperson may not'); checks++
await assert.rejects(apply(['TG-1'], true), /at least two/, 'one ad cannot be counted together'); checks++
await assert.rejects(as('boss', `select public.crm_save_ads('{}'::jsonb, false, 'split', $1::jsonb, 'pct', '{}', $2::jsonb)`, [split, evenly]), /Choose the ads/, 'no ads, nothing saved'); checks++
await assert.rejects(as('boss', `select public.crm_save_ads('{"A":"A"}'::jsonb, null, 'split', $1::jsonb, 'pct', '{}', $2::jsonb)`, [split, evenly]), /Standard or Count together/, 'which way, said'); checks++
await assert.rejects(apply(['TG-1', 'TG-2'], true, 'boss', JSON.stringify({ [S('tla')]: 70, [S('tlb')]: 20 })), /100/, 'the teams must add up to 100'); checks++
const f = (await q(`select proacl::text as acl from pg_proc where proname = 'crm_save_ads'`))[0]
check([/authenticated=X/.test(f.acl), /(^|[{,])(anon=|=X)/.test(f.acl)], [true, false], 'the window: signed-in callers (who must manage), never anon')
check((await q(`select together from crm_ad_assign where ad_source_id = 'BEFORE-1'`))[0].together, false, 'an ad saved before stays apart')

console.log(`crm ads apply window: ${checks} checks passed`)
