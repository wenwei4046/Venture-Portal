-- ============================================================================
-- 20260101000109_overdue_calendar_month.sql
-- Phase 7 Step 12 — calendar-month overdue
--
-- Old rule: calculate_days_overdue counted days since the last interest
-- payment, walking a 4-stage ladder (grace → late_1 → late_2 → escalation).
-- New rule: a loan is overdue for a calendar month if, after that month's
-- end date has passed, the month's expected interest was not paid AND the
-- loan still has outstanding principal.
--
-- Schema: add is_overdue BOOLEAN as the new source of truth. Keep the old
-- overdue_stage column NULLable for historical rows; new calendar-month
-- detections leave stage NULL.
-- ============================================================================

BEGIN;

ALTER TABLE overdue_records ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN overdue_records.is_overdue IS
    'Phase 7 Step 12: calendar-month source of truth. Historical rows inherit TRUE (they were detected as overdue under the old rule). New rows set TRUE on the period the interest went unpaid.';

-- Make overdue_stage nullable going forward (historical rows keep their value)
ALTER TABLE overdue_records ALTER COLUMN overdue_stage DROP NOT NULL;

COMMENT ON COLUMN overdue_records.overdue_stage IS
    'Legacy 4-stage enum. Deprecated in Step 12 — new detections leave this NULL and use is_overdue instead. Kept for historical audit trail.';

COMMIT;
