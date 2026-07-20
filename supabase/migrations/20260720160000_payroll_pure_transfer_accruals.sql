-- Mig 20260720160000: payroll funding = PURE fund transfer; payments clear the
-- per-scheme accrual accounts (user rulings, 2026-07-20 evening).
--
-- Finance already books the monthly payroll accrual MANUALLY at month-end —
-- five per-segment JVs (staff depts + director), their own convention:
--     Dr 9030 basic + 9084 allowance + 9081/9082/9083 employer contributions
--     Cr 4070 net / 4071 EPF / 4072 SOCSO (+SKBBK) / 4073 EIS / 4074 PCB
-- (June 2026: JE-202606-0226..0230, totals tie the funding to the cent.)
-- The system must therefore NOT book any expense at funding — the old
-- Dr 9030 / Cr 4020 auto-accrual double-counted P&L against those JVs.
--
-- Changes:
-- 1. approve_single_voucher — payroll_bank_transfer now posts ONLY the
--    hr-segment staging JE (Dr 3010 / Cr source bank). No accrual JEs.
--    Dept-pool drains + HR custody credit + bank guard stay. The explicit
--    Alliance cache credit is REMOVED — the funding PVS rows now carry
--    account_code 3010 (set by generatePvFromRequest), so the existing
--    credit_dest_bank_on_bank_transfer trigger credits the dest bank exactly
--    like an internal_transfer (its original design).
-- 2. create_payroll_disbursement_vouchers — staff AND director payout PVs
--    clear 4070 Accrual - Salary (was 4020 / 9030; the expense already lives
--    in the month-end JVs, incl. the director one).
-- 3. create_payroll_statutory_vouchers — five scheme PVs now cover STAFF +
--    DIRECTOR amounts (one payment per scheme to one body), clearing:
--    KWSP → 4071 · SOCSO → 4072 · EIS → 4073 · LHDN → 4074 · SKBBK → 4072
--    (user: SKBBK lives in 4072). Money: staff share from dept_pool_hr,
--    director share from dept_pool_director (two PVS rows per PV when both
--    sides have amounts).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approve_single_voucher — payroll branch: staging JE only.
--    Anchored transforms of the LIVE definition (mig-156 style, fail loud).
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
    v_src TEXT;
    v_anchor TEXT;
    v_repl TEXT;
    v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('approve_single_voucher(uuid,uuid,text,boolean)'::regprocedure);

    -- (a) Remove the explicit dest-cache credit (trigger takes over via PVS 3010).
    v_anchor := 'IF v_voucher.voucher_type = ''payroll_bank_transfer'' THEN
        UPDATE bank_accounts SET current_balance = current_balance + v_voucher.amount WHERE id = v_dest_bank.id;
    END IF;';
    v_repl := '-- Mig 20260720160000: dest (Alliance) cache credit now comes from the
    -- credit_dest_bank_on_bank_transfer trigger — funding PVS rows carry
    -- account_code 3010, same mechanism as internal_transfer.';
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720160000: dest-credit anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- (b) Take payroll_bank_transfer OUT of the accrual/expense JE branch —
    --     it gets its own branch posting ONLY the staging JE.
    v_anchor := 'ELSIF v_voucher.voucher_type IN (''payroll_bank_transfer'', ''internal_transfer'', ''expense'', ''claim_payout'') AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN';
    v_repl := 'ELSIF v_voucher.voucher_type = ''payroll_bank_transfer'' THEN
        -- Mig 20260720160000: funding is a PURE fund transfer — the payroll
        -- expense is booked by Finance''s month-end per-segment JVs
        -- (Dr 9030/9084/9081-83 / Cr 4070-4074). One hr-segment staging JE:
        INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
        VALUES (v_entry_no, v_je_date, v_je_period,
                format(''PV %s: payroll fund staged to %s (HR custody)'', v_voucher.voucher_no, v_dest_bank.bank_name),
                ''payment_voucher'', v_voucher.id, v_voucher.amount, p_user_id,
                ''hr''::gl_segment)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
            (v_entry_id, COALESCE(v_dest_bank.gl_account_code, ''3010''), v_voucher.amount, NULL,
             format(''Payroll staging in - %s'', v_voucher.voucher_no)),
            (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
             format(''Payroll staging out - %s'', v_voucher.voucher_no));
    ELSIF v_voucher.voucher_type IN (''internal_transfer'', ''expense'', ''claim_payout'') AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN';
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720160000: branch anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- (c) The old in-branch staging-JE block (now dead for payroll, since
    --     payroll left this branch) is removed to avoid double-posting for
    --     internal_transfer/expense (it was guarded by payroll type anyway).
    v_anchor := '        -- Mig 20260720140000: ONE staging-transfer JE per funding PV, tagged
        -- segment=''hr'' — once staged, the pot is HR''s (custody), so HR''s
        -- Alliance slice rises while each dept''s row shrinks via its pool
        -- balance. (The per-dept slices were the 20260720100000 model.)
        IF v_voucher.voucher_type = ''payroll_bank_transfer'' THEN
            v_seq := nextval(''journal_entry_no_seq'');
            v_xfer_entry_no := format(''JE-%s-%s'', TO_CHAR(v_je_date, ''YYYYMM''), LPAD(v_seq::TEXT, 4, ''0''));
            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
            VALUES (v_xfer_entry_no, v_je_date, v_je_period,
                    format(''PV %s: payroll fund staged to %s (HR custody)'', v_voucher.voucher_no, v_dest_bank.bank_name),
                    ''payment_voucher'', v_voucher.id, v_voucher.amount, p_user_id,
                    ''hr''::gl_segment)
            RETURNING id INTO v_xfer_entry_id;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_xfer_entry_id, COALESCE(v_dest_bank.gl_account_code, ''3010''), v_voucher.amount, NULL,
                 format(''Payroll staging in - %s'', v_voucher.voucher_no)),
                (v_xfer_entry_id, v_bank_gl_code, NULL, v_voucher.amount,
                 format(''Payroll staging out - %s'', v_voucher.voucher_no));
        END IF;';
    v_repl := '';
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720160000: old staging-block anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Disbursement PVs clear 4070 (staff and directors).
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
    v_src TEXT;
    v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('create_payroll_disbursement_vouchers(date)'::regprocedure);

    v_cnt := (length(v_src) - length(replace(v_src, '''4020''', ''))) / length('''4020''');
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720160000: expected exactly 1 literal ''4020'' in disbursement RPC, found %', v_cnt;
    END IF;
    v_src := replace(v_src, '''4020''', '''4070''');

    v_cnt := (length(v_src) - length(replace(v_src, '''9030''', ''))) / length('''9030''');
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260720160000: expected exactly 1 literal ''9030'' in disbursement RPC, found %', v_cnt;
    END IF;
    v_src := replace(v_src, '''9030''', '''4070''');

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers IS
    'Mig 20260720160000: Stage-G payouts (staff + directors) clear 4070 Accrual - Salary — the expense lives in Finance''s month-end per-segment JVs. Staff drain dept_pool_hr (custody), directors dept_pool_director, all paid from Alliance.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Statutory: five scheme PVs covering STAFF + DIRECTORS, clearing 4071-4074
