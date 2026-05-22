-- Dept-pool CASH openings set to the Bank Reconciliation (20/05/2026) basis.
-- One-time opening; ongoing movement comes from PV / invoice settlement
-- (apply_pool_adjustment). Negative balances must be expense_out + approval
-- (CHECK expense_has_approval) and bypass the sufficient-balance trigger for
-- the opening, so we briefly disable it. Director cash = 18,673.62 ("Director
-- & Office" line); the Director *P&L* (25,263.04) stays in the journal's
-- 'director' segment for the Accrual/P&L view.
ALTER TABLE dept_pools DISABLE TRIGGER trg_check_dept_pool_sufficient;

DELETE FROM dept_pools WHERE description LIKE '%Opening%' OR description LIKE '期初%';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 18673.62, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 20/05/2026)', 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 2255.49, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 20/05/2026)', '35c0e86d-bf69-4034-a92b-44b96830aaba', 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director Office';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 361.80, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 20/05/2026)', '35c0e86d-bf69-4034-a92b-44b96830aaba', 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Finance';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, approval_id, created_by)
SELECT id, 'expense_out'::dept_pool_txn_type, 6718.19, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 20/05/2026)', '35c0e86d-bf69-4034-a92b-44b96830aaba', 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Marketing';
-- HR cash = 0 (no row).

ALTER TABLE dept_pools ENABLE TRIGGER trg_check_dept_pool_sufficient;
