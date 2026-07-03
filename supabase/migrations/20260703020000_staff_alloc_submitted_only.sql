-- ============================================================================
-- 20260703020000_staff_alloc_submitted_only.sql
-- get_staff_billing_allocation: only count SUBMITTED payroll rows.
--
-- The first cut (20260703010000) joined hr_monthly_payroll with no status
-- filter, so Finance's Billing page showed allocation amounts computed off
-- DRAFT payroll figures — numbers HR could still be editing. That contradicts
-- the submission gate everywhere else ("Finance can't see this period's
-- figures until you click Submit to Finance").
--
-- Now: hmp.status IN ('submitted', 'paid') — the section + invoice auto-fill
-- appear only after HR submits the run; a reopen (rows → draft) hides them
-- again until re-submit. 'paid' covers legacy runs paid under the old
-- monolithic flow.
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
    amount DECIMAL
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
    SELECT
        hsc.department_id,
        d.name::TEXT,
        hsa.company_id,
        c.name::TEXT,
        c.short_code::TEXT,
        COUNT(DISTINCT hmp.staff_id)::INT AS staff_count,
        ROUND(SUM(
            (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er)
            * hsa.allocation_pct
        ), 2)::DECIMAL AS amount
    FROM hr_monthly_payroll hmp
    JOIN hr_staff_costs hsc      ON hsc.id = hmp.staff_id
    JOIN departments d           ON d.id = hsc.department_id
    JOIN hr_staff_allocation hsa ON hsa.staff_id = hmp.staff_id
                                AND hsa.period_month = hmp.period_month
    JOIN companies c             ON c.id = hsa.company_id
    WHERE hmp.period_month = p_period_month
      AND hmp.status IN ('submitted', 'paid')
      AND hsa.allocation_pct > 0
    GROUP BY hsc.department_id, d.name, hsa.company_id, c.name, c.short_code
    HAVING ROUND(SUM(
        (hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er)
        * hsa.allocation_pct
    ), 2) > 0
    ORDER BY d.name, c.short_code;
END;
$$;

COMMENT ON FUNCTION get_staff_billing_allocation(DATE) IS
    'Staff billing allocation per department × subsidiary for a period: '
    'ROUND(SUM(employer cost × allocation_pct), 2) over SUBMITTED payroll rows '
    'only (hmp.status IN submitted/paid) — Finance sees nothing until HR '
    'submits the run. Employer cost = gross + EPF/SOCSO/EIS ER, same basis as '
    'payroll_runs dept OPEX totals. Aggregate-only (no PII); callable by '
    'principal / finance / hr.';

COMMIT;
