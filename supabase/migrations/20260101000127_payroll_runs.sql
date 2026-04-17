-- ============================================================================
-- 20260101000127_payroll_runs.sql
-- Spec 2 (HR Payroll Redesign) — monthly payroll run submitted for Principal approval
-- HOUZS Venture Portal
--
-- Every month, HR "submits the payroll" as one package: 4 OPEX totals
-- (Marketing / HR / Finance / Director) plus the underlying row-level detail
-- in hr_monthly_payroll + director_payouts. Principal approves the package;
-- approval fan-outs into one salary_payout payment_voucher per person
-- (migration 129).
--
-- This migration just lands the table + enum + RLS. The RPCs that populate
-- and drive it arrive in migrations 128 and 129.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM
-- ----------------------------------------------------------------------------

CREATE TYPE payroll_run_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'paid',
    'rejected'
);

COMMENT ON TYPE payroll_run_status IS
    'draft: HR building (not used today — hr_monthly_payroll.status=draft is enough). submitted: awaiting Principal. approved: Principal signed off, voucher fan-out in progress. paid: all vouchers written. rejected: back to HR.';

-- Extend approval_request_type to carry payroll runs
ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'payroll_run';

-- ----------------------------------------------------------------------------
-- TABLE: payroll_runs
-- ----------------------------------------------------------------------------

CREATE TABLE payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,

    -- 4 OPEX totals — populated by submit_payroll_to_principal RPC (migration 128)
    marketing_opex_total  DECIMAL(15, 2) NOT NULL DEFAULT 0,
    hr_opex_total         DECIMAL(15, 2) NOT NULL DEFAULT 0,
    finance_opex_total    DECIMAL(15, 2) NOT NULL DEFAULT 0,
    director_salary_total DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Stored generated column so downstream reads stay cheap
    total_amount DECIMAL(15, 2) GENERATED ALWAYS AS (
        marketing_opex_total + hr_opex_total + finance_opex_total + director_salary_total
    ) STORED,

    status payroll_run_status NOT NULL DEFAULT 'draft',

    -- Approval / execution bookkeeping
    approval_id       UUID REFERENCES approval_requests(id),
    submitted_by      UUID REFERENCES users(id),
    submitted_at      TIMESTAMPTZ,
    approved_by       UUID REFERENCES users(id),
    approved_at       TIMESTAMPTZ,
    paid_at           TIMESTAMPTZ,
    rejected_at       TIMESTAMPTZ,
    rejection_reason  TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    -- Only ONE non-rejected run per period. Rejected runs can pile up (HR tries again).
    CONSTRAINT uq_payroll_run_period_alive UNIQUE (period_month, status)
        DEFERRABLE INITIALLY IMMEDIATE
);

-- Loosen the constraint: we actually want "one row per period WHERE status != 'rejected'".
-- A partial unique index does that cleanly (the CHECK above is a placeholder so table creates first).
ALTER TABLE payroll_runs DROP CONSTRAINT uq_payroll_run_period_alive;

CREATE UNIQUE INDEX uq_payroll_run_period_alive
    ON payroll_runs (period_month)
    WHERE status <> 'rejected';

CREATE INDEX idx_payroll_runs_status_period ON payroll_runs (status, period_month DESC);
CREATE INDEX idx_payroll_runs_submitted_by ON payroll_runs (submitted_by);

COMMENT ON TABLE payroll_runs IS
    'Spec 2: monthly payroll submission package. One non-rejected row per period. Links to approval_requests. Fans out into salary_payout vouchers on approve (see migration 129).';

-- Updated-at trigger (reuse existing helper)
CREATE TRIGGER trg_payroll_runs_updated_at BEFORE UPDATE ON payroll_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
--
-- principal: full R/W
-- finance:   SELECT only (sees totals, can't approve / reject)
-- hr:        SELECT own submissions; INSERT; UPDATE only from rejected → draft
-- dept_manager: DENY
-- ----------------------------------------------------------------------------

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_runs_principal_all
    ON payroll_runs FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY payroll_runs_finance_select
    ON payroll_runs FOR SELECT
    USING (current_user_role() = 'finance');

CREATE POLICY payroll_runs_hr_select_own
    ON payroll_runs FOR SELECT
    USING (current_user_role() = 'hr' AND submitted_by = auth.uid());

CREATE POLICY payroll_runs_hr_insert
    ON payroll_runs FOR INSERT
    WITH CHECK (
        current_user_role() = 'hr'
        AND submitted_by = auth.uid()
        AND status IN ('draft', 'submitted')
    );

-- HR can re-open a rejected run: UPDATE status from 'rejected' to 'draft' or 'submitted'
CREATE POLICY payroll_runs_hr_reopen
    ON payroll_runs FOR UPDATE
    USING (current_user_role() = 'hr' AND submitted_by = auth.uid() AND status = 'rejected')
    WITH CHECK (current_user_role() = 'hr' AND status IN ('draft', 'submitted'));
