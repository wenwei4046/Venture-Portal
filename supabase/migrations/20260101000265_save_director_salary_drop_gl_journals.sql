-- ============================================================================
-- Migration 265: save_director_salary_results — drop GL journal posts
-- ============================================================================
-- After the COA rebuild (migs 257-264, especially mig 261's "drop pool-payable
-- reclass" — commit afdc25d), the four accounts that mig 212's GL journals
-- referenced are gone or repurposed:
--
--   3080  Director Pool             → REMOVED (replaced by 4080 in mig 258,
--                                     then deactivated by mig 261)
--   3010  HV Operating Fund         → now "Cash & Bank - Alliance (HR)"
--   3020  Director Saving Fund      → now "Loans Receivable"
--                                     (Saving Fund moved to 1020)
--   3060  Invoice Payout Pool       → now "Interest in Suspense - Receivable"
--                                     (Invoice Pool moved to 1080)
--
-- journal_lines.account_code has a FK to chart_of_accounts.code. The first
-- JE block (pool funding, 3010 Dr / 3080 Cr) violates the FK on 3080, the
-- RPC throws, and Next.js production masks the message to "Server Components
-- render" on Save & Calculate.
--
-- Per HANDOFF's reports architecture ("Income Statement / Balance Sheet /
-- Cash Flow are built from OPERATIONAL subledgers — NOT raw GL"), the 3 GL
-- journals added by mig 201 and preserved through 211/212 are not consumed
-- by any report. The operational state lives in:
--   * dept_pools(Director, np_in)         — Director revenue pool inflow
--   * director_payouts                    — per-director gross/saving/payroll/invoice
--   * invoice_payout_pool                 — 25% invoice accumulation
-- and the Director GL segment (mig 261's gl_segment='director') captures the
-- income-statement view from the operational invoice/PV flow.
--
-- This migration drops the 3 GL journal blocks from save_director_salary_results.
-- All other behaviour is identical to mig 212.
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
    v_director_dept_id UUID;
    v_total_ctc_in DECIMAL := 0;
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
    );

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

    -- (mig 265) Removed: 3 GL journal posts (pool funding 3010/3080,
    -- 25% invoice split 3080/3060, 5% saving 3080/3020). All four accounts
    -- were removed or repurposed by the COA rebuild (migs 257-264).
    -- Operational subledgers (dept_pools, director_payouts,
    -- invoice_payout_pool) + the Director GL segment carry the data CFO
    -- reports need.

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;

COMMENT ON FUNCTION save_director_salary_results IS
    'Mig 265: same as mig 212 minus the 3 GL journal posts. The pool-funding / 25%-invoice-split / 5%-saving JEs referenced accounts (3010/3020/3060/3080) removed or repurposed by the COA rebuild (migs 257-264, esp. mig 261 dropping the pool-payable reclass). Director salary state is fully captured by operational subledgers (dept_pools(Director, np_in), director_payouts, invoice_payout_pool) and surfaced in reports via the Director GL segment.';

COMMIT;
