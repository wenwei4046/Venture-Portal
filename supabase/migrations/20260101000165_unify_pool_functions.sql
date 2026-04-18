-- ============================================================================
-- 20260101000165_unify_pool_functions.sql
-- Stage 6b: rewrite every pool-touching function/trigger to target dept_pools.
-- HOUZS Venture Portal — 5-pool unification refactor (core).
--
-- Scope:
--   1. Rename pool identifier strings in data columns (hr_opex → dept_pool_hr
--      etc.) so payment_vouchers + payment_voucher_sources + payroll_payment_requests
--      speak the new vocabulary.
--   2. Rewrite credit_operating_pool_on_invoice_paid → credit_dept_pool_on_invoice_paid.
--      Derives department from invoices.billing_mode inline, writes to dept_pools.
--   3. Rewrite fan_out_payroll_bank_transfer. HR Pool is the consolidation
--      destination (= departments.name='HR' in dept_pools). Non-HR source pools
--      debit themselves with expense_out; HR gets credited with the sum as np_in.
--   4. Rewrite create_payroll_disbursement_vouchers: per-staff source_pool
--      becomes 'dept_pool_hr' (was 'hr_opex').
--   5. Rewrite get_payroll_breakdown_by_pool: all 5 rows query dept_pools via
--      departments.name — one unified query, no operating_pool_balance.
--   6. Drop the old operating_pools sufficient-balance trigger/function.
--   7. Add a sufficient-balance trigger on dept_pools expense_out (replaces
--      the operating_pools check; same semantics, new table).
--
-- Pool identifier mapping (now consistent dept_pool_* for all 5):
--   hr_opex         → dept_pool_hr
--   finance_opex    → dept_pool_finance
--   director_opex   → dept_pool_director_office
--   dept_pool_marketing → unchanged
--   dept_pool_director  → unchanged
--
-- All 5 pools now live in the same table (dept_pools), read from the same
-- view (dept_pool_balances), and obey the same sufficiency rule. The
-- operating_pools table itself is dropped in migration 166.
-- ============================================================================

-- ── 1. Rename pool identifier strings in data columns ──────────────────────

UPDATE payment_vouchers SET target_pool = 'dept_pool_hr'              WHERE target_pool = 'hr_opex';
UPDATE payment_vouchers SET target_pool = 'dept_pool_finance'         WHERE target_pool = 'finance_opex';
UPDATE payment_vouchers SET target_pool = 'dept_pool_director_office' WHERE target_pool = 'director_opex';

UPDATE payment_vouchers SET source_pool = 'dept_pool_hr'              WHERE source_pool = 'hr_opex';
UPDATE payment_vouchers SET source_pool = 'dept_pool_finance'         WHERE source_pool = 'finance_opex';
UPDATE payment_vouchers SET source_pool = 'dept_pool_director_office' WHERE source_pool = 'director_opex';

UPDATE payment_voucher_sources SET pool = 'dept_pool_hr'              WHERE pool = 'hr_opex';
UPDATE payment_voucher_sources SET pool = 'dept_pool_finance'         WHERE pool = 'finance_opex';
UPDATE payment_voucher_sources SET pool = 'dept_pool_director_office' WHERE pool = 'director_opex';

UPDATE payroll_payment_requests SET target_pool = 'dept_pool_hr' WHERE target_pool = 'hr_opex';

ALTER TABLE payroll_payment_requests
    ALTER COLUMN target_pool SET DEFAULT 'dept_pool_hr';

-- ── 2. New invoice → dept_pool credit function ─────────────────────────────
-- Replaces credit_operating_pool_on_invoice_paid. When a billing_payment
-- voucher hits 'paid', map invoice.billing_mode → department → insert np_in
-- into dept_pools. non_billable stays out (no pool credit).

CREATE OR REPLACE FUNCTION credit_dept_pool_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice      invoices%ROWTYPE;
    v_dept_name    TEXT;
    v_dept_id      UUID;
    v_actor        UUID;
