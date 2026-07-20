-- Mig 20260720140000: payroll model FINAL — HR-custody (user ruling, later 2026-07-20).
--
-- After seeing both models side by side the user chose the ORIGINAL custody
-- flow: "payroll request 就是扣各个部门的 fund 去 HR 的 Alliance" — funding
-- deducts every department's contribution immediately and parks the WHOLE pot
-- in HR's pool (HR 代管, balance visibly swells until payday — accepted); the
-- payouts + statutory then drain ONLY HR's pool. This supersedes the
-- pools-drain-at-payout model of mig 20260720100000. The original design's bug
-- stays fixed: HR's own contribution is INCLUDED in the custody credit (the
-- old fan-out only credited the non-HR sum, leaking HR's share).
--
-- Final flow:
--   Funding PV approval (per round, amounts typed by Finance):
--     • Dr 9030 / Cr 4020 per dept segment (P&L per dept)          [unchanged]
--     • drains EACH source dept pool by its typed share (预支 auto-allowed)
--     • credits dept_pool_hr with the FULL round amount (custody)
--     • source bank guarded + debited, Alliance (3010) credited    [unchanged]
--     • ONE staging JE, segment='hr': Dr 3010 / Cr 3000 round amount —
--       the pot belongs to HR once staged, so the per-bank table shows the
--       depts' HL slices down and HR's Alliance slice up (not per-dept slices)
--   Stage-G staff payouts + statutory PVs: drain dept_pool_hr only, pay from
--     Alliance, JE segment 'hr' (bank-slice attribution; P&L already booked).
--   Directors: unchanged (dept_pool_director; segment 'director').

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approve_single_voucher — custody semantics for payroll_bank_transfer.
-- ─────────────────────────────────────────────────────────────────────────────
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
    v_je_date       DATE;
    v_je_period     DATE;
    v_repay_date    DATE;
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
    v_dest_bank     RECORD;
    v_xfer_entry_no VARCHAR(30);
    v_xfer_entry_id UUID;
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
           pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type, pv.payment_date
      INTO v_voucher FROM payment_vouchers pv
     WHERE pv.id = v_approval.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: voucher % does not exist', v_approval.reference_id; END IF;
    IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_single_voucher: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;

    -- Mig 20260720: payroll_bank_transfer is a REAL Hong Leong → Alliance
    -- staging transfer. Resolve the destination up front so nothing mutates if
    -- the Alliance account is missing/misconfigured.
    IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
        SELECT id, gl_account_code, bank_name INTO v_dest_bank
          FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
        IF v_dest_bank.id IS NULL THEN
            RAISE EXCEPTION 'approve_single_voucher: no active Alliance payroll bank (GL 3010) found for payroll staging transfer';
        END IF;
        IF v_voucher.bank_account_id IS NOT NULL AND v_voucher.bank_account_id = v_dest_bank.id THEN
            RAISE EXCEPTION 'approve_single_voucher: source bank for voucher % is already the Alliance payroll account - pick the bank the cash comes FROM', v_voucher.voucher_no;
        END IF;
    END IF;

    IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
        SELECT current_balance, bank_name, gl_account_code INTO v_bank
          FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: bank account % not found', v_voucher.bank_account_id; END IF;
        IF v_bank.current_balance < v_voucher.amount THEN
            RAISE EXCEPTION 'approve_single_voucher: bank % has RM % but voucher requires RM %', v_bank.bank_name, v_bank.current_balance, v_voucher.amount;
        END IF;
        v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
    END IF;

    v_je_date := COALESCE(v_voucher.payment_date, v_today);
    v_je_period := DATE_TRUNC('month', v_je_date)::DATE;
    v_repay_date := LEAST(v_je_date, v_today);
    IF is_period_locked(v_je_date) THEN RAISE EXCEPTION 'approve_single_voucher: accounting period % is closed (voucher payment date %)', TO_CHAR(v_je_period, 'Mon YYYY'), v_je_date; END IF;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE id=p_approval_id AND status='pending';

    UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now, executed_by=p_user_id, executed_at=v_now, payment_date=COALESCE(payment_vouchers.payment_date, v_today), notes=p_notes
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

    IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
        UPDATE bank_accounts SET current_balance = current_balance + v_voucher.amount WHERE id = v_dest_bank.id;
    END IF;

    IF v_voucher.direction = 'debit' THEN
        SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
        IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_single_voucher: voucher % has no payment_voucher_sources rows - debit cannot route', v_voucher.id; END IF;
        -- Mig 20260720140000 (custody model): payroll_bank_transfer DRAINS each
        -- source dept pool by the typed share (预支 auto-allowed) and then
        -- parks the FULL round amount in HR's pool below. Payouts/statutory
        -- (payroll_disbursement / payroll_statutory refs) drain HR's pool with
        -- auto-overdraw too.
        IF v_voucher.voucher_type <> 'internal_transfer' AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
            IF p_allow_overdraw OR v_voucher.voucher_type = 'payroll_bank_transfer'
               OR COALESCE(v_voucher.reference_type, '') IN ('payroll_disbursement', 'payroll_statutory') THEN
                PERFORM set_config('app.allow_pool_overdraw', 'on', true);
            END IF;
            FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
            LOOP
                PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                    p_user_id, p_approval_id, v_now, v_voucher.loan_id);
            END LOOP;
        END IF;
        -- Custody credit: the WHOLE round (including HR's own contribution —
        -- the old fan-out's missing piece) lands in HR's pool for safekeeping
        -- until payday.
        IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
            PERFORM apply_pool_adjustment('dept_pool_hr', 'in', v_voucher.amount,
                format('PV %s: payroll fund → HR custody', v_voucher.voucher_no),
                p_user_id, p_approval_id, v_now, NULL);
        END IF;
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
            IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
        ELSIF v_voucher.loan_id IS NOT NULL THEN
            IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
            IF v_principal > 0 THEN INSERT INTO venture_pool(transaction_type, amount, description, reference_id, reference_table, created_by) VALUES ('loan_repayment_in', v_principal, format('Loan principal repayment — PV %s', v_voucher.voucher_no), v_voucher.loan_id, 'loans', p_user_id); END IF;
            SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id = v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
            IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
        END IF;
    END IF;

    v_seq := nextval('journal_entry_no_seq');
    v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

    IF v_voucher.direction = 'credit' THEN
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
        VALUES (v_entry_no, v_je_date, v_je_period,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit - %s', v_voucher.voucher_no)),
            (v_entry_id, '3030',         NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
    ELSIF v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer', 'expense', 'claim_payout') AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
        v_voucher_default_dr := CASE
            WHEN v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer') THEN '9030'
            ELSE '9000'
        END;
        v_first_entry_id := NULL;
        FOR v_pvs_row IN
            SELECT pvs.pool, pvs.amount, pvs.account_code,
                   pvs.override_gl_account_code
              FROM payment_voucher_sources pvs
             WHERE pvs.voucher_id = v_voucher.id
             ORDER BY pvs.pool
        LOOP
            v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.account_code, v_voucher_default_dr);

            IF v_first_entry_id IS NOT NULL THEN
                v_seq := nextval('journal_entry_no_seq');
                v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
            END IF;

            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
            VALUES (v_entry_no, v_je_date, v_je_period,
                    format('PV %s: %s [%s]', v_voucher.voucher_no, v_voucher.description, v_pvs_row.pool),
                    'payment_voucher', v_voucher.id, v_pvs_row.amount, p_user_id,
                    pool_key_to_segment(v_pvs_row.pool))
            RETURNING id INTO v_entry_id;

            -- Stage-E funding accrues to Salary Payable (4020), NOT the bank —
            -- the per-employee Stage-G PV clears 4020 against the bank when
            -- staff are actually paid.
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                 format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)),
                (v_entry_id,
                 CASE WHEN v_voucher.voucher_type = 'payroll_bank_transfer' THEN '4020' ELSE v_bank_gl_code END,
                 NULL, v_pvs_row.amount,
                 CASE WHEN v_voucher.voucher_type = 'payroll_bank_transfer'
                      THEN format('Salary Payable accrual - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool)
                      ELSE format('Bank payment - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool) END);

            IF v_first_entry_id IS NULL THEN v_first_entry_id := v_entry_id; END IF;
        END LOOP;
        v_entry_id := v_first_entry_id;

        -- Mig 20260720140000: ONE staging-transfer JE per funding PV, tagged
        -- segment='hr' — once staged, the pot is HR's (custody), so HR's
        -- Alliance slice rises while each dept's row shrinks via its pool
        -- balance. (The per-dept slices were the 20260720100000 model.)
        IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
            v_seq := nextval('journal_entry_no_seq');
            v_xfer_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
            VALUES (v_xfer_entry_no, v_je_date, v_je_period,
                    format('PV %s: payroll fund staged to %s (HR custody)', v_voucher.voucher_no, v_dest_bank.bank_name),
                    'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id,
                    'hr'::gl_segment)
            RETURNING id INTO v_xfer_entry_id;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_xfer_entry_id, COALESCE(v_dest_bank.gl_account_code, '3010'), v_voucher.amount, NULL,
                 format('Payroll staging in - %s', v_voucher.voucher_no)),
                (v_xfer_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
                 format('Payroll staging out - %s', v_voucher.voucher_no));
        END IF;
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
        VALUES (v_entry_no, v_je_date, v_je_period,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. derive_journal_segment — payout JEs belong to HR's bank slice (custody);
--    director payouts to 'director' (matches dept_pool_director).
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
    v_src TEXT;
    v_anchor TEXT;
    v_repl TEXT;
    v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('derive_journal_segment(text,uuid)'::regprocedure);

    v_anchor := 'IF v_pv_ref_type = ''payroll_disbursement'' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name
              FROM hr_monthly_payroll mp
              JOIN hr_staff_costs s ON s.id = mp.staff_id
              LEFT JOIN departments d ON d.id = s.department_id
             WHERE mp.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN
                RETURN dept_to_segment(v_dept_name);
            END IF;
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN ''director_office''::gl_segment;
            END IF;
        END IF;';
    v_repl := 'IF v_pv_ref_type = ''payroll_disbursement'' AND v_pv_ref_id IS NOT NULL THEN
            -- Mig 20260720140000 (custody model): staff payouts spend HR''s
            -- staged Alliance pot → segment hr; director payouts spend the
            -- Director pool''s staged cash → segment director.
            IF EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = v_pv_ref_id) THEN
                RETURN ''hr''::gl_segment;
            END IF;
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN ''director''::gl_segment;
            END IF;
        END IF;';

    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720140000: expected exactly 1 payroll_disbursement anchor in derive_journal_segment, found %', v_cnt;
    END IF;
    EXECUTE replace(v_src, v_anchor, v_repl);
END;
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Stage-G disbursement: staff vouchers drain dept_pool_hr again (custody).
--    Anchored transform of the live def (the per-staff-dept mapping block from
--    mig 20260720100000 is replaced by the constant).
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
    v_src TEXT;
    v_anchor TEXT;
    v_repl TEXT;
    v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('create_payroll_disbursement_vouchers(date)'::regprocedure);

    v_anchor := 'v_staff_pool := CASE v_row.dept_name
            WHEN ''HR''              THEN ''dept_pool_hr''
            WHEN ''Finance''         THEN ''dept_pool_finance''
            WHEN ''Marketing''       THEN ''dept_pool_marketing''
            WHEN ''Director Office'' THEN ''dept_pool_director_office''
            WHEN ''Director''        THEN ''dept_pool_director''
            ELSE NULL
        END;
        IF v_staff_pool IS NULL THEN
            RAISE EXCEPTION ''create_payroll_disbursement_vouchers: staff "%" has department "%" with no mapped dept pool — fix the staff record first'',
                v_row.employee_name, COALESCE(v_row.dept_name, ''(none)'');
        END IF;';
    v_repl := '-- Mig 20260720140000 (custody model): every staff payout drains the
        -- HR custody pool — the departments already paid their shares at funding.
        v_staff_pool := ''dept_pool_hr'';';

    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720140000: expected exactly 1 staff-pool anchor in create_payroll_disbursement_vouchers, found %', v_cnt;
    END IF;
    EXECUTE replace(v_src, v_anchor, v_repl);
END;
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Statutory vouchers: five PVs (KWSP / SOCSO / EIS / LHDN / SKBBK), each a
--    single payment draining dept_pool_hr (custody). Signature back to 2 args.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_payroll_statutory_vouchers(date, uuid, boolean);
DROP FUNCTION IF EXISTS public.create_payroll_statutory_vouchers(date, uuid);

CREATE FUNCTION public.create_payroll_statutory_vouchers(p_period date, p_bank_account_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
    v_existing INTEGER;
    v_bank RECORD;
    v_body RECORD;
    v_voucher_no TEXT;
    v_voucher_period TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_pv_total DECIMAL(15, 2);
    v_count INTEGER := 0;
    v_grand DECIMAL(15, 2) := 0;
    v_vouchers JSONB := '[]'::JSONB;
    v_period_label TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT id, status INTO v_run_id, v_run_status
    FROM payroll_runs
    WHERE period_month = p_period AND status <> 'rejected';
    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state % — statutory vouchers need an approved run.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = v_run_id AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1;
    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'Payroll funding for period % is not completed yet.', p_period;
    END IF;

    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.status <> 'voided';
    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Statutory vouchers already exist for period % (% non-voided). Void them first to regenerate.', p_period, v_existing;
    END IF;

    SELECT id, bank_name, status INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id;
    IF v_bank.id IS NULL OR v_bank.status <> 'active' THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: bank % is not an active bank', p_bank_account_id;
    END IF;

    v_voucher_period := to_char(now(), 'YYYYMM');
    v_period_label := to_char(p_period, 'Mon YYYY');

    -- One voucher per scheme, one payment to its body, drained from the HR
    -- custody pool (the departments already contributed at funding).
    FOR v_body IN
        SELECT * FROM (VALUES
            ('KWSP',            'KWSP (EPF) — '),
            ('PERKESO (SOCSO)', 'SOCSO — '),
            ('PERKESO (EIS)',   'EIS — '),
            ('LHDN',            'LHDN (PCB) — '),
            ('SKBBK',           'SKBBK — ')
        ) AS b(payee, descr_prefix)
    LOOP
        SELECT COALESCE(SUM(
            CASE v_body.payee
                WHEN 'KWSP'            THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                WHEN 'PERKESO (SOCSO)' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                WHEN 'PERKESO (EIS)'   THEN COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                WHEN 'LHDN'            THEN COALESCE(mp.pcb, 0)
                WHEN 'SKBBK'           THEN COALESCE(mp.skbbk_amount, 0)
                ELSE 0
            END), 0)
          INTO v_pv_total
          FROM hr_monthly_payroll mp
         WHERE mp.period_month = p_period;

        IF v_pv_total <= 0 THEN
            CONTINUE;
        END IF;

        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency, payee_name, description,
            payment_method, payment_date,
            source_pool, bank_account_id,
            reference_type, reference_id, created_by
        ) VALUES (
            v_voucher_no, 'expense', 'debit', 'pending_approval',
            v_pv_total, 'MYR', v_body.payee,
            v_body.descr_prefix || v_period_label || ' payroll',
            'bank_transfer', NULL,
            'dept_pool_hr', v_bank.id,
            'payroll_statutory', v_run_id, v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
        VALUES (v_voucher_id, 'dept_pool_hr', v_pv_total, '4020');

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount, status, workflow_state
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
            v_voucher_no || ': ' || v_body.payee || ' — ' || v_period_label ||
                ' payroll — RM ' || to_char(v_pv_total, 'FM999,999,999.00'),
            v_pv_total, 'pending', 'submitted'
        );

        v_count := v_count + 1;
        v_grand := v_grand + v_pv_total;
        v_vouchers := v_vouchers || jsonb_build_object(
            'id', v_voucher_id, 'voucher_no', v_voucher_no,
            'payee', v_body.payee, 'amount', v_pv_total);
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No statutory amounts found for period % — nothing to generate.', p_period;
    END IF;

    RETURN json_build_object('count', v_count, 'total', v_grand, 'vouchers', v_vouchers);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, uuid) IS
    'Mig 20260720140000 (custody model): five statutory PVs per period (KWSP / PERKESO-SOCSO / PERKESO-EIS / LHDN / SKBBK), each one payment to its body drained from dept_pool_hr. payment_date NULL for Finance to set.';

COMMIT;
