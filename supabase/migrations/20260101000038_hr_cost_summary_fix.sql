-- Fix: get_hr_cost_summary() should compute total_ctc from components
-- instead of reading the null total_ctc column. The column is only
-- populated during HR cost submission; the live preview needs computed values.

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
        SUM(hsc.allowances),
        SUM(hsc.basic_salary + COALESCE(hsc.epf_er, 0) + COALESCE(hsc.socso_er, 0) + COALESCE(hsc.eis_er, 0) + hsc.allowances)
    FROM hr_staff_costs hsc
    JOIN departments d ON d.id = hsc.department_id
    WHERE hsc.status = 'active'
      AND current_user_role() IN ('principal', 'finance', 'hr')
    GROUP BY d.id, d.name
$$;
