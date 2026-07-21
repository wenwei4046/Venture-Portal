-- Mig 20260721000000: HR runs the payroll payments — scoped batches + per-scheme
-- statutory, all dates chosen by HR (user rulings 2026-07-20/21).
--
-- Real-world practice: HR (not Finance) makes the actual payments, and
--   • staff and directors may be PAID SEPARATELY (different days/uploads);
--   • statutory bodies are paid ONE INSTITUTION AT A TIME, each its own date.
--
-- Changes:
-- 1. create_payroll_disbursement_vouchers → (p_period, p_scope, p_payment_date):
--    p_scope 'staff' | 'directors'. Each call generates ONLY that scope as its
--    OWN approval group with HR's chosen payment date on every voucher.
--    Dedupe is per scope, so staff can be generated/paid while directors wait.
-- 2. create_payroll_statutory_vouchers → (p_period, p_scheme, p_payment_date,
--    p_bank_account_id): ONE scheme per call (KWSP/SOCSO/EIS/PCB/SKBBK),
--    per-scheme dedupe, optional date (fill/edit later), covers staff +
--    directors, clears 4071/4072/4073/4074/4072.
-- 3. NEW set_payroll_pv_payment_date: lets HR set/change the payment date on a
--    PENDING payroll voucher (payroll_disbursement / payroll_statutory only) —
--    /payments editing is Finance-gated, and dates are HR's knowledge now.
--
-- Live-safety: both generators are gated on the funding request being
-- completed; June's is currently NOT (round 2 voided), so no caller can hit
-- the changed signatures before the UI deploy lands.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Scoped disbursement batches.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_payroll_disbursement_vouchers(date);

