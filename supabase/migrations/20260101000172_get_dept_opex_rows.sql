-- ============================================================================
-- 20260101000172_get_dept_opex_rows.sql
-- SECURITY DEFINER RPC for the dept_manager OPEX view (PR #3 of the
-- Marketing-portal redesign).
-- HOUZS Venture Portal (VP)
--
-- Why an RPC and not a new RLS policy:
--   hr_monthly_payroll currently grants SELECT only to principal / hr / finance.
--   Marketing dept_manager needs to see their own department's payroll so the
--   OPEX page (basic + KPI + allowance + employer statutory) can render.
--   Per the project's red-line rule we don't touch RLS — instead this SECURITY
--   DEFINER function bypasses RLS but enforces the access check internally,
--   matching the pattern in calculate_dept_np().
--
-- Authorised callers:
--   - principal           (any dept)
--   - hr                  (any dept)
--   - finance             (own dept only)
--   - dept_manager        (own dept only)
-- ============================================================================

DROP FUNCTION IF EXISTS get_dept_opex_rows(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_dept_opex_rows(
    p_dept_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS TABLE (
    period_month DATE,
    employee_name TEXT,
    basic_salary DECIMAL(15, 2),
    statutory_allowance DECIMAL(15, 2),
    non_statutory_allowance DECIMAL(15, 2),
    commission_amount DECIMAL(15, 2),
    epf_er DECIMAL(15, 2),
    socso_er DECIMAL(15, 2),
    eis_er DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_user_dept UUID;
BEGIN
    v_role := current_user_role();
    v_user_dept := current_user_department_id();

    IF v_role = 'principal' OR v_role = 'hr' THEN
        -- ok, see all departments
        NULL;
    ELSIF v_role IN ('finance', 'dept_manager') THEN
        IF v_user_dept IS NULL OR v_user_dept <> p_dept_id THEN
            RAISE EXCEPTION 'get_dept_opex_rows: % can only query own department', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        RAISE EXCEPTION 'get_dept_opex_rows: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        p.period_month,
        s.employee_name,
        p.basic_salary,
        p.statutory_allowance,
        p.non_statutory_allowance,
        p.commission_amount,
        p.epf_er,
        p.socso_er,
        p.eis_er
    FROM hr_monthly_payroll p
    JOIN hr_staff_costs s ON s.id = p.staff_id
    WHERE s.department_id = p_dept_id
      AND p.period_month BETWEEN p_period_start AND p_period_end
    ORDER BY p.period_month DESC, s.employee_name;
END;
$$;

COMMENT ON FUNCTION get_dept_opex_rows(UUID, DATE, DATE) IS
    'PR #3 (Marketing OPEX view): returns per-employee payroll components for a dept across a date range. SECURITY DEFINER with internal role check (principal/hr full, finance/dept_manager own-dept only). Powers /opex page for dept_manager users without granting them direct hr_monthly_payroll SELECT.';

GRANT EXECUTE ON FUNCTION get_dept_opex_rows(UUID, DATE, DATE) TO authenticated;
