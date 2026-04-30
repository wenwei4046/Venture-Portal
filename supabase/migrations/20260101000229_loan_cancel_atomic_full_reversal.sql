-- ============================================================================
-- 20260101000229_loan_cancel_atomic_full_reversal.sql
-- Codex adversarial-review fix: loan cancellation must be all-or-nothing.
--
-- Original mig 226 left bank_accounts.current_balance and the reversing JE
-- to app code (approvals/actions.ts). If the RPC succeeded but bank-bump or
-- JE post failed, the loan was already cancelled and the venture_pool reverse
-- was already written, but cash and GL were unreversed — split state.
--
-- This recreate folds the bank update + JE post INTO the RPC. All side
-- effects share the function's single transaction, so a failure anywhere
-- rolls everything back. Caller (approvals/actions.ts) becomes a thin shim:
-- check approval, run RPC, done.
-- ============================================================================

DROP FUNCTION IF EXISTS execute_loan_cancel(UUID);

CREATE OR REPLACE FUNCTION execute_loan_cancel(p_loan_id UUID)
RETURNS UUID
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
    v_bank_id UUID;
    v_bank_gl TEXT;
    v_je_id UUID;
    v_today DATE := CURRENT_DATE;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    -- (1) Fetch loan + guard
    SELECT principal, disbursement_date INTO v_principal, v_disbursement_date
    FROM loans WHERE id = p_loan_id AND status = 'active';
    IF v_principal IS NULL THEN
        RAISE EXCEPTION 'Loan % is not active or no longer exists', p_loan_id;
    END IF;

    IF EXISTS (SELECT 1 FROM repayments WHERE loan_id = p_loan_id) THEN
        RAISE EXCEPTION 'Cannot cancel: loan has repayments recorded';
    END IF;

    -- (2) Locate the original disbursement voucher
    SELECT id INTO v_voucher_id
    FROM payment_vouchers
    WHERE reference_type = 'loan'
      AND reference_id = p_loan_id
      AND status = 'paid'
    LIMIT 1;

    -- (3) Reverse venture_pool
    INSERT INTO venture_pool (
        transaction_type, amount, description,
        reference_id, reference_table, created_by
    ) VALUES (
        'fund_in', v_principal,
        'Loan cancellation reversal — ' || p_loan_id,
        p_loan_id, 'loans', v_caller_id
    );

    -- (4) Mark loan cancelled
    UPDATE loans
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_loan_id;

    -- (5) Void original voucher
    IF v_voucher_id IS NOT NULL THEN
        UPDATE payment_vouchers
        SET status = 'voided'
        WHERE id = v_voucher_id;
    END IF;

    -- (6) Bump bank balance back up. If no primary bank exists we still
    -- proceed — the reversing JE captures the GL impact regardless.
    SELECT id, gl_account_code INTO v_bank_id, v_bank_gl
    FROM bank_accounts
    WHERE is_primary = true AND status = 'active'
    LIMIT 1;

    IF v_bank_id IS NOT NULL THEN
        UPDATE bank_accounts
        SET current_balance = COALESCE(current_balance, 0) + v_principal
        WHERE id = v_bank_id;
    END IF;

    -- (7) Reversing JE: dr Bank, cr 1020 Loans Receivable. Routed through
    -- post_journal_entry so the segment trigger (mig 217) and balance check
    -- still fire. Failure here rolls back steps 3-6 with us.
    SELECT post_journal_entry(
        v_today,
        'Loan cancellation reversal — ' || p_loan_id,
        'loan',
        p_loan_id,
        v_caller_id,
        jsonb_build_array(
            jsonb_build_object(
                'account_code', COALESCE(v_bank_gl, '1010'),
                'debit', v_principal,
                'credit', NULL,
                'description', 'Bank — loan principal returned'
            ),
            jsonb_build_object(
                'account_code', '1020',
                'debit', NULL,
                'credit', v_principal,
                'description', 'Loans Receivable reversed'
            )
        ),
        'treasury'::gl_segment
    ) INTO v_je_id;

    RETURN v_je_id;
END;
$$;

COMMENT ON FUNCTION execute_loan_cancel(UUID) IS
    'Atomic loan cancellation reversal (Codex review fix). Owns the bank bump and JE post; caller no longer needs to coordinate.';

GRANT EXECUTE ON FUNCTION execute_loan_cancel(UUID) TO authenticated;
