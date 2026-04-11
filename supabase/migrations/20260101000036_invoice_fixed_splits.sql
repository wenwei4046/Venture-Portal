-- ============================================================================
-- 20260101000036_invoice_fixed_splits.sql
-- Fixed Split invoice generation RPC (Rent + Utility)
-- HOUZS Venture Portal (VP)
--
-- Separate function from generate_monthly_invoices because fixed splits
-- need monthly totals (rent_total, utility_total) as explicit input —
-- these are not captured in the HR cost submission snapshot.
--
-- Flow: Finance enters rent/utility totals in the FixedSplitPanel on
-- /billing, clicks "Generate Fixed Split Invoices". The Server Action
-- calls this RPC with the period + totals.
--
-- Split percentages come from rent_splits / utility_splits tables
-- (configured by Principal in Settings).
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_fixed_split_invoices(
    p_period_month DATE,
    p_rent_total DECIMAL DEFAULT 0,
    p_utility_total DECIMAL DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_caller_id UUID;
    v_generated INTEGER := 0;
    v_rent_count INTEGER := 0;
    v_utility_count INTEGER := 0;
    v_non_billable_rent DECIMAL := 0;
    v_non_billable_utility DECIMAL := 0;
BEGIN
    -- Auth guard
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'generate_fixed_split_invoices: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();
    v_period := date_trunc('month', p_period_month)::date;

    -- Delete existing DRAFT fixed_split invoices for the period
    DELETE FROM invoices
    WHERE period_month = v_period
      AND billing_mode = 'fixed_split'
      AND status = 'draft';

    -- ────────────────────────────────────────────────────────────────────
    -- 1. Rent invoices (billable: company rows only, not HV share)
    -- ────────────────────────────────────────────────────────────────────
    IF p_rent_total > 0 THEN
        WITH rent_rows AS (
            SELECT
                rs.company_id,
                ROUND(p_rent_total * rs.split_pct, 2) AS amount
            FROM rent_splits rs
            WHERE rs.is_hv_share = FALSE
              AND rs.company_id IS NOT NULL
              AND rs.split_pct > 0
        )
        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT
            format_invoice_no(v_period),
            r.company_id,
            v_period,
            'fixed_split',
            r.amount,
            r.amount,
            'draft',
            v_caller_id
        FROM rent_rows r
        WHERE r.amount > 0;

        GET DIAGNOSTICS v_rent_count = ROW_COUNT;
        v_generated := v_generated + v_rent_count;

        -- Track HV's non-billable share
        SELECT COALESCE(ROUND(p_rent_total * rs.split_pct, 2), 0)
        INTO v_non_billable_rent
        FROM rent_splits rs
        WHERE rs.is_hv_share = TRUE;
    END IF;

    -- ────────────────────────────────────────────────────────────────────
    -- 2. Utility invoices (billable: company rows only)
    -- ────────────────────────────────────────────────────────────────────
    IF p_utility_total > 0 THEN
        WITH utility_rows AS (
            SELECT
                us.company_id,
                ROUND(p_utility_total * us.split_pct, 2) AS amount
            FROM utility_splits us
            WHERE us.is_hv_share = FALSE
              AND us.company_id IS NOT NULL
              AND us.split_pct > 0
        )
        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT
            format_invoice_no(v_period),
            r.company_id,
            v_period,
            'fixed_split',
            r.amount,
            r.amount,
            'draft',
            v_caller_id
        FROM utility_rows r
        WHERE r.amount > 0;

        GET DIAGNOSTICS v_utility_count = ROW_COUNT;
        v_generated := v_generated + v_utility_count;

        -- Track HV's non-billable share
        SELECT COALESCE(ROUND(p_utility_total * us.split_pct, 2), 0)
        INTO v_non_billable_utility
        FROM utility_splits us
        WHERE us.is_hv_share = TRUE;
    END IF;

    RETURN jsonb_build_object(
        'generated', v_generated,
        'rent_invoices', v_rent_count,
        'utility_invoices', v_utility_count,
        'hv_rent_share', v_non_billable_rent,
        'hv_utility_share', v_non_billable_utility,
        'period', v_period
    );
END;
$$;

COMMENT ON FUNCTION generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL) IS
    'Generates rent + utility invoices using split percentages from rent_splits / utility_splits. HV share is tracked but not invoiced (non-billable). Called separately from generate_monthly_invoices because it needs explicit monthly totals.';

GRANT EXECUTE ON FUNCTION generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL) TO authenticated;
