// Local PostgreSQL regression for 20261017120000 (2026-10-17 — the user's answers to the HR Mobile + Me questions): a
// DECIDED request tells its person ("需要通知本人") — approved at its last step or rejected at any, never a step on the
// way, never somebody without a login — and an approved correction becomes the punch ("补上自动"): source 'hr', the
// request's ref as its reason, an IN setting aside the day's earlier INs and an OUT the later OUTs, a time before the
// cutover on the next calendar morning, a closed month untouched. The att_* migrations run VERBATIM (030100, 030200), then
// 20261015200000, 20261016190000, 20261017100000 and this one without their production guards, over the stand-ins
// validate-me-self-service.mjs uses. No live I/O.
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
for (const file of ['20261015200000_attendance_answers.sql', '20261016190000_login_email_change.sql', '20261017100000_me_self_service.sql',
  '20261017120000_att_decided_notice_and_correction_punch.sql']) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  assert.ok(guard.test(sql), `${file} opens with its production guard`)
  await db.exec(sql.replace(guard, ''))
}
const DECIDED = (await readFile(new URL('20261017120000_att_decided_notice_and_correction_punch.sql', migrations), 'utf8')).replace(/\r\n/g, '\n').replace(guard, '')
// …and runs again without harm.
await db.exec(DECIDED)

// ── What the requests need: a policy in force (cutover 04:00, room for corrections), a leave type ──
await q(`insert into public.att_policy (effective_from, corrections_per_month, grace_min) values ('2026-01-01', 20, 5) on conflict do nothing`)
await q(`insert into public.att_leave_types (code, name, groups, route, accrues) values
  ('AL', 'Annual leave', '[{"titles":["all"],"levels":["all"],"base":12,"steps":[]}]', 'upline_only', true)`)

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dy = (d, withMonth = true) => { const t = new Date(`${d}T00:00:00Z`); return `${DAY[t.getUTCDay()]} ${t.getUTCDate()}${withMonth ? ` ${MON[t.getUTCMonth()]}` : ''}` }
const send = async (who, staff, kind, from, detail = {}, extra = {}) => {
  await as(who, who === HR_USER ? ALL : [])
  return (await q(`select public.att_create_request($1, $2, $3, $4::date, $5::date, $6, $7, $8::jsonb, $9, false) r`,
    [staff, kind, extra.leave ?? null, from, extra.to ?? from, extra.days ?? null, extra.hours ?? null, JSON.stringify(detail), extra.reason ?? 'Reason']))[0].r
}
const decide = async (who, id, approve, note = '') => {
  await as(who, who === HR_USER ? ALL : [])
  return (await q(`select public.att_decide($1, $2, $3) r`, [id, approve, note]))[0].r
}
const punch = (staff, day, dir, at, source = 'app') =>
  q(`insert into public.att_punches (staff_id, work_day, direction, source, at) values ($1, $2, $3, $4, ($5::timestamp) at time zone 'Asia/Kuala_Lumpur')`,
    [staff, day, dir, source, at])
const punchesOf = (staff, day) => q(`select direction dir, source, reason, to_char(at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') at,
    invalid_at is not null gone, invalid_reason why from public.att_punches where staff_id = $1 and work_day = $2 order by at`, [staff, day])
const noticesOf = user => q(`select kind, title, body, ref_kind, ref_id from public.app_notifications where user_id = $1 order by created_at, title`, [user])
const eventsOf = id => q(`select what, note from public.att_events where entity = 'request' and entity_key = $1 order by at, id`, [id])
const allNotices = async () => (await q(`select count(*)::int n from public.app_notifications`))[0].n
const lastNotice = async user => (await noticesOf(user)).at(-1)

// ── 1. A missed IN, approved by the upline: the punch, the earlier IN set aside, the notice ──
await punch(S.ann, '2026-08-12', 'in', '2026-08-12 07:02')
await punch(S.ann, '2026-08-12', 'in', '2026-08-12 10:30')
await punch(S.ann, '2026-08-12', 'out', '2026-08-12 18:05')
const cr1 = await send(ANN_USER, S.ann, 'correction', '2026-08-12', { punch: 'in', at: '09:00' })
check((await q(`select array_agg(role || ':' || state order by seq) s from public.att_request_steps where request_id = $1`, [cr1.id]))[0].s,
  ['upline:waiting'], 'Ann’s correction waits at Daniel')
