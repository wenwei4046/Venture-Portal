-- ============================================================================
-- 20260101000208_director_ctc_rpc_type_cast.sql
-- Fix get_director_ctc_by_company (mig 206) — companies.short_code is
-- character varying(10) in the schema, but the RPC signature declared TEXT.
-- PG raised "structure of query does not match function result type" at
-- runtime. Explicit ::TEXT cast on short_code + name keeps the RPC signature
-- stable without changing the schema.
--
-- Surfaced via E2E test 2026-04-22 (seeded director_ctc for 2026-04-01,
-- invoked RPC → 42804 error).
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
        c.name::TEXT,
        c.short_code::TEXT,
        COALESCE(SUM(dc.total_ctc), 0)::DECIMAL AS total_ctc
    FROM companies c
    JOIN director_ctc dc ON dc.company_id = c.id
    WHERE dc.period_month = p_period_month
    GROUP BY c.id, c.name, c.short_code
    HAVING COALESCE(SUM(dc.total_ctc), 0) > 0
    ORDER BY c.short_code;
END;
$$;

COMMIT;
