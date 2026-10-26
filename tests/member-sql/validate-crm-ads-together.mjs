// Local PostgreSQL regression for 20261025121500 (2026-10-24, ads counted together — "Save and apply to all" means calculate
// together). Every CRM migration runs VERBATIM, then the dealer's later ones (the lock, team tops, Full time days) and this
// one. Under test: a together ad's next lead goes by every together ad's leads this month; an ad apart counts alone; Save on
// its own with a change takes an ad out; Save and apply to all takes in every ad listed and every ad already together; only
// CRM · Manage may; the migration puts the ads holding the latest setting together, counting from then. No live I/O.
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
// The dealer as production runs it before this migration (each of these checks production's body by md5 or by its text).
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
const as = async (w, sql, params = []) => {
  await db.exec(`set test.uid = '${w ? id('u', w) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
let n = 0
/** A new enquiry from an ad (nobody has Full time days here, so any weekday), dealt as the ingest deals it: the team and who got it. */
const arrive = async (ad, at = null) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, coalesce($3::timestamptz, now()), coalesce($3::timestamptz, now())) returning id`, [`c${++n}`, ad, at]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  const r = (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0]
  return [who(r.team_id), who(r.assigned_to)]
}
const split = JSON.stringify({ [S('tla')]: 50, [S('tlb')]: 50 })
const evenly = JSON.stringify({ [S('tla')]: 'even', [S('tlb')]: 'even' })
const saveOne = (ad, sp = split, tm = evenly) => as('boss', 'select public.crm_save_ad_assign($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb) as r', [ad, ad, 'split', sp, 'pct', '{}', tm])
const saveAll = (ads, w = 'boss', sp = split) => as(w, 'select public.crm_save_ads_together($1::jsonb, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb) as r',
  [JSON.stringify(Object.fromEntries(ads.map(a => [a, `Ad ${a}`]))), 'split', sp, 'pct', '{}', evenly])
const together = async () => (await q(`select ad_source_id from crm_ad_assign where together order by 1`)).map(r => r.ad_source_id)

// ── Before this migration: rules with the latest setting, and one apart ──
await q(`insert into crm_ad_assign (ad_source_id, ad_label, mode, team_split, people_mode, people, team_modes, updated_at, started_at)
  values ('OLD-1', 'Old 1', 'split', $1::jsonb, 'pct', '{}', $2::jsonb, now() - interval '2 hours', now() - interval '3 days'),
         ('OLD-2', 'Old 2', 'split', $1::jsonb, 'pct', '{}', $2::jsonb, now() - interval '1 hour', now() - interval '3 days'),
         ('OLD-3', 'Old 3', 'split', $3::jsonb, 'pct', '{}', $2::jsonb, now() - interval '5 hours', now() - interval '3 days')`,
  [split, evenly, JSON.stringify({ [S('tla')]: 100 })])
const md5 = async sig => (await q(`select md5(prosrc) as m from pg_proc where oid = $1::regprocedure`, [sig]))[0].m
check(await md5('public.crm_assign_contact(uuid)'), 'b7f7ac547b456e774fac2e48e510c196', "the dealer as production's (the md5 the migration checks)")
check(await md5('public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'), '107965abc3eb0cb0cf2ca4d3196f9c29', "Save as production's")
check(await md5('public.crm_campaign_given(text, timestamptz)'), 'f485e7e495108e723c593a906f880252', "the count as production's")

await run('20261025121500_crm_ads_counted_together.sql')

// 1. The migration: every ad holding the latest saved setting is together, counting from now; the one apart stays apart.
check(await together(), ['OLD-1', 'OLD-2'], 'the ads with the latest setting are counted together; the other is not')
check((await q(`select bool_and(started_at > now() - interval '1 minute') as fresh from crm_ad_assign where together`))[0].fresh, true, '…counting from now')
check((await q(`select started_at < now() - interval '1 day' as kept from crm_ad_assign where ad_source_id = 'OLD-3'`))[0].kept, true, "…the other keeps its start")
await q(`update crm_ad_assign set together = false`)

// 2. Apart (as before): each ad counts only its own leads, so a fresh ad's first lead goes the same way every time.
await saveOne('AP-1'); await saveOne('AP-2')
check([await arrive('AP-1'), await arrive('AP-2')], [['tla', 'amir'], ['tla', 'amir']], 'apart: each ad starts again — Team A, its first by id, twice')

// 3. Together: the next lead of any of them goes by all of their leads.
check((await saveAll(['TG-1', 'TG-2']))[0].r, { saved: 2, dealt: 0 }, 'Save and apply to all saves every ad listed')
check(await together(), ['TG-1', 'TG-2'], '…and counts them together')
const tg = [await arrive('TG-1'), await arrive('TG-2'), await arrive('TG-2'), await arrive('TG-1')]
check(tg, [['tla', 'amir'], ['tlb', 'ben'], ['tla', 'ann'], ['tlb', 'tlb']], "together: Team B's turn on the other ad, Ann after Amir — across the two ads")
const given = async ad => (await q(`select array(select g.staff::text || ':' || g.n from crm_campaign_given($1, now() - interval '1 day') g order by 1) as g`, [ad]))[0].g
check((await given('TG-1')).length, 4, "a together ad's count is every together ad's leads")
check((await given('AP-1')).length, 1, "an ad apart still counts only its own")

// 4. This month only: a together ad's lead from last month does not count.
await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at, assigned_to, team_id)
  values ('whatsapp', 'PN1', 'old', 'old', 'TG-1', $1, $1, $2, $3)`,
  [new Date(Date.UTC(2026, 0, 1)).toISOString(), S('ben'), S('tlb')])
await q(`update crm_ad_assign set started_at = '2025-12-01' where ad_source_id = 'TG-1'`)
check((await given('TG-1')).length, 4, "a lead from an earlier month is left out — the count starts again on the 1st (the office's)")
check((await q(`select count(*)::int as n from crm_counted_leads('TG-1', now()) k where k.since >= date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`))[0].n, 2,
  'both together ads count from the month start at the earliest')

// 5. Save on its own: unchanged, the ad stays together; changed, it leaves and counts alone from now.
check((await saveOne('TG-2'))[0].r.together, true, 'Save with nothing changed keeps an ad together')
check((await saveOne('TG-2', JSON.stringify({ [S('tla')]: 60, [S('tlb')]: 40 })))[0].r.together, false, 'Save with a changed split takes it out')
check((await q(`select started_at > now() - interval '1 minute' as fresh from crm_ad_assign where ad_source_id = 'TG-2'`))[0].fresh, true, '…counting alone from now')
check(await together(), ['TG-1'], 'the other stays together')

// 6. Save and apply to all takes in every ad listed AND every ad already together, all with the one setting.
check((await saveAll(['TG-3']))[0].r, { saved: 2, dealt: 0 }, 'the ad listed and the ad already together')
check(await together(), ['TG-1', 'TG-3'], '…both together')
check((await saveAll(['TG-2', 'TG-3'], 'boss', JSON.stringify({ [S('tla')]: 70, [S('tlb')]: 30 })))[0].r.saved, 3, 'a new split for all three')
check((await q(`select count(distinct team_split::text)::int as n from crm_ad_assign where together`))[0].n, 1, 'every together ad holds the one split')
check((await q(`select started_at < now() - interval '1 day' as kept from crm_ad_assign where ad_source_id = 'TG-1'`))[0].kept, true, 'a new split keeps their count')

// 7. Only CRM · Manage; the counting helper is the service role's alone.
await assert.rejects(saveAll(['TG-1'], 'ann'), /./, 'a salesperson may not apply a split to all'); checks++
await assert.rejects(as('boss', `select public.crm_save_ads_together('{}'::jsonb, 'split', $1::jsonb, 'pct', '{}', $2::jsonb)`, [split, evenly]), /Choose the ads/, 'no ads, nothing saved'); checks++
await assert.rejects(saveAll(['TG-1'], 'boss', JSON.stringify({ [S('tla')]: 70, [S('tlb')]: 20 })), /100/, 'the teams must add up to 100'); checks++
for (const fn of ['crm_counted_leads', 'crm_campaign_given']) {
  const f = (await q(`select proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(/(^|[{,])(anon|authenticated)=/.test(f.acl) || /(^|[{,])=X/.test(f.acl), false, `${fn}: nobody's but the service role's`)
}
const f = (await q(`select proacl::text as acl from pg_proc where proname = 'crm_save_ads_together'`))[0]
check([/authenticated=X/.test(f.acl), /(^|[{,])(anon=|=X)/.test(f.acl)], [true, false], 'Save and apply to all: signed-in callers (who must manage), never anon')

console.log(`crm ads together: ${checks} checks passed`)
