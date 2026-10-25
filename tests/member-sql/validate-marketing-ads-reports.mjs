// Local PostgreSQL regression for 20261025235800 (2026-10-25 — Marketing: a project's Ads report, from the CRM; the user's
// answer 57 — each Ads project picks its own CRM ads, its cadence and figures set by the Ads person, who publishes it to
// the PIC's link; an ad not in the CRM keeps typed figures). Marketing's migrations up to key dates run; then this one,
// twice. What is under test: who may call what; the tables no client reaches; which projects carry one; the setup —
// what it takes and refuses, only what was sent changed, its cadence and first day kept once a report is out, each on
// the trail; the CRM's ads to pick; what the CRM counts for the picked ads over some days, as its Ads Performance does,
// counts only; a period published once over — the setup's figures only, numbers from 0 or none, the targets as they
// stood, replaced when published again.
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
const mig = await sql('20261025235800_marketing_ads_reports.sql')
await asSystem()
// As production makes them: a new function is the signed-in's and the service role's unless the migration says not.
await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
// The server keeps UTC, as production's does: an office day is not the server's.
await db.exec("SET TIME ZONE 'UTC'")

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_ads_page(uuid)', 'mkt_ads_choices()', 'mkt_ads_crm(uuid, date, date)', 'mkt_ads_save(uuid, jsonb)',
  'mkt_ads_publish(uuid, integer, jsonb, text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only — its cell asked inside`)
for (const fn of ['mkt_ads_project(uuid)', 'mkt_ads_period(text, date, integer)', 'mkt_ads_view(uuid)'])
  check([await may('anon', fn), await may('authenticated', fn), await may('service_role', fn)], [false, false, true], `${fn}: the functions’ own`)
for (const t of ['mkt_ads', 'mkt_ads_reports']) {
  check(await peek1(`SELECT has_table_privilege('authenticated', $1, 'SELECT') OR has_table_privilege('anon', $1, 'SELECT')
                         OR has_table_privilege('authenticated', $1, 'INSERT')`, [`public.${t}`]), false, `${t}: no client reaches it`)
  check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`, [`public.${t}`]), true, `${t}: row security on`)
}
check(await peek(`SELECT t, mode FROM public.audit_registered WHERE t LIKE 'mkt_ads%' ORDER BY t`),
  [{ t: 'mkt_ads', mode: 'none' }, { t: 'mkt_ads_reports', mode: 'none' }], 'their record: the project’s trail')

// ── The projects ───────────────────────────────────────────────────────────────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const day = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const proj = (track, kind, title, more = {}) => one(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, series_id, parent_id, link_code, run_no, q_type)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [track, kind, CAR, title, more.series ?? null, more.parent ?? null, more.link ?? null,
  more.series ? 1 : null, more.type ?? null])
const Q = await proj('TSK-CAR-2610-901', 'quick', 'Raya ads', { type: 'ads' })
const SOC = await proj('TSK-CAR-2610-904', 'quick', 'Raya reels', { type: 'social' })
const PRD = await proj('MKT-CAR-2610-902', 'product', 'Carres · Media buying', { link: 'a'.repeat(32) })
const SER = await proj('RCR-CAR-2610-903', 'recurring', 'Monthly ads', { type: 'ads' })
const RUN = await proj('RCR-CAR-2610-903-R01', 'recurring', 'Monthly ads', { series: SER, type: 'ads' })
const DLV = await proj('MKT-CAR-2610-902-D01', 'deliverable', 'Ad set 1/1', { parent: PRD })
const PAGE = `SELECT public.mkt_ads_page($1)`
const SAVE = `SELECT public.mkt_ads_save($1, $2::jsonb)`
const save = (pid, patch) => one(SAVE, [pid, JSON.stringify(patch)])
const PUB = `SELECT public.mkt_ads_publish($1, $2, $3::jsonb, $4)`
const publish = (pid, no, values, note = null) => one(PUB, [pid, no, JSON.stringify(values), note])
const CRM = `SELECT public.mkt_ads_crm($1, $2::date, $3::date)`
const trail = pid => peek(`SELECT action, actor_name AS actor, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [pid])

