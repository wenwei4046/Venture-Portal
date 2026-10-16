// Local PostgreSQL regression for 20261016190000 (2026-10-16, Request to change email): a person's email is the one they
// sign in with — theirs to change, by asking from their app; HR approves on Attendance › Requests, and the approval
// writes the People record and the login row only once the login itself already signs in with the new email (the
// portal moves it first). The att_* migrations run VERBATIM (030100, 030200), then 20261015200000 and this one without
// their production guards (their md5s are production's bodies), over stand-ins for the tables they read. No live I/O.
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
const HR_USER = id(1), UP_USER = id(2), ANN_USER = id(3), DAN_USER = id(4), SHARED_USER = id(5)
const S = { hr: id(101), up: id(102), ann: id(103), bob: id(104), dan: id(105) }
const ALL = ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve']
const as = async (uid, cells = [], sensitive = []) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${cells.join(',')}', false),
                        set_config('test.sensitive', '${sensitive.join(',')}', false)`)
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  -- The auth server's own table, as far as an email goes: the login signs in with this.
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
  create function public.sees_sensitive(p_field text) returns boolean language sql stable as $$
    select p_field = any (coalesce(string_to_array(nullif(current_setting('test.sensitive', true), ''), ','), '{}')) $$;
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
  insert into auth.users (id, email) values ('${HR_USER}', 'hr@x.my'), ('${UP_USER}', 'up@x.my'), ('${ANN_USER}', 'ann@x.my'),
    ('${DAN_USER}', 'dan@x.my'), ('${SHARED_USER}', 'principal@x.my');
  insert into public.users (id, email, name) select id, email, split_part(email, '@', 1) from auth.users;
  insert into public.hr_staff_costs (id, employee_name, user_id, reports_to, email) values
    ('${S.hr}', 'Siti', '${HR_USER}', null, 'hr@x.my'),
    ('${S.up}', 'Daniel', '${UP_USER}', null, 'up@x.my'),
    ('${S.ann}', 'Ann', '${ANN_USER}', '${S.up}', 'ann@x.my'),
    ('${S.bob}', 'Bob', null, '${S.hr}', 'Bob@Contact.MY'),
    ('${S.dan}', 'Dan', '${DAN_USER}', '${S.up}', 'dan@x.my');
`)
for (const file of ['20261015030100_attendance.sql', '20261015030200_attendance_functions.sql'])
  await db.exec(await readFile(new URL(file, migrations), 'utf8'))
const guard = /DO \$guard\$[\s\S]*?\$guard\$;\n/
for (const file of ['20261015200000_attendance_answers.sql', '20261016190000_login_email_change.sql']) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  assert.ok(guard.test(sql), `${file} opens with its production guard`)
  await db.exec(sql.replace(guard, ''))
}
// …and this one runs again without harm.
await db.exec((await readFile(new URL('20261016190000_login_email_change.sql', migrations), 'utf8')).replace(/\r\n/g, '\n').replace(guard, ''))

const mine = async () => (await q(`select public.my_email_change() m`))[0].m
const facts = async request => (await q(`select public.att_login_email_change($1) f`, [request]))[0].f
const login = async user => (await q(`select a.email auth, u.email row from auth.users a join public.users u on u.id = a.id where a.id = $1`, [user]))[0]
const staffEmail = async staff => (await q(`select email from public.hr_staff_costs where id = $1`, [staff]))[0].email

// ── Asking ──────────────────────────────────────────────────────────────────
await as(SHARED_USER, [])
await refuses(`select public.request_my_email_change('me@x.my')`, [], /staff list/, 'a login no People record names cannot ask')
check(await mine(), null, 'nor has anything to show')

await as(ANN_USER, [])
check(await mine(), null, 'nothing asked yet')
await refuses(`select public.request_my_email_change('not an email')`, [], /email address like/, 'an email is an email')
await refuses(`select public.request_my_email_change('')`, [], /needs an email/, 'a login keeps an email')
await refuses(`select public.request_my_email_change('DAN@x.my')`, [], /another login/, 'never another login’s, whatever its case')
await refuses(`select public.request_my_email_change('ann@x.my')`, [], /already says that/, 'the same email is no change')
const asked = (await q(`select public.request_my_email_change(' Ann.New@Mail.COM ') r`))[0].r
check(/^PF-\d{4}-\d{3}$/.test(asked.ref), true, 'filed as a profile change, its own reference')
const row = (await q(`select kind, status, route, reason, detail from public.att_requests where id = $1`, [asked.id]))[0]
check([row.kind, row.status, row.route, row.reason], ['profile', 'pending', 'hr_only', 'Request to change email'], 'a profile change waiting for HR')
check(row.detail.changes, [{ key: 'email', field: 'Email', from: 'ann@x.my', to: 'ann.new@mail.com' }], 'kept in lower case, with the email it moves from')
await refuses(`select public.request_my_email_change('ann.other@mail.com')`, [], /already asked/, 'one at a time')
check(await mine(), { id: asked.id, ref: asked.ref, status: 'pending', to: 'ann.new@mail.com', from: 'ann@x.my', at: (await mine()).at, decidedAt: null, note: null },
  'their app reads it waiting')

