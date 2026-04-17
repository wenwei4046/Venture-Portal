-- ============================================================================
-- 20260101000126_hr_monthly_payroll_backfill.sql
-- Spec 1 (HR Payroll Redesign) — seed the current period's payroll rows
-- HOUZS Venture Portal
--
-- For every active staff, insert a draft row in hr_monthly_payroll for the
-- current period (date_trunc('month', NOW())). basic_salary and
-- non_statutory_allowance are copied from the master record so HR lands on
-- a grid with sensible defaults. statutory_allowance / OT / commission start
-- at 0 — HR fills them in. The compute trigger then populates pro-rata +
-- statutory + gross + net automatically.
--
-- Idempotent via the (staff_id, period_month) UNIQUE constraint: re-running
-- the migration skips existing rows.
-- ============================================================================

INSERT INTO hr_monthly_payroll (
    staff_id,
    period_month,
    basic_salary,
    non_statutory_allowance,
    source,
    status
)
SELECT
    hsc.id,
    date_trunc('month', NOW())::DATE,
    hsc.basic_salary,
    hsc.allowances,  -- legacy hr_staff_costs.allowances = monthly non-statutory allowance
    'carried_forward',
    'draft'
FROM hr_staff_costs hsc
WHERE hsc.status = 'active'
ON CONFLICT ON CONSTRAINT uq_monthly_payroll_staff_period DO NOTHING;

-- Quick sanity check in the migration output
DO $$
DECLARE
    v_count INTEGER;
    v_period DATE := date_trunc('month', NOW())::DATE;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM hr_monthly_payroll
    WHERE period_month = v_period;

    RAISE NOTICE 'hr_monthly_payroll backfill: % rows for period %', v_count, v_period;
END $$;
