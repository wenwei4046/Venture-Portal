-- Combo Pricing is the portal's own (2026-10-08, user: "need delete button,
-- then that side no need sync with houzs erp anymore, is like our own combo
-- costing").
--
-- Until today a sofa combo was the ERP's (erp_sofa_combos, written only by
-- ingest_erp_catalogue) or, since 20261008010000, one made on the Product List
-- (catalogue_combos). From here every combo is the portal's:
--
--   * the ERP's 76 live combos (62 sets) are ADOPTED into catalogue_combos
--     once — same model, compartments, fabric tier, name, seat heights and
--     effective date, so nothing about which bill a combo fits changes; the
--     ERP id they came from stays on the row (erp_id);
--   * catalogue_live_combos — what the run's costing (catalogue_apply_combos)
--     and the Quote (member_catalogue) read — is catalogue_combos alone. A
--     combo the ERP adds, edits or drops no longer reaches a bill. The ERP
--     keeps pushing its catalogue and ingest_erp_catalogue keeps recording
--     erp_sofa_combos (a mirror nothing reads), so the ERP needs no change;
--   * catalogue_remove_combos takes a set away — every fabric tier of it, and
--     its prices. The row is kept (removed_at / removed_by), the prices are
--     deleted so a set made again later starts clean. A bill already costed
--     at the combo keeps that cost until its month is Recosted, as with any
--     price change.
--
-- Nothing changes for any bill today: on 2026-10-08 no combo has a price
-- (catalogue_combo_prices is empty) and no sales line is costed at a combo.

BEGIN;

-- ── 1. Where an adopted set came from, and who took one away ────────────────
ALTER TABLE catalogue_combos
    ADD COLUMN IF NOT EXISTS erp_id     TEXT,
    ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN catalogue_combos.erp_id IS
    'The ERP combo (erp_sofa_combos.erp_id) this set was adopted from on 2026-10-08, when Combo Pricing became the portal''s own. NULL = made on the Product List.';
COMMENT ON COLUMN catalogue_combos.removed_by IS
    'Who removed the set (Combo Pricing › Edit prices › Remove). Its prices are deleted with it.';

-- ── 2. The ERP's live combos become ours, once ──────────────────────────────
-- One row per (model, compartments, tier) — the newest live definition, in
-- effect from the earliest of its live dates, so no bill it fitted loses it.
INSERT INTO catalogue_combos (erp_company_id, base_model, modules, tier, label, heights,
                              effective_from, created_by, created_at, erp_id)
SELECT DISTINCT ON (sc.erp_company_id, sc.base_model, erp_combo_slots_key(sc.modules), sc.tier)
       sc.erp_company_id,
       sc.base_model,
       sc.modules,
       sc.tier,
       sc.label,
       COALESCE(sc.heights, '{}'),
       MIN(sc.effective_from) OVER (PARTITION BY sc.erp_company_id, sc.base_model, erp_combo_slots_key(sc.modules), sc.tier),
       NULL,
       COALESCE(sc.first_seen_at, now()),
       sc.erp_id::TEXT
  FROM erp_sofa_combos sc
 WHERE sc.deleted_at IS NULL
   AND sc.removed_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM catalogue_combos pc
                    WHERE pc.erp_company_id = sc.erp_company_id
                      AND pc.base_model     = sc.base_model
                      AND pc.slots_key      = erp_combo_slots_key(sc.modules)
                      AND pc.tier           = sc.tier
                      AND pc.removed_at IS NULL)
 ORDER BY sc.erp_company_id, sc.base_model, erp_combo_slots_key(sc.modules), sc.tier,
          sc.effective_from DESC, sc.erp_created_at DESC NULLS LAST, sc.erp_id DESC;

-- ── 3. Every combo there is: ours ───────────────────────────────────────────
-- Same columns as before (erp_id 'portal:<id>', portal always TRUE), so the
-- two functions that read it are untouched.
CREATE OR REPLACE VIEW catalogue_live_combos WITH (security_invoker = true) AS
SELECT 'portal:' || pc.id::TEXT AS erp_id,
       pc.erp_company_id,
       pc.base_model,
       pc.modules,
       pc.slots_key,
       pc.tier,
       pc.label,
       pc.effective_from,
       pc.created_at            AS erp_created_at,
       TRUE                     AS portal
  FROM catalogue_combos pc
 WHERE pc.removed_at IS NULL;

COMMENT ON VIEW catalogue_live_combos IS
    'The live sofa combos a build can be costed at — the portal''s own (catalogue_combos) since 2026-10-08; the ERP''s mirror (erp_sofa_combos) is no longer read. Read by catalogue_apply_combos and member_catalogue. security_invoker: the table''s own RLS still answers.';

