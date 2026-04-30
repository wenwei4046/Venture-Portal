-- ============================================================================
-- 20260101000227_mint_credit_note_no_rpc.sql
-- Pre-existing race fix surfaced during /review of Item 5: createCreditNote
-- generated CN numbers via SELECT count(*) + 1, which collides under any
-- concurrent invocation. Mirror the mint_invoice_no pattern (mig P0-2):
-- SECURITY DEFINER RPC + pg_advisory_xact_lock on a stable namespace key.
-- ============================================================================

CREATE OR REPLACE FUNCTION mint_credit_note_no(p_period DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_yyyymm TEXT := to_char(p_period, 'YYYYMM');
    v_seq INTEGER;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'mint_credit_note_no: only finance/principal may mint, got %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Single-namespace tx-scoped lock matches mint_invoice_no's pattern.
    PERFORM pg_advisory_xact_lock(hashtext('hv_credit_note_no'));

    SELECT COALESCE(MAX(
               (regexp_replace(credit_note_no, '^HV-CN-\d{6}-', ''))::int
           ), 0) + 1
      INTO v_seq
      FROM credit_notes
     WHERE credit_note_no LIKE 'HV-CN-' || v_yyyymm || '-%';

    RETURN 'HV-CN-' || v_yyyymm || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION mint_credit_note_no(DATE) IS
    'Pre-existing race fix from /review: serial CN number generation under advisory lock. Mirrors mint_invoice_no.';

GRANT EXECUTE ON FUNCTION mint_credit_note_no(DATE) TO authenticated;
