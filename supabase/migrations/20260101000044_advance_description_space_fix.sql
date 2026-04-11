-- P-APPR-01: advance description format had ': RM' with no space after RM,
-- producing strings like "Director advance top-up for Apr 2026: RM23,863.12"
-- which looks broken in the /approvals list. Re-create
-- save_director_salary_results with ': RM ' (space added). Rest of the
-- function body is identical to migration 31.

CREATE OR REPLACE FUNCTION save_director_salary_results(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_user_id UUID;
    v_payout JSONB;
    v_pool JSONB;
    v_saved_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_advance_total DECIMAL := 0;
    v_pool_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    v_period := (p_data->>'period_month')::DATE;
    v_user_id := auth.uid();
    v_pool := p_data->'pool';

    -- Check for confirmed/paid payouts
    SELECT COUNT(*) INTO v_skipped_count
    FROM director_payouts
    WHERE period_month = v_period AND status IN ('confirmed', 'paid');

    IF v_skipped_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot recalculate: ' || v_skipped_count || ' payouts already confirmed/paid',
            'skipped', v_skipped_count
        );
    END IF;

    -- Delete existing drafts
    DELETE FROM director_payouts WHERE period_month = v_period AND status = 'draft';
    DELETE FROM salary_pool WHERE period_month = v_period;

    -- Insert salary pool
    INSERT INTO salary_pool (
        period_month, total_ctc_in, total_pool,
        basic_ratio, kpi_ratio, allowance_ratio,
        total_saving, total_statutory_surplus
    ) VALUES (
        v_period,
        (v_pool->>'total_ctc_in')::DECIMAL,
        (v_pool->>'total_pool')::DECIMAL,
        (v_pool->>'basic_ratio')::DECIMAL,
        (v_pool->>'kpi_ratio')::DECIMAL,
        (v_pool->>'allowance_ratio')::DECIMAL,
        (p_data->>'total_saving')::DECIMAL,
        (p_data->>'total_statutory_surplus')::DECIMAL
    ) RETURNING id INTO v_pool_id;

    -- Insert director payouts
    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        INSERT INTO director_payouts (
            director_id, period_month, gross_amount,
            saving_amount, after_saving,
            payroll_calc, advance_amount, payroll_gross,
            payroll_bk, payroll_allow,
            payroll_epf_er, payroll_epf_ee,
            payroll_socso_er, payroll_socso_ee,
            payroll_eis_er, payroll_eis_ee,
            payroll_pcb, payroll_net,
            invoice_base, invoice_bk,
            invoice_epf_er, invoice_socso_er, invoice_eis_er,
            invoice_total,
            statutory_er_in, statutory_er_out, statutory_surplus,
            calculation_snapshot,
            status, created_by
        ) VALUES (
            (v_payout->>'director_id')::UUID, v_period,
            (v_payout->>'gross_amount')::DECIMAL,
            (v_payout->>'saving_amount')::DECIMAL,
            (v_payout->>'after_saving')::DECIMAL,
            (v_payout->>'payroll_calc')::DECIMAL,
            (v_payout->>'advance_amount')::DECIMAL,
            (v_payout->>'payroll_gross')::DECIMAL,
            (v_payout->>'payroll_bk')::DECIMAL,
            (v_payout->>'payroll_allow')::DECIMAL,
            (v_payout->>'payroll_epf_er')::DECIMAL,
            (v_payout->>'payroll_epf_ee')::DECIMAL,
            (v_payout->>'payroll_socso_er')::DECIMAL,
            (v_payout->>'payroll_socso_ee')::DECIMAL,
            (v_payout->>'payroll_eis_er')::DECIMAL,
            (v_payout->>'payroll_eis_ee')::DECIMAL,
            (v_payout->>'payroll_pcb')::DECIMAL,
            (v_payout->>'payroll_net')::DECIMAL,
            (v_payout->>'invoice_base')::DECIMAL,
            (v_payout->>'invoice_bk')::DECIMAL,
            (v_payout->>'invoice_epf_er')::DECIMAL,
            (v_payout->>'invoice_socso_er')::DECIMAL,
            (v_payout->>'invoice_eis_er')::DECIMAL,
            (v_payout->>'invoice_total')::DECIMAL,
            (v_payout->>'statutory_er_in')::DECIMAL,
            (v_payout->>'statutory_er_out')::DECIMAL,
            (v_payout->>'statutory_surplus')::DECIMAL,
            v_payout->'calculation_snapshot',
            'draft', v_user_id
        );
        v_saved_count := v_saved_count + 1;
        v_advance_total := v_advance_total + COALESCE((v_payout->>'advance_amount')::DECIMAL, 0);
    END LOOP;

    -- HV Operating Fund: saving
    IF (p_data->>'total_saving')::DECIMAL > 0 THEN
        INSERT INTO hv_operating_fund (transaction_type, amount, description, reference_table, created_by)
        VALUES ('saving_in', (p_data->>'total_saving')::DECIMAL,
                'Director salary 5% saving — ' || to_char(v_period, 'Mon YYYY'),
                'salary_pool', v_user_id);
    END IF;

    -- HV Operating Fund: surplus/deficit
    IF (p_data->>'total_statutory_surplus')::DECIMAL > 0 THEN
        INSERT INTO hv_operating_fund (transaction_type, amount, description, reference_table, created_by)
        VALUES ('surplus_in', (p_data->>'total_statutory_surplus')::DECIMAL,
                'Statutory surplus — ' || to_char(v_period, 'Mon YYYY'),
                'director_payouts', v_user_id);
    ELSIF (p_data->>'total_statutory_surplus')::DECIMAL < 0 THEN
        INSERT INTO hv_operating_fund (transaction_type, amount, description, reference_table, created_by)
        VALUES ('deficit_out', ABS((p_data->>'total_statutory_surplus')::DECIMAL),
                'Statutory deficit — ' || to_char(v_period, 'Mon YYYY'),
                'director_payouts', v_user_id);
    END IF;

    -- Invoice Payout Pool
    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        IF (v_payout->>'invoice_total')::DECIMAL > 0 THEN
            INSERT INTO invoice_payout_pool (transaction_type, director_id, amount, description)
            VALUES ('accumulate', (v_payout->>'director_id')::UUID,
                    (v_payout->>'invoice_total')::DECIMAL,
                    'Director ' || (v_payout->>'director_code') || ' invoice — ' || to_char(v_period, 'Mon YYYY'));
        END IF;
    END LOOP;

    -- Advance approval (reference_id = salary_pool ID)
    -- P-APPR-01: added space after 'RM' so description reads
    -- "Director advance top-up for Apr 2026: RM 23,863.12" (not "RM23,863.12")
    IF v_advance_total > 0 THEN
        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount, status, workflow_state
        ) VALUES (
            'advance', v_pool_id, 'salary_pool', v_user_id,
            'Director advance top-up for ' || to_char(v_period, 'Mon YYYY') || ': RM ' || to_char(v_advance_total, 'FM999,999.00'),
            v_advance_total, 'pending', 'submitted'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;
