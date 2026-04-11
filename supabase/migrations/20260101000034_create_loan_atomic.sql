-- ============================================================================
-- 20260101000034_create_loan_atomic.sql
-- M1 Fix: Atomic create_loan_with_approval SECURITY DEFINER RPC
-- HOUZS Venture Portal (VP)
--
-- Previously createLoan in fund-out/actions.ts did 2 separate INSERTs:
-- one for loans, one for approval_requests. If step 2 failed, we'd get
-- an orphan loan in pending_approval that Finance cannot self-heal.
--
-- This RPC wraps both inserts in a single transaction. The Server Action
-- now calls supabase.rpc('create_loan_with_approval', {...}).
-- ============================================================================

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_repayment_terms TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT '',
    p_company_tier TEXT DEFAULT ''
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
BEGIN
    -- Auth guard: finance only
    v_role := current_user_role();
    IF v_role <> 'finance' THEN
        RAISE EXCEPTION 'create_loan_with_approval: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();

    -- Validate inputs
    IF p_principal <= 0 THEN
        RAISE EXCEPTION 'Principal must be greater than 0';
    END IF;
    IF p_principal > 100000000 THEN
        RAISE EXCEPTION 'Principal exceeds RM 100M ceiling';
    END IF;

    -- INSERT loan (pending_approval)
    INSERT INTO loans (
        company_id, principal, base_rate, risk_premium, effective_rate,
        repayment_terms, status, created_by
    ) VALUES (
        p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
        p_repayment_terms, 'pending_approval', v_caller_id
    )
    RETURNING id INTO v_loan_id;

    -- INSERT approval request (atomic — same transaction as loan)
    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state
    ) VALUES (
        'new_loan', v_loan_id, 'loans',
        v_caller_id,
        'New loan to ' || p_company_name || ' (' || p_company_tier || ')',
        p_principal, 'pending', 'submitted'
    );

    RETURN v_loan_id;
END;
$$;

COMMENT ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT) IS
    'M1 fix: atomic loan + approval_request creation in a single transaction. Replaces the two separate INSERTs in fund-out/actions.ts. SECURITY DEFINER bypasses RLS so Finance can insert both records.';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT) TO authenticated;
