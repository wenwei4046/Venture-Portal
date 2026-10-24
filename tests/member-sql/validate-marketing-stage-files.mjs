// Local PostgreSQL regression for 20261025113000 (2026-10-24 — Marketing ②b-2e: a stage's own files uploaded — a File
// field's or the stage's own Files — and the PIC opening the ones they see from their link). Marketing's migrations up to
// the subtasks run; then this one, twice. What is under test: the bucket's stage/ (sent by Edit; read by the PIC only
// with their link's code for a file their page shows); a stage's files saved with its work — only its owner's, only
// one's own arrived upload, never another stage's, only its own File fields, twenty at most, kept or taken off (its
// bytes' row with it), filed while named; what a stage still needs; what the PIC's page lists and opens. No live I/O.
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
  CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role text);
  CREATE TABLE public.permission_template_grants(template_id uuid NOT NULL, function_key text NOT NULL, action text NOT NULL);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true, template_id uuid);
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
  '20261025037000_marketing_pet_levels.sql', '20261025038000_marketing_lobby_visit.sql', '20261025039000_marketing_chat.sql',
  '20261025039500_marketing_chat_review.sql']
for (const m of MIGS) await db.exec(await sql(m))

MIGS.push('20261025101000_marketing_subtasks.sql')
for (const m of MIGS.slice(-1)) await db.exec(await sql(m))

const mig = await sql('20261025113000_marketing_stage_files.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks


// ── Who may call what ─────────────────────────────────────────────────────────────
for (const [fn, anon, signedIn] of [['mkt_pic_file(text, uuid)', true, true], ['mkt_pic_may_read(text)', true, false],
  ['mkt_pic_stage_file(text, text)', false, false]]) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [anon, signedIn], `${fn}: who calls it`)
}
check(await peek(`SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE tablename = 'file_objects' AND policyname IN ('mkt_stage_upload', 'mkt_pic_stage_files_read') ORDER BY 1`),
  [{ policyname: 'mkt_pic_stage_files_read', cmd: 'SELECT', roles: '{anon}' }, { policyname: 'mkt_stage_upload', cmd: 'INSERT', roles: '{authenticated}' }],
  'the bucket: stage/ sent by a sign-in, read by the stranger only through the policy that asks the code')

// ── A product project of two image posts, approved; its deliverables planned for today, Ali designing ──────────
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }],
    form: [{ label: 'Final image', type: 'File' }, { label: 'Raw export', type: 'File', pic: false, req: false },
      { label: 'Internal cost', type: 'Text', pic: false, req: false }] },
  { name: 'Caption', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, appr: [{ kind: 'person', staff: S.josiah }], form: [{ label: 'Caption', type: 'Text' }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: minutes.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: 250, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
const CODE = 'a'.repeat(32)
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [P, CODE])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
const [D1, D2] = (await peek(`SELECT id FROM public.mkt_projects WHERE parent_id = $1 ORDER BY track_id`, [P])).map(r => r.id)
const plan = JSON.stringify({ start: TODAY, stages: [{ owner: S.ali, appr: [{ kind: 'pic' }], sla: 2 }, { owner: S.mei, appr: [{ kind: 'person', staff: S.josiah }], sla: 1 }] })
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D1, plan])
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D2, plan])

// ── Files sent to the bucket under stage/ ───────────────────────────────────────────────────────
const key = n => id(7000 + n)
const at = (n, name) => `stage/${key(n)}/${name}`
const put = (name, size = 4096, type = 'image/png') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])
const rowsOf = name => peek1(`SELECT count(*)::int FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [name])
const takeBack = name => q(`DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1 RETURNING name`, [name]).then(r => r.length)
const FINAL = at(1, 'final.png'), RAW = at(2, 'raw.psd'), OWN = at(3, 'moodboard.pdf'), STRAY = at(4, 'stray.png'), MEIS = at(5, 'mei.png')
const LIBF = `library/${key(6)}/x.png`, NEVER = at(7, 'never.png')
await as(U.ali, VIEW)
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('marketing', $1, '{"size":1,"mimetype":"image/png"}')`, [at(9, 'v.png')],
  /row-level security/, 'Marketing · View sends nothing under stage/')
await as(U.ali, STAFF)
await put(FINAL, 2_000_000)
await put(RAW, 9_000_000, 'image/vnd.adobe.photoshop')
await put(OWN, 50_000, 'application/pdf')
await put(STRAY)
await put(LIBF)
for (let i = 0; i < 21; i++) await put(at(100 + i, `p${i}.png`))
await as(U.mei, STAFF)
await put(MEIS)

