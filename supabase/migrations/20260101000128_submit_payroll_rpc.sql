-- ============================================================================
-- 20260101000128_submit_payroll_rpc.sql
-- Spec 2 (HR Payroll Redesign) — HR submits the monthly payroll package
-- HOUZS Venture Portal
--
-- RPC: submit_payroll_to_principal(p_period, p_user_id) RETURNS UUID
--   - Asserts all hr_monthly_payroll for the period are in 'draft'
--   - Computes 4 OPEX totals by department:
--       marketing_opex_total = sum(gross + EPF/SOCSO/EIS ER) for Marketing staff
--       hr_opex_total        = same for HR dept
--       finance_opex_total   = same for Finance dept
--       director_salary_total = sum(gross_amount) from director_payouts for period
--   - Creates payroll_runs row (status='submitted')
--   - Creates approval_requests row (type='payroll_run')
--   - Flips hr_monthly_payroll.status from 'draft' -> 'submitted'
--   - Returns the new payroll_runs.id
--
-- Period-lock check (assertPeriodOpen) lives in the Server Action layer —
-- this RPC assumes the caller already cleared that gate.
-- ============================================================================

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
    v_run_id         UUID;
    v_approval_id    UUID;
    v_non_draft_cnt  INTEGER;
    v_row_cnt        INTEGER;

    v_marketing_total DECIMAL(15, 2);
    v_hr_total        DECIMAL(15, 2);
    v_finance_total   DECIMAL(15, 2);
    v_director_total  DECIMAL(15, 2);

    v_marketing_dept  UUID;
    v_hr_dept         UUID;
    v_finance_dept    UUID;

    v_submitter_role  user_role;
BEGIN
    -- Must be HR or Principal
    SELECT role INTO v_submitter_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_submitter_role IS NULL THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: unknown or inactive user %', p_user_id;
    END IF;
    IF v_submitter_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: role % cannot submit payroll', v_submitter_role;
    END IF;

    -- Require at least one row for the period
    SELECT COUNT(*) INTO v_row_cnt
    FROM hr_monthly_payroll
    WHERE period_month = p_period;

    IF v_row_cnt = 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: no hr_monthly_payroll rows for period %', p_period;
    END IF;

    -- All rows must still be draft (nothing submitted / paid yet)
    SELECT COUNT(*) INTO v_non_draft_cnt
    FROM hr_monthly_payroll
    WHERE period_month = p_period AND status <> 'draft';

    IF v_non_draft_cnt > 0 THEN
        RAISE EXCEPTION
            'submit_payroll_to_principal: % rows already submitted/paid for period %',
            v_non_draft_cnt, p_period;
    END IF;

    -- No live (non-rejected) run may exist already
    IF EXISTS (
        SELECT 1 FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected'
    ) THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: a live run already exists for %', p_period;
    END IF;

    -- Look up dept ids by name (seeded in migration 000015 / 000100)
    SELECT id INTO v_marketing_dept FROM departments WHERE name = 'Marketing';
    SELECT id INTO v_hr_dept        FROM departments WHERE name = 'HR';
    SELECT id INTO v_finance_dept   FROM departments WHERE name = 'Finance';

    -- Per-dept OPEX = sum(gross + EPF ER + SOCSO ER + EIS ER).
    -- That's HV's full cash outflow per employee (net to employee + EE contributions
    -- paid on their behalf = gross; plus HV's employer contributions on top).
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

    -- Director salary total from director_payouts for this period
    SELECT COALESCE(SUM(gross_amount), 0)
    INTO v_director_total
    FROM director_payouts
    WHERE period_month = p_period;

    -- Create the run
    INSERT INTO payroll_runs (
        period_month,
        marketing_opex_total,
        hr_opex_total,
        finance_opex_total,
        director_salary_total,
        status,
        submitted_by,
        submitted_at
    ) VALUES (
        p_period,
        v_marketing_total,
        v_hr_total,
        v_finance_total,
        v_director_total,
        'submitted',
        p_user_id,
        NOW()
    )
    RETURNING id INTO v_run_id;

    -- Create approval_requests row so the Principal inbox sees it
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
        v_marketing_total + v_hr_total + v_finance_total + v_director_total,
        'pending',
        'submitted'
    )
    RETURNING id INTO v_approval_id;

    -- Link approval back onto the run
    UPDATE payroll_runs SET approval_id = v_approval_id WHERE id = v_run_id;

    -- Flip all monthly payroll rows to 'submitted' (HR RLS locks them to read-only)
    UPDATE hr_monthly_payroll
    SET status = 'submitted'
    WHERE period_month = p_period AND status = 'draft';

    RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION submit_payroll_to_principal IS
    'Spec 2: atomically creates payroll_runs + approval_requests, computes 4 OPEX totals, flips hr_monthly_payroll rows to submitted. Returns run id.';

GRANT EXECUTE ON FUNCTION submit_payroll_to_principal TO authenticated;
