// Local PostgreSQL regression for 20261010030000 (2026-10-10): the CRM asks the
// permission matrix. Every CRM migration runs VERBATIM over a stand-in of the
// matrix (crm-permission-standin.mjs: has_action, and cells set per person
// here). Under test: the seeded templates change nobody's CRM; without CRM ·
// View a person is nobody in it; View alone reads but works nothing; Edit at
// Own works their line, at All anybody's; Manage alone runs assignment, ads,
// full time and showrooms; View at All shows everybody — the cell decides, not
// the title; crm_my_can answers the screens; and the event trigger refuses a
// rewrite of a CRM function that drops its check. No live I/O.
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
const crmFiles = (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()
assert(crmFiles.includes('20261010030000_crm_asks_the_permission.sql'), 'the migration under test is among the CRM files')
for (const file of crmFiles) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD → TL A (→ Ann, Amir) and TL B (→ Ben). The Boss is the Principal's login.
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'],
  ['ann', 'rs', 'tla'], ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const contact = async (ext, assigned, team) => (await q(`insert into crm_contacts (channel, account_id, external_id, name, assigned_to, team_id, last_customer_at)
  values ('whatsapp', 'PN1', $1, $1, $2, $3, now()) returning id`, [ext, assigned ? S(assigned) : null, team ? S(team) : null]))[0].id
const C = {
  ann: await contact('c-ann', 'ann', 'tla'),
  ben: await contact('c-ben', 'ben', 'tlb'),
  hod: await contact('c-hod', 'hod', null),
  organic: await contact('c-organic', null, null),
}
const nameOf = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]))

const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, what) => {
  await assert.rejects(() => as(who, sql, params), /may not|permission denied/i, what)
  checks++
}
/** Exactly these cells for somebody (as a template and their own cells would leave them); [] = nothing. */
const cells = async (who, list) => {
  await q(`delete from test_crm_cells where uid = $1`, [id('u', who)])
  for (const [action, scope] of list.length ? list : [['nothing', 'own']]) {
    await q(`insert into test_crm_cells values ($1, $2, $3)`, [id('u', who), action, scope])
  }
}
const natural = async who => { await q(`delete from test_crm_cells where uid = $1`, [id('u', who)]) }
const sees = async who => (await as(who, `select id from crm_contacts order by external_id`)).map(r => nameOf[r.id])
const canReply = async (who, c) => (await as(who, `select public.crm_can_reply($1) as ok`, [c]))[0].ok
const myCan = async who => (await as(who, `select public.crm_my_can() as c`))[0].c
const ALL = { viewAll: true, editOwn: true, editAll: true, manage: true }
const NONE = { viewAll: false, editOwn: false, editAll: false, manage: false }

// ── 1. The seeded templates: nobody's CRM moves ─────────────────────────────
check(await sees('ann'), ['ann'], 'Revenue Team (View · Edit at Own): Ann reads her own customer')
check([await canReply('ann', C.ann), await canReply('ann', C.ben)], [true, false], '…answers hers, not Ben’s')
check(await sees('tla'), ['ann'], 'a TL reads their team’s')
check(await sees('hod'), ['ann', 'ben', 'hod', 'organic'], 'Revenue Director (every cell at All): everybody, Organic Leads too')
check(await canReply('hod', C.ben), true, 'the Director answers anybody')
check(await sees('boss'), ['ann', 'ben', 'hod', 'organic'], 'the Principal’s login: everybody')
check([await myCan('ann'), await myCan('hod'), await myCan('boss')],
  [{ viewAll: false, editOwn: true, editAll: false, manage: false }, ALL, ALL], 'crm_my_can: the screens’ four answers')
await as('hod', `select public.crm_save_ad_assign('AD-1', 'Ad one', 'even', '{}', 'cnt', '{}')`)
check((await q(`select count(*)::int as n from crm_ad_assign where ad_source_id = 'AD-1'`))[0].n, 1, 'the Director assigns ads')
await refused('ann', `select public.crm_save_ad_assign('AD-2', 'Ad two', 'even', '{}', 'cnt', '{}')`, [], 'a salesperson does not')

