// Local PostgreSQL regression for 20261015200000 (2026-10-15, HR › Attendance — the user's answers): the wage line
// kept on the policy; a profile change kept as the fields it may change, never ending at the upline, written to the
// People record on HR's approval and on nothing else; an account number shown as •••• to a reader without the bank
// tick; the `attendance` bucket's two policies, a punch photo and a request's file only from the caller's own folder;
// a file named for the portal's link only to Attendance · View; Remind all — a notice to each person still not in
// who has a login, not again within ten minutes, never in a bell. The att_* migrations run VERBATIM (030100, 030200),
// then this one without its production guard (its md5s are production's bodies, which 050000 and the notifications
// migrations made), over stand-ins for the tables they read. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const HR_USER = id(1), UP_USER = id(2), ANN_USER = id(3), CHEW_USER = id(4)
const S = { hr: id(101), up: id(102), ann: id(103), bob: id(104), chew: id(105) }
const ALL = ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve']
const as = async (uid, cells = [], sensitive = []) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${cells.join(',')}', false),
                        set_config('test.sensitive', '${sensitive.join(',')}', false)`)
}
const today = (await q(`select (now() at time zone 'Asia/Kuala_Lumpur')::date::text d`))[0].d

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, email text, name text, is_active boolean not null default true);
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
  create function public.sees_sensitive(p_field text) returns boolean language sql stable as $$
    select p_field = any (coalesce(string_to_array(nullif(current_setting('test.sensitive', true), ''), ','), '{}')) $$;
  create function public.tab_write_guard(p_pages text[], p_wants text[]) returns void language sql as $$ select $$;
  create function public.tab_write_guard_sites(p_sites text[]) returns void language sql as $$ select $$;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
    p_keys text[] default null, p_labels text[] default null, p_ignore text[] default null, p_omit text[] default null,
    p_diff boolean default null, p_salary text[] default null, p_nric text[] default null, p_bank text[] default null,
    p_needs text default null, p_actor_column text default null, p_reason text default null) returns void language sql as $$ select $$;
  -- Storage, as far as the bucket and its policies need it.
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  -- Notifications, production's shape (20261011180000 + 20261014030000).
  create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null,
    title text not null, body text not null default '', ref_kind text not null, ref_id text not null, created_at timestamptz not null default now(),
    read_at timestamptz, push_taken_at timestamptz, pushed_at timestamptz, data jsonb,
    constraint app_notifications_kind_check check (kind = any (array['hiring', 'rooms', 'review', 'memo', 'crm'])),
    constraint app_notifications_ref_kind_check check (ref_kind = any (array['hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite'])));
  create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, endpoint text not null unique,
    p256dh text not null, auth text not null, app text not null);
  create function public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  returns void language plpgsql security definer set search_path = public as $fn$
  begin
    insert into public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
    select u.id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id
      from public.users u
     where u.id in (select distinct x from unnest(p_users) x where x is not null) and u.is_active and u.id is distinct from auth.uid();
  end
  $fn$;
`)
await db.exec(`
  insert into public.users (id, email, name) values ('${HR_USER}', 'hr@x', 'HR'), ('${UP_USER}', 'up@x', 'Upline'), ('${ANN_USER}', 'ann@x', 'Ann'),
    ('${CHEW_USER}', 'chew@x', 'Chew');
  insert into public.hr_staff_costs (id, employee_name, user_id, reports_to, contact_number, address, bank_name, bank_account_no) values
    ('${S.hr}', 'Siti', '${HR_USER}', null, null, null, null, null),
    ('${S.up}', 'Daniel', '${UP_USER}', null, null, null, null, null),
    ('${S.ann}', 'Ann', '${ANN_USER}', '${S.up}', '012-345 6789', '1 Jalan Satu', 'Maybank', '112233445566'),
    ('${S.bob}', 'Bob', null, '${S.hr}', null, null, null, null),
    ('${S.chew}', 'Chew', '${CHEW_USER}', null, null, null, null, null);
`)
for (const file of ['20261015030100_attendance.sql', '20261015030200_attendance_functions.sql'])
  await db.exec(await readFile(new URL(file, migrations), 'utf8'))
