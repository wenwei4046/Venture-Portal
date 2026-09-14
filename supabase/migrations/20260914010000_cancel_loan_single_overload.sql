-- Fix: cancelling a pending loan crashed the page (user 2026-09-14, Carres
-- 30,000 duplicate). Root cause: TWO overloads of cancel_loan_and_approval
-- coexisted — mig 17 created (uuid, text DEFAULT NULL); mig 107 meant to
-- "extend" it (also void the paired disbursement PV) but declared (uuid),
-- a different signature, so CREATE OR REPLACE added a sibling instead of
-- replacing. A one-argument call — which is what the app sends — matches
-- both → `function cancel_loan_and_approval(uuid) is not unique` (42725)
-- → Next.js error boundary. Latent since mig 107; first hit today.
--
-- Resolution: ONE function, (uuid, text DEFAULT NULL), carrying the union:
-- mig 107's group-aware voucher void + mig 17's reason + fail-loud state
-- check. The app's {p_loan_id} call resolves uniquely; callers may pass a
-- reason later.

BEGIN;

DROP FUNCTION IF EXISTS public.cancel_loan_and_approval(uuid);
DROP FUNCTION IF EXISTS public.cancel_loan_and_approval(uuid, text);

CREATE FUNCTION public.cancel_loan_and_approval(p_loan_id uuid, p_cancel_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role       user_role;
    v_caller_id  uuid;
    v_group_id   uuid;
    v_voucher_id uuid;
    v_note       text;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'cancel_loan_and_approval: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();
    v_note := COALESCE(NULLIF(trim(p_cancel_reason), ''), 'Cancelled by Finance before approval');

    IF NOT EXISTS (SELECT 1 FROM loans WHERE id = p_loan_id AND status = 'pending_approval') THEN
        RAISE EXCEPTION 'Loan % not found or not cancellable (status must be pending_approval)', p_loan_id;
    END IF;

    -- Approval group (mig 107: loan + disbursement PV share a group_id).
    SELECT group_id INTO v_group_id
      FROM approval_requests
     WHERE reference_id = p_loan_id
       AND reference_table = 'loans'
       AND request_type = 'new_loan'
       AND status = 'pending'
     LIMIT 1;

    UPDATE loans
       SET status = 'cancelled', updated_at = NOW()
     WHERE id = p_loan_id AND status = 'pending_approval';

    UPDATE approval_requests
       SET status = 'rejected',
           workflow_state = 'rejected',
           approved_by = v_caller_id,
           approved_at = NOW(),
           notes = v_note
     WHERE reference_id = p_loan_id
       AND reference_table = 'loans'
       AND status = 'pending';

    -- Void the paired disbursement voucher + its approval, if any.
    IF v_group_id IS NOT NULL THEN
        SELECT reference_id INTO v_voucher_id
          FROM approval_requests
         WHERE group_id = v_group_id
           AND request_type = 'payment_voucher'
         LIMIT 1;

        IF v_voucher_id IS NOT NULL THEN
            UPDATE payment_vouchers
               SET status = 'voided'
             WHERE id = v_voucher_id AND status = 'pending_approval';

            UPDATE approval_requests
               SET status = 'rejected',
                   workflow_state = 'rejected',
                   approved_by = v_caller_id,
                   approved_at = NOW(),
                   notes = v_note || ' (paired with loan)'
             WHERE group_id = v_group_id
               AND request_type = 'payment_voucher'
               AND status = 'pending';
        END IF;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.cancel_loan_and_approval(uuid, text) IS
    'Finance self-serve cancel of a pending_approval loan: rejects its approval, voids the group-paired disbursement PV. Single overload since mig 20260914010000 — never add a sibling signature.';

-- Guard: exactly one overload must remain, or the app call goes ambiguous again.
DO $$
DECLARE v_n integer;
BEGIN
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cancel_loan_and_approval';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'cancel_loan_and_approval must have exactly 1 overload, found %', v_n;
    END IF;
END $$;

COMMIT;
