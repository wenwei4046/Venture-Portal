-- Fund IN 撤回 (2026-07-24, user request).
--
-- Finance had no way to kill a WRONGLY-SUBMITTED fund source while it was
-- still pending_approval: the detail page only offered Edit (typo fixes), and
-- cancelFundSource explicitly requires status='active' (it files a Principal
-- approval because an active deposit needs reversal). A pending source has
-- moved NO money (bank/pool/GL post only on approval), so the submitter
-- withdrawing it is side-effect-free — mirror Fund OUT, where Finance can
-- cancel a pending loan directly.
--
-- SECURITY DEFINER is required for the second half: closing the approval card.
-- Finance's RLS cannot update approval_requests — an inline client update
-- would "succeed" with 0 rows and strand a dead card in Principal's queue
-- (exact bug class as the voided-PV orphans, mig 20260721020000).

CREATE OR REPLACE FUNCTION withdraw_pending_fund_source(p_fund_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role   user_role;
    v_status fund_source_status;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'withdraw_pending_fund_source: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;

    SELECT status INTO v_status
      FROM fund_sources
     WHERE id = p_fund_source_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'withdraw_pending_fund_source: fund source % not found', p_fund_source_id;
    END IF;
    IF v_status <> 'pending_approval' THEN
        RAISE EXCEPTION 'withdraw_pending_fund_source: fund source is % — only pending_approval can be withdrawn (active ones need a cancellation request)', v_status;
    END IF;

    UPDATE fund_sources
       SET status = 'cancelled'
     WHERE id = p_fund_source_id;

    -- Close every pending approval card for this source, same fields
    -- Principal's reject writes (status/workflow_state/approved_by/approved_at).
    UPDATE approval_requests
       SET status         = 'rejected',
           workflow_state = 'rejected',
           approved_by    = auth.uid(),
           approved_at    = now(),
           notes          = 'Withdrawn by submitter before approval'
     WHERE reference_table = 'fund_sources'
       AND reference_id    = p_fund_source_id
       AND status          = 'pending';
END $$;

REVOKE EXECUTE ON FUNCTION withdraw_pending_fund_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION withdraw_pending_fund_source(uuid) TO authenticated;