COMMENT ON TABLE catalogue_combos IS
    'Every sofa combo, the portal''s own since 2026-10-08: adopted from the ERP that day (erp_id) or made on the Product List (Combo Pricing › Add combo), one row per fabric tier. Priced in catalogue_combo_prices on (base_model, slots_key, tier) and costed through catalogue_live_combos. Removed, never deleted (removed_at / removed_by).';

COMMENT ON TABLE erp_sofa_combos IS
    'Mirror of the ERP''s Combo Pricing (scm.sofa_combo_pricing), sales-side master rows only, DEFINITIONS only. Nothing reads it since 2026-10-08: combos are the portal''s own (catalogue_combos, which adopted the live rows once). ingest_erp_catalogue still records what the ERP sends.';

COMMENT ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) IS
    'Product List › Combo Pricing › Add combo (2026-10-08): a sofa set in one transaction — a catalogue_combos row and a catalogue_combo_prices row per fabric tier with a positive price. Refuses (22023) a model or module that is not a sofa''s, a set or a name the model already has.';

-- ── 4. Taking a set away ────────────────────────────────────────────────────
-- SECURITY INVOKER, like catalogue_add_combo: the Principal's RLS (admin
-- scope) is the gate, the Server Action's requirePermission('product_list')
-- the one before it. Checked out loud here because RLS would only make the
-- UPDATE match nothing. All or nothing: one set already gone refuses the lot.
CREATE OR REPLACE FUNCTION catalogue_remove_combos(p_sets JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $rm$
DECLARE
    v_company BIGINT := 1;
    v_set     JSONB;
    v_model   TEXT;
    v_key     TEXT;
    v_rows    INTEGER;
    v_n       INTEGER := 0;
BEGIN
    IF NOT COALESCE((SELECT has_scope(ARRAY['admin'])), FALSE) THEN
        RAISE EXCEPTION 'Only the Principal can remove a combo.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_sets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sets) = 0 THEN
        RAISE EXCEPTION 'Pick a combo to remove.' USING ERRCODE = '22023';
    END IF;

    FOR v_set IN SELECT s FROM jsonb_array_elements(p_sets) s LOOP
        v_model := UPPER(BTRIM(COALESCE(v_set->>'base_model', '')));
        v_key   := v_set->>'slots_key';
        IF v_model = '' OR v_key IS NULL OR v_key = '' THEN
            RAISE EXCEPTION 'Pick a combo to remove.' USING ERRCODE = '22023';
        END IF;

        UPDATE catalogue_combos
           SET removed_at = now(),
               removed_by = auth.uid()
         WHERE erp_company_id = v_company
           AND base_model     = v_model
           AND slots_key      = v_key
           AND removed_at IS NULL;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
            RAISE EXCEPTION 'Model % no longer has that combo. Refresh the page and try again.', v_model USING ERRCODE = '22023';
        END IF;

        DELETE FROM catalogue_combo_prices
         WHERE erp_company_id = v_company
           AND base_model     = v_model
           AND slots_key      = v_key;
        v_n := v_n + 1;
    END LOOP;

    RETURN v_n;
END;
$rm$;

COMMENT ON FUNCTION catalogue_remove_combos(JSONB) IS
    'Product List › Combo Pricing › Remove (2026-10-08): takes sets away — p_sets = [{base_model, slots_key}], every fabric tier of each — and deletes their prices. The rows stay (removed_at / removed_by). Refuses (42501) without admin scope and (22023) a set that is already gone; all or nothing.';

REVOKE ALL ON FUNCTION catalogue_remove_combos(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_remove_combos(JSONB) TO authenticated;

-- ── 5. What landed is what this file says ───────────────────────────────────
DO $$
DECLARE
    v_missing INTEGER;
    v_live    INTEGER;
BEGIN
    -- Every live ERP combo has a live set of ours under the same key.
    SELECT count(*) INTO v_missing
      FROM (SELECT DISTINCT erp_company_id, base_model, erp_combo_slots_key(modules) AS slots_key, tier
              FROM erp_sofa_combos
             WHERE deleted_at IS NULL AND removed_at IS NULL) k
     WHERE NOT EXISTS (SELECT 1 FROM catalogue_combos pc
                        WHERE pc.erp_company_id = k.erp_company_id AND pc.base_model = k.base_model
                          AND pc.slots_key = k.slots_key AND pc.tier = k.tier AND pc.removed_at IS NULL);
    IF v_missing > 0 THEN
        RAISE EXCEPTION '% live ERP combos were not adopted', v_missing;
    END IF;
    SELECT count(*) INTO v_live FROM catalogue_live_combos;
    IF v_live <> (SELECT count(*) FROM catalogue_combos WHERE removed_at IS NULL) THEN
        RAISE EXCEPTION 'catalogue_live_combos does not read catalogue_combos alone';
    END IF;
END $$;

COMMIT;
