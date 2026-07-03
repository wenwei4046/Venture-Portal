-- ============================================================================
-- 20260703050000_staff_alloc_hv_component_row.sql
-- get_staff_billing_allocation: emit an HV own-share row per department with
-- the same five components (user request 2026-07-03: "HV 那行也要给 Finance
-- 看 details").
--
-- The HV row is company_id = NULL / short_code 'HV'. Each of its columns is
-- computed as (department total − sum of the company rows) so every column
-- tallies exactly: companies + HV = the department's full payroll cost,
-- including staff with no allocation at all (100% HV).
--
-- Consumers: the Billing page renders the HV row with components; the invoice
-- auto-fill actions filter out company_id IS NULL rows (HV is never billed).
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
    WITH staff_rows AS (
        -- Every submitted payroll row in the period, with its components.
        SELECT
            hsc.department_id  AS dept_id,
            d.name             AS dept_name,
            hmp.staff_id       AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
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
        JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
        JOIN departments d      ON d.id = hsc.department_id
        WHERE hmp.period_month = p_period_month
          AND hmp.status IN ('submitted', 'paid')
    ),
    company_agg AS (
        -- Billed side: allocation % × components per dept × company.
        SELECT
            sr.dept_id,
            sr.dept_name,
            hsa.company_id AS comp_id,
            c.name         AS comp_name,
            c.short_code   AS comp_code,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) AS amt,
            (ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2)
             - ROUND(SUM((sr.gross_amt - sr.salary_comp) * hsa.allocation_pct), 2)
             - ROUND(SUM(sr.epf_er * hsa.allocation_pct), 2)
             - ROUND(SUM(sr.socso_er * hsa.allocation_pct), 2)
             - ROUND(SUM(sr.eis_er * hsa.allocation_pct), 2)) AS salary_amt,
            ROUND(SUM((sr.gross_amt - sr.salary_comp) * hsa.allocation_pct), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er * hsa.allocation_pct), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er * hsa.allocation_pct), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er * hsa.allocation_pct), 2) AS eis_amt
        FROM staff_rows sr
        JOIN hr_staff_allocation hsa ON hsa.staff_id = sr.sid
                                    AND hsa.period_month = p_period_month
                                    AND hsa.allocation_pct > 0
        JOIN companies c ON c.id = hsa.company_id
        GROUP BY sr.dept_id, sr.dept_name, hsa.company_id, c.name, c.short_code
        HAVING ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) > 0
    ),
    dept_tot AS (
        -- Full department cost (allocated or not), components rounded the
        -- same way; salary absorbs the rounding.
        SELECT
            sr.dept_id,
            sr.dept_name,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost), 2) AS amt,
            (ROUND(SUM(sr.total_cost), 2)
             - ROUND(SUM(sr.gross_amt - sr.salary_comp), 2)
             - ROUND(SUM(sr.epf_er), 2)
             - ROUND(SUM(sr.socso_er), 2)
             - ROUND(SUM(sr.eis_er), 2)) AS salary_amt,
            ROUND(SUM(sr.gross_amt - sr.salary_comp), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er), 2) AS eis_amt
        FROM staff_rows sr
        GROUP BY sr.dept_id, sr.dept_name
    ),
    hv_raw AS (
        -- HV own share = department total − billed companies, per column.
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(SUM(ca.amt), 0)           AS amt,
            dt.allowance_amt - COALESCE(SUM(ca.allowance_amt), 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(SUM(ca.epf_amt), 0)       AS epf_amt,
            dt.socso_amt     - COALESCE(SUM(ca.socso_amt), 0)     AS socso_amt,
            dt.eis_amt       - COALESCE(SUM(ca.eis_amt), 0)       AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_agg ca ON ca.dept_id = dt.dept_id
        GROUP BY dt.dept_id, dt.dept_name, dt.n_staff,
                 dt.amt, dt.allowance_amt, dt.epf_amt, dt.socso_amt, dt.eis_amt
        -- < 5 sen = pure rounding residue on a (near-)fully-allocated dept —
        -- suppress rather than show a one-sen HV line with negative sens.
        HAVING (dt.amt - COALESCE(SUM(ca.amt), 0)) >= 0.05
    ),
    hv_agg AS (
        -- Clamp component residue at 0 and let Salary absorb, so a real HV
        -- row never shows a negative sen in any component.
        SELECT
            hr.dept_id,
            hr.dept_name,
            NULL::UUID       AS comp_id,
            'HOUZS Venture'  AS comp_name,
            'HV'             AS comp_code,
            hr.n_staff,
            hr.amt,
            hr.amt - GREATEST(hr.allowance_amt, 0) - GREATEST(hr.epf_amt, 0)
                   - GREATEST(hr.socso_amt, 0) - GREATEST(hr.eis_amt, 0) AS salary_amt,
            GREATEST(hr.allowance_amt, 0) AS allowance_amt,
            GREATEST(hr.epf_amt, 0)       AS epf_amt,
            GREATEST(hr.socso_amt, 0)     AS socso_amt,
            GREATEST(hr.eis_amt, 0)       AS eis_amt
        FROM hv_raw hr
    ),
    combined AS (
        SELECT ca.dept_id, ca.dept_name, ca.comp_id, ca.comp_name, ca.comp_code,
               ca.n_staff, ca.amt, ca.salary_amt, ca.allowance_amt,
               ca.epf_amt, ca.socso_amt, ca.eis_amt
        FROM company_agg ca
        -- Only emit HV rows for departments that have at least one billed
        -- company row — a dept with no allocation at all has nothing to hand
        -- to Finance yet.
        UNION ALL
        SELECT hv.dept_id, hv.dept_name, hv.comp_id, hv.comp_name, hv.comp_code,
               hv.n_staff, hv.amt, hv.salary_amt, hv.allowance_amt,
               hv.epf_amt, hv.socso_amt, hv.eis_amt
        FROM hv_agg hv
        WHERE EXISTS (SELECT 1 FROM company_agg ca2 WHERE ca2.dept_id = hv.dept_id)
    )
    SELECT
        cb.dept_id,
        cb.dept_name::TEXT,
        cb.comp_id,
        cb.comp_name::TEXT,
        cb.comp_code::TEXT,
        cb.n_staff,
        cb.amt::DECIMAL,
        cb.salary_amt::DECIMAL,
        cb.allowance_amt::DECIMAL,
        cb.epf_amt::DECIMAL,
        cb.socso_amt::DECIMAL,
        cb.eis_amt::DECIMAL
    FROM combined cb
    ORDER BY cb.dept_name, (cb.comp_id IS NULL), cb.comp_code;
END;
$$;

COMMENT ON FUNCTION get_staff_billing_allocation(DATE) IS
    'Staff billing allocation per department × subsidiary with five invoice '
    'components (Salary / Allowance / EPF / SOCSO / EIS ER), plus one HV '
    'own-share row per dept (company_id NULL, code HV) = dept total − billed, '
    'per column, so companies + HV always tally to the full dept cost. '
    'SUBMITTED payroll rows only; aggregate-only; principal / finance / hr.';

COMMIT;
