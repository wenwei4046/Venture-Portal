// Local PostgreSQL regression for 20261017153000 (2026-10-17 — the user: "大家的名字需要拆分为 first name 和 last
// name … 只放 first name"): every person gets a first and a last name from their full name (the first word, the
// rest), somebody added later too, a corrected full name carries them along only while they were its parts, and the
// Revenue app's two snapshots hand `profile.firstName` — swapped in place, exactly once. The migration runs VERBATIM
// over stand-ins for the table and for the snapshots' profile statements as production writes them. No live I/O.
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
  -- The two snapshots, their profile statements as production has them (the rest of each is beside the point here).
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

// The roster as it is written today.
await db.exec(`
  insert into public.users (id, name, email, role) values
    ('${id(1)}', 'LOO WEN WEI', 'boss@example.com', 'principal'),
    ('${id(2)}', 'WONG JOEY', 'joey@example.com', 'finance');
  insert into public.hr_staff_costs (id, employee_name, user_id) values
    ('${id(101)}', 'LOO WEN WEI', '${id(1)}'),
    ('${id(102)}', 'WONG JOEY', '${id(2)}'),
    ('${id(103)}', 'PETER', null),
    ('${id(104)}', 'ESTHER ', null),
    ('${id(105)}', 'NUR AIN MASTURINA BINTI MOHD JUSAIDI', null),
    ('${id(106)}', '  JAMES   SEOW ', null);
`)

const migration = await readFile(new URL('../../supabase/migrations/20261017153000_people_first_last_name.sql', import.meta.url), 'utf8')
await db.exec(migration)

const parts = async staff => (await q(`select first_name, last_name from public.hr_staff_costs where id = $1`, [staff]))[0]

// 1. Everybody filled from their full name: the first word, then the rest.
check(await q(`select employee_name, first_name, last_name from public.hr_staff_costs order by id`), [
  { employee_name: 'LOO WEN WEI', first_name: 'LOO', last_name: 'WEN WEI' },
  { employee_name: 'WONG JOEY', first_name: 'WONG', last_name: 'JOEY' },
  { employee_name: 'PETER', first_name: 'PETER', last_name: null },
  { employee_name: 'ESTHER ', first_name: 'ESTHER', last_name: null },
  { employee_name: 'NUR AIN MASTURINA BINTI MOHD JUSAIDI', first_name: 'NUR', last_name: 'AIN MASTURINA BINTI MOHD JUSAIDI' },
  { employee_name: '  JAMES   SEOW ', first_name: 'JAMES', last_name: 'SEOW' },
], 'the roster filled: LOO WEN WEI → LOO · WEN WEI, PETER → PETER · none, spaces tidied')

// 2. Somebody added later is filled the same way; given names are kept.
await q(`insert into public.hr_staff_costs (id, employee_name) values ($1, 'TAN YONG HONG')`, [id(107)])
check(await parts(id(107)), { first_name: 'TAN', last_name: 'YONG HONG' }, 'a new person is filled from the full name')
await q(`insert into public.hr_staff_costs (id, employee_name, first_name, last_name) values ($1, 'ONG MEI SHUANG', 'Carrie', 'ONG')`, [id(108)])
check(await parts(id(108)), { first_name: 'Carrie', last_name: 'ONG' }, 'a new person given a first name keeps it')

// 3. A corrected full name carries them along — only while they were its parts.
await q(`update public.hr_staff_costs set employee_name = 'PETER LIM' where id = $1`, [id(103)])
check(await parts(id(103)), { first_name: 'PETER', last_name: 'LIM' }, 'the full name corrected: the two follow it')
await q(`update public.hr_staff_costs set first_name = 'JOEY', last_name = 'WONG' where id = $1`, [id(102)])
await q(`update public.hr_staff_costs set employee_name = 'WONG JOEY KAI' where id = $1`, [id(102)])
check(await parts(id(102)), { first_name: 'JOEY', last_name: 'WONG' }, 'a first name HR set stays when the full name changes')
await q(`update public.hr_staff_costs set employee_name = 'LOO WEN WEI SR', first_name = 'WEN WEI' where id = $1`, [id(101)])
check(await parts(id(101)), { first_name: 'WEN WEI', last_name: 'WEN WEI' }, 'a save that sends both keeps what it sent')
await q(`update public.hr_staff_costs set employee_name = 'LOO WEN WEI' where id = $1`, [id(101)])
check(await parts(id(101)), { first_name: 'WEN WEI', last_name: 'WEN WEI' }, '…and a later name change leaves them, no longer its parts')

// 4. The checks hold a first name to something.
await assert.rejects(q(`update public.hr_staff_costs set first_name = '  ' where id = $1`, [id(104)]), /first_name_check/)
checks++

// 5. The snapshots hand profile.firstName: the record's, else the full name's first word.
await db.exec(`select set_config('test.staff', '${id(102)}', false), set_config('test.uid', '${id(1)}', false)`)
check((await q(`select public.member_data_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'JOEY', 'a member: the first name the record keeps')
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'WEN WEI', 'the Principal: their own People record’s first name')
await q(`update public.hr_staff_costs set status = 'inactive' where id = $1`, [id(101)])
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'firstName' as f`))[0].f, 'LOO', 'no active record: the login name’s first word')
check((await q(`select public.member_principal_snapshot(true) -> 'profile' ->> 'name' as n`))[0].n, 'LOO WEN WEI', 'the full name is unchanged')

// 6. Swapped exactly once: run again, the statement is gone and the migration refuses rather than guess.
await assert.rejects(db.exec(migration), /not there exactly once/)
checks++

// 7. Read like every other column of the row; the split helper is the session's to call (the trigger runs as it).
check((await q(`select has_column_privilege('authenticated', 'public.hr_staff_costs', 'first_name', 'SELECT') a,
                       has_column_privilege('authenticated', 'public.hr_staff_costs', 'last_name', 'SELECT') b,
                       has_function_privilege('authenticated', 'public.person_name_parts(text)', 'EXECUTE') c,
                       has_function_privilege('anon', 'public.person_name_parts(text)', 'EXECUTE') d`))[0],
  { a: true, b: true, c: true, d: false }, 'grants')

console.log(`first and last name: ${checks} checks passed`)
