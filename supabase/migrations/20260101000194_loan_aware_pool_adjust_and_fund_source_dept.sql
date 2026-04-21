-- ============================================================================
-- 20260101000194_loan_aware_pool_adjust_and_fund_source_dept.sql
-- Follow-ups to the E2E Paths 1-5 session (2026-04-21 post-commit e795570):
--
--   Fix A (low-risk polish) — fund_source_outstanding view didn't expose
--     from_department_id (added to fund_sources in mig 193), so the TS
--     helper listPayableFundSources couldn't label dept-pool fund sources
--     by department and fell back to "Director". Extend the view.
--
--   Fix B (latent bug) — apply_pool_adjustment (mig 188) hard-maps
--     venture_pool+out → expense_out and venture_pool+in → profit_in. For
--     loan-linked vouchers that's wrong per the Phase 10 / mig 192 cash
--     ledger:
--       * loan disbursement voucher (debit, loan_id NOT NULL) should post
--         fund_out, not expense_out
--       * loan repayment voucher (credit, loan_id NOT NULL) should post
--         loan_repayment_in, not profit_in
--     Loan disbursement vouchers live in approveRequestGroup's Loan OUT
--     mode today (TS fix in commit e795570), so the debit branch is
--     latent. The credit branch, however, is hit by voucher-based loan
--     repayments — silently writing profit_in to venture_pool and
--     inflating "profit".
--
--     Fix: add p_loan_id UUID DEFAULT NULL to apply_pool_adjustment and
--     thread v_voucher.loan_id through the three callers
--     (approve_single_voucher mig 190, approve_voucher_batch mig 189,
--     approve_voucher_batch_partial mig 182). Default NULL preserves
--     existing behavior for non-loan vouchers.
--
-- Side-effect: every caller body is re-emitted verbatim from its latest
-- migration — only the two PERFORM apply_pool_adjustment(...) sites change
-- to pass v_voucher.loan_id as the 8th arg.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Fix A: extend fund_source_outstanding with from_department_id
-- ───────────────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE VIEW forbids renaming/reordering existing columns, so
-- from_department_id is appended at the end of the SELECT list to preserve
-- the original column order (fund_source_id → monthly_payment, unchanged).
CREATE OR REPLACE VIEW fund_source_outstanding WITH (security_invoker = true) AS
SELECT
    f.id AS fund_source_id,
    f.source_type,
    f.from_company_id,
    f.from_director_id,
    f.amount AS original_amount,
    f.cost_rate,
    f.lock_in_months,
    f.effective_date,
    f.maturity_date,
    f.status,
    f.amount - COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS outstanding,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS total_principal_paid,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'interest'), 0) AS total_interest_paid,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'penalty'), 0) AS total_penalty_paid,
    CASE WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0
         THEN ROUND(f.amount * f.cost_rate * f.lock_in_months, 2)
         ELSE ROUND(f.amount * f.cost_rate, 2)
    END AS total_interest_due,
    CASE WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0
         THEN ROUND((f.amount + f.amount * f.cost_rate * f.lock_in_months) / f.lock_in_months, 2)
         ELSE ROUND(f.amount + f.amount * f.cost_rate, 2)
    END AS monthly_payment,
    f.from_department_id
FROM fund_sources f
LEFT JOIN fund_source_repayments r ON r.fund_source_id = f.id
GROUP BY f.id, f.source_type, f.from_company_id, f.from_director_id,
         f.from_department_id, f.amount, f.cost_rate, f.lock_in_months,
         f.effective_date, f.maturity_date, f.status;

