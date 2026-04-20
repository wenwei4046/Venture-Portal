-- ============================================================================
-- 20260101000189_fix_approve_voucher_batch_voucher_no_ambiguity.sql
-- Phase 9 hotfix — approve_voucher_batch (migration 171) carried the same
-- voucher_no ambiguity as approve_single_voucher (fixed in 187). The
-- problematic spot is inside the FOR LOOP, at the per-voucher UPDATE with
-- a wide RETURNING clause — voucher_no in RETURNING conflicted with the
-- OUT parameter of the same name.
--
-- Fix: qualify RETURNING columns with the payment_vouchers table name.
--
-- Applied to remote 2026-04-20 via execute_sql DO block during E2E payroll
-- test run. This migration file captures the final function body so local
-- and remote stay in sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text)
 RETURNS TABLE(voucher_id uuid, voucher_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

    v_dept_id       UUID;
    v_dept_name     TEXT;

    v_breakdown     JSONB;
    v_principal     DECIMAL(15, 2);
    v_interest      DECIMAL(15, 2);
    v_penalty       DECIMAL(15, 2);
    v_overdue_id    UUID;

    v_entry_no      VARCHAR(30);
    v_entry_id      UUID;
    v_debit_account VARCHAR(20);
    v_seq           BIGINT;

    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_voucher_batch: unknown or inactive user %', p_user_id;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role;
    END IF;

    IF is_period_locked(v_today) THEN
        RAISE EXCEPTION 'approve_voucher_batch: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher'
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: no pending payment_voucher approvals in group %', p_group_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND submitted_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: cannot approve own submission';
    END IF;

    IF EXISTS (
        SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type <> 'payment_voucher'
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: group contains non-payment_voucher approvals — use the dedicated flow';
    END IF;

    FOR v_approval IN
        SELECT id, reference_id FROM approval_requests
        WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher'
    LOOP
        IF v_approval.reference_id IS NULL THEN
            RAISE EXCEPTION 'approve_voucher_batch: approval % has null reference_id', v_approval.id;
        END IF;

        SELECT id, direction, amount, bank_account_id, status INTO v_voucher
          FROM payment_vouchers WHERE id = v_approval.reference_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: voucher % referenced by approval % does not exist', v_approval.reference_id, v_approval.id;
        END IF;
        IF v_voucher.status <> 'pending_approval' THEN
            RAISE EXCEPTION 'approve_voucher_batch: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status;
        END IF;

        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(v_bank_debit_totals, ARRAY[v_bank_key],
                to_jsonb(COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0) + v_voucher.amount), TRUE);
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: bank account % not found', v_bank_key;
        END IF;
        IF v_available < v_required THEN
            RAISE EXCEPTION 'approve_voucher_batch: bank % has RM % but batch requires RM %', v_bank_key, v_available, v_required;
        END IF;
    END LOOP;

    UPDATE approval_requests SET status = 'approved', workflow_state = 'approved', approved_by = p_user_id, approved_at = v_now, notes = p_notes
     WHERE group_id = p_group_id AND status = 'pending';

    FOR v_approval IN
        SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
        WHERE group_id = p_group_id AND approved_by = p_user_id AND approved_at = v_now AND request_type = 'payment_voucher'
        ORDER BY created_at
    LOOP
        -- FIX: qualify RETURNING columns with payment_vouchers to avoid OUT-param ambiguity.
        UPDATE payment_vouchers
           SET status = 'paid', approved_by = p_user_id, approved_at = v_now,
               executed_by = p_user_id, executed_at = v_now, payment_date = v_today, notes = p_notes
         WHERE id = v_approval.voucher_id AND status = 'pending_approval'
        RETURNING payment_vouchers.id, payment_vouchers.voucher_no, payment_vouchers.voucher_type,
                  payment_vouchers.direction, payment_vouchers.amount,
                  payment_vouchers.description, payment_vouchers.payee_name,
                  payment_vouchers.bank_account_id, payment_vouchers.target_pool,
                  payment_vouchers.fund_source_id, payment_vouchers.loan_id,
                  payment_vouchers.repayment_breakdown
          INTO v_voucher;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: race — voucher % flipped out from under us', v_approval.voucher_id;
        END IF;

        v_bank_gl_code := '1010';
        IF v_voucher.bank_account_id IS NOT NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
                v_new_balance := CASE WHEN v_voucher.direction = 'credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                UPDATE bank_accounts SET current_balance = v_new_balance WHERE id = v_voucher.bank_account_id;
            END IF;
        END IF;

        IF v_voucher.direction = 'debit' THEN
            SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
            IF v_pvs_count = 0 THEN
                RAISE EXCEPTION 'approve_voucher_batch: voucher % has no payment_voucher_sources rows — debit cannot route', v_voucher.id;
            END IF;
            FOR v_pvs_row IN
                SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
            LOOP
                PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
            END LOOP;
        ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
            PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
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
    END LOOP;

    RETURN;
END;
$$;
