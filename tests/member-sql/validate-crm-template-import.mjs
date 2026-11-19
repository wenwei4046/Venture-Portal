// Local PostgreSQL regression for Import from Meta (2026-11-19, mig 20261119120000): CRM · Manage imports Meta's approved
// templates (Approved, Off), importing again takes Meta's new words, the CRM's own are never touched, an imported one's
// words are refused anywhere else, and a header that is a file needs that file before it switches on. The CRM migrations,
// the two of 2026-11-04 and this one run VERBATIM. No live I/O.
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
// Files (R2, portal-wide/storage.md): the two tables the migration writes a bucket and its policies on.
await db.exec(`
  create table public.file_buckets (id text primary key, public boolean, file_size_limit bigint, allowed_mime_types text[], backend text);
  create table public.file_objects (bucket_id text, name text, primary key (bucket_id, name));
  alter table public.file_objects enable row level security;
  grant select, insert, delete on public.file_objects to authenticated;
`)
const dir = new URL('../../supabase/migrations/', import.meta.url)
for (const file of (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()) {
  await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))
}
// A template says its language and category (2026-11-04): the six-argument save, and Meta's verdict by webhook — run
// VERBATIM after the October ones.
for (const file of ['20261104090000_crm_template_language.sql', '20261104110000_crm_template_status_hook.sql', '20261119120000_crm_template_import.sql']) {
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
let n = 0
/** A new enquiry from an ad, dealt as the ingest deals it. */
const arrive = async (ad, at = null) => {
  const c = (await q(`insert into crm_contacts (channel, account_id, external_id, name, ad_source_id, created_at, last_customer_at)
    values ('whatsapp', 'PN1', $1, $1, $2, coalesce($3::timestamptz, now()), coalesce($3::timestamptz, now())) returning id`, [`c${++n}`, ad, at]))[0].id
  await q(`select public.crm_assign_contact($1)`, [c])
  return (await q(`select assigned_to, team_id from crm_contacts where id = $1`, [c]))[0]
}
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${who ? id('u', who) : ''}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role`) }
}
const refused = async (who, sql, params, pattern, what) => { await assert.rejects(() => as(who, sql, params), pattern, what); checks++ }
const name = staff => ({ [S('ann')]: 'ann', [S('amir')]: 'amir', [S('ben')]: 'ben', [S('tla')]: 'tla', [S('tlb')]: 'tlb', [S('hod')]: 'hod' })[staff] ?? staff



const tpl = async (who, sql, params = []) => (await as(who, sql, params))[0]
const imp = async (who, rows) => (await tpl(who, `select public.crm_import_templates($1) as n`, [JSON.stringify(rows)])).n
const row = name => q(`select name, body, status, is_on, source, language, category, meta_id, parts, header_path from crm_templates where meta_name = $1`, [name]).then(r => r[0])
const grr = { name: 'followup', id: '1121383077314566', language: 'zh_CN', category: 'MARKETING', body: 'Hi 您好！GRR',
  parts: { buttons: [{ type: 'QUICK_REPLY', text: '想了解更多GRR' }] } }

// Only CRM · Manage imports.
await refused('ann', `select public.crm_import_templates($1)`, [JSON.stringify([grr])], /may not/, 'a salesperson may not import')
await refused('tla', `select public.crm_import_templates($1)`, [JSON.stringify([grr])], /may not/, 'nor a TL')
check(await imp('hod', [grr]), 1, 'the Director imports one')
check(await row('followup'), { name: 'followup', body: 'Hi 您好！GRR', status: 'approved', is_on: false, source: 'meta', language: 'zh_CN',
  category: 'MARKETING', meta_id: '1121383077314566', parts: grr.parts, header_path: null }, 'it comes in Approved, Off, from Meta, with its buttons')
check(await imp('boss', [grr]), 0, 'importing again adds nothing')
// A salesperson sees it only once switched on, as every template.
const seen = async who => (await as(who, `select name from crm_templates order by name`)).map(r => r.name)
check(await seen('ann'), [], 'Off: a salesperson sees nothing')
const gid = (await q(`select id from crm_templates where meta_name = 'followup'`))[0].id
await as('hod', `select public.crm_template_on($1, true)`, [gid])
check(await seen('ann'), ['followup'], 'On: a salesperson sees it')
// Its words are Meta's: the CRM's save refuses them, a new name alone goes through.
await refused('hod', `select public.crm_save_template($1, 'followup', 'whatsapp', 'other words', 'zh_CN', 'MARKETING')`, [gid], /imported from Meta/, 'new words refused')
await refused('hod', `select public.crm_save_template($1, 'followup', 'whatsapp', 'Hi 您好！GRR', 'en', 'MARKETING')`, [gid], /imported from Meta/, 'another language refused')
const named = await tpl('hod', `select * from public.crm_save_template($1, 'GRR follow up', 'whatsapp', 'Hi 您好！GRR', 'zh_CN', 'MARKETING')`, [gid])
check([named.name, named.status, named.is_on], ['GRR follow up', 'approved', true], 'a name of its own keeps it Approved and On')
// Importing again takes Meta's new words and keeps it on.
check(await imp('boss', [{ ...grr, body: 'Hi 您好！GRR v2' }]), 0, 'Meta edited it: not new')
const again = await row('followup')
check([again.body, again.is_on, again.name], ['Hi 您好！GRR v2', true, 'GRR follow up'], "Meta's new words, still On, the CRM's name kept")
// The CRM's own template of the same Meta name is never touched.
const own = await tpl('boss', `select * from public.crm_save_template(null, 'Own', 'whatsapp', 'Hi {name}', 'en', 'MARKETING')`)
await as('boss', `select public.crm_template_submitted($1, 'crm_own_x1', 'm1', 'approved')`, [own.id])
check(await imp('boss', [{ ...grr, name: 'crm_own_x1', body: 'stolen' }]), 0, "an import named as the CRM's own adds nothing")
check((await row('crm_own_x1')).body, 'Hi {name}', "and leaves the CRM's own words")
// A PDF header: off until its file is attached.
const pdf = { name: 'grr_pdf', id: '2', language: 'zh_CN', category: 'MARKETING', body: 'GRR 方案', parts: { header: { format: 'DOCUMENT' } } }
check(await imp('boss', [pdf]), 1, 'a template with a PDF header comes in')
const pid = (await q(`select id from crm_templates where meta_name = 'grr_pdf'`))[0].id
await refused('boss', `select public.crm_template_on($1, true)`, [pid], /Attach the picture, video or PDF/, 'it cannot switch on without its file')
await refused('boss', `select public.crm_template_header($1, $2, 'application/pdf', 'GRR.pdf')`, [pid, `${pid}/a.pdf`], /did not arrive/, 'a file that never arrived is refused')
await q(`insert into file_objects values ('crm-templates', $1), ('crm-templates', $2)`, [`${pid}/a.pdf`, `${gid}/b.pdf`])
await refused('boss', `select public.crm_template_header($1, $2, 'application/pdf', 'GRR.pdf')`, [pid, `${gid}/b.pdf`], /Choose the file again/, "another template's file is refused")
await refused('boss', `select public.crm_template_header($1, $2, 'image/png', 'x.png')`, [pid, `${pid}/a.pdf`], /takes a PDF/, 'a picture for a PDF header is refused')
await refused('ann', `select public.crm_template_header($1, $2, 'application/pdf', 'GRR.pdf')`, [pid, `${pid}/a.pdf`], /may not/, 'a salesperson may not attach')
await refused('boss', `select public.crm_template_header($1, $2, 'application/pdf', 'GRR.pdf')`, [gid, `${gid}/b.pdf`], /no picture, video or PDF/, 'a template with no file header takes none')
const att = await tpl('boss', `select * from public.crm_template_header($1, $2, 'application/pdf', 'GRR.pdf')`, [pid, `${pid}/a.pdf`])
check([att.header_path, att.header_name], [`${pid}/a.pdf`, 'GRR.pdf'], 'the PDF is attached')
await as('boss', `select public.crm_template_on($1, true)`, [pid])
check((await row('grr_pdf')).is_on, true, 'and it switches on')
// Meta's header still a PDF: the file stays; no longer one: the file goes and it switches off.
await imp('boss', [pdf])
const kept = await row('grr_pdf')
check([kept.header_path, kept.is_on], [`${pid}/a.pdf`, true], 'imported again, the file and On kept')
await imp('boss', [{ ...pdf, parts: { header: { format: 'IMAGE' } } }])
const moved = await row('grr_pdf')
check([moved.header_path, moved.is_on], [null, false], 'its header is now a picture: the PDF goes, it switches off')
// Taking the file off switches it off.
await q(`insert into file_objects values ('crm-templates', $1)`, [`${pid}/c.png`])
await as('boss', `select public.crm_template_header($1, $2, 'image/png', 'c.png')`, [pid, `${pid}/c.png`])
await as('boss', `select public.crm_template_on($1, true)`, [pid])
await as('boss', `select public.crm_template_header($1, null, null, null)`, [pid])
const off = await row('grr_pdf')
check([off.header_path, off.is_on], [null, false], 'the file taken off: off')
// The bucket and its policies.
check((await q(`select backend, allowed_mime_types from file_buckets where id = 'crm-templates'`))[0], { backend: 'r2', allowed_mime_types: ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'] }, 'the bucket is in R2')
check((await q(`select count(*)::int n from pg_policies where tablename = 'file_objects' and policyname like 'crm template files:%'`))[0].n, 3, 'read, in, out')
check((await as('ann', `select name from file_objects where bucket_id = 'crm-templates' order by name`)).length, 3, 'anybody in the CRM reads a template file (the send uploads it)')
await refused('ann', `insert into file_objects values ('crm-templates', 'x/y.pdf')`, [], /row-level security/, 'a salesperson puts no file there')
await as('hod', `insert into file_objects values ('crm-templates', 'x/z.pdf')`)
await as('hod', `delete from file_objects where bucket_id = 'crm-templates' and name = 'x/z.pdf'`)
check((await q(`select count(*)::int n from file_objects where name = 'x/z.pdf'`))[0].n, 0, 'CRM · Manage puts a file there and takes it away, under its own session')
check((await q(`select count(*)::int n from information_schema.routine_privileges where routine_name in ('crm_import_templates', 'crm_template_header') and grantee in ('anon', 'PUBLIC')`))[0].n, 0, "neither is the publishable key's")

console.log(`crm template import: ${checks} checks passed`)
