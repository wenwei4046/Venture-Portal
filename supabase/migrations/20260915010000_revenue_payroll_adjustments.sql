-- Month-end Payroll adjustments are signed offsets from Revenue's source.
-- Revenue statements, releases and run totals remain authoritative and unchanged.
ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN commission_synced_amount numeric(15,2),
    ADD COLUMN commission_adjustment_amount numeric(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN commission_adjustment_reason text,
    ADD COLUMN commission_adjusted_at timestamptz,
    ADD COLUMN commission_adjusted_by uuid REFERENCES public.users(id),
    ADD CONSTRAINT revenue_commission_adjustment_reconciles CHECK (
        (commission_synced_amount IS NULL AND commission_adjustment_amount = 0)
        OR (source = 'commission' AND commission_synced_amount IS NOT NULL
            AND commission_synced_amount::text NOT IN ('NaN','Infinity','-Infinity')
            AND commission_adjustment_amount::text NOT IN ('NaN','Infinity','-Infinity')
            AND commission_amount = commission_synced_amount + commission_adjustment_amount)
    );

-- Grandfather existing, saved draft snapshots without changing any money.
-- Empty unsynced placeholders and finalized/history rows remain uninitialized.
UPDATE public.hr_monthly_payroll p
   SET commission_synced_amount = p.commission_amount
 WHERE p.source = 'commission' AND p.status = 'draft' AND p.payout_split_version = 2
   AND (p.commission_amount > 0 OR EXISTS (
       SELECT 1 FROM public.comm_statements s JOIN public.comm_runs r ON r.id = s.run_id
       WHERE s.staff_id = p.staff_id AND r.period_month = p.period_month
         AND r.status IN ('applied','locked')
       GROUP BY s.staff_id HAVING SUM(s.total_commission) = p.commission_amount
   ));

COMMENT ON COLUMN public.hr_monthly_payroll.commission_synced_amount IS
    'Saved all-programme Revenue source baseline. NULL means source not initialized; an applied/locked source can repair it through the reviewed adjustment RPC.';
COMMENT ON COLUMN public.hr_monthly_payroll.commission_adjustment_amount IS
    'Signed Payroll-only offset. Explicit resync changes the baseline and retains this offset; final commission_amount = baseline + offset.';
COMMENT ON COLUMN public.hr_monthly_payroll.commission_amount IS
    'Final gross commission budget. For tracked Revenue rows this equals synchronized source baseline plus the audited Payroll adjustment; Revenue statements themselves remain unchanged.';

CREATE TABLE public.revenue_payroll_commission_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Immutable original identity, deliberately not a deleting-blocking FK:
    -- a reopened source may remove this employee, requiring the orphan draft
    -- payroll row to be deleted before the remaining payroll can be submitted.
    payroll_row_id uuid NOT NULL,
    staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
    period_month date NOT NULL,
    old_synced_amount numeric(15,2),
    synced_amount numeric(15,2) NOT NULL,
    old_adjustment_amount numeric(15,2) NOT NULL,
    adjustment_amount numeric(15,2) NOT NULL,
    old_gross numeric(15,2) NOT NULL,
    gross numeric(15,2) NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    adjusted_by uuid NOT NULL REFERENCES public.users(id),
    adjusted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.revenue_payroll_commission_adjustments(payroll_row_id, adjusted_at);
ALTER TABLE public.revenue_payroll_commission_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_commission_adjustments_read ON public.revenue_payroll_commission_adjustments
    FOR SELECT TO authenticated USING ((SELECT current_user_role() IN ('principal','hr')));
REVOKE ALL ON public.revenue_payroll_commission_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.revenue_payroll_commission_adjustments TO authenticated;

CREATE FUNCTION public.guard_revenue_commission_adjustment_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'Revenue commission adjustment history is immutable';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_revenue_commission_adjustment_audit() FROM PUBLIC;
CREATE TRIGGER trg_revenue_commission_adjustments_immutable
    BEFORE UPDATE OR DELETE ON public.revenue_payroll_commission_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_commission_adjustment_audit();

-- PostgREST clients cannot set this transaction-local internal context. Only
-- the checked adjustment RPC and existing apply/reopen routines set it, and
-- each restores the caller's context before returning.
CREATE FUNCTION public.guard_revenue_commission_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_context text := coalesce(current_setting('app.revenue_commission_write',true),'');
    v_changed boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_changed := NEW.commission_synced_amount IS NOT NULL
            OR NEW.commission_adjustment_amount <> 0
            OR NEW.commission_adjustment_reason IS NOT NULL
            OR NEW.commission_adjusted_at IS NOT NULL OR NEW.commission_adjusted_by IS NOT NULL
            OR (NEW.source = 'commission' AND NEW.commission_amount <> 0);
    ELSE
        v_changed := ROW(NEW.commission_synced_amount,NEW.commission_adjustment_amount,
            NEW.commission_adjustment_reason,NEW.commission_adjusted_at,NEW.commission_adjusted_by)
            IS DISTINCT FROM ROW(OLD.commission_synced_amount,OLD.commission_adjustment_amount,
            OLD.commission_adjustment_reason,OLD.commission_adjusted_at,OLD.commission_adjusted_by)
            OR ((OLD.source = 'commission' OR NEW.source = 'commission') AND
                ROW(NEW.commission_amount,NEW.source,NEW.staff_id,NEW.period_month)
                IS DISTINCT FROM ROW(OLD.commission_amount,OLD.source,OLD.staff_id,OLD.period_month));
    END IF;
    IF NOT v_changed THEN RETURN NEW; END IF;
    IF v_context NOT IN ('adjust','sync') OR auth.uid() IS NULL
       OR current_user_role() IS NULL OR current_user_role() NOT IN ('principal','hr') THEN
        RAISE EXCEPTION 'Revenue Gross Commission must be changed through its reviewed adjustment or source sync' USING ERRCODE = '42501';
    END IF;
    IF NEW.source <> 'commission' OR NEW.status <> 'draft'
       OR (TG_OP = 'UPDATE' AND (OLD.status <> 'draft' OR OLD.source = 'imported')) THEN
        RAISE EXCEPTION 'Only draft Revenue payroll can be adjusted or synchronized';
    END IF;
    IF TG_OP = 'UPDATE' AND ROW(NEW.staff_id,NEW.period_month) IS DISTINCT FROM ROW(OLD.staff_id,OLD.period_month) THEN
        RAISE EXCEPTION 'Revenue adjustment identity and period cannot be changed';
    END IF;
    IF NOT pg_try_advisory_xact_lock(hashtext('commission_payroll:' || NEW.period_month::text)) THEN
        RAISE EXCEPTION 'Commission payroll is being updated; try again';
    END IF;
    PERFORM public.assert_commission_payroll_open(NEW.period_month);
    NEW.commission_amount := NEW.commission_synced_amount + NEW.commission_adjustment_amount;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_revenue_commission_adjustment() FROM PUBLIC;
CREATE TRIGGER trg_hr_monthly_payroll_00_commission_adjustment
    BEFORE INSERT OR UPDATE ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_commission_adjustment();

CREATE FUNCTION public.adjust_revenue_payroll_commission(
    p_payroll_id uuid, p_gross numeric, p_expected_synced numeric,
    p_expected_adjustment numeric, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.hr_monthly_payroll%ROWTYPE;
    v_result public.hr_monthly_payroll%ROWTYPE;
    v_period date;
    v_base numeric(15,2);
    v_sources bigint;
    v_reason text := btrim(p_reason);
    v_context text := coalesce(current_setting('app.revenue_commission_write',true),'');
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active AND role IN ('principal','hr')) THEN
        RAISE EXCEPTION 'Only active Principal or HR may adjust Revenue payroll' USING ERRCODE = '42501';
    END IF;
    IF p_gross IS NULL OR p_gross::text IN ('NaN','Infinity','-Infinity') OR p_gross < 0
       OR p_gross <> round(p_gross,2) OR p_gross > 9999999999999.99 THEN
        RAISE EXCEPTION 'Gross Commission must be a nonnegative amount with at most two decimal places';
    END IF;
    IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Enter an adjustment reason between 1 and 1000 characters';
    END IF;
    SELECT period_month INTO v_period FROM public.hr_monthly_payroll WHERE id = p_payroll_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payroll row not found'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_period::text));
    -- Salary and statutory generators hold this namespace before reading rows.
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
    SELECT * INTO STRICT v_row FROM public.hr_monthly_payroll WHERE id = p_payroll_id FOR UPDATE;
    IF v_row.period_month IS DISTINCT FROM v_period THEN RAISE EXCEPTION 'Payroll changed; reload before adjusting'; END IF;
    PERFORM public.assert_commission_payroll_open(v_period);
    IF EXISTS (SELECT 1 FROM public.payroll_statutory_voucher_lines l
        JOIN public.payment_vouchers pv ON pv.id = l.voucher_id
        WHERE l.period_month = v_period AND l.scope = 'staff' AND pv.status <> 'voided') THEN
        RAISE EXCEPTION 'Payroll already has statutory payment vouchers. Resolve them before adjusting commission';
    END IF;
    IF v_row.source <> 'commission' OR v_row.status <> 'draft'
       OR v_row.payout_split_version IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Only an unpaid draft Revenue payroll with the current payout split can be adjusted';
    END IF;
    IF v_row.commission_adjustment_amount IS DISTINCT FROM p_expected_adjustment THEN
        RAISE EXCEPTION 'Commission adjustment changed; reload and review the new amount';
    END IF;
    SELECT count(*), sum(s.total_commission) INTO v_sources, v_base
      FROM public.comm_statements s JOIN public.comm_runs r ON r.id = s.run_id
     WHERE s.staff_id = v_row.staff_id AND r.period_month = v_period AND r.status IN ('applied','locked');
    -- A saved legacy snapshot remains reviewable, but a new missing source is
    -- never interpreted as zero. Reopened/pending sources must be confirmed.
    IF EXISTS (SELECT 1 FROM public.comm_runs r JOIN public.comm_statements s ON s.run_id = r.id
        WHERE s.staff_id = v_row.staff_id AND r.period_month = v_period
          AND r.status NOT IN ('applied','locked')) THEN
        RAISE EXCEPTION 'Revenue source is not confirmed. Complete and sync its calculation before adjusting';
    END IF;
    IF v_sources = 0 THEN v_base := v_row.commission_synced_amount; END IF;
    IF v_base IS NULL THEN
        RAISE EXCEPTION 'No confirmed Revenue source baseline is available. Repair or sync the commission calculation first';
    END IF;
    IF v_base IS DISTINCT FROM p_expected_synced THEN
        RAISE EXCEPTION 'Revenue source changed; reload and review the new baseline';
    END IF;
    IF v_row.commission_synced_amount IS NOT DISTINCT FROM v_base
       AND v_row.commission_amount = p_gross THEN
        RETURN jsonb_build_object('changed',false,'commission_amount',v_row.commission_amount,
            'commission_synced_amount',v_base,'commission_adjustment_amount',v_row.commission_adjustment_amount);
    END IF;
    PERFORM set_config('app.revenue_commission_write','adjust',true);
    UPDATE public.hr_monthly_payroll
       SET commission_synced_amount = v_base, commission_adjustment_amount = p_gross - v_base,
           commission_amount = p_gross, commission_adjustment_reason = v_reason,
           commission_adjusted_by = auth.uid(), commission_adjusted_at = now(), updated_at = now()
     WHERE id = p_payroll_id RETURNING * INTO v_result;
    PERFORM set_config('app.revenue_commission_write',v_context,true);
    INSERT INTO public.revenue_payroll_commission_adjustments (
        payroll_row_id,staff_id,period_month,old_synced_amount,synced_amount,
        old_adjustment_amount,adjustment_amount,old_gross,gross,reason,adjusted_by)
    VALUES (v_row.id,v_row.staff_id,v_period,v_row.commission_synced_amount,v_base,
        v_row.commission_adjustment_amount,v_result.commission_adjustment_amount,
        v_row.commission_amount,v_result.commission_amount,v_reason,auth.uid());
    RETURN jsonb_build_object('changed',true,'commission_amount',v_result.commission_amount,
        'commission_synced_amount',v_result.commission_synced_amount,
        'commission_adjustment_amount',v_result.commission_adjustment_amount,
        'basic_pay_net',v_result.basic_pay_net,'commission_balance',v_result.commission_balance,'net',v_result.net);
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_revenue_payroll_commission(uuid,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_revenue_payroll_commission(uuid,numeric,numeric,numeric,text) TO authenticated;

CREATE FUNCTION public.revenue_payroll_adjustments(
    p_sub_department_id uuid, p_period date, p_staff_id uuid DEFAULT NULL
) RETURNS TABLE (
    staff_id uuid, commission_synced_amount numeric, commission_adjustment_amount numeric,
    commission_adjustment_reason text, commission_amount numeric, status text,
    commission_adjusted_at timestamptz, source_run_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active)
       OR NOT coalesce(public.has_perm('revenue'),false) THEN
        RAISE EXCEPTION 'Revenue access is required' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.staff_id,p.commission_synced_amount,p.commission_adjustment_amount,
           p.commission_adjustment_reason,p.commission_amount,p.status::text,p.commission_adjusted_at,
           (SELECT count(DISTINCT r.id) FROM public.comm_statements s JOIN public.comm_runs r ON r.id=s.run_id
            WHERE s.staff_id=p.staff_id AND r.period_month=p_period AND r.status IN ('applied','locked'))
      FROM public.hr_monthly_payroll p
     WHERE p.period_month=p_period AND p.source='commission'
       AND (p_staff_id IS NULL OR p.staff_id=p_staff_id)
       AND EXISTS (SELECT 1 FROM public.comm_statements s JOIN public.comm_runs r ON r.id=s.run_id
           WHERE s.staff_id=p.staff_id AND r.period_month=p_period AND r.sub_department_id=p_sub_department_id);
END;
$$;
REVOKE ALL ON FUNCTION public.revenue_payroll_adjustments(uuid,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_payroll_adjustments(uuid,date,uuid) TO authenticated;


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
    -- A source-only adjustment/resync must retain saved manual statutory
    -- amounts. The later totals trigger updates gross, WHT and residual pay.
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

DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_revenue_totals ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_revenue_totals
    BEFORE UPDATE OF epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee,
        pcb, withholding_tax, gross, net, commission_balance,
        prorata_days_worked, prorata_days_in_month,
        pcb_override_amount, basic_pay_net, payout_split_version,
        commission_amount, commission_synced_amount, commission_adjustment_amount
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.recompute_revenue_payroll_totals();

CREATE OR REPLACE FUNCTION public.apply_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_context      TEXT := coalesce(current_setting('app.revenue_commission_write',true),'');
    v_role         TEXT := current_user_role();
    v_run          comm_runs%ROWTYPE;
    v_blocked      INTEGER;
    v_payroll_run  TEXT;
    v_staff        INTEGER := 0;
    v_released     INTEGER := 0;
    v_promoted     INTEGER := 0;
    v_clash        TEXT;
    v_p            RECORD;
    v_hit_pos      INTEGER;
    v_cur_pos      INTEGER;
    v_title_name   TEXT;
    v_ladder_msg   TEXT;
    v_home_scheme  UUID;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may apply a commission run';
    END IF;

    -- All programmes share one payroll field; serialize its monthly sum.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status <> 'computed' THEN
        RAISE EXCEPTION 'Only a computed run can be applied — this one is %', v_run.status;
    END IF;

    -- The warnings are not advisory. Every one of them is a case where the run
    -- knows it paid the wrong amount: an unclassified item group, a
    -- salesperson with sales and no rank, a placement that should not exist.
    IF jsonb_array_length(COALESCE(v_run.warnings, '[]'::JSONB)) > 0 THEN
        RAISE EXCEPTION 'This run has % unresolved warning(s). Clear them and recompute before applying.',
            jsonb_array_length(v_run.warnings);
    END IF;

    -- Invariant 4, half one: the payroll RUN for the month must still be open.
    PERFORM public.assert_commission_payroll_open(v_run.period_month);

    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen it before changing commission',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    -- Invariant 4, half two: and so must every row we are about to write.
    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft — commission cannot be written into a submitted month',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    -- An imported payroll is a separate source of truth. Do not relabel it
    -- or reuse its imported statutory/tax values as a Revenue calculation.
    IF EXISTS (
        SELECT 1 FROM comm_statements s
        JOIN hr_monthly_payroll p ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
        WHERE s.run_id = p_run_id AND p.source = 'imported'
    ) THEN
        RAISE EXCEPTION 'An imported payroll row already exists for a salesperson in this month. Resolve that source before syncing Revenue commission';
    END IF;

    IF EXISTS (
        SELECT 1 FROM comm_statements s
        JOIN hr_staff_costs st ON st.id = s.staff_id
        JOIN comm_sub_departments d ON d.id = v_run.sub_department_id
        WHERE s.run_id = p_run_id AND st.department_id IS DISTINCT FROM d.department_id
    ) THEN
        RAISE EXCEPTION 'A salesperson in this run belongs to another payroll department. Correct the Revenue membership before syncing';
    END IF;

    -- Invariant 5, checked before writing anything so the message names the
    -- order rather than surfacing a raw constraint violation.
    SELECT r.order_no INTO v_clash
      FROM jsonb_array_elements(v_run.released_orders) AS o
      JOIN comm_order_releases r ON r.order_no = o ->> 'order_no'
       AND r.sub_department_id = v_run.sub_department_id
     WHERE r.run_id <> p_run_id
     LIMIT 1;

    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has already been paid by an earlier run. Recompute this month so it is excluded.', v_clash;
    END IF;

    -- ── Payroll ────────────────────────────────────────────────────────────
    -- Existing monthly basic and other payroll inputs
    -- remain intact. New rows take their defaults from the staff master.
    -- commission_synced_amount is the GROSS upstream commission budget. Final
    -- commission_amount adds the retained Payroll-only adjustment. Since
    -- 2026-09-10 several sub-departments may pay the same person the same
    -- month, so the figure is the SUM of every applied run's statement for
    -- that person and month: this run's, plus whatever other sub-departments
    -- have already applied. A re-apply of this sub-department replaces only
    -- its own share (the earlier run was reopened, so it is not 'applied').
    PERFORM set_config('app.revenue_commission_write','sync',true);
    INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, commission_synced_amount, source, status, created_by)
    SELECT s.staff_id,
           v_run.period_month,
           staff.basic_salary,
           s.total_commission + COALESCE((
             SELECT SUM(os.total_commission)
               FROM comm_statements os
               JOIN comm_runs orr ON orr.id = os.run_id
              WHERE os.staff_id = s.staff_id
                AND orr.period_month = v_run.period_month
                AND orr.status IN ('applied', 'locked')
                AND orr.id <> p_run_id
           ), 0),
           'commission', 'draft', auth.uid()
      FROM comm_statements s
      JOIN hr_staff_costs staff ON staff.id = s.staff_id
     WHERE s.run_id = p_run_id
    ON CONFLICT (staff_id, period_month) DO UPDATE
       SET commission_synced_amount = EXCLUDED.commission_synced_amount,
       commission_amount = EXCLUDED.commission_synced_amount + hr_monthly_payroll.commission_adjustment_amount,
           source            = 'commission',
           updated_at        = NOW()
     WHERE hr_monthly_payroll.status = 'draft'
       AND hr_monthly_payroll.source <> 'imported';

    GET DIAGNOSTICS v_staff = ROW_COUNT;
    PERFORM set_config('app.revenue_commission_write',v_context,true);
    IF v_staff <> (SELECT COUNT(*) FROM comm_statements WHERE run_id = p_run_id) THEN
        RAISE EXCEPTION 'A payroll row changed status or source during commission sync. Refresh payroll and try again';
    END IF;

    -- ── Releases ───────────────────────────────────────────────────────────
    INSERT INTO comm_order_releases (
        sub_department_id, order_no, run_id, staff_id, period_month, order_period_month, product_revenue
    )
    SELECT
        v_run.sub_department_id,
        o ->> 'order_no',
        p_run_id,
        (o ->> 'staff_id')::UUID,
        v_run.period_month,
        (o ->> 'order_period_month')::DATE,
        COALESCE((o ->> 'product_revenue')::DECIMAL, 0)
      FROM jsonb_array_elements(v_run.released_orders) AS o
    ;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    -- ── The title ratchet ──────────────────────────────────────────────────
    -- "Title 只会上，不会下" (user 2026-09-02). The month somebody is PAID a
    -- rank whose title sits higher on this ladder than the title they hold
    -- HERE, their membership's title is raised to it and stays there. The
    -- rank follows inside the row (comm_hierarchy_rank_follows_title).
    --
    -- The company title rises with it only when this run is the HOME
    -- sub-department's — that is the title HR calls them by and the People
    -- chart draws. An IR promotion is IR's; Fair's is everybody's.
    FOR v_p IN
        SELECT s.staff_id, s.rank_title_id, h.id AS membership_id,
               h.title_id AS current_title_id, st.employee_name, st.department_id
          FROM comm_statements s
          JOIN comm_hierarchy h
            ON h.staff_id = s.staff_id AND h.scheme_id = v_run.scheme_id AND h.effective_to IS NULL
          JOIN hr_staff_costs st ON st.id = s.staff_id
         WHERE s.run_id = p_run_id
           AND s.rank_title_id IS NOT NULL
           AND s.rank_title_id IS DISTINCT FROM h.title_id
    LOOP
        SELECT MIN(sort_order) INTO v_hit_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.rank_title_id;
        SELECT MIN(sort_order) INTO v_cur_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.current_title_id;

        IF v_hit_pos IS NOT NULL AND (v_cur_pos IS NULL OR v_hit_pos > v_cur_pos) THEN
            SELECT name INTO v_title_name FROM titles WHERE id = v_p.rank_title_id;

            UPDATE comm_hierarchy
               SET title_id = v_p.rank_title_id
             WHERE id = v_p.membership_id;

            v_home_scheme := comm_scheme_for_department(v_p.department_id);
            IF v_home_scheme = v_run.scheme_id THEN
                -- `designation` mirrors the title's name (titles migration,
                -- 2026-09-01): the payroll export reads it.
                --
                -- hr_staff_respects_ladder (the People org chart's rule,
                -- SQLSTATE 23LAD) may refuse this if the raised title would
                -- stand above the person's reports_to line on the company
                -- ladder. That is a People-chart fact commission cannot
                -- settle, so the apply stops here, says whose line it is, and
                -- the whole month rolls back.
                BEGIN
                    UPDATE hr_staff_costs
                       SET title_id = v_p.rank_title_id,
                           designation = v_title_name
                     WHERE id = v_p.staff_id;
                EXCEPTION WHEN SQLSTATE '23LAD' THEN
                    v_ladder_msg := SQLERRM;
                    RAISE EXCEPTION 'Could not raise %''s title to % — %. Fix their reporting line on People (or where that title sits on the company ladder), then apply again.',
                        v_p.employee_name, v_title_name, v_ladder_msg;
                END;
            END IF;

            INSERT INTO comm_title_promotions (
                run_id, staff_id, period_month, from_title_id, to_title_id, promoted_by
            )
            VALUES (
                p_run_id, v_p.staff_id, v_run.period_month,
                v_p.current_title_id, v_p.rank_title_id, auth.uid()
            );

            v_promoted := v_promoted + 1;
        END IF;
    END LOOP;

    UPDATE comm_runs
       SET status = 'applied', applied_at = NOW(), applied_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'period_month', v_run.period_month,
        'staff_written', v_staff,
        'orders_released', v_released,
        'titles_promoted', v_promoted,
        'total_commission', v_run.total_commission
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_context     TEXT := coalesce(current_setting('app.revenue_commission_write',true),'');
    v_role        TEXT := current_user_role();
    v_run         comm_runs%ROWTYPE;
    v_payroll_run TEXT;
    v_blocked     INTEGER;
    v_zeroed      INTEGER := 0;
    v_dropped     INTEGER := 0;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may reopen a commission run';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status NOT IN ('applied', 'computed') THEN
        RAISE EXCEPTION 'Nothing to reopen — the run is %', v_run.status;
    END IF;

    PERFORM public.assert_commission_payroll_open(v_run.period_month);

    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen that first',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    IF v_run.status = 'applied' THEN
        -- Not zero: what the OTHER sub-departments' applied runs still pay
        -- this person for the month. This run is still 'applied' here, so it
        -- is excluded by id rather than by status.
        PERFORM set_config('app.revenue_commission_write','sync',true);
        WITH remaining AS (
            SELECT p.id, COALESCE((
                 SELECT SUM(os.total_commission)
                   FROM comm_statements os
                   JOIN comm_runs orr ON orr.id = os.run_id
                  WHERE os.staff_id = p.staff_id
                    AND orr.period_month = v_run.period_month
                    AND orr.status IN ('applied', 'locked')
                    AND orr.id <> p_run_id
               ), 0) AS source_amount
              FROM hr_monthly_payroll p
              JOIN comm_statements s ON s.staff_id = p.staff_id
             WHERE s.run_id = p_run_id AND p.period_month = v_run.period_month
               AND p.source = 'commission'
        )
        UPDATE hr_monthly_payroll p
           SET commission_amount = p.commission_amount,
               -- A retained negative offset can exceed the temporarily
               -- remaining source. Preserve the last valid snapshot while
               -- the source is draft; do not clamp money or discard the offset.
               -- Draft runs block adjustment/submission. Apply replaces this
               -- baseline with fresh statement sums, never this saved value.
               commission_synced_amount = CASE
                   WHEN r.source_amount + p.commission_adjustment_amount < 0
                   THEN p.commission_synced_amount ELSE r.source_amount END,
               updated_at = NOW()
          FROM remaining r WHERE p.id = r.id;
        GET DIAGNOSTICS v_zeroed = ROW_COUNT;
        PERFORM set_config('app.revenue_commission_write',v_context,true);

        DELETE FROM comm_order_releases WHERE run_id = p_run_id;
        GET DIAGNOSTICS v_dropped = ROW_COUNT;
    END IF;

    UPDATE comm_runs
       SET status = 'draft', applied_at = NULL, applied_by = NULL,
           reopened_at = NOW(), reopened_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'payroll_rows_zeroed', v_zeroed,
        'releases_dropped', v_dropped
    );
END;
$function$;

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
        OR a.commission_synced_amount IS DISTINCT FROM e.total_commission
        OR a.commission_amount IS DISTINCT FROM a.commission_synced_amount + a.commission_adjustment_amount
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

NOTIFY pgrst, 'reload schema';
