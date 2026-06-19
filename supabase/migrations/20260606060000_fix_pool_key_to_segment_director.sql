-- Fix: pool_key_to_segment mapped dept_pool_director → 'director_office' (a
-- naming quirk), so a Director-pool expense posted via the per-segment GL path
-- would land in the director_office segment while the Director dept pool ledger
-- was debited — a mismatch. Director dept ↔ 'director' segment (matches
-- deptNameToPoolKey + the dept-pool per-bank table). Map it correctly.
-- (Applied via MCP apply_migration 2026-06-06; file kept for repo parity.)
CREATE OR REPLACE FUNCTION public.pool_key_to_segment(p_pool text)
 RETURNS gl_segment
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN CASE p_pool
        WHEN 'dept_pool_marketing'       THEN 'marketing'::gl_segment
        WHEN 'dept_pool_hr'              THEN 'hr'::gl_segment
        WHEN 'dept_pool_finance'         THEN 'finance'::gl_segment
        WHEN 'dept_pool_director_office' THEN 'director_office'::gl_segment
        WHEN 'dept_pool_director'        THEN 'director'::gl_segment
        ELSE 'corporate'::gl_segment
    END;
END;
$function$;
