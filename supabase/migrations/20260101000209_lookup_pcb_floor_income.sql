-- ============================================================================
-- Migration 209: lookup_pcb — floor income to whole ringgit before lookup
-- ============================================================================
-- Bug: pcb_jadual bands are whole-ringgit (e.g. 17246.00..17250.00,
-- 17251.00..17255.00). Taxable income with sen between X.01–X.99 at a band
-- boundary (e.g. 17250.90) falls in the gap and matches no row → returns 0.
--
-- Fix: FLOOR the input to whole ringgit before matching, consistent with
-- LHDN Jadual PCB where sen are ignored for band lookup.
-- ============================================================================

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
    v_income_floor DECIMAL;
BEGIN
    v_income_floor := FLOOR(p_income);

    SELECT p.pcb_amount INTO v_pcb
    FROM pcb_jadual p
    WHERE p.income_from <= v_income_floor
      AND p.income_to >= v_income_floor
      AND p.category = p_category
      AND p.children = p_children
      AND p.effective_from <= p_period
      AND (p.effective_to IS NULL OR p.effective_to >= p_period)
    LIMIT 1;

    RETURN COALESCE(v_pcb, 0);
END;
$$;

COMMENT ON FUNCTION lookup_pcb IS
    'PCB Jadual lookup. Input is taxable income (gross - EPF EE); sen are ignored (FLOOR to whole ringgit) per LHDN band rules. Returns 0 if no match.';

GRANT EXECUTE ON FUNCTION lookup_pcb TO authenticated;
