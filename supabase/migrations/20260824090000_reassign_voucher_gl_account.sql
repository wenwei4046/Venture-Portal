-- 2026-08-24 (user: "gl account 放错，我希望approve 了我还能改"): reassign the
-- GL account on an APPROVED/PAID voucher's journal lines in place — same
-- entries, same amounts, same dates, only the non-bank leg's account changes,
-- so P&L / cash-flow drill-downs / trial balance all move together with no
-- correcting-JV noise. Guards: finance/principal only; bank legs and the 3030
-- invoice-settle leg untouchable; an audit note is appended to each JE's
-- description; the voucher's source rows (account_code / override) are kept
-- in sync so the voucher page + bridge mirror natures agree with the GL.
CREATE OR REPLACE FUNCTION public.reassign_voucher_gl_account(
  p_voucher_id uuid,
  p_old_account text,
  p_new_account text,
  p_reason text
) RETURNS integer
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_status text;
    v_n int;
    v_bank_codes text[];
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'reassign_voucher_gl_account: role % may not reassign', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required';
    END IF;
    IF p_old_account = p_new_account THEN
        RAISE EXCEPTION 'New account is the same as the old one';
    END IF;

    SELECT status INTO v_status FROM payment_vouchers WHERE id = p_voucher_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Voucher not found';
    END IF;
    IF v_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Voucher is % — before approval use Edit instead', v_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = p_new_account AND is_active) THEN
        RAISE EXCEPTION 'Account % does not exist or is inactive', p_new_account;
    END IF;

    SELECT COALESCE(array_agg(gl_account_code), '{}') INTO v_bank_codes
      FROM bank_accounts WHERE gl_account_code IS NOT NULL;
    IF p_old_account = ANY(v_bank_codes) OR p_new_account = ANY(v_bank_codes) OR p_old_account = '3000' OR p_new_account = '3000' THEN
        RAISE EXCEPTION 'Bank/cash legs cannot be reassigned';
    END IF;
    IF p_old_account = '3030' THEN
        RAISE EXCEPTION 'The 3030 receivable leg belongs to invoice settlement — void the receipt instead';
    END IF;

    -- Period lock: every affected JE month must be open.
    IF EXISTS (
        SELECT 1
        FROM journal_entries je
        JOIN journal_lines jl ON jl.entry_id = je.id
        JOIN period_locks pl ON pl.period_month = date_trunc('month', je.transaction_date)::date AND pl.is_locked
        WHERE je.reference_type = 'payment_voucher'
          AND je.reference_id = p_voucher_id
          AND NOT je.is_reversed
          AND jl.account_code = p_old_account
    ) THEN
        RAISE EXCEPTION 'A affected month is closed (period lock) — reopen it first';
    END IF;

    UPDATE journal_lines jl
       SET account_code = p_new_account
      FROM journal_entries je
     WHERE je.id = jl.entry_id
       AND je.reference_type = 'payment_voucher'
       AND je.reference_id = p_voucher_id
       AND NOT je.is_reversed
       AND jl.account_code = p_old_account;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'This voucher has no GL lines on account %', p_old_account;
    END IF;

    UPDATE journal_entries je
       SET description = COALESCE(je.description, '') ||
           ' · [GL reassigned ' || p_old_account || '→' || p_new_account ||
           ' on ' || to_char(now(), 'YYYY-MM-DD') || ': ' || TRIM(p_reason) || ']'
     WHERE je.reference_type = 'payment_voucher'
       AND je.reference_id = p_voucher_id
       AND NOT je.is_reversed
       AND EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.entry_id = je.id AND jl.account_code = p_new_account);

    -- Keep the voucher's source rows in sync (display + bridge mirror natures).
    UPDATE payment_voucher_sources
       SET override_gl_account_code = p_new_account
     WHERE voucher_id = p_voucher_id AND override_gl_account_code = p_old_account;
    UPDATE payment_voucher_sources
       SET account_code = p_new_account
     WHERE voucher_id = p_voucher_id AND account_code = p_old_account
       AND (override_gl_account_code IS NULL OR override_gl_account_code = p_new_account);

    RETURN v_n;
END;
$function$;
