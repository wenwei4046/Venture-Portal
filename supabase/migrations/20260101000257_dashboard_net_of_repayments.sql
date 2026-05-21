-- Dashboard: show LIVE outstanding (net of repayments) instead of gross originals.
--   * Top-level loans_outstanding ("lent" hero figure) = active principal - principal repayments.
--   * Subsidiaries: savings_deposited / loans_outstanding / net_position / position
--     all computed net of repayments.
-- Loan repayments live in `repayments` (principal portion only counts toward
-- principal reduction). Borrowed-in (savings) repayments live in
-- `fund_source_repayments` where principal + netting both reduce the balance.
-- Interest income/expense (Margin panel) intentionally left on gross principal.
-- Reconciles to opening Trial Balance receivables/payables for every entity.

CREATE OR REPLACE FUNCTION public.dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_result JSONB;
    v_role user_role;

    v_fund_total DECIMAL;
    v_loan_outstanding DECIMAL;
    v_weighted_cost DECIMAL;
    v_current_base_rate DECIMAL;
    v_op_margin DECIMAL;
    v_monthly_interest_income DECIMAL;
    v_monthly_interest_expense DECIMAL;

    v_dept_pool_total DECIMAL;
    v_billing_float DECIMAL;
    v_mk_revenue DECIMAL;
    v_mk_staff_cost DECIMAL;
    v_mk_expenses DECIMAL;
    v_mk_dept_id UUID;

    v_current_period DATE;
    v_salary_pool_total DECIMAL;
    v_payouts_pending INTEGER;
    v_hv_fund_balance DECIMAL;
    v_invoice_pool_balance DECIMAL;
    v_total_advance DECIMAL;
    v_total_saving DECIMAL;

    v_total_pool DECIMAL;
    v_director_dept_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance') THEN
        RETURN jsonb_build_object('error', 'Access denied');
    END IF;

    v_current_period := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    SELECT id INTO v_director_dept_id FROM departments WHERE name = 'Director' LIMIT 1;

    SELECT COALESCE(SUM(amount), 0) INTO v_fund_total
    FROM fund_sources WHERE status = 'active';

    -- LIVE lent: active principal minus principal repaid on those loans.
    SELECT COALESCE(SUM(l.principal), 0) - COALESCE((
        SELECT SUM(r.amount) FROM repayments r
        JOIN loans l2 ON l2.id = r.loan_id
        WHERE l2.status = 'active' AND r.payment_type = 'principal'
    ), 0)
    INTO v_loan_outstanding
    FROM loans l WHERE l.status = 'active';

    SELECT weighted_cost, base_rate, op_margin
    INTO v_weighted_cost, v_current_base_rate, v_op_margin
    FROM base_rate_history
    WHERE approved_at IS NOT NULL
    ORDER BY approved_at DESC LIMIT 1;

    SELECT COALESCE(SUM(l.principal * l.effective_rate), 0) INTO v_monthly_interest_income
    FROM loans l WHERE l.status = 'active';

    SELECT COALESCE(SUM(fs.amount * fs.cost_rate), 0) INTO v_monthly_interest_expense
    FROM fund_sources fs WHERE fs.status = 'active';

    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END), 0)
    INTO v_dept_pool_total FROM dept_pools
    WHERE department_id IS DISTINCT FROM v_director_dept_id;

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

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END
    ), 0) INTO v_salary_pool_total
    FROM dept_pools
    WHERE department_id = v_director_dept_id
      AND period_month = v_current_period;

    SELECT COUNT(*) INTO v_payouts_pending
    FROM director_payouts WHERE status = 'draft';

    -- Phase 10 (mig 192): HV operational cash ledger.
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('fund_in', 'loan_repayment_in', 'profit_in') THEN amount
            WHEN transaction_type IN ('fund_out', 'expense_out') THEN -amount
        END
    ), 0) INTO v_hv_fund_balance FROM venture_pool;

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'accumulate' THEN amount ELSE -amount END
    ), 0) INTO v_invoice_pool_balance FROM invoice_payout_pool;

    SELECT COALESCE(SUM(advance_amount), 0) INTO v_total_advance
    FROM director_payouts WHERE period_month = v_current_period;

    SELECT COALESCE(SUM(saving_amount), 0) INTO v_total_saving
    FROM director_payouts WHERE period_month = v_current_period;

    v_total_pool := GREATEST(v_dept_pool_total, 0) + GREATEST(v_hv_fund_balance, 0);

    v_result := jsonb_build_object(
        'generated_at', NOW(),
        'role', v_role,

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

        'pool_breakdown', jsonb_build_object(
            'fund_sources', v_fund_total,
            'dept_pool', GREATEST(v_dept_pool_total, 0),
            'venture_pool', GREATEST(v_hv_fund_balance, 0),
            'total', v_total_pool
        ),

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

        'dept_pool_total', v_dept_pool_total,
        'billing_float', v_billing_float,
        'marketing_np_this_month', jsonb_build_object(
            'revenue', v_mk_revenue,
            'staff_cost', v_mk_staff_cost,
            'expenses', v_mk_expenses,
            'net_profit', v_mk_revenue - v_mk_staff_cost - v_mk_expenses
        ),

        -- Subsidiaries net of repayments (LIVE outstanding). Reconciles to opening TB.
        'subsidiaries', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'short_code', s.short_code,
                'savings_deposited', s.net_savings,
                'loans_outstanding', s.net_loans,
                'net_position', s.net_savings - s.net_loans,
                'position', CASE
                    WHEN s.net_savings > s.net_loans THEN 'creditor'
                    WHEN s.net_savings < s.net_loans THEN 'debtor'
                    ELSE 'even'
                END,
                'has_overdue', s.has_overdue
            ) ORDER BY s.name), '[]'::jsonb)
            FROM (
                SELECT
                    c.id, c.name, c.short_code,
                    COALESCE((
                        SELECT SUM(fs.amount) FROM fund_sources fs
                        WHERE fs.from_company_id = c.id AND fs.status = 'active'
                    ), 0) - COALESCE((
                        SELECT SUM(fsr.amount) FROM fund_source_repayments fsr
                        JOIN fund_sources fs ON fs.id = fsr.fund_source_id
                        WHERE fs.from_company_id = c.id AND fs.status = 'active'
                          AND fsr.payment_type IN ('principal', 'netting')
                    ), 0) AS net_savings,
                    COALESCE((
                        SELECT SUM(l.principal) FROM loans l
                        WHERE l.company_id = c.id AND l.status = 'active'
                    ), 0) - COALESCE((
                        SELECT SUM(r.amount) FROM repayments r
                        JOIN loans l ON l.id = r.loan_id
                        WHERE l.company_id = c.id AND l.status = 'active'
                          AND r.payment_type = 'principal'
                    ), 0) AS net_loans,
                    EXISTS (
                        SELECT 1 FROM overdue_records orr
                        JOIN loans l ON l.id = orr.loan_id
                        WHERE l.company_id = c.id AND orr.status = 'pending'
                    ) AS has_overdue
                FROM companies c WHERE c.is_active = TRUE
            ) s
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

        'salary_pool_total', v_salary_pool_total,
        'payouts_pending', v_payouts_pending,
        'hv_fund_balance', v_hv_fund_balance,
        'invoice_pool_balance', v_invoice_pool_balance,
        'total_advance', v_total_advance,
        'total_saving', v_total_saving
    );

    RETURN v_result;
END;
$function$;
