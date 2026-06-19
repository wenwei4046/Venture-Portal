-- rename_account_code(old, new): change an account's CODE and re-point every
-- historical reference to it (user 2026-06-12: "如果要换account code，希望换了
-- 会反推回去之前开在这个account的transaction").
--
-- Mechanics: all referencing FKs are NO ACTION, so the rename clones the COA
-- row under the new code, re-points every referencing column, then deletes
-- the old row — one transaction, all-or-nothing. References covered (FK and
-- plain-text alike): chart_of_accounts.parent_code (children),
-- journal_lines.account_code, payment_voucher_sources.account_code +
-- override_gl_account_code, bank_accounts.gl_account_code,
-- fund_sources.account_code, invoice_lines/invoices/credit_notes/
-- dept_payment_requests/monthly_statement_lines.category_code.
-- trial_balance is a view — follows automatically.
--
-- Validation: caller finance/principal; old must exist; new must be 4 digits,
-- unused, and inside the SAME type range (1xxx equity … 9xxx expense), so a
-- rename can never smuggle an account across types. Returns a jsonb count of
-- re-pointed rows per table for the UI to show.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

CREATE OR REPLACE FUNCTION public.rename_account_code(p_old text, p_new text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row chart_of_accounts%ROWTYPE;
    v_lo INT; v_hi INT;
    v_counts jsonb := '{}'::jsonb;
    v_n BIGINT;
BEGIN
    IF current_user_role() NOT IN ('principal', 'finance') THEN
        RAISE EXCEPTION 'rename_account_code: only Finance/Principal may rename accounts'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_old IS NULL OR p_new IS NULL OR btrim(p_new) = '' THEN
        RAISE EXCEPTION 'rename_account_code: old and new codes are required';
    END IF;
    p_new := btrim(p_new);
    IF p_new = p_old THEN
        RAISE EXCEPTION 'rename_account_code: new code is the same as the old one';
    END IF;
    IF p_new !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'rename_account_code: code must be exactly 4 digits, got "%"', p_new;
    END IF;

    SELECT * INTO v_row FROM chart_of_accounts WHERE code = p_old FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rename_account_code: account % not found', p_old;
    END IF;
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = p_new) THEN
        RAISE EXCEPTION 'rename_account_code: code % is already taken', p_new;
    END IF;

    -- Same-type range guard (mirrors lib/coa RANGES).
    SELECT CASE v_row.type::text
        WHEN 'equity'       THEN 1000 WHEN 'fixed_asset' THEN 2000
        WHEN 'asset'        THEN 3000 WHEN 'liability'   THEN 4000
        WHEN 'revenue'      THEN 5000 WHEN 'cost'        THEN 6000
        WHEN 'other_income' THEN 7000 WHEN 'expense'     THEN 9000
    END INTO v_lo;
    v_hi := v_lo + 999;
    IF p_new::int < v_lo OR p_new::int > v_hi THEN
        RAISE EXCEPTION 'rename_account_code: % accounts live in %-% — "%" is outside the range',
            v_row.type, v_lo, v_hi, p_new;
    END IF;

    -- Clone under the new code (triggers: parent-type check passes — same
    -- type/parent; posted-parent check can only fire in the legacy edge of a
    -- parent that itself has postings, which correctly fails loud).
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, created_at, updated_at, cash_flow_category, is_internal_fund)
    VALUES (p_new, v_row.name, v_row.type, v_row.parent_code, v_row.is_active, v_row.sort_order, v_row.created_at, NOW(), v_row.cash_flow_category, v_row.is_internal_fund);

    -- Re-point everything that referenced the old code.
    UPDATE chart_of_accounts SET parent_code = p_new WHERE parent_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('children', v_n);

    UPDATE journal_lines SET account_code = p_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('journal_lines', v_n);

    UPDATE payment_voucher_sources SET account_code = p_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pv_sources', v_n);

    UPDATE payment_voucher_sources SET override_gl_account_code = p_new WHERE override_gl_account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pv_source_overrides', v_n);

    UPDATE bank_accounts SET gl_account_code = p_new WHERE gl_account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bank_accounts', v_n);

    UPDATE fund_sources SET account_code = p_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('fund_sources', v_n);

    UPDATE invoice_lines SET category_code = p_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoice_lines', v_n);

    UPDATE invoices SET category_code = p_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoices', v_n);

    UPDATE credit_notes SET category_code = p_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('credit_notes', v_n);

    UPDATE dept_payment_requests SET category_code = p_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('dept_requests', v_n);

    UPDATE monthly_statement_lines SET category_code = p_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('statement_lines', v_n);

    DELETE FROM chart_of_accounts WHERE code = p_old;

    RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_account_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_account_code(text, text) TO authenticated;
