-- Auto-create the payroll funding request on submit (user 2026-06-26).
--
-- Previously HR clicked "Submit to Finance" (RPC submit_payroll_to_principal),
-- THEN separately clicked "Request Fund out from Finance" (requestPayrollPayment)
-- to file the payroll_payment_requests row Finance funds against. The second
-- click added no data — the amount is already the run's total_amount — so it was
-- a redundant handoff. We now create that request INSIDE submit_payroll_to_principal,
-- atomically, so the run lands in Finance's funding queue the instant HR submits.
--
-- The Finance funding-PV generation + Principal PV approval (the money gates) are
-- UNCHANGED — the auto-created request is status='submitted'; only Finance's PV
-- (→ pv_generated) and Principal's approval/execution (→ completed) advance it, and
-- the disbursement RPC still requires 'completed'. requestPayrollPayment stays as the
-- manual re-request path after a cancel.
--
-- reopen_payroll_run is updated so it auto-cancels a still-'submitted' request
-- (otherwise every freshly-submitted run would be permanently un-reopenable). It
-- still blocks once Finance/Principal have acted (pv_generated / completed).

-- ── submit_payroll_to_principal: + atomic funding request ───────────────────
CREATE OR REPLACE FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_submitter_role          user_role;
    v_marketing_dept          UUID;
    v_hr_dept                 UUID;
    v_finance_dept            UUID;
    v_director_office_dept    UUID;
    v_marketing_total         DECIMAL(15, 2);
    v_hr_total                DECIMAL(15, 2);
    v_finance_total           DECIMAL(15, 2);
    v_director_office_total   DECIMAL(15, 2);
    v_row_count               INT;
    v_submitted_or_paid_count INT;
    v_run_id                  UUID;
    v_total                   DECIMAL(15, 2);
BEGIN
    SELECT role INTO v_submitter_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_submitter_role IS NULL THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: unknown or inactive user %', p_user_id;
    END IF;
    IF v_submitter_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: role % cannot submit payroll', v_submitter_role;
    END IF;

    SELECT COUNT(*) INTO v_row_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: no hr_monthly_payroll rows for period %', p_period;
    END IF;

    -- (mig 278) Director gate REMOVED — director salary is decoupled and
    -- submitted to Finance via its own flow. Staff payroll no longer waits.

    SELECT COUNT(*) INTO v_submitted_or_paid_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period AND status IN ('submitted', 'paid');
    IF v_submitted_or_paid_count > 0 THEN
        RAISE EXCEPTION
            'submit_payroll_to_principal: % rows already submitted/paid for period %',
            v_submitted_or_paid_count, p_period;
    END IF;

    IF EXISTS (
        SELECT 1 FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected'
    ) THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: a live run already exists for %', p_period;
    END IF;

    SELECT id INTO v_marketing_dept       FROM departments WHERE name = 'Marketing';
    SELECT id INTO v_hr_dept              FROM departments WHERE name = 'HR';
    SELECT id INTO v_finance_dept         FROM departments WHERE name = 'Finance';
    SELECT id INTO v_director_office_dept FROM departments WHERE name = 'Director Office';

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_marketing_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_marketing_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_hr_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_hr_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_finance_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_finance_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_director_office_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_director_office_dept;

    INSERT INTO payroll_runs (
        period_month,
        marketing_opex_total,
        hr_opex_total,
        finance_opex_total,
        director_office_total,
        director_salary_total,
        status,
        submitted_by,
        submitted_at,
        approved_at
    ) VALUES (
        p_period,
        v_marketing_total,
        v_hr_total,
        v_finance_total,
        v_director_office_total,
        0,
        'approved',
        p_user_id,
        NOW(),
        NOW()
    )
    RETURNING id, total_amount INTO v_run_id, v_total;

    UPDATE hr_monthly_payroll
       SET status = 'submitted'
     WHERE period_month = p_period;

    -- Auto-file the funding request (was a separate manual HR click). Use the
    -- run's STORED generated total_amount so the amount always tracks the column
    -- and passes validate_payroll_payment_request_insert (status='approved' +
    -- amount = total_amount). target_pool kept explicit to match the prior flow.
    -- Skip when total is 0: there is nothing to fund, and the table's
    -- amount > 0 CHECK would otherwise roll back the whole submit. HR can still
    -- file a request manually later (requestPayrollPayment) if a reopen+edit
    -- makes the total positive.
    IF v_total > 0 THEN
        INSERT INTO payroll_payment_requests (
            payroll_run_id, requested_by, amount, target_pool, status
        ) VALUES (
            v_run_id, p_user_id, v_total, 'dept_pool_hr', 'submitted'
        );
    END IF;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'payroll_run', v_run_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object(
            'period', p_period,
            'staff_total', v_marketing_total + v_hr_total + v_finance_total + v_director_office_total,
            'semantics', 'no Principal approval; funding request auto-filed (mig 20260626120000)'
        )
    );

    RETURN v_run_id;
