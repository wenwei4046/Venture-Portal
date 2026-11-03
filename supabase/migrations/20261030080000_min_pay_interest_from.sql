-- Minimum pay interest from a month (2026-10-30 — the user: "minimn pay
-- interest 可以set 几时开始吗？"; on its sample they picked A, the two choices
-- Amend terms has: From the first instalment / From a later month).
--
-- A fund source's or a loan's minimum-pay flag was undated: on, every month
-- from the deal's first instalment was checked for its interest; off, none.
-- `min_pay_interest_from` is the month the check starts — NULL is the first
-- instalment, so every deal on today (HC's 220,000 fund in) stays as it is.
-- The Repayment Schedule checks from the later of the two.

ALTER TABLE public.fund_sources ADD COLUMN IF NOT EXISTS min_pay_interest_from date;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS min_pay_interest_from date;

-- A month's first day, and only while the flag is on.
ALTER TABLE public.fund_sources DROP CONSTRAINT IF EXISTS fund_sources_min_pay_interest_from_check;
ALTER TABLE public.fund_sources ADD CONSTRAINT fund_sources_min_pay_interest_from_check
  CHECK (min_pay_interest_from IS NULL OR (min_pay_interest AND min_pay_interest_from = date_trunc('month', min_pay_interest_from)::date));
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_min_pay_interest_from_check;
ALTER TABLE public.loans ADD CONSTRAINT loans_min_pay_interest_from_check
  CHECK (min_pay_interest_from IS NULL OR (min_pay_interest AND min_pay_interest_from = date_trunc('month', min_pay_interest_from)::date));

COMMENT ON COLUMN public.fund_sources.min_pay_interest_from IS
  'The month minimum pay interest is checked from (first day). NULL: from the first instalment.';
COMMENT ON COLUMN public.loans.min_pay_interest_from IS
  'The month minimum pay interest is checked from (first day). NULL: from the first instalment.';

-- The switch, with its month: on from p_from (NULL = the first instalment); off clears both.
DROP FUNCTION IF EXISTS public.set_fund_source_min_pay_interest(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_fund_source_min_pay_interest(p_fund_source_id uuid, p_value boolean, p_from date DEFAULT NULL)
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
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_min_pay_interest: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    UPDATE fund_sources
       SET min_pay_interest = p_value,
           min_pay_interest_from = CASE WHEN p_value AND p_from IS NOT NULL THEN date_trunc('month', p_from)::date END
     WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_min_pay_interest: fund source % not found', p_fund_source_id;
    END IF;
END $function$;

REVOKE ALL ON FUNCTION public.set_fund_source_min_pay_interest(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fund_source_min_pay_interest(uuid, boolean, date) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.set_loan_min_pay_interest(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_loan_min_pay_interest(p_loan_id uuid, p_value boolean, p_from date DEFAULT NULL)
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
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_min_pay_interest: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    UPDATE loans
       SET min_pay_interest = p_value,
           min_pay_interest_from = CASE WHEN p_value AND p_from IS NOT NULL THEN date_trunc('month', p_from)::date END
     WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_min_pay_interest: loan % not found', p_loan_id;
    END IF;
END $function$;

REVOKE ALL ON FUNCTION public.set_loan_min_pay_interest(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_loan_min_pay_interest(uuid, boolean, date) TO authenticated, service_role;

-- Each still asks its page, as mig 20261011220100 made it: checked here, and said for the tab-guard scan.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.set_fund_source_min_pay_interest(uuid, boolean, date)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_loan_min_pay_interest(uuid, boolean, date)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.edit']);
