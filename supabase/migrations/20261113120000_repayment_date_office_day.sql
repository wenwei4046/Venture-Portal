-- A repayment may be dated today by the office's clock (2026-11-13, the user on a contra refused at 02:28 MYT — "The
-- contra was not posted: new row for relation "repayments" violates check constraint "payment_date_not_future"" —
-- "改成马来西亚日期"). The two checks read CURRENT_DATE, the database's UTC day, so from 00:00 to 08:00 in Kuala Lumpur
-- a payment (or a contra) dated that day was "in the future". They now read the day in Asia/Kuala_Lumpur. Every row
-- already in passes (the office's day is never before UTC's).

ALTER TABLE public.repayments DROP CONSTRAINT IF EXISTS payment_date_not_future;
ALTER TABLE public.repayments ADD CONSTRAINT payment_date_not_future
  CHECK (payment_date <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);

ALTER TABLE public.fund_source_repayments DROP CONSTRAINT IF EXISTS fsr_payment_date_not_future;
ALTER TABLE public.fund_source_repayments ADD CONSTRAINT fsr_payment_date_not_future
  CHECK (payment_date <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
