// Local PostgreSQL regression for 20261025191000 (2026-10-25 — Marketing ③d-2: a choice's options from a shared list; the
// user's answer 9: "a shared option list (Locations) as a dropdown — the person filling it in adds a missing option on the
// spot"). Marketing's migrations up to the product pause run; then this one, twice. What is under test: who may call
// what; the lists nobody's table; Locations' six; read by Marketing · View; an option added by Marketing · Edit — tidied,
// once, its spelling kept, 1–40, 200 at most, a list that is not there; taken off by the manager alone; a field naming a
// list — no options of its own needed, its own kept, a bad name refused, never a text field's — saved and published
// through the Workflow Builder; a Multi-select's answer its picks — tidied, each once, none is no answer, one word still
// answers, never a Select's or a text's list, 40 a pick, 30 picks, the stage's owner alone. No live I/O.
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
const U = { josiah: id(1), mei: id(2), ali: id(3) }
const S = { josiah: id(11), mei: id(12), ali: id(13) }

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
  GRANT SELECT ON public.payment_vouchers, public.payment_attachments, public.crm_contacts, public.member_requests,
    public.member_request_attachments TO authenticated, anon;

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text, ignore text[], omit text[]);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason, p_ignore, p_omit)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason,
        ignore = excluded.ignore, omit = excluded.omit
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

  INSERT INTO public.users (id, name, email) VALUES ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
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
  '20261025039500_marketing_chat_review.sql', '20261025101000_marketing_subtasks.sql', '20261025113000_marketing_stage_files.sql',
  '20261025121000_marketing_billing.sql', '20261025131000_marketing_product_runs.sql', '20261025141000_marketing_campaigns.sql',
  '20261025151000_marketing_task_dates.sql', '20261025161000_marketing_pic_calendar.sql', '20261025171000_marketing_log_corrections.sql',
  '20261025181000_marketing_product_pause.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025191000_marketing_option_lists.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks — the six kept, never doubled

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_option_lists()', 'mkt_option_add(text, text)', 'mkt_option_remove(text, text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
check(await peek1(`SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_name = 'mkt_option_lists' AND grantee IN ('anon', 'authenticated')`), 0,
  'the lists are nobody’s table to read or write')
check((await peek(`SELECT t, mode FROM public.audit_registered WHERE t = 'mkt_option_lists'`)), [{ t: 'mkt_option_lists', mode: 'all' }], 'on the audit trail')

// ── The lists: Locations, the handoff's six ───────────────────────────────────────────────────────────────
const SIX = ['Showroom', 'Marketing Room', 'On the road', 'LRT', 'Highway', 'Truck Wrapping (Seri Kembangan)']
check(await peek1(`SELECT opts FROM public.mkt_option_lists WHERE name = 'Locations'`), SIX, 'Locations: the handoff’s six, once')
await as(U.ali, VIEW)
check(await one(`SELECT public.mkt_option_lists()`), { Locations: SIX }, 'Marketing · View reads every list by its name')
await as(id(99), [])
await refuses(`SELECT public.mkt_option_lists()`, [], /not open/, 'nobody outside Marketing reads them')
await refuses(`INSERT INTO public.mkt_option_lists (name, opts) VALUES ('lower case', '[]')`, [], /permission denied/, '…nor writes the table')

// ── Added on the spot — whoever fills a choice in ─────────────────────────────────────────────────────────
await as(U.ali, VIEW)
await refuses(`SELECT public.mkt_option_add('Locations', 'Studio A')`, [], /not open/, 'Marketing · View adds nothing')
await as(U.mei, STAFF)
const added = await one(`SELECT public.mkt_option_add('Locations', '  Studio   A ')`)
check(added, { list: 'Locations', opts: [...SIX, 'Studio A'], option: 'Studio A' }, 'Marketing · Edit adds one — its spaces tidied, at the end')
check(await peek1(`SELECT updated_by FROM public.mkt_option_lists WHERE name = 'Locations'`), U.mei, '…who added it kept')
check(await one(`SELECT public.mkt_option_add('Locations', 'studio a')`), { list: 'Locations', opts: [...SIX, 'Studio A'], option: 'Studio A' },
  'there already in other letters: its own spelling answered, nothing added')
for (const [bad, what] of [['', 'nothing'], ['   ', 'spaces'], ['x'.repeat(41), '41 characters']])
  await refuses(`SELECT public.mkt_option_add('Locations', $1)`, [bad], /1 to 40 characters/, `an option of ${what} refused`)
await refuses(`SELECT public.mkt_option_add('Places', 'Studio B')`, [], /not there/, 'a list that is not there')
await asSystem()
await q(`UPDATE public.mkt_option_lists SET opts = (SELECT jsonb_agg('Spot ' || g) FROM generate_series(1, 200) g) WHERE name = 'Locations'`)
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_option_add('Locations', 'One more')`, [], /200 options at most/, 'two hundred at most')
check((await one(`SELECT public.mkt_option_add('Locations', 'spot 7')`)).option, 'Spot 7', '…one there already is still answered')
await asSystem()
await q(`UPDATE public.mkt_option_lists SET opts = $1::jsonb WHERE name = 'Locations'`, [JSON.stringify([...SIX, 'Studio A'])])

// ── Taken off — the manager's ────────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_option_remove('Locations', 'LRT')`, [], /manager/, 'Marketing · Edit takes none off')
await as(U.josiah, MANAGER)
check(await one(`SELECT public.mkt_option_remove('Locations', 'LRT')`), { list: 'Locations', opts: ['Showroom', 'Marketing Room', 'On the road', 'Highway', 'Truck Wrapping (Seri Kembangan)', 'Studio A'] },
  'the manager takes one off — the rest in their order')
