-- ============================================================================
-- 20260101000007_hr.sql
-- HR tables: hr_pool_allocation, hr_staff_costs, hr_staff_allocation, claims
-- Phase 3 schema (pre-migrated)
-- HOUZS Venture Portal (VP)
--
-- IMPORTANT: These tables contain PII (employee names + salaries).
-- Access restricted to Principal + HR only. Finance sees aggregate views only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (hr)
-- ----------------------------------------------------------------------------

CREATE TYPE hr_staff_status AS ENUM ('active', 'inactive');

CREATE TYPE claim_type AS ENUM ('project', 'benefit');

CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- ----------------------------------------------------------------------------
-- TABLE: hr_pool_allocation
-- Per-month split % for HR or Finance dept pool allocation to subsidiaries
-- ----------------------------------------------------------------------------

CREATE TABLE hr_pool_allocation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_month DATE NOT NULL,
    split_pct DECIMAL(7, 6) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT split_pct_valid CHECK (split_pct >= 0 AND split_pct <= 1),
    CONSTRAINT uq_pool_alloc_dept_company_period UNIQUE (department_id, company_id, period_month)
);

COMMENT ON TABLE hr_pool_allocation IS
    'Phase 3: monthly split % for HR/Finance pool cost allocation. Sum per dept+period should = 1.0.';

-- ----------------------------------------------------------------------------
-- TABLE: hr_staff_costs
-- Employee salary records. PII-sensitive. Finance blocked from SELECT.
-- ----------------------------------------------------------------------------

CREATE TABLE hr_staff_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_name TEXT NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id),
    basic_salary DECIMAL(15, 2) NOT NULL,
    allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
    epf_er DECIMAL(15, 2),
    socso_er DECIMAL(15, 2),
    eis_er DECIMAL(15, 2),
    total_ctc DECIMAL(15, 2),
    is_mgmt_fee BOOLEAN NOT NULL DEFAULT FALSE,
    status hr_staff_status NOT NULL DEFAULT 'active',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT basic_salary_positive CHECK (basic_salary > 0),
    CONSTRAINT allowances_non_negative CHECK (allowances >= 0)
);

COMMENT ON TABLE hr_staff_costs IS
    'Phase 3: Individual employee salaries. PDPA-sensitive. Principal + HR SELECT only. Finance uses aggregate view.';

-- ----------------------------------------------------------------------------
-- TABLE: hr_staff_allocation
-- Per-employee per-month attribution % across subsidiaries
-- ----------------------------------------------------------------------------

CREATE TABLE hr_staff_allocation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_month DATE NOT NULL,
    allocation_pct DECIMAL(7, 6) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT allocation_pct_valid CHECK (allocation_pct >= 0 AND allocation_pct <= 1),
    CONSTRAINT uq_staff_alloc_staff_company_period UNIQUE (staff_id, company_id, period_month)
);

COMMENT ON TABLE hr_staff_allocation IS
    'Phase 3: Finance dept employees per-person attribution to subsidiaries. Sum per staff+period = 1.0.';

-- ----------------------------------------------------------------------------
-- TABLE: claims
-- Project + benefit claims
-- ----------------------------------------------------------------------------

CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_type claim_type NOT NULL,
    claimant_name TEXT NOT NULL,
    department_id UUID REFERENCES departments(id),
    company_id UUID REFERENCES companies(id),
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    receipt_url TEXT,
    status claim_status NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    payroll_month DATE,  -- for benefit claims added to monthly payroll
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT payroll_month_first_of_month
        CHECK (payroll_month IS NULL OR EXTRACT(DAY FROM payroll_month) = 1)
);

COMMENT ON TABLE claims IS
    'Phase 3: Project claims (Finance approves) + benefit claims (HR approves, added to payroll).';
