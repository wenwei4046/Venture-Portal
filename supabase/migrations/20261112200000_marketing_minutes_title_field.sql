-- ============================================================================
-- 20261112200000_marketing_minutes_title_field.sql
-- The Minutes Builder's Title field (2026-11-12 — the user, on the live preview's heading: "在 field 加一个 Title, 放到
-- 这个位置"): a field of its own kind, one a template, a line of words (≤ 200, as a Short text) that heads the minutes.
--   mkt_minutes_check  — Title is a kind the minutes hold, kept once (as Project link, Campaign period, Signature).
--   mkt_minutes_value  — a Title is written as a Short text is.
-- Both from production's bodies (md5 11171b3d… / 1ea06675…, mig 20261112180000), the statements swapped in place.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.swap(p_fn regprocedure, p_pairs text[][])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := pg_get_functiondef(p_fn);
  i     integer;
BEGIN
  FOR i IN 1 .. array_length(p_pairs, 1) LOOP
    IF (length(v_def) - length(replace(v_def, p_pairs[i][1], ''))) <> length(p_pairs[i][1]) THEN
      RAISE EXCEPTION '%: not the body this migration was written against (%).', p_fn, p_pairs[i][1];
    END IF;
    v_def := replace(v_def, p_pairs[i][1], p_pairs[i][2]);
  END LOOP;
  EXECUTE v_def;
END
$$;

DO $do$
BEGIN
  -- Run again: nothing to do.
  IF pg_get_functiondef('public.mkt_minutes_check(jsonb,jsonb,boolean)'::regprocedure) LIKE '%''Campaign period'', ''Title''];%' THEN
    RETURN;
  END IF;
  PERFORM pg_temp.swap('public.mkt_minutes_check(jsonb,jsonb,boolean)'::regprocedure, ARRAY[
    [$o$'Campaign period'];$o$, $n$'Campaign period', 'Title'];$n$],
    [$o$ARRAY['Project link', 'Campaign period', 'Signature']$o$, $n$ARRAY['Project link', 'Campaign period', 'Signature', 'Title']$n$]
  ]);
  PERFORM pg_temp.swap('public.mkt_minutes_value(jsonb,jsonb)'::regprocedure, ARRAY[
    [$o$IF v_type IN ('Short text', 'Long text', 'Date', 'Number') THEN$o$, $n$IF v_type IN ('Short text', 'Long text', 'Date', 'Number', 'Title') THEN$n$],
    [$o$IF v_type = 'Short text' AND length(v_s) > 200$o$, $n$IF v_type IN ('Short text', 'Title') AND length(v_s) > 200$n$],
    [$o$CASE WHEN v_type = 'Short text' THEN 200$o$, $n$CASE WHEN v_type IN ('Short text', 'Title') THEN 200$n$]
  ]);
END
$do$;

NOTIFY pgrst, 'reload schema';
