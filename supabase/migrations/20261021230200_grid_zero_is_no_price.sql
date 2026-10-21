-- ============================================================================
-- 20261021230200_grid_zero_is_no_price.sql
-- A sofa price grid's 0 is no price (2026-10-21 — the user, asked how a Recost should cost the seats 8069 and 9058
-- carry at 0: "0 = 还没定价").
-- ============================================================================
--
-- The Product List's grid for 8069-1A(LHF) prices seat 28 at RM 750 and every other seat at 0; 8069's other modules
-- and 9058's are the same. The cell lookup took a 0 as a price — a module costing RM 0, its bill's margin near 100% —
-- so a Recost of October would have costed 15 lines on 7 bills (HC-SO-2610-021, -030, -032, -089, -104, -177, -179)
-- at RM 0, and the Quote would have offered those seats at RM 0. A combo's 0 was already no price
-- (catalogue_apply_combos, pickCombo), and a blank cell is none (priceGridOf: "a zero cost reads as a 100% margin").
--
--   catalogue_grid_price   a cell priced 0 is passed over: the tier fallback goes on to a tier priced at that height,
--                          and with none the line is Cost pending (catalogue_unit_price: no_height), as for a blank.
--   member_catalogue       a seat height is offered to the Quote only where a cell prices it above 0.
--
-- The TypeScript twin, gridPrice (lib/catalogue/pricing.ts), answers the same. A SKU's one flat figure of 0 is
-- unchanged. Production's bodies, one statement swapped each (pg_temp.swap_check), md5 checked at the end.
-- PGlite: tests/member-sql/validate-grid-zero-is-no-price.mjs.

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

-- Each statement starts at its first word: a leading run of space would match the line break before it too.

-- ── The run's cell: a 0 is passed over ─────────────────────────────────────

SELECT pg_temp.swap_check('public.catalogue_grid_price(jsonb, text, text)'::regprocedure,
$old$AND (c->>'price') ~ '^\d+(\.\d+)?$'$old$,
$new$AND (c->>'price') ~ '^\d+(\.\d+)?$'
       AND (c->>'price')::NUMERIC > 0$new$);

-- ── The Quote's seat heights: only those priced above 0 ────────────────────

SELECT pg_temp.swap_check('public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure,
$old$AND (cell->>'price') ~ '^\d+(\.\d+)?$'$old$,
$new$AND (cell->>'price') ~ '^\d+(\.\d+)?$'
                              AND (cell->>'price')::NUMERIC > 0$new$);

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_grid    TEXT;
    v_catalog TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_grid
      FROM pg_proc WHERE oid = 'public.catalogue_grid_price(jsonb, text, text)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_catalog
      FROM pg_proc WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_grid IS DISTINCT FROM '901e210be1edc909178fd18e06f5e67f' THEN
        RAISE EXCEPTION 'catalogue_grid_price landed as md5 %, not this file''s body', v_grid;
    END IF;
    IF v_catalog IS DISTINCT FROM '9819dad8f62bb13cd70471dc52df65ef' THEN
        RAISE EXCEPTION 'member_catalogue landed as md5 %, not this file''s body', v_catalog;
    END IF;
END $$;

COMMIT;
