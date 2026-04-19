-- ============================================================================
-- 20260101000174_dept_payment_request_enum.sql
-- PR #4 follow-up: extend approval_request_type enum so submit_dept_payment_request
-- can insert into approval_requests. Postgres requires ALTER TYPE ... ADD VALUE
-- to be in its own transaction, so this lives in a separate migration from 173.
-- ============================================================================

ALTER TYPE approval_request_type ADD VALUE IF NOT EXISTS 'dept_payment_request';
