// Local PostgreSQL regression for 20261024006700 (2026-10-24 — the owner, once every bucket was in R2: "make the size
// more bigger for all, let me know the limit"). The buckets' limits and types are what `file_objects_stamp` asks of
// every file a session sends; this runs 20261023150000 (the twin tables, their policies, the stamp) and then the new
// limits VERBATIM over the same stand-ins as validate-file-objects.mjs, every bucket moved. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1) // Documentation · Create / View, Hiring · View
const MEMBER = id(2) // a Revenue member: own folder only
const FINANCE = id(3) // treasury scope
const OTHER = id(4)

/** Signed in as somebody holding these actions (the stand-ins read them), as the database role. */
async function as(user, actions = [], role = 'authenticated', flags = {}) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false),
                  set_config('test.actions', $3, false), set_config('test.flags', $4, false)`,
    [user ?? '', role ?? '', actions.join(','), JSON.stringify(flags)])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asOwner = async () => { await db.exec('RESET ROLE'); await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)`) }
const put = (bucket, name, size = 10, type = 'application/pdf') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ($1, $2, $3)`, [bucket, name, JSON.stringify({ size, mimetype: type })])
const names = async (bucket) => (await q(`SELECT name FROM public.file_objects WHERE bucket_id = $1 ORDER BY name`, [bucket])).map(r => r.name)
const move = async (bucket) => { await asOwner(); await q(`UPDATE public.file_buckets SET backend = 'r2' WHERE id = $1`, [bucket]) }

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE SCHEMA storage;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA auth, storage, public TO authenticated, anon, service_role;

  -- The permission checks: any wanted 'fn.action' among the actions handed in; a flag for each yes/no helper.
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE FUNCTION public.test_flag(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce((nullif(current_setting('test.flags', true), '')::jsonb ->> p)::boolean, false)
  $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_any_action(ARRAY['scope.' || p_scopes[1]]) $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_any_action(ARRAY['perm.' || p_key]) $$;
  CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.test_flag('manager') $$;
  CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.test_flag('revenue') $$;
  CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT CASE WHEN public.test_flag('crm') THEN auth.uid() END $$;
  CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.test_flag('reply') $$;
  CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('manage', public.test_flag('crm_manage')) $$;
  CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_code = 'hv-ABCDEFGH' $$;
  CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p LIKE '%/kept.pdf' $$;
  CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p NOT LIKE '%/kept.pdf' $$;
  CREATE FUNCTION public.hr_doc_readable_by_hr(p text, p_owner text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p NOT LIKE 'drive/%' OR p_owner = auth.uid()::text $$;
  CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p LIKE 'publish/%' AND public.test_flag('member_doc') $$;
  CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT split_part(p, '/', 1) = auth.uid()::text $$;
  CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT split_part(p, '/', 1) = auth.uid()::text $$;
  CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- The tables the policies read.
  CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');
  CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status NOT NULL);
  CREATE TABLE public.payment_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), storage_path text NOT NULL);
  CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
  CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
  CREATE TABLE public.member_request_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, object_path text);
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
`)

