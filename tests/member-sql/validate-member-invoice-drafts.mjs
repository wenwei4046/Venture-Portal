// Local PostgreSQL regression for 20261011234000 (2026-10-11, the user: "Yes they can delete"). The
// member-invoices bucket's three policies run as production has them, over a stand-in for Supabase
// Storage's objects table; the migration runs VERBATIM between the two halves. A DELETE that names its
// row (as the Storage API's does) needs the SELECT policies too — the bug: the uploader of a draft's
// file could never see it, so never remove it. What is under test: before, nothing removed; after, the
// uploader sees and removes their own draft's file and nothing else — not another person's, not a sent
// request's, not an attested one. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const A = id(1) // the uploader
const B = id(2) // somebody else
const HR = id(3) // a manager of member requests
const DRAFT = id(11)
const SENT = id(12)
const B_DRAFT = id(13)
const ATTESTED = id(14)
const file = (user, request, n = 1) => `${user}/${request}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5${n}.pdf`

/** As `user`, signed in (RLS applies): the rows of the bucket they can see. */
async function as(user, manager = false) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${user}', false), set_config('test.manager', '${manager ? 'on' : 'off'}', false); SET ROLE authenticated`)
}
const visible = () => q(`SELECT name FROM storage.objects WHERE bucket_id = 'member-invoices' ORDER BY name`).then(r => r.map(x => x.name))
// As the Storage API removes: a DELETE naming the row, under the caller's role.
const remove = name => q(`DELETE FROM storage.objects WHERE bucket_id = 'member-invoices' AND name = $1 RETURNING name`, [name]).then(r => r.length)
const upload = name => q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('member-invoices', $1)`, [name])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.member_requests(id uuid PRIMARY KEY, created_by uuid NOT NULL, kind text NOT NULL, status text NOT NULL);
    CREATE TABLE public.member_request_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, object_path text NOT NULL UNIQUE);
    CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT auth.uid() IS NOT NULL AND current_setting('test.manager', true) = 'on' $$;
    -- Supabase Storage's objects, and its folder helper (all but the file's own name).
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage, auth, public TO authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
    GRANT SELECT ON public.member_requests, public.member_request_attachments TO authenticated;
    -- Production's three policies on the bucket, as they are (20260912020000, insert as of 20261011130000).
    CREATE POLICY member_invoice_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
      (bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
       FROM member_requests r
      WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text) AND (r.kind = ANY (ARRAY['claim'::text, 'waiting'::text, 'replacement'::text]))))));
    CREATE POLICY member_invoice_read ON storage.objects FOR SELECT TO authenticated USING (
      (bucket_id = 'member-invoices'::text) AND (EXISTS ( SELECT 1
       FROM (member_request_attachments a
         JOIN member_requests r ON ((r.id = a.request_id)))
      WHERE ((a.object_path = objects.name) AND ((r.created_by = auth.uid()) OR member_is_manager('member_requests_manage'::text))))));
    CREATE POLICY member_invoice_draft_delete ON storage.objects FOR DELETE TO authenticated USING (
      (bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
       FROM member_requests r
      WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text)))) AND (NOT (EXISTS ( SELECT 1
       FROM member_request_attachments a
      WHERE (a.object_path = objects.name)))));
  `)
  await q(`INSERT INTO member_requests VALUES ($1, $5, 'waiting', 'draft'), ($2, $5, 'claim', 'submitted'), ($3, $6, 'waiting', 'draft'), ($4, $5, 'waiting', 'draft')`,
    [DRAFT, SENT, B_DRAFT, ATTESTED, A, B])

  // ── Before: the uploader puts the file in, and can neither see it nor remove it ──
  await as(A)
  await upload(file(A, DRAFT))
  check(await visible(), [], 'before: the uploader cannot see their own draft’s file')
  check(await remove(file(A, DRAFT)), 0, 'before: so it cannot be removed — the bug')

  await db.exec(`RESET ROLE`)
  await db.exec(await readFile(new URL('20261011234000_member_invoice_draft_read.sql', migrations), 'utf8'))

  // ── After: the uploader sees and removes their own draft's file ──
  await as(A)
  check(await visible(), [file(A, DRAFT)], 'after: the uploader sees it')
  check(await remove(file(A, DRAFT)), 1, 'after: and removes it')
  check(await visible(), [], 'gone')
  await upload(file(A, DRAFT, 2))

  // ── Nobody else's ──
  await as(B)
  await upload(file(B, B_DRAFT))
  check(await visible(), [file(B, B_DRAFT)], 'somebody else sees only their own draft’s file')
  check(await remove(file(A, DRAFT, 2)), 0, 'and cannot remove the uploader’s')
  await as(HR, true)
  check(await visible(), [], 'a manager sees no unattested draft file of anyone’s')
  check(await remove(file(B, B_DRAFT)), 0, 'nor removes one')

  // ── A file named in somebody else's folder, for the uploader's draft: never theirs to see ──
  await as(B)
  check(await q(`SELECT count(*)::int AS n FROM storage.objects WHERE name LIKE $1`, [`${A}/%`]).then(r => r[0].n), 0, 'B cannot see into A’s folder')

  // ── An attested file stays: seen, never removed ──
  await db.exec(`RESET ROLE`)
  await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('member-invoices', $1)`, [file(A, ATTESTED)])
  await q(`INSERT INTO member_request_attachments(request_id, object_path) VALUES ($1, $2)`, [ATTESTED, file(A, ATTESTED)])
  await as(A)
  check((await visible()).includes(file(A, ATTESTED)), true, 'an attested draft file is seen')
  check(await remove(file(A, ATTESTED)), 0, 'but never removed — an attachment names it')

  // ── A sent request's file: only what member_invoice_read shows, never removed ──
  await db.exec(`RESET ROLE`)
  await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('member-invoices', $1), ('member-invoices', $2)`, [file(A, SENT, 3), file(A, SENT, 4)])
  await q(`INSERT INTO member_request_attachments(request_id, object_path) VALUES ($1, $2)`, [SENT, file(A, SENT, 3)])
  await as(A)
  const seen = await visible()
  check([seen.includes(file(A, SENT, 3)), seen.includes(file(A, SENT, 4))], [true, false], 'sent: the attested file only, as before')
  check(await remove(file(A, SENT, 3)), 0, 'a sent request’s file is never removed')
  // A draft that is sent stops showing its unattested files to the uploader.
  await db.exec(`RESET ROLE`)
  await q(`UPDATE member_requests SET status = 'submitted' WHERE id = $1`, [DRAFT])
  await as(A)
  check((await visible()).includes(file(A, DRAFT, 2)), false, 'sent: its unattested file is no longer the uploader’s to see')
  check(await remove(file(A, DRAFT, 2)), 0, 'nor to remove')

  await db.exec(`RESET ROLE`)
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'member_invoice_draft_read'`), 1, 'one policy')
  // The migration runs twice without a second policy.
  await db.exec(await readFile(new URL('20261011234000_member_invoice_draft_read.sql', migrations), 'utf8'))
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'member_invoice_draft_read'`), 1, 'still one')

  console.log(`validate-member-invoice-drafts: ${checks} checks passed`)
} finally {
  await db.close()
}
