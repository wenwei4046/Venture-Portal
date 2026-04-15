-- ============================================================================
-- 20260101000104_dept_pools_finance_voucher_expense.sql
-- Phase 7 Step 6 — Finance can INSERT expense_out into dept_pools when the
-- row carries an approval_id (i.e. originates from an approved payment
-- voucher). This closes a latent gap in mig 11 where Finance could only
-- insert np_in, so any Finance-executed voucher that debited a dept pool
-- silently failed its dept_pools write (RLS denied → no throw → voucher
-- still marked paid). Step 6's multi-source UI is the first time this
-- path is seriously exercised.
--
-- Security rationale: approval_id being NOT NULL means a Principal-approved
-- approval_request authorized this expense. The dept_pools CHECK constraint
-- already enforces expense_has_approval (mig 6). This policy just makes
-- the authorized write reachable for Finance.
-- ============================================================================

BEGIN;

CREATE POLICY dept_pools_finance_voucher_expense_insert ON dept_pools
    FOR INSERT WITH CHECK (
        current_user_role() = 'finance'
        AND transaction_type = 'expense_out'
        AND approval_id IS NOT NULL
    );

COMMIT;
