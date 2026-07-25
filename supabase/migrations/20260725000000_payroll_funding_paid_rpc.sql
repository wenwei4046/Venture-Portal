-- ─────────────────────────────────────────────────────────────────────────────
-- Mig 20260725000000 — get_payroll_funding_paid(p_request_id)
--
-- The HR payroll badge shows 已付/总额 while a funding request is split across
-- several PVs (partial funding: bank balance short of the full amount, so some
-- vouchers are already paid while the rest wait for Principal). But
-- payment_vouchers SELECT is finance/principal-only, so HR cannot sum its own
-- funding vouchers directly. This SECURITY DEFINER helper returns ONLY the
-- paid aggregate for one payroll funding request — no voucher rows leak.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_payroll_funding_paid(p_request_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'get_payroll_funding_paid: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN COALESCE((
        SELECT SUM(amount)
        FROM payment_vouchers
        WHERE reference_type = 'payroll_payment_request'
          AND reference_id = p_request_id
          AND status = 'paid'
    ), 0);
END;
$$;

REVOKE ALL ON FUNCTION get_payroll_funding_paid(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_payroll_funding_paid(UUID) TO authenticated;
