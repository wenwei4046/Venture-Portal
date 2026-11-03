-- ============================================================================
-- 20261030030000_quote_fabric_upgrades.sql
-- The Quote offers the fabric upgrades (2026-10-29).
-- ============================================================================
--
-- Maintenance › Fabrics › Sofa / Bedframe upgrades (20261030020000) charges a bill for the fabric series its fabric
-- is in. The user, asked how the Quote should offer one: "just like them choose, like upgrade fabric enough, then i
-- can edit the name and price" — the member picks the upgrade by its name: Standard, or "Upgrade fabric +RM 200".
-- The Quote names a fabric tier, not a fabric, so it cannot find a series: the member says which upgrade instead.
--
--   catalogue_fabric_upgrade_charges   a category's upgrades as the Quote reads them: [{ value, charge }]
--   member_catalogue                   each sofa's and bed frame's charges gain `fabric_upgrades` (two statements)
--
-- A charge, as every option the Quote charges (2026-10-06): on top of the price, out of the margin, in the
-- commission — a sofa once per sofa × the sofas, a bed frame per frame. A customer's price, so the member's own
-- snapshot carries it. Every sofa and every bed frame is offered its category's upgrades: an upgrade is a fabric's,
-- and any model is made in a fabric.
--
-- Production's body (md5 9819dad8…), two statements swapped; the md5 checked at the end.
-- PGlite: tests/member-sql/validate-quote-fabric-upgrades.mjs (the migration verbatim twice).

BEGIN;

DO $$
DECLARE
    v_catalogue TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_catalogue
      FROM pg_proc WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_catalogue NOT IN ('9819dad8f62bb13cd70471dc52df65ef', '6476f6f1fe5d51e13304562780b11d60') THEN
        RAISE EXCEPTION 'member_catalogue is md5 %, not the body this migration was written from', v_catalogue;
    END IF;
END $$;

-- ── A category's upgrades, as the Quote reads them ──────────────────────────
-- [{ "value": "Upgrade fabric", "charge": 200 }], the cheapest first; nothing (NULL) when the category has none, so
-- jsonb_strip_nulls leaves the key out as it does an option list with no charge.
CREATE OR REPLACE FUNCTION public.catalogue_fabric_upgrade_charges(p_company BIGINT, p_category TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT jsonb_agg(jsonb_build_object('value', u.name, 'charge', u.price) ORDER BY u.price, u.name)
      FROM catalogue_fabric_upgrades u
     WHERE u.erp_company_id = p_company
       AND u.category = UPPER(BTRIM(COALESCE(p_category, '')))
       AND u.price > 0;
$fn$;

COMMENT ON FUNCTION public.catalogue_fabric_upgrade_charges(BIGINT, TEXT) IS
    'A category''s fabric upgrades as the Quote offers them (2026-10-29): [{ value: name, charge }], the cheapest first; NULL when there is none. Read by member_catalogue for every sofa and bed frame model.';

-- member_catalogue runs as the service role alone (20261008010000).
REVOKE ALL ON FUNCTION public.catalogue_fabric_upgrade_charges(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalogue_fabric_upgrade_charges(BIGINT, TEXT) TO service_role;

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

-- ── Each bed frame's charges: its fabric upgrades after its specials ────────
SELECT pg_temp.swap_check('public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure,
$old$'specials',      catalogue_model_charges(v_company, 'bedframe_specials',      cm.enabled->'specials',      m.allowed_options->'specials'))))$old$,
$new$'specials',      catalogue_model_charges(v_company, 'bedframe_specials',      cm.enabled->'specials',      m.allowed_options->'specials'),
                   'fabric_upgrades', catalogue_fabric_upgrade_charges(v_company, 'BEDFRAME'))))$new$);

-- ── Each sofa's: the same, its category's ───────────────────────────────────
SELECT pg_temp.swap_check('public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure,
$old$'specials',      catalogue_model_charges(v_company, 'sofa_specials',          cm.enabled->'specials',      m.allowed_options->'specials'))))$old$,
$new$'specials',      catalogue_model_charges(v_company, 'sofa_specials',          cm.enabled->'specials',      m.allowed_options->'specials'),
                   'fabric_upgrades', catalogue_fabric_upgrade_charges(v_company, 'SOFA'))))$new$);

DO $$
DECLARE
    v_catalogue TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_catalogue
      FROM pg_proc WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_catalogue <> '6476f6f1fe5d51e13304562780b11d60' THEN
        RAISE EXCEPTION 'member_catalogue landed as md5 %, not this file''s', v_catalogue;
    END IF;
END $$;

COMMIT;

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Swap the two statements back (each without its fabric_upgrades line, md5 9819dad8…), then drop
-- catalogue_fabric_upgrade_charges. A Quote saved with an upgrade keeps its words; it is never re-priced by this.
