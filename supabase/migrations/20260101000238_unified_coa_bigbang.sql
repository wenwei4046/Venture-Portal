-- 20260101000238_unified_coa_bigbang.sql
-- Big-bang switch to the unified Chart of Accounts.
--
-- Pre-requisites (must hold BEFORE running this migration):
--   - wipe-all-business-data.mjs --confirm has been run.
--     -> payment_voucher_sources, journal_lines, journal_entries are empty.
--     -> bank_accounts rows still exist with current_balance = 0.
--   - mig 234 / 235 / 236 from the previous batch are NOT applied (this
--     migration supersedes them — they're skipped).
--
-- What this migration does:
--   (1) Drop payment_categories (CASCADE removes the FK from
--       payment_voucher_sources.category_code).
--   (2) Rename payment_voucher_sources.category_code → account_code; add NOT
--       NULL + FK to chart_of_accounts(code).
--   (3) Temporarily unhook bank_accounts.gl_account_code (set NULL) so the
--       wipe of chart_of_accounts doesn't trip any FK.
--   (4) DELETE every existing chart_of_accounts row.
--   (5) INSERT the 28 seed rows under the new number scheme + cash_flow_category.
--   (6) Re-point bank_accounts.gl_account_code at the new codes.
--   (7) Flip chart_of_accounts.cash_flow_category NOT NULL.

BEGIN;

-- ── 0. Safety check: pre-req tables are empty ──────────────────────────────
DO $$
DECLARE
  v_pvs_count INT;
  v_lines_count INT;
BEGIN
  SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources;
  SELECT COUNT(*) INTO v_lines_count FROM journal_lines;
  IF v_pvs_count > 0 OR v_lines_count > 0 THEN
    RAISE EXCEPTION
      'unified COA migration requires payment_voucher_sources and journal_lines to be empty (run wipe-all-business-data.mjs --confirm first). Found % pvs rows, % line rows',
      v_pvs_count, v_lines_count;
  END IF;
END $$;

-- ── 1. Drop payment_categories (CASCADE clears the FK from PVS) ────────────
DROP TABLE IF EXISTS payment_categories CASCADE;

-- ── 2. Rename PVS.category_code → account_code; FK to chart_of_accounts ────
ALTER TABLE payment_voucher_sources
  RENAME COLUMN category_code TO account_code;

-- Ensure NOT NULL (was set by mig 235 if applied; safe to re-set).
ALTER TABLE payment_voucher_sources
  ALTER COLUMN account_code SET NOT NULL;

ALTER TABLE payment_voucher_sources
  ADD CONSTRAINT pvs_account_code_fk
  FOREIGN KEY (account_code) REFERENCES chart_of_accounts(code);

-- ── 3. Temporarily null bank_accounts.gl_account_code to let us wipe COA ───
UPDATE bank_accounts SET gl_account_code = NULL;

-- ── 4. Wipe chart_of_accounts ──────────────────────────────────────────────
DELETE FROM chart_of_accounts;

-- ── 5. Seed 28 system accounts (code / name / type / cash_flow_category) ───
INSERT INTO chart_of_accounts (code, name, type, cash_flow_category, is_active, sort_order) VALUES
  -- Equity (1000-1999)
  ('1000', 'Equity & Internal Funds',       'equity',       'financing', true, 10),
  ('1010', 'HV Operating Fund',             'equity',       'financing', true, 20),
  ('1020', 'Director Saving Fund',          'equity',       'financing', true, 30),
  ('1030', 'Dept Pool — Marketing',         'equity',       'financing', true, 40),
  ('1040', 'Dept Pool — Finance',           'equity',       'financing', true, 50),
  ('1050', 'Dept Pool — HR',                'equity',       'financing', true, 60),
  ('1060', 'Dept Pool — Director Office',   'equity',       'financing', true, 70),
  ('1070', 'Dept Pool — Director',          'equity',       'financing', true, 80),
  ('1080', 'Invoice Payout Pool',           'equity',       'financing', true, 90),
  -- Fixed Asset (2000-2999)
  ('2000', 'Equipment / Computer',          'fixed_asset',  'investing', true, 10),
  -- Asset (3000-3999)
  ('3000', 'Cash & Bank — Hong Leong',      'asset',        'operating', true, 10),
  ('3010', 'Cash & Bank — Alliance (HR)',   'asset',        'operating', true, 20),
  ('3020', 'Loans Receivable',              'asset',        'investing', true, 30),  -- override: lending = investing
  ('3030', 'Accounts Receivable — Subs',    'asset',        'operating', true, 40),
  ('3040', 'Interest Receivable',           'asset',        'operating', true, 50),
  ('3050', 'Director Advance',              'asset',        'operating', true, 60),
  -- Liability (4000-4999)
  ('4000', 'Fund Sources Payable',          'liability',    'financing', true, 10),
  ('4010', 'Interest Payable — Fund Sources','liability',   'operating', true, 20),  -- override: interest is operating
  ('4020', 'Salary Payable (75% Payroll)',  'liability',    'operating', true, 30),
  ('4030', 'Statutory Payable',             'liability',    'operating', true, 40),
  ('4040', 'Director Invoice Payable (25%)','liability',    'operating', true, 50),
  ('4050', 'Accounts Payable — General',    'liability',    'operating', true, 60),
  -- Revenue (5000-5999)
  ('5000', 'Service Revenue — Subs',        'revenue',      'operating', true, 10),
  -- Other Income (7000-7999)
  ('7000', 'Interest Income — Loans',       'other_income', 'operating', true, 10),
  ('7010', 'Penalty Income',                'other_income', 'operating', true, 20),
  -- Expense (9000-9999)
  ('9000', 'General & Admin Expenses',      'expense',      'operating', true, 10),
  ('9010', 'Interest Expense — Fund Sources','expense',     'operating', true, 20),
  ('9020', 'Marketing Expense',             'expense',      'operating', true, 30),
  ('9030', 'Salary Expense',                'expense',      'operating', true, 40),
  ('9040', 'Statutory Employer Contribution','expense',     'operating', true, 50);

-- ── 6. Re-point bank_accounts at the new codes ─────────────────────────────
UPDATE bank_accounts SET gl_account_code = '3000' WHERE bank_name ILIKE 'Hong Leong%';
UPDATE bank_accounts SET gl_account_code = '3010' WHERE bank_name ILIKE 'Alliance%';

-- Optional safety: any active bank account that didn't match falls back to 3000.
UPDATE bank_accounts SET gl_account_code = '3000'
  WHERE gl_account_code IS NULL AND status = 'active';

-- ── 7. Flip cash_flow_category NOT NULL (all 28 seed rows have a value) ────
ALTER TABLE chart_of_accounts
  ALTER COLUMN cash_flow_category SET NOT NULL;

COMMIT;
