// Local PostgreSQL regression for 20261124210000 (the CRM's Management apart by sub-department — the owner, 2026-11-23:
// "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括 setting 等等都要分开"; "每个 segment 分开就对了"). The migration swaps
// statements into production's bodies (pg_temp.swap_once), so the 22 functions it touches are loaded from
// crm-management-apart-production.sql — production's own definitions, read through the CLI — and the migration runs VERBATIM,
// twice. Under test: every sub-department starts as the CRM is (its settings copied, IR's forms to each; the templates —
// The Conts' words — stay IR's); a write through the "…_in" functions lands on that sub-department alone and asks CRM ·
// Manage and its reach; a
// sub-department with no row of its own reads IR's and, written once, starts as a copy of IR's; a customer reads its own
// sub-department's settings; showroom names are one sub-department's, a new showroom's draft too; each kind of form's in-use
// one is its sub-department's; Import from Meta fills that list alone. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, code, what) => {
  try { await db.query(sql) } catch (e) { assert.equal(e.code, code, `${what}: ${e.message}`); checks++; return }
  assert.fail(`${what}: not refused`)
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(10), IR = id(11), DC = id(12), GONE = id(13)
const BOSS = id(101)
const CONTS_NO = '1438056256053876', DC_NO = '1422533724269131'

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create table public.hr_staff_costs (id uuid primary key);
  create table public.comm_sub_departments (id uuid primary key, name text, code text, is_active boolean not null default true, created_at timestamptz not null default now());
  -- The tables as production has them (information_schema, 2026-11-24).
  create table public.crm_settings (id boolean primary key default true, sub_department_id uuid, updated_by uuid, updated_at timestamptz not null default now(),
    reply_soon_h integer not null default 3, reply_urgent_h integer not null default 6, reply_overdue_h integer not null default 9,
    suggest_template boolean not null default true, auto_assign boolean not null default true, push_messages boolean not null default true,
    reminders boolean not null default true, team_alerts boolean not null default false, send_auto_reply boolean not null default true,
    appt_types jsonb, ft_even boolean not null default false);
  create table public.crm_showrooms (id text primary key default (gen_random_uuid())::text, name text not null, active boolean not null default true,
    sort_order integer not null default 0, created_by uuid, created_at timestamptz not null default now(), address text not null default '',
    slots text[] not null default '{11:00,13:00,15:00,17:00,19:00}', cap integer not null default 2, weekly integer[] not null default '{}',
    blocks jsonb not null default '[]', photo_path text, map_google text, map_waze text, remarks text not null default '', deleted_at timestamptz,
    key_handover boolean not null default false);
  create unique index crm_showrooms_name_key on public.crm_showrooms using btree (lower(trim(both from name)));
  create table public.crm_forms (id uuid primary key default gen_random_uuid(), name text not null, sections jsonb not null default '[]', sort_order integer not null default 0,
    created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), kind text not null default 'customer');
  create table public.crm_templates (id uuid primary key default gen_random_uuid(), name text not null, channel text not null default 'whatsapp', body text not null,
    status text not null default 'draft', is_on boolean not null default false, meta_name text, meta_id text, language text not null default 'en',
    category text not null default 'MARKETING', reject_reason text, created_by uuid, updated_by uuid, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(), source text not null default 'crm', parts jsonb not null default '{}', header_path text, header_mime text, header_name text);
  create unique index crm_templates_meta_name on public.crm_templates using btree (meta_name) where (meta_name is not null);
  create table public.crm_partner_links (id text primary key, name text not null, code text not null, is_on boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid);
  create table public.crm_showroom_drafts (room text primary key, draft jsonb not null, saved_by uuid, saved_at timestamptz not null default now());
  create table public.fx_audit (tbl text, keys text[], reason text);

  -- Stand-ins for what the bodies call: who manages, whose reach, which brand a number is.
  create function public.crm_scope() returns uuid language sql stable as $$ select sub_department_id from public.crm_settings where id $$;
  create function public.crm_brand_of(p_account text) returns text language sql immutable as $$
    select case when p_account in ('${CONTS_NO}', '102351059576534') then 'conts' when p_account in ('${DC_NO}', '478652958664343') then 'dc' end $$;
  create function public.crm_brand_sub(p_brand text) returns uuid language sql stable as $$
    select case p_brand when 'conts' then public.crm_scope() when 'dc' then '${DC}'::uuid end $$;
  create function public.crm_manages() returns boolean language sql stable as $$ select coalesce(current_setting('test.manages', true), '') = 'on' $$;
  create function public.crm_my_role() returns text language sql stable as $$ select case when public.crm_manages() then 'boss' else 'rs' end $$;
  create function public.crm_me() returns uuid language sql stable as $$ select '${BOSS}'::uuid $$;
  create function public.crm_deny(p_what text) returns void language plpgsql as $$ begin raise exception 'You may not %.', p_what using errcode = '42501'; end $$;
  create function public.my_sub_departments(p_area text) returns uuid[] language sql stable as $$
    select coalesce(string_to_array(nullif(current_setting('test.reach', true), ''), ',')::uuid[], '{}') $$;
  create function public.crm_template_needs_file(t public.crm_templates) returns boolean language sql stable as $$
    select coalesce(t.parts -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT') and t.header_path is null $$;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text, p_keys text[] default null,
    p_labels text[] default null, p_ignore text[] default null, p_omit text[] default null, p_diff boolean default null, p_salary text[] default null,
    p_nric text[] default null, p_bank text[] default null, p_needs text default null, p_actor_column text default null, p_reason text default null)
    returns void language plpgsql as $$ begin insert into public.fx_audit values (p_table, p_keys, p_reason); end $$;

  insert into public.hr_staff_costs values ('${BOSS}');
  insert into public.comm_sub_departments (id, name, code, is_active, created_at) values
    ('${FAIR}', 'Fair', 'FAIR', true, '2026-01-01'), ('${IR}', 'IR', null, true, '2026-01-02'), ('${DC}', 'DC', 'DC', true, '2026-01-03'), ('${GONE}', 'Old', 'OLD', false, '2026-01-04');
  insert into public.crm_settings (id, sub_department_id, reply_soon_h, reply_urgent_h, reply_overdue_h, auto_assign, appt_types)
    values (true, '${IR}', 4, 8, 12, true, '[{"id":"online","label":"Online","on":true,"base":"online","fields":[]}]');
  insert into public.crm_showrooms (id, name, sort_order) values ('kl', 'Skyline Embassy B-13A-07', 1), ('astrum', 'Astrum Ampang', 2);
  insert into public.crm_forms (name, kind, sections, sort_order) values
    ('Customer info', 'customer', '[{"id":"s1","title":"About","fields":[]}]', 1), ('Booking', 'booking', '[{"id":"b1","title":"Booking","fields":[]}]', 1);
  insert into public.crm_templates (name, body, status, is_on, meta_name, source) values ('Hello', 'Hi {{1}}', 'approved', true, 'hello', 'meta'), ('Draft', 'Soon', 'draft', false, null, 'crm');
  insert into public.crm_partner_links (id, name, code, is_on) values ('the_conts', 'The Conts', 'pc-abc', true);
