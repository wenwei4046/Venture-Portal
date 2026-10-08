-- ============================================================================
-- 20261009040000_own_and_dept_reach_the_rows.sql
-- Own and Dept reach the rows (PR3c of the People Management revamp).
-- ============================================================================
--
-- A cell's reach — their own records, their department's, the whole
-- company's — was the app's alone. The database knew "a department manager"
-- only by the KIND of account: eighteen row policies asked
-- `current_user_role() = 'dept_manager'` (or a list of kinds), so a template's
-- Dept cells reached its department's rows only on a template whose hidden
-- kind was dept_manager; and Own reached nobody: somebody on Staff · Basic
-- raised a claim they could then not read. Now each of those policies asks the
-- CELL, at the reach it serves, with the department read off the person
-- (`current_user_department_id()` — their roster row's since PR1):
--
--   Claims          read their own (Own), their department's (Dept), all;
--                   raise one as themselves only (Claims · Create) — it took
--                   any sign-in, in anybody's name
--   Dept Pool       their department's pool, its expense requests and its
--                   payment requests
--   My Billing      their department's invoices, contracts and requests; a
--                   draft invoice of their own in their segment
--   Dept reports    their segment's invoices and journals
--   Approvals       a request raised as themselves, by whoever's work raises
--                   one (`may_write`, PR3a's list) — was four kinds
--   Revenue payroll HR Costing or Revenue · View reads a commission
--                   adjustment — was two kinds
--
-- And the READ functions behind those pages ask the same cells instead of
-- the kind (pg_temp.swap_check as in 20261009030000: production's statement,
-- whitespace-blind, exactly once). A function that served "the whole company"
-- to some kinds and "my department" to others now does so by the reach of the
-- caller's cell.
--
-- On production every account that signs in keeps every row it read: the
-- four shared accounts read by their keys, which carry these cells at the
-- same reach (marketing@ — the one department manager — holds Dept Pool, My
-- Billing, Dept reports and OPEX at Dept). What moves is only what no page of
-- theirs reads: through the API, hr@ no longer reads a department's NP or
-- OPEX (Dept Pool / OPEX are not HR's), carrie no longer reads report-only
-- mirror slices or her department's payroll OPEX (individual salaries — not
-- Finance's), and Finance no longer reads the per-director payout summary (no
-- page calls it; Director Salary is not Finance's).
--
-- Left alone on purpose: approvals_decider_update (PR2b — the owner kind may
-- decide their own request), table_layout_defaults (WRITES_WITHOUT_ACTION),
-- Finance's own-department payroll rows (asked by key, not kind), and
-- dashboard_summary (which treasury dashboard to draw — the page decides).

-- ─── Row policies ───────────────────────────────────────────────────────────
-- Each is TO authenticated now (was public): what they ask — has_action,
-- may_write — is not the publishable key's to call (20261009000100), and a
-- caller with no sign-in never matched one of them anyway.

ALTER POLICY claims_own_select ON public.claims TO authenticated USING (
  ((created_by = (SELECT auth.uid())) AND (SELECT public.has_action('claims', 'view', 'own')))
  OR ((department_id = (SELECT public.current_user_department_id())) AND (SELECT public.has_action('claims', 'view', 'dept')))
  OR (SELECT public.has_action('claims', 'view', 'all'))
);
ALTER POLICY claims_submit ON public.claims TO authenticated WITH CHECK (
  (created_by = (SELECT auth.uid())) AND (SELECT public.has_action('claims', 'create', 'own'))
);

ALTER POLICY approvals_dept_manager_own_expense_select ON public.approval_requests TO authenticated USING (
  (SELECT public.has_action('dept_pool', 'view', 'dept'))
  AND (request_type = 'dept_expense'::approval_request_type) AND (reference_table = 'departments'::text)
  AND (reference_id = (SELECT public.current_user_department_id()))
);
ALTER POLICY approvals_submit ON public.approval_requests TO authenticated WITH CHECK (
  (submitted_by = (SELECT auth.uid())) AND (SELECT public.may_write('approval_requests', 'INSERT'))
);
ALTER POLICY approvals_submitter_update_own_pending ON public.approval_requests TO authenticated USING (
  (status = 'pending'::approval_status) AND (submitted_by = (SELECT auth.uid()))
  AND (SELECT public.may_write('approval_requests', 'UPDATE'))
);

ALTER POLICY dept_pools_pf_select ON public.dept_pools TO authenticated USING (
  (SELECT public.has_scope(ARRAY['treasury'])) OR (SELECT public.has_action('dept_pool', 'view', 'all'))
  OR ((SELECT public.has_action('dept_pool', 'view', 'dept')) AND (department_id = (SELECT public.current_user_department_id())))
);
ALTER POLICY dept_pools_dept_manager_insert ON public.dept_pools TO authenticated WITH CHECK (
  (SELECT public.has_action('my_billing', 'create', 'dept'))
  AND (transaction_type = 'expense_out'::dept_pool_txn_type)
  AND (department_id = (SELECT public.current_user_department_id()))
);

ALTER POLICY dpr_dept_manager_select_own ON public.dept_payment_requests TO authenticated USING (
  ((SELECT public.has_action('dept_pool', 'view', 'dept')) OR (SELECT public.has_action('my_billing', 'view', 'dept')))
  AND (department_id = (SELECT public.current_user_department_id()))
);
ALTER POLICY isr_dept_manager_select_own ON public.invoice_submission_requests TO authenticated USING (
  (SELECT public.has_action('my_billing', 'view', 'dept'))
  AND (department_id = (SELECT public.current_user_department_id()))
);
ALTER POLICY service_contracts_pf_select ON public.service_contracts TO authenticated USING (
  (SELECT public.has_scope(ARRAY['treasury']))
  OR ((SELECT public.has_action('my_billing', 'view', 'dept')) AND (department_id = (SELECT public.current_user_department_id())))
);
ALTER POLICY service_contracts_insert ON public.service_contracts TO authenticated WITH CHECK (
  (SELECT public.has_scope(ARRAY['treasury']))
  OR ((SELECT public.has_action('my_billing', 'create', 'dept')) AND (department_id = (SELECT public.current_user_department_id())))
);

ALTER POLICY invoices_dept_manager_select ON public.invoices TO authenticated USING (
  ((SELECT public.has_action('my_billing', 'view', 'dept')) OR (SELECT public.has_action('dept_reports', 'view', 'dept')))
  AND (billing_mode_to_segment((billing_mode)::text) = (SELECT public.current_user_segment()))
);
ALTER POLICY invoices_dept_manager_insert ON public.invoices TO authenticated WITH CHECK (
  (SELECT public.has_action('my_billing', 'create', 'dept')) AND (status = 'draft'::invoice_status)
  AND (billing_mode_to_segment((billing_mode)::text) = (SELECT public.current_user_segment()))
  AND (created_by = (SELECT auth.uid()))
);
ALTER POLICY invoices_dept_manager_update ON public.invoices TO authenticated USING (
  (SELECT public.has_action('my_billing', 'create', 'dept')) AND (status = 'draft'::invoice_status)
  AND (created_by = (SELECT auth.uid()))
  AND (billing_mode_to_segment((billing_mode)::text) = (SELECT public.current_user_segment()))
);
ALTER POLICY invoices_dept_manager_delete ON public.invoices TO authenticated USING (
  (SELECT public.has_action('my_billing', 'create', 'dept')) AND (status = 'draft'::invoice_status)
  AND (created_by = (SELECT auth.uid()))
  AND (billing_mode_to_segment((billing_mode)::text) = (SELECT public.current_user_segment()))
);

ALTER POLICY journal_entries_dept_manager_select ON public.journal_entries TO authenticated USING (
  (SELECT public.has_action('dept_reports', 'view', 'dept'))
  AND (segment = (SELECT public.current_user_segment()))
);
ALTER POLICY journal_lines_dept_manager_select ON public.journal_lines TO authenticated USING (
  (SELECT public.has_action('dept_reports', 'view', 'dept'))
  AND (EXISTS (SELECT 1 FROM public.journal_entries je
                WHERE je.id = journal_lines.entry_id AND je.segment = (SELECT public.current_user_segment())))
);

ALTER POLICY revenue_commission_adjustments_read ON public.revenue_payroll_commission_adjustments TO authenticated USING (
  (SELECT public.has_any_action(ARRAY['hr_costing.view', 'revenue.view']))
);

-- ─── The read functions behind those pages ─────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
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
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its check is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- A department's NP and its payroll OPEX: the whole company at All, their own
-- department at Dept.
SELECT pg_temp.swap_check('public.calculate_dept_np(uuid,date)',
  $q$IF v_role NOT IN ('principal', 'finance', 'dept_manager', 'hr') THEN RAISE EXCEPTION 'calculate_dept_np: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege'; END IF; IF v_role = 'dept_manager' AND p_dept_id <> current_user_department_id() THEN RAISE EXCEPTION 'calculate_dept_np: dept_manager can only query own department' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT (public.has_any_action(ARRAY['dept_pool.view']) OR (public.has_any_action(ARRAY['dept_pool.view:dept']) AND p_dept_id = public.current_user_department_id())) THEN RAISE EXCEPTION 'calculate_dept_np: needs Dept Pool · View of that department' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.get_dept_opex_rows(uuid,date,date)',
  $q$IF v_role = 'principal' OR v_role = 'hr' THEN -- ok, see all departments NULL; ELSIF v_role IN ('finance', 'dept_manager') THEN IF v_user_dept IS NULL OR v_user_dept <> p_dept_id THEN RAISE EXCEPTION 'get_dept_opex_rows: % can only query own department', v_role USING ERRCODE = 'insufficient_privilege'; END IF; ELSE RAISE EXCEPTION 'get_dept_opex_rows: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT (public.has_any_action(ARRAY['opex.view']) OR (public.has_any_action(ARRAY['opex.view:dept']) AND v_user_dept IS NOT NULL AND v_user_dept = p_dept_id)) THEN RAISE EXCEPTION 'get_dept_opex_rows: needs OPEX · View of that department' USING ERRCODE = '42501';$q$);

-- A segment's invoices, receipts and mirror slices: any segment at All (or
-- with Billing · View, which reads every invoice), their own at Dept.
SELECT pg_temp.swap_check('public.dept_invoice_settlements(gl_segment)',
  $q$IF v_role = 'dept_manager' THEN v_seg := current_user_segment(); ELSIF v_role IN ('finance', 'principal') THEN v_seg := COALESCE(p_segment, 'marketing'::gl_segment); ELSE RAISE EXCEPTION 'dept_invoice_settlements: role % may not read settlements', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'my_billing.view', 'billing.view']) THEN v_seg := COALESCE(p_segment, 'marketing'::gl_segment); ELSIF public.has_any_action(ARRAY['dept_reports.view:dept', 'my_billing.view:dept']) THEN v_seg := public.current_user_segment(); ELSE RAISE EXCEPTION 'dept_invoice_settlements: needs Department reports, My Billing or Billing · View' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.rnp_invoice_events(text)',
  $q$IF v_role = 'dept_manager' THEN v_seg := current_user_segment()::text; IF v_seg IS NULL THEN RAISE EXCEPTION 'rnp_invoice_events: caller has no segment'; END IF; ELSIF v_role IN ('finance', 'principal') THEN v_seg := p_segment; -- NULL = consolidated (all segments) ELSE RAISE EXCEPTION 'rnp_invoice_events: role % may not read', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'billing.view']) THEN v_seg := p_segment; ELSIF public.has_any_action(ARRAY['dept_reports.view:dept']) THEN v_seg := public.current_user_segment()::text; IF v_seg IS NULL THEN RAISE EXCEPTION 'rnp_invoice_events: caller has no segment'; END IF; ELSE RAISE EXCEPTION 'rnp_invoice_events: needs Department reports or Billing · View' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.bridge_mirror_slices()',
  $q$IF v_role IN ('principal', 'finance') THEN$q$,
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'reports.view']) THEN$q$);
SELECT pg_temp.swap_check('public.bridge_mirror_slices()',
  $q$ELSIF v_role = 'dept_manager' THEN$q$,
  $q$ELSIF public.has_any_action(ARRAY['dept_reports.view:dept']) THEN$q$);

