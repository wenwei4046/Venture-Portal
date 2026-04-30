-- ============================================================================
-- 20260101000223_settings_refresh_base_rate.sql
-- Item 2: Settings page op_margin change should immediately reflect in
-- base_rate_history (and therefore in the fund-out form).
--
-- Today the Treasury Config tab only writes to treasury_config (key/value)
-- and the live rate snapshot lives in base_rate_history. Result: Principal
-- sets op_margin=0 in Settings, /fund-out/new still reads the old approved
-- base_rate_history row (0.3%/mo). User's mental model is "Settings controls
-- the rate", so we wire Settings to write a fresh approved row.
--
-- Approach: a SECURITY DEFINER RPC `refresh_base_rate(p_op_margin)` that
--   (1) recomputes weighted_cost from currently-active fund_sources,
--   (2) closes the existing open row (effective_to = yesterday),
--   (3) inserts a new approved row dated today.
-- Principal-only (the same gate Settings already enforces); they ARE the
-- approver, so no separate approval queue.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION refresh_base_rate(p_op_margin DECIMAL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_total_paid DECIMAL;
    v_weighted_cost DECIMAL;
    v_base_rate DECIMAL;
    v_quarter VARCHAR(20);
    v_today DATE;
    v_new_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'refresh_base_rate: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();
    v_today := CURRENT_DATE;
    v_quarter := EXTRACT(YEAR FROM v_today)::TEXT
                 || 'Q'
                 || EXTRACT(QUARTER FROM v_today)::TEXT;

    IF p_op_margin IS NULL OR p_op_margin < 0 OR p_op_margin >= 1 THEN
        RAISE EXCEPTION 'op_margin must be between 0 and 1 (decimal). Got: %', p_op_margin;
    END IF;

    -- (1) Recompute weighted cost of current active capital
    SELECT
        COALESCE(SUM(amount), 0),
        CASE WHEN COALESCE(SUM(amount), 0) > 0
             THEN COALESCE(SUM(amount * cost_rate), 0) / SUM(amount)
             ELSE 0
        END
    INTO v_total_paid, v_weighted_cost
    FROM fund_sources
    WHERE status = 'active';

    v_base_rate := v_weighted_cost + p_op_margin;

    -- (2) Close any open row so the latest-by-effective_from query is
    -- unambiguous. effective_to = yesterday means the new row covers today.
    -- Skip if the existing open row was already created today (re-saving
    -- Settings the same day shouldn't punch a 1-day gap).
    UPDATE base_rate_history
    SET effective_to = v_today - INTERVAL '1 day'
    WHERE effective_to IS NULL
      AND effective_from < v_today;

    -- If a row already exists with effective_from = today, update it in
    -- place rather than spamming new rows on every Settings save.
    UPDATE base_rate_history
    SET total_paid = v_total_paid,
        total_pool = v_total_paid,
        weighted_cost = v_weighted_cost,
        op_margin = p_op_margin,
        base_rate = v_base_rate,
        approved_by = v_caller_id,
        approved_at = NOW(),
        quarter = v_quarter
    WHERE effective_from = v_today
    RETURNING id INTO v_new_id;

    -- Otherwise insert a fresh approved row.
    IF v_new_id IS NULL THEN
        INSERT INTO base_rate_history (
            quarter, effective_from, total_paid, total_pool,
            weighted_cost, op_margin, base_rate,
            approved_by, approved_at
        ) VALUES (
            v_quarter, v_today, v_total_paid, v_total_paid,
            v_weighted_cost, p_op_margin, v_base_rate,
            v_caller_id, NOW()
        )
        RETURNING id INTO v_new_id;
    END IF;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION refresh_base_rate(DECIMAL) IS
    'Item 2: recompute + persist base_rate_history when Principal changes op_margin in Settings. Auto-approved.';

GRANT EXECUTE ON FUNCTION refresh_base_rate(DECIMAL) TO authenticated;

COMMIT;