// ── 2. No CRM · View: nobody in the CRM ─────────────────────────────────────
await cells('ann', [])
check((await as('ann', `select public.crm_me() as me`))[0].me, null, 'without View, crm_me() is nobody')
check(await sees('ann'), [], '…so no customer reads')
check((await as('ann', `select public.crm_people() as p`))[0].p.role, null, '…and the CRM says she has no role there')
await refused('ann', `select public.crm_save_labels('[]')`, [], 'not even her own labels')
await refused('ann', `select public.crm_set_status($1, 'follow_up', null, null)`, [C.ann], 'nor her customer')
check(await myCan('ann'), NONE, 'crm_my_can: nothing')

// ── 3. View alone: reads, works nothing ─────────────────────────────────────
await cells('ann', [['view', 'own']])
check(await sees('ann'), ['ann'], 'View at Own: her customer reads')
check(await canReply('ann', C.ann), false, '…but she may not answer it without Edit')
await refused('ann', `select public.crm_set_status($1, 'follow_up', null, null)`, [C.ann], 'nor change its status')
await refused('ann', `select public.crm_answer_invite(gen_random_uuid(), true)`, [], 'nor take an invitation')
check((await as('ann', `select jsonb_array_length(public.crm_save_labels('[{"name":"Hot","color":"#BD4A19"}]')) as n`))[0].n, 1,
  'her own labels are hers to keep (her view of the CRM)')
await natural('ann')

// ── 4. The Director without Manage ──────────────────────────────────────────
await cells('hod', [['view', 'all'], ['edit', 'all']])
check(await sees('hod'), ['ann', 'ben', 'hod', 'organic'], 'View at All: everybody')
check(await canReply('hod', C.ben), true, 'Edit at All: anybody’s chat')
await refused('hod', `select public.crm_save_ad_assign('AD-3', 'Ad three', 'even', '{}', 'cnt', '{}')`, [], 'no Manage: no ads to teams')
await refused('hod', `select public.crm_send_to($1, $2)`, [C.organic, S('ann')], 'no Manage: no sending an Organic Lead')
await refused('hod', `select public.crm_save_fulltime($1, 'cnt', '{}', '{}')`, [S('tla')], 'no Manage: no full time')
await refused('hod', `select public.crm_save_showroom_full(null, 'Penang', '', '{}', 2, '{}', '[]', true)`, [], 'no Manage: no showrooms')
await refused('hod', `select public.crm_set_full_time($1, true)`, [S('ann')], 'no Manage: nobody made full time')
check(await myCan('hod'), { viewAll: true, editOwn: true, editAll: true, manage: false }, 'crm_my_can: no manage')

// ── 5. The Director at Own: their line, and they still sell ─────────────────
await cells('hod', [['view', 'own'], ['edit', 'own']])
check(await sees('hod'), ['ann', 'ben', 'hod'], 'at Own: their own customers and their line’s — not Organic Leads')
check([await canReply('hod', C.hod), await canReply('hod', C.ben)], [true, true], 'a director answers their own and their line’s at Own')
check((await as('hod', `select public.crm_people() as p`))[0].p.people.some(p => p.id === S('boss')), false, 'their CRM lists their line, not above it')
await natural('hod')