-- ───────────────────────────────────────────────────────────────────────────
-- Fix B-1: loan-aware apply_pool_adjustment
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS apply_pool_adjustment(TEXT, TEXT, DECIMAL(15,2), TEXT, UUID, UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION apply_pool_adjustment(
    p_pool         TEXT,
    p_direction    TEXT,
    p_amount       DECIMAL(15, 2),
    p_description  TEXT,
    p_user_id      UUID,
    p_approval_id  UUID,
    p_now          TIMESTAMPTZ,
    p_loan_id      UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept_name TEXT;
    v_dept_id   UUID;
    v_vp_type   hv_fund_txn_type;
BEGIN
    IF p_pool = 'venture_pool' THEN
        -- Mig 194: loan-linked vouchers use fund_out/loan_repayment_in so
        -- venture_pool tracks HV's cash ledger correctly. Non-loan
        -- vouchers keep the old expense_out/profit_in mapping.
        v_vp_type := CASE
            WHEN p_direction = 'out' AND p_loan_id IS NOT NULL THEN 'fund_out'
            WHEN p_direction = 'out'                           THEN 'expense_out'
            WHEN p_direction = 'in'  AND p_loan_id IS NOT NULL THEN 'loan_repayment_in'
            WHEN p_direction = 'in'                            THEN 'profit_in'
        END::hv_fund_txn_type;

        INSERT INTO venture_pool(
            transaction_type, amount, description, reference_table, created_by
        ) VALUES (
            v_vp_type, p_amount, p_description, 'payment_vouchers', p_user_id
        );

    ELSIF p_pool = 'invoice_payout_pool' THEN
        IF p_direction = 'out' THEN
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description,
                release_approved_by, release_approved_at
            ) VALUES (
                'release'::invoice_pool_txn_type, p_amount, p_description, p_user_id, p_now
            );
        ELSE
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description
            ) VALUES (
                'accumulate'::invoice_pool_txn_type, p_amount, p_description
            );
        END IF;

    ELSIF p_pool LIKE 'dept_pool_%' THEN
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
            (CASE WHEN p_direction = 'out' THEN 'expense_out' ELSE 'np_in' END)::dept_pool_txn_type,
            p_amount, p_description,
            CASE WHEN p_direction = 'out' THEN p_approval_id ELSE NULL END,
            p_user_id
        );
    ELSE
        RAISE EXCEPTION 'apply_pool_adjustment: unsupported pool identifier %', p_pool;
    END IF;
END;
$$;

COMMENT ON FUNCTION apply_pool_adjustment IS
    'Mig 194: loan-aware venture_pool mapping. Passes p_loan_id through callers so loan-linked vouchers post fund_out/loan_repayment_in instead of expense_out/profit_in. Non-loan vouchers unchanged.';

-- ───────────────────────────────────────────────────────────────────────────
-- Fix B-2: approve_single_voucher — pass v_voucher.loan_id to helper
-- (body verbatim from mig 190, only the 2 PERFORM calls changed)
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS approve_single_voucher(uuid, uuid, text);

