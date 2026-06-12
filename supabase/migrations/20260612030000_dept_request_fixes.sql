-- Dept payment request fixes (user 开工 2026-06-12, found while wiring the
-- no-double-debit rule; the module has zero live rows, so these are
-- pre-first-use repairs):
--
-- 1. Stage-3 was BROKEN end-to-end: generate_pv_for_dept_request wrote no
--    payment_voucher_sources row, so approve_single_voucher always raised
--    'no payment_voucher_sources rows'. The PV now gets one PVS row
--    (pool = dept pool key, acct 4050 — the PV clears the stage-1 AP accrual).
--    Also fixes the pool key for multi-word departments ('Director Office'
--    → dept_pool_director_office, not 'dept_pool_director office').
-- 2. GL routing: voucher_type='expense' sent dept-request PVs into the
--    per-segment expense branch → expense recognised a SECOND time (stage-1
--    already posted Dr dept-equity / Cr 4050). All three approve RPCs now
--    exclude dept_payment_request from that branch so they fall through to
--    the forced Dr 4050 (AP clearing) / Cr bank entry.
-- 3. New cancel_dept_payment_request RPC — the missing rollback: refunds the
--    stage-1 pool reservation (dept_pools 'void_in', bypasses sufficiency /
--    approval checks by design), posts the reversing accrual JE
--    (Dr 4050 / Cr dept-pool GL), voids a pending PV + its approval if one
--    exists, request → cancelled. Refuses if the PV is already paid.
-- 4. New dept_request_pv_rejected RPC — when Principal rejects the stage-3
--    PV, the request returns to 'pending_finance_pv' (pv_id cleared) so
--    Finance can regenerate or cancel; the pool reservation stays until an
--    explicit cancel.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

-- ── 2. Exclude dept_payment_request from the per-segment GL branch ──────────
DO $$
DECLARE
    fn_name TEXT;
    def TEXT;
BEGIN
    FOR fn_name IN SELECT unnest(ARRAY['approve_single_voucher','approve_voucher_batch','approve_voucher_batch_partial'])
    LOOP
        SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname=fn_name;
        IF def IS NULL THEN RAISE EXCEPTION '% not found', fn_name; END IF;
        IF position('ELSIF v_voucher.voucher_type IN (''payroll_bank_transfer'', ''internal_transfer'', ''expense'', ''claim_payout'') THEN' IN def) = 0 THEN
            RAISE EXCEPTION '%: per-segment ELSIF anchor missing', fn_name;
        END IF;
        def := replace(def,
            'ELSIF v_voucher.voucher_type IN (''payroll_bank_transfer'', ''internal_transfer'', ''expense'', ''claim_payout'') THEN',
            'ELSIF v_voucher.voucher_type IN (''payroll_bank_transfer'', ''internal_transfer'', ''expense'', ''claim_payout'') AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN');
        EXECUTE def;
        RAISE NOTICE 'patched %', fn_name;
    END LOOP;
END
$$;

-- ── 1. generate_pv_for_dept_request: PVS row + pool-key fix ──────────────────
CREATE OR REPLACE FUNCTION public.generate_pv_for_dept_request(p_request_id uuid, p_pay_from_account_id uuid, p_payment_method text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_pool_key := 'dept_pool_' || replace(lower(v_dept_name), ' ', '_');

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
        v_voucher_no, 'expense', 'pending_approval', v_request.amount, 'MYR',
        v_request.payee_name, v_request.payee_company_id, p_pay_from_account_id,
        'dept_payment_request', v_request.id,
        v_request.description, p_payment_method, 'debit',
        v_pool_key, NULL, v_user_id
    ) RETURNING id INTO v_pv_id;

    -- The PVS row approve_single_voucher requires (it raises on zero rows).
    -- acct 4050: the PV's GL clears the stage-1 AP accrual, not a new expense.
    -- Pool debit is SKIPPED at approval for dept_payment_request vouchers
    -- (reserved at stage-1), so this row is bookkeeping/audit only.
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
    VALUES (v_pv_id, v_pool_key, v_request.amount, '4050');

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
$function$;

