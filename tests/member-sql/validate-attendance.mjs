// Local PostgreSQL regression for 20261015030100 (2026-10-15, HR › Attendance). The tables the module reads from outside
// itself are production's shapes cut to the columns it reads; has_any_action and audit_register are stand-ins (a test
// setting holds the caller's cells). What is under test: the migration loads; the readers refuse a caller without
// Attendance · View; a request takes the route it should (upline with a login first, else HR) and HR may decide the
// upline's step on their behalf; nobody decides their own; a rejection needs a note; Use leave (booked) is approved on
// the spot; a closed month refuses corrections and reopens with a reason; the OT rate refuses less than the Act's
// minimum; a schedule in use is not deleted. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const HR_USER = id(1), UP_USER = id(2), ANN_USER = id(3)
const S = { hr: id(101), up: id(102), ann: id(103), bob: id(104) }
const as = async (uid, cells) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${(cells ?? []).join(',')}', false)`)
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, email text, name text);
  create table public.departments (id uuid primary key, name text);
  create table public.title_levels (id uuid primary key, rank smallint, name text);
  create table public.titles (id uuid primary key, name text, department_id uuid, is_active boolean default true, sort_order int default 0,
    level_id uuid, template_id uuid);
  create table public.hr_staff_costs (id uuid primary key, employee_name text, employee_code text, department_id uuid, title_id uuid,
    designation text, hire_date date, user_id uuid, reports_to uuid, status text not null default 'active', created_at timestamptz default now());
  create function public.has_any_action(p_wants text[]) returns boolean language sql stable as $$
    select coalesce(string_to_array(nullif(current_setting('test.cells', true), ''), ',') && p_wants, false) $$;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
    p_keys text[] default null, p_labels text[] default null, p_ignore text[] default null, p_omit text[] default null,
    p_diff boolean default null, p_salary text[] default null, p_nric text[] default null, p_bank text[] default null,
    p_needs text default null, p_actor_column text default null, p_reason text default null) returns void language sql as $$ select $$;
`)
await db.exec(`
  insert into public.users values ('${HR_USER}', 'hr@x', 'HR'), ('${UP_USER}', 'up@x', 'Upline'), ('${ANN_USER}', 'ann@x', 'Ann');
  insert into public.hr_staff_costs (id, employee_name, user_id, reports_to) values
    ('${S.hr}', 'Siti', '${HR_USER}', null),
    ('${S.up}', 'Daniel', '${UP_USER}', null),
    ('${S.ann}', 'Ann', '${ANN_USER}', '${S.up}'),
    ('${S.bob}', 'Bob', null, '${S.hr}');