END;
$function$;

COMMENT ON FUNCTION submit_payroll_to_principal IS
    'Mig 278 + 20260626120000: submission goes STRAIGHT to Finance — run lands '
    'in status=approved (no Principal approval, no approval_requests row, '
    'director_salary_total=0) AND a payroll_payment_requests row is auto-filed '
    '(status=submitted, amount=total_amount) so Finance can generate the funding '
    'PV without a separate HR "Request" click. Finance PV + Principal PV approval '
    'unchanged.';

-- ── reopen_payroll_run: auto-cancel a still-'submitted' funding request ──────
CREATE OR REPLACE FUNCTION public.reopen_payroll_run(p_period date, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role     user_role;
    v_run      payroll_runs%ROWTYPE;
    v_blocking INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_payroll_run: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_payroll_run: role % cannot reopen payroll', v_role;
    END IF;

    SELECT * INTO v_run
      FROM payroll_runs
     WHERE period_month = p_period AND status <> 'rejected';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reopen_payroll_run: no live run for %', p_period;
    END IF;
    IF v_run.status <> 'approved' THEN
        RAISE EXCEPTION
            'reopen_payroll_run: run is %, only approved (pre-payment) runs can be reopened',
            v_run.status;
    END IF;

    -- Funding requests are now auto-filed at submit, so a fresh approved run
    -- always carries a 'submitted' request. Cancel it on reopen (HR has not
    -- asked Finance to act on it yet — it was automatic).
    UPDATE payroll_payment_requests
       SET status              = 'cancelled',
           cancelled_at        = NOW(),
           cancelled_by        = p_user_id,
           cancellation_reason = 'Auto-cancelled on payroll reopen'
     WHERE payroll_run_id = v_run.id
       AND status = 'submitted';

    -- Still block once Finance/Principal have acted: a PV has been generated or
    -- the request completed (money in motion).
    SELECT COUNT(*) INTO v_blocking
      FROM payroll_payment_requests
     WHERE payroll_run_id = v_run.id
       AND status IN ('pv_generated', 'completed');
    IF v_blocking > 0 THEN
        RAISE EXCEPTION
            'reopen_payroll_run: Finance has already generated a payment voucher for % — cancel that first; if it completed, money has already moved',
            p_period;
    END IF;

    UPDATE payroll_runs
       SET status           = 'rejected',
           rejected_at      = NOW(),
           rejection_reason = 'Reopened by HR for edits'
     WHERE id = v_run.id;

    UPDATE hr_monthly_payroll
       SET status = 'draft'
     WHERE period_month = p_period AND status = 'submitted';

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'payroll_run', v_run.id::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period, 'total_amount', v_run.total_amount)
    );

    RETURN v_run.id;
END;
$function$;

COMMENT ON FUNCTION reopen_payroll_run(DATE, UUID) IS
    'Mig 278 + 20260626120000: HR self-service reopen — flips an approved run to '
    'rejected and its hr_monthly_payroll rows back to draft. Auto-cancels a still-'
    '''submitted'' funding request (auto-filed at submit); still blocked once a PV '
    'is generated or completed (money in motion).';

GRANT EXECUTE ON FUNCTION reopen_payroll_run(DATE, UUID) TO authenticated;
