-- ============================================================================
-- 20260101000112_hr_costing_approval.sql
-- Phase 7 Step 15 — HR Costing approval routing (HR → Principal → Finance)
--
-- Flow:
--   HR submits snapshot       → hr_cost_submissions row + approval_request
--                                (request_type=hr_costing, status=pending)
--   Principal approves        → execution_state='approved_for_execution'
--   Finance clicks Execute    → execution_state='executed'
--
-- No money movement here — billing downstream picks up approved submissions
-- when generating invoices. execution_state gates which snapshots are
-- considered "locked in".
-- ============================================================================

BEGIN;

-- Add the new approval_request_type enum value
ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'hr_costing';

-- Add execution_state to hr_cost_submissions (NULL default so existing rows
-- keep working without mid-migration guards; we treat NULL the same as
-- 'approved_for_execution' to avoid a back-compat break in billing)
ALTER TABLE hr_cost_submissions ADD COLUMN IF NOT EXISTS execution_state TEXT;

COMMENT ON COLUMN hr_cost_submissions.execution_state IS
    'Phase 7 Step 15: NULL for legacy rows (treated as approved). New submissions start as pending → approved_for_execution (Principal approved) → executed (Finance ran transfer acknowledgement).';

COMMIT;
