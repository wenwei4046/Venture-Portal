// Local PostgreSQL regression for 20261024007000, 007100 and 007200 (2026-10-23 — Marketing ⑥-1, the Library: `Library.dc.html` of the Claude
// Design handoff "HOUZS Marketing Module Setup"). The R2 move's table (20261023150000: file_objects, its stamp, its grants)
// and Marketing's migrations run, then these, each twice. What is under test: the bucket — in R2, 50 MB, then 2 GB — and its three
// policies (Marketing reads; Edit puts files under library/; Manage deletes, and a sender takes back a file never filed);
// the folder types (the handoff's thirteen, a new one the manager's, never twice, never a colour of its own); one folder
// of a type in a subsidiary; a file filed only when its bytes' row is there and the caller's; move, bin, restore,
// delete for good (the bytes' rows with them) and the Dustbin's 30 days; who may each; the page in the tab registry.
// Then ⑥-2 (007200): a subsidiary's brand profile — the manager's, only the handoff's colours and fonts, its words tidied,
// a picture only one's own just sent (an image), the one a profile shows filed, the one replaced taken off. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
/** Read as the database itself, whoever is signed in. */
async function peek(sql, params = []) {
  const [{ cu, su }] = await q('SELECT current_user AS cu, session_user AS su')
  await db.exec('RESET ROLE')
  try {
    return await q(sql, params)
  } finally {
    if (cu !== su) await db.exec(`SET ROLE ${cu}`)
  }
}
const peek1 = async (sql, params = []) => Object.values((await peek(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const VIEW = ['marketing.view']
const STAFF = ['marketing.view', 'marketing.create', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), outsider: id(4) }
const S = { josiah: id(11), mei: id(12), ali: id(13) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false),
                  set_config('test.actions', $3, false), set_config('test.flags', '{}', false)`, [user ?? '', role ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}

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

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  -- The other buckets' policy helpers (20261023150000 carries every storage.objects policy): none is under test here.
  CREATE FUNCTION public.test_flag(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_readable_by_hr(p text, p_owner text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');
  CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status NOT NULL);
  CREATE TABLE public.payment_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), storage_path text NOT NULL);
  CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
  CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
  CREATE TABLE public.member_request_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, object_path text);
  -- Every policy on file_objects is weighed on each write, so the tables the others read are readable (as there).
  GRANT SELECT ON public.payment_vouchers, public.payment_attachments, public.crm_contacts, public.member_requests,
    public.member_request_attachments TO authenticated, anon;

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason
  $$;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.companies(id uuid PRIMARY KEY, name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text,
    user_id uuid, title_id uuid, department_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.att_holidays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, name text NOT NULL,
    kind text, states text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'),
    ('${U.outsider}', 'Outsider', 'out@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES
    ('${id(101)}', 'Carres', 'CAR', true), ('${id(102)}', '2990 Home', '2990', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(await sql('20261023150000_file_storage_r2.sql'))
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261024005000_marketing_subsidiary_page.sql', '20261024006000_marketing_project_log.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261024007000_marketing_library.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
const bigger = await sql('20261024007100_marketing_library_bigger_uploads.sql')

// ── The bucket, the types, the registry ─────────────────────────────────────────
check(await peek(`SELECT public, (file_size_limit / 1048576)::int AS mb, backend FROM public.file_buckets WHERE id = 'marketing'`),
  [{ public: false, mb: 50, backend: 'r2' }], 'Marketing’s bucket: private, in R2 from the start, 50 MB a file')
await db.exec(bigger)
await db.exec(bigger) // twice: nothing changes
check(await peek(`SELECT (file_size_limit / 1048576)::int AS mb, allowed_mime_types FROM public.file_buckets WHERE id = 'marketing'`),
  [{ mb: 2048, allowed_mime_types: null }], '…then 2 GB a file (007100 — the user: "make the size more bigger for all"), any type')
check(await peek1(`SELECT count(*)::int FROM pg_policies WHERE tablename = 'file_objects' AND policyname LIKE 'mkt_library_%'`), 3,
  'its three policies')
check((await peek(`SELECT name, cat, link FROM public.mkt_lib_types ORDER BY sort_order`)).map(t => `${t.name}:${t.cat}${t.link ? ':link' : ''}`), [
  'Brandbook:Brand', 'Handbook:Content', 'Product info:Product', 'Product photos:Photo', 'Video library:Video', 'Meeting minutes:Minutes',
  'Character library:Content', 'Reference book:Content', 'Campaign planning:Content', 'Storyboard:Content', 'Price lists:Product',
  'Legal & contracts:Content', 'Raw footage:Video:link',
], 'the handoff’s thirteen folder types, each one’s files under its category, Raw footage a link')
check(await peek1(`SELECT count(*)::int FROM public.permission_page_tabs WHERE page = '/marketing/library' AND tab_id = 'mkt.projects'`), 1,
  'the page on the Projects tab, in the database’s copy of the registry')
for (const fn of ['mkt_library()', 'mkt_lib_type_add(text,text,text)', 'mkt_lib_folder_add(uuid,uuid,text)', 'mkt_lib_file_add(uuid,text,text)',
  'mkt_lib_move(text,uuid,uuid)', 'mkt_lib_bin(text,uuid)', 'mkt_lib_restore(text,uuid)', 'mkt_lib_delete(text,uuid)']) {
  check([await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)],
    [false, true], `${fn}: a sign-in's, never the publishable key's`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_lib_purge()', 'EXECUTE')`), false, 'the purge is nobody’s to call')

