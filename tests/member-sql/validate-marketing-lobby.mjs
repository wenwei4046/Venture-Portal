// Local PostgreSQL regression for 20261025038000 (2026-10-24 — Marketing ⑦-4, the lobby and a visit to a teammate's
// space; the user's answers 37, 38 and 40). Marketing's migrations up to the pet's levels run; some spaces are set up;
// then this one, twice. What is under test: who may call what; the lobby — the roster's pets set up (a login, the pet
// onboarded), whose, their XP and energy, anybody with Marketing · View; a visit — a teammate's space without its
// layout, the photo only under space/, their pet in numbers, nobody off the roster or without a login; the photo sent
// under space/ now (one kept under mine/ stays its owner's), a teammate reading it. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
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
const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), lee: id(4), siti: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), lee: id(14), siti: id(15), kai: id(16) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false),
                  set_config('test.actions', $3, false), set_config('test.flags', '{}', false)`, [user ?? '', role ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'), ('${U.lee}', 'Lee', 'lee@x.my'), ('${U.siti}', 'Siti', 'siti@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'ACCOUNTANT');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', '${U.lee}', '${id(304)}', '${id(202)}', 'active'),
    ('${S.siti}', 'SITI AMINAH', 'Siti', '${U.siti}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.kai}', 'KAI MING', 'Kai', NULL, '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(await sql('20261023150000_file_storage_r2.sql'))
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261024005000_marketing_subsidiary_page.sql', '20261024006000_marketing_project_log.sql', '20261024007000_marketing_library.sql',
  '20261024007100_marketing_library_bigger_uploads.sql', '20261024007200_marketing_brand_profiles.sql', '20261024007300_marketing_library_shares.sql',
  '20261024007400_marketing_task_library.sql', '20261024007500_marketing_spaces.sql', '20261024007600_marketing_space_private_photo.sql',
  '20261024007700_marketing_space_room_pet.sql', '20261025004000_marketing_library_answers.sql', '20261025004100_marketing_builder_deletes.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql',
  '20261025034000_marketing_two_pics.sql', '20261025035000_marketing_pic_both.sql', '20261025036000_marketing_replace_person.sql',
  '20261025037000_marketing_pet_levels.sql']
for (const m of MIGS) await db.exec(await sql(m))
const refusesSys = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}

// ── Some spaces before ⑦-4: Mei's and Ali's pets set up, Siti's not; Josiah none ───────────────────────────────
await asSystem()
const OLD_PHOTO = `mine/${id(901)}/old.jpg`
await q(`INSERT INTO public.mkt_spaces (user_id, theme, cover, status, notes, pet, room) VALUES
  ($1, '{"bg":"mint","accent":"blue","corners":"round"}'::jsonb, 2, 'Shooting all day', 'Call the Carres PIC',
   '{"species":"cat","name":"Kopi","color":"original","onboarded":true}'::jsonb, '{"wall":"sage","floor":"tile","items":[]}'::jsonb),
  ($2, '{}'::jsonb, NULL, NULL, NULL, '{"species":"dog","name":"Bao","color":"cocoa","onboarded":true}'::jsonb, '{}'::jsonb),
  ($3, '{}'::jsonb, NULL, NULL, NULL, '{"species":"bird","name":"","color":"original","onboarded":false}'::jsonb, '{}'::jsonb)`,
  [U.mei, U.ali, U.siti])
await q(`UPDATE public.mkt_spaces SET photo_path = $2 WHERE user_id = $1`, [U.mei, OLD_PHOTO])
// Mei's pet has worked a little: a workout (−15 energy, +10 XP) and a feed of nothing.
await q(`INSERT INTO public.mkt_pet_log (staff, kind, xp, energy) VALUES ($1, 'workout', 10, -15), ($1, 'feed', 0, 0)`, [S.mei])

const mig = await sql('20261025038000_marketing_lobby_visit.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_lobby()', 'mkt_space_of(uuid)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
await as(U.lee, [])
await refuses(`SELECT public.mkt_lobby()`, [], /Marketing is not open to your account/, 'the lobby: Marketing · View')
await refuses(`SELECT public.mkt_space_of($1)`, [S.mei], /Marketing is not open to your account/, 'a visit: Marketing · View')

// ── The lobby (answer 37): the roster's pets set up — whoever has Marketing · View sees it ─────────────────
await as(U.lee, VIEW)
const lobby = await one(`SELECT public.mkt_lobby()`)
check(lobby.map(p => [p.first, p.species, p.name, p.color, p.petPath, p.xp, p.energy]), [
  ['Ali', 'dog', 'Bao', 'cocoa', null, 0, 64], ['Mei', 'cat', 'Kopi', 'original', null, 10, 49],
], 'Ali and Mei, by name: their pets, XP and energy — not Siti (her pet not set up), not Josiah (no space), not Kai (no login), not Lee (off the roster)')
check(lobby.map(p => [p.staff, p.title]), [[S.ali, 'GRAPHIC DESIGNER'], [S.mei, 'VIDEOGRAPHER']], 'whose — the visit opens by it')
await asSystem()
await q(`UPDATE public.mkt_spaces SET pet = pet || '{"onboarded":true,"name":"Tweety"}'::jsonb, pet_path = $2 WHERE user_id = $1`, [U.siti, `space/${id(902)}/tweety.png`])
await as(U.josiah, VIEW)
check((await one(`SELECT public.mkt_lobby()`)).map(p => [p.first, p.petPath]), [['Ali', null], ['Mei', null], ['Siti', `space/${id(902)}/tweety.png`]],
  'a pet set up joins the lobby — one’s own animal with it')

// ── A visit (answer 38): a teammate's space, their Notes and their Photo ─────────────────────────────
await as(U.ali, VIEW)
let v = await one(`SELECT public.mkt_space_of($1)`, [S.mei])
check([v.staff, v.first, v.full, v.title], [S.mei, 'Mei', 'MEI LING TAN', 'VIDEOGRAPHER'], 'whose space')
check(Object.keys(v.space).sort(), ['avatarPath', 'cover', 'coverPath', 'notes', 'pet', 'petPath', 'photoPath', 'room', 'status', 'theme'],
  'their space as they keep it — never their board’s layout')
check([v.space.status, v.space.notes, v.space.cover, v.space.theme, v.space.room.wall, v.space.pet.name],
  ['Shooting all day', 'Call the Carres PIC', 2, { bg: 'mint', accent: 'blue', corners: 'round' }, 'sage', 'Kopi'], 'the words, the look, the room, the pet')
check(v.space.photoPath, null, 'a photo kept under mine/ stays its owner’s: a visit does not show it')
check([v.stats.xp, v.stats.energy, v.stats.snacks, v.stats.trophyCount], [10, 49, 3, 0], 'their pet in numbers')
v = await one(`SELECT public.mkt_space_of($1)`, [S.josiah])
check([v.first, v.space, v.stats.energy], ['SIA', null, 64], 'somebody who never opened My Space: their name, no space — the page draws the design’s')
check([await one(`SELECT public.mkt_space_of($1)`, [S.lee]), await one(`SELECT public.mkt_space_of($1)`, [S.kai]),
  await one(`SELECT public.mkt_space_of($1)`, [id(999)])], [null, null, null], 'off the roster, no login, nobody: none')

// ── The photo under space/ now: Mei sends one, Ali sees it ─────────────────────────────────────
const put = (name, size = 2048, type = 'image/png') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])
const PHOTO = `space/${id(903)}/beach.jpg`
const MINE = `mine/${id(904)}/beach.jpg`
await as(U.mei, STAFF)
await put(PHOTO, 4000, 'image/jpeg')
await put(MINE, 4000, 'image/jpeg')
await refuses(`SELECT public.mkt_space_save($1::jsonb)`, [JSON.stringify({ photoPath: MINE })], /has not arrived/, 'a photo sent now is under space/ — never mine/')
let sp = await one(`SELECT public.mkt_space_save($1::jsonb)`, [JSON.stringify({ status: 'Back at noon' })])
check([sp.status, sp.photoPath], ['Back at noon', OLD_PHOTO], 'the photo kept under mine/ stays while other parts change')
sp = await one(`SELECT public.mkt_space_save($1::jsonb)`, [JSON.stringify({ photoPath: PHOTO })])
check(sp.photoPath, PHOTO, 'the photo under space/')
await as(U.ali, VIEW)
check([(await one(`SELECT public.mkt_space_of($1)`, [S.mei])).space.photoPath,
  await one(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [PHOTO]),
  await one(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [MINE])], [PHOTO, 1, 0],
  'a teammate sees it — never one under mine/')
check(await peek1(`SELECT count(*)::int FROM public.mkt_spaces WHERE photo_path LIKE 'mine/%'`), 0, 'the old one under mine/ replaced')
await asSystem()
await refusesSys(`UPDATE public.mkt_spaces SET photo_path = 'elsewhere/x.png' WHERE user_id = $1`, [U.mei], /photo_path_check/, 'a photo under space/ or mine/ — nowhere else')

console.log(`marketing lobby and visits: ${checks} checks passed`)
