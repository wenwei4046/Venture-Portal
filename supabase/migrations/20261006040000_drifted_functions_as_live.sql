-- 20261006040000_drifted_functions_as_live.sql
--
-- What production runs, kept here again (2026-10-06). These nine functions'
-- last full copies in supabase/migrations no longer matched production:
-- some were changed straight on the database over the months, and five got
-- today's guards inserted into their LIVE definitions (20261006020000, the
-- "act only as yourself" checks and Payroll Requests' gate). Whoever next
-- edited one of them from its old file — a person or Claude — would have put
-- the old body back over production's, guards included, without a sound.
--
-- Below is each function exactly as pg_get_functiondef printed it from
-- production, its body checked against md5(prosrc) when it was read. Applied
-- to production it changes nothing: CREATE OR REPLACE with the same text, and
-- the privileges set by 20261006010000 / 020000 / 030000 stay as they are.
--
-- Before editing any function, compare its last copy here with production
-- (md5(prosrc)) first — CLAUDE.md › Do NOT.

-- apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid) — live md5(prosrc) d56823837d79e886393ce7b30056d66f
CREATE OR REPLACE FUNCTION public.apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_dept_name TEXT;
    v_dept_id   UUID;
    v_vp_type   hv_fund_txn_type;
BEGIN
    IF p_pool = 'venture_pool' THEN
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

        IF v_dept_name IS NOT NULL THEN
            SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
        ELSE
            SELECT id, name INTO v_dept_id, v_dept_name
            FROM departments
            WHERE segment_key = substring(p_pool from 11)
            LIMIT 1;
        END IF;

        IF v_dept_id IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: unknown dept_pool identifier %', p_pool;
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
$function$;

-- approve_payroll_run(p_run_id uuid, p_approver uuid) — live md5(prosrc) ac249a7ac4b08dbfc43339dbae618db7
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid, p_approver uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_run           payroll_runs%ROWTYPE;
    v_approver_role user_role;
BEGIN
 -- Only as yourself (2026-10-06): the id handed in must be the caller's own.
 IF auth.uid() IS NOT NULL AND p_approver IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'approve_payroll_run: you can only approve as yourself' USING ERRCODE = '42501';
 END IF;
    -- Approver must exist, be active, and be Principal.
    SELECT role INTO v_approver_role
    FROM users
    WHERE id = p_approver AND is_active = TRUE;

    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_payroll_run: unknown or inactive user %', p_approver;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_payroll_run: only Principal may approve, got %',
            v_approver_role;
    END IF;

    -- Run must exist and be in submitted state.
    SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_payroll_run: run % not found', p_run_id;
    END IF;
    IF v_run.status <> 'submitted' THEN
        RAISE EXCEPTION
            'approve_payroll_run: run % status is %, must be submitted',
            p_run_id, v_run.status;
    END IF;

    -- Principal cannot approve their own submission.
    IF v_run.submitted_by = p_approver THEN
        NULL;
    END IF;

    -- The only state change: data approval.
    -- No PV fan-out. No alliance_bank_pool write. No hr_monthly_payroll flip.
    -- Stages B-G happen via separate, explicit actions (invoices, payment
    -- requests, PVs) downstream of this approval.
    UPDATE payroll_runs
       SET status      = 'approved',
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = p_run_id;

    -- Also mark the linked approval_requests row as approved so Finance's
    -- Approvals queue clears this entry.
    UPDATE approval_requests
       SET status         = 'approved',
           workflow_state = 'approved',
           approved_by    = p_approver,
           approved_at    = NOW()
     WHERE id = v_run.approval_id;

    -- Audit trail.
    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_approver, 'payroll_run', p_run_id::TEXT, 'approve_data_only',
        jsonb_build_object(
            'period',         v_run.period_month,
            'total_amount',   v_run.total_amount,
            'semantics',      'data-only approval; no money movement'
        )
    );
END;
$function$;

