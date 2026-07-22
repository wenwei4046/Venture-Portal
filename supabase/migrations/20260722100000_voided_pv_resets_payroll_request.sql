-- Mig 20260722100000: voiding a payroll funding PV must reset its funding
-- request (user-reported 2026-07-22).
--
-- PV HV-PV-202607-0115 (June funding remainder, RM 10,572.42) was voided on
-- 2026-07-21, but the payroll_payment_requests row it belonged to stayed at
-- status 'pv_generated' — the HR Payment page kept showing "PV generated ·
-- awaiting Principal" while Principal's queue (correctly) had nothing. The
-- live orphan was cancelled by direct SQL on 2026-07-22.
--
-- Fix: close_approvals_for_voided_voucher (already called on every void path)
-- now ALSO cancels any active payroll_payment_requests pointing at the voided
-- voucher, so the Payment page falls back to the re-file state.

BEGIN;

CREATE OR REPLACE FUNCTION public.close_approvals_for_voided_voucher(p_voucher_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_status payment_voucher_status;
    v_closed integer;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'close_approvals_for_voided_voucher: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT status INTO v_status FROM payment_vouchers WHERE id = p_voucher_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'close_approvals_for_voided_voucher: voucher % not found', p_voucher_id;
    END IF;
    IF v_status <> 'voided' THEN
        RAISE EXCEPTION 'close_approvals_for_voided_voucher: voucher is %, only voided vouchers qualify', v_status;
    END IF;

    UPDATE approval_requests
       SET status = 'rejected',
           workflow_state = 'rejected',
           notes = COALESCE(notes || ' | ', '') || 'Voucher voided'
     WHERE reference_id = p_voucher_id
       AND reference_table = 'payment_vouchers'
       AND status = 'pending';
    GET DIAGNOSTICS v_closed = ROW_COUNT;

    -- A voided funding PV leaves its payroll funding request dangling at
    -- submitted/pv_generated — cancel it so HR's Payment page offers re-file.
    UPDATE payroll_payment_requests
       SET status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = COALESCE(cancellation_reason || ' | ', '')
               || 'Linked PV voided — funding request reset for re-file'
     WHERE pv_id = p_voucher_id
       AND status IN ('submitted', 'pv_generated');

    RETURN v_closed;
END;
$function$;

COMMENT ON FUNCTION close_approvals_for_voided_voucher IS
    'Rejects every PENDING approval of a VOIDED voucher and cancels any active payroll funding request pointing at it (mig 20260722100000). SECURITY DEFINER: callers'' RLS must not silently no-op these resets.';

COMMIT;
