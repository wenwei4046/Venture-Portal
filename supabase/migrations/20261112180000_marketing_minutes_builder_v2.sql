-- ============================================================================
-- 20261112180000_marketing_minutes_builder_v2.sql
-- The Minutes Builder v2 (`docs/design_handoff_minutes_builder_v2/`, 2026-11-12):
--   A field      keeps its own `id` (a builder key — the change count and "a locked field stays as it was" go by it),
--                an optional `help` (hint for staff, ≤ 120), and its TYPE may be changed — once-only kinds (Project
--                link, Campaign period, Signature) and locked fields still hold, now checked by id.
--   A Table      keeps its starting rows (`rows`, aligned to `cols`, ≤ 50), `staffRows` (default true) and
--                `staffCols` (default false).
--   Folders      mkt_minutes_folders (nestable); a template's folder_id and its place in the rail (sort).
--                A folder deleted moves its folders and templates up a level.
--   Duplicate    a template copied as a new draft, never published ("… copy").
--   Discard      the draft put back to the version last published.
--   Versions     keep the name they were published under (mkt_minutes_versions.name), so Discard can put it back.
-- Production's bodies (md5 checked 2026-11-12): check af27761b…, save dbcb6d7b…, publish 147bcdd6…,
-- templates 3082cd70…. mkt_minutes_value / mkt_minutes_missing: production's bodies, one branch each (below).
-- PGlite: tests/member-sql/validate-marketing-minutes.mjs (extended).
-- ============================================================================

-- ── Folders ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_minutes_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 60),
  parent_id  uuid REFERENCES public.mkt_minutes_folders(id) ON DELETE RESTRICT,
  sort       integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX IF NOT EXISTS mkt_minutes_folders_parent ON public.mkt_minutes_folders (parent_id);
ALTER TABLE public.mkt_minutes_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_minutes_folders FROM anon, authenticated;
SELECT public.audit_register('mkt_minutes_folders', 'Marketing minutes folders', 'Marketing', '{}', 'none',
  p_reason => 'How the Minutes Builder''s rail is arranged — a folder made, renamed, moved or deleted changes no minutes');

ALTER TABLE public.mkt_minutes_templates ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.mkt_minutes_folders(id) ON DELETE SET NULL;
ALTER TABLE public.mkt_minutes_templates ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 0;
ALTER TABLE public.mkt_minutes_versions ADD COLUMN IF NOT EXISTS name text;

-- ── Backfill (2026-11-12 on production: 1 template, 2 versions, 0 minutes) ───
-- A field's id is made from its name and kind, so the same field carries the same id in the draft and every version.
CREATE OR REPLACE FUNCTION pg_temp.with_ids(p_fields jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
           CASE WHEN f ? 'id' THEN f
                ELSE f || jsonb_build_object('id', 'f' || left(md5(lower(btrim(f ->> 'name')) || '|' || (f ->> 'type') || '|' ||
                       (SELECT count(*) FROM jsonb_array_elements(p_fields) WITH ORDINALITY y(g, j)
                         WHERE j < i AND lower(btrim(g ->> 'name')) = lower(btrim(f ->> 'name')) AND g ->> 'type' = f ->> 'type')), 12)) END
           ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(p_fields) WITH ORDINALITY x(f, i)
$$;
UPDATE public.mkt_minutes_templates SET fields = pg_temp.with_ids(fields);
UPDATE public.mkt_minutes_versions v SET fields = pg_temp.with_ids(v.fields),
       name = coalesce(v.name, (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = v.template_id));
UPDATE public.mkt_minutes_templates t SET sort = x.n
  FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM public.mkt_minutes_templates) x WHERE x.id = t.id;

