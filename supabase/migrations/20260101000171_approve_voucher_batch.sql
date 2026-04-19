-- ============================================================================
-- 20260101000171_approve_voucher_batch.sql
-- TODO-2 β: atomic batch approval RPC (full SQL port of applyVoucherPaidSideEffects)
-- HOUZS Venture Portal
--
-- Problem: approveRequestGroup's batch branch looped N vouchers and called the
-- TS helper applyVoucherPaidSideEffects per voucher. No DB transaction wrapped
-- the loop, so if voucher N threw mid-loop, vouchers 1..N-1 were already
-- 'paid' with bank debits, pool adjusts, and partial journal entries.
-- Payroll disbursements ship 32 vouchers per batch so this was a real risk.
--
-- This migration introduces approve_voucher_batch — a SECURITY DEFINER
-- PL/pgSQL function that does the ENTIRE sequence (status flip, bank debit,
-- pool adjust, repayment sync, GL journal) atomically. If any step fails
-- (RAISE EXCEPTION), Postgres rolls back the whole function call — no
-- partial-commit state possible.
--
-- Pre-validation is aggressive: role, period open, all vouchers in
-- pending_approval, sum(debits per bank) <= bank.current_balance, no
-- self-approval. If any fail, nothing moves.
--
-- Scope: handles only the "N payment_vouchers under one group_id" case used
-- by payroll disbursement batches. The Loan OUT combo (1 new_loan + 1
-- payment_voucher) keeps its original TS flow in approveRequestGroup because
-- its loan-specific side effects differ.
--
-- Pre-existing silent failures in the TS helper (console.error on pool /
-- journal errors) are replaced with RAISE EXCEPTION here — partial success
-- is no longer tolerated. The caller gets a clear error to act on.
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_voucher_batch(
    p_group_id UUID,
    p_user_id  UUID,
    p_notes    TEXT
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
    -- ── 1. Approver identity + role ────────────────────────────────────────
    SELECT role INTO v_approver_role
    FROM users
    WHERE id = p_user_id AND is_active = TRUE;

    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_voucher_batch: unknown or inactive user %', p_user_id;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role;
    END IF;

    -- ── 2. Period must be open ────────────────────────────────────────────
    IF is_period_locked(v_today) THEN
        RAISE EXCEPTION 'approve_voucher_batch: accounting period % is closed',
            TO_CHAR(v_period_month, 'Mon YYYY');
    END IF;

    -- ── 3. Fetch all pending payment_voucher approval_requests in the group ─
    --    + guard against self-approval / empty group / mixed-type group.
    IF NOT EXISTS (
        SELECT 1 FROM approval_requests
        WHERE group_id = p_group_id
          AND status = 'pending'
          AND request_type = 'payment_voucher'
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: no pending payment_voucher approvals in group %', p_group_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM approval_requests
        WHERE group_id = p_group_id
          AND status = 'pending'
          AND submitted_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: cannot approve own submission';
    END IF;

    -- Fail fast if the group contains non-payment_voucher items (e.g., Loan OUT).
    IF EXISTS (
        SELECT 1 FROM approval_requests
        WHERE group_id = p_group_id
          AND status = 'pending'
          AND request_type <> 'payment_voucher'
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch: group contains non-payment_voucher approvals — use the dedicated flow';
    END IF;

    -- ── 4. Pre-flight: every voucher must be in pending_approval + ──────────
    --    sum(debit amounts per bank_account) must fit the balance.
    FOR v_approval IN
        SELECT id, reference_id
        FROM approval_requests
        WHERE group_id = p_group_id
          AND status = 'pending'
          AND request_type = 'payment_voucher'
    LOOP
        IF v_approval.reference_id IS NULL THEN
            RAISE EXCEPTION 'approve_voucher_batch: approval % has null reference_id', v_approval.id;
        END IF;

        SELECT id, direction, amount, bank_account_id, status
          INTO v_voucher
          FROM payment_vouchers
         WHERE id = v_approval.reference_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: voucher % referenced by approval % does not exist',
                v_approval.reference_id, v_approval.id;
        END IF;

        IF v_voucher.status <> 'pending_approval' THEN
            RAISE EXCEPTION 'approve_voucher_batch: voucher % status is %, must be pending_approval',
                v_voucher.id, v_voucher.status;
        END IF;

        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(
                v_bank_debit_totals,
                ARRAY[v_bank_key],
                to_jsonb(
                    COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0)
                    + v_voucher.amount
                ),
                TRUE
            );
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required  := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available
          FROM bank_accounts
         WHERE id = v_bank_key::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: bank account % not found', v_bank_key;
        END IF;

        IF v_available < v_required THEN
            RAISE EXCEPTION
              'approve_voucher_batch: bank % has RM % but batch requires RM %',
              v_bank_key, v_available, v_required;
        END IF;
    END LOOP;

    -- ── 5. Atomic state flip: approval_requests → approved ─────────────────
    UPDATE approval_requests
       SET status         = 'approved',
           workflow_state = 'approved',
           approved_by    = p_user_id,
           approved_at    = v_now,
           notes          = p_notes
     WHERE group_id  = p_group_id
       AND status    = 'pending';

    -- ── 6. Per-voucher: flip + side effects ────────────────────────────────
    FOR v_approval IN
        SELECT id AS approval_id, reference_id AS voucher_id
        FROM approval_requests
        WHERE group_id = p_group_id
          AND approved_by = p_user_id
          AND approved_at = v_now
          AND request_type = 'payment_voucher'
        ORDER BY created_at
    LOOP
        -- Flip voucher → paid (approve = pay, single Principal click).
        UPDATE payment_vouchers
           SET status       = 'paid',
               approved_by  = p_user_id,
               approved_at  = v_now,
               executed_by  = p_user_id,
               executed_at  = v_now,
               payment_date = v_today,
               notes        = p_notes
         WHERE id = v_approval.voucher_id
           AND status = 'pending_approval'
        RETURNING id, voucher_no, voucher_type, direction, amount,
                  description, payee_name, bank_account_id, target_pool,
                  fund_source_id, loan_id, repayment_breakdown
          INTO v_voucher;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch: race — voucher % flipped out from under us',
                v_approval.voucher_id;
        END IF;

        -- 6a. Bank balance update (debit subtracts, credit adds) ────────────
        v_bank_gl_code := '1010';
        IF v_voucher.bank_account_id IS NOT NULL THEN
            SELECT gl_account_code, current_balance
              INTO v_bank
              FROM bank_accounts
             WHERE id = v_voucher.bank_account_id
             FOR UPDATE;

            IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
                v_new_balance  := CASE
                    WHEN v_voucher.direction = 'credit'
                    THEN v_bank.current_balance + v_voucher.amount
                    ELSE v_bank.current_balance - v_voucher.amount
                END;
                UPDATE bank_accounts
                   SET current_balance = v_new_balance
                 WHERE id = v_voucher.bank_account_id;
            END IF;
        END IF;

        -- 6b. Pool adjust ──────────────────────────────────────────────────
        IF v_voucher.direction = 'debit' THEN
            -- Debit: iterate every payment_voucher_sources row for this voucher.
            SELECT COUNT(*) INTO v_pvs_count
              FROM payment_voucher_sources
             WHERE payment_voucher_sources.voucher_id = v_voucher.id;

            IF v_pvs_count = 0 THEN
                RAISE EXCEPTION
                  'approve_voucher_batch: voucher % has no payment_voucher_sources rows — debit cannot route',
                  v_voucher.id;
            END IF;

            FOR v_pvs_row IN
                SELECT pool, amount
                  FROM payment_voucher_sources
                 WHERE payment_voucher_sources.voucher_id = v_voucher.id
            LOOP
                PERFORM apply_pool_adjustment(
                    v_pvs_row.pool,
                    'out',
                    v_pvs_row.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    p_user_id,
                    v_approval.approval_id,
                    v_now
                );
            END LOOP;
        ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
            PERFORM apply_pool_adjustment(
                v_voucher.target_pool,
                'in',
                v_voucher.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                p_user_id,
                v_approval.approval_id,
                v_now
            );
        END IF;

        -- 6c. Loan / fund source repayment sync ────────────────────────────
        IF v_voucher.repayment_breakdown IS NOT NULL
           AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
            v_breakdown := v_voucher.repayment_breakdown;
            v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
            v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
            v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);

            IF v_voucher.fund_source_id IS NOT NULL THEN
                IF v_principal > 0 THEN
                    INSERT INTO fund_source_repayments(
                        fund_source_id, amount, payment_type, payment_date,
                        notes, payment_voucher_id, created_by
                    ) VALUES (
                        v_voucher.fund_source_id, v_principal, 'principal', v_today,
                        format('Auto-synced from voucher %s', v_voucher.voucher_no),
                        v_voucher.id, p_user_id
                    );
                END IF;
                IF v_interest > 0 THEN
                    INSERT INTO fund_source_repayments(
                        fund_source_id, amount, payment_type, payment_date,
                        notes, payment_voucher_id, created_by
                    ) VALUES (
                        v_voucher.fund_source_id, v_interest, 'interest', v_today,
                        format('Auto-synced from voucher %s', v_voucher.voucher_no),
                        v_voucher.id, p_user_id
                    );
                END IF;
                IF v_penalty > 0 THEN
                    INSERT INTO fund_source_repayments(
                        fund_source_id, amount, payment_type, payment_date,
                        notes, payment_voucher_id, created_by
                    ) VALUES (
                        v_voucher.fund_source_id, v_penalty, 'penalty', v_today,
                        format('Auto-synced from voucher %s', v_voucher.voucher_no),
                        v_voucher.id, p_user_id
                    );
                END IF;
            ELSIF v_voucher.loan_id IS NOT NULL THEN
                IF v_principal > 0 THEN
                    INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                    VALUES (v_voucher.loan_id, v_principal, 'principal', v_today,
                            format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
                END IF;
                IF v_interest > 0 THEN
                    INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                    VALUES (v_voucher.loan_id, v_interest, 'interest', v_today,
                            format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
                END IF;
                IF v_penalty > 0 THEN
                    INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by)
                    VALUES (v_voucher.loan_id, v_penalty, 'penalty', v_today,
                            format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id);
                END IF;

                SELECT id INTO v_overdue_id
                  FROM overdue_records
                 WHERE loan_id = v_voucher.loan_id
                   AND status = 'pending'
                 ORDER BY period_month DESC
                 LIMIT 1;

                IF v_overdue_id IS NOT NULL THEN
                    UPDATE overdue_records SET status = 'paid' WHERE id = v_overdue_id;
                END IF;
            END IF;
        END IF;

        -- 6d. GL journal entry (balanced double-entry) ─────────────────────
        v_seq      := nextval('journal_entry_no_seq');
        v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

        IF v_voucher.direction = 'credit' THEN
            INSERT INTO journal_entries(
                entry_no, transaction_date, period_month, description,
                reference_type, reference_id, total_amount, created_by
            ) VALUES (
                v_entry_no, v_today, v_period_month,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id
            )
            RETURNING id INTO v_entry_id;

            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL,
                 format('Bank deposit — %s', v_voucher.voucher_no)),
                (v_entry_id, '1040', NULL, v_voucher.amount,
                 format('Payment received — %s', v_voucher.payee_name));
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

            INSERT INTO journal_entries(
                entry_no, transaction_date, period_month, description,
                reference_type, reference_id, total_amount, created_by
            ) VALUES (
                v_entry_no, v_today, v_period_month,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id
            )
            RETURNING id INTO v_entry_id;

            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_debit_account, v_voucher.amount, NULL,
                 format('%s — %s', v_voucher.voucher_type, v_voucher.payee_name)),
                (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
                 format('Bank payment — %s', v_voucher.voucher_no));
        END IF;

        UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;

        -- Return row for the caller.
        voucher_id := v_voucher.id;
        voucher_no := v_voucher.voucher_no;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

