-- ============================================================================
-- 20261027024500_sofa_corner_has_no_back_cushion.sql
-- A corner piece is no compartment of its own (2026-10-27).
-- ============================================================================
--
-- 20261027020300 counted a sofa's compartments by the ERP's SOFA_MODULES `cushions`, where a corner (CNR) has
-- one. Told so — "L、CNR = 1" — the user: "cnr , put = 0". So a special charged By quantity is charged nothing for
-- a corner: 1A + 1A + 1NA + CNR is three compartments, not four. Everything else as 20261027020300 left it.
--
--   catalogue_apply_sofa_charges   one statement: CNR joins the console and the stool at none.
--
-- The TypeScript twin: moduleCushions (quote-model.ts) — the Quote's first + on a counted special.
-- Production's body (20261027020300's, md5-checked), one statement swapped; the md5 checked at the end.
-- PGlite: tests/member-sql/validate-sofa-specials-by-compartment.mjs (after 20261027020300).

BEGIN;

DO $$
DECLARE
    v_apply TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_apply NOT IN ('c0146d4639ed8963daf6b9f6479af167', 'cefb19e6d7f7b7479dd752e5d9ac9d60') THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges is md5 %, not the body this migration was written from', v_apply;
    END IF;
END $$;

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

-- ── A corner has no back cushion of its own ─────────────────────────────────

SELECT pg_temp.swap_check('public.catalogue_apply_sofa_charges(uuid)'::regprocedure,
$old$WHEN m.module IN ('CONSOLE', 'STOOL', 'OTT') THEN 0$old$,
$new$WHEN m.module IN ('CNR', 'CONSOLE', 'STOOL', 'OTT') THEN 0$new$);

COMMENT ON FUNCTION public.catalogue_apply_sofa_charges(uuid) IS
    'Charges one order''s sofas their options (2026-10-27): lines grouped by base model; every distinct leg height and special priced above zero on Maintenance — matched by name — once per sofa times the sofas (the smallest line quantity), a special charged By quantity once per compartment (each piece''s back cushions, the ERP''s SOFA_MODULES — a corner, a console and a stool none — times its quantity); spread over the lines in proportion to their sales. The bill''s own special-order money is not read. Out of the margin, in the commissionable sales, never KPI. Idempotent — starts from no charge.';

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_apply TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_apply IS DISTINCT FROM 'cefb19e6d7f7b7479dd752e5d9ac9d60' THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges landed as md5 %, not this file''s body', v_apply;
    END IF;
END $$;

COMMIT;
