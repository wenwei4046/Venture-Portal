// Local PostgreSQL regression for the CRM desktop (CRM Desktop rev 1, 2026-10-13, migs 20261013100000 / 20261014010000).
// Every CRM migration runs VERBATIM; under test: the journey events, reminders, deleted notifications,
// showroom photo and map links, closures for some hours, forms, Customer info answers and notes,
// each asking who may. No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.users (id uuid primary key, is_active boolean not null default true, role text);
  create table public.titles (id uuid primary key, name text, template_id uuid);
  -- The permission matrix, as far as the CRM's console reads and writes it (mig 20261014010000).
  create table public.permission_templates (id uuid primary key, name text, base_role text);
  create table public.permission_template_grants (template_id uuid, function_key text, action text, scope text);
  create table public.user_permission_cells (user_id uuid, function_key text, action text, scope text, updated_at timestamptz default now(), updated_by uuid,
    primary key (user_id, function_key, action));
  create function public.permission_cell_is_valid(p_function text, p_action text, p_scope text) returns boolean language sql stable as $$
    select p_function = 'crm' and p_action in ('view', 'edit', 'manage') and (p_scope is null or p_scope in ('own', 'all')) $$;
  create table public.audit_events (id bigserial primary key, occurred_at timestamptz default now(), actor_id uuid, table_name text, op text, old_row jsonb, new_row jsonb);
  create table public.hr_staff_costs (
    id uuid primary key, employee_name text, user_id uuid references public.users(id),
    title_id uuid references public.titles(id), reports_to uuid references public.hr_staff_costs(id), status text not null default 'active');
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
// The CRM asks the permission matrix (20261010030000): each person holds their role's seeded cells.
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'ta', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
// Boss → HOD → TL A (→ Ann, Amir) and TL B (→ Ben).
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'],
  ['ann', 'rs', 'tla'], ['amir', 'rs', 'tla'], ['tlb', 'tl', 'hod'], ['ben', 'rs', 'tlb']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const S = who => id('s', who)
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const contact = async (name, owner) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, last_customer_at) values ('whatsapp', 'PN1', $1, $1, now()) returning id`, [name]))[0].id
  if (owner) await q(`update crm_contacts set assigned_to = $2 where id = $1`, [c, S(owner)])
  return c
}
const kinds = async c => (await q(`select kind from crm_events where contact_id = $1 order by id`, [c])).map(r => r.kind)

// B1 · The journey is recorded by triggers.
const cA = await contact('Aisha', 'ann')
check(await kinds(cA), ['assigned'], 'assigning a customer records it')
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body) values ($1, 'w1', 'in', 'text', 'hi')`, [cA])
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, auto) values ($1, 'w2', 'out', 'text', 'auto hi', true)`, [cA])
check(await kinds(cA), ['assigned'], 'neither the customer’s message nor an auto-reply is a first reply')
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, sent_by) values ($1, 'w3', 'out', 'text', 'hello', $2)`, [cA, S('ann')])
await q(`insert into crm_messages (contact_id, external_id, direction, kind, body, sent_by) values ($1, 'w4', 'out', 'text', 'again', $2)`, [cA, S('ann')])
check(await kinds(cA), ['assigned', 'first_reply'], 'the first reply, once')
const st = (await q(`select status from crm_contacts where id = $1`, [cA]))[0].status
await q(`update crm_contacts set status = $2 where id = $1`, [cA, st === 'appointment' ? 'follow_up' : 'appointment'])
check((await kinds(cA)).at(-1), 'status', 'a status change')
await q(`insert into crm_showrooms (id, name, active, sort_order, slots, cap, weekly, blocks) values ('t1', 'Test room', true, 9, '{10:00,14:00}', 2, '{}',
  '[{"a":"2030-01-07","b":"2030-01-07","why":"Event","ranges":[{"f":"13:00","t":"15:00"}]},{"a":"2030-01-08","b":"2030-01-08","why":"Closed"}]')`)
const v = (await q(`insert into crm_appointments (contact_id, showroom, start_at) values ($1, 't1', '2030-01-07 10:00+08') returning id`, [cA]))[0].id
await q(`update crm_appointments set start_at = '2030-01-09 10:00+08' where id = $1`, [v])
await q(`update crm_appointments set state = 'cancelled' where id = $1`, [v])
check((await kinds(cA)).slice(-3), ['appt_booked', 'appt_changed', 'appt_cancelled'], 'a visit booked, changed, cancelled')

