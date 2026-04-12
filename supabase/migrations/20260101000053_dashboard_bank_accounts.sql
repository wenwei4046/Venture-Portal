-- ============================================================================
-- 20260101000053_dashboard_bank_accounts.sql
-- Add bank_accounts array to dashboard_summary() return
-- HOUZS Venture Portal — Phase 4 Step 7
-- ============================================================================

-- We patch the function by adding the bank_accounts field to the JSONB build.
-- Instead of replacing the entire function (risk of drift), we use a wrapper
-- approach: create a small helper function, then update dashboard_summary
-- to call it. But given the monolithic RPC pattern, the cleanest approach
-- is a full CREATE OR REPLACE.

-- Since the full function is 250+ lines and was just replaced in 000052,
-- we'll add bank_accounts via a thin wrapper view that the frontend queries
-- separately. This avoids another full function replacement.

-- The frontend will query bank_accounts directly (RLS already allows
-- principal + finance to SELECT). No RPC change needed.

-- This migration is a no-op placeholder documenting the design decision.
-- The frontend reads bank_accounts via supabase.from('bank_accounts').select()
-- directly in the dashboard page component.

SELECT 1; -- no-op: bank_accounts already readable via RLS
