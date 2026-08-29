-- 2026-08-24 (user: "invoice 那边选的account 也是同理，我要能更改"): reassign
-- the income-side GL account of an ISSUED/PAID invoice in place — the twin of
-- reassign_voucher_gl_account. Edits the invoice JEs' non-bank/non-3030 leg,
-- appends an audit note, and syncs invoices.category_code + invoice_lines so
-- the displayed category agrees with the GL. p_old_account NULL = auto-detect
-- (errors if the invoice posted to more than one candidate account).
CREATE OR REPLACE FUNCTION public.reassign_invoice_gl_account(
  p_invoice_id uuid,
  p_new_account text,
  p_reason text,
  p_old_account text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_status text;
    v_old text := NULLIF(TRIM(COALESCE(p_old_account, '')), '');
    v_candidates text[];
    v_n int;
    v_bank_codes text[];
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'reassign_invoice_gl_account: role % may not reassign', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required';
    END IF;

    SELECT status INTO v_status FROM invoices WHERE id = p_invoice_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;
    IF v_status NOT IN ('issued', 'paid', 'paid_via_netting') THEN
        RAISE EXCEPTION 'Invoice is % — drafts are edited normally', v_status;
    END IF;

    SELECT COALESCE(array_agg(gl_account_code), '{}') INTO v_bank_codes
      FROM bank_accounts WHERE gl_account_code IS NOT NULL;

    -- Auto-detect the old account when not given: the distinct non-bank,
    -- non-3030 accounts this invoice actually posted.
    SELECT COALESCE(array_agg(DISTINCT jl.account_code), '{}') INTO v_candidates
      FROM journal_entries je
      JOIN journal_lines jl ON jl.entry_id = je.id
     WHERE je.reference_type = 'invoice'
       AND je.reference_id = p_invoice_id
       AND NOT je.is_reversed
       AND jl.account_code <> '3030'
       AND jl.account_code <> '3000'
       AND NOT (jl.account_code = ANY(v_bank_codes));
    IF v_old IS NULL THEN
        IF array_length(v_candidates, 1) IS NULL THEN
            RAISE EXCEPTION 'This invoice has no reassignable GL lines';
        ELSIF array_length(v_candidates, 1) > 1 THEN
            RAISE EXCEPTION 'This invoice posted to several accounts (%) — pick which one to change', array_to_string(v_candidates, ', ');
        END IF;
        v_old := v_candidates[1];
    ELSIF NOT (v_old = ANY(v_candidates)) THEN
        RAISE EXCEPTION 'This invoice has no GL lines on account % (it posted to: %)', v_old, array_to_string(v_candidates, ', ');
    END IF;

    IF v_old = p_new_account THEN
        RAISE EXCEPTION 'New account is the same as the old one';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = p_new_account AND is_active) THEN
        RAISE EXCEPTION 'Account % does not exist or is inactive', p_new_account;
    END IF;
    IF p_new_account = ANY(v_bank_codes) OR p_new_account IN ('3000', '3030') THEN
        RAISE EXCEPTION 'Bank / receivable accounts are not valid income targets';
    END IF;

    -- Period lock: every affected JE month must be open.
    IF EXISTS (
        SELECT 1
        FROM journal_entries je
        JOIN journal_lines jl ON jl.entry_id = je.id
        JOIN period_locks pl ON pl.period_month = date_trunc('month', je.transaction_date)::date AND pl.is_locked
        WHERE je.reference_type = 'invoice'
          AND je.reference_id = p_invoice_id
          AND NOT je.is_reversed
          AND jl.account_code = v_old
    ) THEN
        RAISE EXCEPTION 'An affected month is closed (period lock) — reopen it first';
    END IF;

    UPDATE journal_lines jl
       SET account_code = p_new_account
      FROM journal_entries je
     WHERE je.id = jl.entry_id
       AND je.reference_type = 'invoice'
       AND je.reference_id = p_invoice_id
       AND NOT je.is_reversed
       AND jl.account_code = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'This invoice has no GL lines on account %', v_old;
    END IF;

    UPDATE journal_entries je
       SET description = COALESCE(je.description, '') ||
           ' · [GL reassigned ' || v_old || '→' || p_new_account ||
           ' on ' || to_char(now(), 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']'
     WHERE je.reference_type = 'invoice'
       AND je.reference_id = p_invoice_id
       AND NOT je.is_reversed
       AND EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.entry_id = je.id AND jl.account_code = p_new_account);

    -- Keep the displayed category in sync (category_code IS a COA code).
    UPDATE invoices SET category_code = p_new_account
     WHERE id = p_invoice_id AND category_code = v_old;
    UPDATE invoice_lines SET category_code = p_new_account
     WHERE invoice_id = p_invoice_id AND category_code = v_old;

    RETURN jsonb_build_object('changed', v_n, 'old_account', v_old);
END;
$function$;
