-- ============================================================================
-- 20260101000152_payroll_breakdown_rpc.sql
-- Task 3 — per-department payroll breakdown for the Generate PV preview
-- HOUZS Venture Portal
--
-- When Finance opens a submitted payroll_payment_request and clicks
-- "Generate PV", they now see a 4-row breakdown instead of picking a single
-- pool. Each row shows:
--   - which Department Pool the money comes from
--   - how much that dept's staff cost this month (gross + ER EPF/SOCSO/EIS)
--   - current pool balance
--
-- Finance fills in per-row amounts (prefilled = required). Submit creates
-- one voucher with up to 4 payment_voucher_sources rows, then existing
-- executeVoucher/debitVoucherPools handles the multi-pool debit.
--
-- Returns 4 rows in fixed order (HR, Finance, Director Office, Marketing)
-- regardless of whether the dept has staff — UI grays out zero-required
-- rows. Directors go through the separate per-director fan-out at
-- payroll_run approval and are not listed here.
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
    -- Resolve the period from the request → payroll_run
    SELECT pr.period_month
      INTO v_period
      FROM payroll_payment_requests ppr
      JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or not linked to a payroll_run', p_request_id;
    END IF;

    RETURN QUERY
    WITH dept_totals AS (
        SELECT
            LOWER(d.name) AS dept_slug,
            d.name AS dept_name,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.name IN ('HR', 'Finance', 'Director Office', 'Marketing')
         GROUP BY d.id, d.name
    ),
    op_balances AS (
        SELECT pool_type::TEXT AS pool_type, balance
          FROM operating_pool_balance
    ),
    marketing_balance AS (
        -- Marketing pool lives in dept_pools (P&L semantics), balance already
        -- computed by the dept_pool_balances view. Everything else is in
        -- operating_pools. We can't UNION them directly because the keys are
        -- different shapes (enum vs text + uuid) — pivot to one flat shape.
        SELECT COALESCE(SUM(
            CASE dp.transaction_type
                WHEN 'np_in' THEN dp.amount
                WHEN 'expense_out' THEN -dp.amount
            END
        ), 0)::DECIMAL(15, 2) AS balance
          FROM dept_pools dp
          JOIN departments d ON d.id = dp.department_id
         WHERE d.name = 'Marketing'
    )
    SELECT
        CASE dt.dept_slug
            WHEN 'hr' THEN 'hr_opex'
            WHEN 'finance' THEN 'finance_opex'
            WHEN 'director office' THEN 'director_opex'
            WHEN 'marketing' THEN 'dept_pool_marketing'
        END AS pool_key,
        dt.dept_name,
        dt.total AS required_amount,
        CASE dt.dept_slug
            WHEN 'hr' THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'hr_opex'), 0)
            WHEN 'finance' THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'finance_opex'), 0)
            WHEN 'director office' THEN COALESCE((SELECT balance FROM op_balances WHERE pool_type = 'director_opex'), 0)
            WHEN 'marketing' THEN (SELECT balance FROM marketing_balance)
        END::DECIMAL(15, 2) AS pool_balance
      FROM dept_totals dt
     -- Canonical order: HR, Finance, Director Office, Marketing
     ORDER BY CASE dt.dept_slug
         WHEN 'hr' THEN 1
         WHEN 'finance' THEN 2
         WHEN 'director office' THEN 3
         WHEN 'marketing' THEN 4
         ELSE 99
     END;
END;
$$;

COMMENT ON FUNCTION get_payroll_breakdown_by_pool(UUID) IS
    'Task 3: per-department staff payroll total + pool balance for the Generate PV preview. Marketing pool comes from dept_pools; HR/Finance/Director Office from operating_pools. Returns 4 fixed rows even if a dept has no staff.';

GRANT EXECUTE ON FUNCTION get_payroll_breakdown_by_pool(UUID) TO authenticated;
