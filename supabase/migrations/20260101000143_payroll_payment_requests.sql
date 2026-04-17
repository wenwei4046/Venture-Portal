-- ============================================================================
-- 20260101000143_payroll_payment_requests.sql
-- Stage D/E bridge table — HR requests payroll payment, Finance generates PV.
-- HOUZS Venture Portal — payroll flow refactor commit 2 of 4
--
-- After migration 142 made Stage A data-only, we need an explicit handoff
-- from HR to Finance for Stage D → E:
--
--   Stage D  HR clicks "Request Payroll Payment" after costing is approved
--            → inserts a row here with status='submitted'
--   Stage E  Finance sees the row in their /payments → "Payroll Requests" tab
--            → clicks "Generate PV" which pre-fills a voucher form from this
--              row (amount locked) and, on submit, UPDATEs pv_id +
--              status='pv_generated'
--   Stage F  Principal approves the PV via existing /payments approval flow
--            → a trigger on payment_vouchers (added in commit 4) flips the
--              linked request to status='completed'
--   Cancel   HR may cancel a still-submitted request (no PV generated yet);
--            Finance may also cancel if the request is invalid
--
-- Business invariants enforced in this migration:
--   - A request may only exist against a payroll_run whose status='approved'
--   - amount must equal payroll_run.total_amount (no fudging)
--   - At most one active (submitted OR pv_generated) request per payroll_run
--   - requested_by must be the same as the submitted auth.uid() (RLS WITH CHECK)
-- ============================================================================

CREATE TYPE payroll_payment_request_status AS ENUM (
    'submitted',     -- HR created, awaiting Finance
    'pv_generated',  -- Finance generated a PV, awaiting Principal PV approval
    'completed',     -- PV approved + executed (money moved to HR Pool)
    'cancelled'      -- HR or Finance cancelled before PV approval
);

CREATE TABLE payroll_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payroll_run_id UUID NOT NULL
        REFERENCES payroll_runs(id) ON DELETE CASCADE,

    requested_by UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),

    -- Finance picks the source bank when generating the PV in Stage E.
    -- Nullable at insert (HR doesn't decide the bank); populated at PV generation.
    source_bank_id UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,

    -- The target pool that receives the money after PV execution.
    -- Default matches current flow (HR Pool = alliance_bank_pool ledger).
    target_pool TEXT NOT NULL DEFAULT 'alliance_bank_pool',

    status payroll_payment_request_status NOT NULL DEFAULT 'submitted',

    -- Back-reference to the generated PV (nullable until Stage E).
    pv_id UUID REFERENCES payment_vouchers(id) ON DELETE SET NULL,

    notes TEXT,

    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id),
    cancellation_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ppr_payroll_run ON payroll_payment_requests (payroll_run_id);
CREATE INDEX idx_ppr_status ON payroll_payment_requests (status);
CREATE INDEX idx_ppr_requested_by ON payroll_payment_requests (requested_by);

-- Exactly one active request per payroll_run (submitted or pv_generated).
-- Cancelled + completed rows don't block new requests, so HR can retry after
-- a cancel.
CREATE UNIQUE INDEX uq_ppr_one_active_per_run
    ON payroll_payment_requests (payroll_run_id)
    WHERE status IN ('submitted', 'pv_generated');

COMMENT ON TABLE payroll_payment_requests IS
    'Stage D/E bridge: HR requests payroll payment → Finance generates a PV. '
    'Created 2026-04-17 as part of the payroll flow refactor that split the '
    'monolithic approve_payroll_run into discrete stages.';

-- ─── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_payroll_payment_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ppr_touch_updated_at
    BEFORE UPDATE ON payroll_payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION touch_payroll_payment_requests_updated_at();

-- ─── Business invariant trigger ──────────────────────────────────────────────
-- Enforces at INSERT time:
--   - payroll_run is status='approved'
--   - amount matches payroll_run.total_amount exactly
-- These checks cannot live in CHECK constraints because they cross tables.

CREATE OR REPLACE FUNCTION validate_payroll_payment_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_run_status payroll_run_status;
    v_run_total  DECIMAL(15, 2);
BEGIN
    SELECT status, total_amount
      INTO v_run_status, v_run_total
      FROM payroll_runs
     WHERE id = NEW.payroll_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'payroll_payment_request: payroll_run % not found', NEW.payroll_run_id;
    END IF;

    IF v_run_status <> 'approved' THEN
        RAISE EXCEPTION
            'payroll_payment_request: payroll_run % status is %, must be approved',
            NEW.payroll_run_id, v_run_status;
    END IF;

    IF NEW.amount <> v_run_total THEN
        RAISE EXCEPTION
            'payroll_payment_request: amount % must match payroll_run total %',
            NEW.amount, v_run_total;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ppr_validate_insert
    BEFORE INSERT ON payroll_payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION validate_payroll_payment_request_insert();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_payment_requests ENABLE ROW LEVEL SECURITY;

-- Principal + Finance see everything.
CREATE POLICY ppr_principal_all
    ON payroll_payment_requests FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY ppr_finance_select
    ON payroll_payment_requests FOR SELECT
    USING (current_user_role() = 'finance');

-- Finance updates (Stage E: generate PV; or cancel a submitted request).
-- Status transitions are enforced by the server action + trigger in commit 3/4.
CREATE POLICY ppr_finance_update
    ON payroll_payment_requests FOR UPDATE
    USING (current_user_role() = 'finance')
    WITH CHECK (current_user_role() = 'finance');

-- HR sees own submissions only.
CREATE POLICY ppr_hr_select_own
    ON payroll_payment_requests FOR SELECT
    USING (current_user_role() = 'hr' AND requested_by = auth.uid());

-- HR inserts (Stage D). requested_by must be the acting user.
CREATE POLICY ppr_hr_insert
    ON payroll_payment_requests FOR INSERT
    WITH CHECK (
        current_user_role() = 'hr'
        AND requested_by = auth.uid()
        AND status = 'submitted'
    );

-- HR can cancel their own still-submitted request (status -> cancelled).
-- USING gates the row; WITH CHECK gates the new state. Combined = "only your
-- own, only from submitted, only into cancelled".
CREATE POLICY ppr_hr_cancel_own
    ON payroll_payment_requests FOR UPDATE
    USING (
        current_user_role() = 'hr'
        AND requested_by = auth.uid()
        AND status = 'submitted'
    )
    WITH CHECK (
        current_user_role() = 'hr'
        AND requested_by = auth.uid()
        AND status = 'cancelled'
    );
