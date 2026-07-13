-- ─────────────────────────────────────────────────────────────────────────────
-- EIS (Act 800): raise wage ceiling RM5,000 → RM6,000 (user report 2026-07-13).
--
-- PERKESO raised the SOCSO/EIS insurable wage ceiling to RM6,000 effective
-- 1 Oct 2024. The SOCSO table + lookup_socso were updated then, but the EIS
-- side was missed: eis_act800_schedule stopped at 5,000 and lookup_eis
-- hardcoded the old 9.90 cap. Symptom: any wage > RM5,000 contributed
-- EIS ER/EE 9.90 instead of the correct bracket (up to 11.90).
--
-- 1. Add the ten missing brackets 5,000.01 → 6,000.00 (0.2% each side of the
--    bracket midpoint), effective_from 2024-10-01.
-- 2. lookup_eis: ceiling > 6,000 and fallback both return 11.90.
--
-- Historical rows are NOT recomputed — paid/confirmed payroll and payouts
-- keep the numbers they were paid with. New saves/recalcs pick up the fix.
-- ─────────────────────────────────────────────────────────────────────────────

-- Defensive: drop any prior attempt at these brackets, then insert.
DELETE FROM eis_act800_schedule WHERE wage_from > 5000;

INSERT INTO eis_act800_schedule (wage_from, wage_to, employer, employee, effective_from) VALUES
    (5000.01, 5100.00, 10.10, 10.10, DATE '2024-10-01'),
    (5100.01, 5200.00, 10.30, 10.30, DATE '2024-10-01'),
    (5200.01, 5300.00, 10.50, 10.50, DATE '2024-10-01'),
    (5300.01, 5400.00, 10.70, 10.70, DATE '2024-10-01'),
    (5400.01, 5500.00, 10.90, 10.90, DATE '2024-10-01'),
    (5500.01, 5600.00, 11.10, 11.10, DATE '2024-10-01'),
    (5600.01, 5700.00, 11.30, 11.30, DATE '2024-10-01'),
    (5700.01, 5800.00, 11.50, 11.50, DATE '2024-10-01'),
    (5800.01, 5900.00, 11.70, 11.70, DATE '2024-10-01'),
    (5900.01, 6000.00, 11.90, 11.90, DATE '2024-10-01');

CREATE OR REPLACE FUNCTION public.lookup_eis(p_wages numeric, p_period date DEFAULT CURRENT_DATE)
 RETURNS TABLE(employer numeric, employee numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
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

COMMENT ON FUNCTION lookup_eis IS
    'EIS Act 800 lookup. Ceiling RM6,000 / max 11.90 each side since 1 Oct 2024 (fixed 2026-07-13; was stuck on the old RM5,000 / 9.90).';
