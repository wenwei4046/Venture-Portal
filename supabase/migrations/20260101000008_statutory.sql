-- ============================================================================
-- 20260101000008_statutory.sql
-- Statutory lookup tables: EPF, SOCSO, EIS, PCB
-- Phase 3 schema (pre-migrated)
-- HOUZS Venture Portal (VP)
--
-- IMPORTANT: Each table has effective_from/effective_to for rate versioning
-- (per /autoplan user challenge C3). Rate lookups MUST respect the period
-- being calculated, not just use the latest row. This enables reproducing
-- historical payroll calculations when Malaysian statutory rates change.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (statutory)
-- ----------------------------------------------------------------------------

CREATE TYPE epf_part AS ENUM ('A', 'C', 'E', 'F');
-- A = employee < 60, Malaysian citizen
-- C = employee >= 60, non-citizen
-- E = employee >= 60, Malaysian citizen
-- F = special

CREATE TYPE socso_category AS ENUM ('first', 'second');
-- first = Employment Injury + Invalidity (1st category)
-- second = Employment Injury only (2nd category)

-- ----------------------------------------------------------------------------
-- TABLE: epf_third_schedule
-- EPF Third Schedule (Jadual Ketiga) from KWSP
-- ~350 rows Part A. Above RM20,000: use exact 12% ER / 11% EE in code.
-- ----------------------------------------------------------------------------

CREATE TABLE epf_third_schedule (
    id SERIAL PRIMARY KEY,
    wage_from DECIMAL(15, 2) NOT NULL,
    wage_to DECIMAL(15, 2) NOT NULL,
    employer DECIMAL(15, 2) NOT NULL,
    employee DECIMAL(15, 2) NOT NULL,
    part epf_part NOT NULL DEFAULT 'A',

    -- Effective period (per /autoplan user challenge C3)
    effective_from DATE NOT NULL,
    effective_to DATE,  -- NULL = currently active

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT epf_wage_range_valid CHECK (wage_to >= wage_from),
    CONSTRAINT epf_contribution_non_negative CHECK (employer >= 0 AND employee >= 0),
    CONSTRAINT epf_period_valid CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE epf_third_schedule IS
    'KWSP EPF Third Schedule. Lookup by wage × part × period_month. effective_from/to enables historical replay.';
COMMENT ON COLUMN epf_third_schedule.effective_from IS
    'Lookups filter: WHERE period_month BETWEEN effective_from AND COALESCE(effective_to, period_month)';

-- ----------------------------------------------------------------------------
-- TABLE: socso_act4_schedule
-- SOCSO/PERKESO Act 4 Schedule
-- ~65 rows, ceiling RM6,000 (as of 2024)
-- ----------------------------------------------------------------------------

CREATE TABLE socso_act4_schedule (
    id SERIAL PRIMARY KEY,
    wage_from DECIMAL(15, 2) NOT NULL,
    wage_to DECIMAL(15, 2) NOT NULL,
    employer DECIMAL(15, 2) NOT NULL,
    employee DECIMAL(15, 2) NOT NULL,
    category socso_category NOT NULL DEFAULT 'first',

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT socso_wage_range_valid CHECK (wage_to >= wage_from),
    CONSTRAINT socso_contribution_non_negative CHECK (employer >= 0 AND employee >= 0),
    CONSTRAINT socso_period_valid CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE socso_act4_schedule IS
    'PERKESO SOCSO Act 4 Schedule. Ceiling was RM5,000 pre-2024, raised to RM6,000 post-2024.';

-- ----------------------------------------------------------------------------
-- TABLE: eis_act800_schedule
-- Employment Insurance System (EIS)
-- ~55 rows, ceiling RM5,000
-- ----------------------------------------------------------------------------

CREATE TABLE eis_act800_schedule (
    id SERIAL PRIMARY KEY,
    wage_from DECIMAL(15, 2) NOT NULL,
    wage_to DECIMAL(15, 2) NOT NULL,
    employer DECIMAL(15, 2) NOT NULL,
    employee DECIMAL(15, 2) NOT NULL,

    -- Effective period
    effective_from DATE NOT NULL,
    effective_to DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT eis_wage_range_valid CHECK (wage_to >= wage_from),
    CONSTRAINT eis_contribution_non_negative CHECK (employer >= 0 AND employee >= 0),
    CONSTRAINT eis_period_valid CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE eis_act800_schedule IS
    'EIS Act 800 Schedule (Employment Insurance System). Ceiling RM5,000.';

-- ----------------------------------------------------------------------------
-- TABLE: pcb_jadual
-- LHDN Jadual PCB (Malaysian monthly tax deduction)
-- Largest statutory table (~2000 rows across all KA categories × children)
-- ----------------------------------------------------------------------------

CREATE TABLE pcb_jadual (
    id SERIAL PRIMARY KEY,
    income_from DECIMAL(15, 2) NOT NULL,  -- after EPF deduction
    income_to DECIMAL(15, 2) NOT NULL,
    category pcb_category NOT NULL,
    children INTEGER NOT NULL,
    pcb_amount DECIMAL(15, 2) NOT NULL,

    -- Effective period (annual updates from LHDN)
    effective_from DATE NOT NULL,
    effective_to DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pcb_income_range_valid CHECK (income_to >= income_from),
    CONSTRAINT pcb_amount_non_negative CHECK (pcb_amount >= 0),
    CONSTRAINT pcb_children_non_negative CHECK (children >= 0),
    CONSTRAINT pcb_period_valid CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_pcb_lookup UNIQUE (income_from, income_to, category, children, effective_from)
);

COMMENT ON TABLE pcb_jadual IS
    'LHDN Jadual PCB monthly tax deduction table. Lookup: (taxable_income, category, children, period_month). Updates annually.';
COMMENT ON COLUMN pcb_jadual.children IS
    'Number of dependents. LHDN provides separate tables for 0, 1, 2, 3+ children.';
