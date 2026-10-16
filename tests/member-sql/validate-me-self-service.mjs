// Local PostgreSQL regression for 20261017100000 (2026-10-17, "Me" — the Staff App handoff): a person reads their
// own attendance, leave, requests, record, payslips and line back — and nobody else's; an upline sees their own
// reports' today (never a photo) and what waits at their step; a peer is a status word, never a time; Extra manpower
// is a fifth request kind (MP-…, upline → HR by default) and one's own corrections stop at the policy's quota for
// the month; the punch notice is read once. The att_* migrations run VERBATIM (030100, 030200), then 20261015200000,
// 20261016190000 and this one without their production guards (their md5s are production's bodies), over stand-ins
// for the tables they read. No live I/O.
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
const HR_USER = id(1), UP_USER = id(2), ANN_USER = id(3), DAN_USER = id(4), SHARED_USER = id(5), EVE_USER = id(6)
const S = { hr: id(101), up: id(102), ann: id(103), bob: id(104), dan: id(105), eve: id(106), boss: id(107) }
const DEPT = { mkt: id(201), fin: id(202) }
const ALL = ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve']
const as = async (uid, cells = [], sensitive = []) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${cells.join(',')}', false),
                        set_config('test.sensitive', '${sensitive.join(',')}', false)`)
}
const today = (await q(`select (now() at time zone 'Asia/Kuala_Lumpur')::date::text d`))[0].d
const month1 = today.slice(0, 8) + '01'

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
  -- The fairs (Comm Cal) and payroll, as far as the readers go.
  create table public.comm_venues (venue_key text primary key, display_name text);
  create table public.comm_venue_events (id uuid primary key default gen_random_uuid(), venue_key text, period_month date, start_date date, end_date date);
  create type public.hr_monthly_payroll_status as enum ('draft', 'completed', 'submitted', 'paid');
  create table public.hr_monthly_payroll (id uuid primary key default gen_random_uuid(), staff_id uuid, period_month date,
    basic_salary numeric default 0, statutory_allowance numeric default 0, non_statutory_allowance numeric default 0, ot_hours numeric default 0,
    ot_amount numeric default 0, commission_amount numeric default 0, unpaid_leave_days numeric default 0, deduction_amount numeric default 0,
    epf_ee numeric default 0, socso_ee numeric default 0, eis_ee numeric default 0, pcb numeric default 0, withholding_tax numeric default 0,
    skbbk_amount numeric default 0, pay_line_earnings numeric default 0, pay_line_deductions numeric default 0, gross numeric default 0,
    net numeric default 0, attendance_figures jsonb, status public.hr_monthly_payroll_status not null default 'draft');
  create type public.voucher_status as enum ('draft', 'approved', 'paid', 'void');
  create table public.payment_vouchers (id uuid primary key default gen_random_uuid(), status public.voucher_status, payment_date date,
    reference_type text, reference_id uuid);
  create table public.payroll_voucher_lines (voucher_id uuid, payroll_row_id uuid, scope text, period_month date, bank_name text, bank_account_no text);
`)
await db.exec(`
  insert into auth.users (id, email) values ('${HR_USER}', 'hr@x.my'), ('${UP_USER}', 'up@x.my'), ('${ANN_USER}', 'ann@x.my'),
    ('${DAN_USER}', 'dan@x.my'), ('${SHARED_USER}', 'principal@x.my'), ('${EVE_USER}', 'eve@x.my');
  insert into public.users (id, email, name) select id, email, split_part(email, '@', 1) from auth.users;
  insert into public.departments (id, name) values ('${DEPT.mkt}', 'Marketing'), ('${DEPT.fin}', 'Finance');
  insert into public.hr_staff_costs (id, employee_name, employee_code, department_id, user_id, reports_to, email, contact_number, address,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_name, bank_account_no, nric, hire_date) values
    ('${S.boss}', 'Lim Boss', 'HV001', null, null, null, null, null, null, null, null, null, null, null, null, '2018-01-01'),
    ('${S.hr}', 'Siti', 'HV002', null, '${HR_USER}', null, 'hr@x.my', null, null, null, null, null, null, null, null, null),
    ('${S.up}', 'Daniel', 'HV010', '${DEPT.mkt}', '${UP_USER}', '${S.boss}', 'up@x.my', '012-111 2222', null, null, null, null, null, null, null, '2020-03-01'),
    ('${S.ann}', 'Ann', 'HV011', '${DEPT.mkt}', '${ANN_USER}', '${S.up}', 'ann@x.my', '012-345 6789', '1 Jalan Satu', 'Ong Kah Seng', '016-221 0457',
       'Father', 'Maybank', '5142 0981 3376', '950101-14-5528', '2023-03-03'),
    ('${S.bob}', 'Bob', 'HV012', '${DEPT.mkt}', null, '${S.up}', null, '019-000 1111', null, null, null, null, null, null, null, null),
    ('${S.dan}', 'Dan', 'HV013', '${DEPT.mkt}', '${DAN_USER}', '${S.up}', 'dan@x.my', null, null, null, null, null, null, null, null, null),
    ('${S.eve}', 'Eve', 'HV020', '${DEPT.fin}', '${EVE_USER}', null, 'eve@x.my', '017-555 0000', null, null, null, null, 'CIMB', '8007 2213 9041', null, null);
`)
for (const file of ['20261015030100_attendance.sql', '20261015030200_attendance_functions.sql'])
  await db.exec(await readFile(new URL(file, migrations), 'utf8'))
