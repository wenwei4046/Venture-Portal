-- ============================================================================
-- 20260101000222_loan_start_date_input.sql
-- Item 1: let Finance pick a "loan start date" at creation time.
--
-- Today the loan's disbursement_date is auto-set to CURRENT_DATE when Principal
-- approves. Users want to record a contractual start date (often back-dated by
-- a few days, sometimes future-dated) at submission time and have it survive
-- approval untouched.
--
-- Approach (smallest viable):
--   (1) Extend create_loan_with_approval with a 9th optional param
--       p_disbursement_date DATE. RPC inserts it into loans.disbursement_date
--       at creation. NULL still allowed for callers that don't supply it.
--   (2) BEFORE UPDATE trigger on loans: if status flips pending_approval ->
--       active and disbursement_date is still NULL, default it to CURRENT_DATE.
--       This is the safety net for any code path that forgets to plumb a date
--       in (legacy callers, future approval flows).
--
-- App-side change (separate diff): approveRequest / approveRequestGroup stop
-- writing disbursement_date in their UPDATE payloads. Trigger handles the
-- legacy NULL-fallback.
-- ============================================================================

BEGIN;

-- (1) Trigger: NULL-fallback when activating
CREATE OR REPLACE FUNCTION loans_default_disbursement_on_activate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'active'
       AND OLD.status = 'pending_approval'
       AND NEW.disbursement_date IS NULL THEN
        NEW.disbursement_date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loans_default_disbursement_on_activate ON loans;
CREATE TRIGGER loans_default_disbursement_on_activate
BEFORE UPDATE OF status ON loans
FOR EACH ROW
EXECUTE FUNCTION loans_default_disbursement_on_activate();

COMMENT ON FUNCTION loans_default_disbursement_on_activate IS
    'Item 1: only sets disbursement_date when status flips to active and field is still NULL. Preserves Finance-chosen start date.';

-- (2) Drop 8-arg RPC, install 9-arg with optional p_disbursement_date.
DROP FUNCTION IF EXISTS create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_tenure_months INTEGER,
    p_repayment_terms TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT '',
    p_disbursement_date DATE DEFAULT NULL
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
        tenure_months, repayment_terms, status, created_by, disbursement_date
    ) VALUES (
        p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
        p_tenure_months, p_repayment_terms, 'pending_approval', v_caller_id, p_disbursement_date
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
        'venture_pool',
        'Loan disbursement to ' || p_company_name,
        'bank_transfer', v_caller_id
    )
    RETURNING id INTO v_voucher_id;

    -- (5) Voucher source row (venture_pool = principal)
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
    VALUES (v_voucher_id, 'venture_pool', p_principal);

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

COMMENT ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE) IS
    'Item 1: same as mig 117/156 + optional p_disbursement_date for Finance-chosen loan start date.';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE) TO authenticated;

COMMIT;
