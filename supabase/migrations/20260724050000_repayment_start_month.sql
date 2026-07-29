-- 还款起始月 (2026-07-24, user redefinition of the loan report):
-- "我定好几时开始还,然后当月应收和应付的,收了或付了就不会出现".
--
-- Schedules are often renegotiated (e.g. CONTS 60k disbursed 2025-09 but the
-- agreed plan starts 2026-05 — the repayment notes literally say
-- "本金 1/6 (本月起还)"). The system had no field for that start, so any
-- calendar-based due math was wrong. New nullable column on both sides:
-- NULL = default convention (first installment the month after
-- disbursement / effective date). The month stored is the FIRST installment
-- month (day component ignored, always 1st).
--
-- Finance self-service setters follow the set_loan_funding_source pattern:
-- SECURITY DEFINER + role check, so Finance can maintain them without
-- Principal (display/schedule metadata, no money moves).

ALTER TABLE loans ADD COLUMN IF NOT EXISTS repayment_start_month date;
ALTER TABLE fund_sources ADD COLUMN IF NOT EXISTS repayment_start_month date;

CREATE OR REPLACE FUNCTION set_loan_repayment_start(p_loan_id uuid, p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'set_loan_repayment_start: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    UPDATE loans
       SET repayment_start_month = date_trunc('month', p_month)::date
     WHERE id = p_loan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_repayment_start: loan % not found', p_loan_id;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION set_fund_source_repayment_start(p_fund_source_id uuid, p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'set_fund_source_repayment_start: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    UPDATE fund_sources
       SET repayment_start_month = date_trunc('month', p_month)::date
     WHERE id = p_fund_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_fund_source_repayment_start: fund source % not found', p_fund_source_id;
    END IF;
END $$;

REVOKE EXECUTE ON FUNCTION set_loan_repayment_start(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_loan_repayment_start(uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION set_fund_source_repayment_start(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_fund_source_repayment_start(uuid, date) TO authenticated;
