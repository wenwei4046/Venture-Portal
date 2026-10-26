// Local PostgreSQL regression for 20261023150000 (2026-10-23 — the owner: every file moves from Supabase Storage to
// Cloudflare R2, the CRM's included). R2 keeps bytes and knows nobody, so every rule Storage kept about a file stays
// in the database: public.file_buckets (storage.buckets' twin, plus which backend holds each bucket) and
// public.file_objects (storage.objects' twin, carrying every one of its policies word for word). The migration runs
// VERBATIM over stand-ins for the sign-in, the permission checks and the tables the policies read. No live I/O.
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

const sql = (await readFile(new URL('20261023150000_file_storage_r2.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(sql)

// ── The buckets: production's, every one still in Storage ─────────────────────────────────────────────────────
check(await one(`SELECT count(*)::int FROM public.file_buckets`), 10, 'ten buckets, as storage.buckets holds')
check(await one(`SELECT count(*)::int FROM public.file_buckets WHERE backend = 'supabase'`), 10, 'none moved by this migration')
check(await one(`SELECT public FROM public.file_buckets WHERE id = 'crm-auto-reply'`), true, 'the auto-reply pictures stay public')
check(await one(`SELECT file_size_limit::int FROM public.file_buckets WHERE id = 'member-invoices'`), 3145728, 'an invoice: 3 MB')
check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'file_objects'`), 34, 'storage.objects’ 34 policies, each one')

// ── Who may touch the tables at all ────────────────────────────────────────────────────────────────────────────
for (const [role, priv, want] of [['authenticated', 'SELECT', true], ['authenticated', 'INSERT', true], ['authenticated', 'DELETE', true],
  ['authenticated', 'UPDATE', false], ['anon', 'SELECT', true], ['anon', 'INSERT', true], ['anon', 'DELETE', false], ['anon', 'UPDATE', false]]) {
  check(await one(`SELECT has_table_privilege($1, 'public.file_objects', $2)`, [role, priv]), want, `${role} ${priv} on file_objects: ${want}`)
}
check(await one(`SELECT has_table_privilege('authenticated', 'public.file_buckets', 'UPDATE')`), false, 'no session moves a bucket')
await as(HR, ['documentation.create'])
check((await q(`SELECT id FROM public.file_buckets`)).length, 10, 'every sign-in reads where the buckets are')

// ── A bucket still in Storage takes no session's row ──────────────────────────────────────────────────────────
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/a/x.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /Bucket not found/, 'hr-documents is not in R2 yet: refused')

// ── hr-documents, once moved ────────────────────────────────────────────────────────────────────────────────
await move('hr-documents')
await as(HR, ['documentation.create', 'documentation.view'])
await put('hr-documents', 'documents/a1/handbook.pdf', 1000, 'application/pdf')
const row = (await q(`SELECT owner::text, owner_id, metadata, created_at > now() - interval '1 minute' AS fresh FROM public.file_objects WHERE name = 'documents/a1/handbook.pdf'`))[0]
check([row.owner, row.owner_id, row.metadata, row.fresh], [HR, HR, { size: 1000, mimetype: 'application/pdf' }, true], 'its owner, its time and its metadata are the database’s')
await q(`INSERT INTO public.file_objects (bucket_id, name, owner, owner_id, created_at, metadata)
          VALUES ('hr-documents', 'documents/a2/x.pdf', $1::uuid, $2, '2020-01-01', '{"size":"7","mimetype":"Application/PDF; charset=x"}')`, [OTHER, OTHER])
check((await q(`SELECT owner::text, owner_id, metadata, created_at > '2021-01-01' AS now FROM public.file_objects WHERE name = 'documents/a2/x.pdf'`))[0],
  { owner: HR, owner_id: HR, metadata: { size: 7, mimetype: 'application/pdf' }, now: true }, 'an owner or a date sent along is not taken; the type is its bare name')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/a1/handbook.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /duplicate key|file_objects_bucket_name/, 'one file per name in a bucket')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/big/x.pdf', '{"size":26214401,"mimetype":"application/pdf"}')`,
  [], /exceeded the maximum allowed size/, 'past the bucket’s 25 MB: Storage’s own words')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/v/x.mp4', '{"size":5,"mimetype":"video/mp4"}')`,
  [], /mime type video\/mp4 is not supported/, 'a type the bucket does not take: Storage’s own words')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/n/x.pdf', '{"mimetype":"application/pdf"}')`,
  [], /needs its size and type/, 'no size: refused')
