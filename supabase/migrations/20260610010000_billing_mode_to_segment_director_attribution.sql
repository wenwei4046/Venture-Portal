-- director_attribution = Director's 25% salary-attribution invoices. Their
-- settlement cash goes to the DIRECTOR pool (dept_pool_director — confirmed by
-- INVOICE_BILLING_MODE_TO_POOL and pool_key_to_segment), but this function
-- tagged their GL entries 'director_office', forking the two ledgers: by
-- 2026-06-10 Director Office GL showed 67,249.04 vs pool 1,317.42 while
-- Director GL showed 37,218.37 vs pool 103,149.99 (drift = 65,931.62 across
-- 4 settlement JEs). Align segment with the pool: director_attribution → director.
-- (Applied via MCP apply_migration on 2026-06-10; file kept for repo parity.)

CREATE OR REPLACE FUNCTION public.billing_mode_to_segment(p_mode text)
RETURNS gl_segment
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
    RETURN CASE p_mode
        WHEN 'marketing_project'           THEN 'marketing'::gl_segment
        WHEN 'hr_attribution'              THEN 'hr'::gl_segment
        WHEN 'finance_attribution'         THEN 'finance'::gl_segment
        WHEN 'director_office_attribution' THEN 'director_office'::gl_segment
        WHEN 'director_attribution'        THEN 'director'::gl_segment
        ELSE 'corporate'::gl_segment
    END;
END;
$function$;
