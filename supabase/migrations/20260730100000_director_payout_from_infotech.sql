-- Mig 20260730100000: director payouts read director_monthly_payroll (InfoTech)
-- — the v2 engine retirement (mig 20260717120000) left the payment side still
-- reading director_payouts, which is no longer written (and is EMPTY in prod,
-- verified 2026-07-30 — no legacy periods in flight, so this is a clean switch).
--
-- 1. create_payroll_disbursement_vouchers scope='directors':
--    · rows from director_monthly_payroll (net > 0, payee = employee_name);
--    · dedupe likewise;
--    · funding gate now checks the RUN-LESS director funding request
--      (mig 20260727100000) instead of the staff run — director payouts no
--      longer wait on staff funding, and vice versa.
--    Staff branch unchanged.
-- 2. create_payroll_statutory_vouchers: director share summed from
--    director_monthly_payroll (epf/socso/eis EE+ER, pcb, skbbk).
-- 3. derive_journal_segment: payroll_disbursement referencing a
--    director_monthly_payroll row → segment 'director' (legacy director_payouts
--    check kept for old JEs).
-- 4. reopen_director_salary v4: blocked once non-voided disbursement PVs
--    reference the period's InfoTech rows (money pipeline), mirroring the
--    legacy payout guard.

BEGIN;

-- ── 1. Disbursement: directors from InfoTech, gated on the director request ──

CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_vouchers(p_period date, p_scope text, p_payment_date date)
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

    -- Funding gates are PER SCOPE since the director decoupling
    -- (mig 20260727100000): staff key off their payroll_run's request,
    -- directors off the run-less director salary request.
    IF p_scope = 'staff' THEN
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
    ELSE
        SELECT status INTO v_request_status
        FROM payroll_payment_requests
        WHERE payroll_run_id IS NULL
          AND period_month = p_period
          AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_request_status IS NULL THEN
            RAISE EXCEPTION 'Director salary funding for period % is not completed. Submit director salary to Finance and wait for the funding PV to be approved.', p_period;
        END IF;
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
            SELECT 1 FROM director_monthly_payroll dmp
            WHERE dmp.id::text = pv.reference_id::text
              AND dmp.period_month = p_period
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
        -- Directors (mig 20260730100000): rows come from the InfoTech actuals
        -- (director_monthly_payroll) — the v2 engine's director_payouts is
        -- retired. Dr 4070 as well; drains dept_pool_director.
        FOR v_dir IN
            SELECT
                dmp.id AS payout_id,
                dmp.net AS payroll_net,
                dmp.employee_name AS director_name
            FROM director_monthly_payroll dmp
            WHERE dmp.period_month = p_period
              AND dmp.net > 0
            ORDER BY dmp.employee_name
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
                    ' — ' || v_dir.director_name,
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
                    ' — RM ' || to_char(v_dir.payroll_net, 'FM999,999.00'),
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
    'Mig 20260730100000: director batch reads director_monthly_payroll '
    '(InfoTech actuals) and gates on the run-less director funding request; '
    'staff batch unchanged (payroll_run + its request). Per-scope dedupe.';

-- ── 2. Statutory: director share from InfoTech ───────────────────────────────

CREATE OR REPLACE FUNCTION public.create_payroll_statutory_vouchers(p_period date, p_scheme text, p_payment_date date DEFAULT NULL::date, p_bank_account_id uuid DEFAULT NULL::uuid)
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

    -- Mig 20260730100000: director share from the InfoTech actuals
    -- (director_monthly_payroll) — director_payouts is retired.
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
    'Mig 20260730100000: director share summed from director_monthly_payroll '
    '(InfoTech). One voucher per scheme, staff + directors combined, staff '
    'share drains dept_pool_hr and director share dept_pool_director.';

-- ── 3. derive_journal_segment: InfoTech payout rows → segment director ───────

DO $mig$
DECLARE
    v_src    TEXT;
    v_anchor TEXT;
    v_repl   TEXT;
    v_cnt    INT;
BEGIN
    v_src := pg_get_functiondef('derive_journal_segment(text,uuid)'::regprocedure);

    v_anchor := $a$            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
            END IF;$a$;
    v_repl := $a$            -- Mig 20260730100000: v2 director payouts reference InfoTech rows;
            -- the director_payouts check stays for legacy JEs.
            IF EXISTS (SELECT 1 FROM director_monthly_payroll dmp WHERE dmp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
            END IF;
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
            END IF;$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260730100000: derive_journal_segment anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

-- ── 4. reopen_director_salary v4: block on InfoTech-referencing payout PVs ───

CREATE OR REPLACE FUNCTION reopen_director_salary(p_period DATE, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Block once Finance/Principal have acted on the funding request
    -- (mig 20260727100000 — mirror of reopen_payroll_run).
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

    -- The auto-filed request was never acted on — cancel it with the reopen.
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

COMMENT ON FUNCTION reopen_director_salary(DATE, UUID) IS
    'v4 (2026-07-30): pulls a Director Salary submission back — snapshot '
    'deleted, still-submitted funding request auto-cancelled. Blocked once a '
    'funding PV is generated/completed or payout vouchers reference the '
    'period''s InfoTech rows.';

COMMIT;
