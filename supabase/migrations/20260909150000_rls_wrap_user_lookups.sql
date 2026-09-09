-- RLS: evaluate the per-user lookup functions ONCE per query, not once per row
-- (2026-09-09, perf).
--
-- current_user_role(), current_user_segment() and current_user_department_id()
-- are STABLE SECURITY DEFINER SQL functions that each run
-- `SELECT … FROM users WHERE id = auth.uid()`. Written bare inside a policy
-- expression, Postgres calls them for EVERY ROW the policy is checked against:
-- pg_stat_user_tables showed the 4-row `users` table seq-scanned 32.6 million
-- times and index-scanned 126 million times since April, and the 3,580-row
-- `journal_lines` read that several pages paginate through averaged 764 ms
-- (13,139 calls) where the same query runs in ~60 ms on its own.
--
-- Wrapping a call as `(select fn())` turns it into an InitPlan — evaluated once
-- and reused for every row. has_scope() already followed this pattern
-- everywhere (CLAUDE.md: `(SELECT has_scope(ARRAY['treasury']))`); these are
-- the 16 dept_manager row-scoped policies that still called current_user_role()
-- / current_user_segment() bare, plus the two `_finance_own_dept_select`
-- policies that called current_user_department_id() bare. auth.uid() inside
-- the same expressions is wrapped too for consistency; bare auth.uid() in the
-- other 36 policies is left alone — it only reads a session setting and costs
-- nothing per row.
--
-- Semantics are unchanged: every USING / WITH CHECK below is the deparsed
-- pg_policies expression with only the wrapping added. Verified before
-- applying by counting visible rows as the Marketing dept_manager and as
-- Principal across 12 tables before and after, inside one transaction:
-- identical.

alter policy approvals_dept_manager_own_expense_select on public.approval_requests
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (request_type = 'dept_expense'::approval_request_type) AND (reference_table = 'departments'::text) AND (reference_id = (select current_user_department_id()))));

alter policy approvals_submit on public.approval_requests
  with check ((((select current_user_role()) = ANY (ARRAY['finance'::user_role, 'hr'::user_role, 'dept_manager'::user_role, 'principal'::user_role])) AND (submitted_by = (select auth.uid()))));

alter policy approvals_submitter_update_own_pending on public.approval_requests
  using (((status = 'pending'::approval_status) AND (submitted_by = (select auth.uid())) AND ((select current_user_role()) = ANY (ARRAY['finance'::user_role, 'hr'::user_role, 'dept_manager'::user_role]))))
  with check (((status = 'pending'::approval_status) AND (submitted_by = (select auth.uid()))));

alter policy claims_own_select on public.claims
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (created_by = (select auth.uid()))));

alter policy dpr_dept_manager_select_own on public.dept_payment_requests
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (department_id = (select current_user_department_id()))));

alter policy dept_pools_dept_manager_insert on public.dept_pools
  with check ((((select current_user_role()) = 'dept_manager'::user_role) AND (transaction_type = 'expense_out'::dept_pool_txn_type) AND (department_id = (select current_user_department_id()))));

alter policy dept_pools_pf_select on public.dept_pools
  using ((( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope) OR (((select current_user_role()) = 'dept_manager'::user_role) AND (department_id = (select current_user_department_id())))));

alter policy isr_dept_manager_select_own on public.invoice_submission_requests
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (department_id = (select current_user_department_id()))));

alter policy invoices_dept_manager_delete on public.invoices
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status) AND (created_by = (select auth.uid())) AND (billing_mode_to_segment((billing_mode)::text) = (select current_user_segment()))));

alter policy invoices_dept_manager_insert on public.invoices
  with check ((((select current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status) AND (billing_mode_to_segment((billing_mode)::text) = (select current_user_segment())) AND (created_by = (select auth.uid()))));

alter policy invoices_dept_manager_select on public.invoices
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (billing_mode_to_segment((billing_mode)::text) = (select current_user_segment()))));

alter policy invoices_dept_manager_update on public.invoices
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status) AND (created_by = (select auth.uid())) AND (billing_mode_to_segment((billing_mode)::text) = (select current_user_segment()))));

alter policy journal_entries_dept_manager_select on public.journal_entries
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (segment = (select current_user_segment()))));

alter policy journal_lines_dept_manager_select on public.journal_lines
  using ((((select current_user_role()) = 'dept_manager'::user_role) AND (EXISTS ( SELECT 1 FROM journal_entries je WHERE ((je.id = journal_lines.entry_id) AND (je.segment = (select current_user_segment())))))));

alter policy service_contracts_insert on public.service_contracts
  with check ((( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope) OR (((select current_user_role()) = 'dept_manager'::user_role) AND (department_id = (select current_user_department_id())))));

alter policy service_contracts_pf_select on public.service_contracts
  using ((( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope) OR (((select current_user_role()) = 'dept_manager'::user_role) AND (department_id = (select current_user_department_id())))));

alter policy hr_monthly_payroll_finance_own_dept_select on public.hr_monthly_payroll
  using ((( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope) AND ((select current_user_department_id()) IS NOT NULL) AND (EXISTS ( SELECT 1 FROM hr_staff_costs s WHERE ((s.id = hr_monthly_payroll.staff_id) AND (s.department_id = (select current_user_department_id())))))));

alter policy hr_staff_costs_finance_own_dept_select on public.hr_staff_costs
  using ((( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope) AND ((select current_user_department_id()) IS NOT NULL) AND (department_id = (select current_user_department_id()))));

-- Guard: nothing in public may still call these three bare. Fails the
-- migration loudly if a later policy regresses and this file is re-run.
do $$
declare v_left int;
begin
  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'current_user_(role|segment|department_id)\(\)'
    and (coalesce(qual, '') || coalesce(with_check, '')) !~* '\(\s*select\s+current_user_(role|segment|department_id)';
  if v_left > 0 then
    raise exception 'rls_wrap_user_lookups: % policies still call a per-user lookup bare', v_left;
  end if;
end $$;