// ── 6. The cell decides, not the title ──────────────────────────────────────
await cells('tla', [['view', 'all'], ['edit', 'own']])
check(await sees('tla'), ['ann', 'ben', 'hod', 'organic'], 'a TL given View at All reads everybody')
check(await canReply('tla', C.ben), false, '…and still answers only their own line')
check((await as('tla', `select count(*)::int as n from jsonb_array_elements((public.crm_people())->'people')`))[0].n, 7, '…and their CRM lists everybody')
await natural('tla')
await cells('ben', [['view', 'own'], ['edit', 'own'], ['manage', 'all']])
await as('ben', `select public.crm_save_ad_assign('AD-4', 'Ad four', 'even', '{}', 'cnt', '{}')`)
check((await q(`select count(*)::int as n from crm_ad_assign where ad_source_id = 'AD-4'`))[0].n, 1, 'an RS given Manage assigns ads')
await natural('ben')
await cells('boss', [['view', 'all']])
check(await canReply('boss', C.ann), false, 'the Principal with View alone answers nobody')
await refused('boss', `select public.crm_send_to($1, $2)`, [C.organic, S('ann')], '…and sends nothing')
await natural('boss')

// ── 7. The guard: a rewrite may not drop the check ──────────────────────────
await assert.rejects(() => db.exec(`create or replace function public.crm_me() returns uuid language sql stable security definer
    set search_path to 'public' as $f$ select s.id from hr_staff_costs s join users u on u.id = s.user_id where u.id = auth.uid() $f$`),
  /crm_me\(\) must keep its CRM permission check/, 'crm_me rewritten without crm_can is refused')
checks++
await assert.rejects(() => db.exec(`create or replace function public.crm_send_to(p_contact uuid, p_staff uuid) returns jsonb
    language plpgsql security definer set search_path to 'public' as $f$
    begin if not crm_sees_all() then perform crm_deny('send this customer'); end if; return '{}'::jsonb; end $f$`),
  /crm_manages\(/, 'crm_send_to back on crm_sees_all() is refused')
checks++
await assert.rejects(() => db.exec(`create or replace function public.crm_people() returns jsonb language plpgsql security definer
    set search_path to 'public' as $f$ begin return '{}'::jsonb; end $f$`),
  /crm_people\(\) must keep/, 'crm_people without crm_sees_all is refused')
checks++
const before = (await q(`select md5(prosrc) as m from pg_proc where proname = 'crm_me'`))[0].m
check(before === (await q(`select md5(prosrc) as m from pg_proc where proname = 'crm_me'`))[0].m, true, 'the refused rewrite left crm_me as it was')
await db.exec(`create or replace function public.crm_mark_read(p_contact uuid) returns void language sql security definer set search_path to 'public'
  as $f$ update crm_contacts set unread = 0 where id = p_contact and assigned_to = crm_me() $f$`)
checks++ // a CRM function with no check of its own is the colleague's to rewrite freely
check(await sees('ann'), ['ann'], 'the CRM still works after the refusals')

// ── 8. Running it again changes nothing ─────────────────────────────────────
await db.exec((await readFile(new URL('20261010030000_crm_asks_the_permission.sql', dir), 'utf8')).replace(/\r\n/g, '\n'))
check((await q(`select md5(prosrc) as m from pg_proc where proname = 'crm_me'`))[0].m, before, 'the migration twice: crm_me unchanged')
check((await q(`select count(*)::int as n from pg_event_trigger where evtname = 'crm_keeps_its_permission_checks'`))[0].n, 1, '…one guard')
check(await sees('hod'), ['ann', 'ben', 'hod', 'organic'], '…and the CRM answers as before')

// ── 9. Who may call what ────────────────────────────────────────────────────
check(await q(`select has_function_privilege('authenticated', 'public.crm_can(text,text)', 'EXECUTE') as can,
                      has_function_privilege('authenticated', 'public.crm_manages()', 'EXECUTE') as manages,
                      has_function_privilege('authenticated', 'public.crm_my_can()', 'EXECUTE') as my_can,
                      has_function_privilege('anon', 'public.crm_my_can()', 'EXECUTE') as anon_my_can`),
  [{ can: false, manages: false, my_can: true, anon_my_can: false }], 'the helpers are the CRM functions’ own; the screens ask crm_my_can')

console.log(`crm permissions: ${checks} checks passed`)
