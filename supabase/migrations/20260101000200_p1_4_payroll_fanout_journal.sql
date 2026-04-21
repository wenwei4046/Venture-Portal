-- Mig 200: P1-4 fix — fan_out_payroll_bank_transfer posts the internal-
-- transfer JE alongside the HR Pool np_in credit.
--
-- Drift
-- -----
-- fan_out_payroll_bank_transfer (mig 186) credits HR Pool with the sum of
-- non-HR source amounts (dept_pools np_in row) without a matching
-- journal_entries row. The source-pool drains are already recorded in
-- dept_pools (expense_out, via apply_pool_adjustment) — also un-journalled
-- — so the GL sees zero motion across the 5 dept pool equity accounts even
-- though RM-scale amounts sloshed between them.
--
-- Fix
-- ---
-- When HR Pool is credited, post a single balanced JE that mirrors the
-- dept_pools rows:
--     dr 3040/3070/3080/3030 Source Pool  (one line per non-HR source)
--     cr 3050 HR Dept Pool                (sum of the debits)
-- reference_type = 'dept_transfer'.
--
-- This JE recognises the internal transfer: source dept pools equity ↓,
-- HR dept pool equity ↑. Zero P&L impact; equity reclassification only.
-- The PV-level JE (dr 2030 Salary Payable / cr 1010 Bank) written by
-- approve_voucher_batch is kept as-is — those two JEs together faithfully
-- represent the payroll cash flow.

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
    v_je_lines      JSONB := '[]'::JSONB;
    v_src_dept_name TEXT;
    v_src_gl_code   VARCHAR(20);
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

    -- Sum non-HR sources + collect JE debit lines (one per source pool).
    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        IF r_src.pool = 'dept_pool_hr' THEN
            CONTINUE;
        END IF;

        v_src_dept_name := CASE r_src.pool
            WHEN 'dept_pool_finance'         THEN 'Finance'
            WHEN 'dept_pool_director_office' THEN 'Director Office'
            WHEN 'dept_pool_marketing'       THEN 'Marketing'
            WHEN 'dept_pool_director'        THEN 'Director'
            ELSE NULL
        END;

        IF v_src_dept_name IS NULL THEN
            RAISE NOTICE 'fan_out_payroll_bank_transfer: skipping unknown pool %', r_src.pool;
            CONTINUE;
        END IF;

        v_src_gl_code := dept_pool_gl_code(v_src_dept_name);
        IF v_src_gl_code IS NULL THEN
            RAISE EXCEPTION
                'fan_out_payroll_bank_transfer: no GL code for dept "%"',
                v_src_dept_name;
        END IF;

        v_je_lines := v_je_lines || jsonb_build_array(
            jsonb_build_object(
                'account_code', v_src_gl_code,
                'debit',        r_src.amount,
                'description',  format('%s Pool → HR Pool payroll fan-out — %s',
                                       v_src_dept_name,
                                       COALESCE(NEW.voucher_no, NEW.id::TEXT))
            )
        );

        v_inbound_total := v_inbound_total + r_src.amount;
    END LOOP;

    IF v_inbound_total > 0 THEN
        -- Existing behaviour (unchanged): credit HR Pool np_in.
        INSERT INTO dept_pools (
            department_id, transaction_type, amount,
            period_month, description, created_by
        ) VALUES (
            v_hr_dept_id, 'np_in', v_inbound_total,
            v_period,
            'Payroll consolidation from Dept Pools — voucher ' || COALESCE(NEW.voucher_no, NEW.id::TEXT),
            v_actor
        );

        -- Mig 200: post the matching internal-transfer JE.
        v_je_lines := v_je_lines || jsonb_build_array(
            jsonb_build_object(
                'account_code', '3050',
                'credit',       v_inbound_total,
                'description',  format('HR Pool funded from source dept pools — %s',
                                       COALESCE(NEW.voucher_no, NEW.id::TEXT))
            )
        );

        PERFORM post_journal_entry(
            COALESCE(NEW.payment_date, CURRENT_DATE),
            format('Payroll fan-out to HR Pool — PV %s',
                   COALESCE(NEW.voucher_no, NEW.id::TEXT)),
            'dept_transfer',
            NEW.id,
            v_actor,
            v_je_lines
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fan_out_payroll_bank_transfer IS
    'Mig 200 (P1-4 drift fix): credits HR Pool np_in AND posts a balanced internal-transfer JE (dr source pool equity / cr 3050 HR Pool). Source pool drain rows (expense_out) are created by apply_pool_adjustment earlier in approve_voucher_batch; this JE captures the equity reclassification end-to-end.';

COMMIT;
