-- ============================================================================
-- 20260101000020_dept_pool_np.sql
-- Phase 2 Step 7 — calculate_dept_np() RPC for Dept Pool P&L view
-- HOUZS Venture Portal (VP)
--
-- Marketing is the only dept with a real P&L (revenue from marketing_project
-- invoices). HR + Finance are cost-to-cost (revenue = 0). Per the spec:
--
--   NP = Revenue − Staff Basic Salary (from HR) − Dept Expenses (approved)
--
-- Staff basic salary comes from the period's hr_cost_submissions snapshot so
-- the number matches what Finance billed from. Dept expenses come from the
-- dept_pools expense_out rows written by the Step 2 approval cascade trigger.
-- ============================================================================

-- Drop any previous version so we can re-declare with renamed OUT columns.
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
    -- Dept Manager restriction: own dept only
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

    -- Staff cost: sum of basic_salary from the period's HR submission snapshot.
    -- Filter to active staff in the target department.
    SELECT COALESCE(SUM((staff_elem->>'basic_salary')::decimal), 0) INTO v_staff_cost
    FROM hr_cost_submissions hcs,
         jsonb_array_elements(hcs.staff_snapshot) AS staff_elem
    WHERE hcs.period_month = v_period
      AND (staff_elem->>'department_id')::uuid = p_dept_id
      AND (staff_elem->>'status') = 'active';

    -- Dept expenses: sum of approved expense_out rows for this period
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
    'Phase 2 Step 7: computes department NP = revenue - staff basic salary - approved dept expenses for a given period. Reads from invoices (marketing_project) + hr_cost_submissions snapshot + dept_pools. SECURITY DEFINER with internal role check; dept_manager can only query their own department. OUT columns prefixed with out_ to avoid ambiguity with inner query columns.';

GRANT EXECUTE ON FUNCTION calculate_dept_np(UUID, DATE) TO authenticated;
