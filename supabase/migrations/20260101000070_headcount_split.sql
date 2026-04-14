-- ============================================================================
-- 20260101000070_headcount_split.sql
-- Replace fixed-percentage rent/utility splits with headcount-based allocation.
-- Each month Finance enters a headcount per subsidiary + HV's own headcount;
-- the fixed_split generation RPC splits rent and utility in proportion.
-- HOUZS Venture Portal — Roadmap #2
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: monthly_headcounts
-- ----------------------------------------------------------------------------

CREATE TABLE monthly_headcounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    company_id   UUID REFERENCES companies(id),  -- NULL means HV itself
    headcount    INTEGER NOT NULL,
    updated_by   UUID NOT NULL REFERENCES users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT headcount_non_negative  CHECK (headcount >= 0)
);

COMMENT ON TABLE monthly_headcounts IS
    'Per-month staff headcount per subsidiary + HV (NULL company_id). Drives the fixed_split invoice allocation so rent/utility track real occupancy instead of frozen percentages.';

-- One row per sub per period; separate uniqueness for the HV row.
CREATE UNIQUE INDEX idx_mh_sub ON monthly_headcounts(period_month, company_id)
    WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX idx_mh_hv ON monthly_headcounts(period_month)
    WHERE company_id IS NULL;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE monthly_headcounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY mh_select ON monthly_headcounts
    FOR SELECT USING (current_user_role() IN ('finance', 'principal', 'hr'));

CREATE POLICY mh_insert ON monthly_headcounts
    FOR INSERT WITH CHECK (current_user_role() IN ('finance', 'principal'));

CREATE POLICY mh_update ON monthly_headcounts
    FOR UPDATE USING (current_user_role() IN ('finance', 'principal'));

CREATE POLICY mh_no_delete ON monthly_headcounts
    FOR DELETE USING (FALSE);

-- ----------------------------------------------------------------------------
-- RPC: generate_fixed_split_invoices (replaced — headcount-based)
-- ----------------------------------------------------------------------------
-- Drops the old signature so a stale client hitting PostgREST gets a clear
-- 404 instead of silently using the percentage path.

DROP FUNCTION IF EXISTS generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL);

CREATE OR REPLACE FUNCTION generate_fixed_split_invoices(
    p_period_month DATE,
    p_rent_total   DECIMAL DEFAULT 0,
    p_utility_total DECIMAL DEFAULT 0,
    p_headcounts   JSONB   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_caller UUID;
    v_total_headcount INTEGER := 0;
    v_hv_headcount INTEGER := 0;
    v_hv_rent_share DECIMAL := 0;
    v_hv_utility_share DECIMAL := 0;
    v_rent_count INTEGER := 0;
    v_utility_count INTEGER := 0;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'generate_fixed_split_invoices: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller := auth.uid();
    v_period := date_trunc('month', p_period_month)::date;

    -- 1. Persist incoming headcounts: wipe + re-insert for idempotency.
    IF p_headcounts IS NOT NULL THEN
        DELETE FROM monthly_headcounts WHERE period_month = v_period;

        INSERT INTO monthly_headcounts (period_month, company_id, headcount, updated_by)
        SELECT
            v_period,
            NULLIF(elem->>'company_id', '')::UUID,
            COALESCE((elem->>'headcount')::INTEGER, 0),
            v_caller
        FROM jsonb_array_elements(p_headcounts) elem;
    END IF;

    -- 2. Sum total headcount for the period (subs + HV)
    SELECT COALESCE(SUM(headcount), 0)
    INTO v_total_headcount
    FROM monthly_headcounts
    WHERE period_month = v_period;

    SELECT COALESCE(headcount, 0)
    INTO v_hv_headcount
    FROM monthly_headcounts
    WHERE period_month = v_period AND company_id IS NULL;

    IF v_total_headcount <= 0 THEN
        RAISE EXCEPTION 'No headcounts recorded for period %. Enter headcounts before generating.', v_period
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3. Delete draft fixed_split invoices so re-generation is idempotent
    DELETE FROM invoices
    WHERE period_month = v_period
      AND billing_mode = 'fixed_split'
      AND status = 'draft';

    -- 4. Rent: one invoice per sub at its headcount ratio
    IF p_rent_total > 0 THEN
        WITH rent_rows AS (
            SELECT
                mh.company_id,
                ROUND(p_rent_total * mh.headcount::DECIMAL / v_total_headcount, 2) AS amount
            FROM monthly_headcounts mh
            WHERE mh.period_month = v_period
              AND mh.company_id IS NOT NULL
              AND mh.headcount > 0
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
            v_caller
        FROM rent_rows r
        WHERE r.amount > 0;

        GET DIAGNOSTICS v_rent_count = ROW_COUNT;

        v_hv_rent_share := ROUND(p_rent_total * v_hv_headcount::DECIMAL / v_total_headcount, 2);
    END IF;

    -- 5. Utility: same pattern
    IF p_utility_total > 0 THEN
        WITH util_rows AS (
            SELECT
                mh.company_id,
                ROUND(p_utility_total * mh.headcount::DECIMAL / v_total_headcount, 2) AS amount
            FROM monthly_headcounts mh
            WHERE mh.period_month = v_period
              AND mh.company_id IS NOT NULL
              AND mh.headcount > 0
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
            v_caller
        FROM util_rows r
        WHERE r.amount > 0;

        GET DIAGNOSTICS v_utility_count = ROW_COUNT;

        v_hv_utility_share := ROUND(p_utility_total * v_hv_headcount::DECIMAL / v_total_headcount, 2);
    END IF;

    RETURN jsonb_build_object(
        'generated',        v_rent_count + v_utility_count,
        'rent_invoices',    v_rent_count,
        'utility_invoices', v_utility_count,
        'hv_rent_share',    v_hv_rent_share,
        'hv_utility_share', v_hv_utility_share,
        'total_headcount',  v_total_headcount,
        'hv_headcount',     v_hv_headcount,
        'period',           v_period
    );
END;
$$;

COMMENT ON FUNCTION generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL, JSONB) IS
    'Headcount-based rent + utility allocation. p_headcounts is [{company_id, headcount}] — HV is the row with company_id=null. Persists headcounts to monthly_headcounts then splits totals by ratio.';

GRANT EXECUTE ON FUNCTION generate_fixed_split_invoices(DATE, DECIMAL, DECIMAL, JSONB) TO authenticated;
