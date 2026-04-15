-- ============================================================================
-- 20260101000105_fund_source_approval.sql
-- Phase 7 Step 8 — Loan IN (fund_sources) needs Principal approval before
-- money moves. Today's flow auto-credits hv_operating_fund.fund_in on submit;
-- under the new flow, submit creates a pending fund_source + an
-- approval_request. Principal approval activates the row and posts both the
-- Venture Pool credit AND bank balance bump.
--
-- Schema additions:
--   fund_source_status += 'pending_approval' (default for new submits)
--   fund_sources.repayment_date DATE (nullable; also read by Step 12 overdue)
--   approval_request_type += 'new_fund_source'
--
-- NOTE: PostgreSQL allows ALTER TYPE ADD VALUE inside a transaction since
-- v12, but you cannot USE the new value in the same transaction. This file
-- only adds values + the column; the new values are first used from app
-- code (fund-in/actions.ts + approvals/actions.ts) in Step 8's TS commit,
-- which runs after this migration has committed.
-- ============================================================================

ALTER TYPE fund_source_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'active';

ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'new_fund_source';

ALTER TABLE fund_sources
    ADD COLUMN IF NOT EXISTS repayment_date DATE;

COMMENT ON COLUMN fund_sources.repayment_date IS
    'Phase 7: expected repayment date for Loan IN. Advisory field — used together with lock_in_months by the overdue detector (Step 12).';
