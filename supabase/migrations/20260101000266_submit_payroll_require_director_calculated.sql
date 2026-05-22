-- ============================================================================
-- Migration 266: submit_payroll_to_principal — require Director Salary calculated
-- ============================================================================
-- The live RPC (mig 128 + 162) already folds SUM(director_payouts.gross_amount)
-- into payroll_runs.director_salary_total AND into approval_requests.amount.
-- But if no director_payouts exist for the period, that SUM silently yields 0
-- and the run goes to Principal under-stated, with no signal to HR.
--
-- This patch makes the gate explicit: if Director Salary has not been calculated
-- for the period, the RPC raises with an HR-friendly message. The Save & Calculate
-- step on /director-salary must run first.
--
-- Body otherwise identical to the prior live version (verified via pg_get_functiondef).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION submit_payroll_to_principal(p_period DATE, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    v_director_payout_count   INT;
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

    -- (mig 266) Director Salary must be calculated before submit, otherwise
    -- the approval amount would silently exclude director compensation.
    SELECT COUNT(*) INTO v_director_payout_count
    FROM director_payouts
    WHERE period_month = p_period;
    IF v_director_payout_count = 0 THEN
        RAISE EXCEPTION
            'submit_payroll_to_principal: Director Salary has not been calculated for %. Calculate it on /director-salary first.',
            p_period;
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
$function$;

COMMENT ON FUNCTION submit_payroll_to_principal IS
    'Mig 266: gates submission on director_payouts existence for the period — prevents silent 0 in director_salary_total when HR forgets to calculate Director Salary first. Body otherwise identical to mig 128 + 162.';

COMMIT;
