-- 20260101000247_fund_sources_account_code.sql
--
-- Fund-in (`fund_sources`) currently doesn't carry which COA liability /
-- equity account it represents — the approval flow (approvals/actions.ts)
-- posts the activation JE with a hardcoded `4000 Fund Sources Payable`.
-- That collapses every depositor into one giant payable row, so we can't
-- show "I owe Lim Wei Siang RM 80,000" vs "I owe Carres RM 50,000" on
-- the Balance Sheet.
--
-- This migration:
--   (1) Adds fund_sources.account_code TEXT (nullable for now; existing
--       rows have no value and will fall back to '4000' at approval time).
--   (2) FK to chart_of_accounts(code).
--   (3) CHECK that, if set, the account is liability- or equity-typed
--       (subsidiary deposits / director loans are liabilities; some
--       intra-group dept transfers are equity reclasses).
--   (4) Attaches the header-rejection trigger from mig 246.
--
-- A separate TS change in approvals/actions.ts switches the JE to use
-- fund_source.account_code (or '4000' fallback if NULL — keeps legacy
-- rows working).

BEGIN;

ALTER TABLE fund_sources
  ADD COLUMN IF NOT EXISTS account_code TEXT;

ALTER TABLE fund_sources
  ADD CONSTRAINT fund_sources_account_code_fk
  FOREIGN KEY (account_code) REFERENCES chart_of_accounts(code);

-- Defer-style validation: any row that sets account_code must point at a
-- BS-side liability/equity account. (asset/fixed_asset are theoretically
-- possible for the dept_pool transfer case where HV gains an equity stake,
-- but in practice today only liability + equity are used. Expand if needed.)
CREATE OR REPLACE FUNCTION fund_sources_validate_account_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type account_type;
BEGIN
  IF NEW.account_code IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT type INTO v_type FROM chart_of_accounts WHERE code = NEW.account_code;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'fund_sources.account_code % does not exist in chart_of_accounts', NEW.account_code;
  END IF;
  IF v_type NOT IN ('liability', 'equity') THEN
    RAISE EXCEPTION 'fund_sources.account_code % is type % — must be liability or equity', NEW.account_code, v_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fund_sources_validate_account_code_trigger ON fund_sources;
CREATE TRIGGER fund_sources_validate_account_code_trigger
  BEFORE INSERT OR UPDATE OF account_code ON fund_sources
  FOR EACH ROW
  EXECUTE FUNCTION fund_sources_validate_account_code();

-- Hook the mig-246 header rejection trigger.
DROP TRIGGER IF EXISTS fund_sources_reject_header_account ON fund_sources;
CREATE TRIGGER fund_sources_reject_header_account
  BEFORE INSERT OR UPDATE OF account_code ON fund_sources
  FOR EACH ROW
  EXECUTE FUNCTION coa_reject_header_post('account_code');

COMMIT;