`)
// Production's bodies, as production runs them — and the migration on them. Their bodies name tables this fixture does not
// build (crm_appointments, crm_contacts …), so they are checked when called, not when made; the checks below call the ones
// they are about. A checkout with Windows line ends reads as production keeps it.
await db.exec('set check_function_bodies = off')
await db.exec(await readFile(new URL('./crm-management-apart-production.sql', import.meta.url), 'utf8'))
const migration = (await readFile(new URL('../../supabase/migrations/20261124210000_crm_management_apart.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
// Again: every swap finds its statement already swapped, every copy finds its rows already there.
await db.exec(migration)
await db.exec('set check_function_bodies = on')

const as = (reach, manages = true) => db.exec(`select set_config('test.manages', '${manages ? 'on' : ''}', false), set_config('test.reach', '${reach.join(',')}', false), set_config('crm.sub', '', false)`)
await as([FAIR, IR, DC])

// ── Every sub-department starts as the CRM is ─────────────────────────────
check(await q(`select sub_department_id::text as sub, reply_soon_h as s, auto_assign as a, appt_types->0->>'id' as t from crm_sub_settings order by 1`),
  [{ sub: FAIR, s: 4, a: true, t: 'online' }, { sub: IR, s: 4, a: true, t: 'online' }, { sub: DC, s: 4, a: true, t: 'online' }],
  'each active sub-department has the CRM settings it read before (an inactive one none)')
check(await one(`select count(*)::int from fx_audit where tbl = 'crm_sub_settings'`), 2, 'the new table is in the audit (once a run)')
check(await q(`select sub_department_id::text as sub, kind, count(*)::int as n from crm_forms group by 1, 2 order by 1, 2`),
  [FAIR, IR, DC].flatMap(s => [{ sub: s, kind: 'booking', n: 1 }, { sub: s, kind: 'customer', n: 1 }]), "IR's forms copied to each other sub-department, once")
check(await q(`select sub_department_id::text as sub, meta_name, is_on from crm_templates order by 1, 2`),
  [{ sub: IR, meta_name: 'hello', is_on: true }, { sub: IR, meta_name: null, is_on: false }],
  "the templates stay IR's — The Conts' own words; DC's list starts empty")
check(await q(`select distinct sub_department_id::text as sub from crm_showrooms union all select distinct sub_department_id::text from crm_partner_links`),
  [{ sub: IR }, { sub: IR }], 'the showrooms and the booking link stay IR’s')

// ── Settings › General, each one's own ────────────────────────────────────
await q(`select crm_save_settings_in('${DC}', 2, 5, 7, false, false, true, true, false, true)`)
check(await q(`select sub_department_id::text as sub, reply_soon_h as s, reply_overdue_h as o, auto_assign as a from crm_sub_settings order by 1`),
  [{ sub: FAIR, s: 4, o: 12, a: true }, { sub: IR, s: 4, o: 12, a: true }, { sub: DC, s: 2, o: 7, a: false }], "DC's save lands on DC's alone")
check(await one(`select reply_soon_h from crm_settings`), 4, 'crm_settings stays as it was')
await as([FAIR, IR, DC])
const read = await one(`select crm_settings_read()`)
check([read.replySoonH, read.scope, read.bySub[DC].replySoonH, read.bySub[DC].autoAssign, read.bySub[IR].replySoonH], [4, IR, 2, false, 4],
  "the read: the CRM's own (IR's), and every sub-department's by id")
await q(`select crm_save_settings(3, 6, 9, true, true, true, true, false, true)`)
check(await one(`select reply_soon_h from crm_sub_settings where sub_department_id = '${IR}'`), 3, 'the save as before is IR’s')
check(await one(`select reply_soon_h from crm_sub_settings where sub_department_id = '${DC}'`), 2, '…and leaves DC’s')

// A customer reads its own sub-department's settings.
await as([FAIR, IR, DC])
check(await q(`select (crm_settings_of('${DC_NO}')).auto_assign as dc, (crm_settings_of('${CONTS_NO}')).auto_assign as ir, (crm_settings_of('elsewhere')).reply_soon_h as other`),
  [{ dc: false, ir: true, other: 3 }], "a Dream Crafter number's customer reads DC's, The Conts' IR's, another's the CRM's own")
check(await one(`select crm_sub_of('${DC_NO}')::text`), DC, "Dream Crafter's number is DC's")

// Asked of the caller: CRM · Manage and the sub-department in their CRM reach.
await as([IR])
await refuses(`select crm_save_settings_in('${DC}', 3, 6, 9, true, true, true, true, false, true)`, '42501', "a sub-department outside one's CRM reach")
await as([FAIR, IR, DC], false)
await refuses(`select crm_save_settings_in('${DC}', 3, 6, 9, true, true, true, true, false, true)`, '42501', 'somebody who does not manage the CRM')
await as([FAIR, IR, DC, GONE])
await refuses(`select crm_save_settings_in('${GONE}', 3, 6, 9, true, true, true, true, false, true)`, '22023', 'a sub-department that is not active')

// A sub-department with no row of its own reads IR's — and, written once, starts as a copy of IR's.
await db.exec(`delete from crm_sub_settings where sub_department_id = '${FAIR}'`)
await as([FAIR, IR, DC])
check(await one(`select (crm_settings_of_sub('${FAIR}')).reply_soon_h`), 3, "with none of its own: IR's")
await q(`select crm_save_appt_types_in('${FAIR}', '[{"id":"phone","label":"Phone","on":true,"base":"place","fields":[]}]')`)
check(await q(`select reply_soon_h as s, reply_overdue_h as o, appt_types->0->>'id' as t from crm_sub_settings where sub_department_id = '${FAIR}'`),
  [{ s: 3, o: 9, t: 'phone' }], "Fair's first save keeps IR's reply lines and takes its own appointment types")
check(await one(`select appt_types->0->>'id' from crm_sub_settings where sub_department_id = '${IR}'`), 'online', "IR's appointment types unchanged")
await as([FAIR, IR, DC])
await db.exec(`select set_config('crm.sub', '${FAIR}', false)`)
check(await one(`select crm_appt_types_in_force()->0->>'id'`), 'phone', 'the types in force are the current sub-department’s')
await as([FAIR, IR, DC])
check(await one(`select crm_appt_types_in_force()->0->>'id'`), 'online', '…IR’s when none is set')

// ── Showrooms ─────────────────────────────────────────────────────────────
const dcRoom = await one(`select crm_save_showroom_full_in('${DC}', null, 'Skyline Embassy B-13A-07', 'KL', '{11:00}', 2, '{}', '[]', true)`)
check(await one(`select sub_department_id::text from crm_showrooms where id = $1`, [dcRoom.id]), DC, "DC's showroom, named as IR's one is, on DC's list")
await as([FAIR, IR, DC])
await refuses(`select crm_save_showroom_full_in('${DC}', null, 'skyline embassy b-13a-07', '', '{}', 2, '{}', '[]', true)`, '23505', 'the same name twice on one list')
await as([FAIR, IR, DC])
await refuses(`select crm_save_showroom_full_in('${DC}', 'kl', 'Renamed', '', '{}', 2, '{}', '[]', true)`, '22023', "IR's showroom is not changed from DC's list")
await as([FAIR, IR, DC])
await q(`select crm_save_showroom_full('kl', 'Skyline Embassy B-13A-07', 'KL', '{11:00}', 2, '{}', '[]', true)`)
check(await one(`select name from crm_showrooms where id = 'kl'`), 'Skyline Embassy B-13A-07', "IR's keeps its name beside DC's")
await q(`select crm_save_showroom_draft('new:${DC}', '{"name":"Half typed"}')`)
check(await one(`select draft->>'name' from crm_showroom_drafts where room = 'new:${DC}'`), 'Half typed', "a new showroom's draft is DC's own")
await refuses(`select crm_save_showroom_draft('new:somewhere', '{}')`, '22023', 'a draft for no showroom')

// ── Forms: each kind's in-use one is its sub-department's ─────────────────
const sections = `'[{"id":"s1","title":"About","fields":[{"id":"name","label":"Name","type":"Text","req":1}]}]'`
const dcForm = await one(`select (crm_save_form_in('${DC}', null, 'DC booking', ${sections}, 'booking')).id::text`)
check(await one(`select sub_department_id::text from crm_forms where id = $1`, [dcForm]), DC, "a form made in DC's view is DC's")
await as([FAIR, IR, DC])
await q(`select crm_set_active_form($1)`, [dcForm])
check(await one(`select crm_booking_form_of('${DC}')->0->>'title'`), 'About', "DC's booking link asks DC's form in use")
check(await one(`select crm_booking_form()->0->>'title'`), 'Booking', "IR's still asks IR's")
const irBooking = await one(`select id::text from crm_forms where kind = 'booking' and sub_department_id = '${IR}'`)
await refuses(`select crm_delete_form('${irBooking}')`, '22023', "IR's only booking form stays in use")
await as([FAIR, IR, DC])
await refuses(`select crm_save_form_in('${DC}', '${irBooking}', 'X', ${sections}, 'booking')`, '22023', "IR's form is not changed from DC's list")

// ── Templates: Import from Meta fills one list ────────────────────────────
await as([FAIR, IR, DC])
check(await one(`select crm_import_templates_in('${DC}', '[{"name":"hello","body":"Hello again","language":"en"},{"name":"promo","body":"Sale"}]')`), 2, 'both new on DC’s list')
check(await q(`select sub_department_id::text as sub, meta_name, body, is_on from crm_templates where meta_name is not null order by 1, 2`),
  [{ sub: IR, meta_name: 'hello', body: 'Hi {{1}}', is_on: true }, { sub: DC, meta_name: 'hello', body: 'Hello again', is_on: false }, { sub: DC, meta_name: 'promo', body: 'Sale', is_on: false }],
  "DC's import puts Meta's templates on DC's list, Off — the name IR's list has too stays as IR's")
await as([FAIR, IR, DC])
check(await one(`select crm_import_templates_in('${DC}', '[{"name":"hello","body":"Hello, newer","language":"en"}]')`), 0, 'imported again: none new')
check(await q(`select sub_department_id::text as sub, body from crm_templates where meta_name = 'hello' order by 1`),
  [{ sub: IR, body: 'Hi {{1}}' }, { sub: DC, body: 'Hello, newer' }], "…and Meta's new words reach DC's copy alone")
await as([FAIR, IR, DC])
const dcTpl = await one(`select (crm_save_template_in('${DC}', null, 'DC hello', 'whatsapp', 'Hi from DC', 'en', 'MARKETING')).sub_department_id::text`)
check(dcTpl, DC, "a template made in DC's view is DC's")

// ── The booking link ──────────────────────────────────────────────────────
check(await one(`select crm_partner_links_read()->0->>'sub'`), IR, "the booking link names its sub-department (IR's)")

// ── Every swap is in production's bodies, once ────────────────────────────
for (const [fn, text] of [
  ['crm_assign_contact', 'crm_settings_of(c.account_id)).auto_assign'], ['crm_auto_reply_due', 'crm_settings_of(c.account_id)).send_auto_reply'],
  ['notify_crm_message', 'crm_settings_of(c.account_id)).push_messages'], ['notify_crm_due', 'CROSS JOIN LATERAL public.crm_settings_of(c.account_id) st'],
  ['crm_book_typed', "set_config('crm.sub'"], ['crm_move_typed', "set_config('crm.sub'"], ['crm_partner_page', 'crm_booking_form_of(coalesce(p.sub_department_id'],
  ['crm_partner_book', 'That showroom is not on this link.'], ['crm_set_ft_even', 'crm_sub_settings_ensure'],
]) check(await one(`select count(*)::int from pg_proc where proname = $1 and strpos(prosrc, $2) > 0`, [fn, text]), 1, `${fn} reads the customer's sub-department`)
check(await one(`select count(*)::int from pg_proc where proname = 'notify_crm_due' and prosrc ~ 'FROM public.crm_settings s WHERE s.id\\), true\\) THEN RETURN 0'`), 0,
  "the sweep no longer stops for everybody when one sub-department's Reminders are off")
check(await one(`select count(*)::int from pg_proc p where p.proname like 'crm\\_%' and p.prosrc ~ 'update crm_settings set'`), 0, 'nothing writes crm_settings any more')

console.log(`CRM management apart by sub-department: ${checks} checks passed`)
