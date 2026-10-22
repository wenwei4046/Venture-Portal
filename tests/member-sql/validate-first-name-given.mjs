// Local PostgreSQL regression for 20261017180000 (2026-10-17 — the user: "full name = loo wen wei, wen wei ( first
// name ) , loo ( last name )"): the first name is the person's own and the last their surname — LOO WEN WEI greets as
// WEN WEI. Over stand-ins for the table and the snapshots' profile statements as production wrote them, the day's two
// migrations run VERBATIM in order (20261017153000 split by the first word): everybody still on that split is split
// again, a name HR set stays, a new person and a corrected full name take the new split, and both snapshots fall back
// to it. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, name text, email text, role text, is_active boolean not null default true);
  create table public.hr_staff_costs (
    id uuid primary key default gen_random_uuid(), employee_name text not null, user_id uuid references public.users(id),
    basic_salary numeric not null default 0, status text not null default 'active', created_at timestamptz not null default now());
  create function public.member_staff_id() returns uuid language sql stable as $$ select nullif(current_setting('test.staff', true), '')::uuid $$;
  create function public.member_data_snapshot(p_full boolean) returns jsonb language plpgsql security definer set search_path = public as $fn$
DECLARE v_staff uuid:=public.member_staff_id(); v_profile jsonb;
BEGIN
 SELECT jsonb_build_object('id',s.id,'userId',u.id,'name',s.employee_name,'email',u.email,'salary',s.basic_salary)
 INTO v_profile FROM public.hr_staff_costs s JOIN public.users u ON u.id=s.user_id WHERE s.id=v_staff;
 RETURN jsonb_build_object('demo',false,'profile',v_profile);
END $fn$;
  create function public.member_principal_snapshot(p_full boolean) returns jsonb language plpgsql security definer set search_path = public as $fn$
DECLARE
 v_profile jsonb;
BEGIN
 SELECT jsonb_build_object(
  'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),
  'email',coalesce(u.email,''),'salary',NULL
 ) INTO v_profile
 FROM public.users u
 WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active;
 RETURN jsonb_build_object('principalView',true,'profile',v_profile);
END $fn$;
`)

await db.exec(`
  insert into public.users (id, name, email, role) values
    ('${id(1)}', 'LOO WEN WEI', 'boss@example.com', 'principal'),
    ('${id(2)}', 'GOH JOEY', 'joey@example.com', 'finance');
  insert into public.hr_staff_costs (id, employee_name, user_id) values
    ('${id(101)}', 'LOO WEN WEI', '${id(1)}'),
    ('${id(102)}', 'GOH JOEY', '${id(2)}'),
    ('${id(103)}', 'DANIEL', null),
    ('${id(104)}', '  KELVIN   TAN ', null),
    ('${id(105)}', 'NUR AMIRA BINTI ISMAIL', null),
    ('${id(106)}', 'MEI LING', null),
    ('${id(107)}', 'CHLOE LIM SU YIN', null),
    ('${id(108)}', 'ONG SU MAY', null);
