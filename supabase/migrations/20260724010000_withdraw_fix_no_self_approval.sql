-- Fix: withdraw_pending_fund_source tripped no_self_approval (2026-07-24).
--
-- v1 closed the approval card with approved_by = auth.uid(). But the
-- withdrawer IS the submitter, and approval_requests enforces
--   no_self_approval CHECK (approved_by IS NULL OR approved_by <> submitted_by)
-- so the user's first real withdrawal blew up (postgres log 02:01 UTC), and the
-- action's throw surfaced as the app-wide error page. The whole RPC rolled
-- back, so the two pending sources were left untouched.
--
-- Fix: approved_by stays NULL — explicitly permitted by the constraint, and
-- approved_has_metadata only demands approved_by/approved_at for status
-- 'approved'. notes carries the audit trail; approved_at = now() timestamps it.

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

    -- approved_by MUST stay NULL: the withdrawer is the submitter and
    -- no_self_approval forbids approved_by = submitted_by.
    UPDATE approval_requests
       SET status         = 'rejected',
           workflow_state = 'rejected',
           approved_by    = NULL,
           approved_at    = now(),
           notes          = 'Withdrawn by submitter before approval'
     WHERE reference_table = 'fund_sources'
       AND reference_id    = p_fund_source_id
       AND status          = 'pending';
END $$;
