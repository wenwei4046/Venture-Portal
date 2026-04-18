-- ============================================================================
-- 20260101000168_disbursement_include_directors.sql
-- Fix: create_payroll_disbursement_vouchers only wrote vouchers for
-- hr_monthly_payroll rows (regular staff). Director salaries live in
-- director_payouts — those rows were silently skipped, so the "Create N
-- payment vouchers" batch under /hr-costing/payment missed every director.
-- HOUZS Venture Portal — 2026-04-19.
--
-- Fix: append a second loop that iterates director_payouts for the period
-- and creates one disbursement voucher per director (payee = director name,
-- amount = payroll_net, source_pool = dept_pool_hr, same as staff).
--
-- reference_type stays 'payroll_disbursement' for both staff and directors.
-- Downstream checks that read payment_vouchers by reference_type already
-- treat both the same way; the UI counts them together in one batch.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_payroll_disbursement_vouchers(
    p_period DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_group_id UUID;
    v_row RECORD;
    v_dir RECORD;
    v_voucher_no TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_voucher_period TEXT;
    v_count INTEGER := 0;
    v_total DECIMAL(15, 2) := 0;
    v_existing INTEGER;
    v_run_status TEXT;
    v_request_status TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT status INTO v_run_status
    FROM payroll_runs
    WHERE period_month = p_period;

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Need Principal approval of costing before disbursement.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE period_month = p_period)
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'HR Pool is not funded for period %. Wait for the funding PV to be approved and executed.', p_period;
    END IF;

    -- Dedupe: count staff + director disbursement vouchers already created.
    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_disbursement'
      AND (
        EXISTS (
          SELECT 1 FROM hr_monthly_payroll mp
          WHERE mp.id::text = pv.reference_id::text
            AND mp.period_month = p_period
        )
        OR EXISTS (
          SELECT 1 FROM director_payouts dp
          WHERE dp.id::text = pv.reference_id::text
            AND dp.period_month = p_period
        )
      );

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % existing).', p_period, v_existing;
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    -- ── Staff vouchers (hr_monthly_payroll) ──────────────────────────────────
    FOR v_row IN
        SELECT
            mp.id AS payroll_id,
            mp.staff_id,
            mp.net,
            s.employee_name,
            s.bank_account_no,
            s.bank_name,
            d.name AS dept_name
        FROM hr_monthly_payroll mp
        JOIN hr_staff_costs s ON s.id = mp.staff_id
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE mp.period_month = p_period
          AND mp.net > 0
        ORDER BY s.employee_name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool,
            reference_type, reference_id,
            created_by
        ) VALUES (
            v_voucher_no, 'other', 'debit', 'pending_approval',
            v_row.net, 'MYR',
            v_row.employee_name,
            'Payroll disbursement ' || to_char(p_period, 'Mon YYYY') ||
                ' — ' || v_row.employee_name ||
                COALESCE(' (' || v_row.dept_name || ')', ''),
            'bank_transfer', CURRENT_DATE,
            'dept_pool_hr',
            'payroll_disbursement', v_row.payroll_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_hr', v_row.net);

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount,
            status, workflow_state, group_id
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers',
            v_caller,
            v_voucher_no || ': ' || v_row.employee_name ||
                ' — RM ' || to_char(v_row.net, 'FM999,999.00'),
            v_row.net,
            'pending', 'submitted', v_group_id
        );

        v_count := v_count + 1;
        v_total := v_total + v_row.net;
    END LOOP;

    -- ── Director vouchers (director_payouts) ─────────────────────────────────
    -- Same shape as staff: payee = director name, amount = payroll_net,
    -- source_pool = dept_pool_hr. The director's cash (75% portion) comes
    -- out of the same consolidated HR Pool as staff payroll.
    FOR v_dir IN
        SELECT
            dp.id AS payout_id,
            dp.payroll_net,
            d.name AS director_name
        FROM director_payouts dp
        JOIN directors d ON d.id = dp.director_id
        WHERE dp.period_month = p_period
          AND dp.payroll_net > 0
        ORDER BY d.name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool,
            reference_type, reference_id,
            created_by
        ) VALUES (
            v_voucher_no, 'other', 'debit', 'pending_approval',
            v_dir.payroll_net, 'MYR',
            v_dir.director_name,
            'Director salary ' || to_char(p_period, 'Mon YYYY') ||
                ' — ' || v_dir.director_name,
            'bank_transfer', CURRENT_DATE,
            'dept_pool_hr',
            'payroll_disbursement', v_dir.payout_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_hr', v_dir.payroll_net);

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount,
            status, workflow_state, group_id
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers',
            v_caller,
            v_voucher_no || ': ' || v_dir.director_name ||
                ' — RM ' || to_char(v_dir.payroll_net, 'FM999,999.00'),
            v_dir.payroll_net,
            'pending', 'submitted', v_group_id
        );

        v_count := v_count + 1;
        v_total := v_total + v_dir.payroll_net;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No payroll rows with net > 0 found for period % (staff or directors).', p_period;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'count', v_count,
        'total', v_total
    );
END;
$$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(DATE) IS
    'Creates payment_voucher rows for staff (hr_monthly_payroll) AND directors (director_payouts) in a single approval batch. All vouchers source from dept_pool_hr.';

GRANT EXECUTE ON FUNCTION create_payroll_disbursement_vouchers(DATE) TO authenticated;