-- approve_single_voucher(p_approval_id uuid, p_user_id uuid, p_notes text, p_allow_overdraw boolean) — live md5(prosrc) 5e42956a5b51e4e3cfa93b32e7850973
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
 -- Only as yourself (2026-10-06): the id handed in must be the caller's own.
 IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'approve_single_voucher: you can only approve as yourself' USING ERRCODE = '42501';
 END IF;
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_single_voucher: only Principal may approve, got %', v_approver_role; END IF;
    IF is_period_locked(v_today) THEN RAISE EXCEPTION 'approve_single_voucher: accounting period % is closed', TO_CHAR(v_period_month, 'Mon YYYY'); END IF;

    SELECT id, reference_id, submitted_by, request_type, group_id INTO v_approval
      FROM approval_requests WHERE id = p_approval_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: approval % not found or not pending', p_approval_id; END IF;
    IF v_approval.request_type <> 'payment_voucher' THEN RAISE EXCEPTION 'approve_single_voucher: approval % is request_type=% (expected payment_voucher)', p_approval_id, v_approval.request_type; END IF;
    IF v_approval.group_id IS NOT NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % is part of group % - use approve_voucher_batch', p_approval_id, v_approval.group_id; END IF;
    IF v_approval.submitted_by = p_user_id THEN NULL; END IF;
    IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_single_voucher: approval % has null reference_id', p_approval_id; END IF;

    SELECT pv.id, pv.voucher_no, pv.voucher_type, pv.direction, pv.amount, pv.description,
           pv.payee_name, pv.bank_account_id, pv.target_pool, pv.fund_source_id,
           pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type, pv.reference_id, pv.payment_date
      INTO v_voucher FROM payment_vouchers pv
     WHERE pv.id = v_approval.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'approve_single_voucher: voucher % does not exist', v_approval.reference_id; END IF;
    IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_single_voucher: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;

    -- Mig 20260720: payroll_bank_transfer is a REAL Hong Leong → Alliance
    -- staging transfer. Resolve the destination up front so nothing mutates if
    -- the Alliance account is missing/misconfigured.
    IF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
        SELECT b.id, b.gl_account_code, b.bank_name INTO v_dest_bank
          FROM bank_accounts b
         WHERE b.status = 'active'
           AND b.gl_account_code = COALESCE(
                 (SELECT s.account_code FROM payment_voucher_sources s
                   WHERE s.voucher_id = v_voucher.id AND COALESCE(s.role, '') <> 'mirror'
                   LIMIT 1),
                 '3010')
         LIMIT 1;
        IF v_dest_bank.id IS NULL THEN
            RAISE EXCEPTION 'approve_single_voucher: no active destination payroll bank found for staging transfer (voucher %)', v_voucher.voucher_no;
        END IF;
        -- Same-bank funding allowed (2026-08-04): payroll can pay out of the
        -- bank the cash already sits in. The staging JE debits and credits the
        -- same GL and the source/dest cache moves cancel - only the pool
        -- bookkeeping (drain dept pools, park in custody) has net effect.
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
        UPDATE bank_accounts SET current_balance = current_balance + CASE WHEN v_voucher.direction='credit' THEN v_voucher.amount ELSE -v_voucher.amount END WHERE id=v_voucher.bank_account_id; -- relative: the paid-status trigger may already have bumped this row (same-bank clobber fix 2026-08-07)
    END IF;

    -- Mig 20260720160000: dest (Alliance) cache credit now comes from the
    -- credit_dest_bank_on_bank_transfer trigger — funding PVS rows carry
    -- account_code 3010, same mechanism as internal_transfer.

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
            -- Mig 20260727100000: custody follows the request's target_pool —
            -- staff rounds park in dept_pool_hr, director rounds in
            -- dept_pool_director (their payouts drain that pool).
            PERFORM apply_pool_adjustment(
                COALESCE((SELECT ppr.target_pool
                            FROM payroll_payment_requests ppr
                           WHERE v_voucher.reference_type = 'payroll_payment_request'
                             AND ppr.id = v_voucher.reference_id), 'dept_pool_hr'),
                'in', v_voucher.amount,
                format('PV %s: payroll fund → custody pool', v_voucher.voucher_no),
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
            (v_entry_id, public.ar_account_for_voucher(v_voucher.id),         NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
    ELSIF v_voucher.voucher_type = 'payroll_bank_transfer' THEN
        -- Mig 20260720160000: funding is a PURE fund transfer — the payroll
        -- expense is booked by Finance's month-end per-segment JVs
        -- (Dr 9030/9084/9081-83 / Cr 4070-4074). One hr-segment staging JE:
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
        VALUES (v_entry_no, v_je_date, v_je_period,
                format('PV %s: payroll fund staged to %s (HR custody)', v_voucher.voucher_no, v_dest_bank.bank_name),
                'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id,
                CASE WHEN COALESCE((SELECT ppr.target_pool
                                      FROM payroll_payment_requests ppr
                                     WHERE v_voucher.reference_type = 'payroll_payment_request'
                                       AND ppr.id = v_voucher.reference_id), 'dept_pool_hr') = 'dept_pool_director'
                     THEN 'director'::gl_segment
                     ELSE 'hr'::gl_segment END)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, COALESCE(v_dest_bank.gl_account_code, '3010'), v_voucher.amount, NULL,
             format('Payroll staging in - %s', v_voucher.voucher_no)),
            (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
             format('Payroll staging out - %s', v_voucher.voucher_no));
    ELSIF v_voucher.voucher_type IN ('internal_transfer', 'expense', 'claim_payout') AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
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

-- approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text) — live md5(prosrc) 70ab53a9b38babd1b8667134f1016f07
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

