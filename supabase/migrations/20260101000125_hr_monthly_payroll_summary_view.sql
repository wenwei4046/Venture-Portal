-- ============================================================================
-- 20260101000125_hr_monthly_payroll_summary_view.sql
-- Spec 1 (HR Payroll Redesign) — aggregate view for Finance dashboards
-- HOUZS Venture Portal
--
-- Goal: give Finance a per-dept × month rollup of HR cost without exposing
-- individual rows (except for the own-dept widening per Q2). Principal + HR
-- can also read this for convenience.
--
-- Implementation: SECURITY INVOKER view. Access = whatever RLS grants on
-- hr_monthly_payroll + hr_staff_costs. After Q2 migrations:
--   - Principal / HR see every row → aggregates all departments
--   - Finance sees own-dept individuals → aggregates own-dept only
--   - For company-wide payroll totals Finance needs in Spec 2's approval
--     flow, a dedicated RPC will bypass RLS (similar to get_hr_cost_summary).
-- ============================================================================

CREATE OR REPLACE VIEW hr_monthly_payroll_summary AS
SELECT
    hmp.period_month,
    hsc.department_id,
    d.name                        AS department_name,
    COUNT(*)                      AS staff_count,
    SUM(hmp.gross)                AS dept_gross,
    SUM(hmp.epf_er)               AS dept_epf_er,
    SUM(hmp.socso_er)             AS dept_socso_er,
    SUM(hmp.eis_er)               AS dept_eis_er,
    SUM(hmp.epf_er + hmp.socso_er + hmp.eis_er) AS dept_stat_er,
    SUM(hmp.net)                  AS dept_net,
    SUM(hmp.epf_ee + hmp.socso_ee + hmp.eis_ee + hmp.pcb) AS dept_ee_deductions
FROM hr_monthly_payroll hmp
JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
JOIN departments d      ON d.id = hsc.department_id
GROUP BY hmp.period_month, hsc.department_id, d.name;

COMMENT ON VIEW hr_monthly_payroll_summary IS
    'Spec 1: per-dept × period aggregate of hr_monthly_payroll. SECURITY INVOKER — respects the caller''s RLS on hr_monthly_payroll + hr_staff_costs.';

GRANT SELECT ON hr_monthly_payroll_summary TO authenticated;
