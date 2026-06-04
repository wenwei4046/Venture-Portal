-- ============================================================================
-- Migration 281: Director Salary "Fully Paid" mode + invoice-pool recalc fix
--                (user 2026-06-04, R5)
-- ============================================================================
-- 1. director_payouts.payout_mode — 'split' (default, classic 75/25) or
--    'fully_paid' (only the 5% saving is deducted; the remaining 95% is paid
--    as ONE standard payroll; invoice columns are all 0, nothing accumulates
--    into invoice_payout_pool). The TS engine (src/lib/salary.ts) computes
--    both modes; this column records which one produced the row.
--
-- 2. invoice_payout_pool.period_month — BUG FIX. save_director_salary_results
--    deletes draft director_payouts on every recalculation but NEVER deleted
--    the matching invoice_payout_pool 'accumulate' rows, so each Save &
--    Calculate duplicated the 25% accumulation. Rows had no period column to
--    key the cleanup on. Now:
--      * accumulate rows written by the RPC carry period_month
--      * the RPC deletes prior accumulate rows for the period before
--        re-inserting
--      * manually-seeded opening rows (period_month NULL) are never touched
--    Backfill: the four Jun 2026 rows written by today's calculation get
--    period_month = 2026-06-01 (matched on the RPC's description format).
--
-- 3. save_director_salary_results updated accordingly (lineage:
--    30/31 → 101 → 201 → 211 → 212 → 265 → 268 → THIS).
-- ============================================================================

BEGIN;

ALTER TABLE director_payouts
    ADD COLUMN payout_mode TEXT NOT NULL DEFAULT 'split'
    CHECK (payout_mode IN ('split', 'fully_paid'));

COMMENT ON COLUMN director_payouts.payout_mode IS
    'Mig 281: split = 75% payroll / 25% invoice (classic); fully_paid = 95% '
    'paid as one standard payroll (only 5% saving deducted), invoice side 0.';

ALTER TABLE invoice_payout_pool ADD COLUMN period_month DATE;

COMMENT ON COLUMN invoice_payout_pool.period_month IS
    'Mig 281: calculation period for accumulate rows written by '
    'save_director_salary_results — keys the delete-before-reinsert on '
    'recalculation. NULL for manual/opening rows (never auto-deleted).';

-- Backfill the period-tagged rows from the current calculation cycle.
UPDATE invoice_payout_pool
   SET period_month = DATE '2026-06-01'
 WHERE transaction_type = 'accumulate'
   AND period_month IS NULL
   AND description LIKE 'Director % invoice — Jun 2026';

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

    -- (mig 281) Clear this period's prior 25% accumulation before
    -- re-inserting — recalculation used to duplicate these rows. Opening /
    -- manual rows (period_month IS NULL) are untouched.
    DELETE FROM invoice_payout_pool
     WHERE transaction_type = 'accumulate'
       AND period_month = v_period;

    FOR v_payout IN SELECT * FROM jsonb_array_elements(p_data->'payouts')
    LOOP
        INSERT INTO director_payouts (
            director_id, period_month, payout_mode, gross_amount,
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
            COALESCE(v_payout->>'payout_mode', 'split'),
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
            INSERT INTO invoice_payout_pool (transaction_type, director_id, amount, description, period_month)
            VALUES ('accumulate', (v_payout->>'director_id')::UUID,
                    (v_payout->>'invoice_total')::DECIMAL,
                    'Director ' || (v_payout->>'director_code') || ' invoice — ' || to_char(v_period, 'Mon YYYY'),
                    v_period);
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;

COMMENT ON FUNCTION save_director_salary_results IS
    'Mig 281: writes payout_mode (split | fully_paid); accumulate rows into '
    'invoice_payout_pool now carry period_month and are delete-before-'
    'reinserted on recalculation (fixes the duplicate-accumulation bug). '
    'fully_paid payouts have invoice_total=0 so nothing accumulates. '
    'Otherwise identical to mig 268.';

COMMIT;
