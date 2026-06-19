-- ============================================================================
-- Migration 282: per-department salary cost in the GL (user 2026-06-04, R6)
-- ============================================================================
-- Problem: the Stage-E payroll funding PV (voucher_type='payroll_bank_transfer',
-- up to 5 payment_voucher_sources rows — one per dept pool, account_code 9030
-- Salary Expense) posted ONE journal entry whose segment derived to
-- 'corporate' (derive_journal_segment has no payroll_bank_transfer branch).
-- CFO reports therefore could not attribute salary expense per department.
--
-- User decision 2026-06-04 (Q4): split at payment time, cash basis — same
-- pattern as the consolidated-settlement segment split (2026-06-03).
--
-- Changes:
--   1. pool_key_to_segment(TEXT) helper — dept_pool_* → gl_segment.
--   2. approve_single_voucher: for payroll_bank_transfer debits, post ONE
--      JE PER SOURCE ROW (Dr resolved account / Cr bank for that amount),
--      each tagged with the source pool's segment. Sum of JEs == voucher
--      amount; payment_vouchers.journal_entry_id points at the first split
--      entry. All other voucher types keep the single-JE behaviour.
--      (Stage-E funding PVs are created ungrouped, so only the single-
--      approve path needs the split — batch paths handle Stage-G PVs.)
--   3. derive_journal_segment: payment_voucher → reference_type
--      'payroll_disbursement' now resolves the STAFF's department segment
--      (via hr_monthly_payroll → hr_staff_costs → departments); director
--      payout disbursements resolve to director_office. Stage-G per-person
--      payout JEs stop collapsing into 'corporate'.
-- ============================================================================

BEGIN;

-- ── 1. Pool key → segment ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pool_key_to_segment(p_pool TEXT)
RETURNS gl_segment
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_pool
        WHEN 'dept_pool_marketing'       THEN 'marketing'::gl_segment
        WHEN 'dept_pool_hr'              THEN 'hr'::gl_segment
        WHEN 'dept_pool_finance'         THEN 'finance'::gl_segment
        WHEN 'dept_pool_director_office' THEN 'director_office'::gl_segment
        WHEN 'dept_pool_director'        THEN 'director_office'::gl_segment
        ELSE 'corporate'::gl_segment
    END;
END;
$$;

COMMENT ON FUNCTION pool_key_to_segment(TEXT) IS
    'Mig 282: payment_voucher_sources.pool key → gl_segment, used by the '
    'payroll_bank_transfer per-department JE split.';

-- ── 2. approve_single_voucher with payroll per-dept JE split ────────────────

CREATE OR REPLACE FUNCTION public.approve_single_voucher(p_approval_id uuid, p_user_id uuid, p_notes text)
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
        -- ── (mig 282) Per-department JE split ────────────────────────────
        -- One JE per source dept pool, each tagged with that pool's segment,
        -- so CFO reports show salary cost per department. Sum of the split
        -- JEs equals the voucher amount; the first split entry is recorded
        -- on payment_vouchers.journal_entry_id.
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

COMMENT ON FUNCTION approve_single_voucher IS
    'Mig 282: payroll_bank_transfer debits post ONE JE PER SOURCE DEPT POOL '
    '(Dr 9030 / Cr bank per source, segment via pool_key_to_segment) so CFO '
    'reports attribute salary cost per department. Other voucher types keep '
    'the mig 241 single-JE per-source-line behaviour.';

-- ── 3. derive_journal_segment: payroll_disbursement per staff dept ──────────

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

    -- Treasury references
    IF p_reference_type IN ('loan', 'fund_source', 'repayment') THEN
        RETURN 'treasury'::gl_segment;
    END IF;

    -- Director-related references
    IF p_reference_type IN (
        'salary', 'director_payout', 'payroll_disbursement', 'hr_monthly_payroll'
    ) THEN
        RETURN 'director_office'::gl_segment;
    END IF;

    -- Invoice (AR accrual at issue)
    IF p_reference_type = 'invoice' AND p_reference_id IS NOT NULL THEN
        SELECT billing_mode INTO v_billing_mode
          FROM invoices WHERE id = p_reference_id;
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Invoice paid credit (mig 202): reference_id → PV → invoice
    IF p_reference_type = 'invoice_paid_credit' AND p_reference_id IS NOT NULL THEN
        SELECT inv.billing_mode INTO v_billing_mode
          FROM payment_vouchers pv
          JOIN invoices inv ON inv.id = pv.reference_id
         WHERE pv.id = p_reference_id
           AND pv.reference_type = 'invoice';
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Dept expense / payment request (mig 198, 173)
    IF p_reference_type IN ('dept_expense_request', 'dept_payment_request')
       AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM dept_payment_requests dpr
          JOIN departments d ON d.id = dpr.department_id
         WHERE dpr.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Dept transfer (mig 200, payroll fan-out): consolidation into HR Pool.
    IF p_reference_type = 'dept_transfer' THEN
        RETURN 'hr'::gl_segment;
    END IF;

    -- Claim
    IF p_reference_type = 'claim' AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM claims c
          LEFT JOIN departments d ON d.id = c.department_id
         WHERE c.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Payment voucher: derive from voucher_type / linked context
    IF p_reference_type = 'payment_voucher' AND p_reference_id IS NOT NULL THEN
        SELECT voucher_type, reference_type, reference_id
          INTO v_voucher_type, v_pv_ref_type, v_pv_ref_id
          FROM payment_vouchers WHERE id = p_reference_id;

        IF v_voucher_type = 'loan_repayment' THEN
            RETURN 'treasury'::gl_segment;
        END IF;

        IF v_voucher_type = 'salary_payout' THEN
            RETURN 'director_office'::gl_segment;
        END IF;

        IF v_voucher_type = 'billing_payment'
           AND v_pv_ref_type = 'invoice' AND v_pv_ref_id IS NOT NULL THEN
            SELECT billing_mode INTO v_billing_mode
              FROM invoices WHERE id = v_pv_ref_id;
            IF v_billing_mode IS NOT NULL THEN
                RETURN billing_mode_to_segment(v_billing_mode);
            END IF;
        END IF;

        -- (mig 282) Stage-G payout PVs: reference points at the per-person
        -- payroll row. Staff → their department's segment; director payout
        -- → director_office. Was: fell through to 'corporate'.
        IF v_pv_ref_type = 'payroll_disbursement' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name
              FROM hr_monthly_payroll mp
              JOIN hr_staff_costs s ON s.id = mp.staff_id
              LEFT JOIN departments d ON d.id = s.department_id
             WHERE mp.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN
                RETURN dept_to_segment(v_dept_name);
            END IF;
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN 'director_office'::gl_segment;
            END IF;
        END IF;

        -- expense / claim_payout / other / internal_transfer with no
        -- additional context → fall back to dept lookup via reference_type
        IF v_pv_ref_type = 'dept_payment_request' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name
              FROM dept_payment_requests dpr
              JOIN departments d ON d.id = dpr.department_id
             WHERE dpr.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN
                RETURN dept_to_segment(v_dept_name);
            END IF;
        END IF;

        RETURN 'corporate'::gl_segment;
    END IF;

    RETURN 'unallocated'::gl_segment;
END;
$$;

COMMENT ON FUNCTION derive_journal_segment IS
    'Mig 282: payment_voucher refs whose voucher reference_type = '
    'payroll_disbursement now resolve the staff department''s segment (or '
    'director_office for director payouts). Otherwise identical to mig 217. '
    'Keep in lockstep with the mig 216 backfill rules.';

COMMIT;
