-- Loan disbursement was primary-bank-only: create_loan_with_approval pinned
-- the paired PV to the primary bank and approveRequestGroup debited primary
-- unconditionally (red flag from the 2026-06-11 flow audit). New optional
-- p_bank_account_id flows the picked bank onto the PV; the action layer
-- (approvals/actions.ts#approveRequestGroup) now checks/debits/credits the
-- PV's bank (bump_bank_balance RPC + its gl_account_code) instead of primary.
-- The fund-out new-loan form gained a bank picker (defaults to primary).
-- Old 10-arg signature dropped — an added defaulted param would otherwise
-- leave an ambiguous overload for PostgREST named-arg calls.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)
DO $$
DECLARE
    def TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_loan_with_approval';
    IF def IS NULL THEN RAISE EXCEPTION 'create_loan_with_approval not found'; END IF;

    IF position('p_disbursement_account_code text DEFAULT NULL::text)' IN def) = 0 THEN
        RAISE EXCEPTION 'signature anchor missing';
    END IF;
    def := replace(def,
        'p_disbursement_account_code text DEFAULT NULL::text)',
        'p_disbursement_account_code text DEFAULT NULL::text, p_bank_account_id uuid DEFAULT NULL::uuid)');

    IF position('SELECT id INTO v_bank_id FROM bank_accounts WHERE is_primary = true AND status = ''active'' LIMIT 1;' IN def) = 0 THEN
        RAISE EXCEPTION 'bank-select anchor missing';
    END IF;
    def := replace(def,
        'SELECT id INTO v_bank_id FROM bank_accounts WHERE is_primary = true AND status = ''active'' LIMIT 1;',
        'IF p_bank_account_id IS NOT NULL THEN' || E'\n' ||
        '        SELECT id INTO v_bank_id FROM bank_accounts WHERE id = p_bank_account_id AND status = ''active'';' || E'\n' ||
        '        IF v_bank_id IS NULL THEN RAISE EXCEPTION ''create_loan_with_approval: bank account % not found or inactive'', p_bank_account_id; END IF;' || E'\n' ||
        '    ELSE' || E'\n' ||
        '        SELECT id INTO v_bank_id FROM bank_accounts WHERE is_primary = true AND status = ''active'' LIMIT 1;' || E'\n' ||
        '    END IF;');

    DROP FUNCTION public.create_loan_with_approval(uuid, numeric, numeric, numeric, numeric, integer, text, text, date, text);
    EXECUTE def;
    RAISE NOTICE 'create_loan_with_approval now takes p_bank_account_id';
END
$$;