-- ── A template's fields and rules, checked ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_check(p_fields jsonb, p_rules jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_types text[] := ARRAY['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature',
                              'Campaign period'];
  v_n     integer := CASE WHEN jsonb_typeof(p_fields) = 'array' THEN jsonb_array_length(p_fields) ELSE -1 END;
  v_out   jsonb := '[]'::jsonb;
  v_f     jsonb;
  v_id    text;
  v_ids   text[] := '{}';
  v_name  text;
  v_help  text;
  v_type  text;
  v_lock  boolean;
  v_names text[] := '{}';
  v_cols  jsonb;
  v_ncol  integer;
  v_rows  jsonb;
  v_row   jsonb;
  v_rules jsonb := '{}'::jsonb;
  v_key   text;
  v_once  text;
  j       integer;
  k       integer;
BEGIN
  IF v_n < 0 THEN
    RAISE EXCEPTION 'Not a list of fields.' USING ERRCODE = '22023';
  END IF;
  IF v_n > 40 THEN
    RAISE EXCEPTION 'Minutes have at most 40 fields.' USING ERRCODE = '22023';
  END IF;
  FOR v_f IN SELECT x FROM jsonb_array_elements(p_fields) x LOOP
    IF jsonb_typeof(v_f) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not a field.' USING ERRCODE = '22023';
    END IF;
    -- Its id: the builder's key, once in the template.
    v_id := coalesce(v_f ->> 'id', '');
    IF v_id !~ '^[A-Za-z0-9_-]{1,24}$' OR v_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'A field without a key of its own.' USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_id;
    v_type := coalesce(v_f ->> 'type', '');
    IF NOT (v_type = ANY (v_types)) THEN
      RAISE EXCEPTION 'A field of a kind minutes cannot hold.' USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_f ->> 'name', ''));
    IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
      RAISE EXCEPTION 'Name each field (at most 60 characters).' USING ERRCODE = '22023';
    END IF;
    IF p_publish THEN
      IF lower(v_name) = ANY (v_names) THEN
        RAISE EXCEPTION 'Two fields are called "%".', v_name USING ERRCODE = '22023';
      END IF;
      v_names := v_names || lower(v_name);
    END IF;
    -- The hint for staff: one line, at most 120 characters; none is left out.
    v_help := btrim(regexp_replace(coalesce(v_f ->> 'help', ''), '\s+', ' ', 'g'));
    IF length(v_help) > 120 THEN
      RAISE EXCEPTION '"%": a hint of at most 120 characters.', v_name USING ERRCODE = '22023';
    END IF;
    -- The two every minutes keep: the project it is for and its attendees — locked, always required.
    v_lock := v_type = 'Project link' OR (v_type = 'People' AND coalesce(v_f ->> 'lock', '') = 'true');
    v_cols := NULL;
    v_rows := NULL;
    IF v_type = 'Table' THEN
      IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
        RAISE EXCEPTION '"%": a table has 1 to 8 columns.', v_name USING ERRCODE = '22023';
      END IF;
      v_ncol := jsonb_array_length(v_f -> 'cols');
      v_cols := '[]'::jsonb;
      FOR j IN 0 .. v_ncol - 1 LOOP
        IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
           OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Date', 'Person') THEN
          RAISE EXCEPTION '"%": name each column (at most 40 characters).', v_name USING ERRCODE = '22023';
        END IF;
        v_cols := v_cols || jsonb_build_array(jsonb_build_object('name', btrim(v_f -> 'cols' -> j ->> 'name'), 'type', v_f -> 'cols' -> j ->> 'type'));
      END LOOP;
      -- Starting rows: each one cell a column, at most 50 rows of 500 characters a cell.
      IF v_f ? 'rows' AND jsonb_typeof(v_f -> 'rows') IS DISTINCT FROM 'null' THEN
        IF jsonb_typeof(v_f -> 'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'rows') > 50 THEN
          RAISE EXCEPTION '"%": at most 50 starting rows.', v_name USING ERRCODE = '22023';
        END IF;
        v_rows := '[]'::jsonb;
        FOR v_row IN SELECT x FROM jsonb_array_elements(v_f -> 'rows') x LOOP
          IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> v_ncol
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 500) THEN
            RAISE EXCEPTION '"%": a starting row is one cell per column.', v_name USING ERRCODE = '22023';
          END IF;
          v_rows := v_rows || jsonb_build_array(v_row);
        END LOOP;
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'name', v_name, 'type', v_type,
      'help', nullif(v_help, ''),
      'req', v_lock OR coalesce(v_f ->> 'req', '') = 'true',
      'pic', coalesce(v_f ->> 'pic', '') = 'true',
      'lock', v_lock,
      'cols', v_cols,
      'rows', v_rows,
      'staffRows', CASE WHEN v_type = 'Table' THEN coalesce(v_f ->> 'staffRows', 'true') <> 'false' END,
      'staffCols', CASE WHEN v_type = 'Table' THEN coalesce(v_f ->> 'staffCols', '') = 'true' END)));
  END LOOP;
  -- Once a template: the project it links, a campaign's run period, the signatures.
  FOREACH v_once IN ARRAY ARRAY['Project link', 'Campaign period', 'Signature'] LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = v_once) > 1 THEN
      RAISE EXCEPTION 'Only one % field allowed.', v_once USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_publish AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link')
                    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'People' AND (f ->> 'lock')::boolean)) THEN
    RAISE EXCEPTION 'Minutes keep the project they are for and their attendees.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_rules, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Not a set of rules.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['sign', 'pic', 'picAll', 'project', 'file', 'lock'] LOOP
    v_rules := v_rules || jsonb_build_object(v_key, coalesce(p_rules ->> v_key, '') = 'true');
  END LOOP;
  IF NOT (v_rules ->> 'pic')::boolean THEN
    v_rules := v_rules || '{"picAll": false}'::jsonb;
  END IF;
  RETURN jsonb_build_object('fields', v_out, 'rules', v_rules);
