-- ============================================================================
-- 20260101000051_fund_source_repayments.sql
-- Fund Source repayment tracking + enum extensions
-- HOUZS Venture Portal — Phase 4 Treasury Refactor
--
-- Design:
--   - fund_source_repayments: monthly repayment records (like repayments for loans)
--   - fund_source_outstanding: view computing remaining balance
--   - Extend fund_source_type enum: 4 source types
--   - Interest model: fixed rate × original principal × months
--     Example: 100k, 6mo, 2%/mo → total interest 12k → monthly payment = 112k/6
--   - Auto-transition to 'repaid' when principal fully paid (trigger)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTEND: fund_source_type enum (add 2 new values)
-- ----------------------------------------------------------------------------

ALTER TYPE fund_source_type ADD VALUE IF NOT EXISTS 'department_pool';
ALTER TYPE fund_source_type ADD VALUE IF NOT EXISTS 'director_saving';

COMMENT ON TYPE fund_source_type IS
    'Phase 4: 4 fund source types — subsidiary_savings (from subsidiary company), director_loan (from director personally), department_pool (from dept idle funds), director_saving (from 5% salary deduction pool)';

-- ----------------------------------------------------------------------------
-- TABLE: fund_source_repayments
-- ----------------------------------------------------------------------------

CREATE TABLE fund_source_repayments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_source_id  UUID NOT NULL REFERENCES fund_sources(id),
    amount          DECIMAL(15, 2) NOT NULL,
    payment_type    repayment_type NOT NULL,  -- reuse: 'principal', 'interest', 'penalty', 'netting'
    payment_date    DATE NOT NULL,
    notes           TEXT,
    payment_voucher_id UUID REFERENCES payment_vouchers(id),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fsr_amount_positive CHECK (amount > 0),
    CONSTRAINT fsr_payment_date_not_future CHECK (payment_date <= CURRENT_DATE)
);

COMMENT ON TABLE fund_source_repayments IS
    'Phase 4: monthly repayment records for fund sources (HV repaying subsidiaries/directors). Mirrors repayments table for loans.';

-- ----------------------------------------------------------------------------
-- VIEW: fund_source_outstanding
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW fund_source_outstanding WITH (security_invoker = true) AS
SELECT
    f.id AS fund_source_id,
    f.source_type,
    f.from_company_id,
    f.from_director_id,
    f.amount AS original_amount,
    f.cost_rate,
    f.lock_in_months,
    f.effective_date,
    f.maturity_date,
    f.status,
    f.amount - COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS outstanding,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS total_principal_paid,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'interest'), 0) AS total_interest_paid,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'penalty'), 0) AS total_penalty_paid,
    -- Interest calculation: fixed rate × original principal
    -- Total interest over full term = amount × cost_rate × lock_in_months
    CASE WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0
         THEN ROUND(f.amount * f.cost_rate * f.lock_in_months, 2)
         ELSE ROUND(f.amount * f.cost_rate, 2)  -- single month if no lock-in
    END AS total_interest_due,
    -- Monthly payment = (principal + total_interest) / months
    CASE WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0
         THEN ROUND((f.amount + f.amount * f.cost_rate * f.lock_in_months) / f.lock_in_months, 2)
         ELSE ROUND(f.amount + f.amount * f.cost_rate, 2)  -- lump sum if 1 month
    END AS monthly_payment
FROM fund_sources f
LEFT JOIN fund_source_repayments r ON r.fund_source_id = f.id
GROUP BY f.id, f.source_type, f.from_company_id, f.from_director_id,
         f.amount, f.cost_rate, f.lock_in_months, f.effective_date,
         f.maturity_date, f.status;

COMMENT ON VIEW fund_source_outstanding IS
    'Phase 4: fund source balance view. Interest = fixed rate × original principal × months. Monthly payment = (principal + total interest) / months.';

-- ----------------------------------------------------------------------------
-- TRIGGER: auto-transition fund_source to repaid when principal fully paid
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_fund_source_fully_repaid()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_principal    DECIMAL(15, 2);
    v_total_paid   DECIMAL(15, 2);
    v_status       TEXT;
BEGIN
    -- Only check on principal payments
    IF NEW.payment_type <> 'principal' THEN
        RETURN NEW;
    END IF;

    SELECT f.amount, f.status
    INTO v_principal, v_status
    FROM fund_sources f
    WHERE f.id = NEW.fund_source_id;

    -- Only transition active/matured sources
    IF v_status NOT IN ('active', 'matured') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM fund_source_repayments
    WHERE fund_source_id = NEW.fund_source_id
      AND payment_type = 'principal';

    IF v_total_paid >= v_principal THEN
        UPDATE fund_sources
        SET status = 'repaid',
            repaid_at = NOW(),
            repaid_by = NEW.created_by
        WHERE id = NEW.fund_source_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fund_source_repayment_check
    AFTER INSERT ON fund_source_repayments
    FOR EACH ROW
    EXECUTE FUNCTION check_fund_source_fully_repaid();

-- ----------------------------------------------------------------------------
-- TRIGGER: block repayment on inactive fund source
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION block_repayment_on_inactive_fund_source()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM fund_sources
    WHERE id = NEW.fund_source_id;

    IF v_status NOT IN ('active', 'matured') THEN
        RAISE EXCEPTION 'Cannot record repayment on fund source with status %', v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_inactive_fund_source_repayment
    BEFORE INSERT ON fund_source_repayments
    FOR EACH ROW
    EXECUTE FUNCTION block_repayment_on_inactive_fund_source();

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_fsr_fund_source ON fund_source_repayments(fund_source_id, payment_date DESC);
CREATE INDEX idx_fsr_payment_type ON fund_source_repayments(fund_source_id, payment_type);
CREATE INDEX idx_fsr_voucher ON fund_source_repayments(payment_voucher_id)
    WHERE payment_voucher_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS (same pattern as repayments table for loans)
-- ----------------------------------------------------------------------------

ALTER TABLE fund_source_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY fsr_select ON fund_source_repayments
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY fsr_insert ON fund_source_repayments
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'finance'));

-- No update/delete (audit trail)
CREATE POLICY fsr_no_update ON fund_source_repayments
    FOR UPDATE USING (FALSE);
CREATE POLICY fsr_no_delete ON fund_source_repayments
    FOR DELETE USING (FALSE);
