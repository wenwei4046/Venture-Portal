-- ============================================================================
-- 20260101000175_dept_payment_request_fix_reference_table.sql
-- Hotfix for migration 173: submit_dept_payment_request omitted the NOT NULL
-- reference_table column when inserting into approval_requests.
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_dept_payment_request(
    p_payee_company_id UUID,
    p_payee_name TEXT,
    p_amount DECIMAL,
    p_description TEXT,
    p_category_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_dept_id UUID := current_user_department_id();
    v_request_id UUID;
    v_approval_id UUID;
BEGIN
    IF current_user_role() <> 'dept_manager' THEN
        RAISE EXCEPTION 'Only dept_manager can submit dept payment requests'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_dept_id IS NULL THEN
        RAISE EXCEPTION 'dept_manager must have a department_id';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive';
    END IF;
    IF p_payee_name IS NULL OR length(trim(p_payee_name)) = 0 THEN
        RAISE EXCEPTION 'payee_name is required';
    END IF;
    IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
        RAISE EXCEPTION 'description is required';
    END IF;

    INSERT INTO dept_payment_requests (
        department_id, requested_by, payee_company_id, payee_name,
        amount, description, category_code, status
    ) VALUES (
        v_dept_id, v_user_id, p_payee_company_id, trim(p_payee_name),
        p_amount, trim(p_description), p_category_code, 'pending_principal_expense'
    ) RETURNING id INTO v_request_id;

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table, submitted_by, amount, description, status
    ) VALUES (
        'dept_payment_request', v_request_id, 'dept_payment_requests', v_user_id, p_amount,
        format('%s — %s', trim(p_payee_name), trim(p_description)), 'pending'
    ) RETURNING id INTO v_approval_id;

    UPDATE dept_payment_requests
       SET expense_approval_id = v_approval_id
     WHERE id = v_request_id;

    RETURN v_request_id;
END;
$$;
