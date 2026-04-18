-- ============================================================================
-- 20260101000162_payroll_runs_director_office.sql
-- Add director_office_total to payroll_runs + include it in total_amount,
-- and update submit_payroll_to_principal so Finance sees the Director Office
-- OPEX on the Billing page (was silently missing from the totals).
-- HOUZS Venture Portal
--
-- Why: BillingView shows Marketing OPEX from payroll_runs.marketing_opex_total
-- but has no source for HR / Finance / Director Office OPEX until invoices
-- exist — and invoices can't be created until Finance knows the amount.
-- This migration closes the loop for Director Office (the one OPEX dept that
-- wasn't already being summed) and makes the per-dept totals available for
-- the new cost-card display.
--
-- Safe to drop/recreate total_amount because all payroll_runs rows were
-- wiped in the 2026-04-19 test-data purge.
-- ============================================================================

ALTER TABLE payroll_runs
    ADD COLUMN IF NOT EXISTS director_office_total DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_runs DROP COLUMN total_amount;

ALTER TABLE payroll_runs
    ADD COLUMN total_amount DECIMAL(15, 2) GENERATED ALWAYS AS (
        marketing_opex_total
        + hr_opex_total
        + finance_opex_total
        + director_salary_total
        + director_office_total
    ) STORED;

-- ── Rewrite submit_payroll_to_principal to also sum Director Office staff ──

CREATE OR REPLACE FUNCTION submit_payroll_to_principal(
    p_period DATE,
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submitter_role          user_role;
    v_marketing_dept          UUID;
    v_hr_dept                 UUID;
    v_finance_dept            UUID;
    v_director_office_dept    UUID;
    v_marketing_total         DECIMAL(15, 2);
    v_hr_total                DECIMAL(15, 2);
    v_finance_total           DECIMAL(15, 2);
    v_director_office_total   DECIMAL(15, 2);
    v_director_total          DECIMAL(15, 2);
    v_row_count               INT;
    v_submitted_or_paid_count INT;
    v_run_id                  UUID;
    v_approval_id             UUID;
BEGIN
    SELECT role INTO v_submitter_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_submitter_role IS NULL THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: unknown or inactive user %', p_user_id;
    END IF;
    IF v_submitter_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: role % cannot submit payroll', v_submitter_role;
    END IF;

    SELECT COUNT(*) INTO v_row_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: no hr_monthly_payroll rows for period %', p_period;
    END IF;

    SELECT COUNT(*) INTO v_submitted_or_paid_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period AND status IN ('submitted', 'paid');
    IF v_submitted_or_paid_count > 0 THEN
        RAISE EXCEPTION
            'submit_payroll_to_principal: % rows already submitted/paid for period %',
            v_submitted_or_paid_count, p_period;
    END IF;

    IF EXISTS (
        SELECT 1 FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected'
    ) THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: a live run already exists for %', p_period;
    END IF;

    SELECT id INTO v_marketing_dept       FROM departments WHERE name = 'Marketing';
    SELECT id INTO v_hr_dept              FROM departments WHERE name = 'HR';
    SELECT id INTO v_finance_dept         FROM departments WHERE name = 'Finance';
    SELECT id INTO v_director_office_dept FROM departments WHERE name = 'Director Office';

    -- Per-dept OPEX = sum(gross + EPF ER + SOCSO ER + EIS ER) for staff in the dept.
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_marketing_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_marketing_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_hr_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_hr_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_finance_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_finance_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_director_office_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_director_office_dept;

    SELECT COALESCE(SUM(gross_amount), 0)
      INTO v_director_total
      FROM director_payouts
     WHERE period_month = p_period;

    INSERT INTO payroll_runs (
        period_month,
        marketing_opex_total,
        hr_opex_total,
        finance_opex_total,
        director_office_total,
        director_salary_total,
        status,
        submitted_by,
        submitted_at
    ) VALUES (
        p_period,
        v_marketing_total,
        v_hr_total,
        v_finance_total,
        v_director_office_total,
        v_director_total,
        'submitted',
        p_user_id,
        NOW()
    )
    RETURNING id INTO v_run_id;

    INSERT INTO approval_requests (
        request_type,
        reference_id,
        reference_table,
        submitted_by,
        description,
        amount,
        status,
        workflow_state
    ) VALUES (
        'payroll_run',
        v_run_id,
        'payroll_runs',
        p_user_id,
        'Payroll Run — ' || TO_CHAR(p_period, 'Mon YYYY'),
        v_marketing_total + v_hr_total + v_finance_total + v_director_office_total + v_director_total,
        'pending',
        'submitted'
    )
    RETURNING id INTO v_approval_id;

    UPDATE payroll_runs SET approval_id = v_approval_id WHERE id = v_run_id;

    UPDATE hr_monthly_payroll
       SET status = 'submitted'
     WHERE period_month = p_period;

    RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION submit_payroll_to_principal(DATE, UUID) IS
    'Captures 5 per-dept totals (Marketing / HR / Finance / Director Office / Director) into payroll_runs. Director Office was missing before this migration — now surfaces in BillingView cost cards and the total_amount generated column.';
