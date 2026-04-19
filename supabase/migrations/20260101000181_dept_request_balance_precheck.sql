-- ============================================================================
-- 20260101000181_dept_request_balance_precheck.sql
-- P0-3: hard-block dept payment request when dept pool balance < amount.
-- HOUZS Venture Portal
--
-- Dept Manager complaint: submit a RM5K expense against a RM0 pool, Principal
-- rejects, Manager gets no early feedback. Now the RPC fails fast with a
-- clear balance message before the row is even inserted.
--
-- Dept pool balance comes from dept_pool_balances (view aggregating np_in -
-- expense_out). We also subtract any in-flight requests in stages that have
-- already reserved money (pending_principal_expense → pending_principal_pv),
-- so a manager can't burn the same RM5K twice by submitting two requests.
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
    v_balance DECIMAL(15, 2);
    v_inflight DECIMAL(15, 2);
    v_available DECIMAL(15, 2);
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

    -- P0-3: hard-block when balance (minus in-flight requests) is short.
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM dept_pool_balances
     WHERE department_id = v_dept_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_inflight
      FROM dept_payment_requests
     WHERE department_id = v_dept_id
       AND status IN ('pending_principal_expense');

    v_available := COALESCE(v_balance, 0) - COALESCE(v_inflight, 0);

    IF v_available < p_amount THEN
        RAISE EXCEPTION
            'Pool balance too low. Available RM % (balance RM % minus RM % already awaiting Principal) but request is RM %.',
            to_char(v_available, 'FM999,999,990.00'),
            to_char(COALESCE(v_balance, 0), 'FM999,999,990.00'),
            to_char(COALESCE(v_inflight, 0), 'FM999,999,990.00'),
            to_char(p_amount, 'FM999,999,990.00');
    END IF;

    INSERT INTO dept_payment_requests (
        department_id, requested_by, payee_company_id, payee_name,
        amount, description, category_code, status
    ) VALUES (
        v_dept_id, v_user_id, p_payee_company_id, trim(p_payee_name),
        p_amount, trim(p_description), p_category_code, 'pending_principal_expense'
    ) RETURNING id INTO v_request_id;

    INSERT INTO approval_requests (
        request_type, reference_id, submitted_by, amount, description, status
    ) VALUES (
        'dept_payment_request', v_request_id, v_user_id, p_amount,
        format('%s — %s', trim(p_payee_name), trim(p_description)), 'pending'
    ) RETURNING id INTO v_approval_id;

    UPDATE dept_payment_requests
       SET expense_approval_id = v_approval_id
     WHERE id = v_request_id;

    RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION submit_dept_payment_request IS
    'P0-3 (2026-04-19): dept_manager submits a Request Payment. Now validates pool balance (from dept_pool_balances view) minus in-flight pending requests before accepting. Fails fast with a human-readable balance message. Prevents over-commit against the same pool balance.';

GRANT EXECUTE ON FUNCTION submit_dept_payment_request(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated;