// ── What Approve must do first ──────────────────────────────────────────────
await as(HR_USER, ALL)
check(await facts(asked.id), { user_id: ANN_USER, from: 'ann@x.my', to: 'ann.new@mail.com' }, 'HR’s last step on a login’s email: the login, from, to')
await as(UP_USER, ['attendance.view'])
await refuses(`select public.att_login_email_change($1)`, [asked.id], /Attendance · Approve/, 'deciding needs Attendance · Approve')
await as(ANN_USER, ALL)
await refuses(`select public.att_login_email_change($1)`, [asked.id], /their own request/, 'nobody decides their own')

// An approval that has not moved the login first is refused, and writes nothing.
await as(HR_USER, ALL)
await refuses(`select public.att_decide($1, true, '')`, [asked.id], /moves their login too/, 'the record and the login never part')
check((await q(`select status from public.att_requests where id = $1`, [asked.id]))[0].status, 'pending', 'still waiting')
check([await staffEmail(S.ann), await login(ANN_USER)], ['ann@x.my', { auth: 'ann@x.my', row: 'ann@x.my' }], 'nothing written')

// The portal moves the login (the auth server, with the service role), then decides.
await q(`update auth.users set email = 'ann.new@mail.com' where id = $1`, [ANN_USER])
await q(`select public.att_decide($1, true, '')`, [asked.id])
check([await staffEmail(S.ann), await login(ANN_USER)], ['ann.new@mail.com', { auth: 'ann.new@mail.com', row: 'ann.new@mail.com' }],
  'approved: the People record and the login row follow the login')
check((await q(`select what from public.att_events where entity = 'request' and entity_key = $1 order by id`, [asked.id])).map(e => e.what),
  ['Submitted', 'Approved by HR', 'Record updated'], 'the trail')
check(await facts(asked.id), null, 'decided: nothing more to do first')
await as(ANN_USER, [])
check([(await mine()).status, (await mine()).to], ['approved', 'ann.new@mail.com'], 'their app reads it done')

// ── Declined ────────────────────────────────────────────────────────────────
await as(DAN_USER, [])
const dan = (await q(`select public.request_my_email_change('dan.new@mail.com') r`))[0].r
await as(HR_USER, ALL)
await q(`select public.att_decide($1, false, 'Use your work email')`, [dan.id])
await as(DAN_USER, [])
check([(await mine()).status, (await mine()).note], ['rejected', 'Use your work email'], 'their app reads why it was declined')
check(await staffEmail(S.dan), 'dan@x.my', 'a declined change writes nothing')
// …and they may ask again.
const again = (await q(`select public.request_my_email_change('dan.work@mail.com') r`))[0].r
check((await mine()).id, again.id, 'the latest one is shown')
// They withdraw it themselves (att_cancel_request lets a person withdraw their own while it waits).
await q(`select public.att_cancel_request($1, '')`, [again.id])
check((await mine()).status, 'cancelled', 'withdrawn')

// ── Through the upline first (a profile route of Upline only runs Upline → HR) ──
await as(HR_USER, ALL)
await q(`select public.att_save_setting('route', null, '{"scope":"company","kinds":["PF"],"label":"Profile change","route":"upline_only","why":"x"}'::jsonb)`)
await as(DAN_USER, [])
const viaUp = (await q(`select public.request_my_email_change('dan.up@mail.com') r`))[0].r
await as(HR_USER, ALL)
check(await facts(viaUp.id), null, 'the upline’s step first: nothing to move yet')
await as(UP_USER, [])
await q(`select public.att_decide($1, true, '')`, [viaUp.id])
check(await staffEmail(S.dan), 'dan@x.my', 'the upline’s approval writes nothing')
await as(HR_USER, ALL)
check(await facts(viaUp.id), { user_id: DAN_USER, from: 'dan@x.my', to: 'dan.up@mail.com' }, 'then HR’s, the last')

// ── Somebody with no login: their contact email, as before ─────────────────
await as(HR_USER, ALL)
const bob = (await q(`select public.att_create_request($1, 'profile', null, null, null, null, null, $2::jsonb, 'New email', false) r`,
  [S.bob, JSON.stringify({ changes: [{ key: 'email', to: 'Bob.New@Contact.MY' }] })]))[0].r
await q(`select public.att_decide($1, true, '')`, [bob.id])   // Siti, his upline
check(await facts(bob.id), null, 'HR’s step, no login: nothing to move')
await q(`select public.att_decide($1, true, '')`, [bob.id])   // …and HR’s, the last
check(await staffEmail(S.bob), 'bob.new@contact.my', 'written on approval, in lower case')

// ── Who may call them ───────────────────────────────────────────────────────
for (const fn of ['public.att_login_email_change(uuid)', 'public.request_my_email_change(text)', 'public.my_email_change()']) {
  check((await q(`select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') a, has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') b`, [fn]))[0],
    { a: false, b: true }, `${fn}: a sign-in, never the anon key`)
}

console.log(`login email change: ${checks} checks passed`)
