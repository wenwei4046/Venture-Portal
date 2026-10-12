-- ============================================================================
-- 20261012220000_documentation_drive.sql
-- People › Documentation › Data center as a Drive (2026-10-12 — the user: the
-- people column "scroll 得很高"; "参考 Google Drive 的做法，它是可以 create folder
-- 的" — company, then department, then the person; HR is centralized, so a
-- subsidiary gets a folder of its own, and folders named by department in it).
-- ============================================================================
--
-- The Data center becomes a tree of folders:
--
--   Data center
--   ├── HOUZS Venture            automatic — the portal's own company
--   │   ├── <department>         automatic — every department with active people
--   │   │   └── <person>         automatic — their record: the letters, as today
--   │   └── (folders HR makes)
--   └── (folders HR makes)       a subsidiary, its departments, anything
--
-- The automatic part is read from People (hr_documentation(), unchanged), so a
-- new hire, a move or a rename shows by itself, and "Publish & save" keeps
-- filing each copy into its person's folder — that is the folder found by name.
-- What HR makes is new:
--
--   hr_drive_folders      a folder, its parent the Data center itself, HOUZS
--                         Venture, one of its departments, or another folder
--                         (never a person: a person's folder is their record).
--   hr_drive_files        a file HR keeps in such a place — a record only, sent
--                         to nobody; deleted softly (its row and trail stay)
--                         while its FILE really goes, as a document's does.
--   hr_drive_file_events  its trail: Uploaded, Viewed, Downloaded, Deleted,
--                         File deleted.
--
-- As every table of the module: RLS on, no policy, no client grants — read and
-- written only by the functions below, each asking `has_any_action` for its
-- Documentation cell (View reads, Create makes a folder and files a file, Edit
-- renames and deletes). Files go up from the browser under `drive/` in the
-- private bucket `hr-documents`: the upload and delete policies take the new
-- folder, and the three file helpers know a live Data center file holds its
-- object (production's bodies, one statement swapped each — read off pg_proc on
-- 2026-10-12: hr_doc_file_unused e7891e03…, hr_documentation_leftovers
-- 4b835d81…, hr_documentation_files_removed 5fe7aedc…; the swap refuses if
-- production changed since).

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

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE public.hr_drive_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  parent_kind text NOT NULL CHECK (parent_kind IN ('root', 'company', 'dept', 'folder')),
  parent_dept_id uuid REFERENCES public.departments(id),
  parent_folder_id uuid REFERENCES public.hr_drive_folders(id),
  created_by uuid REFERENCES public.users(id),
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id),
  CONSTRAINT hr_drive_folders_parent CHECK (
    (parent_kind IN ('root', 'company') AND parent_dept_id IS NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'dept' AND parent_dept_id IS NOT NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'folder' AND parent_folder_id IS NOT NULL AND parent_dept_id IS NULL))
);
CREATE INDEX hr_drive_folders_in_folder ON public.hr_drive_folders (parent_folder_id);
-- One live folder of a name in a place.
CREATE UNIQUE INDEX hr_drive_folders_name ON public.hr_drive_folders
  (parent_kind, coalesce(parent_folder_id, parent_dept_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))
  WHERE deleted_at IS NULL;

CREATE SEQUENCE IF NOT EXISTS public.hr_drive_file_ref_seq START 101;

CREATE TABLE public.hr_drive_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('F-' || nextval('public.hr_drive_file_ref_seq')),
  parent_kind text NOT NULL CHECK (parent_kind IN ('root', 'company', 'dept', 'folder')),
  parent_dept_id uuid REFERENCES public.departments(id),
  parent_folder_id uuid REFERENCES public.hr_drive_folders(id),
  file_path text NOT NULL CHECK (file_path LIKE 'drive/%'),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES public.users(id),
  uploaded_by_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.users(id),
  CONSTRAINT hr_drive_files_parent CHECK (
    (parent_kind IN ('root', 'company') AND parent_dept_id IS NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'dept' AND parent_dept_id IS NOT NULL AND parent_folder_id IS NULL)
    OR (parent_kind = 'folder' AND parent_folder_id IS NOT NULL AND parent_dept_id IS NULL))
);
CREATE INDEX hr_drive_files_in_folder ON public.hr_drive_files (parent_folder_id);
CREATE INDEX hr_drive_files_path ON public.hr_drive_files (file_path);