-- ── 3. cancel_dept_payment_request: refund the stage-1 reservation ──────────
CREATE OR REPLACE FUNCTION public.cancel_dept_payment_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id   UUID := auth.uid();
    v_request   dept_payment_requests%ROWTYPE;
    v_dept_name TEXT;
    v_gl_code   VARCHAR(20);
    v_pv_status TEXT;
BEGIN
    IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'Only finance/principal can cancel a dept payment request'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_request
      FROM dept_payment_requests
     WHERE id = p_request_id AND status IN ('pending_finance_pv', 'pending_principal_pv')
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % is not cancellable (must be pending Finance PV or pending Principal PV)', p_request_id;
    END IF;

    IF v_request.pv_id IS NOT NULL THEN
        SELECT status INTO v_pv_status FROM payment_vouchers WHERE id = v_request.pv_id;
        IF v_pv_status = 'paid' THEN
            RAISE EXCEPTION 'cancel_dept_payment_request: PV already paid — reverse the voucher first';
        END IF;
        UPDATE payment_vouchers SET status='voided', notes=COALESCE(p_reason, 'Dept request cancelled')
         WHERE id = v_request.pv_id AND status IN ('draft', 'pending_approval');
        UPDATE approval_requests SET status='rejected', workflow_state='rejected',
               approved_by=v_user_id, approved_at=NOW(), notes=COALESCE(p_reason, 'Dept request cancelled')
         WHERE reference_id = v_request.pv_id AND reference_table='payment_vouchers' AND status='pending';
    END IF;

    -- Refund the stage-1 pool reservation. 'void_in' (mig 20260611010000)
    -- adds to balance, bypasses the sufficiency trigger and the
    -- expense_has_approval CHECK, and stays out of the monthly In/Out cards.
    INSERT INTO dept_pools (department_id, transaction_type, amount, period_month, description, created_by)
    VALUES (v_request.department_id, 'void_in', v_request.amount,
            date_trunc('month', NOW())::date,
            format('VOID dept request %s: refund reserved pool — %s', p_request_id, v_request.payee_name),
            v_user_id);

    -- Reverse the stage-1 accrual JE (Dr dept-pool GL / Cr 4050 → swapped).
    SELECT name INTO v_dept_name FROM departments WHERE id = v_request.department_id;
    v_gl_code := dept_pool_gl_code(v_dept_name);
    IF v_gl_code IS NULL THEN
        RAISE EXCEPTION 'cancel_dept_payment_request: department "%" has no dept pool GL code', v_dept_name;
    END IF;
    PERFORM post_journal_entry(
        CURRENT_DATE,
        format('Dept request cancelled: %s — %s', v_request.payee_name, COALESCE(p_reason, v_request.description)),
        'dept_expense_request_void',
        v_request.id,
        v_user_id,
        jsonb_build_array(
            jsonb_build_object('account_code', '4050',  'debit',  v_request.amount,
                               'description', format('AP accrual reversed — %s', v_request.payee_name)),
            jsonb_build_object('account_code', v_gl_code, 'credit', v_request.amount,
                               'description', format('%s Pool reservation released', v_dept_name))
        )
    );

    UPDATE dept_payment_requests SET status='cancelled' WHERE id = p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_dept_payment_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_dept_payment_request(uuid, text) TO authenticated;

-- ── 4. dept_request_pv_rejected: PV rejection returns the request to Finance ─
CREATE OR REPLACE FUNCTION public.dept_request_pv_rejected(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE dept_payment_requests
       SET status = 'pending_finance_pv', pv_id = NULL
     WHERE pv_id = p_voucher_id AND status = 'pending_principal_pv';
END;
$function$;

REVOKE ALL ON FUNCTION public.dept_request_pv_rejected(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dept_request_pv_rejected(uuid) TO authenticated;
