// Local PostgreSQL regression for 20261026023000 (2026-10-26 — Marketing ②b-2h: Finance imports Marketing's billing; the
// user, asked whose figures Marketing is invoiced by: "A"; then a product's revenue account set once, no invoice date, an
// invoice deleted or voided puts its lines back). Marketing's migrations up to the Ads report's PDF run, over Finance's
// invoices as far as what is under test touches them; then this one, twice. What is under test: who may call what; the
// revenue accounts a product may post to and the manager setting one, no new version; what Finance reads before an
// import — the confirmed lines by party, their accounts and invoices, and the month's Marketing invoices typed by hand;
// the import — one draft a party, its lines, an outside client's billing details, nothing twice, a new line added to the
// party's draft, a new draft once that one is issued or bills someone else; a draft deleted or an invoice voided putting
// its lines back; a line on a live invoice not withdrawn; Marketing's Billing saying which invoice a line is on.
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

const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const FINANCE = ['billing.view', 'billing.create', 'billing.edit']
const U = { josiah: id(1), mei: id(2), ali: id(3), lee: id(4), kim: id(5) }
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

  -- Finance's invoices, as production keeps them (2026-10-26) as far as what is under test touches them.
  CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense', 'fixed_asset', 'cost', 'other_income');
  CREATE TYPE public.billing_mode AS ENUM ('marketing_project', 'non_billable', 'hr_attribution');
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'paid', 'paid_via_netting', 'voided');
  CREATE TYPE public.billable_to_kind AS ENUM ('subsidiary', 'director', 'dept_pool', 'freetext');
  CREATE TABLE public.chart_of_accounts (code varchar(20) PRIMARY KEY, name text NOT NULL, type public.account_type NOT NULL,
    parent_code varchar(20), is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_no varchar UNIQUE, contract_id uuid, company_id uuid REFERENCES public.companies(id),
    period_month date NOT NULL CONSTRAINT period_is_first_of_month CHECK (EXTRACT(day FROM period_month) = 1),
    billing_mode public.billing_mode NOT NULL, base_amount numeric(15,2) CHECK (base_amount IS NULL OR base_amount >= 0),
    total_amount numeric(15,2) NOT NULL CHECK (total_amount > 0), status public.invoice_status NOT NULL DEFAULT 'draft',
    version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(),
    invoice_date date, due_date date, description text, reference_no text, billable_to_type public.billable_to_kind NOT NULL,
    billable_to_department_id uuid, billable_to_freetext_name text, category_code varchar, billable_to_freetext_address text,
    billable_to_freetext_phone text, billable_to_freetext_email text,
    billable_to_freetext_address_parts jsonb CHECK (billable_to_freetext_address_parts IS NULL OR jsonb_typeof(billable_to_freetext_address_parts) = 'object'),
    CONSTRAINT inv_billable_to_exactly_one CHECK (
      (billable_to_type = 'subsidiary' AND company_id IS NOT NULL AND billable_to_department_id IS NULL AND billable_to_freetext_name IS NULL) OR
      (billable_to_type = 'director' AND billable_to_freetext_name IS NOT NULL AND company_id IS NULL AND billable_to_department_id IS NULL) OR
      (billable_to_type = 'dept_pool' AND billable_to_department_id IS NOT NULL AND company_id IS NULL AND billable_to_freetext_name IS NULL) OR
      (billable_to_type = 'freetext' AND billable_to_freetext_name IS NOT NULL AND company_id IS NULL AND billable_to_department_id IS NULL)));
  CREATE TABLE public.invoice_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE, line_no integer NOT NULL, description text,
    amount numeric(15,2) NOT NULL CHECK (amount > 0), category_code varchar REFERENCES public.chart_of_accounts(code),
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (invoice_id, line_no));
  CREATE TABLE public.period_locks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date NOT NULL, is_locked boolean NOT NULL DEFAULT true);
  -- Finance deletes a draft by its own grants (RLS answers who); Marketing's tables it has no grant on at all.
  GRANT SELECT, DELETE ON public.invoices TO authenticated;
  -- Production's mint_invoice_no and address_compose, as they run (2026-10-26).
  CREATE FUNCTION public.mint_invoice_no(p_period date) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_yyyymm TEXT := to_char(p_period, 'YYYYMM');
    v_seq INTEGER;
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create']) THEN RAISE EXCEPTION 'mint_invoice_no: needs Billing · Create' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('hv_invoice_no'));
    SELECT COALESCE(MAX((regexp_replace(invoice_no, '^HV-INV-\\d{6}-', ''))::int), 0) + 1 INTO v_seq
      FROM invoices WHERE invoice_no LIKE 'HV-INV-' || v_yyyymm || '-%';
    RETURN 'HV-INV-' || v_yyyymm || '-' || lpad(v_seq::TEXT, 4, '0');
  END;
  $$;
  CREATE FUNCTION public.address_compose(p_line1 text, p_line2 text, p_postcode text, p_city text, p_state text, p_country text)
  RETURNS text LANGUAGE sql IMMUTABLE AS $$
    WITH p AS (
      SELECT nullif(regexp_replace(btrim(coalesce(p_line1, '')), '\\s+', ' ', 'g'), '') AS line1,
             nullif(regexp_replace(btrim(coalesce(p_line2, '')), '\\s+', ' ', 'g'), '') AS line2,
             nullif(regexp_replace(btrim(coalesce(p_postcode, '')), '\\s+', ' ', 'g'), '') AS postcode,
             nullif(regexp_replace(btrim(coalesce(p_city, '')), '\\s+', ' ', 'g'), '') AS city,
             nullif(regexp_replace(btrim(coalesce(p_state, '')), '\\s+', ' ', 'g'), '') AS state,
             nullif(regexp_replace(btrim(coalesce(p_country, '')), '\\s+', ' ', 'g'), '') AS country
    )
    SELECT CASE
             WHEN line1 IS NULL AND line2 IS NULL AND postcode IS NULL AND city IS NULL AND state IS NULL THEN NULL
             ELSE concat_ws(', ', line1, line2, nullif(concat_ws(' ', postcode, city), ''), state, coalesce(country, 'Malaysia'))
           END
      FROM p
  $$;
  -- The tab registry's guard: closed only for the page and box the import names, when the test says so.
  CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    IF current_setting('test.tab_closed', true) = 'on' AND p_pages = ARRAY['/invoices/[id]'] AND p_wants = ARRAY['billing.create'] THEN
      RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked' USING ERRCODE = '42501';
    END IF;
  END
  $$;

  INSERT INTO public.users (id, name, email) VALUES ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'),
    ('${U.ali}', 'Ali', 'ali@x.my'), ('${U.lee}', 'Lee Kok Wai', 'lee@x.my'), ('${U.kim}', 'Kim', 'kim@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true), ('${id(102)}', 'Dream Crafter', 'DC', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
  INSERT INTO public.chart_of_accounts (code, name, type, parent_code, is_active) VALUES
    ('5030', 'Service Management Charge', 'revenue', NULL, true),
    ('5012', 'Revenue  - Lead Gen', 'revenue', '5030', true),
    ('5013', 'Video Shooting', 'revenue', '5030', true),
    ('5014', 'Revenue Rebranding', 'revenue', '5030', true),
    ('5014A', 'Rebranding - Logo', 'revenue', '5014', true),
    ('5016', 'Commission Income', 'revenue', '5030', false),
    ('5019', 'Design Income', 'revenue', '5030', true),
    ('5099', 'Marketing cost', 'expense', '5030', true),
    ('5050', 'Salary Income', 'revenue', NULL, true);
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
  '20261025181000_marketing_product_pause.sql', '20261025191000_marketing_option_lists.sql', '20261025201000_marketing_opened_from.sql',
  '20261025211000_marketing_new_drafts.sql', '20261025221000_marketing_task_minutes.sql', '20261025231000_marketing_task_pic.sql',
  '20261025235000_marketing_task_pic_stage.sql', '20261025235500_marketing_key_dates.sql']
