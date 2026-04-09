-- ============================================================================
-- 20260101000024_rent_utility_splits.sql
-- Phase 2 Step 8 — rent_splits + utility_splits template tables
-- HOUZS Venture Portal (VP)
--
-- The Billing module's Fixed Split mode needs percentages per company for
-- rent and utility. Total across all rows (including HV's own share, which
-- is non-billable) must sum to 1.0. Monthly totals are entered separately
-- at invoice generation time — these tables only hold the % template.
--
-- HV's share is modelled as a row with company_id=NULL + is_hv_share=true.
-- Exactly one HV row allowed per table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: rent_splits
-- ----------------------------------------------------------------------------

CREATE TABLE rent_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    is_hv_share BOOLEAN NOT NULL DEFAULT FALSE,
    split_pct DECIMAL(7, 6) NOT NULL,
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT split_pct_valid CHECK (split_pct >= 0 AND split_pct <= 1),
    CONSTRAINT hv_share_has_no_company CHECK (
        (is_hv_share = TRUE AND company_id IS NULL)
        OR (is_hv_share = FALSE AND company_id IS NOT NULL)
    )
);

-- Exactly one row per company; exactly one HV row.
CREATE UNIQUE INDEX uq_rent_splits_company
    ON rent_splits (company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX uq_rent_splits_hv
    ON rent_splits (is_hv_share) WHERE is_hv_share = TRUE;

COMMENT ON TABLE rent_splits IS
    'Phase 2 Step 8: rent split percentage template. Sum of all rows (including HV) must equal 1.0 — enforced at Server Action level. HV row is non-billable and flows to hv_operating_fund.';

-- ----------------------------------------------------------------------------
-- TABLE: utility_splits
-- ----------------------------------------------------------------------------

CREATE TABLE utility_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    is_hv_share BOOLEAN NOT NULL DEFAULT FALSE,
    split_pct DECIMAL(7, 6) NOT NULL,
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT split_pct_valid CHECK (split_pct >= 0 AND split_pct <= 1),
    CONSTRAINT hv_share_has_no_company CHECK (
        (is_hv_share = TRUE AND company_id IS NULL)
        OR (is_hv_share = FALSE AND company_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_utility_splits_company
    ON utility_splits (company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX uq_utility_splits_hv
    ON utility_splits (is_hv_share) WHERE is_hv_share = TRUE;

COMMENT ON TABLE utility_splits IS
    'Phase 2 Step 8: utility split percentage template. Same shape as rent_splits. Total must equal 1.0.';

-- ----------------------------------------------------------------------------
-- RLS — Principal writes, Principal + Finance read
-- ----------------------------------------------------------------------------

ALTER TABLE rent_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY rent_splits_pf_select ON rent_splits
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY rent_splits_principal_insert ON rent_splits
    FOR INSERT WITH CHECK (current_user_role() = 'principal');
CREATE POLICY rent_splits_principal_update ON rent_splits
    FOR UPDATE USING (current_user_role() = 'principal');
CREATE POLICY rent_splits_principal_delete ON rent_splits
    FOR DELETE USING (current_user_role() = 'principal');

CREATE POLICY utility_splits_pf_select ON utility_splits
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
CREATE POLICY utility_splits_principal_insert ON utility_splits
    FOR INSERT WITH CHECK (current_user_role() = 'principal');
CREATE POLICY utility_splits_principal_update ON utility_splits
    FOR UPDATE USING (current_user_role() = 'principal');
CREATE POLICY utility_splits_principal_delete ON utility_splits
    FOR DELETE USING (current_user_role() = 'principal');

-- ----------------------------------------------------------------------------
-- Audit triggers (uses log_config_change from migration 23)
-- ----------------------------------------------------------------------------

CREATE TRIGGER rent_splits_audit
    AFTER UPDATE ON rent_splits
    FOR EACH ROW EXECUTE FUNCTION log_config_change();

CREATE TRIGGER utility_splits_audit
    AFTER UPDATE ON utility_splits
    FOR EACH ROW EXECUTE FUNCTION log_config_change();
