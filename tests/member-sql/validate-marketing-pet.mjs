// Local PostgreSQL regression for 20261025037000 (2026-10-24 — Marketing ⑦-5, the pet's levels, XP, energy and the
// trophies; the user's answers 32–34). Marketing's migrations up to both PICs run; a stage is finished; then this one,
// twice. What is under test: who may call what; a stage finished before it credited once; +10 a stage, +20 a product
// project's, a snack each — once a stage and person, nothing taken back; feeding (a snack, +20 to 100; none left; full)
// and workouts (−15, +10 XP the first three a day; too tired); the office's day; the trophies — this quarter's projects
// where you did a stage, a product project through its deliverables; who may care for a pet. No live I/O.
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
const U = { josiah: id(1), mei: id(2), ali: id(3), lee: id(4) }
const S = { josiah: id(11), mei: id(12), ali: id(13), lee: id(14) }

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'), ('${U.lee}', 'Lee', 'lee@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'ACCOUNTANT');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', '${U.lee}', '${id(304)}', '${id(202)}', 'active');
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
  '20261025034000_marketing_two_pics.sql', '20261025035000_marketing_pic_both.sql', '20261025036000_marketing_replace_person.sql']
for (const m of MIGS) await db.exec(await sql(m))

// ── Before ⑦-5: a stage Ali finishes (nothing credits it yet) ──────────────────────────────
await as(U.josiah, MANAGER)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const create = (title, stages) => one(`SELECT public.mkt_task_create($1, 'quick', $2, 'social', NULL, $3::jsonb, NULL)`, [CAR, title, JSON.stringify(stages)])
const finish = async (user, project) => {
  await as(user, STAFF)
  await one(`SELECT public.mkt_stage_accept($1)`, [project])
  await one(`SELECT public.mkt_stage_save($1, '{"notes":"Done"}'::jsonb)`, [project])
  await one(`SELECT public.mkt_stage_submit($1)`, [project])
}
const OLD = await create('Old banner', [{ name: 'Banner', dept: 'x', who: S.ali, sla: 1 }])
await finish(U.ali, OLD.id)
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [OLD.id]), 'done', 'a task finished before ⑦-5')

const mig = await sql('20261025037000_marketing_pet_levels.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_pet()', 'mkt_pet_care(text)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
check(await peek1(`SELECT has_function_privilege('authenticated', 'public.mkt_pet_of(uuid)', 'EXECUTE')`), false, 'mkt_pet_of: the functions’ own')
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_pet_log', 'SELECT')`), false, 'the ledger: read only through the functions')
check((await peek(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_pet_log'`)).map(r => r.mode), ['none'], 'the ledger is its own history')
check((await peek(`SELECT staff, kind, xp, snacks, day::text AS day FROM public.mkt_pet_log`)).map(r => [r.staff, r.kind, r.xp, r.snacks, r.day]),
  [[S.ali, 'stage', 10, 1, TODAY]], 'a stage finished before ⑦-5: credited once, on its day (applied twice, still once)')

/// ── XP: +10 a stage, a snack — to whoever did it ───────────────────────────────────────
await as(U.josiah, MANAGER)
const A = await create('Price banner', [{ name: 'Draft', dept: 'x', who: S.mei, sla: 1 }, { name: 'Check', dept: 'x', who: S.ali, sla: 1 },
  { name: 'Post', dept: 'x', who: S.mei, sla: 1 }])
await finish(U.mei, A.id)
const pet = async user => { await as(user, VIEW); return one(`SELECT public.mkt_pet()`) }
check(await pet(U.mei).then(p => [p.xp, p.snacks, p.energy]), [10, 4, 64], 'Mei finished a stage: +10 XP and a snack on her three; energy as it began')
await finish(U.ali, A.id)
await finish(U.mei, A.id)
check([await pet(U.mei).then(p => [p.xp, p.snacks]), await pet(U.ali).then(p => [p.xp, p.snacks])], [[20, 5], [20, 5]],
  'each stage to whoever did it — approvals and subtasks earn none')
await as(U.lee, VIEW)
check(await one(`SELECT public.mkt_pet()`), null, 'off the roster: no pet to read')

// Once a stage and person, nothing taken back: the same stage finished again earns nothing more.
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'active', cur = 0 WHERE id = $1`, [A.id])
await q(`UPDATE public.mkt_stages SET status = 'review' WHERE project_id = $1 AND idx = 0`, [A.id])
await q(`SELECT public.mkt_advance($1)`, [A.id])
check(await peek1(`SELECT count(*)::int FROM public.mkt_pet_log WHERE project_id = $1 AND stage_idx = 0`, [A.id]), 1, 'a stage finished twice: credited once')
await q(`UPDATE public.mkt_stages SET status = 'done' WHERE project_id = $1`, [A.id])
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE id = $1`, [A.id])

// A product project's stage: +20 — a deliverable's, or (made before deliverables) its own.
await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status) VALUES ($1, 'MKT-CAR-2610-001', 'product', $2, 'Post pack', 'active')`,
  [id(501), CAR])
await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, parent_id, cur) VALUES ($1, 'MKT-CAR-2610-001-D01', 'deliverable', $2, 'Image post', 'active', $3, 0)`,
  [id(502), CAR, id(501)])
await q(`INSERT INTO public.mkt_stages (project_id, idx, name, owner_staff, status) VALUES ($1, 0, 'Design', $2, 'review')`, [id(502), S.ali])
await q(`SELECT public.mkt_advance($1)`, [id(502)])
check(await pet(U.ali).then(p => [p.xp, p.snacks]), [40, 6], 'a deliverable’s stage: +20 and a snack')
await asSystem()
await q(`INSERT INTO public.mkt_stages (project_id, idx, name, owner_staff, status) VALUES ($1, 0, 'Brief', $2, 'review')`, [id(501), S.mei])
await q(`UPDATE public.mkt_projects SET cur = 0 WHERE id = $1`, [id(501)])
await q(`SELECT public.mkt_advance($1)`, [id(501)])
check([await pet(U.mei).then(p => [p.xp, p.snacks]), await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [id(501)])], [[40, 6], 'done'],
  'a product project’s own stage: +20 and a snack')

