-- ============================================================================
-- 20261021230000_combo_tier_falls_back.sql
-- A combo's price is found at a bill's fabric tier the way a module's is (2026-10-21 — the user, after a side agent's
-- note that a SOFFIO bill's commission would still miss the set the Quote costs it at: "that calculate margin must be
-- same, depends on the cost in product list, commission as well").
-- ============================================================================
--
-- Every sofa bill arrives at PRICE_2: the ERP's fabric list puts 763 of its fabrics there (19 at PRICE_1), and a line
-- that names no fabric reads PRICE_2 (catalogue_fabric_tier) — all 155 sofa sets billed since 2026-09-01. A module's
-- price is looked up at that tier and, when the Product List has none there, falls back: PRICE_2, else the lowest tier
-- priced (catalogue_grid_price; gridPrice in TS). So a SOFFIO 1A(LHF) on a PRICE_2 bill is costed at its only price,
-- PRICE_1's 910. A combo did not fall back — catalogue_apply_combos took only a set priced at the bill's own tier — and
-- the four SOFFIO sets, the only combos with a price, are priced at PRICE_1 alone, the one tier the Quote can offer for
-- SOFFIO. The Quote costed a 1A(LHF) + 1A(RHF) + Console at the set's RM 2,140 (31.9% at RM 4,490); the run would have
-- costed the same sale at its modules' 910 + 910 + 700 (19.8%).
--
--   catalogue_apply_combos    a set priced at any tier is a candidate. The bill's own tier wins (a tier-specific set
--                             before an any-tier one), else PRICE_2, else the lowest tier — a module's order — then the
--                             newest effective, the newest made, the id, as before. The TypeScript twin is pickCombo.
--
-- No bill changes: no bill since 2026-09-01 has an exact set priced only at another tier (the SOFFIO sets are effective
-- from 2026-10-21 and no 8030 bill is dated since), and a landed month changes only when it is Recosted.
--
-- Production's body (the repo's 20261008040000 copy with the office clock's CURRENT_DATE rewrite, 20261009000000 — md5
-- ae3f3890…), two statements swapped (pg_temp.swap_check); the md5 of what landed is checked at the end.
-- PGlite: tests/member-sql/validate-combo-tier-fallback.mjs.

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

-- ── A set of any tier is a candidate ───────────────────────────────────────

SELECT pg_temp.swap_check('public.catalogue_apply_combos(uuid)'::regprocedure,
$old$AND sc.effective_from <= COALESCE(v_date, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
                   AND (sc.tier IS NULL OR sc.tier = g.tier)) x$old$,
$new$AND sc.effective_from <= COALESCE(v_date, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)) x$new$);

-- ── The bill's own tier, else PRICE_2, else the lowest — a module's order ──

SELECT pg_temp.swap_check('public.catalogue_apply_combos(uuid)'::regprocedure,
$old$ORDER BY (x.tier IS NOT NULL) DESC, x.effective_from DESC,
                  x.erp_created_at DESC NULLS LAST, x.erp_id DESC$old$,
$new$ORDER BY CASE WHEN x.tier = g.tier THEN 0 WHEN x.tier IS NULL THEN 1 WHEN x.tier = 'PRICE_2' THEN 2 ELSE 3 END,
                  x.tier NULLS FIRST, x.effective_from DESC,
                  x.erp_created_at DESC NULLS LAST, x.erp_id DESC$new$);

COMMENT ON FUNCTION catalogue_apply_combos(UUID) IS
    'Re-costs one order''s sofa builds at the portal''s combo prices: same base model, one tier and one seat height across the set, EXACTLY the set (2026-10-08), module codes ignoring case (2026-10-21), uniform qty, the set''s price at the bill''s fabric tier else PRICE_2 else the lowest tier priced — as a module''s price falls back (2026-10-21) — spread across the matched lines in proportion to their own costs. Idempotent — starts from list_cost_amount. The TypeScript twin is pickCombo (lib/catalogue/combos.ts).';

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_apply TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_combos(uuid)'::regprocedure;
    IF v_apply IS DISTINCT FROM 'bd856d49e9b677fc9bd7f88f3a3dcd51' THEN
        RAISE EXCEPTION 'catalogue_apply_combos landed as md5 %, not this file''s body', v_apply;
    END IF;
END $$;

COMMIT;
