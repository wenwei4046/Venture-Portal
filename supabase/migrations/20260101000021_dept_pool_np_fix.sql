-- ============================================================================
-- 20260101000021_dept_pool_np_fix.sql
-- Phase 2 Step 7 — fix ambiguous column reference in calculate_dept_np
--
-- The original migration 20 declared RETURNS TABLE columns with the same
-- names as columns on dept_pools / jsonb_array_elements payloads. PL/pgSQL
-- could not disambiguate `department_id` inside the WHERE clause and raised
-- 42702 at call time. This migration drops and recreates the function with
-- `out_` prefixed return columns so inner query columns keep their natural
-- names.
-- ============================================================================

DROP FUNCTION IF EXISTS calculate_dept_np(UUID, DATE);

CREATE OR REPLACE FUNCTION calculate_dept_np(p_dept_id UUID, p_period DATE)
RETURNS TABLE (
    out_department_id UUID,
    out_period_month DATE,
    out_revenue DECIMAL(15, 2),
    out_staff_cost DECIMAL(15, 2),
    out_expenses DECIMAL(15, 2),
    out_net_profit DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_revenue DECIMAL(15, 2);
    v_staff_cost DECIMAL(15, 2);
    v_expenses DECIMAL(15, 2);
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'dept_manager', 'hr') THEN
        RAISE EXCEPTION 'calculate_dept_np: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role = 'dept_manager' AND p_dept_id <> current_user_department_id() THEN
        RAISE EXCEPTION 'calculate_dept_np: dept_manager can only query own department'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_period := date_trunc('month', p_period)::date;

    -- Revenue: marketing_project invoices linked to contracts for this dept
    SELECT COALESCE(SUM(inv.total_amount), 0) INTO v_revenue
    FROM invoices inv
    LEFT JOIN service_contracts sc ON sc.id = inv.contract_id
    WHERE inv.period_month = v_period
      AND inv.billing_mode = 'marketing_project'
      AND sc.department_id = p_dept_id;

    -- Staff cost: sum of basic_salary from the period's HR submission snapshot
    SELECT COALESCE(SUM((staff_elem->>'basic_salary')::decimal), 0) INTO v_staff_cost
    FROM hr_cost_submissions hcs,
         jsonb_array_elements(hcs.staff_snapshot) AS staff_elem
    WHERE hcs.period_month = v_period
      AND (staff_elem->>'department_id')::uuid = p_dept_id
      AND (staff_elem->>'status') = 'active';

    -- Dept expenses: approved expense_out rows for this period
    SELECT COALESCE(SUM(dp.amount), 0) INTO v_expenses
    FROM dept_pools dp
    WHERE dp.department_id = p_dept_id
      AND dp.period_month = v_period
      AND dp.transaction_type = 'expense_out';

    RETURN QUERY SELECT
        p_dept_id,
        v_period,
        v_revenue,
        v_staff_cost,
        v_expenses,
        v_revenue - v_staff_cost - v_expenses;
END;
$$;

COMMENT ON FUNCTION calculate_dept_np(UUID, DATE) IS
    'Phase 2 Step 7 (v2): department NP = revenue - staff basic salary - approved dept expenses. OUT columns prefixed with out_ to prevent ambiguous reference errors inside the function body. SECURITY DEFINER, role-checked, dept_manager scoped to own department.';

GRANT EXECUTE ON FUNCTION calculate_dept_np(UUID, DATE) TO authenticated;