const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const H2990 = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = '2990'`)
const type = name => peek1(`SELECT id FROM public.mkt_lib_types WHERE name = $1`, [name])
const BRAND = await type('Brandbook')
const PHOTOS = await type('Product photos')
const RAW = await type('Raw footage')

// ── Folder types: the manager's ─────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_lib_type_add('Moodboards', 'oklch(0.55 0.12 300)', 'Content')`, [], /Folder types are the manager's/, 'a new type is the manager’s')
await as(U.josiah, MANAGER)
const mood = await one(`SELECT public.mkt_lib_type_add('  Moodboards  ', 'oklch(0.55 0.12 300)', 'Content')`)
check([mood.name, mood.cat, mood.link], ['Moodboards', 'Content', false], 'a new folder type, tidied, for every subsidiary')
await refuses(`SELECT public.mkt_lib_type_add('moodboards', 'oklch(0.55 0.12 300)', 'Content')`, [], /is a folder type already/, 'never twice, whatever the case')
await refuses(`SELECT public.mkt_lib_type_add('Odd', 'url(https://x)', 'Content')`, [], /one of the six colours/, 'only the six colours — nothing else reaches a style')
await refuses(`SELECT public.mkt_lib_type_add('Odd', 'oklch(0.55 0.12 300)', 'Memes')`, [], /category/, 'one of the categories')

