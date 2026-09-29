-- HR › Payroll: every statutory figure can be typed, and a typed one stays
-- (user 2026-09-30).
--
-- The grid gains EPF / SOCSO / EIS (employee) and PCB under Deductions, and the
-- employer EPF / SOCSO / EIS become fields too: "在这个 payroll tab 那边，所有
-- 的东西基本上都应该是可以被 editable 的". A typed figure is a fact, kept in its
-- own *_override_amount column, and the compute trigger honours it every time
-- it runs. A later change to Basic, OT or unpaid leave recomputes every figure
-- nobody typed and leaves the typed ones alone, until Reset to JADUAL clears
-- them. PCB already worked this way for Revenue rows (pcb_override_amount,
-- 20260914010000); it now works for everybody on PCB.
--
-- Until now an override was written straight onto epf_ee and friends, and the
-- lookup trigger was kept from running (20260913010000: "Statutory overrides
-- deliberately do not run the lookup trigger") because it would have written
-- JADUAL's figure over the typed one. The typed figure now lives in a column
-- the lookup never writes, so the trigger runs on an override as well: one
-- piece of arithmetic for every save, exact to the cent, and the figures
-- nobody typed follow JADUAL (pro-rata, categories, PCB on the new EPF).
--
-- Backward compatible: every new column starts NULL and COALESCE(NULL, x) = x,
-- so no row's figures move, and no live row carries a PCB override outside
-- Revenue (checked 2026-09-30: 0 rows). The InfoTech import still writes the
-- file's figures straight onto the value columns (verbatim, 2026-06-05) and
-- names none of the override columns, so it still does not run the trigger.

ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN IF NOT EXISTS epf_er_override_amount   numeric(15,2),
    ADD COLUMN IF NOT EXISTS epf_ee_override_amount   numeric(15,2),
    ADD COLUMN IF NOT EXISTS socso_er_override_amount numeric(15,2),
    ADD COLUMN IF NOT EXISTS socso_ee_override_amount numeric(15,2),
    ADD COLUMN IF NOT EXISTS eis_er_override_amount   numeric(15,2),
    ADD COLUMN IF NOT EXISTS eis_ee_override_amount   numeric(15,2);

ALTER TABLE public.hr_monthly_payroll
    ADD CONSTRAINT payroll_statutory_overrides_nonnegative CHECK (
        (epf_er_override_amount   IS NULL OR epf_er_override_amount   >= 0) AND
        (epf_ee_override_amount   IS NULL OR epf_ee_override_amount   >= 0) AND
        (socso_er_override_amount IS NULL OR socso_er_override_amount >= 0) AND
        (socso_ee_override_amount IS NULL OR socso_ee_override_amount >= 0) AND
        (eis_er_override_amount   IS NULL OR eis_er_override_amount   >= 0) AND
        (eis_ee_override_amount   IS NULL OR eis_ee_override_amount   >= 0)
    );

COMMENT ON COLUMN public.hr_monthly_payroll.epf_er_override_amount IS
    'EPF employer typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.epf_ee_override_amount IS
    'EPF employee typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.socso_er_override_amount IS
    'SOCSO employer typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.socso_ee_override_amount IS
    'SOCSO employee typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.eis_er_override_amount IS
    'EIS employer typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.eis_ee_override_amount IS
    'EIS employee typed on HR › Payroll. Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it.';
COMMENT ON COLUMN public.hr_monthly_payroll.pcb_override_amount IS
    'PCB typed on HR › Payroll (Revenue rows since 20260914010000, every row on PCB since 20260930010000). Wins over the JADUAL lookup on every recompute until Reset to JADUAL clears it. Ignored while the staff record says withholding tax or no tax.';

-- The compute trigger, as live (20260927061000), with two changes: the typed
-- figures replace the lookup's straight after it, before gross, taxable
-- income and net read them; and PCB's override applies to every source.
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
    IF TG_OP = 'UPDATE' AND OLD.source = 'commission' AND NEW.source = 'commission'
       AND OLD.payout_split_version = 2
       AND coalesce(current_setting('app.revenue_commission_write',true),'') IN ('adjust','sync')
       AND ROW(NEW.staff_id,NEW.period_month,NEW.basic_salary,NEW.statutory_allowance,
               NEW.non_statutory_allowance,NEW.ot_hours,NEW.ot_amount,
               NEW.unpaid_leave_days,NEW.deduction_amount,NEW.skbbk_amount)
           IS NOT DISTINCT FROM
           ROW(OLD.staff_id,OLD.period_month,OLD.basic_salary,OLD.statutory_allowance,
               OLD.non_statutory_allowance,OLD.ot_hours,OLD.ot_amount,
               OLD.unpaid_leave_days,OLD.deduction_amount,OLD.skbbk_amount) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.source = 'commission' THEN
        PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || NEW.period_month::text));
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'New Revenue payroll must start as a draft';
        END IF;
        IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = NEW.period_month AND is_locked) THEN
            RAISE EXCEPTION 'Revenue payroll accounting period % is locked', NEW.period_month;
        END IF;
        IF payroll_month_closed(NEW.period_month) THEN
            RAISE EXCEPTION 'Payroll for % is closed for good', to_char(NEW.period_month, 'FMMonth YYYY');
        END IF;
    END IF;

    SELECT * INTO v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'hr_monthly_payroll: staff_id % not found in hr_staff_costs', NEW.staff_id;
    END IF;

    IF NEW.source = 'commission' THEN
        SELECT t.earnings, t.deductions INTO NEW.pay_line_earnings, NEW.pay_line_deductions
          FROM revenue_pay_line_totals(NEW.staff_id, NEW.period_month) t;
    ELSE
        NEW.pay_line_earnings := 0;
        NEW.pay_line_deductions := 0;
    END IF;

    v_period_start := NEW.period_month;
    v_period_end   := (NEW.period_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month := EXTRACT(DAY FROM v_period_end)::INTEGER;

    v_effective_start := GREATEST(COALESCE(v_staff.hire_date, v_period_start), v_period_start);
    v_effective_end   := LEAST(COALESCE(v_staff.resignation_date, v_period_end), v_period_end);

    IF v_effective_start > v_effective_end THEN
        v_days_worked := 0;
    ELSE
        v_days_worked := (v_effective_end - v_effective_start + 1);
    END IF;

    v_days_worked := GREATEST(v_days_worked - COALESCE(NEW.unpaid_leave_days, 0)::INTEGER, 0);

    IF v_days_in_month = 0 THEN
        v_prorata_ratio := 0;
    ELSE
        v_prorata_ratio := v_days_worked::NUMERIC / v_days_in_month::NUMERIC;
    END IF;

    NEW.prorata_days_worked   := v_days_worked;
    NEW.prorata_days_in_month := v_days_in_month;

    v_prorated_basic := NEW.basic_salary * v_prorata_ratio;
    v_prorated_stat  := NEW.statutory_allowance * v_prorata_ratio;
    v_prorated_ot    := NEW.ot_amount * v_prorata_ratio;

    v_statutory_wages := GREATEST(
        v_prorated_basic + v_prorated_stat - COALESCE(NEW.deduction_amount, 0),
        0
    );

    IF v_statutory_wages <= 0 THEN
        NEW.epf_er := 0; NEW.epf_ee := 0;
        NEW.socso_er := 0; NEW.socso_ee := 0;
        NEW.eis_er := 0; NEW.eis_ee := 0;
    ELSE
        IF v_staff.is_epf_exempt THEN
            NEW.epf_er := 0;
            NEW.epf_ee := 0;
        ELSE
            SELECT employer, employee INTO NEW.epf_er, NEW.epf_ee
            FROM lookup_epf(v_statutory_wages, v_staff.epf_category);
            NEW.epf_er := COALESCE(NEW.epf_er, 0);
            NEW.epf_ee := COALESCE(NEW.epf_ee, 0);
        END IF;

        SELECT employer, employee INTO NEW.socso_er, NEW.socso_ee
        FROM lookup_socso(v_statutory_wages, v_staff.socso_category);
        NEW.socso_er := COALESCE(NEW.socso_er, 0);
        NEW.socso_ee := COALESCE(NEW.socso_ee, 0);

        SELECT employer, employee INTO NEW.eis_er, NEW.eis_ee
        FROM lookup_eis(v_statutory_wages);
        NEW.eis_er := COALESCE(NEW.eis_er, 0);
        NEW.eis_ee := COALESCE(NEW.eis_ee, 0);
    END IF;

    -- Typed on HR › Payroll (20260930010000): a figure somebody entered wins
    -- over the lookup until Reset to JADUAL clears it. Applied before gross
    -- (Revenue funds employer statutory from commission), taxable income
    -- (PCB reads EPF employee) and net read them.
    NEW.epf_er   := COALESCE(NEW.epf_er_override_amount,   NEW.epf_er);
    NEW.epf_ee   := COALESCE(NEW.epf_ee_override_amount,   NEW.epf_ee);
    NEW.socso_er := COALESCE(NEW.socso_er_override_amount, NEW.socso_er);
    NEW.socso_ee := COALESCE(NEW.socso_ee_override_amount, NEW.socso_ee);
    NEW.eis_er   := COALESCE(NEW.eis_er_override_amount,   NEW.eis_er);
    NEW.eis_ee   := COALESCE(NEW.eis_ee_override_amount,   NEW.eis_ee);

    IF NEW.source = 'commission' THEN
        v_gross := NEW.commission_amount - NEW.epf_er - NEW.socso_er - NEW.eis_er
                 + v_prorated_stat + v_prorated_ot + NEW.non_statutory_allowance
                 + NEW.pay_line_earnings
                 - COALESCE(NEW.deduction_amount, 0);
    ELSE
        NEW.commission_balance := NULL;
        v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
                 + NEW.commission_amount + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    END IF;

    IF NEW.source = 'commission' THEN
        v_taxable_income := GREATEST(ROUND(NEW.basic_salary * v_prorata_ratio, 2) - NEW.epf_ee, 0);
    ELSE
        v_taxable_income := v_gross - NEW.epf_ee;
    END IF;

    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(
            GREATEST(v_gross, 0) * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        IF NEW.pcb_override_amount IS NOT NULL THEN
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
                - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0)
                - NEW.pay_line_deductions, 2);

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

