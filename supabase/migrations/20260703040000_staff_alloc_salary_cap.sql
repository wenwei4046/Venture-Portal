-- ============================================================================
-- 20260703040000_staff_alloc_salary_cap.sql
-- Component breakdown fix: cap the Salary component at gross.
--
-- InfoTech-imported rows can carry gross straight from the file (e.g. unpaid
-- leave already prorated by InfoTech) while basic_salary still holds the
-- full-month figure and deduction_amount = 0. There "basic × prorata −
-- deduction" exceeds gross and the derived Allowance line went NEGATIVE
-- (June 2026: NUR AIN, gross 2,523.02 vs basic 2,800 → Finance × CAR
-- allowance −195.43).
--
-- Salary component is now GREATEST(LEAST(prorated basic − deduction, gross), 0):
-- imported prorated rows show their whole gross as Salary (allowance 0),
-- trigger-computed rows are unchanged, and Allowance can never go negative.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_staff_billing_allocation(p_period_month DATE)
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
            -- Salary component: prorated basic − RM deduction, capped into
            -- [0, gross] so imported rows (gross from file, full basic in the
            -- field) never produce a negative Allowance.
            GREATEST(
                LEAST(
                    hmp.basic_salary
                        * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                               ELSE hmp.prorata_days_worked::NUMERIC
                                    / hmp.prorata_days_in_month::NUMERIC END
                    - COALESCE(hmp.deduction_amount, 0),
                    hmp.gross
                ),
                0
            ) AS salary_comp,
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

COMMIT;
