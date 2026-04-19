-- ============================================================================
-- 20260101000180_close_voucher_no_lock_gaps.sql
-- P0-2: close the remaining voucher_no / invoice_no race windows.
-- HOUZS Venture Portal
--
-- Migration 178 added pg_advisory_xact_lock to generate_pv_for_dept_request
-- and generate_invoices_from_request, but two paths still minted their next
-- number without the lock:
--
--   1. create_payroll_disbursement_vouchers (migration 170) used
--      SELECT COUNT(*) + 1 FROM payment_vouchers — classic lost-update. Two
--      concurrent HR disbursements for different periods would read the same
--      COUNT and both try the same voucher_no.
--
--   2. billing/actions.ts#createManualInvoice minted HV-INV numbers from the
--      TS side via a period-scoped COUNT. No way to hold a DB lock from TS.
--
-- This migration:
--   • Re-creates create_payroll_disbursement_vouchers with the same advisory
--     lock namespace (hashtext('hv_voucher_no')) used by migration 178.
--     The lock now spans every voucher minted in the run — per-period logic
--     is otherwise unchanged.
--   • Introduces mint_invoice_no(p_period DATE) — a tiny RPC that holds the
--     invoice_no lock and returns the next number. TS callers use this instead
--     of computing the sequence themselves. Matches the LIKE-on-prefix logic
--     migration 178 uses, so every invoice-generating path stays consistent.
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

    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_disbursement'
      AND pv.status IN ('draft', 'pending_approval', 'approved', 'paid')
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
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % live existing). Void them first to retry.', p_period, v_existing;
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    -- P0-2: serialise voucher_no minting for the whole disbursement run. Same
    -- namespace as migration 178 so PV and disbursement paths can't collide.
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));

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
        -- Use MAX of the monthly prefix, matching migration 178's PV logic.
        SELECT COALESCE(MAX(
                   (regexp_replace(voucher_no, '^HV-PV-\d{6}-', ''))::int
               ), 0) + 1
          INTO v_seq
          FROM payment_vouchers
         WHERE voucher_no LIKE 'HV-PV-' || v_voucher_period || '-%';

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
        SELECT COALESCE(MAX(
                   (regexp_replace(voucher_no, '^HV-PV-\d{6}-', ''))::int
               ), 0) + 1
          INTO v_seq
          FROM payment_vouchers
         WHERE voucher_no LIKE 'HV-PV-' || v_voucher_period || '-%';

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
            'dept_pool_director',
            'payroll_disbursement', v_dir.payout_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_director', v_dir.payroll_net);

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

    RETURN json_build_object(
        'group_id', v_group_id,
        'voucher_count', v_count,
        'total_amount', v_total,
        'period', p_period
    );
END;
$$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers IS
    'Generates N payment_vouchers (one per live payroll row + one per director payout) under a single approval group. P0-2 (2026-04-19): now holds pg_advisory_xact_lock(hashtext(hv_voucher_no)) so concurrent disbursements and manual PV minting serialise.';

-- ─── mint_invoice_no: helper for TS callers (createManualInvoice) ────────────

CREATE OR REPLACE FUNCTION mint_invoice_no(p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_yyyymm TEXT := to_char(p_period, 'YYYYMM');
    v_seq INTEGER;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'mint_invoice_no: only finance/principal may mint, got %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Same invoice_no namespace as generate_invoices_from_request (mig 178).
    PERFORM pg_advisory_xact_lock(hashtext('hv_invoice_no'));

    SELECT COALESCE(MAX(
               (regexp_replace(invoice_no, '^HV-INV-\d{6}-', ''))::int
           ), 0) + 1
      INTO v_seq
      FROM invoices
     WHERE invoice_no LIKE 'HV-INV-' || v_yyyymm || '-%';

    RETURN 'HV-INV-' || v_yyyymm || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION mint_invoice_no IS
    'P0-2 (2026-04-19): returns the next HV-INV-{yyyymm}-{nnnn} for the given period under the hv_invoice_no advisory lock. TS callers (billing/actions.ts#createManualInvoice) use this instead of TS-side COUNT to stay consistent with RPC invoice paths.';

GRANT EXECUTE ON FUNCTION mint_invoice_no(DATE) TO authenticated;