-- Department lump sums of HR cost (Finance reads these, never a salary).
SELECT pg_temp.swap_check('public.get_hr_cost_submissions_list()',
  $q$current_user_role() IN ('principal', 'finance', 'hr', 'dept_manager')$q$,
  $q$(SELECT public.has_any_action(ARRAY['dept_pool.view:dept', 'hr_costing.view']))$q$);
SELECT pg_temp.swap_check('public.get_hr_cost_summary()',
  $q$AND current_user_role() IN ('principal', 'finance', 'hr')$q$,
  $q$AND (SELECT public.has_any_action(ARRAY['hr_costing.view', 'treasury.view', 'billing.view']))$q$);
SELECT pg_temp.swap_check('public.get_submitted_hr_summary(date)',
  $q$AND current_user_role() IN ('principal', 'finance', 'hr')$q$,
  $q$AND (SELECT public.has_any_action(ARRAY['hr_costing.view', 'treasury.view', 'billing.view']))$q$);

-- What billing and payroll funding read: Billing, HR Costing (or Treasury) · View.
SELECT pg_temp.swap_check('public.get_director_ctc_by_company(date)',
  $q$IF v_role NOT IN ('principal', 'finance', 'hr') THEN RAISE EXCEPTION 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view', 'director_salary.view']) THEN RAISE EXCEPTION 'get_director_ctc_by_company: needs Billing, HR Costing or Director Salary · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.get_staff_billing_allocation(date)',
  $q$IF v_role NOT IN ('principal', 'finance', 'hr') THEN RAISE EXCEPTION 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_billing_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.get_staff_own_share_allocation(date)',
  $q$IF v_role NOT IN ('principal', 'finance', 'hr') THEN RAISE EXCEPTION 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_own_share_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.get_payroll_accrual_totals(date)',
  $q$IF v_role NOT IN ('hr', 'finance', 'principal') THEN RAISE EXCEPTION 'get_payroll_accrual_totals: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['hr_costing.view', 'treasury.view', 'hr_costing.approve', 'approvals.approve']) THEN RAISE EXCEPTION 'get_payroll_accrual_totals: needs HR Costing or Treasury · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.get_payroll_accrual_totals_for(uuid)',
  $q$IF current_user_role() NOT IN ('hr', 'finance', 'principal') THEN RAISE EXCEPTION 'get_payroll_accrual_totals_for: unauthorized' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['hr_costing.view', 'treasury.view']) THEN RAISE EXCEPTION 'get_payroll_accrual_totals_for: needs HR Costing or Treasury · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.get_payroll_funding_paid(uuid)',
  $q$IF v_role NOT IN ('hr', 'finance', 'principal') THEN RAISE EXCEPTION 'get_payroll_funding_paid: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['hr_costing.view', 'treasury.view']) THEN RAISE EXCEPTION 'get_payroll_funding_paid: needs HR Costing or Treasury · View' USING ERRCODE = '42501';$q$);

