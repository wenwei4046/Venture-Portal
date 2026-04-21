-- Mig 198: P0-1 fix — approve_dept_payment_expense posts a balanced JE
--
-- Drift
-- -----
-- approve_dept_payment_expense (mig 173) INSERTs a dept_pools expense_out
-- row (pool balance drops) but never writes a journal_entries row. Result:
-- HR submits OPEX RM 5499 → Principal approves → dept pool balance drops
-- by 5499 but GL equity account (3030/3040/3050/3070/3080) never moves.
-- This is the user's motivating example (2026-04-22).
--
-- Fix
-- ---
-- At Stage 2 (expense approved, not yet paid), the pool's equity is being
-- reserved against a pending obligation. Double-entry:
--     dr 3xxx Dept Pool   X    -- equity decreases (pool commits funds)
--     cr 2060 AP General  X    -- liability rises (we owe the vendor)
--
-- Stage 4 (PV approved by Principal via approve_single_voucher, refreshed
-- in mig 199) will clear the AP:
--     dr 2060 AP General  X
--     cr 1010 Bank        X
--
-- Net across both stages: pool -X, bank -X, AP zeroed. Balanced.
-- Reference_type = 'dept_expense_request' (new, joins the design vocabulary).

BEGIN;

CREATE OR REPLACE FUNCTION approve_dept_payment_expense(p_approval_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request    dept_payment_requests%ROWTYPE;
    v_pool_id    UUID;
    v_user_id    UUID := auth.uid();
    v_dept_name  TEXT;
    v_gl_code    VARCHAR(20);
    v_je_lines   JSONB;
BEGIN
    IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'Only principal can approve'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT dpr.* INTO v_request
      FROM dept_payment_requests dpr
     WHERE dpr.expense_approval_id = p_approval_id
       AND dpr.status = 'pending_principal_expense';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No pending dept_payment_request linked to approval %',
            p_approval_id;
    END IF;

    -- Existing Stage 2 behaviour (unchanged): debit dept pool.
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

    -- Mig 198: post the matching JE.
    SELECT name INTO v_dept_name
      FROM departments WHERE id = v_request.department_id;

    v_gl_code := dept_pool_gl_code(v_dept_name);
    IF v_gl_code IS NULL THEN
        RAISE EXCEPTION
            'approve_dept_payment_expense: department "%" has no dept pool GL code — run mig 197',
            v_dept_name;
    END IF;

    v_je_lines := jsonb_build_array(
        jsonb_build_object(
            'account_code', v_gl_code,
            'debit',        v_request.amount,
            'description',  format('%s Pool reserved for %s', v_dept_name, v_request.payee_name)
        ),
        jsonb_build_object(
            'account_code', '2060',
            'credit',       v_request.amount,
            'description',  format('AP accrual — %s', v_request.payee_name)
        )
    );

    PERFORM post_journal_entry(
        CURRENT_DATE,
        format('Dept expense approved: %s — %s', v_request.payee_name, v_request.description),
        'dept_expense_request',
        v_request.id,
        v_user_id,
        v_je_lines
    );
END;
$$;

COMMENT ON FUNCTION approve_dept_payment_expense IS
    'Mig 198: P0-1 drift fix. Stage 2 approval now posts a balanced JE: dr 3xxx Dept Pool / cr 2060 AP General. Pair with mig 199 refresh of approve_single_voucher so Stage 4 PV approval clears the AP against bank.';

COMMIT;
