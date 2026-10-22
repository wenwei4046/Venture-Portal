-- Production's own text of amend_issued_invoice, which mig 20261020234000 swaps one statement in (pg_get_functiondef, 2026-10-20; md5 below is of production's prosrc).

-- amend_issued_invoice(uuid,jsonb,jsonb,jsonb,text) md5(prosrc) ec915120610b637b13d571a728ca2a75
CREATE OR REPLACE FUNCTION public.amend_issued_invoice(p_invoice_id uuid, p_header jsonb, p_lines jsonb, p_journal jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role      user_role;
    v_inv       invoices%ROWTYPE;
    v_entry     journal_entries%ROWTYPE;
    v_entries   int;
    v_total     numeric(14,2);
    v_line_sum  numeric(14,2);
    v_debit     numeric(14,2);
    v_credit    numeric(14,2);
    v_cn        numeric(14,2);
    v_received  numeric(14,2);
    v_settled   boolean;
    v_new_date  date;
    v_n         int := 0;
    v_email     text;
    v_reason    text := TRIM(COALESCE(p_reason, ''));
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/invoices/[id]'], ARRAY['billing.edit']);
    v_role := current_user_role();
    IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['billing.edit']) THEN RAISE EXCEPTION 'amend_issued_invoice: needs Billing · Edit' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required (it goes on the audit trail)';
    END IF;

    SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;
    IF v_inv.status NOT IN ('issued', 'paid', 'paid_via_netting') THEN
        RAISE EXCEPTION 'Invoice is % — a draft is edited normally', v_inv.status;
    END IF;

    -- Exactly one live entry: the AR accrual posted at issue.
    SELECT count(*) INTO v_entries
      FROM journal_entries
     WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND NOT is_reversed;
    IF v_entries <> 1 THEN
        RAISE EXCEPTION 'This invoice posted % journal entries — change it with 改 account, a credit note, or void and re-issue', v_entries;
    END IF;
    SELECT * INTO v_entry
      FROM journal_entries
     WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND NOT is_reversed
     FOR UPDATE;

    -- The new figures.
    v_total := round((p_header->>'total_amount')::numeric, 2);
    IF v_total IS NULL OR v_total <= 0 THEN
        RAISE EXCEPTION 'Total must be a positive amount';
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'At least one line item is required';
    END IF;
    SELECT round(COALESCE(sum((l->>'amount')::numeric), 0), 2) INTO v_line_sum
      FROM jsonb_array_elements(p_lines) AS l;
    IF v_line_sum <> v_total THEN
        RAISE EXCEPTION 'The lines sum to % but the total is %', v_line_sum, v_total;
    END IF;

    -- Money already received against it fixes the amount, the payer and the period.
    SELECT round(COALESCE(sum(amount), 0), 2) INTO v_received
      FROM payment_vouchers
     WHERE invoice_id = p_invoice_id AND direction = 'credit' AND status <> 'voided';
    v_settled := v_inv.status IN ('paid', 'paid_via_netting')
              OR v_inv.settlement_voucher_id IS NOT NULL
              OR v_received > 0;
    IF v_settled THEN
        IF v_total <> round(v_inv.total_amount, 2) THEN
            RAISE EXCEPTION 'Money has been received against this invoice — its amount cannot change (raise a credit note instead)';
        END IF;
        IF (p_header->>'billable_to_type') IS DISTINCT FROM v_inv.billable_to_type::text
           OR NULLIF(p_header->>'company_id', '')::uuid IS DISTINCT FROM v_inv.company_id
           OR NULLIF(p_header->>'billable_to_department_id', '')::uuid IS DISTINCT FROM v_inv.billable_to_department_id
           OR NULLIF(p_header->>'billable_to_freetext_name', '') IS DISTINCT FROM v_inv.billable_to_freetext_name
        THEN
            RAISE EXCEPTION 'Money has been received against this invoice — who it bills cannot change';
        END IF;
        IF (p_header->>'period_month')::date IS DISTINCT FROM v_inv.period_month THEN
            RAISE EXCEPTION 'Money has been received against this invoice — its period cannot change';
        END IF;
    END IF;

    -- Approved credit notes cap how low the total may go.
    SELECT round(COALESCE(sum(amount), 0), 2) INTO v_cn
      FROM credit_notes
     WHERE invoice_id = p_invoice_id AND status = 'approved';
    IF v_total < v_cn THEN
        RAISE EXCEPTION 'Approved credit notes against this invoice total % — it cannot be less than that', v_cn;
    END IF;

    -- Period locks: the entry's month as it is, and as it will be.
    v_new_date := (p_journal->>'transaction_date')::date;
    IF v_new_date IS NULL THEN
        RAISE EXCEPTION 'The journal date is required';
    END IF;
    IF EXISTS (
        SELECT 1 FROM period_locks
         WHERE is_locked
           AND period_month IN (date_trunc('month', v_entry.transaction_date)::date,
                                date_trunc('month', v_new_date)::date)
    ) THEN
        RAISE EXCEPTION 'An affected month is closed (period lock) — reopen it first';
    END IF;

    -- The new entry must balance.
    IF p_journal->'lines' IS NULL OR jsonb_typeof(p_journal->'lines') <> 'array' OR jsonb_array_length(p_journal->'lines') < 2 THEN
        RAISE EXCEPTION 'The journal entry needs at least two lines';
    END IF;
    SELECT round(COALESCE(sum((l->>'debit')::numeric), 0), 2),
           round(COALESCE(sum((l->>'credit')::numeric), 0), 2)
      INTO v_debit, v_credit
      FROM jsonb_array_elements(p_journal->'lines') AS l;
    IF v_debit <= 0 OR v_debit <> v_credit THEN
        RAISE EXCEPTION 'Journal entry unbalanced: debit % ≠ credit %', v_debit, v_credit;
    END IF;
    IF v_debit <> v_total THEN
        RAISE EXCEPTION 'The journal entry (%) does not match the invoice total (%)', v_debit, v_total;
    END IF;

    -- 1) The header. category_code stays NULL: the category lives per line and
    --    the entry credits each line's account.
    UPDATE invoices SET
        period_month                 = (p_header->>'period_month')::date,
        billing_mode                 = (p_header->>'billing_mode')::billing_mode,
        category_code                = NULL,
        base_amount                  = v_total,
        total_amount                 = v_total,
        invoice_date                 = NULLIF(p_header->>'invoice_date', '')::date,
        due_date                     = NULLIF(p_header->>'due_date', '')::date,
        description                  = NULLIF(p_header->>'description', ''),
        reference_no                 = NULLIF(p_header->>'reference_no', ''),
        billable_to_type             = (p_header->>'billable_to_type')::billable_to_kind,
        company_id                   = NULLIF(p_header->>'company_id', '')::uuid,
        billable_to_department_id    = NULLIF(p_header->>'billable_to_department_id', '')::uuid,
        billable_to_freetext_name    = NULLIF(p_header->>'billable_to_freetext_name', ''),
        billable_to_freetext_address = NULLIF(p_header->>'billable_to_freetext_address', ''),
        billable_to_freetext_phone   = NULLIF(p_header->>'billable_to_freetext_phone', ''),
        billable_to_freetext_email   = NULLIF(p_header->>'billable_to_freetext_email', '')
    WHERE id = p_invoice_id;

    -- 2) The lines, replaced wholesale so line_no stays contiguous.
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    INSERT INTO invoice_lines (invoice_id, line_no, description, amount, category_code)
    SELECT p_invoice_id, t.ord, NULLIF(t.l->>'description', ''), round((t.l->>'amount')::numeric, 2), NULLIF(t.l->>'category_code', '')
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord);

    -- 3) The entry, in place: same id, same number. A zero side is NULL
    --    (journal_lines wants exactly one of debit / credit).
    DELETE FROM journal_lines WHERE entry_id = v_entry.id;
    INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
    SELECT v_entry.id,
           l->>'account_code',
           NULLIF(round(COALESCE((l->>'debit')::numeric, 0), 2), 0),
           NULLIF(round(COALESCE((l->>'credit')::numeric, 0), 2), 0),
           NULLIF(l->>'description', '')
      FROM jsonb_array_elements(p_journal->'lines') AS l;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE journal_entries SET
        transaction_date = v_new_date,
        period_month     = date_trunc('month', v_new_date)::date,
        segment          = derive_journal_segment('invoice', p_invoice_id),
        total_amount     = v_debit,
        description      = COALESCE(description, '') ||
                           ' · [amended ' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') || ': ' || v_reason || ']'
    WHERE id = v_entry.id;

    -- 4) The audit trail: what it was, what it is, and why.
    SELECT email INTO v_email FROM users WHERE id = auth.uid();
    INSERT INTO access_log (user_id, user_email, user_role, action, resource_type, resource_id, metadata)
    VALUES (
        auth.uid(), v_email, v_role, 'amend_issued_invoice', 'invoice', p_invoice_id::text,
        jsonb_build_object(
            'invoice_no', v_inv.invoice_no,
            'entry_no', v_entry.entry_no,
            'reason', v_reason,
            'before', jsonb_build_object(
                'total_amount', v_inv.total_amount,
                'period_month', v_inv.period_month,
                'invoice_date', v_inv.invoice_date,
                'due_date', v_inv.due_date,
                'billing_mode', v_inv.billing_mode,
                'billable_to_type', v_inv.billable_to_type,
                'company_id', v_inv.company_id,
                'billable_to_department_id', v_inv.billable_to_department_id,
                'billable_to_freetext_name', v_inv.billable_to_freetext_name,
                'description', v_inv.description,
                'reference_no', v_inv.reference_no,
                'transaction_date', v_entry.transaction_date
            ),
            'after', p_header,
            'lines', p_lines,
            'journal', p_journal
        )
    );

    RETURN jsonb_build_object('entry_no', v_entry.entry_no, 'journal_lines', v_n, 'settled', v_settled);
END;
$function$

;
