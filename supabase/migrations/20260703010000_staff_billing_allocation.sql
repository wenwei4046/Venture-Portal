-- ============================================================================
-- 20260703010000_staff_billing_allocation.sql
-- Staff billing allocation: per-employee % attribution across subsidiaries,
-- generalized to ANY department (was Finance-dept-only in the retired
-- generate_monthly_invoices finance_attribution branch).
--
-- Flow (mirrors the Director Salary by_company pattern, mig 279):
--   1. HR maintains hr_staff_allocation rows (staff × company × %, per month)
--      via /hr-costing/allocation. Sum per staff ≤ 1.0 — the remainder is the
--      HV-absorbed share and is never billed.
--   2. get_staff_billing_allocation(p_period) aggregates
--      employer cost (gross + EPF/SOCSO/EIS ER, same basis as the
--      payroll_runs dept OPEX totals) × allocation_pct per department ×
--      company. Aggregate-only: NO staff names/salaries in the output, so
--      Finance may call it (matches the access matrix — Finance sees lump
--      sums, never individual salaries).
--   3. Billing page shows the per-company amounts; Create Invoice auto-fills
--      subsidiary rows from the same RPC.
--
-- Also: HR gains a DELETE policy on hr_staff_allocation (was blocked by
-- hr_staff_alloc_no_delete) so the editor can replace a staff's rows.
-- ============================================================================

BEGIN;

-- ── 1. RPC: per-dept per-company billed amounts for a period ────────────────

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
    'ROUND(SUM(employer cost × allocation_pct), 2). Employer cost = gross + '
    'EPF/SOCSO/EIS employer portions from hr_monthly_payroll — the same basis '
    'as payroll_runs dept OPEX totals, so the billed amounts reconcile against '
    'the Billing page cost cards. Aggregate-only (no PII); callable by '
    'principal / finance / hr.';

GRANT EXECUTE ON FUNCTION get_staff_billing_allocation(DATE) TO authenticated;

-- ── 2. HR can delete allocation rows (editor replaces a staff''s row set) ────

CREATE POLICY hr_staff_alloc_hr_delete ON hr_staff_allocation
    FOR DELETE USING (current_user_role() = 'hr');

-- ── 3. Table comment: no longer Finance-dept-specific ───────────────────────

COMMENT ON TABLE hr_staff_allocation IS
    'Per-employee per-month billing attribution % across subsidiaries (any '
    'department). Sum per staff+period ≤ 1.0; the remainder is HV-absorbed '
    'and never billed. Consumed by get_staff_billing_allocation().';

COMMIT;
