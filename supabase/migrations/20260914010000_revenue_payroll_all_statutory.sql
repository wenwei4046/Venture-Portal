-- Revenue v2 settles NET basic first, statutory liabilities separately, and
-- remaining commission. No existing payroll, paid row or test row is backfilled.
-- NULL version identifies the former EPF-only split and preserves its snapshot.
ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN payout_split_version smallint,
    ADD COLUMN basic_pay_net numeric(15,2),
    ADD COLUMN pcb_override_amount numeric(15,2),
    ADD CONSTRAINT revenue_pcb_override_nonnegative CHECK (pcb_override_amount IS NULL OR pcb_override_amount >= 0),
    ADD CONSTRAINT revenue_payout_components_reconcile CHECK (
        payout_split_version IS NULL OR (
            payout_split_version = 2 AND source = 'commission'
            AND basic_pay_net IS NOT NULL AND commission_balance IS NOT NULL
            AND basic_pay_net + commission_balance = net
        )
    );
COMMENT ON COLUMN public.hr_monthly_payroll.payout_split_version IS
    'NULL: existing legacy snapshot. 2: net basic plus residual commission, all ER funded from commission, PCB based only on actual basic less EPF EE.';
COMMENT ON COLUMN public.hr_monthly_payroll.basic_pay_net IS
    'Version 2 employee basic payment: rounded prorated gross basic less EPF/SOCSO/EIS EE and PCB. Negative values are retained for correction and cannot be submitted or paid.';
COMMENT ON COLUMN public.hr_monthly_payroll.pcb_override_amount IS
    'Optional explicit Revenue PCB amount. Persists through recalculation and resync until Reset clears it. Imported payroll keeps its existing override behavior.';
COMMENT ON COLUMN public.hr_monthly_payroll.commission_balance IS
    'Version 2 residual employee commission payment = net minus basic_pay_net; it funds all employer contributions and other residual adjustments. NULL-version rows retain the former EPF-only split.';
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
    IF TG_OP = 'UPDATE' AND OLD.source = 'commission' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Finalized Revenue payroll cannot be recalculated; reopen payroll first';
    END IF;
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

    -- All employer contributions are funded from upstream commission. Employee
    -- contributions and PCB remain in ordinary payroll net, exactly once.
    IF NEW.source = 'commission' THEN
        v_gross := NEW.commission_amount - NEW.epf_er - NEW.socso_er - NEW.eis_er
                 + v_prorated_stat + v_prorated_ot + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    ELSE
        NEW.commission_balance := NULL;
        v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
                 + NEW.commission_amount + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    END IF;

    -- Imported payroll retains its existing tax base. Revenue uses only
    -- rounded actual gross basic less EPF EE; commission and other earnings
    -- do not increase this PCB lookup input.
    IF NEW.source = 'commission' THEN
        -- Revenue PCB is based only on actual gross basic less EPF EE.
        v_taxable_income := GREATEST(ROUND(NEW.basic_salary * v_prorata_ratio, 2) - NEW.epf_ee, 0);
    ELSE
        v_taxable_income := v_gross - NEW.epf_ee;
    END IF;

    -- Tax: exactly one of PCB / Withholding applies.
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(
            GREATEST(v_gross, 0) * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        IF NEW.source = 'commission' AND NEW.pcb_override_amount IS NOT NULL THEN
            NEW.pcb := NEW.pcb_override_amount;
        ELSE
            NEW.pcb := COALESCE(
                lookup_pcb(v_taxable_income, v_staff.pcb_category, v_staff.children_count), 0);
        END IF;
        NEW.withholding_tax := 0;
    END IF;

    NEW.gross := ROUND(v_gross, 2);
    NEW.net   := ROUND(
        v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb
                - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0), 2);

    IF NEW.source = 'commission' THEN
        NEW.payout_split_version := 2;
        NEW.basic_pay_net := ROUND(NEW.basic_salary * v_prorata_ratio, 2)
            - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb;
        NEW.commission_balance := NEW.net - NEW.basic_pay_net;
    ELSE
        NEW.payout_split_version := NULL;
        NEW.basic_pay_net := NULL;
    END IF;

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_revenue_payroll_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_staff hr_staff_costs%ROWTYPE;
    v_ratio numeric(10,6);
    v_basic numeric(15,2);
    v_stat numeric(15,4);
    v_ot numeric(15,4);
    v_gross numeric(15,4);
