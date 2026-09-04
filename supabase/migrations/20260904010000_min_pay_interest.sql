-- 最低还息单 (user 2026-09-04): per-record flag on loans + fund_sources meaning
-- "principal may wait, but each month's interest must be paid". Display/tracking
-- only — no GL/JE impact, no change to interest maths (flat = original × rate,
-- compound = balance × rate, same as /repayment-schedule).

ALTER TABLE loans ADD COLUMN min_pay_interest boolean NOT NULL DEFAULT false;
ALTER TABLE fund_sources ADD COLUMN min_pay_interest boolean NOT NULL DEFAULT false;

-- Finance self-service toggles, mirroring set_loan_repayment_start's pattern
-- (SECURITY DEFINER + explicit role gate; loans/fund_sources RLS blocks direct
-- UPDATE from the browser client).

CREATE OR REPLACE FUNCTION public.set_loan_min_pay_interest(p_loan_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'set_loan_min_pay_interest: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    UPDATE loans SET min_pay_interest = p_value WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_min_pay_interest: loan % not found', p_loan_id;
    END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.set_fund_source_min_pay_interest(p_fund_source_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'set_fund_source_min_pay_interest: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    UPDATE fund_sources SET min_pay_interest = p_value WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_min_pay_interest: fund source % not found', p_fund_source_id;
    END IF;
END $function$;