// ── Saved with the stage's work: only its owner, working it ───────────────────────────────────────
const save = (user, project, work, actions = STAFF) => as(user, actions).then(() => one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [project, JSON.stringify(work)]))
const saveRefused = async (user, project, work, pattern, what, actions = STAFF) => {
  await as(user, actions)
  await refuses(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [project, JSON.stringify(work)], pattern, what)
}
const files = async project => (await peek(`SELECT work -> 'files' AS f FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [project]))[0].f
await saveRefused(U.ali, D1, { files: [] }, /Accept the stage first/, 'not before the stage is accepted')
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D1])
check((await save(U.ali, D1, {})).missing, ['Final image'], 'nothing yet: its File field asked for')
await saveRefused(U.mei, D1, { files: [{ path: FINAL, field: 'Final image' }] }, /This stage is not yours/, 'only its owner saves its files')
await saveRefused(U.ali, D1, { files: [{ path: FINAL, field: 'Final image' }] }, /Working on a stage is not open/, 'Marketing · Edit to work it', VIEW)
for (const [path, what] of [[MEIS, 'another person’s upload'], [LIBF, 'one’s own file outside stage/'], [NEVER, 'a file never sent']]) {
  await saveRefused(U.ali, D1, { files: [{ path, field: 'Final image' }] }, /That file has not arrived — upload it again/, `never ${what}`)
}
for (const field of ['Caption', 'Internal cost']) {
  await saveRefused(U.ali, D1, { files: [{ path: FINAL, field }] }, /That file is for a field this stage does not have/, `only its own File fields — never ${field}`)
}
await saveRefused(U.ali, D1, { files: Array.from({ length: 21 }, (_, i) => ({ path: at(100 + i, `p${i}.png`) })) }, /At most 20 files/, 'twenty at most')
const done = await save(U.ali, D1, { files: [{ path: FINAL, name: '  RedTruck   final.png ', field: 'Final image' }, { path: RAW, name: 'raw.psd', field: 'Raw export' },
  { path: FINAL, field: 'Final image' }, { path: OWN, name: 'Moodboard.pdf' }, { path: ' ' }] })
check(done.missing, [], 'the File field filled by a file of its own')
let f = await files(D1)
check(f.map(x => [x.path, x.name, x.size, x.mime, x.field, x.by]), [
  [FINAL, 'RedTruck final.png', 2000000, 'image/png', 'Final image', 'Ali'],
  [RAW, 'raw.psd', 9000000, 'image/vnd.adobe.photoshop', 'Raw export', 'Ali'],
  [OWN, 'Moodboard.pdf', 50000, 'application/pdf', null, 'Ali'],
], 'its files: each once, named, its size and type the bucket’s, its field (the stage’s own Files: none), who sent it')
check(f.every(x => typeof x.at === 'string' && x.at.length > 0), true, '…and when')
await as(U.ali, STAFF)
check(await takeBack(FINAL), 0, 'a file the stage names is filed — its sender cannot take it back from under it')
check(await takeBack(STRAY), 1, 'one never filed is its sender’s to take back')

// ── Kept, renamed, taken off ─────────────────────────────────────────────────────────────────────
const before = f[0].at
await save(U.ali, D1, { files: [{ path: FINAL, name: 'final v2.png', field: 'Final image' }, { path: OWN, name: 'Moodboard.pdf' }] })
f = await files(D1)
check([f.map(x => [x.path, x.name]), f[0].at, f[0].by], [[[FINAL, 'final v2.png'], [OWN, 'Moodboard.pdf']], before, 'Ali'],
  'one already the stage’s keeps its record — renamed, its sender and time as they were')
check([await rowsOf(RAW), await rowsOf(FINAL)], [0, 1], 'one taken off loses its bytes’ row; the kept one stays')
check((await save(U.ali, D1, { notes: 'Two versions in the folder' })).missing, [], 'a save without files keeps them')
check((await files(D1)).length, 2, '…as they were')
await save(U.ali, D1, { files: [{ path: FINAL, name: 'final v2.png', field: 'Final image' }, { path: OWN, name: 'Moodboard.pdf' }],
  vals: { 'Internal cost': 'RM 120' } })

// ── Never another stage's ────────────────────────────────────────────────────────────────────────
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D2])
await saveRefused(U.ali, D2, { files: [{ path: FINAL, field: 'Final image' }] }, /That file is another stage's/, 'never a file another stage holds')

// ── What a stage of no fields needs: a note, a link or a file ──────────────────────────────────────
await as(U.mei, MANAGER)
const quick = await one(`SELECT public.mkt_task_create($1, 'quick', 'Banner', 'social', 'A banner', $2::jsonb, NULL)`,
  [CAR, JSON.stringify([{ name: 'Make it', dept: 'social', who: S.mei, sla: 2 }])])
await one(`SELECT public.mkt_stage_accept($1)`, [quick.id])
check((await save(U.mei, quick.id, {})).missing, ['a note, a file or a link'], 'a stage of no fields: a note, a file or a link')
await as(U.mei, STAFF)
await put(at(8, 'banner.png'))
check((await save(U.mei, quick.id, { files: [{ path: at(8, 'banner.png'), name: 'banner.png' }] })).missing, [], '…a file alone will do')
await saveRefused(U.mei, quick.id, { files: [{ path: at(8, 'banner.png'), field: 'Final image' }] }, /That file is for a field this stage does not have/,
  'a stage of no fields has no File field')

// ── The PIC: the stage now's files they see, opened with their link's code ────────────────────────
await as(U.ali, STAFF)
await put(at(10, 'raw2.psd'), 100, 'image/vnd.adobe.photoshop')
await save(U.ali, D1, { files: [{ path: FINAL, name: 'final v2.png', field: 'Final image' }, { path: OWN, name: 'Moodboard.pdf' },
  { path: at(10, 'raw2.psd'), name: 'raw2.psd', field: 'Raw export' }] })
await one(`SELECT public.mkt_stage_submit($1)`, [D1])
const asStranger = async (code) => {
  await as(null, [], 'anon')
  await q(`SELECT set_config('request.headers', $1, false)`, [code === undefined ? '' : JSON.stringify({ 'x-link-code': code })])
}
await asStranger()
const pageOf = async () => (await one(`SELECT public.mkt_pic_page($1)`, [CODE])).work.find(w => w.id === D1).stage
let st = await pageOf()
check(st.files, [
  { key: key(1), name: 'final v2.png', size: 2000000, mime: 'image/png', field: 'Final image' },
  { key: key(3), name: 'Moodboard.pdf', size: 50000, mime: 'application/pdf', field: null },
], 'the PIC’s page: the File field they see and the stage’s own Files — never the field marked internal; by key, never a path')
check(JSON.stringify(st).includes('stage/'), false, 'no path on the page')
const file = (code, k) => one(`SELECT public.mkt_pic_file($1, $2::uuid)`, [code, k])
check(await file(CODE, key(1)), { path: FINAL, name: 'final v2.png', mime: 'image/png' }, 'the route’s question: where the file is, for the code’s own')
check([await file(CODE, key(10)), await file('c'.repeat(32), key(1)), await file('nope', key(1)), await file(CODE, key(99))], [null, null, null, null],
  'nothing for the internal field’s file, another code, no code, a file not there')
const sees = name => q(`SELECT count(*)::int AS n FROM public.file_objects WHERE bucket_id = 'marketing' AND name = $1`, [name]).then(r => r[0].n)
await asStranger(CODE)
check([await sees(FINAL), await sees(OWN), await sees(at(10, 'raw2.psd'))], [1, 1, 0], 'the bucket, asked with the code: only what the page shows')
await asStranger('c'.repeat(32))
check(await sees(FINAL), 0, 'another code: nothing')
await asStranger()
check(await sees(FINAL), 0, 'no code: nothing')

await asSystem()
await q(`UPDATE public.mkt_stages SET spec = jsonb_set(spec, '{sec}', '{"pic": false}') WHERE project_id = $1 AND idx = 0`, [D1])
await asStranger(CODE)
check([(await pageOf()).files.map(x => x.key), await sees(FINAL), await sees(OWN)], [[key(3)], 0, 1],
  'a section hidden from the PIC hides its fields’ files — the stage’s own Files stay theirs to see')
await asSystem()
await q(`UPDATE public.mkt_stages SET spec = spec - 'sec' WHERE project_id = $1 AND idx = 0`, [D1])

await asStranger()
await one(`SELECT public.mkt_pic_stage_answer($1, $2, $3, 'approve', 'Kelvin Tan', NULL)`, [CODE, D1, 1])
await asStranger(CODE)
check([(await pageOf()).name, await file(CODE, key(1)), await sees(FINAL)], ['Caption', null, 0],
  'the stage handed on: its files no longer on the PIC’s page, nor theirs to open')
await as(U.ali, STAFF)
check(await takeBack(FINAL), 0, '…and still filed with the stage that did them')

console.log(`marketing stage files: ${checks} checks passed`)
