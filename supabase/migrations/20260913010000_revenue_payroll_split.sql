-- Revenue payroll: basic and both EPF contributions are funded from the gross
-- commission computed upstream. Imported payroll follows the existing trigger
-- and verbatim import override path unchanged. No historical rows are rewritten.
ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN commission_balance numeric(15,2);
COMMENT ON COLUMN public.hr_monthly_payroll.commission_balance IS
    'Commission-source only: gross commission minus prorated basic, EPF ER and EPF EE. Basic is paid in full. Negative draft balances remain visible and prevent submission.';
CREATE OR REPLACE FUNCTION public.compute_hr_monthly_payroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_staff            hr_staff_costs%ROWTYPE;
    v_period_start     DATE;
    v_period_end       DATE;
    v_days_in_month    INTEGER;
    v_effective_start  DATE;
    v_effective_end    DATE;
    v_days_worked      INTEGER;
    v_prorata_ratio    NUMERIC(10, 6);

    v_prorated_basic   NUMERIC(15, 4);
    v_prorated_stat    NUMERIC(15, 4);
    v_prorated_ot      NUMERIC(15, 4);
    v_statutory_wages  NUMERIC(15, 4);
    v_gross            NUMERIC(15, 4);
    v_taxable_income   NUMERIC(15, 4);