-- ============================================================================
-- Helper: apply_pool_adjustment — one pool insert (venture_pool / dept_pools /
-- invoice_payout_pool). Extracted so the main function stays readable.
-- SECURITY DEFINER via inheritance (called by approve_voucher_batch which is
-- SECURITY DEFINER, so this runs in its security context).
-- ============================================================================
CREATE OR REPLACE FUNCTION apply_pool_adjustment(
    p_pool         TEXT,
    p_direction    TEXT,
    p_amount       DECIMAL(15, 2),
    p_description  TEXT,
    p_user_id      UUID,
    p_approval_id  UUID,
    p_now          TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept_name TEXT;
    v_dept_id   UUID;
BEGIN
    IF p_pool = 'venture_pool' THEN
        INSERT INTO venture_pool(
            transaction_type, amount, description, reference_table, created_by
        ) VALUES (
            CASE WHEN p_direction = 'out' THEN 'expense_out' ELSE 'profit_in' END,
            p_amount, p_description, 'payment_vouchers', p_user_id
        );

    ELSIF p_pool = 'invoice_payout_pool' THEN
        IF p_direction = 'out' THEN
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description,
                release_approved_by, release_approved_at
            ) VALUES (
                'release', p_amount, p_description, p_user_id, p_now
            );
        ELSE
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description
            ) VALUES (
                'accumulate', p_amount, p_description
            );
        END IF;

    ELSIF p_pool LIKE 'dept_pool_%' THEN
        -- Map pool identifier to department name.
        v_dept_name := CASE p_pool
            WHEN 'dept_pool_hr'              THEN 'HR'
            WHEN 'dept_pool_finance'         THEN 'Finance'
            WHEN 'dept_pool_director_office' THEN 'Director Office'
            WHEN 'dept_pool_marketing'       THEN 'Marketing'
            WHEN 'dept_pool_director'        THEN 'Director'
            ELSE NULL
        END;

        IF v_dept_name IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: unknown dept_pool identifier %', p_pool;
        END IF;

        SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
        IF v_dept_id IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: department "%" not found', v_dept_name;
        END IF;

        INSERT INTO dept_pools(
            department_id, transaction_type, amount, description,
            approval_id, created_by
        ) VALUES (
            v_dept_id,
            CASE WHEN p_direction = 'out' THEN 'expense_out' ELSE 'np_in' END,
            p_amount, p_description,
            CASE WHEN p_direction = 'out' THEN p_approval_id ELSE NULL END,
            p_user_id
        );
    ELSE
        RAISE EXCEPTION 'apply_pool_adjustment: unsupported pool identifier %', p_pool;
    END IF;
END;
$$;

COMMENT ON FUNCTION approve_voucher_batch IS
    'TODO-2 β (2026-04-19): atomic batch voucher approval. Replaces the TS for-loop in approveRequestGroup. Pre-validates role, period, voucher state, bank balance. Runs every side effect (status flip, bank debit, pool adjust, repayment sync, GL journal) inside one Postgres transaction — any RAISE EXCEPTION rolls back the entire batch.';

COMMENT ON FUNCTION apply_pool_adjustment IS
    'Helper for approve_voucher_batch: routes pool adjustments to venture_pool / dept_pools / invoice_payout_pool based on pool identifier. RAISE EXCEPTION on unknown pool to fail loudly instead of silent skip.';

-- Allow authenticated callers (via PostgREST). Defense-in-depth role check
-- lives inside the function itself.
GRANT EXECUTE ON FUNCTION approve_voucher_batch(UUID, UUID, TEXT) TO authenticated;