`)

const read = file => readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8')
await db.exec(await read('20261017153000_people_first_last_name.sql'))
// Between the two: HR has set one person's first name.
await q(`update public.hr_staff_costs set first_name = 'Carrie' where id = $1`, [id(108)])
const migration = await read('20261017180000_first_name_is_the_given_name.sql')
await db.exec(migration)

const parts = async staff => (await q(`select first_name, last_name from public.hr_staff_costs where id = $1`, [staff]))[0]
const split = async name => (await q(`select first_name, last_name from public.person_name_parts($1)`, [name]))[0]

// 1. Everybody still on the first-word split is split again; the name HR set stays.
check(await q(`select employee_name, first_name, last_name from public.hr_staff_costs order by id`), [
  { employee_name: 'LOO WEN WEI', first_name: 'WEN WEI', last_name: 'LOO' },
  { employee_name: 'GOH JOEY', first_name: 'JOEY', last_name: 'GOH' },
  { employee_name: 'DANIEL', first_name: 'DANIEL', last_name: null },
  { employee_name: '  KELVIN   TAN ', first_name: 'KELVIN', last_name: 'TAN' },
  { employee_name: 'NUR AMIRA BINTI ISMAIL', first_name: 'NUR AMIRA', last_name: 'BINTI ISMAIL' },
  { employee_name: 'MEI LING', first_name: 'MEI LING', last_name: null },
  { employee_name: 'CHLOE LIM SU YIN', first_name: 'CHLOE', last_name: 'LIM SU YIN' },
  { employee_name: 'ONG SU MAY', first_name: 'Carrie', last_name: 'SU MAY' },
], 'the roster split again: LOO WEN WEI → WEN WEI · LOO; Carrie (HR’s) kept')

// 2. The split — the same cases as person-name.test.ts.
for (const [name, first, last] of [
  ['LOO WEN WEI', 'WEN WEI', 'LOO'], ['tan ah kow', 'ah kow', 'tan'], ['\tLOO\nWEN  WEI ', 'WEN WEI', 'LOO'],
  ['ANDY TING', 'ANDY', 'TING'], ['SIA DANIEL', 'DANIEL', 'SIA'], ['CHIN YAN', 'CHIN YAN', null],
  ['KEN TAN', 'KEN TAN', null], ['Finance Manager', 'Finance Manager', null], ['AHMAD FAIZ BIN ABU', 'AHMAD FAIZ', 'BIN ABU'],
  ['SITI NORA SYED HASSAN', 'SITI NORA', 'SYED HASSAN'], ['RAVI A/L KUMAR', 'RAVI', 'A/L KUMAR'], ['MARY ', 'MARY', null],
  ['', null, null], [null, null, null],
]) check(await split(name), { first_name: first, last_name: last }, `person_name_parts(${JSON.stringify(name)})`)

// 3. Somebody added later, and a corrected full name, take the new split.
await q(`insert into public.hr_staff_costs (id, employee_name) values ($1, 'TAN YONG HONG')`, [id(109)])
check(await parts(id(109)), { first_name: 'YONG HONG', last_name: 'TAN' }, 'a new person: the surname is the last name')
await q(`update public.hr_staff_costs set employee_name = 'LIM DANIEL' where id = $1`, [id(103)])
check(await parts(id(103)), { first_name: 'DANIEL', last_name: 'LIM' }, 'a corrected full name carries them along')
await q(`update public.hr_staff_costs set employee_name = 'ONG SU MAY TAN' where id = $1`, [id(108)])
check(await parts(id(108)), { first_name: 'Carrie', last_name: 'SU MAY' }, 'a first name HR set stays')

// 4. The snapshots: the record's first name, else the same split.
await db.exec(`select set_config('test.staff', '${id(102)}', false), set_config('test.uid', '${id(1)}', false)`)
check((await q(`select public.member_data_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'JOEY', 'a member: the first name the record keeps')
await q(`update public.hr_staff_costs set first_name = null, last_name = null where id = $1`, [id(102)])
check((await q(`select public.member_data_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'JOEY', 'a member with neither: the split, not the first word')
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'WEN WEI', 'the Principal: their People record’s first name')
await q(`update public.hr_staff_costs set status = 'inactive' where id = $1`, [id(101)])
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'WEN WEI', 'no active record: the login name split the same way')
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'name' as n`))[0].n, 'LOO WEN WEI', 'the full name is unchanged')

// 5. Swapped exactly once: run again, the fallback is gone and the migration refuses rather than guess.
await assert.rejects(db.exec(migration), /not there exactly once/)
checks++

// 6. The split stays the session's to call (the trigger runs as whoever writes the row), never anon's.
check((await q(`select has_function_privilege('authenticated', 'public.person_name_parts(text)', 'EXECUTE') a,
                       has_function_privilege('anon', 'public.person_name_parts(text)', 'EXECUTE') b`))[0],
  { a: true, b: false }, 'grants')

console.log(`first name is the given name: ${checks} checks passed`)
