-- Per-voucher overdraw override: Principal may approve a payment that drives a
-- dept pool negative (e.g. payroll that can't wait for invoice settlement) by
-- ticking "allow overdraw". Mechanism: approve_single_voucher sets a
-- transaction-local GUC (app.allow_pool_overdraw='on') before the pool
-- deductions; the sufficiency trigger honors it and skips the block. Default
-- stays safe (blocks overdraw). (Applied via MCP apply_migration 2026-06-06;
-- file kept for repo parity. Also re-asserts the principal-last repayment order
-- from migration 20260606010000.)

CREATE OR REPLACE FUNCTION public.check_dept_pool_sufficient()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_balance   DECIMAL(15, 2);
    v_dept_name TEXT;
BEGIN
    IF NEW.transaction_type <> 'expense_out' THEN
        RETURN NEW;
    END IF;

    IF current_setting('app.allow_pool_overdraw', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT balance INTO v_balance
      FROM dept_pool_balances
     WHERE department_id = NEW.department_id;

    v_balance := COALESCE(v_balance, 0);

    IF v_balance < NEW.amount THEN
        SELECT name INTO v_dept_name FROM departments WHERE id = NEW.department_id;
        RAISE EXCEPTION
            'INSUFFICIENT_POOL_BALANCE: % Dept Pool has RM %, transaction needs RM %. Top up the pool or tick "allow overdraw" to approve anyway.',
            COALESCE(v_dept_name, NEW.department_id::TEXT), v_balance, NEW.amount;
    END IF;

    RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.approve_single_voucher(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.approve_single_voucher(p_approval_id uuid, p_user_id uuid, p_notes text, p_allow_overdraw boolean DEFAULT false)
 RETURNS TABLE(voucher_id uuid, voucher_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_period_month  DATE := DATE_TRUNC('month', v_today)::DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_approval      RECORD;
    v_voucher       RECORD;
    v_bank          RECORD;
    v_bank_gl_code  VARCHAR(20) := '3000';
    v_new_balance   DECIMAL(15, 2);
    v_pvs_row       RECORD;
    v_pvs_count     INT;
    v_breakdown     JSONB;
    v_principal     DECIMAL(15, 2);
    v_interest      DECIMAL(15, 2);
    v_penalty       DECIMAL(15, 2);
    v_overdue_id    UUID;
    v_entry_no      VARCHAR(30);
    v_entry_id      UUID;
    v_first_entry_id UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_is_loan_disbursement BOOLEAN;
    v_is_dept_expense_settlement BOOLEAN;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_single_voucher: only Principal may approve, got %', v_approver_role; END IF;
    IF is_period_locked(v_today) THEN RAISE EXCEPTION 'approve_single_voucher: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY'); END IF;

    SELECT id, reference_id, submitted_by, request_type, group_id INTO v_approval
      FROM approval_requests WHERE id = p_approval_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: approval % not found or not pending', p_approval_id; END IF;
    IF v_approval.request_type <> 'payment_voucher' THEN RAISE EXCEPTION 'approve_single_voucher: approval % is request_type=% (expected payment_voucher)', p_approval_id, v_approval.request_type; END IF;
    IF v_approval.group_id IS NOT NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % is part of group % - use approve_voucher_batch', p_approval_id, v_approval.group_id; END IF;
    IF v_approval.submitted_by = p_user_id THEN RAISE EXCEPTION 'approve_single_voucher: cannot approve own submission'; END IF;
    IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % has null reference_id', p_approval_id; END IF;

    SELECT pv.id, pv.voucher_no, pv.voucher_type, pv.direction, pv.amount, pv.description,
           pv.payee_name, pv.bank_account_id, pv.target_pool, pv.fund_source_id,
           pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type
      INTO v_voucher FROM payment_vouchers pv
     WHERE pv.id = v_approval.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: voucher % does not exist', v_approval.reference_id; END IF;
    IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_single_voucher: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;

    IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
        SELECT current_balance, bank_name, gl_account_code INTO v_bank
          FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: bank account % not found', v_voucher.bank_account_id; END IF;
        IF v_bank.current_balance < v_voucher.amount THEN
            RAISE EXCEPTION 'approve_single_voucher: bank % has RM % but voucher requires RM %', v_bank.bank_name, v_bank.current_balance, v_voucher.amount;
        END IF;
        v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
    END IF;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE id=p_approval_id AND status='pending';

    UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now, executed_by=p_user_id, executed_at=v_now, payment_date=v_today, notes=p_notes
     WHERE id=v_voucher.id AND status='pending_approval';
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: race - voucher % flipped out from under us', v_voucher.id; END IF;

    IF v_voucher.bank_account_id IS NOT NULL THEN
        IF v_bank IS NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
        END IF;
        v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
        UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
    END IF;

    IF v_voucher.direction = 'debit' THEN
        IF p_allow_overdraw THEN PERFORM set_config('app.allow_pool_overdraw', 'on', true); END IF;
        SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
        IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_single_voucher: voucher % has no payment_voucher_sources rows - debit cannot route', v_voucher.id; END IF;
        FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
        LOOP
            PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                p_user_id, p_approval_id, v_now, v_voucher.loan_id);
        END LOOP;
    ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
        PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
            format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
            p_user_id, p_approval_id, v_now, v_voucher.loan_id);
    END IF;

    IF v_voucher.repayment_breakdown IS NOT NULL AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
        v_breakdown := v_voucher.repayment_breakdown;
        v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
        v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
        v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);
        IF v_voucher.fund_source_id IS NOT NULL THEN
            IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
        ELSIF v_voucher.loan_id IS NOT NULL THEN
            IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id = v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
            IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
        END IF;
    END IF;

    v_seq := nextval('journal_entry_no_seq');
    v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

    IF v_voucher.direction = 'credit' THEN
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit - %s', v_voucher.voucher_no)),
            (v_entry_id, '3030',         NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
    ELSIF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
        v_first_entry_id := NULL;
        FOR v_pvs_row IN
            SELECT pvs.pool, pvs.amount, pvs.account_code,
                   pvs.override_gl_account_code
              FROM payment_voucher_sources pvs
             WHERE pvs.voucher_id = v_voucher.id
             ORDER BY pvs.pool
        LOOP
            v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.account_code, '9030');

            IF v_first_entry_id IS NOT NULL THEN
                v_seq := nextval('journal_entry_no_seq');
                v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
            END IF;

            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
            VALUES (v_entry_no, v_today, v_period_month,
                    format('PV %s: %s [%s]', v_voucher.voucher_no, v_voucher.description, v_pvs_row.pool),
                    'payment_voucher', v_voucher.id, v_pvs_row.amount, p_user_id,
                    pool_key_to_segment(v_pvs_row.pool))
            RETURNING id INTO v_entry_id;

            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                 format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)),
                (v_entry_id, v_bank_gl_code, NULL, v_pvs_row.amount,
                 format('Bank payment - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool));

            IF v_first_entry_id IS NULL THEN v_first_entry_id := v_entry_id; END IF;
        END LOOP;
        v_entry_id := v_first_entry_id;
    ELSE
        v_is_loan_disbursement := v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment';
        v_is_dept_expense_settlement := v_voucher.reference_type = 'dept_payment_request';

        v_voucher_default_dr := CASE
            WHEN v_is_loan_disbursement       THEN '3020'
            WHEN v_is_dept_expense_settlement THEN '4050'
            WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '4000'
            WHEN v_voucher.voucher_type = 'billing_payment'   THEN '4050'
            WHEN v_voucher.voucher_type = 'claim_payout'      THEN '9000'
            WHEN v_voucher.voucher_type = 'internal_transfer' THEN '3010'
            WHEN v_voucher.voucher_type = 'salary_payout'     THEN '4020'
            WHEN v_voucher.voucher_type = 'expense'           THEN '9000'
            ELSE '9000'
        END;

        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
        RETURNING id INTO v_entry_id;

        FOR v_pvs_row IN
            SELECT pvs.pool, pvs.amount, pvs.account_code,
                   pvs.override_gl_account_code,
                   pvs.account_code AS category_gl
              FROM payment_voucher_sources pvs
             WHERE pvs.voucher_id = v_voucher.id
        LOOP
            v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);
            IF v_is_loan_disbursement OR v_is_dept_expense_settlement
               OR v_voucher.voucher_type IN ('loan_repayment', 'billing_payment', 'salary_payout') THEN
                v_resolved_dr := v_voucher_default_dr;
            END IF;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                 format('%s - %s%s', v_voucher.voucher_type, v_voucher.payee_name,
                        CASE WHEN v_pvs_row.account_code IS NOT NULL THEN ' (' || v_pvs_row.account_code || ')' ELSE '' END));
        END LOOP;

        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount, format('Bank payment - %s', v_voucher.voucher_no));
    END IF;

    UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;
    voucher_id := v_voucher.id;
    voucher_no := v_voucher.voucher_no;
    RETURN NEXT;
END;
$function$;
