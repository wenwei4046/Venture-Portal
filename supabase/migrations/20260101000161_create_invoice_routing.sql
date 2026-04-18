-- ============================================================================
-- 20260101000161_create_invoice_routing.sql
-- Stage 4 routing: wire hr_attribution + finance_attribution into the
-- derive_invoice_routes_to_pool trigger. Must be separate from the enum
-- ADD VALUE in migration 160 (Postgres won't let you reference a fresh
-- enum value inside the same transaction that adds it).
-- HOUZS Venture Portal
-- ============================================================================

CREATE OR REPLACE FUNCTION derive_invoice_routes_to_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.routes_to_pool := CASE NEW.billing_mode
        WHEN 'hr_attribution'              THEN 'hr_opex'::operating_pool_type
        WHEN 'finance_attribution'         THEN 'finance_opex'::operating_pool_type
        WHEN 'director_office_attribution' THEN 'director_opex'::operating_pool_type
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION derive_invoice_routes_to_pool IS
    'Stage 4: now routes hr_attribution → hr_opex, finance_attribution → finance_opex, director_office_attribution → director_opex. director_attribution + marketing_project leave routes_to_pool NULL — they credit dept_pools via a separate branch in credit_operating_pool_on_invoice_paid.';
