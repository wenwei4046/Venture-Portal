// Local PostgreSQL regression for 20261026002000 (2026-10-25 — Marketing ⑤-3d: a notice when an Ads report's period is
// due; the user, asked: "can do"). Marketing's migrations up to the Report days run; then this one, twice. What is under
// test: the sweep is the service role's alone; from 9:00 the office's time; once a period; the newest period over, to its
// last report; never one published, never a cancelled project's; whom — its owner (else whoever's stage it is at) and
// whoever published its latest report (else set it up), each once, only with a login; its days as the card writes them.
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
await db.exec(await sql('20261026001000_marketing_ads_report_days.sql'))
const mig = await sql('20261026002000_marketing_ads_due.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
// The server keeps UTC, as production's does: an office day is not the server's.
await db.exec("SET TIME ZONE 'UTC'")

// ── Who may call it: the service role alone ─────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
check([await may('anon', 'mkt_ads_due(timestamptz)'), await may('authenticated', 'mkt_ads_due(timestamptz)'), await may('service_role', 'mkt_ads_due(timestamptz)')],
  [false, false, true], 'mkt_ads_due: the sweep’s — the service role’s alone')
check(await peek1(`SELECT has_column_privilege('authenticated', 'public.mkt_ads', 'told_until', 'SELECT')`), false, 'told_until: no client reads it')

// ── The projects ───────────────────────────────────────────────────────────────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const day = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const NOLOGIN = await one(`INSERT INTO public.hr_staff_costs (employee_name, first_name, user_id, title_id, department_id, status)
  VALUES ('NOR AZIZAH', 'Nor', NULL, '${id(303)}', '${id(201)}', 'active') RETURNING id`)
let n = 0
const proj = async (title, owner = null, more = {}) => asSystem().then(() => one(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, q_type, owner_staff, cur)
  VALUES ($1, 'quick', $2, $3, 'ads', $4, $5) RETURNING id`, [`TSK-CAR-2610-${String(900 + ++n)}`, CAR, title, owner, more.cur ?? 0]))
const SAVE = `SELECT public.mkt_ads_save($1, $2::jsonb)`
const save = (pid, patch) => one(SAVE, [pid, JSON.stringify(patch)])
const publish = (pid, no) => one(`SELECT public.mkt_ads_publish($1, $2, '{"spend": 100}'::jsonb, NULL)`, [pid, no])
// The sweep at a time on the office's clock: a day and an hour.
const sweep = async (d, hhmm = '09:00') => { await as(null, [], 'service_role'); return one(`SELECT public.mkt_ads_due((($1::date + $2::time) AT TIME ZONE 'Asia/Kuala_Lumpur'))`, [d, hhmm]) }
const notices = pid => peek(`SELECT u.name AS to, n.kind, n.title, n.body, n.ref_kind AS ref, n.data ->> 'type' AS type
  FROM public.app_notifications n JOIN public.users u ON u.id = n.user_id WHERE n.ref_id = $1 ORDER BY u.name, n.title`, [pid])
const told = pid => peek1(`SELECT told_until::text FROM public.mkt_ads WHERE project_id = $1`, [pid])
const range = (a, b) => peek1(`SELECT CASE WHEN extract(month FROM $1::date) <> extract(month FROM $2::date)
  THEN to_char($1::date, 'FMDD Mon') || ' – ' || to_char($2::date, 'FMDD Mon') ELSE to_char($1::date, 'FMDD') || ' – ' || to_char($2::date, 'FMDD Mon') END`, [a, b])

// Raya ads: Ali's, set up by Mei — every 2 weeks from four weeks back: #1 and #2 over, #2 the newest.
const Q = await proj('Raya ads', S.ali)
await as(U.mei, STAFF)
await save(Q, { every: '2w', startsOn: await day(-28), figures: ['spend'] })

// ── From 9:00 the office's time; once a period ──────────────────────────────────────────────────────────────
check(await sweep(TODAY, '08:59'), 0, 'before 9:00: nobody told')
check([await notices(Q), await told(Q)], [[], null], 'nothing written, nothing marked')
check(await sweep(TODAY, '09:00'), 1, 'from 9:00: its newest period over told')
const R2 = await range(await day(-14), await day(-1))
check(await notices(Q), [
  { to: 'Ali', kind: 'marketing', title: 'Ads report #2 is due', body: `Raya ads · ${R2}`, ref: 'mkt_project', type: 'ads_due' },
  { to: 'Mei', kind: 'marketing', title: 'Ads report #2 is due', body: `Raya ads · ${R2}`, ref: 'mkt_project', type: 'ads_due' },
], 'its owner and whoever set it up — each once; the bell opens the project')
check(await told(Q), await day(-1), 'marked: the period’s last day')
check(await sweep(TODAY, '15:00'), 0, 'the same day again: told once')
check((await notices(Q)).length, 2, 'no second notice')

// #1 published by Mei, #2 by Josiah: the next period, once over, tells Ali and Josiah — the latest report's, not Mei.
await as(U.mei, STAFF)
await publish(Q, 1)
await as(U.josiah, MANAGER)
await publish(Q, 2)
check(await sweep(await day(13), '10:00'), 0, '#3 not over yet: nobody told')
check(await sweep(await day(14), '10:00'), 1, '#3 over: told')
check((await notices(Q)).filter(x => x.title === 'Ads report #3 is due').map(x => x.to), ['Ali', 'Sia Josiah'], 'its owner and whoever published its latest report')
check(await sweep(await day(15), '10:00'), 0, 'the day after: #3 told once')

