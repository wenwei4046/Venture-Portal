-- 2026-09-04 double-accrual postmortem (user approved fixes 1+3):
-- (1) postPayrollAccrualJVs' idempotency check read journal_entries with the
--     CALLER's client — journal_entries SELECT RLS requires treasury scope, so
--     an HR-initiated submit saw ZERO existing accruals and re-posted all five
--     segments (JE-202608-0585..0589 duplicating 0580..0584). Fix: expose the
--     existing-accrual totals through a SECURITY DEFINER RPC so the check is
--     role-blind.
-- (2) submit_payroll_to_principal hardcoded the four legacy departments, so
--     IT's employer cost (Aug: 4,841.53) never reached payroll_runs.total_amount
--     nor the auto-filed funding request (104,928.68 vs true 109,770.21).
--     Fix: it_opex_total column + regenerated total_amount + IT-aware RPC.

-- ── (1) RLS-proof accrual lookup ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payroll_accrual_totals(p_period date)
RETURNS TABLE(segment text, total_amount numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := current_user_role();
    -- hr included: the accrual hook runs under the submitting HR user.
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'get_payroll_accrual_totals: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT je.segment::text, je.total_amount
      FROM journal_entries je
     WHERE je.reference_type = 'payroll_accrual'
       AND je.period_month = date_trunc('month', p_period)::date
       AND je.is_reversed = false;
END $function$;

-- ── (2) payroll_runs learns IT ───────────────────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN it_opex_total numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs DROP COLUMN total_amount;
ALTER TABLE payroll_runs ADD COLUMN total_amount numeric GENERATED ALWAYS AS (
    marketing_opex_total + hr_opex_total + finance_opex_total
    + director_salary_total + director_office_total + it_opex_total
) STORED;

CREATE OR REPLACE FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_submitter_role          user_role;
    v_marketing_dept          UUID;
    v_hr_dept                 UUID;
    v_finance_dept            UUID;
    v_director_office_dept    UUID;
    v_it_dept                 UUID;
    v_marketing_total         DECIMAL(15, 2);
    v_hr_total                DECIMAL(15, 2);
    v_finance_total           DECIMAL(15, 2);
    v_director_office_total   DECIMAL(15, 2);
    v_it_total                DECIMAL(15, 2);
    v_row_count               INT;
    v_submitted_or_paid_count INT;
    v_run_id                  UUID;
    v_total                   DECIMAL(15, 2);
BEGIN
    SELECT role INTO v_submitter_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_submitter_role IS NULL THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: unknown or inactive user %', p_user_id;
    END IF;
    IF v_submitter_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: role % cannot submit payroll', v_submitter_role;
    END IF;

    SELECT COUNT(*) INTO v_row_count
    FROM hr_monthly_payroll WHERE period_month = p_period;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: no hr_monthly_payroll rows for period %', p_period;
    END IF;

    SELECT COUNT(*) INTO v_submitted_or_paid_count
    FROM hr_monthly_payroll WHERE period_month = p_period AND status IN ('submitted', 'paid');
    IF v_submitted_or_paid_count > 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: % rows already submitted/paid for period %',
            v_submitted_or_paid_count, p_period;
    END IF;

    IF EXISTS (SELECT 1 FROM payroll_runs WHERE period_month = p_period AND status <> 'rejected') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: a live run already exists for %', p_period;
    END IF;

    SELECT id INTO v_marketing_dept       FROM departments WHERE name = 'Marketing';
    SELECT id INTO v_hr_dept              FROM departments WHERE name = 'HR';
    SELECT id INTO v_finance_dept         FROM departments WHERE name = 'Finance';
    SELECT id INTO v_director_office_dept FROM departments WHERE name = 'Director Office';
    -- IT wired 2026-09-04: its employer cost was silently missing from the run
    -- total AND the auto-filed funding request (Aug: 4,841.53 short).
    SELECT id INTO v_it_dept              FROM departments WHERE name = 'IT';

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_marketing_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period AND hsc.department_id = v_marketing_dept;
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_hr_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period AND hsc.department_id = v_hr_dept;
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_finance_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period AND hsc.department_id = v_finance_dept;
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_director_office_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period AND hsc.department_id = v_director_office_dept;
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_it_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period AND hsc.department_id = v_it_dept;

    INSERT INTO payroll_runs (
        period_month, marketing_opex_total, hr_opex_total, finance_opex_total,
        director_office_total, it_opex_total, director_salary_total, status,
        submitted_by, submitted_at, approved_at
    ) VALUES (
        p_period, v_marketing_total, v_hr_total, v_finance_total,
        v_director_office_total, v_it_total, 0, 'approved', p_user_id, NOW(), NOW()
    )
    RETURNING id, total_amount INTO v_run_id, v_total;

    UPDATE hr_monthly_payroll SET status = 'submitted' WHERE period_month = p_period;

    -- Auto-file the funding request. Skip when total is 0 (nothing to fund; the
    -- amount > 0 CHECK would otherwise roll back the whole submit).
    IF v_total > 0 THEN
        INSERT INTO payroll_payment_requests (
            payroll_run_id, requested_by, amount, target_pool, status
        ) VALUES (
            v_run_id, p_user_id, v_total, 'dept_pool_hr', 'submitted'
        );
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (p_user_id, 'payroll_run', v_run_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object('period', p_period,
            'staff_total', v_marketing_total + v_hr_total + v_finance_total + v_director_office_total + v_it_total,
            'semantics', 'no Principal approval; funding request auto-filed when total>0 (mig 20260626120000); IT included since 20260904020000'));

    RETURN v_run_id;
END;
$function$;