// ── Folders: one of each type in a subsidiary; a link type takes an address ──────
await as(U.mei, STAFF)
const brandCar = (await one(`SELECT public.mkt_lib_folder_add($1, $2)`, [CAR, BRAND])).id
const photosCar = (await one(`SELECT public.mkt_lib_folder_add($1, $2)`, [CAR, PHOTOS])).id
await refuses(`SELECT public.mkt_lib_folder_add($1, $2)`, [CAR, BRAND], /Carres has a Brandbook folder already/, 'one folder of a type in a subsidiary')
await refuses(`SELECT public.mkt_lib_folder_add($1, $2, 'http://drive.google.com/x')`, [CAR, RAW], /Paste the folder's link/, 'a link folder takes an https address')
const rawCar = (await one(`SELECT public.mkt_lib_folder_add($1, $2, 'https://drive.google.com/drive/folders/abc')`, [CAR, RAW])).id
check(await peek1(`SELECT url FROM public.mkt_lib_folders WHERE id = $1`, [rawCar]), 'https://drive.google.com/drive/folders/abc', 'kept')
check(await peek1(`SELECT url FROM public.mkt_lib_folders WHERE id = $1`, [brandCar]), null, 'a files folder keeps no address')
await as(U.mei, VIEW)
await refuses(`SELECT public.mkt_lib_folder_add($1, $2)`, [H2990, BRAND], /Adding to the Library is not open/, 'Marketing · Edit adds')
await as(U.outsider, [])
await refuses(`SELECT public.mkt_library()`, [], /Marketing is not open to your account/, 'nobody outside Marketing reads it')

// ── Files: the bytes’ row first (the bucket’s policies), then the Library’s ─────
const put = (name, size = 2048, type = 'application/pdf') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])
const P1 = `library/${id(901)}/brandbook-v3.pdf`
const P2 = `library/${id(902)}/kj-showroom.jpg`
const P3 = `library/${id(903)}/never-filed.pdf`
await as(U.mei, VIEW)
await assert.rejects(put(P1), /row-level security|violates/, 'Marketing · Edit puts a file in'); checks++
await as(U.mei, STAFF)
await assert.rejects(put(`elsewhere/${id(904)}/x.pdf`), /row-level security|violates/, 'only under library/'); checks++
await assert.rejects(put(`library/${id(905)}/huge.mp4`, 2147483649, 'video/mp4'), /maximum allowed size/, '2 GB a file'); checks++
const TOUR = `library/${id(906)}/showroom-tour.mp4`
await put(TOUR, 600 * 1024 * 1024, 'video/mp4')
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [TOUR])).length, 1,
  'a 600 MB video taken — and, never filed, taken back by its sender')
await put(P1)
await put(P2, 4096, 'image/jpeg')
await put(P3)
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_lib_file_add($1, 'Brandbook v3', $2)`, [brandCar, P1], /has not arrived/, 'only the caller’s own upload is filed')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_lib_file_add($1, 'x', $2)`, [brandCar, `library/${id(906)}/missing.pdf`], /has not arrived/, 'never a file that is not there')
await refuses(`SELECT public.mkt_lib_file_add($1, 'x', $2)`, [rawCar, P1], /link folder keeps its files/, 'never into a link folder')
const f1 = (await one(`SELECT public.mkt_lib_file_add($1, '  Brandbook   v3 ', $2)`, [brandCar, P1])).id
const f2 = (await one(`SELECT public.mkt_lib_file_add($1, 'KJ showroom', $2)`, [photosCar, P2])).id
await refuses(`SELECT public.mkt_lib_file_add($1, 'again', $2)`, [brandCar, P1], /in the Library already/, 'filed once')
check(await peek(`SELECT name, size::int AS size, mime, by_name FROM public.mkt_lib_files WHERE id = $1`, [f1]),
  [{ name: 'Brandbook v3', size: 2048, mime: 'application/pdf', by_name: 'Mei' }], 'its name tidied, its size and type from its bytes’ row, who filed it')

// The bytes’ rows: Marketing reads them; a file never filed is its sender’s to take back; the rest the manager’s.
await as(U.ali, VIEW)
check((await q(`SELECT name FROM public.file_objects WHERE bucket_id = 'marketing' ORDER BY name`)).length, 3, 'Marketing reads the bucket')
await as(U.outsider, [])
check((await q(`SELECT name FROM public.file_objects WHERE bucket_id = 'marketing'`)).length, 0, 'nobody else does')
await as(U.ali, STAFF)
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [P3])).length, 0, 'not another’s')
await as(U.mei, STAFF)
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [P1])).length, 0, 'not a filed one')
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [P3])).length, 1, 'one’s own, never filed: taken back')

// ── The page’s read ────────────────────────────────────────────────────────────
await as(U.ali, VIEW)
let lib = await one(`SELECT public.mkt_library()`)
check(lib.types.length, 14, 'every folder type')
check(lib.subs.map(s => s.code), ['CAR', '2990'], 'the subsidiaries')
check(lib.folders.length, 3, 'their folders')
check(lib.files.map(f => f.name), ['KJ showroom', 'Brandbook v3'], 'the files, newest first')
check(lib.trash, [], 'an empty Dustbin')