END
$fn$;

-- A locked field stays as it was: still there (by its id), its name and kind unchanged. Nobody's to call but the save.
CREATE OR REPLACE FUNCTION public.mkt_minutes_locks_kept(p_old jsonb, p_new jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_o jsonb;
  v_n jsonb;
BEGIN
  FOR v_o IN SELECT x FROM jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) x WHERE (x ->> 'lock')::boolean LOOP
    SELECT x INTO v_n FROM jsonb_array_elements(p_new) x WHERE x ->> 'id' = v_o ->> 'id';
    IF v_n IS NULL OR v_n ->> 'type' IS DISTINCT FROM v_o ->> 'type' OR btrim(v_n ->> 'name') IS DISTINCT FROM btrim(v_o ->> 'name')
       OR NOT coalesce((v_n ->> 'lock')::boolean, false) THEN
      RAISE EXCEPTION '"%" is kept by every minutes — it can''t be renamed, retyped, made optional or removed.', v_o ->> 'name' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END
$fn$;

-- ── The builder's reader: the templates, their last version, what uses them; the folders ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_templates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  RETURN jsonb_build_object(
    'templates', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'fields', t.fields, 'rules', t.rules, 'rev', t.draft_rev, 'version', t.version,
               'changed', t.published_rev IS DISTINCT FROM t.draft_rev,
               'folder', t.folder_id, 'sort', t.sort,
               'published', CASE WHEN v.version IS NULL THEN NULL
                                 ELSE jsonb_build_object('name', coalesce(v.name, t.name), 'fields', v.fields, 'rules', v.rules) END,
               'usedBy', coalesce((SELECT jsonb_agg(coalesce(nullif(p.name, ''), p.code) ORDER BY p.code)
                                     FROM public.mkt_products p WHERE p.intake_id = t.id AND p.status IS DISTINCT FROM 'retired'), '[]'::jsonb),
               'open', (SELECT count(*) FROM public.mkt_minutes mm WHERE mm.template_id = t.id AND mm.status <> 'completed'),
               'openOnLive', (SELECT count(*) FROM public.mkt_minutes mm
                               WHERE mm.template_id = t.id AND mm.template_version = t.version AND mm.status <> 'completed'),
               'publishedAt', v.published_at, 'publishedBy', (SELECT u.name FROM public.users u WHERE u.id = v.published_by),
               'updatedAt', t.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = t.updated_by))
             ORDER BY t.sort, t.created_at, t.id)
        FROM public.mkt_minutes_templates t
        LEFT JOIN public.mkt_minutes_versions v ON v.template_id = t.id AND v.version = t.version), '[]'::jsonb),
    'folders', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'parent', f.parent_id, 'sort', f.sort)
             ORDER BY f.sort, f.created_at, f.id)
        FROM public.mkt_minutes_folders f), '[]'::jsonb));
