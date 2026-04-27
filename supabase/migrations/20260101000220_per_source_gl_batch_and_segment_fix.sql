-- ============================================================================
-- 20260101000220_per_source_gl_batch_and_segment_fix.sql
-- /review C1 + C2 fixes from 2026-04-28 audit:
--
--   C1) approve_voucher_batch + approve_voucher_batch_partial don't honor
--       per-source GL routing. Mig 219 fixed approve_single_voucher only;
--       payroll batches still write a single coarse debit account derived
--       from voucher_type, ignoring payment_voucher_sources.category_code
--       and override_gl_account_code (mig 218).
--
--   C2) derive_journal_segment(reference_type='hr_monthly_payroll') returns
--       'director_office'. Wrong — hr_monthly_payroll is the HR staff
--       payroll path, not director payouts. Same for payment_voucher branch
--       when voucher_type='salary_payout': it returns 'director_office' even
--       when the linked PV's reference_type='hr_monthly_payroll'.
--
-- This migration:
--   1. Recreates approve_voucher_batch with per-source debit FOR LOOP
--      mirroring mig 219 (override > category > voucher_type fallback).
--   2. Recreates approve_voucher_batch_partial with the same change.
--   3. Refines derive_journal_segment to inspect PV.reference_type when
--      voucher_type='salary_payout', so HR staff payroll JEs land in 'hr'
--      and director payouts stay in 'director_office'.
--   4. Backfills existing JEs that were tagged 'director_office' but should
--      be 'hr' (any JE referencing a salary_payout PV whose reference_type
--      is 'hr_monthly_payroll').
-- ============================================================================

BEGIN;

