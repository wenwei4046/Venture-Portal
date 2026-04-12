-- ============================================================================
-- 20260101000050_payment_vouchers.sql
-- Payment Voucher system — the single exit point for all money out
-- HOUZS Venture Portal — Phase 4 Treasury Refactor
--
-- Design:
--   - Every bank transfer, expense, claim payout, loan repayment goes through
--     a payment voucher.
--   - Finance creates → attaches evidence → Principal approves → Finance executes
--   - Execution auto-deducts bank balance + source balance (dept pool, loan, etc.)
--   - Voucher number: HV-PV-YYYYMM-NNNN
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM: payment voucher type
-- ----------------------------------------------------------------------------

CREATE TYPE payment_voucher_type AS ENUM (
    'loan_repayment',       -- repay fund source (monthly installment or lump sum)
    'billing_payment',      -- pay subsidiary invoice
    'claim_payout',         -- reimburse claim (benefit or project)
    'expense',              -- general expense
    'internal_transfer',    -- transfer between bank accounts (e.g., main → Alliance HR)
    'salary_payout',        -- director salary net payment
    'other'                 -- catch-all
);

-- ----------------------------------------------------------------------------
-- ENUM: payment voucher status
-- ----------------------------------------------------------------------------

CREATE TYPE payment_voucher_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'paid',
    'voided'
);

-- ----------------------------------------------------------------------------
-- TABLE: payment_vouchers
-- ----------------------------------------------------------------------------

CREATE TABLE payment_vouchers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_no        VARCHAR(30) UNIQUE,  -- HV-PV-YYYYMM-NNNN
    voucher_type      payment_voucher_type NOT NULL,
    status            payment_voucher_status NOT NULL DEFAULT 'draft',

    -- Money
    amount            DECIMAL(15, 2) NOT NULL,
    currency          VARCHAR(3) NOT NULL DEFAULT 'MYR',

    -- Payee
    payee_name        TEXT NOT NULL,
    payee_company_id  UUID REFERENCES companies(id),  -- NULL for non-subsidiary payees

    -- Bank
    bank_account_id   UUID REFERENCES bank_accounts(id),  -- which account to pay from

    -- Reference (polymorphic link to source record)
    reference_type    TEXT,     -- 'fund_source', 'loan', 'invoice', 'claim', 'salary_payout', 'hr_opex'
    reference_id      UUID,

    -- Description & notes
    description       TEXT NOT NULL,
    notes             TEXT,

    -- Payment details
    payment_method    TEXT NOT NULL DEFAULT 'bank_transfer',  -- 'bank_transfer', 'cheque', 'cash', 'netting'
    payment_date      DATE,     -- actual payment date (set when status → paid)
    payment_reference TEXT,     -- bank ref number, cheque number, etc.

    -- Approval
    approval_id       UUID REFERENCES approval_requests(id),
    approved_by       UUID REFERENCES users(id),
    approved_at       TIMESTAMPTZ,

    -- Execution
    executed_by       UUID REFERENCES users(id),
    executed_at       TIMESTAMPTZ,

    -- Journal entry (created on execution)
    journal_entry_id  UUID REFERENCES journal_entries(id),

    -- Metadata
    version           INTEGER NOT NULL DEFAULT 1,
    created_by        UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT approved_has_metadata CHECK (
        status NOT IN ('approved', 'paid') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT paid_has_execution CHECK (
        status <> 'paid' OR (executed_by IS NOT NULL AND executed_at IS NOT NULL AND payment_date IS NOT NULL)
    )
);

COMMENT ON TABLE payment_vouchers IS
    'Phase 4: single exit point for all money out. Finance creates, Principal approves, Finance executes.';

-- Sequence for voucher numbering
CREATE SEQUENCE payment_voucher_no_seq START 1;

-- ----------------------------------------------------------------------------
-- TABLE: payment_attachments
-- ----------------------------------------------------------------------------

CREATE TABLE payment_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id      UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    file_type       TEXT NOT NULL,           -- 'image/jpeg', 'application/pdf', etc.
    file_size       INTEGER,                 -- bytes
    storage_path    TEXT NOT NULL,            -- Supabase Storage path
    description     TEXT,                    -- optional label
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_attachments IS
    'Phase 4: evidence files for payment vouchers — contracts, invoices, receipts, photos.';

-- ----------------------------------------------------------------------------
-- EXTEND: approval_request_type enum
-- ----------------------------------------------------------------------------

ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'payment_voucher';

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_payment_vouchers_updated_at BEFORE UPDATE ON payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payment_vouchers_bump_version BEFORE UPDATE ON payment_vouchers
    FOR EACH ROW WHEN (OLD.version = NEW.version) EXECUTE FUNCTION bump_version();

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_pv_status ON payment_vouchers(status, created_at DESC)
    WHERE status IN ('draft', 'pending_approval', 'approved');
CREATE INDEX idx_pv_bank_account ON payment_vouchers(bank_account_id)
    WHERE status = 'paid';
CREATE INDEX idx_pv_reference ON payment_vouchers(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;
CREATE INDEX idx_pv_payee_company ON payment_vouchers(payee_company_id)
    WHERE payee_company_id IS NOT NULL;
CREATE INDEX idx_pa_voucher ON payment_attachments(voucher_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE payment_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attachments ENABLE ROW LEVEL SECURITY;

-- Principal + Finance read all vouchers
CREATE POLICY pv_select ON payment_vouchers
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

-- Finance creates vouchers
CREATE POLICY pv_insert ON payment_vouchers
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));

-- Finance can update draft/pending; Principal can update to approve
CREATE POLICY pv_update ON payment_vouchers
    FOR UPDATE USING (current_user_role() IN ('principal', 'finance'));

-- No delete (audit trail)
CREATE POLICY pv_no_delete ON payment_vouchers
    FOR DELETE USING (FALSE);

-- Attachments: same as voucher
CREATE POLICY pa_select ON payment_attachments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM payment_vouchers pv WHERE pv.id = voucher_id
                AND current_user_role() IN ('principal', 'finance'))
    );
CREATE POLICY pa_insert ON payment_attachments
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));
CREATE POLICY pa_no_update ON payment_attachments
    FOR UPDATE USING (FALSE);
CREATE POLICY pa_no_delete ON payment_attachments
    FOR DELETE USING (FALSE);
