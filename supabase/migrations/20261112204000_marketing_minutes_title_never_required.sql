-- ============================================================================
-- 20261112204000_marketing_minutes_title_never_required.sql
-- The Minutes Builder's Title, as the user settled it (2026-11-12): "title 就是一个句子，不需要再什么 long answer 之类的" ·
-- "最多放 description" · "title 是必填" — answered A: every template has one.
--   mkt_minutes_check       a Title is never required (nothing is filled in — Complete must never wait on it), and a
--                           template is published only with a Title. Both swapped in place in production's body
--                           (mig 20261112203000), refused if it moved.
--   mkt_minutes_locks_kept  a template that has a Title keeps it (by its id), of its kind — its sentence and description
--                           change freely. The function is 20261112180000's own (no copy of it drifted elsewhere).
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
     $n$'req', v_lock OR (v_type <> 'Title' AND coalesce(v_f ->> 'req', '') = 'true'),$n$],
    [$o$  IF p_publish AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link')$o$,
     $n$  IF p_publish AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Title') THEN
    RAISE EXCEPTION 'Minutes have a title — add a Title field.' USING ERRCODE = '22023';
  END IF;
  IF p_publish AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link')$n$]
  ]);
END
$do$;

-- A locked field stays as it was; a Title stays (by its id, of its kind). Nobody's to call but the save.
CREATE OR REPLACE FUNCTION public.mkt_minutes_locks_kept(p_old jsonb, p_new jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_o jsonb;
  v_n jsonb;
BEGIN
  FOR v_o IN SELECT x FROM jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) x
              WHERE (x ->> 'lock')::boolean OR x ->> 'type' = 'Title' LOOP
    SELECT x INTO v_n FROM jsonb_array_elements(p_new) x WHERE x ->> 'id' = v_o ->> 'id';
    IF v_o ->> 'type' = 'Title' THEN
      IF v_n IS NULL OR v_n ->> 'type' IS DISTINCT FROM 'Title' THEN
        RAISE EXCEPTION 'Every minutes has a title — it can''t be removed or retyped.' USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;
    IF v_n IS NULL OR v_n ->> 'type' IS DISTINCT FROM v_o ->> 'type' OR btrim(v_n ->> 'name') IS DISTINCT FROM btrim(v_o ->> 'name')
       OR NOT coalesce((v_n ->> 'lock')::boolean, false) THEN
      RAISE EXCEPTION '"%" is kept by every minutes — it can''t be renamed, retyped, made optional or removed.', v_o ->> 'name' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_minutes_locks_kept(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_locks_kept(jsonb, jsonb) TO service_role;

-- A Title saved required before this (none on production, 2026-11-12) is put right.
UPDATE public.mkt_minutes_templates t
   SET fields = (SELECT jsonb_agg(CASE WHEN f ->> 'type' = 'Title' THEN f || '{"req": false}'::jsonb ELSE f END ORDER BY i)
                   FROM jsonb_array_elements(t.fields) WITH ORDINALITY x(f, i))
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(t.fields) f WHERE f ->> 'type' = 'Title' AND (f ->> 'req')::boolean);

NOTIFY pgrst, 'reload schema';
