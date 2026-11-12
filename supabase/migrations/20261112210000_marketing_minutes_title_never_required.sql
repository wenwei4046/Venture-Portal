-- ============================================================================
-- 20261112210000_marketing_minutes_title_never_required.sql
-- A Title field is the template's own sentence heading the minutes, with at most a description under it (2026-11-12 —
-- the user: "title 就是一个句子，不需要再什么 long answer 之类的" · "最多放 description"): nothing is filled in, so it is never
-- required — else Complete would wait forever for an answer nobody can give. mkt_minutes_check keeps `req` false for it,
-- whatever is sent; the statement swapped in place in production's body (mig 20261112200000).
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
  IF pg_get_functiondef('public.mkt_minutes_check(jsonb,jsonb,boolean)'::regprocedure) LIKE '%v_type <> ''Title'' AND%' THEN
    RETURN;
  END IF;
  PERFORM pg_temp.swap('public.mkt_minutes_check(jsonb,jsonb,boolean)'::regprocedure, ARRAY[
    [$o$'req', v_lock OR coalesce(v_f ->> 'req', '') = 'true',$o$,
     $n$'req', v_lock OR (v_type <> 'Title' AND coalesce(v_f ->> 'req', '') = 'true'),$n$]
  ]);
END
$do$;

-- A Title saved required before this (none on production, 2026-11-12) is put right.
UPDATE public.mkt_minutes_templates t
   SET fields = (SELECT jsonb_agg(CASE WHEN f ->> 'type' = 'Title' THEN f || '{"req": false}'::jsonb ELSE f END ORDER BY i)
                   FROM jsonb_array_elements(t.fields) WITH ORDINALITY x(f, i))
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.fields) f WHERE f ->> 'type' = 'Title' AND (f ->> 'req')::boolean);

NOTIFY pgrst, 'reload schema';
