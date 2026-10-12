-- ============================================================================
-- 20261013183000_data_center_bin.sql
-- People › Documentation › Data center: the Bin and Move to… (2026-10-13 — the
-- user, once the Talent Bank had both (mig 20261013061500): "Data center 也加
-- Bin 和 Move to…"; a subsidiary's folders stay made by HR by hand — asked,
-- "维持 HR 手动建").
-- ============================================================================
--
-- The Data center now keeps the Talent Bank's rules for what HR makes:
--
--   a file HR keeps     its ⋮ › Move to Bin: it waits 30 days, its object kept, and Restore puts it
--                       back. Then — Delete forever, Empty bin, or the 30 days — it is deleted as a
--                       Data center file always was: its row and trail greyed under "Show deleted",
--                       its object gone from the bucket, "File deleted" on its trail.
--   a folder HR made    its ⋮ › Move to Bin — still only an empty one, what is in the Bin not
--                       counting; Restore brings it back, and the folders above it when they are in
--                       the Bin too. Its ⋮ › Move to… takes it, with everything in it, to another place.
--
-- `hr_drive_bin` is the Bin: one row an item, who put it there and when. A file in the Bin is NOT
-- deleted (`deleted_at` stays empty), so the bucket's helpers (`hr_doc_file_unused`,
-- `hr_documentation_leftovers`) hold its object as they are; the Data center's own read, its link and
-- the folder rule leave it out. A folder in the Bin is deleted softly as before (`deleted_at`), and listed.
--
-- The 30 days: the hourly member-queue cron calls `hr_drive_bin_purge` (the service role's alone), which
-- deletes what is older and answers the objects nobody holds any more; the cron removes them through the
-- Storage API and `hr_drive_bin_files_gone` writes "File deleted" on their trail — the session-side pair
-- (`hr_documentation_leftovers` / `hr_documentation_files_removed`) asks Documentation · Edit, which a cron
-- has not got. Delete forever and Empty bin run under HR's own session and clear the objects as a delete
-- always has (`removeLeftoverFiles`, drive-actions.ts).
--
-- Production's bodies, one span swapped each (read off pg_proc on 2026-10-13: hr_drive 679f59aa…,
-- hr_drive_file 9d9d7974…, hr_drive_file_delete 22f1ce11…, hr_drive_folder_delete 4aede632…); the swap
-- refuses if production changed since. Documentation's cells are all on its one tab, so no gate narrows
-- and nothing here is tab-guarded (as mig 20261012220000).

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. The Bin ──────────────────────────────────────────────────────────────