-- approve_voucher_batch_partial(p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text) — live md5(prosrc) e2409cec59d311b60c074c42b624269f
CREATE OR REPLACE FUNCTION public.approve_voucher_batch_partial(p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text)
 RETURNS TABLE(voucher_id uuid, voucher_no text, outcome text)
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
    v_first_entry_id UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
    v_rej_voucher_id UUID;
BEGIN
 -- Only as yourself (2026-10-06): the id handed in must be the caller's own.
 IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'approve_voucher_batch_partial: you can only approve as yourself' USING ERRCODE = '42501';
 END IF;
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch_partial: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: only Principal may approve, got %', v_approver_role; END IF;

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
        NULL;
    END IF;

    FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE id=ANY(p_approve_ids) AND status='pending' AND request_type='payment_voucher'
    LOOP
        SELECT id, direction, amount, bank_account_id, status, payment_date INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % status is %', v_voucher.id, v_voucher.status; END IF;
        IF is_period_locked(COALESCE(v_voucher.payment_date, v_today)) THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: accounting period for voucher % (payment date %) is closed', v_voucher.id, COALESCE(v_voucher.payment_date, v_today);
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
                UPDATE payment_vouchers SET status='voided', notes=p_reject_reason WHERE id=v_rej_voucher_id AND status='pending_approval';
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
                   executed_by=p_user_id, executed_at=v_now,
                   payment_date=COALESCE(payment_vouchers.payment_date, v_today), notes=p_approve_notes
             WHERE id=v_approval.voucher_id AND status='pending_approval'
            RETURNING id, voucher_no, voucher_type, direction, amount, description, payee_name,
                      bank_account_id, target_pool, fund_source_id, loan_id, repayment_breakdown, reference_type, reference_id, payment_date
              INTO v_voucher;
            IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: race - voucher % flipped', v_approval.voucher_id; END IF;

            v_je_date := COALESCE(v_voucher.payment_date, v_today);
            v_je_period := DATE_TRUNC('month', v_je_date)::DATE;
            v_repay_date := LEAST(v_je_date, v_today);

            v_bank_gl_code := '3000';
            IF v_voucher.bank_account_id IS NOT NULL THEN
                SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id=v_voucher.bank_account_id FOR UPDATE;
                IF FOUND THEN
                    v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
                    v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                    UPDATE bank_accounts SET current_balance = current_balance + CASE WHEN v_voucher.direction='credit' THEN v_voucher.amount ELSE -v_voucher.amount END WHERE id=v_voucher.bank_account_id; -- relative: the paid-status trigger may already have bumped this row (same-bank clobber fix 2026-08-07)
                END IF;
            END IF;

            IF v_voucher.direction='debit' THEN
                SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id;
                IF v_pvs_count=0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % has no source rows', v_voucher.id; END IF;
                IF v_voucher.voucher_type <> 'internal_transfer' AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
                IF v_voucher.voucher_type = 'payroll_bank_transfer' OR COALESCE(v_voucher.reference_type, '') IN ('payroll_disbursement', 'payroll_statutory') THEN PERFORM set_config('app.allow_pool_overdraw', 'on', true); END IF;
                    FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id
                    LOOP
                        PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                            format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
                    END LOOP;
                END IF;
            -- Custody credit (mig 20260731010000): mirror approve_single_voucher.
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

            IF v_voucher.direction='credit' THEN
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
                    FROM payment_voucher_sources pvs WHERE pvs.voucher_id=v_voucher.id
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
            outcome := 'approved';
            RETURN NEXT;
        END LOOP;
    END IF;
    RETURN;
