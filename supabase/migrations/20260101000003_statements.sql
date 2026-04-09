-- ============================================================================
-- 20260101000003_statements.sql
-- Monthly consolidated statements: statement_categories, monthly_statements, monthly_statement_lines
-- Phase 1 | HOUZS Venture Portal (VP)
--
-- NOTE: statement_categories is a LOOKUP TABLE instead of an enum (per
-- /autoplan user challenge C3). This avoids a DB migration when Phase 2/3
-- introduces new billing categories.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (statements)
-- ----------------------------------------------------------------------------

CREATE TYPE statement_line_type AS ENUM ('invoice', 'contra');

CREATE TYPE statement_direction AS ENUM ('receivable', 'payable');

CREATE TYPE statement_status AS ENUM ('draft', 'issued', 'paid', 'partial', 'overdue');

-- ----------------------------------------------------------------------------
-- TABLE: statement_categories (lookup table)
-- Replaces what would have been a `category` enum on monthly_statement_lines.
-- New categories (e.g., Phase 2 billing modes) are added as rows, not schema migrations.
-- ----------------------------------------------------------------------------

CREATE TABLE statement_categories (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    default_line_type statement_line_type NOT NULL,
    default_direction statement_direction NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE statement_categories IS
    'Lookup table for statement line categories. Lookup instead of enum for extensibility (Phase 2/3).';

-- Phase 1 seed categories
INSERT INTO statement_categories (code, label, description, default_line_type, default_direction, sort_order) VALUES
    ('loan_repayment',   'Loan Repayment',    'Loan principal/interest paid via netting',       'contra',  'payable',   10),
    ('savings_interest', 'Savings Interest',  'Interest HV owes on subsidiary savings',         'contra',  'payable',   20),
    ('savings_principal','Savings Principal', 'Matured savings returned to subsidiary',         'contra',  'payable',   30),
    ('other',            'Other',             'Miscellaneous line item',                        'invoice', 'receivable',999);

-- Phase 2 categories (billing modes) — pre-seeded even though unused in Phase 1
INSERT INTO statement_categories (code, label, description, default_line_type, default_direction, sort_order) VALUES
    ('hr_pool',         'HR Pool Split',     'HR department total × split %',            'invoice', 'receivable', 100),
    ('finance_staff',   'Finance Staff',     'Finance employee × attribution %',          'invoice', 'receivable', 110),
    ('finance_mgmt_fee','Finance Mgmt Fee',  'Finance Manager × split %',                 'invoice', 'receivable', 120),
    ('marketing_project','Marketing Project','Marketing project billing',                 'invoice', 'receivable', 130),
    ('rent',            'Rent',              'Rent split by %',                           'invoice', 'receivable', 140),
    ('utility',         'Utility',           'Utility split by %',                        'invoice', 'receivable', 150);

-- ----------------------------------------------------------------------------
-- TABLE: monthly_statements
-- ----------------------------------------------------------------------------

CREATE TABLE monthly_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_month DATE NOT NULL,
    total_invoice DECIMAL(15, 2) NOT NULL DEFAULT 0,
    total_contra DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status statement_status NOT NULL DEFAULT 'draft',
    issued_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT totals_match_net CHECK (net_amount = total_invoice - total_contra),

    -- Idempotency: one statement per company per period (per /autoplan Eng 2.3)
    CONSTRAINT uq_statement_company_period UNIQUE (company_id, period_month)
);

COMMENT ON TABLE monthly_statements IS
    'One consolidated statement per company per month. Invoice items minus contra items = net.';
COMMENT ON CONSTRAINT uq_statement_company_period ON monthly_statements IS
    'Idempotency guard. Regeneration requires draft status and ON CONFLICT handling.';

-- ----------------------------------------------------------------------------
-- TABLE: monthly_statement_lines
-- Uses statement_categories lookup instead of enum.
-- ----------------------------------------------------------------------------

CREATE TABLE monthly_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES monthly_statements(id) ON DELETE CASCADE,
    line_type statement_line_type NOT NULL,
    direction statement_direction NOT NULL,
    category_code TEXT NOT NULL REFERENCES statement_categories(code),
    description TEXT,
    reference_id UUID,  -- polymorphic link: invoice | loan | fund_source
    reference_table TEXT,  -- which table reference_id points to
    amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT polymorphic_ref_consistent
        CHECK (
            (reference_id IS NULL AND reference_table IS NULL)
            OR (reference_id IS NOT NULL AND reference_table IS NOT NULL)
        )
);

COMMENT ON TABLE monthly_statement_lines IS
    'Line items on a consolidated statement. ON DELETE CASCADE enables regenerate flow.';
COMMENT ON COLUMN monthly_statement_lines.category_code IS
    'FK to statement_categories lookup. Replaces hardcoded enum for extensibility.';
COMMENT ON CONSTRAINT polymorphic_ref_consistent ON monthly_statement_lines IS
    'Polymorphic reference must be either fully set or fully null. Orphan prevention via nightly view.';
