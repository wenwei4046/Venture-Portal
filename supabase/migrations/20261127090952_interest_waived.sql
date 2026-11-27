-- A repaid deal's unpaid interest, waived or still owed (2026-11-27 — the user: CONTS's 10,000 of 8 Jul 2026, its
-- principal repaid 13 Nov and its 1,600.04 interest never, read repaid and owed nothing — "要收"; then the repaid
-- deals that had settled their interest some other way: "这几笔其实收完了，schedule 也别显示还欠" · "完全不显示").
--
--   · A deal's status still turns repaid once its principal is in (the triggers are unchanged); interest_waived says
--     what is left of its interest: true — waived, settled some other way: its schedule shows none of it, nothing owed;
--     false — still owed: its schedule, the Repayment Schedule and By company show it until it comes in or is waived.
--   · Every deal repaid as this lands is waived (the user's answer for each one checked, and the page's rule since
--     2026-11-13); a deal repaid from now on owes what its plan says until Finance waives the rest.
--   · Display only: no journal, no interest-in-suspense entry is touched.

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS interest_waived boolean NOT NULL DEFAULT false;
ALTER TABLE public.fund_sources ADD COLUMN IF NOT EXISTS interest_waived boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.loans.interest_waived IS 'Repaid with interest unpaid: true = the rest waived (not shown as owed); false = still owed (2026-11-27).';
COMMENT ON COLUMN public.fund_sources.interest_waived IS 'Repaid with interest unpaid: true = the rest waived (not shown as owed); false = still owed (2026-11-27).';

UPDATE public.loans SET interest_waived = true WHERE status = 'fully_repaid';
UPDATE public.fund_sources SET interest_waived = true WHERE status = 'repaid';

CREATE OR REPLACE FUNCTION public.set_loan_interest_waived(p_loan_id uuid, p_value boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.edit']);
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_interest_waived: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    UPDATE loans SET interest_waived = p_value, updated_at = now() WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_interest_waived: loan % not found', p_loan_id;
    END IF;
END $function$;

REVOKE ALL ON FUNCTION public.set_loan_interest_waived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_loan_interest_waived(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_fund_source_interest_waived(p_fund_source_id uuid, p_value boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/fund-in'], ARRAY['treasury.edit']);
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_interest_waived: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    UPDATE fund_sources SET interest_waived = p_value WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_interest_waived: fund source % not found', p_fund_source_id;
    END IF;
END $function$;

REVOKE ALL ON FUNCTION public.set_fund_source_interest_waived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fund_source_interest_waived(uuid, boolean) TO authenticated, service_role;

-- Each asks its page, as mig 20261011220100 made the min-pay ones: checked here, and said for the tab-guard scan.
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

SELECT pg_temp.tab_guard('public.set_fund_source_interest_waived(uuid, boolean)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_loan_interest_waived(uuid, boolean)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.edit']);
