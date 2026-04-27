-- ============================================================================
-- 20260101000214_payment_categories_account_type.sql
-- Add account_type to payment_categories so every category carries an
-- explicit Balance-Sheet vs P&L classification.
--
-- Why
-- ---
-- Mig 61 made gl_account_code nullable. createPaymentCategory (payments
-- /actions.ts:427) only saves {code, label, is_active} — no GL code, no type.
-- After mig 204 soft-wiped the 15 seed categories, every active category in
-- the DB is user-built and therefore has gl_account_code = NULL. This means
-- post_journal_entry calls fall back to coarse voucher_type → GL routing
-- (mig 179) — Marketing, Staff Cost, G&A, Claims all collapse into one
-- 5050 catch-all because the per-source category never resolves.
--
-- This migration:
--   1. Adds payment_categories.account_type (reuses existing account_type ENUM
--      from mig 48: asset | liability | equity | revenue | expense)
--   2. Backfills account_type from chart_of_accounts.type for any rows that
--      already have a gl_account_code mapped
--   3. Leaves account_type nullable so the migration is non-blocking; app
--      validation (next commit) makes it required on new rows
-- ============================================================================

BEGIN;

-- 1) Add column (nullable for now — app enforces NOT NULL going forward)
ALTER TABLE payment_categories
    ADD COLUMN account_type account_type;

COMMENT ON COLUMN payment_categories.account_type IS
    'Balance-Sheet vs P&L classification. asset/liability/equity → BS; revenue/expense → P&L. Required on new rows via app validation. Must agree with chart_of_accounts.type when gl_account_code is set.';

-- 2) Backfill from chart_of_accounts.type where gl_account_code is set
UPDATE payment_categories pc
SET account_type = coa.type
FROM chart_of_accounts coa
WHERE pc.gl_account_code = coa.code
  AND pc.account_type IS NULL;

-- 3) Consistency check helper — if both fields are set, they must agree
CREATE OR REPLACE FUNCTION pc_account_type_matches_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_type account_type;
BEGIN
    IF NEW.gl_account_code IS NULL OR NEW.account_type IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT type INTO v_gl_type
      FROM chart_of_accounts
     WHERE code = NEW.gl_account_code;

    IF v_gl_type IS NULL THEN
        RAISE EXCEPTION
            'pc_account_type_matches_gl: gl_account_code "%" not in chart_of_accounts',
            NEW.gl_account_code;
    END IF;

    IF v_gl_type <> NEW.account_type THEN
        RAISE EXCEPTION
            'pc_account_type_matches_gl: category "%" has account_type=% but GL account % is type=%',
            NEW.code, NEW.account_type, NEW.gl_account_code, v_gl_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pc_account_type_matches_gl_trigger ON payment_categories;
CREATE TRIGGER pc_account_type_matches_gl_trigger
    BEFORE INSERT OR UPDATE ON payment_categories
    FOR EACH ROW
    EXECUTE FUNCTION pc_account_type_matches_gl();

COMMIT;
