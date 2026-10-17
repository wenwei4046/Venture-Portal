-- ============================================================================
-- 20261017160000_dept_manager_gone.sql
-- The Dept Manager goes from the database (2026-10-17 — the user: "全删：连程序一起拿掉"; each department gets a
-- view of its own later, as Finance and HR have). The data went first (20261017140000: the Department head
-- template, the kind's role defaults, marketing@ closed), so nobody holds the kind or any department reach while
-- what served them goes:
-- 1. current_actions() — an untemplated account's keys are every one at All (the CASE that gave a dept_manager
--    Dept Pool, OPEX, My Billing, Department reports and Claims at Dept is gone). Production's body, the one
--    expression swapped (pg_temp.swap_in refuses unless it is there exactly once).
-- 2. The ten policies the kind's department pages read and wrote through (approvals, Dept Pool requests, the pool,
--    invoice requests, invoices, the journal) are dropped; Dept Pool's and service contracts' own-department
--    branches go from their policies. Whoever reads them company-wide reads them as before (treasury, Dept Pool
--    at All).
-- 3. My Billing's two requests, submit_dept_payment_request() and submit_invoice_request(), are dropped (their
--    forms went with the kind); dept_invoice_settlements() and mint_invoice_no() stop naming My Billing.
-- 4. The `my_billing` key and function are retired (registry rows, the two full-access templates' cells), and
--    every table registry that named it is seeded again without it (the TS twins: permission-table-reads.ts,
--    permission-table-writes.ts), its guards rebuilt. Dept Pool, OPEX and Department reports offer All only.
-- 5. The tab registry loses /my-billing and the Department view's own-department boxes (Dept Pool, OPEX, My
--    Billing, Claims, Reports, People at Dept) and pri.my_billing, by name (not seeded whole — see there).
-- 6. The kind cannot come back: users.role and permission_templates.base_role refuse 'dept_manager' (the enum
--    keeps the label — access_log's 64 rows of marketing@ are history and are not rewritten).

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'dept_manager') THEN
    RAISE EXCEPTION 'A Dept Manager login is still there — run 20261017140000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permission_templates WHERE base_role = 'dept_manager') THEN
    RAISE EXCEPTION 'A template of the Dept Manager kind is still there — run 20261017140000 first';
  END IF;
END
$guard$;

-- The one part of a live function this migration changes, swapped in production's own body (mig 20261009030000's
-- swap_check, the same way): refused unless the old part is there exactly once; a second run is a no-op.
CREATE OR REPLACE FUNCTION pg_temp.swap_in(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old part, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the part this migration changes is there % times, not once — production changed since it was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. current_actions(): every key at All ──────────────────────────────────

SELECT pg_temp.swap_in('public.current_actions()',
  $q$CASE WHEN (SELECT role FROM me)::text = 'dept_manager'
                 AND k.function_key IN ('dept_pool', 'opex', 'my_billing', 'dept_reports', 'claims')
                THEN 'dept' ELSE 'all' END$q$,
  $q$'all' /* every key at All: the Dept Manager's department reach went with the kind (2026-10-17) */$q$);

-- ── 2. The kind's policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS approvals_dept_manager_own_expense_select ON public.approval_requests;
DROP POLICY IF EXISTS dpr_dept_manager_select_own ON public.dept_payment_requests;
DROP POLICY IF EXISTS dept_pools_dept_manager_insert ON public.dept_pools;
DROP POLICY IF EXISTS isr_dept_manager_select_own ON public.invoice_submission_requests;
DROP POLICY IF EXISTS invoices_dept_manager_select ON public.invoices;
DROP POLICY IF EXISTS invoices_dept_manager_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_dept_manager_update ON public.invoices;
DROP POLICY IF EXISTS invoices_dept_manager_delete ON public.invoices;
DROP POLICY IF EXISTS journal_entries_dept_manager_select ON public.journal_entries;
DROP POLICY IF EXISTS journal_lines_dept_manager_select ON public.journal_lines;

-- Dept Pool: the treasury, or Dept Pool at All (the own-department branch went).
DROP POLICY IF EXISTS dept_pools_pf_select ON public.dept_pools;
CREATE POLICY dept_pools_pf_select ON public.dept_pools FOR SELECT TO authenticated
  USING ((SELECT public.has_scope(ARRAY['treasury'])) OR (SELECT public.has_action('dept_pool', 'view', 'all')));

-- Service contracts: the treasury's (My Billing's own-department branch went).
DROP POLICY IF EXISTS service_contracts_insert ON public.service_contracts;
CREATE POLICY service_contracts_insert ON public.service_contracts FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_scope(ARRAY['treasury'])));
DROP POLICY IF EXISTS service_contracts_pf_select ON public.service_contracts;
CREATE POLICY service_contracts_pf_select ON public.service_contracts FOR SELECT TO authenticated
  USING ((SELECT public.has_scope(ARRAY['treasury'])));

-- ── 3. My Billing's functions ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.submit_dept_payment_request(uuid, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.submit_invoice_request(date, date, date, text, text, jsonb);

