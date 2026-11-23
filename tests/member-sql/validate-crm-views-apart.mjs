// Local PostgreSQL regression for 20261124200000 (the CRM apart by the Revenue app's view — the owner, 2026-11-23: "IR 的
// view 就只可以看到 IR，DC 就只可以看到 DC，同等的 fair 也只能看到 fair"; of HECTOR and LIM YAU WEI, who answer Dream Crafter's
// customers from IR's roster, "give them" the DC view; "peter dont need, cause he dint in charge dc"). The migration swaps
// statements into production's bodies (pg_temp.swap_once), so the two functions are built here around production's own
// statements — the directors' memberships' last line, crm_people's two `'login' … 'paused'` lines — and the migration runs
// VERBATIM, twice. Under test: a sub-department one holds in the CRM with no seat and no directorship comes as a 'crm'
// membership with nobody of its roster; a seat or a directorship is never listed again; somebody out of the CRM gets none;
// crm_people names each person's brands (none with no login); PETER's own DC tick goes and nobody else's. No live I/O.
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
const PETER_USER = 'de910eeb-d294-411a-bde8-8b8d03dccf76'
// people: [staff, user, name, title, seat (sub), directs (sub), brands, in the CRM]
const P = {
  hector: [id(101), id(201), 'HECTOR', 'Revenue Specialist', IR, null, ['conts', 'dc'], true],
  yauwei: [id(102), id(202), 'LIM YAU WEI', 'Revenue Specialist', IR, null, ['conts', 'dc'], true],
  kris: [id(103), id(203), 'KRIS', 'Revenue Director', null, FAIR, ['dc'], true],
  peter: [id(104), PETER_USER, 'PETER', 'Revenue Director', null, IR, ['conts', 'dc'], true],
  stanley: [id(105), id(205), 'STANLEY', 'Team Leader', IR, null, ['conts'], true],
  dcseat: [id(106), id(206), 'DC SEAT', 'Revenue Specialist', DC, null, ['dc'], true],
  outsider: [id(107), id(207), 'NOT IN CRM', 'Revenue Specialist', FAIR, null, ['dc'], false],
  nologin: [id(108), null, 'NO LOGIN', 'Revenue Specialist', IR, null, null, true],
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, is_active boolean not null default true);
  create table public.titles (id uuid primary key, name text);
  create table public.hr_staff_costs (id uuid primary key, employee_name text, user_id uuid, title_id uuid, status text not null default 'active');
  create table public.comm_sub_departments (id uuid primary key, name text, code text, is_active boolean not null default true, created_at timestamptz not null);
  create table public.comm_schemes (id uuid primary key, sub_department_id uuid, is_active boolean not null default true, effective_from date not null, effective_to date);
  create table public.comm_hierarchy (staff_id uuid, scheme_id uuid);
  create table public.comm_sub_department_directors (staff_id uuid, sub_department_id uuid);
  create table public.member_department_capacity (sub_department_id uuid, headcount_limit int);
  create table public.user_sub_department_reach (user_id uuid, area text, sub_department_id uuid, granted boolean, primary key (user_id, area, sub_department_id));
  create table public.crm_staff (staff_id uuid primary key, paused boolean);
  -- Stand-ins for what the migration's statements call; who holds what is the fixture's.
  create table public.fx_brands (user_id uuid primary key, brands text[], in_crm boolean);
  create function public.member_occupied(p_sub uuid, p_day date) returns int language sql stable as $$ select 0 $$;
  create function public.member_staff_id() returns uuid language sql stable as $$ select s.id from hr_staff_costs s where s.user_id = auth.uid() $$;
  create function public.crm_scope() returns uuid language sql stable as $$ select nullif(current_setting('test.scope', true), '')::uuid $$;
  create function public.crm_brand_sub(p_brand text) returns uuid language sql stable as $$ select case p_brand when 'conts' then '${IR}'::uuid when 'dc' then '${DC}'::uuid end $$;
  create function public.crm_brands_of_user(p_user uuid) returns text[] language sql stable as $$ select coalesce((select brands from fx_brands where user_id = p_user), array['conts', 'dc']) $$;
  create function public.crm_my_brands() returns text[] language sql stable as $$ select public.crm_brands_of_user(auth.uid()) $$;
  create function public.crm_my_role() returns text language sql stable as $$ select case when (select in_crm from fx_brands where user_id = auth.uid()) then 'rs' end $$;
