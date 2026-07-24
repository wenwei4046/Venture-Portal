-- execute_fund_source_cancel must refund from the RECEIVING bank (2026-07-24,
-- user caught it pre-approval: "我记得这笔当时好像是进alliance bank").
--
-- The HOUZS Century RM 45,156.32 deposit activated into ALLIANCE (fund_sources.
-- bank_account_id set; activation JE Dr 3010 / Cr 4052), but the cancel
-- executor hardcoded the PRIMARY bank (Hong Leong) for both the cache
-- deduction and the JE credit — the reversal would have drained the wrong
-- bank. Fix: honor v_source.bank_account_id, falling back to primary only
-- when NULL (mirrors the activation-side rule from mig 20260708100000).
--
-- Context found while verifying: the deposit exists TWICE as active sources
-- (2f87e5ae activated 24 Jul 11:16 MYT; 70ee8baf activated in the same batch
-- approval that tripped the enum bug) — Alliance/venture_pool/4052 are all
-- double-counted until the pending cancel card (targets 2f87e5ae, correct
-- dupe) is re-approved with this fixed executor.

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

    SELECT id, amount, status, source_type, account_code, from_department_id, bank_account_id
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

    IF v_source.source_type = 'department_pool' OR v_source.from_department_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot auto-cancel a dept_pool fund source — its activation was an equity reclass + dept pool debit, reverse it manually';
    END IF;

    -- Refund from the bank the deposit actually LANDED in: the source's
    -- receiving bank when set, else the primary (activation used the same rule).
    SELECT id, gl_account_code, current_balance
      INTO v_bank_id, v_bank_gl, v_bank_balance
      FROM bank_accounts
     WHERE id = COALESCE(
               v_source.bank_account_id,
               (SELECT id FROM bank_accounts WHERE is_primary = true AND status = 'active' LIMIT 1))
       AND status = 'active'
     LIMIT 1;
    IF v_bank_id IS NULL THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: no active receiving/primary bank';
    END IF;
    IF v_bank_balance < v_source.amount THEN
        RAISE EXCEPTION 'Cannot cancel: returning RM % would overdraw the bank (balance RM %)', v_source.amount, v_bank_balance;
    END IF;

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
