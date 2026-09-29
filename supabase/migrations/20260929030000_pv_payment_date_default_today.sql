-- A payment voucher's payment_date is the date its money moves, and the
-- approval posts the GL on it. A voucher with no date therefore has nothing to
-- post on. Every form sets it, but two server paths inserted the row without
-- the column at all -- "copy this voucher" and the claim payout -- and
-- HV-PV-202609-0437 reached pending_approval that way on 2026-09-29.
--
-- Both paths now pass the office date (src/lib/office-clock.ts officeDate()).
-- This default is the floor under them, for any path added later: an INSERT
-- that omits the column lands on the OFFICE's date. Not CURRENT_DATE -- the
-- database runs in UTC, so between midnight and 08:00 in Kuala Lumpur
-- CURRENT_DATE is still yesterday here.
--
-- Deliberately NOT NOT NULL: 21 voided vouchers from July-September carry a
-- NULL date, and rewriting a voided record's date would be editing history to
-- satisfy a constraint that only matters for live vouchers.
ALTER TABLE payment_vouchers
  ALTER COLUMN payment_date SET DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

COMMENT ON COLUMN payment_vouchers.payment_date IS
  'The date the money moves; approval posts the GL on it. Defaults to the office date (Asia/Kuala_Lumpur) when an insert omits the column.';
