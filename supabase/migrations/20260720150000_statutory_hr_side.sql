-- Mig 20260720150000: statutory vouchers can be generated from HR's side too.
--
-- User request (2026-07-20): the statutory one-click should also live on
-- hr-costing → Payment, where HR already creates the disbursement batch —
-- one page runs the whole payday. Changes:
--   • role check now allows 'hr' (same precedent as
--     create_payroll_disbursement_vouchers);
--   • p_bank_account_id becomes optional — NULL auto-picks the Alliance
--     payroll bank (GL 3010, primary fallback), so HR's UI needs no bank
--     picker (HR has no banks screen); Finance's picker still passes one.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_payroll_statutory_vouchers(p_period date, p_bank_account_id uuid DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
    v_existing INTEGER;
    v_bank RECORD;
    v_body RECORD;
    v_voucher_no TEXT;
    v_voucher_period TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_pv_total DECIMAL(15, 2);
    v_count INTEGER := 0;
    v_grand DECIMAL(15, 2) := 0;
    v_vouchers JSONB := '[]'::JSONB;
    v_period_label TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT id, status INTO v_run_id, v_run_status
    FROM payroll_runs
    WHERE period_month = p_period AND status <> 'rejected';
    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state % — statutory vouchers need an approved run.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = v_run_id AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1;
    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'Payroll funding for period % is not completed yet.', p_period;
    END IF;

    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.status <> 'voided';
    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Statutory vouchers already exist for period % (% non-voided). Void them first to regenerate.', p_period, v_existing;
    END IF;

    -- Bank: explicit id when given (Finance's picker); NULL auto-picks the
    -- Alliance payroll bank (GL 3010), primary as fallback.
    IF p_bank_account_id IS NOT NULL THEN
        SELECT id, bank_name, status INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id;
        IF v_bank.id IS NULL OR v_bank.status <> 'active' THEN
            RAISE EXCEPTION 'create_payroll_statutory_vouchers: bank % is not an active bank', p_bank_account_id;
        END IF;
    ELSE
        SELECT id, bank_name, status INTO v_bank
          FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
        IF v_bank.id IS NULL THEN
            SELECT id, bank_name, status INTO v_bank
              FROM bank_accounts WHERE status = 'active' AND is_primary = true LIMIT 1;
        END IF;
        IF v_bank.id IS NULL THEN
            RAISE EXCEPTION 'create_payroll_statutory_vouchers: no active payout bank (GL 3010 or primary) found';
        END IF;
    END IF;

    v_voucher_period := to_char(now(), 'YYYYMM');
    v_period_label := to_char(p_period, 'Mon YYYY');

    -- One voucher per scheme, one payment to its body, drained from the HR
    -- custody pool (the departments already contributed at funding).
    FOR v_body IN
        SELECT * FROM (VALUES
            ('KWSP',            'KWSP (EPF) — '),
            ('PERKESO (SOCSO)', 'SOCSO — '),
            ('PERKESO (EIS)',   'EIS — '),
            ('LHDN',            'LHDN (PCB) — '),
            ('SKBBK',           'SKBBK — ')
        ) AS b(payee, descr_prefix)
    LOOP
        SELECT COALESCE(SUM(
            CASE v_body.payee
                WHEN 'KWSP'            THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                WHEN 'PERKESO (SOCSO)' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                WHEN 'PERKESO (EIS)'   THEN COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                WHEN 'LHDN'            THEN COALESCE(mp.pcb, 0)
                WHEN 'SKBBK'           THEN COALESCE(mp.skbbk_amount, 0)
                ELSE 0
            END), 0)
          INTO v_pv_total
          FROM hr_monthly_payroll mp
         WHERE mp.period_month = p_period;

        IF v_pv_total <= 0 THEN
            CONTINUE;
        END IF;

        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency, payee_name, description,
            payment_method, payment_date,
            source_pool, bank_account_id,
            reference_type, reference_id, created_by
        ) VALUES (
            v_voucher_no, 'expense', 'debit', 'pending_approval',
            v_pv_total, 'MYR', v_body.payee,
            v_body.descr_prefix || v_period_label || ' payroll',
            'bank_transfer', NULL,
            'dept_pool_hr', v_bank.id,
            'payroll_statutory', v_run_id, v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
        VALUES (v_voucher_id, 'dept_pool_hr', v_pv_total, '4020');

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount, status, workflow_state
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
            v_voucher_no || ': ' || v_body.payee || ' — ' || v_period_label ||
                ' payroll — RM ' || to_char(v_pv_total, 'FM999,999,999.00'),
            v_pv_total, 'pending', 'submitted'
        );

        v_count := v_count + 1;
        v_grand := v_grand + v_pv_total;
        v_vouchers := v_vouchers || jsonb_build_object(
            'id', v_voucher_id, 'voucher_no', v_voucher_no,
            'payee', v_body.payee, 'amount', v_pv_total);
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No statutory amounts found for period % — nothing to generate.', p_period;
    END IF;

    RETURN json_build_object('count', v_count, 'total', v_grand, 'vouchers', v_vouchers);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, uuid) IS
    'Mig 20260720150000 (custody model): five statutory PVs per period (KWSP / PERKESO-SOCSO / PERKESO-EIS / LHDN / SKBBK), one payment each, drained from dept_pool_hr. Callable by hr/finance/principal; p_bank_account_id NULL auto-picks Alliance (3010). payment_date NULL for Finance to set.';

COMMIT;
