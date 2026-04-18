-- ============================================================================
-- 20260101000151_voucher_sources_max_5.sql
-- Task 3 — bump payment_voucher_sources from max 3 to max 5 rows per voucher
-- HOUZS Venture Portal
--
-- The Generate PV flow for monthly payroll now shows a per-department
-- breakdown (HR / Finance / Marketing / Director Office) so Finance can
-- split the payroll across 4 dept pools in one voucher. 5 leaves headroom
-- (e.g. a future Director Pool contribution, or ad-hoc Venture Pool top-up).
-- ============================================================================

CREATE OR REPLACE FUNCTION pvs_enforce_max_three()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (SELECT COUNT(*) FROM payment_voucher_sources WHERE voucher_id = NEW.voucher_id) >= 5 THEN
        RAISE EXCEPTION
            'payment_voucher_sources: max 5 rows per voucher (voucher_id=%)',
            NEW.voucher_id;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION pvs_enforce_max_three() IS
    'Task 3: bumped from 3 to 5 to fit the 4-dept payroll breakdown + 1 spare slot. Function name kept for backward compatibility with the existing trigger binding.';
