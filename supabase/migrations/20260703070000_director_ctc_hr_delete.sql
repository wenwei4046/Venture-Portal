-- ============================================================================
-- 20260703070000_director_ctc_hr_delete.sql
-- Allow HR to delete director_ctc rows.
--
-- The Phase-1 no_delete policy made a wrongly-entered CTC row permanent: the
-- CTC grid skips all-zero rows on save, and RLS blocked DELETE outright, so
-- clearing a company's cells could never remove the stale row — Calculate
-- kept pulling it into the pool (user report 2026-07-03).
--
-- batchSaveCTC now treats an all-zero company row as "remove this company's
-- CTC for the period"; this policy lets that DELETE through. Same guards as
-- edits: period-lock at the action layer, and a submitted month must be
-- reopened first (the grid is read-only while submitted). salary_pool /
-- director_payouts stay no-delete (recalculate rewrites them via RPC).
-- ============================================================================

CREATE POLICY director_ctc_hr_delete ON director_ctc
    FOR DELETE USING (current_user_role() = 'hr');
