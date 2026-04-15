-- ============================================================================
-- 20260101000111_claims_source_pool.sql
-- Phase 7 Step 13 — Claims pick a source pool; Finance approval drafts a
-- voucher instead of moving money directly. Principal then approves the
-- voucher through the normal approvals queue.
--
-- Schema:
--   claims.source_pool  — which pool to debit on voucher execute
--   claims.voucher_id   — backlink to the generated payment_voucher
-- ============================================================================

BEGIN;

ALTER TABLE claims ADD COLUMN IF NOT EXISTS source_pool TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES payment_vouchers(id);

CREATE INDEX IF NOT EXISTS idx_claims_voucher ON claims(voucher_id) WHERE voucher_id IS NOT NULL;

COMMENT ON COLUMN claims.source_pool IS
    'Phase 7 Step 13: pool to debit when the claim voucher executes. Claimant picks at submit time.';
COMMENT ON COLUMN claims.voucher_id IS
    'Phase 7 Step 13: backlink to the payment_voucher created on Finance approval. Claim follows voucher status for payment tracking.';

COMMIT;
