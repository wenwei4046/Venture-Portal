-- ============================================================================
-- 20260101000131_fix_payroll_rpc_workflow_state.sql
-- Spec 2 fix — workflow_state enum uses 'approved', not 'completed'
-- HOUZS Venture Portal
--
-- Migration 129 wrote workflow_state='completed' but approval_workflow_state
-- (migration 001) enumerates: submitted / under_review / needs_info /
-- delegated / approved / rejected / expired. No 'completed'. The payload
-- parsed at function definition time but blew up at runtime on enum cast
-- during approve_payroll_run's final UPDATE.
--
-- This migration rewrites approve_payroll_run to set workflow_state='approved'
-- (the semantically correct terminal state). Body otherwise unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_payroll_run(
    p_run_id UUID,
    p_approver UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run             payroll_runs%ROWTYPE;
    v_approver_role   user_role;
    v_period          DATE;
    v_voucher_id      UUID;
    v_voucher_no      TEXT;
    v_voucher_count   INTEGER := 0;
    r_hmp             RECORD;
    r_dp              RECORD;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_approver AND is_active = TRUE;
    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_payroll_run: unknown or inactive user %', p_approver;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_payroll_run: only Principal may approve, got %', v_approver_role;
    END IF;

    SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_payroll_run: run % not found', p_run_id;
    END IF;
    IF v_run.status <> 'submitted' THEN
        RAISE EXCEPTION 'approve_payroll_run: run % status is %, must be submitted',
            p_run_id, v_run.status;
    END IF;

    v_period := v_run.period_month;

    UPDATE payroll_runs
       SET status = 'approved',
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = p_run_id;

    FOR r_hmp IN
        SELECT hmp.id AS hmp_id, hmp.net, hsc.employee_name
        FROM hr_monthly_payroll hmp
        JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
        WHERE hmp.period_month = v_period
          AND hmp.status = 'submitted'
    LOOP
        v_voucher_no := 'HV-PV-' || TO_CHAR(v_period, 'YYYYMM') || '-' ||
                        LPAD(nextval('payment_voucher_no_seq')::text, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, status, direction,
            amount, currency, payee_name,
            reference_type, reference_id,
            description,
            payment_method, payment_date,
            approved_by, approved_at,
            executed_by, executed_at,
            created_by
        ) VALUES (
            v_voucher_no, 'salary_payout', 'paid', 'debit',
            r_hmp.net, 'MYR', r_hmp.employee_name,
            'hr_monthly_payroll', r_hmp.hmp_id,
            'Salary — ' || r_hmp.employee_name || ' — ' || TO_CHAR(v_period, 'Mon YYYY'),
            'bank_transfer', CURRENT_DATE,
            p_approver, NOW(),
            p_approver, NOW(),
            p_approver
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'hv_operating_fund', r_hmp.net);

        UPDATE hr_monthly_payroll SET status = 'paid' WHERE id = r_hmp.hmp_id;

        v_voucher_count := v_voucher_count + 1;
    END LOOP;

    FOR r_dp IN
        SELECT dp.id AS dp_id, dp.payroll_net, d.name AS director_name
        FROM director_payouts dp
        JOIN directors d ON d.id = dp.director_id
        WHERE dp.period_month = v_period
          AND dp.status = 'confirmed'
          AND NOT EXISTS (
            SELECT 1 FROM payment_vouchers pv
            WHERE pv.reference_type = 'director_payout'
              AND pv.reference_id = dp.id
              AND pv.status = 'paid'
          )
    LOOP
        v_voucher_no := 'HV-PV-' || TO_CHAR(v_period, 'YYYYMM') || '-' ||
                        LPAD(nextval('payment_voucher_no_seq')::text, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, status, direction,
            amount, currency, payee_name,
            reference_type, reference_id,
            description,
            payment_method, payment_date,
            approved_by, approved_at,
            executed_by, executed_at,
            created_by
        ) VALUES (
            v_voucher_no, 'salary_payout', 'paid', 'debit',
            COALESCE(r_dp.payroll_net, 0), 'MYR', r_dp.director_name,
            'director_payout', r_dp.dp_id,
            'Director salary — ' || r_dp.director_name || ' — ' || TO_CHAR(v_period, 'Mon YYYY'),
            'bank_transfer', CURRENT_DATE,
            p_approver, NOW(),
            p_approver, NOW(),
            p_approver
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'hv_operating_fund', COALESCE(r_dp.payroll_net, 0));

        UPDATE director_payouts SET status = 'paid' WHERE id = r_dp.dp_id;

        v_voucher_count := v_voucher_count + 1;
    END LOOP;

    UPDATE payroll_runs
       SET status = 'paid', paid_at = NOW()
     WHERE id = p_run_id;

    UPDATE approval_requests
       SET status = 'approved',
           workflow_state = 'approved',  -- fixed: 'completed' is not a valid enum value
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = v_run.approval_id;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_approver, 'payroll_run', p_run_id::TEXT, 'approve',
        jsonb_build_object(
            'period', v_period,
            'voucher_count', v_voucher_count,
            'total_amount', v_run.total_amount
        )
    );
END;
$$;
