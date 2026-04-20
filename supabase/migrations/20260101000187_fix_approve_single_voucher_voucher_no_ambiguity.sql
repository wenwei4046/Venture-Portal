-- ============================================================================
-- 20260101000187_fix_approve_single_voucher_voucher_no_ambiguity.sql
-- Phase 9 hotfix — approve_single_voucher had a latent ambiguity since
-- migration 179: RETURNS TABLE(voucher_id UUID, voucher_no TEXT) creates
-- OUT parameters that conflict with payment_vouchers.voucher_no when
-- referenced in an unaliased SELECT. Principal approval of a PV blew up
-- with ERROR 42702 the first time it was exercised end-to-end.
--
-- Fix: alias payment_vouchers as `pv` and qualify every column in the
-- FOR UPDATE SELECT. DROP + CREATE (not CREATE OR REPLACE) because the
-- return type name changed in an earlier attempt — clean slate is safer.
--
-- Applied to remote 2026-04-20 during E2E payroll test run.
-- ============================================================================

DROP FUNCTION IF EXISTS approve_single_voucher(uuid, uuid, text);

CREATE OR REPLACE FUNCTION approve_single_voucher(
    p_approval_id UUID,
    p_user_id     UUID,
    p_notes       TEXT
)
RETURNS TABLE(voucher_id UUID, voucher_no TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_period_month  DATE := DATE_TRUNC('month', v_today)::DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_approval      RECORD;
    v_voucher       RECORD;
    v_bank          RECORD;
    v_bank_gl_code  VARCHAR(20);
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
    v_debit_account VARCHAR(20);
    v_seq           BIGINT;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_single_voucher: unknown or inactive user %', p_user_id;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_single_voucher: only Principal may approve, got %', v_approver_role;
    END IF;

    IF is_period_locked(v_today) THEN
        RAISE EXCEPTION 'approve_single_voucher: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY');
    END IF;

    SELECT id, reference_id, submitted_by, request_type, group_id INTO v_approval
      FROM approval_requests WHERE id = p_approval_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_single_voucher: approval % not found or not pending', p_approval_id;
    END IF;
    IF v_approval.request_type <> 'payment_voucher' THEN
        RAISE EXCEPTION 'approve_single_voucher: approval % is request_type=% (expected payment_voucher)', p_approval_id, v_approval.request_type;
    END IF;
    IF v_approval.group_id IS NOT NULL THEN
        RAISE EXCEPTION 'approve_single_voucher: approval % is part of group % — use approve_voucher_batch', p_approval_id, v_approval.group_id;
    END IF;
    IF v_approval.submitted_by = p_user_id THEN
        RAISE EXCEPTION 'approve_single_voucher: cannot approve own submission';
    END IF;
    IF v_approval.reference_id IS NULL THEN
        RAISE EXCEPTION 'approve_single_voucher: approval % has null reference_id', p_approval_id;
    END IF;

    -- FIX: qualify all columns with table alias to avoid ambiguity with OUT params
    SELECT pv.id, pv.voucher_no, pv.voucher_type, pv.direction, pv.amount, pv.description,
           pv.payee_name, pv.bank_account_id, pv.target_pool, pv.fund_source_id,
           pv.loan_id, pv.repayment_breakdown, pv.status
      INTO v_voucher
      FROM payment_vouchers pv
     WHERE pv.id = v_approval.reference_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_single_voucher: voucher % does not exist', v_approval.reference_id;
    END IF;
    IF v_voucher.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'approve_single_voucher: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status;
    END IF;

    IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
        SELECT current_balance, bank_name, gl_account_code INTO v_bank
          FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_single_voucher: bank account % not found', v_voucher.bank_account_id;
        END IF;
        IF v_bank.current_balance < v_voucher.amount THEN
            RAISE EXCEPTION 'approve_single_voucher: bank % has RM % but voucher requires RM %', v_bank.bank_name, v_bank.current_balance, v_voucher.amount;
        END IF;
    END IF;

    UPDATE approval_requests SET status = 'approved', workflow_state = 'approved', approved_by = p_user_id, approved_at = v_now, notes = p_notes
     WHERE id = p_approval_id AND status = 'pending';

    UPDATE payment_vouchers SET status = 'paid', approved_by = p_user_id, approved_at = v_now, executed_by = p_user_id, executed_at = v_now, payment_date = v_today, notes = p_notes
     WHERE id = v_voucher.id AND status = 'pending_approval';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_single_voucher: race — voucher % flipped out from under us', v_voucher.id;
    END IF;

    v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
    IF v_voucher.bank_account_id IS NOT NULL THEN
        IF v_bank IS NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
        END IF;
        v_new_balance := CASE WHEN v_voucher.direction = 'credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
        UPDATE bank_accounts SET current_balance = v_new_balance WHERE id = v_voucher.bank_account_id;
    END IF;

    IF v_voucher.direction = 'debit' THEN
        SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
        IF v_pvs_count = 0 THEN
            RAISE EXCEPTION 'approve_single_voucher: voucher % has no payment_voucher_sources rows — debit cannot route', v_voucher.id;
        END IF;
        FOR v_pvs_row IN
            SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
        LOOP
            PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, p_approval_id, v_now);
        END LOOP;
    ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
        PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, p_approval_id, v_now);
    END IF;

    IF v_voucher.repayment_breakdown IS NOT NULL AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
        v_breakdown := v_voucher.repayment_breakdown;
        v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
        v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
        v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);
        IF v_voucher.fund_source_id IS NOT NULL THEN
            IF v_principal > 0 THEN
                INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id);
            END IF;
            IF v_interest > 0 THEN
                INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                VALUES (v_voucher.fund_source_id, v_interest, 'interest', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id);
            END IF;
            IF v_penalty > 0 THEN
                INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                VALUES (v_voucher.fund_source_id, v_penalty, 'penalty', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id);
            END IF;
        ELSIF v_voucher.loan_id IS NOT NULL THEN
            IF v_principal > 0 THEN
                INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                VALUES (v_voucher.loan_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
            END IF;
            IF v_interest > 0 THEN
                INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                VALUES (v_voucher.loan_id, v_interest, 'interest', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
            END IF;
            IF v_penalty > 0 THEN
                INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                VALUES (v_voucher.loan_id, v_penalty, 'penalty', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
            END IF;
            SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id = v_voucher.loan_id AND status = 'pending' ORDER BY period_month DESC LIMIT 1;
            IF v_overdue_id IS NOT NULL THEN
                UPDATE overdue_records SET status = 'paid' WHERE id = v_overdue_id;
            END IF;
        END IF;
    END IF;

    v_seq      := nextval('journal_entry_no_seq');
    v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

    IF v_voucher.direction = 'credit' THEN
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit — %s', v_voucher.voucher_no)),
            (v_entry_id, '1040', NULL, v_voucher.amount, format('Payment received — %s', v_voucher.payee_name));
    ELSE
        v_debit_account := CASE v_voucher.voucher_type
            WHEN 'loan_repayment'    THEN '2010'
            WHEN 'billing_payment'   THEN '2060'
            WHEN 'claim_payout'      THEN '5060'
            WHEN 'expense'           THEN '5050'
            WHEN 'internal_transfer' THEN '1011'
            WHEN 'salary_payout'     THEN '2030'
            ELSE '5050'
        END;
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_debit_account, v_voucher.amount, NULL, format('%s — %s', v_voucher.voucher_type, v_voucher.payee_name)),
            (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount, format('Bank payment — %s', v_voucher.voucher_no));
    END IF;

    UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;

    voucher_id := v_voucher.id;
    voucher_no := v_voucher.voucher_no;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_single_voucher(UUID, UUID, TEXT) TO authenticated;
