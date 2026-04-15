-- ============================================================================
-- 000072  Finance-safe per-payout access for voucher creation
-- ============================================================================
-- Finance has no direct SELECT on director_payouts (RLS restricts to HR /
-- Principal) but must pay each director on the actual bank. Two RPCs expose
-- only the minimum needed for voucher creation — no breakdown, no statutory.
-- ============================================================================

-- ─── 1) List unpaid confirmed payouts for a period (Finance list view) ──────
CREATE OR REPLACE FUNCTION list_director_payouts_to_pay(p_period DATE)
RETURNS TABLE (
    payout_id       UUID,
    director_id     UUID,
    director_code   VARCHAR,
    director_name   TEXT,
    period_month    DATE,
    payroll_net     DECIMAL,
    status          TEXT,
    has_voucher     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_user_role() NOT IN ('principal', 'hr', 'finance') THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        dp.id AS payout_id,
        dp.director_id,
        d.code AS director_code,
        d.name AS director_name,
        dp.period_month,
        dp.payroll_net,
        dp.status::TEXT,
        EXISTS (
            SELECT 1 FROM payment_vouchers pv
            WHERE pv.reference_type = 'director_payout'
              AND pv.reference_id = dp.id
              AND pv.status IN ('draft', 'pending_approval', 'approved', 'paid')
        ) AS has_voucher
    FROM director_payouts dp
    JOIN directors d ON d.id = dp.director_id
    WHERE dp.period_month = p_period
      AND dp.status IN ('confirmed', 'paid')
    ORDER BY d.code;
END;
$$;

COMMENT ON FUNCTION list_director_payouts_to_pay IS
    'Finance-safe list of director payouts awaiting voucher creation. Returns code + net only, no breakdown. SECURITY DEFINER bypasses RLS.';

GRANT EXECUTE ON FUNCTION list_director_payouts_to_pay TO authenticated;

-- ─── 2) Fetch minimum voucher-preset data for one payout ────────────────────
CREATE OR REPLACE FUNCTION get_director_payout_for_voucher(p_payout_id UUID)
RETURNS TABLE (
    payout_id       UUID,
    director_id     UUID,
    director_code   VARCHAR,
    director_name   TEXT,
    period_month    DATE,
    payroll_net     DECIMAL,
    status          TEXT,
    has_voucher     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_user_role() NOT IN ('principal', 'hr', 'finance') THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        dp.id AS payout_id,
        dp.director_id,
        d.code AS director_code,
        d.name AS director_name,
        dp.period_month,
        dp.payroll_net,
        dp.status::TEXT,
        EXISTS (
            SELECT 1 FROM payment_vouchers pv
            WHERE pv.reference_type = 'director_payout'
              AND pv.reference_id = dp.id
              AND pv.status IN ('draft', 'pending_approval', 'approved', 'paid')
        ) AS has_voucher
    FROM director_payouts dp
    JOIN directors d ON d.id = dp.director_id
    WHERE dp.id = p_payout_id;
END;
$$;

COMMENT ON FUNCTION get_director_payout_for_voucher IS
    'Finance-safe single-payout lookup for voucher preset. Returns code + net only. SECURITY DEFINER bypasses RLS.';

GRANT EXECUTE ON FUNCTION get_director_payout_for_voucher TO authenticated;
