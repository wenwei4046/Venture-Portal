// Local PostgreSQL regression for 20261024006800 (2026-10-23 — the owner: "make the size more bigger for all").
// Pages that hand a file to a Server Action (whose body stops at 4 MB) now send it ahead to the sender's own folder of
// a private bucket, `uploads`; the action reads it back under the same session. This runs 20261023150000 (the twin
// tables, their 34 policies, the stamp) and then the new migration VERBATIM over the same stand-ins as
// validate-file-objects.mjs, with production's two waiting-form functions (the fixture, as production runs them).
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
for (const b of ['attendance', 'crm-auto-reply', 'crm-media', 'crm-showrooms', 'hiring-files', 'hr-documents', 'it-requests', 'member-forms', 'member-invoices', 'payment-attachments']) await move(b)

// member_request_attachments as production keeps its size (mig 20260912020000): bytes, 1 to 3 MB.
await asOwner()
await db.exec(`
  ALTER TABLE public.member_request_attachments ADD COLUMN size_bytes integer NOT NULL DEFAULT 1;
  ALTER TABLE public.member_request_attachments ADD CONSTRAINT member_request_attachments_size_bytes_check CHECK (size_bytes BETWEEN 1 AND 3145728);
`)

// Production's two functions, their bodies byte for byte (the fixture); what they read is not run here.
const PRODUCTION = JSON.parse(await readFile(new URL('./waiting-form-functions-production.json', import.meta.url), 'utf8'))
await db.exec('SET check_function_bodies = off')
for (const f of PRODUCTION) await db.exec(f.def.replace(/\r\n/g, '\n'))
const bodyOf = async (sig) => one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
const md5Of = async (sig) => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
for (const f of PRODUCTION) check(await md5Of(`public.${f.signature}`), f.md5, `${f.name}: the fixture is production's body (md5)`)
const before = {}
for (const f of PRODUCTION) before[f.signature] = await bodyOf(`public.${f.signature}`)

