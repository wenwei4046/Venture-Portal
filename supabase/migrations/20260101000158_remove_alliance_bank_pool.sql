-- ============================================================================
-- 20260101000158_remove_alliance_bank_pool.sql
-- Stage 5: remove alliance_bank_pool from the model. Consolidation now
-- routes through HR Department Pool (operating_pools.hr_opex) — user's
-- 6-pool model has no separate payroll disbursement pool.
-- HOUZS Venture Portal
--
-- What changes:
--   1. fan_out_payroll_bank_transfer trigger — credit operating_pools
--      (pool_type='hr_opex', transaction_type='transfer_in') instead of
--      alliance_bank_pool. Skip the transfer_out for hr_opex itself (source
--      = destination; money stays in place) — only other sources get
--      transfer_out.
--   2. create_payroll_disbursement_vouchers — source_pool on each per-staff
--      voucher becomes 'hr_opex' instead of 'alliance_bank_pool'.
--   3. payroll_payment_requests.target_pool default becomes 'hr_opex'.
--   4. Existing pool-identifier string values in payment_vouchers /
--      payment_voucher_sources / payroll_payment_requests get UPDATEd from
--      'alliance_bank_pool' to 'hr_opex'.
--   5. DROP the alliance_bank_pool table, balance view, enum, and the
--      sufficiency-check trigger + function. Bye.
--
-- What DOESN'T change in this migration (do in TS):
--   - `adjustPool` in src/app/(portal)/payments/actions.ts needs a new
--     branch for 'hr_opex' / operating_pools, otherwise disbursement
--     vouchers' debits never post. Addressed in the TS diff alongside
--     this migration.
--
-- Safety: user confirmed test data only, portal not live.
-- ============================================================================

-- ── 1. Rewrite fan_out_payroll_bank_transfer to target hr_opex ─────────────

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
    v_inbound_total DECIMAL(15, 2) := 0;
