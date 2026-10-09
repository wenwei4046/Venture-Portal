-- ============================================================================
-- 20261009060000_overview_asks_the_cells.sql
-- The Overview's two summaries ask for the cell, not the account's kind
-- (Q7 of the People Management revamp, 2026-10-09).
-- ============================================================================
--
-- The Overview now picks its dashboard by the viewer's cells
-- (lib/surfaces.ts overviewFor): the treasury one for Treasury · View, HR's
-- for HR Costing · View. Its two summaries still asked the kind —
-- `dashboard_summary` answered "Access denied" to anybody but the principal /
-- finance kinds, `hr_dashboard_summary` to anybody but hr / principal — so a
-- Director's title (kind staff) holding Treasury · View was turned away by the
-- very summary its Overview asks for. Each asks the cell now
-- (has_any_action), its one check swapped in production's body. On
-- production the five logins that sign in are answered exactly as before
-- (checked 2026-10-09: Treasury · View = principal@, finance@, carrie;
-- HR Costing · View = principal@, hr@ — the two kinds' lists, to the person).

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
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- The treasury Overview's summary (INVOKER: its reads meet the row policies).
SELECT pg_temp.swap_check(
  'public.dashboard_summary()',
  $q$IF v_role NOT IN ('principal', 'finance') THEN$q$,
  $q$IF NOT public.has_any_action(ARRAY['treasury.view']) THEN$q$);

-- HR's Overview (DEFINER: the check is the whole gate).
SELECT pg_temp.swap_check(
  'public.hr_dashboard_summary(date)',
  $q$if coalesce(current_user_role()::text, '') not in ('hr', 'principal') then$q$,
  $q$if not public.has_any_action(ARRAY['hr_costing.view']) then$q$);

DO $$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.dashboard_summary()'::regprocedure) ~ 'v_role NOT IN' THEN
    RAISE EXCEPTION 'dashboard_summary still asks the kind';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_dashboard_summary(date)'::regprocedure) ~ 'current_user_role\(\)::text' THEN
    RAISE EXCEPTION 'hr_dashboard_summary still asks the kind';
  END IF;
END
$$;
