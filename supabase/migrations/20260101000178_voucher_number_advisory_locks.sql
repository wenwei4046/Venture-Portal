-- ============================================================================
-- 20260101000178_voucher_number_advisory_locks.sql
-- Fix for the voucher_no / invoice_no race surfaced by /review on 2026-04-19.
--
-- Both RPCs minted their next number with SELECT MAX(...) + 1, which is the
-- classic lost-update pattern: two concurrent callers read the same MAX, both
-- INSERT with the same voucher_no, the unique constraint rejects the second
-- (and, worse, generate_invoices_from_request fails mid-loop leaving a
-- partial batch).
--
-- Fix: pg_advisory_xact_lock() keyed by voucher namespace, held until the
-- transaction ends. Serialises number-minting within a transaction without
-- blocking unrelated writes. Cheaper than a real sequence migration and
-- survives rollback naturally.
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

    -- Serialise voucher_no minting for the duration of this transaction.
    -- hashtext('hv_voucher_no') keys the lock to the PV namespace so invoice
    -- minting doesn't block PV minting.
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));

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

CREATE OR REPLACE FUNCTION generate_invoices_from_request(p_request_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_request invoice_submission_requests%ROWTYPE;
    v_item JSONB;
    v_subsidiary_id UUID;
    v_amount DECIMAL(15, 2);
    v_invoice_no TEXT;
    v_invoice_id UUID;
    v_generated UUID[] := ARRAY[]::UUID[];
BEGIN
    IF current_user_role() <> 'finance' THEN
        RAISE EXCEPTION 'Only finance can generate invoices' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_request
      FROM invoice_submission_requests
     WHERE id = p_request_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not pending', p_request_id;
    END IF;

    -- One advisory lock for the whole batch so every line item in this request
    -- mints sequentially AND concurrent requests don't collide mid-loop.
    -- Different namespace from PV (invoice vs voucher).
    PERFORM pg_advisory_xact_lock(hashtext('hv_invoice_no'));

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.line_items)
    LOOP
        v_subsidiary_id := (v_item->>'subsidiary_id')::uuid;
        v_amount := (v_item->>'amount')::decimal;
        IF v_subsidiary_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'invalid line item: %', v_item;
        END IF;

        SELECT 'HV-INV-' || to_char(NOW(), 'YYYYMM') || '-' ||
               lpad((COALESCE(MAX(
                   (regexp_replace(invoice_no, '^HV-INV-\d{6}-', ''))::int
               ), 0) + 1)::text, 4, '0')
          INTO v_invoice_no
          FROM invoices
         WHERE invoice_no LIKE 'HV-INV-' || to_char(NOW(), 'YYYYMM') || '-%';

        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, sst_rate, sst_amount,
            invoice_date, due_date, description, reference_no, created_by
        ) VALUES (
            v_invoice_no, v_subsidiary_id, v_request.period_month, 'marketing_project',
            v_amount, v_amount, 'draft', 0, 0,
            v_request.invoice_date, v_request.due_date,
            v_request.description, v_request.reference_no, v_user_id
        ) RETURNING id INTO v_invoice_id;

        v_generated := array_append(v_generated, v_invoice_id);
    END LOOP;

    UPDATE invoice_submission_requests
       SET status = 'generated',
           generated_invoice_ids = v_generated,
           generated_by = v_user_id,
           generated_at = NOW()
     WHERE id = p_request_id;

    RETURN v_generated;
END;
$$;
