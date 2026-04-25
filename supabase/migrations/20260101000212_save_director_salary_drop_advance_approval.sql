-- ============================================================================
-- Migration 212: save_director_salary_results — drop premature advance approval
-- ============================================================================
-- User decision 2026-04-26 (Bug 1, option ii):
--
-- The advance approval that was inserted unconditionally on Calculate
-- (mig 211 lines 150-159) is removed. Approval at Calculate time was
-- premature — Principal saw a bare RM amount with no salary context, and
-- approving it was a no-op anyway because no cascade handler existed.
--
-- The new flow: advance is implicit in the disbursement PV created at
-- Request Payment time (see mig 213). Principal sees the full PV with
-- "(incl. advance RM X)" callout when relevant, sourced from
-- dept_pool_director (the Director's actual revenue pool, not HR Pool).
-- The PV approval IS the advance approval now — no standalone advance
-- request needed.
--
-- Body otherwise identical to mig 211: 3 JEs (pool funding / 25% invoice
-- split / 5% saving) preserved unchanged. v_advance_total is still tallied
-- and returned in the response so callers can surface "Advance owed" totals
-- on the Calculate result page.
--
-- Pre-existing approval_requests rows of type 'advance' inserted by mig
-- 030/031/044/101/183/201/211 are NOT touched by this migration —
-- intentional. If they need cleanup, do it as a separate one-off.
-- ============================================================================

BEGIN;

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
    v_director_dept_id UUID;
    v_total_ctc_in DECIMAL := 0;
    v_invoice_split_total DECIMAL := 0;
    v_saving_total DECIMAL := 0;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    v_period := (p_data->>'period_month')::DATE;
    v_user_id := auth.uid();
    v_pool := p_data->'pool';

    SELECT id INTO v_director_dept_id FROM departments WHERE name = 'Director' LIMIT 1;
    IF v_director_dept_id IS NULL THEN
        RAISE EXCEPTION 'Director department not found — apply migration 000100 first';
    END IF;

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

    DELETE FROM director_payouts WHERE period_month = v_period AND status = 'draft';
    DELETE FROM dept_pools
    WHERE department_id = v_director_dept_id
      AND period_month = v_period
      AND transaction_type = 'np_in';

    v_total_ctc_in := (v_pool->>'total_ctc_in')::DECIMAL;

    INSERT INTO dept_pools (
        department_id, transaction_type, amount, period_month,
        description, created_by
    ) VALUES (
        v_director_dept_id,
        'np_in',
        v_total_ctc_in,
        v_period,
        'Director revenue pool — ' || to_char(v_period, 'Mon YYYY'),
        v_user_id
    ) RETURNING id INTO v_pool_id;

    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        INSERT INTO director_payouts (
            director_id, period_month, gross_amount,
            saving_amount, after_saving,
            advance_opening_balance, advance_repaid, advance_balance,
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
            COALESCE((v_payout->>'advance_opening_balance')::DECIMAL, 0),
            COALESCE((v_payout->>'advance_repaid')::DECIMAL, 0),
            COALESCE((v_payout->>'advance_balance')::DECIMAL, 0),
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
        v_invoice_split_total := v_invoice_split_total + COALESCE((v_payout->>'invoice_total')::DECIMAL, 0);
        v_saving_total := v_saving_total + COALESCE((v_payout->>'saving_amount')::DECIMAL, 0);
    END LOOP;

    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        IF (v_payout->>'invoice_total')::DECIMAL > 0 THEN
            INSERT INTO invoice_payout_pool (transaction_type, director_id, amount, description)
            VALUES ('accumulate', (v_payout->>'director_id')::UUID,
                    (v_payout->>'invoice_total')::DECIMAL,
                    'Director ' || (v_payout->>'director_code') || ' invoice — ' || to_char(v_period, 'Mon YYYY'));
        END IF;
    END LOOP;

    -- (mig 212) Removed: INSERT INTO approval_requests for 'advance'.
    -- Advance is now part of the disbursement PV at Request Payment (mig 213).

    -- ── 3 JEs (mig 201): pool funding / invoice split / saving ─────────
    IF v_total_ctc_in > 0 THEN
        PERFORM post_journal_entry(
            v_period,
            'Director Pool funded — ' || to_char(v_period, 'Mon YYYY'),
            'salary', v_pool_id, v_user_id,
            jsonb_build_array(
                jsonb_build_object('account_code', '3010',
                                   'debit',  v_total_ctc_in,
                                   'description', 'HV Operating Fund → Director Pool CTC allocation'),
                jsonb_build_object('account_code', '3080',
                                   'credit', v_total_ctc_in,
                                   'description', 'Director Pool funded for period')
            )
        );
    END IF;

    IF v_invoice_split_total > 0 THEN
        PERFORM post_journal_entry(
            v_period,
            'Director 25% invoice split to Invoice Payout Pool — ' || to_char(v_period, 'Mon YYYY'),
            'salary', v_pool_id, v_user_id,
            jsonb_build_array(
                jsonb_build_object('account_code', '3080',
                                   'debit',  v_invoice_split_total,
                                   'description', 'Director Pool → Invoice Payout Pool (25% split)'),
                jsonb_build_object('account_code', '3060',
                                   'credit', v_invoice_split_total,
                                   'description', 'Invoice Payout Pool accumulated')
            )
        );
    END IF;

    IF v_saving_total > 0 THEN
        PERFORM post_journal_entry(
            v_period,
            'Director 5% Saving reclassified — ' || to_char(v_period, 'Mon YYYY'),
            'salary', v_pool_id, v_user_id,
            jsonb_build_array(
                jsonb_build_object('account_code', '3080',
                                   'debit',  v_saving_total,
                                   'description', 'Director Pool → Director Saving Fund (5%)'),
                jsonb_build_object('account_code', '3020',
                                   'credit', v_saving_total,
                                   'description', 'Director Saving Fund accumulated')
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;

COMMENT ON FUNCTION save_director_salary_results IS
    'Mig 212: same as mig 211 minus the premature advance approval INSERT. Calculate stage no longer pings Principal — advance flows through the disbursement PV at Request Payment instead (see mig 213).';

COMMIT;