-- ── 1) approve_voucher_batch ────────────────────────────────────────
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

    v_breakdown     JSONB;
    v_principal     DECIMAL(15, 2);
    v_interest      DECIMAL(15, 2);
    v_penalty       DECIMAL(15, 2);
    v_overdue_id    UUID;

    v_entry_no      VARCHAR(30);
    v_entry_id      UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;

    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role; END IF;
    IF is_period_locked(v_today) THEN RAISE EXCEPTION 'approve_voucher_batch: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY'); END IF;

    IF NOT EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: no pending payment_voucher approvals in group %', p_group_id;
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND submitted_by = p_user_id) THEN
        RAISE EXCEPTION 'approve_voucher_batch: cannot approve own submission';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type <> 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: group contains non-payment_voucher approvals — use the dedicated flow';
    END IF;

    FOR v_approval IN
        SELECT id, reference_id FROM approval_requests
         WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher'
    LOOP
        IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: approval % has null reference_id', v_approval.id; END IF;
        SELECT id, direction, amount, bank_account_id, status INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;

        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(v_bank_debit_totals, ARRAY[v_bank_key],
                to_jsonb(COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0) + v_voucher.amount), TRUE);
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: bank account % not found', v_bank_key; END IF;
        IF v_available < v_required THEN RAISE EXCEPTION 'approve_voucher_batch: bank % has RM % but batch requires RM %', v_bank_key, v_available, v_required; END IF;
    END LOOP;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE group_id = p_group_id AND status = 'pending';

    FOR v_approval IN
        SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
         WHERE group_id = p_group_id AND approved_by = p_user_id AND approved_at = v_now AND request_type = 'payment_voucher'
         ORDER BY created_at
    LOOP
        UPDATE payment_vouchers
           SET status='paid', approved_by=p_user_id, approved_at=v_now,
               executed_by=p_user_id, executed_at=v_now, payment_date=v_today, notes=p_notes
         WHERE id = v_approval.voucher_id AND status='pending_approval'
        RETURNING payment_vouchers.id, payment_vouchers.voucher_no, payment_vouchers.voucher_type,
                  payment_vouchers.direction, payment_vouchers.amount, payment_vouchers.description,
                  payment_vouchers.payee_name, payment_vouchers.bank_account_id, payment_vouchers.target_pool,
                  payment_vouchers.fund_source_id, payment_vouchers.loan_id, payment_vouchers.repayment_breakdown,
                  payment_vouchers.reference_type
          INTO v_voucher;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: race — voucher % flipped out from under us', v_approval.voucher_id; END IF;

        v_bank_gl_code := '1010';
        IF v_voucher.bank_account_id IS NOT NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
                v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
            END IF;
        END IF;

        IF v_voucher.direction = 'debit' THEN
            SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
            IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % has no payment_voucher_sources rows', v_voucher.id; END IF;
            FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
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
                IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_interest > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest, 'interest', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_penalty > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty, 'penalty', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            ELSIF v_voucher.loan_id IS NOT NULL THEN
                IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_interest > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest, 'interest', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_penalty > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty, 'penalty', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id=v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
                IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
            END IF;
        END IF;

        v_seq := nextval('journal_entry_no_seq');
        v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

        IF v_voucher.direction = 'credit' THEN
            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit — %s', v_voucher.voucher_no)),
                (v_entry_id, '1040', NULL, v_voucher.amount, format('Payment received — %s', v_voucher.payee_name));
        ELSE
            -- C1: per-source debit routing (mirrors mig 219).
            v_voucher_default_dr := CASE
                WHEN v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment' THEN '1020'
                WHEN v_voucher.reference_type = 'dept_payment_request' THEN '2060'
                WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '2010'
                WHEN v_voucher.voucher_type = 'billing_payment'   THEN '2060'
                WHEN v_voucher.voucher_type = 'claim_payout'      THEN '5060'
                WHEN v_voucher.voucher_type = 'internal_transfer' THEN '1011'
                WHEN v_voucher.voucher_type = 'salary_payout'     THEN '2030'
                WHEN v_voucher.voucher_type = 'expense'           THEN '5050'
                ELSE '5050'
            END;

            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;

            FOR v_pvs_row IN
                SELECT pvs.pool, pvs.amount, pvs.category_code,
                       pvs.override_gl_account_code,
                       pc.gl_account_code AS category_gl
                  FROM payment_voucher_sources pvs
                  LEFT JOIN payment_categories pc ON pc.code = pvs.category_code
                 WHERE pvs.voucher_id = v_voucher.id
            LOOP
                v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);

                -- Special voucher types keep voucher-level routing for back-compat.
                IF (v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment')
                   OR v_voucher.reference_type = 'dept_payment_request'
                   OR v_voucher.voucher_type IN ('loan_repayment', 'billing_payment', 'salary_payout') THEN
                    v_resolved_dr := v_voucher_default_dr;
                END IF;

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                     format('%s — %s%s', v_voucher.voucher_type, v_voucher.payee_name,
                            CASE WHEN v_pvs_row.category_code IS NOT NULL THEN ' (' || v_pvs_row.category_code || ')' ELSE '' END));
            END LOOP;

            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
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

COMMENT ON FUNCTION approve_voucher_batch IS
    'Mig 220 (C1 fix): per-source debit JE — honors override_gl_account_code → payment_categories.gl_account_code → voucher_type fallback. Mirrors mig 219 approve_single_voucher logic.';

GRANT EXECUTE ON FUNCTION approve_voucher_batch(UUID, UUID, TEXT) TO authenticated;


