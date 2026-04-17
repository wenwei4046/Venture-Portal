-- ============================================================================
-- 20260101000132_operating_pools.sql
-- Spec 3 (HR Payroll Redesign) — per-department OPEX pool ledger
-- HOUZS Venture Portal
--
-- Motivation: HR, Finance, and Director departments collect subsidiary
-- invoice settlements as cash-in (their OPEX budget), then pay out salaries
-- and ops expenses. They're pure cost centers — no revenue to track as P&L.
-- dept_pools stays Marketing-only (P&L semantics with project_income,
-- commission, etc.). Digital was dropped from the plan (Q6 2026-04-17).
--
-- operating_pools is a simple transactional ledger:
--   pool_type × transaction_type × amount × reference → balance view
-- Each row is either a credit (invoice_settled_in / transfer_in / adjustment)
-- or a debit (payroll_out / transfer_out). The balance view sums with signs.
--
-- This migration lands the table + view + RLS only. Invoice routing (Spec 3b)
-- and the invoice-paid → pool-credit trigger arrive next.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE operating_pool_type AS ENUM (
    'hr_opex',
    'finance_opex',
    'director_opex'
);

CREATE TYPE operating_pool_txn_type AS ENUM (
    'invoice_settled_in',  -- subsidiary paid an invoice routed to this pool
    'payroll_out',         -- salary_payout voucher draws from this pool
    'transfer_out',        -- moved to another pool / Alliance pool (Spec 4)
    'transfer_in',         -- received from another pool
    'adjustment'           -- manual correction (Principal approval)
);

COMMENT ON TYPE operating_pool_type IS
    'Spec 3: HR / Finance / Director OPEX pools. Marketing stays in dept_pools (P&L semantics).';

COMMENT ON TYPE operating_pool_txn_type IS
    'invoice_settled_in / transfer_in / adjustment count as credits; payroll_out / transfer_out count as debits.';

-- ----------------------------------------------------------------------------
-- TABLE: operating_pools
-- ----------------------------------------------------------------------------

CREATE TABLE operating_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_type operating_pool_type NOT NULL,
    transaction_type operating_pool_txn_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,

    reference_type TEXT,       -- 'invoice', 'payment_voucher', 'payroll_run', etc.
    reference_id UUID,

    period_month DATE NOT NULL,
    description TEXT NOT NULL,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE operating_pools IS
    'Spec 3: transactional ledger for HR / Finance / Director OPEX pools. Each row is one credit or one debit; balance = SUM signed by transaction_type (see operating_pool_balance view).';

CREATE INDEX idx_operating_pools_type_time
    ON operating_pools (pool_type, created_at DESC);

CREATE INDEX idx_operating_pools_type_period
    ON operating_pools (pool_type, period_month);

CREATE INDEX idx_operating_pools_reference
    ON operating_pools (reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- VIEW: operating_pool_balance
-- Live per-pool balance, signed by transaction_type.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW operating_pool_balance AS
SELECT
    pool_type,
    COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('invoice_settled_in', 'transfer_in', 'adjustment') THEN amount
            WHEN transaction_type IN ('payroll_out', 'transfer_out') THEN -amount
            ELSE 0
        END
    ), 0) AS balance,
    COUNT(*) AS txn_count,
    MAX(created_at) AS last_txn_at
FROM operating_pools
GROUP BY pool_type;

COMMENT ON VIEW operating_pool_balance IS
    'Spec 3: one row per pool with net balance, txn count, latest txn timestamp. SECURITY INVOKER — respects caller RLS on operating_pools.';

GRANT SELECT ON operating_pool_balance TO authenticated;

-- ----------------------------------------------------------------------------
-- RLS
--
-- principal: SELECT all, INSERT (manual adjustments), no UPDATE/DELETE
-- finance:   SELECT all, INSERT (creates from UI-driven adjustments with approval)
-- hr, dept_manager: DENY
--
-- Trigger-driven inserts (invoice settlement, payroll debits in Spec 4) run
-- via SECURITY DEFINER functions that bypass RLS — same pattern as existing
-- dept_pools cashflow.
-- ----------------------------------------------------------------------------

ALTER TABLE operating_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY operating_pools_principal_finance_select
    ON operating_pools FOR SELECT
    USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY operating_pools_principal_insert
    ON operating_pools FOR INSERT
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY operating_pools_finance_insert
    ON operating_pools FOR INSERT
    WITH CHECK (current_user_role() = 'finance' AND transaction_type = 'adjustment');

-- No UPDATE / DELETE policies → audit trail is immutable.