END
$fn$;

-- ── Saved as it is typed (production's body; + a folder for a new one, its place, locked fields kept) ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t      public.mkt_minutes_templates;
  v_patch  jsonb := coalesce(p_patch, '{}'::jsonb);
  v_name   text;
  v_clean  jsonb;
  v_by     text;
  v_folder uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_t FROM public.mkt_minutes_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    IF p_rev IS DISTINCT FROM v_t.draft_rev THEN
      v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_t.updated_by), 'Somebody');
      RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
    END IF;
  END IF;
  v_name := CASE WHEN v_patch ? 'name' OR p_id IS NULL THEN btrim(coalesce(v_patch ->> 'name', '')) ELSE v_t.name END;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the template (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_minutes_templates t WHERE lower(t.name) = lower(v_name) AND t.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION '"%" is there already.', v_name USING ERRCODE = '23505';
  END IF;
  v_clean := public.mkt_minutes_check(
    CASE WHEN v_patch ? 'fields' OR p_id IS NULL THEN coalesce(v_patch -> 'fields', '[]'::jsonb) ELSE v_t.fields END,
    CASE WHEN v_patch ? 'rules' OR p_id IS NULL THEN coalesce(v_patch -> 'rules', '{}'::jsonb) ELSE v_t.rules END,
    false);
  IF p_id IS NULL THEN
    v_folder := nullif(v_patch ->> 'folder', '')::uuid;
    IF v_folder IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mkt_minutes_folders f WHERE f.id = v_folder) THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.mkt_minutes_templates (name, fields, rules, folder_id, sort, created_by, updated_by)
    VALUES (v_name, v_clean -> 'fields', v_clean -> 'rules', v_folder,
            coalesce((SELECT max(sort) FROM public.mkt_minutes_templates), 0) + 1, auth.uid(), auth.uid())
    RETURNING * INTO v_t;
  ELSE
    IF v_patch ? 'fields' THEN
      PERFORM public.mkt_minutes_locks_kept(v_t.fields, v_clean -> 'fields');
    END IF;
    UPDATE public.mkt_minutes_templates
       SET name = v_name, fields = v_clean -> 'fields', rules = v_clean -> 'rules', draft_rev = draft_rev + 1,
           updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_t;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_t.id, 'rev', v_t.draft_rev);
END
$fn$;

-- ── Published (production's body; the version keeps the name it was published under) ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_publish(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t     public.mkt_minutes_templates;
  v_clean jsonb;
  v_by    text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  SELECT * INTO v_t FROM public.mkt_minutes_templates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_t.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_t.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_t.published_rev = v_t.draft_rev THEN
    RAISE EXCEPTION 'Nothing has changed since v%.', v_t.version USING ERRCODE = '22023';
  END IF;
  v_clean := public.mkt_minutes_check(v_t.fields, v_t.rules, true);
  INSERT INTO public.mkt_minutes_versions (template_id, version, name, fields, rules, published_by)
  VALUES (v_t.id, v_t.version + 1, v_t.name, v_clean -> 'fields', v_clean -> 'rules', auth.uid());
  UPDATE public.mkt_minutes_templates
     SET version = v_t.version + 1, published_rev = v_t.draft_rev, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_t.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_t.id, 'version', v_t.version + 1, 'rev', v_t.draft_rev);
END
$fn$;