for (const bad of ['/documents/x.pdf', 'documents//x.pdf', 'documents/../x.pdf', 'documents/./x.pdf', 'documents/x.pdf/', 'documents/x\u0001.pdf']) {
  await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', $1, '{"size":5,"mimetype":"application/pdf"}')`,
    [bad], /not a path the bucket keeps/, `not a path: ${JSON.stringify(bad)}`)
}
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'elsewhere/x.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /row-level security/, 'only under documents/ letters/ publish/ drive/ (hr_documents_upload)')
await as(MEMBER, [])
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hr-documents', 'documents/m/x.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /row-level security/, 'without Documentation · Create: refused')
check(await names('hr-documents'), [], 'a member without Documentation · View reads none')
await as(MEMBER, [], 'authenticated', { member_doc: true })
check(await names('hr-documents'), [], '…and a member reads only what was published to them')
await as(HR, ['documentation.create'])
await put('hr-documents', 'publish/p1/memo.pdf')
await as(MEMBER, [], 'authenticated', { member_doc: true })
check(await names('hr-documents'), ['publish/p1/memo.pdf'], 'hr_file_readable_by_member: their own published file')
await as(HR, ['documentation.create'])
await put('hr-documents', 'drive/d1/mine.pdf')
await as(OTHER, ['documentation.view'])
check((await names('hr-documents')).includes('drive/d1/mine.pdf'), false, 'an unrecorded drive file is only its uploader’s (hr_doc_readable_by_hr reads owner_id)')
await as(HR, ['documentation.view'])
check((await names('hr-documents')).includes('drive/d1/mine.pdf'), true, '…its uploader reads it')
await as(HR, ['documentation.create'])
await put('hr-documents', 'documents/k1/kept.pdf')
await as(HR, ['documentation.view', 'documentation.edit'])
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'hr-documents' AND name = 'documents/k1/kept.pdf'`)).affectedRows, 0, 'a file a record holds is not deleted (hr_doc_file_unused)')
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'hr-documents' AND name = 'documents/a2/x.pdf'`)).affectedRows, 1, 'one nobody holds is')
await refuses(`UPDATE public.file_objects SET name = 'documents/z/z.pdf' WHERE name = 'documents/a1/handbook.pdf'`, [], /permission denied/, 'no session changes a file’s row')

// ── it-requests: one's own folder ──────────────────────────────────────────────────────────────────────────────
await move('it-requests')
await as(MEMBER, [])
await put('it-requests', `${MEMBER}/c1/shot.png`, 50, 'image/png')
await put('it-requests', `${MEMBER}/c1/clip.mov`, 50, 'video/quicktime')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('it-requests', $1, '{"size":5,"mimetype":"image/png"}')`,
  [`${OTHER}/c1/x.png`], /row-level security/, 'never into somebody else’s folder')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('it-requests', $1, '{"size":52428801,"mimetype":"video/mp4"}')`,
  [`${MEMBER}/c1/big.mp4`], /exceeded the maximum allowed size/, 'a video past 50 MB')
check(await names('it-requests'), [`${MEMBER}/c1/clip.mov`, `${MEMBER}/c1/shot.png`], 'they read their own')
await as(OTHER, [])
check(await names('it-requests'), [], 'nobody else does')
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'it-requests'`)).affectedRows, 0, 'nor deletes them')

// ── hiring-files and the guest link's stranger ─────────────────────────────────────────────────────────────────
await move('hiring-files')
await as(null, [], 'anon')
await put('hiring-files', `guest/hv-ABCDEFGH/${id(9)}.pdf`)
check((await q(`SELECT owner, owner_id FROM public.file_objects WHERE name = $1`, [`guest/hv-ABCDEFGH/${id(9)}.pdf`]).catch(() => [])).length, 0, 'the stranger cannot read back what it sent')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hiring-files', $1, '{"size":5,"mimetype":"application/pdf"}')`,
  [`guest/hv-ZZZZZZZZ/${id(9)}.pdf`], /row-level security/, 'a link that is not open: refused')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hiring-files', 'files/x/cv.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /row-level security/, 'the stranger writes nowhere but guest/<code>/')
await refuses(`DELETE FROM public.file_objects WHERE bucket_id = 'hiring-files'`, [], /permission denied/, 'the stranger deletes nothing')
await as(HR, ['hiring.view'])
const guest = (await q(`SELECT owner, owner_id FROM public.file_objects WHERE name = $1`, [`guest/hv-ABCDEFGH/${id(9)}.pdf`]))[0]
check([guest.owner, guest.owner_id], [null, null], 'a stranger’s file has no owner, as in Storage')
await as(HR, ['hiring.create'])
await put('hiring-files', 'files/f1/cv.pdf')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hiring-files', 'other/x.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /row-level security/, 'only resumes/ attachments/ files/')
await as(HR, ['hiring.view', 'hiring.edit'])
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'hiring-files' AND name = 'files/f1/cv.pdf'`)).affectedRows, 1, 'Hiring · Edit removes a file no record holds')

// ── payment-attachments: any sign-in, never a Revenue account ──────────────────────────────────────────────────
await move('payment-attachments')
await as(FINANCE, ['scope.treasury'])
await put('payment-attachments', `${id(50)}/slip.pdf`, 4000000, 'application/pdf')
await asOwner()
await q(`INSERT INTO public.payment_vouchers (id, status) VALUES ($1, 'draft'), ($2, 'paid')`, [id(50), id(51)])
await as(FINANCE, ['scope.treasury'])
await put('payment-attachments', `${id(51)}/paid.pdf`)
await as(OTHER, [])
check(await names('payment-attachments'), [`${id(50)}/slip.pdf`, `${id(51)}/paid.pdf`], 'every sign-in reads a voucher’s attachments (as in Storage)')
await as(MEMBER, [], 'authenticated', { revenue: true })
check(await names('payment-attachments'), [], 'a Revenue account reads none (the restrictive boundary)')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('payment-attachments', 'x/y.pdf', '{"size":5,"mimetype":"application/pdf"}')`,
  [], /row-level security/, '…and puts none')
