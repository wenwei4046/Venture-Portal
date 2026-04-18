-- ============================================================================
-- 20260101000150_hr_cost_submissions_list_rpc.sql
-- Finance-safe list of HR cost submissions for Dept Pool columns + history
-- HOUZS Venture Portal
--
-- hr_cost_submissions RLS blocks Finance entirely (PII in staff_snapshot).
-- The dept_summaries JSONB column however is Finance-safe (dept-aggregates).
-- This RPC projects that Finance-safe subset across all submissions, so the
-- Dept Pool page can render the Costing Submission column (cumulative total
-- per dept) and the /dept-pool/submissions history page.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hr_cost_submissions_list()
RETURNS TABLE (
    id UUID,
    period_month DATE,
    submitted_at TIMESTAMPTZ,
    submitted_by_name TEXT,
    execution_state TEXT,
    dept_summaries JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        h.id,
        h.period_month,
        h.submitted_at,
        u.name,
        h.execution_state::TEXT,
        h.dept_summaries
    FROM hr_cost_submissions h
    LEFT JOIN users u ON u.id = h.submitted_by
    WHERE current_user_role() IN ('principal', 'finance', 'hr', 'dept_manager')
    ORDER BY h.period_month DESC;
$$;

COMMENT ON FUNCTION get_hr_cost_submissions_list() IS
    'Finance-safe list of all HR cost submissions. dept_summaries is aggregated and PII-free. Used by the Dept Pool page (Costing Submission column) and /dept-pool/submissions history view.';

GRANT EXECUTE ON FUNCTION get_hr_cost_submissions_list() TO authenticated;