BEGIN
    IF TG_OP = 'INSERT' AND NEW.source = 'commission' THEN
        -- BEFORE INSERT runs before a conflicting payroll tuple is locked.
        -- This also serializes HR's newly-created zero-commission placeholders
        -- with a finance submission, not just inserts made by Revenue sync.
        PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || NEW.period_month::text));
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'New Revenue payroll must start as a draft';
        END IF;
        IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = NEW.period_month AND is_locked) THEN
            RAISE EXCEPTION 'Revenue payroll accounting period % is locked', NEW.period_month;
        END IF;
        IF EXISTS (SELECT 1 FROM payroll_runs WHERE period_month = NEW.period_month
                   AND status IN ('submitted', 'approved', 'paid'))
           OR EXISTS (SELECT 1 FROM hr_monthly_payroll WHERE period_month = NEW.period_month
                      AND status IN ('submitted', 'paid')) THEN
            RAISE EXCEPTION 'Payroll for % has already been submitted. Reopen payroll before adding Revenue payroll.', NEW.period_month;
        END IF;
    END IF;

    -- Load master record
    SELECT * INTO v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'hr_monthly_payroll: staff_id % not found in hr_staff_costs', NEW.staff_id;
    END IF;

    -- Period window
    v_period_start := NEW.period_month;
    v_period_end   := (NEW.period_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month := EXTRACT(DAY FROM v_period_end)::INTEGER;

    -- Effective employment window within the period
    -- NULL hire_date = "employed before period starts" (full month)
    v_effective_start := GREATEST(COALESCE(v_staff.hire_date, v_period_start), v_period_start);
    v_effective_end   := LEAST(COALESCE(v_staff.resignation_date, v_period_end), v_period_end);

    IF v_effective_start > v_effective_end THEN
        -- Employee was not employed at all during this period (hired after, or resigned before)
        v_days_worked := 0;
    ELSE
        v_days_worked := (v_effective_end - v_effective_start + 1);
    END IF;

    -- Unpaid leave reduces worked days (floor at 0)
    v_days_worked := GREATEST(v_days_worked - COALESCE(NEW.unpaid_leave_days, 0)::INTEGER, 0);

    IF v_days_in_month = 0 THEN
        v_prorata_ratio := 0;
    ELSE
        v_prorata_ratio := v_days_worked::NUMERIC / v_days_in_month::NUMERIC;
    END IF;

    NEW.prorata_days_worked   := v_days_worked;
    NEW.prorata_days_in_month := v_days_in_month;

    -- Pro-rata applies to: basic, statutory_allowance, ot_amount
    -- Does NOT apply to: commission_amount, non_statutory_allowance
    v_prorated_basic := NEW.basic_salary * v_prorata_ratio;
    v_prorated_stat  := NEW.statutory_allowance * v_prorata_ratio;
    v_prorated_ot    := NEW.ot_amount * v_prorata_ratio;

    -- Statutory wages base = prorated basic + prorated statutory allowance,
    -- less the RM deduction (a No-Pay deduction in RM), floored at 0 so the
    -- JADUAL lookups never see a negative wage. (SKBBK does NOT reduce this —
    -- it is a net-only deduction.)
    --
    -- Full-commission staff with no basic or statutory allowance keep a zero
    -- statutory base. A selected basic uses the same established schedules.
    v_statutory_wages := GREATEST(
        v_prorated_basic + v_prorated_stat - COALESCE(NEW.deduction_amount, 0),
        0
    );

    -- Zero statutory wages → zero contributions. Guard needed because the
    -- lookup_socso/lookup_eis fallback returns CEILING values when no bracket
    -- matches, and 0 sits below the schedules' first bracket.
    IF v_statutory_wages <= 0 THEN
        NEW.epf_er := 0; NEW.epf_ee := 0;
        NEW.socso_er := 0; NEW.socso_ee := 0;
        NEW.eis_er := 0; NEW.eis_ee := 0;
    ELSE
        -- EPF
        IF v_staff.is_epf_exempt THEN
            NEW.epf_er := 0;
            NEW.epf_ee := 0;
        ELSE
            SELECT employer, employee INTO NEW.epf_er, NEW.epf_ee
            FROM lookup_epf(v_statutory_wages, v_staff.epf_category);
            NEW.epf_er := COALESCE(NEW.epf_er, 0);
            NEW.epf_ee := COALESCE(NEW.epf_ee, 0);
        END IF;

        -- SOCSO (category-aware)
        SELECT employer, employee INTO NEW.socso_er, NEW.socso_ee
        FROM lookup_socso(v_statutory_wages, v_staff.socso_category);
        NEW.socso_er := COALESCE(NEW.socso_er, 0);
        NEW.socso_ee := COALESCE(NEW.socso_ee, 0);

        -- EIS (uniform)
        SELECT employer, employee INTO NEW.eis_er, NEW.eis_ee
        FROM lookup_eis(v_statutory_wages);
        NEW.eis_er := COALESCE(NEW.eis_er, 0);
        NEW.eis_ee := COALESCE(NEW.eis_ee, 0);
    END IF;

    -- A commission-funded basic is a split of the upstream commission, never
    -- an additional earning. Employer EPF is also funded from that commission.
    -- Employee EPF stays in the normal net deduction, exactly once.
    IF NEW.source = 'commission' THEN
        NEW.commission_balance := ROUND(NEW.commission_amount
            - ROUND(NEW.basic_salary * v_prorata_ratio, 2) - NEW.epf_er - NEW.epf_ee, 2);
        v_gross := NEW.commission_amount - NEW.epf_er
                 + v_prorated_stat + v_prorated_ot + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    ELSE
        NEW.commission_balance := NULL;
        v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
                 + NEW.commission_amount + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    END IF;

    -- PCB uses taxable income (gross minus EPF EE, per LHDN rule) — SKBBK is
    -- not tax-deductible, so it does not enter this either.
    v_taxable_income := v_gross - NEW.epf_ee;

    -- Tax: exactly one of PCB / Withholding applies.
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(
            GREATEST(v_gross, 0) * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        NEW.pcb := COALESCE(
            lookup_pcb(v_taxable_income, v_staff.pcb_category, v_staff.children_count),
            0
        );
        NEW.withholding_tax := 0;
    END IF;

    NEW.gross := ROUND(v_gross, 2);
    NEW.net   := ROUND(
        v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb
                - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0), 2);

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.compute_hr_monthly_payroll IS
    'Computes existing pro-rata/statutory/tax payroll. For commission-source rows, basic and employer EPF are funded from upstream gross commission; employee EPF is deducted once through net.';

DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_compute ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_compute
    BEFORE INSERT OR UPDATE OF
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        deduction_amount, skbbk_amount, period_month, staff_id, source
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.compute_hr_monthly_payroll();

-- Statutory overrides deliberately do not run the lookup trigger. Keep those
-- explicit rates, while recomputing the commission split and dependent totals.
-- This runs after the compute trigger when an UPDATE names both input types.
CREATE OR REPLACE FUNCTION public.recompute_revenue_payroll_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_staff hr_staff_costs%ROWTYPE;
    v_ratio numeric(10,6);
    v_stat numeric(15,4);
    v_ot numeric(15,4);
    v_gross numeric(15,4);
BEGIN
    IF NEW.source <> 'commission' THEN RETURN NEW; END IF;

    SELECT * INTO STRICT v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    v_ratio := CASE WHEN NEW.prorata_days_in_month > 0
        THEN NEW.prorata_days_worked::numeric / NEW.prorata_days_in_month
        ELSE 0 END;
    v_stat := NEW.statutory_allowance * v_ratio;
    v_ot := NEW.ot_amount * v_ratio;
    NEW.commission_balance := ROUND(NEW.commission_amount
        - ROUND(NEW.basic_salary * v_ratio, 2) - NEW.epf_er - NEW.epf_ee, 2);
    v_gross := NEW.commission_amount - NEW.epf_er + v_stat + v_ot
        + NEW.non_statutory_allowance - COALESCE(NEW.deduction_amount, 0);
    NEW.gross := ROUND(v_gross, 2);

    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(GREATEST(v_gross, 0)
            * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        -- Preserve an explicit PCB override; otherwise refresh its lookup when
        -- the taxable base changes because EPF was overridden.
        IF NEW.pcb IS NOT DISTINCT FROM OLD.pcb
           AND (NEW.gross IS DISTINCT FROM OLD.gross OR NEW.epf_ee IS DISTINCT FROM OLD.epf_ee) THEN
            NEW.pcb := COALESCE(lookup_pcb(v_gross - NEW.epf_ee,
                v_staff.pcb_category, v_staff.children_count), 0);
        END IF;
        NEW.withholding_tax := 0;
    END IF;

    NEW.net := ROUND(v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee
        - NEW.pcb - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0), 2);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_hr_monthly_payroll_revenue_totals
    BEFORE UPDATE OF epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee,
        pcb, withholding_tax, gross, net, commission_balance,
        prorata_days_worked, prorata_days_in_month
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.recompute_revenue_payroll_totals();

-- The old funding total listed only imported departments. Include Revenue's
-- employer cost in the same run and funding request, without an extra submit.
ALTER TABLE public.payroll_runs
    ADD COLUMN revenue_opex_total numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_runs DROP COLUMN total_amount;
ALTER TABLE public.payroll_runs ADD COLUMN total_amount numeric GENERATED ALWAYS AS (
    marketing_opex_total + hr_opex_total + finance_opex_total
    + director_salary_total + director_office_total + it_opex_total + revenue_opex_total
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
    v_revenue_total           DECIMAL(15, 2);
    v_problem                TEXT;
    v_row_count               INT;
    v_submitted_or_paid_count INT;
    v_run_id                  UUID;
    v_total                   DECIMAL(15, 2);
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
       OR current_user_role() IS NULL OR current_user_role() NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: only the authenticated HR or Principal may submit payroll'
            USING ERRCODE = '42501';
    END IF;
    -- Serialize the captured totals with commission save/apply/reopen.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::text));

    IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = p_period AND is_locked) THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: accounting period % is locked', p_period;
    END IF;

    -- Keep HR's basic/statutory edits from changing rows between validation,
    -- aggregation and the submitted status update.
    PERFORM id FROM hr_monthly_payroll WHERE period_month = p_period FOR UPDATE;

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

    -- A warning, draft or reopened calculation is not a payroll settlement.
    SELECT sd.name INTO v_problem
      FROM comm_runs r JOIN comm_sub_departments sd ON sd.id = r.sub_department_id
     WHERE r.period_month = p_period AND r.status NOT IN ('applied', 'locked')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue commission for % in % is not synced. Resolve warnings and recalculate before submitting payroll.', v_problem, p_period;
    END IF;

    -- Catch an unsynced zero placeholder, a missing row, or a stale/manual
    -- commission figure. Check both sides so a deleted employee cannot vanish
    -- from the funding request while their commission remains applied.
    WITH expected AS (
        SELECT s.staff_id, SUM(s.total_commission) AS total_commission
          FROM comm_statements s JOIN comm_runs r ON r.id = s.run_id
         WHERE r.period_month = p_period AND r.status IN ('applied', 'locked')
         GROUP BY s.staff_id
    ), actual AS (
        SELECT h.* FROM hr_monthly_payroll h
          JOIN hr_staff_costs staff ON staff.id = h.staff_id
          JOIN departments d ON d.id = staff.department_id
         WHERE h.period_month = p_period
           AND (h.source = 'commission'
                OR (d.payroll_source = 'commission' AND h.source <> 'imported'))
    )
    SELECT COALESCE(a.staff_id, e.staff_id)::text INTO v_problem
      FROM actual a FULL JOIN expected e ON e.staff_id = a.staff_id
     WHERE a.staff_id IS NULL OR e.staff_id IS NULL
        OR a.source <> 'commission' OR a.commission_balance IS NULL
        OR a.commission_amount IS DISTINCT FROM e.total_commission
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue payroll for staff % in % does not match the synced commission calculation. Recalculate commission before submitting.', v_problem, p_period;
    END IF;

    SELECT staff.employee_name INTO v_problem
      FROM hr_monthly_payroll h JOIN hr_staff_costs staff ON staff.id = h.staff_id
     WHERE h.period_month = p_period AND h.source = 'commission'
       AND h.commission_balance < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue commission for % cannot fund the selected basic and EPF. Resolve the negative commission balance before submitting.', v_problem;
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

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_revenue_total FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
      JOIN departments d ON d.id = hsc.department_id
     WHERE hmp.period_month = p_period
       AND (d.payroll_source = 'commission' OR hmp.source = 'commission')
       -- If an employee moves to a legacy department, that department's total
       -- already carries their cost. Keep the combined funding total unique.
       AND hsc.department_id IS DISTINCT FROM v_marketing_dept
       AND hsc.department_id IS DISTINCT FROM v_hr_dept
       AND hsc.department_id IS DISTINCT FROM v_finance_dept
       AND hsc.department_id IS DISTINCT FROM v_director_office_dept
       AND hsc.department_id IS DISTINCT FROM v_it_dept;

    INSERT INTO payroll_runs (
        period_month, marketing_opex_total, hr_opex_total, finance_opex_total,
        director_office_total, it_opex_total, revenue_opex_total, director_salary_total, status,
        submitted_by, submitted_at, approved_at
    ) VALUES (
        p_period, v_marketing_total, v_hr_total, v_finance_total,
        v_director_office_total, v_it_total, v_revenue_total, 0, 'approved', p_user_id, NOW(), NOW()
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
            'staff_total', v_marketing_total + v_hr_total + v_finance_total + v_director_office_total + v_it_total + v_revenue_total,
            'semantics', 'no Principal approval; funding request auto-filed when total>0 (mig 20260626120000); Revenue included and commission sync/balance verified since 20260913010000'));

    RETURN v_run_id;
END;
$function$;
