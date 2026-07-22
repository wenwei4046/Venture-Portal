-- 资金来源 self-service (2026-07-22, user request "办法3").
--
-- The funding-source badge (SC …) is parsed out of loans.repayment_terms by
-- fundingSourceFromTerms() in the app — the remark lives as a `· 资金来源: X`
-- segment inside that text. Until now only Principal could touch
-- repayment_terms (amend_loan, whole-text edit). Finance needs to set/fix the
-- funding source on existing loans WITHOUT gaining the power to edit rates,
-- tenure, dates, or the rest of the terms text.
--
-- Design: a pure helper rewrites ONLY the 资金来源 segment (all other
-- segments preserved verbatim, so 未定还款/[LO#…] classification markers are
-- untouched), and a SECURITY DEFINER RPC applies it to one loan after a
-- finance/principal role check. Empty source = remove the segment (badge
-- disappears).

-- ─── Pure segment rewrite (no table access — unit-testable via SELECT) ──────
CREATE OR REPLACE FUNCTION terms_with_funding_source(p_terms text, p_source text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_kept text[] := ARRAY[]::text[];
    v_seg  text;
BEGIN
    -- `·` is the segment delimiter of the terms convention. Drop any existing
    -- 资金来源 segment (either colon width), keep everything else in order.
    FOREACH v_seg IN ARRAY string_to_array(COALESCE(p_terms, ''), '·') LOOP
        v_seg := btrim(v_seg);
        IF v_seg <> '' AND v_seg !~ '^资金来源[:：]' THEN
            v_kept := v_kept || v_seg;
        END IF;
    END LOOP;
    IF COALESCE(p_source, '') <> '' THEN
        v_kept := v_kept || ('资金来源: ' || p_source);
    END IF;
    RETURN NULLIF(array_to_string(v_kept, ' · '), '');
END $$;

-- ─── RPC: set/clear the funding source on one loan ──────────────────────────
CREATE OR REPLACE FUNCTION set_loan_funding_source(p_loan_id uuid, p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role  user_role;
    v_src   text;
    v_terms text;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'set_loan_funding_source: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;

    -- Sanitise: `·` would break the segment format, newlines the badge —
    -- collapse both (plus runs of whitespace) into single spaces.
    v_src := btrim(regexp_replace(replace(COALESCE(p_source, ''), '·', ' '), '\s+', ' ', 'g'));
    IF length(v_src) > 60 THEN
        RAISE EXCEPTION 'set_loan_funding_source: value too long (max 60 chars)';
    END IF;

    SELECT repayment_terms INTO v_terms FROM loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'set_loan_funding_source: loan % not found', p_loan_id;
    END IF;

    UPDATE loans
       SET repayment_terms = terms_with_funding_source(v_terms, v_src)
     WHERE id = p_loan_id;
END $$;

REVOKE EXECUTE ON FUNCTION set_loan_funding_source(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_loan_funding_source(uuid, text) TO authenticated;
