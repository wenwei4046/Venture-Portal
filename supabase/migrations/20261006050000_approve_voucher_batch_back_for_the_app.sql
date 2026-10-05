-- 20261006050000_approve_voucher_batch_back_for_the_app.sql
--
-- 20261006020000 made approve_voucher_batch service-role only, on a search
-- for the app's calls that read `rpc('name'` on ONE line. approvals/actions.ts
-- (performGroupApproval — a payroll disbursement's vouchers approved as one
-- group) writes the name on the next line, so the search missed it and the
-- Principal's "approve the group" would have been refused (permission denied)
-- from the moment 020000 went live. A side review asked for a wider search the
-- same day; it found this one and nothing else (bare names across src /
-- scripts / tools, dynamic and multi-line calls, views, policies, INVOKER and
-- trigger callers). The postgres log shows nobody was refused in between.
--
-- It is the app's again — with the guard the other approvals got: a JWT
-- caller whose auth.uid() is not the p_user_id handed in is refused (42501).
--
-- Production took it as a DO block that inserted the guard into the live
-- definition and checked it by md5 (as 020000 did). Below is the result in
-- full — the 20261006040000 copy with the guard after the body's first BEGIN —
-- so this file stays the function's latest full copy; its body hashes as
-- production's (md5(prosrc) 8f1186ccaa0a123c38f512e97496ad4a).

