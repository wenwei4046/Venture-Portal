// Local PostgreSQL regression for 20261025171000 (2026-10-25 — Marketing ④-3b: the formal log’s corrections, the user’s
// answer 19: "corrections annotate a record, never change the project; the manager’s"; `Audit Trail.dc.html`’s *correction of
// #n*). Marketing’s migrations up to the PIC’s calendar run; then this one, twice. What is under test: who may call what;
// a correction only the manager’s, only of the project’s own record, never a Free space line, its words 5–500; a record
// of its own — the record it corrects, that record’s stage, who — the record corrected and the project untouched; a
// correction corrected; the log’s order and its corrects. No live I/O.
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

  -- audit_register as recorded: which columns a change of alone is no record of, and which never reach one.
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
  '20261025151000_marketing_task_dates.sql', '20261025161000_marketing_pic_calendar.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025171000_marketing_log_corrections.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
check([await may('anon', 'mkt_log_correct(uuid, bigint, text)'), await may('authenticated', 'mkt_log_correct(uuid, bigint, text)')], [false, true],
  'a correction: signed in only')
check(await may('anon', 'mkt_project_log(uuid)'), false, 'the log: never the stranger’s')

// ── A task with a trail, and another ─────────────────────────────────────────────────────────────────────────
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const P = id(1001)
const Q = id(1002)
await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status) VALUES
           ($1, 'TSK-CAR-2610-001', 'quick', $3, 'Raya poster', 'active'), ($2, 'TSK-CAR-2610-002', 'quick', $3, 'Other task', 'active')`, [P, Q, CAR])
const ev = async (project, action, stage, stageName, reason = null, version = null, actor = 'Mei') =>
  Number(await one(`INSERT INTO public.mkt_events (project_id, actor_name, action, stage_idx, stage_name, reason, version)
                    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [project, actor, action, stage, stageName, reason, version]))
const E = {
  created: await ev(P, 'created', null, null),
  accepted: await ev(P, 'accepted', 0, 'Design'),
  submitted: await ev(P, 'submitted', 0, 'Design', null, 'v1'),
  free: await ev(P, 'free', null, null, 'a note on the Free space'),
  approved: await ev(P, 'approved', 0, 'Design', null, 'v1', 'Sia Josiah'),
  other: await ev(Q, 'accepted', 0, 'Design'),
}
const before = await peek(`SELECT status, updated_at::text AS at, title FROM public.mkt_projects WHERE id = $1`, [P])
const logOf = async () => {
  await as(U.mei, VIEW)
  return one(`SELECT public.mkt_project_log($1)`, [P])
}
const first = await logOf()
check(first.rows.map(r => [r.action, r.corrects]), [['created', null], ['accepted', null], ['submitted', null], ['approved', null]],
  'the log: every record but the Free space’s, each with what it corrects — nothing yet')

// ── Who corrects ───────────────────────────────────────────────────────────────────────────────────────────
const WORDS = 'Submitted on 21 Oct, not 20 Oct — the scan came late.'
for (const [who, acts] of [['the team', STAFF], ['a viewer', VIEW], ['nobody from Marketing', []]]) {
  await as(who === 'nobody from Marketing' ? U.ali : U.mei, acts)
  await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, E.submitted, WORDS], /managers correct/, `${who}: corrects nothing`)
}
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [id(999), E.submitted, WORDS], /not there/, 'no such project')
await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, E.other, WORDS], /not on this project/, 'another project’s record: refused')
await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, E.free, WORDS], /not on this project/, 'a Free space line: refused')
await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, 999999, WORDS], /not on this project/, 'no such record')
for (const bad of ['', '   ', 'typo', 'x'.repeat(501)]) {
  await refuses(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, E.submitted, bad], /5 to 500 characters/, `words like "${bad.slice(0, 8)}…" refused`)
}

// ── A correction: a record of its own; nothing else changes ─────────────────────────────────────────────────
const log = await one(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, E.submitted, `  ${WORDS}  `])
const corr = log.rows.at(-1)
const josiah = await peek1(`SELECT public.mkt_staff_name($1)`, [S.josiah])
check([corr.action, corr.reason, Number(corr.corrects), corr.stage, corr.stageName, corr.actor, corr.version ?? null],
  ['correction', WORDS, E.submitted, 0, 'Design', josiah, null], 'its words, the record it corrects, that record’s stage, who — answered with the log')
check(log.rows.slice(0, -1), first.rows, 'every record before it as it was — the one corrected too')
check(await peek(`SELECT status, updated_at::text AS at, title FROM public.mkt_projects WHERE id = $1`, [P]), before, 'the project untouched')
check(await peek1(`SELECT actor_user::text FROM public.mkt_events WHERE id = $1`, [Number(corr.id)]), U.josiah, 'kept under the manager’s login')
const again = await one(`SELECT public.mkt_log_correct($1, $2, $3)`, [P, Number(corr.id), 'The scan came on 22 Oct, not 21 Oct.'])
check([again.rows.at(-1).action, Number(again.rows.at(-1).corrects), again.rows.length], ['correction', Number(corr.id), 6], 'a correction corrected the same way')
check((await logOf()).rows.map(r => r.action), ['created', 'accepted', 'submitted', 'approved', 'correction', 'correction'], 'the log, oldest first — still never the Free space')
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_log_correct($1, $2, $3)`, [Q, E.other, 'Accepted by Ali, not Mei.'])).rows.length, 2, 'another task’s log alone')

console.log(`marketing log corrections: ${checks} checks passed`)
