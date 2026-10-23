-- Marketing ⑥-4 (2026-10-23): a Library file attached to a task — the handoff's *Attach to task* (a file's menu in
-- the Library: "It appears in the task Canvas as a linked file — no duplicate copy") and *Attach from Library* (the
-- Library as a picker, opened from the task).
--
--   * mkt_task_files                      a task × a Library file — the file stays the Library's one copy; who
--                                         attached it, when. Deleted for good (or purged) from the Library, a file
--                                         leaves its tasks; binned, it waits off them until restored.
--   * mkt_task_library(project)           Marketing · View: the task's attached files, newest first
--   * mkt_task_attach(project, files[])   Marketing · Edit: files of the task's own subsidiary onto a quick task or a
--                                         recurring task's run that is not done or cancelled (a series is a pattern,
--                                         never a task; a product project's task page comes with ②b-2); at most 50
--   * mkt_task_detach(project, file)      Marketing · Edit: taken off the task — the file stays in the Library
--   * each is a line on the task's trail: 'attached' / 'detached', the file's name its reason
--
-- PGlite: tests/member-sql/validate-marketing-library.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_task_files (
  project_id  uuid NOT NULL REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL REFERENCES public.mkt_lib_files(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.users(id),
  by_name     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, file_id)
);
CREATE INDEX IF NOT EXISTS mkt_task_files_file ON public.mkt_task_files (file_id);
ALTER TABLE public.mkt_task_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_task_files FROM anon, authenticated;
SELECT public.audit_register('mkt_task_files', 'Marketing task files from the Library', 'Marketing', '{marketing}', 'all',
  p_keys => '{project_id,file_id}', p_labels => '{project_id,file_id}');

-- ── A task's files ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_task_library(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime,
                                                       'folder', t.name, 'by', tf.by_name, 'at', tf.created_at)
                                    ORDER BY tf.created_at DESC, f.name)
                     FROM public.mkt_task_files tf
                     JOIN public.mkt_lib_files f ON f.id = tf.file_id AND f.trashed_at IS NULL
                     JOIN public.mkt_lib_folders d ON d.id = f.folder_id AND d.trashed_at IS NULL
                     JOIN public.mkt_lib_types t ON t.id = d.type_id
                    WHERE tf.project_id = p_project), '[]'::jsonb);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_task_library(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_library(uuid) TO authenticated;

-- ── Attached ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_task_attach(p_project uuid, p_files uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p   public.mkt_projects;
  v_f   record;
  v_new integer := 0;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Attaching to a task is not open to your account.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.kind = 'product' OR (v_p.kind = 'recurring' AND v_p.series_id IS NULL) THEN
    RAISE EXCEPTION 'Files are attached to a task — a quick task or a run of a recurring one.' USING ERRCODE = '22023';
  END IF;
  IF v_p.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'That task is closed.' USING ERRCODE = '22023';
  END IF;
  IF p_files IS NULL OR cardinality(p_files) = 0 THEN
    RAISE EXCEPTION 'Pick a file.' USING ERRCODE = '22023';
  END IF;
  -- Each file once, in the order picked.
  FOR v_f IN
    SELECT q.id, q.name, q.subsidiary_id FROM (
      SELECT DISTINCT ON (x.id) x.n, f.id, f.name, d.subsidiary_id
        FROM unnest(p_files) WITH ORDINALITY x(id, n)
        LEFT JOIN public.mkt_lib_files f ON f.id = x.id AND f.trashed_at IS NULL
        LEFT JOIN public.mkt_lib_folders d ON d.id = f.folder_id AND d.trashed_at IS NULL
       ORDER BY x.id, x.n) q
     ORDER BY q.n
  LOOP
    IF v_f.id IS NULL OR v_f.subsidiary_id IS NULL THEN
      RAISE EXCEPTION 'That file is not in the Library.' USING ERRCODE = 'P0002';
    END IF;
    IF v_f.subsidiary_id IS DISTINCT FROM v_p.subsidiary_id THEN
      RAISE EXCEPTION '"%" is another subsidiary''s.', v_f.name USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mkt_task_files (project_id, file_id, created_by, by_name)
    VALUES (v_p.id, v_f.id, auth.uid(), public.mkt_actor())
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_new := v_new + 1;
      PERFORM public.mkt_log(v_p.id, 'attached', NULL, NULL, NULL, v_f.name);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.mkt_task_files WHERE project_id = v_p.id) > 50 THEN
    RAISE EXCEPTION 'At most 50 files on a task.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id AND v_new > 0;
  RETURN jsonb_build_object('attached', v_new, 'files', public.mkt_task_library(v_p.id));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_task_attach(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_attach(uuid, uuid[]) TO authenticated;

-- ── Taken off ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_task_detach(p_project uuid, p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Attaching to a task is not open to your account.');
  SELECT f.name INTO v_name FROM public.mkt_task_files tf JOIN public.mkt_lib_files f ON f.id = tf.file_id
   WHERE tf.project_id = p_project AND tf.file_id = p_file;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is not on the task.' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.mkt_task_files WHERE project_id = p_project AND file_id = p_file;
  PERFORM public.mkt_log(p_project, 'detached', NULL, NULL, NULL, v_name);
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = p_project;
  RETURN public.mkt_task_library(p_project);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_task_detach(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_detach(uuid, uuid) TO authenticated;