END;
$function$;

-- get_payroll_breakdown_by_pool(p_request_id uuid) — live md5(prosrc) 2aa983c9b754c3757ebaf895c65d3abc
CREATE OR REPLACE FUNCTION public.get_payroll_breakdown_by_pool(p_request_id uuid)
 RETURNS TABLE(pool_key text, dept_name text, required_amount numeric, pool_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period DATE;
    v_run_id UUID;
    v_amount DECIMAL(15, 2);
    v_batch  payroll_batches%ROWTYPE;
BEGIN
 -- Payroll Requests' own gate (2026-10-06): treasury, and payroll payouts or HR costing.
 IF auth.uid() IS NOT NULL AND NOT (public.has_perm('treasury') AND (public.has_perm('payroll_payouts') OR public.has_perm('hr_costing'))) THEN
  RAISE EXCEPTION 'get_payroll_breakdown_by_pool: payroll payouts are not yours to read' USING ERRCODE = '42501';
 END IF;
    SELECT COALESCE(pr.period_month, ppr.period_month), ppr.payroll_run_id, ppr.amount
      INTO v_period, v_run_id, v_amount
      FROM payroll_payment_requests ppr
      LEFT JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;
    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or has no period', p_request_id;
    END IF;

    SELECT b.* INTO v_batch FROM payroll_batches b
      JOIN payroll_payment_requests q ON q.batch_id = b.id WHERE q.id = p_request_id;

    IF FOUND AND NOT v_batch.legacy THEN
        RETURN QUERY
        SELECT CASE WHEN l.bucket = 'director' THEN 'dept_pool_director'
                    ELSE 'dept_pool_' || coalesce(d.segment_key, l.segment_key) END::TEXT,
               CASE WHEN l.bucket = 'director' THEN 'Director' ELSE coalesce(d.name, l.department_name) END::TEXT,
               sum(l.ctc)::DECIMAL(15, 2),
               coalesce((SELECT dpb.balance FROM dept_pool_balances dpb
                          WHERE dpb.department_id = CASE WHEN l.bucket = 'director'
                                THEN (SELECT id FROM departments WHERE segment_key = 'director' LIMIT 1)
                                ELSE l.department_id END), 0)::DECIMAL(15, 2)
          FROM payroll_batch_lines l
          LEFT JOIN departments d ON d.id = l.department_id
         WHERE l.batch_id = v_batch.id
         GROUP BY 1, 2, l.bucket, l.department_id
        HAVING sum(l.ctc) <> 0
         ORDER BY 2;
        RETURN;
    END IF;

    IF v_run_id IS NULL THEN
        RETURN QUERY
        SELECT 'dept_pool_director'::TEXT, 'Director'::TEXT, v_amount,
               COALESCE((SELECT dpb.balance FROM dept_pool_balances dpb
                          JOIN departments d ON d.id = dpb.department_id WHERE d.name = 'Director'), 0)::DECIMAL(15, 2);
        RETURN;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        SELECT d.segment_key AS seg, d.name AS d_name, d.id AS d_id,
               COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp ON hmp.staff_id = hsc.id AND hmp.period_month = v_period
         WHERE d.segment_key IS NOT NULL AND d.is_internal = false AND d.segment_key <> 'director'
         GROUP BY d.id, d.name, d.segment_key
    )
    SELECT ('dept_pool_' || hpt.seg)::TEXT, hpt.d_name, hpt.total,
           COALESCE((SELECT balance FROM dept_pool_balances WHERE department_id = hpt.d_id), 0)::DECIMAL(15, 2)
      FROM hr_payroll_totals hpt
     WHERE hpt.total > 0 OR hpt.seg IN ('hr', 'finance', 'director_office', 'marketing')
     ORDER BY CASE hpt.seg WHEN 'hr' THEN 1 WHEN 'finance' THEN 2 WHEN 'director_office' THEN 3
                           WHEN 'marketing' THEN 4 ELSE 5 END, hpt.d_name;
END;
$function$;

-- post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment) — live md5(prosrc) a682bcdec54abfaf1fef97955fe86d53
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment DEFAULT 'unallocated'::gl_segment)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period_month   DATE;
    v_period_key     TEXT;
    v_total_debit    DECIMAL(15, 2) := 0;
    v_total_credit   DECIMAL(15, 2) := 0;
    v_line           JSONB;
    v_line_debit     DECIMAL(15, 2);
    v_line_credit    DECIMAL(15, 2);
    v_line_count     INT;
    v_seq            INT;
    v_entry_no       TEXT;
    v_entry_id       UUID;