for (const m of MIGS) await db.exec(await sql(m))
// The CRM's tables, as far as the Ads reports read them.
await db.exec(`
  ALTER TABLE public.crm_contacts ADD COLUMN ad_source_id text, ADD COLUMN status text, ADD COLUMN won_amount numeric,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  CREATE TABLE public.crm_appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL, state text NOT NULL);
  CREATE TABLE public.crm_ad_names (ad_source_id text PRIMARY KEY, name text, page_name text, meta_status text, hidden_at timestamptz);
`)
for (const m of ['20261025235800_marketing_ads_reports.sql', '20261025235900_marketing_pic_ads.sql', '20261026001000_marketing_ads_report_days.sql',
  '20261026002000_marketing_ads_due.sql', '20261026003000_marketing_ads_pdf.sql']) await db.exec(await sql(m))
const mig = await sql('20261026023000_marketing_bill_import.sql')
await asSystem()
// A new function's grants as production makes them (pg_default_acl, 2026-10-26): none to PUBLIC or anon; authenticated
// and service_role may call it — so a helper nobody signed in may call is revoked from authenticated by name.
await db.exec(`ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;`)
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
check([await may('anon', 'mkt_revenue_list()'), await may('authenticated', 'mkt_revenue_list()'), await may('service_role', 'mkt_revenue_list()')],
  [false, false, true], 'mkt_revenue_list: the functions’ own')
