-- ============================================================================
-- 20260101000107_loan_out_combined_approval.sql
-- Phase 7 Step 9 — Loan OUT combined approval (loan + voucher, shared group_id)
--
-- When Finance submits a Loan OUT, a SINGLE RPC now creates:
--   1. loans (pending_approval)
--   2. approval_requests (request_type=new_loan, group_id=X)
--   3. payment_vouchers (pending_approval, source_pool=hv_operating_fund)
--   4. payment_voucher_sources (1 row, pool=hv_operating_fund, amount=principal)
--   5. approval_requests (request_type=payment_voucher, group_id=X)
--
-- Both approval_requests share the same group_id. The UI groups them
-- into ONE combined card; approveRequestGroup / rejectRequestGroup act
-- on both atomically.
-- ============================================================================

BEGIN;

-- ─── 1) Add group_id column + index ────────────────────────────────────────
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS group_id UUID;

CREATE INDEX IF NOT EXISTS approval_requests_group_idx
    ON approval_requests(group_id) WHERE group_id IS NOT NULL;

COMMENT ON COLUMN approval_requests.group_id IS
    'Phase 7: approvals sharing group_id are surfaced as a single combined card. Used by Loan OUT (new_loan + payment_voucher pair).';

-- ─── 2) Replace create_loan_with_approval RPC ──────────────────────────────
-- Drop the stale 8-arg signature (if it ever got created) so PostgREST can
-- disambiguate the 7-arg canonical signature used by fund-out/actions.ts.
DROP FUNCTION IF EXISTS create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_repayment_terms TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_loan_id UUID;
    v_voucher_id UUID;
    v_group_id UUID;
    v_voucher_no VARCHAR(30);
    v_period TEXT;
    v_seq INTEGER;
    v_description TEXT;
BEGIN
    -- Auth guard: finance only
    v_role := current_user_role();
    IF v_role <> 'finance' THEN
        RAISE EXCEPTION 'create_loan_with_approval: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();

    IF p_principal <= 0 THEN
        RAISE EXCEPTION 'Principal must be greater than 0';
    END IF;
    IF p_principal > 100000000 THEN
        RAISE EXCEPTION 'Principal exceeds RM 100M ceiling';
    END IF;

    v_group_id := gen_random_uuid();
    v_description := 'New loan to ' || p_company_name;

    -- (1) Loan
    INSERT INTO loans (
        company_id, principal, base_rate, risk_premium, effective_rate,
        repayment_terms, status, created_by
    ) VALUES (
        p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
        p_repayment_terms, 'pending_approval', v_caller_id
    )
    RETURNING id INTO v_loan_id;

    -- (2) Loan approval_request (group_id)
    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state, group_id
    ) VALUES (
        'new_loan', v_loan_id, 'loans',
        v_caller_id,
        v_description,
        p_principal, 'pending', 'submitted', v_group_id
    );

    -- (3) Voucher number: HV-PV-YYYYMM-NNNN
    v_period := to_char(now(), 'YYYYMM');
    SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
    v_voucher_no := 'HV-PV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- (4) Voucher (pending_approval, direction=debit, source=Venture Pool)
    INSERT INTO payment_vouchers (
        voucher_no, voucher_type, direction, status, amount,
        payee_name, payee_company_id,
        reference_type, reference_id,
        source_pool,
        description, payment_method, created_by
    ) VALUES (
        v_voucher_no, 'other', 'debit', 'pending_approval', p_principal,
        p_company_name, p_company_id,
        'loan', v_loan_id,
        'hv_operating_fund',
        'Loan disbursement to ' || p_company_name,
        'bank_transfer', v_caller_id
    )
    RETURNING id INTO v_voucher_id;

    -- (5) Voucher source row (hv_operating_fund = principal)
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
    VALUES (v_voucher_id, 'hv_operating_fund', p_principal);

    -- (6) Voucher approval_request (same group_id)
    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state, group_id
    ) VALUES (
        'payment_voucher', v_voucher_id, 'payment_vouchers',
        v_caller_id,
        v_voucher_no || ': Loan disbursement to ' || p_company_name,
        p_principal, 'pending', 'submitted', v_group_id
    );

    RETURN v_loan_id;
END;
$$;

COMMENT ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT) IS
    'Phase 7 Step 9: atomic create of loan + disbursement voucher + 2 approval_requests sharing group_id. Finance submits, Principal approves the group once.';

-- ─── 3) Extend cancel_loan_and_approval to also void the paired voucher ────
CREATE OR REPLACE FUNCTION cancel_loan_and_approval(
    p_loan_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_group_id UUID;
    v_voucher_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'cancel_loan_and_approval: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    -- Locate the loan's approval_request group
    SELECT group_id INTO v_group_id
    FROM approval_requests
    WHERE reference_id = p_loan_id
      AND reference_table = 'loans'
      AND request_type = 'new_loan'
      AND status = 'pending'
    LIMIT 1;

    -- Cancel the loan
    UPDATE loans
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_loan_id
      AND status = 'pending_approval';

    -- Reject the loan's approval_request
    UPDATE approval_requests
    SET status = 'rejected',
        workflow_state = 'rejected',
        approved_by = v_caller_id,
        approved_at = NOW(),
        notes = 'Cancelled by Finance'
    WHERE reference_id = p_loan_id
      AND reference_table = 'loans'
      AND status = 'pending';

    -- If group_id present, also void the paired voucher + its approval
    IF v_group_id IS NOT NULL THEN
        SELECT reference_id INTO v_voucher_id
        FROM approval_requests
        WHERE group_id = v_group_id
          AND request_type = 'payment_voucher'
        LIMIT 1;

        IF v_voucher_id IS NOT NULL THEN
            UPDATE payment_vouchers
            SET status = 'voided'
            WHERE id = v_voucher_id
              AND status = 'pending_approval';

            UPDATE approval_requests
            SET status = 'rejected',
                workflow_state = 'rejected',
                approved_by = v_caller_id,
                approved_at = NOW(),
                notes = 'Cancelled by Finance (paired with loan)'
            WHERE group_id = v_group_id
              AND request_type = 'payment_voucher'
              AND status = 'pending';
        END IF;
    END IF;
END;
$$;

COMMENT ON FUNCTION cancel_loan_and_approval(UUID) IS
    'Phase 7 Step 9: cancel loan + void paired voucher (via group_id). Finance self-serve cancel of pending loan.';

COMMIT;
