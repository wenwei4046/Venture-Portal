-- Part of what moved into a cost-center department billed to HOUZS Venture (2026-11-04 — the user, on HR's card for
-- LOKE KAI YEE's half moved from Director Office: "分进来的无法由hv 承担一部分？" → method 2, a row of its own).
-- A receiver's Bill to now takes one row with no company: HOUZS Venture's share, a % of what moved in. It joins the
-- receiver's HV own-share row (get_staff_billing_allocation) and its own-share invoice to Venture Office
-- (get_staff_own_share_allocation, by the bill-back as before); what neither the companies nor HV take still stays
-- with the receiver (get_payroll_moves_summary: stays less HV, HV beside it). The three bodies are 20261103200000's —
-- production's as applied (md5 checked below) — with that part added and nothing else.

-- ─── 1. A Bill to row with no company is HOUZS Venture's ───────────────────
ALTER TABLE public.hr_pool_allocation ALTER COLUMN company_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_alloc_dept_period_hv
    ON public.hr_pool_allocation (department_id, period_month) WHERE company_id IS NULL;
COMMENT ON COLUMN public.hr_pool_allocation.company_id IS
    'The company billed; NULL = HOUZS Venture''s share of what moved in (2026-11-04), one a department a month.';

-- ─── 2. Production's bodies, unchanged since 20261103200000 ─────────────────
DO $guard$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_billing_allocation(date)'::regprocedure)) <> 'af85ed244762bdfc1ec8dd195d309fa2'
     AND position('payroll_moved_in_hv' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_billing_allocation(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_staff_billing_allocation changed on production since 20261103200000';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_own_share_allocation(date)'::regprocedure)) <> '148bc124481052c0dcea58daa72d590f'
     AND position('payroll_moved_in_hv' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_staff_own_share_allocation(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_staff_own_share_allocation changed on production since 20261103200000';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_payroll_moves_summary(date)'::regprocedure)) <> '1427a74a6bc4290446cfd5a3995acd90'
     AND position('payroll_moved_in_hv' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_payroll_moves_summary(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_payroll_moves_summary changed on production since 20261103200000';
  END IF;
END
$guard$;

-- ─── 3. HOUZS Venture's part of what moved into each cost-center receiver ───
CREATE OR REPLACE FUNCTION public.payroll_moved_in_hv(p_period_month DATE)
RETURNS TABLE(dept_id UUID, amt NUMERIC, allowance_amt NUMERIC, epf_amt NUMERIC, socso_amt NUMERIC, eis_amt NUMERIC)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    WITH moved_in AS (
        SELECT mv.to_department_id AS dept_id, SUM(mv.amount) AS amt, SUM(mv.allowance_amount) AS allowance_amt,
               SUM(mv.epf_amount) AS epf_amt, SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
          FROM public.payroll_moved_parts(p_period_month) mv
         WHERE mv.to_cost_model <> 'centralized'
         GROUP BY mv.to_department_id
    )
    SELECT mi.dept_id,
           ROUND(mi.amt * pa.split_pct, 2), ROUND(mi.allowance_amt * pa.split_pct, 2), ROUND(mi.epf_amt * pa.split_pct, 2),
           ROUND(mi.socso_amt * pa.split_pct, 2), ROUND(mi.eis_amt * pa.split_pct, 2)
      FROM moved_in mi
      JOIN hr_pool_allocation pa ON pa.department_id = mi.dept_id
                                AND pa.period_month = p_period_month
                                AND pa.company_id IS NULL
                                AND pa.split_pct > 0
     WHERE ROUND(mi.amt * pa.split_pct, 2) > 0;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_moved_in_hv(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_moved_in_hv(DATE) TO service_role;

-- ─── 4. The billing allocation: the receiver's HV row takes HV's part ──────
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
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_billing_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';
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
            ROUND(SUM(sr.gross_amt - sr.salary_comp), 2) AS allowance_amt,
            ROUND(SUM(sr.epf_er), 2) AS epf_amt,
            ROUND(SUM(sr.socso_er), 2) AS socso_amt,
            ROUND(SUM(sr.eis_er), 2) AS eis_amt
        FROM staff_rows sr
        GROUP BY sr.dept_id, sr.dept_name
    ),
    moved AS (
        SELECT * FROM public.payroll_moved_parts(p_period_month)
    ),
    -- What each department's people moved out, and its companies' total, a row a department.
    moved_out AS (
        SELECT mv.from_department_id AS dept_id, SUM(mv.amount) AS amt, SUM(mv.allowance_amount) AS allowance_amt,
               SUM(mv.epf_amount) AS epf_amt, SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM moved mv GROUP BY mv.from_department_id
    ),
    company_tot AS (
        SELECT ca.dept_id, SUM(ca.amt) AS amt, SUM(ca.allowance_amt) AS allowance_amt, SUM(ca.epf_amt) AS epf_amt,
               SUM(ca.socso_amt) AS socso_amt, SUM(ca.eis_amt) AS eis_amt
        FROM company_agg ca GROUP BY ca.dept_id
    ),
    -- HOUZS Venture's part of what moved into this department, a cost-center receiver (2026-11-04).
    moved_in_hv AS (
        SELECT * FROM public.payroll_moved_in_hv(p_period_month)
    ),
    hv_raw AS (
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(ct.amt, 0)           - COALESCE(mo.amt, 0) + COALESCE(mh.amt, 0) AS amt,
            dt.allowance_amt - COALESCE(ct.allowance_amt, 0) - COALESCE(mo.allowance_amt, 0) + COALESCE(mh.allowance_amt, 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(ct.epf_amt, 0)       - COALESCE(mo.epf_amt, 0) + COALESCE(mh.epf_amt, 0) AS epf_amt,
            dt.socso_amt     - COALESCE(ct.socso_amt, 0)     - COALESCE(mo.socso_amt, 0) + COALESCE(mh.socso_amt, 0) AS socso_amt,
            dt.eis_amt       - COALESCE(ct.eis_amt, 0)       - COALESCE(mo.eis_amt, 0) + COALESCE(mh.eis_amt, 0) AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_tot ct ON ct.dept_id = dt.dept_id
        LEFT JOIN moved_out mo   ON mo.dept_id = dt.dept_id
        LEFT JOIN moved_in_hv mh ON mh.dept_id = dt.dept_id
        WHERE (dt.amt - COALESCE(ct.amt, 0) - COALESCE(mo.amt, 0) + COALESCE(mh.amt, 0)) >= 0.05
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
    -- What moved into each cost-center receiver, then billed on by its Bill to %.
    moved_in AS (
        SELECT mv.to_department_id AS dept_id, mv.to_department_name AS dept_name, SUM(mv.amount) AS amt,
               SUM(mv.allowance_amount) AS allowance_amt, SUM(mv.epf_amount) AS epf_amt,
               SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM moved mv
        WHERE mv.to_cost_model <> 'centralized'
        GROUP BY mv.to_department_id, mv.to_department_name
    ),
    moved_billed AS (
        SELECT mi.dept_id, mi.dept_name, pa.company_id AS comp_id, c.name AS comp_name, c.short_code AS comp_code,
               0 AS n_staff,
               ROUND(mi.amt * pa.split_pct, 2)           AS amt,
               ROUND(mi.allowance_amt * pa.split_pct, 2) AS allowance_amt,
               ROUND(mi.epf_amt * pa.split_pct, 2)       AS epf_amt,
               ROUND(mi.socso_amt * pa.split_pct, 2)     AS socso_amt,
               ROUND(mi.eis_amt * pa.split_pct, 2)       AS eis_amt
        FROM moved_in mi
        JOIN hr_pool_allocation pa ON pa.department_id = mi.dept_id
                                  AND pa.period_month = p_period_month
                                  AND pa.split_pct > 0
        JOIN companies c ON c.id = pa.company_id
        WHERE ROUND(mi.amt * pa.split_pct, 2) > 0
    ),
    -- A department's own people's rows and what it bills on, merged by company (the user: "就一起吧").
    company_rows AS (
        SELECT u.dept_id, u.dept_name, u.comp_id, u.comp_name, u.comp_code,
               SUM(u.n_staff)::INT AS n_staff, SUM(u.amt) AS amt, SUM(u.allowance_amt) AS allowance_amt,
               SUM(u.epf_amt) AS epf_amt, SUM(u.socso_amt) AS socso_amt, SUM(u.eis_amt) AS eis_amt
        FROM (
            SELECT ca.dept_id, ca.dept_name, ca.comp_id, ca.comp_name, ca.comp_code, ca.n_staff, ca.amt,
                   ca.allowance_amt, ca.epf_amt, ca.socso_amt, ca.eis_amt
            FROM company_agg ca
            UNION ALL
            SELECT mb.dept_id, mb.dept_name, mb.comp_id, mb.comp_name, mb.comp_code, mb.n_staff, mb.amt,
                   mb.allowance_amt, mb.epf_amt, mb.socso_amt, mb.eis_amt
            FROM moved_billed mb
        ) u
        GROUP BY u.dept_id, u.dept_name, u.comp_id, u.comp_name, u.comp_code
    ),
    combined AS (
        SELECT cr.dept_id, cr.dept_name, cr.comp_id, cr.comp_name, cr.comp_code,
               cr.n_staff, cr.amt,
               cr.amt - cr.allowance_amt - cr.epf_amt - cr.socso_amt - cr.eis_amt AS salary_amt,
               cr.allowance_amt, cr.epf_amt, cr.socso_amt, cr.eis_amt
        FROM company_rows cr
        UNION ALL
        SELECT hv.dept_id, hv.dept_name, hv.comp_id, hv.comp_name, hv.comp_code,
               hv.n_staff, hv.amt, hv.salary_amt, hv.allowance_amt,
               hv.epf_amt, hv.socso_amt, hv.eis_amt
        FROM hv_agg hv
        WHERE EXISTS (SELECT 1 FROM company_rows cr2 WHERE cr2.dept_id = hv.dept_id)
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

-- ─── 5. The own share: the receiver's own-share invoice takes HV's part ────
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
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN RAISE EXCEPTION 'get_staff_own_share_allocation: needs Billing or HR Costing · View' USING ERRCODE = '42501';
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
    moved_out AS (
        SELECT mv.from_department_id AS dept_id, SUM(mv.amount) AS amt, SUM(mv.allowance_amount) AS allowance_amt,
               SUM(mv.epf_amount) AS epf_amt, SUM(mv.socso_amount) AS socso_amt, SUM(mv.eis_amount) AS eis_amt
        FROM public.payroll_moved_parts(p_period_month) mv
        GROUP BY mv.from_department_id
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
    -- HOUZS Venture's part of what moved into this department, a cost-center receiver (2026-11-04).
    moved_in_hv AS (
        SELECT * FROM public.payroll_moved_in_hv(p_period_month)
    ),
    hv_raw AS (
        SELECT
            dt.dept_id,
            dt.dept_name,
            dt.n_staff,
            dt.amt           - COALESCE(ca.amt, 0)           - COALESCE(mo.amt, 0) + COALESCE(mh.amt, 0) AS amt,
            dt.allowance_amt - COALESCE(ca.allowance_amt, 0) - COALESCE(mo.allowance_amt, 0) + COALESCE(mh.allowance_amt, 0) AS allowance_amt,
            dt.epf_amt       - COALESCE(ca.epf_amt, 0)       - COALESCE(mo.epf_amt, 0) + COALESCE(mh.epf_amt, 0) AS epf_amt,
            dt.socso_amt     - COALESCE(ca.socso_amt, 0)     - COALESCE(mo.socso_amt, 0) + COALESCE(mh.socso_amt, 0) AS socso_amt,
            dt.eis_amt       - COALESCE(ca.eis_amt, 0)       - COALESCE(mo.eis_amt, 0) + COALESCE(mh.eis_amt, 0) AS eis_amt
        FROM dept_tot dt
        LEFT JOIN company_agg ca ON ca.dept_id = dt.dept_id
        LEFT JOIN moved_out mo   ON mo.dept_id = dt.dept_id
        LEFT JOIN moved_in_hv mh ON mh.dept_id = dt.dept_id
        WHERE (dt.amt - COALESCE(ca.amt, 0) - COALESCE(mo.amt, 0) + COALESCE(mh.amt, 0)) >= 0.05
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

-- ─── 6. What stays: less HV's part, HV's part beside it ─────────────────────
DROP FUNCTION IF EXISTS public.get_payroll_moves_summary(DATE);
CREATE OR REPLACE FUNCTION public.get_payroll_moves_summary(p_period_month DATE)
RETURNS TABLE(department_id UUID, department_name TEXT, cost_model TEXT, moved_in NUMERIC, billed NUMERIC, stays NUMERIC, hv NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'hr_costing.view']) THEN
        RAISE EXCEPTION 'get_payroll_moves_summary: needs Billing or HR Costing · View' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH moved_in AS (
        SELECT mv.to_department_id AS dept_id, mv.to_department_name AS dept_name, mv.to_cost_model AS model,
               SUM(mv.amount) AS amt
          FROM public.payroll_moved_parts(p_period_month) mv
         GROUP BY mv.to_department_id, mv.to_department_name, mv.to_cost_model
    ),
    billed AS (
        SELECT mi.dept_id, SUM(ROUND(mi.amt * pa.split_pct, 2)) AS amt
          FROM moved_in mi
          JOIN hr_pool_allocation pa ON pa.department_id = mi.dept_id
                                    AND pa.period_month = p_period_month
                                    AND pa.split_pct > 0
                                    AND pa.company_id IS NOT NULL
         WHERE mi.model <> 'centralized'
         GROUP BY mi.dept_id
    ),
    hv AS (
        SELECT h.dept_id, h.amt FROM public.payroll_moved_in_hv(p_period_month) h
    )
    SELECT mi.dept_id, mi.dept_name, mi.model, mi.amt, COALESCE(b.amt, 0),
           mi.amt - COALESCE(b.amt, 0) - COALESCE(h.amt, 0), COALESCE(h.amt, 0)
      FROM moved_in mi
      LEFT JOIN billed b ON b.dept_id = mi.dept_id
      LEFT JOIN hv h ON h.dept_id = mi.dept_id
     ORDER BY mi.dept_name;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_payroll_moves_summary(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_moves_summary(DATE) TO authenticated, service_role;

COMMENT ON TABLE public.hr_pool_allocation IS
    'A receiving cost-center department''s Bill to % for a month (2026-11-03): what of the payroll moved into it (hr_staff_dept_moves) each company is billed, merged into its lines on the month''s payroll invoices; a row with no company (2026-11-04) is HOUZS Venture''s share, joining its own-share row. What none of them takes stays its own cost. Never for a centralized, internal or pool-less department (guard_pool_allocation).';
