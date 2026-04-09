-- ============================================================================
-- 20260101000004_billing.sql
-- Service billing tables: service_contracts, invoices
-- Phase 2 schema (pre-migrated per /autoplan user challenge C3)
-- HOUZS Venture Portal (VP)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (billing)
-- ----------------------------------------------------------------------------

CREATE TYPE billing_mode AS ENUM (
    'hr_pool_split',
    'finance_attribution',
    'finance_mgmt_fee',
    'marketing_project',
    'fixed_split',
    'non_billable'
);

CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled');

CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'paid_via_netting');

-- ----------------------------------------------------------------------------
-- TABLE: service_contracts
-- ----------------------------------------------------------------------------

CREATE TABLE service_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id),
    company_id UUID REFERENCES companies(id),
    billing_mode billing_mode NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2),
    split_pct DECIMAL(7, 6),
    status contract_status NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    approved_by UUID REFERENCES users(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_non_negative CHECK (amount IS NULL OR amount >= 0),
    CONSTRAINT split_pct_valid CHECK (split_pct IS NULL OR (split_pct >= 0 AND split_pct <= 1)),
    CONSTRAINT date_range_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE service_contracts IS
    'Phase 2: service contracts between HV departments and subsidiaries. Drives invoice generation.';

-- ----------------------------------------------------------------------------
-- TABLE: invoices
-- ----------------------------------------------------------------------------

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no VARCHAR(30) UNIQUE,  -- e.g., 'HV-INV-202604-001'
    contract_id UUID REFERENCES service_contracts(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_month DATE NOT NULL,
    billing_mode billing_mode NOT NULL,
    base_amount DECIMAL(15, 2),
    total_amount DECIMAL(15, 2) NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT total_amount_positive CHECK (total_amount > 0),
    CONSTRAINT base_amount_non_negative CHECK (base_amount IS NULL OR base_amount >= 0)
);

COMMENT ON TABLE invoices IS
    'Phase 2: individual invoices feeding into monthly consolidated statements.';
