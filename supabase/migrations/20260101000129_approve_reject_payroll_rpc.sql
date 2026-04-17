-- ============================================================================
-- 20260101000129_approve_reject_payroll_rpc.sql
-- Spec 2 (HR Payroll Redesign) — Principal approves or rejects a payroll run
-- HOUZS Venture Portal
--
-- On approve:
--   1. Assert the run is still 'submitted'.
--   2. UPDATE payroll_runs → status='approved' with approved_by/approved_at.
--   3. For each hr_monthly_payroll row in 'submitted' status for the period,
--      generate one salary_payout payment_voucher (status='paid', direction='debit')
--      + one payment_voucher_sources row (pool='hv_operating_fund' for Spec 2;
--      Spec 4 will point it at alliance_bank_pool).
--   4. For each director_payouts row in 'confirmed' status for the period that
--      doesn't already have a voucher, same fan-out.
--   5. UPDATE hr_monthly_payroll.status='paid' and director_payouts.status='paid'.
--   6. UPDATE payroll_runs → status='paid', paid_at=NOW().
--   7. UPDATE approval_requests → status='approved', workflow_state='completed'.
--   8. Log to access_audit_log (PDPA-style bookkeeping).
--
-- On reject:
--   1. UPDATE payroll_runs → status='rejected', rejection_reason, rejected_at.
--   2. UPDATE hr_monthly_payroll.status back to 'draft' for the period.
--   3. UPDATE approval_requests → status='rejected', workflow_state='rejected',
--      notes = reason.
--   director_payouts are not touched — they were already 'confirmed' before
--   this flow and stay that way (HR adjusts them separately if needed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- approve_payroll_run
-- ----------------------------------------------------------------------------

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
    v_staff_name      TEXT;
    v_director_name   TEXT;
    v_voucher_count   INTEGER := 0;
    r_hmp             RECORD;
    r_dp              RECORD;
BEGIN
    -- Approver must be Principal
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

    -- Move to approved
    UPDATE payroll_runs
       SET status = 'approved',
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = p_run_id;

    -- Fan-out: staff payroll
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

    -- Fan-out: director payouts (only confirmed + no existing voucher)
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

    -- Finalize run + approval
    UPDATE payroll_runs
       SET status = 'paid', paid_at = NOW()
     WHERE id = p_run_id;

    UPDATE approval_requests
       SET status = 'approved',
           workflow_state = 'completed',
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = v_run.approval_id;

    -- Audit
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

COMMENT ON FUNCTION approve_payroll_run IS
    'Spec 2: Principal approves a payroll_run. Generates one salary_payout voucher per staff + director, flips statuses to paid, marks run paid_at. Atomic — any failure rolls back.';

GRANT EXECUTE ON FUNCTION approve_payroll_run TO authenticated;

-- ----------------------------------------------------------------------------
-- reject_payroll_run
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_payroll_run(
    p_run_id UUID,
    p_approver UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run            payroll_runs%ROWTYPE;
    v_approver_role  user_role;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_approver AND is_active = TRUE;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'reject_payroll_run: only Principal may reject, got %', v_approver_role;
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_payroll_run: rejection reason is required';
    END IF;

    SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reject_payroll_run: run % not found', p_run_id;
    END IF;
    IF v_run.status <> 'submitted' THEN
        RAISE EXCEPTION 'reject_payroll_run: run % status is %, must be submitted',
            p_run_id, v_run.status;
    END IF;

    UPDATE payroll_runs
       SET status = 'rejected',
           rejected_at = NOW(),
           rejection_reason = p_reason
     WHERE id = p_run_id;

    UPDATE hr_monthly_payroll
       SET status = 'draft'
     WHERE period_month = v_run.period_month
       AND status = 'submitted';

    UPDATE approval_requests
       SET status = 'rejected',
           workflow_state = 'rejected',
           notes = p_reason,
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = v_run.approval_id;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_approver, 'payroll_run', p_run_id::TEXT, 'reject',
        jsonb_build_object('period', v_run.period_month, 'reason', p_reason)
    );
END;
$$;

COMMENT ON FUNCTION reject_payroll_run IS
    'Spec 2: Principal rejects a payroll_run with a mandatory reason. Flips hr_monthly_payroll back to draft so HR can edit. Atomic.';

GRANT EXECUTE ON FUNCTION reject_payroll_run TO authenticated;
