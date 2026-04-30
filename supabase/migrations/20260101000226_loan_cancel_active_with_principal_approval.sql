-- ============================================================================
-- 20260101000226_loan_cancel_active_with_principal_approval.sql
-- Item 3: cancel an active (already-disbursed) loan with full reversal.
--
-- Flow: Finance proposes → Principal approves → system reverses bank, venture
-- pool, voucher, and posts a reversing JE; loan flips to 'cancelled'.
--
-- Why an approval gate: this is a money-reversing operation. Finance can
-- already cancel pending_approval loans unilaterally (mig 17/107) because
-- nothing has moved yet; for active loans the disbursement already touched
-- bank + venture_pool + GL, and unwinding those without a Principal sign-off
-- is too dangerous (see CLAUDE.md red lines: "改动 auth/middleware" wasn't
-- meant for SECURITY DEFINER reversals, but the same trust principle applies).
--
-- Adds:
--   (1) request_loan_cancel(p_loan_id, p_reason) — Finance creates an
--       approval_request of type 'loan_cancel'. Refuses if the loan has any
--       repayment recorded (must be unwound separately first).
--   (2) execute_loan_cancel(p_loan_id, p_caller) — Principal-only path that
--       does the actual reversal. Called from approvals/actions.ts when the
--       loan_cancel approval flips to 'approved'.
-- ============================================================================

CREATE OR REPLACE FUNCTION request_loan_cancel(
    p_loan_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_loan_amount NUMERIC;
    v_loan_status loan_status;
    v_repayment_count INT;
    v_request_id UUID;
    v_existing_request UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance') THEN
        RAISE EXCEPTION 'request_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    SELECT principal, status INTO v_loan_amount, v_loan_status
    FROM loans WHERE id = p_loan_id;

    IF v_loan_status IS NULL THEN
        RAISE EXCEPTION 'Loan % not found', p_loan_id;
    END IF;
    IF v_loan_status <> 'active' THEN
        RAISE EXCEPTION 'Loan must be active to request cancellation. Current status: %', v_loan_status;
    END IF;

    SELECT count(*) INTO v_repayment_count
    FROM repayments WHERE loan_id = p_loan_id;
    IF v_repayment_count > 0 THEN
        RAISE EXCEPTION 'Cannot cancel loan with % repayment(s). Reverse repayments first.', v_repayment_count;
    END IF;

    -- Idempotency: if a pending loan_cancel request already exists, return its id.
    SELECT id INTO v_existing_request
    FROM approval_requests
    WHERE reference_id = p_loan_id
      AND reference_table = 'loans'
      AND request_type = 'loan_cancel'
      AND status = 'pending'
    LIMIT 1;
    IF v_existing_request IS NOT NULL THEN
        RETURN v_existing_request;
    END IF;

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state
    ) VALUES (
        'loan_cancel', p_loan_id, 'loans',
        v_caller_id,
        COALESCE(p_reason, 'Cancel active loan and reverse disbursement'),
        v_loan_amount, 'pending', 'submitted'
    )
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION request_loan_cancel(UUID, TEXT) IS
    'Item 3: Finance proposes cancelling an active loan. Principal approval triggers execute_loan_cancel.';

GRANT EXECUTE ON FUNCTION request_loan_cancel(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Reversal worker. Called from approvals/actions.ts after Principal approves.
-- Returns the disbursement voucher's amount so the caller can also bump the
-- bank balance + post the reversing JE (which lives in app code where
-- postJournalEntry is wired up).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION execute_loan_cancel(p_loan_id UUID)
RETURNS TABLE (
    out_principal NUMERIC,
    out_voucher_id UUID,
    out_disbursement_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_principal NUMERIC;
    v_voucher_id UUID;
    v_disbursement_date DATE;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    SELECT principal, disbursement_date INTO v_principal, v_disbursement_date
    FROM loans WHERE id = p_loan_id AND status = 'active';
    IF v_principal IS NULL THEN
        RAISE EXCEPTION 'Loan % is not active or no longer exists', p_loan_id;
    END IF;

    IF EXISTS (SELECT 1 FROM repayments WHERE loan_id = p_loan_id) THEN
        RAISE EXCEPTION 'Cannot cancel: loan has repayments recorded';
    END IF;

    -- Locate the original disbursement voucher (created at loan creation).
    SELECT id INTO v_voucher_id
    FROM payment_vouchers
    WHERE reference_type = 'loan'
      AND reference_id = p_loan_id
      AND status = 'paid'
    LIMIT 1;

    -- Reverse the venture_pool fund_out by inserting a matching fund_in.
    INSERT INTO venture_pool (
        transaction_type, amount, description,
        reference_id, reference_table, created_by
    ) VALUES (
        'fund_in', v_principal,
        'Loan cancellation reversal — ' || p_loan_id,
        p_loan_id, 'loans', v_caller_id
    );

    -- Mark loan as cancelled.
    UPDATE loans
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_loan_id;

    -- Void the original disbursement voucher so /payments shows it stopped.
    IF v_voucher_id IS NOT NULL THEN
        UPDATE payment_vouchers
        SET status = 'voided'
        WHERE id = v_voucher_id;
    END IF;

    out_principal := v_principal;
    out_voucher_id := v_voucher_id;
    out_disbursement_date := v_disbursement_date;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION execute_loan_cancel(UUID) IS
    'Item 3: Principal-only reversal worker. Returns principal + voucher_id so caller can bump bank + post reversing JE in app code.';

GRANT EXECUTE ON FUNCTION execute_loan_cancel(UUID) TO authenticated;
