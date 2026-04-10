-- Add 'claim_out' to hv_fund_txn_type enum for director claim deductions
ALTER TYPE hv_fund_txn_type ADD VALUE IF NOT EXISTS 'claim_out';