CREATE TABLE public.hr_drive_file_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES public.hr_drive_files(id),
  what text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_drive_file_events_file ON public.hr_drive_file_events (file_id, created_at);

ALTER TABLE public.hr_drive_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_drive_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_drive_file_events ENABLE ROW LEVEL SECURITY;

-- No client grants (as the module's other tables since mig 20261011120100): the functions below are the way in.
REVOKE ALL ON public.hr_drive_folders, public.hr_drive_files, public.hr_drive_file_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.hr_drive_file_ref_seq, public.hr_drive_file_events_id_seq FROM anon, authenticated;

SELECT public.audit_register('hr_drive_folders', 'Data center folders', 'People', '{documentation}', 'all',
  p_labels => '{name}');
SELECT public.audit_register('hr_drive_files', 'Data center files', 'People', '{documentation}', 'all',
  p_keys => '{ref}', p_labels => '{file_name}');
SELECT public.audit_register('hr_drive_file_events', 'Data center file trail', 'People', '{}', 'none',
  p_reason => 'The Data center files'' own trail, written by their functions — a record already');

-- ── 2. The bucket takes `drive/` ─────────────────────────────────────────────

ALTER POLICY hr_documents_upload ON storage.objects
  WITH CHECK (bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] IN ('documents', 'letters', 'publish', 'drive')
    AND (SELECT public.has_any_action(ARRAY['documentation.create'])));
ALTER POLICY hr_documents_delete ON storage.objects
  USING (bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] IN ('documents', 'letters', 'publish', 'drive')
    AND public.hr_doc_file_unused(name));

-- A live Data center file holds its object: nobody deletes it from the bucket ...
SELECT pg_temp.swap_check('public.hr_doc_file_unused(text)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p_name AND m.withdrawn_at IS NULL);$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p_name AND m.withdrawn_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.hr_drive_files f WHERE f.file_path = p_name AND f.deleted_at IS NULL);$q$);

-- ... a deleted one's object is a leftover at once (an upload nobody saved, after a day — as before) ...
SELECT pg_temp.swap_check('public.hr_documentation_leftovers()',
  $q$AND (storage.foldername(o.name))[1] IN ('documents', 'letters', 'publish')$q$,
  $q$AND (storage.foldername(o.name))[1] IN ('documents', 'letters', 'publish', 'drive')$q$);
SELECT pg_temp.swap_check('public.hr_documentation_leftovers()',
  $q$OR EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = o.name))$q$,
  $q$OR EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = o.name)
                    OR EXISTS (SELECT 1 FROM public.hr_drive_files f WHERE f.file_path = o.name))$q$);

-- ... and once the bucket no longer has it, its trail says "File deleted" — once.
SELECT pg_temp.swap_check('public.hr_documentation_files_removed(text[])',
  $q$GET DIAGNOSTICS v_letters = ROW_COUNT;
  RETURN v_docs + v_letters;$q$,
  $q$GET DIAGNOSTICS v_letters = ROW_COUNT;
  v_docs := v_docs + v_letters;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  SELECT f.id, 'File deleted', auth.uid(), public.hr_doc_actor_name(), f.file_name
    FROM public.hr_drive_files f
   WHERE f.file_path = ANY (coalesce(p_paths, '{}'::text[])) AND f.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = f.file_path)
     AND NOT EXISTS (SELECT 1 FROM public.hr_drive_file_events e WHERE e.file_id = f.id AND e.what = 'File deleted');
  GET DIAGNOSTICS v_letters = ROW_COUNT;
  RETURN v_docs + v_letters;$q$);

-- ── 3. Helpers (only the functions below call them) ─────────────────────────

