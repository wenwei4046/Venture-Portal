-- ============================================================================
-- 20261023235800_marketing_minutes.sql
-- Marketing's Minutes Builder — ③ of the Claude Design handoff "HOUZS Marketing Module Setup" (2026-10-23; the
-- user: "全部照设计做", in order): what each kind of meeting minutes asks for (its fields: which are required, which
-- the PIC sees on the link, a table's columns) and what must be true before it is completed (every attendee signs,
-- the PIC signs off on the link, a project linked, filed to the Library, locked after). Edited as a draft and
-- published as numbered versions, as the Workflow Builder's templates (mig 20261023235500) — minutes being filled in
-- keep the version they started on. The Product Builder names a template as a product's intake; the minutes
-- themselves (a product project's first step) come with ②b.
-- ============================================================================
--
-- A field: { name (≤ 60, unique in the template), type, req (blocks Complete when empty), pic (the PIC sees it on the
-- link), lock (the two every minutes keep: the project it is for and its attendees — never removed, always required),
-- cols (a Table's: [{ name, type: Text | Number | Date | Person }], 1–8) }. Types: Short text, Long text, Date,
-- Number, People, Project link, Free space, Table, Signature (`Minutes Builder.dc.html`'s TYPES, the base fields and
-- the signatures).
-- Rules: { sign (every attendee signs), pic (the PIC signs off on the link), project (must link a project), file
-- (filed to the subsidiary's Library on complete), lock (no edits once complete) }.
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_minutes_templates  a template: its name, its draft (fields + rules, draft_rev counting the saves), its last
--                          version.
--   mkt_minutes_versions   each version published, whole and never changed — who, when.
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted), Marketing · Manage:
--   mkt_minutes_templates()             the templates with their drafts and versions
--   mkt_minutes_save(id, rev, patch)    a template made (id null), or what changed of it saved — refused when somebody
--                                       saved it since (rev)
--   mkt_minutes_publish(id, rev)        the draft, checked whole, published as the next version
-- The page `/marketing/minutes` joins the database's copy of the tab registry under the manager's tools' tab.
-- PGlite: tests/member-sql/validate-marketing-minutes.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_minutes_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 60),
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
  rules         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rules) = 'object'),
  draft_rev     integer NOT NULL DEFAULT 1 CHECK (draft_rev >= 1),
  version       integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  published_rev integer CHECK (published_rev >= 1),
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((version = 0) = (published_rev IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_minutes_templates_name ON public.mkt_minutes_templates (lower(name));

CREATE TABLE IF NOT EXISTS public.mkt_minutes_versions (
  template_id  uuid NOT NULL REFERENCES public.mkt_minutes_templates(id),
  version      integer NOT NULL CHECK (version >= 1),
  fields       jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  rules        jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  published_by uuid REFERENCES public.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

ALTER TABLE public.mkt_minutes_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_minutes_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_minutes_templates, public.mkt_minutes_versions FROM anon, authenticated;

SELECT public.audit_register('mkt_minutes_templates', 'Marketing minutes templates', 'Marketing', '{}', 'none',
  p_reason => 'A draft is saved as it is typed; each version published is kept whole, with who and when, in mkt_minutes_versions');
SELECT public.audit_register('mkt_minutes_versions', 'Marketing minutes template versions', 'Marketing', '{}', 'none',
  p_reason => 'Each version published, written once and never changed — a record already');

-- ── A template's fields and rules, checked (nobody's to call but the functions below) ─
-- As a draft: the shapes and limits, names half-typed included. As published: every field and column named, a name
-- once; the project and the attendees there, locked and required. Answers { fields, rules } written clean.
CREATE OR REPLACE FUNCTION public.mkt_minutes_check(p_fields jsonb, p_rules jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_types text[] := ARRAY['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature'];
  v_n     integer := CASE WHEN jsonb_typeof(p_fields) = 'array' THEN jsonb_array_length(p_fields) ELSE -1 END;
  v_out   jsonb := '[]'::jsonb;
  v_f     jsonb;
  v_name  text;
  v_type  text;
  v_lock  boolean;
  v_names text[] := '{}';
  v_cols  jsonb;
  v_rules jsonb := '{}'::jsonb;
  v_key   text;
  j       integer;
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
        RAISE EXCEPTION 'Two fields called "%".', v_name USING ERRCODE = '22023';
      END IF;
      v_names := v_names || lower(v_name);
    END IF;
    -- The two every minutes keep: the project it is for and its attendees — locked, always required.
    v_lock := v_type = 'Project link' OR (v_type = 'People' AND coalesce(v_f ->> 'lock', '') = 'true');
    v_cols := NULL;
    IF v_type = 'Table' THEN
      IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
        RAISE EXCEPTION '"%": a table has 1 to 8 columns.', v_name USING ERRCODE = '22023';
      END IF;
      v_cols := '[]'::jsonb;
      FOR j IN 0 .. jsonb_array_length(v_f -> 'cols') - 1 LOOP
        IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
           OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Date', 'Person') THEN
          RAISE EXCEPTION '"%": name each column (at most 40 characters).', v_name USING ERRCODE = '22023';
        END IF;
        v_cols := v_cols || jsonb_build_array(jsonb_build_object('name', btrim(v_f -> 'cols' -> j ->> 'name'), 'type', v_f -> 'cols' -> j ->> 'type'));
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'type', v_type,
      'req', v_lock OR coalesce(v_f ->> 'req', '') = 'true',
      'pic', coalesce(v_f ->> 'pic', '') = 'true',
      'lock', v_lock,
      'cols', v_cols)));
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Signature') > 1 THEN
    RAISE EXCEPTION 'Minutes link one project and keep one set of signatures.' USING ERRCODE = '22023';
  END IF;
  IF p_publish AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link')
                    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'People' AND (f ->> 'lock')::boolean)) THEN
    RAISE EXCEPTION 'Minutes keep the project they are for and their attendees.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_rules, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Not a set of rules.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['sign', 'pic', 'project', 'file', 'lock'] LOOP
    v_rules := v_rules || jsonb_build_object(v_key, coalesce(p_rules ->> v_key, '') = 'true');
  END LOOP;
  RETURN jsonb_build_object('fields', v_out, 'rules', v_rules);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_minutes_check(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_check(jsonb, jsonb, boolean) TO service_role;

-- ── The builder's reader ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_templates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Minutes Builder is the manager''s.');
  RETURN jsonb_build_object('templates', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id, 'name', t.name, 'fields', t.fields, 'rules', t.rules, 'rev', t.draft_rev, 'version', t.version,
             'changed', t.published_rev IS DISTINCT FROM t.draft_rev,
             'publishedAt', v.published_at, 'publishedBy', (SELECT u.name FROM public.users u WHERE u.id = v.published_by),
             'updatedAt', t.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = t.updated_by))
           ORDER BY t.created_at, t.id)
      FROM public.mkt_minutes_templates t
      LEFT JOIN public.mkt_minutes_versions v ON v.template_id = t.id AND v.version = t.version), '[]'::jsonb));
