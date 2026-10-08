-- 2026-10-05 · Salary / Allowance split of an InfoTech-imported payroll row
--
-- Finance, on HV-INV-202608-0051: "拆成 salary/allowance/epf 等等拆对吗？" It was
-- not, for anyone who joined or left mid-month. The InfoTech import
-- (hr-costing/payroll/[period]/import) writes the file's basic, which InfoTech
-- has ALREADY prorated (an Aug-10 joiner: 4,000 × 22/31 = 2,838.71), and then
-- keeps the file's gross verbatim; the compute trigger meanwhile records
-- prorata_days_worked / _in_month from the hire date. Both billing RPCs then
-- multiplied that basic by 22/31 a SECOND time, so 824.14 of plain basic pay
-- went out as "Allowance" (HC 412.07 / CONTS 288.45 / CAR 123.62 on the Aug'26
-- HR adjustment invoices; 135.80 of IT on 2990 and on CAR for Aug'26; 429.72
-- of Finance on 2990 for Sep'26). Totals, EPF, SOCSO and EIS were never wrong.
--
-- Fix: an imported row's basic_salary is the month's figure as paid — use it
-- as is. A row the compute trigger built (typed on the grid) keeps the
-- proration, because there basic_salary is the monthly rate and gross was
-- prorated from it. The lines already issued were corrected in place the same
-- day — invoice_lines and their 5050 journal lines, totals untouched
-- (access_log action amend_invoice_lines).

CREATE OR REPLACE FUNCTION public.get_staff_billing_allocation(p_period_month date)
 RETURNS TABLE(department_id uuid, department_name text, company_id uuid, company_name text, company_short_code text, staff_count integer, amount numeric, salary_amount numeric, allowance_amount numeric, epf_amount numeric, socso_amount numeric, eis_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    WITH staff_rows AS (
        SELECT
            hsc.department_id  AS dept_id,
            d.name             AS dept_name,
            hmp.staff_id       AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- The basic-pay part of gross. An InfoTech-imported row carries the
            -- file's basic, already prorated by InfoTech for a mid-month joiner
            -- or leaver, beside a gross kept verbatim from the file — so it is
            -- taken as is. A row the compute trigger built holds the monthly
            -- rate, and its gross was prorated from it, so the ratio applies.
            GREATEST(
                LEAST(
                    CASE WHEN hmp.source = 'imported' THEN hmp.basic_salary
                         ELSE hmp.basic_salary
                            * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                                   ELSE hmp.prorata_days_worked::NUMERIC
                                        / hmp.prorata_days_in_month::NUMERIC END
                    END
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
        HAVING (dt.amt - COALESCE(SUM(ca.amt), 0)) >= 0.05
    ),
    hv_agg AS (
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
$function$;

COMMENT ON FUNCTION public.get_staff_billing_allocation(date) IS
'Staff billing allocation per department × subsidiary with five invoice components (Salary / Allowance / EPF / SOCSO / EIS ER), plus one HV own-share row per dept (company_id NULL, code HV) = dept total − billed, per column, so companies + HV always tally to the full dept cost. SUBMITTED payroll rows only; aggregate-only; principal / finance / hr. Since 2026-10-05 an InfoTech-imported row''s basic is taken as paid (InfoTech already prorated it), not prorated a second time.';

CREATE OR REPLACE FUNCTION public.get_staff_own_share_allocation(p_period_month date)
 RETURNS TABLE(department_id uuid, department_name text, staff_count integer, amount numeric, salary_amount numeric, allowance_amount numeric, epf_amount numeric, socso_amount numeric, eis_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    WITH staff_rows AS (
        SELECT
            hsc.department_id AS dept_id,
            d.name            AS dept_name,
            hmp.staff_id      AS sid,
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er) AS total_cost,
            -- Same rule as get_staff_billing_allocation: an imported row's
            -- basic is already the month's figure; a computed row's is the
            -- monthly rate and takes the ratio.
            GREATEST(
                LEAST(
                    CASE WHEN hmp.source = 'imported' THEN hmp.basic_salary
                         ELSE hmp.basic_salary
                            * CASE WHEN COALESCE(hmp.prorata_days_in_month, 0) = 0 THEN 0
                                   ELSE hmp.prorata_days_worked::NUMERIC
                                        / hmp.prorata_days_in_month::NUMERIC END
                    END
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
        SELECT
            sr.dept_id,
            ROUND(SUM(sr.total_cost * hsa.allocation_pct), 2) AS amt,
            ROUND(SUM((sr.gross_amt - sr.salary_comp) * hsa.allocation_pct), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er * hsa.allocation_pct), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er * hsa.allocation_pct), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er * hsa.allocation_pct), 2) AS eis_amt
        FROM staff_rows sr
        JOIN hr_staff_allocation hsa ON hsa.staff_id = sr.sid
                                    AND hsa.period_month = p_period_month
                                    AND hsa.allocation_pct > 0
        GROUP BY sr.dept_id
    ),
    dept_tot AS (
        SELECT
            sr.dept_id,
            sr.dept_name,
            COUNT(DISTINCT sr.sid)::INT AS n_staff,
            ROUND(SUM(sr.total_cost), 2) AS amt,
            ROUND(SUM(sr.gross_amt - sr.salary_comp), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er), 2) AS eis_amt
        FROM staff_rows sr
        GROUP BY sr.dept_id, sr.dept_name
    ),
    hv_raw AS (
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(ca.amt, 0)           AS amt,
            dt.allowance_amt - COALESCE(ca.allowance_amt, 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(ca.epf_amt, 0)       AS epf_amt,
            dt.socso_amt     - COALESCE(ca.socso_amt, 0)     AS socso_amt,
            dt.eis_amt       - COALESCE(ca.eis_amt, 0)       AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_agg ca ON ca.dept_id = dt.dept_id
        WHERE (dt.amt - COALESCE(ca.amt, 0)) >= 0.05
    )
    SELECT
        hr.dept_id,
        hr.dept_name::TEXT,
        hr.n_staff,
        hr.amt::DECIMAL,
        (hr.amt - GREATEST(hr.allowance_amt,0) - GREATEST(hr.epf_amt,0)
                - GREATEST(hr.socso_amt,0) - GREATEST(hr.eis_amt,0))::DECIMAL AS salary_amount,
        GREATEST(hr.allowance_amt,0)::DECIMAL AS allowance_amount,
        GREATEST(hr.epf_amt,0)::DECIMAL       AS epf_amount,
        GREATEST(hr.socso_amt,0)::DECIMAL     AS socso_amount,
        GREATEST(hr.eis_amt,0)::DECIMAL       AS eis_amount
    FROM hv_raw hr
    ORDER BY hr.dept_name;
END;
$function$;

COMMENT ON FUNCTION public.get_staff_own_share_allocation(date) IS
'HV own share of each department''s staff cost (dept total − subsidiary allocations) in the five invoice components, for the HV own-share payroll invoice. Same salary rule as get_staff_billing_allocation: an InfoTech-imported row''s basic is taken as paid, not prorated a second time (2026-10-05).';