const guard = /DO \$guard\$[\s\S]*?\$guard\$;\n/
for (const file of ['20261015200000_attendance_answers.sql', '20261016190000_login_email_change.sql', '20261017100000_me_self_service.sql']) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  assert.ok(guard.test(sql), `${file} opens with its production guard`)
  await db.exec(sql.replace(guard, ''))
}
const ME = (await readFile(new URL('20261017100000_me_self_service.sql', migrations), 'utf8')).replace(/\r\n/g, '\n').replace(guard, '')
// …and runs again without harm.
await db.exec(ME)

// ── Settings HR made (as HR) ────────────────────────────────────────────────
await as(HR_USER, ALL)
const schedule = (await q(`select public.att_save_setting('schedule', null, $1::jsonb) r`, [JSON.stringify({ name: 'Office 9-6', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  .map((day, i) => i < 5 ? { day, type: 'work', start: '09:00', end: '18:00', break: 60 } : { day, type: i === 5 ? 'off' : 'rest' }) })]))[0].r.id
const hq = (await q(`select public.att_save_setting('location', null, $1::jsonb) r`, [JSON.stringify({ name: 'HQ', address: 'Jalan Puchong', state: 'Selangor',
  radius: 150, lat: 3.05, lng: 101.62 })]))[0].r.id
await q(`insert into public.att_assignments (level, label, mode, schedule_id, location_id, ot, effective_from) values ('company', 'Everyone', 'clock', $1, $2, 'by_wage', '2026-01-01')`,
  [schedule, hq])
await q(`insert into public.att_leave_types (code, name, groups, route, accrues) values
  ('AL', 'Annual leave', '[{"titles":["all"],"levels":["all"],"base":12,"steps":[]}]', 'upline_only', true),
  ('SL', 'Sick leave', '[{"titles":["all"],"levels":["all"],"base":18,"steps":[]}]', 'hr_only', false)`)
await q(`update public.att_policy set corrections_per_month = 2, grace_min = 5`)
// A policy in force today too (the seeded one starts on 2026-11-01).
await q(`insert into public.att_policy (effective_from, corrections_per_month, grace_min) values ('2026-01-01', 2, 5) on conflict do nothing`)

// ── 1. att_me: one's own, never another's ───────────────────────────────────
await as(SHARED_USER, [])
const shared = (await q(`select public.att_me() m`))[0].m
check(shared.me, null, 'a login no People record names has no Me')
check(typeof shared.now === 'string' && /^\d\d:\d\d:\d\d$/.test(shared.now), true, 'but the server time, to the second')
await as(null, [])
await refuses(`select public.att_me()`, [], /Sign in first/, 'nobody signed in reads nothing')

// Facts: Ann punches today; Dan punched; a leave each.
await as(ANN_USER, [])
await q(`insert into storage.objects (bucket_id, name) values ('attendance', $1)`, [`punch/${ANN_USER}/a.jpg`])
const annPunch = (await q(`select public.att_punch('in', 3.05, 101.62, 8, 'iPhone', $1, '', 'app') r`, [`punch/${ANN_USER}/a.jpg`]))[0].r
check(annPunch.inside, true, 'Ann punched inside the fence')
await as(DAN_USER, [])
await q(`select public.att_punch('in', 3.2, 101.9, 30, 'Pixel', null, 'Client visit, Bangsar', 'app')`)
await as(EVE_USER, [])
await q(`select public.att_punch('in', null, null, null, 'Chrome', null, '', 'web')`)

