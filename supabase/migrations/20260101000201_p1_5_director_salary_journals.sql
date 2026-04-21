-- Mig 201: P1-5 fix — save_director_salary_results posts 3 JEs
--
-- Drift
-- -----
-- save_director_salary_results (mig 183) writes dept_pools np_in for the
-- Director Pool, per-payout director_payouts rows, and invoice_payout_pool
-- accumulate rows for the 25% invoice split — all without journal entries.
-- The 5% saving stays as a column on director_payouts (saving_amount) and
-- is never reclassified out of Director Pool equity. Net effect: Director
-- Pool (3080), Invoice Payout Pool (3060), and Director Saving Fund (3020)
-- equity accounts never move in the GL.
--
-- Fix — three journal entries at save time
-- ----------------------------------------
-- (1) Pool funding:
--     dr 3010 HV Operating Fund  (total_ctc_in)
--     cr 3080 Director Pool      (total_ctc_in)
--     reference_type='salary', description includes period.
--     HV reclassifies equity from operating fund into the Director Pool
--     for this period's CTC allocation. Subs → HV cash leg is separate
--     (Fund IN, journalled in its own path).
--
-- (2) 25% invoice split (aggregate across all payouts with invoice_total>0):
--     dr 3080 Director Pool      (sum of invoice_total)
--     cr 3060 Invoice Payout Pool(sum of invoice_total)
--     Moves the 25% portion into the Invoice Payout Pool until Principal
--     releases it via invoice_pool_release.
--
-- (3) 5% saving (aggregate across all payouts):
--     dr 3080 Director Pool      (sum of saving_amount)
--     cr 3020 Director Saving Fund(sum of saving_amount)
--     Reclassifies the reserved 5% out of the Director Pool into the
--     Director Saving Fund for long-term tracking.
--
-- Body verbatim from mig 183; only the JE blocks are added. Safe to re-run
-- per period because existing delete-and-reinsert logic preserves
-- idempotency — and the three JE rows just add to history on each run.

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

    IF v_advance_total > 0 THEN
        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount, status, workflow_state
        ) VALUES (
            'advance', v_pool_id, 'dept_pools', v_user_id,
            'Director advance top-up for ' || to_char(v_period, 'Mon YYYY') || ': RM ' || to_char(v_advance_total, 'FM999,999.00'),
            v_advance_total, 'pending', 'submitted'
        );
    END IF;

    -- ── Mig 201: post 3 JEs for the pool + splits ─────────────────────
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
    'Mig 201 (P1-5 drift fix): posts 3 JEs — Director Pool funding (dr 3010/cr 3080), 25% invoice split (dr 3080/cr 3060), 5% saving (dr 3080/cr 3020). Body otherwise identical to mig 183.';

COMMIT;