CREATE FUNCTION public.create_payroll_disbursement_vouchers(
    p_period date,
    p_scope text,
    p_payment_date date
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_group_id UUID;
    v_row RECORD;
    v_dir RECORD;
    v_voucher_no TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_voucher_period TEXT;
    v_count INTEGER := 0;
    v_total DECIMAL(15, 2) := 0;
    v_existing INTEGER;
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
    v_payout_bank_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    IF p_scope NOT IN ('staff', 'directors') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: scope must be staff or directors, got %', p_scope;
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: payment date is required (the day the bank file goes out)';
    END IF;

    SELECT id, status INTO v_run_id, v_run_status
    FROM payroll_runs
    WHERE period_month = p_period AND status <> 'rejected';

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Submit costing before disbursement.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = v_run_id
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'Payroll funding for period % is not completed. Wait for all funding PVs to be approved.', p_period;
    END IF;

    -- Per-scope dedupe: staff and director batches are independent.
    IF p_scope = 'staff' THEN
        SELECT COUNT(*) INTO v_existing
        FROM payment_vouchers pv
        WHERE pv.reference_type = 'payroll_disbursement'
          AND pv.status <> 'voided'
          AND EXISTS (
            SELECT 1 FROM hr_monthly_payroll mp
            WHERE mp.id::text = pv.reference_id::text
              AND mp.period_month = p_period
          );
    ELSE
        SELECT COUNT(*) INTO v_existing
        FROM payment_vouchers pv
        WHERE pv.reference_type = 'payroll_disbursement'
          AND pv.status <> 'voided'
          AND EXISTS (
            SELECT 1 FROM director_payouts dp
            WHERE dp.id::text = pv.reference_id::text
              AND dp.period_month = p_period
          );
    END IF;

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'The % batch for period % already exists (% non-voided vouchers). Void them first to regenerate.', p_scope, p_period, v_existing;
    END IF;

    -- Payroll cash sits in the Alliance account (GL 3010); primary fallback.
    SELECT id INTO v_payout_bank_id
      FROM bank_accounts
     WHERE status = 'active' AND gl_account_code = '3010'
     LIMIT 1;
    IF v_payout_bank_id IS NULL THEN
        SELECT id INTO v_payout_bank_id
          FROM bank_accounts
         WHERE status = 'active' AND is_primary = true
         LIMIT 1;
    END IF;
    IF v_payout_bank_id IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: no active payout bank (GL 3010 or primary) found';
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    IF p_scope = 'staff' THEN
        -- Staff: Dr 4070 Accrual - Salary (month-end JV holds the expense),
        -- drains the HR custody pool.
        FOR v_row IN
            SELECT
                mp.id AS payroll_id,
                mp.net,
                s.employee_name,
                d.name AS dept_name
            FROM hr_monthly_payroll mp
            JOIN hr_staff_costs s ON s.id = mp.staff_id
            LEFT JOIN departments d ON d.id = s.department_id
            WHERE mp.period_month = p_period
              AND mp.net > 0
            ORDER BY s.employee_name
        LOOP
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

            INSERT INTO payment_vouchers (
                voucher_no, voucher_type, direction, status,
                amount, currency,
                payee_name, description,
                payment_method, payment_date,
                source_pool, bank_account_id,
                reference_type, reference_id,
                created_by
            ) VALUES (
                v_voucher_no, 'other', 'debit', 'pending_approval',
                v_row.net, 'MYR',
                v_row.employee_name,
                'Payroll disbursement ' || to_char(p_period, 'Mon YYYY') ||
                    ' — ' || v_row.employee_name ||
                    COALESCE(' (' || v_row.dept_name || ')', ''),
                'bank_transfer', p_payment_date,
                'dept_pool_hr', v_payout_bank_id,
                'payroll_disbursement', v_row.payroll_id,
                v_caller
            )
            RETURNING id INTO v_voucher_id;

            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_hr', v_row.net, '4070');

            INSERT INTO approval_requests (
                request_type, reference_id, reference_table,
                submitted_by, description, amount,
                status, workflow_state, group_id
            ) VALUES (
                'payment_voucher', v_voucher_id, 'payment_vouchers',
                v_caller,
                v_voucher_no || ': ' || v_row.employee_name ||
                    ' — RM ' || to_char(v_row.net, 'FM999,999.00'),
                v_row.net,
                'pending', 'submitted', v_group_id
            );

            v_count := v_count + 1;
            v_total := v_total + v_row.net;
        END LOOP;
    ELSE
        -- Directors: Dr 4070 as well (the director month-end JV also credits
        -- 4070), drains dept_pool_director.
        FOR v_dir IN
            SELECT
                dp.id AS payout_id,
                dp.payroll_net,
                dp.advance_amount,
                d.name AS director_name
            FROM director_payouts dp
            JOIN directors d ON d.id = dp.director_id
            WHERE dp.period_month = p_period
              AND dp.payroll_net > 0
            ORDER BY d.name
        LOOP
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

            INSERT INTO payment_vouchers (
                voucher_no, voucher_type, direction, status,
                amount, currency,
                payee_name, description,
                payment_method, payment_date,
                source_pool, bank_account_id,
                reference_type, reference_id,
                created_by
            ) VALUES (
                v_voucher_no, 'other', 'debit', 'pending_approval',
                v_dir.payroll_net, 'MYR',
                v_dir.director_name,
                'Director salary ' || to_char(p_period, 'Mon YYYY') ||
                    ' — ' || v_dir.director_name ||
                    CASE WHEN COALESCE(v_dir.advance_amount, 0) > 0
                         THEN ' (incl. advance RM ' || to_char(v_dir.advance_amount, 'FM999,999.00') || ')'
                         ELSE '' END,
                'bank_transfer', p_payment_date,
                'dept_pool_director', v_payout_bank_id,
                'payroll_disbursement', v_dir.payout_id,
                v_caller
            )
            RETURNING id INTO v_voucher_id;

            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_director', v_dir.payroll_net, '4070');

            INSERT INTO approval_requests (
                request_type, reference_id, reference_table,
                submitted_by, description, amount,
                status, workflow_state, group_id
            ) VALUES (
                'payment_voucher', v_voucher_id, 'payment_vouchers',
                v_caller,
                v_voucher_no || ': ' || v_dir.director_name ||
                    ' — RM ' || to_char(v_dir.payroll_net, 'FM999,999.00') ||
                    CASE WHEN COALESCE(v_dir.advance_amount, 0) > 0
                         THEN ' (incl. advance RM ' || to_char(v_dir.advance_amount, 'FM999,999.00') || ')'
                         ELSE '' END,
                v_dir.payroll_net,
                'pending', 'submitted', v_group_id
            );

            v_count := v_count + 1;
            v_total := v_total + v_dir.payroll_net;
        END LOOP;
    END IF;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No % rows with net > 0 found for period %.', p_scope, p_period;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'scope', p_scope,
        'count', v_count,
        'total', v_total
    );
END;
$function$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(date, text, date) IS
    'Mig 20260721000000: scoped payroll batches — staff and directors generated/approved/paid independently, each with HR''s chosen payment date. Staff drain dept_pool_hr, directors dept_pool_director; both clear 4070; paid from Alliance (3010).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Statutory: one scheme per call, own date.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_payroll_statutory_vouchers(date, uuid);