`)
for (const file of ['20261015030100_attendance.sql', '20261015030200_attendance_functions.sql'])
  await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))

// Readers ask Attendance · View.
await as(ANN_USER, [])
await refuses('select public.att_config()', [], /Attendance · View/, 'config refuses without View')
await as(HR_USER, ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve'])
const config = (await q('select public.att_config() c'))[0].c
check(config.people.length, 4, 'config lists the active people')
check(config.otRates.length, 4, 'the Act minimums are seeded')

// A leave type routed upline → HR.
await q(`select public.att_save_setting('leave', null, '{"code":"UL","name":"Unpaid","route":"upline_then_hr","unpaid":true}'::jsonb)`)
await q(`select public.att_save_setting('leave', null, '{"code":"AL","name":"Annual leave","route":"upline_only","accrues":true,"groups":[{"titles":["all"],"levels":["all"],"base":8,"steps":[{"yrs":2,"days":12}]}]}'::jsonb)`)

// Ann sends her own unpaid leave: her upline has a login → upline waiting, HR queued.
await as(ANN_USER, [])
const r1 = (await q(`select public.att_create_request('${S.ann}', 'leave', 'UL', '2026-11-02', '2026-11-03', 2, null, '{}', 'Personal matter') r`))[0].r
const steps1 = await q(`select role, state from public.att_request_steps where request_id = $1 order by seq`, [r1.id])
check(steps1, [{ role: 'upline', state: 'waiting' }, { role: 'hr', state: 'queued' }], 'upline first, HR queued')
check(/^LV-\d{4}-\d{3}$/.test(r1.ref), true, 'the reference reads LV-YYMM-NNN')
await refuses(`select public.att_decide('${r1.id}', true, '')`, [], /their own request/, 'nobody decides their own')

// HR decides the upline's step on their behalf; HR's own step arrives.
await as(HR_USER, ['attendance.view', 'attendance.approve'])
await q(`select public.att_decide('${r1.id}', true, '')`)
check(await q(`select role, state, on_behalf from public.att_request_steps where request_id = $1 order by seq`, [r1.id]),
  [{ role: 'upline', state: 'approved', on_behalf: true }, { role: 'hr', state: 'waiting', on_behalf: false }], 'upline approved on behalf, HR waiting')
await refuses(`select public.att_decide('${r1.id}', false, '  ')`, [], /note is needed/, 'a rejection needs a note')
await q(`select public.att_decide('${r1.id}', true, '')`)
check((await q(`select status from public.att_requests where id = $1`, [r1.id]))[0].status, 'approved', 'approved after the last step')

// The upline decides themselves (no Approve cell): only their own step.
await as(ANN_USER, [])
const r2 = (await q(`select public.att_create_request('${S.ann}', 'leave', 'AL', '2026-11-05', '2026-11-05', 1, null, '{}', 'Trip') r`))[0].r
await as(UP_USER, [])
await q(`select public.att_decide('${r2.id}', false, 'Busy week')`)
check((await q(`select status from public.att_requests where id = $1`, [r2.id]))[0].status, 'rejected', 'the upline rejects with a note')

// Bob's upline (Siti) — HR's own record — has a login, so his leave waits at Siti.
// HR books leave for Bob straight away: approved on the spot, one HR step.
await as(HR_USER, ['attendance.view', 'attendance.create'])
const r3 = (await q(`select public.att_create_request('${S.bob}', 'leave', 'AL', '2026-11-09', '2026-11-10', 2, null, '{}', 'Called in sick', true) r`))[0].r
check((await q(`select status, on_behalf from public.att_requests where id = $1`, [r3.id]))[0], { status: 'approved', on_behalf: true }, 'booked leave is approved')
check(await q(`select role, state from public.att_request_steps where request_id = $1`, [r3.id]), [{ role: 'hr', state: 'approved' }], 'one HR step')
await as(HR_USER, ['attendance.view'])
await refuses(`select public.att_create_request('${S.bob}', 'leave', 'AL', '2026-11-09', '2026-11-10', 2, null, '{}', 'x')`, [],
  /Attendance · Create/, 'sending for somebody else needs Create')

// Corrections, a closed month, reopening.
await as(HR_USER, ['attendance.view', 'attendance.edit'])
await refuses(`select public.att_set_days(array['${S.ann}']::uuid[], '2026-10-01', '2026-10-01', 'P', '09:00', '18:00', ' ')`, [], /reason is required/, 'a correction needs a reason')
check((await q(`select public.att_set_days(array['${S.ann}','${S.bob}']::uuid[], '2026-10-01', '2026-10-02', 'P', '09:00', '18:00', 'Machine offline') r`))[0].r.cells, 4, 'two people × two days')
await q(`select public.att_close_month('2026-10-01', '[{"staffId":"x"}]'::jsonb)`)
await refuses(`select public.att_set_days(array['${S.ann}']::uuid[], '2026-10-05', '2026-10-05', 'A', null, null, 'x')`, [], /closed/, 'a closed month refuses corrections')
await refuses(`select public.att_reopen_month('2026-10-01', '')`, [], /reason is required/, 'reopening needs a reason')
await q(`select public.att_reopen_month('2026-10-01', 'Late MC')`)
check((await q(`select status from public.att_months where month = '2026-10-01'`))[0].status, 'open', 'reopened')

// OT rates never below the Act; a schedule in use stays.
await refuses(`select public.att_save_setting('ot', null, '{"dayType":"rest","multiplier":1.5}'::jsonb)`, [], /minimum/, 'no rate below the Act')
await q(`select public.att_save_setting('ot', null, '{"dayType":"rest","multiplier":2.5}'::jsonb)`)
const sch = (await q(`select public.att_save_setting('schedule', null, $1::jsonb) r`, [JSON.stringify({ name: 'Office 9–6', days: Array.from({ length: 7 }, (_, i) => ({ day: i, type: i < 5 ? 'work' : 'off', start: '09:00', end: '18:00', break: 60 })) })]))[0].r
await q(`select public.att_save_setting('assignment', null, $1::jsonb)`, [JSON.stringify({ level: 'company', label: 'HOUZS Venture', mode: 'clock', scheduleId: sch.id, from: '2026-11-01' })])
await refuses(`select public.att_delete_setting('schedule', '${sch.id}')`, [], /in use/, 'a schedule in use is not deleted')

console.log(`attendance: ${checks} checks passed`)
// ATT_MD5=1 prints each att_* function's md5(prosrc), to compare with production's after applying.
if (process.env.ATT_MD5) console.log((await q(`select string_agg(proname || '=' || left(md5(prosrc), 8), ' ' order by proname) s from pg_proc where pronamespace = 'public'::regnamespace and proname like 'att\\_%'`))[0].s)
