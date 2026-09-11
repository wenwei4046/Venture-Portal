-- ============================================================================
-- 20260914050000_statutory_lookup_zero_wages.sql
-- lookup_socso / lookup_eis: a wage of 0 contributes 0, not the ceiling
-- HOUZS Venture Portal · 2026-09-11
--
-- Both lookups match wages against a schedule bracket and, when no bracket
-- matches, fall back to the ceiling contribution (migration 27; the EIS
-- ceiling moved to RM6,000 in 20260713082728). The schedules start at
-- RM0.01, so a wage of exactly 0 matches nothing and got the ceiling:
-- employer SOCSO 104.15 + EIS 11.90 on nobody's pay. The staff-master
-- trigger (compute_hr_staff_statutory) passes basic_salary straight through,
-- so every zero-basic record — the fully-commission Revenue salespeople, and
-- now variable-pay directors (20260914040000) — carried RM116.05 of phantom
-- employer statutory in total_ctc, which get_hr_cost_summary summed into the
-- HR Costing live preview. The monthly payroll trigger was never affected:
-- compute_hr_monthly_payroll guards a statutory base <= 0 itself.
--
-- Fix at the source: no wages, no contribution. NULL is treated the same way
-- (every caller COALESCEs to 0 anyway). Everything above 0 is untouched — the
-- bracket lookup and the ceiling fallback behave exactly as before. Then the
-- staff-master trigger is re-fired on the zero-basic rows (a no-op write of
-- basic_salary fires trg_hr_staff_compute_statutory; the salary-history
-- trigger only logs a value that actually changed, so nothing is logged),
-- and a guard proves the result. Historical director_ctc rows are left as
-- they were: they have been submitted and billed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_socso(p_wages numeric, p_category socso_category DEFAULT 'first'::socso_category, p_period date DEFAULT CURRENT_DATE)
 RETURNS TABLE(employer numeric, employee numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    -- No wages, no contribution (2026-09-11). Below the first bracket
    -- (RM0.01) nothing matches, and the ceiling fallback further down is
    -- for a gap in the schedule, not for an empty pay.
    IF p_wages IS NULL OR p_wages <= 0 THEN
        RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;

    -- Above ceiling: max contribution
    IF p_wages > 6000 THEN
        RETURN QUERY SELECT 104.15::DECIMAL, 29.75::DECIMAL;
        RETURN;
    END IF;

    -- Table lookup
    RETURN QUERY
    SELECT s.employer, s.employee
    FROM socso_act4_schedule s
    WHERE s.wage_from <= p_wages
      AND s.wage_to >= p_wages
      AND s.category = p_category
      AND s.effective_from <= p_period
      AND (s.effective_to IS NULL OR s.effective_to >= p_period)
    LIMIT 1;

    -- Fallback: ceiling values
    IF NOT FOUND THEN
        RETURN QUERY SELECT 104.15::DECIMAL, 29.75::DECIMAL;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_eis(p_wages numeric, p_period date DEFAULT CURRENT_DATE)
 RETURNS TABLE(employer numeric, employee numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    -- No wages, no contribution (2026-09-11) — see lookup_socso.
    IF p_wages IS NULL OR p_wages <= 0 THEN
        RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;

    -- Above ceiling (RM6,000 since 1 Oct 2024): max contribution
    IF p_wages > 6000 THEN
        RETURN QUERY SELECT 11.90::DECIMAL, 11.90::DECIMAL;
        RETURN;
    END IF;

    -- Table lookup
    RETURN QUERY
    SELECT e.employer, e.employee
    FROM eis_act800_schedule e
    WHERE e.wage_from <= p_wages
      AND e.wage_to >= p_wages
      AND e.effective_from <= p_period
      AND (e.effective_to IS NULL OR e.effective_to >= p_period)
    LIMIT 1;

    -- Fallback: ceiling values
    IF NOT FOUND THEN
        RETURN QUERY SELECT 11.90::DECIMAL, 11.90::DECIMAL;
    END IF;
END;
$function$;

-- Re-fire the staff-master trigger for every zero-basic record, active or
-- not: a no-op write of basic_salary is enough (UPDATE OF basic_salary), and
-- the salary-history trigger ignores a value that did not change.
UPDATE hr_staff_costs
   SET basic_salary = basic_salary
 WHERE basic_salary <= 0;

-- Guard: the fix holds, the first bracket is still where it was, and no
-- zero-basic record still carries a phantom.
DO $$
DECLARE
    v_socso_er numeric;
    v_eis_er   numeric;
    v_left     integer;
BEGIN
    SELECT employer INTO v_socso_er FROM lookup_socso(0, 'first');
    SELECT employer INTO v_eis_er   FROM lookup_eis(0);
    IF v_socso_er <> 0 OR v_eis_er <> 0 THEN
        RAISE EXCEPTION 'statutory_lookup_zero_wages: lookup at 0 still returns SOCSO % / EIS %', v_socso_er, v_eis_er;
    END IF;

    SELECT employer INTO v_socso_er FROM lookup_socso(30, 'first');
    IF v_socso_er <> 0.40 THEN
        RAISE EXCEPTION 'statutory_lookup_zero_wages: first bracket moved — RM30 returns %', v_socso_er;
    END IF;

    SELECT count(*) INTO v_left
      FROM hr_staff_costs
     WHERE basic_salary <= 0
       AND (COALESCE(socso_er, 0) <> 0 OR COALESCE(eis_er, 0) <> 0 OR COALESCE(epf_er, 0) <> 0);
    IF v_left > 0 THEN
        RAISE EXCEPTION 'statutory_lookup_zero_wages: % zero-basic staff record(s) still carry employer statutory', v_left;
    END IF;
END $$;
