-- Save an inline Revenue payroll row and its reviewed commission adjustment
-- atomically. Existing calculation, source, audit and payment guards remain the
-- authority; this wrapper does not introduce a second monetary formula.
CREATE FUNCTION public.save_revenue_payroll_row(
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
    v_fields text[] := ARRAY[]::text[];
    v_result jsonb;
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
        IF v_key <> ALL (ARRAY['basic_salary','statutory_allowance','non_statutory_allowance',
            'ot_hours','ot_amount','unpaid_leave_days','deduction_amount','skbbk_amount']) THEN
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

    -- This call validates draft/v2, source concurrency, reason and every
    -- funding/PV/period guard before either ordinary input can be written.
    -- Its audit and money changes roll back if the later row update fails.
    v_result := public.adjust_revenue_payroll_commission(
        p_payroll_id,p_gross,p_expected_synced,p_expected_adjustment,p_reason);

    FOR v_key, v_value IN SELECT key,value FROM jsonb_each(p_row_updates) ORDER BY key
    LOOP
        IF (to_jsonb(v_row)->>v_key)::numeric IS DISTINCT FROM (v_value #>> '{}')::numeric THEN
            -- Identifiers are from the exact whitelist above; values remain
            -- SQL parameters. Naming only changed fields avoids a needless
            -- statutory reset when the client includes unchanged Basic.
            v_fields := array_append(v_fields,format('%I = ($1->>%L)::numeric',v_key,v_key));
        END IF;
    END LOOP;
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
