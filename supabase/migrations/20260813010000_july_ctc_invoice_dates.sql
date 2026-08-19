-- Data fix (2026-08-13): the four July director-CTC invoices
-- (HV-INV-202607-0038..0041, period 2026-07) were created on 4 Aug with the
-- Create Invoice modal's invoice-date DEFAULT (= today), so bulk issue —
-- which correctly posts on the invoice date — put July's income into
-- August's P&L. User: "我开的invoice 应该是31/07".
--
-- Move the invoice dates and their issue JEs (JE-202608-0378..0381) back to
-- 31 Jul. Settlement receipts stay on their real August dates (cash really
-- moved then). Entry numbers keep their JE-202608 prefix — cosmetic only;
-- every report buckets by transaction_date. The companion code fix defaults
-- the modal's invoice date to the PERIOD's month-end.

UPDATE invoices
SET invoice_date = '2026-07-31'
WHERE invoice_no IN (
  'HV-INV-202607-0038', 'HV-INV-202607-0039', 'HV-INV-202607-0040', 'HV-INV-202607-0041'
);

UPDATE journal_entries
SET transaction_date = '2026-07-31',
    period_month = '2026-07-01'
WHERE entry_no IN ('JE-202608-0378', 'JE-202608-0379', 'JE-202608-0380', 'JE-202608-0381')
  AND reference_type = 'invoice'
  AND is_reversed = false;
