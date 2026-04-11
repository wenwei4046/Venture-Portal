-- Auto-compute statutory ER + total_ctc on hr_staff_costs insert/update.
-- Uses the same lookup_epf/socso/eis RPCs that the director salary engine uses.
-- This ensures the live preview and HR cost submission snapshot have real values.

CREATE OR REPLACE FUNCTION compute_hr_staff_statutory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_epf_er DECIMAL;
    v_socso_er DECIMAL;
    v_eis_er DECIMAL;
BEGIN
    -- EPF ER lookup (Part A, current date)
    SELECT employer INTO v_epf_er
    FROM lookup_epf(NEW.basic_salary);
    v_epf_er := COALESCE(v_epf_er, 0);

    -- SOCSO ER lookup (first category, current date)
    SELECT employer INTO v_socso_er
    FROM lookup_socso(NEW.basic_salary);
    v_socso_er := COALESCE(v_socso_er, 0);

    -- EIS ER lookup (current date)
    SELECT employer INTO v_eis_er
    FROM lookup_eis(NEW.basic_salary);
    v_eis_er := COALESCE(v_eis_er, 0);

    -- Set computed fields
    NEW.epf_er := v_epf_er;
    NEW.socso_er := v_socso_er;
    NEW.eis_er := v_eis_er;
    NEW.total_ctc := NEW.basic_salary + v_epf_er + v_socso_er + v_eis_er + COALESCE(NEW.allowances, 0);

    RETURN NEW;
END;
$$;

-- Fire BEFORE INSERT OR UPDATE so the computed values are stored with the row
CREATE TRIGGER trg_hr_staff_compute_statutory
    BEFORE INSERT OR UPDATE OF basic_salary, allowances
    ON hr_staff_costs
    FOR EACH ROW
    EXECUTE FUNCTION compute_hr_staff_statutory();

-- Backfill: touch all active staff to trigger recomputation
UPDATE hr_staff_costs SET basic_salary = basic_salary WHERE status = 'active';