const answers = (await readFile(new URL('20261015200000_attendance_answers.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
const guard = /DO \$guard\$[\s\S]*?\$guard\$;\n/
assert.ok(guard.test(answers), 'the migration opens with its production guard')
await db.exec(answers.replace(guard, ''))
// …and runs again without harm (its policies and constraints drop first; the column is IF NOT EXISTS).
await db.exec(answers.replace(guard, ''))

// ── 1. The wage line ────────────────────────────────────────────────────────
await as(HR_USER, ALL)
const policy = { fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80,
  otFlagH: 104, otBase: 'basic', photoKeepDays: 90 }
await q(`select public.att_save_setting('policy', null, $1::jsonb)`, [JSON.stringify({ ...policy, from: '2026-12-01' })])
check((await q(`select ot_wage_cap::text c from public.att_policy where effective_from = '2026-12-01'`))[0].c, '4000.00', 'a policy without a line takes RM 4,000')
await q(`select public.att_save_setting('policy', null, $1::jsonb)`, [JSON.stringify({ ...policy, from: '2027-01-01', otWageCap: 4500 })])
check((await q(`select public.att_config() c`))[0].c.policies.map(p => [p.from, Number(p.otWageCap)]),
  [['2026-11-01', 4000], ['2026-12-01', 4000], ['2027-01-01', 4500]], 'att_config hands each version its line — the seeded one RM 4,000 too')
await q(`select public.att_save_setting('policy', null, $1::jsonb)`, [JSON.stringify({ ...policy, from: '2027-02-01' })])
check((await q(`select ot_wage_cap::text c from public.att_policy where effective_from = '2027-02-01'`))[0].c, '4500.00', 'a version without a line keeps the latest')
await refuses(`select public.att_save_setting('policy', null, $1::jsonb)`, [JSON.stringify({ ...policy, from: '2027-03-01', otWageCap: -1 })], /check/i,
  'no line below zero')

// ── 2. Profile changes ──────────────────────────────────────────────────────
const profile = async (staff, changes, extra = '') =>
  (await q(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'Moved house' ${extra}) r`,
    [staff, JSON.stringify({ changes })]))[0].r
await as(ANN_USER, [])
const seq = async () => (await q(`select last_value::int v, is_called c from public.att_request_seq`))[0]
const seqBefore = await seq()
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`, [S.ann, JSON.stringify({ changes: [] })],
  /at least one field/, 'a profile change names a field')
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`,
  [S.ann, JSON.stringify({ changes: [{ key: 'basic_salary', to: '9000' }] })], /not changed by request/, 'pay is not a profile field')
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`,
  [S.ann, JSON.stringify({ changes: [{ key: 'address', to: 'A' }, { key: 'address', to: 'B' }] })], /named twice/, 'a field once')
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`,
  [S.ann, JSON.stringify({ changes: [{ key: 'contact_number', to: 'call me' }] })], /phone number/, 'a phone is digits')
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`,
  [S.ann, JSON.stringify({ changes: [{ key: 'bank_account_no', to: '12-ab' }] })], /5 to 20 digits/, 'an account number is digits')
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x')`,
  [S.ann, JSON.stringify({ changes: [{ key: 'address', to: '1 Jalan Satu' }] })], /already says that/, 'nothing to change is refused')
check(await seq(), seqBefore, 'a refused change takes no reference number')

// No route for PF: HR only.
const p1 = await profile(S.ann, [{ key: 'contact_number', to: '019-876 5432' }, { key: 'bank_account_no', to: '5123 4567-8901' }, { key: 'address', to: '1 Jalan Satu' }])
const d1 = (await q(`select detail, route from public.att_requests where id = $1`, [p1.id]))[0]
check(d1.detail.changes, [
  { key: 'contact_number', field: 'Phone', from: '012-345 6789', to: '019-876 5432' },
  { key: 'bank_account_no', field: 'Bank account', from: '112233445566', to: '512345678901' },
], 'kept as label, on record, asked for — the unchanged address dropped, the account number in digits')
check(d1.route, 'hr_only', 'a profile change with no route of its own goes to HR')
// A route of Upline only becomes Upline → HR: the account number never rests on the upline alone.
await as(HR_USER, ALL)
await q(`select public.att_save_setting('route', null, '{"scope":"company","kinds":["PF"],"label":"Profile change","route":"upline_only","why":"x"}'::jsonb)`)
await as(ANN_USER, [])
const p2 = await profile(S.ann, [{ key: 'emergency_contact_name', to: 'Mak' }])
check((await q(`select route from public.att_requests where id = $1`, [p2.id]))[0].route, 'upline_then_hr', 'Upline only becomes Upline → HR')
check(await q(`select role, state from public.att_request_steps where request_id = $1 order by seq`, [p2.id]),
  [{ role: 'upline', state: 'waiting' }, { role: 'hr', state: 'queued' }], 'the upline first, HR last')