-- Where a folder or a file goes, from the page's address of a place: `root` (the Data center), `company:hv`
-- (HOUZS Venture), `dept:<department>`, `folder:<folder>`. A person's folder is their record — never here.
CREATE OR REPLACE FUNCTION public.hr_drive_place(p_parent text, OUT kind text, OUT dept uuid, OUT folder uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_parent = 'root' THEN
    kind := 'root';
  ELSIF p_parent = 'company:hv' THEN
    kind := 'company';
  ELSIF p_parent ~ '^(dept|folder):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_id := substr(p_parent, strpos(p_parent, ':') + 1)::uuid;
    IF p_parent LIKE 'dept:%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = v_id) THEN
        RAISE EXCEPTION 'That department is not there any more.' USING ERRCODE = '22023';
      END IF;
      kind := 'dept';
      dept := v_id;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.hr_drive_folders f WHERE f.id = v_id AND f.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
      END IF;
      kind := 'folder';
      folder := v_id;
    END IF;
  ELSIF p_parent LIKE 'person:%' THEN
    RAISE EXCEPTION 'A person''s folder holds their letters — upload a letter there.' USING ERRCODE = '22023';
  ELSE
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_place(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_place(text) TO service_role;

-- Whether a name is taken in a place: by a live folder HR made there, or by what is there by itself —
-- HOUZS Venture in the Data center, a department in HOUZS Venture, a person in their department.
CREATE OR REPLACE FUNCTION public.hr_drive_name_taken(p_kind text, p_dept uuid, p_folder uuid, p_name text, p_except uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := lower(trim(p_name));
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.hr_drive_folders f
                  WHERE f.deleted_at IS NULL AND f.parent_kind = p_kind
                    AND f.parent_dept_id IS NOT DISTINCT FROM p_dept AND f.parent_folder_id IS NOT DISTINCT FROM p_folder
                    AND lower(trim(f.name)) = v_name AND f.id IS DISTINCT FROM p_except)
      OR (p_kind = 'root' AND v_name = 'houzs venture')
      OR (p_kind = 'company' AND EXISTS (
            SELECT 1 FROM public.departments d
             WHERE EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.department_id = d.id AND s.status = 'active')
               AND lower(trim(regexp_replace(d.name, '\s+Department$', '', 'i'))) = v_name))
      OR (p_kind = 'dept' AND EXISTS (
            SELECT 1 FROM public.hr_staff_costs s
             WHERE s.department_id = p_dept AND s.status = 'active' AND lower(trim(s.employee_name)) = v_name));
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_name_taken(text, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_drive_name_taken(text, uuid, uuid, text, uuid) TO service_role;

-- ── 4. The page's read ──────────────────────────────────────────────────────

-- The folders and files HR made, each with the address of the place it is in; a file with its trail.
-- Deleted folders are left out; deleted files stay, greyed under "Show deleted".
CREATE OR REPLACE FUNCTION public.hr_drive()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'folders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', f.id, 'name', f.name,
                  'parent', CASE f.parent_kind WHEN 'root' THEN 'root' WHEN 'company' THEN 'company:hv'
                                 WHEN 'dept' THEN 'dept:' || f.parent_dept_id ELSE 'folder:' || f.parent_folder_id END,
                  'createdAt', f.created_at, 'createdBy', f.created_by_name
                ) ORDER BY lower(f.name), f.created_at), '[]'::jsonb)
                FROM public.hr_drive_folders f WHERE f.deleted_at IS NULL),
    'files', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', x.id, 'ref', x.ref, 'fileName', x.file_name, 'contentType', x.content_type, 'size', x.file_size,
                'parent', CASE x.parent_kind WHEN 'root' THEN 'root' WHEN 'company' THEN 'company:hv'
                               WHEN 'dept' THEN 'dept:' || x.parent_dept_id ELSE 'folder:' || x.parent_folder_id END,
                'uploadedAt', x.uploaded_at, 'uploadedBy', x.uploaded_by_name, 'deletedAt', x.deleted_at,
                'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                             ORDER BY e.created_at, e.id), '[]'::jsonb)
                             FROM public.hr_drive_file_events e WHERE e.file_id = x.id)
              ) ORDER BY lower(x.file_name), x.uploaded_at), '[]'::jsonb)
              FROM public.hr_drive_files x)
  );
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive() TO authenticated;

