-- Add combo: a piece may be the left OR the right of a pair (2026-10-08, user:
-- 我需要左右都算的 function).
--
-- The ERP's combos — 76 of them adopted into catalogue_combos this morning —
-- often take either side in one slot: [["1A(R)(LHF)", "1A(R)(RHF)"], ["1NA"],
-- ["L(LHF)", "L(RHF)"]], so a customer's left- or right-armed sofa is the same
-- set. catalogue_add_combo took one module per slot only, so such a set, once
-- removed, could not be made again. It now takes, per slot, one module or up
-- to four it may be instead (the Product List offers the left/right pair), each
-- a sofa module of the model, none twice in a slot. Everything else is the
-- body production runs (md5 checked below, before and after): the same
-- refusals, the same rows, the same slots_key — erp_combo_slots_key already
-- sorts a slot's alternatives, and catalogue_apply_combos / member_catalogue
-- already match a slot by any of them, as they did the ERP's.

BEGIN;

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_add_combo(text, jsonb, text, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'cad2a29e9bec7bdcdc34bae26439b401' AND v_md5 IS DISTINCT FROM 'af24888148f8ec5d8ed3996e7249caa0' THEN
        RAISE EXCEPTION 'catalogue_add_combo drifted from the repo (md5 %) — compare before replacing it', v_md5;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION catalogue_add_combo(p_base_model TEXT, p_modules JSONB, p_label TEXT, p_prices JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $add$
DECLARE
    v_company BIGINT := 1;
    v_model   TEXT := UPPER(BTRIM(COALESCE(p_base_model, '')));
    v_label   TEXT := BTRIM(COALESCE(p_label, ''));
    v_key     TEXT;
    v_code    TEXT;
    v_tier    TEXT;
    v_prices  JSONB;
    v_heights TEXT[];
    v_n       INTEGER := 0;
BEGIN
    IF v_model = '' THEN
        RAISE EXCEPTION 'Pick a sofa model.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_modules) IS DISTINCT FROM 'array' OR jsonb_array_length(p_modules) < 2 THEN
        RAISE EXCEPTION 'Add at least two compartments.' USING ERRCODE = '22023';
    END IF;
    IF v_label = '' THEN
        RAISE EXCEPTION 'Give the set a name.' USING ERRCODE = '22023';
    END IF;

    -- A piece is one module of this model's sofa SKUs, or up to four it may be
    -- instead — the left or the right of a pair (2026-10-08), the ERP's own
    -- shape for a slot: ["1A(R)(LHF)", "1A(R)(RHF)"].
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s
                WHERE jsonb_typeof(s) <> 'array' OR jsonb_array_length(s) = 0) THEN
        RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s WHERE jsonb_array_length(s) > 4) THEN
        RAISE EXCEPTION 'A compartment may be one of four modules at most.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s, jsonb_array_elements(s) e
                WHERE jsonb_typeof(e) <> 'string' OR BTRIM(e #>> '{}') = '') THEN
        RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s
                WHERE (SELECT count(DISTINCT BTRIM(e #>> '{}')) FROM jsonb_array_elements(s) e) <> jsonb_array_length(s)) THEN
        RAISE EXCEPTION 'A compartment names the same module twice.' USING ERRCODE = '22023';
    END IF;
    FOR v_code IN
        SELECT DISTINCT BTRIM(e #>> '{}')
          FROM jsonb_array_elements(p_modules) s, jsonb_array_elements(s) e
    LOOP
        PERFORM 1
           FROM erp_products p
          WHERE p.erp_company_id = v_company
            AND UPPER(BTRIM(COALESCE(p.base_model, ''))) = v_model
            AND UPPER(COALESCE(p.category, '')) = 'SOFA'
            AND p.module_code = v_code
            AND p.removed_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Model % has no compartment %.', v_model, v_code USING ERRCODE = '22023';
        END IF;
    END LOOP;

    v_key := erp_combo_slots_key(p_modules);
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model AND c.slots_key = v_key) THEN
        RAISE EXCEPTION 'This model already has a combo with these compartments.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model
                  AND LOWER(BTRIM(COALESCE(c.label, ''))) = LOWER(v_label)) THEN
        RAISE EXCEPTION 'Model % already has a set called "%".', v_model, v_label USING ERRCODE = '22023';
    END IF;

    FOREACH v_tier IN ARRAY ARRAY['PRICE_1', 'PRICE_2', 'PRICE_3'] LOOP
        SELECT jsonb_object_agg(BTRIM(e.key), (e.value #>> '{}')::NUMERIC), array_agg(BTRIM(e.key) ORDER BY e.key)
          INTO v_prices, v_heights
          FROM jsonb_each(CASE WHEN jsonb_typeof(p_prices->v_tier) = 'object' THEN p_prices->v_tier ELSE '{}'::JSONB END) e
         WHERE BTRIM(e.key) <> ''
           AND (e.value #>> '{}') ~ '^\d+(\.\d{1,2})?$'
           AND (e.value #>> '{}')::NUMERIC > 0;
        CONTINUE WHEN v_prices IS NULL;
        INSERT INTO catalogue_combos (erp_company_id, base_model, modules, tier, label, heights)
        VALUES (v_company, v_model, p_modules, v_tier, v_label, v_heights);
        INSERT INTO catalogue_combo_prices (erp_company_id, base_model, slots_key, tier, price_by_height, updated_by, updated_at)
        VALUES (v_company, v_model, v_key, v_tier, v_prices, auth.uid(), now())
        ON CONFLICT (erp_company_id, base_model, slots_key, tier)
        DO UPDATE SET price_by_height = EXCLUDED.price_by_height, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
        v_n := v_n + cardinality(v_heights);
    END LOOP;

    IF v_n = 0 THEN
        RAISE EXCEPTION 'Fill at least one price.' USING ERRCODE = '22023';
    END IF;
    RETURN v_n;
END;
$add$;

COMMENT ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) IS
    'Product List › Combo Pricing › Add combo (2026-10-08): a sofa set in one transaction — a catalogue_combos row and a catalogue_combo_prices row per fabric tier with a positive price. A piece is one module or up to four it may be instead (the left or the right of a pair). Refuses (22023) a model or module that is not a sofa''s, a module twice in a piece, a set or a name the model already has.';

REVOKE ALL ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) TO authenticated;

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_add_combo(text, jsonb, text, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'af24888148f8ec5d8ed3996e7249caa0' THEN
        RAISE EXCEPTION 'catalogue_add_combo landed as % — not this file''s body', v_md5;
    END IF;
END $$;

COMMIT;
