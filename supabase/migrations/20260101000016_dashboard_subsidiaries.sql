-- ============================================================================
-- 20260101000016_dashboard_subsidiaries.sql
-- Extend dashboard_summary() RPC with per-subsidiary net position data
-- Phase 1 | Step 9 Forge | HOUZS Venture Portal (VP)
-- ============================================================================
--
-- Adds `subsidiaries` field to dashboard_summary JSONB response. Each entry:
--   { id, name, short_code, tier, savings_deposited, loans_outstanding,
--     net_position, position, has_overdue }
--
-- position = 'creditor' when net_position > 0 (HV owes them)
--          | 'debtor' when net_position < 0 (they owe HV)
--          | 'even' when net_position = 0
-- ----------------------------------------------------------------------------

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
BEGIN
    v_role := current_user_role();

    IF v_role NOT IN ('principal', 'finance') THEN
        RAISE EXCEPTION 'dashboard_summary: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Fund sources total (active)
    SELECT COALESCE(SUM(amount), 0) INTO v_fund_total
    FROM fund_sources WHERE status = 'active';

    -- Loans outstanding (sum of computed outstandings)
    SELECT COALESCE(SUM(outstanding), 0) INTO v_loan_outstanding
    FROM loan_outstanding
    WHERE status = 'active';

    -- Weighted average cost of capital (live, from active fund sources)
    SELECT weighted_cost_rate INTO v_weighted_cost
    FROM fund_sources_weighted_cost;

    -- Buffer amount from treasury_config
    SELECT config_value INTO v_buffer_amount
    FROM treasury_config WHERE config_key = 'buffer_amount';

    -- Current base rate (approved)
    SELECT base_rate, op_margin INTO v_current_base_rate, v_op_margin
    FROM get_current_base_rate(CURRENT_DATE);

    -- Monthly interest income (based on OUTSTANDING, not principal — per spec fix)
    SELECT COALESCE(SUM(outstanding * effective_rate), 0)
    INTO v_monthly_interest_income
    FROM loan_outstanding
    WHERE status = 'active';

    -- Monthly interest expense (active fund sources)
    SELECT COALESCE(SUM(amount * cost_rate), 0)
    INTO v_monthly_interest_expense
    FROM fund_sources
    WHERE status = 'active';

    -- Build result JSONB
    v_result := jsonb_build_object(
        'generated_at', NOW(),
        'role', v_role,

        -- Row 1: KPI cards
        'total_pool', v_fund_total,
        'loans_outstanding', v_loan_outstanding,
        'weighted_cost_rate', v_weighted_cost,
        'current_base_rate', v_current_base_rate,
        'op_margin', v_op_margin,

        -- Net spread + margin panel
        'monthly_interest_income', v_monthly_interest_income,
        'monthly_interest_expense', v_monthly_interest_expense,
        'net_interest_income', v_monthly_interest_income - v_monthly_interest_expense,
        'net_spread',
            CASE
                WHEN v_weighted_cost IS NULL THEN NULL
                ELSE COALESCE(v_current_base_rate, 0) - v_weighted_cost
            END,

        -- Free cash: total pool - loans outstanding - buffer
        'buffer_amount', v_buffer_amount,
        'free_cash',
            v_fund_total - v_loan_outstanding - COALESCE(v_buffer_amount, 0),
        'buffer_breach',
            (v_fund_total - v_loan_outstanding) < COALESCE(v_buffer_amount, 0),

        -- Fund breakdown (pie chart data)
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

        -- Loan portfolio health (bar chart data)
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

        -- NEW (Step 9): Subsidiaries net position — savings deposited vs loans outstanding.
        -- Positive net → HV owes them (creditor), negative → they owe HV (debtor).
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

        -- Approval queue count (Principal only)
        'pending_approvals_count',
            CASE
                WHEN v_role = 'principal' THEN (
                    SELECT COUNT(*)::INTEGER FROM approval_requests
                    WHERE status = 'pending'
                )
                ELSE NULL
            END,

        -- Pending approvals list (Principal only)
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

        -- Alerts
        'alerts', (
            SELECT COALESCE(jsonb_agg(alert), '[]'::jsonb)
            FROM (
                -- Overdue pending
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

                -- Buffer breach
                SELECT jsonb_build_object(
                    'type', 'buffer',
                    'severity', 'warning',
                    'message', 'Free cash below buffer threshold'
                )
                WHERE (v_fund_total - v_loan_outstanding) < COALESCE(v_buffer_amount, 0)

                UNION ALL

                -- Fund source maturity in 30 days
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

        -- Free cash trend (last 12 months) — placeholder: currently just a point
        'free_cash_trend', '[]'::jsonb,

        -- Upcoming cash flow (next 30 days)
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
    'Dashboard RPC returning all widgets in one JSONB. Step 9: adds subsidiaries net position.';
