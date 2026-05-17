-- 20260101000255_dept_pool_inter_billing_txn_type.sql
--
-- Inter-billing settlement (mig 253) writes a JE expense + a mig-254 mirror
-- payment_voucher_sources row, but those don't propagate to the
-- /dept-pool views — those read `dept_pools.transaction_type` IN
-- ('np_in', 'expense_out'), not payment_voucher_sources.
--
-- Calling adjustPool(payingPool, 'out', amount) for inter-billing would
-- write a transaction_type='expense_out' row. That hits the
-- check_dept_pool_sufficient BEFORE INSERT trigger — it rejects when the
-- pool balance < amount. For a forced obligation like inter-billing
-- (HR didn't choose to spend; Marketing billed them), the trigger has
-- no business blocking the entry; the pool MUST be allowed to go
-- negative because the obligation exists regardless of balance.
--
-- Fix:
--   (1) Add a new enum value 'inter_billing_out' on dept_pool_txn_type.
--   (2) check_dept_pool_sufficient already short-circuits on anything
--       other than 'expense_out', so the new value passes the trigger
--       unchanged.
--   (3) /dept-pool views sum 'inter_billing_out' into the Out (this
--       month) total alongside 'expense_out' (handled in the page
--       components, not the schema).
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, AND a
-- new enum value cannot be referenced in the same transaction it was
-- added. So this migration splits into two phases:
--   Phase 1: ADD VALUE outside any transaction.
--   Phase 2 (separate COMMIT cycle): recreate the dept_pool_balances view
--           to treat the new enum value as a negative balance contribution
--           — without this, HR's balance shows 0 after an inter_billing_out
--           row instead of -RM N, and the BS / dept-pool views drift.

-- ── Phase 1 ─────────────────────────────────────────────────────────────────
ALTER TYPE dept_pool_txn_type ADD VALUE IF NOT EXISTS 'inter_billing_out';

COMMENT ON TYPE dept_pool_txn_type IS
  'np_in           = revenue / inflow (invoice settled into the pool). '
  'expense_out     = discretionary spend (subject to '
  'check_dept_pool_sufficient — pool must have balance). '
  'inter_billing_out = forced obligation from inter-billing settlement; '
  'bypasses the sufficiency check because the dept did not choose to '
  'incur it. The /dept-pool views fold it into Out totals.';

-- ── Phase 2 ─────────────────────────────────────────────────────────────────
-- Recreate the balance view so inter_billing_out subtracts from balance,
-- same direction as expense_out. Without this the trigger lets the row in
-- but the balance stays unchanged → HR shows 0 instead of -RM N.
--
-- The CASE compares transaction_type::text rather than the typed enum
-- literal because PostgreSQL refuses to reference a freshly-added enum
-- value in the same transaction it was added. text-cast comparison sidesteps
-- that without needing a separate migration file.
CREATE OR REPLACE VIEW dept_pool_balances AS
  SELECT department_id,
         COALESCE(SUM(
           CASE transaction_type::text
             WHEN 'np_in' THEN amount
             WHEN 'expense_out' THEN -amount
             WHEN 'inter_billing_out' THEN -amount
             ELSE 0::numeric
           END
         ), 0::numeric) AS balance
    FROM dept_pools
   GROUP BY department_id;