END
$fn$;

-- ── Saved as it is typed ────────────────────────────────────────────────────
-- p_id null: a new template — p_patch { name, fields, rules }. Otherwise only the parts given change: name, fields,
-- rules; p_rev is the draft the caller last saw, and a draft saved by somebody since is not written over.
CREATE OR REPLACE FUNCTION public.mkt_minutes_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t     public.mkt_minutes_templates;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_name  text;
  v_clean jsonb;
  v_by    text;
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
    INSERT INTO public.mkt_minutes_templates (name, fields, rules, created_by, updated_by)
    VALUES (v_name, v_clean -> 'fields', v_clean -> 'rules', auth.uid(), auth.uid())
    RETURNING * INTO v_t;
  ELSE
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

-- ── Published: the draft as the caller saw it, checked whole, is the next version ──
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
  INSERT INTO public.mkt_minutes_versions (template_id, version, fields, rules, published_by)
  VALUES (v_t.id, v_t.version + 1, v_clean -> 'fields', v_clean -> 'rules', auth.uid());
  UPDATE public.mkt_minutes_templates
     SET version = v_t.version + 1, published_rev = v_t.draft_rev, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_t.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_t.id, 'version', v_t.version + 1, 'rev', v_t.draft_rev);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_minutes_templates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_publish(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_publish(uuid, integer) TO authenticated;

-- ── The builder's page in the database's copy of the tab registry: the manager's tools ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/minutes', 'mkt.tracking')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
