-- ============================================================================
-- principal_full_access
-- Unified portal (2026-07-16): Principal operates every module from one login.
-- Write parity with Finance / HR / Dept Manager everywhere.
--
-- Layer 1 — RLS: add 'principal' to write policies that listed only
--   finance / hr / dept_manager. Tables already covered by a *_principal_all
--   policy (payroll_runs, payroll_payment_requests, dept_payment_requests,
--   invoice_submission_requests, hr_monthly_payroll, hr_import_templates,
--   commission_rules) are untouched. Hard blocks (USING (false)) untouched.
-- Layer 2 — SECURITY DEFINER RPCs whose internal role check rejected
--   principal: create_loan_with_approval, generate_invoices_from_request,
--   generate_pv_for_dept_request, reject_invoice_request, request_loan_cancel.
-- ============================================================================

-- ── approval_requests: principal may submit own requests (self-approve stays
--    allowed — Principal is the owner; the queue remains the audit trail) ────
ALTER POLICY approvals_submit ON approval_requests
  WITH CHECK (
    current_user_role() IN ('finance', 'hr', 'dept_manager', 'principal')
    AND submitted_by = auth.uid()
  );

-- ── Treasury ────────────────────────────────────────────────────────────────
ALTER POLICY fund_sources_finance_insert ON fund_sources
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY fund_sources_finance_update ON fund_sources
  USING (current_user_role() IN ('finance', 'principal'));
ALTER POLICY loans_finance_insert ON loans
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY repayments_finance_insert ON repayments
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY overdue_finance_insert ON overdue_records
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY overdue_finance_update ON overdue_records
  USING (current_user_role() IN ('finance', 'principal'));
ALTER POLICY base_rate_finance_insert ON base_rate_history
  WITH CHECK (current_user_role() IN ('finance', 'principal'));

-- ── Monthly statements ──────────────────────────────────────────────────────
ALTER POLICY statements_finance_insert ON monthly_statements
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY statements_finance_update ON monthly_statements
  USING (current_user_role() IN ('finance', 'principal'));
ALTER POLICY statement_lines_finance_insert ON monthly_statement_lines
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY statement_lines_delete_cascade ON monthly_statement_lines
  USING (
    current_user_role() IN ('finance', 'principal')
    AND EXISTS (
      SELECT 1 FROM monthly_statements
      WHERE id = monthly_statement_lines.statement_id
        AND status = 'draft'
    )
  );

-- ── Billing ─────────────────────────────────────────────────────────────────
ALTER POLICY service_contracts_insert ON service_contracts
  WITH CHECK (
    current_user_role() IN ('finance', 'principal')
    OR (
      current_user_role() = 'dept_manager'
      AND department_id = current_user_department_id()
    )
  );
ALTER POLICY service_contracts_finance_update ON service_contracts
  USING (current_user_role() IN ('finance', 'principal'));
ALTER POLICY invoices_finance_insert ON invoices
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY invoices_finance_update ON invoices
  USING (current_user_role() IN ('finance', 'principal'));
ALTER POLICY invoices_finance_delete_draft ON invoices
  USING (current_user_role() IN ('finance', 'principal') AND status = 'draft');
ALTER POLICY invoice_lines_finance_insert ON invoice_lines
  WITH CHECK (current_user_role() IN ('finance', 'principal'));
ALTER POLICY invoice_lines_finance_update_draft ON invoice_lines
  USING (
    current_user_role() IN ('finance', 'principal')
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.status = 'draft'
    )
  );
ALTER POLICY invoice_lines_finance_delete_draft ON invoice_lines
  USING (
    current_user_role() IN ('finance', 'principal')
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.status = 'draft'
    )
  );

-- ── HR ──────────────────────────────────────────────────────────────────────
ALTER POLICY hr_cost_sub_hr_insert ON hr_cost_submissions
  WITH CHECK (
    current_user_role() IN ('hr', 'principal')
    AND submitted_by = auth.uid()
  );