-- ── Duplicate: a new draft, never published, after the original, its fields given new ids ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_duplicate(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t    public.mkt_minutes_templates;
  v_base text;
  v_name text;
  v_n    integer := 1;
  v_new  public.mkt_minutes_templates;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  SELECT * INTO v_t FROM public.mkt_minutes_templates WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  -- "Kickoff copy", then "Kickoff copy 2" … — kept within 60 characters.
  v_base := left(v_t.name, 55) || ' copy';
  v_name := v_base;
  WHILE EXISTS (SELECT 1 FROM public.mkt_minutes_templates t WHERE lower(t.name) = lower(v_name)) LOOP
    v_n := v_n + 1;
    v_name := left(v_t.name, 55 - length(v_n::text) - 1) || ' copy ' || v_n;
  END LOOP;
  UPDATE public.mkt_minutes_templates SET sort = sort + 1 WHERE sort > v_t.sort;
  INSERT INTO public.mkt_minutes_templates (name, fields, rules, folder_id, sort, created_by, updated_by)
  VALUES (v_name,
          (SELECT coalesce(jsonb_agg(f || jsonb_build_object('id', 'f' || left(md5(gen_random_uuid()::text), 12)) ORDER BY i), '[]'::jsonb)
             FROM jsonb_array_elements(v_t.fields) WITH ORDINALITY x(f, i)),
          v_t.rules, v_t.folder_id, v_t.sort + 1, auth.uid(), auth.uid())
  RETURNING * INTO v_new;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_new.id, 'rev', v_new.draft_rev, 'name', v_new.name);
END
$fn$;

