-- ════════════════════════════════════════════════════════════════════════════
-- A sofa model's name, the portal's own (2026-10-19)
--
-- The user, on Product List › SKU Master (Sofa) and a sofa's Modular window:
-- "sofa category same as mattress have the model name … then it can be add and
-- edit, on here". A mattress's model IS its name (APEX, CLOUDREST); a sofa's is a
-- number (5066), and the ERP names only 12 of the 82 (5535 NOVA, 8050 LAZIO …).
-- A name is the portal's decision, so it sits with the portal's other decisions
-- about the model — catalogue_models, which no ERP delivery touches — never in
-- the mirror (erp_product_models is the ERP's alone, rewritten by every delivery).
--
-- 1. catalogue_models.model_name — typed on Modular; NULL = the ERP's own name.
-- 2. member_catalogue — the Quote names a model by it: production's body with ONE
--    expression swapped (m.name AS model_name → COALESCE(cm.model_name, m.name)),
--    refused unless production still runs the body read on 2026-10-19 (md5
--    a4261ebb…; CLAUDE.md › never CREATE OR REPLACE from a stale copy). A named
--    sofa then reads "5066 ROMA" there, as an ERP-named one reads "8030 SOFFIO".
--    The calculator's section still reads the ERP's own name
--    (catalogue_calc_category is handed m.name, untouched), so a name never moves
--    a model to another section.
-- Run twice it changes nothing: the column and its check exist, the body is swapped.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.catalogue_models ADD COLUMN IF NOT EXISTS model_name text;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.catalogue_models'::regclass
                    AND conname = 'catalogue_models_model_name_valid') THEN
    ALTER TABLE public.catalogue_models ADD CONSTRAINT catalogue_models_model_name_valid
      CHECK (model_name IS NULL OR (model_name = btrim(model_name) AND char_length(model_name) BETWEEN 1 AND 80));
  END IF;
END
$check$;

COMMENT ON COLUMN public.catalogue_models.model_name IS
  'The model''s name as the portal gives it (Product List › Modular, a sofa''s window — 2026-10-19). NULL = the ERP''s own erp_product_models.name. Read wherever the model is named — the Product List and the Quote (member_catalogue) — never by the calculator''s section, which reads the ERP''s name.';

DO $swap$
DECLARE
  v_fn  constant regprocedure := 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
  v_old constant text := 'm.name AS model_name';
  v_new constant text := 'COALESCE(cm.model_name, m.name) AS model_name';
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn;
  IF md5(v_src) = '7ad51e775f94d16c69533b34b496d29e' THEN
    RETURN;  -- swapped already
  END IF;
  IF md5(v_src) <> 'a4261ebbc85d1a2f9aaf867bde9ad2f5' THEN
    RAISE EXCEPTION 'member_catalogue changed on production since 2026-10-19 (md5 %) — re-derive this migration from its live definition', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'member_catalogue: "%" is not there exactly once', v_old;
  END IF;

  -- pg_get_functiondef + replace: owner, grants (service role only), comment and settings stay.
  EXECUTE replace(pg_get_functiondef(v_fn), v_old, v_new);

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_fn;
  IF md5(v_src) <> '7ad51e775f94d16c69533b34b496d29e' THEN
    RAISE EXCEPTION 'member_catalogue did not land as written (md5 %)', md5(v_src);
  END IF;
END
$swap$;

NOTIFY pgrst, 'reload schema';
