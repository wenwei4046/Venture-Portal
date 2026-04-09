-- ============================================================================
-- 20260101000006_pools.sql
-- Pool tables: dept_pools, hv_operating_fund, invoice_payout_pool
-- Phase 2/3 schema (pre-migrated)
-- HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (pools)
-- ----------------------------------------------------------------------------

CREATE TYPE dept_pool_txn_type AS ENUM ('np_in', 'expense_out');

CREATE TYPE hv_fund_txn_type AS ENUM (
    'saving_in',        -- 5% saving from director salary
    'surplus_in',       -- statutory surplus (positive)
    'deficit_out',      -- statutory deficit (negative abs)
    'expense_out',      -- group expense / rent HV portion
    'profit_in'         -- HV NP retained
);

CREATE TYPE invoice_pool_txn_type AS ENUM ('accumulate', 'release');

-- ----------------------------------------------------------------------------
-- TABLE: dept_pools
-- Transaction log. Balance = SUM(np_in) - SUM(expense_out).
-- ----------------------------------------------------------------------------

CREATE TABLE dept_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id),
    transaction_type dept_pool_txn_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    period_month DATE,
    description TEXT,
    approval_id UUID REFERENCES approval_requests(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT period_is_first_of_month
        CHECK (period_month IS NULL OR EXTRACT(DAY FROM period_month) = 1),

    -- Expense must have an approval
    CONSTRAINT expense_has_approval
        CHECK (transaction_type <> 'expense_out' OR approval_id IS NOT NULL)
);

COMMENT ON TABLE dept_pools IS
    'Department profit pool (Marketing only has real P&L). Balance = SUM(np_in) - SUM(expense_out).';

-- ----------------------------------------------------------------------------
-- TABLE: hv_operating_fund
-- Transaction log. Balance = SUM(in types) - SUM(out types).
-- ----------------------------------------------------------------------------

CREATE TABLE hv_operating_fund (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type hv_fund_txn_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    reference_id UUID,
    reference_table TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0)
);

COMMENT ON TABLE hv_operating_fund IS
    'HV operating fund: free capital from 5% savings + statutory surplus + HV NP - group expenses.';

-- ----------------------------------------------------------------------------
-- TABLE: invoice_payout_pool
-- Isolated pool from Director Salary 25% invoice portion.
-- Not used for lending. Release requires Principal approval.
-- ----------------------------------------------------------------------------

CREATE TABLE invoice_payout_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type invoice_pool_txn_type NOT NULL,
    director_id UUID REFERENCES directors(id),
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    release_approved_by UUID REFERENCES users(id),
    release_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),

    -- Release must have approval metadata
    CONSTRAINT release_has_approval
        CHECK (
            transaction_type <> 'release'
            OR (release_approved_by IS NOT NULL AND release_approved_at IS NOT NULL)
        )
);

COMMENT ON TABLE invoice_payout_pool IS
    'Phase 3: Director 25% invoice portion accumulates here. Principal-approved releases only.';
