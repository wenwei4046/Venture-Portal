-- ============================================================================
-- 20260101000147_alliance_pool_hr_select.sql
-- Grant HR read-only access to alliance_bank_pool + its balance view.
--
-- Context: Phase 7 UX pass added a dedicated HR "Payment" tab that surfaces
-- the current HR Pool balance alongside the payroll payment request flow.
-- Overview also shows the pool balance for HR. Both require SELECT on the
-- pool table and its balance view.
--
-- HR previously had no visibility into the pool even though they drive the
-- payroll cycle that funds and drains it. Read-only is safe: HR already
-- knows which transfers happen (payroll approvals) because they submit
-- those requests.
-- ============================================================================

BEGIN;

-- Drop the old principal/finance-only SELECT and re-create with HR included.
DROP POLICY IF EXISTS alliance_pool_principal_finance_select ON alliance_bank_pool;

CREATE POLICY alliance_pool_principal_finance_hr_select
    ON alliance_bank_pool FOR SELECT
    USING (current_user_role() IN ('principal', 'finance', 'hr'));

COMMIT;
