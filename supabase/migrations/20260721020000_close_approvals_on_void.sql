-- Mig 20260721020000: closing a voided voucher's pending approval must not
-- depend on the caller's RLS rights (audit finding 2026-07-21, user-reported).
--
-- voidVoucher (payments/actions.ts) voids a draft/pending PV and then tries to
-- reject the linked approval_requests row — but that UPDATE runs under the
-- caller's RLS. Finance isn't allowed to update approval_requests, PostgREST
-- returns success-with-0-rows, and the result was never checked → the PV died
-- while its approval stayed PENDING in Principal's queue (17 orphans found
-- live: the 16 voided statutory PVs of 2026-07-20 + one from 2026-07-15; all
-- cleaned by direct SQL, recorded in HANDOFF). Approving such an orphan was
-- harmless (approve_single_voucher raises on a non-pending voucher) but the
-- queue filled with dead cards.
--
-- Fix: a SECURITY DEFINER RPC that rejects every pending approval of a voucher
-- AFTER verifying the voucher really is voided. voidVoucher now calls it and
-- fails loud.

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

    RETURN v_closed;
END;
$function$;

COMMENT ON FUNCTION close_approvals_for_voided_voucher IS
    'Mig 20260721020000: rejects every PENDING approval_requests row of a VOIDED voucher — SECURITY DEFINER so Finance/HR voiding a pending PV reliably clears it from Principal''s queue (the old inline update was silently RLS-blocked).';

COMMIT;