// B2 · Remind: CRM · Manage only, an event for the owner.
await refused('ann', `select public.crm_remind($1)`, [cA], /may not/, 'a salesperson may not send reminders')
await refused('tla', `select public.crm_remind($1)`, [cA], /may not/, 'a team leader may not either')
const cNone = await contact('Nobody')
await refused('boss', `select public.crm_remind($1)`, [cNone], /Nobody has this customer/, 'nobody to remind')
await as('boss', `select public.crm_remind($1)`, [cA])
check((await q(`select owner = $2 as ok, data ->> 'to' = $2::text as to from crm_events where contact_id = $1 and kind = 'reminded'`, [cA, S('ann')]))[0], { ok: true, to: true }, 'the reminder is Ann’s')
check((await as('ann', `select count(*)::int as n from crm_events where contact_id = $1 and kind = 'reminded'`, [cA]))[0].n, 1, '…and Ann reads it')

// B3 · Deleted notifications are one's own.
await as('ann', `select public.crm_delete_notifs($1)`, [['e1', 'e2', 'o3']])
await as('ann', `select public.crm_delete_notifs($1, true)`, [['e1']])
check((await q(`select notif_deleted from crm_staff_prefs where staff_id = $1`, [S('ann')]))[0].notif_deleted.sort(), ['e2', 'o3'], 'deleted, then one restored')
check((await q(`select count(*)::int as n from crm_staff_prefs where staff_id = $1 and notif_deleted <> '{}'`, [S('ben')]))[0].n, 0, 'Ben’s untouched')

// B4 · A showroom's photo and links: CRM · Manage only.
await refused('ann', `select public.crm_save_showroom_extras('t1', null, 'https://maps.app.goo.gl/x', null)`, [], /may not/, 'a salesperson may not change a showroom')
await refused('boss', `select public.crm_save_showroom_extras('t1', null, 'javascript:alert(1)', null)`, [], /https/, 'a map link is https')
await refused('boss', `select public.crm_save_showroom_extras('t1', 'kl/photo.jpg', null, null)`, [], /not this showroom/, 'a photo from another showroom’s folder')
await as('hod', `select public.crm_save_showroom_extras('t1', 't1/photo.jpg', 'https://maps.app.goo.gl/x', 'https://waze.com/ul?q=x')`)
check((await q(`select photo_path, map_google, map_waze from crm_showrooms where id = 't1'`))[0], { photo_path: 't1/photo.jpg', map_google: 'https://maps.app.goo.gl/x', map_waze: 'https://waze.com/ul?q=x' }, 'saved')

