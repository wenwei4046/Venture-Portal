-- Cancel executors brought to the current COA (red-flag queue 2026-06-12):
--
-- 1. execute_loan_cancel (mig 229) still posted pre-unification codes:
--    Dr bank-fallback '1010' / Cr '1020' — both meaningless post-mig-238
--    (1010 = HV Operating Fund equity; 1020 doesn't exist as a leaf). Rewritten:
--    - Cr side resolves the borrower's 305x leaf from the ORIGINAL disbursement
--      JE's debit line (fallback: the disbursement PV's PVS account), fails
--      loud if neither exists;
--    - the bank refunded is the bank that actually paid (disbursement PV's
--      bank_account_id, fallback primary) — was primary unconditionally;
--    - bank GL fallback '3000' (was '1010').
--
-- 2. execute_fund_source_cancel — NEW. The cancel request (filed by Finance as
--    a 'tier_change' approval on fund_sources) previously had NO executor:
--    Principal's approval changed nothing. Now reverses the activation:
--    - blocks if any repayment exists;
--    - dept_pool-type sources are refused (their activation was an equity
--      reclass + dept_pools debit, not a bank movement — manual handling);
--    - venture_pool 'fund_out' reversal of the activation's 'fund_in';
--    - primary bank cache −= amount (activation credited primary), with a
--      sufficiency check;
--    - reversing JE: Dr <fund_sources.account_code ?? 4000> / Cr bank GL,
--      segment treasury;
--    - status → cancelled.
--    approvals/actions.ts#approveRequest now calls it on tier_change approvals
--    that reference fund_sources.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