CREATE OR REPLACE FUNCTION approve_single_voucher(
    p_approval_id UUID, p_user_id UUID, p_notes TEXT
)
RETURNS TABLE(voucher_id UUID, voucher_no TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_period_month  DATE := DATE_TRUNC('month', v_today)::DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_approval      RECORD;
    v_voucher       RECORD;
    v_bank          RECORD;
    v_bank_gl_code  VARCHAR(20) := '1010';
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
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_single_voucher: only Principal may approve, got %', v_approver_role; END IF;
    IF is_period_locked(v_today) THEN RAISE EXCEPTION 'approve_single_voucher: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY'); END IF;

    SELECT id, reference_id, submitted_by, request_type, group_id INTO v_approval
      FROM approval_requests WHERE id = p_approval_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: approval % not found or not pending', p_approval_id; END IF;
    IF v_approval.request_type <> 'payment_voucher' THEN RAISE EXCEPTION 'approve_single_voucher: approval % is request_type=% (expected payment_voucher)', p_approval_id, v_approval.request_type; END IF;
    IF v_approval.group_id IS NOT NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % is part of group % — use approve_voucher_batch', p_approval_id, v_approval.group_id; END IF;
    IF v_approval.submitted_by = p_user_id THEN RAISE EXCEPTION 'approve_single_voucher: cannot approve own submission'; END IF;
    IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % has null reference_id', p_approval_id; END IF;

    SELECT pv.id, pv.voucher_no, pv.voucher_type, pv.direction, pv.amount, pv.description,
           pv.payee_name, pv.bank_account_id, pv.target_pool, pv.fund_source_id,
           pv.loan_id, pv.repayment_breakdown, pv.status
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
        v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
    END IF;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE id=p_approval_id AND status='pending';

    UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now, executed_by=p_user_id, executed_at=v_now, payment_date=v_today, notes=p_notes
     WHERE id=v_voucher.id AND status='pending_approval';
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: race — voucher % flipped out from under us', v_voucher.id; END IF;

    IF v_voucher.bank_account_id IS NOT NULL THEN
        IF v_bank IS NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            v_bank_gl_code := COALESCE(v_bank.gl_account_code, '1010');
        END IF;
        v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
        UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
    END IF;

    IF v_voucher.direction = 'debit' THEN
        SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
        IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_single_voucher: voucher % has no payment_voucher_sources rows — debit cannot route', v_voucher.id; END IF;
        FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
        LOOP
            -- Mig 194: pass loan_id so venture_pool debits from loan disbursements post fund_out.
            PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                p_user_id, p_approval_id, v_now, v_voucher.loan_id);
        END LOOP;
    ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
        -- Mig 194: pass loan_id so venture_pool credits from loan repayments post loan_repayment_in.
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
            IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
        ELSIF v_voucher.loan_id IS NOT NULL THEN
            IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_today, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id = v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
            IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
        END IF;
    END IF;

    v_seq := nextval('journal_entry_no_seq');
    v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
    IF v_voucher.direction='credit' THEN
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id) RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit — %s', v_voucher.voucher_no)),
            (v_entry_id, '1040', NULL, v_voucher.amount, format('Payment received — %s', v_voucher.payee_name));
    ELSE
        v_debit_account := CASE v_voucher.voucher_type
            WHEN 'loan_repayment' THEN '2010' WHEN 'billing_payment' THEN '2060' WHEN 'claim_payout' THEN '5060'
            WHEN 'expense' THEN '5050' WHEN 'internal_transfer' THEN '1011' WHEN 'salary_payout' THEN '2030' ELSE '5050'
        END;
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_today, v_period_month, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id) RETURNING id INTO v_entry_id;
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

-- ───────────────────────────────────────────────────────────────────────────
-- Fix B-3: approve_voucher_batch — pass v_voucher.loan_id to helper
-- (body verbatim from mig 189, only the 2 PERFORM calls changed)
-- ───────────────────────────────────────────────────────────────────────────
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
                -- Mig 194: thread loan_id through for loan-aware venture_pool mapping.
                PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    p_user_id, v_approval.approval_id, v_now, v_voucher.loan_id);
            END LOOP;
        ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
            -- Mig 194: thread loan_id through for loan-aware venture_pool mapping.
            PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                p_user_id, v_approval.approval_id, v_now, v_voucher.loan_id);
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

-- ───────────────────────────────────────────────────────────────────────────
-- Fix B-4: approve_voucher_batch_partial — pass v_voucher.loan_id to helper
-- (body verbatim from mig 182, only the 2 PERFORM calls changed)
-- ───────────────────────────────────────────────────────────────────────────
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
    v_debit_account VARCHAR(20);
    v_seq           BIGINT;

    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
    v_rej_voucher_id UUID;