await as(ANN_USER, [])
const t = (await q(`select public.att_me_today() t`))[0].t
const workDay = t.workDay
const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(workDay + 'T00:00:00Z').getUTCDay()]
check([t.me, t.mode, t.day.day, t.punches.map(p => [p.dir, p.inside, p.source])], [true, 'clock', weekday, [['in', true, 'app']]],
  'att_me_today: who clocks, the schedule’s row for the work day, her punches today')
check(t.noticeRead, false, 'and the notice unread')
await as(SHARED_USER, [])
check((await q(`select public.att_me_today() t`))[0].t.me, false, 'a login no People record names: nothing to punch')
await as(ANN_USER, [])
const al = (await q(`select public.att_create_request($1, 'leave', 'AL', $2::date + 7, $2::date + 8, 2, null, '{}'::jsonb, 'Family trip', false) r`, [S.ann, today]))[0].r
check(/^LV-\d{4}-\d{3}$/.test(al.ref), true, 'Ann sends her own leave')
const me = (await q(`select public.att_me() m`))[0].m
check(me.me.id, S.ann, 'att_me is Ann')
check([me.me.name, me.me.department, me.me.upline, me.me.uplineHasLogin], ['Ann', 'Marketing', 'Daniel', true], 'her record as the engine reads a person')
check(me.month.punches.map(p => [p.staffId, p.dir, p.photo]), [[S.ann, 'in', true]], 'her punches — only hers')
check(me.requests.map(r => r.ref), [al.ref], 'her requests — only hers')
check(me.requests[0].steps.map(s => [s.role, s.approver, s.state]), [['upline', 'Daniel', 'waiting']], 'with each step')
check(me.requests[0].events.map(e => e.what), ['Submitted'], 'and its trail')
check(me.ledger.leave.map(l => [l.staffId, l.code]), [[S.ann, 'AL']], 'her leave ledger')
check(me.assignments.length, 1, 'the company assignment applies to her')
check(me.locations.map(l => l.name), ['HQ'], 'the fences, for the distance on the camera')
check(me.reports, 0, 'nobody reports to Ann')
check(me.noticeRead, false, 'the punch notice is unread')
check(me.correctionsUsed, 0, 'no correction used')

// ── 6. The punch notice ─────────────────────────────────────────────────────
await q(`select public.att_punch_notice_ack()`)
await q(`select public.att_punch_notice_ack()`)
check((await q(`select public.att_me() m`))[0].m.noticeRead, true, 'read once')
check((await q(`select count(*)::int n from public.att_events where entity = 'punch' and entity_key = $1`, [`notice:${ANN_USER}`]))[0].n, 1,
  'and recorded once, however often pressed')
await as(SHARED_USER, [])
await refuses(`select public.att_punch_notice_ack()`, [], /staff record/, 'a login no People record names has no punch to read it for')

// ── 7. Extra manpower, and the corrections' quota ───────────────────────────
await as(ANN_USER, [])
const mpArgs = detail => [S.ann, today, JSON.stringify(detail)]
const mp = (await q(`select public.att_create_request($1, 'manpower', null, $2::date + 3, $2::date + 4, 2, null, $3::jsonb, 'Two booths', false) r`,
  mpArgs({ for: 'MID VALLEY', role: 'Promoter', count: 2 })))[0].r
check(/^MP-\d{4}-\d{3}$/.test(mp.ref), true, 'Extra manpower files as MP-…')
check((await q(`select r.kind, r.route, array_agg(st.role order by st.seq) steps from public.att_requests r
                 join public.att_request_steps st on st.request_id = r.id where r.id = $1 group by r.kind, r.route`, [mp.id]))[0],
  { kind: 'manpower', route: 'upline_then_hr', steps: ['upline', 'hr'] }, 'upline, then HR — by default')
