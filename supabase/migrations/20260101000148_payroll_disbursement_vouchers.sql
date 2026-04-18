-- ============================================================================
-- 20260101000148_payroll_disbursement_vouchers.sql
-- Batch voucher generation for paying staff out of the HR Pool.
--
-- Flow recap:
--   (A) HR submits payroll costing -> Principal approves it
--   (B) HR requests payment -> Finance generates ONE funding PV
--       (HV bank -> HR Pool)
--   (C) Principal approves the funding PV -> HR Pool is funded
--   (D) [NEW] HR clicks "Create Payment Vouchers" on the Payment tab ->
--       create_payroll_disbursement_vouchers(period) generates ONE voucher
--       per staff (HR Pool -> staff's bank account) grouped under a shared
--       approval group_id. Principal sees the batch in /approvals and can
--       approve them one by one or bulk.
--
-- Why per-staff vouchers (not one consolidated):
--   Each row becomes an auditable ledger entry for that employee's
--   payment in that period. Matches the Alliance Bank CSV line items so
--   the in-system record and the external bank file line up 1:1.
--
-- Net, not gross: vouchers use net (what lands in the staff account).
-- Statutory contributions (EPF ER+EE, SOCSO, EIS, PCB) stay in HR Pool
-- and are disbursed via separate statutory file exports.
-- ============================================================================

BEGIN;

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

    -- Guard 1: run must exist and be approved (or paid in legacy flow)
    SELECT status INTO v_run_status
    FROM payroll_runs
    WHERE period_month = p_period;

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Need Principal approval of costing before disbursement.', v_run_status;
    END IF;

    -- Guard 2: HR Pool must be funded (payment request completed)
    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE period_month = p_period)
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'HR Pool is not funded for period %. Wait for the funding PV to be approved and executed.', p_period;
    END IF;

    -- Guard 3: don't double-create. If any payment_voucher already references
    -- this period's hr_monthly_payroll rows, bail.
    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    JOIN hr_monthly_payroll mp ON mp.id::text = pv.reference_id::text
    WHERE pv.reference_type = 'payroll_disbursement'
      AND mp.period_month = p_period;

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % existing).', p_period, v_existing;
    END IF;

    -- OK, go.
    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

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
        -- Monotonic voucher number: HV-PV-YYYYMM-NNNN
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
            'alliance_bank_pool',
            'payroll_disbursement', v_row.payroll_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        -- Source pool row so execution knows which pool to debit.
        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'alliance_bank_pool', v_row.net);

        -- Approval row grouped with all siblings for this period.
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

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No payroll rows with net > 0 found for period %.', p_period;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'count', v_count,
        'total', v_total
    );
END;
$$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(DATE) IS
    'Phase 7 UX: batch-create one pending_approval voucher per staff (HR Pool -> staff) for the period. Grouped by shared approval group_id so Principal sees as a batch. Called from the HR Payment tab.';

GRANT EXECUTE ON FUNCTION create_payroll_disbursement_vouchers(DATE) TO authenticated;

COMMIT;
