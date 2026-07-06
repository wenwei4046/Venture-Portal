-- Own-share inter-billing to Venture (Office). Applied to the live DB via MCP
-- apply_migration on 2026-07-06; file kept for repo parity.
--
-- 1) Paying-side inter-billing expense leaf for the Venture Office pseudo-dept.
--    approveInvoice / createPaymentVoucher resolve the payer's expense account
--    via ilike 'Inter-billing % <deptName>' and fail loud if absent, so this
--    row is mandatory before the own-share flow runs.
INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, cash_flow_category, sort_order)
VALUES ('9056', 'Inter-billing - Venture Office', 'expense', '9050', true, 'operating', 66)
ON CONFLICT (code) DO NOTHING;

-- 2) get_staff_own_share_allocation(period): every department's HV own-share
--    (residual staff cost NOT billed to any subsidiary), with the same
--    5-component split as get_staff_billing_allocation. Unlike that RPC, this
--    one emits a row for EVERY dept with a residual >= 0.05 — including depts
--    that are 100% HV-absorbed (which the shared RPC drops via its
--    `WHERE EXISTS (company_agg)` guard). The app-layer generator filters to the
--    staff-attribution segments (hr/finance/director_office/director) and
--    excludes Marketing.
CREATE OR REPLACE FUNCTION public.get_staff_own_share_allocation(p_period_month date)
 RETURNS TABLE(department_id uuid, department_name text, staff_count integer,
               amount numeric, salary_amount numeric, allowance_amount numeric,
               epf_amount numeric, socso_amount numeric, eis_amount numeric)
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