-- ── 2) approve_voucher_batch_partial ────────────────────────────────
CREATE OR REPLACE FUNCTION approve_voucher_batch_partial(
    p_group_id       UUID,
    p_approve_ids    UUID[],
    p_reject_ids     UUID[],
    p_user_id        UUID,
    p_approve_notes  TEXT,
    p_reject_reason  TEXT
)
RETURNS TABLE(voucher_id UUID, voucher_no TEXT, outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_period_month  DATE := DATE_TRUNC('month', v_today)::DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_all_pending   UUID[];
    v_combined      UUID[];
    v_overlap       INT;
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
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
    v_rej_voucher_id UUID;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch_partial: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: only Principal may approve, got %', v_approver_role; END IF;
    IF is_period_locked(v_today) THEN RAISE EXCEPTION 'approve_voucher_batch_partial: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY'); END IF;

    p_approve_ids := COALESCE(p_approve_ids, ARRAY[]::UUID[]);
    p_reject_ids  := COALESCE(p_reject_ids,  ARRAY[]::UUID[]);

    IF cardinality(p_approve_ids) = 0 AND cardinality(p_reject_ids) = 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: both arrays empty'; END IF;
    IF cardinality(p_reject_ids) > 0 AND (p_reject_reason IS NULL OR length(trim(p_reject_reason)) = 0) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: rejection reason is required';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_all_pending
      FROM approval_requests WHERE group_id = p_group_id AND status='pending' AND request_type='payment_voucher';
    IF v_all_pending IS NULL OR cardinality(v_all_pending) = 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: group % empty', p_group_id; END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id=p_group_id AND status='pending' AND request_type<>'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: group has non-payment_voucher items';
    END IF;

    SELECT COUNT(*) INTO v_overlap FROM unnest(p_approve_ids) a JOIN unnest(p_reject_ids) r ON a=r;
    IF v_overlap > 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: overlap by % ids', v_overlap; END IF;

    v_combined := p_approve_ids || p_reject_ids;
    IF EXISTS (SELECT 1 FROM unnest(v_combined) id WHERE id NOT IN (SELECT unnest(v_all_pending))) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: ids outside pending group';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_all_pending) id WHERE id NOT IN (SELECT unnest(v_combined))) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: some pending members uncovered';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE id = ANY(p_approve_ids) AND submitted_by=p_user_id) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: cannot approve own submission';
    END IF;

    FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE id=ANY(p_approve_ids) AND status='pending' AND request_type='payment_voucher'
    LOOP
        SELECT id, direction, amount, bank_account_id, status INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % status is %', v_voucher.id, v_voucher.status; END IF;
        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(v_bank_debit_totals, ARRAY[v_bank_key],
                to_jsonb(COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0) + v_voucher.amount), TRUE);
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: bank account % not found', v_bank_key; END IF;
        IF v_available < v_required THEN RAISE EXCEPTION 'approve_voucher_batch_partial: bank % balance % < required %', v_bank_key, v_available, v_required; END IF;
    END LOOP;

    IF cardinality(p_reject_ids) > 0 THEN
        FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE id=ANY(p_reject_ids) AND status='pending' AND request_type='payment_voucher'
        LOOP
            UPDATE approval_requests SET status='rejected', workflow_state='rejected', approved_by=p_user_id, approved_at=v_now, notes=p_reject_reason
             WHERE id=v_approval.id AND status='pending';
            IF v_approval.reference_id IS NOT NULL THEN
                v_rej_voucher_id := v_approval.reference_id;
                UPDATE payment_vouchers SET status='voided', notes=p_reject_reason
                 WHERE id=v_rej_voucher_id AND status='pending_approval';
            END IF;
            voucher_id := v_approval.reference_id;
            SELECT pv.voucher_no INTO voucher_no FROM payment_vouchers pv WHERE pv.id = v_approval.reference_id;
            outcome := 'rejected';
            RETURN NEXT;
        END LOOP;
    END IF;

    IF cardinality(p_approve_ids) > 0 THEN
        UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_approve_notes
         WHERE id = ANY(p_approve_ids) AND status='pending';

        FOR v_approval IN SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
            WHERE id=ANY(p_approve_ids) AND approved_by=p_user_id AND approved_at=v_now AND request_type='payment_voucher' ORDER BY created_at
        LOOP
            UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now,
                   executed_by=p_user_id, executed_at=v_now, payment_date=v_today, notes=p_approve_notes
             WHERE id=v_approval.voucher_id AND status='pending_approval'
            RETURNING id, voucher_no, voucher_type, direction, amount, description, payee_name,
                      bank_account_id, target_pool, fund_source_id, loan_id, repayment_breakdown, reference_type
              INTO v_voucher;
            IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: race — voucher % flipped', v_approval.voucher_id; END IF;

            v_bank_gl_code := '1010';
            IF v_voucher.bank_account_id IS NOT NULL THEN
                SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id=v_voucher.bank_account_id FOR UPDATE;
                IF FOUND THEN
                    v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
                    v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                    UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
                END IF;
            END IF;

            IF v_voucher.direction='debit' THEN
                SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id;
                IF v_pvs_count=0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % has no source rows', v_voucher.id; END IF;
                FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id
                LOOP
                    PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                        format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
                END LOOP;
            ELSIF v_voucher.direction='credit' AND v_voucher.target_pool IS NOT NULL THEN
                PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
            END IF;

            IF v_voucher.repayment_breakdown IS NOT NULL AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
                v_breakdown := v_voucher.repayment_breakdown;
                v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
                v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
                v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);
                IF v_voucher.fund_source_id IS NOT NULL THEN
                    IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                    IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                    IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                ELSIF v_voucher.loan_id IS NOT NULL THEN
                    IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id=v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
                    IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
                END IF;
            END IF;

            v_seq := nextval('journal_entry_no_seq');
            v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

            IF v_voucher.direction='credit' THEN
                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
                RETURNING id INTO v_entry_id;
                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit — %s', v_voucher.voucher_no)),
                    (v_entry_id, '1040', NULL, v_voucher.amount, format('Payment received — %s', v_voucher.payee_name));
            ELSE
                v_voucher_default_dr := CASE
                    WHEN v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment' THEN '1020'
                    WHEN v_voucher.reference_type = 'dept_payment_request' THEN '2060'
                    WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '2010'
                    WHEN v_voucher.voucher_type = 'billing_payment'   THEN '2060'
                    WHEN v_voucher.voucher_type = 'claim_payout'      THEN '5060'
                    WHEN v_voucher.voucher_type = 'internal_transfer' THEN '1011'
                    WHEN v_voucher.voucher_type = 'salary_payout'     THEN '2030'
                    WHEN v_voucher.voucher_type = 'expense'           THEN '5050'
                    ELSE '5050'
                END;

                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
                RETURNING id INTO v_entry_id;

                FOR v_pvs_row IN
                    SELECT pvs.pool, pvs.amount, pvs.category_code,
                           pvs.override_gl_account_code,
                           pc.gl_account_code AS category_gl
                      FROM payment_voucher_sources pvs
                      LEFT JOIN payment_categories pc ON pc.code = pvs.category_code
                     WHERE pvs.voucher_id = v_voucher.id
                LOOP
                    v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);
                    IF (v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment')
                       OR v_voucher.reference_type = 'dept_payment_request'
                       OR v_voucher.voucher_type IN ('loan_repayment', 'billing_payment', 'salary_payout') THEN
                        v_resolved_dr := v_voucher_default_dr;
                    END IF;
                    INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                        (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                         format('%s — %s%s', v_voucher.voucher_type, v_voucher.payee_name,
                                CASE WHEN v_pvs_row.category_code IS NOT NULL THEN ' (' || v_pvs_row.category_code || ')' ELSE '' END));
                END LOOP;

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount, format('Bank payment — %s', v_voucher.voucher_no));
            END IF;

            UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;
            voucher_id := v_voucher.id;
            voucher_no := v_voucher.voucher_no;
            outcome := 'approved';
            RETURN NEXT;
        END LOOP;
    END IF;

    RETURN;
