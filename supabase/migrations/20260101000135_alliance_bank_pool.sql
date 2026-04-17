-- ============================================================================
-- 20260101000135_alliance_bank_pool.sql
-- Spec 4 (HR Payroll Redesign) — isolated bank pool for payroll disbursement
-- HOUZS Venture Portal
--
-- HOUZS pays salaries from an Alliance Bank account that's kept apart from
-- the main Hong Leong operating account. Finance tops up this pool from
-- HR / Finance / Director / Marketing OPEX pools shortly before payroll,
-- Principal approves the transfer, then Principal approves payroll which
-- debits the Alliance pool only.
--
-- Purpose: enforce a clean separation between "operating cash sitting in the
-- main account" and "committed payroll cash sitting in the Alliance account".
-- The ledger model mirrors operating_pools (Spec 3): one row per credit or
-- debit, balance = signed SUM.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM
-- ----------------------------------------------------------------------------

CREATE TYPE alliance_pool_txn_type AS ENUM (
    'transfer_in',         -- payroll_bank_transfer voucher paid: OPEX pools -> Alliance
    'salary_payout_out',   -- approve_payroll_run debits Alliance per staff + director
    'adjustment'           -- manual correction (Principal approval required)
);

-- ----------------------------------------------------------------------------
-- TABLE: alliance_bank_pool
-- ----------------------------------------------------------------------------

CREATE TABLE alliance_bank_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type alliance_pool_txn_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,

    reference_type TEXT,   -- 'payment_voucher', 'payroll_run', 'adjustment'
    reference_id UUID,

    period_month DATE,
    description TEXT NOT NULL,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0)
);

COMMENT ON TABLE alliance_bank_pool IS
    'Spec 4: isolated Alliance Bank account ledger. Finance transfers in from OPEX pools; approve_payroll_run debits for each employee + director. Balance = SUM signed by transaction_type.';

CREATE INDEX idx_alliance_pool_time ON alliance_bank_pool (created_at DESC);
CREATE INDEX idx_alliance_pool_period ON alliance_bank_pool (period_month);
CREATE INDEX idx_alliance_pool_reference
    ON alliance_bank_pool (reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- VIEW: alliance_bank_pool_balance
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW alliance_bank_pool_balance AS
SELECT
    COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('transfer_in', 'adjustment') THEN amount
            WHEN transaction_type = 'salary_payout_out' THEN -amount
            ELSE 0
        END
    ), 0) AS balance,
    COUNT(*) AS txn_count,
    MAX(created_at) AS last_txn_at
FROM alliance_bank_pool;

COMMENT ON VIEW alliance_bank_pool_balance IS
    'Spec 4: single-row view with Alliance balance, txn count, last txn timestamp. SECURITY INVOKER.';

GRANT SELECT ON alliance_bank_pool_balance TO authenticated;

-- ----------------------------------------------------------------------------
-- RLS
--
-- principal + finance: SELECT
-- principal:           INSERT (any type — can manually adjust)
-- finance:             INSERT WITH CHECK transaction_type = 'adjustment'
-- No UPDATE / DELETE — audit trail is immutable.
-- System inserts (transfer voucher approve, payroll approve) come from
-- SECURITY DEFINER RPCs that bypass RLS.
-- ----------------------------------------------------------------------------

ALTER TABLE alliance_bank_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY alliance_pool_principal_finance_select
    ON alliance_bank_pool FOR SELECT
    USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY alliance_pool_principal_insert
    ON alliance_bank_pool FOR INSERT
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY alliance_pool_finance_insert
    ON alliance_bank_pool FOR INSERT
    WITH CHECK (current_user_role() = 'finance' AND transaction_type = 'adjustment');
