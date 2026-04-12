-- ============================================================================
-- 20260101000055_credit_notes.sql
-- Credit Notes — adjustments/refunds against invoices
-- HOUZS Venture Portal — Phase 4 Step 8
--
-- Design:
--   - credit_notes: negative invoice linked to original invoice
--   - Auto-applies to next month's statement as contra
--   - Finance creates, Principal approves (via approval_requests)
--   - Number format: HV-CN-YYYYMM-NNNN
-- ============================================================================

CREATE TABLE credit_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_no  VARCHAR(30) UNIQUE,
    invoice_id      UUID NOT NULL REFERENCES invoices(id),
    company_id      UUID NOT NULL REFERENCES companies(id),
    amount          DECIMAL(15, 2) NOT NULL,
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft', 'approved', 'applied', 'voided'
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    applied_to_statement_id UUID REFERENCES monthly_statements(id),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT cn_amount_positive CHECK (amount > 0),
    CONSTRAINT cn_valid_status CHECK (status IN ('draft', 'approved', 'applied', 'voided'))
);

COMMENT ON TABLE credit_notes IS
    'Phase 4: credit notes (adjustments/refunds) against invoices. Applied as contra in next statement.';

-- Sequence for numbering
CREATE SEQUENCE credit_note_no_seq START 1;

-- Triggers
CREATE TRIGGER trg_credit_notes_updated_at BEFORE UPDATE ON credit_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_cn_invoice ON credit_notes(invoice_id);
CREATE INDEX idx_cn_company ON credit_notes(company_id, status);
CREATE INDEX idx_cn_status ON credit_notes(status) WHERE status IN ('draft', 'approved');

-- RLS
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cn_select ON credit_notes
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY cn_insert ON credit_notes
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));
CREATE POLICY cn_update ON credit_notes
    FOR UPDATE USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY cn_no_delete ON credit_notes
    FOR DELETE USING (FALSE);
