// Local PostgreSQL regression for 20261124220000 (the owner, 2026-11-24: Dream Crafter's leads from no ad "auto go to kris";
// of PETER's five DC customers, "let him see this chat, then open view for him, in dc"). The migration swaps one statement
// into production's crm_assign_contact (crm-dc-no-ad-production.sql, read through the CLI), runs here VERBATIM, twice.
// Under test: a DC lead from no ad goes to the sub-department's own person (KRIS) — not the Revenue Director who holds the
// brand (PETER, once his DC tick is back); KRIS locked out, or no longer holding DC, the Revenue Director again; an IR lead
// from no ad to the Revenue Director as before; PETER's DC tick back, and nobody else's touched. No live I/O.
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
const KRIS = 'e2a52899-dd15-4020-87e0-9bd8cf22b113', PETER = id(104), PETER_USER = 'de910eeb-d294-411a-bde8-8b8d03dccf76', KRIS_USER = id(203)
const CONTS_NO = '1438056256053876', DC_NO = '1422533724269131'

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create table public.users (id uuid primary key);
  create table public.hr_staff_costs (id uuid primary key, user_id uuid, status text not null default 'active');
  create table public.comm_sub_departments (id uuid primary key, name text, code text, is_active boolean not null default true);
  create table public.user_sub_department_reach (user_id uuid, area text, sub_department_id uuid, granted boolean,
    updated_at timestamptz not null default now(), primary key (user_id, area, sub_department_id));
  create table public.crm_contacts (id uuid primary key, account_id text, ad_source_id text, team_id uuid, assigned_to uuid, held_reason text);
  -- The dealer's other rows (its declarations name them; a lead from no ad never reads them).
  create table public.crm_ad_assign (ad_source_id text primary key);
  create table public.crm_deal_overrides (id uuid primary key);
  -- As mig 20261124210000 made it (the columns the dealer's statement reads).
  create table public.crm_sub_settings (sub_department_id uuid primary key, auto_assign boolean not null default true);
  create table public.fx_locked (staff_id uuid primary key);

  -- Stand-ins for what the dealer calls.
  create function public.crm_brand_of(p_account text) returns text language sql immutable as $$
    select case when p_account = '${CONTS_NO}' then 'conts' when p_account = '${DC_NO}' then 'dc' end $$;
  create function public.crm_settings_of(p_account text) returns public.crm_sub_settings language sql stable as $$
    select s.* from public.crm_sub_settings s
     where s.sub_department_id = case public.crm_brand_of(p_account) when 'dc' then '${DC}'::uuid else '${IR}'::uuid end $$;
  create function public.crm_role_of(p_staff uuid) returns text language sql stable as $$ select case when p_staff = '${PETER}' then 'hod' end $$;
  create function public.crm_staff_locked(p_staff uuid) returns boolean language sql stable as $$ select exists (select 1 from public.fx_locked where staff_id = p_staff) $$;
  -- A brand one holds: The Conts for PETER (the IR he directs), and the CRM ticks.
  create function public.crm_staff_takes_brand(p_staff uuid, p_brand text) returns boolean language sql stable as $$
    select p_brand is null or (p_staff = '${PETER}' and p_brand = 'conts') or exists (
      select 1 from public.hr_staff_costs s join public.user_sub_department_reach r on r.user_id = s.user_id and r.area = 'crm' and r.granted
        join public.comm_sub_departments d on d.id = r.sub_department_id
       where s.id = p_staff and ((p_brand = 'dc' and upper(d.code) = 'DC') or (p_brand = 'conts' and d.id = '${IR}'))) $$;

  insert into public.users values ('${PETER_USER}'), ('${KRIS_USER}');
  insert into public.hr_staff_costs (id, user_id) values ('${PETER}', '${PETER_USER}'), ('${KRIS}', '${KRIS_USER}');
  insert into public.comm_sub_departments (id, name, code) values ('${FAIR}', 'Fair', 'FAIR'), ('${IR}', 'IR', null), ('${DC}', 'DC', 'DC');
  insert into public.crm_sub_settings (sub_department_id) values ('${FAIR}'), ('${IR}'), ('${DC}');
  -- KRIS holds Fair and DC in the CRM; PETER's DC tick went with mig 20261124200000.
  insert into public.user_sub_department_reach (user_id, area, sub_department_id, granted) values
    ('${KRIS_USER}', 'crm', '${FAIR}', true), ('${KRIS_USER}', 'crm', '${DC}', true);
`)
await db.exec('set check_function_bodies = off')
await db.exec(await readFile(new URL('./crm-dc-no-ad-production.sql', import.meta.url), 'utf8'))
const migration = (await readFile(new URL('../../supabase/migrations/20261124220000_crm_dc_no_ad_to_kris.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
// Again: the swap finds itself already made, KRIS already named, PETER's tick already there.
await db.exec(migration)
await db.exec('set check_function_bodies = on')

let n = 0
const lead = async (account, ad = null) => {
  const c = id(1000 + ++n)
  await q(`insert into crm_contacts (id, account_id, ad_source_id) values ($1, $2, $3)`, [c, account, ad])
  const got = await one(`select crm_assign_contact($1)`, [c])
  return { to: await one(`select assigned_to::text from crm_contacts where id = $1`, [c]), by: got.member_by ?? got.waits ?? null }
}

check(await q(`select sub_department_id::text as sub, crm_director::text as to from crm_sub_settings order by 1`),
  [{ sub: FAIR, to: null }, { sub: IR, to: null }, { sub: DC, to: KRIS }], "DC's own person for a lead from no ad is KRIS")
check(await q(`select r.user_id::text as user, d.code from user_sub_department_reach r join comm_sub_departments d on d.id = r.sub_department_id where r.granted order by 1, 2`),
  [{ user: KRIS_USER, code: 'DC' }, { user: KRIS_USER, code: 'FAIR' }, { user: PETER_USER, code: 'DC' }], "PETER's DC tick back, nobody else's touched")
check(await one(`select (length(prosrc) - length(replace(prosrc, 'crm_settings_of(c.account_id)).crm_director', ''))) / length('crm_settings_of(c.account_id)).crm_director') from pg_proc where proname = 'crm_assign_contact'`), 2,
  'the dealer asks it in both places it took the Revenue Director: a lead from no ad, and an ad’s lead given to somebody without the brand')

check(await lead(DC_NO), { to: KRIS, by: 'organic_director' }, "a DC lead from no ad goes to KRIS — not PETER, who holds DC again")
check(await lead(CONTS_NO), { to: PETER, by: 'organic_director' }, 'an IR lead from no ad goes to the Revenue Director, as before')

await db.exec(`insert into fx_locked values ('${KRIS}')`)
check(await lead(DC_NO), { to: PETER, by: 'organic_director' }, 'KRIS locked out of the dealing: the Revenue Director who holds DC')
await db.exec(`delete from fx_locked`)
await db.exec(`update user_sub_department_reach set granted = false where user_id = '${KRIS_USER}' and sub_department_id = '${DC}'`)
check(await lead(DC_NO), { to: PETER, by: 'organic_director' }, 'KRIS no longer holding DC: the Revenue Director again')
await db.exec(`update user_sub_department_reach set granted = false where user_id = '${PETER_USER}'`)
check(await lead(DC_NO), { to: null, by: 'organic' }, 'nobody holding DC: it waits in the Team inbox, as before')

console.log(`CRM DC leads from no ad: ${checks} checks passed`)
