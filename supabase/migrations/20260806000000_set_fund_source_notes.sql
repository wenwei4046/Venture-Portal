-- Finance self-service notes on a fund source (user 2026-08-06: "这笔是借给谁
-- 我自己加" → 「借给: X」 remark lives in fund_sources.notes and surfaces as
-- the Company Statement's repay-side badge). Terms amendment stays
-- principal-only — this RPC touches NOTES only, mirroring
-- set_fund_source_repayment_start's guard style.

CREATE OR REPLACE FUNCTION public.set_fund_source_notes(p_fund_source_id uuid, p_notes text)
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
        RAISE EXCEPTION 'set_fund_source_notes: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    UPDATE fund_sources
       SET notes = NULLIF(trim(p_notes), '')
     WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_notes: fund source % not found', p_fund_source_id;
    END IF;
END $function$;