BEGIN
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'post_journal_entry: p_lines must be a JSONB array';
    END IF;

    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count < 2 THEN
        RAISE EXCEPTION 'post_journal_entry: entry must have at least 2 lines (got %)', v_line_count;
    END IF;

    IF p_transaction_date IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_transaction_date is required';
    END IF;
    IF p_created_by IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_created_by is required';
    END IF;
    IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
        RAISE EXCEPTION 'post_journal_entry: p_description is required';
    END IF;

    v_period_month := date_trunc('month', p_transaction_date)::DATE;
    v_period_key   := to_char(v_period_month, 'YYYYMM');

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF NOT (v_line ? 'account_code')
           OR length(trim(v_line->>'account_code')) = 0 THEN
            RAISE EXCEPTION 'post_journal_entry: each line must have a non-empty account_code';
        END IF;

        v_line_debit  := COALESCE((v_line->>'debit')::DECIMAL(15,2),  0);
        v_line_credit := COALESCE((v_line->>'credit')::DECIMAL(15,2), 0);

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION 'post_journal_entry: negative amounts not allowed on line for % (debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        IF (v_line_debit > 0 AND v_line_credit > 0)
           OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION 'post_journal_entry: line for % must have exactly one of debit or credit (got debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        v_total_debit  := v_total_debit  + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'post_journal_entry: unbalanced entry — total debit % <> total credit %',
            v_total_debit, v_total_credit;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('je-' || v_period_key));

    SELECT COALESCE(
             MAX(NULLIF(substring(entry_no FROM 'JE-[0-9]{6}-([0-9]+)$'), '')::INT),
             0
           ) + 1
      INTO v_seq
      FROM journal_entries
     WHERE period_month = v_period_month;

    v_entry_no := 'JE-' || v_period_key || '-' || lpad(v_seq::TEXT, 4, '0');

    INSERT INTO journal_entries (
        entry_no, transaction_date, period_month, description,
        reference_type, reference_id, total_amount, segment, created_by
    ) VALUES (
        v_entry_no,
        p_transaction_date,
        v_period_month,
        p_description,
        NULLIF(p_reference_type, ''),
        p_reference_id,
        v_total_debit,
        p_segment,
        p_created_by
    )
    RETURNING id INTO v_entry_id;

    INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
    SELECT
        v_entry_id,
        trim(ln->>'account_code'),
        NULLIF((ln->>'debit')::DECIMAL(15,2),  0),
        NULLIF((ln->>'credit')::DECIMAL(15,2), 0),
        NULLIF(ln->>'description', '')
    FROM jsonb_array_elements(p_lines) ln;

    RETURN v_entry_id;
END;
$function$;

-- reject_payroll_run(p_run_id uuid, p_approver uuid, p_reason text) — live md5(prosrc) dd24f9dd4047b3c8df898b72792b477d
CREATE OR REPLACE FUNCTION public.reject_payroll_run(p_run_id uuid, p_approver uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_run            payroll_runs%ROWTYPE;
    v_approver_role  user_role;
BEGIN
 -- Only as yourself (2026-10-06): the id handed in must be the caller's own.
 IF auth.uid() IS NOT NULL AND p_approver IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'reject_payroll_run: you can only reject as yourself' USING ERRCODE = '42501';
 END IF;
    SELECT role INTO v_approver_role FROM users WHERE id = p_approver AND is_active = TRUE;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'reject_payroll_run: only Principal may reject, got %', v_approver_role;
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_payroll_run: rejection reason is required';
    END IF;

    SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reject_payroll_run: run % not found', p_run_id;
    END IF;
    IF v_run.status <> 'submitted' THEN
        RAISE EXCEPTION 'reject_payroll_run: run % status is %, must be submitted',
            p_run_id, v_run.status;
    END IF;

    UPDATE payroll_runs
       SET status = 'rejected',
           rejected_at = NOW(),
           rejection_reason = p_reason
     WHERE id = p_run_id;

    UPDATE hr_monthly_payroll
       SET status = 'draft'
     WHERE period_month = v_run.period_month
       AND status = 'submitted';

    UPDATE approval_requests
       SET status = 'rejected',
           workflow_state = 'rejected',
           notes = p_reason,
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = v_run.approval_id;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_approver, 'payroll_run', p_run_id::TEXT, 'reject',
        jsonb_build_object('period', v_run.period_month, 'reason', p_reason)
    );
