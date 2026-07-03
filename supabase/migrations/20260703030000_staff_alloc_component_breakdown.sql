-- ============================================================================
-- 20260703030000_staff_alloc_component_breakdown.sql
-- get_staff_billing_allocation: break each dept × company amount into the
-- five components Finance bills on the invoice (user sample 2026-07-03):
--
--   Salary    = prorated basic − RM deduction     (absorbs rounding drift)
--   Allowance = statutory + non-statutory allowance + OT + commission
--               (derived per staff as gross − salary component, which matches
--                the compute trigger exactly: gross = prorated basic
--                + prorated stat allowance + prorated OT + commission
--                + non-stat allowance − deduction)
--   EPF / SOCSO / EIS = employer contributions
--
-- Per company: each component is ROUND(SUM(component × pct), 2); Salary is
-- defined as total − the other four, so the five lines ALWAYS sum exactly to
-- the company total (sen drift lands in the biggest line).
--
-- Return type changes → DROP + CREATE (CREATE OR REPLACE cannot alter the
-- result columns).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS get_staff_billing_allocation(DATE);

CREATE FUNCTION get_staff_billing_allocation(p_period_month DATE)
RETURNS TABLE (
    department_id UUID,
    department_name TEXT,
    company_id UUID,
    company_name TEXT,
    company_short_code TEXT,
    staff_count INT,
    amount DECIMAL,
    salary_amount DECIMAL,
    allowance_amount DECIMAL,
    epf_amount DECIMAL,
    socso_amount DECIMAL,
    eis_amount DECIMAL
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    WITH per_staff AS (
        SELECT
            hsc.department_id  AS dept_id,
            d.name             AS dept_name,
            hsa.company_id     AS comp_id,
            c.name             AS comp_name,
            c.short_code       AS comp_code,
            hmp.staff_id       AS sid,
            hsa.allocation_pct AS pct,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- Salary component mirrors the compute trigger's prorate inputs.
            (hmp.basic_salary
                * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                       ELSE hmp.prorata_days_worked::NUMERIC
                            / hmp.prorata_days_in_month::NUMERIC END
             - COALESCE(hmp.deduction_amount, 0)) AS salary_comp,
            hmp.gross    AS gross_amt,
            hmp.epf_er   AS epf_er,
            hmp.socso_er AS socso_er,
            hmp.eis_er   AS eis_er
        FROM hr_monthly_payroll hmp
        JOIN hr_staff_costs hsc      ON hsc.id = hmp.staff_id
        JOIN departments d           ON d.id = hsc.department_id
        JOIN hr_staff_allocation hsa ON hsa.staff_id = hmp.staff_id
                                    AND hsa.period_month = hmp.period_month
        JOIN companies c             ON c.id = hsa.company_id
        WHERE hmp.period_month = p_period_month
          AND hmp.status IN ('submitted', 'paid')
          AND hsa.allocation_pct > 0
    )
    SELECT
        ps.dept_id,
        ps.dept_name::TEXT,
        ps.comp_id,
        ps.comp_name::TEXT,
        ps.comp_code::TEXT,
        COUNT(DISTINCT ps.sid)::INT AS staff_count,
        ROUND(SUM(ps.total_cost * ps.pct), 2)::DECIMAL AS amount,
        -- Salary = total − other four rounded components → exact tally.
        (ROUND(SUM(ps.total_cost * ps.pct), 2)
         - ROUND(SUM((ps.gross_amt - ps.salary_comp) * ps.pct), 2)
         - ROUND(SUM(ps.epf_er * ps.pct), 2)
         - ROUND(SUM(ps.socso_er * ps.pct), 2)
         - ROUND(SUM(ps.eis_er * ps.pct), 2))::DECIMAL AS salary_amount,
        ROUND(SUM((ps.gross_amt - ps.salary_comp) * ps.pct), 2)::DECIMAL AS allowance_amount,
        ROUND(SUM(ps.epf_er * ps.pct), 2)::DECIMAL AS epf_amount,
        ROUND(SUM(ps.socso_er * ps.pct), 2)::DECIMAL AS socso_amount,
        ROUND(SUM(ps.eis_er * ps.pct), 2)::DECIMAL AS eis_amount
    FROM per_staff ps
    GROUP BY ps.dept_id, ps.dept_name, ps.comp_id, ps.comp_name, ps.comp_code
    HAVING ROUND(SUM(ps.total_cost * ps.pct), 2) > 0
    ORDER BY ps.dept_name, ps.comp_code;
END;
$$;

COMMENT ON FUNCTION get_staff_billing_allocation(DATE) IS
    'Staff billing allocation per department × subsidiary for a period, with '
    'the five invoice components (Salary / Allowance / EPF / SOCSO / EIS ER). '
    'Salary = prorated basic − deduction and absorbs rounding so components '
    'always sum to the total. SUBMITTED payroll rows only; aggregate-only '
    '(no PII); callable by principal / finance / hr.';

GRANT EXECUTE ON FUNCTION get_staff_billing_allocation(DATE) TO authenticated;

COMMIT;
