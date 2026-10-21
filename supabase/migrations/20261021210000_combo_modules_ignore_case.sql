-- ============================================================================
-- 20261021210000_combo_modules_ignore_case.sql
-- A combo's modules match whatever their case (2026-10-21 — the user, on a SOFFIO quote at 19.8%: "if the sofa
-- compartment that got match with the combo, it should use the combo costing to calculate"; the salesperson: "but i set
-- at combo price dy").
-- ============================================================================
--
-- The quote: SOFFIO (8030) 1A(LHF) + 1A(RHF) + Console at seat 35, fabric 1, sold at RM 4,490 — margin 19.8%, the three
-- modules at their own prices (910 + 910 + 700), though the Product List prices the set "1A(LHF) + 1A(RHF) + CONSOLE" at
-- RM 2,140 at 35 (31.9%). The ERP's SKU master holds that console twice: 8030-Console (module `Console`, the one the
-- Quote sells and the bills carry) and 8030-CONSOLE (`CONSOLE`, inactive since 2026-09-30, the same prices). Add combo
-- showed both cards and the set was made on CONSOLE; the slot matcher compared codes exactly, so neither the Quote nor a
-- bill could ever meet it.
--
--   catalogue_match_slots     compares a built module with a slot's codes trimmed and upper-cased, both sides. It is the
--                             costing's one matcher: the run's catalogue_apply_combos calls it, and so does the next.
--   catalogue_combos_collide  pairs two sets' pieces the same way, so Add combo refuses "… + Console" beside
--                             "… + CONSOLE" — one bill, one combo (2026-10-08).
--
-- A product code is matched ignoring case already (catalogue_sku_for_code; codeKey in lib/catalogue/keys.ts). The
-- TypeScript twins — matchComboSlots and combosCollide in lib/catalogue/combos.ts, what the Quote costs with — answer the
-- same, and Add combo shows a module spelled two ways as one card, the live SKU's. No bill changes: the one set this
-- reaches is effective from 2026-10-21 and no 8030 bill is dated since, and a month changes only when it is Recosted.
--
-- Both functions from PRODUCTION's body (the repo's last copies — 20260924030000 and 20261008040000 — are the same, md5
-- ca383219… and 162a457c…), one statement swapped at a time (pg_temp.swap_check); the md5 of what landed is checked at the
-- end. PGlite: tests/member-sql/validate-combo-modules-ignore-case.mjs.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── The matcher: a slot's codes, and the module it tries, upper-cased ──────

-- Each statement starts at its first word: a leading run of space would match the line break before it too.
SELECT pg_temp.swap_check('public.catalogue_match_slots(text[], jsonb)'::regprocedure,
$old$codes := CASE WHEN jsonb_typeof(slot) = 'array'
                      THEN ARRAY(SELECT BTRIM(x) FROM jsonb_array_elements_text(slot) x WHERE BTRIM(x) <> '')
                      ELSE ARRAY(SELECT BTRIM(slot #>> '{}') WHERE BTRIM(COALESCE(slot #>> '{}', '')) <> '') END;$old$,
$new$codes := CASE WHEN jsonb_typeof(slot) = 'array'
                      THEN ARRAY(SELECT UPPER(BTRIM(x)) FROM jsonb_array_elements_text(slot) x WHERE BTRIM(x) <> '')
                      ELSE ARRAY(SELECT UPPER(BTRIM(slot #>> '{}')) WHERE BTRIM(COALESCE(slot #>> '{}', '')) <> '') END;$new$);

SELECT pg_temp.swap_check('public.catalogue_match_slots(text[], jsonb)'::regprocedure,
$old$AND BTRIM(p_built[x]) = ANY (codes)$old$,
$new$AND UPPER(BTRIM(p_built[x])) = ANY (codes)$new$);

COMMENT ON FUNCTION catalogue_match_slots(TEXT[], JSONB) IS
    'Which built modules fill a combo''s slots (each an OR-set of module codes): the 1-based indices consumed, ascending, or NULL when a slot cannot be filled — the ERP''s Kuhn matching. Codes compare trimmed and ignoring case (2026-10-21: the ERP spells the SOFFIO console Console and CONSOLE). The TypeScript twin is matchComboSlots (lib/catalogue/combos.ts).';

-- ── One bill, one combo, whatever the case ─────────────────────────────────

SELECT pg_temp.swap_check('public.catalogue_combos_collide(jsonb, jsonb)'::regprocedure,
$old$JOIN jsonb_array_elements_text(p_b->j) y ON BTRIM(x) = BTRIM(y)$old$,
$new$JOIN jsonb_array_elements_text(p_b->j) y ON UPPER(BTRIM(x)) = UPPER(BTRIM(y))$new$);

COMMENT ON FUNCTION catalogue_combos_collide(JSONB, JSONB) IS
    'Two combos'' slots (one module, or the modules a piece may be): TRUE when a single bill could match both exactly — the same number of pieces, paired so each pair shares a module, case ignored (2026-10-21). catalogue_add_combo refuses such a set (2026-10-08: one bill, one combo).';

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_match   TEXT;
    v_collide TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_match
      FROM pg_proc WHERE oid = 'public.catalogue_match_slots(text[], jsonb)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_collide
      FROM pg_proc WHERE oid = 'public.catalogue_combos_collide(jsonb, jsonb)'::regprocedure;
    IF v_match IS DISTINCT FROM 'c93e5bbc2c9d6a7ae714a82bce309c7a' THEN
        RAISE EXCEPTION 'catalogue_match_slots landed as md5 %, not this file''s body', v_match;
    END IF;
    IF v_collide IS DISTINCT FROM 'b4b63a260b2926ba503799aa7b8f914e' THEN
        RAISE EXCEPTION 'catalogue_combos_collide landed as md5 %, not this file''s body', v_collide;
    END IF;
    -- Still no two live sets one bill could match, now that case is ignored.
    IF EXISTS (
        WITH sets AS (
            SELECT DISTINCT ON (base_model, slots_key) base_model, slots_key, modules
              FROM catalogue_combos WHERE removed_at IS NULL
             ORDER BY base_model, slots_key, created_at)
        SELECT 1 FROM sets a JOIN sets b ON UPPER(a.base_model) = UPPER(b.base_model) AND a.slots_key < b.slots_key
         WHERE catalogue_combos_collide(a.modules, b.modules)) THEN
        RAISE EXCEPTION 'two live combo sets collide once case is ignored — remove one before this rule';
    END IF;
END $$;

COMMIT;
