-- ============================================================================
-- 20260101000163_fix_payroll_breakdown_ambiguous.sql
-- Fix: migration 159 introduced a column-name clash between the CTE's
-- dept_name column and the RETURNS TABLE output column of the same name.
-- Postgres throws 42702 "column reference dept_name is ambiguous" and the
-- Payroll Requests page ends up with an empty Department Pool table.
-- HOUZS Venture Portal
-- ============================================================================

CREATE OR REPLACE FUNCTION get_payroll_breakdown_by_pool(p_request_id UUID)
RETURNS TABLE (
    pool_key TEXT,
    dept_name TEXT,
    required_amount DECIMAL(15, 2),
    pool_balance DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_period DATE;
BEGIN
    SELECT pr.period_month
      INTO v_period
      FROM payroll_payment_requests ppr
      JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or not linked to a payroll_run', p_request_id;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        SELECT
            LOWER(d.name) AS dept_slug,
            d.name        AS d_name,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.name IN ('HR', 'Finance', 'Director Office', 'Marketing')
         GROUP BY d.id, d.name
    ),
    director_total AS (
        SELECT
            'director'::TEXT AS dept_slug,
            'Director'::TEXT AS d_name,
            COALESCE(SUM(gross_amount), 0)::DECIMAL(15, 2) AS total
          FROM director_payouts
         WHERE period_month = v_period
    ),
    all_totals AS (
        SELECT dept_slug, d_name, total FROM hr_payroll_totals
        UNION ALL
        SELECT dept_slug, d_name, total FROM director_total
    ),
    op_balances AS (
        SELECT pool_type::TEXT AS pool_type, balance
          FROM operating_pool_balance
    ),
    marketing_balance AS (
        SELECT COALESCE(SUM(
            CASE dp.transaction_type
                WHEN 'np_in' THEN dp.amount
                WHEN 'expense_out' THEN -dp.amount
            END
        ), 0)::DECIMAL(15, 2) AS balance
          FROM dept_pools dp
          JOIN departments d ON d.id = dp.department_id
         WHERE d.name = 'Marketing'
    ),
    director_balance AS (
        SELECT COALESCE(SUM(
            CASE dp.transaction_type
                WHEN 'np_in' THEN dp.amount
                WHEN 'expense_out' THEN -dp.amount
            END
        ), 0)::DECIMAL(15, 2) AS balance
          FROM dept_pools dp
          JOIN departments d ON d.id = dp.department_id
         WHERE d.name = 'Director'
    )
    SELECT
        CASE at.dept_slug
            WHEN 'hr'              THEN 'hr_opex'
            WHEN 'finance'         THEN 'finance_opex'
            WHEN 'director office' THEN 'director_opex'
            WHEN 'marketing'       THEN 'dept_pool_marketing'
            WHEN 'director'        THEN 'dept_pool_director'
        END AS pool_key,
        at.d_name AS dept_name,
        at.total  AS required_amount,
        CASE at.dept_slug
            WHEN 'hr'              THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'hr_opex'), 0)
            WHEN 'finance'         THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'finance_opex'), 0)
            WHEN 'director office' THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'director_opex'), 0)
            WHEN 'marketing'       THEN (SELECT balance FROM marketing_balance)
            WHEN 'director'        THEN (SELECT balance FROM director_balance)
        END::DECIMAL(15, 2) AS pool_balance
      FROM all_totals at
     ORDER BY CASE at.dept_slug
         WHEN 'hr'              THEN 1
         WHEN 'finance'         THEN 2
         WHEN 'director office' THEN 3
         WHEN 'marketing'       THEN 4
         WHEN 'director'        THEN 5
         ELSE 99
     END;
END;
$$;