await db.exec((await readFile(new URL('20261023150000_file_storage_r2.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))
const ALL = ['attendance', 'crm-auto-reply', 'crm-media', 'crm-showrooms', 'hiring-files', 'hr-documents', 'it-requests', 'member-forms', 'member-invoices', 'payment-attachments']
for (const b of ALL) await move(b)
const before = Object.fromEntries((await q(`SELECT id, file_size_limit::bigint::text AS s, allowed_mime_types AS t FROM public.file_buckets`)).map(r => [r.id, r]))
const LIMITS = (await readFile(new URL('20261024006700_file_buckets_bigger_uploads.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await asOwner()
await db.exec(LIMITS)

const GB2 = 2147483648
const MB100 = 104857600
const limits = Object.fromEntries((await q(`SELECT id, file_size_limit::bigint::text AS s FROM public.file_buckets`)).map(r => [r.id, Number(r.s)]))
check(limits, {
  'hr-documents': GB2, 'it-requests': GB2,
  'payment-attachments': MB100, 'hiring-files': MB100, attendance: MB100, 'member-forms': MB100, 'member-invoices': MB100, 'crm-media': MB100,
  'crm-showrooms': 5242880, 'crm-auto-reply': 5242880,
}, 'every bucket’s new limit: 2 GB for the two that take videos, 100 MB for documents and photos, the CRM’s pictures at WhatsApp’s 5 MB')
for (const b of ALL.filter(x => x !== 'hr-documents')) {
  check((await q(`SELECT allowed_mime_types AS t FROM public.file_buckets WHERE id = $1`, [b]))[0].t, before[b].t, `${b}: the same types as before`)
}
const hrTypes = (await q(`SELECT allowed_mime_types AS t FROM public.file_buckets WHERE id = 'hr-documents'`))[0].t
check(before['hr-documents'].t.every(t => hrTypes.includes(t)), true, 'hr-documents keeps every type it took')
check(hrTypes.filter(t => !before['hr-documents'].t.includes(t)).sort(), [
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/x-zip-compressed', 'application/zip', 'video/mp4', 'video/quicktime', 'video/webm',
], '…and takes videos, PowerPoint and zip besides')
check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'file_objects'`), 34, 'the 34 policies untouched')
check(await one(`SELECT count(*)::int FROM public.file_buckets WHERE backend = 'r2'`), 10, 'every bucket still in R2')

// ── What a session may now send ───────────────────────────────────────────────────────────────────────────────
const tooBig = /exceeded the maximum allowed size/
const sendRefused = (bucket, name, size, type, pattern, what) =>
  refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ($1, $2, $3)`, [bucket, name, JSON.stringify({ size, mimetype: type })], pattern, what)

await as(HR, ['documentation.create', 'documentation.view'])
await put('hr-documents', 'documents/v1/training.mp4', GB2, 'video/mp4')
await put('hr-documents', 'drive/v2/clip.mov', 900000000, 'video/quicktime')
await put('hr-documents', 'documents/v3/deck.pptx', 50000000, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
await put('hr-documents', 'documents/v4/scans.zip', 300000000, 'application/x-zip-compressed')
check((await q(`SELECT metadata FROM public.file_objects WHERE name = 'documents/v1/training.mp4'`))[0].metadata, { size: GB2, mimetype: 'video/mp4' }, 'a 2 GB video goes into HR Documentation, its size kept whole')
await sendRefused('hr-documents', 'documents/v5/longer.mp4', GB2 + 1, 'video/mp4', tooBig, 'one byte past 2 GB: refused')
await sendRefused('hr-documents', 'documents/v6/page.html', 5, 'text/html', /mime type text\/html is not supported/, 'a web page is still not a document')

await as(MEMBER, [])
await put('it-requests', `${MEMBER}/c1/recording.mp4`, GB2, 'video/mp4')
await sendRefused('it-requests', `${MEMBER}/c1/longer.mp4`, GB2 + 1, 'video/mp4', tooBig, 'an IT request’s file: 2 GB at most')
await sendRefused('it-requests', `${OTHER}/c1/x.mp4`, 5, 'video/mp4', /row-level security/, '…and still only into one’s own folder')

await as(null, [], 'anon')
await put('hiring-files', `guest/hv-ABCDEFGH/${id(9)}.pdf`, MB100, 'application/pdf')
await sendRefused('hiring-files', `guest/hv-ABCDEFGH/${id(10)}.pdf`, MB100 + 1, 'application/pdf', tooBig, 'a guest’s CV: 100 MB at most')
await sendRefused('hiring-files', `guest/hv-ABCDEFGH/${id(11)}.mp4`, 5, 'video/mp4', /mime type video\/mp4 is not supported/, '…and still no video')

await as(FINANCE, ['scope.treasury'])
await put('payment-attachments', `${id(50)}/statement.pdf`, MB100, 'application/pdf')
await sendRefused('payment-attachments', `${id(50)}/bigger.pdf`, MB100 + 1, 'application/pdf', tooBig, 'a voucher’s attachment: 100 MB, where there was no limit')

await asOwner()
await q(`INSERT INTO public.member_requests (id, created_by, status, kind) VALUES ($1, $2, 'draft', 'claim')`, [id(60), MEMBER])
await as(MEMBER, [])
await put('member-invoices', `${MEMBER}/${id(60)}/${id(70)}.pdf`, MB100, 'application/pdf')
await sendRefused('member-invoices', `${MEMBER}/${id(60)}/${id(71)}.pdf`, MB100 + 1, 'application/pdf', tooBig, 'a member’s invoice: 100 MB at most')

await asOwner()
await q(`INSERT INTO public.crm_contacts (id) VALUES ($1)`, [id(80)])
await as(MEMBER, [], 'authenticated', { reply: true })
await put('crm-media', `${id(80)}/brochure.pdf`, MB100, 'application/pdf')
await sendRefused('crm-media', `${id(80)}/bigger.pdf`, MB100 + 1, 'application/pdf', tooBig, 'a chat’s file: WhatsApp’s 100 MB')
await as(MEMBER, [], 'authenticated', { crm: true })
await sendRefused('crm-auto-reply', `${MEMBER}/1-big.png`, 5242881, 'image/png', tooBig, 'an auto-reply picture: still WhatsApp’s 5 MB')

// ── Again: nothing moves ─────────────────────────────────────────────────────────────────────────────────────
await asOwner()
const once = await q(`SELECT id, file_size_limit::bigint::text AS s, allowed_mime_types AS t, backend, public, public_url FROM public.file_buckets ORDER BY id`)
await db.exec(LIMITS)
check(await q(`SELECT id, file_size_limit::bigint::text AS s, allowed_mime_types AS t, backend, public, public_url FROM public.file_buckets ORDER BY id`), once, 're-running it changes nothing')

console.log(`OK — ${checks} checks: 2 GB for HR Documentation (videos, PowerPoint, zip) and IT requests, 100 MB for the rest, the CRM's pictures at 5 MB`)
await db.close()
