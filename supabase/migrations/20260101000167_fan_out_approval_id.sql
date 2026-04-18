-- ============================================================================
-- 20260101000167_fan_out_approval_id.sql
-- Fix: fan_out_payroll_bank_transfer was inserting expense_out rows into
-- dept_pools without approval_id, which violates dept_pools' expense_has_approval
-- CHECK constraint (migration 6, line 45). Surfaced as:
--   "Failed to execute voucher: new row for relation 'dept_pools' violates
--    check constraint 'expense_has_approval'"
-- HOUZS Venture Portal — 2026-04-19.
--
-- Fix: look up the payment_voucher's approved approval_request and pass its id
-- into each expense_out INSERT. Same voucher == same approval for all sources.
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
    v_hr_dept_id    UUID;
    v_src_dept_id   UUID;
    v_approval_id   UUID;
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

    -- Look up the approved approval_request for this voucher — required
    -- because dept_pools.expense_has_approval CHECK enforces approval_id
    -- NOT NULL on every expense_out row.
    SELECT id INTO v_approval_id
      FROM approval_requests
     WHERE reference_id = NEW.id
       AND reference_table = 'payment_vouchers'
       AND status = 'approved'
     ORDER BY approved_at DESC NULLS LAST
     LIMIT 1;

    IF v_approval_id IS NULL THEN
        RAISE EXCEPTION 'fan_out_payroll_bank_transfer: no approved approval_request found for voucher %', NEW.id;
    END IF;

    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        IF r_src.pool = 'dept_pool_hr' THEN
            CONTINUE;
        END IF;

        v_src_dept_id := CASE r_src.pool
            WHEN 'dept_pool_finance'         THEN (SELECT id FROM departments WHERE name = 'Finance')
            WHEN 'dept_pool_director_office' THEN (SELECT id FROM departments WHERE name = 'Director Office')
            WHEN 'dept_pool_marketing'       THEN (SELECT id FROM departments WHERE name = 'Marketing')
            WHEN 'dept_pool_director'        THEN (SELECT id FROM departments WHERE name = 'Director')
            ELSE NULL
        END;

        IF v_src_dept_id IS NULL THEN
            RAISE NOTICE 'fan_out_payroll_bank_transfer: skipping unknown pool %', r_src.pool;
            CONTINUE;
        END IF;

        INSERT INTO dept_pools (
            department_id, transaction_type, amount,
            approval_id,
            period_month, description, created_by
        ) VALUES (
            v_src_dept_id, 'expense_out', r_src.amount,
            v_approval_id,
            v_period,
            'Payroll consolidation to HR Pool — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );
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
    'Stage 6b + fix: payroll PV consolidation debits non-HR Dept Pools (expense_out, approval_id linked to the voucher''s approval_request) and credits HR Dept Pool (np_in) with the sum.';
