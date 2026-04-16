-- ============================================================================
-- 20260101000117_loan_tenure_months.sql
-- Add loan tenure (in months, 1..12) + update create_loan_with_approval RPC.
--
-- Tenure is informational + used to compute maturity date on the loan detail
-- page (disbursement_date + tenure_months). No auto-close / overdue logic is
-- wired in this migration — lifecycle stays manual.
--
-- Existing rows (none expected post-wipe but defensive) are backfilled to 12
-- so we can enforce NOT NULL without data loss.
-- ============================================================================

BEGIN;

-- (1) Column + constraint
ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS tenure_months INTEGER;

UPDATE loans SET tenure_months = 12 WHERE tenure_months IS NULL;

ALTER TABLE loans
    ALTER COLUMN tenure_months SET NOT NULL;

ALTER TABLE loans
    DROP CONSTRAINT IF EXISTS tenure_months_range;
ALTER TABLE loans
    ADD CONSTRAINT tenure_months_range
        CHECK (tenure_months BETWEEN 1 AND 12);

COMMENT ON COLUMN loans.tenure_months IS
    'Loan tenure in months (1..12). Used to compute maturity date. Informational only.';

-- (2) Drop old 7-arg RPC, reinstall 8-arg with p_tenure_months
DROP FUNCTION IF EXISTS create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_tenure_months INTEGER,
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
    IF p_tenure_months IS NULL OR p_tenure_months < 1 OR p_tenure_months > 12 THEN
        RAISE EXCEPTION 'Tenure must be between 1 and 12 months';
    END IF;

    v_group_id := gen_random_uuid();
    v_description := 'New loan to ' || p_company_name;

    -- (1) Loan
    INSERT INTO loans (
        company_id, principal, base_rate, risk_premium, effective_rate,
        tenure_months, repayment_terms, status, created_by
    ) VALUES (
        p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
        p_tenure_months, p_repayment_terms, 'pending_approval', v_caller_id
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

COMMENT ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT) IS
    'Phase 7 Step 17: atomic create of loan + disbursement voucher + 2 approval_requests. Now with tenure_months (1..12).';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT) TO authenticated;

COMMIT;
