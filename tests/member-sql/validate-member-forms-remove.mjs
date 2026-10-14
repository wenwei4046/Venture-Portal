// Local PostgreSQL regression for 20261014244500 (2026-10-14, the user: Remove on the uploaded form —
// "连档案一起删掉"). The member-forms bucket's two policies run as production has them, over a stand-in
// for Supabase Storage's objects table; the migration runs VERBATIM between the two halves. A DELETE
// that names its row (as the Storage API's does) needs the SELECT policy too. What is under test:
// before, nothing in the bucket could be deleted; after, a manager of member requests deletes a file
// under templates/ that neither form uses now — an older version's, an upload whose save was refused,
// the file a Remove has just taken off the form — and never the file members download now, nothing
// outside templates/, and nobody else deletes anything. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const MIGRATION = '20261014244500_member_forms_remove_template.sql'
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const HR = id(1) // a manager of member requests
const MEMBER = id(2) // a Revenue member: may send requests, so reads the forms
const NOBODY = id(3) // signed in, neither

const OLD = 'templates/0b3fb828-3253-4aa8-899b-eadca6e6aec1/Old form.pdf' // waiting v2's, replaced since
const WAITING = 'templates/0b3fb828-3253-4aa8-899b-eadca6e6aec2/Waiting list form.docx' // waiting's latest
const REPLACEMENT = 'templates/0b3fb828-3253-4aa8-899b-eadca6e6aec3/Replacement form.pdf' // replacement's latest
const ORPHAN = 'templates/0b3fb828-3253-4aa8-899b-eadca6e6aec4/Refused save.pdf' // uploaded, its save refused
const OUTSIDE = 'drafts/0b3fb828-3253-4aa8-899b-eadca6e6aec5/Not a template.pdf'

async function as(user, { manager = false, member = false, role = 'authenticated' } = {}) {
  await db.exec(`RESET ROLE`)
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.manager', $2, false), set_config('test.member', $3, false)`,
    [user ?? '', manager ? 'on' : 'off', member ? 'on' : 'off'])
  await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => db.exec(`RESET ROLE`)
const visible = () => q(`SELECT name FROM storage.objects WHERE bucket_id = 'member-forms' ORDER BY name`).then(r => r.map(x => x.name))
// As the Storage API removes: a DELETE naming the row, under the caller's role.
const remove = (name, bucket = 'member-forms') =>
  q(`DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2 RETURNING name`, [bucket, name]).then(r => r.length)