CREATE FUNCTION public.create_payroll_statutory_vouchers(
    p_period date,
    p_scheme text,
    p_payment_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL
)
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
    v_payee TEXT;
    v_descr TEXT;
    v_acct TEXT;
    v_staff_amt DECIMAL(15, 2);
    v_dir_amt DECIMAL(15, 2);
    v_pv_total DECIMAL(15, 2);
    v_voucher_no TEXT;
    v_voucher_period TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    -- Scheme → payee / description / accrual account (SKBBK lives in 4072 by
    -- the user's convention).
    SELECT payee, descr, acct INTO v_payee, v_descr, v_acct FROM (VALUES
        ('KWSP',  'KWSP',            'KWSP (EPF) — ', '4071'),
        ('SOCSO', 'PERKESO (SOCSO)', 'SOCSO — ',      '4072'),
        ('EIS',   'PERKESO (EIS)',   'EIS — ',        '4073'),
        ('PCB',   'LHDN',            'LHDN (PCB) — ', '4074'),
        ('SKBBK', 'SKBBK',           'SKBBK — ',      '4072')
    ) AS m(scheme, payee, descr, acct)
    WHERE m.scheme = p_scheme;
    IF v_payee IS NULL THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: unknown scheme % (use KWSP / SOCSO / EIS / PCB / SKBBK)', p_scheme;
    END IF;

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

    -- Per-scheme dedupe.
    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.payee_name = v_payee
      AND pv.status <> 'voided';
    IF v_existing > 0 THEN
        RAISE EXCEPTION 'A % voucher already exists for period % (non-voided). Void it first to regenerate.', v_payee, p_period;
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

    SELECT COALESCE(SUM(
        CASE p_scheme
            WHEN 'KWSP'  THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
            WHEN 'SOCSO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
            WHEN 'EIS'   THEN COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
            WHEN 'PCB'   THEN COALESCE(mp.pcb, 0)
            WHEN 'SKBBK' THEN COALESCE(mp.skbbk_amount, 0)
            ELSE 0
        END), 0)
      INTO v_staff_amt
      FROM hr_monthly_payroll mp
     WHERE mp.period_month = p_period;

    SELECT COALESCE(SUM(
        CASE p_scheme
            WHEN 'KWSP'  THEN COALESCE(dp.payroll_epf_er, 0)   + COALESCE(dp.payroll_epf_ee, 0)
            WHEN 'SOCSO' THEN COALESCE(dp.payroll_socso_er, 0) + COALESCE(dp.payroll_socso_ee, 0)
            WHEN 'EIS'   THEN COALESCE(dp.payroll_eis_er, 0)   + COALESCE(dp.payroll_eis_ee, 0)
            WHEN 'PCB'   THEN COALESCE(dp.payroll_pcb, 0)
            WHEN 'SKBBK' THEN COALESCE(dp.payroll_skbbk, 0)
            ELSE 0
        END), 0)
      INTO v_dir_amt
      FROM director_payouts dp
     WHERE dp.period_month = p_period;

    v_pv_total := COALESCE(v_staff_amt, 0) + COALESCE(v_dir_amt, 0);
    IF v_pv_total <= 0 THEN
        RAISE EXCEPTION 'No % amounts found for period % — nothing to generate.', p_scheme, p_period;
    END IF;

    v_voucher_period := to_char(now(), 'YYYYMM');
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
        v_pv_total, 'MYR', v_payee,
        v_descr || to_char(p_period, 'Mon YYYY') || ' payroll (staff + directors)',
        'bank_transfer', p_payment_date,
        'dept_pool_hr', v_bank.id,
        'payroll_statutory', v_run_id, v_caller
    )
    RETURNING id INTO v_voucher_id;

    IF v_staff_amt > 0 THEN
        INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
        VALUES (v_voucher_id, 'dept_pool_hr', v_staff_amt, v_acct);
    END IF;
    IF v_dir_amt > 0 THEN
        INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
        VALUES (v_voucher_id, 'dept_pool_director', v_dir_amt, v_acct);
    END IF;

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state
    ) VALUES (
        'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
        v_voucher_no || ': ' || v_payee || ' — ' || to_char(p_period, 'Mon YYYY') ||
            ' payroll — RM ' || to_char(v_pv_total, 'FM999,999,999.00'),
        v_pv_total, 'pending', 'submitted'
    );

    RETURN json_build_object(
        'id', v_voucher_id, 'voucher_no', v_voucher_no, 'payee', v_payee,
        'amount', v_pv_total, 'staff', v_staff_amt, 'directors', v_dir_amt);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, text, date, uuid) IS
    'Mig 20260721000000: one statutory voucher per call — scheme KWSP/SOCSO/EIS/PCB/SKBBK, staff + directors combined, clearing 4071/4072/4073/4074/4072. Date optional (HR sets/edits it while pending). hr/finance/principal; NULL bank auto-picks Alliance.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HR can set the payment date on pending payroll vouchers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_payroll_pv_payment_date(p_voucher_id uuid, p_payment_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_status payment_voucher_status;
    v_ref TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'set_payroll_pv_payment_date: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'set_payroll_pv_payment_date: date is required';
    END IF;

    SELECT status, reference_type INTO v_status, v_ref
    FROM payment_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'set_payroll_pv_payment_date: voucher % not found', p_voucher_id;
    END IF;
    IF v_status <> 'pending_approval' THEN
        RAISE EXCEPTION 'set_payroll_pv_payment_date: voucher is %, only pending vouchers can be re-dated', v_status;
    END IF;
    IF COALESCE(v_ref, '') NOT IN ('payroll_disbursement', 'payroll_statutory') THEN
        RAISE EXCEPTION 'set_payroll_pv_payment_date: only payroll vouchers can be re-dated here';
    END IF;

    UPDATE payment_vouchers
       SET payment_date = p_payment_date
     WHERE id = p_voucher_id;
END;
$function$;

COMMENT ON FUNCTION set_payroll_pv_payment_date IS
    'Mig 20260721000000: HR (payments operator for payroll) sets/changes the payment date on a PENDING payroll_disbursement / payroll_statutory voucher. The GL date follows the payment date at approval.';

COMMIT;