BEGIN
    IF NEW.voucher_type <> 'billing_payment'
       OR NEW.reference_type <> 'invoice'
       OR NEW.reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_invoice FROM invoices WHERE id = NEW.reference_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_dept_name := CASE v_invoice.billing_mode
        WHEN 'hr_attribution'              THEN 'HR'
        WHEN 'finance_attribution'         THEN 'Finance'
        WHEN 'director_office_attribution' THEN 'Director Office'
        WHEN 'director_attribution'        THEN 'Director'
        WHEN 'marketing_project'           THEN 'Marketing'
        ELSE NULL
    END;

    IF v_dept_name IS NULL THEN
        -- non_billable (or any future mode that shouldn't route) → no-op
        RETURN NEW;
    END IF;

    SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
    IF v_dept_id IS NULL THEN
        RAISE NOTICE 'credit_dept_pool_on_invoice_paid: department % not found', v_dept_name;
        RETURN NEW;
    END IF;

    v_actor := COALESCE(NEW.approved_by, NEW.created_by);

    INSERT INTO dept_pools (
        department_id, transaction_type, amount,
        period_month, description, created_by
    ) VALUES (
        v_dept_id,
        'np_in',
        NEW.amount,
        COALESCE(v_invoice.period_month, DATE_TRUNC('month', CURRENT_DATE)::DATE),
        'Invoice ' || COALESCE(v_invoice.invoice_no, 'no #') || ' settled — ' || NEW.payee_name,
        v_actor
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION credit_dept_pool_on_invoice_paid IS
    'Stage 6b: on billing_payment voucher paid, credit the invoice billing_mode''s corresponding Dept Pool (dept_pools np_in). Replaces credit_operating_pool_on_invoice_paid.';

-- Swap trigger
DROP TRIGGER IF EXISTS trg_credit_operating_pool_on_paid ON payment_vouchers;
DROP FUNCTION IF EXISTS credit_operating_pool_on_invoice_paid();

CREATE TRIGGER trg_credit_dept_pool_on_paid
    AFTER INSERT OR UPDATE OF status ON payment_vouchers
    FOR EACH ROW
    WHEN (NEW.status = 'paid' AND NEW.voucher_type = 'billing_payment')
    EXECUTE FUNCTION credit_dept_pool_on_invoice_paid();

-- ── 3. Rewrite fan_out_payroll_bank_transfer → dept_pools ──────────────────

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

    FOR r_src IN
        SELECT pool, amount FROM payment_voucher_sources WHERE voucher_id = NEW.id
    LOOP
        -- HR is the consolidation destination; source = dest → no ledger row.
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
            period_month, description, created_by
        ) VALUES (
            v_src_dept_id, 'expense_out', r_src.amount,
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
    'Stage 6b: payroll PV consolidation debits non-HR Dept Pools (dept_pools expense_out) and credits HR Dept Pool (np_in) with the sum. HR source contributions stay in place (source = destination).';

-- ── 4. Rewrite create_payroll_disbursement_vouchers → source_pool = dept_pool_hr ─

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
            'dept_pool_hr',
            'payroll_disbursement', v_row.payroll_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_hr', v_row.net);

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
    'Stage 6b: per-staff disbursement vouchers draw from dept_pool_hr (HR Dept Pool). adjustPool in payments/actions.ts handles the debit into dept_pools.';

GRANT EXECUTE ON FUNCTION create_payroll_disbursement_vouchers(DATE) TO authenticated;

-- ── 5. Rewrite get_payroll_breakdown_by_pool → all 5 pools from dept_pools ─

CREATE OR REPLACE FUNCTION get_payroll_breakdown_by_pool(p_request_id UUID)
RETURNS TABLE (
    pool_key TEXT,
    dept_name TEXT,
    required_amount DECIMAL(15, 2),
    pool_balance DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_period DATE;
BEGIN
    SELECT pr.period_month
      INTO v_period
      FROM payroll_payment_requests ppr
      JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or not linked to a payroll_run', p_request_id;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        -- Staff-side payroll aggregated from hr_monthly_payroll, one row per
        -- dept (HR / Finance / Director Office / Marketing).
        SELECT
            LOWER(d.name) AS dept_slug,
            d.name        AS d_name,
            d.id          AS d_id,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.name IN ('HR', 'Finance', 'Director Office', 'Marketing')
         GROUP BY d.id, d.name
    ),
    director_total AS (
        SELECT
            'director'::TEXT AS dept_slug,
            'Director'::TEXT AS d_name,
            (SELECT id FROM departments WHERE name = 'Director') AS d_id,
            COALESCE(SUM(gross_amount), 0)::DECIMAL(15, 2) AS total
          FROM director_payouts
         WHERE period_month = v_period
    ),
    all_totals AS (
        SELECT dept_slug, d_name, d_id, total FROM hr_payroll_totals
        UNION ALL
        SELECT dept_slug, d_name, d_id, total FROM director_total
    ),
    pool_balances AS (
        SELECT department_id, balance FROM dept_pool_balances
    )
    SELECT
        CASE at.dept_slug
            WHEN 'hr'              THEN 'dept_pool_hr'
            WHEN 'finance'         THEN 'dept_pool_finance'
            WHEN 'director office' THEN 'dept_pool_director_office'
            WHEN 'marketing'       THEN 'dept_pool_marketing'
            WHEN 'director'        THEN 'dept_pool_director'
        END AS pool_key,
        at.d_name AS dept_name,
        at.total  AS required_amount,
        COALESCE((SELECT balance FROM pool_balances WHERE department_id = at.d_id), 0)::DECIMAL(15, 2) AS pool_balance
      FROM all_totals at
     ORDER BY CASE at.dept_slug
         WHEN 'hr'              THEN 1
         WHEN 'finance'         THEN 2
         WHEN 'director office' THEN 3
         WHEN 'marketing'       THEN 4
         WHEN 'director'        THEN 5
         ELSE 99
     END;
END;
$$;

COMMENT ON FUNCTION get_payroll_breakdown_by_pool(UUID) IS
    'Stage 6b: returns 5 fixed rows (HR / Finance / Director Office / Marketing / Director). All balances come from dept_pool_balances view — operating_pools path removed.';

-- ── 6. Drop the operating_pools sufficient-balance trigger + function ─────
-- (Table itself drops in migration 166; dropping the trigger here lets 166
-- be a pure DROP migration.)

DROP TRIGGER IF EXISTS trg_check_operating_pool_sufficient ON operating_pools;
DROP FUNCTION IF EXISTS check_operating_pool_sufficient();

-- ── 7. Add sufficient-balance check on dept_pools expense_out ─────────────
-- Matches the 2026-04-17 user directive: "所有的 amount transfer 本身一定是要
-- sufficient, insufficient 的话就是不可以". Was enforced on operating_pools
-- before; now mirrored on dept_pools since HR/Finance/Director Office live there.

CREATE OR REPLACE FUNCTION check_dept_pool_sufficient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance   DECIMAL(15, 2);
    v_dept_name TEXT;
BEGIN
    IF NEW.transaction_type <> 'expense_out' THEN
        RETURN NEW;
    END IF;

    SELECT balance INTO v_balance
      FROM dept_pool_balances
     WHERE department_id = NEW.department_id;

    v_balance := COALESCE(v_balance, 0);

    IF v_balance < NEW.amount THEN
        SELECT name INTO v_dept_name FROM departments WHERE id = NEW.department_id;
        RAISE EXCEPTION
            'INSUFFICIENT_POOL_BALANCE: % Dept Pool has RM %, transaction needs RM %. Top up the pool before retrying.',
            COALESCE(v_dept_name, NEW.department_id::TEXT), v_balance, NEW.amount;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_dept_pool_sufficient ON dept_pools;

CREATE TRIGGER trg_check_dept_pool_sufficient
    BEFORE INSERT ON dept_pools
    FOR EACH ROW
    EXECUTE FUNCTION check_dept_pool_sufficient();

COMMENT ON FUNCTION check_dept_pool_sufficient() IS
    'Reject dept_pools expense_out that would drive the dept pool balance negative. Ported from check_operating_pool_sufficient after the 5-pool unification.';

-- ── 8. Fix dept_pool_balances view comment ────────────────────────────────
-- Old comment said HR/Finance are cost-to-cost (balance = 0); after unification
-- all 5 departments have real running balances.

COMMENT ON VIEW dept_pool_balances IS
    'Per-department pool balance across all 5 departments (HR, Finance, Director Office, Marketing, Director). Balance = SUM(np_in) - SUM(expense_out).';