ALTER POLICY hr_pool_alloc_hr_write ON hr_pool_allocation
  WITH CHECK (current_user_role() IN ('hr', 'principal'));
ALTER POLICY hr_pool_alloc_hr_update ON hr_pool_allocation
  USING (current_user_role() IN ('hr', 'principal'));
ALTER POLICY hr_staff_alloc_hr_write ON hr_staff_allocation
  WITH CHECK (current_user_role() IN ('hr', 'principal'));
ALTER POLICY hr_staff_alloc_hr_update ON hr_staff_allocation
  USING (current_user_role() IN ('hr', 'principal'));
ALTER POLICY hr_staff_alloc_hr_delete ON hr_staff_allocation
  USING (current_user_role() IN ('hr', 'principal'));
ALTER POLICY director_ctc_hr_delete ON director_ctc
  USING (current_user_role() IN ('hr', 'principal'));
ALTER POLICY commission_inputs_hr_all ON commission_inputs
  USING (current_user_role() IN ('hr', 'principal'))
  WITH CHECK (current_user_role() IN ('hr', 'principal'));

-- ── Pools ───────────────────────────────────────────────────────────────────
ALTER POLICY invoice_pool_hr_insert ON invoice_payout_pool
  WITH CHECK (
    current_user_role() IN ('hr', 'finance', 'principal')
    AND transaction_type = 'accumulate'
  );
ALTER POLICY hv_fund_finance_insert ON venture_pool
  WITH CHECK (current_user_role() IN ('finance', 'hr', 'principal'));

-- ============================================================================
-- Layer 2 — RPC role checks
-- ============================================================================

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
    IF p_tenure_months IS NULL OR p_tenure_months < 1 OR p_tenure_months > 12 THEN RAISE EXCEPTION 'Tenure must be between 1 and 12 months'; END IF;
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

CREATE OR REPLACE FUNCTION public.generate_invoices_from_request(p_request_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF current_user_role() NOT IN ('finance', 'principal') THEN
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
$function$;

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
    IF current_user_role() NOT IN ('finance', 'principal') THEN
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

CREATE OR REPLACE FUNCTION public.reject_invoice_request(p_request_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'Only finance can reject' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'rejection reason is required';
    END IF;

    UPDATE invoice_submission_requests
       SET status = 'rejected',
           rejection_reason = trim(p_reason),
           rejected_by = auth.uid(),
           rejected_at = NOW()
     WHERE id = p_request_id AND status = 'pending';
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_loan_cancel(p_loan_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_loan_amount NUMERIC;
    v_loan_status loan_status;
    v_repayment_count INT;
    v_request_id UUID;
    v_existing_request UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'request_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    SELECT principal, status INTO v_loan_amount, v_loan_status
    FROM loans WHERE id = p_loan_id;

    IF v_loan_status IS NULL THEN
        RAISE EXCEPTION 'Loan % not found', p_loan_id;
    END IF;
    IF v_loan_status <> 'active' THEN
        RAISE EXCEPTION 'Loan must be active to request cancellation. Current status: %', v_loan_status;
    END IF;

    SELECT count(*) INTO v_repayment_count
    FROM repayments WHERE loan_id = p_loan_id;
    IF v_repayment_count > 0 THEN
        RAISE EXCEPTION 'Cannot cancel loan with % repayment(s). Reverse repayments first.', v_repayment_count;
    END IF;

    SELECT id INTO v_existing_request
    FROM approval_requests
    WHERE reference_id = p_loan_id
      AND reference_table = 'loans'
      AND request_type = 'loan_cancel'
      AND status = 'pending'
    LIMIT 1;
    IF v_existing_request IS NOT NULL THEN
        RETURN v_existing_request;
    END IF;

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state
    ) VALUES (
        'loan_cancel', p_loan_id, 'loans',
        v_caller_id,
        COALESCE(p_reason, 'Cancel active loan and reverse disbursement'),
        v_loan_amount, 'pending', 'submitted'
    )
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END;
$function$;
