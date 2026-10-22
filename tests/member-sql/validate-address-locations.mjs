// Local PostgreSQL regression for 20261020233000 (2026-10-20, an Attendance location's address in six parts — the user:
// "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填"). The att_* migrations run VERBATIM (030100, 030200), then
// 20261015200000 without its production guard, over the stand-ins validate-me-self-service.mjs uses; then production's
// own att_config and att_save_setting (address-locations-production.sql, md5-checked) and this migration, twice. What is
// under test: a location saved with the six parts keeps them and `address` is them on one line (address_compose, as for a
// person); its holiday state stays what the window sent; a new postcode puts the line together again, a new name alone
// leaves it; a page from before this change (`address` alone) changes no parts — and once there are parts, its text is
// not taken; an address cleared is every part NULL and ''; an older location keeps its own text; att_config hands the
// parts over by the keys the app reads (addressLine1 …); a part past its length is refused. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const HR_USER = id(1)
const ALL = ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve']
const as = async (uid, cells = []) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${cells.join(',')}', false)`)
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table auth.users (id uuid primary key, email text);
  create table public.users (id uuid primary key, email text unique, name text, is_active boolean not null default true, updated_at timestamptz);
  create table public.departments (id uuid primary key, name text);
  create table public.title_levels (id uuid primary key, rank smallint, name text);
  create table public.titles (id uuid primary key, name text, department_id uuid, is_active boolean default true, sort_order int default 0,
    level_id uuid, template_id uuid);
  create table public.hr_staff_costs (id uuid primary key, employee_name text, employee_code text, department_id uuid, title_id uuid,
    designation text, hire_date date, user_id uuid, reports_to uuid, status text not null default 'active', created_at timestamptz default now(),
    updated_at timestamptz, contact_number text, email text, address text, emergency_contact_name text, emergency_contact_phone text,
    emergency_contact_relationship text, bank_name text, bank_account_no text, nric text, basic_salary numeric);
  create function public.has_any_action(p_wants text[]) returns boolean language sql stable as $$
    select coalesce(string_to_array(nullif(current_setting('test.cells', true), ''), ',') && p_wants, false) $$;
  create function public.sees_sensitive(p_field text) returns boolean language sql stable as $$ select false $$;
  create function public.tab_write_guard(p_pages text[], p_wants text[]) returns void language sql as $$ select $$;
  create function public.tab_write_guard_sites(p_sites text[]) returns void language sql as $$ select $$;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
    p_keys text[] default null, p_labels text[] default null, p_ignore text[] default null, p_omit text[] default null,
    p_diff boolean default null, p_salary text[] default null, p_nric text[] default null, p_bank text[] default null,
    p_needs text default null, p_actor_column text default null, p_reason text default null) returns void language sql as $$ select $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null,
    title text not null, body text not null default '', ref_kind text not null, ref_id text not null, created_at timestamptz not null default now(),
    read_at timestamptz, push_taken_at timestamptz, pushed_at timestamptz, data jsonb,
    constraint app_notifications_kind_check check (kind = any (array['hiring', 'rooms', 'review', 'memo', 'crm'])),
    constraint app_notifications_ref_kind_check check (ref_kind = any (array['hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite'])));
  create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, endpoint text not null unique,
    p256dh text not null, auth text not null, app text not null);
  create function public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  returns void language sql as $$ select $$;
  create type public.hr_monthly_payroll_status as enum ('draft', 'completed', 'submitted', 'paid');
  create table public.hr_monthly_payroll (id uuid primary key default gen_random_uuid(), staff_id uuid, period_month date,
    basic_salary numeric default 0, ot_hours numeric default 0, ot_amount numeric default 0, unpaid_leave_days numeric default 0,
    attendance_figures jsonb, status public.hr_monthly_payroll_status not null default 'draft');
`)
await db.exec(`
  insert into auth.users (id, email) values ('${HR_USER}', 'hr@x.my');
  insert into public.users (id, email, name) values ('${HR_USER}', 'hr@x.my', 'HR');
