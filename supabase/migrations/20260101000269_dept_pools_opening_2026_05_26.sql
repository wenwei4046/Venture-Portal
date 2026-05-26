-- Mig 269: dept_pools opening reset for the 26-May-2026 GL re-import.
--
-- Wipes all prior opening + adjustment rows from migs 262 (bank-recon opening),
-- 263 (HOUZS Century +590 correction), and the manual restores from session
-- 2026-05-26. Inserts new openings per the 26-May-2026 bank reconciliation:
--
--   Director         np_in        37,218.37   (Director + Office slice)
--   Director Office  expense_out   2,255.49
--   Finance          expense_out     361.80
--   Marketing        expense_out  16,107.10
--   HR               (no row, balance = 0)
--
-- The Director 37,218.37 includes a 19,651.43 top-up from Venture Pool — that
-- portion is realised in journal_lines via the BANK-CLEANUP-CORP-XFER /
-- BANK-CLEANUP-DIR-XFER pair (see gl-import-apply-v2 run).
--
-- Sum of dept_pool openings = 37,218.37 - 2,255.49 - 361.80 - 16,107.10 = 18,493.98.
-- Venture (Office) from GL = -8,565.84.
-- Total /dept-pool cash = 18,493.98 + (-8,565.84) = 9,928.14 ✓ tie bank.

ALTER TABLE dept_pools DISABLE TRIGGER trg_check_dept_pool_sufficient;

DELETE FROM dept_pools
WHERE description LIKE '%Opening%'
   OR description LIKE '%Adjust: HOUZS Century interest 3.5%'
   OR description LIKE '%期初%';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 37218.37, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026 — incl 19,651.43 top-up from Venture Pool)',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 2255.49, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026)',
       '35c0e86d-bf69-4034-a92b-44b96830aaba',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director Office';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 361.80, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026)',
       '35c0e86d-bf69-4034-a92b-44b96830aaba',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Finance';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 16107.10, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026)',
       '35c0e86d-bf69-4034-a92b-44b96830aaba',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Marketing';

-- HR cash = 0 (no row).

ALTER TABLE dept_pools ENABLE TRIGGER trg_check_dept_pool_sufficient;
