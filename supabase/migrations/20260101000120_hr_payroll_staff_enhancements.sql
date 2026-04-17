-- ============================================================================
-- 20260101000120_hr_payroll_staff_enhancements.sql
-- Spec 1 (HR Payroll Redesign) — extend hr_staff_costs for monthly payroll
-- HOUZS Venture Portal
--
-- Adds the 9 fields needed by compute_hr_monthly_payroll (migration 122):
-- employee_code, hire_date, resignation_date, epf_category, socso_category,
-- is_epf_exempt, pcb_category, children_count, employment_type.
--
-- Also rewrites compute_hr_staff_statutory to use the per-staff categories
-- instead of hardcoded Part A / first / KA1 defaults.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS (new)
-- ----------------------------------------------------------------------------

CREATE TYPE hr_employment_type AS ENUM ('salaried', 'commission_eligible');

COMMENT ON TYPE hr_employment_type IS
    'salaried = fixed basic only; commission_eligible = basic + commission via commission_rules (Spec 1c).';

-- ----------------------------------------------------------------------------
-- ALTER TABLE hr_staff_costs — add 9 columns
-- ----------------------------------------------------------------------------

-- employee_code: free-form, must be unique per active staff (nullable for legacy rows)
ALTER TABLE hr_staff_costs ADD COLUMN employee_code TEXT;

-- hire_date: nullable. Backfill from InfoTech import in a later migration.
-- compute_hr_monthly_payroll (migration 122) treats NULL hire_date as "hired before period" (full-month pro-rata).
ALTER TABLE hr_staff_costs ADD COLUMN hire_date DATE;

-- resignation_date: nullable — only set when employee leaves
ALTER TABLE hr_staff_costs ADD COLUMN resignation_date DATE;

-- Statutory categories — reuse existing enums (epf_part from 000008, socso_category from 000008, pcb_category from 000005)
ALTER TABLE hr_staff_costs ADD COLUMN epf_category epf_part NOT NULL DEFAULT 'A';
ALTER TABLE hr_staff_costs ADD COLUMN socso_category socso_category NOT NULL DEFAULT 'first';
ALTER TABLE hr_staff_costs ADD COLUMN is_epf_exempt BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hr_staff_costs ADD COLUMN pcb_category pcb_category NOT NULL DEFAULT 'KA1';
ALTER TABLE hr_staff_costs ADD COLUMN children_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT children_count_non_negative CHECK (children_count >= 0);

ALTER TABLE hr_staff_costs ADD COLUMN employment_type hr_employment_type NOT NULL DEFAULT 'salaried';

-- Sanity: resignation must not precede hire
ALTER TABLE hr_staff_costs ADD CONSTRAINT resignation_after_hire
    CHECK (resignation_date IS NULL OR resignation_date >= hire_date);

-- Partial unique index on employee_code for active staff only
CREATE UNIQUE INDEX idx_hr_staff_employee_code_active
    ON hr_staff_costs (employee_code)
    WHERE status = 'active' AND employee_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- REWRITE compute_hr_staff_statutory trigger function
-- Uses per-staff categories instead of hardcoded defaults.
-- Respects is_epf_exempt (EPF ER = 0 when TRUE).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_hr_staff_statutory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_epf_er DECIMAL;
    v_socso_er DECIMAL;
    v_eis_er DECIMAL;
BEGIN
    -- EPF ER: skip entirely if exempt
    IF NEW.is_epf_exempt THEN
        v_epf_er := 0;
    ELSE
        SELECT employer INTO v_epf_er
        FROM lookup_epf(NEW.basic_salary, NEW.epf_category);
        v_epf_er := COALESCE(v_epf_er, 0);
    END IF;

    -- SOCSO ER (category-aware)
    SELECT employer INTO v_socso_er
    FROM lookup_socso(NEW.basic_salary, NEW.socso_category);
    v_socso_er := COALESCE(v_socso_er, 0);

    -- EIS ER (uniform — no category parameter)
    SELECT employer INTO v_eis_er
    FROM lookup_eis(NEW.basic_salary);
    v_eis_er := COALESCE(v_eis_er, 0);

    NEW.epf_er := v_epf_er;
    NEW.socso_er := v_socso_er;
    NEW.eis_er := v_eis_er;
    NEW.total_ctc := NEW.basic_salary + v_epf_er + v_socso_er + v_eis_er + COALESCE(NEW.allowances, 0);

    RETURN NEW;
END;
$$;

-- Replace old trigger with one that also fires on category/exempt changes
DROP TRIGGER IF EXISTS trg_hr_staff_compute_statutory ON hr_staff_costs;

CREATE TRIGGER trg_hr_staff_compute_statutory
    BEFORE INSERT OR UPDATE OF
        basic_salary, allowances,
        epf_category, socso_category, is_epf_exempt
    ON hr_staff_costs
    FOR EACH ROW
    EXECUTE FUNCTION compute_hr_staff_statutory();

-- Backfill: touch all active staff so the new category-aware trigger recomputes.
-- Defaults (Part A / first / KA1 / not exempt) match the pre-migration hardcoded
-- behavior, so existing epf_er / socso_er / eis_er values should not change.
UPDATE hr_staff_costs SET basic_salary = basic_salary WHERE status = 'active';
