// Local PostgreSQL regression for 20261113100000 (2026-11-12 — the Product Builder's three tabs: the Product List,
// products duplicated and their status from the right-click menu, quotations — sent as versions kept whole, accepted,
// their work assigned as quick tasks; docs/design_handoff_product_builder/). Marketing's migrations up to Finance's
// import of its billing and the Minutes Builder v2 run, then this one, twice. What is under test: who may call what; the
// Product List — an item made, renamed everywhere it is used, refused when its name is taken, never deleted while used;
// a catalogue renamed; a quotation numbered, saved on its count, its lines checked; sent (a version kept whole, its total),
// refused when nothing changed, accepted (the managers told), its work assigned as quick tasks once; duplicated; a
// product duplicated and moved between Active, Draft and Retired — never Active unpublished.
// No live I/O.
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
await db.exec(await sql('20261026023000_marketing_bill_import.sql'))
await db.exec(await sql('20261112180000_marketing_minutes_builder_v2.sql'))
// Finance's AR accounts as production keeps them (20260929010000): a group company's own child of 3030, else AR - Other.
await db.exec(`
  ALTER TABLE public.companies ADD COLUMN ar_account_code text;
  UPDATE public.companies SET ar_account_code = '3033' WHERE short_code = 'CAR';
  INSERT INTO public.chart_of_accounts (code, name, type, parent_code, is_active) VALUES
    ('3030', 'Accounts Receivable - Subs', 'asset', NULL, true), ('3033', 'AR - Carres', 'asset', '3030', true),
    ('3039', 'AR - Other', 'asset', '3030', true);
  CREATE FUNCTION public.ar_account_code_for(p_company_id uuid, p_department_id uuid DEFAULT NULL, p_freetext text DEFAULT NULL)
  RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
    SELECT COALESCE((SELECT c.ar_account_code FROM companies c WHERE c.id = p_company_id AND c.ar_account_code IS NOT NULL),
                    (SELECT a.code FROM chart_of_accounts a WHERE a.code = '3073' AND a.is_active AND p_department_id IS NOT NULL),
                    (SELECT a.code FROM chart_of_accounts a WHERE a.code = '3039' AND a.is_active), '3030');
  $$;
`)
const mig = await sql('20261113100000_marketing_quotes.sql')
await asSystem()
await db.exec(`ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;`)
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const j = async (sql, params = []) => one(sql, params)

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_quote_book()', 'mkt_item_save(uuid, jsonb)', 'mkt_item_delete(uuid)', 'mkt_catalogue_rename(text, text)',
  'mkt_quote_save(uuid, integer, jsonb)', 'mkt_quote_send(uuid, integer)', 'mkt_quote_accept(uuid, integer)', 'mkt_quote_assign(uuid, jsonb)',
  'mkt_quote_duplicate(uuid)', 'mkt_quote_states(uuid[])', 'mkt_product_duplicate(uuid)', 'mkt_product_set_status(uuid, text)',
  'mkt_item_column_save(uuid, jsonb)', 'mkt_item_column_delete(uuid)', 'mkt_item_columns_order(uuid[])']) {
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
}
for (const fn of ['mkt_quote_lines(jsonb)', 'mkt_quote_subtotal(jsonb)', 'mkt_quote_ar(uuid, boolean)', 'mkt_item_used(uuid, text)']) {
  check([await may('anon', fn), await may('authenticated', fn), await may('service_role', fn)], [false, false, true], `${fn}: the functions' own`)
}
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_quote_book()`, [], /manager/, 'the staff read no prices')
await refuses(`SELECT public.mkt_item_save(NULL, '{"cat":"Video","name":"Reel"}')`, [], /manager/, 'the staff keep no Product List')
check(await j(`SELECT public.mkt_quote_states(ARRAY[gen_random_uuid()])`), {}, 'the bell asks nothing for the staff')

// ── The Product List ────────────────────────────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const reel = await j(`SELECT public.mkt_item_save(NULL, '{"cat":"Video","name":"Reel","price":800,"cost":300,"days":5,"remarks":"2 rounds"}')`)
check([reel.cat, reel.name, reel.price, reel.cost, reel.days, reel.remarks], ['Video', 'Reel', 800, 300, 5, '2 rounds'], 'an item made')
const post = await j(`SELECT public.mkt_item_save(NULL, '{"cat":"Graphic design","name":"Image post","price":120}')`)
const blank = await j(`SELECT public.mkt_item_save(NULL, '{"cat":"Video"}')`)
check(blank.name, '', 'a new row starts empty')
await refuses(`SELECT public.mkt_item_save(NULL, '{"cat":"Video","name":"reel"}')`, [], /on the Product List already/, 'a name once, whatever the case')
await refuses(`SELECT public.mkt_item_save(NULL, '{"name":"Shoot"}')`, [], /catalogue/, 'an item has a catalogue')
await refuses(`SELECT public.mkt_item_save($1, '{"days":0}')`, [reel.id], /1 to 365/, 'est. days 1 to 365')
await refuses(`SELECT public.mkt_item_save($1, '{"price":1.234}')`, [reel.id], /ringgit and sen/, 'a price in sen')
check((await j(`SELECT public.mkt_item_save($1, '{"price":null}')`, [blank.id])).price, null, 'a price cleared')
await q(`SELECT public.mkt_catalogue_rename('Graphic design', 'Design')`)
check((await j(`SELECT public.mkt_quote_book()`)).items.find(i => i.id === post.id).cat, 'Design', 'a catalogue renamed')

// ── A product using it; duplicated; its status ───────────────────────────────────────────────────────────────────────
const prod = await j(`SELECT public.mkt_product_save(NULL, NULL, $1)`, [JSON.stringify({ name: 'Social Starter', kind: 'recurring',
  groups: [{ name: 'Video', items: [{ name: 'reel', qty: 2, price: 800, workflow: null }] }], price: 1500, cost: 600 })])
const dup = await j(`SELECT public.mkt_product_duplicate($1)`, [prod.id])
const dupRow = await peek(`SELECT name, kind, status, version, price FROM public.mkt_products WHERE id = $1`, [dup.id])
check([dupRow[0].name, dupRow[0].kind, dupRow[0].status, dupRow[0].version, Number(dupRow[0].price)], ['Social Starter (copy)', 'recurring', 'draft', 0, 1500],
  'a product duplicated: a new draft, never published')
check(dup.code !== prod.code, true, 'with a code of its own')
await refuses(`SELECT public.mkt_product_set_status($1, 'active')`, [prod.id], /Please publish Social Starter before making it active/,
  'never Active unpublished — the page asks to publish it first')
await refuses(`SELECT public.mkt_product_set_status($1, 'retired')`, [prod.id], /delete the draft/, 'a draft never published is not retired')
// Published (as production's publish leaves it), then Draft, Retired and Active again from the menu.
await asSystem()
await q(`ALTER TABLE public.mkt_product_versions DROP CONSTRAINT IF EXISTS mkt_product_versions_intake_id_intake_version_fkey`)
await q(`INSERT INTO public.mkt_product_versions (product_id, version, name, description, kind, groups, intake_id, intake_version, price, cost,
           effective_from, note) SELECT p.id, 1, p.name, p.description, p.kind, p.groups, gen_random_uuid(), 1, p.price, p.cost, $2::date,
           '2 reel / month' FROM public.mkt_products p WHERE p.id = $1`, [prod.id, TODAY])
await q(`UPDATE public.mkt_products SET version = 1, published_rev = draft_rev, status = 'active', effective_from = $2 WHERE id = $1`, [prod.id, TODAY])
await as(U.josiah, MANAGER)
check((await j(`SELECT public.mkt_product_set_status($1, 'draft')`, [prod.id])).status, 'draft', 'a published product back to Draft')
check((await j(`SELECT public.mkt_quote_book()`)).packages.length, 0, 'a draft is no package to quote')
check((await j(`SELECT public.mkt_product_set_status($1, 'retired')`, [prod.id])).retiredOn, TODAY, 'retired today')
check((await j(`SELECT public.mkt_product_set_status($1, 'active')`, [prod.id])).status, 'active', 'and on sale again')
const book0 = await j(`SELECT public.mkt_quote_book()`)
check(book0.packages.map(p => [p.name, p.kind, p.version, p.price]), [['Social Starter', 'recurring', 1, 1500]], 'a package as published')
check(book0.clients.find(c => c.code === 'CAR').ar, '3033 · AR - Carres', "a group company's AR account")
check(book0.arOther, '3039 · AR - Other', 'anybody else: AR - Other')

// ── A quotation ─────────────────────────────────────────────────────────────────────────────────────────────────────
const car = book0.clients.find(c => c.code === 'CAR').id
let qt = await j(`SELECT public.mkt_quote_save(NULL, NULL, '{}')`)
const yymm = TODAY.slice(2, 4) + TODAY.slice(5, 7)
check([qt.no, qt.status, qt.date, qt.valid, qt.rev], [`QT-${yymm}-001`, 'draft', TODAY, 30, 1], 'numbered for the month, dated today')
check((await j(`SELECT public.mkt_quote_save(NULL, NULL, '{}')`)).no, `QT-${yymm}-002`, 'the next number')
const lines = [
  { key: 'a', kind: 'item', item: reel.id, name: 'Reel', cat: 'Video', list: 800, cost: 300, days: 5, qty: 2, price: null, eta: null, remark: '2 rounds' },
  { key: 'b', kind: 'package', product: prod.id, name: 'Social Starter', code: 'PRD-1', pkind: 'recurring', version: 1, list: 1500, cost: 600, months: 6,
    price: null, items: [{ name: 'Reel', group: 'Video', base: 2, qty: 3, unit: 800 }] },
]
qt = await j(`SELECT public.mkt_quote_save($1, 1, $2)`, [qt.id, JSON.stringify({ sub: car, contact: 'Kelvin', discount: 10, lines })])
check([qt.sub, qt.contact, Number(qt.discount), qt.lines.length, qt.rev], [car, 'Kelvin', 10, 2, 2], 'saved')
await refuses(`SELECT public.mkt_quote_save($1, 1, '{"note":"x"}')`, [qt.id], /changed this quotation since you opened it/, 'never over a newer save')
await refuses(`SELECT public.mkt_quote_save($1, 2, '{"lines":[{"key":"x","kind":"item","item":"nope","name":"X","qty":1}]}')`, [qt.id],
  /not on the Product List/, 'a line checked')
await refuses(`SELECT public.mkt_quote_save($1, 2, '{"valid":0}')`, [qt.id], /1 to 90/, 'valid 1 to 90 days')
await refuses(`SELECT public.mkt_item_delete($1)`, [reel.id], /“Reel” is used in 2 products · 1 quote — remove it there first/, 'an item used is not deleted')
await q(`SELECT public.mkt_item_delete($1)`, [blank.id])
check((await j(`SELECT public.mkt_quote_book()`)).items.some(i => i.id === blank.id), false, 'an item nothing uses, deleted')

// Renamed on the Product List: renamed in the product and the quotation.
await q(`SELECT public.mkt_item_save($1, '{"name":"Reels video"}')`, [reel.id])
const groups = await peek1(`SELECT groups FROM public.mkt_products WHERE id = $1`, [prod.id])
check(groups[0].items[0].name, 'Reels video', 'renamed in the product')
qt = (await j(`SELECT public.mkt_quote_book()`)).quotes.find(x => x.id === qt.id)
check([qt.lines[0].name, qt.lines[1].items[0].name, qt.rev], ['Reels video', 'Reels video', 3], 'renamed in the quotation, its count moved')

// Sent: v1 kept whole with its total — (2 × 800 + (1500 + 800) × 6) × 0.9 = 13,860.
qt = await j(`SELECT public.mkt_quote_send($1, $2)`, [qt.id, qt.rev])
check([qt.status, qt.history.length, qt.history[0].rev, Number(qt.history[0].total), qt.history[0].snap.client], ['sent', 1, 1, 13860, 'Carres'], 'v1 sent')
await refuses(`SELECT public.mkt_quote_send($1, $2)`, [qt.id, qt.rev], /Nothing has changed since v1/, 'the same version twice')
qt = await j(`SELECT public.mkt_quote_save($1, $2, '{"discount":0}')`, [qt.id, qt.rev])
await refuses(`SELECT public.mkt_quote_accept($1, $2)`, [qt.id, qt.rev], /send the revision first/, 'an edit unsent is not accepted')
qt = await j(`SELECT public.mkt_quote_send($1, $2)`, [qt.id, qt.rev])
check([qt.history[1].rev, Number(qt.history[1].total)], [2, 15400], 'v2 sent, its own total')
check(Number(qt.history[0].total), 13860, 'v1 kept as it was')
await refuses(`SELECT public.mkt_quote_assign($1, '[]')`, [qt.id], /once the client accepts/, 'no tasks before acceptance')
qt = await j(`SELECT public.mkt_quote_accept($1, $2)`, [qt.id, qt.rev])
check([qt.status, qt.acceptedOn, qt.history[2].kind, qt.history[2].rev], ['accepted', TODAY, 'accepted', 2], 'accepted against v2')
const told = await peek(`SELECT user_id, title FROM public.app_notifications WHERE ref_kind = 'mkt_quote' ORDER BY user_id`)
check(told.map(n => [n.user_id, n.title]), [[U.josiah, `Carres accepted QT-${yymm}-001`]], 'the managers told — whoever marked it too')
check(await j(`SELECT public.mkt_quote_states(ARRAY[$1::uuid])`, [qt.id]), { [qt.id]: { status: 'accepted', tasks: null } }, 'not assigned yet')

// Its work assigned: a quick task a row.
await refuses(`SELECT public.mkt_quote_assign($1, $2)`, [qt.id, JSON.stringify([{ name: 'Reel × 2', team: 'Content', who: null, start: TODAY, due: TODAY }])],
  /Pick someone for every task first/, 'everybody picked')
const due = await peek1(`SELECT ($1::date + 7)::text`, [TODAY])
qt = await j(`SELECT public.mkt_quote_assign($1, $2)`, [qt.id, JSON.stringify([
  { name: 'Reels video × 2', from: 'One-off item · 2 rounds', team: 'Content', who: S.mei, start: TODAY, due, days: 5 },
  { name: 'Reels video × 3', from: 'Social Starter · month 1', team: 'Content', who: S.ali, start: TODAY, due },
])])
check([qt.tasks.length, qt.assignedOn, qt.tasks[0].track.startsWith('TSK-CAR-')], [2, TODAY, true], 'two quick tasks made')
const made = await peek(`SELECT p.title, p.starts_on::text AS s, p.due_on::text AS d, st.owner_staff, st.due_on::text AS sd
                           FROM public.mkt_projects p JOIN public.mkt_stages st ON st.project_id = p.id WHERE p.id = $1`, [qt.tasks[0].project])
check([made[0].title, made[0].s, made[0].d, made[0].owner_staff, made[0].sd], ['Reels video × 2', TODAY, due, S.mei, due], 'its person and its days')
await refuses(`SELECT public.mkt_quote_assign($1, $2)`, [qt.id, JSON.stringify([{ name: 'x', team: 'Content', who: S.mei, start: TODAY, due }])],
  /were assigned on/, 'once')
check(await j(`SELECT public.mkt_quote_states(ARRAY[$1::uuid])`, [qt.id]), { [qt.id]: { status: 'accepted', tasks: 2 } }, 'the bell says assigned')
check(await peek1(`SELECT count(*)::int FROM public.app_notifications WHERE ref_kind = 'mkt_quote' AND read_at IS NULL`), 0, 'its notice read')

// Duplicated: a new draft, its history empty.
const copy = await j(`SELECT public.mkt_quote_duplicate($1)`, [qt.id])
check([copy.status, copy.history.length, copy.lines.length, copy.sub, copy.no === qt.no], ['draft', 0, 2, car, false], 'a duplicate starts at Draft')
check(copy.lines[0].key !== qt.lines[0].key, true, 'its lines keyed anew')

// An outside client: AR - Other on the page; its work waits until it is a client of Marketing's.
let other = await j(`SELECT public.mkt_quote_save(NULL, NULL, $1)`, [JSON.stringify({ other: true, client: 'Acme', lines: [lines[0]] })])
check([other.other, other.client, other.sub], [true, 'Acme', null], 'an outside client named')
other = await j(`SELECT public.mkt_quote_send($1, $2)`, [other.id, other.rev])
other = await j(`SELECT public.mkt_quote_accept($1, $2)`, [other.id, other.rev])
await refuses(`SELECT public.mkt_quote_assign($1, $2)`, [other.id, JSON.stringify([{ name: 'x', team: 'Content', who: S.mei, start: TODAY, due }])],
  /Add “Acme” as a client/, "its work needs a client of Marketing's")

// ── The Product List's own columns (2026-11-12: "管理者可自行增加 column … 关系到 product list 的自动联动") ──────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_item_column_save(NULL, '{"name":"Platform"}')`, [], /manager/, 'the staff add no column')
await as(U.josiah, MANAGER)
const plat = await j(`SELECT public.mkt_item_column_save(NULL, '{"name":"Platform","kind":"choice","options":["Instagram","TikTok"],"client":true}')`)
check([plat.name, plat.kind, plat.options, plat.inProducts, plat.inQuotes, plat.client], ['Platform', 'choice', ['Instagram', 'TikTok'], true, true, true],
  'a column made: what it holds, where it follows the item')
