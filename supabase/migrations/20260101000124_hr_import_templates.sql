-- ============================================================================
-- 20260101000124_hr_import_templates.sql
-- Spec 1 (HR Payroll Redesign) — remembered column mapping for InfoTech CSV import
-- HOUZS Venture Portal
--
-- Problem: InfoTech CSV column headers vary per report (e.g. "Emp No", "Basic Pay",
-- "OT (Hrs)"), don't match our hr_monthly_payroll field names. Asking HR to
-- re-map every month = friction.
--
-- Solution: save the column map as a named template. Each user can have their
-- own templates plus team-shared templates (user_id IS NULL). Next import
-- reuses the mapping.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: hr_import_templates
-- ----------------------------------------------------------------------------

CREATE TABLE hr_import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = team-shared
    template_name TEXT NOT NULL,

    -- {"InfoTech column header": "hr_monthly_payroll_field"}
    -- e.g. {"Emp No": "employee_code", "Basic Pay": "basic_salary", "OT (Hrs)": "ot_hours"}
    column_map JSONB NOT NULL,

    -- How to match CSV rows to existing staff. 'employee_code' is primary; fuzzy
    -- name matching is fallback for legacy exports without codes.
    match_strategy TEXT NOT NULL DEFAULT 'employee_code'
        CONSTRAINT valid_match_strategy
        CHECK (match_strategy IN ('employee_code', 'employee_name_fuzzy')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_import_template_name_per_user UNIQUE (user_id, template_name)
);

COMMENT ON TABLE hr_import_templates IS
    'Spec 1: saved CSV-column to hr_monthly_payroll-field mappings for InfoTech import. user_id NULL = team-shared.';

CREATE INDEX idx_hr_import_templates_user ON hr_import_templates (user_id);

-- ----------------------------------------------------------------------------
-- RLS — principal + hr: see own + shared, manage own. DELETE own only.
-- ----------------------------------------------------------------------------

ALTER TABLE hr_import_templates ENABLE ROW LEVEL SECURITY;

-- Principal: ALL on everything
CREATE POLICY hr_import_templates_principal_all
    ON hr_import_templates FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

-- HR: SELECT own + shared templates
CREATE POLICY hr_import_templates_hr_select
    ON hr_import_templates FOR SELECT
    USING (
        current_user_role() = 'hr'
        AND (user_id = auth.uid() OR user_id IS NULL)
    );

-- HR: INSERT own (user_id must match auth.uid()) or team-shared (NULL)
CREATE POLICY hr_import_templates_hr_insert
    ON hr_import_templates FOR INSERT
    WITH CHECK (
        current_user_role() = 'hr'
        AND (user_id = auth.uid() OR user_id IS NULL)
    );

-- HR: UPDATE own only (can't edit team-shared to avoid stepping on colleagues)
CREATE POLICY hr_import_templates_hr_update
    ON hr_import_templates FOR UPDATE
    USING (current_user_role() = 'hr' AND user_id = auth.uid())
    WITH CHECK (current_user_role() = 'hr' AND user_id = auth.uid());

-- HR: DELETE own only
CREATE POLICY hr_import_templates_hr_delete
    ON hr_import_templates FOR DELETE
    USING (current_user_role() = 'hr' AND user_id = auth.uid());