-- An override names only its own column, so the trigger must listen to those
-- columns too — otherwise a typed EPF would never reach net.
DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_compute ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_compute
    BEFORE INSERT OR UPDATE OF
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        deduction_amount, skbbk_amount, period_month, staff_id, source,
        epf_er_override_amount, epf_ee_override_amount,
        socso_er_override_amount, socso_ee_override_amount,
        eis_er_override_amount, eis_ee_override_amount,
        pcb_override_amount
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.compute_hr_monthly_payroll();

-- A Revenue row whose Gross Commission is being adjusted saves its other
-- edits in the same transaction (20260915030000). Those edits may now include
-- typed statutory figures: each lands in its override column, stamped, and
-- the compute trigger above settles the row.
CREATE OR REPLACE FUNCTION public.save_revenue_payroll_row(
    p_payroll_id uuid,
    p_gross numeric,
    p_expected_synced numeric,
    p_expected_adjustment numeric,
    p_reason text,
    p_row_updates jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.hr_monthly_payroll%ROWTYPE;
    v_period date;
    v_key text;
    v_value jsonb;
    v_number numeric;
    v_column text;
    v_fields text[] := ARRAY[]::text[];
    v_typed boolean := false;
    v_result jsonb;
    v_inputs CONSTANT text[] := ARRAY['basic_salary','statutory_allowance','non_statutory_allowance',
        'ot_hours','ot_amount','unpaid_leave_days','deduction_amount','skbbk_amount'];
    v_statutory CONSTANT text[] := ARRAY['epf_er','epf_ee','socso_er','socso_ee','eis_er','eis_ee','pcb'];
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active AND role IN ('principal','hr')) THEN
        RAISE EXCEPTION 'Only active Principal or HR may save Revenue payroll' USING ERRCODE = '42501';
    END IF;
    IF p_row_updates IS NULL OR jsonb_typeof(p_row_updates) <> 'object' THEN
        RAISE EXCEPTION 'Payroll row updates must be an object of editable numeric fields';
    END IF;
    FOR v_key, v_value IN SELECT key,value FROM jsonb_each(p_row_updates)
    LOOP
        IF v_key <> ALL (v_inputs) AND v_key <> ALL (v_statutory) THEN
            RAISE EXCEPTION 'Unknown or protected payroll field: %', v_key;
        END IF;
        IF jsonb_typeof(v_value) <> 'number' THEN
            RAISE EXCEPTION 'Payroll field % must be a finite number', v_key;
        END IF;
        v_number := (v_value #>> '{}')::numeric;
        IF v_number::text IN ('NaN','Infinity','-Infinity') OR v_number <> round(v_number,2) THEN
            RAISE EXCEPTION 'Payroll field % must have at most two decimal places', v_key;
        END IF;
        -- Match normal payroll's existing input constraint. The existing
        -- signed deduction/SKBBK behavior is preserved rather than broadened.
        IF v_key NOT IN ('deduction_amount','skbbk_amount') AND v_number < 0 THEN
            RAISE EXCEPTION 'Payroll field % cannot be negative', v_key;
        END IF;
    END LOOP;

    SELECT period_month INTO v_period FROM public.hr_monthly_payroll WHERE id = p_payroll_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payroll row not found'; END IF;
    -- Same ordering as the adjustment RPC and the payment generators. The
    -- row remains locked through both writes and their audit until commit.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_period::text));
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
    SELECT * INTO STRICT v_row FROM public.hr_monthly_payroll WHERE id = p_payroll_id FOR UPDATE;
    IF v_row.period_month IS DISTINCT FROM v_period THEN
        RAISE EXCEPTION 'Payroll changed; reload before saving';
    END IF;
    IF p_row_updates ? 'pcb' AND EXISTS (SELECT 1 FROM public.hr_staff_costs
        WHERE id = v_row.staff_id AND tax_mode <> 'pcb') THEN
        RAISE EXCEPTION 'PCB does not apply to this person — their tax is set on their People record';
    END IF;

    -- This call validates draft/v2, source concurrency, reason and every
    -- funding/PV/period guard before either ordinary input can be written.
    -- Its audit and money changes roll back if the later row update fails.
    v_result := public.adjust_revenue_payroll_commission(
        p_payroll_id,p_gross,p_expected_synced,p_expected_adjustment,p_reason);

    FOR v_key, v_value IN SELECT key,value FROM jsonb_each(p_row_updates) ORDER BY key
    LOOP
        -- A typed statutory figure is written to its override column, never
        -- onto the figure itself; the compute trigger applies it.
        v_column := CASE WHEN v_key = 'pcb' THEN 'pcb_override_amount'
                         WHEN v_key = ANY (v_statutory) THEN v_key || '_override_amount'
                         ELSE v_key END;
        IF (to_jsonb(v_row)->>v_column)::numeric IS DISTINCT FROM (v_value #>> '{}')::numeric THEN
            -- Identifiers come from the exact whitelists above; values remain
            -- SQL parameters. Naming only changed fields avoids a needless
            -- statutory reset when the client includes unchanged Basic.
            v_fields := array_append(v_fields,format('%I = ($1->>%L)::numeric',v_column,v_key));
            v_typed := v_typed OR v_key = ANY (v_statutory);
        END IF;
    END LOOP;
    IF v_typed THEN
        v_fields := v_fields || ARRAY['statutory_overridden_at = now()','statutory_overridden_by = auth.uid()'];
    END IF;
    IF cardinality(v_fields) > 0 THEN
        EXECUTE format('UPDATE public.hr_monthly_payroll SET %s WHERE id = $2',array_to_string(v_fields,', '))
            USING p_row_updates,p_payroll_id;
    END IF;
    SELECT * INTO STRICT v_row FROM public.hr_monthly_payroll WHERE id = p_payroll_id;
    RETURN v_result || jsonb_build_object(
        'row_changed',cardinality(v_fields) > 0,
        'commission_amount',v_row.commission_amount,
        'commission_synced_amount',v_row.commission_synced_amount,
        'commission_adjustment_amount',v_row.commission_adjustment_amount,
        'basic_pay_net',v_row.basic_pay_net,
        'commission_balance',v_row.commission_balance,
        'net',v_row.net);
END;
$$;
REVOKE ALL ON FUNCTION public.save_revenue_payroll_row(uuid,numeric,numeric,numeric,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_revenue_payroll_row(uuid,numeric,numeric,numeric,text,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