// ── Found published: nothing — and marked, so a later sweep does not look again ────────────────────────────────
const P = await proj('Showroom ads', S.ali)
await as(U.mei, STAFF)
await save(P, { every: '1w', startsOn: await day(-14), figures: ['spend'] })
await publish(P, 2)
check(await sweep(TODAY, '09:30'), 0, 'its newest period out: nobody told')
check([await notices(P), await told(P)], [[], await day(-1)], 'none written; marked')

// ── To its last report ───────────────────────────────────────────────────────────────────────────────────────
const L = await proj('Merdeka ads', S.ali)
await as(U.mei, STAFF)
await save(L, { every: '2w', startsOn: await day(-56), figures: ['spend'], lastNo: 2 })
check(await sweep(TODAY, '09:30'), 1, 'its periods run on — its last is #2')
check((await notices(L)).map(x => x.title), ['Ads report #2 is due', 'Ads report #2 is due'], 'its last report told, never #4')
await sweep(await day(30), '09:30')
check((await notices(L)).map(x => x.title), ['Ads report #2 is due', 'Ads report #2 is due'], 'past its last: nothing more, however long')

// ── A cancelled project: never ───────────────────────────────────────────────────────────────────────────────
const X = await proj('Cancelled ads', S.ali)
await as(U.mei, STAFF)
await save(X, { every: '1w', startsOn: await day(-7), figures: ['spend'] })
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'cancelled' WHERE id = $1`, [X])
check(await sweep(TODAY, '09:30'), 0, 'cancelled: nobody told')
check([await notices(X), await told(X)], [[], null], 'nothing written, nothing marked')

// ── No owner (the Principal made it): whoever's stage it is at; somebody without a login gets nothing ──────────
const W = await proj('Year-end ads', null, { cur: 1 })
await asSystem()
await q(`INSERT INTO public.mkt_stages (project_id, idx, name, owner_staff) VALUES ($1, 0, 'Brief', $2), ($1, 1, 'Run ads', $3)`, [W, S.mei, S.josiah])
await as(U.josiah, MANAGER)
await save(W, { every: '1w', startsOn: await day(-7), figures: ['spend'] })
check(await sweep(TODAY, '09:30'), 1, 'told')
check((await notices(W)).map(x => x.to), ['Sia Josiah'], 'whoever’s stage it is at, who also set it up: once')
const Z = await proj('No-login ads', NOLOGIN)
await as(U.mei, STAFF)
await save(Z, { every: '1w', startsOn: await day(-7), figures: ['spend'] })
await asSystem()
await q(`UPDATE public.hr_staff_costs SET status = 'left' WHERE id = $1`, [S.mei])
check(await sweep(TODAY, '09:30'), 1, 'told — somebody is named')
check(await notices(Z), [], 'its owner has no login, whoever set it up has left: nothing written')
check(await told(Z), await day(-1), 'marked all the same: never told late')
await asSystem()
await q(`UPDATE public.hr_staff_costs SET status = 'active' WHERE id = $1`, [S.mei])
// Nobody at all: no owner, no stages, set up by a login with no People record (the shared Principal's).
const BOSS = id(9)
await q(`INSERT INTO public.users (id, name, email) VALUES ($1, 'Principal', 'principal@x.my')`, [BOSS])
const E = await proj('Nobody’s ads')
await as(BOSS, MANAGER)
await save(E, { every: '1w', startsOn: await day(-7), figures: ['spend'] })
check(await sweep(TODAY, '09:30'), 0, 'nobody to tell: none counted')
check([await notices(E), await told(E)], [[], await day(-1)], 'nothing written; marked all the same')

// ── A month's period; one over the year's end ───────────────────────────────────────────────────────────────
const M = await proj('Monthly ads', S.ali)
await as(U.mei, STAFF)
await save(M, { every: '1m', startsOn: '2026-01-31', figures: ['spend'] })
check(await sweep('2026-02-27', '09:30'), 0, '31 Jan – 27 Feb not over on the 27th')
check(await sweep('2026-02-28', '09:30'), 1, 'over on the 28th — as mkt_ads_period reckons a month')
check((await notices(M)).map(x => x.body), ['Monthly ads · 31 Jan – 27 Feb', 'Monthly ads · 31 Jan – 27 Feb'], 'its days as the card writes them')
check(await sweep('2026-04-30', '09:30'), 1, 'two months on: only the newest told')
check((await notices(M)).filter(x => x.to === 'Ali').map(x => x.title), ['Ads report #1 is due', 'Ads report #3 is due'], '#3 (31 Mar – 29 Apr), never #2 after it')
const Y = await proj('New year ads', S.ali)
await as(U.mei, STAFF)
await save(Y, { every: '2w', startsOn: '2026-12-29', figures: ['spend'] })
await sweep('2027-01-12', '09:30')
check((await notices(Y)).map(x => x.title), ['Ads report #1 is due', 'Ads report #1 is due'], 'over the year’s end: told')
check((await notices(Y))[0].body, 'New year ads · 29 Dec 2026 – 11 Jan 2027', 'both years said')

console.log(`marketing ads due: ${checks} checks passed`)
