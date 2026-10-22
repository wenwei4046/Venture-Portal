// Local PostgreSQL regression for the buckets' moves to R2 (2026-10-23; the runbook: .claude/rules/portal-wide/
// storage.md › MOVING A BUCKET). Each move migration copies its bucket's rows from storage.objects, flips its backend
// and points the functions that asked storage.objects at public.file_objects — production's own bodies with that one
// name swapped. Here: the foundation (20261023150000) and each move run VERBATIM over a stand-in storage schema and
// PRODUCTION's bodies of the 17 functions (storage-functions-production.json, read off production with their md5 on
// 2026-10-23). No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const PRODUCTION = JSON.parse(await readFile(new URL('./storage-functions-production.json', import.meta.url), 'utf8'))
const MOVES = (await readdir(migrations)).filter(f => /_file_storage_move_/.test(f)).sort()
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const U = id(1)

async function fresh({ drift = null } = {}) {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      owner uuid, owner_id text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    -- The helpers the foundation's policies name (their own tests ask what they answer).
    CREATE FUNCTION public.has_any_action(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.has_scope(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.has_perm(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.hr_doc_readable_by_hr(p text, o text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval');
    CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status);
    CREATE TABLE public.payment_attachments (storage_path text);
    CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
    CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
    CREATE TABLE public.member_request_attachments (request_id uuid, object_path text);
    -- What the it-requests functions write and read.
    CREATE TABLE public.it_request_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, note_id uuid, path text,
      name text, content_type text, size bigint, uploaded_by uuid);
  `)
  await db.exec((await readFile(new URL('20261023150000_file_storage_r2.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))
  // Production's 17 bodies (their tables are not here: nothing checks a body's names until it runs).
  await db.exec('SET check_function_bodies = off')
  for (const f of PRODUCTION) {
    const def = drift && f.name === drift ? f.definition.replace('RETURN;', 'RETURN; -- changed on production') : f.definition
    await db.exec(def)
  }
  await db.exec('SET check_function_bodies = on')
  return db
}

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const src = async (db, sig) => (await q(db, `SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [sig]))[0].prosrc
const md5 = async (db, sig) => (await q(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = $1::regprocedure`, [sig]))[0].m

// ── The fixture is production's, byte for byte ────────────────────────────────────────────────────────────────
{
  const db = await fresh()
  check(PRODUCTION.length, 17, 'the 17 functions that read storage.objects on production')
  for (const f of PRODUCTION) check(await md5(db, `public.${f.signature}`), f.md5, `${f.name}: the body loaded is production's (md5)`)
}

// ── Each move: rows copied, backend flipped, its functions swapped — nothing else ─────────────────────────────
const db = await fresh()
await q(db, `INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, created_at) VALUES
  ($1, 'it-requests', $2, $3, $4, '{"size":42,"mimetype":"image/png","eTag":"\\"e\\""}', '2026-10-20T08:00:00Z'),
  ($5, 'hr-documents', 'documents/a/x.pdf', $3, $4, '{"size":7,"mimetype":"application/pdf"}', '2026-10-11T08:00:00Z')`,
  [id(11), `${U}/c1/shot.png`, U, U, id(12)])
const before = Object.fromEntries(await Promise.all(PRODUCTION.map(async f => [f.signature, await src(db, `public.${f.signature}`)])))
const moved = new Set()
for (const file of MOVES) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const flipped = (await q(db, `SELECT id FROM public.file_buckets WHERE backend = 'r2'`)).map(r => r.id)
  for (const b of flipped) moved.add(b)
  await db.exec(sql) // twice: nothing changes, nothing breaks
  checks++
}
check([...moved].sort().length > 0, true, 'at least one bucket moved')
for (const f of PRODUCTION) {
  const now = await src(db, `public.${f.signature}`)
  if (now === before[f.signature]) continue
  check(now, before[f.signature].replaceAll('storage.objects', 'public.file_objects'), `${f.name}: production's body, only storage.objects → public.file_objects`)
}
if (moved.has('it-requests')) {
  const row = (await q(db, `SELECT id::text, owner::text, owner_id, metadata, created_at = '2026-10-20T08:00:00Z' AS kept FROM public.file_objects WHERE bucket_id = 'it-requests'`))[0]
  check(row, { id: id(11), owner: U, owner_id: U, metadata: { size: 42, mimetype: 'image/png', eTag: '"e"' }, kept: true }, 'it-requests: the row is Storage’s exactly')
  for (const sig of ['it_request_files_check(jsonb)', 'it_request_file_in(uuid,uuid,jsonb)']) {
    const body = await src(db, `public.${sig}`)
    check([body.includes('storage.objects'), body.includes('public.file_objects')], [false, true], `${sig} asks file_objects`)
  }
  // The question it asks now: is the file's row there?
  await q(db, `SELECT set_config('request.jwt.claim.sub', $1, false)`, [U])
  await q(db, `SELECT public.it_request_files_check($1::jsonb)`, [JSON.stringify([{ path: `${U}/c1/shot.png` }])])
  checks++
  await assert.rejects(q(db, `SELECT public.it_request_files_check($1::jsonb)`, [JSON.stringify([{ path: `${U}/c1/never.png` }])]),
    e => /did not finish uploading/.test(String(e.message)), 'a file with no row did not arrive')
  checks++
  check((await q(db, `SELECT public.it_request_file_in($1, NULL, $2::jsonb) AS n`, [id(90), JSON.stringify([{ path: `${U}/c1/shot.png`, name: 'shot.png', size: 999, contentType: 'image/gif' }])]))[0].n, 1, 'filed')
  check((await q(db, `SELECT size::int, content_type FROM public.it_request_files`))[0], { size: 42, content_type: 'image/png' }, 'what the bucket says it is, before what the browser said — read off file_objects')
}
check((await q(db, `SELECT count(*)::int AS n FROM public.file_objects WHERE bucket_id = 'hr-documents'`))[0].n, moved.has('hr-documents') ? 1 : 0, 'a bucket not moved keeps its rows in Storage only')

// ── A body changed on production since: the move refuses it, and nothing of it holds ──────────────────────────
for (const file of MOVES) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  const names = [...sql.matchAll(/pg_temp\.repoint\('public\.([a-z_]+)\(/g)].map(m => m[1])
  if (!names.length) continue
  const drifted = await fresh({ drift: names[0] })
  await drifted.exec('BEGIN')
  await assert.rejects(drifted.exec(sql), e => /not the body this migration was written against/.test(String(e.message)), `${file}: refuses a drifted ${names[0]}`)
  await drifted.exec('ROLLBACK')
  check((await q(drifted, `SELECT count(*)::int AS n FROM public.file_buckets WHERE backend = 'r2'`))[0].n, 0, `${file}: nothing moved when it refused`)
}

console.log(`file storage moves (${MOVES.join(', ') || 'none yet'}): ${checks} checks passed`)
