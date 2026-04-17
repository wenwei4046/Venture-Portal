-- ============================================================================
-- 20260101000146_fix_alliance_pool_check.sql
-- Fix migration 145's check_alliance_bank_pool_sufficient — the NOT IN list
-- referenced 'salary_advance_out' which isn't in alliance_pool_txn_type.
-- Postgres throws "invalid input value for enum" when the comparison literal
-- isn't a valid enum member, so the trigger fired on every INSERT regardless
-- of transaction type and blocked the happy path.
--
-- Valid alliance_pool_txn_type values (from migration 135):
--   - transfer_in (inbound from OPEX pools)
--   - salary_payout_out (outbound per staff/director)
--   - adjustment (manual correction)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_alliance_bank_pool_sufficient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance DECIMAL(15, 2);
BEGIN
    -- Only outbound salary payouts need sufficiency checks; transfer_in
    -- and adjustment pass through.
    IF NEW.transaction_type <> 'salary_payout_out' THEN
        RETURN NEW;
    END IF;

    SELECT balance INTO v_balance FROM alliance_bank_pool_balance;
    v_balance := COALESCE(v_balance, 0);

    IF v_balance < NEW.amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_POOL_BALANCE: alliance_bank_pool (HR Pool) has RM %, transaction needs RM %. Fund the HR Pool via a payroll_bank_transfer PV before retrying.',
            v_balance, NEW.amount;
    END IF;

    RETURN NEW;
END;
$$;
