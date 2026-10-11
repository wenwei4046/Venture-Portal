-- ============================================================================
-- 20261011150100_guest_day_on_behalf.sql
-- The guest page's schedule says who made an HQ meeting booked for somebody
-- else, as the portal and both apps do since 20261011150000 (the user's answer
-- to review L3, 2026-10-11: "Grace (for Chea Huan)"). Guests keep seeing HQ
-- meetings' titles and who booked them — the user kept the prototype (L1).
-- PRODUCTION's body, one statement swapped (pg_temp.swap_check, as
-- 20261011120000); a second run changes nothing.
-- ============================================================================

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
    RETURN;
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.guest_link_day(text, date)',
  $q$'by', b.booked_by_name, 'pax', b.pax)$q$,
  $q$'by', b.booked_by_name, 'onBehalfBy', b.on_behalf_by, 'pax', b.pax)$q$);
