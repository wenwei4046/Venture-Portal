-- ============================================================================
-- 20261114090000_revenue_pay_preview_reads_typed_statutory.sql
-- Comm Cal's salary preview takes the statutory figures HR typed on HR › Payroll (2026-11-13).
-- ============================================================================
--
-- HR › Payroll lets HR type a statutory figure over the JADUAL lookup — EPF, SOCSO and EIS (employer and
-- employee) and the PCB — kept in hr_monthly_payroll.*_override_amount until Reset to JADUAL clears it;
-- `compute_hr_monthly_payroll` pays the typed figure (and reads PCB's taxable income off the EPF the row
-- pays). `revenue_pay_preview` — the salary calculation under a salesperson's ledger on Comm Cal — looked
-- every one of them up again and never read what was typed. The user, on a September row whose PCB HR typed
-- as RM 930.00: payroll deducted 930.00 while Comm Cal still showed the lookup's (333.85).
--
-- Now the preview reads the seven typed figures off the payroll row and takes each one over its lookup; the
-- PCB lookup, when PCB is not typed, reads the basic after the EPF the row pays — the trigger's own order.
-- A row with nothing typed previews exactly as before. What payroll pays does not change.
--
-- Production's body (md5 c11380d9…, 20261014203000 → 86b459f2…) is replaced whole from that text with three statements
-- changed; the guard refuses a body that changed since, and running this twice changes nothing. The app's
-- preview before a run (`revenue/_lib/pay-preview-before-run.ts` `payrollStatutory`) reads the same way.
-- PGlite: tests/revenue-payroll-sql/validate-pay-preview-typed.mjs (production's trigger and preview verbatim).

DO $guard$
DECLARE
  v_md5 text;
  v_src text;
BEGIN
  SELECT md5(p.prosrc), p.prosrc INTO v_md5, v_src FROM pg_proc p
   WHERE p.oid = 'public.revenue_pay_preview(uuid,date)'::regprocedure;
  IF v_md5 IS DISTINCT FROM 'c11380d952c6eef4af9153c1a22bd7eb' AND strpos(v_src, 'typed_pcb') = 0 THEN
    RAISE EXCEPTION 'revenue_pay_preview changed in production since this migration was written (md5 %)', v_md5;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.revenue_pay_preview(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(staff_id uuid, employee_name text, employee_code text, designation text, employment_type text, basic_salary numeric, statutory_allowance numeric, non_statutory_allowance numeric, ot_amount numeric, deduction_amount numeric, skbbk_amount numeric, unpaid_leave_days numeric, days_worked integer, days_in_month integer, epf_category text, socso_category text, pcb_category text, children_count integer, is_epf_exempt boolean, tax_mode text, withholding_rate numeric, statutory_wages numeric, epf_er numeric, epf_ee numeric, socso_er numeric, socso_ee numeric, eis_er numeric, eis_ee numeric, pcb numeric, commission_here numeric, commission_elsewhere numeric, payroll_exists boolean, payroll_status text, payroll_source text, payroll_commission numeric, payroll_adjustment numeric, payroll_gross numeric, payroll_net numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_end   DATE := (p_period + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_dim   INTEGER := EXTRACT(DAY FROM (p_period + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
BEGIN
    IF NOT public.has_any_action(ARRAY['revenue.view']) THEN RAISE EXCEPTION 'revenue_pay_preview: needs Revenue · View' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH run AS (
        SELECT r.id FROM comm_runs r
         WHERE r.sub_department_id = p_sub_department_id AND r.period_month = p_period
    ), mine AS (
        SELECT s.staff_id AS sid, SUM(s.total_commission) AS amount
          FROM comm_statements s JOIN run ON run.id = s.run_id
         GROUP BY s.staff_id
    ), theirs AS (
        SELECT s.staff_id AS sid, SUM(s.total_commission) AS amount
          FROM comm_statements s
          JOIN comm_runs r ON r.id = s.run_id
         WHERE r.period_month = p_period
           AND r.sub_department_id <> p_sub_department_id
           AND r.status IN ('applied', 'locked')
         GROUP BY s.staff_id
    ), people AS (
        SELECT m.sid, m.amount AS here, COALESCE(t.amount, 0) AS elsewhere
          FROM mine m LEFT JOIN theirs t ON t.sid = m.sid
    ), base AS (
        SELECT p.here, p.elsewhere, st.*,
               pr.id AS payroll_id, pr.status AS pr_status, pr.source AS pr_source,
               COALESCE(pr.unpaid_leave_days, 0) AS leave_days,
               COALESCE(pr.ot_amount, 0) AS pr_ot,
               COALESCE(pr.deduction_amount, 0) AS pr_deduction,
               COALESCE(pr.skbbk_amount, 0) AS pr_skbbk,
               pr.commission_amount AS pr_commission,
               COALESCE(pr.commission_adjustment_amount, 0) AS pr_adjustment,
               pr.gross AS pr_gross, pr.net AS pr_net,
               COALESCE(pr.basic_salary, st.basic_salary) AS pay_basic,
               COALESCE(pr.statutory_allowance, 0) AS pay_stat,
               COALESCE(pr.non_statutory_allowance, 0) AS pay_nonstat,
               pr.epf_er_override_amount AS typed_epf_er, pr.epf_ee_override_amount AS typed_epf_ee,
               pr.socso_er_override_amount AS typed_socso_er, pr.socso_ee_override_amount AS typed_socso_ee,
               pr.eis_er_override_amount AS typed_eis_er, pr.eis_ee_override_amount AS typed_eis_ee,
               pr.pcb_override_amount AS typed_pcb
          FROM people p
          JOIN hr_staff_costs st ON st.id = p.sid
          LEFT JOIN hr_monthly_payroll pr
                 ON pr.staff_id = p.sid AND pr.period_month = p_period
    ), windowed AS (
        SELECT b.*,
               GREATEST(
                   CASE WHEN GREATEST(COALESCE(b.hire_date, p_period), p_period) > LEAST(COALESCE(b.resignation_date, v_end), v_end)
                        THEN 0
                        ELSE LEAST(COALESCE(b.resignation_date, v_end), v_end)
                             - GREATEST(COALESCE(b.hire_date, p_period), p_period) + 1
                   END - b.leave_days, 0)::INTEGER AS worked
          FROM base b
    ), waged AS (
        SELECT w.*,
               GREATEST(w.pay_basic * w.worked::NUMERIC / NULLIF(v_dim, 0)
                      + w.pay_stat * w.worked::NUMERIC / NULLIF(v_dim, 0)
                      - w.pr_deduction, 0) AS stat_wage
          FROM windowed w
    )
    SELECT
        w.id, w.employee_name, w.employee_code, w.designation, w.employment_type::TEXT,
        w.pay_basic, w.pay_stat, w.pay_nonstat,
        w.pr_ot, w.pr_deduction, w.pr_skbbk, w.leave_days,
        w.worked, v_dim,
        w.epf_category::TEXT, w.socso_category::TEXT, w.pcb_category::TEXT,
        w.children_count, w.is_epf_exempt, w.tax_mode::TEXT, w.withholding_rate,
        ROUND(w.stat_wage, 2),
        COALESCE(w.typed_epf_er, e.employer, 0), COALESCE(w.typed_epf_ee, e.employee, 0),
        COALESCE(w.typed_socso_er, s.employer, 0), COALESCE(w.typed_socso_ee, s.employee, 0),
        COALESCE(w.typed_eis_er, i.employer, 0), COALESCE(w.typed_eis_ee, i.employee, 0),
        CASE WHEN w.tax_mode::TEXT = 'pcb'
             THEN COALESCE(w.typed_pcb, lookup_pcb(
                      GREATEST(ROUND(w.pay_basic * w.worked::NUMERIC / NULLIF(v_dim, 0), 2)
                               - COALESCE(w.typed_epf_ee, e.employee, 0), 0),
                      w.pcb_category, w.children_count, p_period), 0)
             ELSE 0 END,
        w.here, w.elsewhere,
        w.payroll_id IS NOT NULL, w.pr_status::TEXT, w.pr_source::TEXT,
        w.pr_commission, w.pr_adjustment, w.pr_gross, w.pr_net
      FROM waged w
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_epf(w.stat_wage, w.epf_category, p_period)
           WHERE w.stat_wage > 0 AND NOT w.is_epf_exempt
      ) e ON TRUE
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_socso(w.stat_wage, w.socso_category, p_period) WHERE w.stat_wage > 0
      ) s ON TRUE
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_eis(w.stat_wage, p_period) WHERE w.stat_wage > 0
      ) i ON TRUE
     ORDER BY w.here DESC, w.employee_name;
END;
$function$;
