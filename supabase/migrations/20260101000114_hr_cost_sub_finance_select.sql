-- ============================================================================
-- 20260101000114_hr_cost_sub_finance_select.sql
-- Phase 7 Step 15 hotfix #2 — Finance needs SELECT to see the approved
-- snapshots and click Execute transfers. Original policy was (principal, hr)
-- only.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS hr_cost_sub_ph_select ON hr_cost_submissions;

CREATE POLICY hr_cost_sub_pfh_select ON hr_cost_submissions
    FOR SELECT USING (current_user_role() IN ('principal', 'finance', 'hr'));

COMMIT;
