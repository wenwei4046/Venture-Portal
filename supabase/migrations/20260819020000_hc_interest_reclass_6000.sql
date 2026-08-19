-- Data fix (2026-08-19): HV-PV-202607-0145 "FUND RETURN TO HOUZS" paid
-- RM 2,800 interest TO HOUZS Century with "Loan Interest" (5027, revenue)
-- picked as the source account, so JE-202607-0301 DEBITED 5027 — netting the
-- 2,800 off July's interest income instead of showing it as cost of funds.
-- The book's own account for this is 6000 Interest Expense - Fund Sources
-- (BA interest to HC uses 6001 the same way); this was the only line ever
-- debited to 5027.
--
-- User: "要调，但是你不能直接改去6000 interest expense 吗？我不想要特地开一
-- 张jv" — so reclass the EXISTING line in place (same JE, same date, same
-- amount; still balanced) instead of a reversing JV, and re-point the PV
-- source row so the voucher page shows the same account.

UPDATE journal_lines jl
SET account_code = '6000'
FROM journal_entries je
WHERE je.id = jl.entry_id
  AND je.entry_no = 'JE-202607-0301'
  AND jl.account_code = '5027'
  AND jl.debit = 2800.00;

UPDATE payment_voucher_sources s
SET account_code = '6000'
FROM payment_vouchers pv
WHERE pv.id = s.voucher_id
  AND pv.voucher_no = 'HV-PV-202607-0145'
  AND s.account_code = '5027'
  AND s.amount = 2800.00;
