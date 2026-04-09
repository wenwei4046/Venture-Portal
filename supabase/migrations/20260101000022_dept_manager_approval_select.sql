-- ============================================================================
-- 20260101000022_dept_manager_approval_select.sql
-- Phase 2 Step 7 — dept_manager RLS for own-department dept_expense approvals
--
-- The Phase 1 approvals_privileged_select policy only allows Principal +
-- Finance to SELECT approval_requests. Phase 2 Step 7 needs dept_managers to
-- see their own pending dept_expense submissions on /dept-pool/marketing.
-- Grant a narrow SELECT scoped to (request_type = 'dept_expense' AND
-- reference_id = own department id).
-- ============================================================================

CREATE POLICY approvals_dept_manager_own_expense_select ON approval_requests
    FOR SELECT USING (
        current_user_role() = 'dept_manager'
        AND request_type = 'dept_expense'
        AND reference_table = 'departments'
        AND reference_id = current_user_department_id()
    );

COMMENT ON POLICY approvals_dept_manager_own_expense_select ON approval_requests IS
    'Phase 2 Step 7: dept_managers can SELECT their own dept_expense approval_requests so the /dept-pool/{dept} page can display pending items. Scoped to the submitter’s department only.';