END;
$function$;

-- reopen_director_salary(p_period date, p_user_id uuid) — live md5(prosrc) e2b07173b14cfec982096f3bd0782bfa
CREATE OR REPLACE FUNCTION public.reopen_director_salary(p_period date, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role       user_role;
    v_paid_count INT;
    v_pv_count   INT;
    v_locked     INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_director_salary: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_director_salary: role % cannot reopen', v_role;
    END IF;

    SELECT COUNT(*) INTO v_locked
      FROM payroll_payment_requests
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status IN ('pv_generated', 'completed');
    IF v_locked > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: Finance has already generated a funding PV for % — void/cancel it first; if it completed, money has already moved',
            p_period;
    END IF;

    -- Block once payout vouchers exist against the period's InfoTech rows
    -- (mig 20260730100000 — figures are in the money pipeline).
    SELECT COUNT(*) INTO v_pv_count
      FROM payment_vouchers pv
     WHERE pv.reference_type = 'payroll_disbursement'
       AND pv.status <> 'voided'
       AND EXISTS (
           SELECT 1 FROM director_monthly_payroll dmp
            WHERE dmp.id::TEXT = pv.reference_id::TEXT
              AND dmp.period_month = p_period
       );
    IF v_pv_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % disbursement voucher(s) exist for % — void them first',
            v_pv_count, p_period;
    END IF;

    -- Legacy engine-era guards (pre-v2 periods; director_payouts is empty in
    -- prod but the guards stay as no-op safety).
    SELECT COUNT(*) INTO v_paid_count
      FROM director_payouts
     WHERE period_month = p_period AND status = 'paid';
    IF v_paid_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % payout(s) already paid for % — cannot reopen',
            v_paid_count, p_period;
    END IF;

    SELECT COUNT(*) INTO v_pv_count
      FROM payment_vouchers pv
     WHERE pv.reference_type = 'payroll_disbursement'
       AND EXISTS (
           SELECT 1 FROM director_payouts dp
            WHERE dp.id::TEXT = pv.reference_id::TEXT
              AND dp.period_month = p_period
       )
       AND pv.status <> 'voided';
    IF v_pv_count > 0 THEN
        RAISE EXCEPTION
            'reopen_director_salary: % disbursement voucher(s) exist for % — void them first',
            v_pv_count, p_period;
    END IF;

    UPDATE payroll_payment_requests
       SET status              = 'cancelled',
           cancelled_at        = NOW(),
           cancelled_by        = p_user_id,
           cancellation_reason = 'Auto-cancelled on director salary reopen'
     WHERE payroll_run_id IS NULL
       AND period_month = p_period
       AND status = 'submitted';

    UPDATE director_payouts
       SET status = 'draft'
     WHERE period_month = p_period AND status = 'confirmed';

    DELETE FROM director_salary_submissions WHERE period_month = p_period;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'director_salary_submission', p_period::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period)
    );
END;
$function$;

-- The same nine, as production must hash them. Recorded on production by
-- running only this block (2026-10-06): it re-creates nothing and fails if
-- production has moved on from this file.
DO $check$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('apply_pool_adjustment', 'd56823837d79e886393ce7b30056d66f'),
    ('approve_payroll_run', 'ac249a7ac4b08dbfc43339dbae618db7'),
    ('approve_single_voucher', '5e42956a5b51e4e3cfa93b32e7850973'),
    ('approve_voucher_batch', '70ab53a9b38babd1b8667134f1016f07'),
    ('approve_voucher_batch_partial', 'e2409cec59d311b60c074c42b624269f'),
    ('get_payroll_breakdown_by_pool', '2aa983c9b754c3757ebaf895c65d3abc'),
    ('post_journal_entry', 'a682bcdec54abfaf1fef97955fe86d53'),
    ('reject_payroll_run', 'dd24f9dd4047b3c8df898b72792b477d'),
    ('reopen_director_salary', 'e2b07173b14cfec982096f3bd0782bfa')
  ) AS t(name, body_md5) LOOP
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.name) IS DISTINCT FROM r.body_md5 THEN
      bad := bad || ' ' || r.name;
    END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'production differs from 20261006040000:%', bad; END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
