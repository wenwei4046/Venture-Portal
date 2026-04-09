-- ============================================================================
-- 20260101000005_directors.sql
-- Director salary engine tables: directors, director_ctc, salary_pool, director_payouts
-- Phase 3 schema (pre-migrated per /autoplan user challenge C3)
-- HOUZS Venture Portal (VP)
--
-- IMPORTANT: director_payouts has a calculation_snapshot JSONB column capturing
-- every input, rate version, and weightage at time of calculation. This makes
-- director pay disputes reproducible (per /autoplan CEO subagent finding).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (directors)
-- ----------------------------------------------------------------------------

CREATE TYPE pcb_category AS ENUM ('KA1', 'KA2', 'KA3');
-- KA1 = single, KA2 = married spouse not working, KA3 = married spouse working

CREATE TYPE director_status AS ENUM ('active', 'inactive');

CREATE TYPE payout_status AS ENUM ('draft', 'confirmed', 'paid');

-- ----------------------------------------------------------------------------
-- TABLE: directors
-- ----------------------------------------------------------------------------

CREATE TABLE directors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code VARCHAR(4) UNIQUE NOT NULL,  -- WL, MK, WS, WW
    tax_ref_no VARCHAR(30),  -- LHDN tax number (PII - see PDPA notes)
    pcb_category pcb_category NOT NULL DEFAULT 'KA1',
    children_count INTEGER NOT NULL DEFAULT 0,
    weightage DECIMAL(7, 6) NOT NULL,  -- 0.85, 0.945, 1.05, 1.155
    min_payout DECIMAL(15, 2) NOT NULL,
    status director_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT weightage_positive CHECK (weightage > 0),
    CONSTRAINT min_payout_non_negative CHECK (min_payout >= 0),
    CONSTRAINT children_non_negative CHECK (children_count >= 0)
);

COMMENT ON TABLE directors IS
    'Company directors receiving pooled salary. 4 currently: WL, MK, WS, WW.';
COMMENT ON COLUMN directors.tax_ref_no IS
    'PII under PDPA. Access restricted to Principal + HR only.';

-- Complete the fund_sources FK now that directors table exists
ALTER TABLE fund_sources
    ADD CONSTRAINT fk_fund_sources_director
    FOREIGN KEY (from_director_id) REFERENCES directors(id);

-- ----------------------------------------------------------------------------
-- TABLE: director_ctc
-- Per-director per-company CTC submission from HR
-- ----------------------------------------------------------------------------

CREATE TABLE director_ctc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    director_id UUID NOT NULL REFERENCES directors(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_month DATE NOT NULL,
    basic DECIMAL(15, 2) NOT NULL DEFAULT 0,
    kpi DECIMAL(15, 2) NOT NULL DEFAULT 0,
    allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    employer_epf DECIMAL(15, 2),
    employer_socso DECIMAL(15, 2),
    employer_eis DECIMAL(15, 2),
    total_ctc DECIMAL(15, 2),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT amounts_non_negative CHECK (basic >= 0 AND kpi >= 0 AND allowance >= 0),
    CONSTRAINT uq_ctc_director_company_period UNIQUE (director_id, company_id, period_month)
);

COMMENT ON TABLE director_ctc IS
    'CTC (basic + KPI + allowance + statutory ER) submitted by HR per director per sub per month.';

-- ----------------------------------------------------------------------------
-- TABLE: salary_pool
-- Monthly pool snapshot
-- ----------------------------------------------------------------------------

CREATE TABLE salary_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE UNIQUE NOT NULL,
    total_ctc_in DECIMAL(15, 2),
    total_pool DECIMAL(15, 2),  -- non-statutory total = HV revenue
    basic_ratio DECIMAL(10, 8),
    kpi_ratio DECIMAL(10, 8),
    allowance_ratio DECIMAL(10, 8),
    total_saving DECIMAL(15, 2),
    total_statutory_surplus DECIMAL(15, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE salary_pool IS
    'Monthly salary pool aggregates. One row per period_month.';

-- ----------------------------------------------------------------------------
-- TABLE: director_payouts
-- The main output table with calculation_snapshot for reproducibility.
-- ----------------------------------------------------------------------------

CREATE TABLE director_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    director_id UUID NOT NULL REFERENCES directors(id),
    period_month DATE NOT NULL,
    gross_amount DECIMAL(15, 2),

    -- 5% Saving
    saving_amount DECIMAL(15, 2),
    after_saving DECIMAL(15, 2),

    -- 75% Payroll
    payroll_calc DECIMAL(15, 2),
    advance_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payroll_gross DECIMAL(15, 2),
    payroll_bk DECIMAL(15, 2),
    payroll_allow DECIMAL(15, 2),
    payroll_epf_er DECIMAL(15, 2),
    payroll_epf_ee DECIMAL(15, 2),
    payroll_socso_er DECIMAL(15, 2),
    payroll_socso_ee DECIMAL(15, 2),
    payroll_eis_er DECIMAL(15, 2),
    payroll_eis_ee DECIMAL(15, 2),
    payroll_pcb DECIMAL(15, 2),
    payroll_net DECIMAL(15, 2),

    -- 25% Invoice
    invoice_base DECIMAL(15, 2),
    invoice_bk DECIMAL(15, 2),
    invoice_epf_er DECIMAL(15, 2),
    invoice_socso_er DECIMAL(15, 2),
    invoice_eis_er DECIMAL(15, 2),
    invoice_total DECIMAL(15, 2),

    -- Surplus
    statutory_er_in DECIMAL(15, 2),
    statutory_er_out DECIMAL(15, 2),
    statutory_surplus DECIMAL(15, 2),

    -- Advance tracking
    advance_repaid DECIMAL(15, 2) NOT NULL DEFAULT 0,
    advance_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Calculation snapshot (per /autoplan CEO subagent finding)
    -- Immutable JSONB capture of all inputs + rate versions used
    -- Enables re-running historical calculations and resolving disputes
    calculation_snapshot JSONB,

    status payout_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_payout_director_period UNIQUE (director_id, period_month)
);

COMMENT ON TABLE director_payouts IS
    'Per-director per-month payout calculation. calculation_snapshot makes it reproducible.';
COMMENT ON COLUMN director_payouts.calculation_snapshot IS
    'Immutable JSONB snapshot: {ctc_records, weightage, pool_version, statutory_rate_versions, pcb_table_version, timestamp}. Enables dispute resolution and historical re-runs.';
