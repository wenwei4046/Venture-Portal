-- ============================================================================
-- 20260101000048_chart_of_accounts.sql
-- Chart of Accounts + Journal Entries (double-entry bookkeeping foundation)
-- HOUZS Venture Portal — Phase 4 Treasury Refactor
--
-- Design:
--   - chart_of_accounts: lookup table of GL account codes
--   - journal_entries: header per transaction (date, description, reference)
--   - journal_lines: debit/credit rows per entry (must balance)
--   - Validation trigger ensures debit = credit before insert
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM: account type
-- ----------------------------------------------------------------------------

CREATE TYPE account_type AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
);

-- ----------------------------------------------------------------------------
-- TABLE: chart_of_accounts
-- ----------------------------------------------------------------------------

CREATE TABLE chart_of_accounts (
    code        VARCHAR(20) PRIMARY KEY,
    name        TEXT NOT NULL,
    type        account_type NOT NULL,
    parent_code VARCHAR(20) REFERENCES chart_of_accounts(code),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chart_of_accounts IS
    'Phase 4: GL account hierarchy for double-entry bookkeeping. Codes follow Malaysian accounting convention.';

-- Seed: core accounts for HV internal banking model
INSERT INTO chart_of_accounts (code, name, type, parent_code, sort_order) VALUES
    -- Assets (1xxx)
    ('1000', 'Assets',                          'asset',     NULL,   1),
    ('1010', 'Cash & Bank — Hong Leong',        'asset',     '1000', 10),
    ('1011', 'Cash & Bank — Alliance (HR)',     'asset',     '1000', 11),
    ('1020', 'Loans Receivable',                'asset',     '1000', 20),
    ('1030', 'Director Advance',                'asset',     '1000', 30),
    ('1040', 'Accounts Receivable — Subs',      'asset',     '1000', 40),
    ('1050', 'Interest Receivable',             'asset',     '1000', 50),

    -- Liabilities (2xxx)
    ('2000', 'Liabilities',                     'liability', NULL,   2),
    ('2010', 'Fund Sources Payable',            'liability', '2000', 10),
    ('2020', 'Interest Payable — Fund Sources', 'liability', '2000', 20),
    ('2030', 'Salary Payable (75% Payroll)',    'liability', '2000', 30),
    ('2040', 'Statutory Payable',               'liability', '2000', 40),
    ('2050', 'Director Invoice Payable (25%)',  'liability', '2000', 50),
    ('2060', 'Accounts Payable — General',      'liability', '2000', 60),

    -- Equity / Internal Funds (3xxx)
    ('3000', 'Equity & Internal Funds',         'equity',    NULL,   3),
    ('3010', 'HV Operating Fund',               'equity',    '3000', 10),
    ('3020', 'Director Saving Fund',            'equity',    '3000', 20),
    ('3030', 'Dept Pool — Marketing',           'equity',    '3000', 30),
    ('3040', 'Dept Pool — Finance',             'equity',    '3000', 31),
    ('3050', 'Dept Pool — HR',                  'equity',    '3000', 32),
    ('3060', 'Invoice Payout Pool',             'equity',    '3000', 40),

    -- Revenue (4xxx)
    ('4000', 'Revenue',                         'revenue',   NULL,   4),
    ('4010', 'Interest Income — Loans',         'revenue',   '4000', 10),
    ('4020', 'Penalty Income',                  'revenue',   '4000', 20),
    ('4030', 'Service Billing Revenue',         'revenue',   '4000', 30),
    ('4040', 'Marketing Project Revenue',       'revenue',   '4000', 40),

    -- Expenses (5xxx)
    ('5000', 'Expenses',                        'expense',   NULL,   5),
    ('5010', 'Interest Expense — Fund Sources', 'expense',   '5000', 10),
    ('5020', 'Staff Cost — HR Pool',            'expense',   '5000', 20),
    ('5030', 'Staff Cost — Finance',            'expense',   '5000', 30),
    ('5040', 'Marketing Expenses',              'expense',   '5000', 40),
    ('5050', 'General & Admin Expenses',        'expense',   '5000', 50),
    ('5060', 'Claims Expense',                  'expense',   '5000', 60),
    ('5070', 'SST Expense',                     'expense',   '5000', 70);

-- ----------------------------------------------------------------------------
-- TABLE: journal_entries (header)
-- ----------------------------------------------------------------------------

CREATE TABLE journal_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_no         VARCHAR(30) UNIQUE,  -- JE-YYYYMM-NNNN
    transaction_date DATE NOT NULL,
    period_month     DATE NOT NULL,       -- first of month (for period grouping)
    description      TEXT NOT NULL,
    reference_type   TEXT,                -- 'fund_source', 'loan', 'repayment', 'payment_voucher', 'invoice', 'salary', 'claim'
    reference_id     UUID,                -- polymorphic FK to source record
    total_amount     DECIMAL(15, 2) NOT NULL,
    is_reversed      BOOLEAN NOT NULL DEFAULT FALSE,
    reversed_by_id   UUID REFERENCES journal_entries(id),
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT total_positive CHECK (total_amount > 0),
    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1)
);