await as(OTHER, [])
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'payment-attachments'`)).affectedRows, 0, 'without treasury nobody deletes one')
await as(FINANCE, ['scope.treasury'])
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'payment-attachments'`)).affectedRows, 1, 'treasury deletes a draft voucher’s, never a paid one’s')

// ── member-invoices: a draft's own folder ─────────────────────────────────────────────────────────────────────
await move('member-invoices')
await asOwner()
await q(`INSERT INTO public.member_requests (id, created_by, status, kind) VALUES ($1, $2, 'draft', 'claim'), ($3, $2, 'submitted', 'claim')`, [id(60), MEMBER, id(61)])
await as(MEMBER, [])
await put('member-invoices', `${MEMBER}/${id(60)}/${id(70)}.pdf`, 3000000)
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size":5,"mimetype":"application/pdf"}')`,
  [`${MEMBER}/${id(61)}/${id(71)}.pdf`], /row-level security/, 'only a draft takes an invoice')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size":3145729,"mimetype":"application/pdf"}')`,
  [`${MEMBER}/${id(60)}/${id(72)}.pdf`], /exceeded the maximum allowed size/, 'an invoice past 3 MB')
check(await names('member-invoices'), [`${MEMBER}/${id(60)}/${id(70)}.pdf`], 'the member reads their draft’s')
await as(OTHER, [])
check(await names('member-invoices'), [], 'nobody else does')

// ── the CRM's three ───────────────────────────────────────────────────────────────────────────────────────────
for (const b of ['crm-media', 'crm-showrooms', 'crm-auto-reply']) await move(b)
await asOwner()
await q(`INSERT INTO public.crm_contacts (id) VALUES ($1)`, [id(80)])
await as(MEMBER, [], 'authenticated', { reply: true })
await put('crm-media', `${id(80)}/photo.jpg`, 100, 'image/jpeg')
await as(MEMBER, [], 'authenticated', { reply: false })
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('crm-media', $1, '{"size":5,"mimetype":"image/jpeg"}')`,
  [`${id(80)}/b.jpg`], /row-level security/, 'only into a customer they may reply to')
check(await names('crm-media'), [`${id(80)}/photo.jpg`], 'a chat’s files read where its customer reads')
await as(MEMBER, [], 'authenticated', { crm: true })
await put('crm-auto-reply', `${MEMBER}/1-hello.png`, 100, 'image/png')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('crm-auto-reply', $1, '{"size":5,"mimetype":"image/png"}')`,
  [`${OTHER}/x.png`], /row-level security/, 'an auto-reply picture goes in one’s own folder only')
await as(null, [], 'anon')
check(await names('crm-auto-reply'), [`${MEMBER}/1-hello.png`], 'the auto-reply pictures are anybody’s to see (public)')
check(await names('crm-media'), [], '…a chat’s are not')
await as(MEMBER, [], 'authenticated', { crm: true, crm_manage: false })
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('crm-showrooms', 'r1/1.jpg', '{"size":5,"mimetype":"image/jpeg"}')`,
  [], /row-level security/, 'a showroom photo needs CRM · Manage')
await as(MEMBER, [], 'authenticated', { crm: true, crm_manage: true })
await put('crm-showrooms', 'r1/1.jpg', 100, 'image/jpeg')
check(await names('crm-showrooms'), ['r1/1.jpg'], 'everybody in the CRM sees the showrooms')

// ── The service role writes what it was given (the copy of Storage's files, the sweeps) ─────────────────────────
await move('attendance')
await db.exec('RESET ROLE')
await db.exec('SET ROLE service_role')
await db.exec('RESET ROLE') // the service role bypasses row security in Supabase; here the table owner stands in for it
await q(`INSERT INTO public.file_objects (bucket_id, name, owner, owner_id, created_at, metadata)
          VALUES ('attendance', $1, $2::uuid, $3, '2026-10-01T00:00:00Z', '{"size":9,"mimetype":"image/jpeg","eTag":"\\"abc\\""}')`, [`punch/${MEMBER}/old.jpg`, MEMBER, MEMBER])
check((await q(`SELECT owner::text, created_at = '2026-10-01T00:00:00Z' AS kept, metadata ->> 'eTag' AS etag FROM public.file_objects WHERE name = $1`, [`punch/${MEMBER}/old.jpg`]))[0],
  { owner: MEMBER, kept: true, etag: '"abc"' }, 'a copied file keeps its owner, its time and its metadata')
await as(MEMBER, [])
check(await names('attendance'), [`punch/${MEMBER}/old.jpg`], 'its owner reads it (own folder)')
await as(OTHER, ['attendance.view'])
check(await names('attendance'), [`punch/${MEMBER}/old.jpg`], 'Attendance · View reads everybody’s')

console.log(`file_objects: ${checks} checks passed`)
