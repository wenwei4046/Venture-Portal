-- ============================================================================
-- Migration 210: Advance opening balance + lookup RPC
-- ============================================================================
-- Phase 3 spec (docs/module-spec-phase3.md:322-338) requires Allowance →
-- Advance offset during Director salary calculation:
--
--   1. Director's allowance share (post-saving) first offsets opening
--      advance_balance from prior confirmed month.
--   2. Leftover allowance + basic/KPI go through 75/25 split.
--   3. If resulting payroll_calc < min_payout → top-up creates new advance.
--   4. Closing balance = opening − repaid + new_top_up, carries to next month.
--
-- This migration adds the column and lookup RPC. Engine + save RPC updates
-- follow in separate migrations and application code.
-- ============================================================================

ALTER TABLE director_payouts
    ADD COLUMN IF NOT EXISTS advance_opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN director_payouts.advance_opening_balance IS
    'Advance balance carried in from prior confirmed/paid month. Used for allowance offset in current-month calc. Closing balance = advance_opening_balance - advance_repaid + advance_amount.';

-- ─── get_director_advance_opening_balance ──────────────────────────
-- Returns the most recent confirmed/paid payout's closing advance_balance
-- for director `p_director_id` strictly before `p_period`. 0 if none.

CREATE OR REPLACE FUNCTION get_director_advance_opening_balance(
    p_director_id UUID,
    p_period DATE
)
RETURNS DECIMAL
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_balance DECIMAL;
BEGIN
    SELECT advance_balance INTO v_balance
    FROM director_payouts
    WHERE director_id = p_director_id
      AND period_month < p_period
      AND status IN ('confirmed', 'paid')
    ORDER BY period_month DESC
    LIMIT 1;

    RETURN COALESCE(v_balance, 0);
END;
$$;

COMMENT ON FUNCTION get_director_advance_opening_balance IS
    'Returns director advance_balance from most recent confirmed/paid payout before p_period. Engine uses this for allowance offset in current-month calculation.';

GRANT EXECUTE ON FUNCTION get_director_advance_opening_balance TO authenticated;
