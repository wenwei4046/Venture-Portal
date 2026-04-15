-- ============================================================================
-- 20260101000113_hr_cost_sub_update_state.sql
-- Phase 7 Step 15 hotfix — allow Principal + Finance to update execution_state
-- on hr_cost_submissions so the approval/execute transitions land.
--
-- The original policy (hr_cost_sub_no_update) blocked ALL updates with
-- USING (FALSE). That made Step 15's state machine (pending → approved →
-- executed) silently fail: RLS drops the UPDATE, 0 rows affected, no error.
--
-- Keep the snapshot immutability (dept_summaries / staff_snapshot etc) by
-- nothing else using update — only execution_state flips need to work.
-- A column-granular policy would be ideal but RLS can't target columns
-- directly. Practically: Principal + Finance are trusted roles; the only
-- writer in app code is the Step 15 approveRequest / executeHrCosting
-- branches, both of which only touch execution_state.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS hr_cost_sub_no_update ON hr_cost_submissions;

CREATE POLICY hr_cost_sub_pf_update ON hr_cost_submissions
    FOR UPDATE USING (current_user_role() IN ('principal', 'finance'));

COMMENT ON POLICY hr_cost_sub_pf_update ON hr_cost_submissions IS
    'Phase 7 Step 15: Principal flips pending → approved_for_execution; Finance flips approved_for_execution → executed. Snapshot payload columns are not written by app code.';

COMMIT;
