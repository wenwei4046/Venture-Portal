-- ============================================================================
-- 20260101000138_payroll_bank_transfer_trigger.sql
-- Spec 4 (HR Payroll Redesign) — fan-out trigger for payroll_bank_transfer
-- HOUZS Venture Portal
--
-- Enum value added in migration 136 (separate transaction — Postgres
-- requirement). This migration defines the trigger that reacts to a
-- payroll_bank_transfer voucher flipping to 'paid': debit each source
-- operating_pool, credit alliance_bank_pool with the total.
--
-- Pool names in payment_voucher_sources.pool (TEXT):
--   'hr_opex' / 'finance_opex' / 'director_opex' → operating_pools debit
--   anything else → skipped with a NOTICE (dept_pools / hv_operating_fund
--   are deferred — Finance would use internal_transfer for those).
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
            'Transfer from OPEX pools — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fan_out_payroll_bank_transfer IS
    'Spec 4: on payroll_bank_transfer voucher paid, debits each source operating_pool and credits alliance_bank_pool with the total. SECURITY DEFINER.';

CREATE TRIGGER trg_fan_out_payroll_bank_transfer
    AFTER INSERT OR UPDATE OF status ON payment_vouchers
    FOR EACH ROW
    WHEN (NEW.status = 'paid' AND NEW.voucher_type = 'payroll_bank_transfer')
    EXECUTE FUNCTION fan_out_payroll_bank_transfer();
