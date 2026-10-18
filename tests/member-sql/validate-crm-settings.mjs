// Local PostgreSQL regression for 20261018100000 (2026-10-18, Settings › General editable — the owner: "可以，照这三项做").
// Every CRM migration runs VERBATIM. Under test: the three settings default to what the CRM did (3 · 6 · 9 h, the
// template suggested, auto-assign on); only CRM · Manage saves them, the lines rising 1–24 h; anybody in the CRM reads
// them; auto-assign off leaves a new lead with nobody; notify_crm_due reads the lines. No live I/O.
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
  create table public.titles (id uuid primary key, name text);
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
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const read = async who => (await as(who, `select public.crm_settings_read() as s`))[0].s
const save = (who, ...a) => as(who, `select public.crm_save_settings($1, $2, $3, $4, $5) as s`, a)
const today = { replySoonH: 3, replyUrgentH: 6, replyOverdueH: 9, suggestTemplate: true, autoAssign: true }

// ── 1. Defaults: exactly what the CRM does today ──
check(await read('ann'), today, 'a salesperson reads 3 · 6 · 9, template on, auto-assign on')
check(await read('boss'), today, '…and so does the Principal')
check(await read(null), null, 'nobody signed in: nothing')

// ── 2. Who saves ──
await assert.rejects(save('ann', 2, 4, 8, false, false), /may not|not allowed|change the CRM/i, 'a salesperson cannot save'); checks++
await assert.rejects(save('tla', 2, 4, 8, false, false), /may not|not allowed|change the CRM/i, 'a team leader cannot save'); checks++
check(await read('ann'), today, '…nothing changed')
check((await save('hod', 2, 4, 8, true, true))[0].s, { ...today, replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8 }, 'the Revenue Director saves, and gets the new values back')
check(await read('ann'), { ...today, replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8 }, 'everybody reads them')
check((await q(`select updated_by from crm_settings where id`))[0].updated_by, id('s', 'hod'), 'who saved it is kept')

// ── 3. The lines must rise, 1–24 h ──
for (const [a, b, c, why] of [[6, 6, 9, 'equal lines'], [0, 6, 9, 'under 1 h'], [3, 6, 25, 'past 24 h'], [9, 6, 3, 'falling']]) {
  await assert.rejects(save('boss', a, b, c, true, true), /must rise/, why); checks++
}
await assert.rejects(save('boss', 3, 6, 9, null, true), /needs a value/, 'a missing switch'); checks++

// ── 4. Auto-assign off: a new lead waits with nobody; on again: dealt ──
await q(`insert into crm_ad_assign (ad_source_id, mode, started_at) values ('AD1', 'even', now())`).catch(() => {})
await save('boss', 3, 6, 9, true, false)
const arrive = async (ext, ad) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id) values ('whatsapp', 'PN1', $1, $1, $2) returning id`, [ext, ad]))[0].id
  const r = (await q(`select public.crm_assign_contact($1) as r`, [c]))[0].r
  return { r, row: (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0] }
}
let got = await arrive('c1', 'AD1')
check([got.r, got.row], [{ assigned: false, waits: 'organic' }, { assigned_to: null, team_id: null }], 'off: an ad lead is dealt to nobody')
got = await arrive('c2', null)
check([got.r, got.row], [{ assigned: false, waits: 'organic' }, { assigned_to: null, team_id: null }], 'off: a no-ad lead is not given to the Director either')
await save('boss', 3, 6, 9, true, true)
got = await arrive('c3', null)
check([got.r.assigned, got.row.assigned_to], [true, id('s', 'hod')], 'on again: a no-ad lead goes to the Director, as before')

// ── 5. notify_crm_due reads the lines (its body, not run: app_notifications is the portal's) ──
const src = (await q(`select prosrc from pg_proc where proname = 'notify_crm_due'`))[0].prosrc
check(/make_interval\(hours => v_s1\)/.test(src) && !/interval '3 hours'/.test(src), true, 'the waiting notices start at the saved first line')
check(/reply_overdue_h/.test(src), true, '…and read the Overdue line')

// ── 6. Grants ──
for (const fn of ['crm_settings_read', 'crm_save_settings']) {
  const f = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = $1`, [fn]))[0]
  check(f.prosecdef, true, `${fn}: SECURITY DEFINER`)
  check(/(^|[{,])anon=/.test(f.acl) || /(^|[{,])=X/.test(f.acl), false, `${fn}: not the publishable key's, nor PUBLIC's`)
}
await db.exec(`set test.uid = '${id('u', 'ann')}'; set role authenticated`)
await assert.rejects(db.query(`update crm_settings set auto_assign = false`), /permission denied/, 'no direct write to the table'); checks++
await db.exec(`reset role; set test.uid = ''`)

console.log(`crm settings: ${checks} checks passed`)
