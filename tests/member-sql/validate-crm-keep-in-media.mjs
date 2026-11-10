// Local PostgreSQL regression for 20261110140000 (2026-11-10, the owner: "Yes, copy on arrival" — a customer's file kept in
// crm-media as it arrives). Every October CRM migration runs VERBATIM, then the new migration twice. Under test: only the
// service role may call either function; only an incoming message; only the path `<its customer>/in-<its id>.<ext>`; only
// a file that arrived; what is listed (WhatsApp under 7 days, Messenger before its oe=), counted as tried, 6 tries at most.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (p, re, what) => { await assert.rejects(p, re, what); checks++ }

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
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}
// The files' table (mig 20261023150000) — only what the function reads.
await db.exec(`create table public.file_objects (bucket_id text not null, name text not null, primary key (bucket_id, name))`)
const migration = (await readFile(new URL('20261110140000_crm_keep_in_media.sql', dir), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
await db.exec(migration) // runs twice cleanly

const wa = (await q(`insert into crm_contacts (channel, account_id, external_id, name) values ('whatsapp', 'PN1', '6011', 'Wa') returning id`))[0].id
const fb = (await q(`insert into crm_contacts (channel, account_id, external_id, name) values ('messenger', 'PG1', 'psid-1', 'Fb') returning id`))[0].id
const msg = async (contact, ext, cols) => (await q(
  `insert into crm_messages (contact_id, external_id, direction, kind, media_id, media_url, media_mime, sent_at)
   values ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(hours => $8)) returning id`,
  [contact, ext, cols.dir ?? 'in', cols.kind ?? 'image', cols.id ?? null, cols.url ?? null, cols.mime ?? null, cols.hoursAgo ?? 1]))[0].id
const oe = secondsFromNow => Math.floor(Date.now() / 1000 + secondsFromNow).toString(16)

const fresh = await msg(wa, 'wamid.1', { id: '111111', mime: 'image/jpeg' })
const old = await msg(wa, 'wamid.2', { id: '222222', hoursAgo: 24 * 8 })
const ours = await msg(wa, 'wamid.3', { dir: 'out', id: '333333' })
const fbLive = await msg(fb, 'mid.1', { url: `https://scontent.xx.fbcdn.net/v/a.jpg?oe=${oe(86400)}` })
const fbDead = await msg(fb, 'mid.2', { url: `https://scontent.xx.fbcdn.net/v/b.jpg?oe=${oe(-60)}` })
const fbNoOe = await msg(fb, 'mid.3', { url: 'https://cdn.fbsbx.com/v/c.pdf', kind: 'document', hoursAgo: 24 * 40 })
const text = await msg(wa, 'wamid.4', { kind: 'text' })

const asRole = async (role, sql, params = []) => {
  await db.exec(`set role ${role}`)
  try { return await q(sql, params) } finally { await db.exec('reset role') }
}
const list = async (ids = null, limit = 20) => (await asRole('service_role', `select public.crm_media_to_keep($1, $2) as r`, [ids, limit]))[0].r
const keep = (m, path, mime = 'image/jpeg') => asRole('service_role', `select public.crm_keep_in_media($1, $2, $3) as r`, [m, path, mime])
const file = async name => { await q(`insert into file_objects values ('crm-media', $1)`, [name]); return name }

// Only the service role.
for (const role of ['authenticated', 'anon']) {
  await refuses(asRole(role, `select public.crm_media_to_keep(null, 5)`), /permission denied/, `${role} cannot list`)
  await refuses(asRole(role, `select public.crm_keep_in_media($1, $2, 'image/jpeg')`, [fresh, `${wa}/in-${fresh}.jpg`]), /permission denied/, `${role} cannot keep`)
}
const acl = (await q(`select string_agg(proacl::text, ' ') as a from pg_proc where proname in ('crm_media_to_keep', 'crm_keep_in_media')`))[0].a
check([/=X\//.test(acl.replace(/service_role=X/g, '').replace(/postgres=X/g, '')), /service_role=X/.test(acl)], [false, true], 'EXECUTE: the service role (and the owner) only')

// What is listed: the delivery's own, WhatsApp under 7 days, Messenger before its oe= (or under 30 days with none).
const delivery = await list(['wamid.1', 'wamid.2', 'wamid.3', 'wamid.4'])
check(delivery.map(r => r.id), [fresh], "a delivery's listing: its incoming file under 7 days only")
check([delivery[0].contactId, delivery[0].channel, delivery[0].mediaId, delivery[0].mime], [wa, 'whatsapp', '111111', 'image/jpeg'], 'a row says what to fetch')
const sweep = (await list()).map(r => r.id).sort()
check(sweep, [fresh, fbLive].sort(), "the sweep: everything still at Meta — not the 8-day-old, the expired oe=, the 40-day one with no oe=, ours, a text")
check((await q(`select media_keep_tries as t from crm_messages where id = $1`, [fresh]))[0].t, 2, 'each listing counts as a try')
for (let i = 0; i < 4; i++) await list(['mid.1'])
check((await list(['mid.1'])).length, 1, 'the sixth try is still listed')
check((await list(['mid.1'])).length, 0, 'a file tried 6 times is listed no more')
check((await q(`select media_keep_tries as t from crm_messages where id = $1`, [fbLive]))[0].t, 6, 'the sixth try was the last')
void old; void fbDead; void fbNoOe

// crm_keep_in_media: only an incoming message, only its own path, only a file that arrived.
await refuses(keep(ours, await file(`${wa}/in-${ours}.jpg`)), /not one a customer sent/, 'our own outgoing message is refused')
await refuses(keep(text, await file(`${wa}/in-${text}.jpg`)), /no file at Meta/, 'a message with no Meta file is refused')
await refuses(keep(fresh, await file(`${fb}/in-${fresh}.jpg`)), /not in this customer/, "another customer's folder is refused")
await refuses(keep(fresh, await file(`${wa}/other-${fresh}.jpg`)), /not in this customer/, 'a name other than in-<id> is refused')
await refuses(keep(fresh, await file(`${wa}/in-${fresh}.jpg/x`)), /not in this customer/, 'nothing past the extension')
await refuses(keep(fresh, `${wa}/in-${fresh}.png`), /did not arrive/, 'a file that never arrived is refused')
await refuses(keep(fresh, `${wa}/in-${fresh}.jpg`, 'image/JPEG; x'), /cannot be kept/, 'a type the database does not take is refused')
check((await keep(fresh, await file(`${wa}/in-${fresh}.jpg`)))[0].r, true, 'its own folder and name: kept')
check((await q(`select media_path, media_mime, media_id from crm_messages where id = $1`, [fresh]))[0],
  { media_path: `${wa}/in-${fresh}.jpg`, media_mime: 'image/jpeg', media_id: '111111' }, 'media_path and media_mime set, the media id kept')
check((await keep(fresh, `${wa}/in-${fresh}.jpg`))[0].r, true, 'kept again with the same file: still true (the webhook and the sweep)')
await file(`${wa}/in-${fresh}.png`)
check((await keep(fresh, `${wa}/in-${fresh}.png`, 'image/png'))[0].r, false, 'a second, different file does not replace the first')
check((await q(`select media_path from crm_messages where id = $1`, [fresh]))[0].media_path, `${wa}/in-${fresh}.jpg`, 'the first file stays')
check((await list(['wamid.1'])).length, 0, 'a kept file is listed no more')
const fbPath = await file(`${fb}/in-${fbLive}.jpg`)
check((await keep(fbLive, fbPath))[0].r, true, "a Messenger customer's file kept in their folder")

console.log(`validate-crm-keep-in-media: ${checks} checks passed`)
