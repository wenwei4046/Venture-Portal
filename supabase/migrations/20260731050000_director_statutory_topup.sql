-- Director statutory TOP-UP vouchers (2026-07-31, user chose option B).
--
-- Jun 2026 exposed the sequencing hole: the five statutory vouchers were
-- generated before director_monthly_payroll had any Jun rows, so they carried
-- the staff shares only — and the per-scheme dedupe in
-- create_payroll_statutory_vouchers ("void it first to regenerate") correctly
-- refuses a second voucher for the same run. Voiding PAID staff vouchers to
-- regenerate combined ones would falsify real bank payments, so the fix is a
-- separate director-only top-up per scheme.
--
-- Amounts follow the FUNDING REQUEST algorithm (user: "根据request fund 那part
-- 来出"): director_monthly_payroll (InfoTech actuals) — the same source the
-- payroll funding request summed. For Jun that is KWSP 13,248.00 +
-- SOCSO 535.60 + EIS 95.20 + PCB 8,116.60 + SKBBK 178.60 = 22,174.00, exactly
-- the second funding tranche parked in dept_pool_director. NOT the GL accrual
-- figures (4071-4074) — the accrual-vs-actual gap is the director-payroll
-- session's reconciliation, not the payment's.
--
-- Guards:
--   · a non-voided voucher for the scheme+run must ALREADY exist (otherwise
--     the normal Generate is the right button — it includes both shares);
--   · refuses when ANY non-voided voucher for the scheme+run already carries a
--     dept_pool_director source row (combined voucher or an earlier top-up);
--   · otherwise mirrors create_payroll_statutory_vouchers: same roles, same
--     run/funding checks, same Alliance-first bank pick, one voucher per call,
--     pending_approval into the normal approval queue.
-- The voucher's source_pool = 'dept_pool_director', which is also how the HR
-- Payment page tells top-ups apart from the staff vouchers (theirs say
-- dept_pool_hr).

CREATE OR REPLACE FUNCTION create_payroll_statutory_director_topup(
    p_period DATE,
    p_scheme TEXT,
    p_payment_date DATE DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
    v_existing INTEGER;
    v_covered INTEGER;
    v_bank RECORD;
    v_payee TEXT;
    v_descr TEXT;
    v_acct TEXT;
    v_dir_amt DECIMAL(15, 2);
    v_voucher_no TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_statutory_director_topup: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT payee, descr, acct INTO v_payee, v_descr, v_acct FROM (VALUES
        ('KWSP',  'KWSP',            'KWSP (EPF) — ', '4071'),
        ('SOCSO', 'PERKESO (SOCSO)', 'SOCSO — ',      '4072'),
        ('EIS',   'PERKESO (EIS)',   'EIS — ',        '4073'),
        ('PCB',   'LHDN',            'LHDN (PCB) — ', '4074'),
        ('SKBBK', 'SKBBK',           'SKBBK — ',      '4072')
    ) AS m(scheme, payee, descr, acct)
    WHERE m.scheme = p_scheme;
    IF v_payee IS NULL THEN
        RAISE EXCEPTION 'create_payroll_statutory_director_topup: unknown scheme % (use KWSP / SOCSO / EIS / PCB / SKBBK)', p_scheme;
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

    -- A scheme voucher must already exist — else the normal Generate is right.
    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.payee_name = v_payee
      AND pv.status <> 'voided';
    IF v_existing = 0 THEN
        RAISE EXCEPTION 'No % voucher exists for period % yet — use the normal Generate; it includes both shares.', v_payee, p_period;
    END IF;

    -- Director share must not already be carried anywhere (combined voucher or
    -- an earlier top-up).
    SELECT COUNT(*) INTO v_covered
    FROM payment_vouchers pv
    JOIN payment_voucher_sources s ON s.voucher_id = pv.id
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.payee_name = v_payee
      AND pv.status <> 'voided'
      AND s.pool = 'dept_pool_director';
    IF v_covered > 0 THEN
        RAISE EXCEPTION 'The % director share for period % is already on a non-voided voucher. Void it first to regenerate.', v_payee, p_period;
    END IF;

    IF p_bank_account_id IS NOT NULL THEN
        SELECT id, bank_name, status INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id;
        IF v_bank.id IS NULL OR v_bank.status <> 'active' THEN
            RAISE EXCEPTION 'create_payroll_statutory_director_topup: bank % is not an active bank', p_bank_account_id;
        END IF;
    ELSE
        SELECT id, bank_name, status INTO v_bank
          FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
        IF v_bank.id IS NULL THEN
            SELECT id, bank_name, status INTO v_bank
              FROM bank_accounts WHERE status = 'active' AND is_primary = true LIMIT 1;
        END IF;
        IF v_bank.id IS NULL THEN
            RAISE EXCEPTION 'create_payroll_statutory_director_topup: no active payout bank (GL 3010 or primary) found';
        END IF;
    END IF;

    -- Funding-request algorithm: InfoTech actuals, directors only.
    SELECT COALESCE(SUM(
        CASE p_scheme
            WHEN 'KWSP'  THEN COALESCE(dmp.epf_er, 0)   + COALESCE(dmp.epf_ee, 0)
            WHEN 'SOCSO' THEN COALESCE(dmp.socso_er, 0) + COALESCE(dmp.socso_ee, 0)
            WHEN 'EIS'   THEN COALESCE(dmp.eis_er, 0)   + COALESCE(dmp.eis_ee, 0)
            WHEN 'PCB'   THEN COALESCE(dmp.pcb, 0)
            WHEN 'SKBBK' THEN COALESCE(dmp.skbbk_amount, 0)
            ELSE 0
        END), 0)
      INTO v_dir_amt
      FROM director_monthly_payroll dmp
     WHERE dmp.period_month = p_period;
    IF v_dir_amt <= 0 THEN
        RAISE EXCEPTION 'No director % amounts found for period % — nothing to top up.', p_scheme, p_period;
    END IF;

    SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
    v_voucher_no := 'HV-PV-' || to_char(now(), 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 4, '0');

    INSERT INTO payment_vouchers (
        voucher_no, voucher_type, direction, status,
        amount, currency, payee_name, description,
        payment_method, payment_date,
        source_pool, bank_account_id,
        reference_type, reference_id, created_by
    ) VALUES (
        v_voucher_no, 'expense', 'debit', 'pending_approval',
        v_dir_amt, 'MYR', v_payee,
        v_descr || to_char(p_period, 'Mon YYYY') || ' payroll (directors)',
        'bank_transfer', p_payment_date,
        'dept_pool_director', v_bank.id,
        'payroll_statutory', v_run_id, v_caller
    )
    RETURNING id INTO v_voucher_id;

    INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
    VALUES (v_voucher_id, 'dept_pool_director', v_dir_amt, v_acct);

    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state
    ) VALUES (
        'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
        v_voucher_no || ': ' || v_payee || ' — ' || to_char(p_period, 'Mon YYYY') ||
            ' payroll (directors) — RM ' || to_char(v_dir_amt, 'FM999,999,999.00'),
        v_dir_amt, 'pending', 'submitted'
    );

    RETURN json_build_object(
        'id', v_voucher_id, 'voucher_no', v_voucher_no, 'payee', v_payee,
        'amount', v_dir_amt);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_director_topup(date, text, date, uuid) IS
    'Mig 20260731050000: director-only statutory top-up for a run whose scheme '
    'voucher was generated before the director actuals existed. Amounts from '
    'director_monthly_payroll (the funding-request algorithm); drains '
    'dept_pool_director; refuses when the director share is already carried.';
