// Local PostgreSQL regression for 20261023120000 (2026-10-23 — the owner: "ta can assign as well"). crm_assign_member —
// a leader's Assign to in Mine's chat and the Team side's — let a TL or an STL give a customer of a team below them to
// somebody in it; a TA, who leads people but tops no team, could not. Every CRM migration of 2–19 Oct runs VERBATIM over
// the permission matrix's stand-in (crm-permission-standin.mjs), which leaves crm_assign_member as production runs it
// (md5-checked); then the migration, verbatim, twice. Under test: a TA gives a customer with them or somebody below them
// to their own people only — never their TL, a peer or another team, never "nobody"; a TL and an STL as before; the rest
// refused; a body production changed since stops the migration. No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const dir = new URL('../../supabase/migrations/', import.meta.url)
const text = async f => (await readFile(new URL(f, dir), 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = '20261023120000_team_assistant_assigns.sql'
const PRODUCTION = 'b07634bd092e03dc98dbdb0ef0a1b5da'
const md5 = async () => (await q(`select md5(prosrc) as m from pg_proc where oid = 'public.crm_assign_member(uuid,uuid)'::regprocedure`))[0].m

try {
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
  const crmFiles = (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()
  for (const file of crmFiles) await db.exec(await text(file))
  check(await md5(), PRODUCTION, 'crm_assign_member is production’s')

  const id = (prefix, who) => {
    const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  }
  for (const role of ['boss', 'hod', 'stl', 'tl', 'ta', 'rs']) {
    await q(`insert into titles values ($1, $2)`, [id('t', role), role])
    await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
  }
  // Boss → HOD → STL → TL A → TA Tia (→ Rita, Ray), TA Tom (nobody below), Ann; HOD → TL B → Ben.
  for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['stl', 'stl', 'hod'], ['tla', 'tl', 'stl'],
    ['tia', 'ta', 'tla'], ['rita', 'rs', 'tia'], ['ray', 'rs', 'tia'], ['tom', 'ta', 'tla'], ['ann', 'rs', 'tla'],
    ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
    await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
    await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
      [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
  }
  const S = who => id('s', who)
  const contact = async (ext, assigned, team) => (await q(`insert into crm_contacts (channel, account_id, external_id, name, assigned_to, team_id, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, $3, now()) returning id`, [ext, assigned ? S(assigned) : null, team ? S(team) : null]))[0].id
  const C = {
    rita: await contact('c-rita', 'rita', 'tla'), tia: await contact('c-tia', 'tia', 'tla'), ann: await contact('c-ann', 'ann', 'tla'),
    waitA: await contact('c-wait-a', null, 'tla'), ben: await contact('c-ben', 'ben', 'tlb'),
  }
  const holder = async c => {
    const s = (await q(`select assigned_to from crm_contacts where id = $1`, [c]))[0].assigned_to
    return s ? (await q(`select employee_name from hr_staff_costs where id = $1`, [s]))[0].employee_name : null
  }
  const as = async (who, sql, params = []) => {
    await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
    try { return await q(sql, params) } finally { await db.exec(`reset role`) }
  }
  const assign = (who, c, to) => as(who, `select public.crm_assign_member($1, $2)`, [c, to === null ? null : S(to)])
  const refused = async (who, c, to, pattern, what) => {
    const before = await holder(c)
    await assert.rejects(() => assign(who, c, to), pattern, what)
    check(await holder(c), before, `${what} — the customer stays with ${before ?? 'nobody'}`)
  }
  const MAY_NOT = /You may not assign this customer/
  const NOT_HERE = /They are not in this team/

  // ── Before: a TA is refused even their own people ───────────────────────────────────────────────────────────
  await refused('tia', C.rita, 'ray', MAY_NOT, 'before: Tia (TA) may not give Rita’s customer to Ray')

  // ── A body production changed since stops the migration ─────────────────────────────────────────────────────
  const def = (await q(`select pg_get_functiondef('public.crm_assign_member(uuid,uuid)'::regprocedure) as d`))[0].d
  await db.exec(def.replace('They are not in this team.', 'Not in this team.') + ';')
  const migration = await text(MIGRATION)
  await assert.rejects(() => db.exec(migration), /crm_assign_member changed in production/, 'a drifted body is refused')
  checks++
  await db.exec(def + ';')
  check(await md5(), PRODUCTION, 'and production’s body is back for the real run')

  // ── The migration, verbatim — twice, the second changing nothing ───────────────────────────────────────────
  await db.exec(migration)
  const once = await md5()
  check(once !== PRODUCTION, true, 'the body changed')
  await db.exec(migration)
  check(await md5(), once, 'applying it twice changes nothing')
  check((await q(`select has_function_privilege('authenticated', 'public.crm_assign_member(uuid,uuid)', 'EXECUTE') as ok`))[0].ok, true,
    'the app may still call it')

  // ── A TA: their own people, nobody else ─────────────────────────────────────────────────────────────────────
  await assign('tia', C.rita, 'ray')
  check(await holder(C.rita), 'ray', 'Tia gives Rita’s customer to Ray, both below her')
  await assign('tia', C.tia, 'rita')
  check(await holder(C.tia), 'rita', 'and her own customer to Rita')
  await refused('tia', C.rita, 'ann', NOT_HERE, 'never to Ann — in the team, not below Tia')
  await refused('tia', C.rita, 'tla', NOT_HERE, 'never up to her TL')
  await refused('tia', C.rita, 'tom', NOT_HERE, 'nor a peer TA')
  await refused('tia', C.rita, 'ben', NOT_HERE, 'nor somebody in another team')
  await refused('tia', C.rita, null, NOT_HERE, 'and never "nobody" — that took the customer off whoever had it')
  await refused('tia', C.ann, 'ray', MAY_NOT, 'not a customer with Ann, outside her line')
  await refused('tia', C.waitA, 'ray', MAY_NOT, 'nor the team’s enquiry nobody has yet — the TL’s to give')
  await refused('tia', C.ben, 'ray', MAY_NOT, 'nor another team’s')
  await refused('tom', C.tia, 'rita', MAY_NOT, 'a TA with nobody below has nothing within reach')

  // ── A TL and an STL as before ───────────────────────────────────────────────────────────────────────────────
  await assign('tla', C.ann, 'rita')
  check(await holder(C.ann), 'rita', 'TL A gives Ann’s customer to Rita, below Tia')
  await assign('tla', C.waitA, 'ann')
  check(await holder(C.waitA), 'ann', 'and the team’s waiting enquiry to Ann')
  await refused('tla', C.ben, 'ann', MAY_NOT, 'not team B’s customer')
  await refused('tla', C.ann, 'ben', NOT_HERE, 'nor to team B’s Ben')
  await assign('stl', C.waitA, 'tia')
  check(await holder(C.waitA), 'tia', 'the STL gives a customer of a team below them')
  await refused('stl', C.ben, 'ann', MAY_NOT, 'but not of a team outside their line')

  // ── Everybody else ──────────────────────────────────────────────────────────────────────────────────────────
  await refused('rita', C.rita, 'ray', MAY_NOT, 'a Revenue Specialist assigns nothing')
  await q(`insert into test_crm_cells values ($1, 'view', 'own')`, [id('u', 'tia')])
  await refused('tia', C.tia, 'ray', MAY_NOT, 'a TA without CRM · Edit assigns nothing')
  await q(`delete from test_crm_cells where uid = $1`, [id('u', 'tia')])
  await q(`insert into test_crm_cells values ($1, 'nothing', 'own')`, [id('u', 'tla')])
  await refused('tla', C.ann, 'ann', MAY_NOT, 'nor somebody the CRM does not know (no View: no role)')
  await q(`delete from test_crm_cells where uid = $1`, [id('u', 'tla')])
  await refused(null, C.ann, 'ann', MAY_NOT, 'nor nobody signed in')

  console.log(`PASS: ${checks} team-assistant-assigns checks (20261023120000 verbatim, twice, over production’s body). No live I/O.`)
} finally {
  await db.close()
}