check((await decide(UP_USER, cr1.id, true)).status, 'approved', 'Daniel approves it — the last step')
check(await punchesOf(S.ann, '2026-08-12'), [
  { dir: 'in', source: 'app', reason: '', at: '2026-08-12 07:02', gone: true, why: `Replaced by ${cr1.ref}` },
  { dir: 'in', source: 'hr', reason: cr1.ref, at: '2026-08-12 09:00', gone: false, why: '' },
  { dir: 'in', source: 'app', reason: '', at: '2026-08-12 10:30', gone: false, why: '' },
  { dir: 'out', source: 'app', reason: '', at: '2026-08-12 18:05', gone: false, why: '' },
], 'the IN it asks for is written (source hr, its ref); the earlier IN is set aside, the later one left — the first IN is 09:00')
check((await q(`select created_by from public.att_punches where reason = $1`, [cr1.ref]))[0].created_by, UP_USER, 'made by whoever decided')
check((await eventsOf(cr1.id)).map(e => [e.what, e.note]), [['Submitted', 'Reason'], ['Approved by upline', ''], ['Punch corrected', 'IN 09:00 · 1 earlier punch set aside']],
  'the trail says what was done')
check(await noticesOf(ANN_USER), [{ kind: 'attendance', title: 'Correction · IN approved', body: `${cr1.ref} · ${dy('2026-08-12')} · 09:00 · by Daniel`,
  ref_kind: 'att_request', ref_id: cr1.id }], 'Ann is told — Me’s words, who decided')
check(await allNotices(), 1, 'and nobody else')

// ── 2. A wrong OUT, approved by HR on the upline's behalf ──
await punch(S.ann, '2026-08-13', 'in', '2026-08-13 08:58')
await punch(S.ann, '2026-08-13', 'out', '2026-08-13 23:50')
const cr2 = await send(ANN_USER, S.ann, 'correction', '2026-08-13', { punch: 'out', at: '18:00' })
await decide(HR_USER, cr2.id, true)
check((await q(`select on_behalf, decided_by_name from public.att_request_steps where request_id = $1`, [cr2.id]))[0], { on_behalf: true, decided_by_name: 'Siti' },
  'HR decided the upline’s step on his behalf')
check((await punchesOf(S.ann, '2026-08-13')).map(p => [p.dir, p.at, p.source, p.gone]), [
  ['in', '2026-08-13 08:58', 'app', false], ['out', '2026-08-13 18:00', 'hr', false], ['out', '2026-08-13 23:50', 'app', true]],
  'the OUT it asks for is written and the later OUT set aside — the last OUT is 18:00')
check(await lastNotice(ANN_USER), { kind: 'attendance', title: 'Correction · OUT approved', body: `${cr2.ref} · ${dy('2026-08-13')} · 18:00 · by Siti`,
  ref_kind: 'att_request', ref_id: cr2.id }, 'Ann is told who decided — HR')

// ── 3. A time before the cutover is the next calendar morning ──
const cr3 = await send(ANN_USER, S.ann, 'correction', '2026-08-14', { punch: 'out', at: '01:30' })
await decide(UP_USER, cr3.id, true)
check((await punchesOf(S.ann, '2026-08-14')).map(p => [p.dir, p.at]), [['out', '2026-08-15 01:30']], 'an OUT at 01:30 on the 14th’s work day is the 15th, 01:30')

// ── 4. A closed month is not touched; the person is still told ──
await q(`insert into public.att_months (month, status) values ('2026-07-01', 'closed')`)
const cr4 = await send(ANN_USER, S.ann, 'correction', '2026-07-20', { punch: 'in', at: '09:00' })
await decide(UP_USER, cr4.id, true)
check(await punchesOf(S.ann, '2026-07-20'), [], 'no punch in a closed month')
check((await eventsOf(cr4.id)).at(-1), { what: 'Punch not corrected', note: 'July is closed.' }, 'the trail says why')
check((await lastNotice(ANN_USER)).title, 'Correction · IN approved', 'the approval is still Ann’s news')

