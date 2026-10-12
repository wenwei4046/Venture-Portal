-- A repayment start is a date (2026-10-12, user: 现在只能选月份不能选日期 →
-- expected repayment 和 repayment start date 应该要一样 → 可以，照这个做).
-- The date is the first instalment's due date, and its day every instalment's
-- day (lib/repayment-start); its month stays in repayment_start_month for the
-- readers that go by month.
--   fund_sources: the date is repayment_date — the page's Expected repayment.
--     With no fixed term the maturity was seeded from it (createFundSource),
--     so a maturity still equal to the old date moves with it.
--   loans: a new repayment_start_date.
-- Both RPCs keep their signature: p_month now carries the whole date.

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS repayment_start_date date;

COMMENT ON COLUMN public.loans.repayment_start_date IS
  'The date the first instalment falls due; every instalment falls on its day. NULL = the month after disbursement, on its day. Its month is repayment_start_month.';

CREATE OR REPLACE FUNCTION public.set_fund_source_repayment_start(p_fund_source_id uuid, p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/fund-in'], ARRAY['treasury.edit']);
    v_role := current_user_role();
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_repayment_start: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    -- p_month is the start date: the Expected repayment, its month the start
    -- month. The right-hand sides read the row as it was.
    UPDATE fund_sources
       SET repayment_date        = p_month,
           repayment_start_month = date_trunc('month', p_month)::date,
           maturity_date         = CASE
                                     WHEN lock_in_months IS NULL AND repayment_date IS NOT NULL AND maturity_date = repayment_date THEN p_month
                                     ELSE maturity_date
                                   END
     WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_repayment_start: fund source % not found', p_fund_source_id;
    END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.set_loan_repayment_start(p_loan_id uuid, p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.edit']);
    v_role := current_user_role();
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_repayment_start: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    -- p_month is the start date: kept whole, its month the start month.
    UPDATE loans
       SET repayment_start_date  = p_month,
           repayment_start_month = date_trunc('month', p_month)::date
     WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_repayment_start: loan % not found', p_loan_id;
    END IF;
END $function$;
