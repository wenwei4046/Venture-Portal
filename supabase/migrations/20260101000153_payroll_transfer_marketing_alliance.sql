-- ============================================================================
-- 20260101000153_payroll_transfer_marketing_alliance.sql
-- Task 3 — Marketing Dept Pool support in payroll_bank_transfer fan-out
-- HOUZS Venture Portal
--
-- fan_out_payroll_bank_transfer previously skipped dept_pool_* sources with
-- a NOTICE, which meant Marketing staff payroll couldn't come out of the
-- Marketing Dept Pool — alliance_bank_pool wouldn't get the Marketing
-- portion credited. The new Generate PV 4-row preview (HR / Finance /
-- Director Office / Marketing) needs Marketing to work end-to-end.
--
-- Change: dept_pool_* sources now contribute to the alliance_bank_pool
-- credit. The dept_pools debit itself still happens through adjustPool in
-- the app layer (keeps the existing Venture Pool auto-credit flow intact
-- for non-payroll vouchers — that's pre-existing behavior the trigger
-- doesn't touch).
-- ============================================================================

CREATE OR REPLACE FUNCTION fan_out_payroll_bank_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor         UUID;
    v_period        DATE;
    r_src           RECORD;
    v_debits_total  DECIMAL(15, 2) := 0;
BEGIN
    IF NEW.voucher_type <> 'payroll_bank_transfer'
       OR NEW.status <> 'paid'
       OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
        RETURN NEW;
    END IF;

    v_actor := COALESCE(NEW.approved_by, NEW.created_by);
    v_period := COALESCE(NEW.payment_date, CURRENT_DATE);
    v_period := DATE_TRUNC('month', v_period)::DATE;

    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        IF r_src.pool IN ('hr_opex', 'finance_opex', 'director_opex') THEN
            INSERT INTO operating_pools (
                pool_type, transaction_type, amount,
                reference_type, reference_id,
                period_month, description, created_by
            ) VALUES (
                r_src.pool::operating_pool_type,
                'transfer_out',
                r_src.amount,
                'payment_voucher', NEW.id,
                v_period,
                'Transfer to Alliance — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
                v_actor
            );
            v_debits_total := v_debits_total + r_src.amount;
        ELSIF r_src.pool LIKE 'dept_pool_%' THEN
            -- dept_pools debit is handled in the app layer (adjustPool), so
            -- we only tally the contribution toward the alliance credit.
            v_debits_total := v_debits_total + r_src.amount;
        ELSE
            RAISE NOTICE 'fan_out_payroll_bank_transfer: skipping unknown pool %', r_src.pool;
        END IF;
    END LOOP;

    IF v_debits_total > 0 THEN
        INSERT INTO alliance_bank_pool (
            transaction_type, amount,
            reference_type, reference_id,
            period_month, description, created_by
        ) VALUES (
            'transfer_in', v_debits_total,
            'payment_voucher', NEW.id,
            v_period,
            'Transfer from dept + OPEX pools — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fan_out_payroll_bank_transfer IS
    'Task 3: extended to count dept_pool_* sources toward the alliance credit total. Operating pools debit inside the trigger; dept_pools debit stays in app-layer adjustPool. Marketing staff payroll can now route through Marketing Dept Pool.';
