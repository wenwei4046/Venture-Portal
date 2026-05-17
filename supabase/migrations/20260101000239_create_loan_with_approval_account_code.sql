-- 20260101000239_create_loan_with_approval_account_code.sql
--
-- Chain: mig 222 introduced the 9-arg create_loan_with_approval RPC that
-- inserts a payment_vouchers + payment_voucher_sources pair on loan
-- submission. mig 238 then renamed payment_voucher_sources.category_code →
-- account_code AND added NOT NULL + FK to chart_of_accounts(code). Result:
-- the RPC from mig 222 INSERTs into payment_voucher_sources with no
-- account_code, so it now fails on NOT NULL after mig 238 lands.
--
-- The app-level workaround in fund-out/actions.ts (post-RPC UPDATE on the
-- PVS row) can't help — the RPC fails BEFORE returning. So we add a tenth
-- parameter p_disbursement_account_code TEXT (NOT NULL — the action already
-- validates server-side) and include it on the payment_voucher_sources
-- INSERT.
--
-- This migration REPLACES (drop + recreate) create_loan_with_approval to
-- the new 10-arg signature. The 9-arg form is dropped to avoid accidental
-- callers landing on the old broken version.

BEGIN;

DROP FUNCTION IF EXISTS create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE
);

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_tenure_months INTEGER,
    p_repayment_terms TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT '',
    p_disbursement_date DATE DEFAULT NULL,
    p_disbursement_account_code TEXT DEFAULT NULL
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
    IF p_disbursement_account_code IS NULL OR length(trim(p_disbursement_account_code)) = 0 THEN
        RAISE EXCEPTION 'Disbursement account code is required';
    END IF;
    -- Validate account exists, is active, and is BS-classified (asset /
    -- fixed_asset / liability / equity in the unified COA). Mirrors the
    -- server-side validateDisbursementAccount check; defense in depth so a
    -- malformed RPC call can't leak loan principal into P&L.
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE code = p_disbursement_account_code
        AND is_active = true
        AND type IN ('asset', 'fixed_asset', 'liability', 'equity')
    ) THEN
        RAISE EXCEPTION 'Disbursement account % is unknown, inactive, or not a Balance Sheet account',
          p_disbursement_account_code;
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

    -- (5) Voucher source row (venture_pool = principal, BS account)
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
    VALUES (v_voucher_id, 'venture_pool', p_principal, p_disbursement_account_code);

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

COMMENT ON FUNCTION create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE, TEXT
) IS
    'Mig 222 + 238 + 239 chain: 10-arg version that also accepts the BS '
    'account code for the auto-created disbursement PV source row '
    '(account_code became NOT NULL in mig 238).';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE, TEXT
) TO authenticated;

COMMIT;