-- ── Discard: the draft put back to the version last published ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_discard(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t  public.mkt_minutes_templates;
  v_v  public.mkt_minutes_versions;
  v_by text;
  v_name text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  SELECT * INTO v_t FROM public.mkt_minutes_templates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_t.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_t.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_t.version = 0 THEN
    RAISE EXCEPTION 'Never published — there is no version to go back to.' USING ERRCODE = '22023';
  END IF;
  IF v_t.published_rev = v_t.draft_rev THEN
    RAISE EXCEPTION 'Nothing has changed since v%.', v_t.version USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_v FROM public.mkt_minutes_versions WHERE template_id = p_id AND version = v_t.version;
  v_name := coalesce(v_v.name, v_t.name);
  IF EXISTS (SELECT 1 FROM public.mkt_minutes_templates t WHERE lower(t.name) = lower(v_name) AND t.id <> p_id) THEN
    RAISE EXCEPTION 'Another template is called "%" now — rename it first.', v_name USING ERRCODE = '23505';
  END IF;
  UPDATE public.mkt_minutes_templates
     SET name = v_name, fields = v_v.fields, rules = v_v.rules,
         draft_rev = draft_rev + 1, published_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_t;
  RETURN jsonb_build_object('id', v_t.id, 'rev', v_t.draft_rev, 'version', v_t.version);
END
$fn$;

-- ── A template moved into a folder (or out of all of them): no draft change, no new rev ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_move(p_id uuid, p_folder uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  IF p_folder IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mkt_minutes_folders f WHERE f.id = p_folder) THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.mkt_minutes_templates SET folder_id = p_folder WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- ── A folder made (p_id null, inside p_parent) or renamed; at most 8 deep ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_folder_save(p_id uuid, p_parent uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_depth integer;
  v_f     public.mkt_minutes_folders;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the folder (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    IF p_parent IS NOT NULL THEN
      WITH RECURSIVE up AS (
        SELECT id, parent_id, 1 AS d FROM public.mkt_minutes_folders WHERE id = p_parent
        UNION ALL SELECT f.id, f.parent_id, up.d + 1 FROM public.mkt_minutes_folders f JOIN up ON f.id = up.parent_id)
      SELECT max(d) INTO v_depth FROM up;
      IF v_depth IS NULL THEN
        RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = 'P0002';
      END IF;
      IF v_depth >= 8 THEN
        RAISE EXCEPTION 'Folders go at most 8 deep.' USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO public.mkt_minutes_folders (name, parent_id, sort, created_by, updated_by)
    VALUES (v_name, p_parent, coalesce((SELECT max(sort) FROM public.mkt_minutes_folders WHERE parent_id IS NOT DISTINCT FROM p_parent), 0) + 1,
            auth.uid(), auth.uid())
    RETURNING * INTO v_f;
  ELSE
    UPDATE public.mkt_minutes_folders SET name = v_name, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_f;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', v_f.id, 'name', v_f.name, 'parent', v_f.parent_id, 'sort', v_f.sort);
END
$fn$;

-- ── A folder deleted: its folders and templates move up a level ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_folder_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f public.mkt_minutes_folders;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  SELECT * INTO v_f FROM public.mkt_minutes_folders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;   -- gone already: nothing to do
  END IF;
  UPDATE public.mkt_minutes_folders SET parent_id = v_f.parent_id, updated_by = auth.uid(), updated_at = now() WHERE parent_id = p_id;
  UPDATE public.mkt_minutes_templates SET folder_id = v_f.parent_id WHERE folder_id = p_id;
  DELETE FROM public.mkt_minutes_folders WHERE id = p_id;
END
$fn$;

-- ── The minutes themselves follow the builder (production's bodies — f379adb9… / 8eb00f6f… — the Table branch each) ──
-- A Table's answer: { rows, xcols? }. xcols are the staff's own columns — only where the field says Staff can add
-- columns, each named in at most 40 characters, the table's columns and theirs 8 at most; each row a cell for each.
-- Where the field says staff may NOT add rows, the answer keeps its starting rows' count (two when it has none saved).
CREATE OR REPLACE FUNCTION public.mkt_minutes_value(p_field jsonb, p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_type  text := p_field ->> 'type';
  v_name  text := p_field ->> 'name';
  v_s     text;
  v_cols  integer;
  v_xcols jsonb;
  v_row   jsonb;
  v_x     text;
  v_out   jsonb := '[]'::jsonb;
  v_from  text;
  v_to    text;
  v_d1    date;
  v_d2    date;
BEGIN
  IF p_v IS NULL OR jsonb_typeof(p_v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF v_type IN ('Short text', 'Long text', 'Date', 'Number') THEN
    IF jsonb_typeof(p_v) NOT IN ('string', 'number') THEN
      RAISE EXCEPTION '"%": not something it takes.', v_name USING ERRCODE = '22023';
    END IF;
    v_s := p_v #>> '{}';
    IF v_type = 'Short text' AND length(v_s) > 200 OR v_type = 'Long text' AND length(v_s) > 4000 THEN
      RAISE EXCEPTION '"%": at most % characters.', v_name, CASE WHEN v_type = 'Short text' THEN 200 ELSE 4000 END USING ERRCODE = '22023';
    END IF;
    IF btrim(v_s) = '' THEN
      RETURN NULL;
    END IF;
    IF v_type = 'Date' THEN
      IF v_s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION '"%": a date.', v_name USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM v_s::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION '"%": a date.', v_name USING ERRCODE = '22023';
      END;
    ELSIF v_type = 'Number' AND btrim(v_s) !~ '^-?[0-9]{1,12}([.][0-9]{1,4})?$' THEN
      RAISE EXCEPTION '"%": a number.', v_name USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(CASE WHEN v_type = 'Number' THEN btrim(v_s) ELSE v_s END);
  ELSIF v_type = 'People' THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'array' OR jsonb_array_length(p_v) > 30 THEN
      RAISE EXCEPTION '"%": at most 30 people.', v_name USING ERRCODE = '22023';
    END IF;
    FOR v_x IN SELECT x FROM jsonb_array_elements_text(p_v) x LOOP
      IF v_x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": somebody who is not on the team.', v_name USING ERRCODE = '22023';
      END IF;
      IF NOT v_out @> to_jsonb(ARRAY[lower(v_x)]) THEN
        v_out := v_out || to_jsonb(ARRAY[lower(v_x)]);
      END IF;
    END LOOP;
    RETURN CASE WHEN jsonb_array_length(v_out) = 0 THEN NULL ELSE v_out END;
  ELSIF v_type IN ('Table', 'Free space') THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'object' OR jsonb_typeof(p_v -> 'rows') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_v -> 'rows') > 50 THEN
      RAISE EXCEPTION '"%": at most 50 rows.', v_name USING ERRCODE = '22023';
    END IF;
    IF v_type = 'Table' THEN
      v_cols := jsonb_array_length(coalesce(p_field -> 'cols', '[]'::jsonb));
      -- The staff's own columns (Minutes Builder v2): only where the template lets them.
      IF jsonb_typeof(p_v -> 'xcols') = 'array' AND jsonb_array_length(p_v -> 'xcols') > 0 THEN
        IF coalesce(p_field ->> 'staffCols', '') <> 'true' THEN
          RAISE EXCEPTION '"%": its columns are set by the template.', v_name USING ERRCODE = '22023';
        END IF;
        IF v_cols + jsonb_array_length(p_v -> 'xcols') > 8
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_v -> 'xcols') c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 40) THEN
          RAISE EXCEPTION '"%": 8 columns at most, each named in at most 40 characters.', v_name USING ERRCODE = '22023';
        END IF;
        v_xcols := p_v -> 'xcols';
        v_cols := v_cols + jsonb_array_length(v_xcols);
      END IF;
      -- Its rows fixed by the template (Staff can add rows off): as many as it starts with.
      IF coalesce(p_field ->> 'staffRows', '') = 'false'
         AND jsonb_array_length(p_v -> 'rows') <> coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p_field -> 'rows') = 'array' THEN p_field -> 'rows' END), 2) THEN
        RAISE EXCEPTION '"%": its rows are set by the template.', v_name USING ERRCODE = '22023';
      END IF;
    ELSE
      IF jsonb_typeof(p_v -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(p_v -> 'cols') NOT BETWEEN 1 AND 8
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_v -> 'cols') c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 40) THEN
        RAISE EXCEPTION '"%": 1 to 8 columns, each named in at most 40 characters.', v_name USING ERRCODE = '22023';
      END IF;
      v_cols := jsonb_array_length(p_v -> 'cols');
    END IF;
    FOR v_row IN SELECT x FROM jsonb_array_elements(p_v -> 'rows') x LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> v_cols
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 500) THEN
        RAISE EXCEPTION '"%": a row is one short line per column.', v_name USING ERRCODE = '22023';
      END IF;
    END LOOP;
    RETURN CASE WHEN v_type = 'Table' THEN jsonb_strip_nulls(jsonb_build_object('rows', p_v -> 'rows', 'xcols', v_xcols))
                ELSE jsonb_build_object('cols', p_v -> 'cols', 'rows', p_v -> 'rows') END;
  -- A campaign's run period (answer 13): from and to, each a date — or empty while it is being typed; the end on or
  -- after the start, within a year.
  ELSIF v_type = 'Campaign period' THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION '"%": a start and an end.', v_name USING ERRCODE = '22023';
    END IF;
    v_from := nullif(btrim(coalesce(p_v ->> 'from', '')), '');
    v_to := nullif(btrim(coalesce(p_v ->> 'to', '')), '');
    IF (v_from IS NOT NULL AND v_from !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR (v_to IS NOT NULL AND v_to !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
      RAISE EXCEPTION '"%": dates.', v_name USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_d1 := v_from::date;
      v_d2 := v_to::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '"%": dates.', v_name USING ERRCODE = '22023';
    END;
    IF v_d1 IS NOT NULL AND v_d2 IS NOT NULL AND (v_d2 < v_d1 OR v_d2 - v_d1 > 365) THEN
      RAISE EXCEPTION '"%": it ends on or after its start, within a year.', v_name USING ERRCODE = '22023';
    END IF;
    RETURN CASE WHEN v_d1 IS NULL AND v_d2 IS NULL THEN NULL
                ELSE jsonb_build_object('from', v_d1::text, 'to', v_d2::text) END;
  END IF;
  RAISE EXCEPTION '"%" is not written in.', v_name USING ERRCODE = '22023';
END
$fn$;

-- A required Table nobody wrote in yet is filled when its starting rows hold anything — the staff see them in it.
CREATE OR REPLACE FUNCTION public.mkt_minutes_missing(p_fields jsonb, p_vals jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_f   jsonb;
  v_v   jsonb;
  v_out text[] := '{}';
BEGIN
  FOR v_f IN SELECT x FROM jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) x LOOP
    CONTINUE WHEN v_f ->> 'type' IN ('Project link', 'Signature');
    CONTINUE WHEN NOT (coalesce((v_f -> 'req') = 'true'::jsonb, false) OR coalesce((v_f -> 'lock') = 'true'::jsonb, false));
    v_v := p_vals -> (v_f ->> 'name');
    IF (v_v IS NULL OR jsonb_typeof(v_v) = 'null') AND v_f ->> 'type' = 'Table' AND jsonb_typeof(v_f -> 'rows') = 'array' THEN
      v_v := jsonb_build_object('rows', v_f -> 'rows');
    END IF;
    IF v_v IS NULL OR jsonb_typeof(v_v) = 'null'
       OR (jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') = '')
       OR (jsonb_typeof(v_v) = 'array' AND jsonb_array_length(v_v) = 0)
       -- A campaign's run period: both its days (answer 13).
       OR (jsonb_typeof(v_v) = 'object' AND v_f ->> 'type' = 'Campaign period'
           AND (coalesce(v_v ->> 'from', '') = '' OR coalesce(v_v ->> 'to', '') = ''))
       OR (jsonb_typeof(v_v) = 'object' AND v_f ->> 'type' IS DISTINCT FROM 'Campaign period' AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(coalesce(v_v -> 'rows', '[]'::jsonb)) r, jsonb_array_elements_text(r) c
              WHERE btrim(c) <> '')) THEN
      v_out := v_out || (v_f ->> 'name');
    END IF;
  END LOOP;
  RETURN v_out;
END
$fn$;

-- ── The PIC's page reads the same (mkt_pic_page — production's body, md5 e6ea2218…, two statements swapped in place) ──
-- A table's columns are the template's and the staff's own, its rows its starting rows while nobody wrote in it; each field
-- carries its hint for staff, which the PIC reads under its name too.
DO $do$
DECLARE
  v_def text;
  v_old1 text := $o$      WHEN 'Table' THEN jsonb_build_object(
        'cols', coalesce((SELECT jsonb_agg(c ->> 'name') FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) c), '[]'::jsonb),
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)$o$;
  v_new1 text := $n$      WHEN 'Table' THEN jsonb_build_object(
        'cols', coalesce((SELECT jsonb_agg(c ->> 'name') FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) c), '[]'::jsonb)
                || CASE WHEN jsonb_typeof(v_v -> 'xcols') = 'array' THEN v_v -> 'xcols' ELSE '[]'::jsonb END,
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows'
                     WHEN jsonb_typeof(v_f -> 'rows') = 'array' THEN v_f -> 'rows' ELSE '[]'::jsonb END)$n$;
  v_old2 text := $o$jsonb_build_object('name', v_f ->> 'name', 'type', v_f ->> 'type', 'value', v_val)$o$;
  v_new2 text := $n$jsonb_strip_nulls(jsonb_build_object('name', v_f ->> 'name', 'type', v_f ->> 'type', 'help', v_f ->> 'help', 'value', v_val)) || jsonb_build_object('value', v_val)$n$;
BEGIN
  IF to_regprocedure('public.mkt_pic_page(text)') IS NULL THEN
    RETURN; -- a database without the PIC's page (the minutes' own PGlite check)
  END IF;
  v_def := pg_get_functiondef('public.mkt_pic_page(text)'::regprocedure);
  IF v_def LIKE '%''help'', v_f ->> ''help''%' THEN
    RETURN; -- swapped already (the migration run again)
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old1, ''))) <> length(v_old1)
     OR (length(v_def) - length(replace(v_def, v_old2, ''))) <> length(v_old2) THEN
    RAISE EXCEPTION 'mkt_pic_page is not the body this migration was written against — compare it with production first.';
  END IF;
  EXECUTE replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
END
$do$;

-- ── Grants ──
REVOKE ALL ON FUNCTION public.mkt_minutes_locks_kept(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_locks_kept(jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_minutes_duplicate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_discard(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_move(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_folder_save(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_folder_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_duplicate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_discard(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_move(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_folder_save(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_folder_delete(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
