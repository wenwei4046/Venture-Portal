-- Add non-statutory allowance column (transport, benefits — no EPF/SOCSO/EIS)
-- and allow staff deletion (change RLS policy)

ALTER TABLE hr_staff_costs
    ADD COLUMN IF NOT EXISTS non_statutory_allowance DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN hr_staff_costs.non_statutory_allowance IS
    'Allowances that do NOT attract employer statutory (transport, benefits, etc.)';

-- Update the statutory trigger to include non_statutory_allowance in total_ctc
-- but NOT in statutory calculation
CREATE OR REPLACE FUNCTION compute_hr_staff_statutory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_epf_er DECIMAL;
    v_socso_er DECIMAL;
    v_eis_er DECIMAL;
BEGIN
    -- Statutory computed on basic_salary only (not allowances)
    SELECT employer INTO v_epf_er FROM lookup_epf(NEW.basic_salary);
    v_epf_er := COALESCE(v_epf_er, 0);

    SELECT employer INTO v_socso_er FROM lookup_socso(NEW.basic_salary);
    v_socso_er := COALESCE(v_socso_er, 0);

    SELECT employer INTO v_eis_er FROM lookup_eis(NEW.basic_salary);
    v_eis_er := COALESCE(v_eis_er, 0);

    NEW.epf_er := v_epf_er;
    NEW.socso_er := v_socso_er;
    NEW.eis_er := v_eis_er;
    -- total_ctc = basic + statutory ER + statutory allowance + non-statutory allowance
    NEW.total_ctc := NEW.basic_salary + v_epf_er + v_socso_er + v_eis_er
                   + COALESCE(NEW.allowances, 0)
                   + COALESCE(NEW.non_statutory_allowance, 0);

    RETURN NEW;
END;
$$;

-- Update trigger to also fire on non_statutory_allowance changes
DROP TRIGGER IF EXISTS trg_hr_staff_compute_statutory ON hr_staff_costs;
CREATE TRIGGER trg_hr_staff_compute_statutory
    BEFORE INSERT OR UPDATE OF basic_salary, allowances, non_statutory_allowance
    ON hr_staff_costs
    FOR EACH ROW
    EXECUTE FUNCTION compute_hr_staff_statutory();

-- Allow actual deletion (remove the old no-delete policy, add restricted delete)
DROP POLICY IF EXISTS hr_staff_costs_no_delete ON hr_staff_costs;
CREATE POLICY hr_staff_costs_hr_delete ON hr_staff_costs
    FOR DELETE USING (current_user_role() IN ('principal', 'hr'));

-- Update get_hr_cost_summary to include non_statutory_allowance
CREATE OR REPLACE FUNCTION get_hr_cost_summary()
RETURNS TABLE (
    department_id UUID,
    department_name TEXT,
    staff_count BIGINT,
    total_basic DECIMAL,
    total_statutory DECIMAL,
    total_allowance DECIMAL,
    total_ctc DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        d.id,
        d.name,
        COUNT(*),
        SUM(hsc.basic_salary),
        SUM(COALESCE(hsc.epf_er, 0) + COALESCE(hsc.socso_er, 0) + COALESCE(hsc.eis_er, 0)),
        SUM(hsc.allowances + COALESCE(hsc.non_statutory_allowance, 0)),
        SUM(hsc.basic_salary + COALESCE(hsc.epf_er, 0) + COALESCE(hsc.socso_er, 0) + COALESCE(hsc.eis_er, 0) + hsc.allowances + COALESCE(hsc.non_statutory_allowance, 0))
    FROM hr_staff_costs hsc
    JOIN departments d ON d.id = hsc.department_id
    WHERE hsc.status = 'active'
      AND current_user_role() IN ('principal', 'finance', 'hr')
    GROUP BY d.id, d.name
$$;
