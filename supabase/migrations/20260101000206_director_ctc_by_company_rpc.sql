-- ============================================================================
-- 20260101000206_director_ctc_by_company_rpc.sql
-- Feature #3 — auto-fill "Create Invoice" (mode=director_attribution) with
-- per-subsidiary amounts that HR already entered as director CTC.
--
-- director_ctc RLS (mig 11) only lets principal + hr SELECT. Finance needs
-- the per-company aggregate to bill the subs. We expose a SECURITY DEFINER
-- RPC that returns ONLY per-company aggregates (company_id + total_ctc).
-- No per-director breakdown leaks — matches CLAUDE.md rule "Finance cannot
-- see individual director salary breakdown — only total payout".
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_director_ctc_by_company(p_period_month DATE)
RETURNS TABLE (
    company_id UUID,
    company_name TEXT,
    company_short_code TEXT,
    total_ctc DECIMAL
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.short_code,
        COALESCE(SUM(dc.total_ctc), 0)::DECIMAL AS total_ctc
    FROM companies c
    JOIN director_ctc dc ON dc.company_id = c.id
    WHERE dc.period_month = p_period_month
    GROUP BY c.id, c.name, c.short_code
    HAVING COALESCE(SUM(dc.total_ctc), 0) > 0
    ORDER BY c.short_code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_director_ctc_by_company(DATE) TO authenticated;

COMMENT ON FUNCTION get_director_ctc_by_company IS
    'Mig 206: per-company director CTC aggregate for a given period. Finance-safe (SECURITY DEFINER, aggregate-only, no per-director leak). Used by Create Invoice modal when billing_mode=director_attribution to auto-fill subsidiary allocations.';

COMMIT;