CREATE TABLE public.hr_drive_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('file', 'folder')),
  file_id uuid REFERENCES public.hr_drive_files(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.hr_drive_folders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES public.users(id),
  deleted_by_name text NOT NULL,
  CONSTRAINT hr_drive_bin_item CHECK (
    (kind = 'file' AND file_id IS NOT NULL AND folder_id IS NULL)
    OR (kind = 'folder' AND folder_id IS NOT NULL AND file_id IS NULL))
);
CREATE UNIQUE INDEX hr_drive_bin_file ON public.hr_drive_bin (file_id) WHERE file_id IS NOT NULL;
CREATE UNIQUE INDEX hr_drive_bin_folder ON public.hr_drive_bin (folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX hr_drive_bin_age ON public.hr_drive_bin (deleted_at);
ALTER TABLE public.hr_drive_bin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_drive_bin FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.hr_drive_bin IS
  'People › Documentation › Data center: the Bin — a file HR keeps or a folder HR made, deleted, kept 30 days (Restore, Delete forever, Empty bin; the hourly sweep deletes what is older). Read through hr_drive().';

SELECT public.audit_register('hr_drive_bin', 'Data center bin', 'People', '{documentation}', 'all',
  p_labels => '{name}');

-- How long the Bin keeps what is deleted (the user: 30 days, as the Talent Bank's).
CREATE OR REPLACE FUNCTION public.hr_drive_bin_keeps()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT interval '30 days' $$;

-- A folder deleted in the last 30 days before the Bin is in it (a file deleted then is gone already — its object went).
INSERT INTO public.hr_drive_bin (kind, folder_id, name, deleted_at, deleted_by, deleted_by_name)
SELECT 'folder', f.id, f.name, f.deleted_at, f.deleted_by,
       coalesce((SELECT nullif(btrim(s.employee_name), '') FROM public.hr_staff_costs s WHERE s.user_id = f.deleted_by
                  ORDER BY s.status = 'active' DESC LIMIT 1),
                (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = f.deleted_by), 'HR')
  FROM public.hr_drive_folders f
 WHERE f.deleted_at > now() - public.hr_drive_bin_keeps();

-- ── 2. Helpers (only the functions below call them) ─────────────────────────

-- A folder in the Bin back where it was — the folder it was in first, when that is in the Bin too. False when it is
-- gone for good (deleted before the Bin, or its 30 days over): what was in it then goes to the top of the Data center.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_reopen(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_folder FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF f.deleted_at IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_drive_bin x WHERE x.folder_id = p_folder
                  AND x.deleted_at > now() - public.hr_drive_bin_keeps()) THEN
    RETURN false;
  END IF;
  IF f.parent_kind = 'folder' AND NOT public.hr_drive_bin_reopen(f.parent_folder_id) THEN
    UPDATE public.hr_drive_folders SET parent_kind = 'root', parent_dept_id = NULL, parent_folder_id = NULL
     WHERE id = p_folder RETURNING * INTO f;
  END IF;
  IF public.hr_drive_name_taken(f.parent_kind, f.parent_dept_id, f.parent_folder_id, f.name, f.id) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET deleted_at = NULL, deleted_by = NULL WHERE id = p_folder;
  DELETE FROM public.hr_drive_bin WHERE folder_id = p_folder;
  RETURN true;
END
$$;

-- One item out of the Bin for good; answers the object it named. A file is deleted as a Data center file always was —
-- its row and trail stay greyed under "Show deleted", "Deleted" on its trail; its object is then nobody's (the caller
-- clears it). A folder's row goes once nothing names it. `p_auto`: the 30 days are over (the hourly sweep), not a press.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_drop(p_bin uuid, p_auto boolean)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_bin%ROWTYPE;
  v_path text;
BEGIN
  SELECT * INTO x FROM public.hr_drive_bin WHERE id = p_bin FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  DELETE FROM public.hr_drive_bin WHERE id = p_bin;
  IF x.kind = 'file' THEN
    UPDATE public.hr_drive_files SET deleted_at = now(), deleted_by = CASE WHEN p_auto THEN NULL ELSE auth.uid() END
     WHERE id = x.file_id AND deleted_at IS NULL
    RETURNING file_path INTO v_path;
    IF v_path IS NULL THEN RETURN '{}'; END IF;
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
    VALUES (x.file_id, 'Deleted', CASE WHEN p_auto THEN NULL ELSE auth.uid() END,
            CASE WHEN p_auto THEN 'Data center' ELSE public.hr_doc_actor_name() END,
            CASE WHEN p_auto THEN '30 days in the Bin' ELSE 'From the Bin' END);
    RETURN ARRAY[v_path];
  END IF;
  DELETE FROM public.hr_drive_folders f
   WHERE f.id = x.folder_id AND f.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_drive_folders c WHERE c.parent_folder_id = f.id)
     AND NOT EXISTS (SELECT 1 FROM public.hr_drive_files y WHERE y.parent_folder_id = f.id);
  RETURN '{}';
END
$$;

-- ── 3. The page's read and a file's link ────────────────────────────────────

-- A file in the Bin is neither kept nor deleted on the page — it is in the Bin, newest first: each item, where it was
-- (an address — the page names it, through a folder in the Bin too), who put it there and when, and when it goes.
SELECT pg_temp.swap_check('public.hr_drive()',
  $q$FROM public.hr_drive_files x)
  );$q$,
  $q$FROM public.hr_drive_files x WHERE NOT EXISTS (SELECT 1 FROM public.hr_drive_bin bx WHERE bx.file_id = x.id)),
    'bin', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'name', b.name,
              'at', CASE coalesce(bf.parent_kind, bd.parent_kind) WHEN 'root' THEN 'root' WHEN 'company' THEN 'company:hv'
                      WHEN 'dept' THEN 'dept:' || coalesce(bf.parent_dept_id, bd.parent_dept_id)
                      ELSE 'folder:' || coalesce(bf.parent_folder_id, bd.parent_folder_id) END,
              'folderId', b.folder_id, 'fileId', b.file_id, 'ref', bf.ref, 'contentType', bf.content_type, 'size', bf.file_size,
              'deletedAt', b.deleted_at, 'deletedBy', b.deleted_by_name,
              'expiresAt', b.deleted_at + public.hr_drive_bin_keeps()) ORDER BY b.deleted_at DESC, b.id), '[]'::jsonb)
            FROM public.hr_drive_bin b
            LEFT JOIN public.hr_drive_files bf ON bf.id = b.file_id
            LEFT JOIN public.hr_drive_folders bd ON bd.id = b.folder_id
           WHERE b.deleted_at > now() - public.hr_drive_bin_keeps())
  );$q$);

-- A file in the Bin is not opened.
SELECT pg_temp.swap_check('public.hr_drive_file(uuid)',
  $q$IF v.deleted_at IS NOT NULL THEN$q$,
  $q$IF EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = v.id) THEN
    RAISE EXCEPTION 'It is in the Bin — restore it to open it.' USING ERRCODE = '22023';
  END IF;
  IF v.deleted_at IS NOT NULL THEN$q$);

