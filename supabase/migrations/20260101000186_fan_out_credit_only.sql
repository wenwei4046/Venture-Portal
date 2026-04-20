-- ============================================================================
-- 20260101000186_fan_out_credit_only.sql
-- Phase 9 bug fix — stop double-draining dept pools on Stage F.
--
-- Background: fan_out_payroll_bank_transfer (migration 167) was doing both
-- (a) the per-source expense_out INSERT and (b) the HR consolidation np_in
-- INSERT. Since migration 171 introduced apply_pool_adjustment as the single
-- drain entry point for every PV approval, the trigger's drain step became
-- a second, overlapping INSERT — each source dept pool was debited twice.
--
-- This matches the user's Stage A–G payroll spec (2026-04-17): Stage F PV
-- approval moves money from each source dept pool into HR Pool exactly
-- once. Trigger now does ONLY the HR credit. apply_pool_adjustment handles
-- the drain as it does for every other PV type.
--
-- approval_id lookup removed — np_in rows do not trigger the dept_pools
-- expense_has_approval CHECK (only expense_out rows do).
-- ============================================================================

BEGIN;

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
    v_hr_dept_id    UUID;
    v_inbound_total DECIMAL(15, 2) := 0;
BEGIN
    IF NEW.voucher_type <> 'payroll_bank_transfer'
       OR NEW.status <> 'paid'
       OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
        RETURN NEW;
    END IF;

    v_actor  := COALESCE(NEW.approved_by, NEW.created_by);
    v_period := DATE_TRUNC('month', COALESCE(NEW.payment_date, CURRENT_DATE))::DATE;

    SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'HR';
    IF v_hr_dept_id IS NULL THEN
        RAISE EXCEPTION 'fan_out_payroll_bank_transfer: HR department not found';
    END IF;

    -- Sum the non-HR sources to know how much to credit HR Pool.
    -- Per-source expense_out drain is handled by apply_pool_adjustment
    -- (migration 171 / 179 / 182) — NOT re-done here.
    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        IF r_src.pool = 'dept_pool_hr' THEN
            CONTINUE;
        END IF;

        IF r_src.pool NOT IN (
            'dept_pool_finance',
            'dept_pool_director_office',
            'dept_pool_marketing',
            'dept_pool_director'
        ) THEN
            RAISE NOTICE 'fan_out_payroll_bank_transfer: skipping unknown pool %', r_src.pool;
            CONTINUE;
        END IF;

        v_inbound_total := v_inbound_total + r_src.amount;
    END LOOP;

    IF v_inbound_total > 0 THEN
        INSERT INTO dept_pools (
            department_id, transaction_type, amount,
            period_month, description, created_by
        ) VALUES (
            v_hr_dept_id, 'np_in', v_inbound_total,
            v_period,
            'Payroll consolidation from Dept Pools — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fan_out_payroll_bank_transfer IS
    'Phase 9 (mig 186, credit-only): sums non-HR source amounts and credits HR Pool (np_in). Per-source expense_out drain is done by apply_pool_adjustment — this trigger no longer duplicates it. Matches Stage F of the payroll Stage A-G spec.';

COMMIT;