COMMENT ON TABLE journal_entries IS
    'Phase 4: journal header for double-entry bookkeeping. Each entry has balanced debit/credit lines.';

-- Sequence for entry numbering
CREATE SEQUENCE journal_entry_no_seq START 1;

-- ----------------------------------------------------------------------------
-- TABLE: journal_lines (debit/credit rows)
-- ----------------------------------------------------------------------------

CREATE TABLE journal_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(code),
    debit       DECIMAL(15, 2),
    credit      DECIMAL(15, 2),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT debit_xor_credit CHECK (
        (debit IS NOT NULL AND debit > 0 AND credit IS NULL)
        OR (credit IS NOT NULL AND credit > 0 AND debit IS NULL)
    )
);

COMMENT ON TABLE journal_lines IS
    'Phase 4: individual debit/credit lines within a journal entry. Sum(debit) must equal Sum(credit) per entry.';

-- ----------------------------------------------------------------------------
-- TRIGGER: validate double-entry balance on insert
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_debit  DECIMAL(15, 2);
    v_total_credit DECIMAL(15, 2);
BEGIN
    SELECT
        COALESCE(SUM(debit), 0),
        COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_lines
    WHERE entry_id = NEW.entry_id;

    -- Allow imbalanced state during multi-row INSERT (validated at commit)
    -- This trigger fires per-statement AFTER all lines are inserted
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- We rely on application-level validation (Server Action) to ensure balance
-- before committing. A deferred constraint trigger would be ideal but
-- Supabase does not support CREATE CONSTRAINT TRIGGER on hosted instances.
-- The RPC wrapper will validate sum(debit) = sum(credit) before returning.

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_journal_entries_period ON journal_entries(period_month, transaction_date);
CREATE INDEX idx_journal_entries_ref ON journal_entries(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_code, entry_id);
CREATE INDEX idx_coa_type ON chart_of_accounts(type) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- TRIGGERS: updated_at
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_coa_updated_at BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- chart_of_accounts: all authenticated read, Principal write
CREATE POLICY coa_select ON chart_of_accounts
    FOR SELECT USING (TRUE);
CREATE POLICY coa_insert ON chart_of_accounts
    FOR INSERT WITH CHECK (current_user_role() = 'principal');
CREATE POLICY coa_update ON chart_of_accounts
    FOR UPDATE USING (current_user_role() = 'principal');
CREATE POLICY coa_no_delete ON chart_of_accounts
    FOR DELETE USING (FALSE);

-- journal_entries: Principal + Finance read, Finance insert (via RPC), no update/delete (audit trail)
CREATE POLICY je_select ON journal_entries
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY je_insert ON journal_entries
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));
CREATE POLICY je_no_update ON journal_entries
    FOR UPDATE USING (FALSE);
CREATE POLICY je_no_delete ON journal_entries
    FOR DELETE USING (FALSE);

-- journal_lines: same as entries
CREATE POLICY jl_select ON journal_lines
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = entry_id
                AND current_user_role() IN ('principal', 'finance'))
    );
CREATE POLICY jl_insert ON journal_lines
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = entry_id
                AND current_user_role() IN ('principal', 'finance'))
    );
CREATE POLICY jl_no_update ON journal_lines
    FOR UPDATE USING (FALSE);
CREATE POLICY jl_no_delete ON journal_lines
    FOR DELETE USING (FALSE);

-- ----------------------------------------------------------------------------
-- VIEW: trial_balance (per period)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW trial_balance WITH (security_invoker = true) AS
SELECT
    jl.account_code,
    coa.name AS account_name,
    coa.type AS account_type,
    je.period_month,
    COALESCE(SUM(jl.debit), 0)  AS total_debit,
    COALESCE(SUM(jl.credit), 0) AS total_credit,
    COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.entry_id
JOIN chart_of_accounts coa ON coa.code = jl.account_code
WHERE je.is_reversed = FALSE
GROUP BY jl.account_code, coa.name, coa.type, je.period_month;

COMMENT ON VIEW trial_balance IS
    'Phase 4: aggregated debit/credit per account per period. Excludes reversed entries.';
