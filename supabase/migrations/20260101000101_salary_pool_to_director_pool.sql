-- ============================================================================
-- 20260101000101_salary_pool_to_director_pool.sql
-- Phase 7 Step 2 — Reroute 3 RPCs to read/write dept_pools (Director) instead
-- of salary_pool, then DROP TABLE salary_pool.
--
-- Per Phase 7 design: full sub-paid CTC lands in Director Pool (revenue
-- pooling). 5% saving stays in Director Pool (no longer written to
-- hv_operating_fund.saving_in). 25% invoice accumulator still writes to
-- invoice_payout_pool ledger (unchanged). Statutory surplus/deficit still
-- writes to hv_operating_fund (unchanged — user said algorithm preserved).
--
-- dashboard_summary is adjusted so that:
--   (a) v_dept_pool_total excludes Director dept from HV's aggregate capital
--       (Director Pool is earmarked for directors, not HV's free cash)
--   (b) v_salary_pool_total reads Director Pool balance from dept_pools
-- ============================================================================

BEGIN;

-- ─── 1) save_director_salary_results — reroute writes ──────────────────────
CREATE OR REPLACE FUNCTION save_director_salary_results(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_user_id UUID;
    v_payout JSONB;
    v_pool JSONB;
    v_saved_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_advance_total DECIMAL := 0;
    v_pool_id UUID;
    v_director_dept_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    v_period := (p_data->>'period_month')::DATE;
    v_user_id := auth.uid();
    v_pool := p_data->'pool';

    SELECT id INTO v_director_dept_id FROM departments WHERE name = 'Director' LIMIT 1;
    IF v_director_dept_id IS NULL THEN
        RAISE EXCEPTION 'Director department not found — apply migration 000100 first';
    END IF;

    -- Check for confirmed/paid payouts
    SELECT COUNT(*) INTO v_skipped_count
    FROM director_payouts
    WHERE period_month = v_period AND status IN ('confirmed', 'paid');

    IF v_skipped_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot recalculate: ' || v_skipped_count || ' payouts already confirmed/paid',
            'skipped', v_skipped_count
        );
    END IF;

    -- Delete existing drafts + existing Director Pool revenue row (idempotent recalc)
    DELETE FROM director_payouts WHERE period_month = v_period AND status = 'draft';
    DELETE FROM dept_pools
    WHERE department_id = v_director_dept_id
      AND period_month = v_period
      AND transaction_type = 'np_in';

    -- Insert Director Pool revenue (full CTC from subs — revenue pooling)
    INSERT INTO dept_pools (
        department_id, transaction_type, amount, period_month,
        description, created_by
    ) VALUES (
        v_director_dept_id,
        'np_in',
        (v_pool->>'total_ctc_in')::DECIMAL,
        v_period,
        'Director revenue pool — ' || to_char(v_period, 'Mon YYYY'),
        v_user_id
    ) RETURNING id INTO v_pool_id;

    -- Insert director payouts (unchanged — all fields preserved)
    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        INSERT INTO director_payouts (
            director_id, period_month, gross_amount,
            saving_amount, after_saving,
            payroll_calc, advance_amount, payroll_gross,
            payroll_bk, payroll_allow,
            payroll_epf_er, payroll_epf_ee,
            payroll_socso_er, payroll_socso_ee,
            payroll_eis_er, payroll_eis_ee,
            payroll_pcb, payroll_net,
            invoice_base, invoice_bk,
            invoice_epf_er, invoice_socso_er, invoice_eis_er,
            invoice_total,
            statutory_er_in, statutory_er_out, statutory_surplus,
            calculation_snapshot,
            status, created_by
        ) VALUES (
            (v_payout->>'director_id')::UUID, v_period,
            (v_payout->>'gross_amount')::DECIMAL,
            (v_payout->>'saving_amount')::DECIMAL,
            (v_payout->>'after_saving')::DECIMAL,
            (v_payout->>'payroll_calc')::DECIMAL,
            (v_payout->>'advance_amount')::DECIMAL,
            (v_payout->>'payroll_gross')::DECIMAL,
            (v_payout->>'payroll_bk')::DECIMAL,
            (v_payout->>'payroll_allow')::DECIMAL,
            (v_payout->>'payroll_epf_er')::DECIMAL,
            (v_payout->>'payroll_epf_ee')::DECIMAL,
            (v_payout->>'payroll_socso_er')::DECIMAL,
            (v_payout->>'payroll_socso_ee')::DECIMAL,
            (v_payout->>'payroll_eis_er')::DECIMAL,
            (v_payout->>'payroll_eis_ee')::DECIMAL,
            (v_payout->>'payroll_pcb')::DECIMAL,
            (v_payout->>'payroll_net')::DECIMAL,
            (v_payout->>'invoice_base')::DECIMAL,
            (v_payout->>'invoice_bk')::DECIMAL,
            (v_payout->>'invoice_epf_er')::DECIMAL,
            (v_payout->>'invoice_socso_er')::DECIMAL,
            (v_payout->>'invoice_eis_er')::DECIMAL,
            (v_payout->>'invoice_total')::DECIMAL,
            (v_payout->>'statutory_er_in')::DECIMAL,
            (v_payout->>'statutory_er_out')::DECIMAL,
            (v_payout->>'statutory_surplus')::DECIMAL,
            v_payout->'calculation_snapshot',
            'draft', v_user_id
        );
        v_saved_count := v_saved_count + 1;
        v_advance_total := v_advance_total + COALESCE((v_payout->>'advance_amount')::DECIMAL, 0);
    END LOOP;

    -- HV Operating Fund: surplus/deficit (statutory algorithm unchanged)
    -- Note: saving_in write to hv_operating_fund is DROPPED — 5% saving now
    -- lives in Director Pool as part of total_ctc_in.
    IF (p_data->>'total_statutory_surplus')::DECIMAL > 0 THEN
        INSERT INTO hv_operating_fund (transaction_type, amount, description, reference_table, created_by)
        VALUES ('surplus_in', (p_data->>'total_statutory_surplus')::DECIMAL,
                'Statutory surplus — ' || to_char(v_period, 'Mon YYYY'),
                'director_payouts', v_user_id);
    ELSIF (p_data->>'total_statutory_surplus')::DECIMAL < 0 THEN
        INSERT INTO hv_operating_fund (transaction_type, amount, description, reference_table, created_by)
        VALUES ('deficit_out', ABS((p_data->>'total_statutory_surplus')::DECIMAL),
                'Statutory deficit — ' || to_char(v_period, 'Mon YYYY'),
                'director_payouts', v_user_id);
    END IF;

    -- Invoice Payout Pool (unchanged — per-director accumulation ledger)
    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        IF (v_payout->>'invoice_total')::DECIMAL > 0 THEN
            INSERT INTO invoice_payout_pool (transaction_type, director_id, amount, description)
            VALUES ('accumulate', (v_payout->>'director_id')::UUID,
                    (v_payout->>'invoice_total')::DECIMAL,
                    'Director ' || (v_payout->>'director_code') || ' invoice — ' || to_char(v_period, 'Mon YYYY'));
        END IF;
    END LOOP;

    -- Advance approval: reference now points to dept_pools row (not salary_pool)
    IF v_advance_total > 0 THEN
        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount, status, workflow_state
        ) VALUES (
            'advance', v_pool_id, 'dept_pools', v_user_id,
            'Director advance top-up for ' || to_char(v_period, 'Mon YYYY') || ': RM ' || to_char(v_advance_total, 'FM999,999.00'),
            v_advance_total, 'pending', 'submitted'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;


-- ─── 2) get_director_payout_summary — pool CTE reads dept_pools ─────────────
CREATE OR REPLACE FUNCTION get_director_payout_summary(p_period DATE)
RETURNS TABLE (
    out_period_month DATE, out_payout_count INTEGER,
    out_total_payroll_gross DECIMAL, out_total_payroll_net DECIMAL,
    out_total_epf_er DECIMAL, out_total_epf_ee DECIMAL,
    out_total_socso_er DECIMAL, out_total_socso_ee DECIMAL,
    out_total_eis_er DECIMAL, out_total_eis_ee DECIMAL,
    out_total_pcb DECIMAL, out_total_invoice DECIMAL,
    out_total_advance DECIMAL, out_total_saving DECIMAL,
    out_total_statutory_surplus DECIMAL, out_pool_total DECIMAL,
    out_status TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege'
            USING HINT = 'Only principal, finance, or hr can view director payout summary';
    END IF;
    RETURN QUERY
    WITH payouts AS (
        SELECT COUNT(id)::INTEGER AS cnt,
            COALESCE(SUM(payroll_gross),0) AS sum_payroll_gross,
            COALESCE(SUM(payroll_net),0) AS sum_payroll_net,
            COALESCE(SUM(payroll_epf_er),0) AS sum_epf_er,
            COALESCE(SUM(payroll_epf_ee),0) AS sum_epf_ee,
            COALESCE(SUM(payroll_socso_er),0) AS sum_socso_er,
            COALESCE(SUM(payroll_socso_ee),0) AS sum_socso_ee,
            COALESCE(SUM(payroll_eis_er),0) AS sum_eis_er,
            COALESCE(SUM(payroll_eis_ee),0) AS sum_eis_ee,
            COALESCE(SUM(payroll_pcb),0) AS sum_pcb,
            COALESCE(SUM(invoice_total),0) AS sum_invoice,
            COALESCE(SUM(advance_amount),0) AS sum_advance,
            COALESCE(SUM(saving_amount),0) AS sum_saving,
            COALESCE(SUM(statutory_surplus),0) AS sum_surplus,
            CASE WHEN COUNT(id)=0 THEN 'no_data'
                 WHEN COUNT(id) FILTER (WHERE status='draft')>0 THEN 'draft'
                 WHEN COUNT(id) FILTER (WHERE status='confirmed')>0 THEN 'confirmed'
                 ELSE 'paid' END AS agg_status
        FROM director_payouts WHERE period_month = p_period
    ), pool AS (
        -- Director Pool balance for the period (was salary_pool.total_pool)
        SELECT COALESCE(SUM(
            CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END
        ), 0) AS pool_total
        FROM dept_pools
        WHERE department_id = (SELECT id FROM departments WHERE name = 'Director')
          AND period_month = p_period
    )
    SELECT p_period, po.cnt,
        po.sum_payroll_gross, po.sum_payroll_net,
        po.sum_epf_er, po.sum_epf_ee,
        po.sum_socso_er, po.sum_socso_ee,
        po.sum_eis_er, po.sum_eis_ee,
        po.sum_pcb, po.sum_invoice,
        po.sum_advance, po.sum_saving,
        po.sum_surplus,
        COALESCE(pl.pool_total,0),
        po.agg_status
    FROM payouts po LEFT JOIN pool pl ON TRUE;
END;
$$;


-- ─── 3) dashboard_summary — exclude Director from v_dept_pool_total, read
--         v_salary_pool_total from dept_pools (Director) ─────────────────────
CREATE OR REPLACE FUNCTION dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_result JSONB;
    v_role user_role;

    v_fund_total DECIMAL;
    v_loan_outstanding DECIMAL;
    v_weighted_cost DECIMAL;
    v_current_base_rate DECIMAL;
    v_op_margin DECIMAL;
    v_buffer_amount DECIMAL;
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

    -- Dept pool total — EXCLUDE Director (earmarked for directors, not HV capital)
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

    -- Director Pool balance (was salary_pool.total_pool)
    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END
    ), 0) INTO v_salary_pool_total
    FROM dept_pools
    WHERE department_id = v_director_dept_id
      AND period_month = v_current_period;

    SELECT COUNT(*) INTO v_payouts_pending
    FROM director_payouts WHERE status = 'draft';

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('saving_in', 'surplus_in', 'profit_in', 'fund_in', 'loan_repayment_in')
        THEN amount ELSE -amount END
    ), 0) INTO v_hv_fund_balance FROM hv_operating_fund;

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'accumulate' THEN amount ELSE -amount END
    ), 0) INTO v_invoice_pool_balance FROM invoice_payout_pool;

    SELECT COALESCE(SUM(advance_amount), 0) INTO v_total_advance
    FROM director_payouts WHERE period_month = v_current_period;

    SELECT COALESCE(SUM(saving_amount), 0) INTO v_total_saving
    FROM director_payouts WHERE period_month = v_current_period;

    -- v_total_pool = non-Director dept pools + hv_operating_fund
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

        'buffer_amount', v_buffer_amount,
        'free_cash', v_total_pool - COALESCE(v_buffer_amount, 0),
        'buffer_breach', v_total_pool < COALESCE(v_buffer_amount, 0),

        'pool_breakdown', jsonb_build_object(
            'fund_sources', v_fund_total,
            'dept_pool', GREATEST(v_dept_pool_total, 0),
            'hv_operating_fund', GREATEST(v_hv_fund_balance, 0),
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

        -- dept_pool_breakdown includes Director pool as its own row for display
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

        'subsidiaries', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'short_code', c.short_code,
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
    'Phase 7 Step 2: Director Pool excluded from v_dept_pool_total; v_salary_pool_total reads from dept_pools (Director).';


-- ─── 4) DROP salary_pool ────────────────────────────────────────────────────
-- All 3 RPCs above no longer reference salary_pool. Safe to drop.
-- RLS policies auto-drop with the table. No FK dependents exist.
DROP TABLE IF EXISTS salary_pool;

COMMIT;