// ── 5. A step approved on the way tells nobody; the last one does ──
const ot = await send(ANN_USER, S.ann, 'ot', '2026-08-16', { after: false }, { hours: 3 })
check((await q(`select array_agg(role order by seq) s from public.att_request_steps where request_id = $1`, [ot.id]))[0].s, ['upline', 'hr'],
  'overtime goes to the upline, then HR')
let before = await allNotices()
check((await decide(UP_USER, ot.id, true)).status, 'pending', 'Daniel approves his step — HR’s is still to come')
check(await allNotices(), before, 'nobody is told yet')
await decide(HR_USER, ot.id, true)
check(await lastNotice(ANN_USER), { kind: 'attendance', title: 'Overtime approved', body: `${ot.ref} · ${dy('2026-08-16')} · by Siti`,
  ref_kind: 'att_request', ref_id: ot.id }, 'HR’s approval tells Ann')
check(await punchesOf(S.ann, '2026-08-16'), [], 'overtime writes no punch')

// ── 6. A rejection, at any step, carries its note ──
const ot2 = await send(ANN_USER, S.ann, 'ot', '2026-08-17', { after: true }, { hours: 2 })
before = await allNotices()
await decide(UP_USER, ot2.id, false, 'Not this week')
check(await allNotices(), before + 1, 'a rejection at the first step is the end of it')
check(await lastNotice(ANN_USER), { kind: 'attendance', title: 'Overtime · after the fact rejected',
  body: `${ot2.ref} · ${dy('2026-08-17')} · by Daniel — “Not this week”`, ref_kind: 'att_request', ref_id: ot2.id }, 'with the note')
const cr5 = await send(ANN_USER, S.ann, 'correction', '2026-08-18', { punch: 'in', at: '09:00' })
await decide(UP_USER, cr5.id, false, 'You were on leave')
check(await punchesOf(S.ann, '2026-08-18'), [], 'a rejected correction writes no punch')

// ── 7. Leave and manpower in Me's words ──
const lv = await send(ANN_USER, S.ann, 'leave', '2026-08-20', {}, { leave: 'AL', to: '2026-08-21', days: 2 })
await decide(UP_USER, lv.id, true)
let n = await lastNotice(ANN_USER)
check(`${n.title} | ${n.body}`, `Annual leave approved | ${lv.ref} · ${dy('2026-08-20', false)} – ${dy('2026-08-21')} · by Daniel`, 'leave: its type’s name, the days')
const mp = await send(ANN_USER, S.ann, 'manpower', '2026-08-29', { for: 'MID VALLEY', role: 'Promoter', count: 2 }, { to: '2026-09-01' })
await decide(UP_USER, mp.id, true)
await decide(HR_USER, mp.id, true)
n = await lastNotice(ANN_USER)
check(`${n.title} | ${n.body}`, `Extra manpower · 2 promoters approved | ${mp.ref} · ${dy('2026-08-29')} – ${dy('2026-09-01')} · by Siti`,
  'manpower: how many, the days across two months')

// ── 8. Somebody without a login: the punch, no notice ──
const bob = await send(HR_USER, S.bob, 'correction', '2026-08-12', { punch: 'out', at: '18:00' }, { reason: 'Bob forgot' })
before = await allNotices()
await decide(UP_USER, bob.id, true)
check((await punchesOf(S.bob, '2026-08-12')).map(p => [p.dir, p.at, p.source]), [['out', '2026-08-12 18:00', 'hr']], 'Bob’s punch is written')
check(await allNotices(), before, 'and nobody is told — Bob has no login')

// ── Who may call the helpers ──
for (const fn of ['public.att_notify_requester(uuid)', 'public.att_correction_apply(uuid)'])
  check((await q(`select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') a, has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') b`, [fn]))[0],
    { a: false, b: false }, `${fn}: att_decide's alone`)
check((await q(`select has_function_privilege('authenticated', 'public.att_decide(uuid, boolean, text)'::regprocedure, 'EXECUTE') b`))[0].b, true,
  'att_decide stays a sign-in’s')

console.log(`att decided: ${checks} checks passed`)