CREATE OR REPLACE FUNCTION public.execute_loan_cancel(p_loan_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_principal NUMERIC;
    v_voucher_id UUID;
    v_voucher_bank_id UUID;
    v_disbursement_date DATE;
    v_bank_id UUID;
    v_bank_gl TEXT;
    v_leaf TEXT;
    v_je_id UUID;
    v_today DATE := CURRENT_DATE;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    SELECT principal, disbursement_date INTO v_principal, v_disbursement_date
    FROM loans WHERE id = p_loan_id AND status = 'active';
    IF v_principal IS NULL THEN
        RAISE EXCEPTION 'Loan % is not active or no longer exists', p_loan_id;
    END IF;

    IF EXISTS (SELECT 1 FROM repayments WHERE loan_id = p_loan_id) THEN
        RAISE EXCEPTION 'Cannot cancel: loan has repayments recorded';
    END IF;

    SELECT id, bank_account_id INTO v_voucher_id, v_voucher_bank_id
    FROM payment_vouchers
    WHERE reference_type = 'loan'
      AND reference_id = p_loan_id
      AND status = 'paid'
    LIMIT 1;

    -- Refund the bank that actually disbursed (PV's bank), fallback primary.
    IF v_voucher_bank_id IS NOT NULL THEN
        SELECT id, gl_account_code INTO v_bank_id, v_bank_gl
        FROM bank_accounts WHERE id = v_voucher_bank_id;
    END IF;
    IF v_bank_id IS NULL THEN
        SELECT id, gl_account_code INTO v_bank_id, v_bank_gl
        FROM bank_accounts WHERE is_primary = true AND status = 'active' LIMIT 1;
    END IF;

    -- Resolve the borrower's Loans Receivable leaf (305x) from the original
    -- disbursement JE's debit line; fallback to the disbursement PV's PVS
    -- account. Header 3020 / pre-238 codes would be rejected by triggers.
    SELECT jl.account_code INTO v_leaf
      FROM journal_entries je
      JOIN journal_lines jl ON jl.entry_id = je.id
     WHERE je.reference_type = 'loan' AND je.reference_id = p_loan_id
       AND jl.debit > 0
       AND jl.account_code <> COALESCE(v_bank_gl, '3000')
     ORDER BY je.created_at ASC
     LIMIT 1;
    IF v_leaf IS NULL AND v_voucher_id IS NOT NULL THEN
        SELECT account_code INTO v_leaf
          FROM payment_voucher_sources
         WHERE voucher_id = v_voucher_id AND account_code IS NOT NULL
         LIMIT 1;
    END IF;
    IF v_leaf IS NULL THEN
        RAISE EXCEPTION 'execute_loan_cancel: cannot resolve the Loans Receivable leaf for loan % — no disbursement JE or PVS account found', p_loan_id;
    END IF;

    INSERT INTO venture_pool (
        transaction_type, amount, description,
        reference_id, reference_table, created_by
    ) VALUES (
        'fund_in', v_principal,
        'Loan cancellation reversal — ' || p_loan_id,
        p_loan_id, 'loans', v_caller_id
    );

    UPDATE loans
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_loan_id;

    IF v_voucher_id IS NOT NULL THEN
        UPDATE payment_vouchers
        SET status = 'voided'
        WHERE id = v_voucher_id;
    END IF;

    IF v_bank_id IS NOT NULL THEN
        UPDATE bank_accounts
        SET current_balance = COALESCE(current_balance, 0) + v_principal
        WHERE id = v_bank_id;
    END IF;

    SELECT post_journal_entry(
        v_today,
        'Loan cancellation reversal — ' || p_loan_id,
        'loan',
        p_loan_id,
        v_caller_id,
        jsonb_build_array(
            jsonb_build_object(
                'account_code', COALESCE(v_bank_gl, '3000'),
                'debit', v_principal,
                'credit', NULL,
                'description', 'Bank — loan principal returned'
            ),
            jsonb_build_object(
                'account_code', v_leaf,
                'debit', NULL,
                'credit', v_principal,
                'description', 'Loans Receivable reversed'
            )
        ),
        'treasury'::gl_segment
    ) INTO v_je_id;

    RETURN v_je_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_fund_source_cancel(p_fund_source_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_source RECORD;
    v_bank_id UUID;
    v_bank_gl TEXT;
    v_bank_balance NUMERIC;
    v_je_id UUID;
    v_today DATE := CURRENT_DATE;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    SELECT id, amount, status, source_type, account_code, from_department_id
      INTO v_source
      FROM fund_sources
     WHERE id = p_fund_source_id AND status = 'active'
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fund source % is not active or no longer exists', p_fund_source_id;
    END IF;

    IF EXISTS (SELECT 1 FROM fund_source_repayments WHERE fund_source_id = p_fund_source_id) THEN
        RAISE EXCEPTION 'Cannot cancel: fund source has repayments recorded';
    END IF;

    IF v_source.source_type = 'dept_pool' OR v_source.from_department_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot auto-cancel a dept_pool fund source — its activation was an equity reclass + dept pool debit, reverse it manually';
    END IF;

    SELECT id, gl_account_code, current_balance INTO v_bank_id, v_bank_gl, v_bank_balance
      FROM bank_accounts WHERE is_primary = true AND status = 'active' LIMIT 1;
    IF v_bank_id IS NULL THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: no active primary bank';
    END IF;
    IF v_bank_balance < v_source.amount THEN
        RAISE EXCEPTION 'Cannot cancel: returning RM % would overdraw the bank (balance RM %)', v_source.amount, v_bank_balance;
    END IF;

    -- Reverse the activation's venture_pool 'fund_in'.
    INSERT INTO venture_pool (
        transaction_type, amount, description,
        reference_id, reference_table, created_by
    ) VALUES (
        'fund_out', v_source.amount,
        'Fund source cancellation reversal — ' || p_fund_source_id,
        p_fund_source_id, 'fund_sources', v_caller_id
    );

    UPDATE bank_accounts
       SET current_balance = current_balance - v_source.amount
     WHERE id = v_bank_id;

    UPDATE fund_sources
       SET status = 'cancelled', updated_at = NOW()
     WHERE id = p_fund_source_id;

    SELECT post_journal_entry(
        v_today,
        'Fund source cancellation reversal — ' || p_fund_source_id,
        'fund_source',
        p_fund_source_id,
        v_caller_id,
        jsonb_build_array(
            jsonb_build_object(
                'account_code', COALESCE(v_source.account_code, '4000'),
                'debit', v_source.amount,
                'credit', NULL,
                'description', 'Fund source payable reversed'
            ),
            jsonb_build_object(
                'account_code', COALESCE(v_bank_gl, '3000'),
                'debit', NULL,
                'credit', v_source.amount,
                'description', 'Bank — deposit returned'
            )
        ),
        'treasury'::gl_segment
    ) INTO v_je_id;

    RETURN v_je_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_fund_source_cancel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_fund_source_cancel(uuid) TO authenticated;
