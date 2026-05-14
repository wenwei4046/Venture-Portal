-- 20260101000249_reparent_internal_funds_under_1000.sql
--
-- Hierarchy cleanup for the equity range. The mig 238 seed left all 9
-- equity rows flat:
--   1000 Equity & Internal Funds  (placeholder umbrella)
--   1010 HV Operating Fund
--   1020 Director Saving Fund
--   1030-1070 Dept Pools (5)
--   1080 Invoice Payout Pool
--
-- This makes the Settings → Accounts page look very crowded. mig 246 added
-- the parent_code column; this migration uses it to re-parent 1010-1080
-- under 1000 so the UI can render them indented (and let the user
-- collapse the whole group). 1000 becomes a header — it shouldn't appear
-- in any posting picker, which is fine because it was always a
-- placeholder.
--
-- Both 1000 and the children are type=equity, so the
-- coa_enforce_parent_type trigger from mig 246 will allow this UPDATE.
-- No data movement; balances and totals are unchanged.

BEGIN;

UPDATE chart_of_accounts
   SET parent_code = '1000'
 WHERE code IN ('1010', '1020', '1030', '1040', '1050', '1060', '1070', '1080')
   AND parent_code IS NULL;  -- idempotent: skip rows already re-parented

COMMIT;