-- ── 4. Deleting goes to the Bin ─────────────────────────────────────────────

-- A file's ⋮ › Move to Bin: listed in the Bin, "Moved to Bin" on its trail; not deleted yet, so its object stays.
SELECT pg_temp.swap_check('public.hr_drive_file_delete(uuid)',
  $q$UPDATE public.hr_drive_files SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is already deleted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  VALUES (p_id, 'Deleted', auth.uid(), public.hr_doc_actor_name());$q$,
  $q$PERFORM 1 FROM public.hr_drive_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = p_id) THEN
    RAISE EXCEPTION 'That file is already deleted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_bin (kind, file_id, name, deleted_by, deleted_by_name)
  SELECT 'file', f.id, f.file_name, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_files f WHERE f.id = p_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  VALUES (p_id, 'Moved to Bin', auth.uid(), public.hr_doc_actor_name());$q$);

-- A folder's ⋮ › Move to Bin: still only an empty one — what is in the Bin does not count — and listed in the Bin.
SELECT pg_temp.swap_check('public.hr_drive_folder_delete(uuid)',
  $q$OR EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.parent_folder_id = p_id AND x.deleted_at IS NULL) THEN$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.parent_folder_id = p_id AND x.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.hr_drive_bin b WHERE b.file_id = x.id)) THEN$q$);
SELECT pg_temp.swap_check('public.hr_drive_folder_delete(uuid)',
  $q$UPDATE public.hr_drive_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;$q$,
  $q$UPDATE public.hr_drive_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
  INSERT INTO public.hr_drive_bin (kind, folder_id, name, deleted_by, deleted_by_name)
  SELECT 'folder', f.id, f.name, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_folders f WHERE f.id = p_id;$q$);

-- ── 5. The Bin's own writes, and Move to… ───────────────────────────────────

