// Local PostgreSQL regression for 20261024007500 and 20261024007600 (2026-10-23 — Marketing ⑦-1: My Space's personal
// side, `My Space Bento.dc.html` of the Claude Design handoff "HOUZS Marketing Module Setup"). The R2 move's table and
// Marketing's migrations run (the Library's too — a space's pictures share its bucket), then these two, each twice. What
// is under test: one space per login, read by its owner alone; only the parts sent saved; a layout checked whole (known
// tiles, once each, within the board, the minimum size, My turn and Waiting kept); the look by keys; the words tidied; a
// picture only one's own just sent (an image) — the cover and the avatar under space/, which teammates see, the photo
// under mine/, which nobody else does, not even a manager; the one replaced taken off, the one shown filed; who may.
// No live I/O.
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
for (const m of ['20261024007000_marketing_library.sql', '20261024007100_marketing_library_bigger_uploads.sql',
  '20261024007200_marketing_brand_profiles.sql', '20261024007300_marketing_library_shares.sql', '20261024007400_marketing_task_library.sql']) {
  await db.exec(await sql(m))
}
for (const m of ['20261024007500_marketing_spaces.sql', '20261024007600_marketing_space_private_photo.sql']) {
  const mig = await sql(m)
  await db.exec(mig)
  await db.exec(mig) // twice: nothing changes, nothing breaks
}

// ── The table, the functions, the bucket ──────────────────────────────────────────
check(await peek1(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_spaces'`), 'none', 'a layout dragged is no history')
for (const fn of ['mkt_space()', 'mkt_space_save(jsonb)']) {
  check([await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)],
    [false, true], `${fn}: a sign-in’s, never the publishable key’s`)
}
check(await peek1(`SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE tablename = 'file_objects' AND policyname LIKE 'mkt_space%'`),
  'mkt_space_mine_read,mkt_space_mine_upload,mkt_space_upload', 'policies for a space’s pictures: space/ sent, mine/ sent and read')

const save = patch => one(`SELECT public.mkt_space_save($1::jsonb)`, [JSON.stringify(patch)])
const saveRefused = (patch, pattern, what) => refuses(`SELECT public.mkt_space_save($1::jsonb)`, [JSON.stringify(patch)], pattern, what)
const BOARD = [
  { id: 'turn', x: 0, y: 0, w: 0.5, h: 376 }, { id: 'waiting', x: 0.5, y: 0, w: 0.25, h: 182 },
  { id: 'delegated', x: 0.75, y: 0, w: 0.25, h: 182 }, { id: 'week', x: 0.5, y: 194, w: 0.5, h: 182 },
]
const put = (name, size = 2048, type = 'image/png') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])

// ── One space per login, its owner's ───────────────────────────────────────────────
await as(U.outsider, [])
await refuses(`SELECT public.mkt_space()`, [], /Marketing is not open to your account/, 'nobody outside Marketing has one')
await as(U.ali, VIEW)
check(await one(`SELECT public.mkt_space()`), null, 'none before the first save — the page draws the design’s')
await saveRefused({ status: 'hi' }, /Changing your space is not open/, 'Marketing · Edit changes one')
await as(U.mei, STAFF)
let sp = await save({ layout: BOARD, status: '  Shooting   all day ', theme: { bg: 'mint', accent: 'blue', corners: 'round' }, cover: 2, tilesKnown: ['turn', 'waiting', 'nope'] })
check([sp.status, sp.theme, sp.cover, sp.layout.length, sp.tilesKnown], ['Shooting all day', { bg: 'mint', accent: 'blue', corners: 'round' }, 2, 4, ['turn', 'waiting']],
  'saved: the words tidied, the look by its keys, the tiles it has seen')
sp = await save({ notes: 'Call Carres PIC\n' })
check([sp.notes, sp.status, sp.cover, sp.layout.length], ['Call Carres PIC', 'Shooting all day', 2, 4], 'only the parts sent change')
await as(U.ali, STAFF)
check(await one(`SELECT public.mkt_space()`), null, 'each login reads its own — never another’s')