// ── Move ────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
const brand2990 = (await one(`SELECT public.mkt_lib_folder_add($1, $2)`, [H2990, BRAND])).id
await refuses(`SELECT public.mkt_lib_move('folder', $1, $2)`, [brandCar, H2990], /2990 Home has a Brandbook folder already/, 'never two of a type')
await one(`SELECT public.mkt_lib_move('file', $1, $2)`, [f1, brand2990])
check(await peek1(`SELECT folder_id FROM public.mkt_lib_files WHERE id = $1`, [f1]), brand2990, 'a file to another subsidiary’s folder')
await refuses(`SELECT public.mkt_lib_move('file', $1, $2)`, [f1, rawCar], /link folder keeps its files/, 'never into a link folder')
await one(`SELECT public.mkt_lib_move('folder', $1, $2)`, [photosCar, H2990])
check(await peek1(`SELECT subsidiary_id FROM public.mkt_lib_folders WHERE id = $1`, [photosCar]), H2990, 'a folder to another subsidiary, its files with it')

// ── The Dustbin: bin, restore, delete for good, and its 30 days ─────────────────
await one(`SELECT public.mkt_lib_bin('file', $1)`, [f2])
await one(`SELECT public.mkt_lib_bin('folder', $1)`, [brand2990])
await as(U.ali, VIEW)
lib = await one(`SELECT public.mkt_library()`)
check(lib.files.map(f => f.name), [], 'binned: off the page — a file, and the files of a binned folder')
check(lib.trash.map(t => `${t.kind}:${t.name}${t.n != null ? `:${t.n}` : ''}`).sort(), ['file:KJ showroom', 'folder:Brandbook:1'], 'in the Dustbin: the file, the folder with its one file')
await as(U.mei, STAFF)
await one(`SELECT public.mkt_lib_folder_add($1, $2)`, [H2990, BRAND])
await refuses(`SELECT public.mkt_lib_restore('folder', $1)`, [brand2990], /2990 Home has a new Brandbook folder/, 'never two of a type, even restored')
await one(`SELECT public.mkt_lib_restore('file', $1)`, [f2])
check(await peek1(`SELECT trashed_at FROM public.mkt_lib_files WHERE id = $1`, [f2]), null, 'restored where it was')
await refuses(`SELECT public.mkt_lib_delete('folder', $1)`, [brand2990], /Deleting for good is the manager's/, 'deleting for good is the manager’s')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_lib_delete('file', $1)`, [f2], /Only what is in the Dustbin/, 'only from the Dustbin')
check((await one(`SELECT public.mkt_lib_delete('folder', $1)`, [brand2990])).files, 1, 'a binned folder, gone for good with its file')
check(await peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [P1]), 0, '…and its bytes’ row (R2’s sweep takes the bytes)')

// Thirty days on: the next write takes what has waited that long.
await as(U.mei, STAFF)
await one(`SELECT public.mkt_lib_bin('file', $1)`, [f2])
await peek(`UPDATE public.mkt_lib_files SET trashed_at = now() - interval '31 days' WHERE id = $1`, [f2])
await as(U.ali, VIEW)
check((await one(`SELECT public.mkt_library()`)).trash.length, 0, 'past 30 days: out of the Dustbin’s list')
await as(U.mei, STAFF)
await one(`SELECT public.mkt_lib_folder_add($1, $2)`, [CAR, await type('Handbook')])
check([await peek1(`SELECT count(*)::int FROM public.mkt_lib_files WHERE id = $1`, [f2]),
  await peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [P2])], [0, 0],
  'and gone with the next write — its row and its bytes’ row')
await refuses(`SELECT public.mkt_lib_restore('file', $1)`, [f2], /not in the Dustbin/, 'too late to restore')

// ── ⑥-2: a subsidiary's brand profile (20261024007200) ────────────────────────────
await db.exec('RESET ROLE')
const profiles = await sql('20261024007200_marketing_brand_profiles.sql')
await db.exec(profiles)
await db.exec(profiles) // twice: nothing changes, nothing breaks
check(await peek1(`SELECT count(*)::int FROM pg_policies WHERE tablename = 'file_objects' AND policyname = 'mkt_library_brand_upload'`), 1,
  'a policy of its own for brand pictures')
