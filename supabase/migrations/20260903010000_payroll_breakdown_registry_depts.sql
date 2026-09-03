-- 2026-09-03 (user "接上" — wire the IT department): the Stage-E funding
-- breakdown hardcoded the four staff depts (HR/Finance/Director Office/
-- Marketing), so a registry-provisioned dept's payroll (IT, segment
-- 'infotech', pool 1100) never appeared in the per-pool funding split.
-- Registry-driven now: every non-internal dept with a segment_key (except
-- 'director', whose payroll runs separately) joins in; pool_key is uniformly
-- 'dept_pool_' || segment_key (identical to the legacy keys for the cores).
-- Legacy four always listed (even at 0, as before); new depts appear once
-- they actually have payroll for the month.
-- NOTE: IT itself was provisioned live the same day via
-- provision_full_department('IT', 'infotech') -> segment 'infotech',
-- billing_mode 'infotech_attribution', pool equity account 1100.
CREATE OR REPLACE FUNCTION public.get_payroll_breakdown_by_pool(p_request_id uuid)
 RETURNS TABLE(pool_key text, dept_name text, required_amount numeric, pool_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period DATE;
    v_run_id UUID;
    v_amount DECIMAL(15, 2);
BEGIN
    SELECT COALESCE(pr.period_month, ppr.period_month), ppr.payroll_run_id, ppr.amount
      INTO v_period, v_run_id, v_amount
      FROM payroll_payment_requests ppr
      LEFT JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or has no period', p_request_id;
    END IF;

    IF v_run_id IS NULL THEN
        RETURN QUERY
        SELECT
            'dept_pool_director'::TEXT,
            'Director'::TEXT,
            v_amount,
            COALESCE((
                SELECT dpb.balance
                  FROM dept_pool_balances dpb
                  JOIN departments d ON d.id = dpb.department_id
                 WHERE d.name = 'Director'
            ), 0)::DECIMAL(15, 2);
        RETURN;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        SELECT
            d.segment_key AS seg,
            d.name        AS d_name,
            d.id          AS d_id,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.segment_key IS NOT NULL
           AND d.is_internal = false
           AND d.segment_key <> 'director'
         GROUP BY d.id, d.name, d.segment_key
    ),
    pool_balances AS (
        SELECT department_id, balance FROM dept_pool_balances
    )
    SELECT
        ('dept_pool_' || hpt.seg)::TEXT AS pool_key,
        hpt.d_name AS dept_name,
        hpt.total  AS required_amount,
        COALESCE((SELECT balance FROM pool_balances WHERE department_id = hpt.d_id), 0)::DECIMAL(15, 2) AS pool_balance
      FROM hr_payroll_totals hpt
     WHERE hpt.total > 0
        OR hpt.seg IN ('hr', 'finance', 'director_office', 'marketing')
     ORDER BY CASE hpt.seg
         WHEN 'hr'              THEN 1
         WHEN 'finance'         THEN 2
         WHEN 'director_office' THEN 3
         WHEN 'marketing'       THEN 4
         ELSE 5
     END, hpt.d_name;
END;
$function$;
