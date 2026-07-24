-- Return a PENDING voucher to draft (2026-07-24, user request).
--
-- Scenario: Principal accidentally submitted HV-PV-202607-0111 themselves.
-- no_self_approval (correctly) blocks Principal approving OR rejecting their
-- own card, and Finance can't reach /approvals — the PV was stuck. Rather
-- than void + retype, the user asked to pull it back to draft and resubmit
-- with the Finance account (submitForApproval stamps the CURRENT user as
-- submitted_by, so the new card is approvable by Principal).
--
-- A pending PV has moved nothing (pool rows / JE / bank all post at
-- approval; verified 0 rows for PV-0111), so this only flips the voucher
-- status and closes its pending card. SECURITY DEFINER because Finance's
-- (and here even Principal's, per no_self_approval) RLS cannot close the
-- card client-side — the silent-0-rows class again.

CREATE OR REPLACE FUNCTION return_voucher_to_draft(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role    user_role;
    v_status  text;
    v_grouped int;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'return_voucher_to_draft: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;

    SELECT status INTO v_status
      FROM payment_vouchers
     WHERE id = p_voucher_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'return_voucher_to_draft: voucher % not found', p_voucher_id;
    END IF;
    IF v_status <> 'pending_approval' THEN
        RAISE EXCEPTION 'return_voucher_to_draft: voucher is % — only pending_approval can be returned to draft', v_status;
    END IF;

    -- Grouped (batch) approvals cover MANY vouchers with one card — pulling a
    -- single member back would leave the group card lying about its contents.
    SELECT count(*) INTO v_grouped
      FROM approval_requests
     WHERE reference_table = 'payment_vouchers'
       AND reference_id    = p_voucher_id
       AND status          = 'pending'
       AND group_id IS NOT NULL;
    IF v_grouped > 0 THEN
        RAISE EXCEPTION 'return_voucher_to_draft: voucher belongs to a grouped approval — void it instead';
    END IF;

    UPDATE payment_vouchers
       SET status = 'draft'
     WHERE id = p_voucher_id;

    -- approved_by stays NULL (no_self_approval forbids closer = submitter).
    UPDATE approval_requests
       SET status         = 'rejected',
           workflow_state = 'rejected',
           approved_by    = NULL,
           approved_at    = now(),
           notes          = 'Returned to draft for resubmission'
     WHERE reference_table = 'payment_vouchers'
       AND reference_id    = p_voucher_id
       AND status          = 'pending';
END $$;

REVOKE EXECUTE ON FUNCTION return_voucher_to_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION return_voucher_to_draft(uuid) TO authenticated;
