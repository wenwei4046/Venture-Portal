-- 防盗墙 (user 2026-09-15 "把权限放在 finance 这边"): HR can no longer pull
-- an approved payroll run back on their own. Reopening is Finance's (or the
-- Principal's) call, triggered from /payments/payroll-requests ("打回 HR
-- 重做"). Body is mig 20260904030000's verbatim — auto-cancel of the
-- submitted funding request, PV-generated block, staff-accrual auto-reverse —
-- with only the role gate changed: hr → finance.

BEGIN;

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
    v_reversed INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_payroll_run: unknown or inactive user %', p_user_id;
    END IF;
    -- 2026-09-15: Finance owns the send-back. HR asks; Finance (or the
    -- Principal) pulls the run. The submitting HR user still runs the
    -- accrual reversal below under this SECURITY DEFINER context.
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'reopen_payroll_run: role % cannot reopen payroll — ask Finance to send it back', v_role;
    END IF;

    SELECT * INTO v_run FROM payroll_runs
     WHERE period_month = p_period AND status <> 'rejected';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reopen_payroll_run: no live run for %', p_period;
    END IF;
    IF v_run.status <> 'approved' THEN
        RAISE EXCEPTION 'reopen_payroll_run: run is %, only approved (pre-payment) runs can be reopened', v_run.status;
    END IF;

    -- Funding request is auto-filed at submit; cancel a still-'submitted' one on reopen.
    UPDATE payroll_payment_requests
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_user_id,
           cancellation_reason = 'Auto-cancelled on payroll reopen'
     WHERE payroll_run_id = v_run.id AND status = 'submitted';

    SELECT COUNT(*) INTO v_blocking FROM payroll_payment_requests
     WHERE payroll_run_id = v_run.id AND status IN ('pv_generated', 'completed');
    IF v_blocking > 0 THEN
        RAISE EXCEPTION 'reopen_payroll_run: Finance has already generated a payment voucher for % — cancel that first; if it completed, money has already moved', p_period;
    END IF;

    -- Auto-reverse the period's active STAFF accrual JVs (2026-09-04) so the
    -- eventual re-submit posts fresh figures instead of tripping the
    -- conflicting-accrual guard. Runs before the status flip: if reversal
    -- fails (e.g. locked period), the whole reopen rolls back untouched.
    v_reversed := reverse_staff_payroll_accruals(p_period, p_user_id);

    UPDATE payroll_runs
       SET status = 'rejected', rejected_at = NOW(), rejection_reason = 'Sent back by Finance for HR edits'
     WHERE id = v_run.id;

    UPDATE hr_monthly_payroll SET status = 'draft'
     WHERE period_month = p_period AND status = 'submitted';

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (p_user_id, 'payroll_run', v_run.id::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period, 'total_amount', v_run.total_amount,
            'accruals_auto_reversed', v_reversed, 'by_role', v_role));

    RETURN v_run.id;
END;
$function$;

COMMIT;
