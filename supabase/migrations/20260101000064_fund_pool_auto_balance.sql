-- ============================================================================
-- 20260101000064_fund_pool_auto_balance.sql
-- Add new enum values for fund_in/fund_out/loan_repayment_in
-- Must be separate migration from backfill (PG requires commit before use)
-- ============================================================================

ALTER TYPE hv_fund_txn_type ADD VALUE 'fund_in';
ALTER TYPE hv_fund_txn_type ADD VALUE 'fund_out';
ALTER TYPE hv_fund_txn_type ADD VALUE 'loan_repayment_in';
