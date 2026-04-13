-- ============================================================================
-- 20260101000063_remove_tier_system.sql
-- Remove the Tier system (T1/T2/T3/T4)
-- HOUZS Venture Portal (VP)
--
-- Tier premiums are no longer used for loan rate calculation.
-- Fund Out now uses a custom interest rate entered by Finance.
-- The tier_config table, companies.tier column, and company_tier enum
-- are all dead code. Historical audit log rows referencing tier_config
-- are preserved (informational).
-- ============================================================================

-- 1. Drop tier_config audit trigger
DROP TRIGGER IF EXISTS tier_config_audit ON tier_config;

-- 2. Drop tier_config table
DROP TABLE IF EXISTS tier_config;

-- 3. Remove tier column from companies
ALTER TABLE companies DROP COLUMN IF EXISTS tier;

-- 4. Drop company_tier enum type
DROP TYPE IF EXISTS company_tier;

-- 5. Update create_loan_with_approval to remove p_company_tier parameter
--    Must drop old signature first (PG identifies functions by name+args)
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
        'New loan to ' || p_company_name,
        p_principal, 'pending', 'submitted'
    );

    RETURN v_loan_id;
END;
$$;

COMMENT ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT) IS
    'Atomic loan + approval_request creation. SECURITY DEFINER bypasses RLS so Finance can insert both records. Tier parameter removed — custom rates used instead.';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT) TO authenticated;
