// Local PostgreSQL regression for 20261026001000 (2026-10-25 — Marketing ⑤-3c: an Ads report's Report days on the
// calendars, and its last report; the user, asked: "can do"). Marketing's migrations up to the PIC's Ads reports run;
// then this one, twice. What is under test: who may call what (as before); its last report — set, moved, taken off, only
// what was sent, refused when it is not one, never under a report out; none published after it; the board — each Ads
// report's schedule, a task done kept on it while its report runs on (or its last Report day was within 60 days), never a
// cancelled one.
// No live I/O.
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
  '20261025181000_marketing_product_pause.sql', '20261025191000_marketing_option_lists.sql', '20261025201000_marketing_opened_from.sql']
for (const m of MIGS) await db.exec(await sql(m))
await db.exec(await sql('20261025211000_marketing_new_drafts.sql'))
await db.exec(await sql('20261025221000_marketing_task_minutes.sql'))
await db.exec(await sql('20261025231000_marketing_task_pic.sql'))
await db.exec(await sql('20261025235000_marketing_task_pic_stage.sql'))
await db.exec(await sql('20261025235500_marketing_key_dates.sql'))
// The CRM's tables, as far as what is under test reads them.
await db.exec(`
  ALTER TABLE public.crm_contacts ADD COLUMN ad_source_id text, ADD COLUMN status text, ADD COLUMN won_amount numeric,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  CREATE TABLE public.crm_appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL, state text NOT NULL);
  CREATE TABLE public.crm_ad_names (ad_source_id text PRIMARY KEY, name text, page_name text, meta_status text, hidden_at timestamptz);
`)
await db.exec(await sql('20261025235800_marketing_ads_reports.sql'))
await db.exec(await sql('20261025235900_marketing_pic_ads.sql'))
const mig = await sql('20261026001000_marketing_ads_report_days.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
// The server keeps UTC, as production's does: an office day is not the server's.
await db.exec("SET TIME ZONE 'UTC'")

// ── Who may call what: as before ─────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_ads_page(uuid)', 'mkt_ads_save(uuid, jsonb)', 'mkt_ads_publish(uuid, integer, jsonb, text)', 'mkt_board(date, date)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only — its cell asked inside`)
check([await may('anon', 'mkt_ads_view(uuid)'), await may('authenticated', 'mkt_ads_view(uuid)')], [false, false], 'mkt_ads_view: the functions’ own')
check(await peek1(`SELECT has_column_privilege('authenticated', 'public.mkt_ads', 'last_no', 'SELECT')`), false, 'its last report: no client reads it')

// ── The projects ───────────────────────────────────────────────────────────────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const day = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const proj = (track, title) => one(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, q_type)
  VALUES ($1, 'quick', $2, $3, 'ads') RETURNING id`, [track, CAR, title])
const Q = await proj('TSK-CAR-2610-901', 'Raya ads')
const OLD = await proj('TSK-CAR-2610-902', 'Merdeka ads')
const CAN = await proj('TSK-CAR-2610-903', 'Cancelled ads')
const SAVE = `SELECT public.mkt_ads_save($1, $2::jsonb)`
const save = (pid, patch) => one(SAVE, [pid, JSON.stringify(patch)])
const PUB = `SELECT public.mkt_ads_publish($1, $2, $3::jsonb, $4)`
const publish = (pid, no, values) => one(PUB, [pid, no, JSON.stringify(values), null])
const BOARD = `SELECT public.mkt_board()`
const trail = pid => peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [pid])
const aged = (pid, status) => q(`UPDATE public.mkt_projects SET status = coalesce($2, status), updated_at = now() - interval '90 days' WHERE id = $1`, [pid, status ?? null])

// ── Its last report: set with the setup, taken off, moved ───────────────────────────────────────────────────
await as(U.mei, STAFF)
const set = await save(Q, { every: '2w', startsOn: await day(-28), figures: ['spend', 'leads'], lastNo: 3 })
check([set.setup.every, set.setup.startsOn, set.setup.lastNo], ['2w', await day(-28), 3], 'set up with its last report')
check(await peek1(`SELECT last_no FROM public.mkt_ads WHERE project_id = $1`, [Q]), 3, 'kept')
for (const [v, what] of [[0, 'none before the first'], [1001, 'past a thousand'], [2.5, 'not whole'], ['3', 'in words'], [true, 'not a number'], [[3], 'a list']])
  await refuses(SAVE, [Q, JSON.stringify({ lastNo: v })], /Pick its last report from the list/, `refused: ${what}`)
check((await save(Q, { lastNo: null })).setup.lastNo, null, 'taken off: it reports on')
check((await save(Q, { lastNo: 2 })).setup.lastNo, 2, 'moved')
check((await save(Q, { figures: ['spend', 'leads', 'cpl'] })).setup.lastNo, 2, 'only what was sent: its last report stays')
check((await trail(Q)).map(e => [e.action, e.data]), [
  ['ads set up', { every: '2w', startsOn: await day(-28), ads: 0 }],
  ['ads changed', { what: ['lastNo'] }], ['ads changed', { what: ['lastNo'] }], ['ads changed', { what: ['figures'] }],
], 'on the trail: set up, its last report changed twice, its figures')

// ── Published to its last; none after it; its last never under a report out ─────────────────────────────────
await publish(Q, 1, { spend: 100, leads: 5 })
await publish(Q, 2, { spend: 200.5, leads: 9 })
await refuses(PUB, [Q, 3, '{}', null], /Its last report is #2 — there is no report #3/, 'none after its last')
await refuses(SAVE, [Q, JSON.stringify({ lastNo: 1 })], /Report #2 is out — its last report is #2 or later/, 'its last never before a report out')
check((await save(Q, { lastNo: 4 })).setup.lastNo, 4, 'moved on past the reports out')
await refuses(PUB, [Q, 3, '{"spend": 1}', null], /published once its last day is over/, 'the next one: once over, as before')
await refuses(PUB, [Q, 5, '{"spend": 1}', null], /Its last report is #4 — there is no report #5/, 'none after the new last')
check((await save(Q, { lastNo: null })).setup.lastNo, null, 'taken off again')
await asSystem()
await refuses(`UPDATE public.mkt_ads SET last_no = 0 WHERE project_id = $1`, [Q], /violates check constraint/, 'the table: 1 to 1000')
await refuses(`UPDATE public.mkt_ads SET last_no = 1001 WHERE project_id = $1`, [Q], /violates check constraint/, 'the table: 1 to 1000, again')

// ── The board: each Ads report's schedule; a task done stays on it while its report runs on ──────────────────
await as(U.ali, VIEW)
const board = () => one(BOARD)
const plan = async pid => ((await board()).ads ?? []).find(a => a.project === pid) ?? null
const onBoard = async pid => ((await board()).projects ?? []).some(p => p.id === pid)
check(await plan(Q), { project: Q, every: '2w', startsOn: await day(-28), lastNo: null, published: [1, 2] }, 'its schedule on the board: the reports out by number')
await asSystem()
await aged(Q, 'done')
await as(U.ali, VIEW)
check(await onBoard(Q), true, 'done 90 days ago — its report runs on: still on the board')
await as(U.mei, STAFF)
await save(Q, { lastNo: 2 })
await asSystem()
await aged(Q)
await as(U.ali, VIEW)
check([await onBoard(Q), (await plan(Q))?.lastNo], [true, 2], 'its last Report day today (#2 ended yesterday): still on, its last report with it')

await as(U.mei, STAFF)
await save(OLD, { every: '2w', startsOn: await day(-200), figures: ['spend'], lastNo: 1 })
await as(U.ali, VIEW)
check(await onBoard(OLD), true, 'open: on the board, as any')
await asSystem()
await aged(OLD, 'done')
await as(U.ali, VIEW)
check([await onBoard(OLD), await plan(OLD)], [false, null], 'done 90 days ago, its last Report day 186 days ago: off the board, its schedule with it')
for (const [last, on, what] of [[10, true, 'its last Report day 60 days ago: back on'], [9, false, 'its last Report day 74 days ago: off again'],
  [null, true, 'it reports on: on']]) {
  await as(U.mei, STAFF)
  await save(OLD, { lastNo: last })
  await asSystem()
  await aged(OLD)
  await as(U.ali, VIEW)
  check(await onBoard(OLD), on, what)
}
check(await plan(OLD), { project: OLD, every: '2w', startsOn: await day(-200), lastNo: null, published: [] }, 'its own reports only: none out')

await as(U.mei, STAFF)
await save(CAN, { every: '1w', startsOn: await day(-7), figures: ['spend'] })
await asSystem()
await aged(CAN, 'cancelled')
await as(U.ali, VIEW)
check(await onBoard(CAN), false, 'cancelled 90 days ago: off the board, though its report would run on')
check(((await board()).ads ?? []).map(a => a.project).sort(), [OLD, Q].sort(), 'the board’s schedules: its projects’ only')

// ── Read on the page as before, + its last report ───────────────────────────────────────────────────────────
check((await one(`SELECT public.mkt_ads_page($1)`, [Q])).setup.lastNo, 2, 'the page reads its last report')

console.log(`marketing ads report days: ${checks} checks passed`)
