-- ============================================================================
-- 20260101000023_config_audit_log.sql
-- Phase 2 Step 8 — unified config audit log (L2 fix from Phase 1 /qa)
-- HOUZS Venture Portal (VP)
--
-- Design: one unified config_audit_log table instead of per-table history
-- tables. Less schema, same queryable data, single trigger function. Applied
-- to the 4 Phase 1 config tables (treasury_config, tier_config,
-- overdue_config, companies). Rent/utility tables in migration 24 also use
-- the same trigger so their changes flow through here.
-- ============================================================================

CREATE TABLE config_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    row_key TEXT NOT NULL,   -- config_key | tier | stage | company id, depending on table
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    old_values JSONB NOT NULL,
    new_values JSONB NOT NULL
);

CREATE INDEX idx_config_audit_table_row ON config_audit_log(table_name, row_key, changed_at DESC);
CREATE INDEX idx_config_audit_changed_at ON config_audit_log(changed_at DESC);

COMMENT ON TABLE config_audit_log IS
    'Phase 2 Step 8 (L2 fix): unified audit history for all settings tables. One row per UPDATE. row_key is the logical identifier (config_key for treasury_config, tier for tier_config, etc.). Immutable: no INSERT/UPDATE/DELETE directly — writes come only from the log_config_change trigger.';

-- ----------------------------------------------------------------------------
-- RLS: Principal + Finance read. Nobody writes directly (trigger bypasses via
-- SECURITY DEFINER).
-- ----------------------------------------------------------------------------

ALTER TABLE config_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_pf_select ON config_audit_log
    FOR SELECT USING (current_user_role() IN ('principal', 'finance'));

CREATE POLICY audit_log_no_insert ON config_audit_log FOR INSERT WITH CHECK (FALSE);
CREATE POLICY audit_log_no_update ON config_audit_log FOR UPDATE USING (FALSE);
CREATE POLICY audit_log_no_delete ON config_audit_log FOR DELETE USING (FALSE);

-- ----------------------------------------------------------------------------
-- Trigger function
-- SECURITY DEFINER bypasses the audit_log_no_insert policy on the insert
-- path. Row key extraction is table-aware via a CASE on TG_TABLE_NAME.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row_key TEXT;
BEGIN
    -- Extract the logical row identifier based on the source table
    v_row_key := CASE TG_TABLE_NAME
        WHEN 'treasury_config' THEN NEW.config_key
        WHEN 'tier_config'     THEN NEW.tier::TEXT
        WHEN 'overdue_config'  THEN NEW.stage::TEXT
        WHEN 'companies'       THEN NEW.id::TEXT
        WHEN 'rent_splits'     THEN COALESCE(NEW.company_id::TEXT, 'HV')
        WHEN 'utility_splits'  THEN COALESCE(NEW.company_id::TEXT, 'HV')
        ELSE NEW.id::TEXT
    END;

    INSERT INTO config_audit_log (table_name, row_key, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, v_row_key, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION log_config_change() IS
    'Phase 2 Step 8: trigger function that writes a row to config_audit_log on UPDATE of a config table. SECURITY DEFINER to bypass the no_insert policy. Used by triggers on treasury_config, tier_config, overdue_config, companies, rent_splits, utility_splits.';

-- ----------------------------------------------------------------------------
-- Apply to existing config tables (rent_splits + utility_splits come in
-- migration 24 and attach the trigger there).
-- ----------------------------------------------------------------------------

CREATE TRIGGER treasury_config_audit
    AFTER UPDATE ON treasury_config
    FOR EACH ROW EXECUTE FUNCTION log_config_change();

CREATE TRIGGER tier_config_audit
    AFTER UPDATE ON tier_config
    FOR EACH ROW EXECUTE FUNCTION log_config_change();

CREATE TRIGGER overdue_config_audit
    AFTER UPDATE ON overdue_config
    FOR EACH ROW EXECUTE FUNCTION log_config_change();

CREATE TRIGGER companies_audit
    AFTER UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION log_config_change();