-- A Data center file's object, for a signed link made at the click — never a deleted one's.
CREATE OR REPLACE FUNCTION public.hr_drive_file(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.hr_drive_files%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.hr_drive_files WHERE id = p_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'That file is no longer here' USING ERRCODE = '22023';
  END IF;
  IF v.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Its file was deleted with it.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('path', v.file_path, 'fileName', v.file_name, 'contentType', v.content_type);
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_file(uuid) TO authenticated;

-- HR viewed or downloaded one: a line on its trail.
CREATE OR REPLACE FUNCTION public.hr_drive_log(p_id uuid, p_what text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  IF p_what IS DISTINCT FROM 'Viewed' AND p_what IS DISTINCT FROM 'Downloaded' THEN
    RAISE EXCEPTION 'Only a view or a download is logged here' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  SELECT f.id, p_what, auth.uid(), public.hr_doc_actor_name() FROM public.hr_drive_files f WHERE f.id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_log(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_log(uuid, text) TO authenticated;

-- ── 5. Folders ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_drive_folder_add(p_parent text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_place record;
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Making a folder needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023';
  END IF;
  IF v_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF public.hr_drive_name_taken(v_place.kind, v_place.dept, v_place.folder, v_name, NULL) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_folders (name, parent_kind, parent_dept_id, parent_folder_id, created_by, created_by_name)
  VALUES (v_name, v_place.kind, v_place.dept, v_place.folder, auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_folder_add(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_folder_add(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_drive_folder_rename(p_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.hr_drive_folders%ROWTYPE;
  v_name text := trim(coalesce(p_name, ''));
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Renaming a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the folder.' USING ERRCODE = '22023';
  END IF;
  IF v_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'A folder''s name cannot hold a slash.' USING ERRCODE = '22023';
  END IF;
  IF public.hr_drive_name_taken(v.parent_kind, v.parent_dept_id, v.parent_folder_id, v_name, v.id) THEN
    RAISE EXCEPTION '% is here already.', v_name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET name = v_name WHERE id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_folder_rename(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_folder_rename(uuid, text) TO authenticated;

-- Only an empty folder goes: nothing live in it, no folder, no file.
CREATE OR REPLACE FUNCTION public.hr_drive_folder_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting a folder needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.hr_drive_folders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That folder is not there any more.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_folders f WHERE f.parent_folder_id = p_id AND f.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.parent_folder_id = p_id AND x.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Empty it first.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_drive_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_folder_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_folder_delete(uuid) TO authenticated;

-- ── 6. Files ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_drive_file_add(p_parent text, p_path text, p_file_name text, p_content_type text, p_size bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_place record;
  v_id uuid;
  v_where text;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.create']) THEN
    RAISE EXCEPTION 'Uploading a file needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_place FROM public.hr_drive_place(p_parent);
  IF NOT public.hr_doc_file_present(p_path, 'drive') THEN
    RAISE EXCEPTION 'The file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_drive_files x WHERE x.file_path = p_path) THEN
    RAISE EXCEPTION 'That file is filed already.' USING ERRCODE = '22023';
  END IF;
  v_where := CASE v_place.kind
    WHEN 'root' THEN 'Data center'
    WHEN 'company' THEN 'HOUZS Venture'
    WHEN 'dept' THEN (SELECT regexp_replace(d.name, '\s+Department$', '', 'i') FROM public.departments d WHERE d.id = v_place.dept)
    ELSE (SELECT f.name FROM public.hr_drive_folders f WHERE f.id = v_place.folder) END;
  INSERT INTO public.hr_drive_files (parent_kind, parent_dept_id, parent_folder_id, file_path, file_name, content_type, file_size,
      uploaded_by, uploaded_by_name)
  VALUES (v_place.kind, v_place.dept, v_place.folder, p_path, left(coalesce(nullif(trim(p_file_name), ''), 'file'), 200),
      p_content_type, p_size, auth.uid(), public.hr_doc_actor_name())
  RETURNING id INTO v_id;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name, note)
  VALUES (v_id, 'Uploaded', auth.uid(), public.hr_doc_actor_name(), 'Into ' || coalesce(v_where, 'the Data center'));
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_file_add(text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_file_add(text, text, text, text, bigint) TO authenticated;

-- Deleted: its row and trail stay (greyed under "Show deleted"); its object is a leftover at once.
CREATE OR REPLACE FUNCTION public.hr_drive_file_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting a file needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hr_drive_files SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is already deleted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hr_drive_file_events (file_id, what, actor_id, actor_name)
  VALUES (p_id, 'Deleted', auth.uid(), public.hr_doc_actor_name());
END
$$;
REVOKE ALL ON FUNCTION public.hr_drive_file_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_drive_file_delete(uuid) TO authenticated;
