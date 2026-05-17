-- 20260101000248_coa_is_internal_fund.sql
--
-- "Option C-Lite" — visual fix for the bloated Equity section on the
-- Balance Sheet. The 8 internal pool accounts (HV Operating Fund, Director
-- Saving Fund, the 5 Dept Pools, Invoice Payout Pool) live in the equity
-- range (1010-1080) because mig 238's unified-COA design used the GL itself
-- as the per-pool sub-ledger. Strict accounting would have these as
-- internal management-accounting buckets, not equity rows; users see them
-- in Settings → Accounts and asked "why so many equity accounts?".
--
-- This migration adds a boolean flag `is_internal_fund` that lets the
-- Balance Sheet (and any other reader) split the equity section into:
--   - Real equity: 1000 + retained earnings YTD
--   - Internal funds: 1010-1080 listed individually
-- Math is unchanged; A = L + E still ties — only the rendering separates
-- the two concepts.
--
-- This does NOT change the architectural decision to use the GL as the
-- pool sub-ledger. A future "Option C-Full" migration could pull internal
-- funds out of chart_of_accounts entirely, but that's a much bigger change.

BEGIN;

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_internal_fund BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN chart_of_accounts.is_internal_fund IS
  'True for internal pool accounts (1010-1080) that live in the equity range '
  'but represent management-accounting buckets rather than real share capital '
  'or retained earnings. Drives the Balance Sheet split into Equity vs '
  'Internal Funds sections.';

-- Mark the 8 mig-238 internal pool accounts. Anything else stays false.
UPDATE chart_of_accounts
   SET is_internal_fund = true
 WHERE code IN ('1010', '1020', '1030', '1040', '1050', '1060', '1070', '1080');

COMMIT;
