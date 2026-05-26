-- Mig 270: revert Director's dept_pools opening from 37,218.37 to 17,566.94.
--
-- Per user clarification (2026-05-26): the 37,218.37 was the invoice pool
-- accumulation (4-director breakdown WL/MK/WS/WW), NOT Director's bank cash
-- slice. The 4-director breakdown belongs in invoice_payout_pool. Director's
-- dept_pools cash slice should match natural GL = 17,566.94 (no 19,651.43
-- transfer JE — that was the wrong interpretation).
--
-- Companion changes (applied in same session):
--   * GL re-import dropped the 2 cross-segment cleanup JEs (-19,651.43 from
--     corporate / +19,651.43 to director via 1900). They're now within-segment
--     Alliance↔HL moves only.
--   * invoice_payout_pool gets 4 new rows (one per director) summing to 37,218.37.

ALTER TABLE dept_pools DISABLE TRIGGER trg_check_dept_pool_sufficient;

DELETE FROM dept_pools
WHERE department_id = (SELECT id FROM departments WHERE name='Director')
  AND period_month = DATE '2026-05-01'
  AND description LIKE '%Opening cash (Bank Reconciliation 26/05/2026%';

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 17566.94, DATE '2026-05-01',
       'Opening cash (Bank Reconciliation 26/05/2026 — natural GL)',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director';

ALTER TABLE dept_pools ENABLE TRIGGER trg_check_dept_pool_sufficient;