check([await one(`SELECT has_function_privilege('anon', 'public.mkt_lib_profile_save(uuid,jsonb)', 'EXECUTE')`),
  await one(`SELECT has_function_privilege('authenticated', 'public.mkt_lib_profile_save(uuid,jsonb)', 'EXECUTE')`)],
  [false, true], 'the profile’s writer: a sign-in’s, never the publishable key’s')
const save = (sub, profile) => one(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [sub, JSON.stringify(profile)])
const profileOf = sub => peek1(`SELECT profile FROM public.mkt_subsidiaries WHERE id = $1`, [sub])
const LOGO = `brand/${id(951)}/carres-logo.png`
const COVER = `brand/${id(952)}/carres-cover.jpg`
const ALIS = `brand/${id(953)}/ali.png`
const DOC = `brand/${id(954)}/brief.pdf`

await as(U.mei, STAFF)
await assert.rejects(put(`brand/${id(955)}/logo.png`, 1000, 'image/png'), /row-level security|violates/, 'a brand picture is the manager’s to send'); checks++
await refuses(`SELECT public.mkt_lib_profile_save($1, '{}'::jsonb)`, [CAR], /Brand profiles are the manager's/, 'a profile is the manager’s')
await as(U.ali, MANAGER)
await put(ALIS, 1000, 'image/png')
await as(U.josiah, MANAGER)
await put(LOGO, 1000, 'image/png')
await put(COVER, 5000, 'image/jpeg')
await put(DOC, 900, 'application/pdf')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ avatar: 'url(https://x)' })], /seven colours/, 'only the handoff’s colours')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ banner: 'rgb(1 2 3)' })], /seven backgrounds/, 'only the handoff’s backgrounds')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ font: 'Comic Sans' })], /six fonts/, 'only the six fonts')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ name: 'x'.repeat(41) })], /at most 40/, 'a display name of 40 at most')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ caption: 'x'.repeat(81) })], /at most 80/, 'a caption of 80 at most')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ avatar_path: ALIS })], /has not arrived/, 'never a picture another sent')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ avatar_path: `brand/${id(956)}/x.png` })], /has not arrived/, 'never one not there')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, JSON.stringify({ banner_path: DOC })], /is an image/, 'a picture is an image')
await refuses(`SELECT public.mkt_lib_profile_save($1, $2::jsonb)`, [CAR, '[1]'], /Send the profile/, 'a profile is an object')
await save(CAR, { avatar_path: LOGO, banner_path: COVER, banner: 'rgb(40 34 30)', font: 'Playfair', name: '  Carres   Living ', caption: ' Sofa & living · KJ, PCH ', style: 'x' })
check(await profileOf(CAR), { avatar_path: LOGO, banner_path: COVER, banner: 'rgb(40 34 30)', font: 'Playfair', name: 'Carres Living', caption: 'Sofa & living · KJ, PCH' },
  'saved whole: the words tidied, nothing it does not know')
await as(U.ali, VIEW)
check((await one(`SELECT public.mkt_library()`)).subs.find(s => s.code === 'CAR').profile.font, 'Playfair', 'the Library reads each subsidiary’s profile')

// A picture a profile shows is filed: its sender cannot take it back; replaced or taken off, its bytes’ row goes.
await as(U.josiah, STAFF)
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [LOGO])).length, 0,
  'its sender cannot take back a picture a profile shows')
await as(U.ali, MANAGER)
await save(CAR, { ...(await profileOf(CAR)) })
check((await profileOf(CAR)).avatar_path, LOGO, 'another manager saves it again — the picture it shows stays')
await as(U.josiah, MANAGER)
await save(H2990, { banner_path: COVER })
await save(CAR, { avatar: 'rgb(44 82 130)', font: 'Playfair' })
check(await profileOf(CAR), { avatar: 'rgb(44 82 130)', font: 'Playfair' }, 'pictures taken off, a colour instead')
check([await peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [LOGO]),
  await peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [COVER])], [0, 1],
  'the logo’s bytes’ row gone; the cover another profile shows kept')
await save(H2990, {})
check(await peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [COVER]), 0, '…until nothing shows it')

