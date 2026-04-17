-- ============================================================================
-- 20260101000137_payroll_approve_alliance.sql
-- Spec 4 (HR Payroll Redesign) — salary payouts debit Alliance Bank pool
-- HOUZS Venture Portal
--
-- Re-declares approve_payroll_run (Spec 2 / migrations 129 + 131) so that:
--   1. Before voucher fan-out, asserts alliance_bank_pool_balance.balance
--      >= payroll_runs.total_amount. If not, raises
--      'INSUFFICIENT_ALLIANCE_BALANCE: balance RM X, payroll RM Y. Finance
--       must transfer funds first.' — Finance has to create a
--       payroll_bank_transfer voucher and get it approved/paid before the
--       payroll run can approve.
--   2. Each salary_payout voucher's payment_voucher_sources.pool flips from
--      'hv_operating_fund' to 'alliance_bank_pool'.
--   3. After all vouchers are written, one alliance_bank_pool row is
--      inserted per voucher with transaction_type='salary_payout_out'.
-- Rest of the RPC body (approver role check, status gates, per-row fan-out,
-- approval_requests / access_log updates) is unchanged from migration 131.
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
    v_alliance_balance DECIMAL(15, 2);
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

    -- Spec 4: pre-flight check — Alliance pool must cover the payroll total
    SELECT balance INTO v_alliance_balance FROM alliance_bank_pool_balance;
    v_alliance_balance := COALESCE(v_alliance_balance, 0);

    IF v_alliance_balance < v_run.total_amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_ALLIANCE_BALANCE: Alliance balance RM % < payroll RM %. Finance must transfer funds from OPEX pools first.',
            v_alliance_balance, v_run.total_amount;
    END IF;

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
        VALUES (v_voucher_id, 'alliance_bank_pool', r_hmp.net);

        INSERT INTO alliance_bank_pool (
            transaction_type, amount,
            reference_type, reference_id,
            period_month, description, created_by
        ) VALUES (
            'salary_payout_out', r_hmp.net,
            'payment_voucher', v_voucher_id,
            v_period,
            'Salary payout — ' || r_hmp.employee_name || ' — ' || TO_CHAR(v_period, 'Mon YYYY'),
            p_approver
        );

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
        VALUES (v_voucher_id, 'alliance_bank_pool', COALESCE(r_dp.payroll_net, 0));

        INSERT INTO alliance_bank_pool (
            transaction_type, amount,
            reference_type, reference_id,
            period_month, description, created_by
        ) VALUES (
            'salary_payout_out', COALESCE(r_dp.payroll_net, 0),
            'payment_voucher', v_voucher_id,
            v_period,
            'Director salary payout — ' || r_dp.director_name || ' — ' || TO_CHAR(v_period, 'Mon YYYY'),
            p_approver
        );

        UPDATE director_payouts SET status = 'paid' WHERE id = r_dp.dp_id;
        v_voucher_count := v_voucher_count + 1;
    END LOOP;

    UPDATE payroll_runs
       SET status = 'paid', paid_at = NOW()
     WHERE id = p_run_id;

    UPDATE approval_requests
       SET status = 'approved',
           workflow_state = 'approved',
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
            'total_amount', v_run.total_amount,
            'alliance_balance_before', v_alliance_balance
        )
    );
END;
$$;
