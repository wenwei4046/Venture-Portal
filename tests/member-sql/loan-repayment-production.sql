-- Production's own text of the functions mig 20261021200000 swaps one statement in, and of post_journal_entry, which
-- the void calls (pg_get_functiondef, 2026-10-21; each md5 below is of production's prosrc).

-- void_loan_repayment(uuid) md5(prosrc) cda958dad8ea18a9d4aadf430bf333b6
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
  PERFORM public.tab_write_guard(ARRAY['/fund-out'], ARRAY['treasury.void']);
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'void_loan_repayment: needs Treasury · Void' USING ERRCODE = '42501';
    END IF;
    v_user := auth.uid();

    SELECT * INTO v_rep FROM repayments WHERE id = p_repayment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_loan_repayment: repayment % not found (already voided?)', p_repayment_id;
    END IF;
    SELECT * INTO v_loan FROM loans WHERE id = v_rep.loan_id FOR UPDATE;

    SELECT EXISTS (
        SELECT 1 FROM period_locks
        WHERE period_month = date_trunc('month', v_rep.payment_date)::date AND is_locked = true
    ) INTO v_locked;
    v_rev_date := CASE WHEN v_locked THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date ELSE v_rep.payment_date END;

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
            'debit',        jl.credit,
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
END $function$

;

-- amend_loan_repayment(uuid,numeric,text) md5(prosrc) 8d5f89e59fed19b247aaf29a02534f02
CREATE OR REPLACE FUNCTION public.amend_loan_repayment(p_repayment_id uuid, p_new_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  PERFORM public.tab_write_guard(ARRAY['/payments', '/receipts'], ARRAY['treasury.edit']);
    v_role := current_user_role();
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'amend_loan_repayment: needs Treasury · Edit' USING ERRCODE = '42501';
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
                         ' on ' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']'
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
$function$

;

-- amend_loan_repayment_date(uuid,date,text) md5(prosrc) b67c36e4b0c13a79960dcfe68a9d302e
CREATE OR REPLACE FUNCTION public.amend_loan_repayment_date(p_repayment_id uuid, p_new_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_r repayments%ROWTYPE;
    v_old date;
    v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_je_id uuid;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments', '/payments/[id]', '/receipts'], ARRAY['treasury.edit']);
    v_role := current_user_role();
    IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'amend_loan_repayment_date: needs Treasury · Edit' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required';
    END IF;
    IF p_new_date IS NULL THEN
        RAISE EXCEPTION 'Choose the correct date';
    END IF;
    IF p_new_date > v_today THEN
        RAISE EXCEPTION 'The date cannot be in the future';
    END IF;

    SELECT * INTO v_r FROM repayments WHERE id = p_repayment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repayment not found';
    END IF;
    v_old := v_r.payment_date;
    IF p_new_date = v_old THEN
        RAISE EXCEPTION 'The new date is the same as the current one';
    END IF;

    -- A repayment the approval of a voucher wrote has no journal entry of its
    -- own: the voucher's entry is its entry, and the voucher is what to re-date.
    IF COALESCE(v_r.notes, '') ILIKE 'Auto-synced from voucher %' THEN
        RAISE EXCEPTION 'This repayment was recorded by a voucher — change the date on the voucher instead';
    END IF;

    IF is_period_locked(v_old) THEN
        RAISE EXCEPTION '% is closed (period lock) — reopen it first', to_char(v_old, 'Mon YYYY');
    END IF;
    IF is_period_locked(p_new_date) THEN
        RAISE EXCEPTION '% is closed (period lock) — reopen it first', to_char(p_new_date, 'Mon YYYY');
    END IF;

    BEGIN
        SELECT je.id INTO STRICT v_je_id
          FROM journal_entries je
         WHERE je.reference_type = 'repayment'
           AND je.reference_id = v_r.loan_id
           AND NOT je.is_reversed
           AND je.transaction_date = v_old
           AND je.total_amount = v_r.amount
           AND je.description ILIKE 'Loan ' || v_r.payment_type || ' repayment%';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'No matching GL entry for this repayment — use 撤销(void) + re-record instead';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Several matching GL entries — use 撤销(void) + re-record instead';
    END;

    IF EXISTS (
        SELECT 1 FROM journal_lines jl
         WHERE jl.entry_id = v_je_id
           AND (EXISTS (SELECT 1 FROM bank_recon_matches m WHERE m.journal_line_id = jl.id)
             OR EXISTS (SELECT 1 FROM bank_recon_lines bl WHERE bl.matched_journal_line_id = jl.id))
    ) THEN
        RAISE EXCEPTION 'This repayment is already matched in a bank reconciliation — unmatch it there first';
    END IF;

    UPDATE journal_entries
       SET transaction_date = p_new_date,
           period_month = date_trunc('month', p_new_date)::date,
           description = description || ' · [date corrected ' || v_old || '→' || p_new_date ||
                         ' on ' || to_char(v_today, 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']'
     WHERE id = v_je_id;

    UPDATE repayments
       SET payment_date = p_new_date,
           notes = COALESCE(notes, '') ||
                   CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' ' END ||
                   '[date ' || v_old || '→' || p_new_date || ': ' || TRIM(p_reason) || ']'
     WHERE id = p_repayment_id;

    RETURN jsonb_build_object('old', v_old, 'new', p_new_date);
END;
$function$

;

-- post_journal_entry(date,text,text,uuid,uuid,jsonb,gl_segment) md5(prosrc) a682bcdec54abfaf1fef97955fe86d53
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment DEFAULT 'unallocated'::gl_segment)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period_month   DATE;
    v_period_key     TEXT;
    v_total_debit    DECIMAL(15, 2) := 0;
    v_total_credit   DECIMAL(15, 2) := 0;
    v_line           JSONB;
    v_line_debit     DECIMAL(15, 2);
    v_line_credit    DECIMAL(15, 2);
    v_line_count     INT;
    v_seq            INT;
    v_entry_no       TEXT;
    v_entry_id       UUID;
BEGIN
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'post_journal_entry: p_lines must be a JSONB array';
    END IF;

    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count < 2 THEN
        RAISE EXCEPTION 'post_journal_entry: entry must have at least 2 lines (got %)', v_line_count;
    END IF;

    IF p_transaction_date IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_transaction_date is required';
    END IF;
    IF p_created_by IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_created_by is required';
    END IF;
    IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
        RAISE EXCEPTION 'post_journal_entry: p_description is required';
    END IF;

    v_period_month := date_trunc('month', p_transaction_date)::DATE;
    v_period_key   := to_char(v_period_month, 'YYYYMM');

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF NOT (v_line ? 'account_code')
           OR length(trim(v_line->>'account_code')) = 0 THEN
            RAISE EXCEPTION 'post_journal_entry: each line must have a non-empty account_code';
        END IF;

        v_line_debit  := COALESCE((v_line->>'debit')::DECIMAL(15,2),  0);
        v_line_credit := COALESCE((v_line->>'credit')::DECIMAL(15,2), 0);

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION 'post_journal_entry: negative amounts not allowed on line for % (debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        IF (v_line_debit > 0 AND v_line_credit > 0)
           OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION 'post_journal_entry: line for % must have exactly one of debit or credit (got debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        v_total_debit  := v_total_debit  + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'post_journal_entry: unbalanced entry — total debit % <> total credit %',
            v_total_debit, v_total_credit;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('je-' || v_period_key));

    SELECT COALESCE(
             MAX(NULLIF(substring(entry_no FROM 'JE-[0-9]{6}-([0-9]+)$'), '')::INT),
             0
           ) + 1
      INTO v_seq
      FROM journal_entries
     WHERE period_month = v_period_month;

    v_entry_no := 'JE-' || v_period_key || '-' || lpad(v_seq::TEXT, 4, '0');

    INSERT INTO journal_entries (
        entry_no, transaction_date, period_month, description,
        reference_type, reference_id, total_amount, segment, created_by
    ) VALUES (
        v_entry_no,
        p_transaction_date,
        v_period_month,
        p_description,
        NULLIF(p_reference_type, ''),
        p_reference_id,
        v_total_debit,
        p_segment,
        p_created_by
    )
    RETURNING id INTO v_entry_id;

    INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
    SELECT
        v_entry_id,
        trim(ln->>'account_code'),
        NULLIF((ln->>'debit')::DECIMAL(15,2),  0),
        NULLIF((ln->>'credit')::DECIMAL(15,2), 0),
        NULLIF(ln->>'description', '')
    FROM jsonb_array_elements(p_lines) ln;

    RETURN v_entry_id;
END;
$function$

;