SELECT pg_temp.swap_in('public.dept_invoice_settlements(public.gl_segment)',
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'my_billing.view', 'billing.view']) THEN v_seg := COALESCE(p_segment, 'marketing'::gl_segment); ELSIF public.has_any_action(ARRAY['dept_reports.view:dept', 'my_billing.view:dept']) THEN v_seg := public.current_user_segment(); ELSE RAISE EXCEPTION 'dept_invoice_settlements: needs Department reports, My Billing or Billing · View' USING ERRCODE = '42501';$q$,
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'billing.view']) THEN v_seg := COALESCE(p_segment, 'marketing'::gl_segment); ELSE RAISE EXCEPTION 'dept_invoice_settlements: needs Department reports or Billing · View' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_in('public.mint_invoice_no(date)',
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create', 'my_billing.create:dept']) THEN RAISE EXCEPTION 'mint_invoice_no: needs Billing · Create or My Billing · Create (Dept)' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create']) THEN RAISE EXCEPTION 'mint_invoice_no: needs Billing · Create' USING ERRCODE = '42501';$q$);

-- ── 4. The my_billing key and function ──────────────────────────────────────
-- (permission_key_actions holds them without a cascade; the function's and the key's rows take the rest with them:
-- the cell keys, the two full-access templates' four cells, any person's cells, role defaults, title rows.)

DELETE FROM public.permission_key_actions WHERE legacy_key = 'my_billing';
DELETE FROM public.permission_functions WHERE key = 'my_billing';
DELETE FROM public.permission_defs WHERE key = 'my_billing';