const size = await j(`SELECT public.mkt_item_column_save(NULL, '{"name":"Size"}')`)
check([size.kind, size.client], ['text', false], 'text by default, not the client’s')
await refuses(`SELECT public.mkt_item_column_save(NULL, '{"name":"price"}')`, [], /already/, 'never one of the list’s own columns')
await refuses(`SELECT public.mkt_item_column_save(NULL, '{"name":"platform"}')`, [], /already/, 'a name once')
await refuses(`SELECT public.mkt_item_column_save(NULL, '{"name":"X","options":["A","A"]}')`, [], /twice/, 'an option once')
check((await j(`SELECT public.mkt_item_column_save($1, '{"inQuotes":false,"client":true}')`, [size.id])).client, false, 'the client sees only what follows quotations')
check((await j(`SELECT public.mkt_item_column_save($1, '{"inQuotes":false}')`, [size.id])).client, false, 'off quotations, off the PDF')
await q(`SELECT public.mkt_item_column_save($1, '{"inQuotes":true}')`, [size.id])

const withExtra = await j(`SELECT public.mkt_item_save($1, $2)`, [reel.id, JSON.stringify({ extra: { [plat.id]: 'Instagram', [size.id]: ' 1080 × 1920 ' } })])
check(withExtra.extra, { [plat.id]: 'Instagram', [size.id]: '1080 × 1920' }, 'an item’s values, tidied')
await refuses(`SELECT public.mkt_item_save($1, $2)`, [reel.id, JSON.stringify({ extra: { [plat.id]: 'Facebook' } })], /pick one of its options/, 'a choice is one of its options')
await refuses(`SELECT public.mkt_item_save($1, $2)`, [reel.id, JSON.stringify({ extra: { [id(999)]: 'x' } })], /not on the Product List any more/, 'a column that is there')
const book1 = await j(`SELECT public.mkt_quote_book()`)
check([book1.columns.map(c => c.name), book1.items.find(i => i.id === reel.id).extra[plat.id]], [['Platform', 'Size'], 'Instagram'], 'the reader: columns in order, values')