// ── ⑥-3: a guest share link (20261024007300) ──────────────────────────────────────
await db.exec('RESET ROLE')
const sharesMig = await sql('20261024007300_marketing_library_shares.sql')
await db.exec(sharesMig)
await db.exec(sharesMig) // twice: nothing changes, nothing breaks
for (const [fn, anon, auth] of [['mkt_lib_share(text,uuid,text,boolean)', false, true], ['mkt_lib_share_stop(text,uuid)', false, true],
  ['mkt_lib_shared(text)', true, true], ['mkt_lib_shared_file(text,uuid)', true, true], ['mkt_lib_share_of(text,uuid)', false, false],
  ['mkt_lib_share_may_read(text)', true, false]]) {
  check([await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)],
    [anon, auth], `${fn}: ${anon ? 'the stranger’s, by its code' : auth ? 'a sign-in’s' : 'nobody’s to call'}`)
}
const SA = `library/${id(961)}/brief.pdf`
const SB = `library/${id(962)}/shoot.jpg`
const SC = `library/${id(963)}/elsewhere.pdf`
await as(U.mei, STAFF)
await put(SA)
await put(SB, 4096, 'image/jpeg')
await put(SC)
const fa = (await one(`SELECT public.mkt_lib_file_add($1, 'Brief', $2)`, [brandCar, SA])).id
const fb = (await one(`SELECT public.mkt_lib_file_add($1, 'Shoot', $2)`, [brandCar, SB])).id
const fc = (await one(`SELECT public.mkt_lib_file_add($1, 'Elsewhere', $2)`, [photosCar, SC])).id
const share = (kind, item, expiry = '7d', dl = true) => one(`SELECT public.mkt_lib_share($1, $2, $3, $4)`, [kind, item, expiry, dl])

await as(U.ali, VIEW)
await refuses(`SELECT public.mkt_lib_share('file', $1, '7d', true)`, [fa], /Sharing from the Library is not open/, 'sharing is Marketing · Edit’s')
await as(U.mei, STAFF)
const a1 = await share('file', fa)
check([/^[0-9a-f]{32}$/.test(a1.code), a1.download, Math.round((Date.parse(a1.expires) - Date.now()) / 864e5)], [true, true, 7], 'a file’s link: 32 random hex, download on, 7 days')
await refuses(`SELECT public.mkt_lib_share('file', $1, '1y', true)`, [fa], /Pick when the link expires/, 'only the four expiries')
await refuses(`SELECT public.mkt_lib_share('folder', $1, '7d', true)`, [rawCar], /link folder is shared by its own link/, 'never a link folder')
await refuses(`SELECT public.mkt_lib_share('page', $1, '7d', true)`, [fa], /Share a file or a folder/, 'a file or a folder')
const a2 = await share('file', fa, '24h', false)
check([a2.code, a2.download, a2.expiry, Math.round((Date.parse(a2.expires) - Date.now()) / 36e5)], [a1.code, false, '24h', 24],
  'shared again: the same link, its expiry (what was picked, and when) and download changed')
const b1 = await share('folder', brandCar, 'never')
check(b1.expires, null, 'a folder’s link that never expires')
await as(U.ali, VIEW)
check((await one(`SELECT public.mkt_library()`)).shares.map(s => `${s.kind}:${s.code === a1.code ? 'A' : s.code === b1.code ? 'B' : '?'}:${s.download}:${s.expiry}`).sort(),
  ['file:A:false:24h', 'folder:B:true:never'], 'Marketing sees each live link')