`)
await q(`insert into comm_sub_departments values ($1, 'Fair', 'FAIR', true, '2026-08-31'), ($2, 'IR', null, true, '2026-09-10'), ($3, 'DC', 'DC', true, '2026-11-17')`, [FAIR, IR, DC])
await q(`insert into comm_schemes values ($1, $2, true, '2026-01-01', null), ($3, $4, true, '2026-09-01', null), ($5, $6, true, '2026-11-01', null), ($7, $6, false, '2026-10-01', null)`,
  [id(20), FAIR, id(21), IR, id(22), DC, id(23)])
for (const [staff, user, name, title, seat, directs, brands, inCrm] of Object.values(P)) {
  await q(`insert into titles values ($1, $2) on conflict do nothing`, [id(300 + title.length), title])
  if (user) await q(`insert into users values ($1, true)`, [user])
  await q(`insert into hr_staff_costs values ($1, $2, $3, $4, 'active')`, [staff, name, user, id(300 + title.length)])
  if (seat) await q(`insert into comm_hierarchy values ($1, (select id from comm_schemes where sub_department_id = $2 and is_active))`, [staff, seat])
  if (directs) await q(`insert into comm_sub_department_directors values ($1, $2)`, [staff, directs])
  if (user) await q(`insert into fx_brands values ($1, $2, $3)`, [user, brands, inCrm])
}
// The DC ticks mig 20261120010000 made, and one of somebody else's.
await q(`insert into user_sub_department_reach values ($1, 'crm', $2, true), ($3, 'crm', $2, true), ($1, 'crm', $4, true)`, [PETER_USER, DC, P.hector[1], FAIR])

// member_data_snapshot as production builds its memberships: the seats, then the directors' — ending on production's line.
await db.exec(`
CREATE FUNCTION public.member_data_snapshot(p_full boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_memberships jsonb; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),'people','[{"self":true}]'::jsonb) ORDER BY d.created_at,d.id),'[]') INTO v_memberships
 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE h.staff_id=v_staff AND d.is_active AND c.is_active;
 v_memberships:=v_memberships||(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'people','[]'::jsonb,'director',true) ORDER BY d.created_at,d.id),'[]'::jsonb)
 FROM public.comm_sub_department_directors x
 JOIN public.comm_sub_departments d ON d.id=x.sub_department_id
 JOIN public.comm_schemes c ON c.sub_department_id=d.id AND c.is_active
 WHERE x.staff_id=v_staff AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));

 RETURN jsonb_build_object('memberships',v_memberships);
END $function$;
CREATE FUNCTION public.crm_people()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if crm_scope() is null then
    return jsonb_build_object('people', (
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'title', t.name,
               'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id));
  end if;
  return jsonb_build_object('people', (
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'title', coalesce(mt.name, t.name),
             'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
      from hr_staff_costs s left join titles mt on mt.id = s.title_id left join titles t on t.id = s.title_id left join crm_staff cs on cs.staff_id = s.id));
end $function$;
`)

const migration = (await readFile(new URL('../../supabase/migrations/20261124200000_crm_views_apart.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const snapshotMd5 = await one(`select md5(prosrc) from pg_proc where proname = 'member_data_snapshot'`)
const peopleMd5 = await one(`select md5(prosrc) from pg_proc where proname = 'crm_people'`)
// Again: nothing changes the second time.
await db.exec(migration)
check(await one(`select md5(prosrc) from pg_proc where proname = 'member_data_snapshot'`), snapshotMd5, 'member_data_snapshot: a second run changes nothing')
check(await one(`select md5(prosrc) from pg_proc where proname = 'crm_people'`), peopleMd5, 'crm_people: a second run changes nothing')

const as = async user => { await q(`select set_config('test.uid', $1, false)`, [user ?? '']) }
const views = async key => {
  await as(P[key][1])
  return (await one(`select member_data_snapshot(false)`)).memberships.map(m => [m.name, m.crm === true ? 'crm' : m.director === true ? 'director' : 'seat', m.people.length])
}

// ── 1. A CRM-only view ──────────────────────────────────────────────────────
check(await views('hector'), [['IR', 'seat', 1], ['DC', 'crm', 0]], 'HECTOR: his seat, then DC for the CRM alone, nobody of its roster')
check(await views('yauwei'), [['IR', 'seat', 1], ['DC', 'crm', 0]], 'LIM YAU WEI: the same')
check(await views('kris'), [['Fair', 'director', 0], ['DC', 'crm', 0]], 'KRIS: Fair he directs, DC for the CRM')
check(await views('stanley'), [['IR', 'seat', 1]], 'STANLEY holds The Conts alone: IR, nothing more')
check(await views('dcseat'), [['DC', 'seat', 1]], 'a seat in DC is never listed again for the CRM')
check(await views('outsider'), [['Fair', 'seat', 1]], 'somebody out of the CRM gets no CRM view, whatever their brands')
await as(P.kris[1])
const krisDc = (await one(`select member_data_snapshot(false)`)).memberships[1]
check([krisDc.code, krisDc.schemeId, krisDc.rank, krisDc.calculator, krisDc.title], ['DC', id(22), '', false, 'Revenue Director'], 'its scheme is the current one; no rung, no calculator; their own title')

// ── 2. Each person's brands ─────────────────────────────────────────────────
const brands = async () => Object.fromEntries((await one(`select crm_people()`)).people.map(p => [p.name, p.brands]))
await q(`select set_config('test.scope', $1, false)`, [IR])
check((await brands())['HECTOR'], ['conts', 'dc'], 'IR\'s CRM: HECTOR holds both')
check((await brands())['NO LOGIN'], null, 'somebody with no login: none read')
await q(`select set_config('test.scope', '', false)`)
check((await brands())['STANLEY'], ['conts'], 'no CRM sub-department set: the same field')

// ── 3. PETER's DC tick ──────────────────────────────────────────────────────
check(await q(`select user_id::text, sub_department_id::text from user_sub_department_reach order by user_id, sub_department_id`),
  [{ user_id: P.hector[1], sub_department_id: DC }, { user_id: PETER_USER, sub_department_id: FAIR }].sort((a, b) => a.user_id.localeCompare(b.user_id) || a.sub_department_id.localeCompare(b.sub_department_id)),
  'PETER\'s DC tick is gone; his others and HECTOR\'s stay')

console.log(`crm views apart: ${checks} checks passed`)
