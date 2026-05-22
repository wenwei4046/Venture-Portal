-- Post-opening data corrections (ALREADY applied to production; archived here
-- so a from-scratch rebuild reproduces the same state). Run order assumes the
-- opening migrations (259/261/262) ran first.

-- 1) HOUZS Century fund-in monthly interest 3.5% -> 3% (BI#3 = 58k, BI#4 = 60k).
UPDATE fund_sources SET cost_rate = 0.03 WHERE notes IN ('[BI#3]', '[BI#4]');

-- 2) HOUZS Century interest payment 23,796.67 -> 23,206.67 (=> RM 590 less paid
--    because of the rate change above). Bank +590, interest expense -590,
--    Director cash pool +590.
WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no, transaction_date, period_month, description, reference_type, segment, total_amount, created_by)
 SELECT format('JE-%s-%s', to_char(DATE '2026-05-20', 'YYYYMM'), lpad(s.seq::text, 4, '0')), DATE '2026-05-20', DATE '2026-05-01',
   'Adjust: HOUZS Century interest 3.5%->3% (payment 23,796.67 -> 23,206.67, -590)', 'manual_jv', 'corporate'::gl_segment, 590.00, 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
SELECT e.id, x.code, x.dr, x.cr, x.memo FROM e, (VALUES
  ('3000', 590.00::numeric, NULL::numeric, 'Less cash paid to HOUZS Century (interest 3.5%->3%)'),
  ('9010', NULL::numeric, 590.00::numeric, 'Reverse over-accrued interest (HOUZS Century 3.5%->3%)')
) AS x(code, dr, cr, memo);

INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 590.00, DATE '2026-05-01', 'Adjust: HOUZS Century interest 3.5%->3% (+590 cash, less paid)', 'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name = 'Director';

-- 3) Clear the stale one-time venture_pool opening (it was the old "Director &
--    Office" balance, now duplicated in dept-pool cash via the Bank
--    Reconciliation). Venture Pool -> 0.
DELETE FROM venture_pool
WHERE description LIKE '期初余额 Opening%' OR description LIKE '%未兑现支票%';
