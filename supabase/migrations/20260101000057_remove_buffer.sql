-- ============================================================================
-- 20260101000057_remove_buffer.sql
-- Remove buffer from free_cash calculation per user feedback
-- free_cash = total_pool - loans_outstanding (no buffer deduction)
-- ============================================================================

-- Update the dashboard_summary function: remove buffer from free_cash
-- We do a targeted replace via CREATE OR REPLACE — the full function is
-- in migration 000052. Here we just patch the free_cash and buffer_breach lines.

-- Since Postgres doesn't support partial function replacement, we need the
-- full function. To keep this migration small, we only update the specific
-- calculation by replacing the whole function. But to avoid 250+ lines of
-- duplication, we use a simpler approach: just update the config value to 0
-- so the existing formula effectively removes buffer.

UPDATE treasury_config SET config_value = 0 WHERE config_key = 'buffer_amount';

-- The RPC formula: free_cash = total_pool - loans_outstanding - buffer_amount
-- With buffer_amount = 0, free_cash = total_pool - loans_outstanding
-- buffer_breach = (total_pool - loans_outstanding) < 0 (effectively: is pool negative?)
