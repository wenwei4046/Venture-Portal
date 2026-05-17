-- 20260101000237_coa_schema_extensions.sql
-- Additive prep for the unified COA. Extends the existing account_type enum,
-- introduces cash_flow_category, adds a nullable column on chart_of_accounts,
-- and creates the next_account_code RPC + range-enforcement trigger. Nothing
-- here breaks the existing payment_categories table — that drops in mig 238.

BEGIN;

-- (1) Extend account_type enum. Postgres requires each ADD VALUE in its own
--     statement. IF NOT EXISTS keeps re-runs idempotent.
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'fixed_asset';
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'cost';
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'other_income';

-- (2) cash_flow_category enum (Operating / Investing / Financing — IFRS-style).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_flow_category') THEN
    CREATE TYPE cash_flow_category AS ENUM ('operating', 'investing', 'financing');
  END IF;
END $$;

-- (3) Add column to chart_of_accounts. Nullable until Task 3 backfills the
--     seed rows and flips NOT NULL.
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS cash_flow_category cash_flow_category;

COMMENT ON COLUMN chart_of_accounts.cash_flow_category IS
  'Determines which section (Operating / Investing / Financing) a cash movement '
  'on this account lands in on the Cash Flow Statement. Default derived from '
  'account.type at insert time but overridable per-account in Settings → Accounts.';

-- (4) next_account_code(type) — returns the next free code in the type''s range.
CREATE OR REPLACE FUNCTION next_account_code(p_type account_type)
RETURNS VARCHAR(10) LANGUAGE plpgsql AS $$
DECLARE
  v_start INT; v_end INT; v_max INT;
BEGIN
  CASE p_type
    WHEN 'equity'        THEN v_start := 1000; v_end := 1999;
    WHEN 'fixed_asset'   THEN v_start := 2000; v_end := 2999;
    WHEN 'asset'         THEN v_start := 3000; v_end := 3999;
    WHEN 'liability'     THEN v_start := 4000; v_end := 4999;
    WHEN 'revenue'       THEN v_start := 5000; v_end := 5999;
    WHEN 'cost'          THEN v_start := 6000; v_end := 6999;
    WHEN 'other_income'  THEN v_start := 7000; v_end := 7999;
    WHEN 'expense'       THEN v_start := 9000; v_end := 9999;
    ELSE
      RAISE EXCEPTION 'next_account_code: unknown account_type %', p_type;
  END CASE;

  SELECT COALESCE(MAX(code::INT), v_start - 1) INTO v_max
  FROM chart_of_accounts
  WHERE code ~ '^[0-9]+$' AND code::INT BETWEEN v_start AND v_end;

  IF v_max + 1 > v_end THEN
    RAISE EXCEPTION '% range exhausted (>% codes used)', p_type, v_end - v_start;
  END IF;
  RETURN (v_max + 1)::TEXT;
END $$;

GRANT EXECUTE ON FUNCTION next_account_code(account_type) TO authenticated;

-- (5) Range-enforcement trigger: any INSERT or UPDATE of code must fall
--     within the type's range. Applies to all existing rows on UPDATE; if
--     mig 238's reseed renumbers everything, those INSERTs satisfy the rule.
CREATE OR REPLACE FUNCTION coa_enforce_code_range()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_start INT; v_end INT; v_code_int INT;
BEGIN
  IF NEW.code !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'chart_of_accounts.code must be numeric, got "%"', NEW.code;
  END IF;
  v_code_int := NEW.code::INT;
  CASE NEW.type
    WHEN 'equity'        THEN v_start := 1000; v_end := 1999;
    WHEN 'fixed_asset'   THEN v_start := 2000; v_end := 2999;
    WHEN 'asset'         THEN v_start := 3000; v_end := 3999;
    WHEN 'liability'     THEN v_start := 4000; v_end := 4999;
    WHEN 'revenue'       THEN v_start := 5000; v_end := 5999;
    WHEN 'cost'          THEN v_start := 6000; v_end := 6999;
    WHEN 'other_income'  THEN v_start := 7000; v_end := 7999;
    WHEN 'expense'       THEN v_start := 9000; v_end := 9999;
    ELSE RAISE EXCEPTION 'coa_enforce_code_range: unknown type %', NEW.type;
  END CASE;
  IF v_code_int < v_start OR v_code_int > v_end THEN
    RAISE EXCEPTION 'chart_of_accounts.code % is outside %-% range for type %',
      NEW.code, v_start, v_end, NEW.type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coa_enforce_code_range_trigger ON chart_of_accounts;
CREATE TRIGGER coa_enforce_code_range_trigger
  BEFORE INSERT OR UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION coa_enforce_code_range();

COMMIT;