END;
$$;

COMMENT ON FUNCTION approve_voucher_batch_partial IS
    'Mig 220 (C1 fix): per-source debit JE — same logic as approve_voucher_batch (mig 220) and approve_single_voucher (mig 219).';

GRANT EXECUTE ON FUNCTION approve_voucher_batch_partial(UUID, UUID[], UUID[], UUID, TEXT, TEXT) TO authenticated;


-- ── 3) derive_journal_segment: route hr_monthly_payroll → 'hr' ─────
CREATE OR REPLACE FUNCTION derive_journal_segment(
    p_reference_type TEXT,
    p_reference_id   UUID
) RETURNS gl_segment
LANGUAGE plpgsql
AS $$
DECLARE
    v_billing_mode TEXT;
    v_dept_name    TEXT;
    v_voucher_type TEXT;
    v_pv_ref_type  TEXT;
    v_pv_ref_id    UUID;
BEGIN
    IF p_reference_type IS NULL THEN
        RETURN 'unallocated'::gl_segment;
    END IF;

    IF p_reference_type IN ('loan', 'fund_source', 'repayment') THEN
        RETURN 'treasury'::gl_segment;
    END IF;

    -- C2: hr_monthly_payroll is HR staff payroll, not director payouts.
    IF p_reference_type = 'hr_monthly_payroll' THEN
        RETURN 'hr'::gl_segment;
    END IF;

    -- payroll_disbursement carries director + HR staff fan-out. The PV's
    -- voucher_type already routes correctly (salary_payout for staff,
    -- payroll_disbursement for the parent voucher). Default to director_office
    -- for the parent JE; the per-payment_voucher branch below refines.
    IF p_reference_type IN ('salary', 'director_payout', 'payroll_disbursement') THEN
        RETURN 'director_office'::gl_segment;
    END IF;

    IF p_reference_type = 'invoice' AND p_reference_id IS NOT NULL THEN
        SELECT billing_mode INTO v_billing_mode FROM invoices WHERE id = p_reference_id;
        IF v_billing_mode IS NOT NULL THEN RETURN billing_mode_to_segment(v_billing_mode); END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'invoice_paid_credit' AND p_reference_id IS NOT NULL THEN
        SELECT inv.billing_mode INTO v_billing_mode
          FROM payment_vouchers pv
          JOIN invoices inv ON inv.id = pv.reference_id
         WHERE pv.id = p_reference_id AND pv.reference_type = 'invoice';
        IF v_billing_mode IS NOT NULL THEN RETURN billing_mode_to_segment(v_billing_mode); END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type IN ('dept_expense_request', 'dept_payment_request') AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM dept_payment_requests dpr JOIN departments d ON d.id = dpr.department_id
         WHERE dpr.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN RETURN dept_to_segment(v_dept_name); END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'dept_transfer' THEN
        RETURN 'hr'::gl_segment;
    END IF;

    IF p_reference_type = 'claim' AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name FROM claims c LEFT JOIN departments d ON d.id = c.department_id WHERE c.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN RETURN dept_to_segment(v_dept_name); END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'payment_voucher' AND p_reference_id IS NOT NULL THEN
        SELECT voucher_type, reference_type, reference_id
          INTO v_voucher_type, v_pv_ref_type, v_pv_ref_id
          FROM payment_vouchers WHERE id = p_reference_id;

        IF v_voucher_type = 'loan_repayment' THEN RETURN 'treasury'::gl_segment; END IF;

        -- C2: salary_payout PV — check the linked reference_type to distinguish
        -- HR staff payroll from director payouts.
        IF v_voucher_type = 'salary_payout' THEN
            IF v_pv_ref_type = 'hr_monthly_payroll' THEN
                RETURN 'hr'::gl_segment;
            END IF;
            RETURN 'director_office'::gl_segment;
        END IF;

        IF v_voucher_type = 'billing_payment'
           AND v_pv_ref_type = 'invoice' AND v_pv_ref_id IS NOT NULL THEN
            SELECT billing_mode INTO v_billing_mode FROM invoices WHERE id = v_pv_ref_id;
            IF v_billing_mode IS NOT NULL THEN RETURN billing_mode_to_segment(v_billing_mode); END IF;
        END IF;

        IF v_pv_ref_type = 'dept_payment_request' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name FROM dept_payment_requests dpr JOIN departments d ON d.id = dpr.department_id WHERE dpr.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN RETURN dept_to_segment(v_dept_name); END IF;
        END IF;

        RETURN 'corporate'::gl_segment;
    END IF;

    RETURN 'unallocated'::gl_segment;
END;
$$;

COMMENT ON FUNCTION derive_journal_segment IS
    'Mig 220 (C2 fix): hr_monthly_payroll routes to "hr"; salary_payout PV checks linked reference_type to distinguish HR staff payroll (hr) from director payouts (director_office). Otherwise unchanged from mig 217.';


-- ── 4) Backfill: re-tag JEs that were director_office but should be hr ──
-- Direct hr_monthly_payroll JEs
UPDATE journal_entries
SET segment = 'hr'
WHERE segment = 'director_office'
  AND reference_type = 'hr_monthly_payroll';

-- payment_voucher JEs whose PV is a salary_payout linked to hr_monthly_payroll
UPDATE journal_entries je
SET segment = 'hr'
FROM payment_vouchers pv
WHERE je.segment = 'director_office'
  AND je.reference_type = 'payment_voucher'
  AND je.reference_id = pv.id
  AND pv.voucher_type = 'salary_payout'
  AND pv.reference_type = 'hr_monthly_payroll';

COMMIT;