--    (SKBBK → 4072 per user convention).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_payroll_statutory_vouchers(p_period date, p_bank_account_id uuid DEFAULT NULL)
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
    v_staff_amt DECIMAL(15, 2);
    v_dir_amt DECIMAL(15, 2);
    v_pv_total DECIMAL(15, 2);
    v_voucher_no TEXT;
    v_voucher_period TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_count INTEGER := 0;
    v_grand DECIMAL(15, 2) := 0;
    v_vouchers JSONB := '[]'::JSONB;
    v_period_label TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
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

    IF p_bank_account_id IS NOT NULL THEN
        SELECT id, bank_name, status INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id;
        IF v_bank.id IS NULL OR v_bank.status <> 'active' THEN
            RAISE EXCEPTION 'create_payroll_statutory_vouchers: bank % is not an active bank', p_bank_account_id;
        END IF;
    ELSE
        SELECT id, bank_name, status INTO v_bank
          FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
        IF v_bank.id IS NULL THEN
            SELECT id, bank_name, status INTO v_bank
              FROM bank_accounts WHERE status = 'active' AND is_primary = true LIMIT 1;
        END IF;
        IF v_bank.id IS NULL THEN
            RAISE EXCEPTION 'create_payroll_statutory_vouchers: no active payout bank (GL 3010 or primary) found';
        END IF;
    END IF;

    v_voucher_period := to_char(now(), 'YYYYMM');
    v_period_label := to_char(p_period, 'Mon YYYY');

    -- One voucher per scheme, ONE payment to its body covering staff AND
    -- directors; each clears its own accrual account (SKBBK lives in 4072 by
    -- the user's convention). Staff share drains dept_pool_hr (custody),
    -- director share drains dept_pool_director.
    FOR v_body IN
        SELECT * FROM (VALUES
            ('KWSP',            'KWSP (EPF) — ', '4071'),
            ('PERKESO (SOCSO)', 'SOCSO — ',      '4072'),
            ('PERKESO (EIS)',   'EIS — ',        '4073'),
            ('LHDN',            'LHDN (PCB) — ', '4074'),
            ('SKBBK',           'SKBBK — ',      '4072')
        ) AS b(payee, descr_prefix, accrual_acct)
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
          INTO v_staff_amt
          FROM hr_monthly_payroll mp
         WHERE mp.period_month = p_period;

        SELECT COALESCE(SUM(
            CASE v_body.payee
                WHEN 'KWSP'            THEN COALESCE(dp.payroll_epf_er, 0)   + COALESCE(dp.payroll_epf_ee, 0)
                WHEN 'PERKESO (SOCSO)' THEN COALESCE(dp.payroll_socso_er, 0) + COALESCE(dp.payroll_socso_ee, 0)
                WHEN 'PERKESO (EIS)'   THEN COALESCE(dp.payroll_eis_er, 0)   + COALESCE(dp.payroll_eis_ee, 0)
                WHEN 'LHDN'            THEN COALESCE(dp.payroll_pcb, 0)
                WHEN 'SKBBK'           THEN COALESCE(dp.payroll_skbbk, 0)
                ELSE 0
            END), 0)
          INTO v_dir_amt
          FROM director_payouts dp
         WHERE dp.period_month = p_period;

        v_pv_total := COALESCE(v_staff_amt, 0) + COALESCE(v_dir_amt, 0);
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
            v_body.descr_prefix || v_period_label || ' payroll (staff + directors)',
            'bank_transfer', NULL,
            'dept_pool_hr', v_bank.id,
            'payroll_statutory', v_run_id, v_caller
        )
        RETURNING id INTO v_voucher_id;

        IF v_staff_amt > 0 THEN
            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_hr', v_staff_amt, v_body.accrual_acct);
        END IF;
        IF v_dir_amt > 0 THEN
            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_director', v_dir_amt, v_body.accrual_acct);
        END IF;

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
            'payee', v_body.payee, 'amount', v_pv_total,
            'staff', v_staff_amt, 'directors', v_dir_amt);
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No statutory amounts found for period % — nothing to generate.', p_period;
    END IF;

    RETURN json_build_object('count', v_count, 'total', v_grand, 'vouchers', v_vouchers);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, uuid) IS
    'Mig 20260720160000: five statutory PVs per period (KWSP→4071 / SOCSO→4072 / EIS→4073 / LHDN→4074 / SKBBK→4072), each ONE payment covering staff (dept_pool_hr) + directors (dept_pool_director). Expense lives in Finance''s month-end JVs. payment_date NULL; hr/finance/principal; NULL bank auto-picks Alliance.';

COMMIT;
