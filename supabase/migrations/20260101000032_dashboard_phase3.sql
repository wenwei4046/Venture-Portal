-- ============================================================================
-- 20260101000032_dashboard_phase3.sql
-- Dashboard Phase 3 extensions: director salary, operating fund, invoice pool
-- Phase 3 Step 9 — HOUZS Venture Portal
-- ============================================================================

-- Replace dashboard_summary() to add Phase 3 keys
-- Preserves all Phase 1 + Phase 2 keys
CREATE OR REPLACE FUNCTION dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
    v_role user_role;
    v_current_period DATE;

    -- Phase 1 vars
    v_total_paid DECIMAL;
    v_total_outstanding DECIMAL;
    v_total_free_pool DECIMAL;
    v_buffer_amount DECIMAL;
    v_active_loans INTEGER;
    v_pending_approvals INTEGER;
    v_overdue_count INTEGER;
    v_total_overdue_amount DECIMAL;
    v_weighted_cost DECIMAL;
    v_current_base_rate DECIMAL;

    -- Phase 2 vars
    v_dept_pool_total DECIMAL;
    v_billing_float DECIMAL;
    v_marketing_np DECIMAL;

    -- Phase 3 vars
    v_salary_pool_total DECIMAL;
    v_payouts_pending INTEGER;
    v_hv_fund_balance DECIMAL;
    v_invoice_pool_balance DECIMAL;
    v_total_advance DECIMAL;
    v_total_saving DECIMAL;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance') THEN
        RETURN jsonb_build_object('error', 'Access denied');
    END IF;

    v_current_period := DATE_TRUNC('month', CURRENT_DATE)::DATE;

    -- Phase 1: Paid capital
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM fund_sources WHERE status = 'active';

    -- Phase 1: Outstanding loans
    SELECT COALESCE(SUM(principal), 0), COUNT(*)
    INTO v_total_outstanding, v_active_loans
    FROM loans WHERE status = 'active';

    -- Phase 1: Buffer
    SELECT COALESCE(config_value, 50000) INTO v_buffer_amount
    FROM treasury_config WHERE config_key = 'buffer_amount';

    -- Phase 1: Free pool
    v_total_free_pool := v_total_paid - v_total_outstanding - COALESCE(v_buffer_amount, 50000);

    -- Phase 1: Pending approvals
    SELECT COUNT(*) INTO v_pending_approvals
    FROM approval_requests WHERE status = 'pending';

    -- Phase 1: Overdue
    SELECT COUNT(*), COALESCE(SUM(penalty_amount), 0)
    INTO v_overdue_count, v_total_overdue_amount
    FROM overdue_records WHERE status = 'pending';

    -- Phase 1: Base rate
    SELECT weighted_cost, base_rate INTO v_weighted_cost, v_current_base_rate
    FROM base_rate_history
    WHERE approved_at IS NOT NULL
    ORDER BY approved_at DESC LIMIT 1;

    -- Phase 2: Dept pool
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END), 0)
    INTO v_dept_pool_total FROM dept_pools;

    -- Phase 2: Billing float
    SELECT COALESCE(SUM(total_amount), 0) INTO v_billing_float
    FROM invoices WHERE status IN ('issued', 'draft');

    -- Phase 2: Marketing NP
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END), 0)
    INTO v_marketing_np
    FROM dept_pools dp
    JOIN departments d ON d.id = dp.department_id
    WHERE d.name = 'Marketing' AND dp.period_month = v_current_period;

    -- Phase 3: Salary pool for current period
    SELECT COALESCE(total_pool, 0) INTO v_salary_pool_total
    FROM salary_pool WHERE period_month = v_current_period;

    -- Phase 3: Pending director payouts
    SELECT COUNT(*) INTO v_payouts_pending
    FROM director_payouts WHERE status = 'draft';

    -- Phase 3: HV Operating Fund balance
    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('saving_in', 'surplus_in', 'profit_in')
        THEN amount ELSE -amount END
    ), 0) INTO v_hv_fund_balance FROM hv_operating_fund;

    -- Phase 3: Invoice Payout Pool balance
    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'accumulate' THEN amount ELSE -amount END
    ), 0) INTO v_invoice_pool_balance FROM invoice_payout_pool;

    -- Phase 3: Total advance (current period)
    SELECT COALESCE(SUM(advance_amount), 0) INTO v_total_advance
    FROM director_payouts WHERE period_month = v_current_period;

    -- Phase 3: Total saving (current period)
    SELECT COALESCE(SUM(saving_amount), 0) INTO v_total_saving
    FROM director_payouts WHERE period_month = v_current_period;

    v_result := jsonb_build_object(
        -- Phase 1
        'total_paid_capital', v_total_paid,
        'total_outstanding', v_total_outstanding,
        'free_pool', v_total_free_pool,
        'buffer_amount', v_buffer_amount,
        'active_loans', v_active_loans,
        'pending_approvals', v_pending_approvals,
        'overdue_count', v_overdue_count,
        'total_overdue_amount', v_total_overdue_amount,
        'weighted_cost', v_weighted_cost,
        'current_base_rate', v_current_base_rate,
        -- Phase 2
        'dept_pool_total', v_dept_pool_total,
        'billing_float', v_billing_float,
        'marketing_np_this_month', v_marketing_np,
        -- Phase 3
        'salary_pool_total', v_salary_pool_total,
        'payouts_pending', v_payouts_pending,
        'hv_fund_balance', v_hv_fund_balance,
        'invoice_pool_balance', v_invoice_pool_balance,
        'total_advance', v_total_advance,
        'total_saving', v_total_saving
    );

    RETURN v_result;
END;
$$;
