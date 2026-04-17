-- ============================================================================
-- 20260101000130_advance_voucher_seq.sql
-- Spec 2 support — heal payment_voucher_no_seq so nextval doesn't collide
-- HOUZS Venture Portal
--
-- payment_voucher_no_seq (migration 050) starts at 1 and only advances via
-- nextval. If voucher_no values were ever inserted directly (seeds, manual
-- repairs, Supabase UI), the sequence trails behind and nextval collides
-- with existing voucher numbers. approve_payroll_run hit this on the first
-- April 2026 run.
--
-- Fix: bump the sequence to max(existing voucher number, current seq value).
-- One-time heal; no structural change.
-- ============================================================================

DO $$
DECLARE
    v_max_used INTEGER;
    v_current  BIGINT;
    v_target   BIGINT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(voucher_no FROM 'HV-PV-\d{6}-(\d+)')::INTEGER), 0)
    INTO v_max_used
    FROM payment_vouchers
    WHERE voucher_no ~ '^HV-PV-\d{6}-\d+$';

    SELECT last_value INTO v_current FROM payment_voucher_no_seq;

    v_target := GREATEST(v_max_used, v_current);

    IF v_target > 0 THEN
        PERFORM setval('payment_voucher_no_seq', v_target, TRUE);
        RAISE NOTICE 'payment_voucher_no_seq advanced to % (max_used=%, prev=%)',
            v_target, v_max_used, v_current;
    END IF;
END $$;