// A version sent keeps what the item showed; a value changed later is no edit of the quotation.
let q3 = await j(`SELECT public.mkt_quote_save(NULL, NULL, $1)`, [JSON.stringify({ sub: car, lines: [{ ...lines[0], name: 'Reels video' }] })])
q3 = await j(`SELECT public.mkt_quote_send($1, $2)`, [q3.id, q3.rev])
check(q3.history[0].snap.lines[0].extra, [{ name: 'Platform', kind: 'choice', value: 'Instagram', client: true }, { name: 'Size', kind: 'text', value: '1080 × 1920', client: false }],
  'sent: the item’s columns frozen with it')
await q(`SELECT public.mkt_item_save($1, $2)`, [reel.id, JSON.stringify({ extra: { [plat.id]: 'TikTok' } })])
await refuses(`SELECT public.mkt_quote_send($1, $2)`, [q3.id, q3.rev], /Nothing has changed since v1/, 'a Product List value changed is no edit of the quote')
q3 = await j(`SELECT public.mkt_quote_accept($1, $2)`, [q3.id, q3.rev])
check([q3.status, q3.history[0].snap.lines[0].extra[0].value], ['accepted', 'Instagram'], 'accepted; the version sent still shows what it showed')

// An option taken off, a kind changed, a column taken off: the values that no longer fit go.
await q(`SELECT public.mkt_item_column_save($1, '{"options":["Instagram"]}')`, [plat.id])
check(await peek1(`SELECT extra FROM public.mkt_items WHERE id = $1`, [reel.id]), { [size.id]: '1080 × 1920' }, 'an option taken off: its values go')
await q(`SELECT public.mkt_item_column_save($1, '{"kind":"number"}')`, [size.id])
check(await peek1(`SELECT extra FROM public.mkt_items WHERE id = $1`, [reel.id]), {}, 'the kind changed: its values go')
await q(`SELECT public.mkt_item_save($1, $2)`, [reel.id, JSON.stringify({ extra: { [size.id]: 3 } })])
await refuses(`SELECT public.mkt_item_columns_order($1)`, [[plat.id]], /Reload/, 'the order names every column')
await q(`SELECT public.mkt_item_columns_order($1)`, [[size.id, plat.id]])
check((await j(`SELECT public.mkt_quote_book()`)).columns.map(c => c.name), ['Size', 'Platform'], 'the columns in their new order')
await q(`SELECT public.mkt_item_column_delete($1)`, [size.id])
check([await peek1(`SELECT extra FROM public.mkt_items WHERE id = $1`, [reel.id]), (await j(`SELECT public.mkt_quote_book()`)).columns.length], [{}, 1],
  'a column taken off, its values with it')

console.log(`validate-marketing-quotes: ${checks} checks passed`)
