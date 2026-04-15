-- ============================================================================
-- 20260101000106_principal_approval_write_perms.sql
-- Phase 7 Step 8 — Principal needs WRITE permission on fund_sources +
-- hv_operating_fund when executing approval side-effects.
--
-- Latent pre-existing bug surfaced by Step 8: mig 11 scoped fund_sources
-- UPDATE and hv_operating_fund INSERT to Finance (+HR for fund ledger).
-- The Principal-driven approval workflow (approveRequest) needs to:
--   - UPDATE fund_sources.status from pending_approval → active
--   - INSERT hv_operating_fund.fund_in (and fund_out for new_loan)
-- Both were silently failing on RLS. The new_loan path happened to mostly
-- "work" because downstream displays didn't depend on the ledger row, but
-- Step 8 amount-diff E2E caught it immediately.
--
-- Fix: additive Principal policies. Existing Finance policies stay intact.
-- ============================================================================

BEGIN;

CREATE POLICY fund_sources_principal_update ON fund_sources
    FOR UPDATE USING (current_user_role() = 'principal');

CREATE POLICY hv_fund_principal_insert ON hv_operating_fund
    FOR INSERT WITH CHECK (current_user_role() = 'principal');

COMMIT;