-- ── 4c. The reach only the kind used ────────────────────────────────────────
-- Dept Pool, OPEX and Department reports opened ONE department at Dept for the Dept Manager alone; their pages
-- read at All now (readsEveryPool, OPEX's switcher, reportsCompanyWide), so the matrix stops offering Dept.
-- Nobody holds it below All (no template grant, no person's cell — refused here if somebody does).
DO $reach$
BEGIN
  IF EXISTS (SELECT 1 FROM public.permission_template_grants
              WHERE function_key IN ('dept_pool', 'opex', 'dept_reports') AND scope IN ('own', 'dept'))
     OR EXISTS (SELECT 1 FROM public.user_permission_cells
              WHERE function_key IN ('dept_pool', 'opex', 'dept_reports') AND scope IN ('own', 'dept')) THEN
    RAISE EXCEPTION 'Dept Pool, OPEX or Department reports is held below All — decide it before the reach goes';
  END IF;
END
$reach$;
UPDATE public.permission_functions SET scopes = ARRAY['all'] WHERE key IN ('dept_pool', 'opex', 'dept_reports');
UPDATE public.permission_functions
   SET description = 'P&L, Cash Flow, Receipt & Payment and Debtor Aging — with Reports · View.'
 WHERE key = 'dept_reports';

-- The boxes that went (none stored on production 2026-10-17).
DELETE FROM public.permission_template_tabs
 WHERE tab_id IN ('pri.my_billing', 'dept.my_billing', 'dept.dept_pool', 'dept.opex', 'dept.claims', 'dept.reports', 'dept.people');
DELETE FROM public.user_permission_tabs
 WHERE tab_id IN ('pri.my_billing', 'dept.my_billing', 'dept.dept_pool', 'dept.opex', 'dept.claims', 'dept.reports', 'dept.people');

-- ── 4b and 5. The registries ────────────────────────────────────────────────
INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('approval_requests', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.edit', 'claims.approve', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('bank_accounts', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.view', 'categories.view', 'claims.approve', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.view', 'reports.export', 'reports.view', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'venture_pool.view']),
  ('credit_notes', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_reports.export', 'dept_reports.view', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void']),
  ('dept_payment_requests', ARRAY['approvals.approve', 'dept_pool.view', 'reconciliation.create', 'reconciliation.edit', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.view', 'treasury.void']),
  ('dept_pools', ARRAY['approvals.approve', 'billing.create', 'dept_pool.view', 'dept_reports.export', 'dept_reports.view', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('fund_sources', ARRAY['approvals.approve', 'approvals.view', 'categories.view', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('hr_monthly_payroll', ARRAY['approvals.approve', 'approvals.view', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.view:own', 'treasury.approve', 'treasury.view']),
  ('hr_staff_costs', ARRAY['accounts.create', 'accounts.manage', 'accounts.view', 'approvals.approve', 'approvals.view', 'billing.edit', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own', 'team.create', 'team.edit', 'team.view:own', 'treasury.approve', 'treasury.view']),
  ('invoice_lines', ARRAY['billing.create', 'billing.edit', 'billing.export', 'billing.view', 'dept_pool.view', 'treasury.create']),
  ('invoice_submission_requests', ARRAY['billing.create', 'billing.edit', 'billing.view', 'billing.void', 'dept_pool.view']),
  ('invoices', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view', 'dept_reports.export', 'dept_reports.view', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('journal_entries', ARRAY['billing.void', 'categories.manage', 'dept_pool.view', 'dept_reports.export', 'dept_reports.view', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view']),
  ('journal_lines', ARRAY['billing.void', 'categories.manage', 'dept_pool.view', 'dept_reports.export', 'dept_reports.view', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reconciliation.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.export', 'treasury.view', 'treasury.void', 'venture_pool.view']),
  ('loans', ARRAY['approvals.approve', 'approvals.view', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('payment_voucher_sources', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'claims.approve', 'dept_pool.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('payment_vouchers', ARRAY['approvals.approve', 'approvals.view', 'billing.create', 'billing.export', 'billing.view', 'billing.void', 'claims.approve', 'dept_pool.view', 'dept_reports.export', 'dept_reports.view', 'director_salary.approve', 'hr_costing.approve', 'hr_costing.export', 'hr_costing.view:own', 'reconciliation.create', 'reconciliation.edit', 'reports.export', 'reports.view', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view', 'treasury.void']),
  ('period_locks', ARRAY['approvals.approve', 'billing.create', 'billing.edit', 'billing.void', 'categories.view', 'claims.approve', 'director_salary.approve', 'director_salary.edit', 'hr_costing.approve', 'hr_costing.create', 'hr_costing.edit', 'settings.manage', 'treasury.approve', 'treasury.create', 'treasury.edit', 'treasury.void']),
  ('repayments', ARRAY['dept_pool.view', 'reports.export', 'reports.view', 'treasury.create', 'treasury.edit', 'treasury.export', 'treasury.view']),
  ('report_layouts', ARRAY['dept_reports.export', 'dept_reports.view', 'reports.export', 'reports.view']),
  ('service_contracts', ARRAY['billing.create', 'billing.edit', 'billing.view'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('approval_requests', 'INSERT', ARRAY['billing.create', 'claims.approve', 'treasury.create', 'treasury.void', 'hr_costing.create']),
  ('approval_requests', 'UPDATE', ARRAY['treasury.approve', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve', 'treasury.create', 'treasury.edit', 'treasury.void', 'billing.create', 'billing.edit', 'hr_costing.create', 'hr_costing.edit']),
  ('dept_payment_requests', 'DELETE', ARRAY['treasury.edit', 'treasury.void']),
  ('dept_payment_requests', 'INSERT', ARRAY['treasury.create']),
  ('dept_payment_requests', 'UPDATE', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']),
  ('dept_pools', 'INSERT', ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'billing.create']),
  ('invoice_submission_requests', 'DELETE', ARRAY['billing.edit', 'billing.void']),
  ('invoice_submission_requests', 'INSERT', ARRAY['billing.create']),
  ('invoice_submission_requests', 'UPDATE', ARRAY['billing.create', 'billing.edit', 'billing.void']),
  ('invoices', 'DELETE', ARRAY['billing.create', 'billing.edit']),
  ('invoices', 'INSERT', ARRAY['billing.create']),
  ('invoices', 'UPDATE', ARRAY['billing.create', 'billing.edit', 'billing.void', 'treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'claims.approve']),
  ('service_contracts', 'INSERT', ARRAY['billing.create'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
-- The tab registry loses those boxes BY NAME, not seeded whole: production also holds the Leads tabs
-- (`/leads`, `lead.*`) another branch applied on 2026-10-16 and this branch's registry does not list — a whole
-- seed would delete them. (`seededRows` in src/test/tab-guards-scan.ts follows a later delete by tab.)
DELETE FROM public.permission_page_tabs
 WHERE tab_id IN ('pri.my_billing', 'dept.my_billing', 'dept.dept_pool', 'dept.opex', 'dept.claims', 'dept.reports', 'dept.people');
DELETE FROM public.permission_tab_cells
 WHERE tab_id IN ('pri.my_billing', 'dept.my_billing', 'dept.dept_pool', 'dept.opex', 'dept.claims', 'dept.reports', 'dept.people');

-- The tables whose registry rows changed: their RESTRICTIVE guards are built again from them.
SELECT public.permission_reads_guard(t)
  FROM unnest(ARRAY['approval_requests', 'bank_accounts', 'credit_notes', 'dept_payment_requests', 'dept_pools', 'fund_sources',
                    'hr_monthly_payroll', 'hr_staff_costs', 'invoice_lines', 'invoice_submission_requests', 'invoices', 'journal_entries',
                    'journal_lines', 'loans', 'payment_voucher_sources', 'payment_vouchers', 'period_locks', 'repayments',
                    'report_layouts', 'service_contracts']) AS t;
SELECT public.permission_writes_guard(t)
  FROM unnest(ARRAY['approval_requests', 'dept_payment_requests', 'dept_pools', 'invoice_submission_requests', 'invoices',
                    'service_contracts']) AS t;

-- ── 6. The kind cannot come back ────────────────────────────────────────────

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS dept_manager_has_department;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_no_dept_manager;
ALTER TABLE public.users ADD CONSTRAINT users_no_dept_manager CHECK (role <> 'dept_manager');
ALTER TABLE public.permission_templates DROP CONSTRAINT IF EXISTS permission_templates_no_dept_manager;
ALTER TABLE public.permission_templates ADD CONSTRAINT permission_templates_no_dept_manager CHECK (base_role <> 'dept_manager');
