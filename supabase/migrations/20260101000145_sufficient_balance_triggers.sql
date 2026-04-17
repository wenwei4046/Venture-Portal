-- ============================================================================
-- 20260101000145_sufficient_balance_triggers.sql
-- Hard-enforce sufficient balance on every pool debit.
-- HOUZS Venture Portal — payroll flow refactor commit 4 of 4
--
-- User directive 2026-04-17: "所有的 amount transfer 本身一定是要 sufficient,
-- insufficient 的话就是不可以."
--
-- Existing coverage BEFORE this migration:
--   - payment_vouchers bank balance — checked in approveVoucher server
--     action (payments/actions.ts) when Principal approves
--   - generatePvFromRequest also pre-checks bank balance before inserting
--     the PV, so Finance gets the error early
--
-- Gap this migration closes:
--   - operating_pools debits (payroll_out / transfer_out) — previously could
--     drive a pool balance negative if a voucher was approved without
--     enough in that pool
--   - alliance_bank_pool debits (salary_payout_out / salary_advance_out) —
--     same gap; approve_payroll_run (pre-refactor) had a pre-check but it
--     only covered the total, not a specific source
--
-- After this migration: any INSERT that would make the computed balance
-- go negative raises INSUFFICIENT_POOL_BALANCE and the enclosing
-- transaction rolls back. The fan-out trigger from migration 138 runs
-- inside the approveVoucher/executeVoucher transaction, so this
-- propagates cleanly.
-- ============================================================================

-- ── operating_pools ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_operating_pool_sufficient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance DECIMAL(15, 2);
BEGIN
    -- Inbound and adjustments don't need sufficiency checks.
    IF NEW.transaction_type NOT IN ('payroll_out', 'transfer_out') THEN
        RETURN NEW;
    END IF;

    SELECT balance INTO v_balance
      FROM operating_pool_balance
     WHERE pool_type = NEW.pool_type;

    v_balance := COALESCE(v_balance, 0);

    IF v_balance < NEW.amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_POOL_BALANCE: % has RM %, transaction needs RM %. Top up the pool before retrying.',
            NEW.pool_type, v_balance, NEW.amount;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_operating_pool_sufficient ON operating_pools;

CREATE TRIGGER trg_check_operating_pool_sufficient
    BEFORE INSERT ON operating_pools
    FOR EACH ROW
    EXECUTE FUNCTION check_operating_pool_sufficient();

COMMENT ON FUNCTION check_operating_pool_sufficient() IS
    'Reject operating_pools debits (payroll_out / transfer_out) if the '
    'pool balance would go negative. Inbound transactions pass through.';

-- ── alliance_bank_pool ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_alliance_bank_pool_sufficient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance DECIMAL(15, 2);
BEGIN
    -- Inbound and adjustments pass through.
    IF NEW.transaction_type NOT IN ('salary_payout_out', 'salary_advance_out') THEN
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

DROP TRIGGER IF EXISTS trg_check_alliance_bank_pool_sufficient ON alliance_bank_pool;

CREATE TRIGGER trg_check_alliance_bank_pool_sufficient
    BEFORE INSERT ON alliance_bank_pool
    FOR EACH ROW
    EXECUTE FUNCTION check_alliance_bank_pool_sufficient();

COMMENT ON FUNCTION check_alliance_bank_pool_sufficient() IS
    'Reject alliance_bank_pool outbound transactions (salary_payout_out / '
    'salary_advance_out) if the HR Pool balance would go negative.';
