-- Mig 268: save_director_salary_results — drop the dept_pools(np_in) write.
--
-- Cash-basis fix for /dept-pool. Per the 2026-05-18 dept-pool-cash-accrual
-- design spec, every dept pool's `np_in` is supposed to land via the
-- credit_dept_pool_on_invoice_paid trigger (mig 202) — i.e. only when an
-- actual billing_payment voucher reaches status='paid'. That's how
-- Marketing / HR / Finance / Director Office already behave.
--
-- Director was the lone exception: mig 265 (and predecessors back to 101)
-- wrote a dept_pools(np_in) row at Save & Calculate time with
-- amount = total_ctc_in. That row was the *calculated* / phantom inflow,
-- not actual cash, so /dept-pool's "IN (to date)" for Director showed the
-- full month CTC even before a single bill was issued.
--
-- Worse, the RPC's `DELETE FROM dept_pools WHERE period_month = v_period
-- AND transaction_type = 'np_in'` (intended to clear the prior calc)
-- collaterally wiped the bank-recon opening row written by mig 262
-- (Opening cash 18,673.62) + the +590 PV-000077 correction from mig 263,
-- because they also live as np_in rows on period 2026-05-01.
--
-- This migration drops both the DELETE-old + INSERT-new dept_pools rows
-- from save_director_salary_results. All other behaviour is identical to
-- mig 265:
--   * director_payouts inserts (per-director draft rows)
--   * invoice_payout_pool inserts (25% accumulation)
--
-- After this:
--   * /dept-pool · Director IN = sum of paid billing_payment vouchers
--     with billing_mode='director_attribution' — actual cash received.
--   * /director-pool Pool balance (np_in - expense_out) follows the same
--     cash-basis semantic. The "Total Pool = Saving + Invoice - Advance"
--     hero on /director-pool is unaffected (reads director_payouts).
--   * Salary engine output is unchanged (director_payouts table is the
--     source of truth, untouched).
--
-- One-time data correction also applied alongside this migration (not in
-- the BEGIN/COMMIT, run separately): remove the phantom
-- 'Director revenue pool — May 2026' np_in row and restore the bank-recon
-- opening that previous Save & Calculate had wiped.

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

    -- (mig 268) Removed: DELETE + INSERT into dept_pools(np_in). That row
    -- now lands via credit_dept_pool_on_invoice_paid trigger (mig 202) when
    -- each billing_payment voucher reaches status='paid'. Matches the
    -- cash-basis semantic the other 4 dept pools already use.

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

    RETURN jsonb_build_object(
        'success', true, 'saved', v_saved_count,
        'skipped', v_skipped_count, 'advance_total', v_advance_total,
        'period', v_period
    );
END;
$$;

COMMENT ON FUNCTION save_director_salary_results IS
    'Mig 268: same as mig 265 minus the dept_pools(np_in) write. The np_in row now lands via credit_dept_pool_on_invoice_paid trigger (mig 202) when a billing_payment voucher for billing_mode=director_attribution reaches status=paid — matching the cash-basis semantic of the other 4 dept pools (per 2026-05-18 dept-pool-cash-accrual-basis-design spec).';

COMMIT;
