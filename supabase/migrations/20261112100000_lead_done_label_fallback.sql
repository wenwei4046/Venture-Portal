-- The finish button follows the same rule as every other box (2026-11-12 — the user: "Fix it"): an empty language
-- box is filled by the other language. Mig 20261111130000 gave a Chinese-writing customer the default 就这些 whenever
-- the 中文 box was empty, even where the template set its own English finish button ("Done"); now the English one is
-- used then, and the English side takes the Chinese one when only that is written. Both empty: That's all / 就这些.
--
-- PRODUCTION's lead_flow_question (md5 8aacc9c1…, = mig 20261111130000's), two lines swapped, each found once.

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY[$$v_done_en text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabel', '')), ''), 'That''s all');$$,
          $$v_done_en text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabel', '')), ''), NULLIF(btrim(coalesce(p_step->>'doneLabelZh', '')), ''), 'That''s all');  -- the other box when empty (mig 20261112100000)$$],
    ARRAY[$$v_done_zh text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabelZh', '')), ''), '就这些');$$,
          $$v_done_zh text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabelZh', '')), ''), NULLIF(btrim(coalesce(p_step->>'doneLabel', '')), ''), '就这些');$$]];
  i int;
  v_sig regprocedure := 'public.lead_flow_question(uuid,public.lead_flows,jsonb,text)'::regprocedure;
  v_src text;
  v_def text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261112100000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '8aacc9c1b3c88c9d89f68d8a98a6d6bf' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    IF (length(v_def) - length(replace(v_def, v_swaps[i][1], ''))) / length(v_swaps[i][1]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once: %', v_sig, left(v_swaps[i][1], 60);
    END IF;
    v_def := replace(v_def, v_swaps[i][1], v_swaps[i][2]);
  END LOOP;
  EXECUTE v_def;
END
$do$;