// ── The layout: checked whole ─────────────────────────────────────────────────────
await as(U.mei, STAFF)
await saveRefused({ layout: BOARD.filter(t => t.id !== 'waiting') }, /My turn and Waiting stay/, 'My turn and Waiting stay on the board')
await saveRefused({ layout: [...BOARD, { id: 'turn', x: 0, y: 400, w: 0.25, h: 182 }] }, /once/, 'each tile once')
await saveRefused({ layout: [...BOARD, { id: 'radio', x: 0, y: 400, w: 0.25, h: 182 }] }, /not one the board knows/, 'only the tiles the board knows')
await saveRefused({ layout: [...BOARD, { id: 'notes', x: 0.9, y: 400, w: 0.25, h: 182 }] }, /within the board/, 'never past its right edge')
await saveRefused({ layout: [...BOARD, { id: 'notes', x: 0, y: 400, w: 0.1, h: 182 }] }, /at least 14%/, 'never narrower than 14%')
await saveRefused({ layout: [...BOARD, { id: 'notes', x: 0, y: 400, w: 0.25, h: 90 }] }, /110 px/, 'never lower than 110 px')
await saveRefused({ layout: [...BOARD, { id: 'notes', x: 'left', y: 400, w: 0.25, h: 182 }] }, /numbers/, 'its place in numbers')
sp = await save({ layout: [...BOARD, { id: 'notes', x: 0.123456, y: 400.4, w: 0.333333, h: 200.6 }] })
check(sp.layout.at(-1), { id: 'notes', x: 0.1235, y: 400, w: 0.3333, h: 201 }, 'kept rounded')
await saveRefused({ theme: { bg: '#000' } }, /from the drawer/, 'never a colour of its own')
await saveRefused({ cover: 7 }, /four covers/, 'one of the four covers')
await saveRefused({ status: 'x'.repeat(81) }, /at most 80/, 'a status of 80 at most')
check((await save({ cover: null })).cover, null, 'no preset: the first one is drawn')

// ── Pictures: one's own, an image — the cover and the avatar under space/ (teammates see them), the photo under mine/
// (its owner alone) ───────────────────────────────────────────────────────────────
const AV = `space/${id(981)}/me.png`
const COVER = `space/${id(982)}/cover.jpg`
const DOC = `mine/${id(983)}/cv.pdf`
const HIS = `space/${id(984)}/his.png`
const PHOTO = `mine/${id(988)}/beach.jpg`
const STRAY = `space/${id(989)}/beach.jpg`
await as(U.mei, VIEW)
await assert.rejects(put(`space/${id(985)}/x.png`), /row-level security|violates/, 'Marketing · Edit sends a picture'); checks++
await assert.rejects(put(`mine/${id(990)}/x.png`), /row-level security|violates/, 'Marketing · Edit sends a photo'); checks++
await as(U.ali, STAFF)
await put(HIS)
await as(U.mei, STAFF)
await assert.rejects(put(`elsewhere/${id(986)}/x.png`), /row-level security|violates/, 'only under space/ or mine/ (or the Library’s)'); checks++
await put(AV)
await put(COVER, 5000, 'image/jpeg')
await put(DOC, 900, 'application/pdf')
await put(PHOTO, 4000, 'image/jpeg')
await put(STRAY, 4000, 'image/jpeg')
await saveRefused({ avatarPath: HIS }, /has not arrived/, 'never a picture another sent')
await saveRefused({ avatarPath: `space/${id(987)}/gone.png` }, /has not arrived/, 'never one not there')
await saveRefused({ photoPath: STRAY }, /has not arrived/, 'the photo is under mine/ — never space/')
await saveRefused({ avatarPath: PHOTO }, /has not arrived/, 'the avatar is under space/ — never mine/')
await saveRefused({ photoPath: DOC }, /is an image/, 'a picture is an image')
sp = await save({ avatarPath: AV, coverPath: COVER, photoPath: PHOTO })
check([sp.avatarPath, sp.coverPath, sp.photoPath], [AV, COVER, PHOTO], 'its avatar, cover and photo')
const sees = async name => (await q(`SELECT count(*)::int AS n FROM public.file_objects WHERE name = $1`, [name]))[0].n
check([await sees(AV), await sees(COVER), await sees(PHOTO)], [1, 1, 1], 'its owner sees all three')
await as(U.ali, VIEW)
check([await sees(AV), await sees(COVER), await sees(PHOTO)], [1, 1, 0], 'a teammate sees the avatar and the cover — never the photo')
await as(U.josiah, MANAGER)
check(await sees(PHOTO), 0, 'nor does a manager')
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [PHOTO])).length, 0,
  'nor may a manager take it away')
await as(U.mei, STAFF)
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [AV])).length, 0,
  'a picture the space shows is filed — not taken back from under it')
sp = await save({ photoPath: null })
check([sp.photoPath, await peek1(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [PHOTO])], [null, 0],
  'the photo taken off loses its bytes’ row')
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [STRAY])).length, 1,
  'a picture never shown is its sender’s to take back')
sp = await save({ coverPath: null, avatarPath: AV })
check([sp.coverPath, sp.avatarPath, await peek1(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [COVER]),
  await peek1(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [AV])], [null, AV, 0, 1],
  'the cover taken off loses its bytes’ row; the avatar kept, kept')
check((await q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [DOC])).length, 1,
  'one never shown is its sender’s to take back')

console.log(`marketing spaces: ${checks} checks passed`)