for (const fn of ['mkt_product_account(uuid, text)', 'mkt_bill_import_preview(date)', 'mkt_bill_import(date)']) {
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
}
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_revenue_list()`, [], /permission denied/, 'mkt_revenue_list: nobody’s to call')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const MONTH = `${TODAY.slice(0, 7)}-01`
const LAST = await peek1(`SELECT (($1::date - interval '1 month')::date)::text`, [MONTH])
const NEXT = await peek1(`SELECT (($1::date + interval '1 month')::date)::text`, [MONTH])
const mon = await peek1(`SELECT to_char($1::date, 'Mon') || '''' || to_char($1::date, 'YY')`, [MONTH])
const NO = n => `HV-INV-${MONTH.slice(0, 4)}${MONTH.slice(5, 7)}-${String(n).padStart(4, '0')}`
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const DC = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'DC'`)

// ── The accounts a product may post to: Finance's revenue accounts under 5030, active, none a header ──────────
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'person', staff: S.josiah }], form: [] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
async function product(kind, name, price) {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind })])
  const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name, intake: minutes.id, price,
    effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: price / 2, workflow: wf.id }] }] })])
  await one(`SELECT public.mkt_product_publish($1, $2)`, [p.id, saved.rev])
  return p.id
}
const PACK = await product('one', 'Post pack', 500)
const LEAD = await product('recurring', 'Lead Gen', 2500)
const SOCIAL = await product('recurring', 'Social Media', 3000)
const products = () => one(`SELECT public.mkt_products()`)
let list = await products()
check(list.accounts, [{ code: '5012', name: 'Revenue - Lead Gen' }, { code: '5013', name: 'Video Shooting' }, { code: '5019', name: 'Design Income' }],
  'offered: 5012, 5013, 5019 — not the header 5030 or 5014, an inactive account, an expense, nor one under another header')
check(list.products.find(p => p.id === PACK).account, null, 'a product has none until the manager picks one')

// ── The manager sets it, at once: no new version, no draft ─────────────────────────────────────────────────────
const before = await peek(`SELECT draft_rev, version, published_rev FROM public.mkt_products WHERE id = $1`, [PACK])
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_product_account($1, '5019')`, [PACK], /manager/, 'Marketing · Edit sets no account')
await as(U.josiah, MANAGER)
check(await one(`SELECT public.mkt_product_account($1, ' 5019 ')`, [PACK]), { product: PACK, account: '5019' }, 'the manager sets Post pack’s: 5019')
check(await peek(`SELECT draft_rev, version, published_rev FROM public.mkt_products WHERE id = $1`, [PACK]), before, '…no new version, no draft')
await one(`SELECT public.mkt_product_account($1, '5012')`, [LEAD])
for (const [code, what] of [['5016', 'an inactive account'], ['5030', 'the header'], ['5099', 'an expense'], ['5014A', 'one under another header'],
  ['9999', 'no account at all']]) {
  await refuses(`SELECT public.mkt_product_account($1, $2)`, [SOCIAL, code], /from the list/, `refused: ${what}`)
}
await refuses(`SELECT public.mkt_product_account($1, '5012')`, [id(999)], /not there/, 'no such product')
await one(`SELECT public.mkt_product_account($1, '5013')`, [SOCIAL])
check(await one(`SELECT public.mkt_product_account($1, '')`, [SOCIAL]), { product: SOCIAL, account: null }, 'cleared: none')
list = await products()
check(Object.fromEntries(list.products.filter(p => [PACK, LEAD, SOCIAL].includes(p.id)).map(p => [p.id, p.account])),
  { [PACK]: '5019', [LEAD]: '5012', [SOCIAL]: null }, 'the Product Builder reads each product’s')

// ── The month's lines: two for Carres, one for Dream Crafter, one for an outside client ───────────────────────
const RT = (await one(`SELECT public.mkt_sub_add($1, $2, $3::jsonb)`, ['Red Truck', 'Kelvin', JSON.stringify({ name: 'Red Truck Sdn Bhd',
  address: { line1: 'No 8, Jalan Kenari 5', line2: '', postcode: '47100', city: 'Puchong', state: 'Selangor', country: '' },
  phone: '+60 12-345 6789', email: 'accounts@redtruck.my' })])).id
async function due(sub, productId, amount, kind) {
  await as(U.josiah, MANAGER)
  const pid = (await one(`SELECT public.mkt_product_start($1, $2, $3)`, [sub, productId, amount])).id
  await asSystem()
  if (kind === 'one') await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE id = $1`, [pid])
  else await q(`UPDATE public.mkt_projects SET status = 'active', bill_from = $2 WHERE id = $1`, [pid, MONTH])
  await as(U.josiah, MANAGER)
  return pid
}
const P1 = await due(CAR, PACK, 500, 'one')
const P2 = await due(CAR, LEAD, 2500, 'recurring')
const P3 = await due(DC, PACK, 450, 'one')
const R1 = await due(RT, SOCIAL, 3000, 'recurring')
const W = await due(DC, PACK, 999, 'one')
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P1, P2, P3, R1, W]])
const billOf = pid => peek1(`SELECT id FROM public.mkt_bills WHERE project_id = $1 AND month = $2 AND status = 'confirmed'`, [pid, MONTH])
await one(`SELECT public.mkt_bill_withdraw($1)`, [await billOf(W)])
const track = async pid => peek1(`SELECT track_id FROM public.mkt_projects WHERE id = $1`, [pid])
const carOrder = [[P1, await track(P1)], [P2, await track(P2)]].sort((a, b) => a[1].localeCompare(b[1])).map(x => x[0])

// Typed by hand this month: one issued and a draft (listed — the draft numbered in no month's series, out of the way), one
// voided, one of another billing mode; last month's — none listed.
await asSystem()
await q(`INSERT INTO public.invoices (invoice_no, period_month, billing_mode, total_amount, status, created_by, billable_to_type, company_id, description)
         VALUES ($1, $2, 'marketing_project', 3000, 'issued', $5, 'subsidiary', $6, 'Marketing Service - ' || $4 || E'\nTyped'),
                ($3, $2, 'marketing_project', 1200, 'voided', $5, 'subsidiary', $6, 'Marketing Service [VOIDED]')`,
  [NO(1), MONTH, NO(2), mon, U.lee, id(101)])
await q(`INSERT INTO public.invoices (invoice_no, period_month, billing_mode, total_amount, status, created_by, billable_to_type, company_id, description)
         VALUES ($1, $2, 'hr_attribution', 800, 'issued', $3, 'subsidiary', $4, 'Recruitment')`, [NO(3), MONTH, U.lee, id(102)])
await q(`INSERT INTO public.invoices (invoice_no, period_month, billing_mode, total_amount, status, created_by, billable_to_type, company_id, description)
         VALUES ('HV-INV-000000-0009', $1, 'marketing_project', 900, 'paid', $2, 'subsidiary', $3, 'Last month')`, [LAST, U.lee, id(101)])
await q(`INSERT INTO public.invoices (invoice_no, period_month, billing_mode, total_amount, status, created_by, billable_to_type, company_id, description)
         VALUES ('HV-INV-000000-0008', $1, 'marketing_project', 150, 'draft', $2, 'subsidiary', $3, 'Flyer design')`, [MONTH, U.lee, id(102)])
const TYPED = await peek1(`SELECT id FROM public.invoices WHERE invoice_no = $1`, [NO(1)])

// ── What Finance reads before it imports: Billing · View or Create ─────────────────────────────────────────────
const preview = (month = MONTH) => one(`SELECT public.mkt_bill_import_preview($1)`, [month])
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_bill_import_preview($1)`, [MONTH], /Billing is not open/, 'Marketing’s manager reads no import')
await as(U.kim, ['billing.view'])
let pv = await preview(TODAY)
check([pv.month, pv.locked], [MONTH, false], 'any day of the month reads its month, open')
check(pv.lines.map(l => [l.bill === null, l.project, l.party.kind, l.party.name, l.party.code, l.words, l.amount, l.account?.code ?? null, l.invoice]),
  [...carOrder.map(pid => [false, pid, 'subsidiary', 'Carres', 'CAR', pid === P1 ? `Post pack - ${mon}` : `Lead Gen - ${mon}`, pid === P1 ? 500 : 2500,
    pid === P1 ? '5019' : '5012', null]),
  [false, P3, 'subsidiary', 'Dream Crafter', 'DC', `Post pack - ${mon}`, 450, '5019', null],
  [false, R1, 'client', 'Red Truck Sdn Bhd', await peek1('SELECT code FROM public.mkt_subsidiaries WHERE id = $1', [RT]), `Social Media - ${mon}`, 3000, null, null]],
  'the confirmed lines, by party: a group company by its company, an outside client by its billing name — never a withdrawn one')
check(pv.lines[0].party.id, id(101), 'a group company’s party is its company')
check([pv.lines[0].sub.code, pv.lines[0].track, typeof pv.lines[0].title], ['CAR', await track(carOrder[0]), 'string'], 'each line says its project')
check(pv.lines.find(l => l.project === P1).account, { code: '5019', name: 'Design Income' }, 'its product’s account, named')
check(pv.typed.map(t => [t.no, t.status, Number(t.total), t.party, t.code]), [[NO(1), 'issued', 3000, 'Carres', 'CAR'],
  ['HV-INV-000000-0008', 'draft', 150, 'Dream Crafter', 'DC']], 'the month’s Marketing invoices typed by hand — not a voided one, another mode’s, or another month’s')
await asSystem()
check((await preview()).lines.length, 4, 'the system reads it too')

// ── The import: Billing · Create ──────────────────────────────────────────────────────────────────────────────
const IMPORT = `SELECT public.mkt_bill_import($1)`
await as(U.kim, ['billing.view'])
await refuses(IMPORT, [MONTH], /Importing Marketing's billing needs Billing · Create/, 'Billing · View imports nothing')
await asSystem()
await refuses(IMPORT, [MONTH], /Importing Marketing's billing needs Billing · Create/, 'nobody signed in imports nothing')
await as(U.lee, FINANCE)
await q(`SELECT set_config('test.tab_closed', 'on', false)`)
await refuses(IMPORT, [MONTH], /Not open to you on this page/, 'its box unticked on the invoice’s page: refused')
await q(`SELECT set_config('test.tab_closed', 'off', false)`)
await refuses(IMPORT, [NEXT], /still to come/, 'a month still to come refused')
await refuses(IMPORT, [null], /Pick the month/, 'no month')
await asSystem()
await q(`INSERT INTO public.period_locks (period_month, is_locked) VALUES ($1, true)`, [MONTH])
await as(U.lee, FINANCE)
check((await preview()).locked, true, 'a closed month reads as closed')
await refuses(IMPORT, [MONTH], /is closed\. Contact Principal to reopen/, 'a closed month refused')
await asSystem()
await q(`UPDATE public.period_locks SET is_locked = false WHERE period_month = $1`, [MONTH])
await as(U.lee, FINANCE)

let res = await one(IMPORT, [TODAY])
check([res.month, res.made, res.added, res.lines], [MONTH, 3, 0, 4], 'imported: three drafts, four lines')
check(res.invoices.map(i => [i.no, i.lines, i.added]), [[NO(4), 2, false], [NO(5), 1, false], [NO(6), 1, false]],
  'a party each, numbered on from the month’s last: Carres, Dream Crafter, then the outside client')
const inv = no => peek(`SELECT invoice_no, status::text, billing_mode::text AS mode, billable_to_type::text AS kind, company_id, period_month::text AS month,
                               base_amount::text AS base, total_amount::text AS total, category_code, invoice_date, due_date, description, created_by,
                               billable_to_freetext_name AS name, billable_to_freetext_address AS address, billable_to_freetext_address_parts AS parts,
                               billable_to_freetext_phone AS phone, billable_to_freetext_email AS email
                          FROM public.invoices WHERE invoice_no = $1`, [no]).then(r => r[0])
const lines = no => peek(`SELECT l.line_no, l.description, l.amount::text AS amount, l.category_code FROM public.invoice_lines l
                            JOIN public.invoices i ON i.id = l.invoice_id WHERE i.invoice_no = $1 ORDER BY l.line_no`, [no])
const car = await inv(NO(4))
check(car, { invoice_no: NO(4), status: 'draft', mode: 'marketing_project', kind: 'subsidiary', company_id: id(101), month: MONTH, base: '3000.00',
  total: '3000.00', category_code: null, invoice_date: null, due_date: null, description: `Marketing Service - ${mon}`, created_by: U.lee,
  name: null, address: null, parts: null, phone: null, email: null },
  'Carres: a draft billed to its company — "Marketing Service - Mon’YY", no invoice date or due date, its total its lines’')
check(await lines(NO(4)), carOrder.map((pid, i) => ({ line_no: i + 1, description: pid === P1 ? `Post pack - ${mon}` : `Lead Gen - ${mon}`,
  amount: pid === P1 ? '500.00' : '2500.00', category_code: pid === P1 ? '5019' : '5012' })), '…a line each, its words, amount and account')
const rt = await inv(NO(6))
check([rt.kind, rt.company_id, rt.name, rt.address, rt.parts?.city, rt.phone, rt.email, rt.total],
  ['freetext', null, 'Red Truck Sdn Bhd', 'No 8, Jalan Kenari 5, 47100 Puchong, Selangor, Malaysia', 'Puchong', '+60 12-345 6789', 'accounts@redtruck.my', '3000.00'],
  'the outside client: its billing name, address in one line and in its parts, phone and email')
check(await lines(NO(6)), [{ line_no: 1, description: `Social Media - ${mon}`, amount: '3000.00', category_code: null }], '…a product with no account posts none')
check(await peek(`SELECT b.project_id, i.invoice_no FROM public.mkt_bills b JOIN public.invoices i ON i.id = b.invoice_id
                    WHERE b.month = $1 ORDER BY i.invoice_no, b.project_id`, [MONTH]),
  [...[P1, P2].sort().map(p => ({ project_id: p, invoice_no: NO(4) })), { project_id: P3, invoice_no: NO(5) }, { project_id: R1, invoice_no: NO(6) }],
  'each line knows its invoice')
pv = await preview()
check(pv.lines.map(l => [l.project, l.invoice?.no, l.invoice?.status]).sort(), [[P1, NO(4), 'draft'], [P2, NO(4), 'draft'], [P3, NO(5), 'draft'],
  [R1, NO(6), 'draft']].sort(), 'the preview says each line’s invoice')
check(pv.typed.map(t => t.no), [NO(1), 'HV-INV-000000-0008'], '…an imported draft is not typed by hand')

res = await one(IMPORT, [MONTH])
check([res.made, res.added, res.lines, res.invoices], [0, 0, 0, []], 'imported again: nothing twice')
check(await peek1(`SELECT count(*)::int FROM public.invoices`), 8, '…no invoice more')
const typedDraft = await peek(`SELECT total_amount::text AS total, (SELECT count(*)::int FROM public.invoice_lines l WHERE l.invoice_id = i.id) AS lines
                              FROM public.invoices i WHERE invoice_no = 'HV-INV-000000-0008'`)
check(typedDraft, [{ total: '150.00', lines: 0 }], 'a Marketing draft typed by hand is never added to')

// ── Marketing's Billing says which invoice a line is on; a line on a live invoice is not withdrawn ──────────────
await as(U.josiah, MANAGER)
const mb = await one(`SELECT public.mkt_billing($1)`, [MONTH])
check(mb.lines.find(l => l.project === P1).bill.invoice, { no: NO(4), status: 'draft' }, 'Marketing’s Billing: the line’s invoice')
await refuses(`SELECT public.mkt_bill_withdraw($1)`, [await billOf(P3)],
  new RegExp(`Finance has it on ${NO(5)} \\(Draft\\) — ask Finance to delete that draft, then withdraw it`), 'on a draft: Finance deletes it first')

// ── A line confirmed after: added to its party's draft; once that is issued, a draft of its own ────────────────
const P4 = await due(CAR, PACK, 600, 'one')
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P4]])
await as(U.lee, FINANCE)
res = await one(IMPORT, [MONTH])
check([res.made, res.added, res.lines, res.invoices.map(i => [i.no, i.lines, i.added])], [0, 1, 1, [[NO(4), 1, true]]], 'added to Carres’ draft')
check([(await lines(NO(4))).map(l => [l.line_no, l.amount]).at(-1), (await inv(NO(4))).total, (await inv(NO(4))).base], [[3, '600.00'], '3600.00', '3600.00'],
  '…its next line, the total again')
await asSystem()
await q(`UPDATE public.invoices SET status = 'issued' WHERE invoice_no = $1`, [NO(4)])
const P5 = await due(CAR, PACK, 700, 'one')
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P5]])
await refuses(`SELECT public.mkt_bill_withdraw($1)`, [await billOf(P4)],
  new RegExp(`Finance has it on ${NO(4)} \\(Issued\\) — ask Finance to void that invoice, then withdraw it`), 'on an issued one: Finance voids it first')
await as(U.lee, FINANCE)
res = await one(IMPORT, [MONTH])
check([res.made, res.added, res.invoices.map(i => [i.no, i.lines, i.added])], [1, 0, [[NO(7), 1, false]]], 'Carres’ draft issued: a new draft')
check((await lines(NO(4))).length, 3, '…the issued one left as it is')

// A draft Finance moved to another party is not added to.
await asSystem()
await q(`UPDATE public.invoices SET company_id = $2 WHERE invoice_no = $1`, [NO(5), id(101)])
const P6 = await due(DC, PACK, 300, 'one')
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P6]])
await as(U.lee, FINANCE)
res = await one(IMPORT, [MONTH])
check(res.invoices.map(i => [i.no, i.added]), [[NO(8), false]], 'Dream Crafter’s draft now billing Carres: a new one for Dream Crafter')
await asSystem()
await q(`UPDATE public.invoices SET company_id = $2 WHERE invoice_no = $1`, [NO(5), id(102)])

// ── A draft deleted: its lines back, to import again or withdraw ───────────────────────────────────────────────
await as(U.lee, FINANCE)
await q(`DELETE FROM public.invoices WHERE invoice_no = $1`, [NO(6)])
check(await peek1(`SELECT invoice_id FROM public.mkt_bills WHERE project_id = $1 AND status = 'confirmed'`, [R1]), null,
  'Finance deleted the client’s draft: its line on no invoice — Finance holding no grant on Marketing’s tables')
check((await preview()).lines.find(l => l.project === R1).invoice, null, '…the preview: to import')
res = await one(IMPORT, [MONTH])
check([res.made, res.invoices.map(i => [i.no, i.lines])], [1, [[NO(9), 1]]], '…imported again, a draft of its own')

// ── An invoice voided: its lines back too; withdrawn once nothing holds them ───────────────────────────────────
await asSystem()
await q(`UPDATE public.invoices SET status = 'voided' WHERE invoice_no = $1`, [NO(4)])
await q(`UPDATE public.chart_of_accounts SET is_active = false WHERE code = '5019'`)
await as(U.lee, FINANCE)
pv = await preview()
check(pv.lines.filter(l => [P1, P2, P4].includes(l.project)).map(l => l.invoice), [null, null, null], 'Carres’ issued invoice voided: its three lines to import')
check(pv.lines.find(l => l.project === P1).account, null, '…an account Finance closed is offered no more')
res = await one(IMPORT, [MONTH])
check(res.invoices.map(i => [i.no, i.lines, i.added]), [[NO(7), 3, true]], '…onto Carres’ draft')
const backOrder = (await Promise.all([P1, P2, P4].map(async p => [p, await track(p)]))).sort((a, b) => a[1].localeCompare(b[1])).map(x => x[0])
const backAccount = { [P1]: null, [P2]: '5012', [P4]: null }
check((await lines(NO(7))).map(l => [l.line_no, l.category_code]), [[1, '5019'], ...backOrder.map((p, i) => [i + 2, backAccount[p]])],
  '…after its own line, in Track ID order: Post pack’s account, closed since, left off — Lead Gen’s kept')
check(Number((await inv(NO(7))).total), 700 + 500 + 2500 + 600, '…the draft’s total its four lines')
await asSystem()
await q(`UPDATE public.chart_of_accounts SET is_active = true WHERE code = '5019'`)
await q(`UPDATE public.invoices SET status = 'voided' WHERE invoice_no = $1`, [NO(7)])
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_billing($1)`, [MONTH])).lines.find(l => l.project === P1).bill.invoice, null, 'Marketing’s Billing: a voided invoice is none')
const back = await one(`SELECT public.mkt_bill_withdraw($1)`, [await billOf(P1)])
check(back.lines.find(l => l.project === P1).bill, null, 'withdrawn once its invoice is voided')

// ── Another month's lines: numbered in that month's series, billed in that month ──────────────────────────────
const L1 = await due(DC, LEAD, 2500, 'recurring')
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [L1, LAST])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [LAST, [L1]])
await as(U.lee, FINANCE)
res = await one(IMPORT, [LAST])
const lastNo = `HV-INV-${LAST.slice(0, 4)}${LAST.slice(5, 7)}-0001`
const monLast = await peek1(`SELECT to_char($1::date, 'Mon') || '''' || to_char($1::date, 'YY')`, [LAST])
check([res.month, res.invoices.map(i => i.no)], [LAST, [lastNo]], 'last month’s line: numbered in last month’s series')
check([(await inv(lastNo)).month, (await inv(lastNo)).description], [LAST, `Marketing Service - ${monLast}`], '…billed in last month, in that month’s words')

console.log(`marketing bill import: ${checks} checks passed`)