CREATE OR REPLACE FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text)
 RETURNS TABLE(voucher_id uuid, voucher_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_je_date       DATE;
    v_je_period     DATE;
    v_repay_date    DATE;
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
    v_first_entry_id UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
BEGIN
 -- Only as yourself (2026-10-06): the id handed in must be the caller's own.
 IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'approve_voucher_batch: you can only approve as yourself' USING ERRCODE = '42501';
 END IF;
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role; END IF;

    IF NOT EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: no pending payment_voucher approvals in group %', p_group_id;
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND submitted_by = p_user_id) THEN
        NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type <> 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: group contains non-payment_voucher approvals';
    END IF;

    FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher'
    LOOP
        IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: approval % has null reference_id', v_approval.id; END IF;
        SELECT id, direction, amount, bank_account_id, status, payment_date INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;
        IF is_period_locked(COALESCE(v_voucher.payment_date, v_today)) THEN
            RAISE EXCEPTION 'approve_voucher_batch: accounting period for voucher % (payment date %) is closed', v_voucher.id, COALESCE(v_voucher.payment_date, v_today);
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
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: bank account % not found', v_bank_key; END IF;
        IF v_available < v_required THEN RAISE EXCEPTION 'approve_voucher_batch: bank % has RM % but batch requires RM %', v_bank_key, v_available, v_required; END IF;
    END LOOP;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE group_id = p_group_id AND status = 'pending';

    FOR v_approval IN SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
         WHERE group_id = p_group_id AND approved_by = p_user_id AND approved_at = v_now AND request_type = 'payment_voucher' ORDER BY created_at
    LOOP
        UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now,
               executed_by=p_user_id, executed_at=v_now,
               payment_date=COALESCE(payment_vouchers.payment_date, v_today), notes=p_notes
         WHERE id = v_approval.voucher_id AND status='pending_approval'
        RETURNING payment_vouchers.id, payment_vouchers.voucher_no, payment_vouchers.voucher_type,
                  payment_vouchers.direction, payment_vouchers.amount, payment_vouchers.description,
                  payment_vouchers.payee_name, payment_vouchers.bank_account_id, payment_vouchers.target_pool,
                  payment_vouchers.fund_source_id, payment_vouchers.loan_id, payment_vouchers.repayment_breakdown,
                  payment_vouchers.reference_type, payment_vouchers.reference_id, payment_vouchers.payment_date
          INTO v_voucher;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: race - voucher % flipped out from under us', v_approval.voucher_id; END IF;

        v_je_date := COALESCE(v_voucher.payment_date, v_today);
        v_je_period := DATE_TRUNC('month', v_je_date)::DATE;
        v_repay_date := LEAST(v_je_date, v_today);

        v_bank_gl_code := '3000';
        IF v_voucher.bank_account_id IS NOT NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
                -- Mig 20260721010000: same guard as approve_single_voucher —
                -- an outgoing voucher must fit in the bank.
                IF v_voucher.direction = 'debit' AND v_bank.current_balance < v_voucher.amount THEN
                    RAISE EXCEPTION 'voucher % needs RM % but the bank only holds RM %', v_voucher.voucher_no, v_voucher.amount, v_bank.current_balance;
                END IF;
                v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                UPDATE bank_accounts SET current_balance = current_balance + CASE WHEN v_voucher.direction='credit' THEN v_voucher.amount ELSE -v_voucher.amount END WHERE id=v_voucher.bank_account_id; -- relative: the paid-status trigger may already have bumped this row (same-bank clobber fix 2026-08-07)
            END IF;
        END IF;

        IF v_voucher.direction = 'debit' THEN
            SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
            IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % has no payment_voucher_sources rows', v_voucher.id; END IF;
            IF v_voucher.voucher_type <> 'internal_transfer' AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
                IF v_voucher.voucher_type = 'payroll_bank_transfer' OR COALESCE(v_voucher.reference_type, '') IN ('payroll_disbursement', 'payroll_statutory') THEN PERFORM set_config('app.allow_pool_overdraw', 'on', true); END IF;
                FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
                LOOP
                    PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                        format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
                END LOOP;
            END IF;
        -- Custody credit (mig 20260731010000): mirror approve_single_voucher —
        -- the WHOLE round parks in the pool its funding request targets
        -- (staff → dept_pool_hr, director → dept_pool_director).
        IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
            PERFORM apply_pool_adjustment(
                COALESCE((SELECT ppr.target_pool
                            FROM payroll_payment_requests ppr
                           WHERE v_voucher.reference_type = 'payroll_payment_request'
                             AND ppr.id = v_voucher.reference_id), 'dept_pool_hr'),
                'in', v_voucher.amount,
                format('PV %s: payroll fund → custody pool', v_voucher.voucher_no),
                p_user_id, v_approval.approval_id, v_now, NULL);
        END IF;
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
                IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            ELSIF v_voucher.loan_id IS NOT NULL THEN
                IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO venture_pool(transaction_type, amount, description, reference_id, reference_table, created_by) VALUES ('loan_repayment_in', v_principal, format('Loan principal repayment — PV %s', v_voucher.voucher_no), v_voucher.loan_id, 'loans', p_user_id); END IF;
                SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id=v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
                IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
            END IF;
        END IF;

        v_seq := nextval('journal_entry_no_seq');
        v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

        IF v_voucher.direction = 'credit' THEN
            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit - %s', v_voucher.voucher_no)),
                (v_entry_id, public.ar_account_for_voucher(v_voucher.id), NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
        ELSIF v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer', 'expense', 'claim_payout') AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
            v_voucher_default_dr := CASE
                WHEN v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer') THEN '9030'
                ELSE '9000'
            END;
            v_first_entry_id := NULL;
            FOR v_pvs_row IN
                SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code
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

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                     format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)),
                    (v_entry_id, v_bank_gl_code, NULL, v_pvs_row.amount,
                     format('Bank payment - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool));

                IF v_first_entry_id IS NULL THEN v_first_entry_id := v_entry_id; END IF;
            END LOOP;
            v_entry_id := v_first_entry_id;
        ELSE
            v_voucher_default_dr := CASE
                WHEN v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment' THEN '3020'
                WHEN v_voucher.reference_type = 'dept_payment_request' THEN '4050'
                WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '4000'
                WHEN v_voucher.voucher_type = 'billing_payment'   THEN '4050'
                WHEN v_voucher.voucher_type = 'salary_payout'     THEN '4020'
                ELSE '9000'
            END;

            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;

            FOR v_pvs_row IN SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code, pvs.account_code AS category_gl
                FROM payment_voucher_sources pvs WHERE pvs.voucher_id = v_voucher.id
            LOOP
                v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);
                IF (v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment')
                   OR v_voucher.reference_type = 'dept_payment_request'
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
    END LOOP;
    RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text) TO authenticated;

NOTIFY pgrst, 'reload schema';
