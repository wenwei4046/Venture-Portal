-- Mig 271: revert mig 270 — Director's dept_pools opening goes back to
-- 37,218.37, matching the cross-segment transfer JE in the GL re-import.
--
-- Per user clarification (2026-05-26, after seeing /dept-pool render):
--   /dept-pool Director should show 37,218.37 (cash slice including the
--   19,651.43 "borrowed from Office").
--   /dept-pool Office should show (8,565.84) (negative — Office overspent by
--   funding Director's portion).
--   invoice_payout_pool stays at 37,218.37 (4-director accumulator); the two
--   numbers tying = no money has been paid out yet ("pending payroll to PV").

ALTER TABLE dept_pools DISABLE TRIGGER trg_check_dept_pool_sufficient;

DELETE FROM dept_pools
WHERE department_id = (SELECT id FROM departments WHERE name='Director')
  AND period_month = DATE '2026-05-01'
  AND description LIKE '%Opening cash (Bank Reconciliation 26/05/2026%';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 37218.37, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026 — incl 19,651.43 top-up from Venture Pool)',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director';

ALTER TABLE dept_pools ENABLE TRIGGER trg_check_dept_pool_sufficient;