BEGIN
    SELECT role INTO v_approver_role
      FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: unknown or inactive user %', p_user_id;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: only Principal may approve, got %', v_approver_role;
    END IF;

    IF is_period_locked(v_today) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: accounting period % is closed',
            TO_CHAR(v_period_month, 'Mon YYYY');
    END IF;

    p_approve_ids := COALESCE(p_approve_ids, ARRAY[]::UUID[]);
    p_reject_ids  := COALESCE(p_reject_ids,  ARRAY[]::UUID[]);

    IF cardinality(p_approve_ids) = 0 AND cardinality(p_reject_ids) = 0 THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: both approve and reject arrays are empty';
    END IF;

    IF cardinality(p_reject_ids) > 0
       AND (p_reject_reason IS NULL OR length(trim(p_reject_reason)) = 0) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: rejection reason is required when any rows are rejected';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY created_at)
      INTO v_all_pending
      FROM approval_requests
     WHERE group_id = p_group_id
       AND status = 'pending'
       AND request_type = 'payment_voucher';

    IF v_all_pending IS NULL OR cardinality(v_all_pending) = 0 THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: group % has no pending payment_voucher approvals', p_group_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM approval_requests
         WHERE group_id = p_group_id
           AND status = 'pending'
           AND request_type <> 'payment_voucher'
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: group % contains non-payment_voucher items — use approveRequestGroup', p_group_id;
    END IF;

    SELECT COUNT(*) INTO v_overlap
      FROM unnest(p_approve_ids) a
      JOIN unnest(p_reject_ids)  r ON a = r;
    IF v_overlap > 0 THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: approve and reject arrays overlap by % ids', v_overlap;
    END IF;

    v_combined := p_approve_ids || p_reject_ids;

    IF EXISTS (
        SELECT 1 FROM unnest(v_combined) id
        WHERE id NOT IN (SELECT unnest(v_all_pending))
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: approve/reject ids contain values outside the pending group';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(v_all_pending) id
        WHERE id NOT IN (SELECT unnest(v_combined))
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: some pending group members are in neither approve nor reject list';
    END IF;

    IF EXISTS (
        SELECT 1 FROM approval_requests
         WHERE id = ANY(p_approve_ids)
           AND submitted_by = p_user_id
    ) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: cannot approve own submission';
    END IF;

    FOR v_approval IN
        SELECT id, reference_id
          FROM approval_requests
         WHERE id = ANY(p_approve_ids)
           AND status = 'pending'
           AND request_type = 'payment_voucher'
    LOOP
        SELECT id, direction, amount, bank_account_id, status
          INTO v_voucher
          FROM payment_vouchers
         WHERE id = v_approval.reference_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % missing for approval %',
                v_approval.reference_id, v_approval.id;
        END IF;
        IF v_voucher.status <> 'pending_approval' THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % status is %, must be pending_approval',
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
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available
          FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: bank account % not found', v_bank_key;
        END IF;
        IF v_available < v_required THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: bank % has RM % but approve set requires RM %',
                v_bank_key, v_available, v_required;
        END IF;
    END LOOP;

    IF cardinality(p_reject_ids) > 0 THEN
        FOR v_approval IN
            SELECT id, reference_id
              FROM approval_requests
             WHERE id = ANY(p_reject_ids)
               AND status = 'pending'
               AND request_type = 'payment_voucher'
        LOOP
            UPDATE approval_requests
               SET status         = 'rejected',
                   workflow_state = 'rejected',
                   approved_by    = p_user_id,
                   approved_at    = v_now,
                   notes          = p_reject_reason
             WHERE id = v_approval.id
               AND status = 'pending';

            IF v_approval.reference_id IS NOT NULL THEN
                v_rej_voucher_id := v_approval.reference_id;
                UPDATE payment_vouchers
                   SET status = 'voided',
                       notes  = p_reject_reason
                 WHERE id = v_rej_voucher_id
                   AND status = 'pending_approval';
            END IF;

            voucher_id := v_approval.reference_id;
            SELECT pv.voucher_no INTO voucher_no
              FROM payment_vouchers pv
             WHERE pv.id = v_approval.reference_id;
            outcome := 'rejected';
            RETURN NEXT;
        END LOOP;
    END IF;

    IF cardinality(p_approve_ids) > 0 THEN
        UPDATE approval_requests
           SET status         = 'approved',
               workflow_state = 'approved',
               approved_by    = p_user_id,
               approved_at    = v_now,
               notes          = p_approve_notes
         WHERE id = ANY(p_approve_ids)
           AND status = 'pending';

        FOR v_approval IN
            SELECT id AS approval_id, reference_id AS voucher_id
              FROM approval_requests
             WHERE id = ANY(p_approve_ids)
               AND approved_by = p_user_id
               AND approved_at = v_now
               AND request_type = 'payment_voucher'
             ORDER BY created_at
        LOOP
            UPDATE payment_vouchers
               SET status       = 'paid',
                   approved_by  = p_user_id,
                   approved_at  = v_now,
                   executed_by  = p_user_id,
                   executed_at  = v_now,
                   payment_date = v_today,
                   notes        = p_approve_notes
             WHERE id = v_approval.voucher_id
               AND status = 'pending_approval'
            RETURNING id, voucher_no, voucher_type, direction, amount,
                      description, payee_name, bank_account_id, target_pool,
                      fund_source_id, loan_id, repayment_breakdown
              INTO v_voucher;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'approve_voucher_batch_partial: race — voucher % flipped out from under us',
                    v_approval.voucher_id;
            END IF;

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

            IF v_voucher.direction = 'debit' THEN
                SELECT COUNT(*) INTO v_pvs_count
                  FROM payment_voucher_sources
                 WHERE payment_voucher_sources.voucher_id = v_voucher.id;

                IF v_pvs_count = 0 THEN
                    RAISE EXCEPTION
                      'approve_voucher_batch_partial: voucher % has no payment_voucher_sources rows',
                      v_voucher.id;
                END IF;

                FOR v_pvs_row IN
                    SELECT pool, amount
                      FROM payment_voucher_sources
                     WHERE payment_voucher_sources.voucher_id = v_voucher.id
                LOOP
                    -- Mig 194: thread loan_id through for loan-aware venture_pool mapping.
                    PERFORM apply_pool_adjustment(
                        v_pvs_row.pool, 'out', v_pvs_row.amount,
                        format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                        p_user_id, v_approval.approval_id, v_now, v_voucher.loan_id
                    );
                END LOOP;
            ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
                -- Mig 194: thread loan_id through for loan-aware venture_pool mapping.
                PERFORM apply_pool_adjustment(
                    v_voucher.target_pool, 'in', v_voucher.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    p_user_id, v_approval.approval_id, v_now, v_voucher.loan_id
                );
            END IF;

            IF v_voucher.repayment_breakdown IS NOT NULL
               AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
                v_breakdown := v_voucher.repayment_breakdown;
                v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
                v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
                v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);

                IF v_voucher.fund_source_id IS NOT NULL THEN
                    IF v_principal > 0 THEN
                        INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                        VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_today,
                                format('Auto-synced from voucher %s', v_voucher.voucher_no),
                                v_voucher.id, p_user_id);
                    END IF;
                    IF v_interest > 0 THEN
                        INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                        VALUES (v_voucher.fund_source_id, v_interest, 'interest', v_today,
                                format('Auto-synced from voucher %s', v_voucher.voucher_no),
                                v_voucher.id, p_user_id);
                    END IF;
                    IF v_penalty > 0 THEN
                        INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by)
                        VALUES (v_voucher.fund_source_id, v_penalty, 'penalty', v_today,
                                format('Auto-synced from voucher %s', v_voucher.voucher_no),
                                v_voucher.id, p_user_id);
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
                     WHERE loan_id = v_voucher.loan_id AND status = 'pending'
                     ORDER BY period_month DESC LIMIT 1;
                    IF v_overdue_id IS NOT NULL THEN
                        UPDATE overdue_records SET status = 'paid' WHERE id = v_overdue_id;
                    END IF;
                END IF;
            END IF;

            v_seq      := nextval('journal_entry_no_seq');
            v_entry_no := format('JE-%s-%s', TO_CHAR(v_today, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

            IF v_voucher.direction = 'credit' THEN
                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description,
                    reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_today, v_period_month,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
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

                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description,
                    reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_today, v_period_month,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
                RETURNING id INTO v_entry_id;

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_debit_account, v_voucher.amount, NULL,
                     format('%s — %s', v_voucher.voucher_type, v_voucher.payee_name)),
                    (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
                     format('Bank payment — %s', v_voucher.voucher_no));
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

COMMIT;
