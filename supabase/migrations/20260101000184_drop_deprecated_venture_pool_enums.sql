-- ============================================================================
-- 20260101000184_drop_deprecated_venture_pool_enums.sql
-- Phase 9 — Drop 4 audit-only enum values from hv_fund_txn_type
--
-- Reduces venture_pool.transaction_type from 9 values to 5.
--
-- Dropped (each has a proper source-of-truth table; venture_pool mirror was
-- redundant audit noise that made dashboard/view formulas diverge — Bug #2):
--   fund_in            → fund_sources table is source of truth
--   fund_out           → loans table is source of truth
--   loan_repayment_in  → repayments table is source of truth
--   claim_out          → claims table is source of truth
--
-- Kept:
--   saving_in, surplus_in, deficit_out — historical only, no new writes
--     (Phase 7 / Phase 8 deprecated these but kept for backward compat)
--   profit_in, expense_out — the ONLY two values new code writes (HV group-
--     level credits and debits via PV approval)
--
-- Safety: venture_pool table is currently empty (verified 2026-04-21). No
-- data migration needed. If rows existed with deprecated values the cast
-- would fail — that is the correct protection.
--
-- Postgres cannot DROP VALUE from an enum, so we: drop dependent view,
-- create new enum, ALTER COLUMN TYPE with text cast, drop old enum,
-- rename new enum to the original name, recreate view.
-- ============================================================================

BEGIN;

-- ─── 1. Drop the view that depends on the enum column ─────────────────────
DROP VIEW IF EXISTS venture_pool_balance;

-- ─── 2. Create the new enum with only the 5 values we keep ────────────────
CREATE TYPE hv_fund_txn_type_new AS ENUM (
    'saving_in',
    'surplus_in',
    'profit_in',
    'deficit_out',
    'expense_out'
);

-- ─── 3. Swap column type (text cast handles any residual values) ──────────
-- If any row had a dropped value, this statement would raise — intended.
ALTER TABLE venture_pool
    ALTER COLUMN transaction_type TYPE hv_fund_txn_type_new
    USING transaction_type::text::hv_fund_txn_type_new;

-- ─── 4. Drop the old enum and rename new one to the original name ─────────
DROP TYPE hv_fund_txn_type;
ALTER TYPE hv_fund_txn_type_new RENAME TO hv_fund_txn_type;

-- ─── 5. Recreate the balance view with the canonical formula ──────────────
CREATE VIEW venture_pool_balance
WITH (security_invoker = true)
AS
SELECT
    COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('saving_in', 'surplus_in', 'profit_in') THEN amount
            WHEN transaction_type IN ('deficit_out', 'expense_out') THEN -amount
            ELSE 0
        END
    ), 0) AS balance
FROM venture_pool;

COMMENT ON VIEW venture_pool_balance IS
    'Phase 9 (mig 184): enum reduced to 5 values. Balance = IN total minus OUT total.';

COMMIT;
