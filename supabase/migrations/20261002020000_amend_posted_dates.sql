-- 2026-10-02 (user: "这个日期我录错了怎么办？能自己改吗？" → "加"): change the DATE
-- of something already posted, in place — the companion of amend_loan_repayment,
-- which does the same for an amount.
--
-- Until now a wrong date on a posted receipt or a received loan repayment had
-- one remedy: void it and record it again. A receipt is paid the moment it is
-- made, so its date was never editable at all, and the re-record takes a new
-- number and leaves the voided one in the list.
--
-- Where the date of each thing lives was read off the code that posts it:
--
--   a received loan repayment (fund-out recordRepayment)
--     repayments.payment_date
--     ONE journal entry: reference_type 'repayment', reference_id = the LOAN
--     (not the repayment), transaction_date + period_month. Found the way
--     amend_loan_repayment finds it — type, amount, date, description — and
--     strictly one, or the answer is void + re-record.
--
--   a paid voucher (approve_single_voucher, or createPaymentVoucher for a receipt)
--     payment_vouchers.payment_date
--     its journal entries: reference_type 'payment_voucher', reference_id = the
--     voucher, one per pool/segment, all posted on the payment date
--     fund_source_repayments / repayments rows the approval wrote for a
--     repayment voucher, on the same date
--
-- Pool rows (dept_pools, venture_pool) carry no business date — they are kept
-- by created_at — so nothing there follows. The entry NUMBER embeds the month
-- it was posted in (JE-YYYYMM-NNNN) and is left as it is: it is a name.
--
-- Refused: a month that is closed (the old one or the new one), a date in the
-- future, and anything already matched in a bank reconciliation — that is a
-- statement about the old date, and has to be unmatched first.
--
-- Payroll vouchers are not re-dated here. Their dates belong to HR Payment
-- (set_payroll_pv_payment_date) and the payment cycle reads them.
--
-- The role check is written `IS NULL OR NOT IN`: a caller with no role (not
-- logged in, or a deactivated account) yields NULL, and `NULL NOT IN (...)` is
-- NULL, which an IF treats as false — the plain `NOT IN` form lets such a
-- caller straight through. EXECUTE is revoked from anon for the same reason.

CREATE OR REPLACE FUNCTION public.amend_loan_repayment_date(
  p_repayment_id uuid,
  p_new_date date,
  p_reason text
) RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_r repayments%ROWTYPE;
    v_old date;
    v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_je_id uuid;
BEGIN
    v_role := current_user_role();
    IF v_role IS NULL OR v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'amend_loan_repayment_date: role % may not amend', COALESCE(v_role::text, '(none)')
            USING ERRCODE = 'insufficient_privilege';
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
$function$;

CREATE OR REPLACE FUNCTION public.amend_voucher_date(
  p_voucher_id uuid,
  p_new_date date,
  p_reason text
) RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_v payment_vouchers%ROWTYPE;
    v_old date;
    v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_note text;
    v_entries int;
BEGIN
    v_role := current_user_role();
    IF v_role IS NULL OR v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'amend_voucher_date: role % may not amend', COALESCE(v_role::text, '(none)')
            USING ERRCODE = 'insufficient_privilege';
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

    SELECT * INTO v_v FROM payment_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Voucher not found';
    END IF;
    IF v_v.status <> 'paid' THEN
        RAISE EXCEPTION 'Only a paid voucher is re-dated here (this one is %) — a draft or pending one is changed with Edit',
            replace(v_v.status::text, '_', ' ');
    END IF;
    IF v_v.reference_type IN ('payroll_disbursement', 'payroll_statutory', 'payroll_payment_request') THEN
        RAISE EXCEPTION 'A payroll voucher is re-dated from HR Payment, not here';
    END IF;

    -- Every paid voucher has a date today; one that somehow had none was
    -- posted on the day it was executed.
    v_old := COALESCE(v_v.payment_date, (v_v.executed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
    IF p_new_date = v_old THEN
        RAISE EXCEPTION 'The new date is the same as the current one';
    END IF;

    IF v_old IS NOT NULL AND is_period_locked(v_old) THEN
        RAISE EXCEPTION '% is closed (period lock) — reopen it first', to_char(v_old, 'Mon YYYY');
    END IF;
    IF is_period_locked(p_new_date) THEN
        RAISE EXCEPTION '% is closed (period lock) — reopen it first', to_char(p_new_date, 'Mon YYYY');
    END IF;

    IF EXISTS (
        SELECT 1
          FROM journal_entries je
          JOIN journal_lines jl ON jl.entry_id = je.id
         WHERE je.reference_type IN ('payment_voucher', 'invoice_paid_credit')
           AND je.reference_id = p_voucher_id
           AND NOT je.is_reversed
           AND (EXISTS (SELECT 1 FROM bank_recon_matches m WHERE m.journal_line_id = jl.id)
             OR EXISTS (SELECT 1 FROM bank_recon_lines bl WHERE bl.matched_journal_line_id = jl.id))
    ) THEN
        RAISE EXCEPTION 'This voucher is already matched in a bank reconciliation — unmatch it there first';
    END IF;

    v_note := '[date corrected ' || COALESCE(v_old::text, '(none)') || '→' || p_new_date ||
              ' on ' || to_char(v_today, 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']';

    UPDATE journal_entries
       SET transaction_date = p_new_date,
           period_month = date_trunc('month', p_new_date)::date,
           description = description || ' · ' || v_note
     WHERE reference_type IN ('payment_voucher', 'invoice_paid_credit')
       AND reference_id = p_voucher_id
       AND NOT is_reversed;
    GET DIAGNOSTICS v_entries = ROW_COUNT;

    -- What the approval of a repayment voucher wrote on the same date.
    UPDATE fund_source_repayments
       SET payment_date = p_new_date
     WHERE payment_voucher_id = p_voucher_id;
    IF v_v.loan_id IS NOT NULL AND v_v.voucher_no IS NOT NULL THEN
        UPDATE repayments
           SET payment_date = p_new_date
         WHERE loan_id = v_v.loan_id
           AND notes = format('Auto-synced from voucher %s', v_v.voucher_no);
    END IF;

    UPDATE payment_vouchers
       SET payment_date = p_new_date,
           notes = COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' ' END || v_note
     WHERE id = p_voucher_id;

    INSERT INTO access_log (user_id, user_role, action, resource_type, resource_id, metadata)
    VALUES (auth.uid(), v_role, 'amend_voucher_date', 'payment_voucher', p_voucher_id::text,
            jsonb_build_object('voucher_no', v_v.voucher_no, 'old', v_old, 'new', p_new_date,
                               'reason', TRIM(p_reason), 'journal_entries', v_entries));

    RETURN jsonb_build_object('old', v_old, 'new', p_new_date, 'journal_entries', v_entries);
END;
$function$;

REVOKE ALL ON FUNCTION public.amend_loan_repayment_date(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.amend_voucher_date(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_loan_repayment_date(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.amend_voucher_date(uuid, date, text) TO authenticated, service_role;
