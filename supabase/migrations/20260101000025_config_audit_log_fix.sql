-- ============================================================================
-- 20260101000025_config_audit_log_fix.sql
-- Phase 2 Step 8 — fix PL/pgSQL type check on log_config_change
--
-- Migration 23 used `NEW.config_key`, `NEW.tier`, etc. inside a CASE
-- TG_TABLE_NAME expression. PL/pgSQL type-checks all branches at parse
-- time, so triggering on treasury_config (which has no `tier` column)
-- failed with 42703 "record 'new' has no field 'tier'". This migration
-- replaces the per-branch field access with jsonb projection on NEW so
-- every field lookup goes through to_jsonb(NEW)->>'field_name', which
-- is schema-agnostic. Also extends the function to handle INSERT events
-- (rent_splits + utility_splits are saved via DELETE + INSERT), and adds
-- INSERT triggers for those two tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION log_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row_key TEXT;
    v_new_json JSONB;
    v_old_json JSONB;
BEGIN
    -- Project NEW/OLD to jsonb so field access is schema-agnostic.
    -- On INSERT, OLD is NULL; on DELETE, NEW is NULL. The config_audit_log
    -- old_values column is NOT NULL so we fall back to '{}' for INSERT.
    v_new_json := COALESCE(to_jsonb(NEW), '{}'::jsonb);
    v_old_json := COALESCE(to_jsonb(OLD), '{}'::jsonb);

    v_row_key := CASE TG_TABLE_NAME
        WHEN 'treasury_config' THEN v_new_json->>'config_key'
        WHEN 'tier_config'     THEN v_new_json->>'tier'
        WHEN 'overdue_config'  THEN v_new_json->>'stage'
        WHEN 'companies'       THEN v_new_json->>'id'
        WHEN 'rent_splits'     THEN COALESCE(v_new_json->>'company_id', 'HV')
        WHEN 'utility_splits'  THEN COALESCE(v_new_json->>'company_id', 'HV')
        ELSE v_new_json->>'id'
    END;

    INSERT INTO config_audit_log (table_name, row_key, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, v_row_key, auth.uid(), v_old_json, v_new_json);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION log_config_change() IS
    'Phase 2 Step 8 (fixed): trigger function that writes a row to config_audit_log on INSERT/UPDATE of a config table. Field access goes through to_jsonb(NEW)/(OLD) so PL/pgSQL does not type-check against the wrong source table at parse time. SECURITY DEFINER to bypass the no_insert policy.';

-- Add INSERT triggers for rent_splits + utility_splits so every save
-- (which uses DELETE + INSERT) still emits an audit event.

DROP TRIGGER IF EXISTS rent_splits_insert_audit ON rent_splits;
CREATE TRIGGER rent_splits_insert_audit
    AFTER INSERT ON rent_splits
    FOR EACH ROW EXECUTE FUNCTION log_config_change();

DROP TRIGGER IF EXISTS utility_splits_insert_audit ON utility_splits;
CREATE TRIGGER utility_splits_insert_audit
    AFTER INSERT ON utility_splits
    FOR EACH ROW EXECUTE FUNCTION log_config_change();