-- Bin › Restore (Edit): back where it was. Answers what it was and the name of the place it is in now.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_restore(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hr_drive_bin%ROWTYPE;
  y public.hr_drive_files%ROWTYPE;
  v_kind text;
  v_dept uuid;
  v_folder uuid;
  v_where text;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Restoring needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hr_drive_bin WHERE id = p_bin FOR UPDATE;
  IF NOT FOUND OR x.deleted_at <= now() - public.hr_drive_bin_keeps() THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  IF x.kind = 'folder' THEN
    IF NOT public.hr_drive_bin_reopen(x.folder_id) THEN
      RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
    END IF;
    SELECT f.parent_kind, f.parent_dept_id, f.parent_folder_id INTO v_kind, v_dept, v_folder
      FROM public.hr_drive_folders f WHERE f.id = x.folder_id;
  ELSE
    SELECT * INTO y FROM public.hr_drive_files WHERE id = x.file_id FOR UPDATE;
    IF y.parent_kind = 'folder' AND NOT public.hr_drive_bin_reopen(y.parent_folder_id) THEN
      UPDATE public.hr_drive_files SET parent_kind = 'root', parent_folder_id = NULL WHERE id = y.id;
      y.parent_kind := 'root';
      y.parent_folder_id := NULL;
    END IF;
    DELETE FROM public.hr_drive_bin WHERE id = p_bin;
    v_kind := y.parent_kind;
    v_dept := y.parent_dept_id;
    v_folder := y.parent_folder_id;
  END IF;
  v_where := CASE v_kind
    WHEN 'root' THEN 'Data center'
    WHEN 'company' THEN 'HOUZS Venture'
    WHEN 'dept' THEN (SELECT regexp_replace(d.name, '\s+Department$', '', 'i') FROM public.departments d WHERE d.id = v_dept)
    ELSE (SELECT f.name FROM public.hr_drive_folders f WHERE f.id = v_folder) END;
  IF x.kind = 'file' THEN
    INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
    VALUES (x.file_id, 'Restored', auth.uid(), public.hr_doc_actor_name(), 'Into ' || coalesce(v_where, 'the Data center'));
  END IF;
  RETURN jsonb_build_object('kind', x.kind, 'name', x.name, 'label', coalesce(v_where, 'Data center'));
END
$$;

-- Bin › Delete forever (Edit): deleted now, as a Data center file always was; the caller clears the object.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_delete(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[];
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Deleting needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_drive_bin WHERE id = p_bin) THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  v_paths := public.hr_drive_bin_drop(p_bin, false);
  RETURN jsonb_build_object('files', cardinality(v_paths));
END
$$;

-- Bin › Empty bin (Edit): everything in it, now. Answers how many.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_empty()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Emptying the Bin needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT x.id FROM public.hr_drive_bin x ORDER BY x.deleted_at, x.id LOOP
    PERFORM public.hr_drive_bin_drop(r.id, false);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('count', v_n);
END
$$;

-- A folder's ⋮ › Move to… (Edit): the folder and everything in it — its folders and files name the folder, not its
-- place, so they go with it. Never into itself or a folder inside it, never into a person; a name the place has stops it.
CREATE OR REPLACE FUNCTION public.hr_drive_folder_move(p_id uuid, p_parent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hr_drive_folders%ROWTYPE;
  v_place record;
BEGIN
  IF public.has_any_action(ARRAY['documentation.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Moving a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF v_place.kind = 'folder' AND EXISTS (
       WITH RECURSIVE up AS (
         SELECT a.id, a.parent_folder_id, 1 AS depth FROM public.hr_drive_folders a WHERE a.id = v_place.folder
         UNION ALL
         SELECT c.id, c.parent_folder_id, up.depth + 1 FROM public.hr_drive_folders c JOIN up ON c.id = up.parent_folder_id WHERE up.depth < 64)
       SELECT 1 FROM up WHERE up.id = p_id) THEN
    RAISE EXCEPTION 'A folder cannot go inside itself.' USING ERRCODE = '22023';
  END IF;
  IF (f.parent_kind, f.parent_dept_id, f.parent_folder_id) IS NOT DISTINCT FROM (v_place.kind, v_place.dept, v_place.folder) THEN
    RETURN;
  END IF;
  IF public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, f.name, f.id) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET parent_kind = v_place.kind, parent_dept_id = v_place.dept, parent_folder_id = v_place.folder
   WHERE id = p_id;
END
$$;

-- The hourly sweep (api/member-queue, the service role): what has been in the Bin 30 days goes for good, at most p_limit a
-- run. Answers how many, and the objects nobody holds any more — the sweep removes them through the Storage API.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_purge(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_paths text[] := '{}';
  v_n integer := 0;
BEGIN
  FOR r IN SELECT x.id FROM public.hr_drive_bin x
            WHERE x.deleted_at <= now() - public.hr_drive_bin_keeps()
            ORDER BY x.deleted_at, x.id
            LIMIT greatest(1, least(coalesce(p_limit, 200), 1000)) LOOP
    v_paths := v_paths || public.hr_drive_bin_drop(r.id, true);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('count', v_n, 'paths', to_jsonb(ARRAY(
    SELECT DISTINCT p FROM unnest(v_paths) p
     WHERE NOT EXISTS (SELECT 1 FROM public.hr_drive_files f WHERE f.file_path = p AND f.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.hr_documents d WHERE d.file_path = p AND d.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p AND l.withdrawn_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p AND m.withdrawn_at IS NULL)
     ORDER BY p)));
END
$$;

-- …and once the bucket no longer has them, "File deleted" on their trail, by the Data center, once.
CREATE OR REPLACE FUNCTION public.hr_drive_bin_files_gone(p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  SELECT f.id, 'File deleted', NULL, 'Data center', f.file_name
    FROM public.hr_drive_files f
   WHERE f.file_path = ANY (coalesce(p_paths, '{}'::text[])) AND f.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = f.file_path)
     AND NOT EXISTS (SELECT 1 FROM public.hr_drive_file_events e WHERE e.file_id = f.id AND e.what = 'File deleted');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- ── 6. Who may call them ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hr_drive_bin_keeps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_bin_reopen(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_bin_drop(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_bin_purge(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_drive_bin_files_gone(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_bin_keeps(), public.hr_drive_bin_reopen(uuid), public.hr_drive_bin_drop(uuid, boolean),
  public.hr_drive_bin_purge(integer), public.hr_drive_bin_files_gone(text[]) TO service_role;

REVOKE ALL ON FUNCTION public.hr_drive_bin_restore(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_bin_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_bin_empty() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_drive_folder_move(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_bin_restore(uuid), public.hr_drive_bin_delete(uuid), public.hr_drive_bin_empty(),
  public.hr_drive_folder_move(uuid, text) TO authenticated;

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.hr_drive_bin_restore(uuid)', 'public.hr_drive_bin_delete(uuid)', 'public.hr_drive_bin_empty()',
                              'public.hr_drive_folder_move(uuid, text)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: a signed-in reader may not call it', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.hr_drive_bin_purge(integer)', 'public.hr_drive_bin_files_gone(text[])', 'public.hr_drive_bin_drop(uuid, boolean)',
                              'public.hr_drive_bin_reopen(uuid)', 'public.hr_drive_bin_keeps()'] LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: open to sessions', v_fn;
    END IF;
  END LOOP;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_drive_file_delete(uuid)'::regprocedure), 'hr_drive_bin') = 0
     OR strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hr_drive()'::regprocedure), 'hr_drive_bin') = 0 THEN
    RAISE EXCEPTION 'the Data center does not know its Bin';
  END IF;
END
$guard$;
