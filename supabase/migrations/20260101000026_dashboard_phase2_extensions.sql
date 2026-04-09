-- ============================================================================
-- 20260101000026_dashboard_phase2_extensions.sql
-- Phase 2 Step 9 — extend dashboard_summary() with Phase 2 KPIs
-- HOUZS Venture Portal (VP)
--
-- New keys in the JSONB return:
-- - dept_pool_total            : sum of positive dept pool balances
-- - billing_float              : sum of unpaid (draft + issued) invoice totals
-- - marketing_np_this_month    : current-month Marketing P&L (from the same
--                                snapshot + dept_pools logic calculate_dept_np
--                                uses). JSON with revenue/staff_cost/expenses/
--                                net_profit so the dashboard can show the
--                                breakdown, not just a single number.
-- ============================================================================

CREATE OR REPLACE FUNCTION dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_result JSONB;
    v_fund_total DECIMAL(15, 2);
    v_loan_outstanding DECIMAL(15, 2);
    v_weighted_cost DECIMAL(7, 6);
    v_buffer_amount DECIMAL(15, 2);
    v_op_margin DECIMAL(7, 6);
    v_current_base_rate DECIMAL(7, 6);
    v_monthly_interest_income DECIMAL(15, 2);
    v_monthly_interest_expense DECIMAL(15, 2);
    v_dept_pool_total DECIMAL(15, 2);
    v_billing_float DECIMAL(15, 2);
    v_marketing_dept_id UUID;
    v_current_period DATE;
    v_mk_revenue DECIMAL(15, 2);
    v_mk_staff_cost DECIMAL(15, 2);
    v_mk_expenses DECIMAL(15, 2);