for (const [detail, what] of [[{ for: 'MID VALLEY', role: 'Promoter', count: 7 }, 'more than six'], [{ for: 'MID VALLEY', role: 'Chef', count: 2 }, 'another role'],
  [{ for: ' ', role: 'Helper', count: 1 }, 'nothing it is for']])
  await refuses(`select public.att_create_request($1, 'manpower', null, $2::date + 3, $2::date + 4, 2, null, $3::jsonb, 'x', false)`, mpArgs(detail),
    /what it is for/, `manpower refuses ${what}`)
await refuses(`select public.att_create_request($1, 'manpower', null, $2::date + 4, $2::date + 3, 2, null, $3::jsonb, 'x', false)`,
  mpArgs({ for: 'MID VALLEY', role: 'Driver', count: 1 }), /what it is for/, 'and days that end before they start')

const cr = async () => (await q(`select public.att_create_request($1, 'correction', null, $2::date, $2::date, null, null, '{"punch":"out","at":"18:04"}'::jsonb,
  'Phone battery died', false) r`, [S.ann, today]))[0].r
await cr()
await cr()
await refuses(`select public.att_create_request($1, 'correction', null, $2::date, $2::date, null, null, '{"punch":"out","at":"18:04"}'::jsonb, 'Again', false)`,
  [S.ann, today], /No corrections left/, 'one’s own corrections stop at the month’s quota')
check((await q(`select public.att_me() m`))[0].m.correctionsUsed, 2, 'and att_me counts them')
await as(HR_USER, ALL)
await q(`select public.att_create_request($1, 'correction', null, $2::date, $2::date, null, null, '{"punch":"out","at":"18:04"}'::jsonb, 'HR keyed it', false)`,
  [S.ann, today])
checks++ // HR on Ann's behalf is not held to her quota
await as(ANN_USER, [])
const cancelled = (await q(`select id from public.att_requests where staff_id = $1 and kind = 'correction' and reason = 'Phone battery died' limit 1`, [S.ann]))[0].id
await q(`select public.att_cancel_request($1, 'Found it')`, [cancelled])
check((await q(`select public.att_me() m`))[0].m.correctionsUsed, 2, 'a withdrawn one gives its place back (HR’s still counts)')

// ── 2. att_my_team: an upline's own ─────────────────────────────────────────
await as(ANN_USER, [])
const annTeam = (await q(`select public.att_my_team() t`))[0].t
check([annTeam.reports.length, annTeam.waiting.length], [0, 0], 'Ann has no team and nothing waits on her')
await as(UP_USER, [])
const team = (await q(`select public.att_my_team() t`))[0].t
check(team.reports.map(p => [p.name, p.reportsToMe]).sort(), [['Ann', true], ['Bob', true], ['Dan', true]], 'Daniel’s reports')
check(team.punches.map(p => [p.staffId, p.photo, p.reason]).sort(), [[S.ann, false, ''], [S.dan, false, 'Client visit, Bangsar']].sort(),
  'their punches today — never a photo')
check(team.punches.some(p => p.staffId === S.eve), false, 'nobody else’s')
const atDaniel = (await q(`select r.ref from public.att_requests r join public.att_request_steps st on st.request_id = r.id
  where r.status = 'pending' and st.state = 'waiting' and st.role = 'upline' and st.approver_staff_id = $1 order by r.ref`, [S.up])).map(r => r.ref)
check(atDaniel.includes(al.ref) && atDaniel.includes(mp.ref) && atDaniel.length === 4, true, 'the leave, the manpower and the two corrections wait on Daniel')
check(team.waiting.map(r => r.ref).sort(), atDaniel, 'what waits at his step — all of it')
check(team.ledger.leave.every(l => l.staffId === S.ann), true, 'the requesters’ leave, for the Balance')
// He decides his own step; the leave is then approved (upline only), the manpower moves on to HR.
await q(`select public.att_decide($1, true, '')`, [al.id])
await q(`select public.att_decide($1, true, '')`, [mp.id])
check((await q(`select status from public.att_requests where id = $1`, [al.id]))[0].status, 'approved', 'the upline’s approval ends an upline-only leave')
check((await q(`select array_agg(state order by seq) s from public.att_request_steps where request_id = $1`, [mp.id]))[0].s, ['approved', 'waiting'],
  'and passes the manpower on to HR')
check((await q(`select public.att_my_team() t`))[0].t.waiting.map(r => r.ref), atDaniel.filter(r => r.startsWith('CR-')), 'only the corrections wait on him now')

