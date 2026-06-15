-- change_account_type(old_code, new_type): move an account to a different
-- type (user 2026-06-12: "account type 我无法更改"). A type change forces the
-- code into the new type's range, so this auto-allocates the next free code
-- there, clones the row under it with the new type + the new type's default
-- cash-flow category, re-points EVERY historical reference (same machinery as
-- rename_account_code), and deletes the old row — all in one transaction.
--
-- Guards: finance/principal only; account must exist; new_type ≠ old; the
-- account must be a LEAF with no children (a header carries a sub-tree of the
-- OLD type — moving it would orphan or mis-type the children, so detach/move
-- them first); the parent link is dropped on move (parent is the old type, and
-- mig 246 forbids a cross-type parent). Returns the new code + the per-table
-- re-point counts as jsonb.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

CREATE OR REPLACE FUNCTION public.change_account_type(p_old text, p_new_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row    chart_of_accounts%ROWTYPE;
    v_type   account_type;
    v_cfc    cash_flow_category;
    v_new    text;
    v_counts jsonb := '{}'::jsonb;
    v_n      bigint;
BEGIN
    IF current_user_role() NOT IN ('principal', 'finance') THEN
        RAISE EXCEPTION 'change_account_type: only Finance/Principal may change account types'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    BEGIN
        v_type := p_new_type::account_type;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'change_account_type: invalid account type "%"', p_new_type;
    END;

    SELECT * INTO v_row FROM chart_of_accounts WHERE code = p_old FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'change_account_type: account % not found', p_old;
    END IF;
    IF v_row.type = v_type THEN
        RAISE EXCEPTION 'change_account_type: account % is already %', p_old, p_new_type;
    END IF;
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE parent_code = p_old) THEN
        RAISE EXCEPTION 'change_account_type: % has sub-accounts — move or detach them first', p_old;
    END IF;

    -- New code in the target range + that type's default cash-flow category.
    v_new := next_account_code(v_type);
    v_cfc := CASE v_type
        WHEN 'equity' THEN 'financing' WHEN 'fixed_asset' THEN 'investing'
        WHEN 'asset' THEN 'operating' WHEN 'liability' THEN 'financing'
        WHEN 'revenue' THEN 'operating' WHEN 'cost' THEN 'operating'
        WHEN 'other_income' THEN 'operating' WHEN 'expense' THEN 'operating'
    END::cash_flow_category;

    -- Clone under the new code/type. parent_code dropped: the old parent is the
    -- old type, and a cross-type parent is rejected by mig 246's trigger.
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, created_at, updated_at, cash_flow_category, is_internal_fund)
    VALUES (v_new, v_row.name, v_type, NULL, v_row.is_active, v_row.sort_order, v_row.created_at, NOW(), v_cfc, v_row.is_internal_fund);

    -- Re-point every reference (identical to rename_account_code).
    UPDATE journal_lines SET account_code = v_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('journal_lines', v_n);
    UPDATE payment_voucher_sources SET account_code = v_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pv_sources', v_n);
    UPDATE payment_voucher_sources SET override_gl_account_code = v_new WHERE override_gl_account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pv_source_overrides', v_n);
    UPDATE bank_accounts SET gl_account_code = v_new WHERE gl_account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bank_accounts', v_n);
    UPDATE fund_sources SET account_code = v_new WHERE account_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('fund_sources', v_n);
    UPDATE invoice_lines SET category_code = v_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoice_lines', v_n);
    UPDATE invoices SET category_code = v_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoices', v_n);
    UPDATE credit_notes SET category_code = v_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('credit_notes', v_n);
    UPDATE dept_payment_requests SET category_code = v_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('dept_requests', v_n);
    UPDATE monthly_statement_lines SET category_code = v_new WHERE category_code = p_old;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('statement_lines', v_n);

    DELETE FROM chart_of_accounts WHERE code = p_old;

    RETURN jsonb_build_object('new_code', v_new, 'new_type', p_new_type, 'repointed', v_counts);
END;
$function$;

REVOKE ALL ON FUNCTION public.change_account_type(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_account_type(text, text) TO authenticated;
