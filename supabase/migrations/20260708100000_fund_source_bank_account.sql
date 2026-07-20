-- ============================================================================
-- 20260708100000_fund_source_bank_account.sql
-- Fund IN: let Finance pick WHICH bank receives the deposit (user 2026-07-08).
--
-- Fund OUT (new loan) already has a "Pay from bank" picker (mig 20260612040000
-- → create_loan_with_approval p_bank_account_id). Fund IN had no equivalent: on
-- approval it always bumped the is_primary bank and posted the GL debit to that
-- bank's code, so every deposit landed in Hong Leong with no way to route it to
-- Alliance.
--
-- NULL = "primary bank" (legacy rows + anyone who doesn't pick), so existing
-- data and the approval fallback keep working unchanged.
-- ============================================================================

ALTER TABLE fund_sources
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN fund_sources.bank_account_id IS
  'Which HV bank account receives this deposit. Set by Finance on the Fund IN '
  'form; consumed at approval for the bank-balance bump + the GL debit leg. '
  'NULL falls back to the primary active bank (legacy / unpicked).';