await as(HR_USER, ['attendance.view', 'attendance.create'])
await refuses(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'x', true)`,
  [S.ann, JSON.stringify({ changes: [{ key: 'address', to: 'B' }] })], /never booked/, 'a profile change is never booked')

// The reader: •••• for the account number unless the title ticks bank accounts.
const listed = async sensitive => {
  await as(HR_USER, ['attendance.view'], sensitive)
  return (await q(`select public.att_requests_list() l`))[0].l.find(r => r.id === p1.id).detail.changes
}
check((await listed([])).map(c => [c.key, c.from, c.to]), [['contact_number', '012-345 6789', '019-876 5432'], ['bank_account_no', '••••', '••••']],
  'no bank tick: the account number is ••••')
check((await listed(['bank'])).find(c => c.key === 'bank_account_no').to, '512345678901', 'the bank tick sees it')

// Approved by the upline: nothing changes yet; by HR: the two fields, and only they.
await as(UP_USER, [])
await q(`select public.att_decide($1, true, '')`, [p2.id])
check((await q(`select emergency_contact_name n from public.hr_staff_costs where id = $1`, [S.ann]))[0].n, null, 'the upline’s approval writes nothing')
await as(HR_USER, ALL)
await q(`select public.att_decide($1, true, '')`, [p2.id])
check((await q(`select emergency_contact_name n from public.hr_staff_costs where id = $1`, [S.ann]))[0].n, 'Mak', 'HR’s approval writes it')
await q(`update public.hr_staff_costs set address = '9 Jalan Baru' where id = $1`, [S.ann])
await q(`select public.att_decide($1, true, '')`, [p1.id])
check((await q(`select contact_number, bank_account_no, address, bank_name from public.hr_staff_costs where id = $1`, [S.ann]))[0],
  { contact_number: '019-876 5432', bank_account_no: '512345678901', address: '9 Jalan Baru', bank_name: 'Maybank' },
  'the asked fields only — an address changed meanwhile stays')
check((await q(`select what, note from public.att_events where entity = 'request' and entity_key = $1 order by id`, [p1.id])).map(e => e.what),
  ['Submitted', 'Approved by HR', 'Record updated'], 'the trail: approved, then the record updated')
// A rejection writes nothing.
await as(ANN_USER, [])
const p3 = await profile(S.ann, [{ key: 'address', to: '7 Lorong Tujuh' }])
await as(HR_USER, ALL)
await q(`select public.att_decide($1, false, 'Send the utility bill')`, [p3.id])
check((await q(`select address from public.hr_staff_costs where id = $1`, [S.ann]))[0].address, '9 Jalan Baru', 'a rejected change writes nothing')

// ── 3. Files ────────────────────────────────────────────────────────────────
check((await q(`select id, public, file_size_limit::int s from storage.buckets where id = 'attendance'`))[0], { id: 'attendance', public: false, s: 10485760 },
  'the bucket is private, 10 MB a file')
const pol = async name => (await q(`select cmd, roles::text[] roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = $1`, [name]))[0]
const read = await pol('attendance_files_read')
check([read.cmd, read.roles], ['SELECT', ['authenticated']], 'the read policy is signed-in readers’')
check(/attendance\.view/.test(read.qual) && /foldername/.test(read.qual) && /auth\.uid\(\)/.test(read.qual), true, 'Attendance · View, or the file’s own person')
const up = await pol('attendance_files_upload')
check([up.cmd, /'punch'/.test(up.with_check) && /'request'/.test(up.with_check) && /auth\.uid\(\)/.test(up.with_check)], ['INSERT', true],
  'an upload goes into the caller’s own punch / request folder')
check(await q(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'attendance%' and cmd in ('UPDATE', 'DELETE')`), [],
  'nobody overwrites or deletes')

// A punch's photo: only an object the caller filed in their own folder.
await as(ANN_USER, [])
await refuses(`select public.att_punch('in', null, null, null, 'phone', $1, '', 'app')`, [`punch/${ANN_USER}/a.jpg`], /not filed/, 'a photo that is not there')
await q(`insert into storage.objects (bucket_id, name, owner) values ('attendance', $1, $2), ('attendance', $3, $4)`,
  [`punch/${ANN_USER}/a.jpg`, ANN_USER, `punch/${CHEW_USER}/b.jpg`, CHEW_USER])
await refuses(`select public.att_punch('in', null, null, null, 'phone', $1, '', 'app')`, [`punch/${CHEW_USER}/b.jpg`], /not filed/, 'somebody else’s photo')
await refuses(`select public.att_punch('in', null, null, null, 'phone', $1, '', 'app')`, [`punch/${ANN_USER}/../${CHEW_USER}/b.jpg`], /not filed/, 'no climbing out')
const punch = (await q(`select public.att_punch('in', null, null, null, 'phone', $1, '', 'app') p`, [`punch/${ANN_USER}/a.jpg`]))[0].p
check(typeof punch.id, 'string', 'a punch with its own photo')
await q(`select public.att_punch('out', null, null, null, 'phone', null, '', 'app')`)

