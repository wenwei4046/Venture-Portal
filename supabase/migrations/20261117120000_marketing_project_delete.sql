-- Marketing — a project or a task is deleted from Projects, and put back by Undo (2026-11-17;
-- docs/design_handoff_workflow_projects/ › 2. Projects › Delete). The user's answers: a SOFT delete, Marketing · Manage
-- only, asked again by the database.
--
-- Soft: the row stays, marked `deleted_at` / `deleted_by` / `deleted_batch`, its status turned `cancelled` and the one it
-- had kept in `deleted_status` — so every sweep, top-up, count and the PIC's links (which all skip a cancelled project)
-- leave it alone without being rewritten. A product project takes its deliverables with it, a recurring task's series its
-- runs: one batch, put back together.
--
-- Hidden from every reader the pages use, by a thin wrapper round production's own function (renamed `*_rows`, its body
-- untouched — NEVER copy a body here): mkt_board (Projects, My Space, the Calendar, Tracking, a subsidiary's page),
-- mkt_search (the top bar), mkt_sub_feed (a subsidiary's feed), mkt_project and mkt_product_project (the project's page:
-- not found). A later change to what one of them reads changes its `*_rows` function.
--
-- PGlite: tests/member-sql/validate-marketing-project-delete.mjs.

ALTER TABLE public.mkt_projects
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by     uuid,
  ADD COLUMN IF NOT EXISTS deleted_status text,
  ADD COLUMN IF NOT EXISTS deleted_batch  uuid;

CREATE INDEX IF NOT EXISTS mkt_projects_deleted_idx ON public.mkt_projects (deleted_batch) WHERE deleted_at IS NOT NULL;

-- ── the delete ──────────────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_project_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p     public.mkt_projects;
  v_batch uuid := gen_random_uuid();
  v_n     integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Only Marketing''s managers delete projects.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_p.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That project is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  -- The project, a product project's deliverables, a series' runs — none deleted already (those keep their own batch).
  UPDATE public.mkt_projects x
     SET deleted_status = x.status, status = 'cancelled', deleted_at = now(), deleted_by = auth.uid(), deleted_batch = v_batch
   WHERE x.deleted_at IS NULL AND (x.id = v_p.id OR x.parent_id = v_p.id OR x.series_id = v_p.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('batch', v_batch, 'id', v_p.id, 'trackId', v_p.track_id, 'title', v_p.title, 'rows', v_n);
END
$fn$;

-- Undo: the batch put back as it was, by a manager, within the hour (the page offers it for 6 seconds).
CREATE OR REPLACE FUNCTION public.mkt_project_restore(p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Only Marketing''s managers delete projects.');
  UPDATE public.mkt_projects x
     SET status = coalesce(x.deleted_status, x.status), deleted_status = NULL, deleted_at = NULL, deleted_by = NULL,
         deleted_batch = NULL
   WHERE x.deleted_batch = p_batch AND x.deleted_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'It can no longer be put back.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('rows', v_n);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_project_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_project_restore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_project_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_project_restore(uuid) TO authenticated;

-- ── hidden from the readers ─────────────────────────────────────────────────────────────────────────────────────────

-- Every array of objects in a reader's answer, without the deleted projects' own entries ('id' under projects) and
-- whatever names one ('project' — stages, subtasks, dates, ads …). Only DEFINER functions call it.
CREATE OR REPLACE FUNCTION public.mkt_hide_deleted(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_gone text[];
  v_out  jsonb := p;
  v_k    text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN p;
  END IF;
  v_gone := ARRAY(SELECT x.id::text FROM public.mkt_projects x WHERE x.deleted_at IS NOT NULL);
  IF cardinality(v_gone) = 0 THEN
    RETURN p;
  END IF;
  FOR v_k IN SELECT k FROM jsonb_object_keys(p) k WHERE jsonb_typeof(p -> k) = 'array' LOOP
    v_out := jsonb_set(v_out, ARRAY[v_k], coalesce((
      SELECT jsonb_agg(e ORDER BY o)
        FROM jsonb_array_elements(p -> v_k) WITH ORDINALITY a(e, o)
       -- coalesce: an entry with no 'project' key compares NULL, and NOT NULL would drop it.
       WHERE NOT coalesce(jsonb_typeof(e) = 'object' AND (
               (v_k = 'projects' AND coalesce(e ->> 'id' = ANY (v_gone), false))
            OR coalesce(e ->> 'project' = ANY (v_gone), false)
            OR coalesce(jsonb_typeof(e -> 'project') = 'object' AND e -> 'project' ->> 'id' = ANY (v_gone), false)), false)), '[]'::jsonb));
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_key_deleted(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.mkt_projects x
                  WHERE x.deleted_at IS NOT NULL AND (x.id::text = btrim(coalesce(p_key, '')) OR upper(x.track_id) = upper(btrim(coalesce(p_key, '')))));
END
$fn$;

ALTER FUNCTION public.mkt_board(date, date) RENAME TO mkt_board_rows;
ALTER FUNCTION public.mkt_search(text) RENAME TO mkt_search_rows;
ALTER FUNCTION public.mkt_sub_feed(uuid, integer) RENAME TO mkt_sub_feed_rows;
ALTER FUNCTION public.mkt_project(text) RENAME TO mkt_project_rows;
ALTER FUNCTION public.mkt_product_project(text) RENAME TO mkt_product_project_rows;

CREATE FUNCTION public.mkt_board(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ BEGIN RETURN public.mkt_hide_deleted(public.mkt_board_rows(p_from, p_to)); END $fn$;

CREATE FUNCTION public.mkt_search(p_q text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v jsonb := public.mkt_search_rows(p_q);
BEGIN
  IF v IS NULL OR jsonb_typeof(v -> 'projects') <> 'array' THEN
    RETURN v;
  END IF;
  RETURN jsonb_set(v, '{projects}', coalesce((
    SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(v -> 'projects') WITH ORDINALITY a(e, o)
     WHERE NOT public.mkt_key_deleted(e ->> 'trackId')), '[]'::jsonb));
END
$fn$;

CREATE FUNCTION public.mkt_sub_feed(p_sub uuid, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v jsonb := public.mkt_sub_feed_rows(p_sub, p_limit);
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'array' THEN
    RETURN v;
  END IF;
  RETURN (public.mkt_hide_deleted(jsonb_build_object('feed', v))) -> 'feed';
END
$fn$;

CREATE FUNCTION public.mkt_project(p_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF public.mkt_key_deleted(p_key) THEN
    PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
    RETURN NULL;
  END IF;
  RETURN public.mkt_project_rows(p_key);
END
$fn$;

CREATE FUNCTION public.mkt_product_project(p_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF public.mkt_key_deleted(p_key) THEN
    PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
    RETURN NULL;
  END IF;
  RETURN public.mkt_product_project_rows(p_key);
END
$fn$;

-- The readers keep their grants (authenticated); the renamed bodies and the helpers are only DEFINER functions' to call.
REVOKE ALL ON FUNCTION public.mkt_board(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_search(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_sub_feed(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_project(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_project(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_board(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_search(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_sub_feed(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_project(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mkt_product_project(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mkt_board_rows(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_search_rows(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_sub_feed_rows(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_project_rows(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_product_project_rows(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_hide_deleted(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_key_deleted(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_board_rows(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_search_rows(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_sub_feed_rows(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_project_rows(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_product_project_rows(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_hide_deleted(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_key_deleted(text) TO service_role;

NOTIFY pgrst, 'reload schema';
