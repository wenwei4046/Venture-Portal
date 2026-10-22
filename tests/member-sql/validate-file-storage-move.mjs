// Local PostgreSQL regression for the buckets' moves to R2 (2026-10-23; the runbook: .claude/rules/portal-wide/
// storage.md › MOVING A BUCKET). Each move migration copies its buckets' rows from storage.objects, flips their
// backends and points the functions that asked storage.objects at public.file_objects — production's own bodies with
// that one name swapped — and the public bucket's saved links at its custom domain. Here: the foundation
// (20261023150000) and each move run VERBATIM over a stand-in storage schema and
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
    -- The guest link a guest's upload asks for (open, the code given).
    CREATE FUNCTION public.guest_link_open(p_code text, p_part text) RETURNS TABLE (code text) LANGUAGE sql STABLE AS
      $$ SELECT p_code WHERE p_code = 'hv-ABCDEFGH' AND p_part = 'hiring' $$;
    CREATE TABLE public.it_request_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, note_id uuid, path text,
      name text, content_type text, size bigint, uploaded_by uuid);
    -- Where the auto-reply pictures' public links are saved.
    CREATE TABLE public.crm_auto_replies (staff_id uuid PRIMARY KEY, settings jsonb, updated_at timestamptz);
  `)
  await db.exec((await readFile(new URL('20261023150000_file_storage_r2.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))
  // Production's 17 bodies (their tables are not here: nothing checks a body's names until it runs).
  await db.exec('SET check_function_bodies = off')
  for (const f of PRODUCTION) {
    const def = drift && f.name === drift ? f.definition.replace('BEGIN', 'BEGIN -- changed on production') : f.definition
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
// One file in each of the other buckets, as Storage keeps them.
const OTHERS = { attendance: `punch/${U}/a.jpg`, 'crm-auto-reply': `${U}/1-a.png`, 'crm-media': `${id(80)}/a.jpg`, 'crm-showrooms': 'r1/1.jpg',
  'hiring-files': 'files/f1/cv.pdf', 'member-forms': 'templates/f.pdf', 'member-invoices': `${U}/${id(60)}/${id(70)}.pdf`, 'payment-attachments': `${id(50)}/slip.pdf` }
let seq = 20
for (const [bucket, name] of Object.entries(OTHERS)) {
  await q(db, `INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata) VALUES ($1, $2, $3, $4, $5, '{"size":5,"mimetype":"application/pdf"}')`,
    [id(++seq), bucket, name, U, U])
}
// Auto-reply settings as the CRM saves them: a picture's link is Storage's public address of the file.
const STORAGE_PUBLIC = 'https://gixpptmfuryskbwkmiwz.supabase.co/storage/v1/object/public'
const SAVED = { welcome: { on: true, text: 'Hi', image: `${STORAGE_PUBLIC}/crm-auto-reply/${U}/1-a.png` },
  kws: [{ words: 'sofa', text: 'Our sofas', image: `${STORAGE_PUBLIC}/crm-auto-reply/${U}/2-b.png` }],
  site: 'https://example.com/crm-auto-reply/x.png', elsewhere: `${STORAGE_PUBLIC}/another-bucket/x.png` }
const PLAIN = { welcome: { on: false, text: 'Hello' } }
await q(db, `INSERT INTO public.crm_auto_replies (staff_id, settings, updated_at) VALUES ($1, $2, '2026-10-21T15:23:32Z'), ($3, $4, '2026-10-21T15:23:32Z')`,
  [U, JSON.stringify(SAVED), id(2), JSON.stringify(PLAIN)])
const before = Object.fromEntries(await Promise.all(PRODUCTION.map(async f => [f.signature, await src(db, `public.${f.signature}`)])))
// The bodies name tables this stand-in does not hold (att_policy, hr_documents …): as pg_dump does, a body is not
// compiled against them when it is created — production, which holds them all, compiles each swapped body for real.
await db.exec('SET check_function_bodies = off')
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
// Every bucket: a moved one has Storage's rows (same ids), one still in Storage has none here.
for (const bucket of ['it-requests', 'hr-documents', ...Object.keys(OTHERS)]) {
  const want = (await q(db, `SELECT id::text FROM storage.objects WHERE bucket_id = $1 ORDER BY id`, [bucket])).map(r => r.id)
  const have = (await q(db, `SELECT id::text FROM public.file_objects WHERE bucket_id = $1 ORDER BY id`, [bucket])).map(r => r.id)
  check(have, moved.has(bucket) ? want : [], `${bucket}: ${moved.has(bucket) ? 'its rows are Storage’s, every one' : 'not moved — no rows here'}`)
}
if (moved.has('hr-documents')) {
  check((await q(db, `SELECT public.hr_doc_file_present('documents/a/x.pdf', 'documents') AS ok`))[0].ok, true, 'hr_doc_file_present: a filed document is there')
  check((await q(db, `SELECT public.hr_doc_file_present('documents/a/none.pdf', 'documents') AS ok`))[0].ok, false, 'hr_doc_file_present: one with no row is not')
}
if (moved.has('hiring-files')) {
  check((await q(db, `SELECT public.guest_link_may_upload('hv-ABCDEFGH') AS ok`))[0].ok, true, 'guest_link_may_upload: an open link under its hourly cap')
  for (let i = 0; i < 40; i++) {
    await q(db, `INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('hiring-files', $1, '{"size":1,"mimetype":"application/pdf"}')`, [`guest/hv-ABCDEFGH/${id(500 + i)}.pdf`])
  }
  check((await q(db, `SELECT public.guest_link_may_upload('hv-ABCDEFGH') AS ok`))[0].ok, false, 'guest_link_may_upload: 40 an hour, counted in file_objects')
  check((await q(db, `SELECT public.guest_link_may_upload('hv-ZZZZZZZZ') AS ok`))[0].ok, false, 'guest_link_may_upload: a closed link')
}
const autoReplies = async () => Object.fromEntries((await q(db, `SELECT staff_id::text AS who, settings, updated_at = '2026-10-21T15:23:32Z' AS kept FROM public.crm_auto_replies`))
  .map(r => [r.who, { settings: r.settings, kept: r.kept }]))
if (moved.has('crm-auto-reply')) {
  check((await q(db, `SELECT public, public_url FROM public.file_buckets WHERE id = 'crm-auto-reply'`))[0],
    { public: true, public_url: 'https://cdn.houzsventure.com/crm-auto-reply' }, 'crm-auto-reply: public, at the custom domain')
  const saved = await autoReplies()
  check(saved[U], { settings: { ...SAVED, welcome: { ...SAVED.welcome, image: `https://cdn.houzsventure.com/crm-auto-reply/${U}/1-a.png` },
    kws: [{ ...SAVED.kws[0], image: `https://cdn.houzsventure.com/crm-auto-reply/${U}/2-b.png` }] }, kept: true },
    'crm_auto_replies: every saved picture link now the custom domain’s, the same name — nothing else in it touched')
  check(saved[id(2)], { settings: PLAIN, kept: true }, 'crm_auto_replies: settings with no picture are left as they were')
} else {
  check((await autoReplies())[U].settings, SAVED, 'crm_auto_replies: untouched while crm-auto-reply is in Storage')
}
const privateBuckets = ['attendance', 'crm-media', 'crm-showrooms', 'hiring-files', 'hr-documents', 'it-requests', 'member-forms', 'member-invoices', 'payment-attachments']
if (privateBuckets.every(b => moved.has(b))) {
  const left = []
  for (const f of PRODUCTION) if ((await src(db, `public.${f.signature}`)).includes('storage.objects')) left.push(f.name)
  check(left, [], 'every private bucket moved: no function reads storage.objects any more')
}
if (moved.has('crm-auto-reply') && privateBuckets.every(b => moved.has(b))) {
  check((await q(db, `SELECT id FROM public.file_buckets WHERE backend <> 'r2' ORDER BY id`)).map(r => r.id), [], 'every bucket is in R2')
}

// ── A body changed on production since: the move refuses it, and nothing of it holds ──────────────────────────
for (const file of MOVES) {
  const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/\r\n/g, '\n')
  const names = [...sql.matchAll(/pg_temp\.repoint\('public\.([a-z_]+)\(/g)].map(m => m[1])
  if (!names.length) continue
  const drifted = await fresh({ drift: names[0] })
  await drifted.exec('SET check_function_bodies = off')
  await drifted.exec('BEGIN')
  await assert.rejects(drifted.exec(sql), e => /not the body this migration was written against/.test(String(e.message)), `${file}: refuses a drifted ${names[0]}`)
  await drifted.exec('ROLLBACK')
  check((await q(drifted, `SELECT count(*)::int AS n FROM public.file_buckets WHERE backend = 'r2'`))[0].n, 0, `${file}: nothing moved when it refused`)
}

console.log(`file storage moves (${MOVES.join(', ') || 'none yet'}): ${checks} checks passed`)