// The stranger: the page’s read and one file’s place — by the code, nothing else.
await as(null, [], 'anon')
check(await one(`SELECT public.mkt_lib_shared('nope')`), null, 'a wrong code opens nothing')
const pa = await one(`SELECT public.mkt_lib_shared($1)`, [a1.code])
check([pa.kind, pa.name, pa.folder, pa.sub.name, pa.download, pa.files.map(f => f.name)], ['file', 'Brief', 'Brandbook', 'Carres', false, ['Brief']], 'a file’s page')
check(Object.keys(pa.files[0]).sort(), ['at', 'ext', 'id', 'mime', 'name', 'size'], 'never a path, never who sent it')
check(pa.files[0].ext, 'PDF', 'its kind from its name’s ending')
check((await one(`SELECT public.mkt_lib_shared($1)`, [b1.code])).files.map(f => f.name), ['Shoot', 'Brief'], 'a folder’s page: its files, newest first')
check((await one(`SELECT public.mkt_lib_shared_file($1, $2)`, [b1.code, fb])).path, SB, 'a file of the link: its place, to sign')
check(await one(`SELECT public.mkt_lib_shared_file($1, $2)`, [a1.code, fb]), null, 'never a file the link does not hold')
const asStranger = async code => {
  await q(`SELECT set_config('request.headers', $1, false)`, [code === undefined ? '' : JSON.stringify({ 'x-link-code': code })])
  return (await q(`SELECT name FROM public.file_objects WHERE bucket_id = 'marketing' ORDER BY name`)).map(r => r.name)
}
check(await asStranger(b1.code), [SA, SB], 'the bucket opens to the folder’s code its files, nothing else')
check(await asStranger(a1.code), [SA], '…to a file’s code that file')
check([await asStranger('ffffffffffffffffffffffffffffffff'), await asStranger(undefined)], [[], []], '…to anything else, nothing')
// The brand's own pictures open to its links' codes — the page wears them.
await as(U.josiah, MANAGER)
const PIC = `brand/${id(964)}/logo.png`
await put(PIC, 900, 'image/png')
await save(CAR, { avatar_path: PIC })
await as(null, [], 'anon')
check([await asStranger(b1.code), await asStranger(a1.code)], [[PIC, SA, SB], [PIC, SA]], '…and its brand’s logo, to either')

// Binned, stopped, expired: closed. Shared again past its expiry: a new code.
await as(U.mei, STAFF)
await one(`SELECT public.mkt_lib_bin('file', $1)`, [fa])
await as(null, [], 'anon')
check([await one(`SELECT public.mkt_lib_shared($1)`, [a1.code]), (await one(`SELECT public.mkt_lib_shared($1)`, [b1.code])).files.map(f => f.name), await asStranger(b1.code)],
  [null, ['Shoot'], [PIC, SB]], 'a binned file: its link closed, gone from its folder’s')
await as(U.mei, STAFF)
await one(`SELECT public.mkt_lib_restore('file', $1)`, [fa])
await one(`SELECT public.mkt_lib_share_stop('folder', $1)`, [brandCar])
await refuses(`SELECT public.mkt_lib_share_stop('folder', $1)`, [brandCar], /no link to stop/, 'stopped once')
await as(null, [], 'anon')
check([await one(`SELECT public.mkt_lib_shared($1)`, [b1.code]), await asStranger(b1.code)], [null, []], 'a stopped link opens nothing')
await peek(`UPDATE public.mkt_lib_shares SET expires_at = now() - interval '1 second' WHERE code = $1`, [a1.code])
check([await one(`SELECT public.mkt_lib_shared($1)`, [a1.code]), await asStranger(a1.code)], [null, []], 'nor one past its expiry')
await as(U.mei, STAFF)
const a3 = await share('file', fa, '30d', true)
check([a3.code !== a1.code, await peek1(`SELECT stopped_at IS NOT NULL FROM public.mkt_lib_shares WHERE code = $1`, [a1.code])], [true, true],
  'shared again past its expiry: a new code, the old one closed')

// Deleted for good: its links go with it.
await one(`SELECT public.mkt_lib_bin('file', $1)`, [fc])
await as(U.josiah, MANAGER)
await share('file', fb)
await one(`SELECT public.mkt_lib_bin('folder', $1)`, [brandCar])
await one(`SELECT public.mkt_lib_delete('folder', $1)`, [brandCar])
check(await peek1(`SELECT count(*)::int FROM public.mkt_lib_shares WHERE file_id IN ($1, $2) OR folder_id = $3`, [fa, fb, brandCar]), 0,
  'a folder deleted for good takes its links, and its files’')

console.log(`marketing library: ${checks} checks passed`)