// ── Read: Marketing · View; a product project, an Ads task or series — never a run, a deliverable, another type ─
await as(U.ali, [])
await refuses(PAGE, [Q], /Marketing is not open to your account/, 'nobody from Marketing: reads none')
await as(U.ali, VIEW)
check(await one(PAGE, [Q]), { today: TODAY, link: false, setup: null, reports: [] }, 'a quick task: none set up, no PIC link')
check((await one(PAGE, [PRD])).link, true, 'a product project with its PIC link')
check((await one(PAGE, [SER])).setup, null, 'a series carries one')
await refuses(PAGE, [RUN], /a product project's, or an Ads task's or series'/, 'a run: refused')
await refuses(PAGE, [DLV], /a product project's, or an Ads task's or series'/, 'a deliverable: refused')
await refuses(PAGE, [SOC], /a product project's, or an Ads task's or series'/, 'a task of another type: refused')
await refuses(PAGE, [id(997)], /That project is not there/, 'no such project')

// ── Set up: Marketing · Edit ───────────────────────────────────────────────────────────────────────────────
await refuses(SAVE, [Q, '{}'], /Ads reports are not open to your account/, 'a viewer sets none up')
await as(U.mei, STAFF)
await refuses(SAVE, [RUN, '{}'], /a product project's, or an Ads task's or series'/, 'a run: none set up')
const A1 = '120210000000000001', A2 = '120210000000000002', A3 = '120210000000000003'
const first = await save(Q, { ads: [A2, A1, A2] })
check(first.setup, { ads: [A1, A2], every: '2w', startsOn: TODAY, figures: ['spendToDate', 'cpl', 'appt', 'roas'], targets: {} },
  'set up — every two weeks from today on the handoff’s four; its ads once each')
check((await trail(Q)).map(e => [e.action, e.actor, e.data]), [['ads set up', 'Mei', { every: '2w', startsOn: TODAY, ads: 2 }]], 'on the trail')
for (const [patch, pattern, what] of [
  [{ ads: 'x' }, /Pick the ads from the list/, 'ads not a list'],
  [{ ads: ['12345', 'abc'] }, /Pick the ads from the list/, 'not an ad id'],
  [{ ads: Array.from({ length: 41 }, (_, i) => String(10000 + i)) }, /40 ads at most/, '41 ads'],
  [{ every: 'daily' }, /Pick how often/, 'a cadence it does not know'],
  [{ startsOn: 'soon' }, /first report's first day/, 'not a day'],
  [{ startsOn: '1999-01-01' }, /first report's first day/, 'too long ago'],
  [{ figures: [] }, /1 to 12 figures/, 'no figure'],
  [{ figures: ['cpl', 'nope'] }, /1 to 12 figures/, 'a figure it does not know'],
  [{ figures: ['spend', 'spendToDate', 'leads', 'cpl', 'appt', 'apptRate', 'cpa', 'showup', 'showRate', 'won', 'winRate', 'wonAmount', 'roas'] }, /1 to 12 figures/, '13 figures'],
  [{ targets: [] }, /Its targets are numbers/, 'targets not an object'],
  [{ targets: { cpl: '20' } }, /Its targets are numbers/, 'a target in words'],
  [{ targets: { cpl: -1 } }, /A target is a number from 0/, 'a negative target'],
  [{ targets: { apptRate: 101 } }, /at most 100%/, 'an appointment rate over 100'],
  [{ targets: { reach: 5 } }, /a budget, a cost per lead, a ROAS and an appointment rate/, 'a target it does not know'],
]) await refuses(SAVE, [Q, JSON.stringify(patch)], pattern, `refused: ${what}`)
await refuses(SAVE, [Q, '[]'], /Nothing to save/, 'refused: not an object')
const changed = await save(Q, { every: '1w', startsOn: await day(-30), figures: ['spendToDate', 'cpl', 'cpl', 'appt', 'roas'], targets: { budget: 6000, cpl: 20.004, roas: 3 } })
check(changed.setup, { ads: [A1, A2], every: '1w', startsOn: await day(-30), figures: ['spendToDate', 'cpl', 'appt', 'roas'],
  targets: { budget: 6000, cpl: 20, roas: 3 } }, 'changed — its figures once each, in order; its targets to the sen')
await as(U.josiah, MANAGER)
await save(Q, { targets: { apptRate: 25, budget: null } })
await as(U.mei, STAFF)
check((await save(Q, { figures: ['spendToDate', 'cpl', 'appt', 'apptRate', 'roas'] })).setup,
  { ads: [A1, A2], every: '1w', startsOn: await day(-30), figures: ['spendToDate', 'cpl', 'appt', 'apptRate', 'roas'], targets: { cpl: 20, roas: 3, apptRate: 25 } },
  'only what was sent: the other login’s targets stay, the budget it took off is gone')
check((await trail(Q)).slice(1).map(e => [e.action, e.data]), [
  ['ads changed', { what: ['every', 'startsOn', 'figures', 'targets'] }], ['ads changed', { what: ['targets'] }], ['ads changed', { what: ['figures'] }],
], 'each change on the trail, what it changed')

// ── The CRM's ads to pick: Marketing · Edit ───────────────────────────────────────────────────────────────────
await asSystem()
await q(`INSERT INTO public.crm_ad_names (ad_source_id, name, page_name, meta_status, hidden_at) VALUES
  ($1, 'Raya rental', 'The Conts', 'ACTIVE', NULL), ($2, 'Showroom walk-in', 'The Conts', 'PAUSED', NULL), ($3, 'Old promo', NULL, NULL, now())`, [A1, A2, A3])
const at = (n, hhmm) => peek1(`SELECT ((($1::date + $2::integer) + $3::time) AT TIME ZONE 'Asia/Kuala_Lumpur')::text`, [TODAY, n, hhmm])
const contact = async (cid, ad, n, hhmm, status = 'follow_up', amount = null) =>
  q(`INSERT INTO public.crm_contacts (id, ad_source_id, created_at, status, won_amount) VALUES ($1, $2, $3::timestamptz, $4, $5)`, [cid, ad, await at(n, hhmm), status, amount])
await contact(id(501), A1, -28, '10:00', 'won', 5000)
await contact(id(502), A1, -27, '10:00')
await contact(id(503), A2, -25, '10:00', 'won', 1000)
await contact(id(504), A3, -28, '10:00', 'won', 9000)
await contact(id(505), A1, -20, '10:00')
await contact(id(506), A2, -30, '00:30')
await contact(id(507), A2, -23, '00:10')
await contact(id(508), '5261000000099', -26, '10:00')
await q(`INSERT INTO public.crm_appointments (contact_id, state) VALUES ($1, 'attended'), ($1, 'booked'), ($2, 'booked'), ($2, 'cancelled'), ($3, 'cancelled'),
  ($4, 'attended'), ($5, 'no_show')`, [id(501), id(502), id(503), id(504), id(506)])
await as(U.ali, VIEW)
await refuses(`SELECT public.mkt_ads_choices()`, [], /Ads reports are not open to your account/, 'a viewer: no list of the CRM’s ads')
await as(U.mei, STAFF)
check((await one(`SELECT public.mkt_ads_choices()`)).map(c => [c.id, c.name, c.page, c.status, c.leads, c.hidden]), [
  [A1, 'Raya rental', 'The Conts', 'ACTIVE', 3, false],
  [A2, 'Showroom walk-in', 'The Conts', 'PAUSED', 3, false],
  ['5261000000099', null, null, null, 1, false],
  [A3, 'Old promo', null, null, 1, true],
], 'the CRM’s ads — Meta running first, then by leads; one only on a contact; hidden last')

// ── What the CRM counts: Marketing · Edit — counts only ────────────────────────────────────────────────────────
await as(U.ali, VIEW)
await refuses(CRM, [Q, await day(-30), await day(-24)], /Ads reports are not open to your account/, 'a viewer: no counts')
await as(U.mei, STAFF)
check(await one(CRM, [Q, await day(-30), await day(-24)]), { leads: 4, appt: 3, showup: 1, won: 2, wonAmount: 6000, perAd: { [A1]: 2, [A2]: 2 } },
  'report #1’s days, by the office’s day: leads, appointments (a lead with a visit not cancelled, once however many), showed up, won and its amount — the ads not picked left out')
check((await one(CRM, [Q, await day(-23), await day(-17)])).leads, 2, '…a lead at 00:10 on the next one’s first day is the next one’s')
await refuses(CRM, [Q, await day(-17), await day(-23)], /at most a year/, 'its days backwards')
await refuses(CRM, [Q, await day(-500), await day(-1)], /at most a year/, 'more than a year')
await refuses(CRM, [SER, await day(-30), await day(-24)], /Set up its Ads report first/, 'a project with no Ads report')

// ── Published: a period that is over ───────────────────────────────────────────────────────────────────────────
await as(U.ali, VIEW)
await refuses(PUB, [Q, 1, '{}', null], /Ads reports are not open to your account/, 'a viewer publishes none')
await as(U.mei, STAFF)
await refuses(PUB, [SER, 1, '{"cpl": 1}', null], /Set up its Ads report first/, 'none set up: nothing to publish')
await refuses(PUB, [Q, 5, '{"cpl": 1}', null], /published once its last day is over/, 'the period running: not yet')
await save(SER, { every: '2w', startsOn: await day(-13), figures: ['cpl'] })
await refuses(PUB, [SER, 1, '{"cpl": 1}', null], /published once its last day is over/, 'a period whose last day is today: not yet')
await refuses(PUB, [Q, 0, '{"cpl": 1}', null], /not one of its periods/, 'no period 0')
await refuses(PUB, [Q, 1, '{"leads": 4}', null], /leads is not one/, 'a figure its setup did not pick')
await refuses(PUB, [Q, 1, '{"cpl": -1}', null], /a number from 0/, 'a negative value')
await refuses(PUB, [Q, 1, '{"cpl": "18"}', null], /a number from 0/, 'a value in words')
await refuses(PUB, [Q, 1, '[]', null], /Nothing to publish/, 'not an object')
await refuses(PUB, [Q, 1, '{"cpl": 1}', 'x'.repeat(501)], /500 characters/, 'a note too long')
const pub = await publish(Q, 1, { spendToDate: 1410, cpl: 22.1, appt: 3, roas: 4.2553191, apptRate: null }, '  First fortnight  ')
check(pub.reports.map(r => ({ ...r, at: !!r.at })), [{ no: 1, from: await day(-30), until: await day(-24),
  values: { spendToDate: 1410, cpl: 22.1, appt: 3, roas: 4.2553, apptRate: null }, targets: { cpl: 20, roas: 3, apptRate: 25 },
  note: 'First fortnight', by: 'Mei', at: true, updatedAt: null }], 'published — its days the cadence’s, the targets as they stood, the note trimmed')
await refuses(SAVE, [Q, '{"every": "2w"}'], /how often it reports stays/, 'a report out: how often stays')
await refuses(SAVE, [Q, JSON.stringify({ startsOn: await day(-29) })], /its first day stays/, '…and its first day')
check((await save(Q, { every: '1w', startsOn: await day(-30), targets: { cpl: 18 } })).setup.targets.cpl, 18, 'the same cadence and day sent again, its target changed: taken')
check((await one(PAGE, [Q])).reports[0].targets.cpl, 20, '…the report keeps the targets it was published with')
const firstAt = await peek1(`SELECT published_at::text FROM public.mkt_ads_reports WHERE project_id = $1 AND no = 1`, [Q])
await as(U.josiah, MANAGER)
const again = await publish(Q, 1, { spendToDate: 1450, cpl: 21 }, null)
check([again.reports.length, again.reports[0].values, again.reports[0].note, again.reports[0].by, !!again.reports[0].updatedAt, again.reports[0].targets.cpl],
  [1, { spendToDate: 1450, cpl: 21 }, null, 'SIA', true, 18], 'published again: replaced, by whoever did, with today’s targets')
check(await peek1(`SELECT published_at::text FROM public.mkt_ads_reports WHERE project_id = $1 AND no = 1`, [Q]), firstAt, '…its first publishing kept')
check((await trail(Q)).filter(e => e.action.startsWith('ads report')).map(e => [e.action, e.data.no]), [['ads report', 1], ['ads report again', 1]], 'each on the trail')
check((await publish(Q, 4, { cpl: null }, null)).reports.map(r => r.no), [4, 1], 'another period over: published beside it, the newest first')
check((await one(PAGE, [PRD])).reports, [], 'another project’s reports are its own')

console.log(`marketing ads reports: ${checks} checks passed`)
