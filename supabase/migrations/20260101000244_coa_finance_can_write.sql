-- 20260101000244_coa_finance_can_write.sql
--
-- Bug surfaced 2026-05-14: Finance tried to add an "Office Rental Expense"
-- account in Settings → Chart of Accounts and the form errored with:
--   "Failed to create account: new row violates row-level security policy
--    for table 'chart_of_accounts'"
--
-- The TS action settings/actions.ts:createAccount uses
-- `requireRole(['principal', 'finance'])`, but the RLS policies coa_insert
-- and coa_update only allowed `principal`. So finance hit a wall every
-- time despite the UI presenting the form. SELECT was already open to all,
-- which is why finance could see the list but not write.
--
-- Fix: drop and recreate coa_insert / coa_update to allow both principal
-- and finance. coa_select and coa_no_delete are unchanged. Adding /
-- renaming accounts is a finance-controllers operation in normal accounting
-- shops; the product decision (per the TS) was already to let finance do
-- it, RLS just lagged behind.

BEGIN;

DROP POLICY IF EXISTS coa_insert ON chart_of_accounts;
CREATE POLICY coa_insert ON chart_of_accounts
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role]));

DROP POLICY IF EXISTS coa_update ON chart_of_accounts;
CREATE POLICY coa_update ON chart_of_accounts
  FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role]));

COMMIT;
