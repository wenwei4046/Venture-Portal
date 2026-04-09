-- ============================================================================
-- 20260101000002_treasury.sql
-- Treasury tables: fund_sources, loans, repayments, overdue_records, base_rate_history
-- Phase 1 | HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (treasury)
-- ----------------------------------------------------------------------------

CREATE TYPE fund_source_type AS ENUM ('subsidiary_savings', 'director_loan');

CREATE TYPE fund_source_status AS ENUM ('active', 'matured', 'repaid', 'cancelled');

CREATE TYPE loan_status AS ENUM ('pending_approval', 'active', 'fully_repaid', 'cancelled');

CREATE TYPE repayment_type AS ENUM ('principal', 'interest', 'penalty', 'netting');

CREATE TYPE overdue_stage AS ENUM ('grace', 'late_1', 'late_2', 'escalation');

CREATE TYPE overdue_status AS ENUM ('pending', 'paid', 'escalated');

-- ----------------------------------------------------------------------------
-- TABLE: base_rate_history
-- Extended with effective_from/effective_to per /autoplan user challenge C3.
-- gist EXCLUDE constraint prevents overlapping active periods.
-- ----------------------------------------------------------------------------

-- Required for range exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE base_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quarter VARCHAR(6) NOT NULL,  -- '2026Q2'

    -- Effective period (per /autoplan user challenge C3 — fixes rate lock race)
    effective_from DATE NOT NULL,
    effective_to DATE,  -- NULL = currently active (no end)

    total_paid DECIMAL(15, 2),
    total_pool DECIMAL(15, 2),
    weighted_cost DECIMAL(7, 6) NOT NULL,  -- higher precision for rate math
    op_margin DECIMAL(7, 6) NOT NULL,
    base_rate DECIMAL(7, 6) NOT NULL,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_period
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Exclusion constraint: no two rows can have overlapping active periods
-- Uses daterange with '[)' inclusion (inclusive start, exclusive end)
ALTER TABLE base_rate_history
    ADD CONSTRAINT no_overlapping_base_rates
    EXCLUDE USING gist (
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
    );

COMMENT ON TABLE base_rate_history IS
    'Historical base rate per quarter. Loans snapshot the active rate at disbursement.';
COMMENT ON COLUMN base_rate_history.effective_from IS
    'Start of validity period. Loan lookups use WHERE disbursement_date <@ daterange(effective_from, effective_to).';
COMMENT ON COLUMN base_rate_history.effective_to IS
    'End of validity. NULL = currently active. Prior row has effective_to = new row effective_from.';
COMMENT ON CONSTRAINT no_overlapping_base_rates ON base_rate_history IS
    'Prevents race condition where two rate rows overlap in time. Fixed per /autoplan Eng 1.1.';

-- ----------------------------------------------------------------------------
-- TABLE: fund_sources
-- ----------------------------------------------------------------------------

CREATE TABLE fund_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type fund_source_type NOT NULL,
    capital_type TEXT NOT NULL DEFAULT 'paid',

    -- Either from_company or from_director, not both
    from_company_id UUID REFERENCES companies(id),
    from_director_id UUID,  -- FK added in 20260101000005_directors.sql

    amount DECIMAL(15, 2) NOT NULL,
    cost_rate DECIMAL(7, 6) NOT NULL,  -- monthly rate
    lock_in_months INTEGER,
    effective_date DATE NOT NULL,
    maturity_date DATE,
    early_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
    penalty_on_early DECIMAL(7, 6),
    status fund_source_status NOT NULL DEFAULT 'active',
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT cost_rate_valid CHECK (cost_rate >= 0 AND cost_rate < 1),
    CONSTRAINT lock_in_non_negative CHECK (lock_in_months IS NULL OR lock_in_months >= 0),

    -- Source type and from_* consistency
    CONSTRAINT source_has_from
        CHECK (
            (source_type = 'subsidiary_savings' AND from_company_id IS NOT NULL AND from_director_id IS NULL)
            OR (source_type = 'director_loan' AND from_director_id IS NOT NULL AND from_company_id IS NULL)
        )
);

COMMENT ON TABLE fund_sources IS
    'Paid capital entering HV treasury: subsidiary savings and director loans.';

-- ----------------------------------------------------------------------------
-- TABLE: loans
-- Rate is SNAPSHOTTED at creation, never changes afterward.
-- ----------------------------------------------------------------------------

CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    principal DECIMAL(15, 2) NOT NULL,

    -- Rate components snapshotted at loan submission (not approval)
    base_rate DECIMAL(7, 6) NOT NULL,
    risk_premium DECIMAL(7, 6) NOT NULL,
    effective_rate DECIMAL(7, 6) NOT NULL,  -- base + premium, computed and stored

    disbursement_date DATE,
    repayment_terms TEXT,
    status loan_status NOT NULL DEFAULT 'pending_approval',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT principal_positive CHECK (principal > 0),
    CONSTRAINT principal_reasonable CHECK (principal <= 100000000),  -- RM 100M ceiling
    CONSTRAINT rate_valid CHECK (
        base_rate >= 0 AND base_rate < 1
        AND risk_premium >= 0 AND risk_premium < 1
        AND effective_rate >= 0 AND effective_rate < 1
    ),
    CONSTRAINT effective_rate_is_sum
        CHECK (effective_rate = base_rate + risk_premium),

    -- Approval metadata consistency
    CONSTRAINT active_has_approver
        CHECK (
            status NOT IN ('active', 'fully_repaid')
            OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
        )
);

COMMENT ON TABLE loans IS
    'Loans from HV to subsidiaries. Rate locked at submission, never mutates.';
COMMENT ON COLUMN loans.effective_rate IS
    'base_rate + risk_premium snapshotted at loan submission. Immutable after creation.';
COMMENT ON CONSTRAINT active_has_approver ON loans IS
    'Active/repaid loans must have an approval record. Prevents state desync.';

-- ----------------------------------------------------------------------------
-- TABLE: repayments
-- ----------------------------------------------------------------------------

CREATE TABLE repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    amount DECIMAL(15, 2) NOT NULL,
    payment_type repayment_type NOT NULL,
    payment_date DATE NOT NULL,
    reference_id UUID,  -- links to monthly_statement_line for netting
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT payment_date_not_future CHECK (payment_date <= CURRENT_DATE)
);

COMMENT ON TABLE repayments IS
    'Loan repayments (principal, interest, penalty, netting). Loan status auto-transitions via trigger.';

-- ----------------------------------------------------------------------------
-- TABLE: overdue_records
-- ----------------------------------------------------------------------------

CREATE TABLE overdue_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    period_month DATE NOT NULL,  -- first of month
    overdue_days INTEGER NOT NULL,
    overdue_stage overdue_stage NOT NULL,
    penalty_rate DECIMAL(7, 6),
    penalty_amount DECIMAL(15, 2),
    status overdue_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT overdue_days_positive CHECK (overdue_days > 0),
    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),

    -- Idempotency: one record per loan per period (per /autoplan Eng 2.2)
    CONSTRAINT uq_overdue_loan_period UNIQUE (loan_id, period_month)
);

COMMENT ON TABLE overdue_records IS
    'Overdue interest detection per loan per month. UNIQUE prevents double-counting from re-run.';
COMMENT ON CONSTRAINT uq_overdue_loan_period ON overdue_records IS
    'Idempotency guard: overdue detection job can re-run safely with ON CONFLICT DO UPDATE.';