// ── 3. att_my_org: words, not times ─────────────────────────────────────────
await as(ANN_USER, [])
const org = (await q(`select public.att_my_org() o`))[0].o
const byName = Object.fromEntries(org.people.map(p => [p.name, p]))
check(org.me, S.ann, 'Ann’s org')
check(Object.keys(byName).sort(), ['Ann', 'Bob', 'Dan', 'Daniel', 'Lim Boss'].sort(), 'her line up to the top and her department — not Finance')
check([byName.Ann.inLine, byName.Daniel.inLine, byName['Lim Boss'].inLine, byName.Bob.inLine], [true, true, true, false], 'the line is marked')
check(byName.Ann.status === 'present' || byName.Ann.status === 'late', true, 'Ann is in')
check(byName.Dan.status, 'late', 'Dan punched outside every fence: flagged')
check(byName.Bob.status, 'out', 'Bob is not in')
check(Object.values(byName).some(p => 'time' in p || 'in' in p), false, 'nobody’s time')
await as(EVE_USER, [])
check((await q(`select public.att_my_org() o`))[0].o.people.find(p => p.name === 'Eve').status, 'late', 'a computer punch is flagged')

// ── 4. my_record: one's own, masked ─────────────────────────────────────────
await as(ANN_USER, [])
const rec = (await q(`select public.my_record() r`))[0].r
check([rec.name, rec.code, rec.phone, rec.address, rec.ecName, rec.ecPhone, rec.ecRel, rec.bank, rec.accountLast4, rec.nric, rec.upline],
  ['Ann', 'HV011', '012-345 6789', '1 Jalan Satu', 'Ong Kah Seng', '016-221 0457', 'Father', 'Maybank', '3376', '9•••••-••-5528', 'Daniel'],
  'her record, the NRIC and the account to their last four')
check(JSON.stringify(rec).includes('5142'), false, 'the full account number never leaves the database')
await as(SHARED_USER, [])
check((await q(`select public.my_record() r`))[0].r, null, 'nothing for a login no People record names')

// ── 5. my_payslips: paid ones, one's own ────────────────────────────────────
const lastMonth = (await q(`select (date_trunc('month', $1::date) - interval '1 month')::date::text m`, [today]))[0].m
const [paidRow, draftRow, eveRow] = (await q(`insert into public.hr_monthly_payroll (staff_id, period_month, basic_salary, gross, net, epf_ee, status) values
  ($1, $3, 4200, 4460.58, 3813.53, 491, 'paid'), ($1, $4, 4200, 4400, 3800, 484, 'draft'), ($2, $3, 5000, 5000, 4400, 550, 'paid') returning id`,
  [S.ann, S.eve, lastMonth, month1])).map(r => r.id)
const pv = (await q(`insert into public.payment_vouchers (status, payment_date, reference_type) values ('paid', ($1::date + interval '1 month - 1 day')::date, 'payroll_disbursement') returning id`,
  [lastMonth]))[0].id
await q(`insert into public.payroll_voucher_lines (voucher_id, payroll_row_id, scope, period_month, bank_name, bank_account_no) values ($1, $2, 'staff', $3, 'Maybank', '5142 0981 3376')`,
  [pv, paidRow, lastMonth])
void draftRow; void eveRow
await as(ANN_USER, [])
const slips = (await q(`select public.my_payslips() p`))[0].p
check(slips.map(p => [p.month, p.status, Number(p.net), p.bank, p.accountLast4]), [[lastMonth, 'paid', 3813.53, 'Maybank', '3376']],
  'her paid month only — not this month’s draft, not Eve’s')
check(slips[0].paidOn, (await q(`select ($1::date + interval '1 month - 1 day')::date::text d`, [lastMonth]))[0].d, 'paid on the voucher’s date')

// ── Who may call them ───────────────────────────────────────────────────────
for (const fn of ['public.att_me(date)', 'public.att_me_today()', 'public.att_my_team()', 'public.att_my_org()', 'public.my_record()', 'public.my_payslips()', 'public.att_punch_notice_ack()'])
  check((await q(`select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') a, has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') b`, [fn]))[0],
    { a: false, b: true }, `${fn}: a sign-in, never the anon key`)
check((await q(`select has_function_privilege('authenticated', 'public.att_status_on(uuid, date)'::regprocedure, 'EXECUTE') b`))[0].b, false,
  'att_status_on is only the readers’ own')

console.log(`me self-service: ${checks} checks passed`)
