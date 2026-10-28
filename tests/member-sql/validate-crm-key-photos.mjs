// Local PostgreSQL regression for 20261028130000 (2026-10-28, the unit's key handed over with a photo). Every CRM migration
// runs VERBATIM, then the key photos. Under test: who may hand a key over, its folder, Show up / No show asking for the key returned. No live I/O.
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
for (const [who, role, upline] of [['boss', 'boss', null], ['hod', 'hod', 'boss'], ['tla', 'tl', 'hod'], ['ann', 'rs', 'tla'], ['ben', 'rs', 'tla']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'boss' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
// The files' table (mig 20261023150000) — only what the check reads.
await db.exec(`create table public.file_objects (bucket_id text not null, name text not null, primary key (bucket_id, name))`)
for (const m of ['20261028130000_crm_key_photos.sql', '20261028130100_crm_key_photos_required.sql']) await db.exec((await readFile(new URL(m, dir), 'utf8')).replace(/\r\n/g, '\n'))

const contact = (await q(`insert into crm_contacts (channel, account_id, external_id, name, assigned_to, status) values ('whatsapp', 'PN1', 'key-1', 'Key', $1, 'appointment') returning id`, [id('s', 'ann')]))[0].id
const visit = async () => (await q(`insert into crm_appointments (contact_id, showroom, start_at, minutes, state) values ($1, 'kl', now(), 60, 'booked') returning id`, [contact]))[0].id
const file = async name => { await q(`insert into file_objects values ('crm-media', $1)`, [`${contact}/${name}`]); return `${contact}/${name}` }
const outcome = (who, v, came, o = 'follow_up') => as(who, `select public.crm_visit_outcome($1, $2, $3)`, [v, came, o])
const key = (who, v, kind, path) => as(who, `select public.crm_set_key_photo($1, $2, $3)`, [v, kind, path])

// Every Show up needs the key returned.
const v1 = await visit()
await assert.rejects(outcome('ann', v1, true), /key returned first/, 'Show up without the key returned is refused'); checks++
await assert.rejects(key('ann', v1, 'out', `${contact}/never-uploaded.jpg`), /did not arrive/, 'a photo that never arrived is refused'); checks++
await assert.rejects(key('ann', v1, 'out', `${id('s', 'x')}/a.jpg`), /not in this customer/, 'a photo outside the customer’s folder is refused'); checks++
await assert.rejects(key('ann', v1, 'lent', await file('k0.jpg')), /collected or returned/, 'only out or back'); checks++
await assert.rejects(key('ben', v1, 'out', await file('k1.jpg')), /./, 'somebody who may not reply to the customer may not'); checks++
const out = (await key('ann', v1, 'out', await file('k2.jpg')))[0].crm_set_key_photo
check([out.key_out_path, !!out.key_out_at, out.key_out_by, out.key_back_path], [`${contact}/k2.jpg`, true, id('s', 'ann'), null], 'the key collected: its photo, when, by whom')
await assert.rejects(outcome('ann', v1, true), /key returned first/, 'collected is not returned'); checks++
await key('tla', v1, 'back', await file('k3.jpg'))
check((await q(`select key_back_path, key_back_by from crm_appointments where id = $1`, [v1]))[0], { key_back_path: `${contact}/k3.jpg`, key_back_by: id('s', 'tla') }, 'their upline may take the photo too')
await outcome('ann', v1, true)
check((await q(`select state from crm_appointments where id = $1`, [v1]))[0].state, 'attended', 'with the key returned, Show up goes')
await assert.rejects(key('ann', v1, 'back', await file('k4.jpg')), /already marked/, 'a marked visit takes no more key photos'); checks++

// A No show: only once the key was collected.
const v2 = await visit()
await outcome('ann', v2, false)
check((await q(`select state from crm_appointments where id = $1`, [v2]))[0].state, 'no_show', 'No show with no key collected goes as before')
const v3 = await visit()
await key('ann', v3, 'out', await file('k5.jpg'))
await assert.rejects(outcome('ann', v3, false, 'rebooked'), /collected: take a photo of it returned/, 'a collected key must come back before a No show (Rebook too)'); checks++
await key('ann', v3, 'back', await file('k6.jpg'))
await outcome('ann', v3, false, 'rebooked')
check((await q(`select state from crm_appointments where id = $1`, [v3]))[0].state, 'no_show', '…then it goes')

const acl = (await q(`select proacl::text as acl from pg_proc where proname = 'crm_set_key_photo'`))[0].acl
check([/(^|[{,])anon=/.test(acl), /(^|[{,])=X/.test(acl), /authenticated=X/.test(acl)], [false, false, true], 'crm_set_key_photo: signed-in sessions only')
console.log(`validate-crm-key-photos: ${checks} checks passed`)
