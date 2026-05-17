-- 20260101000243_submitter_can_update_own_pending_approval.sql
--
-- Bug surfaced 2026-05-14: Finance entered a fund source as RM 800,000 by
-- mistake, then used the edit flow to correct it to RM 80,000. The
-- fund_sources row updated correctly, but the approval_request kept showing
-- RM 800,000 in Principal's queue. Root cause: only the `approvals_principal_update`
-- RLS policy granted UPDATE on approval_requests — finance had no write
-- access, so the .update() in fund-in/actions.ts:updateFundSource silently
-- affected zero rows (PostgREST + supabase-js return no error on a 0-row
-- update by default).
--
-- This migration adds a tightly scoped policy: the submitter of a STILL
-- PENDING approval can UPDATE it. They cannot mutate someone else's
-- submission, and once Principal has actioned it (status != 'pending'), it
-- becomes immutable to them again.
--
-- Why this is safe:
--   - Principal still owns the approval/reject decision.
--   - The submitter can only fix their own typo before Principal acts.
--   - Once status flips to 'approved' / 'rejected' the policy stops matching.
--   - The WITH CHECK keeps status & submitted_by pinned, so finance can't
--     promote their own approval or hand it off to another user mid-edit.

BEGIN;

CREATE POLICY approvals_submitter_update_own_pending ON approval_requests
  FOR UPDATE
  USING (
    status = 'pending'
    AND submitted_by = auth.uid()
    AND current_user_role() = ANY (ARRAY['finance'::user_role, 'hr'::user_role, 'dept_manager'::user_role])
  )
  WITH CHECK (
    status = 'pending'
    AND submitted_by = auth.uid()
  );

COMMIT;
