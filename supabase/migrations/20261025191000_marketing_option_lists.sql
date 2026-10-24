-- 20261025191000_marketing_option_lists.sql
-- 2026-10-25 — Marketing ③d-2: a choice's options from a shared list (the user's answer 9: "a shared option list
-- (Locations) as a dropdown — the person filling it in adds a missing option on the spot"; `Canvas Template Editor.dc.html`:
-- *Shared option list · Locations* — "used across the group · edit once, updates everywhere" — or *Own options for this
-- field*). Until now a choice was typed in as text on the task page.
--   The lists     mkt_option_lists — one a name (Locations — the handoff's six to start), its options in order; nobody's to
--                 read or write but the functions below.
--   A field       a Select or Multi-select field — a stage's or a canvas section's — names a list (`list`) instead of
--                 options of its own (mkt_field_extras — production's body): a version's choice needs options unless it
--                 names one.
--   Read          mkt_option_lists() — Marketing · View: the task page's choices, the Canvas editor's.
--   Added         mkt_option_add(list, option) — Marketing · Edit, whoever fills a choice in, on the spot: words of 1–40,
--                 once (one there already in other letters answers with its own spelling), 200 at most.
--   Taken off     mkt_option_remove(list, option) — Marketing · Manage (the Canvas editor); an answer that picked it keeps it.
--   An answer     a Multi-select's is its picks — a list of words, each once, 30 at most; none picked, no answer
--                 (mkt_stage_save — production's body); a Select's stays one word.
-- PGlite: tests/member-sql/validate-marketing-option-lists.mjs.

-- ── The shared lists ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_option_lists (
  name       text PRIMARY KEY CHECK (name ~ '^[A-Z][A-Za-z ]{1,39}$'),
  opts       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opts) = 'array' AND jsonb_array_length(opts) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.mkt_option_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_option_lists FROM anon, authenticated;
SELECT public.audit_register('mkt_option_lists', 'Marketing option lists', 'Marketing', '{marketing}', 'all',
  p_keys => '{name}', p_labels => '{name}');
-- The handoff's Locations, to start: whoever fills one in adds the rest.
INSERT INTO public.mkt_option_lists (name, opts) VALUES
  ('Locations', '["Showroom", "Marketing Room", "On the road", "LRT", "Highway", "Truck Wrapping (Seri Kembangan)"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ── Read: every list, by its name ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_option_lists()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN coalesce((SELECT jsonb_object_agg(l.name, l.opts) FROM public.mkt_option_lists l), '{}'::jsonb);
END
$fn$;

-- ── An option added on the spot — whoever fills a choice in ──────────────────────────────────────────────────────
-- Answers the list ({ list, opts }) and the option as it is kept: one there already in other letters keeps its spelling.
CREATE OR REPLACE FUNCTION public.mkt_option_add(p_list text, p_option text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_l   public.mkt_option_lists;
  v_o   text := regexp_replace(btrim(coalesce(p_option, '')), '\s+', ' ', 'g');
  v_has text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Adding an option is not open to your account.');
  IF v_o = '' OR length(v_o) > 40 THEN
    RAISE EXCEPTION 'An option of 1 to 40 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_l FROM public.mkt_option_lists WHERE name = btrim(coalesce(p_list, '')) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That list is not there.' USING ERRCODE = 'P0002';
  END IF;
  SELECT x INTO v_has FROM jsonb_array_elements_text(v_l.opts) x WHERE lower(x) = lower(v_o) LIMIT 1;
  IF v_has IS NULL THEN
    IF jsonb_array_length(v_l.opts) >= 200 THEN
      RAISE EXCEPTION 'The list holds 200 options at most.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_option_lists SET opts = opts || to_jsonb(v_o), updated_at = now(), updated_by = auth.uid()
     WHERE name = v_l.name
    RETURNING * INTO v_l;
  END IF;
  RETURN jsonb_build_object('list', v_l.name, 'opts', v_l.opts, 'option', coalesce(v_has, v_o));
END
$fn$;

-- ── An option taken off — the manager's ─────────────────────────────────────────────────────────────────────
-- An answer that picked it keeps it. Answers the list.
CREATE OR REPLACE FUNCTION public.mkt_option_remove(p_list text, p_option text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_l public.mkt_option_lists;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'A shared list is the manager''s to tidy.');
  SELECT * INTO v_l FROM public.mkt_option_lists WHERE name = btrim(coalesce(p_list, '')) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That list is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_l.opts) x WHERE x = p_option) THEN
    RAISE EXCEPTION 'That option is not on the list.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.mkt_option_lists
     SET opts = coalesce((SELECT jsonb_agg(x ORDER BY o) FROM jsonb_array_elements_text(v_l.opts) WITH ORDINALITY AS t(x, o)
                           WHERE x <> p_option), '[]'::jsonb),
         updated_at = now(), updated_by = auth.uid()
   WHERE name = v_l.name
  RETURNING * INTO v_l;
  RETURN jsonb_build_object('list', v_l.name, 'opts', v_l.opts);
END
$fn$;

-- ── A field's settings — production's body, a choice naming a shared list ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_field_extras(p_f jsonb, p_type text, p_label text, p_publish boolean, p_where text, p_default boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out   jsonb;
  v_cal   jsonb;
  v_label text;
  v_opts  jsonb := '[]'::jsonb;
  v_o     text;
  v_seen  text[] := '{}';
BEGIN
  v_out := jsonb_build_object(
    'req', CASE WHEN p_type = 'Note' THEN false
                WHEN jsonb_typeof(p_f -> 'req') = 'boolean' THEN (p_f ->> 'req')::boolean ELSE p_default END,
    'pic', CASE WHEN jsonb_typeof(p_f -> 'pic') = 'boolean' THEN (p_f ->> 'pic')::boolean ELSE p_default END);

  -- A date on the calendar: one of six kinds (its name there the kind's), the PIC's calendar or not.
  IF p_type = 'Date' AND jsonb_typeof(p_f -> 'cal') = 'object' THEN
    v_cal := p_f -> 'cal';
    v_label := CASE v_cal ->> 'kind'
                 WHEN 'post' THEN 'Post day' WHEN 'shoot' THEN 'Shoot day' WHEN 'meeting' THEN 'Meeting'
                 WHEN 'ads_live' THEN 'Ads go-live' WHEN 'ads_end' THEN 'Ads end' WHEN 'report' THEN 'Report day' END;
    IF v_label IS NULL THEN
      RAISE EXCEPTION '%: pick which date it is on the calendar.', p_where USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('cal', jsonb_build_object('kind', v_cal ->> 'kind', 'label', v_label,
      'pic', coalesce((v_cal -> 'pic') = 'true'::jsonb, false)));
  END IF;

  -- A choice's options: short, each once; a version's choice has at least one — or a shared list's (③d-2).
  IF p_type IN ('Select', 'Multi-select') THEN
    IF jsonb_typeof(p_f -> 'opts') = 'array' THEN
      IF jsonb_array_length(p_f -> 'opts') > 30 THEN
        RAISE EXCEPTION '%: a choice has at most 30 options.', p_where USING ERRCODE = '22023';
      END IF;
      FOR v_o IN SELECT btrim(x) FROM jsonb_array_elements_text(p_f -> 'opts') x LOOP
        IF length(v_o) > 40 THEN
          RAISE EXCEPTION '%: an option of at most 40 characters.', p_where USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_o = '';
        IF p_publish AND lower(v_o) = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the option "%" is there twice.', p_where, v_o USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || lower(v_o);
        v_opts := v_opts || to_jsonb(v_o);
      END LOOP;
    ELSIF p_f ? 'opts' AND jsonb_typeof(p_f -> 'opts') IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION '%: not a list of options.', p_where USING ERRCODE = '22023';
    END IF;
    -- A shared list by its name (③d-2 — answer 9: Locations): its options are the list's, none of its own needed.
    IF jsonb_typeof(p_f -> 'list') = 'string' AND btrim(p_f ->> 'list') <> '' THEN
      IF btrim(p_f ->> 'list') !~ '^[A-Z][A-Za-z ]{1,39}$' THEN
        RAISE EXCEPTION '%: not a list of options.', p_where USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object('list', btrim(p_f ->> 'list'));
    ELSIF p_publish AND jsonb_array_length(v_opts) = 0 THEN
      RAISE EXCEPTION '%: "%" — give the choice its options.', p_where, p_label USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('opts', v_opts);
  END IF;
  RETURN v_out;
END
$fn$;

-- ── A stage's work saved — production's body, a Multi-select's picks ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_stage_save(p_project uuid, p_work jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_notes text;
  v_links jsonb := '[]'::jsonb;
  v_vals  jsonb;
  v_ok    text[];
  v_l     jsonb;
  v_k     text;
  v_v     jsonb;
  v_old   jsonb;
  v_files jsonb := '[]'::jsonb;
  v_forms text[];
  v_path  text;
  v_field text;
  v_name  text;
  v_was   jsonb;
  v_o     public.file_objects;
  v_multi text[];
  v_picks jsonb;
  v_pick  text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_work) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  v_notes := CASE WHEN p_work ? 'notes' THEN coalesce(p_work ->> 'notes', '') ELSE coalesce(v_s.work ->> 'notes', '') END;
  IF length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'Notes: at most 4,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_work ? 'links' THEN
    IF jsonb_typeof(p_work -> 'links') IS DISTINCT FROM 'array' OR jsonb_array_length(p_work -> 'links') > 20 THEN
      RAISE EXCEPTION 'At most 20 links.' USING ERRCODE = '22023';
    END IF;
    FOR v_l IN SELECT x FROM jsonb_array_elements(p_work -> 'links') x LOOP
      IF coalesce(v_l ->> 'url', '') !~* '^https?://[^\s]+$' OR length(v_l ->> 'url') > 500 THEN
        RAISE EXCEPTION 'A link starts with https:// (at most 500 characters).' USING ERRCODE = '22023';
      END IF;
      v_links := v_links || jsonb_build_array(jsonb_build_object('url', v_l ->> 'url',
                   'label', left(btrim(coalesce(v_l ->> 'label', '')), 80)));
    END LOOP;
  ELSE
    v_links := CASE WHEN jsonb_typeof(v_s.work -> 'links') = 'array' THEN v_s.work -> 'links' ELSE '[]'::jsonb END;
  END IF;
  -- Its files (②b-2e): sent under stage/ first — a File field's (field: its label) or the stage's own Files (none).
  -- The whole list when sent, as the links: one already the stage's keeps its record; a new one is the caller's own
  -- arrived row, never another stage's; one taken off loses its bytes' row (R2's hourly sweep takes the bytes).
  v_old := CASE WHEN jsonb_typeof(v_s.work -> 'files') = 'array' THEN v_s.work -> 'files' ELSE '[]'::jsonb END;
  IF p_work ? 'files' THEN
    IF jsonb_typeof(p_work -> 'files') IS DISTINCT FROM 'array' OR jsonb_array_length(p_work -> 'files') > 20 THEN
      RAISE EXCEPTION 'At most 20 files.' USING ERRCODE = '22023';
    END IF;
    v_forms := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                      WHERE f ->> 'type' = 'File');
    FOR v_l IN SELECT x FROM jsonb_array_elements(p_work -> 'files') x LOOP
      v_path := CASE WHEN jsonb_typeof(v_l) = 'object' THEN btrim(coalesce(v_l ->> 'path', '')) ELSE '' END;
      CONTINUE WHEN v_path = '' OR v_files @> jsonb_build_array(jsonb_build_object('path', v_path));
      v_field := nullif(btrim(coalesce(v_l ->> 'field', '')), '');
      IF v_field IS NOT NULL AND NOT (v_field = ANY (v_forms)) THEN
        RAISE EXCEPTION 'That file is for a field this stage does not have.' USING ERRCODE = '22023';
      END IF;
      v_name := left(btrim(regexp_replace(coalesce(v_l ->> 'name', ''), '\s+', ' ', 'g')), 200);
      SELECT x INTO v_was FROM jsonb_array_elements(v_old) x WHERE x ->> 'path' = v_path LIMIT 1;
      IF v_was IS NOT NULL THEN
        v_files := v_files || jsonb_build_array(v_was || jsonb_build_object('field', v_field,
                     'name', coalesce(nullif(v_name, ''), v_was ->> 'name')));
        CONTINUE;
      END IF;
      SELECT * INTO v_o FROM public.file_objects o
       WHERE o.bucket_id = 'marketing' AND o.name = v_path AND o.owner_id = auth.uid()::text;
      IF NOT FOUND OR v_path !~ '^stage/[0-9a-f-]{36}/[^/]+$' THEN
        RAISE EXCEPTION 'That file has not arrived — upload it again.' USING ERRCODE = 'P0002';
      END IF;
      IF EXISTS (SELECT 1 FROM public.mkt_stages x
                  WHERE NOT (x.project_id = v_p.id AND x.idx = v_s.idx) AND x.work -> 'files' @> jsonb_build_array(jsonb_build_object('path', v_path))) THEN
        RAISE EXCEPTION 'That file is another stage''s.' USING ERRCODE = '23505';
      END IF;
      v_files := v_files || jsonb_build_array(jsonb_build_object('path', v_path,
                   'name', coalesce(nullif(v_name, ''), regexp_replace(v_path, '^.*/', '')),
                   'size', coalesce((v_o.metadata ->> 'size')::bigint, 0), 'mime', coalesce(v_o.metadata ->> 'mimetype', ''),
                   'field', v_field, 'by', public.mkt_actor(), 'at', now()));
    END LOOP;
    DELETE FROM public.file_objects o
     WHERE o.bucket_id = 'marketing'
       AND o.name IN (SELECT x ->> 'path' FROM jsonb_array_elements(v_old) x)
       AND NOT v_files @> jsonb_build_array(jsonb_build_object('path', o.name));
  ELSE
    v_files := v_old;
  END IF;
  -- Only the stage's own fields, each a text or a tick — a Multi-select's its picks (③d-2) — merged over what was there.
  v_vals := CASE WHEN jsonb_typeof(v_s.work -> 'vals') = 'object' THEN v_s.work -> 'vals' ELSE '{}'::jsonb END;
  v_ok := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                 WHERE f ->> 'type' NOT IN ('Note', 'Table'));
  v_multi := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                    WHERE f ->> 'type' = 'Multi-select');
  IF jsonb_typeof(p_work -> 'vals') = 'object' THEN
    FOR v_k, v_v IN SELECT * FROM jsonb_each(p_work -> 'vals') LOOP
      CONTINUE WHEN NOT (v_k = ANY (v_ok));
      IF jsonb_typeof(v_v) = 'null' THEN
        v_vals := v_vals - v_k;
      ELSIF jsonb_typeof(v_v) = 'boolean' THEN
        v_vals := v_vals || jsonb_build_object(v_k, v_v);
      ELSIF jsonb_typeof(v_v) IN ('string', 'number') THEN
        IF length(v_v #>> '{}') > 2000 THEN
          RAISE EXCEPTION '"%": at most 2,000 characters.', v_k USING ERRCODE = '22023';
        END IF;
        v_vals := v_vals || jsonb_build_object(v_k, v_v #>> '{}');
      ELSIF jsonb_typeof(v_v) = 'array' AND v_k = ANY (v_multi) THEN
        -- A Multi-select's picks: words of at most 40, each once, 30 at most; none picked — no answer.
        v_picks := '[]'::jsonb;
        FOR v_pick IN SELECT btrim(x #>> '{}') FROM jsonb_array_elements(v_v) x WHERE jsonb_typeof(x) = 'string' LOOP
          CONTINUE WHEN v_pick = '' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_picks) y WHERE lower(y) = lower(v_pick));
          IF length(v_pick) > 40 THEN
            RAISE EXCEPTION '"%": a pick of at most 40 characters.', v_k USING ERRCODE = '22023';
          END IF;
          v_picks := v_picks || to_jsonb(v_pick);
        END LOOP;
        IF jsonb_array_length(v_picks) > 30 THEN
          RAISE EXCEPTION '"%": at most 30 picks.', v_k USING ERRCODE = '22023';
        END IF;
        v_vals := CASE WHEN jsonb_array_length(v_picks) = 0 THEN v_vals - v_k ELSE v_vals || jsonb_build_object(v_k, v_picks) END;
      END IF;
    END LOOP;
  END IF;
  UPDATE public.mkt_stages SET work = jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals, 'files', v_files)
   WHERE project_id = v_p.id AND idx = v_s.idx;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  RETURN jsonb_build_object('id', v_p.id, 'missing', to_jsonb(public.mkt_stage_missing(v_s.spec,
           jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals, 'files', v_files))));
END
$fn$;

-- ── Who may call what ─────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_option_lists() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_option_add(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_option_remove(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_option_lists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_option_add(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_option_remove(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