BEGIN
    IF NEW.source <> 'commission' THEN RETURN NEW; END IF;
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Finalized Revenue payroll cannot be recalculated; reopen payroll first';
    END IF;
    SELECT * INTO STRICT v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    v_ratio := CASE WHEN NEW.prorata_days_in_month > 0
        THEN NEW.prorata_days_worked::numeric / NEW.prorata_days_in_month ELSE 0 END;
    v_basic := ROUND(NEW.basic_salary * v_ratio, 2);
    v_stat := NEW.statutory_allowance * v_ratio;
    v_ot := NEW.ot_amount * v_ratio;

    -- Explicit override_amount wins. A direct PCB-only edit on an existing v2
    -- row also becomes durable; input-trigger recalculation is not an override.
    IF NEW.pcb_override_amount IS NOT DISTINCT FROM OLD.pcb_override_amount
       AND NEW.pcb IS DISTINCT FROM OLD.pcb AND OLD.payout_split_version = 2
       AND ROW(NEW.staff_id,NEW.period_month,NEW.basic_salary,NEW.commission_amount,
               NEW.statutory_allowance,NEW.non_statutory_allowance,NEW.ot_amount,
               NEW.deduction_amount,NEW.unpaid_leave_days,NEW.epf_ee,
               NEW.prorata_days_worked,NEW.prorata_days_in_month)
           IS NOT DISTINCT FROM
           ROW(OLD.staff_id,OLD.period_month,OLD.basic_salary,OLD.commission_amount,
               OLD.statutory_allowance,OLD.non_statutory_allowance,OLD.ot_amount,
               OLD.deduction_amount,OLD.unpaid_leave_days,OLD.epf_ee,
               OLD.prorata_days_worked,OLD.prorata_days_in_month) THEN
        NEW.pcb_override_amount := NEW.pcb;
    END IF;

    v_gross := NEW.commission_amount - NEW.epf_er - NEW.socso_er - NEW.eis_er
        + v_stat + v_ot + NEW.non_statutory_allowance - COALESCE(NEW.deduction_amount, 0);
    NEW.gross := ROUND(v_gross, 2);
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(GREATEST(v_gross, 0)
            * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        NEW.pcb := COALESCE(NEW.pcb_override_amount,
            lookup_pcb(GREATEST(v_basic - NEW.epf_ee, 0),
                v_staff.pcb_category, v_staff.children_count), 0);
        NEW.withholding_tax := 0;
    END IF;

    NEW.net := ROUND(v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee
        - NEW.pcb - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0), 2);
    NEW.basic_pay_net := v_basic - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb;
    NEW.commission_balance := NEW.net - NEW.basic_pay_net;
    NEW.payout_split_version := 2;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_revenue_totals ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_revenue_totals
    BEFORE UPDATE OF epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee,
        pcb, withholding_tax, gross, net, commission_balance,
        prorata_days_worked, prorata_days_in_month,
        pcb_override_amount, basic_pay_net, payout_split_version
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.recompute_revenue_payroll_totals();

COMMENT ON FUNCTION public.compute_hr_monthly_payroll IS
    'Revenue v2 funds all ER from commission, computes PCB on actual basic less EPF EE with a persistent override, and stores net-basic plus residual-commission payouts. Imported calculation remains unchanged.';
COMMENT ON FUNCTION public.recompute_revenue_payroll_totals IS
    'Preserves explicit statutory amounts, recalculates basic-only PCB unless overridden, and reconciles net basic plus commission to net exactly once. Finalized Revenue rows cannot be recalculated.';

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
        OR a.payout_split_version IS DISTINCT FROM 2 OR a.basic_pay_net IS NULL
        OR a.commission_amount IS DISTINCT FROM e.total_commission
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue payroll for staff % in % does not match the synced commission calculation. Recalculate commission before submitting.', v_problem, p_period;
    END IF;

    SELECT staff.employee_name INTO v_problem
      FROM hr_monthly_payroll h JOIN hr_staff_costs staff ON staff.id = h.staff_id
     WHERE h.period_month = p_period AND h.source = 'commission'
       AND h.basic_pay_net < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue net basic for % is negative after employee statutory and PCB. Resolve it before submitting.', v_problem;
    END IF;

    SELECT staff.employee_name INTO v_problem
      FROM hr_monthly_payroll h JOIN hr_staff_costs staff ON staff.id = h.staff_id
     WHERE h.period_month = p_period AND h.source = 'commission'
       AND h.commission_balance < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue commission for % cannot fund the selected gross basic and employer statutory contributions. Resolve the negative commission balance before submitting.', v_problem;
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
