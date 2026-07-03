-- Migration 255 added the 'inter_billing_out' dept_pool_txn_type;
-- createPaymentVoucher writes it for the PAYING dept when a Finance user settles
-- a dept_pool (inter-billing) invoice. But the Finance INSERT RLS policies on
-- dept_pools only permit 'np_in' and approval-gated 'expense_out' — there was no
-- policy for 'inter_billing_out'. So the settle insert hit
--   ERROR: new row violates row-level security policy for table "dept_pools"
-- and the whole settle threw (opaque "Server Components render" error in prod).
-- Historically the old code swallowed this and silently skipped the paying-side
-- debit (financially-wrong partial settle); a later "fail loud" change surfaced
-- it as a hard error, blocking inter-billing settlement entirely for Finance.
--
-- Fix: allow Finance to insert inter_billing_out rows. Inter-billing is a forced
-- obligation recorded at settle time (no approval gate), mirroring the shape of
-- dept_pools_finance_insert (np_in). Principal is already covered by
-- dept_pools_principal_insert.
CREATE POLICY dept_pools_finance_inter_billing_insert ON dept_pools
  FOR INSERT TO public
  WITH CHECK (
    current_user_role() = 'finance'::user_role
    AND transaction_type = 'inter_billing_out'::dept_pool_txn_type
  );