// ── The trophies: this quarter's projects where you did a stage ─────────────────────────────
const ali = await pet(U.ali)
check([ali.trophyCount, ali.trophies.map(t => t.track).sort()], [3, [OLD.track, A.track, 'MKT-CAR-2610-001'].sort()],
  'Ali: the old task, the price banner, and the product project through its deliverable — never the deliverable itself')
check((await pet(U.mei)).trophies.map(t => t.track).sort(), [A.track, 'MKT-CAR-2610-001'].sort(), 'Mei: the two she did a stage of')
await asSystem()
await q(`UPDATE public.mkt_projects SET done_at = date_trunc('quarter', now()) - interval '1 day' WHERE id = $1`, [OLD.id])
check((await pet(U.ali)).trophyCount, 2, 'a project finished last quarter is not this quarter’s')
// Six listed at most, the newest first — every one counted.
await asSystem()
for (let i = 2; i <= 8; i++) {
  await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, done_at) VALUES ($1, $2, 'quick', $3, $4, 'done', now() + make_interval(mins => $5))`,
    [id(600 + i), `TSK-CAR-2610-${String(100 + i)}`, CAR, `Story ${i}`, i])
  await q(`INSERT INTO public.mkt_stages (project_id, idx, name, owner_staff, status) VALUES ($1, 0, 'Post', $2, 'done')`, [id(600 + i), S.ali])
}
const many = await pet(U.ali)
check([many.trophyCount, many.trophies.length, many.trophies[0].track], [9, 6, 'TSK-CAR-2610-108'], 'six listed, the newest first; all nine counted')

// ── Caring for the pet ────────────────────────────────────────────────────────────────
const care = async (user, what, actions = STAFF) => { await as(user, actions); return one(`SELECT public.mkt_pet_care($1)`, [what]) }
await as(U.mei, VIEW)
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /Changing your space is not open/, 'View alone: no care')
await as(U.lee, STAFF)
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /somebody on Marketing's roster/, 'off the roster: no pet')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /Set up your pet first/, 'a pet not set up')
await asSystem()
await q(`INSERT INTO public.mkt_spaces (user_id, pet) VALUES ($1, '{"species":"cat","name":"Kopi","color":"original","onboarded":true}'::jsonb),
         ($2, '{"species":"dog","name":"Bao","color":"cocoa","onboarded":true}'::jsonb)`, [U.mei, U.ali])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_pet_care('dance')`, [], /Feed it, or work it out/, 'only a feed or a workout')
check(await care(U.mei, 'feed').then(p => [p.energy, p.snacks]), [84, 5], 'a feed: a snack, +20 energy')
check(await care(U.mei, 'feed').then(p => [p.energy, p.snacks]), [100, 4], '…up to 100 (+16)')
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /Kopi is full/, 'full: refused, the snack kept')
const outs = []
for (let i = 0; i < 6; i++) outs.push(await care(U.mei, 'workout').then(p => [p.energy, p.xp, p.workouts]))
check(outs, [[85, 50, 1], [70, 60, 2], [55, 70, 3], [40, 70, 4], [25, 70, 5], [10, 70, 6]],
  'a workout: −15 energy; +10 XP the first three a day, none after')
await refuses(`SELECT public.mkt_pet_care('workout')`, [], /Kopi is too tired — feed it first/, 'too tired under 15')
const feeds = []
for (let i = 0; i < 4; i++) feeds.push(await care(U.mei, 'feed').then(p => [p.energy, p.snacks]))
check(feeds, [[30, 3], [50, 2], [70, 1], [90, 0]], 'fed back up, a snack a time')
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /No snacks left — finish a stage to earn more/, 'no snack left')
// The office's day turns: three more workouts earn XP again; a stage finished brings a snack.
await asSystem()
await q(`UPDATE public.mkt_pet_log SET day = day - 1 WHERE staff = $1 AND kind = 'workout'`, [S.mei])
await q(`INSERT INTO public.mkt_pet_log (staff, kind, xp, snacks, project_id, stage_idx) VALUES ($1, 'stage', 10, 1, $2, 9)`, [S.mei, A.id])
check(await care(U.mei, 'feed').then(p => [p.energy, p.snacks, p.workouts]), [100, 0, 0], 'a new day: a snack earned fed (+10 to 100), no workouts yet today')
check(await care(U.mei, 'workout').then(p => [p.energy, p.xp, p.workouts]), [85, 90, 1], '…and the first earns XP again')
// Bao: every care a line in the ledger, a refusal none.
await care(U.ali, 'feed')
await care(U.ali, 'feed')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_pet_care('feed')`, [], /Bao is full/, 'Bao: full')
check(await peek1(`SELECT count(*)::int FROM public.mkt_pet_log WHERE staff = $1 AND kind = 'feed'`, [S.ali]), 2, 'every care a line in the ledger; a refusal none')

console.log(`marketing pet levels: ${checks} checks passed`)
