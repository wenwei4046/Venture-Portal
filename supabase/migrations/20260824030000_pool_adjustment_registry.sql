-- Dynamic departments follow-up (2026-08-24): the user's first live Revenue
-- Department settle hit "Pool adjustment failed: unknown dept pool
-- 'dept_pool_revenue_department'" — BOTH pool adjusters still carried the
-- hardcoded five-pool CASE: TS adjustPool (fixed in code same commit) and
-- this SQL twin, which fires at Principal approval (approve_single_voucher →
-- apply_pool_adjustment). Same treatment as everything else in the dynamic-
-- departments build: legacy CASE first (cores bit-identical), registry
-- fallback by segment_key — a provisioned dept's pool key is always
-- 'dept_pool_<segment_key>'.

CREATE OR REPLACE FUNCTION public.apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_dept_name TEXT;
    v_dept_id   UUID;
    v_vp_type   hv_fund_txn_type;
BEGIN
    IF p_pool = 'venture_pool' THEN
        v_vp_type := CASE
            WHEN p_direction = 'out' AND p_loan_id IS NOT NULL THEN 'fund_out'
            WHEN p_direction = 'out'                           THEN 'expense_out'
            WHEN p_direction = 'in'  AND p_loan_id IS NOT NULL THEN 'loan_repayment_in'
            WHEN p_direction = 'in'                            THEN 'profit_in'
        END::hv_fund_txn_type;

        INSERT INTO venture_pool(
            transaction_type, amount, description, reference_table, created_by
        ) VALUES (
            v_vp_type, p_amount, p_description, 'payment_vouchers', p_user_id
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

        IF v_dept_name IS NOT NULL THEN
            SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
        ELSE
            -- Dynamic full department: pool key = 'dept_pool_<segment_key>'.
            SELECT id, name INTO v_dept_id, v_dept_name
            FROM departments
            WHERE segment_key = substring(p_pool from 11)
            LIMIT 1;
        END IF;

        IF v_dept_id IS NULL THEN
            RAISE EXCEPTION 'apply_pool_adjustment: unknown dept_pool identifier %', p_pool;
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
$function$;
