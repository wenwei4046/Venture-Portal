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
-- 5. The tab registry is seeded whole again (mig 20261011220000's rule): /my-billing and the Department view's
--    own-department boxes (Dept Pool, OPEX, My Billing, Claims, Reports, People at Dept) and pri.my_billing gone.
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

-- ── 4b and 5. The registries, seeded again ──────────────────────────────────
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
DELETE FROM public.permission_page_tabs;
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/admin/guest-link', 'hr.guest_link'),
  ('/admin/rooms', 'dept.meeting_rooms'),
  ('/admin/rooms', 'fin.meeting_rooms'),
  ('/admin/rooms', 'hr.meeting_rooms'),
  ('/admin/rooms', 'pri.meeting_rooms'),
  ('/approvals', 'fin.approvals'),
  ('/approvals', 'fin.payments'),
  ('/approvals', 'hr.director_salary'),
  ('/approvals', 'hr.payroll'),
  ('/approvals', 'pri.approvals'),
  ('/approvals/payroll-run/[id]/director-report', 'hr.director_salary'),
  ('/attendance/balances', 'hr.att_balances'),
  ('/attendance/close', 'hr.att_close'),
  ('/attendance/readiness', 'hr.att_ready'),
  ('/attendance/records', 'hr.att_records'),
  ('/attendance/requests', 'hr.att_requests'),
  ('/attendance/settings', 'hr.att_settings'),
  ('/attendance/today', 'hr.att_today'),
  ('/audit-log', 'fin.audit_log'),
  ('/audit-log', 'hr.audit_log'),
  ('/audit-log', 'pri.audit_log'),
  ('/audit-log/access', 'pri.audit_log'),
  ('/ba', 'fin.invoice_financing'),
  ('/ba/[id]', 'fin.invoice_financing'),
  ('/billing-allocator', 'fin.billing_allocator'),
  ('/billing-allocator/[id]', 'fin.billing_allocator'),
  ('/billing/contracts/[id]/edit', 'fin.billing_allocator'),
  ('/billing/contracts/[id]/edit', 'fin.invoice'),
  ('/billing/contracts/new', 'fin.billing_allocator'),
  ('/billing/contracts/new', 'fin.invoice'),
  ('/billing/requests', 'fin.billing_allocator'),
  ('/billing/requests', 'fin.invoice'),
  ('/claims', 'dept.my_claims'),
  ('/claims', 'pri.claims'),
  ('/daily-bank', 'fin.daily_bank'),
  ('/dept-pool', 'fin.dept_pool'),
  ('/dept-pool', 'pri.dept_pool'),
  ('/dept-pool/[slug]', 'fin.dept_pool'),
  ('/dept-pool/[slug]', 'pri.dept_pool'),
  ('/dept-pool/contracts/new', 'fin.billing_allocator'),
  ('/dept-pool/contracts/new', 'fin.dept_pool'),
  ('/dept-pool/contracts/new', 'fin.invoice'),
  ('/dept-pool/contracts/new', 'pri.dept_pool'),
  ('/dept-pool/marketing', 'fin.dept_pool'),
  ('/dept-pool/marketing', 'pri.dept_pool'),
  ('/dept-pool/statements/[seg]', 'fin.dept_pool'),
  ('/dept-pool/statements/[seg]', 'fin.reports'),
  ('/dept-pool/statements/[seg]', 'pri.dept_pool'),
  ('/dept-pool/statements/[seg]', 'pri.reports'),
  ('/dept-pool/submissions', 'fin.dept_pool'),
  ('/dept-pool/submissions', 'pri.dept_pool'),
  ('/director-pool', 'hr.director_pool'),
  ('/director-pool/import', 'hr.director_pool'),
  ('/director-salary', 'hr.director_salary'),
  ('/director-salary/[directorId]', 'hr.director_salary'),
  ('/director-salary/[directorId]/print', 'hr.director_salary'),
  ('/director-salary/import', 'hr.director_salary'),
  ('/director-salary/payslip/[id]', 'hr.director_salary'),
  ('/fund-in', 'fin.fund_in'),
  ('/fund-in/[id]', 'fin.fund_in'),
  ('/fund-in/[id]/edit', 'fin.fund_in'),
  ('/fund-in/new', 'fin.fund_in'),
  ('/fund-out', 'fin.fund_out'),
  ('/fund-out/[id]', 'fin.fund_out'),
  ('/fund-out/[id]/edit', 'fin.fund_out'),
  ('/fund-out/new', 'fin.fund_out'),
  ('/hiring/insights', 'hr.hiring_insights'),
  ('/hiring/requests', 'hr.hiring_requests'),
  ('/hiring/requests/[id]', 'hr.hiring_requests'),
  ('/hiring/talent', 'hr.talent_bank'),
  ('/hiring/talent/[id]', 'hr.talent_bank'),
  ('/hr-costing', 'hr.hr_costing'),
  ('/hr-costing/allocation', 'hr.hr_costing'),
  ('/hr-costing/allocation/[period]', 'hr.hr_costing'),
  ('/hr-costing/payment', 'hr.payment'),
  ('/hr-costing/payroll', 'hr.payroll'),
  ('/hr-costing/payroll/[period]', 'hr.payroll'),
  ('/hr-costing/payroll/[period]/[staffId]/payslip', 'hr.payroll'),
  ('/hr-costing/payroll/[period]/import', 'hr.payroll'),
  ('/invoice-pool', 'fin.payments'),
  ('/invoices/[id]', 'fin.invoice'),
  ('/member-admin', 'hr.member_services'),
  ('/opex', 'pri.opex'),
  ('/payments', 'fin.payments'),
  ('/payments/[id]', 'fin.payments'),
  ('/payments/[id]', 'hr.payment'),
  ('/payments/[id]', 'hr.payroll'),
  ('/payments/[id]/edit', 'fin.payments'),
  ('/payments/claim-requests', 'fin.payments'),
  ('/payments/dept-requests', 'fin.payments'),
  ('/payments/new', 'fin.payments'),
  ('/payments/payroll-requests', 'fin.payments'),
  ('/receipts', 'fin.receipt'),
  ('/reconciliation', 'fin.reconciliation'),
  ('/reconciliation/[sessionId]', 'fin.reconciliation'),
  ('/reconciliation/[sessionId]/report', 'fin.reconciliation'),
  ('/reconciliation/journal', 'fin.journal_entries'),
  ('/reconciliation/journal-entries', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/[id]', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/[id]/edit', 'fin.journal_entries'),
  ('/reconciliation/journal-entries/new', 'fin.journal_entries'),
  ('/repayment-schedule', 'fin.repayment_schedule'),
  ('/reports', 'fin.dept_reports'),
  ('/reports', 'fin.reports'),
  ('/reports', 'hr.hr_costing'),
  ('/reports', 'pri.reports'),
  ('/reports/balance-sheet', 'fin.reports'),
  ('/reports/balance-sheet', 'pri.reports'),
  ('/reports/base-rate', 'fin.reports'),
  ('/reports/base-rate', 'pri.reports'),
  ('/reports/cash-flow', 'fin.dept_reports'),
  ('/reports/cash-flow', 'fin.reports'),
  ('/reports/cash-flow', 'pri.reports'),
  ('/reports/cash-flow/layout', 'fin.reports'),
  ('/reports/cash-flow/layout', 'pri.reports'),
  ('/reports/claims', 'fin.reports'),
  ('/reports/claims', 'pri.claims'),
  ('/reports/claims', 'pri.reports'),
  ('/reports/company-statement', 'fin.reports'),
  ('/reports/company-statement', 'pri.reports'),
  ('/reports/debtor-aging', 'fin.dept_reports'),
  ('/reports/debtor-aging', 'fin.reports'),
  ('/reports/debtor-aging', 'pri.reports'),
  ('/reports/fund-summary', 'fin.reports'),
  ('/reports/fund-summary', 'pri.reports'),
  ('/reports/income-statement', 'fin.dept_reports'),
  ('/reports/income-statement', 'fin.reports'),
  ('/reports/income-statement', 'pri.reports'),
  ('/reports/ledger', 'fin.reports'),
  ('/reports/ledger', 'pri.reports'),
  ('/reports/loan-aging', 'fin.reports'),
  ('/reports/loan-aging', 'pri.reports'),
  ('/reports/monthly-cash-flow', 'fin.dept_reports'),
  ('/reports/monthly-cash-flow', 'fin.reports'),
  ('/reports/monthly-cash-flow', 'pri.reports'),
  ('/reports/monthly-pnl', 'fin.dept_reports'),
  ('/reports/monthly-pnl', 'fin.reports'),
  ('/reports/monthly-pnl', 'pri.reports'),
  ('/reports/monthly-pnl/layout', 'fin.reports'),
  ('/reports/monthly-pnl/layout', 'pri.reports'),
  ('/reports/monthly-receipt-payment', 'fin.dept_reports'),
  ('/reports/monthly-receipt-payment', 'fin.reports'),
  ('/reports/monthly-receipt-payment', 'pri.reports'),
  ('/reports/receipt-payment', 'fin.dept_reports'),
  ('/reports/receipt-payment', 'fin.reports'),
  ('/reports/receipt-payment', 'pri.reports'),
  ('/reports/trial-balance', 'fin.reports'),
  ('/reports/trial-balance', 'pri.reports'),
  ('/revenue', 'hr.comm_cal'),
  ('/revenue', 'hr.rules'),
  ('/revenue', 'hr.sales_groups'),
  ('/revenue/[sub]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/import', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/open-bill', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/orders', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/orders/[orderId]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/pay', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/pay/[staffId]', 'hr.comm_cal'),
  ('/revenue/[sub]/[period]/statement/[staffId]', 'hr.comm_cal'),
  ('/revenue/[sub]/hierarchy', 'hr.sales_groups'),
  ('/revenue/[sub]/rules', 'hr.rules'),
  ('/revenue/department', 'hr.rules'),
  ('/settings', 'fin.chart_of_account'),
  ('/settings', 'pri.settings'),
  ('/statements', 'fin.invoice'),
  ('/statements/[id]', 'fin.statements'),
  ('/statements/[id]/print', 'fin.statements'),
  ('/statements/monthly', 'fin.statements'),
  ('/team/accounts/[id]', 'hr.permissions'),
  ('/team/documentation', 'hr.documentation'),
  ('/team/hierarchy', 'hr.hierarchy'),
  ('/team/people', 'hr.people'),
  ('/team/people', 'hr.permissions'),
  ('/team/people/[id]', 'hr.people'),
  ('/team/people/[id]', 'hr.permissions'),
  ('/team/people/[id]/edit', 'hr.people'),
  ('/team/people/import', 'hr.people'),
  ('/team/people/new', 'hr.people'),
  ('/venture-pool', 'fin.venture_pool'),
  ('/venture-pool', 'pri.venture_pool');
DELETE FROM public.permission_tab_cells;
INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('dept.meeting_rooms', 'create', 'rooms.create'),
  ('dept.meeting_rooms', 'edit', 'rooms.edit'),
  ('dept.meeting_rooms', 'view', 'rooms.view'),
  ('dept.my_claims', 'create', 'claims.create'),
  ('dept.my_claims', 'edit', 'claims.edit'),
  ('dept.my_claims', 'view', 'claims.view'),
  ('dept.overview', 'view', 'dashboard.view'),
  ('fin.approvals', 'approve', 'approvals.approve'),
  ('fin.approvals', 'view', 'approvals.view'),
  ('fin.billing_allocator', 'approve', 'billing.void'),
  ('fin.billing_allocator', 'create', 'billing.create'),
  ('fin.billing_allocator', 'edit', 'billing.edit'),
  ('fin.billing_allocator', 'view', 'billing.export'),
  ('fin.billing_allocator', 'view', 'billing.view'),
  ('fin.chart_of_account', 'edit', 'categories.manage'),
  ('fin.chart_of_account', 'view', 'categories.view'),
  ('fin.daily_bank', 'approve', 'treasury.approve'),
  ('fin.daily_bank', 'approve', 'treasury.void'),
  ('fin.daily_bank', 'create', 'treasury.create'),
  ('fin.daily_bank', 'edit', 'treasury.edit'),
  ('fin.daily_bank', 'view', 'treasury.export'),
  ('fin.daily_bank', 'view', 'treasury.view'),
  ('fin.dept_pool', 'view', 'dept_pool.export'),
  ('fin.dept_pool', 'view', 'dept_pool.view'),
  ('fin.dept_reports', 'view', 'dept_reports.export'),
  ('fin.dept_reports', 'view', 'dept_reports.view'),
  ('fin.fund_in', 'approve', 'treasury.approve'),
  ('fin.fund_in', 'approve', 'treasury.void'),
  ('fin.fund_in', 'create', 'treasury.create'),
  ('fin.fund_in', 'edit', 'treasury.edit'),
  ('fin.fund_in', 'view', 'treasury.export'),
  ('fin.fund_in', 'view', 'treasury.view'),
  ('fin.fund_out', 'approve', 'treasury.approve'),
  ('fin.fund_out', 'approve', 'treasury.void'),
  ('fin.fund_out', 'create', 'treasury.create'),
  ('fin.fund_out', 'edit', 'treasury.edit'),
  ('fin.fund_out', 'view', 'treasury.export'),
  ('fin.fund_out', 'view', 'treasury.view'),
  ('fin.invoice', 'approve', 'billing.void'),
  ('fin.invoice', 'create', 'billing.create'),
  ('fin.invoice', 'edit', 'billing.edit'),
  ('fin.invoice', 'view', 'billing.export'),
  ('fin.invoice', 'view', 'billing.view'),
  ('fin.invoice_financing', 'approve', 'treasury.approve'),
  ('fin.invoice_financing', 'approve', 'treasury.void'),
  ('fin.invoice_financing', 'create', 'treasury.create'),
  ('fin.invoice_financing', 'edit', 'treasury.edit'),
  ('fin.invoice_financing', 'view', 'treasury.export'),
  ('fin.invoice_financing', 'view', 'treasury.view'),
  ('fin.journal_entries', 'approve', 'reconciliation.approve'),
  ('fin.journal_entries', 'create', 'reconciliation.create'),
  ('fin.journal_entries', 'edit', 'reconciliation.edit'),
  ('fin.journal_entries', 'view', 'reconciliation.view'),
  ('fin.meeting_rooms', 'create', 'rooms.create'),
  ('fin.meeting_rooms', 'edit', 'rooms.edit'),
  ('fin.meeting_rooms', 'view', 'rooms.view'),
  ('fin.overview', 'view', 'dashboard.view'),
  ('fin.payments', 'approve', 'treasury.approve'),
  ('fin.payments', 'approve', 'treasury.void'),
  ('fin.payments', 'create', 'treasury.create'),
  ('fin.payments', 'edit', 'treasury.edit'),
  ('fin.payments', 'view', 'treasury.export'),
  ('fin.payments', 'view', 'treasury.view'),
  ('fin.receipt', 'approve', 'treasury.approve'),
  ('fin.receipt', 'approve', 'treasury.void'),
  ('fin.receipt', 'create', 'treasury.create'),
  ('fin.receipt', 'edit', 'treasury.edit'),
  ('fin.receipt', 'view', 'treasury.export'),
  ('fin.receipt', 'view', 'treasury.view'),
  ('fin.reconciliation', 'approve', 'reconciliation.approve'),
  ('fin.reconciliation', 'create', 'reconciliation.create'),
  ('fin.reconciliation', 'edit', 'reconciliation.edit'),
  ('fin.reconciliation', 'view', 'reconciliation.view'),
  ('fin.repayment_schedule', 'approve', 'treasury.approve'),
  ('fin.repayment_schedule', 'approve', 'treasury.void'),
  ('fin.repayment_schedule', 'create', 'treasury.create'),
  ('fin.repayment_schedule', 'edit', 'treasury.edit'),
  ('fin.repayment_schedule', 'view', 'treasury.export'),
  ('fin.repayment_schedule', 'view', 'treasury.view'),
  ('fin.reports', 'view', 'reports.export'),
  ('fin.reports', 'view', 'reports.view'),
  ('fin.statements', 'approve', 'treasury.approve'),
  ('fin.statements', 'approve', 'treasury.void'),
  ('fin.statements', 'create', 'treasury.create'),
  ('fin.statements', 'edit', 'treasury.edit'),
  ('fin.statements', 'view', 'treasury.export'),
  ('fin.statements', 'view', 'treasury.view'),
  ('fin.venture_pool', 'create', 'venture_pool.create'),
  ('fin.venture_pool', 'edit', 'venture_pool.edit'),
  ('fin.venture_pool', 'view', 'venture_pool.export'),
  ('fin.venture_pool', 'view', 'venture_pool.view'),
  ('hr.att_balances', 'create', 'attendance.create'),
  ('hr.att_balances', 'edit', 'attendance.edit'),
  ('hr.att_balances', 'view', 'attendance.view'),
  ('hr.att_close', 'edit', 'attendance.edit'),
  ('hr.att_close', 'view', 'attendance.view'),
  ('hr.att_ready', 'view', 'attendance.view'),
  ('hr.att_records', 'edit', 'attendance.edit'),
  ('hr.att_records', 'view', 'attendance.view'),
  ('hr.att_requests', 'approve', 'attendance.approve'),
  ('hr.att_requests', 'create', 'attendance.create'),
  ('hr.att_requests', 'view', 'attendance.view'),
  ('hr.att_settings', 'edit', 'attendance.edit'),
  ('hr.att_settings', 'view', 'attendance.view'),
  ('hr.att_today', 'view', 'attendance.view'),
  ('hr.comm_cal', 'approve', 'revenue.approve'),
  ('hr.comm_cal', 'create', 'revenue.create'),
  ('hr.comm_cal', 'edit', 'revenue.edit'),
  ('hr.comm_cal', 'view', 'revenue.export'),
  ('hr.comm_cal', 'view', 'revenue.view'),
  ('hr.director_pool', 'edit', 'director_pool.edit'),
  ('hr.director_pool', 'view', 'director_pool.view'),
  ('hr.director_salary', 'approve', 'director_salary.approve'),
  ('hr.director_salary', 'edit', 'director_salary.edit'),
  ('hr.director_salary', 'view', 'director_salary.view'),
  ('hr.documentation', 'create', 'documentation.create'),
  ('hr.documentation', 'edit', 'documentation.edit'),
  ('hr.documentation', 'view', 'documentation.view'),
  ('hr.guest_link', 'edit', 'guest_link.edit'),
  ('hr.guest_link', 'view', 'guest_link.view'),
  ('hr.hierarchy', 'edit', 'team.edit'),
  ('hr.hierarchy', 'edit', 'team.manage'),
  ('hr.hierarchy', 'view', 'team.view'),
  ('hr.hiring_insights', 'view', 'hiring.view'),
  ('hr.hiring_requests', 'approve', 'hiring.approve'),
  ('hr.hiring_requests', 'create', 'hiring.create'),
  ('hr.hiring_requests', 'edit', 'hiring.edit'),
  ('hr.hiring_requests', 'view', 'hiring.view'),
  ('hr.hr_costing', 'approve', 'hr_costing.approve'),
  ('hr.hr_costing', 'create', 'hr_costing.create'),
  ('hr.hr_costing', 'edit', 'hr_costing.edit'),
  ('hr.hr_costing', 'view', 'hr_costing.export'),
  ('hr.hr_costing', 'view', 'hr_costing.view'),
  ('hr.meeting_rooms', 'create', 'rooms.create'),
  ('hr.meeting_rooms', 'edit', 'rooms.edit'),
  ('hr.meeting_rooms', 'view', 'rooms.view'),
  ('hr.member_services', 'edit', 'member.manage'),
  ('hr.member_services', 'view', 'member.view'),
  ('hr.overview', 'view', 'dashboard.view'),
  ('hr.payment', 'approve', 'hr_costing.approve'),
  ('hr.payment', 'create', 'hr_costing.create'),
  ('hr.payment', 'edit', 'hr_costing.edit'),
  ('hr.payment', 'view', 'hr_costing.export'),
  ('hr.payment', 'view', 'hr_costing.view'),
  ('hr.payroll', 'approve', 'hr_costing.approve'),
  ('hr.payroll', 'create', 'hr_costing.create'),
  ('hr.payroll', 'edit', 'hr_costing.edit'),
  ('hr.payroll', 'view', 'hr_costing.export'),
  ('hr.payroll', 'view', 'hr_costing.view'),
  ('hr.people', 'create', 'team.create'),
  ('hr.people', 'edit', 'team.edit'),
  ('hr.people', 'view', 'team.view'),
  ('hr.permissions', 'create', 'accounts.create'),
  ('hr.permissions', 'edit', 'accounts.manage'),
  ('hr.permissions', 'view', 'accounts.view'),
  ('hr.rules', 'approve', 'revenue.approve'),
  ('hr.rules', 'create', 'revenue.create'),
  ('hr.rules', 'edit', 'revenue.edit'),
  ('hr.rules', 'edit', 'revenue.manage'),
  ('hr.rules', 'view', 'revenue.export'),
  ('hr.rules', 'view', 'revenue.view'),
  ('hr.sales_groups', 'approve', 'revenue.approve'),
  ('hr.sales_groups', 'create', 'revenue.create'),
  ('hr.sales_groups', 'edit', 'revenue.edit'),
  ('hr.sales_groups', 'view', 'revenue.export'),
  ('hr.sales_groups', 'view', 'revenue.view'),
  ('hr.talent_bank', 'create', 'hiring.create'),
  ('hr.talent_bank', 'edit', 'hiring.edit'),
  ('hr.talent_bank', 'view', 'hiring.view'),
  ('pri.approvals', 'approve', 'approvals.approve'),
  ('pri.approvals', 'view', 'approvals.view'),
  ('pri.audit_log', 'view', 'audit_log.export'),
  ('pri.audit_log', 'view', 'audit_log.view'),
  ('pri.claims', 'approve', 'claims.approve'),
  ('pri.claims', 'approve', 'claims.void'),
  ('pri.claims', 'create', 'claims.create'),
  ('pri.claims', 'edit', 'claims.edit'),
  ('pri.claims', 'view', 'claims.view'),
  ('pri.dept_pool', 'view', 'dept_pool.export'),
  ('pri.dept_pool', 'view', 'dept_pool.view'),
  ('pri.meeting_rooms', 'create', 'rooms.create'),
  ('pri.meeting_rooms', 'edit', 'rooms.edit'),
  ('pri.meeting_rooms', 'view', 'rooms.view'),
  ('pri.opex', 'view', 'opex.export'),
  ('pri.opex', 'view', 'opex.view'),
  ('pri.overview', 'view', 'dashboard.view'),
  ('pri.reports', 'view', 'reports.export'),
  ('pri.reports', 'view', 'reports.view'),
  ('pri.settings', 'edit', 'settings.manage'),
  ('pri.settings', 'view', 'settings.view'),
  ('pri.switch_views', 'view', 'view_switch.view'),
  ('pri.venture_pool', 'create', 'venture_pool.create'),
  ('pri.venture_pool', 'edit', 'venture_pool.edit'),
  ('pri.venture_pool', 'view', 'venture_pool.export'),
  ('pri.venture_pool', 'view', 'venture_pool.view'),
  ('rev.arena', 'view', 'revenue_app.view'),
  ('rev.brand_weeks', 'view', 'revenue_app.view'),
  ('rev.crm_team', 'edit', 'crm.edit'),
  ('rev.crm_team', 'edit', 'crm.manage'),
  ('rev.crm_team', 'view', 'crm.view'),
  ('rev.documentation', 'view', 'revenue_app.view'),
  ('rev.honours', 'view', 'revenue_app.view'),
  ('rev.income', 'view', 'revenue_app.view'),
  ('rev.insight', 'view', 'revenue_app.view'),
  ('rev.leads', 'edit', 'crm.edit'),
  ('rev.leads', 'view', 'crm.view'),
  ('rev.product_list', 'edit', 'product_list.edit'),
  ('rev.product_list', 'view', 'product_list.view'),
  ('rev.quote', 'create', 'revenue_app.create'),
  ('rev.quote', 'view', 'revenue_app.view'),
  ('rev.requests', 'create', 'revenue_app.create'),
  ('rev.requests', 'view', 'revenue_app.view'),
  ('rev.rooms', 'create', 'revenue_app.create'),
  ('rev.rooms', 'view', 'revenue_app.view'),
  ('rev.scheme', 'view', 'revenue_app.view'),
  ('rev.team', 'view', 'revenue_app.view'),
  ('rev.today', 'view', 'revenue_app.view'),
  ('rev.track', 'create', 'revenue_app.create'),
  ('rev.track', 'view', 'revenue_app.view');

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
