-- ============================================================================
-- 20260101000173_dept_payment_requests.sql
-- PR #4 (Marketing portal redesign) — dept_manager Request Payment workflow.
--
-- Mirrors payroll_payment_requests but for dept-initiated vendor payments.
-- 4-stage flow:
--   Stage 1  Marketing dept_manager submits Request Payment
--            INSERT row + approval_request(type='dept_payment_request')
--            status='pending_principal_expense'
--   Stage 2  Principal approves the expense (the dept_payment_request approval)
--            trigger debits dept pool + flips status='pending_finance_pv'
--   Stage 3  Finance "generates PV" — picks bank / method, creates PV draft
--            status='pending_principal_pv', pv_id linked
--   Stage 4  Principal approves the PV via existing /approvals flow
--            existing voucher-paid trigger flips status='completed' + cash out
-- ============================================================================

CREATE TYPE dept_payment_request_status AS ENUM (
    'pending_principal_expense',  -- Marketing submitted, Principal #1 to approve
    'rejected_expense',           -- Principal #1 rejected
    'pending_finance_pv',         -- Pool debited, Finance to generate PV
    'pending_principal_pv',       -- PV created, Principal #2 to approve
    'completed',                  -- PV approved + executed (cash out)
    'cancelled'                   -- Marketing cancelled before Stage 2
);

CREATE TABLE dept_payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    payee_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    payee_name TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    category_code TEXT,

    -- Finance fills these at Stage 3.
    pay_from_account_id UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    payment_method TEXT,

    status dept_payment_request_status NOT NULL DEFAULT 'pending_principal_expense',

    -- Approval row for the expense (Principal #1). Set on INSERT.
    expense_approval_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,

    -- Dept pool debit row (set on Principal #1 approval).
    dept_pool_id UUID REFERENCES dept_pools(id) ON DELETE SET NULL,

    -- Generated PV (set on Stage 3).
    pv_id UUID REFERENCES payment_vouchers(id) ON DELETE SET NULL,

    notes TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dpr_dept_status ON dept_payment_requests (department_id, status);
CREATE INDEX idx_dpr_status ON dept_payment_requests (status);
CREATE INDEX idx_dpr_requested_by ON dept_payment_requests (requested_by);

CREATE OR REPLACE FUNCTION touch_dept_payment_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_dpr_touch_updated_at
    BEFORE UPDATE ON dept_payment_requests
    FOR EACH ROW EXECUTE FUNCTION touch_dept_payment_requests_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE dept_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY dpr_principal_all
    ON dept_payment_requests FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY dpr_finance_select
    ON dept_payment_requests FOR SELECT
    USING (current_user_role() = 'finance');

CREATE POLICY dpr_finance_update
    ON dept_payment_requests FOR UPDATE
    USING (current_user_role() = 'finance')
    WITH CHECK (current_user_role() = 'finance');

CREATE POLICY dpr_dept_manager_select_own
    ON dept_payment_requests FOR SELECT
    USING (current_user_role() = 'dept_manager'
        AND department_id = current_user_department_id());

-- ─── RPC: submit_dept_payment_request (Stage 1) ──────────────────────────────

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

GRANT EXECUTE ON FUNCTION submit_dept_payment_request(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated;

-- ─── RPC: approve_dept_payment_expense (Stage 2 side-effect) ─────────────────
-- Called from approveRequest server action when request_type='dept_payment_request'.
-- Debits dept pool + flips request status to pending_finance_pv.

CREATE OR REPLACE FUNCTION approve_dept_payment_expense(p_approval_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request dept_payment_requests%ROWTYPE;
    v_pool_id UUID;
BEGIN
    IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'Only principal can approve' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT dpr.* INTO v_request
      FROM dept_payment_requests dpr
     WHERE dpr.expense_approval_id = p_approval_id
       AND dpr.status = 'pending_principal_expense';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending dept_payment_request linked to approval %', p_approval_id;
    END IF;

    -- Debit dept pool (period_month = the calendar month of the request)
    INSERT INTO dept_pools (
        department_id, transaction_type, amount, period_month,
        description, approval_id
    ) VALUES (
        v_request.department_id, 'expense_out', v_request.amount,
        date_trunc('month', NOW())::date,
        format('Request Payment to %s — %s', v_request.payee_name, v_request.description),
        p_approval_id
    ) RETURNING id INTO v_pool_id;

    UPDATE dept_payment_requests
       SET status = 'pending_finance_pv',
           dept_pool_id = v_pool_id
     WHERE id = v_request.id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_dept_payment_expense(UUID) TO authenticated;

-- Reject side-effect: just flip the dept_payment_request to rejected_expense.

CREATE OR REPLACE FUNCTION reject_dept_payment_request(p_approval_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'Only principal can reject' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE dept_payment_requests
       SET status = 'rejected_expense'
     WHERE expense_approval_id = p_approval_id
       AND status = 'pending_principal_expense';
END;
$$;

GRANT EXECUTE ON FUNCTION reject_dept_payment_request(UUID) TO authenticated;

-- ─── RPC: generate_pv_for_dept_request (Stage 3) ─────────────────────────────

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

    -- Generate voucher_no in same format as the existing payment_vouchers
    -- sequencing (HV-PV-YYYYMM-NNNN). Use a serial slot per month.
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
        request_type, reference_id, submitted_by, amount, description, status
    ) VALUES (
        'payment_voucher', v_pv_id, v_user_id, v_request.amount,
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

GRANT EXECUTE ON FUNCTION generate_pv_for_dept_request(UUID, UUID, TEXT) TO authenticated;

-- ─── Trigger: complete dept_payment_request when its PV is paid ──────────────

CREATE OR REPLACE FUNCTION complete_dept_payment_request_on_pv_paid()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
        UPDATE dept_payment_requests
           SET status = 'completed'
         WHERE pv_id = NEW.id
           AND status = 'pending_principal_pv';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dpr_complete_on_pv_paid
    AFTER UPDATE ON payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION complete_dept_payment_request_on_pv_paid();

COMMENT ON TABLE dept_payment_requests IS
    'PR #4: dept_manager Request Payment 4-stage flow. Stage 1 inserted by submit_dept_payment_request. Stage 2 trigger via approve_dept_payment_expense (Principal #1). Stage 3 generate_pv_for_dept_request (Finance). Stage 4 PV trigger flips to completed.';
