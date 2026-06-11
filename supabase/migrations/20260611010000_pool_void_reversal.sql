-- voidPaidReceipt's pool reversal never actually worked for dept pools:
-- it called adjustPool(pool, 'out', …, approvalId=null), which writes
-- transaction_type='expense_out' — rejected by BOTH the expense_has_approval
-- CHECK (mig 6) and Finance's RLS insert policies (mig 11/104). The error was
-- swallowed (pre fail-loud-audit adjustPool), so voided receipts silently left
-- dept pools credited. Netting-settled invoices additionally leave a paying-
-- side 'inter_billing_out' row that nothing reversed.
--
-- Fix: two new enum values + one SECURITY DEFINER RPC that reverses every
-- pool row a voucher wrote, keyed on the 'PV <voucher_no>:' description
-- prefix that adjustPool / the inter-billing insert always use.
--   - 'void_in'  → adds to balance  (reverses expense_out / inter_billing_out)
--   - 'void_out' → subtracts        (reverses np_in)
-- Both bypass check_dept_pool_sufficient (it only fires on 'expense_out') and
-- expense_has_approval (same). The /dept-pool monthly In/Out cards whitelist
-- np_in / expense_out / inter_billing_out, so void rows correct the BALANCE
-- without distorting monthly movement stats.
--
-- (Applied via MCP apply_migration on 2026-06-11; file kept for repo parity.)

-- ── Phase 1: enum values (new values must not be referenced as enum literals
--            in this same transaction — the view below compares ::text) ─────
ALTER TYPE dept_pool_txn_type ADD VALUE IF NOT EXISTS 'void_in';
ALTER TYPE dept_pool_txn_type ADD VALUE IF NOT EXISTS 'void_out';

-- ── Phase 2: balance view learns the new values (text-cast, mig 255 trick) ─
CREATE OR REPLACE VIEW dept_pool_balances AS
  SELECT department_id,
         COALESCE(SUM(
           CASE transaction_type::text
             WHEN 'np_in'             THEN amount
             WHEN 'expense_out'       THEN -amount
             WHEN 'inter_billing_out' THEN -amount
             WHEN 'void_in'           THEN amount
             WHEN 'void_out'          THEN -amount
             ELSE 0::numeric
           END
         ), 0::numeric) AS balance
    FROM dept_pools
   GROUP BY department_id;

-- ── Phase 3: the reversal RPC ───────────────────────────────────────────────
-- SECURITY DEFINER because dept_pools has no-delete/no-update RLS and the
-- void-reversal txn types are not in any role's INSERT whitelist. Role check
-- mirrors the action layer's requireRole(['finance','principal']).
CREATE OR REPLACE FUNCTION public.reverse_voucher_pool_rows(p_voucher_no text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_user  uuid;
    v_count integer := 0;
    r       RECORD;
BEGIN
    IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'reverse_voucher_pool_rows: only finance/principal may reverse pool rows';
    END IF;
    IF p_voucher_no IS NULL OR p_voucher_no = '' THEN
        RAISE EXCEPTION 'reverse_voucher_pool_rows: voucher_no is required';
    END IF;
    v_user := auth.uid();

    -- Idempotency: a half-failed void retried later must not double-reverse.
    IF EXISTS (SELECT 1 FROM dept_pools          WHERE description LIKE 'VOID ' || p_voucher_no || ':%')
    OR EXISTS (SELECT 1 FROM venture_pool        WHERE description LIKE 'VOID ' || p_voucher_no || ':%')
    OR EXISTS (SELECT 1 FROM invoice_payout_pool WHERE description LIKE 'VOID ' || p_voucher_no || ':%') THEN
        RAISE EXCEPTION 'reverse_voucher_pool_rows: % already has VOID reversal rows', p_voucher_no;
    END IF;

    -- dept_pools: np_in → void_out; expense_out / inter_billing_out → void_in
    FOR r IN
        SELECT department_id, transaction_type, amount, description
          FROM dept_pools
         WHERE description LIKE 'PV ' || p_voucher_no || ':%'
           AND transaction_type::text IN ('np_in', 'expense_out', 'inter_billing_out')
    LOOP
        INSERT INTO dept_pools (department_id, transaction_type, amount, description, created_by)
        VALUES (
            r.department_id,
            CASE WHEN r.transaction_type::text = 'np_in'
                 THEN 'void_out'::dept_pool_txn_type
                 ELSE 'void_in'::dept_pool_txn_type END,
            r.amount,
            'VOID ' || p_voucher_no || ': reverse ' || r.transaction_type::text,
            v_user
        );
        v_count := v_count + 1;
    END LOOP;

    -- venture_pool: profit_in ↔ expense_out (no approval/sufficiency rules here)
    FOR r IN
        SELECT transaction_type, amount, description
          FROM venture_pool
         WHERE description LIKE 'PV ' || p_voucher_no || ':%'
           AND transaction_type::text IN ('profit_in', 'expense_out')
    LOOP
        INSERT INTO venture_pool (transaction_type, amount, description, reference_table, created_by)
        VALUES (
            CASE WHEN r.transaction_type::text = 'profit_in'
                 THEN 'expense_out'::hv_fund_txn_type
                 ELSE 'profit_in'::hv_fund_txn_type END,
            r.amount,
            'VOID ' || p_voucher_no || ': reverse ' || r.transaction_type::text,
            'payment_vouchers',
            v_user
        );
        v_count := v_count + 1;
    END LOOP;

    -- invoice_payout_pool: accumulate ↔ release (release needs approval meta)
    FOR r IN
        SELECT transaction_type, amount, description
          FROM invoice_payout_pool
         WHERE description LIKE 'PV ' || p_voucher_no || ':%'
           AND transaction_type::text IN ('accumulate', 'release')
    LOOP
        IF r.transaction_type::text = 'accumulate' THEN
            INSERT INTO invoice_payout_pool (transaction_type, amount, description, release_approved_by, release_approved_at)
            VALUES ('release', r.amount, 'VOID ' || p_voucher_no || ': reverse accumulate', v_user, NOW());
        ELSE
            INSERT INTO invoice_payout_pool (transaction_type, amount, description)
            VALUES ('accumulate', r.amount, 'VOID ' || p_voucher_no || ': reverse release');
        END IF;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_voucher_pool_rows(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_voucher_pool_rows(text) TO authenticated;