const STAGED = (await readFile(new URL('20261024006800_file_uploads_staged.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(STAGED)

// ── The bucket ─────────────────────────────────────────────────────────────────────────────────────────────────
check((await q(`SELECT id, public, file_size_limit::bigint::text AS s, allowed_mime_types AS t, backend, public_url FROM public.file_buckets WHERE id = 'uploads'`))[0],
  { id: 'uploads', public: false, s: '104857600', t: null, backend: 'r2', public_url: null }, 'uploads: private, in R2 from the start, 100 MB, any type')
check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'file_objects'`), 37, 'storage’s 34 policies and the three of uploads')

// ── One's own folder, and nobody else's ────────────────────────────────────────────────────────────────────────
const KEY = id(900)
await as(MEMBER, [], 'authenticated', { revenue: true })
await put('uploads', `${MEMBER}/${KEY}/invoice.pdf`, 104857600, 'application/pdf')
check((await q(`SELECT owner_id, metadata FROM public.file_objects WHERE bucket_id = 'uploads'`))[0], { owner_id: MEMBER, metadata: { size: 104857600, mimetype: 'application/pdf' } },
  'a Revenue member sends 100 MB into their own folder; the row is theirs')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('uploads', $1, '{"size":104857601,"mimetype":"application/pdf"}')`,
  [`${MEMBER}/${id(901)}/big.pdf`], /exceeded the maximum allowed size/, 'one byte past 100 MB: refused')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('uploads', $1, '{"size":5,"mimetype":"application/pdf"}')`,
  [`${OTHER}/${id(902)}/x.pdf`], /row-level security/, 'never into somebody else’s folder')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('uploads', $1, '{"size":5,"mimetype":"application/pdf"}')`,
  [`x.pdf`], /row-level security/, 'nor loose at the top')
await as(FINANCE, ['scope.treasury'])
await put('uploads', `${FINANCE}/${id(903)}/statement.xlsx`, 900, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
check(await names('uploads'), [`${FINANCE}/${id(903)}/statement.xlsx`], 'Finance reads only its own')
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'uploads' AND name LIKE $1`, [`${MEMBER}/%`])).affectedRows, 0, '…and deletes none of the member’s')
await as(MEMBER, [], 'authenticated', { revenue: true })
check(await names('uploads'), [`${MEMBER}/${KEY}/invoice.pdf`], 'the member reads only their own')
check((await db.query(`DELETE FROM public.file_objects WHERE bucket_id = 'uploads' AND name = $1`, [`${MEMBER}/${KEY}/invoice.pdf`])).affectedRows, 1, '…and takes it away again')
await as(null, [], 'anon')
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('uploads', $1, '{"size":5,"mimetype":"application/pdf"}')`,
  [`${id(904)}/${id(905)}/x.pdf`], /row-level security/, 'the stranger sends nothing ahead')
check(await names('uploads'), [], '…and reads nothing there')
await as(OTHER, [])
check((await names('payment-attachments')).length, 0, 'the other buckets are as they were (nothing here)')

// ── An invoice or a signed form, kept up to 100 MB ──────────────────────────────────────────────────────────────
await asOwner()
await q(`INSERT INTO public.member_request_attachments (request_id, object_path, size_bytes) VALUES ($1, 'a', 104857600)`, [id(60)])
await refuses(`INSERT INTO public.member_request_attachments (request_id, object_path, size_bytes) VALUES ($1, 'b', 104857601)`, [id(60)],
  /member_request_attachments_size_bytes_check/, 'past 100 MB: refused')
await refuses(`INSERT INTO public.member_request_attachments (request_id, object_path, size_bytes) VALUES ($1, 'c', 0)`, [id(60)],
  /member_request_attachments_size_bytes_check/, 'an empty one: refused, as before')

// ── The two functions: production's bodies, one comparison changed ─────────────────────────────────────────────
for (const f of PRODUCTION) {
  const sig = `public.${f.signature}`
  const after = await bodyOf(sig)
  check(after, before[f.signature].replace('v_size > 3145728', 'v_size > 104857600'), `${f.name}: production's body with 3 MB → 100 MB, nothing else`)
  check(after.includes('3145728'), false, `${f.name}: no 3 MB left`)
  const meta = (await q(`SELECT prosecdef, proconfig FROM pg_proc WHERE oid = $1::regprocedure`, [sig]))[0]
  check([meta.prosecdef, meta.proconfig], [true, ['search_path=public']], `${f.name}: still SECURITY DEFINER, search_path public`)
}

// ── Again: nothing moves; a drifted body stops it ──────────────────────────────────────────────────────────────
const policiesOnce = await one(`SELECT string_agg(policyname || ':' || coalesce(qual, '') || coalesce(with_check, ''), '|' ORDER BY policyname) FROM pg_policies WHERE tablename = 'file_objects'`)
const bodiesOnce = await Promise.all(PRODUCTION.map(f => bodyOf(`public.${f.signature}`)))
await db.exec(STAGED)
check(await one(`SELECT string_agg(policyname || ':' || coalesce(qual, '') || coalesce(with_check, ''), '|' ORDER BY policyname) FROM pg_policies WHERE tablename = 'file_objects'`), policiesOnce, 're-running it keeps the policies as they are')
check(await Promise.all(PRODUCTION.map(f => bodyOf(`public.${f.signature}`))), bodiesOnce, '…and the two bodies')
check(await one(`SELECT count(*)::int FROM public.file_buckets WHERE id = 'uploads'`), 1, '…and one uploads bucket')

const drifted = new PGlite()
await drifted.exec(`CREATE ROLE authenticated; CREATE SCHEMA storage; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
  CREATE TABLE public.file_buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[], backend text, public_url text);
  CREATE TABLE public.file_objects (id uuid, bucket_id text, name text);
  CREATE TABLE public.member_request_attachments (size_bytes integer CONSTRAINT member_request_attachments_size_bytes_check CHECK (size_bytes BETWEEN 1 AND 3145728));
  SET check_function_bodies = off;
  CREATE FUNCTION public.member_waiting_add_form(p_request uuid, p_path text) RETURNS jsonb LANGUAGE plpgsql AS $f$ DECLARE v_size bigint; BEGIN IF v_size > 3145728 THEN RETURN NULL; END IF; RETURN '{}'; END $f$;`)
await assert.rejects(drifted.exec(STAGED), err => /not the body this migration was written against/.test(String(err.message)), 'a body production does not run: refused, nothing changed')
checks++
await drifted.close()

console.log(`OK — ${checks} checks: uploads (own folder only, 100 MB, any type), member_request_attachments to 100 MB, the two waiting-form functions to 100 MB`)
await db.close()