-- One director's payout is Director Salary's (no page calls this one).
SELECT pg_temp.swap_check('public.get_director_payout_summary(date)',
  $q$IF v_role NOT IN ('principal', 'finance', 'hr') THEN RAISE EXCEPTION 'insufficient_privilege' USING HINT = 'Only principal, finance, or hr can view director payout summary';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['director_salary.view']) THEN RAISE EXCEPTION 'get_director_payout_summary: needs Director Salary · View' USING ERRCODE = '42501';$q$);

-- Revenue: a salesperson's pay and a manager's direct-line limits.
SELECT pg_temp.swap_check('public.revenue_pay_preview(uuid,date)',
  $q$IF NOT (has_scope(ARRAY['admin']) OR has_scope(ARRAY['hr'])) THEN RAISE EXCEPTION 'Individual pay is visible to HR and the Principal only';$q$,
  $q$IF NOT public.has_any_action(ARRAY['revenue.view']) THEN RAISE EXCEPTION 'revenue_pay_preview: needs Revenue · View' USING ERRCODE = '42501';$q$);
SELECT pg_temp.swap_check('public.comm_effective_direct_line_limits(uuid)',
  $q$IF NOT has_scope(ARRAY['admin', 'hr']) THEN RAISE EXCEPTION 'Only Principal or HR may read commission direct-line limits' USING ERRCODE = '42501';$q$,
  $q$IF NOT public.has_any_action(ARRAY['revenue.view']) THEN RAISE EXCEPTION 'comm_effective_direct_line_limits: needs Revenue · View' USING ERRCODE = '42501';$q$);

NOTIFY pgrst, 'reload schema';