BEGIN
    v_role := current_user_role();

    IF v_role NOT IN ('principal', 'finance') THEN
        RAISE EXCEPTION 'dashboard_summary: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Phase 1 treasury stats
    SELECT COALESCE(SUM(amount), 0) INTO v_fund_total
    FROM fund_sources WHERE status = 'active';

    SELECT COALESCE(SUM(outstanding), 0) INTO v_loan_outstanding
    FROM loan_outstanding
    WHERE status = 'active';

    SELECT weighted_cost_rate INTO v_weighted_cost
    FROM fund_sources_weighted_cost;

    SELECT config_value INTO v_buffer_amount
    FROM treasury_config WHERE config_key = 'buffer_amount';

    SELECT base_rate, op_margin INTO v_current_base_rate, v_op_margin
    FROM get_current_base_rate(CURRENT_DATE);

    SELECT COALESCE(SUM(outstanding * effective_rate), 0)
    INTO v_monthly_interest_income
    FROM loan_outstanding
    WHERE status = 'active';

    SELECT COALESCE(SUM(amount * cost_rate), 0)
    INTO v_monthly_interest_expense
    FROM fund_sources
    WHERE status = 'active';

    -- ── Phase 2 stats ────────────────────────────────────────────────────
    -- Dept pool total: sum of positive balances (HR + Finance are cost-to-cost
    -- at 0; Marketing carries the actual pool)
    SELECT COALESCE(SUM(GREATEST(balance, 0)), 0) INTO v_dept_pool_total
    FROM dept_pool_balances;

    -- Billing float: unpaid invoice totals (draft + issued)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_billing_float
    FROM invoices
    WHERE status IN ('draft', 'issued');

    -- Marketing NP this month — mirror of calculate_dept_np for the Marketing dept
    v_current_period := date_trunc('month', CURRENT_DATE)::date;
    SELECT id INTO v_marketing_dept_id FROM departments WHERE name = 'Marketing';

    IF v_marketing_dept_id IS NOT NULL THEN
        SELECT COALESCE(SUM(inv.total_amount), 0) INTO v_mk_revenue
        FROM invoices inv
        LEFT JOIN service_contracts sc ON sc.id = inv.contract_id
        WHERE inv.period_month = v_current_period
          AND inv.billing_mode = 'marketing_project'
          AND sc.department_id = v_marketing_dept_id;

        SELECT COALESCE(SUM((staff_elem->>'basic_salary')::decimal), 0) INTO v_mk_staff_cost
        FROM hr_cost_submissions hcs,
             jsonb_array_elements(hcs.staff_snapshot) AS staff_elem
        WHERE hcs.period_month = v_current_period
          AND (staff_elem->>'department_id')::uuid = v_marketing_dept_id
          AND (staff_elem->>'status') = 'active';

        SELECT COALESCE(SUM(dp.amount), 0) INTO v_mk_expenses
        FROM dept_pools dp
        WHERE dp.department_id = v_marketing_dept_id
          AND dp.period_month = v_current_period
          AND dp.transaction_type = 'expense_out';
    ELSE
        v_mk_revenue := 0;
        v_mk_staff_cost := 0;
        v_mk_expenses := 0;
    END IF;

    -- ── Build result JSONB ───────────────────────────────────────────────
    v_result := jsonb_build_object(
        'generated_at', NOW(),
        'role', v_role,

        'total_pool', v_fund_total,
        'loans_outstanding', v_loan_outstanding,
        'weighted_cost_rate', v_weighted_cost,
        'current_base_rate', v_current_base_rate,
        'op_margin', v_op_margin,

        'monthly_interest_income', v_monthly_interest_income,
        'monthly_interest_expense', v_monthly_interest_expense,
        'net_interest_income', v_monthly_interest_income - v_monthly_interest_expense,
        'net_spread',
            CASE
                WHEN v_weighted_cost IS NULL THEN NULL
                ELSE COALESCE(v_current_base_rate, 0) - v_weighted_cost
            END,

        'buffer_amount', v_buffer_amount,
        'free_cash',
            v_fund_total - v_loan_outstanding - COALESCE(v_buffer_amount, 0),
        'buffer_breach',
            (v_fund_total - v_loan_outstanding) < COALESCE(v_buffer_amount, 0),

        -- NEW (Phase 2): department pool total
        'dept_pool_total', v_dept_pool_total,

        -- NEW (Phase 2): billing float — unpaid invoices
        'billing_float', v_billing_float,

        -- NEW (Phase 2): Marketing NP this month
        'marketing_np_this_month', jsonb_build_object(
            'period_month', v_current_period,
            'revenue', v_mk_revenue,
            'staff_cost', v_mk_staff_cost,
            'expenses', v_mk_expenses,
            'net_profit', v_mk_revenue - v_mk_staff_cost - v_mk_expenses
        ),

        'fund_breakdown', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'source_type', source_type,
                'amount', total
            )), '[]'::jsonb)
            FROM (
                SELECT source_type, SUM(amount) AS total
                FROM fund_sources
                WHERE status = 'active'
                GROUP BY source_type
            ) t
        ),

        'loan_health', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'company', name,
                'outstanding', outstanding,
                'status', loan_status
            )), '[]'::jsonb)
            FROM (
                SELECT
                    c.name,
                    lo.outstanding,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM overdue_records orr
                            WHERE orr.loan_id = lo.loan_id
                              AND orr.status = 'pending'
                              AND orr.overdue_stage IN ('late_2', 'escalation')
                        ) THEN 'overdue_late'
                        WHEN EXISTS (
                            SELECT 1 FROM overdue_records orr
                            WHERE orr.loan_id = lo.loan_id
                              AND orr.status = 'pending'
                              AND orr.overdue_stage = 'late_1'
                        ) THEN 'overdue_early'
                        ELSE 'current'
                    END AS loan_status
                FROM loan_outstanding lo
                JOIN companies c ON c.id = lo.company_id
                WHERE lo.status = 'active'
            ) t
        ),

        'subsidiaries', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'name', name,
                    'short_code', short_code,
                    'tier', tier,
                    'savings_deposited', savings_deposited,
                    'loans_outstanding', loans_outstanding_per_company,
                    'net_position', net_position,
                    'position',
                        CASE
                            WHEN net_position > 0 THEN 'creditor'
                            WHEN net_position < 0 THEN 'debtor'
                            ELSE 'even'
                        END,
                    'has_overdue', has_overdue
                )
                ORDER BY tier ASC, name ASC
            ), '[]'::jsonb)
            FROM (
                SELECT
                    c.id,
                    c.name,
                    c.short_code,
                    c.tier,
                    COALESCE((
                        SELECT SUM(fs.amount)
                        FROM fund_sources fs
                        WHERE fs.from_company_id = c.id
                          AND fs.status = 'active'
                    ), 0) AS savings_deposited,
                    COALESCE((
                        SELECT SUM(lo.outstanding)
                        FROM loan_outstanding lo
                        WHERE lo.company_id = c.id
                          AND lo.status = 'active'
                    ), 0) AS loans_outstanding_per_company,
                    COALESCE((
                        SELECT SUM(fs.amount)
                        FROM fund_sources fs
                        WHERE fs.from_company_id = c.id
                          AND fs.status = 'active'
                    ), 0)
                    - COALESCE((
                        SELECT SUM(lo.outstanding)
                        FROM loan_outstanding lo
                        WHERE lo.company_id = c.id
                          AND lo.status = 'active'
                    ), 0) AS net_position,
                    EXISTS (
                        SELECT 1
                        FROM overdue_records orr
                        JOIN loans l ON l.id = orr.loan_id
                        WHERE l.company_id = c.id
                          AND orr.status = 'pending'
                    ) AS has_overdue
                FROM companies c
                WHERE c.is_active = TRUE
            ) subs
        ),

        'pending_approvals_count',
            CASE
                WHEN v_role = 'principal' THEN (
                    SELECT COUNT(*)::INTEGER FROM approval_requests
                    WHERE status = 'pending'
                )
                ELSE NULL
            END,

        'pending_approvals',
            CASE
                WHEN v_role = 'principal' THEN (
                    SELECT COALESCE(jsonb_agg(data ORDER BY sort_order ASC), '[]'::jsonb)
                    FROM (
                        SELECT
                            jsonb_build_object(
                                'id', id,
                                'request_type', request_type,
                                'description', description,
                                'amount', amount,
                                'submitted_by_name', submitted_by_name,
                                'created_at', created_at
                            ) AS data,
                            created_at AS sort_order
                        FROM approval_requests_with_target
                        WHERE status = 'pending'
                        ORDER BY created_at ASC
                        LIMIT 10
                    ) sub
                )
                ELSE NULL
            END,

        'alerts', (
            SELECT COALESCE(jsonb_agg(alert), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'type', 'overdue',
                    'severity', 'danger',
                    'message', 'Overdue loan: ' || c.short_code || ' (' || orr.overdue_days || ' days)'
                ) AS alert
                FROM overdue_records orr
                JOIN loans l ON l.id = orr.loan_id
                JOIN companies c ON c.id = l.company_id
                WHERE orr.status = 'pending'

                UNION ALL

                SELECT jsonb_build_object(
                    'type', 'buffer',
                    'severity', 'warning',
                    'message', 'Free cash below buffer threshold'
                )
                WHERE (v_fund_total - v_loan_outstanding) < COALESCE(v_buffer_amount, 0)

                UNION ALL

                SELECT jsonb_build_object(
                    'type', 'maturity',
                    'severity', 'info',
                    'message', 'Fund source maturing soon: RM ' || amount::TEXT
                )
                FROM fund_sources
                WHERE status = 'active'
                  AND maturity_date IS NOT NULL
                  AND maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            ) alerts_subq
        ),

        'free_cash_trend', '[]'::jsonb,

        'upcoming_cash_flow', (
            SELECT COALESCE(jsonb_agg(event ORDER BY event_date), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'date', maturity_date,
                    'type', 'fund_maturity',
                    'description', 'Savings matures',
                    'amount', amount
                ) AS event, maturity_date AS event_date
                FROM fund_sources
                WHERE status = 'active'
                  AND maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            ) cash_flow_subq
        )
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION dashboard_summary() IS
    'Phase 2 Step 9: adds dept_pool_total, billing_float, and marketing_np_this_month. Phase 1 keys unchanged.';