`)
for (const file of ['20261015030100_attendance.sql', '20261015030200_attendance_functions.sql'])
  await db.exec(await readFile(new URL(file, migrations), 'utf8'))
const guard = /DO \$guard\$[\s\S]*?\$guard\$;\n/
const answers = await text(new URL('20261015200000_attendance_answers.sql', migrations))
assert.ok(guard.test(answers), '20261015200000 opens with its production guard')
await db.exec(answers.replace(guard, ''))

// address_compose, as mig 20261020230000 makes it (the person's address in six parts).
const structured = await text(new URL('20261020230000_structured_address.sql', migrations))
const compose = structured.match(/CREATE OR REPLACE FUNCTION public\.address_compose[\s\S]*?\n\$\$;\n/)
assert.ok(compose, '20261020230000 holds address_compose')
await db.exec(compose[0])

// Production's own two bodies, md5-checked (production's prosrc ends its lines \r\n; stored and checked as \n).
await db.exec(await text(new URL('./address-locations-production.sql', import.meta.url)))
const md5 = async name => (await q(`select md5(prosrc) m from pg_proc where proname = $1`, [name]))[0].m
check([await md5('att_config'), await md5('att_save_setting')], ['96b522635bd6aee46ac7fa12d8e95a7c', '64ba00fff4126f15e85a4b1dfcc5b95f'],
  "production's att_config and att_save_setting, as they were read")

const MIGRATION = await text(new URL('20261020233000_address_attendance_locations.sql', migrations))
await db.exec(MIGRATION)
const swapped = [await md5('att_config'), await md5('att_save_setting')]
check(swapped.some((m, i) => m === ['96b522635bd6aee46ac7fa12d8e95a7c', '64ba00fff4126f15e85a4b1dfcc5b95f'][i]), false, 'both bodies swapped')
await db.exec(MIGRATION)
check([await md5('att_config'), await md5('att_save_setting')], swapped, 'a second run changes nothing')

// ── Saved with its parts ─────────────────────────────────────────────────────
await as(HR_USER, ALL)
const save = async (locationId, row) => (await q(`select public.att_save_setting('location', $1, $2::jsonb) r`, [locationId, JSON.stringify(row)]))[0].r
const row = async locationId => (await q(`select name, address, state, address_line1, address_line2, address_postcode, address_city, address_state,
  address_country from public.att_locations where id = $1`, [locationId]))[0]
const parts = { addressLine1: 'No 83, Jalan Jambu 3', addressLine2: 'Taman Paya Terubong', addressPostcode: '11060', addressCity: 'Paya Terubong',
  addressState: 'Pulau Pinang', addressCountry: 'Malaysia' }
const penang = (await save(null, { name: 'Penang branch', ...parts, state: 'Penang', radius: 150, lat: 5.39, lng: 100.27 })).id
check(await row(penang), {
  name: 'Penang branch', address: 'No 83, Jalan Jambu 3, Taman Paya Terubong, 11060 Paya Terubong, Pulau Pinang, Malaysia', state: 'Penang',
  address_line1: 'No 83, Jalan Jambu 3', address_line2: 'Taman Paya Terubong', address_postcode: '11060', address_city: 'Paya Terubong',
  address_state: 'Pulau Pinang', address_country: 'Malaysia',
}, 'a new location keeps its six parts and its holiday state; address is them on one line')

const located = (await q(`select public.att_config() c`))[0].c.locations.find(l => l.id === penang)
check([located.addressLine1, located.addressLine2, located.addressPostcode, located.addressCity, located.addressState, located.addressCountry,
  located.address, located.state],
  [...Object.values(parts), 'No 83, Jalan Jambu 3, Taman Paya Terubong, 11060 Paya Terubong, Pulau Pinang, Malaysia', 'Penang'],
  'att_config hands each location its parts by the keys the app reads')

// ── Edited ───────────────────────────────────────────────────────────────────
await save(penang, { name: 'Penang branch', ...parts, addressLine2: '', addressPostcode: '14000', addressCity: 'Bukit Mertajam', state: 'Penang',
  radius: 150 })
check((await row(penang)).address, 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia', 'a new postcode and city: the line again')
check((await row(penang)).address_line2, null, 'a blank part is NULL')

await save(penang, { name: 'Penang BM', ...parts, addressLine2: '', addressPostcode: '14000', addressCity: 'Bukit Mertajam', state: 'Penang',
  radius: 200 })
check([(await row(penang)).name, (await row(penang)).address], ['Penang BM', 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia'],
  'a new name alone leaves the line')

// A page from before this change sends `address` alone: the parts stay, and so does the line they make.
await save(penang, { name: 'Penang BM', address: 'Somewhere typed', state: 'Penang', radius: 200 })
check([(await row(penang)).address_postcode, (await row(penang)).address], ['14000', 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia'],
  'once there are parts, an old page’s text is not taken and no part is cleared')

// Cleared.
await save(penang, { name: 'Penang BM', addressLine1: null, addressLine2: null, addressPostcode: null, addressCity: null, addressState: null,
  addressCountry: null, state: 'Penang', radius: 200 })
const cleared = await row(penang)
check([cleared.address, cleared.address_line1, cleared.address_postcode, cleared.address_country, cleared.state], ['', null, null, null, 'Penang'],
  'an address cleared is every part NULL and an empty line; the holiday state stays')

// ── An older location keeps its own text ─────────────────────────────────────
const hq = (await save(null, { name: 'HQ', address: 'Jalan Puchong', state: 'Selangor', radius: 150 })).id
check([(await row(hq)).address, (await row(hq)).address_line1], ['Jalan Puchong', null], 'a location saved the old way keeps its own text')
await save(hq, { name: 'HQ', address: 'Lot 5, Jalan Puchong', state: 'Selangor', radius: 150 })
check((await row(hq)).address, 'Lot 5, Jalan Puchong', '…and an old page may still change it while it has no parts')
await save(hq, { name: 'HQ', addressLine1: 'Lot 5, Jalan Puchong', addressLine2: '', addressPostcode: '47100', addressCity: 'Puchong',
  addressState: 'Selangor', addressCountry: 'Malaysia', state: 'Selangor', radius: 150 })
check((await row(hq)).address, 'Lot 5, Jalan Puchong, 47100 Puchong, Selangor, Malaysia', 'written in parts, its line is theirs')

// ── Lengths ──────────────────────────────────────────────────────────────────
await refuses(`select public.att_save_setting('location', null, $1::jsonb)`,
  [JSON.stringify({ name: 'Long', ...parts, addressLine1: 'x'.repeat(201), state: 'Penang', radius: 150 })],
  /att_locations_address_parts_check/, 'a line past 200 characters is refused')
await save(null, { name: 'Long but fine', ...parts, addressLine1: 'x'.repeat(200), addressLine2: 'y'.repeat(200), state: 'Penang', radius: 150 })
check((await q(`select max(length(address)) n from public.att_locations`))[0].n > 400, true, 'a line past the old 200 fits the new CHECK')

// ── Only Attendance · Edit ───────────────────────────────────────────────────
await as(HR_USER, ['attendance.view'])
await refuses(`select public.att_save_setting('location', null, $1::jsonb)`, [JSON.stringify({ name: 'Nope', ...parts, state: 'Penang' })],
  /Attendance · Edit/, 'saving a location still needs Attendance · Edit')

console.log(`validate-address-locations: ${checks} checks passed`)