BEGIN
    IF NEW.voucher_type <> 'payroll_bank_transfer'
       OR NEW.status <> 'paid'
       OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
        RETURN NEW;
    END IF;

    v_actor  := COALESCE(NEW.approved_by, NEW.created_by);
    v_period := DATE_TRUNC('month', COALESCE(NEW.payment_date, CURRENT_DATE))::DATE;

    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        -- Source = destination (hr_opex): money stays in place, no ledger row.
        -- Tally contribution so we know how much to credit hr_opex from others
        -- is zero for that share.
        IF r_src.pool = 'hr_opex' THEN
            CONTINUE;
        END IF;

        -- Other operating pools debit themselves; amount flows TO hr_opex.
        IF r_src.pool IN ('finance_opex', 'director_opex') THEN
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
                'Payroll consolidation to HR Pool — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
                v_actor
            );
            v_inbound_total := v_inbound_total + r_src.amount;

        -- dept_pool_* sources (Marketing, Director) — debit handled in the
        -- app layer (adjustPool in payments/actions.ts); here we only tally
        -- the contribution toward the hr_opex credit.
        ELSIF r_src.pool LIKE 'dept_pool_%' THEN
            v_inbound_total := v_inbound_total + r_src.amount;

        ELSE
            RAISE NOTICE 'fan_out_payroll_bank_transfer: skipping unknown pool %', r_src.pool;
        END IF;
    END LOOP;

    -- Credit hr_opex with the sum of non-hr_opex contributions. If the only
    -- source was hr_opex itself, v_inbound_total is 0 and we skip.
    IF v_inbound_total > 0 THEN
        INSERT INTO operating_pools (
            pool_type, transaction_type, amount,
            reference_type, reference_id,
            period_month, description, created_by
        ) VALUES (
            'hr_opex'::operating_pool_type,
            'transfer_in',
            v_inbound_total,
            'payment_voucher', NEW.id,
            v_period,
            'Payroll consolidation from dept + OPEX pools — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fan_out_payroll_bank_transfer IS
    'Stage 5: payroll PV consolidation credits hr_opex (HR Dept Pool) instead of alliance_bank_pool. hr_opex source contributions stay in place (source = destination); finance_opex / director_opex debit themselves; dept_pool_* debits run in the app layer.';

-- ── 2. Rewrite create_payroll_disbursement_vouchers — source_pool = hr_opex ─

CREATE OR REPLACE FUNCTION create_payroll_disbursement_vouchers(
    p_period DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_group_id UUID;
    v_row RECORD;
    v_voucher_no TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_voucher_period TEXT;
    v_count INTEGER := 0;
    v_total DECIMAL(15, 2) := 0;
    v_existing INTEGER;
    v_run_status TEXT;
    v_request_status TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT status INTO v_run_status
    FROM payroll_runs
    WHERE period_month = p_period;

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Need Principal approval of costing before disbursement.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE period_month = p_period)
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'HR Pool is not funded for period %. Wait for the funding PV to be approved and executed.', p_period;
    END IF;

    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    JOIN hr_monthly_payroll mp ON mp.id::text = pv.reference_id::text
    WHERE pv.reference_type = 'payroll_disbursement'
      AND mp.period_month = p_period;

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % existing).', p_period, v_existing;
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    FOR v_row IN
        SELECT
            mp.id AS payroll_id,
            mp.staff_id,
            mp.net,
            s.employee_name,
            s.bank_account_no,
            s.bank_name,
            d.name AS dept_name
        FROM hr_monthly_payroll mp
        JOIN hr_staff_costs s ON s.id = mp.staff_id
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE mp.period_month = p_period
          AND mp.net > 0
        ORDER BY s.employee_name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool,
            reference_type, reference_id,
            created_by
        ) VALUES (
            v_voucher_no, 'other', 'debit', 'pending_approval',
            v_row.net, 'MYR',
            v_row.employee_name,
            'Payroll disbursement ' || to_char(p_period, 'Mon YYYY') ||
                ' — ' || v_row.employee_name ||
                COALESCE(' (' || v_row.dept_name || ')', ''),
            'bank_transfer', CURRENT_DATE,
            'hr_opex',
            'payroll_disbursement', v_row.payroll_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'hr_opex', v_row.net);

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount,
            status, workflow_state, group_id
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers',
            v_caller,
            v_voucher_no || ': ' || v_row.employee_name ||
                ' — RM ' || to_char(v_row.net, 'FM999,999.00'),
            v_row.net,
            'pending', 'submitted', v_group_id
        );

        v_count := v_count + 1;
        v_total := v_total + v_row.net;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No payroll rows with net > 0 found for period %.', p_period;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'count', v_count,
        'total', v_total
    );
END;
$$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(DATE) IS
    'Stage 5: per-staff disbursement vouchers draw from hr_opex (HR Dept Pool) instead of alliance_bank_pool. adjustPool in payments/actions.ts handles the debit.';

GRANT EXECUTE ON FUNCTION create_payroll_disbursement_vouchers(DATE) TO authenticated;

-- ── 3. Update payroll_payment_requests default + migrate existing values ───

ALTER TABLE payroll_payment_requests
    ALTER COLUMN target_pool SET DEFAULT 'hr_opex';

UPDATE payroll_payment_requests
   SET target_pool = 'hr_opex'
 WHERE target_pool = 'alliance_bank_pool';

UPDATE payment_vouchers
   SET target_pool = 'hr_opex'
 WHERE target_pool = 'alliance_bank_pool';

UPDATE payment_vouchers
   SET source_pool = 'hr_opex'
 WHERE source_pool = 'alliance_bank_pool';

UPDATE payment_voucher_sources
   SET pool = 'hr_opex'
 WHERE pool = 'alliance_bank_pool';

-- ── 4. Drop alliance_bank_pool objects ─────────────────────────────────────

DROP TRIGGER IF EXISTS trg_check_alliance_bank_pool_sufficient ON alliance_bank_pool;
DROP FUNCTION IF EXISTS check_alliance_bank_pool_sufficient();
DROP VIEW  IF EXISTS alliance_bank_pool_balance;
DROP TABLE IF EXISTS alliance_bank_pool;
DROP TYPE  IF EXISTS alliance_pool_txn_type;
