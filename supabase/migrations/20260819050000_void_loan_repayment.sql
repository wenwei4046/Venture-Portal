-- Void a recorded loan repayment (2026-08-20, user: "下次再发生这样的事呢？"
-- after a repayment was keyed against the wrong loan). One SECURITY DEFINER
-- RPC so the whole undo is a single atomic transaction — the TS-side
-- multi-step pattern (voidPaidReceipt) can die halfway; this can't.
--
-- Reverses everything recordRepayment did for ONE repayments row:
--   1. GL: posts the mirror JE (debit↔credit swapped, same segment), dated in
--      the original month unless that period is locked (then today), then
--      flags BOTH legs is_reversed so every report's `is_reversed = false`
--      filter drops the pair (same convention as mark_journal_entry_reversed).
--   2. Bank cache: bumps the bank the original JE debited back DOWN.
--   3. venture_pool (principal only): inserts a 'fund_out' VOID counter-row —
--      the pool ledger is append-only by design (hv_fund_no_delete), same
--      pattern as reverse_voucher_pool_rows.
--   4. Deletes the repayments row (repayments_no_delete blocks the client;
--      definer bypasses) — loan_outstanding recomputes automatically.
--   5. Un-flips fully_repaid → active when the loan is no longer covered.
--
-- The original JE is matched by reference (loan) + amount + date + type
-- prefix; if recordRepayment ever posted no JE (pre-mig-197 rows), the void
-- still removes the repayment row and skips GL/bank cleanly.

CREATE OR REPLACE FUNCTION public.void_loan_repayment(p_repayment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_rep            repayments%ROWTYPE;
    v_loan           loans%ROWTYPE;
    v_je             RECORD;
    v_lines          jsonb;
    v_reversal_id    uuid;
    v_reversal_no    text;
    v_locked         boolean;
    v_rev_date       date;
    v_bank_id        uuid;
    v_principal_paid numeric;
    v_reopened       boolean := false;
    v_user           uuid;
BEGIN
    IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'void_loan_repayment: only Finance/Principal may void repayments'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_user := auth.uid();

    SELECT * INTO v_rep FROM repayments WHERE id = p_repayment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_loan_repayment: repayment % not found (already voided?)', p_repayment_id;
    END IF;
    SELECT * INTO v_loan FROM loans WHERE id = v_rep.loan_id FOR UPDATE;

    -- Reversal lands in the original month so it nets there; locked → today.
    SELECT EXISTS (
        SELECT 1 FROM period_locks
        WHERE period_month = date_trunc('month', v_rep.payment_date)::date AND is_locked = true
    ) INTO v_locked;
    v_rev_date := CASE WHEN v_locked THEN CURRENT_DATE ELSE v_rep.payment_date END;

    -- recordRepayment posts exactly one JE per repayment row, keyed
    -- reference_type='repayment' + reference_id=loan_id; disambiguate
    -- same-day same-amount rows by taking the earliest un-reversed match.
    SELECT je.id, je.entry_no, je.segment, je.description INTO v_je
    FROM journal_entries je
    WHERE je.reference_type = 'repayment'
      AND je.reference_id = v_rep.loan_id
      AND je.total_amount = v_rep.amount
      AND je.transaction_date = v_rep.payment_date
      AND je.is_reversed = false
      AND je.description LIKE 'Loan ' || v_rep.payment_type || ' repayment%'
    ORDER BY je.created_at
    LIMIT 1;

    IF v_je.id IS NOT NULL THEN
        SELECT jsonb_agg(jsonb_build_object(
            'account_code', jl.account_code,
            'debit',        jl.credit,   -- swapped
            'credit',       jl.debit,
            'description',  ('Reversal — ' || COALESCE(jl.description, ''))
        )) INTO v_lines
        FROM journal_lines jl
        WHERE jl.entry_id = v_je.id;

        v_reversal_id := post_journal_entry(
            v_rev_date,
            'VOID ' || v_je.entry_no || ': reversal of ' || COALESCE(v_je.description, ''),
            'repayment_void',
            v_rep.loan_id,
            v_user,
            v_lines,
            v_je.segment
        );
        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_reversal_id WHERE id = v_je.id;
        UPDATE journal_entries SET is_reversed = true WHERE id = v_reversal_id;
        SELECT entry_no INTO v_reversal_no FROM journal_entries WHERE id = v_reversal_id;

        -- The original Dr line is the receiving bank — bump its cache back
        -- down. (gl_account_code is one-bank-per-code in practice; LIMIT 1.)
        SELECT ba.id INTO v_bank_id
        FROM journal_lines jl
        JOIN bank_accounts ba ON ba.gl_account_code = jl.account_code
        WHERE jl.entry_id = v_je.id AND jl.debit IS NOT NULL
        LIMIT 1;
        IF v_bank_id IS NOT NULL THEN
            UPDATE bank_accounts
            SET current_balance = current_balance - v_rep.amount, updated_at = now()
            WHERE id = v_bank_id;
        END IF;
    END IF;

    -- Principal returned capital to venture_pool — counter it (append-only).
    IF v_rep.payment_type = 'principal' THEN
        IF EXISTS (
            SELECT 1 FROM venture_pool vp
            WHERE vp.reference_table = 'loans'
              AND vp.reference_id = v_rep.loan_id
              AND vp.transaction_type = 'loan_repayment_in'
              AND vp.amount = v_rep.amount
        ) THEN
            INSERT INTO venture_pool (transaction_type, amount, description, reference_table, reference_id, created_by)
            VALUES ('fund_out', v_rep.amount,
                    'VOID REPAY ' || p_repayment_id || ': reverse loan principal repayment',
                    'loans', v_rep.loan_id, v_user);
        END IF;
    END IF;

    DELETE FROM repayments WHERE id = p_repayment_id;

    IF v_loan.status = 'fully_repaid' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_principal_paid
        FROM repayments WHERE loan_id = v_rep.loan_id AND payment_type = 'principal';
        IF v_principal_paid < v_loan.principal - 0.005 THEN
            UPDATE loans SET status = 'active', updated_at = now() WHERE id = v_rep.loan_id;
            v_reopened := true;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'reversal_entry_no', v_reversal_no,
        'je_reversed',       v_je.id IS NOT NULL,
        'loan_reopened',     v_reopened
    );
END $function$;

REVOKE ALL ON FUNCTION public.void_loan_repayment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_loan_repayment(uuid) TO authenticated;
