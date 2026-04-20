-- ============================================================================
-- 20260101000188_fix_apply_pool_adjustment_enum_cast.sql
-- Phase 9 hotfix — apply_pool_adjustment (migration 171) built its
-- transaction_type value with `CASE WHEN p_direction = 'out' THEN
-- 'expense_out' ELSE 'np_in' END`. The CASE branch returns TEXT, but the
-- three destination columns are enums (hv_fund_txn_type,
-- invoice_pool_txn_type, dept_pool_txn_type). INSERT raised:
--   ERROR: 42804: column "transaction_type" is of type <enum> but
--   expression is of type text
-- surfaced the first time E2E approval exercised this helper.
--
-- Fix: cast each CASE result to the enum type of its INSERT target.
--
-- Applied to remote 2026-04-20 during E2E payroll test run.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_pool_adjustment(
    p_pool         TEXT,
    p_direction    TEXT,
    p_amount       DECIMAL(15, 2),
    p_description  TEXT,
    p_user_id      UUID,
    p_approval_id  UUID,
    p_now          TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept_name TEXT;
    v_dept_id   UUID;
BEGIN
    IF p_pool = 'venture_pool' THEN
        INSERT INTO venture_pool(
            transaction_type, amount, description, reference_table, created_by
        ) VALUES (
            (CASE WHEN p_direction = 'out' THEN 'expense_out' ELSE 'profit_in' END)::hv_fund_txn_type,
            p_amount, p_description, 'payment_vouchers', p_user_id
        );

    ELSIF p_pool = 'invoice_payout_pool' THEN
        IF p_direction = 'out' THEN
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description,
                release_approved_by, release_approved_at
            ) VALUES (
                'release'::invoice_pool_txn_type, p_amount, p_description, p_user_id, p_now
            );
        ELSE
            INSERT INTO invoice_payout_pool(
                transaction_type, amount, description
            ) VALUES (
                'accumulate'::invoice_pool_txn_type, p_amount, p_description
            );
        END IF;

    ELSIF p_pool LIKE 'dept_pool_%' THEN
        v_dept_name := CASE p_pool
            WHEN 'dept_pool_hr'              THEN 'HR'
            WHEN 'dept_pool_finance'         THEN 'Finance'
            WHEN 'dept_pool_director_office' THEN 'Director Office'
            WHEN 'dept_pool_marketing'       THEN 'Marketing'
            WHEN 'dept_pool_director'        THEN 'Director'
            ELSE NULL
        END;

        IF v_dept_name IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: unknown dept_pool identifier %', p_pool;
        END IF;

        SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
        IF v_dept_id IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: department "%" not found', v_dept_name;
        END IF;

        INSERT INTO dept_pools(
            department_id, transaction_type, amount, description,
            approval_id, created_by
        ) VALUES (
            v_dept_id,
            (CASE WHEN p_direction = 'out' THEN 'expense_out' ELSE 'np_in' END)::dept_pool_txn_type,
            p_amount, p_description,
            CASE WHEN p_direction = 'out' THEN p_approval_id ELSE NULL END,
            p_user_id
        );
    ELSE
        RAISE EXCEPTION 'apply_pool_adjustment: unsupported pool identifier %', p_pool;
    END IF;
END;
$$;
