-- ============================================================================
-- 20260101000052_dashboard_pool_breakdown.sql
-- Expand Pool calculation: include dept_pool + hv_operating_fund balances
-- Add pool_breakdown detail showing where each RM comes from
-- HOUZS Venture Portal — Phase 4 Treasury Refactor
--
-- Changes:
--   1. total_pool = fund_sources + dept_pool_total + hv_fund_balance
--   2. free_cash = total_pool - loans_outstanding - buffer
--   3. New field: pool_breakdown (JSONB array of { source, label, amount })
--   4. New field: fund_source_breakdown (JSONB array by source_type)
-- ============================================================================

CREATE OR REPLACE FUNCTION dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
    v_role user_role;

    -- Phase 1 vars
    v_fund_total DECIMAL;
    v_loan_outstanding DECIMAL;
    v_weighted_cost DECIMAL;
    v_current_base_rate DECIMAL;
    v_op_margin DECIMAL;
    v_buffer_amount DECIMAL;
    v_monthly_interest_income DECIMAL;
    v_monthly_interest_expense DECIMAL;

    -- Phase 2 vars
    v_dept_pool_total DECIMAL;
    v_billing_float DECIMAL;
    v_mk_revenue DECIMAL;
    v_mk_staff_cost DECIMAL;
    v_mk_expenses DECIMAL;
    v_mk_dept_id UUID;

    -- Phase 3 vars
    v_current_period DATE;
    v_salary_pool_total DECIMAL;
    v_payouts_pending INTEGER;
    v_hv_fund_balance DECIMAL;
    v_invoice_pool_balance DECIMAL;
    v_total_advance DECIMAL;
    v_total_saving DECIMAL;

    -- Phase 4 vars
    v_total_pool DECIMAL;  -- expanded: fund_sources + dept_pool + hv_fund
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance') THEN
        RETURN jsonb_build_object('error', 'Access denied');
    END IF;

    v_current_period := DATE_TRUNC('month', CURRENT_DATE)::DATE;

    -- ── Phase 1: paid capital ──
    SELECT COALESCE(SUM(amount), 0) INTO v_fund_total
    FROM fund_sources WHERE status = 'active';

    SELECT COALESCE(SUM(principal), 0) INTO v_loan_outstanding
    FROM loans WHERE status = 'active';

    SELECT weighted_cost, base_rate, op_margin
    INTO v_weighted_cost, v_current_base_rate, v_op_margin
    FROM base_rate_history
    WHERE approved_at IS NOT NULL
    ORDER BY approved_at DESC LIMIT 1;

    SELECT COALESCE(config_value, 50000) INTO v_buffer_amount
    FROM treasury_config WHERE config_key = 'buffer_amount';

    SELECT COALESCE(SUM(l.principal * l.effective_rate), 0) INTO v_monthly_interest_income
    FROM loans l WHERE l.status = 'active';

    SELECT COALESCE(SUM(fs.amount * fs.cost_rate), 0) INTO v_monthly_interest_expense
    FROM fund_sources fs WHERE fs.status = 'active';

    -- ── Phase 2: dept pool + billing ──
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END), 0)
    INTO v_dept_pool_total FROM dept_pools;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_billing_float
    FROM invoices WHERE status IN ('issued', 'draft');

    SELECT id INTO v_mk_dept_id FROM departments WHERE name = 'Marketing' LIMIT 1;
    IF v_mk_dept_id IS NOT NULL THEN
        SELECT COALESCE(SUM(total_amount), 0) INTO v_mk_revenue
        FROM invoices WHERE billing_mode = 'marketing_project' AND period_month = v_current_period AND status IN ('issued', 'paid');
        SELECT COALESCE(SUM(total_ctc), 0) INTO v_mk_staff_cost
        FROM hr_staff_costs WHERE department_id = v_mk_dept_id AND status = 'active';
        SELECT COALESCE(SUM(amount), 0) INTO v_mk_expenses
        FROM dept_pools WHERE department_id = v_mk_dept_id AND transaction_type = 'expense_out';
    ELSE
        v_mk_revenue := 0; v_mk_staff_cost := 0; v_mk_expenses := 0;
    END IF;

    -- ── Phase 3: director salary + pools ──
    SELECT COALESCE(total_pool, 0) INTO v_salary_pool_total
    FROM salary_pool WHERE period_month = v_current_period;

    SELECT COUNT(*) INTO v_payouts_pending
    FROM director_payouts WHERE status = 'draft';

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('saving_in', 'surplus_in', 'profit_in')
        THEN amount ELSE -amount END
    ), 0) INTO v_hv_fund_balance FROM hv_operating_fund;

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'accumulate' THEN amount ELSE -amount END
    ), 0) INTO v_invoice_pool_balance FROM invoice_payout_pool;

    SELECT COALESCE(SUM(advance_amount), 0) INTO v_total_advance
    FROM director_payouts WHERE period_month = v_current_period;

    SELECT COALESCE(SUM(saving_amount), 0) INTO v_total_saving
    FROM director_payouts WHERE period_month = v_current_period;

    -- ── Phase 4: expanded pool = fund_sources + dept_pool + hv_fund ──
    -- (invoice_payout_pool is EXCLUDED — isolated per user requirement)
    v_total_pool := v_fund_total + GREATEST(v_dept_pool_total, 0) + GREATEST(v_hv_fund_balance, 0);

    -- ── Build result ──
    v_result := jsonb_build_object(
        'generated_at', NOW(),
        'role', v_role,

        -- Pool totals (Phase 4: expanded)
        'total_pool', v_total_pool,
        'fund_sources_total', v_fund_total,
        'loans_outstanding', v_loan_outstanding,
        'weighted_cost_rate', v_weighted_cost,
        'current_base_rate', v_current_base_rate,
        'op_margin', v_op_margin,

        'monthly_interest_income', v_monthly_interest_income,
        'monthly_interest_expense', v_monthly_interest_expense,
        'net_interest_income', v_monthly_interest_income - v_monthly_interest_expense,
        'net_spread', CASE WHEN v_weighted_cost IS NULL THEN NULL
            ELSE COALESCE(v_current_base_rate, 0) - v_weighted_cost END,

        'buffer_amount', v_buffer_amount,
        'free_cash', v_total_pool - v_loan_outstanding - COALESCE(v_buffer_amount, 0),
        'buffer_breach', (v_total_pool - v_loan_outstanding) < COALESCE(v_buffer_amount, 0),

        -- Pool breakdown: where the money comes from
        'pool_breakdown', jsonb_build_object(
            'fund_sources', v_fund_total,
            'dept_pool', GREATEST(v_dept_pool_total, 0),
            'hv_operating_fund', GREATEST(v_hv_fund_balance, 0),
            'total', v_total_pool
        ),

        -- Fund source detail by type
        'fund_source_breakdown', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'source_type', fs.source_type,
                'count', fs.cnt,
                'amount', fs.total_amount
            )), '[]'::jsonb)
            FROM (
                SELECT source_type, COUNT(*) AS cnt, SUM(amount) AS total_amount
                FROM fund_sources WHERE status = 'active'
                GROUP BY source_type ORDER BY SUM(amount) DESC
            ) fs
        ),

        -- Dept pool detail by department
        'dept_pool_breakdown', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'department_id', dp.department_id,
                'department_name', d.name,
                'balance', dp.balance
            ) ORDER BY dp.balance DESC), '[]'::jsonb)
            FROM (
                SELECT department_id,
                       SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END) AS balance
                FROM dept_pools GROUP BY department_id
            ) dp
            JOIN departments d ON d.id = dp.department_id
            WHERE dp.balance > 0
        ),

        -- Phase 2
        'dept_pool_total', v_dept_pool_total,
        'billing_float', v_billing_float,
        'marketing_np_this_month', jsonb_build_object(
            'revenue', v_mk_revenue,
            'staff_cost', v_mk_staff_cost,
            'expenses', v_mk_expenses,
            'net_profit', v_mk_revenue - v_mk_staff_cost - v_mk_expenses
        ),

        -- Subsidiaries
        'subsidiaries', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'short_code', c.short_code,
                'tier', c.tier,
                'savings_deposited', COALESCE((
                    SELECT SUM(fs.amount) FROM fund_sources fs
                    WHERE fs.from_company_id = c.id AND fs.status = 'active'
                ), 0),
                'loans_outstanding', COALESCE((
                    SELECT SUM(l.principal) FROM loans l
                    WHERE l.company_id = c.id AND l.status = 'active'
                ), 0),
                'net_position', COALESCE((
                    SELECT SUM(fs.amount) FROM fund_sources fs
                    WHERE fs.from_company_id = c.id AND fs.status = 'active'
                ), 0) - COALESCE((
                    SELECT SUM(l.principal) FROM loans l
                    WHERE l.company_id = c.id AND l.status = 'active'
                ), 0),
                'position', CASE
                    WHEN COALESCE((SELECT SUM(fs.amount) FROM fund_sources fs WHERE fs.from_company_id = c.id AND fs.status = 'active'), 0)
                       > COALESCE((SELECT SUM(l.principal) FROM loans l WHERE l.company_id = c.id AND l.status = 'active'), 0)
                    THEN 'creditor'
                    WHEN COALESCE((SELECT SUM(fs.amount) FROM fund_sources fs WHERE fs.from_company_id = c.id AND fs.status = 'active'), 0)
                       < COALESCE((SELECT SUM(l.principal) FROM loans l WHERE l.company_id = c.id AND l.status = 'active'), 0)
                    THEN 'debtor'
                    ELSE 'even'
                END,
                'has_overdue', EXISTS (
                    SELECT 1 FROM overdue_records orr
                    JOIN loans l ON l.id = orr.loan_id
                    WHERE l.company_id = c.id AND orr.status = 'pending'
                )
            ) ORDER BY c.name), '[]'::jsonb)
            FROM companies c WHERE c.is_active = TRUE
        ),

        'pending_approvals_count', (SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'),
        'pending_approvals', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', ar.id, 'request_type', ar.request_type,
                'description', ar.description, 'amount', ar.amount,
                'submitted_by_name', u.name, 'created_at', ar.created_at
            ) ORDER BY ar.created_at DESC), '[]'::jsonb)
            FROM approval_requests ar
            JOIN users u ON u.id = ar.submitted_by
            WHERE ar.status = 'pending'
        ),

        'alerts', (
            SELECT COALESCE(jsonb_agg(alert), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('severity', 'warning', 'message',
                    'Overdue: ' || COUNT(*) || ' records pending') AS alert
                FROM overdue_records WHERE status = 'pending'
                HAVING COUNT(*) > 0
                UNION ALL
                SELECT jsonb_build_object('severity', 'info', 'message',
                    COUNT(*) || ' fund source(s) maturing in 30 days') AS alert
                FROM fund_sources WHERE status = 'active' AND maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
                HAVING COUNT(*) > 0
                UNION ALL
                SELECT jsonb_build_object('severity', 'warning', 'message',
                    v_payouts_pending || ' director payout(s) in draft') AS alert
                WHERE v_payouts_pending > 0
            ) alerts_subq
        ),

        'free_cash_trend', '[]'::jsonb,
        'upcoming_cash_flow', (
            SELECT COALESCE(jsonb_agg(event ORDER BY event_date), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'date', maturity_date, 'type', 'fund_maturity',
                    'description', 'Savings matures', 'amount', amount
                ) AS event, maturity_date AS event_date
                FROM fund_sources
                WHERE status = 'active' AND maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
            ) cash_flow_subq
        ),

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

COMMENT ON FUNCTION dashboard_summary IS
    'Phase 4: expanded pool = fund_sources + dept_pool + hv_fund. pool_breakdown shows source detail.';