// A request's file: its person's, on a request still waiting, from their own folder.
await q(`insert into storage.objects (bucket_id, name, owner) values ('attendance', $1, $2)`, [`request/${ANN_USER}/mc.pdf`, ANN_USER])
await as(HR_USER, ALL)
await q(`select public.att_save_setting('leave', null, '{"code":"SL","name":"Sick leave","route":"hr_only"}'::jsonb)`)
await as(ANN_USER, [])
const sick = (await q(`select public.att_create_request($1, 'leave', 'SL', '2026-11-02', '2026-11-02', 1, null, '{}', 'Fever') r`, [S.ann]))[0].r
await refuses(`select public.att_request_attach($1, $2, 'mc.pdf')`, [sick.id, `request/${CHEW_USER}/mc.pdf`], /not filed/, 'only from the caller’s own folder')
await q(`select public.att_request_attach($1, $2, 'MC 2 Nov.pdf')`, [sick.id, `request/${ANN_USER}/mc.pdf`])
check((await q(`select attachment_path p, attachment_name n from public.att_requests where id = $1`, [sick.id]))[0], { p: `request/${ANN_USER}/mc.pdf`, n: 'MC 2 Nov.pdf' },
  'the file is on the request')
await as(CHEW_USER, [])
await refuses(`select public.att_request_attach($1, $2, 'x')`, [sick.id, `request/${CHEW_USER}/x.pdf`], /Attendance · Create/, 'not somebody else’s request')

// The portal's link: Attendance · View names the file.
await refuses(`select public.att_file('request', $1)`, [sick.id], /Attendance · View/, 'naming a file asks View')
await as(HR_USER, ['attendance.view'])
check((await q(`select public.att_file('request', $1) f`, [sick.id]))[0].f, { path: `request/${ANN_USER}/mc.pdf`, name: 'MC 2 Nov.pdf' }, 'a request’s file')
const photo = (await q(`select public.att_file('punch', $1) f`, [punch.id]))[0].f
check([photo.path, photo.name.endsWith(' IN.jpg'), photo.name.startsWith('Ann ')], [`punch/${ANN_USER}/a.jpg`, true, true], 'a punch’s photo, named for its person, day and side')
await refuses(`select public.att_file('nric', $1)`, [S.ann], /No such file/, 'nothing else')

// ── 4. Remind all ───────────────────────────────────────────────────────────
await q(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, app) values ($1, 'https://push/ann', 'k', 'a', 'revenue')`, [ANN_USER])
await as(HR_USER, ['attendance.view'])
await refuses(`select public.att_remind($1::uuid[])`, [[S.chew, S.bob]], /Attendance · Edit/, 'reminding asks Edit')
await as(HR_USER, ['attendance.view', 'attendance.edit'])
// Ann punched in today (above): she is not asked. Chew (a login, no phone) and Bob (no login) are.
const r1 = (await q(`select public.att_remind($1::uuid[]) r`, [[S.ann, S.chew, S.bob]]))[0].r
check(r1, { sent: 1, noLogin: 1, noPhone: 1, recent: 0, asked: 2 }, 'Chew reminded (no phone yet), Bob has no login, Ann is in')
check(await q(`select user_id, kind, ref_kind, ref_id, title from public.app_notifications where kind = 'attendance'`),
  [{ user_id: CHEW_USER, kind: 'attendance', ref_kind: 'att_today', ref_id: today, title: 'Not clocked in yet' }], 'one notice, for today')
const r2 = (await q(`select public.att_remind($1::uuid[]) r`, [[S.chew]]))[0].r
check([r2.sent, r2.recent], [0, 1], 'not again within ten minutes')
check((await q(`select count(*)::int n from public.att_events where entity = 'day' and what = 'Reminded to clock in'`))[0].n, 1, 'the reminder is on the day’s trail')

// The bells leave it out (production's notifications_mine, swapped).
await as(CHEW_USER, [])
await q(`insert into public.app_notifications (user_id, kind, title, ref_kind, ref_id) values ($1, 'memo', 'A memo', 'memo', 'm1')`, [CHEW_USER])
const bell = (await q(`select public.notifications_mine() b`))[0].b
check([bell.unread, bell.items.map(i => i.kind)], [1, ['memo']], 'a reminder is never in a bell')

console.log(`attendance answers: ${checks} checks passed`)
