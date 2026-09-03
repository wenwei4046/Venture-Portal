-- 2026-09-03 (user: "不能直接点开receipt 的单去edit?"): amend a received
-- loan repayment's AMOUNT in place — the atomic version of the manual fix
-- applied to the CONTS 1-Sep interest. Adjusts the repayments row, the one
-- matching GL entry (both legs + total + audit note), the bank cache by the
-- delta, and for principal also a venture_pool counter row + the loan's
-- fully_repaid/active status. Strictly ONE matching JE required — anything
-- ambiguous (PV-driven repayments, duplicates) errors and the void +
-- re-record path is the answer instead.
CREATE OR REPLACE FUNCTION public.amend_loan_repayment(
  p_repayment_id uuid,
  p_new_amount numeric,
  p_reason text
) RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_r repayments%ROWTYPE;
    v_old numeric;
    v_delta numeric;
    v_je_id uuid;
    v_n int;
    v_bank_gl text;
    v_bank_id uuid;
    v_outstanding numeric;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'amend_loan_repayment: role % may not amend', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required';
    END IF;
    IF p_new_amount IS NULL OR p_new_amount <= 0 THEN
        RAISE EXCEPTION 'New amount must be greater than 0';
    END IF;

    SELECT * INTO v_r FROM repayments WHERE id = p_repayment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repayment not found';
    END IF;
    v_old := v_r.amount;
    v_delta := ROUND(p_new_amount - v_old, 2);
    IF v_delta = 0 THEN
        RAISE EXCEPTION 'New amount equals the current amount';
    END IF;

    IF EXISTS (
        SELECT 1 FROM period_locks
        WHERE period_month = date_trunc('month', v_r.payment_date)::date AND is_locked
    ) THEN
        RAISE EXCEPTION 'That month is closed (period lock) — reopen it first';
    END IF;

    BEGIN
        SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_r.payment_date
           AND je.total_amount = v_old
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'No matching GL entry for this repayment — use 撤销(void) + re-record instead';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Several matching GL entries — use 撤销(void) + re-record instead';
    END;

    UPDATE journal_lines SET debit = p_new_amount
     WHERE entry_id = v_je_id AND debit = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'GL debit leg not in the expected state'; END IF;

    UPDATE journal_lines SET credit = p_new_amount
     WHERE entry_id = v_je_id AND credit = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'GL credit leg not in the expected state'; END IF;

    UPDATE journal_entries
       SET total_amount = p_new_amount,
           description = description || ' · [amount corrected ' || v_old || '→' || p_new_amount ||
                         ' on ' || to_char(now(), 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']'
     WHERE id = v_je_id;

    -- Bank cache follows the bank-side (debit) leg's account.
    SELECT jl.account_code INTO v_bank_gl
      FROM journal_lines jl WHERE jl.entry_id = v_je_id AND jl.debit = p_new_amount LIMIT 1;
    SELECT id INTO v_bank_id FROM bank_accounts WHERE gl_account_code = v_bank_gl LIMIT 1;
    IF v_bank_id IS NOT NULL THEN
        UPDATE bank_accounts SET current_balance = ROUND(current_balance + v_delta, 2)
         WHERE id = v_bank_id;
    END IF;

    UPDATE repayments
       SET amount = p_new_amount,
           notes = COALESCE(notes, '') ||
                   CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' ' END ||
                   '[amended ' || v_old || '→' || p_new_amount || ': ' || TRIM(p_reason) || ']'
     WHERE id = p_repayment_id;

    IF v_r.payment_type = 'principal' THEN
        IF v_delta > 0 THEN
            INSERT INTO venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
            VALUES ('loan_repayment_in', v_delta,
                    'Repayment amended +' || v_delta || ' — loan ' || v_r.loan_id,
                    v_r.loan_id, 'loans', auth.uid());
        ELSE
            INSERT INTO venture_pool (transaction_type, amount, description, reference_id, reference_table, created_by)
            VALUES ('fund_out', ABS(v_delta),
                    'Repayment amended ' || v_old || '→' || p_new_amount || ' — loan ' || v_r.loan_id,
                    v_r.loan_id, 'loans', auth.uid());
        END IF;

        SELECT l.principal - COALESCE((
                 SELECT SUM(amount) FROM repayments
                  WHERE loan_id = v_r.loan_id AND payment_type = 'principal'), 0)
          INTO v_outstanding
          FROM loans l WHERE l.id = v_r.loan_id;
        IF v_outstanding > 0.005 THEN
            UPDATE loans SET status = 'active'
             WHERE id = v_r.loan_id AND status = 'fully_repaid';
        ELSE
            UPDATE loans SET status = 'fully_repaid'
             WHERE id = v_r.loan_id AND status = 'active';
        END IF;
    END IF;

    RETURN jsonb_build_object('old', v_old, 'new', p_new_amount, 'delta', v_delta);
END;
$function$;