const present = name => one(`SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'member-forms' AND name = $1`, [name])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    -- Who manages member requests, and who may send them (production asks users and permissions).
    CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT auth.uid() IS NOT NULL AND current_setting('test.manager', true) = 'on' $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT auth.uid() IS NOT NULL AND p_key = 'member_requests' AND current_setting('test.member', true) = 'on' $$;
    -- The two forms' versions, as 20261010140000 / 20261011130000 made them: RLS on, no policy.
    CREATE TABLE public.member_waiting_forms(version integer PRIMARY KEY, template_path text, template_name text NOT NULL);
    CREATE TABLE public.member_replacement_forms(version integer PRIMARY KEY, template_path text, template_name text NOT NULL);
    ALTER TABLE public.member_waiting_forms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.member_replacement_forms ENABLE ROW LEVEL SECURITY;
    -- Supabase Storage's objects, and its folder helper (all but the file's own name).
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage, auth, public TO authenticated, anon;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, anon;
    -- Production's two policies on the bucket, as they are (20261010140000).
    CREATE POLICY member_forms_templates_read ON storage.objects FOR SELECT TO authenticated
      USING ((bucket_id = 'member-forms'::text) AND ((storage.foldername(name))[1] = 'templates'::text) AND (( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager) OR ( SELECT has_perm('member_requests'::text) AS has_perm)));
    CREATE POLICY member_forms_templates_write ON storage.objects FOR INSERT TO authenticated
      WITH CHECK ((bucket_id = 'member-forms'::text) AND ((storage.foldername(name))[1] = 'templates'::text) AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager));
  `)
  await q(`INSERT INTO public.member_waiting_forms VALUES
    (1, NULL, 'HOUZS Revenue - Waiting list application.html'),
    (2, $1, 'Old form.pdf'),
    (3, $2, 'Waiting list form.docx')`, [OLD, WAITING])
  await q(`INSERT INTO public.member_replacement_forms VALUES
    (1, NULL, 'HOUZS Revenue - Replacement form.html'),
    (2, $1, 'Replacement form.pdf')`, [REPLACEMENT])
  for (const name of [OLD, WAITING, REPLACEMENT, ORPHAN, OUTSIDE]) {
    await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('member-forms', $1)`, [name])
  }
  // The same name in another bucket: never this policy's.
  await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hr-documents', $1)`, [OLD])

  // ── Before: a manager sees the forms and can delete none of them ──
  await as(HR, { manager: true })
  check(await visible(), [OLD, ORPHAN, REPLACEMENT, WAITING].sort(), 'before: a manager sees every file under templates/')
  check(await remove(OLD), 0, 'before: not even a file no form uses — the bucket had no DELETE policy')
  check(await remove(ORPHAN), 0, 'before: nor an upload whose save was refused (its clean-up failed quietly)')

  await asSystem()
  await db.exec(await readFile(new URL(MIGRATION, migrations), 'utf8'))

  // ── After: a manager deletes what no form uses now ──
  await as(HR, { manager: true })
  check(await remove(OLD), 1, 'an older version’s file goes')
  check(await remove(ORPHAN), 1, 'an upload whose save was refused goes')
  check(await remove(WAITING), 0, 'the waiting list’s form members download now stays')
  check(await remove(REPLACEMENT), 0, 'the replacement list’s form members download now stays')
  check(await remove(OUTSIDE), 0, 'nothing outside templates/')
  check(await visible(), [REPLACEMENT, WAITING].sort(), 'only the two forms in use are left under templates/')
  check(await one(`SELECT public.member_form_template_unused(NULL)`), false, 'no name is nobody’s file')
  await asSystem()
  check(await present(OUTSIDE), 1, 'and the file outside templates/ is untouched')

  // ── Remove: the next version without the file, then the file goes ──
  await asSystem()
  await q(`INSERT INTO public.member_waiting_forms VALUES (4, NULL, 'HOUZS Revenue - Waiting list application.html')`)
  await as(HR, { manager: true })
  check(await one(`SELECT public.member_form_template_unused($1)`, [WAITING]), true, 'once the latest version has no file, the old one is nobody’s')
  check(await remove(WAITING), 1, 'Remove: the file goes')
  check(await one(`SELECT public.member_form_template_unused($1)`, [REPLACEMENT]), false, 'the replacement list’s is still in use')
  await asSystem()
  await q(`INSERT INTO public.member_replacement_forms VALUES (3, NULL, 'HOUZS Revenue - Replacement form.html')`)
  await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('member-forms', $1)`, [WAITING])

  // ── Nobody else deletes anything ──
  await as(MEMBER, { member: true })
  check(await visible(), [REPLACEMENT, WAITING].sort(), 'a member who may send requests reads the files')
  check(await remove(REPLACEMENT), 0, 'but deletes none, even one no form uses')
  check(await one(`SELECT public.member_form_template_unused($1)`, [REPLACEMENT]), false, 'and hears "no" from the helper')
  await as(NOBODY)
  check(await visible(), [], 'somebody signed in with neither sees nothing')
  check(await remove(REPLACEMENT), 0, 'and deletes nothing')
  await as(null, { role: 'anon' })
  check(await remove(REPLACEMENT), 0, 'the publishable key deletes nothing')
  await assert.rejects(() => q(`SELECT public.member_form_template_unused($1)`, [REPLACEMENT]), /permission denied/, 'anon may not call the helper')
  checks++

  // ── Another bucket is not this policy's ──
  await as(HR, { manager: true })
  check(await remove(OLD, 'hr-documents'), 0, 'the same name in another bucket is not deleted by it')
  check(await remove(REPLACEMENT), 1, 'and the manager does delete the replacement list’s once Remove took it off')

  await asSystem()
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'member_forms_templates_delete'`), 1, 'one policy')
  check(await one(`SELECT prosecdef FROM pg_proc WHERE proname = 'member_form_template_unused'`), true, 'the helper is SECURITY DEFINER (the forms have no policy)')
  check(await one(`SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.proname = 'member_form_template_unused'`), 'plpgsql', 'and plpgsql, as a policy’s helpers are')
  // The migration runs twice without a second policy.
  await db.exec(await readFile(new URL(MIGRATION, migrations), 'utf8'))
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'member_forms_templates_delete'`), 1, 'still one')

  console.log(`validate-member-forms-remove: ${checks} checks passed`)
} finally {
  await db.close()
}
