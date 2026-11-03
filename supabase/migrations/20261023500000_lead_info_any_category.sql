-- Lead View › General info: any category can be deleted (2026-10-23 — the user, right-clicking Showrooms: "加delete").
-- Until now only the categories CS added (custom) went when the page saved without them; the four seeded ones
-- (Showrooms, Payment methods, Delivery, Warranty and returns) stayed whatever the page sent. Now a category the save
-- leaves out goes, seeded or not — soft-deleted with its cards, as a custom one always was.
--
-- PRODUCTION's lead_save_info (md5 3ca00514…, mig 20261022230000 + its page guard 20261022230100) with three
-- statements' "custom" conditions taken out, each found exactly once; nothing else in the body moves.

DO $do$
DECLARE
  v_oid oid := 'public.lead_save_info(jsonb)'::regprocedure;
  v_src text;
  v_new text;
  v_def text;
  v_swaps text[][] := ARRAY[
    ARRAY[' OR NOT v_cat = ANY (v_keep_cats || ARRAY(SELECT id FROM public.lead_info_cats WHERE NOT custom))', ' OR NOT v_cat = ANY (v_keep_cats)'],
    ARRAY['(SELECT id FROM public.lead_info_cats WHERE custom AND NOT id = ANY (v_keep_cats))', '(SELECT id FROM public.lead_info_cats WHERE NOT id = ANY (v_keep_cats))'],
    ARRAY['SET deleted_at = now() WHERE custom AND deleted_at IS NULL AND NOT id = ANY (v_keep_cats)', 'SET deleted_at = now() WHERE deleted_at IS NULL AND NOT id = ANY (v_keep_cats)']];
  i integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '3ca0051495152125f6defe764cb2bde9' THEN
    RAISE EXCEPTION 'lead_save_info is not the body this migration expects — compare it with production first';
  END IF;
  v_new := v_src;
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    IF (length(v_new) - length(replace(v_new, v_swaps[i][1], ''))) <> length(v_swaps[i][1]) THEN
      RAISE EXCEPTION 'lead_save_info: statement % is not there exactly once', i;
    END IF;
    v_new := replace(v_new, v_swaps[i][1], v_swaps[i][2]);
  END LOOP;
  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def) - length(replace(v_def, v_src, ''))) <> length(v_src) THEN
    RAISE EXCEPTION 'lead_save_info: its body is not in its definition exactly once';
  END IF;
  EXECUTE replace(v_def, v_src, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
