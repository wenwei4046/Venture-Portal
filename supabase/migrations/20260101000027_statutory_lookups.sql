-- ============================================================================
-- 20260101000027_statutory_lookups.sql
-- Statutory lookup functions: EPF, SOCSO, EIS, PCB
-- Phase 3 Step 2 — HOUZS Venture Portal
--
-- Each function returns (employer, employee) contribution amounts.
-- Above-ceiling logic built in: EPF >RM20K → 12%/11%,
-- SOCSO >RM6K → ceiling, EIS >RM5K → ceiling.
-- All lookups respect effective_from/effective_to for historical replay.
-- ============================================================================

-- ─── lookup_epf ────────────────────────────────────────────────────
-- Returns EPF employer + employee contribution for a given wage.
-- Above RM20,000: uses exact 12% ER / 11% EE (not from table).
CREATE OR REPLACE FUNCTION lookup_epf(
    p_wages DECIMAL,
    p_part epf_part DEFAULT 'A',
    p_period DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (employer DECIMAL, employee DECIMAL)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    -- Above RM20,000: exact percentage
    IF p_wages > 20000 THEN
        RETURN QUERY SELECT
            ROUND(p_wages * 0.12, 2)::DECIMAL,
            ROUND(p_wages * 0.11, 2)::DECIMAL;
        RETURN;
    END IF;

    -- Below RM10.01: NIL
    IF p_wages <= 10 THEN
        RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;

    -- Table lookup
    RETURN QUERY
    SELECT e.employer, e.employee
    FROM epf_third_schedule e
    WHERE e.wage_from <= p_wages
      AND e.wage_to >= p_wages
      AND e.part = p_part
      AND e.effective_from <= p_period
      AND (e.effective_to IS NULL OR e.effective_to >= p_period)
    LIMIT 1;

    -- Fallback if no row found (should not happen with proper seed data)
    IF NOT FOUND THEN
        RETURN QUERY SELECT
            ROUND(p_wages * 0.12, 2)::DECIMAL,
            ROUND(p_wages * 0.11, 2)::DECIMAL;
    END IF;
END;
$$;

COMMENT ON FUNCTION lookup_epf IS
    'EPF Third Schedule lookup. Above RM20K uses 12%/11%. Respects effective_from/to for historical replay.';

-- ─── lookup_socso ──────────────────────────────────────────────────
-- Returns SOCSO employer + employee contribution.
-- Above RM6,000 ceiling: returns max values (RM104.15 / RM29.75).
CREATE OR REPLACE FUNCTION lookup_socso(
    p_wages DECIMAL,
    p_category socso_category DEFAULT 'first',
    p_period DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (employer DECIMAL, employee DECIMAL)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
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
$$;

COMMENT ON FUNCTION lookup_socso IS
    'SOCSO Act 4 lookup. Ceiling RM6,000 (ER 104.15, EE 29.75).';

-- ─── lookup_eis ────────────────────────────────────────────────────
-- Returns EIS employer + employee contribution.
-- Above RM5,000 ceiling: returns max values (RM9.90 / RM9.90).
CREATE OR REPLACE FUNCTION lookup_eis(
    p_wages DECIMAL,
    p_period DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (employer DECIMAL, employee DECIMAL)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    -- Above ceiling: max contribution
    IF p_wages > 5000 THEN
        RETURN QUERY SELECT 9.90::DECIMAL, 9.90::DECIMAL;
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
        RETURN QUERY SELECT 9.90::DECIMAL, 9.90::DECIMAL;
    END IF;
END;
$$;

COMMENT ON FUNCTION lookup_eis IS
    'EIS Act 800 lookup. Ceiling RM5,000 (ER 9.90, EE 9.90).';

-- ─── lookup_pcb ────────────────────────────────────────────────────
-- Returns PCB (monthly tax deduction) amount.
-- p_income = taxable income (payroll_gross - EPF EE)
CREATE OR REPLACE FUNCTION lookup_pcb(
    p_income DECIMAL,
    p_category pcb_category DEFAULT 'KA1',
    p_children INTEGER DEFAULT 0,
    p_period DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_pcb DECIMAL;
BEGIN
    SELECT p.pcb_amount INTO v_pcb
    FROM pcb_jadual p
    WHERE p.income_from <= p_income
      AND p.income_to >= p_income
      AND p.category = p_category
      AND p.children = p_children
      AND p.effective_from <= p_period
      AND (p.effective_to IS NULL OR p.effective_to >= p_period)
    LIMIT 1;

    RETURN COALESCE(v_pcb, 0);
END;
$$;

COMMENT ON FUNCTION lookup_pcb IS
    'PCB Jadual lookup. Input is taxable income (gross - EPF EE). Returns 0 if no match (HR enters manually).';

-- ─── Grant access to authenticated users ───────────────────────────
GRANT EXECUTE ON FUNCTION lookup_epf TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_socso TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_eis TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_pcb TO authenticated;
