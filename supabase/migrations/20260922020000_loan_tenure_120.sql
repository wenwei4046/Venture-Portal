-- Loan repayment period up to 120 months (2026-09-22).
-- The loans table CHECK already allows 1..120 (tenure_months_range); only the
-- create RPC and the New loan form still stopped at 12, a leftover from when
-- tenure was informational. User: "fund out 最多期数别定死 最多12个月" — same
-- ceiling as fund sources (lock_in_months 1..120). Body otherwise identical
-- to 20260716092818_principal_full_access.sql.
CREATE OR REPLACE FUNCTION public.create_loan_with_approval(p_company_id uuid, p_principal numeric, p_base_rate numeric, p_risk_premium numeric, p_effective_rate numeric, p_tenure_months integer, p_repayment_terms text DEFAULT NULL::text, p_company_name text DEFAULT ''::text, p_disbursement_date date DEFAULT NULL::date, p_disbursement_account_code text DEFAULT NULL::text, p_bank_account_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role; v_caller_id UUID; v_loan_id UUID; v_voucher_id UUID;
    v_group_id UUID; v_voucher_no VARCHAR(30); v_period TEXT; v_seq INTEGER;
    v_description TEXT; v_bank_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'create_loan_with_approval: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege'; END IF;
    v_caller_id := auth.uid();
    IF p_principal <= 0 THEN RAISE EXCEPTION 'Principal must be greater than 0'; END IF;
    IF p_principal > 100000000 THEN RAISE EXCEPTION 'Principal exceeds RM 100M ceiling'; END IF;
    IF p_tenure_months IS NULL OR p_tenure_months < 1 OR p_tenure_months > 120 THEN RAISE EXCEPTION 'Repayment period must be between 1 and 120 months'; END IF;
    IF p_disbursement_account_code IS NULL OR length(trim(p_disbursement_account_code)) = 0 THEN RAISE EXCEPTION 'Disbursement account code is required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = p_disbursement_account_code AND is_active = true AND type IN ('asset', 'fixed_asset', 'liability', 'equity')) THEN
        RAISE EXCEPTION 'Disbursement account % is unknown, inactive, or not a Balance Sheet account', p_disbursement_account_code;
    END IF;
    IF p_bank_account_id IS NOT NULL THEN
        SELECT id INTO v_bank_id FROM bank_accounts WHERE id = p_bank_account_id AND status = 'active';
        IF v_bank_id IS NULL THEN RAISE EXCEPTION 'create_loan_with_approval: bank account % not found or inactive', p_bank_account_id; END IF;
    ELSE
        SELECT id INTO v_bank_id FROM bank_accounts WHERE is_primary = true AND status = 'active' LIMIT 1;
    END IF;
    IF v_bank_id IS NULL THEN RAISE EXCEPTION 'create_loan_with_approval: no primary active bank account found'; END IF;
    v_group_id := gen_random_uuid();
    v_description := 'New loan to ' || p_company_name;
    INSERT INTO loans (company_id, principal, base_rate, risk_premium, effective_rate, tenure_months, repayment_terms, status, created_by, disbursement_date)
    VALUES (p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate, p_tenure_months, p_repayment_terms, 'pending_approval', v_caller_id, p_disbursement_date)
    RETURNING id INTO v_loan_id;
    INSERT INTO approval_requests (request_type, reference_id, reference_table, submitted_by, description, amount, status, workflow_state, group_id)
    VALUES ('new_loan', v_loan_id, 'loans', v_caller_id, v_description, p_principal, 'pending', 'submitted', v_group_id);
    v_period := to_char(now(), 'YYYYMM');
    SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
    v_voucher_no := 'HV-PV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');
    INSERT INTO payment_vouchers (voucher_no, voucher_type, direction, status, amount, payee_name, payee_company_id, reference_type, reference_id, source_pool, bank_account_id, description, payment_method, created_by)
    VALUES (v_voucher_no, 'other', 'debit', 'pending_approval', p_principal, p_company_name, p_company_id, 'loan', v_loan_id, 'venture_pool', v_bank_id, 'Loan disbursement to ' || p_company_name, 'bank_transfer', v_caller_id)
    RETURNING id INTO v_voucher_id;
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code) VALUES (v_voucher_id, 'venture_pool', p_principal, p_disbursement_account_code);
    INSERT INTO approval_requests (request_type, reference_id, reference_table, submitted_by, description, amount, status, workflow_state, group_id)
    VALUES ('payment_voucher', v_voucher_id, 'payment_vouchers', v_caller_id, v_voucher_no || ': Loan disbursement to ' || p_company_name, p_principal, 'pending', 'submitted', v_group_id);
    RETURN v_loan_id;
END; $function$;