// B9 · A closure for some hours closes only them; a block with none closes the day.
await q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-07 10:00+08'])
checks++
await assert.rejects(() => q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-07 14:00+08']), /closed at that time/, '14:00 falls in 13:00–15:00'); checks++
await assert.rejects(() => q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-08 10:00+08']), /closed that day/, 'a block with no hours closes the day'); checks++
await assert.rejects(() => q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-07 11:00+08']), /does not take bookings/, 'slots still decide'); checks++
// …and round 2's one-window closure (t1 / t2, the phone panel) counts the same (mig 20261013220000).
await q(`update crm_showrooms set blocks = '[{"a":"2030-01-14","b":"2030-01-14","why":"Training","t1":"13:00","t2":"15:00"}]' where id = 't1'`)
await q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-14 10:00+08'])
checks++
await assert.rejects(() => q(`select public.crm_slot_check('t1', $1::timestamptz)`, ['2030-01-14 14:00+08']), /closed at that time/, 't1 / t2 closes its hours, not the day'); checks++

// B5 · Forms and Customer info's own answers.
const sections = JSON.stringify([{ id: 's1', title: 'Customer', fields: [{ id: 'name', label: 'Name', type: 'Text', req: 1, locked: 1 }, { id: 'f_pets', label: 'Pets', type: 'Choice', req: 0, opts: ['Yes', 'No'] }] }])
await refused('ann', `select public.crm_save_form(null, 'Customer info', $1)`, [sections], /may not/, 'a salesperson may not change the forms')
await refused('boss', `select public.crm_save_form(null, 'Customer info', '[]')`, [], /at least one section/, 'a form needs a section')
await refused('boss', `select public.crm_save_form(null, 'X', $1)`, [JSON.stringify([{ id: 's', title: 'S', fields: [{ id: 'a', label: '', type: 'Text' }] }])], /name and a type/, 'a question needs a name')
const form = (await as('boss', `select (public.crm_save_form(null, 'Customer info', $1)).id`, [sections]))[0].id
check((await as('ben', `select name from crm_forms`)).map(r => r.name), ['Customer info'], 'everybody in the CRM reads the form')
await as('ann', `select public.crm_save_details($1, 'Aisha', null, 'Condo', null, null, null, null, $2)`, [cA, JSON.stringify({ f_pets: 'Yes' })])
check((await q(`select extra from crm_contacts where id = $1`, [cA]))[0].extra, { f_pets: 'Yes' }, 'an answer to the form’s own question is kept')
await as('ann', `select public.crm_save_details($1, 'Aisha', null, null, null, null, null, null, $2)`, [cA, JSON.stringify({ f_pets: null })])
check((await q(`select extra from crm_contacts where id = $1`, [cA]))[0].extra, {}, '…and cleared')
await refused('ben', `select public.crm_save_details($1, 'Aisha', null, null, null, null, null, null, '{}')`, [cA], /may not/, 'not somebody else’s customer')
await refused('ann', `select public.crm_save_details($1, 'Aisha', null, null, null, null, null, null, $2)`, [cA, JSON.stringify({ x: { y: 1 } })], /could not be read/, 'answers are words')
await as('hod', `select public.crm_delete_form($1)`, [form])
check((await q(`select count(*)::int as n from crm_forms`))[0].n, 0, 'deleted')

// B6 · Notes: whoever may work the customer writes; whoever reads the customer reads.
await refused('ben', `select public.crm_add_note($1, 'x')`, [cA], /may not/, 'Ben may not note Ann’s customer')
await refused('ann', `select public.crm_add_note($1, '  ')`, [cA], /Write the note/, 'an empty note')
await as('ann', `select public.crm_add_note($1, 'Wants a sofa bed')`, [cA])
await as('boss', `select public.crm_add_note($1, 'Call after 6')`, [cA])
check((await as('tla', `select body from crm_notes`)).map(r => r.body).sort(), ['Call after 6', 'Wants a sofa bed'], 'her TL reads them')
check((await as('ben', `select count(*)::int as n from crm_notes`))[0].n, 0, 'Ben does not')

// The permissions console (mig 20261014010000): CRM · Manage changes another person's CRM row, never their own,
// the Boss's or a Principal template's; only the CRM's cells.
await q(`insert into permission_templates values ('00000000-0000-4000-8000-0000000000a1', 'Revenue Team', 'revenue_member'), ('00000000-0000-4000-8000-0000000000a2', 'Ultimate full access', 'principal')`)
await q(`update titles set template_id = '00000000-0000-4000-8000-0000000000a1' where name in ('rs', 'tl', 'ta', 'hod')`)
await q(`update titles set template_id = '00000000-0000-4000-8000-0000000000a2' where name = 'boss'`)
await q(`insert into permission_template_grants values ('00000000-0000-4000-8000-0000000000a1', 'crm', 'view', 'own'), ('00000000-0000-4000-8000-0000000000a1', 'crm', 'edit', 'own')`)
await q(`insert into user_permission_cells (user_id, function_key, action, scope) values ($1, 'treasury', 'view', 'all')`, [id('u', 'ann')])
const cellsOf = async who => q(`select function_key, action, scope from user_permission_cells where user_id = $1 order by function_key, action`, [id('u', who)])
await refused('ann', `select public.crm_set_access($1, 'all', 'own', 'none')`, [S('ben')], /may not/, 'a salesperson may not change permissions')
await refused('hod', `select public.crm_set_access($1, 'all', 'all', 'all')`, [S('hod')], /Your own/, 'never on oneself')
await refused('hod', `select public.crm_set_access($1, 'none', 'none', 'none')`, [S('boss')], /Full access/, 'never on the Boss')
await refused('hod', `select public.crm_set_access($1, 'all', 'own', 'own')`, [S('ann')], /Choose title, none, own or all/, 'Manage is none or all')
await as('hod', `select public.crm_set_access($1, 'all', 'title', 'none')`, [S('ann')])
check(await cellsOf('ann'),
  [{ function_key: 'crm', action: 'manage', scope: null }, { function_key: 'crm', action: 'view', scope: 'all' }, { function_key: 'treasury', action: 'view', scope: 'all' }],
  'View all and Manage taken away for Ann; Edit follows her title; her other cells untouched')
await as('boss', `select public.crm_set_access($1, 'title', 'title', 'title')`, [S('ann')])
check((await cellsOf('ann')).map(r => r.function_key), ['treasury'], 'back to her title')
const list = (await as('boss', `select public.crm_access_list() as l`))[0].l
const row = who => list.find(r => r.staffId === S(who))
check([row('ann')?.locked ?? null, row('ann')?.tpl, row('boss')?.locked], [null, { view: 'own', edit: 'own' }, 'Your own'], 'the list: the title cells, and who is locked')
await refused('tla', `select public.crm_access_list()`, [], /may not/, 'a team leader does not see the console')

console.log(`crm desktop: ${checks} checks passed`)
