-- ============================================================================
-- 20260101000176_dept_payment_request_pv_reference_table.sql
-- Hotfix for migration 173: generate_pv_for_dept_request also missed the
-- NOT NULL reference_table column when creating the PV approval_request.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_pv_for_dept_request(
    p_request_id UUID,
    p_pay_from_account_id UUID,
    p_payment_method TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_request dept_payment_requests%ROWTYPE;
    v_voucher_no TEXT;
    v_pv_id UUID;
    v_dept_name TEXT;
    v_pool_key TEXT;
    v_pv_approval_id UUID;
BEGIN
    IF current_user_role() <> 'finance' THEN
        RAISE EXCEPTION 'Only finance can generate PV' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_request
      FROM dept_payment_requests
     WHERE id = p_request_id AND status = 'pending_finance_pv';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not pending Finance PV', p_request_id;
    END IF;

    SELECT name INTO v_dept_name FROM departments WHERE id = v_request.department_id;
    v_pool_key := 'dept_pool_' || lower(v_dept_name);

    SELECT 'HV-PV-' || to_char(NOW(), 'YYYYMM') || '-' ||
           lpad((COALESCE(MAX(
               (regexp_replace(voucher_no, '^HV-PV-\d{6}-', ''))::int
           ), 0) + 1)::text, 4, '0')
      INTO v_voucher_no
      FROM payment_vouchers
     WHERE voucher_no LIKE 'HV-PV-' || to_char(NOW(), 'YYYYMM') || '-%';

    INSERT INTO payment_vouchers (
        voucher_no, voucher_type, status, amount, currency,
        payee_name, payee_company_id, bank_account_id,
        reference_type, reference_id,
        description, payment_method, direction,
        source_pool, target_pool, created_by
    ) VALUES (
        v_voucher_no, 'expense', 'draft', v_request.amount, 'MYR',
        v_request.payee_name, v_request.payee_company_id, p_pay_from_account_id,
        'dept_payment_request', v_request.id,
        v_request.description, p_payment_method, 'debit',
        v_pool_key, NULL, v_user_id
    ) RETURNING id INTO v_pv_id;

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table, submitted_by, amount, description, status
    ) VALUES (
        'payment_voucher', v_pv_id, 'payment_vouchers', v_user_id, v_request.amount,
        format('%s · %s — %s', v_voucher_no, v_request.payee_name, v_request.description),
        'pending'
    ) RETURNING id INTO v_pv_approval_id;

    UPDATE dept_payment_requests
       SET status = 'pending_principal_pv',
           pay_from_account_id = p_pay_from_account_id,
           payment_method = p_payment_method,
           pv_id = v_pv_id
     WHERE id = p_request_id;

    RETURN v_pv_id;
END;
$$;
