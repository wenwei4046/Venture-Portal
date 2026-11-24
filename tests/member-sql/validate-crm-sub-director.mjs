// Local PostgreSQL regression for 20261124230000 (the owner, 2026-11-24, of KRIS missing from DC's Revenue Director row:
// "目前现在DC CRM 上让Kris as a revenue director 进来"). The migration swaps one statement into production's crm_role_of
// (crm-role-of-production.sql, md5 307b04cf…) and runs here VERBATIM, twice.
// Under test: a sub-department's CRM director (crm_sub_settings.crm_director) is 'hod'; IR's director still is; an IR
// member keeps their own role even if named; a director of another sub-department who is named nowhere has none; with no
// CRM scope, titles decide as before. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(10), IR = id(11), DC = id(12)
const PETER = id(101), KRIS = id(102), RS = id(103), OTHER = id(104), CEO = id(105)
const T_RS = id(301), T_DIR = id(302), T_CEO = id(303)

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create table public.hr_staff_costs (id uuid primary key, title_id uuid);
  create table public.crm_role_map (title_id uuid primary key, crm_role text);
  create table public.comm_sub_department_directors (sub_department_id uuid, staff_id uuid);
  create table public.crm_sub_settings (sub_department_id uuid primary key, crm_director uuid);
  create table public.fx_scope (sub uuid);
  create table public.fx_members (staff_id uuid primary key, title_id uuid);
  create function public.crm_scope() returns uuid language sql stable as $$ select sub from public.fx_scope limit 1 $$;
  create function public.crm_scope_member(p_staff uuid, out is_member boolean, out title_id uuid) language sql stable as $$
    select exists (select 1 from public.fx_members m where m.staff_id = p_staff), (select m.title_id from public.fx_members m where m.staff_id = p_staff) $$;

  insert into public.fx_scope values ('${IR}');
  insert into public.crm_role_map values ('${T_RS}', 'rs'), ('${T_DIR}', null), ('${T_CEO}', 'boss');
  insert into public.hr_staff_costs values ('${PETER}', '${T_DIR}'), ('${KRIS}', '${T_DIR}'), ('${RS}', '${T_RS}'), ('${OTHER}', '${T_DIR}'), ('${CEO}', '${T_CEO}');
  insert into public.fx_members values ('${RS}', '${T_RS}');
  -- PETER directs Fair and IR; KRIS and OTHER direct Fair only.
  insert into public.comm_sub_department_directors values ('${FAIR}', '${PETER}'), ('${IR}', '${PETER}'), ('${FAIR}', '${KRIS}'), ('${FAIR}', '${OTHER}');
  -- DC's CRM director: KRIS (mig 20261124220000).
  insert into public.crm_sub_settings values ('${IR}', null), ('${DC}', '${KRIS}'), ('${FAIR}', null);
`)
await db.exec(await readFile(new URL('./crm-role-of-production.sql', import.meta.url), 'utf8'))
const role = s => one(`select crm_role_of($1)`, [s])

// Before: KRIS has no role.
check(await role(KRIS), null, 'before: KRIS, who directs Fair only, has no CRM role')
check(await one(`select md5(prosrc) from pg_proc where proname = 'crm_role_of'`), '307b04cfefe547882cca7d5157bf54e8', "the stand-in is production's body")

const migration = (await readFile(new URL('../../supabase/migrations/20261124230000_crm_sub_director_is_revenue_director.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
await db.exec(migration) // again: the swap finds itself made
const after = await one(`select md5(prosrc) from pg_proc where proname = 'crm_role_of'`)
check(after, '2ca8661a549e8676382627239ee7c468', 'the body is the one dry-run on production')

check(await role(KRIS), 'hod', "DC's CRM director is a Revenue Director")
check(await role(PETER), 'hod', "IR's director still is")
check(await role(RS), 'rs', 'an IR member keeps their role')
check(await role(OTHER), null, 'a director of another sub-department, named nowhere, has none')
check(await role(CEO), 'boss', 'the CEO is still the Boss')

// An IR member named a sub-department's CRM director keeps their IR role.
await q(`update crm_sub_settings set crm_director = $1 where sub_department_id = $2`, [RS, DC])
check(await role(RS), 'rs', 'an IR member named DC director stays rs')
check(await role(KRIS), null, 'KRIS no longer named: no role again')
await q(`update crm_sub_settings set crm_director = $1 where sub_department_id = $2`, [KRIS, DC])

// No CRM scope: titles alone, as before.
await q(`delete from fx_scope`)
check(await role(KRIS), null, 'no scope: by title (Director maps to nothing)')
check(await role(CEO), 'boss', 'no scope: the CEO by title')

console.log(`validate-crm-sub-director: ${checks} checks passed`)