await refuses(`SELECT public.mkt_option_remove('Locations', 'LRT')`, [], /not on the list/, 'one not on the list')
await refuses(`SELECT public.mkt_option_remove('Places', 'LRT')`, [], /not there/, 'a list that is not there')
await one(`SELECT public.mkt_option_add('Locations', 'LRT')`)

// ── A field names a list: its options are the list's ─────────────────────────────────────────────────────────
await asSystem()
const extras = (f, type, publish = true) => one(`SELECT public.mkt_field_extras($1::jsonb, $2, 'Location', $3, 'Stage 1', true)`, [JSON.stringify(f), type, publish])
check(await extras({ list: 'Locations' }, 'Multi-select'), { req: true, pic: true, list: 'Locations', opts: [] }, 'a Multi-select naming Locations: published with no options of its own')
check(await extras({ list: 'Locations' }, 'Select'), { req: true, pic: true, list: 'Locations', opts: [] }, '…a Select too')
check(await extras({ list: ' Locations ', opts: ['Own one'] }, 'Select'), { req: true, pic: true, list: 'Locations', opts: ['Own one'] },
  'a Select naming it keeps its own options too (switched back, they are there)')
check(await extras({ list: '' }, 'Select', false), { req: true, pic: true, opts: [] }, 'an empty name names none — a draft may wait for options')
await refuses(`SELECT public.mkt_field_extras($1::jsonb, 'Select', 'Location', true, 'Stage 1', true)`, [JSON.stringify({ list: '' })], /give the choice its options/,
  'naming none, a version’s choice still needs options')
for (const bad of ['locations', 'Loc!', 'L'])
  await refuses(`SELECT public.mkt_field_extras($1::jsonb, 'Multi-select', 'Location', false, 'Stage 1', true)`, [JSON.stringify({ list: bad })], /not a list of options/,
    `a list named "${bad}" refused`)
check(await extras({ list: 'Locations' }, 'Text'), { req: true, pic: true }, 'a text field names no list')

// …through the Workflow Builder: saved and published, carried into the version.
await as(U.josiah, MANAGER)
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Shoot', tname: 'Standard', stages: [
  { name: 'Script', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 2, appr: [], form: [
    { label: 'Location', type: 'Multi-select', list: 'Locations' }, { label: 'Mood', type: 'Select', opts: ['Bright', 'Calm'] }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
check((await peek1(`SELECT stages FROM public.mkt_workflow_versions WHERE workflow_id = $1`, [wf.id]))[0].form.map(f => [f.label, f.list ?? null, f.opts]),
  [['Location', 'Locations', []], ['Mood', null, ['Bright', 'Calm']]], 'published: the version’s field names its list')

// ── A Multi-select's answer is its picks ──────────────────────────────────────────────────────────────────────
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const P = id(1001)
await asSystem()
await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, cur) VALUES ($1, 'TSK-CAR-2610-001', 'quick', $2, 'Raya shoot', 'active', 0)`, [P, CAR])
await q(`INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, status, spec) VALUES ($1, 0, 'Script', 'VIDEOGRAPHER', 'assign', $2, 'accepted', $3::jsonb)`,
  [P, S.mei, JSON.stringify({ form: [
    { label: 'Location', type: 'Multi-select', list: 'Locations', req: true }, { label: 'Mood', type: 'Select', opts: ['Bright', 'Calm'], req: true },
    { label: 'Brief', type: 'Text', req: false }] })])
const vals = () => peek1(`SELECT work -> 'vals' FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [P])
const save = work => one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [P, JSON.stringify(work)])
await as(U.mei, STAFF)
check((await save({ vals: { Location: ['LRT', ' Showroom ', 'lrt', '', 7], Mood: 'Calm' } })).missing, [], 'picked: nothing missing')
check(await vals(), { Location: ['LRT', 'Showroom'], Mood: 'Calm' }, 'its picks kept — tidied, each once, words only; a Select one word')
check((await save({ vals: { Location: [] } })).missing, ['Location'], 'none picked: no answer — missing again')
check(await vals(), { Mood: 'Calm' }, '…taken off the work')
await save({ vals: { Location: 'Showroom' } })
check((await vals()).Location, 'Showroom', 'one word still answers a Multi-select (an answer typed before ③d-2)')
await save({ vals: { Mood: ['Bright'], Brief: ['a', 'b'] } })
check(await vals(), { Location: 'Showroom', Mood: 'Calm' }, 'a list for a Select or a text field is no answer: nothing changed')
await refuses(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [P, JSON.stringify({ vals: { Location: ['x'.repeat(41)] } })], /a pick of at most 40/, 'a pick of 41 characters')
await refuses(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [P, JSON.stringify({ vals: { Location: Array.from({ length: 31 }, (_, i) => `Spot ${i}`) } })],
  /at most 30 picks/, 'thirty-one picks')
check(await vals(), { Location: 'Showroom', Mood: 'Calm' }, '…nothing changed by a refusal')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [P, JSON.stringify({ vals: { Location: ['LRT'] } })], /not yours/, 'only the stage’s owner answers it')

console.log(`marketing option lists: ${checks} checks passed`)
