-- ============================================================================
-- 20260101000049_bank_accounts.sql
-- Multi-bank account support
-- HOUZS Venture Portal — Phase 4 Treasury Refactor
--
-- Design:
--   - bank_accounts: track multiple bank accounts (Hong Leong main, Alliance HR)
--   - current_balance: denormalized for fast dashboard reads, updated by triggers
--   - Manual reconciliation (no auto-reconciliation per user requirement)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: bank_accounts
-- ----------------------------------------------------------------------------

CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name       TEXT NOT NULL,
    account_number  VARCHAR(30) NOT NULL,
    account_holder  TEXT NOT NULL DEFAULT 'HOUZS Venture Sdn Bhd',
    account_type    TEXT NOT NULL DEFAULT 'current',  -- 'savings', 'current'
    currency        VARCHAR(3) NOT NULL DEFAULT 'MYR',
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    gl_account_code VARCHAR(20) REFERENCES chart_of_accounts(code),
    opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'inactive', 'closed'
    notes           TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_bank_account UNIQUE (bank_name, account_number),
    CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'closed'))
);

COMMENT ON TABLE bank_accounts IS
    'Phase 4: HV bank accounts. current_balance updated via payment voucher execution.';

-- Seed: two known accounts
-- (created_by will be set by the app; use a placeholder for migration seed)
-- We defer seeding to the app layer since we need a valid user UUID.

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_bank_accounts_active ON bank_accounts(is_primary) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- Principal + Finance can read
CREATE POLICY bank_select ON bank_accounts
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

-- Principal only can create/update
CREATE POLICY bank_insert ON bank_accounts
    FOR INSERT WITH CHECK (current_user_role() = 'principal');
CREATE POLICY bank_update ON bank_accounts
    FOR UPDATE USING (current_user_role() = 'principal');
CREATE POLICY bank_no_delete ON bank_accounts
    FOR DELETE USING (FALSE);
