-- ============================================================================
-- 20261008190000_app_wide_audit.sql
-- The app-wide history (2026-10-08): every change people make through the
-- portal is kept — who, when, what it was before and what it became — and
-- each reader sees the part of it their own permissions open.
-- ============================================================================
--
-- User (2026-10-08): 在 portal 里人手改的资料全部要有 audit history（谁、什么
-- 时候、改前/改后）… ERP 自动送进来的大量资料不用逐行记，但人手在上面做的改动要
-- 记 … 旧的 config_audit_log 并进来 … /audit-log 加一个 Changes 页面. And on who
-- reads it: 这个 audit log 基本上就是跟着自己的权限，看到自己应该看到的 audit log
-- 罢了 … Finance 没有 HR 那边的 permission，同样他就不会看到 HR 的 audit log …
-- 跟着自己的 title 和 permission 去隔离这些权限.
--
-- PR1 (20261008120000) began `audit_events` + `audit_row_change()` on the
-- permission tables, the titles and the logins. This takes them everywhere.
--
-- 1. THE REGISTER. `audit_tables` names every table of the app once: what the
--    Changes page calls it, its area, who may read its history (`read_keys` —
--    any one of these permission keys; `audit_log` reads every area), how it
--    is recorded (`mode`), and which of its columns are somebody's pay, NRIC
--    or bank details. The modes:
--      all     every insert, update and delete, whoever makes it;
--      people  only what a signed-in person changes. These are the tables the
--              Houzs ERP feeds — sales orders and their lines, the live batch,
--              the importer's Open Bill suggestions, the ERP's fairs, venues
--              and organisers, the drops / upsells it finds. The feed's own
--              writes are not kept row by row; a person's correction on top
--              of them is (a fair move, a Recost, Don't count, a pick);
--      none    not recorded, and `reason` says why: logs that are a record
--              already, the ERP's catalogue mirror, the statutory schedules,
--              computed outputs rewritten whole, screen layouts.
--    `audit_register()` writes a table's line and attaches its trigger. A new
--    table gets one call in its own migration — `src/lib/audit/
--    registry.test.ts` fails while a table has none, and this migration ends
--    by refusing a database whose tables are not all registered.
--
-- 2. THE TRIGGER reads the register: the row's key, columns whose change alone
--    is no change (updated_at / updated_by / version always), columns never
--    copied (the ERP's raw document, run and close snapshots), UPDATE kept as
--    the changed columns only on the widest tables, and WHO — the signed-in
--    person; else the server (the service role: the ERP feed, a member's
--    invoice upload, which names its person in `actor_column`); else the
--    database (a migration). A payroll voucher — and its sources, attachments,
--    approval request, and the pool rows its payment wrote — is marked as
--    needing Payroll payouts or HR Costing (`needs`), the line Payments,
--    Daily Bank and Dept Pool already draw (lib/payroll-vouchers.ts).
--
-- 3. READING follows the reader's own permissions. Nobody selects
--    `audit_events` directly any more; `audit_changes()` returns the changes
--    to the tables the caller's permissions open, leaves out what needs a key
--    they lack, and blanks the salary / NRIC / bank values their title may not
--    see (`current_sensitive_fields()`: a titled person's template, else what
--    their account kind always saw; salary is the Individual salaries key —
--    PR4 masks the pages by the same rule). So Finance reads Treasury,
--    Payments, Billing, Pools, Accounting; HR reads Payroll, People,
--    Directors, Revenue, Member services; `audit_log` (the Principal) reads
--    every area. A department head's own-department reading waits for PR3
--    (own / dept into RLS) — until then the keys they hold open no history:
--    closed, not guessed.
--
-- 4. THE OLD LOG folds in. `config_audit_log` (Phase 2's settings history:
--    companies, treasury_config, overdue_config, rent / utility splits and
--    fund_sources' status) — its 44 rows are copied in, each original save
--    kept as its own group; its triggers are switched off, so nothing writes
--    it; the table stays, read by nobody, as the copy's source.
--
-- Nothing is dropped here. A trigger is replaced in place (CREATE OR REPLACE
-- TRIGGER), switched off (ALTER TABLE … DISABLE TRIGGER) or its policy closed
-- (ALTER POLICY): what this migration retires stays in the catalog, unused,
-- for a later cleanup — log_config_change() and the old log's eight triggers,
-- and PR1's read policy on audit_events.

-- ─── The guard: the trigger this replaces is the one production runs ───────

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure('public.audit_row_change()');
  IF v_md5 IS NOT NULL AND v_md5 <> 'fdd62bea055c87c3db030b3970d0e326' THEN
    RAISE EXCEPTION 'audit_row_change() changed on the database since this migration was written (md5 %)', v_md5;
  END IF;
END $guard$;

-- ─── The history: two more facts per change ───────────────────────────────

-- As PR1 created it (a no-op where it exists).
CREATE TABLE IF NOT EXISTS public.audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  table_name  text NOT NULL,
  row_key     text,
  op          text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb,
  changed     text[],
  txid        bigint NOT NULL DEFAULT txid_current()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events
  -- portal = a signed-in person; server = the service role (the ERP feed, a
  -- server job); database = no request at all (a migration). NULL: not
  -- recorded (PR1's first rows, the copied config log).
  ADD COLUMN IF NOT EXISTS actor_source text CHECK (actor_source IN ('portal', 'server', 'database')),
  -- Keys one of which a reader must also hold (a payroll voucher's: Payroll
  -- payouts or HR Costing). NULL = the table's readers.
  ADD COLUMN IF NOT EXISTS needs text[];

COMMENT ON TABLE public.audit_events IS
  'Row-level history (2026-10-08): who changed what, before and after. Written only by the trigger audit_row_change(), as audit_tables says; read only through audit_changes() / audit_overview() / permission_history(), which follow the reader''s own permissions.';

CREATE INDEX IF NOT EXISTS audit_events_time ON public.audit_events (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_events_row ON public.audit_events (table_name, row_key, occurred_at DESC);

-- No direct reading: the functions below decide what each reader sees, row
-- by row and column by column, and a policy can only do the first. PR1's
-- policy is closed and the grant taken back.
DO $no_direct_read$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_read') THEN
    EXECUTE 'ALTER POLICY audit_events_read ON public.audit_events USING (false)';
  END IF;
END $no_direct_read$;
REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated;

-- ─── The register ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_tables (
  table_name     text PRIMARY KEY,
  -- What the Changes page calls it, and the area it is filed under.
  label          text NOT NULL,
  area           text NOT NULL CHECK (area IN ('Treasury', 'Payments', 'Billing', 'Pools', 'Accounting', 'Payroll',
                                               'Directors', 'People', 'Revenue', 'Catalogue', 'Member services', 'Settings')),
  mode           text NOT NULL CHECK (mode IN ('all', 'people', 'none')),
  -- Any one of these keys reads the table's history ('audit_log' reads all).
  read_keys      text[] NOT NULL DEFAULT '{}',
  -- The row's key ('{}' = id) and the columns that name it on the page.
  key_columns    text[] NOT NULL DEFAULT '{}',
  label_columns  text[] NOT NULL DEFAULT '{}',
  -- A change to these alone is no change (updated_at / updated_by / version always).
  ignore_columns text[] NOT NULL DEFAULT '{}',
  -- Never copied into the history.
  omit_columns   text[] NOT NULL DEFAULT '{}',
  -- An UPDATE keeps only what changed (+ key and label columns).
  diff_only      boolean NOT NULL DEFAULT false,
  -- Blanked for a reader whose title may not see salary / NRIC / bank details.
  salary_columns text[] NOT NULL DEFAULT '{}',
  nric_columns   text[] NOT NULL DEFAULT '{}',
  bank_columns   text[] NOT NULL DEFAULT '{}',
  -- A row-by-row rule adding keys a reader needs (audit_row_needs()).
  needs_rule     text CHECK (needs_rule IN ('payroll_voucher', 'payroll_pool_row')),
  -- A server write's person, read from the row (a member's upload).
  actor_column   text,
  -- Why a table is not recorded.
  reason         text,
  CHECK (mode <> 'none' OR reason IS NOT NULL),
  CHECK (mode = 'none' OR cardinality(read_keys) > 0)
);

COMMENT ON TABLE public.audit_tables IS
  'Every table of the app, once (2026-10-08): how its changes are recorded in audit_events (all / people / none, and why not), who may read them (read_keys), and which columns are pay, NRIC or bank details. Written by audit_register() in migrations; the Changes page reads the lines the reader''s permissions open.';

ALTER TABLE public.audit_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tables_read ON public.audit_tables
  FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('audit_log')) OR read_keys && (SELECT public.current_permissions()));
REVOKE ALL ON public.audit_tables FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_tables TO authenticated;

-- ─── What the caller's title lets them see of salary, NRIC and bank ───────
-- A titled person: their template's sensitive fields (People › Permissions).
-- Anybody else: what their account kind always saw — the Principal and HR
-- everything, Finance bank details (they pay salaries out). Salary is the one
-- of the three the portal already gates: Individual salaries.

CREATE OR REPLACE FUNCTION public.current_sensitive_fields()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT id, role FROM public.users WHERE id = auth.uid() AND is_active
  ), my_title AS (
    SELECT t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
     WHERE s.user_id = (SELECT id FROM me) LIMIT 1
  ), fields AS (
    SELECT s.field AS f FROM public.permission_template_sensitive s
     WHERE s.template_id = (SELECT template_id FROM my_title)
    UNION
    SELECT k.f FROM me, unnest(CASE me.role::text
        WHEN 'principal' THEN ARRAY['bank', 'nric']
        WHEN 'hr' THEN ARRAY['bank', 'nric']
        WHEN 'finance' THEN ARRAY['bank']
        ELSE '{}'::text[] END) AS k(f)
     WHERE (SELECT template_id FROM my_title) IS NULL
  )
  SELECT coalesce(array_agg(f ORDER BY f), '{}'::text[]) FROM (
    SELECT f FROM fields WHERE f IN ('bank', 'nric')
    UNION
    SELECT 'salary' WHERE 'salary_individual' = ANY (public.current_permissions())
  ) x;
$fn$;

REVOKE ALL ON FUNCTION public.current_sensitive_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_sensitive_fields() TO authenticated;

-- ─── A payroll voucher's history needs Payroll payouts ────────────────────
-- What Payments, Daily Bank, Dept Pool and an approval fold for a reader who
-- may not see one person's pay (lib/payroll-vouchers.ts, 2026-10-02): the
-- vouchers payroll writes, their sources and attachments, the approval request
-- for one, and the pool rows a payment of one wrote ("PV HV-PV-…: Payroll
-- disbursement Aug 2026 — <person>"). Decided when the change is recorded.

CREATE OR REPLACE FUNCTION public.audit_row_needs(p_rule text, p_table text, p_row jsonb)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c_payroll CONSTANT text[] := ARRAY['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'];
  c_needs   CONSTANT text[] := ARRAY['payroll_payouts', 'hr_costing'];
  c_uuid    CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_ref     text;
  v_no      text;
BEGIN
  IF p_rule = 'payroll_voucher' THEN
    IF p_table = 'payment_vouchers' THEN
      v_ref := p_row ->> 'reference_type';
    ELSIF p_table = 'approval_requests' THEN
      IF p_row ->> 'request_type' = 'payment_voucher' AND (p_row ->> 'reference_id') ~ c_uuid THEN
        SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.id = (p_row ->> 'reference_id')::uuid;
      END IF;
    ELSIF (p_row ->> 'voucher_id') ~ c_uuid THEN
      SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.id = (p_row ->> 'voucher_id')::uuid;
    END IF;
    RETURN CASE WHEN v_ref = ANY (c_payroll) THEN c_needs END;
  ELSIF p_rule = 'payroll_pool_row' THEN
    v_no := substring(p_row ->> 'description' FROM '^PV (HV-(?:PV|OR)-[0-9]{6}-[0-9]{4}):');
    IF v_no IS NOT NULL THEN
      SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.voucher_no = v_no LIMIT 1;
      IF FOUND THEN RETURN CASE WHEN v_ref = ANY (c_payroll) THEN c_needs END; END IF;
    END IF;
    RETURN CASE
      WHEN (p_row ->> 'description') ~ '^(PV \S+: )?(Payroll disbursement|Director salary) [A-Z][a-z]{2} [0-9]{4} — '
      THEN c_needs END;
  END IF;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_row_needs(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_row_needs(text, text, jsonb) TO service_role;

-- ─── The trigger: one row of audit_events per row changed ─────────────────

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r         public.audit_tables%ROWTYPE;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_keys    text[];
  v_keep    text[];
  v_key     text;
  v_actor   uuid := auth.uid();
  v_source  text;
  v_needs   text[];
BEGIN
  SELECT * INTO r FROM public.audit_tables WHERE table_name = TG_TABLE_NAME;
  IF r.mode = 'none' THEN RETURN NULL; END IF;
  -- people: a person's change only (the trigger's WHEN says the same).
  IF r.mode = 'people' AND v_actor IS NULL THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
      FROM jsonb_object_keys(v_new) k
     WHERE v_new -> k IS DISTINCT FROM v_old -> k
       AND NOT (k = ANY (ARRAY['updated_at', 'updated_by', 'version'] || coalesce(r.ignore_columns, '{}'::text[])));
    IF v_changed IS NULL THEN RETURN NULL; END IF;
  END IF;
  v_row := coalesce(v_new, v_old);

  IF v_actor IS NOT NULL THEN
    v_source := 'portal';
  ELSIF auth.role() = 'service_role' THEN
    v_source := 'server';
    IF r.actor_column IS NOT NULL
       AND (v_row ->> r.actor_column) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_actor := (v_row ->> r.actor_column)::uuid;
    END IF;
  ELSE
    v_source := 'database';
  END IF;

  v_keys := CASE WHEN coalesce(cardinality(r.key_columns), 0) = 0 THEN ARRAY['id'] ELSE r.key_columns END;
  SELECT string_agg(coalesce(v_row ->> c, ''), ':' ORDER BY ord) INTO v_key
    FROM unnest(v_keys) WITH ORDINALITY AS u(c, ord);

  IF r.needs_rule IS NOT NULL THEN
    v_needs := public.audit_row_needs(r.needs_rule, TG_TABLE_NAME, v_row);
  END IF;

  IF coalesce(cardinality(r.omit_columns), 0) > 0 THEN
    v_old := v_old - r.omit_columns;
    v_new := v_new - r.omit_columns;
  END IF;
  IF TG_OP = 'UPDATE' AND r.diff_only THEN
    v_keep := v_keys || coalesce(r.label_columns, '{}'::text[]) || v_changed;
    SELECT jsonb_object_agg(e.k, e.v) INTO v_old FROM jsonb_each(v_old) AS e(k, v) WHERE e.k = ANY (v_keep);
    SELECT jsonb_object_agg(e.k, e.v) INTO v_new FROM jsonb_each(v_new) AS e(k, v) WHERE e.k = ANY (v_keep);
  END IF;

  INSERT INTO public.audit_events (actor_id, actor_source, table_name, row_key, op, old_row, new_row, changed, needs)
  VALUES (v_actor, v_source, TG_TABLE_NAME, v_key, TG_OP, v_old, v_new, v_changed, v_needs);
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- (Re)attach a table's trigger as its line says — `audit_<table>`, replaced in
-- place; people records only a signed-in person's changes; none switches an
-- existing one off. A table not in this database (registered ahead of it, or
-- the CRM's while it is unmerged) is left for later.
CREATE OR REPLACE FUNCTION public.audit_attach(p_table text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_mode    text;
  v_trigger text := 'audit_' || p_table;
  v_rel     regclass := to_regclass(format('public.%I', p_table));
BEGIN
  SELECT t.mode INTO v_mode FROM public.audit_tables t WHERE t.table_name = p_table;
  IF v_mode IS NULL THEN RAISE EXCEPTION '% has no line in audit_tables', p_table; END IF;
  IF v_rel IS NULL THEN RETURN 'absent'; END IF;
  IF v_mode = 'none' THEN
    IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = v_rel AND g.tgname = v_trigger) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', p_table, v_trigger);
    END IF;
    RETURN 'none';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW %s EXECUTE FUNCTION public.audit_row_change()',
    v_trigger, p_table, CASE WHEN v_mode = 'people' THEN 'WHEN (auth.uid() IS NOT NULL)' ELSE '' END);
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', p_table, v_trigger);
  RETURN v_mode;
END
$fn$;

-- A table's line, written and attached. Migrations call it — one call per new
-- table (src/lib/audit/registry.test.ts holds them to it).
CREATE OR REPLACE FUNCTION public.audit_register(
  p_table        text,
  p_label        text,
  p_area         text,
  p_read         text[],
  p_mode         text DEFAULT 'all',
  p_keys         text[] DEFAULT '{}',
  p_labels       text[] DEFAULT '{}',
  p_ignore       text[] DEFAULT '{}',
  p_omit         text[] DEFAULT '{}',
  p_diff         boolean DEFAULT false,
  p_salary       text[] DEFAULT '{}',
  p_nric         text[] DEFAULT '{}',
  p_bank         text[] DEFAULT '{}',
  p_needs        text DEFAULT NULL,
  p_actor_column text DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.audit_tables AS t (table_name, label, area, mode, read_keys, key_columns, label_columns,
    ignore_columns, omit_columns, diff_only, salary_columns, nric_columns, bank_columns, needs_rule, actor_column, reason)
  VALUES (p_table, p_label, p_area, p_mode, coalesce(p_read, '{}'), coalesce(p_keys, '{}'), coalesce(p_labels, '{}'),
    coalesce(p_ignore, '{}'), coalesce(p_omit, '{}'), coalesce(p_diff, false), coalesce(p_salary, '{}'),
    coalesce(p_nric, '{}'), coalesce(p_bank, '{}'), p_needs, p_actor_column, p_reason)
  ON CONFLICT (table_name) DO UPDATE SET
    label = EXCLUDED.label, area = EXCLUDED.area, mode = EXCLUDED.mode, read_keys = EXCLUDED.read_keys,
    key_columns = EXCLUDED.key_columns, label_columns = EXCLUDED.label_columns,
    ignore_columns = EXCLUDED.ignore_columns, omit_columns = EXCLUDED.omit_columns, diff_only = EXCLUDED.diff_only,
    salary_columns = EXCLUDED.salary_columns, nric_columns = EXCLUDED.nric_columns,
    bank_columns = EXCLUDED.bank_columns, needs_rule = EXCLUDED.needs_rule,
    actor_column = EXCLUDED.actor_column, reason = EXCLUDED.reason;
  RETURN public.audit_attach(p_table);
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_attach(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_register(text, text, text, text[], text, text[], text[], text[], text[], boolean,
  text[], text[], text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_attach(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_register(text, text, text, text[], text, text[], text[], text[], text[], boolean,
  text[], text[], text[], text, text, text) TO service_role;

-- ─── Every table, once ─────────────────────────────────────────────────────

-- Treasury
SELECT public.audit_register('fund_sources', 'Fund IN', 'Treasury', '{treasury}',
  p_labels => '{from_company_id,from_director_id,from_department_id,from_freetext_name,effective_date}');
SELECT public.audit_register('fund_source_repayments', 'Fund IN repayments', 'Treasury', '{treasury}',
  p_labels => '{fund_source_id,payment_date}');
SELECT public.audit_register('loans', 'Fund OUT loans', 'Treasury', '{treasury}', p_labels => '{company_id,disbursement_date}');
SELECT public.audit_register('repayments', 'Loan repayments', 'Treasury', '{treasury}', p_labels => '{loan_id,payment_date}');
SELECT public.audit_register('overdue_records', 'Overdue', 'Treasury', '{treasury}', p_labels => '{loan_id,period_month}');
SELECT public.audit_register('ba_facilities', 'Bank BA', 'Treasury', '{treasury}', p_labels => '{ba_no,bank_name}');
SELECT public.audit_register('ba_limits', 'Bank BA limits', 'Treasury', '{treasury}', p_labels => '{company_id}');
SELECT public.audit_register('ba_attachments', 'Bank BA attachments', 'Treasury', '{treasury}', p_labels => '{ba_id,file_name}');
SELECT public.audit_register('base_rate_history', 'Base rate', 'Treasury', '{treasury,reports}', p_labels => '{quarter}');
SELECT public.audit_register('treasury_terms_history', 'Loan and fund terms (kept)', 'Treasury', '{}', 'none',
  p_reason => 'Written when a loan''s or a fund''s terms change, to keep what they were; the loans and funds themselves are recorded.');

-- Payments
SELECT public.audit_register('payment_vouchers', 'Payments & receipts', 'Payments', '{treasury}',
  p_labels => '{voucher_no,payee_name}', p_needs => 'payroll_voucher');
SELECT public.audit_register('payment_voucher_sources', 'Payment sources', 'Payments', '{treasury}',
  p_labels => '{voucher_id,pool}', p_needs => 'payroll_voucher');
SELECT public.audit_register('payment_attachments', 'Payment attachments', 'Payments', '{treasury}',
  p_labels => '{voucher_id,file_name}', p_needs => 'payroll_voucher');
SELECT public.audit_register('approval_requests', 'Approvals', 'Payments', '{approvals,treasury}',
  p_labels => '{request_type,description}', p_needs => 'payroll_voucher');
SELECT public.audit_register('dept_payment_requests', 'Department payment requests', 'Payments', '{treasury}',
  p_labels => '{department_id,description}');

-- Billing
SELECT public.audit_register('invoices', 'Invoices', 'Billing', '{billing,treasury}', p_labels => '{invoice_no}');
SELECT public.audit_register('invoice_lines', 'Invoice lines', 'Billing', '{billing,treasury}', p_labels => '{invoice_id,line_no}');
SELECT public.audit_register('credit_notes', 'Credit notes', 'Billing', '{billing,treasury}', p_labels => '{credit_note_no}');
SELECT public.audit_register('invoice_submission_requests', 'Invoice requests', 'Billing', '{billing,treasury}',
  p_labels => '{department_id,period_month}');
SELECT public.audit_register('service_contracts', 'Service contracts', 'Billing', '{billing,treasury}',
  p_labels => '{department_id,company_id}');
SELECT public.audit_register('monthly_statements', 'Monthly statements', 'Billing', '{billing,treasury}',
  p_labels => '{company_id,period_month}');
SELECT public.audit_register('monthly_statement_lines', 'Statement lines', 'Billing', '{billing,treasury}',
  p_labels => '{statement_id,description}');
SELECT public.audit_register('alloc_categories', 'Allocator categories', 'Billing', '{billing,treasury}', p_labels => '{name}');
SELECT public.audit_register('alloc_company_settings', 'Allocator companies', 'Billing', '{billing,treasury}',
  p_keys => '{company_id}', p_labels => '{company_id}');
SELECT public.audit_register('alloc_staff', 'Allocator staff', 'Billing', '{billing,treasury}', p_labels => '{name}');
SELECT public.audit_register('alloc_staff_splits', 'Allocator staff splits', 'Billing', '{billing,treasury}',
  p_labels => '{staff_id,company_id}');
SELECT public.audit_register('alloc_templates', 'Allocator templates', 'Billing', '{billing,treasury}', p_labels => '{name}');
SELECT public.audit_register('alloc_template_splits', 'Allocator template splits', 'Billing', '{billing,treasury}',
  p_keys => '{template_id,company_id}', p_labels => '{template_id,company_id}');
SELECT public.audit_register('alloc_txns', 'Allocator records', 'Billing', '{billing,treasury}', p_labels => '{txn_no}');
SELECT public.audit_register('alloc_txn_details', 'Allocator record lines', 'Billing', '{billing,treasury}',
  p_labels => '{txn_id,company_id}');
SELECT public.audit_register('alloc_staff_history', 'Allocator month snapshots', 'Billing', '{}', 'none',
  p_reason => 'The allocator''s snapshot of a month''s staff and splits, rebuilt whole each time the month is recalculated; the staff and splits themselves are recorded.');

-- Pools
SELECT public.audit_register('dept_pools', 'Dept pool', 'Pools', '{treasury}',
  p_labels => '{department_id,period_month}', p_needs => 'payroll_pool_row');
SELECT public.audit_register('venture_pool', 'Venture pool', 'Pools', '{venture_pool,treasury}',
  p_labels => '{transaction_type}', p_needs => 'payroll_pool_row');

-- Accounting
SELECT public.audit_register('journal_entries', 'Journal entries', 'Accounting', '{treasury,reports}', p_labels => '{entry_no}');
SELECT public.audit_register('journal_lines', 'Journal lines', 'Accounting', '{treasury,reports}',
  p_labels => '{entry_id,account_code}');
SELECT public.audit_register('chart_of_accounts', 'Chart of accounts', 'Accounting', '{categories,treasury}',
  p_keys => '{code}', p_labels => '{code,name}');
SELECT public.audit_register('statement_categories', 'Statement categories', 'Accounting', '{categories,treasury}',
  p_keys => '{code}', p_labels => '{code,label}');
SELECT public.audit_register('bank_recon_sessions', 'Reconciliation', 'Accounting', '{reconciliation}',
  p_labels => '{bank_account_id,period_month}');
SELECT public.audit_register('bank_recon_lines', 'Reconciliation lines', 'Accounting', '{reconciliation}',
  p_labels => '{session_id,txn_date}');
SELECT public.audit_register('bank_recon_matches', 'Reconciliation matches', 'Accounting', '{reconciliation}',
  p_labels => '{session_id}');
SELECT public.audit_register('period_locks', 'Period locks', 'Accounting', '{settings}', p_labels => '{period_month}');
SELECT public.audit_register('report_layouts', 'Report layouts', 'Accounting', '{reports}',
  p_keys => '{report_key}', p_labels => '{report_key}');

-- Settings
SELECT public.audit_register('companies', 'Companies', 'Settings', '{settings}', p_labels => '{short_code}');
SELECT public.audit_register('departments', 'Departments', 'Settings', '{settings,categories}', p_labels => '{name}');
-- The balance moves with every payment, each recorded where it happens.
SELECT public.audit_register('bank_accounts', 'Bank accounts', 'Settings', '{settings,treasury}',
  p_labels => '{bank_name,account_number}', p_ignore => '{current_balance}');
SELECT public.audit_register('treasury_config', 'Treasury settings', 'Settings', '{settings}', p_labels => '{config_key}');
SELECT public.audit_register('overdue_config', 'Overdue settings', 'Settings', '{settings}', p_labels => '{stage}');
SELECT public.audit_register('rent_splits', 'Rent splits', 'Settings', '{settings}', p_labels => '{company_id}');
SELECT public.audit_register('utility_splits', 'Utility splits', 'Settings', '{settings}', p_labels => '{company_id}');
SELECT public.audit_register('table_layout_defaults', 'Default table layouts', 'Settings', '{}', 'none',
  p_reason => 'How a table''s columns are laid out for everybody — the screen''s arrangement, not data.');
SELECT public.audit_register('user_table_layouts', 'Personal table layouts', 'Settings', '{}', 'none',
  p_reason => 'A person''s own column layout of a table — the screen''s arrangement, not data.');
SELECT public.audit_register('audit_events', 'Change history', 'Settings', '{}', 'none',
  p_reason => 'The history itself.');
SELECT public.audit_register('access_log', 'Access log', 'Settings', '{}', 'none',
  p_reason => 'Who read what — a record already; it is Audit Log › Access.');
SELECT public.audit_register('config_audit_log', 'Settings history (old)', 'Settings', '{}', 'none',
  p_reason => 'Phase 2''s settings history; its 44 rows were copied into this history on 2026-10-08 and nothing writes it any more.');

-- Payroll
SELECT public.audit_register('hr_monthly_payroll', 'Payroll', 'Payroll', '{hr_costing}',
  p_labels => '{staff_id,period_month}', p_diff => true,
  p_salary => '{basic_salary,statutory_allowance,non_statutory_allowance,ot_hours,ot_amount,commission_amount,unpaid_leave_days,prorata_days_worked,prorata_days_in_month,epf_er,epf_ee,socso_er,socso_ee,eis_er,eis_ee,pcb,gross,net,deduction_amount,skbbk_amount,withholding_tax,commission_balance,basic_pay_net,pcb_override_amount,commission_synced_amount,commission_adjustment_amount,commission_adjustment_reason,pay_line_earnings,pay_line_deductions,epf_er_override_amount,epf_ee_override_amount,socso_er_override_amount,socso_ee_override_amount,eis_er_override_amount,eis_ee_override_amount}');
SELECT public.audit_register('director_monthly_payroll', 'Director payroll', 'Payroll', '{hr_costing,director_salary}',
  p_labels => '{employee_name,period_month}', p_diff => true,
  p_salary => '{basic_salary,statutory_allowance,non_statutory_allowance,ot_amount,commission_amount,no_pay_amount,deduction_amount,skbbk_amount,epf_er,epf_ee,socso_er,socso_ee,eis_er,eis_ee,pcb,gross,net}');
SELECT public.audit_register('payroll_runs', 'Payroll months', 'Payroll', '{hr_costing,payroll_payouts}', p_labels => '{period_month}');
SELECT public.audit_register('payroll_batches', 'Payroll batches', 'Payroll', '{hr_costing,payroll_payouts}',
  p_labels => '{period_month,batch_no}');
SELECT public.audit_register('payroll_batch_lines', 'Payroll batch lines', 'Payroll', '{hr_costing,payroll_payouts}',
  p_labels => '{employee_name,period_month}', p_omit => '{snapshot}',
  p_salary => '{gross,net,epf_er,epf_ee,socso_er,socso_ee,eis_er,eis_ee,pcb,withholding_tax,skbbk,non_statutory_allowance,basic_pay_net,commission_balance,ctc}');
SELECT public.audit_register('payroll_month_closes', 'Payroll month closes', 'Payroll', '{hr_costing}',
  p_keys => '{period_month}', p_labels => '{period_month}');
SELECT public.audit_register('payroll_payment_requests', 'Payroll funding requests', 'Payroll', '{hr_costing,payroll_payouts}',
  p_labels => '{period_month}');
SELECT public.audit_register('payroll_voucher_lines', 'Salary payment lines', 'Payroll', '{hr_costing,payroll_payouts}',
  p_labels => '{employee_name,period_month}', p_salary => '{net}', p_bank => '{recipient_account,bank_name,bank_account_no}');
SELECT public.audit_register('payroll_statutory_voucher_lines', 'Statutory payment lines', 'Payroll', '{hr_costing,payroll_payouts}',
  p_labels => '{employee_name,scheme,period_month}', p_salary => '{amount}');
SELECT public.audit_register('hr_cost_submissions', 'HR cost submissions', 'Payroll', '{hr_costing,treasury}',
  p_labels => '{period_month}', p_omit => '{staff_snapshot,pool_allocation_snapshot,staff_allocation_snapshot}');
SELECT public.audit_register('hr_pool_allocation', 'Pool allocation', 'Payroll', '{hr_costing}',
  p_labels => '{department_id,company_id,period_month}');
SELECT public.audit_register('hr_staff_allocation', 'Billing allocation', 'Payroll', '{hr_costing}',
  p_labels => '{staff_id,company_id,period_month}');
SELECT public.audit_register('monthly_headcounts', 'Headcounts', 'Payroll', '{hr_costing}', p_labels => '{company_id,period_month}');
SELECT public.audit_register('hr_import_templates', 'Payroll import templates', 'Payroll', '{hr_costing}', p_labels => '{template_name}');
SELECT public.audit_register('claims', 'Claims', 'Payroll', '{claims_approve}', p_labels => '{claimant_name,claim_type}');
SELECT public.audit_register('revenue_pay_lines', 'Pay lines', 'Payroll', '{revenue,hr_costing}',
  p_labels => '{staff_id,period_month,kind}', p_salary => '{amount}');
SELECT public.audit_register('revenue_payroll_commission_adjustments', 'Commission adjustments', 'Payroll', '{revenue,hr_costing}',
  p_labels => '{staff_id,period_month}',
  p_salary => '{old_synced_amount,synced_amount,old_adjustment_amount,adjustment_amount,old_gross,gross}');
SELECT public.audit_register('hr_staff_salary_history', 'Basic salary history (kept)', 'Payroll', '{}', 'none',
  p_reason => 'Written by a trigger when a basic salary changes, to keep the old figure; the staff record''s own change is recorded.');
SELECT public.audit_register('pcb_jadual', 'PCB schedule', 'Payroll', '{}', 'none',
  p_reason => 'A statutory schedule loaded whole from the official tables (scripts/seed-statutory.mjs) — not changed through the portal.');
SELECT public.audit_register('epf_third_schedule', 'EPF schedule', 'Payroll', '{}', 'none',
  p_reason => 'A statutory schedule loaded whole from the official tables (scripts/seed-statutory.mjs) — not changed through the portal.');
SELECT public.audit_register('socso_act4_schedule', 'SOCSO schedule', 'Payroll', '{}', 'none',
  p_reason => 'A statutory schedule loaded whole from the official tables (scripts/seed-statutory.mjs) — not changed through the portal.');
SELECT public.audit_register('eis_act800_schedule', 'EIS schedule', 'Payroll', '{}', 'none',
  p_reason => 'A statutory schedule loaded whole from the official tables (scripts/seed-statutory.mjs) — not changed through the portal.');

-- Directors
SELECT public.audit_register('directors', 'Directors', 'Directors', '{director_salary,settings}',
  p_labels => '{code,name}', p_salary => '{min_payout}', p_nric => '{nric,tax_ref_no}');
SELECT public.audit_register('director_ctc', 'Director CTC', 'Directors', '{director_salary}',
  p_labels => '{director_id,company_id,period_month}',
  p_salary => '{basic,kpi,allowance,employer_epf,employer_socso,employer_eis,total_ctc}');
SELECT public.audit_register('director_payouts', 'Director payouts', 'Directors', '{director_salary}',
  p_labels => '{director_id,period_month}', p_omit => '{calculation_snapshot}', p_diff => true,
  p_salary => '{gross_amount,saving_amount,after_saving,payroll_calc,advance_amount,payroll_gross,payroll_bk,payroll_allow,payroll_epf_er,payroll_epf_ee,payroll_socso_er,payroll_socso_ee,payroll_eis_er,payroll_eis_ee,payroll_pcb,payroll_net,payroll_skbbk,invoice_base,invoice_bk,invoice_epf_er,invoice_socso_er,invoice_eis_er,invoice_total,statutory_er_in,statutory_er_out,statutory_surplus,advance_repaid,advance_balance,advance_opening_balance}');
SELECT public.audit_register('director_salary_submissions', 'Director salary submissions', 'Directors', '{director_salary}',
  p_labels => '{period_month}');
SELECT public.audit_register('director_advance_offsets', 'Director advance offsets', 'Directors', '{director_salary}',
  p_labels => '{director_id}', p_salary => '{amount}');
SELECT public.audit_register('invoice_payout_pool', 'Director invoice pool', 'Directors', '{director_salary}',
  p_labels => '{director_id,period_month}', p_salary => '{amount}');
SELECT public.audit_register('dp_settings', 'Director Pool settings', 'Directors', '{director_pool}', p_salary => '{fixed_salary}');
SELECT public.audit_register('dp_companies', 'Director Pool companies', 'Directors', '{director_pool}', p_labels => '{name}');
SELECT public.audit_register('dp_directors', 'Director Pool directors', 'Directors', '{director_pool}', p_labels => '{code,name}');
SELECT public.audit_register('dp_months', 'Director Pool months', 'Directors', '{director_pool}', p_labels => '{month}');
SELECT public.audit_register('dp_inputs', 'Director Pool inputs', 'Directors', '{director_pool}',
  p_labels => '{company_id,month_id}', p_salary => '{salary,kpi,allowance}');
SELECT public.audit_register('dp_director_inputs', 'Director Pool director inputs', 'Directors', '{director_pool}',
  p_labels => '{director_id,month_id}',
  p_salary => '{billing_stat,allow_billing_stat,allow_pay_stat,adv_stat,saving_withdrawal,adv_override_this,adv_override_accum}');
SELECT public.audit_register('dp_fixed_overrides', 'Director Pool fixed salary', 'Directors', '{director_pool}',
  p_labels => '{director_id,from_month}', p_salary => '{salary}');
SELECT public.audit_register('dp_contra', 'Director Pool contra', 'Directors', '{director_pool}',
  p_labels => '{director_id}', p_salary => '{amount}');

-- People
SELECT public.audit_register('hr_staff_costs', 'Staff', 'People', '{team,hr_costing}',
  p_labels => '{employee_code,employee_name}', p_diff => true,
  p_salary => '{basic_salary,allowances,non_statutory_allowance,epf_er,socso_er,eis_er,total_ctc,withholding_rate}',
  p_nric => '{nric}', p_bank => '{bank_name,bank_account_no,bank_name_2,bank_account_no_2}');
SELECT public.audit_register('titles', 'Titles', 'People', '{team}', p_labels => '{name}');
SELECT public.audit_register('title_levels', 'Ladder levels', 'People', '{team}', p_labels => '{name}');
SELECT public.audit_register('users', 'Logins', 'People', '{team,permissions_manage}',
  p_labels => '{name,email}', p_ignore => '{last_seen_at}');
SELECT public.audit_register('permission_templates', 'Permission templates', 'People', '{permissions_manage}', p_labels => '{name}');
SELECT public.audit_register('permission_template_grants', 'Template cells', 'People', '{permissions_manage}',
  p_keys => '{template_id,function_key,action}', p_labels => '{template_id,function_key,action}');
SELECT public.audit_register('permission_template_sensitive', 'Template sensitive fields', 'People', '{permissions_manage}',
  p_keys => '{template_id,field}', p_labels => '{template_id,field}');
SELECT public.audit_register('user_permission_cells', 'Personal cells', 'People', '{permissions_manage}',
  p_keys => '{user_id,function_key,action}', p_labels => '{user_id,function_key,action}');
SELECT public.audit_register('user_permissions', 'Personal permissions (old)', 'People', '{permissions_manage}',
  p_keys => '{user_id,permission_key}', p_labels => '{user_id,permission_key}');
SELECT public.audit_register('title_permissions', 'Title permissions (old)', 'People', '{permissions_manage}',
  p_keys => '{title_id,permission_key}', p_labels => '{title_id,permission_key}');
SELECT public.audit_register('role_default_permissions', 'Account kind defaults', 'People', '{permissions_manage}',
  p_keys => '{role,permission_key}', p_labels => '{role,permission_key}');
SELECT public.audit_register('permission_defs', 'Permission keys', 'People', '{permissions_manage}',
  p_keys => '{key}', p_labels => '{key}');
SELECT public.audit_register('permission_functions', 'Permission functions', 'People', '{permissions_manage}',
  p_keys => '{key}', p_labels => '{label}');
SELECT public.audit_register('permission_cell_keys', 'Cells to keys', 'People', '{permissions_manage}',
  p_keys => '{function_key,action,legacy_key}', p_labels => '{function_key,action,legacy_key}');

-- Revenue: what the ERP feeds — a person's change only
SELECT public.audit_register('sales_orders', 'Sales orders', 'Revenue', '{revenue}', 'people',
  p_labels => '{order_no}', p_omit => '{raw}', p_diff => true);
SELECT public.audit_register('sales_order_lines', 'Sales order lines', 'Revenue', '{revenue}', 'people',
  p_labels => '{order_id,product_code}', p_omit => '{raw,cost_detail}', p_diff => true);
SELECT public.audit_register('sales_import_batches', 'Sales batches', 'Revenue', '{revenue}', 'people',
  p_labels => '{period_month,file_name}', p_ignore => '{last_synced_at}');
SELECT public.audit_register('sales_order_open_bill_tags', 'Open Bill picks', 'Revenue', '{revenue}', 'people',
  p_labels => '{order_id,event_date,bill_rank}');
SELECT public.audit_register('comm_upsales', 'Drops & upsells', 'Revenue', '{revenue}', 'people',
  p_labels => '{staff_id,period_month,erp_doc_no}');
SELECT public.audit_register('comm_venue_events', 'Fairs', 'Revenue', '{revenue}', 'people', p_labels => '{venue_key,start_date}');
SELECT public.audit_register('comm_venues', 'Venues', 'Revenue', '{revenue}', 'people',
  p_keys => '{venue_key}', p_labels => '{display_name}');
SELECT public.audit_register('comm_organisers', 'Organisers', 'Revenue', '{revenue}', 'people', p_labels => '{name}');
-- Revenue: what people decide
SELECT public.audit_register('sales_order_exclusions', 'Bills not counted', 'Revenue', '{revenue}',
  p_keys => '{order_id}', p_labels => '{order_id}');
SELECT public.audit_register('sales_order_brand_picks', 'Bill brands', 'Revenue', '{revenue}',
  p_keys => '{order_id}', p_labels => '{order_id,brand_code}');
SELECT public.audit_register('sales_order_shares', 'Shared bills', 'Revenue', '{revenue}',
  p_keys => '{order_id,staff_id}', p_labels => '{order_id,staff_id}');
SELECT public.audit_register('comm_agent_aliases', 'Salesperson matches', 'Revenue', '{revenue}',
  p_labels => '{agent_name_sample,staff_id}');
SELECT public.audit_register('comm_ignored_agents', 'Not ours', 'Revenue', '{revenue}', p_labels => '{agent_name_sample}');
SELECT public.audit_register('comm_double_claim_dismissals', 'Double claims checked', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id,bill_ref}', p_labels => '{bill_ref}');
SELECT public.audit_register('comm_schemes', 'Commission schemes', 'Revenue', '{revenue}', p_labels => '{scheme_name}');
SELECT public.audit_register('comm_sub_departments', 'Sub-departments', 'Revenue', '{revenue}', p_labels => '{name}');
SELECT public.audit_register('comm_sub_department_directors', 'Sub-department directors', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id,staff_id}', p_labels => '{sub_department_id,staff_id}');
SELECT public.audit_register('comm_hierarchy', 'Commission line', 'Revenue', '{revenue}', p_labels => '{staff_id,scheme_id}');
SELECT public.audit_register('comm_ranks', 'Title ladder', 'Revenue', '{revenue}', p_labels => '{scheme_id,label}');
SELECT public.audit_register('comm_rank_defs', 'Ranks', 'Revenue', '{revenue}', p_labels => '{scheme_id,label}');
SELECT public.audit_register('comm_promotion_rules', 'Promotion rules', 'Revenue', '{revenue}',
  p_labels => '{from_rank_key,to_rank_key}');
SELECT public.audit_register('comm_title_promotions', 'Title promotions', 'Revenue', '{revenue}', p_labels => '{staff_id,period_month}');
SELECT public.audit_register('comm_margin_bands', 'Margin bands', 'Revenue', '{revenue}', p_labels => '{brand_id,label}');
SELECT public.audit_register('comm_brands', 'Brands', 'Revenue', '{revenue}', p_labels => '{code}');
SELECT public.audit_register('comm_item_groups', 'Item groups', 'Revenue', '{revenue}', p_labels => '{item_group}');
SELECT public.audit_register('comm_kpi_items', 'KPI items', 'Revenue', '{revenue}', p_labels => '{product_code,option_value}');
SELECT public.audit_register('comm_kpi_thresholds', 'KPI thresholds', 'Revenue', '{revenue}', p_labels => '{tier_label}');
SELECT public.audit_register('comm_open_bill_rules', 'Open Bill rules', 'Revenue', '{revenue}', p_labels => '{bill_rank}');
SELECT public.audit_register('comm_open_bill_months', 'Open Bill by month', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id,period_month}', p_labels => '{sub_department_id,period_month}');
SELECT public.audit_register('comm_cutovers', 'Portal pays from', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id}', p_labels => '{sub_department_id}');
SELECT public.audit_register('comm_director_pay', 'Revenue director pay', 'Revenue', '{revenue}',
  p_keys => '{scheme_id,staff_id}', p_labels => '{staff_id}', p_salary => '{fixed_amount,incentive_amount}');
SELECT public.audit_register('comm_direct_line_entitlements', 'Direct-line entitlements', 'Revenue', '{revenue}',
  p_keys => '{scheme_id,staff_id}', p_labels => '{staff_id}', p_salary => '{group_incentive,group_breakdown}');
SELECT public.audit_register('comm_direct_line_expansion_awards', 'Direct-line awards', 'Revenue', '{revenue}',
  p_keys => '{scheme_id,staff_id,direct_line_limit}', p_labels => '{staff_id,direct_line_limit}',
  p_salary => '{group_incentive,group_breakdown}');
SELECT public.audit_register('comm_runs', 'Commission runs', 'Revenue', '{revenue}',
  p_labels => '{sub_department_id,period_month}', p_omit => '{released_orders,deferred_orders,penalised_orders}');
SELECT public.audit_register('comm_salesperson_closes', 'Salesperson closes', 'Revenue', '{revenue}',
  p_labels => '{staff_id,period_month}',
  p_omit => '{summary,statement,released_orders,deferred_orders,penalised_orders,order_ids}',
  p_salary => '{total_commission,personal_commission,override_commission,group_incentive}');
SELECT public.audit_register('erp_feed_closed_months', 'Months closed to the ERP', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id,period_month}', p_labels => '{sub_department_id,period_month}');
SELECT public.audit_register('erp_feed_settings', 'ERP feed window', 'Revenue', '{revenue}',
  p_keys => '{sub_department_id}', p_labels => '{sub_department_id}');
SELECT public.audit_register('erp_links', 'ERP link', 'Revenue', '{revenue}', p_keys => '{sub_department_id}', p_labels => '{sub_department_id}');
SELECT public.audit_register('commission_inputs', 'Commission inputs (old)', 'Revenue', '{revenue}', p_labels => '{staff_id,period_month}');
SELECT public.audit_register('commission_rules', 'Commission rules (old)', 'Revenue', '{revenue}', p_labels => '{rule_name}');
-- Revenue: not recorded
SELECT public.audit_register('comm_order_releases', 'Bills released', 'Revenue', '{}', 'none',
  p_reason => 'Written by a run or a close to say which bills it paid; the run and the close are recorded.');
SELECT public.audit_register('comm_statements', 'Commission statements', 'Revenue', '{}', 'none',
  p_reason => 'A run''s computed statements, rewritten whole every time the run is computed; the run is recorded.');
SELECT public.audit_register('comm_statement_lines', 'Commission statement lines', 'Revenue', '{}', 'none',
  p_reason => 'A run''s computed statements, rewritten whole every time the run is computed; the run is recorded.');
SELECT public.audit_register('comm_statement_brand_margins', 'Statement brand margins', 'Revenue', '{}', 'none',
  p_reason => 'A run''s computed statements, rewritten whole every time the run is computed; the run is recorded.');
SELECT public.audit_register('erp_sync_events', 'ERP deliveries', 'Revenue', '{}', 'none',
  p_reason => 'The ERP feed''s delivery log — every delivery kept with its payload, a record already.');
SELECT public.audit_register('_recost_backup_20260916', 'Recost backup (2026-09-16)', 'Revenue', '{}', 'none',
  p_reason => 'A one-off copy taken before the 2026-09-16 recost; not part of the app.');

-- Catalogue (the Product List)
SELECT public.audit_register('catalogue_skus', 'SKU prices', 'Catalogue', '{product_list}',
  p_keys => '{erp_product_id}', p_labels => '{erp_product_id}');
SELECT public.audit_register('catalogue_models', 'Modular', 'Catalogue', '{product_list}',
  p_keys => '{erp_model_id}', p_labels => '{erp_model_id}');
SELECT public.audit_register('catalogue_option_prices', 'Maintenance prices', 'Catalogue', '{product_list}',
  p_keys => '{erp_company_id,pool,value}', p_labels => '{pool,value}');
SELECT public.audit_register('catalogue_combos', 'Combos', 'Catalogue', '{product_list}', p_labels => '{base_model,label}');
SELECT public.audit_register('catalogue_combo_prices', 'Combo prices', 'Catalogue', '{product_list}',
  p_keys => '{erp_company_id,base_model,slots_key,tier}', p_labels => '{base_model,slots_key,tier}');
SELECT public.audit_register('comm_cost_ratios', 'Costing ratios', 'Catalogue', '{product_list}',
  p_keys => '{scheme_id,erp_product_id}', p_labels => '{product_code}');
SELECT public.audit_register('comm_products', 'Product list (old)', 'Catalogue', '{product_list}', p_labels => '{item_code}');
SELECT public.audit_register('member_product_options', 'Member product options (old)', 'Catalogue', '{product_list}',
  p_keys => '{product_id}', p_labels => '{product_id}');
SELECT public.audit_register('erp_products', 'ERP SKU master', 'Catalogue', '{}', 'none',
  p_reason => 'The ERP''s catalogue, mirrored: written only by the feed (ingest_erp_catalogue). What the portal decides about it — prices, ticks — is recorded.');
SELECT public.audit_register('erp_product_models', 'ERP models', 'Catalogue', '{}', 'none',
  p_reason => 'The ERP''s catalogue, mirrored: written only by the feed (ingest_erp_catalogue). What the portal decides about it — prices, ticks — is recorded.');
SELECT public.audit_register('erp_maintenance_options', 'ERP maintenance options', 'Catalogue', '{}', 'none',
  p_reason => 'The ERP''s catalogue, mirrored: written only by the feed (ingest_erp_catalogue). What the portal decides about it — prices, ticks — is recorded.');
SELECT public.audit_register('erp_fabrics', 'ERP fabrics', 'Catalogue', '{}', 'none',
  p_reason => 'The ERP''s catalogue, mirrored: written only by the feed (ingest_erp_catalogue). What the portal decides about it — prices, ticks — is recorded.');
SELECT public.audit_register('erp_sofa_combos', 'ERP sofa combos', 'Catalogue', '{}', 'none',
  p_reason => 'The ERP''s catalogue, mirrored: written only by the feed (ingest_erp_catalogue). What the portal decides about it — prices, ticks — is recorded.');

-- Member services
SELECT public.audit_register('member_requests', 'Member requests', 'Member services', '{member_requests_manage}',
  p_labels => '{request_no,title}');
-- Uploaded by the server after it checked the file; the row names the member.
SELECT public.audit_register('member_request_attachments', 'Request attachments', 'Member services', '{member_requests_manage}',
  p_labels => '{request_id}', p_actor_column => 'uploaded_by');
SELECT public.audit_register('member_claim_rates', 'Claim rates', 'Member services', '{member_requests_manage}', p_labels => '{base_name}');
SELECT public.audit_register('member_claim_regions', 'Claim regions', 'Member services', '{member_requests_manage}', p_labels => '{name}');
SELECT public.audit_register('member_claim_venue_regions', 'Venue regions', 'Member services', '{member_requests_manage}',
  p_keys => '{venue_key}', p_labels => '{venue_key}');
SELECT public.audit_register('member_memos', 'Memos', 'Member services', '{member_memos_manage}', p_labels => '{title}');
SELECT public.audit_register('member_memo_audiences', 'Memo audiences', 'Member services', '{member_memos_manage}',
  p_keys => '{memo_id,sub_department_id}', p_labels => '{memo_id,sub_department_id}');
-- weeks / counts follow from the picks on save.
SELECT public.audit_register('member_arena_brand_weeks', 'Brand weeks', 'Member services', '{member_requests_manage,revenue}',
  p_keys => '{staff_id,sub_department_id,period_month}', p_labels => '{staff_id,period_month}', p_ignore => '{counts,weeks}');
SELECT public.audit_register('member_department_capacity', 'Team capacity', 'Member services', '{revenue,member_requests_manage}',
  p_keys => '{sub_department_id}', p_labels => '{sub_department_id}');
SELECT public.audit_register('member_request_events', 'Request history', 'Member services', '{}', 'none',
  p_reason => 'Each request''s own history (from → to, who, note), written by trigger; the request itself is recorded.');
SELECT public.audit_register('member_memo_receipts', 'Memo receipts', 'Member services', '{}', 'none',
  p_reason => 'A member''s own read / acknowledged mark — the receipt is itself the record of who and when.');
SELECT public.audit_register('member_honours', 'Kept honours', 'Member services', '{}', 'none',
  p_reason => 'A closed month''s finishes kept by the server and forgotten when the month changes — worked out again from the bills.');
SELECT public.audit_register('member_honour_months', 'Kept honour months', 'Member services', '{}', 'none',
  p_reason => 'A closed month''s finishes kept by the server and forgotten when the month changes — worked out again from the bills.');
SELECT public.audit_register('member_queue_runs', 'Queue sweeps', 'Member services', '{}', 'none',
  p_reason => 'The request queue sweep''s own run log (a machine job).');
-- The CRM's tables are on production while its code is not merged.
SELECT public.audit_register(t, t, 'Member services', '{}', 'none',
  p_reason => 'The CRM (member-crm) is not merged; whoever lands it registers these tables with its migration.')
  FROM unnest(ARRAY['crm_appointments', 'crm_assign_rules', 'crm_channel_events', 'crm_contacts', 'crm_messages',
                    'crm_role_map', 'crm_showrooms', 'crm_staff', 'crm_team_settings']) AS t;

-- The register itself, last — so its own lines above are not each a change.
SELECT public.audit_register('audit_tables', 'Audit register', 'Settings', '{audit_log}',
  p_keys => '{table_name}', p_labels => '{table_name}');

-- ─── The old log, folded in ────────────────────────────────────────────────
-- Copied first, as it stands: each original save (one changed_at) keeps a
-- group of its own (a negative txid nothing real can have), its key becomes
-- the row id the new trigger keys these tables by, and a change of nothing
-- (one treasury_config save) is kept as such.

INSERT INTO public.audit_events (occurred_at, actor_id, actor_source, table_name, row_key, op, old_row, new_row, changed, txid)
SELECT c.changed_at, c.changed_by, NULL, c.table_name, coalesce(c.new_values ->> 'id', c.row_key),
       CASE WHEN c.old_values = '{}'::jsonb THEN 'INSERT' ELSE 'UPDATE' END,
       nullif(c.old_values, '{}'::jsonb), c.new_values,
       CASE WHEN c.old_values = '{}'::jsonb THEN NULL ELSE
         coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(c.new_values) k
                    WHERE c.new_values -> k IS DISTINCT FROM c.old_values -> k
                      AND k NOT IN ('updated_at', 'updated_by', 'version')), '{}'::text[]) END,
       -dense_rank() OVER (ORDER BY c.changed_at)
  FROM public.config_audit_log c
 WHERE NOT EXISTS (SELECT 1 FROM public.audit_events e WHERE e.txid < 0);

-- Then nothing writes it: every trigger that did is switched off.
DO $fold$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT g.tgname, c.relname
      FROM pg_trigger g
      JOIN pg_class c ON c.oid = g.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = g.tgfoid
     WHERE n.nspname = 'public' AND p.proname = 'log_config_change' AND NOT g.tgisinternal AND g.tgenabled <> 'D'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.relname, r.tgname);
  END LOOP;
END $fold$;

DO $old_log$
BEGIN
  IF to_regclass('public.config_audit_log') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.config_audit_log FROM PUBLIC, anon, authenticated';
    EXECUTE $c$COMMENT ON TABLE public.config_audit_log IS 'SUPERSEDED 2026-10-08 by audit_events (mig 20261008190000): its rows were copied there; its triggers are switched off and nothing reads it.'$c$;
  END IF;
  IF to_regprocedure('public.log_config_change()') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON FUNCTION public.log_config_change() IS 'SUPERSEDED 2026-10-08 by audit_row_change() (mig 20261008190000); its triggers are switched off.'$c$;
  END IF;
END $old_log$;

-- ─── Reading it: what the caller's own permissions open ───────────────────

-- The changes, newest first, a page at a time (p_before = the last id of the
-- page before). Only tables the caller's keys open; what a change `needs` and
-- the caller lacks left out; salary / NRIC / bank values blanked — their
-- column names listed in `masked` — unless the caller may see them.
CREATE OR REPLACE FUNCTION public.audit_changes(
  p_tables text[] DEFAULT NULL,
  p_actor  uuid DEFAULT NULL,
  p_system boolean DEFAULT false,
  p_from   timestamptz DEFAULT NULL,
  p_to     timestamptz DEFAULT NULL,
  p_row    text DEFAULT NULL,
  p_before bigint DEFAULT NULL,
  p_limit  integer DEFAULT 100
)
RETURNS TABLE (
  id bigint, occurred_at timestamptz, actor_id uuid, actor_name text, actor_source text, table_name text,
  row_key text, op text, old_row jsonb, new_row jsonb, changed text[], masked text[], txid bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_perms  text[];
  v_fields text[];
  v_at     timestamptz;
  v_sql    text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_perms := public.current_permissions();
  v_fields := public.current_sensitive_fields();
  IF p_before IS NOT NULL THEN
    SELECT e.occurred_at INTO v_at FROM public.audit_events e WHERE e.id = p_before;
  END IF;
  v_sql := $q$
    SELECT e.id, e.occurred_at, e.actor_id,
           CASE WHEN e.actor_id IS NULL THEN NULL ELSE coalesce(u.name, u.email, 'Removed account') END,
           e.actor_source, e.table_name, e.row_key, e.op,
           e.old_row - m.hide, e.new_row - m.hide, e.changed,
           ARRAY(SELECT c FROM unnest(m.hide) AS c
                  WHERE coalesce(e.old_row ? c, false) OR coalesce(e.new_row ? c, false) ORDER BY c),
           e.txid
      FROM public.audit_events e
      JOIN public.audit_tables t ON t.table_name = e.table_name
      LEFT JOIN public.users u ON u.id = e.actor_id
     CROSS JOIN LATERAL (SELECT
              CASE WHEN 'salary' = ANY ($2) THEN '{}'::text[] ELSE t.salary_columns END
           || CASE WHEN 'nric' = ANY ($2) THEN '{}'::text[] ELSE t.nric_columns END
           || CASE WHEN 'bank' = ANY ($2) THEN '{}'::text[] ELSE t.bank_columns END AS hide) m
     WHERE ('audit_log' = ANY ($1) OR t.read_keys && $1)
       AND (e.needs IS NULL OR e.needs && $1)$q$;
  IF p_tables IS NOT NULL THEN v_sql := v_sql || ' AND e.table_name = ANY ($3)'; END IF;
  IF p_actor IS NOT NULL THEN v_sql := v_sql || ' AND e.actor_id = $4'; END IF;
  IF p_system THEN v_sql := v_sql || ' AND e.actor_id IS NULL'; END IF;
  IF p_from IS NOT NULL THEN v_sql := v_sql || ' AND e.occurred_at >= $5'; END IF;
  IF p_to IS NOT NULL THEN v_sql := v_sql || ' AND e.occurred_at < $6'; END IF;
  IF p_row IS NOT NULL THEN v_sql := v_sql || ' AND e.row_key = $7'; END IF;
  IF v_at IS NOT NULL THEN v_sql := v_sql || ' AND (e.occurred_at, e.id) < ($8, $9)'; END IF;
  v_sql := v_sql || ' ORDER BY e.occurred_at DESC, e.id DESC LIMIT $10';
  RETURN QUERY EXECUTE v_sql
    USING v_perms, v_fields, p_tables, p_actor, p_from, p_to, p_row, v_at, p_before,
          least(greatest(coalesce(p_limit, 100), 1), 500);
END
$fn$;

-- The page's summary: saves today, changes and people this week, and who has
-- changed something the caller may read (the Who filter) — the last 400 days.
CREATE OR REPLACE FUNCTION public.audit_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_perms text[];
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kuala_Lumpur') AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_week  timestamptz := now() - interval '7 days';
  v_out   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  v_perms := public.current_permissions();
  WITH visible AS (
    SELECT e.occurred_at AS at, e.actor_id AS actor, e.txid AS tx
      FROM public.audit_events e
      JOIN public.audit_tables t ON t.table_name = e.table_name
     WHERE ('audit_log' = ANY (v_perms) OR t.read_keys && v_perms)
       AND (e.needs IS NULL OR e.needs && v_perms)
       AND e.occurred_at >= now() - interval '400 days'
  )
  SELECT jsonb_build_object(
    'saves_today', (SELECT count(DISTINCT tx) FROM visible WHERE at >= v_today),
    'changes_week', (SELECT count(*) FROM visible WHERE at >= v_week),
    'people_week', (SELECT count(DISTINCT actor) FROM visible WHERE at >= v_week AND actor IS NOT NULL),
    'last_at', (SELECT max(at) FROM visible),
    'actors', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.actor, 'name', coalesce(u.name, u.email, 'Removed account'))
                       ORDER BY coalesce(u.name, u.email, 'Removed account'))
        FROM (SELECT DISTINCT actor FROM visible WHERE actor IS NOT NULL) a
        LEFT JOIN public.users u ON u.id = a.actor), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_changes(text[], uuid, boolean, timestamptz, timestamptz, text, bigint, integer),
  public.audit_overview()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_changes(text[], uuid, boolean, timestamptz, timestamptz, text, bigint, integer),
  public.audit_overview()
  TO authenticated;

-- ─── The check: every table registered, every recorded table triggered ────

DO $check$
DECLARE
  v_missing     text;
  v_untriggered text;
  v_old_writers text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
     AND NOT EXISTS (SELECT 1 FROM public.audit_tables t WHERE t.table_name = c.relname);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables with no line in audit_tables: %', v_missing;
  END IF;
  SELECT string_agg(t.table_name, ', ' ORDER BY t.table_name) INTO v_untriggered
    FROM public.audit_tables t
   WHERE t.mode <> 'none'
     AND to_regclass(format('public.%I', t.table_name)) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger g
                      WHERE g.tgrelid = to_regclass(format('public.%I', t.table_name))
                        AND g.tgname = 'audit_' || t.table_name AND g.tgenabled <> 'D');
  IF v_untriggered IS NOT NULL THEN
    RAISE EXCEPTION 'Recorded tables without their trigger switched on: %', v_untriggered;
  END IF;
  SELECT string_agg(g.tgname, ', ') INTO v_old_writers
    FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid
   WHERE p.proname = 'log_config_change' AND g.tgenabled <> 'D';
  IF v_old_writers IS NOT NULL THEN
    RAISE EXCEPTION 'The old settings log is still written by: %', v_old_writers;
  END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
