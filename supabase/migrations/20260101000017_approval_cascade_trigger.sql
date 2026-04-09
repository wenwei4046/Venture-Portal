-- ============================================================================
-- 20260101000017_approval_cascade_trigger.sql
-- Phase 2 Step 2 — Approval cascade trigger (Phase 2 new types only)
--                  + cancel_loan_and_approval() RPC (M2 fix)
-- HOUZS Venture Portal (VP)
--
-- Design:
-- - Trigger fires AFTER UPDATE on approval_requests when status transitions
--   away from 'pending' to a terminal state (approved | rejected).
-- - Handlers for NEW Phase 2 request types: 'new_contract', 'dept_expense'.
-- - Phase 1 types (new_loan, escalation) are explicit no-ops — the existing
--   app-layer handlers in approvals/actions.ts continue to process them.
--   DO NOT move Phase 1 logic to the trigger without a coordinated migration;
--   running both handlers would double-apply side effects.
-- - cancel_loan_and_approval() is the M2 fix: atomic rejection + cancel in
--   one transaction with SECURITY DEFINER + internal role check.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTION: handle_approval_cascade
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_approval_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Guard: only dispatch on status transitions from pending to terminal.
    IF OLD.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected') THEN
        RETURN NEW;
    END IF;

    -- Dispatch by request_type. Phase 1 types (new_loan, escalation) fall
    -- through to the ELSE branch and are no-ops — the app layer handles
    -- them in src/app/(portal)/approvals/actions.ts.
    CASE NEW.request_type

        -- ── new_contract (Phase 2) ────────────────────────────────────────
        -- Finance creates a service_contract with status='active' but
        -- approved_by NULL. On Principal approval the trigger stamps
        -- approved_by. On rejection the contract flips to 'cancelled'.
        WHEN 'new_contract' THEN
            IF NEW.status = 'approved' THEN
                UPDATE service_contracts
                SET approved_by = NEW.approved_by,
                    updated_at  = NOW()
                WHERE id = NEW.reference_id;
            ELSE  -- rejected
                UPDATE service_contracts
                SET status     = 'cancelled',
                    updated_at = NOW()
                WHERE id = NEW.reference_id;
            END IF;

        -- ── dept_expense (Phase 2) ────────────────────────────────────────
        -- Dept Manager submits an approval_request with
        --   reference_table = 'departments'
        --   reference_id    = department_id
        --   amount          = expense amount
        --   description     = expense description
        -- On approval the trigger inserts the matching expense_out row
        -- into dept_pools. On rejection the trigger is a no-op.
        WHEN 'dept_expense' THEN
            IF NEW.status = 'approved' THEN
                INSERT INTO dept_pools (
                    department_id,
                    transaction_type,
                    amount,
                    period_month,
                    description,
                    approval_id,
                    created_by
                ) VALUES (
                    NEW.reference_id,
                    'expense_out',
                    NEW.amount,
                    date_trunc('month', NOW())::date,
                    NEW.description,
                    NEW.id,
                    NEW.approved_by
                );
            END IF;

        -- ── Phase 1 types + other Phase 2+ types (no-op) ──────────────────
        ELSE
            -- new_loan + escalation: app layer still handles them.
            -- base_rate, tier_change, advance, invoice_pool_release,
            -- profit_withdrawal, contract_change: not yet wired.
            NULL;
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_approval_cascade() IS
    'Phase 2: cascades approval decisions to downstream tables. Handles new_contract (activate/cancel service_contracts) and dept_expense (insert dept_pools expense_out). Phase 1 types (new_loan, escalation) are explicit no-ops — app layer handles them.';

-- ----------------------------------------------------------------------------
-- TRIGGER on approval_requests
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS approval_cascade ON approval_requests;

CREATE TRIGGER approval_cascade
    AFTER UPDATE OF status ON approval_requests
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION handle_approval_cascade();

COMMENT ON TRIGGER approval_cascade ON approval_requests IS
    'Phase 2: cascades approval decisions for Phase 2 request types (new_contract, dept_expense). Phase 1 types remain handled by the app layer.';

-- ============================================================================
-- M2 fix — cancel_loan_and_approval
-- ============================================================================
-- Finance needs to cancel a pending loan. The cancelLoan Server Action
-- rejected the approval_request but the paired loan stayed in
-- 'pending_approval' forever because loans_principal_update RLS blocks
-- Finance from updating loans. This RPC fixes it in one transaction with
-- SECURITY DEFINER + internal role check.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_loan_and_approval(
    p_loan_id        UUID,
    p_cancel_reason  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role user_role;
BEGIN
    -- Defence in depth: explicit role check. SECURITY DEFINER would
    -- otherwise let any caller bypass loans_principal_update RLS.
    v_caller_role := current_user_role();
    IF v_caller_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'cancel_loan_and_approval: unauthorized role %', v_caller_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Verify the loan is cancellable
    IF NOT EXISTS (
        SELECT 1 FROM loans
        WHERE id = p_loan_id AND status = 'pending_approval'
    ) THEN
        RAISE EXCEPTION 'Loan % not found or not cancellable (status must be pending_approval)', p_loan_id;
    END IF;

    -- Update the loan. Bypasses loans_principal_update RLS via SECURITY DEFINER.
    UPDATE loans
    SET status     = 'cancelled',
        updated_at = NOW()
    WHERE id     = p_loan_id
      AND status = 'pending_approval';

    -- Reject the paired approval request.
    -- Note: approved_by stays NULL for rejections (matches Phase 1 convention).
    UPDATE approval_requests
    SET status         = 'rejected',
        workflow_state = 'rejected',
        notes          = COALESCE(p_cancel_reason, 'Cancelled by Finance before approval')
    WHERE reference_id    = p_loan_id
      AND reference_table = 'loans'
      AND status          = 'pending';
END;
$$;

COMMENT ON FUNCTION cancel_loan_and_approval(UUID, TEXT) IS
    'M2 fix (Phase 2 Step 2): atomic loan + approval rejection. Bypasses loans_principal_update RLS via SECURITY DEFINER. Caller role checked internally (finance | principal).';

GRANT EXECUTE ON FUNCTION cancel_loan_and_approval(UUID, TEXT) TO authenticated;
