-- ============================================================================
-- 20261013061500_talent_bank_bin.sql
-- Hiring › Talent Bank: the Bin (2026-10-13 — the user, told that a file
-- deleted in the new Talent Bank was gone at once, with no bin as Google Drive
-- has: "make a bin, then that bin will last for 30 days. file that last for
-- more than 30days in bin, will auto delete").
-- ============================================================================
--
-- What is deleted in the Talent Bank waits in its Bin for 30 days first:
--
--   a file kept in a place     its ⋮ › Move to Bin       hiring_bank_files.deleted_at
--   a folder HR made           its ⋮ › Move to Bin       hiring_bank_folders.deleted_at (still
--                                                        only an empty one — what is in the
--                                                        Bin does not count)
--   a person                   Remove from Talent Bank   hiring_talents.removed_at — their
--                                                        files stay on them meanwhile
--   a file taken off a person  their page › Remove       the row moves into the Bin
--
-- `hiring_bank_bin` is the Bin: one row an item, who put it there and when.
-- Restore puts an item back where it was — what it was in comes back with it
-- when that is in the Bin too (a folder, the person) — and refuses a folder
-- whose name is taken there now. Delete forever and Empty bin delete at once;
-- after 30 days the hourly sweep does (`hiring_bank_bin_purge`, the service
-- role's — the member-queue cron, before Hiring's leftovers: an object the
-- purge frees is a leftover from then on, deleted through the Storage API in
-- the same run). Until then an item's object stays named — the bucket's
-- helpers learn the Bin — and is never a leftover.
--
-- A request's candidate's files are the request's, not the Talent Bank's:
-- taken off, they are deleted at once as before. Replace keeps only the new
-- file, as before.
--
-- As every Hiring table: RLS on, no policy, no grants; read through
-- hiring_bank() (View), written by the functions below (Edit), each asking the
-- Talent Bank's page first (`pg_temp.tab_guard`, as mig 20261011220100). The
-- production bodies changed are swapped one span each (read off pg_proc on
-- 2026-10-13: hiring_bank 7a8bbb7e…, hiring_bank_file_delete 71c62b65…,
-- hiring_bank_folder_delete 01849b5f…, hiring_bank_place ac3827fc…,
-- hiring_bank_locate caa59879…, hiring_bank_move_all 8fe5a7a0…, hiring_file_path 7bd86100…,
-- hiring_talent_remove cf89be87…, hiring_file_remove b5d532c6…,
-- hiring_file_in_use e47c0f5f…, hiring_leftovers 4e7b0cda…, hiring_orphaned
-- daec668c…, hiring_take_upload 94fff876…); the swap refuses if production
-- changed since.

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

-- The page's guard at the top of a body (mig 20261011220100's helpers, as they are).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_write_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks other pages — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

-- ── 1. The Bin ──────────────────────────────────────────────────────────────

-- A file kept in a place waits in the Bin as itself, its row marked.
ALTER TABLE public.hiring_bank_files
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);
COMMENT ON TABLE public.hiring_bank_files IS
  'Hiring › Talent Bank as a Drive: a file HR keeps in a place of the bank (hiring-files, files/<uuid>/<name>). Deleted to the Bin first (deleted_at, hiring_bank_bin); out of the Bin the row goes, then the object. Read through hiring_bank().';

CREATE TABLE public.hiring_bank_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('file', 'folder', 'talent', 'talent_file')),
  bank_file_id uuid REFERENCES public.hiring_bank_files(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.hiring_bank_folders(id) ON DELETE CASCADE,
  talent_id uuid REFERENCES public.hiring_talents(id) ON DELETE CASCADE,
  -- A file taken off a person, as it was on them: Restore files it on them again.
  file_type_id uuid REFERENCES public.hiring_file_types(id),
  path text CHECK (path IS NULL OR path ~ '^(files|resumes)/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$'),
  file_added_by_name text,
  file_added_by uuid REFERENCES public.users(id),
  file_added_at timestamptz,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES public.users(id),
  deleted_by_name text NOT NULL,
  CONSTRAINT hiring_bank_bin_item CHECK (
    (kind = 'file' AND bank_file_id IS NOT NULL AND folder_id IS NULL AND talent_id IS NULL AND path IS NULL)
    OR (kind = 'folder' AND folder_id IS NOT NULL AND bank_file_id IS NULL AND talent_id IS NULL AND path IS NULL)
    OR (kind = 'talent' AND talent_id IS NOT NULL AND bank_file_id IS NULL AND folder_id IS NULL AND path IS NULL)
    OR (kind = 'talent_file' AND talent_id IS NOT NULL AND path IS NOT NULL AND file_type_id IS NOT NULL
        AND file_added_by_name IS NOT NULL AND file_added_at IS NOT NULL AND bank_file_id IS NULL AND folder_id IS NULL))
);
CREATE UNIQUE INDEX hiring_bank_bin_file ON public.hiring_bank_bin (bank_file_id) WHERE bank_file_id IS NOT NULL;
CREATE UNIQUE INDEX hiring_bank_bin_folder ON public.hiring_bank_bin (folder_id) WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX hiring_bank_bin_talent ON public.hiring_bank_bin (talent_id) WHERE kind = 'talent';
CREATE INDEX hiring_bank_bin_talent_files ON public.hiring_bank_bin (talent_id) WHERE kind = 'talent_file';
CREATE INDEX hiring_bank_bin_path ON public.hiring_bank_bin (path) WHERE path IS NOT NULL;
CREATE INDEX hiring_bank_bin_age ON public.hiring_bank_bin (deleted_at);
ALTER TABLE public.hiring_bank_bin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hiring_bank_bin FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.hiring_bank_bin IS
  'Hiring › Talent Bank: the Bin — a file, a folder, a person or a person''s file deleted in the bank, kept 30 days (Restore, Delete forever, Empty bin; the hourly sweep deletes what is older). Read through hiring_bank().';

SELECT public.audit_register('hiring_bank_bin', 'Talent Bank bin', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');

-- How long the Bin keeps what is deleted (the user: 30 days).
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_keeps()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT interval '30 days' $$;

-- What was deleted in the last 30 days before the Bin is in it: a folder HR deleted (the only thing the bank deleted
-- softly), a person removed (their files went then — they come back without them).
INSERT INTO public.hiring_bank_bin (kind, folder_id, name, deleted_at, deleted_by, deleted_by_name)
SELECT 'folder', f.id, f.name, f.deleted_at, f.deleted_by,
       coalesce((SELECT nullif(btrim(s.employee_name), '') FROM public.hr_staff_costs s WHERE s.user_id = f.deleted_by
                  ORDER BY s.status = 'active' DESC LIMIT 1),
                (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = f.deleted_by), 'HR')
  FROM public.hiring_bank_folders f
 WHERE f.deleted_at > now() - public.hiring_bank_bin_keeps();
INSERT INTO public.hiring_bank_bin (kind, talent_id, name, deleted_at, deleted_by, deleted_by_name)
SELECT 'talent', t.id, t.name, t.removed_at, t.removed_by,
       coalesce((SELECT nullif(btrim(s.employee_name), '') FROM public.hr_staff_costs s WHERE s.user_id = t.removed_by
                  ORDER BY s.status = 'active' DESC LIMIT 1),
                (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = t.removed_by), 'HR')
  FROM public.hiring_talents t
 WHERE t.removed_at > now() - public.hiring_bank_bin_keeps();

-- ── 2. Helpers (only the functions below call them) ─────────────────────────

-- A folder in the Bin back where it was — what it was in first, when that is in the Bin too. False when it is gone for
-- good (deleted before the Bin, or its 30 days over): what was in it then goes to the top of the bank.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_reopen(p_folder uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.hiring_bank_folders%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.hiring_bank_folders WHERE id = p_folder FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF f.deleted_at IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.folder_id = p_folder
                  AND x.deleted_at > now() - public.hiring_bank_bin_keeps()) THEN
    RETURN false;
  END IF;
  IF f.parent_kind = 'folder' AND NOT public.hiring_bank_bin_reopen(f.parent_folder_id) THEN
    UPDATE public.hiring_bank_folders SET parent_kind = 'root', parent_sub_id = NULL, parent_dept = NULL, parent_folder_id = NULL
     WHERE id = p_folder RETURNING * INTO f;
  END IF;
  IF public.hiring_bank_name_taken(f.parent_kind, f.parent_sub_id, f.parent_dept, f.parent_folder_id, f.name, f.id) THEN
    RAISE EXCEPTION '% is there already — rename one first.', f.name USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_bank_folders SET deleted_at = NULL, deleted_by = NULL WHERE id = p_folder;
  DELETE FROM public.hiring_bank_bin WHERE folder_id = p_folder;
  RETURN true;
END
$$;

-- A person in the Bin back where they were — their folder with them when it is in the Bin too, HOUZS Venture when it
-- is gone. On their History as Restored from the Bin. False when they are not in the Bin.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_unremove(p_talent uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.hiring_talents%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.hiring_talents WHERE id = p_talent FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF t.removed_at IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.kind = 'talent' AND x.talent_id = p_talent
                  AND x.deleted_at > now() - public.hiring_bank_bin_keeps()) THEN
    RETURN false;
  END IF;
  IF t.place_kind = 'folder' AND NOT public.hiring_bank_bin_reopen(t.place_folder_id) THEN
    UPDATE public.hiring_talents SET place_kind = 'company', place_sub_id = NULL, place_dept = NULL, place_folder_id = NULL
     WHERE id = p_talent RETURNING * INTO t;
  END IF;
  UPDATE public.hiring_talents SET removed_at = NULL, removed_by = NULL WHERE id = p_talent;
  DELETE FROM public.hiring_bank_bin WHERE kind = 'talent' AND talent_id = p_talent;
  PERFORM public.hiring_talent_log(p_talent, 'Restored from the Bin',
    public.hiring_bank_label(t.place_kind, t.place_sub_id, t.place_dept, t.place_folder_id));
  RETURN true;
END
$$;

-- One item out of the Bin for good; answers the objects it named (the caller deletes those nobody else names). A file:
-- its row (the object then). A folder: its row once nothing names it. A person: their files — and their files in the
-- Bin on their own — their row staying, removed, for its history (as Remove did before the Bin). A person's file: its
-- object. `p_auto`: the 30 days are over (the hourly sweep), not a press.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_drop(p_bin uuid, p_auto boolean)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hiring_bank_bin%ROWTYPE;
  v_path text;
  v_paths text[] := '{}';
  v_note text;
BEGIN
  SELECT * INTO x FROM public.hiring_bank_bin WHERE id = p_bin FOR UPDATE;
  IF NOT FOUND THEN RETURN v_paths; END IF;
  IF x.kind = 'file' THEN
    -- The Bin's row goes with the file's (ON DELETE CASCADE).
    DELETE FROM public.hiring_bank_files WHERE id = x.bank_file_id RETURNING path INTO v_path;
    IF v_path IS NOT NULL THEN v_paths := ARRAY[v_path]; END IF;
  ELSIF x.kind = 'folder' THEN
    DELETE FROM public.hiring_bank_bin WHERE id = p_bin;
    DELETE FROM public.hiring_bank_folders f
     WHERE f.id = x.folder_id AND f.deleted_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_folders c WHERE c.parent_folder_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.place_folder_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.place_folder_id = f.id);
  ELSIF x.kind = 'talent' THEN
    WITH gone AS (DELETE FROM public.hiring_files hf WHERE hf.talent_id = x.talent_id RETURNING hf.path)
    SELECT coalesce(array_agg(gone.path), '{}') INTO v_paths FROM gone;
    WITH gone AS (DELETE FROM public.hiring_bank_bin y WHERE y.kind = 'talent_file' AND y.talent_id = x.talent_id RETURNING y.path)
    SELECT v_paths || coalesce(array_agg(gone.path), '{}') INTO v_paths FROM gone;
    DELETE FROM public.hiring_bank_bin WHERE id = p_bin;
    v_note := CASE cardinality(v_paths) WHEN 0 THEN '' WHEN 1 THEN '1 file deleted' ELSE cardinality(v_paths) || ' files deleted' END;
    IF p_auto THEN
      INSERT INTO public.hiring_talent_events (talent_id, what, actor_name, actor_id, note)
      VALUES (x.talent_id, 'Deleted from the Bin', 'Talent Bank', NULL, concat_ws(' · ', '30 days in the Bin', nullif(v_note, '')));
    ELSE
      PERFORM public.hiring_talent_log(x.talent_id, 'Deleted from the Bin', v_note);
    END IF;
  ELSE
    v_paths := ARRAY[x.path];
    DELETE FROM public.hiring_bank_bin WHERE id = p_bin;
  END IF;
  RETURN v_paths;
END
$$;

-- ── 3. The page's read: files out of the Bin, and the Bin ───────────────────

SELECT pg_temp.swap_check('public.hiring_bank()',
  $q$FROM public.hiring_bank_files b),$q$,
  $q$FROM public.hiring_bank_files b WHERE b.deleted_at IS NULL),$q$);

-- The Bin, newest first: each item, where it was (an address — the page names it, through a folder in the Bin too),
-- who deleted it and when, and when it goes for good.
SELECT pg_temp.swap_check('public.hiring_bank()',
  $q$FROM public.hiring_talents t WHERE t.removed_at IS NULL)
  );$q$,
  $q$FROM public.hiring_talents t WHERE t.removed_at IS NULL),
    'bin', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name,
              'at', CASE x.kind
                      WHEN 'file' THEN public.hiring_bank_at(xb.place_kind, xb.place_sub_id, xb.place_dept, xb.place_folder_id)
                      WHEN 'folder' THEN public.hiring_bank_at(xf.parent_kind, xf.parent_sub_id, xf.parent_dept, xf.parent_folder_id)
                      WHEN 'talent' THEN public.hiring_bank_at(xt.place_kind, xt.place_sub_id, xt.place_dept, xt.place_folder_id)
                    END,
              'folderId', x.folder_id, 'talentId', x.talent_id,
              'talentName', CASE WHEN x.kind = 'talent_file' THEN xt.name END,
              'fileType', xy.name, 'contentType', xb.content_type, 'size', xb.size,
              'deletedAt', x.deleted_at, 'deletedBy', x.deleted_by_name,
              'expiresAt', x.deleted_at + public.hiring_bank_bin_keeps()) ORDER BY x.deleted_at DESC, x.id), '[]'::jsonb)
            FROM public.hiring_bank_bin x
            LEFT JOIN public.hiring_bank_files xb ON xb.id = x.bank_file_id
            LEFT JOIN public.hiring_bank_folders xf ON xf.id = x.folder_id
            LEFT JOIN public.hiring_talents xt ON xt.id = x.talent_id
            LEFT JOIN public.hiring_file_types xy ON xy.id = x.file_type_id
           WHERE x.deleted_at > now() - public.hiring_bank_bin_keeps())
  );$q$);

-- A file in the Bin is no longer opened from the bank.
SELECT pg_temp.swap_check('public.hiring_file_path(text, text)',
  $q$SELECT b.path, b.name INTO v_path, v_name FROM public.hiring_bank_files b WHERE b.id::text = p_id;$q$,
  $q$SELECT b.path, b.name INTO v_path, v_name FROM public.hiring_bank_files b WHERE b.id::text = p_id AND b.deleted_at IS NULL;$q$);

-- ── 4. Deleting goes to the Bin ─────────────────────────────────────────────

-- A file's ⋮ › Move to Bin: its row marked and listed in the Bin; the object stays.
SELECT pg_temp.swap_check('public.hiring_bank_file_delete(uuid)',
  $q$DELETE FROM public.hiring_bank_files WHERE id = p_id RETURNING path INTO v_path;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(ARRAY[v_path])));$q$,
  $q$UPDATE public.hiring_bank_files SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_id AND deleted_at IS NULL RETURNING path INTO v_path;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'That file is not there any more.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_bank_bin (kind, bank_file_id, name, deleted_by, deleted_by_name)
  SELECT 'file', b.id, b.name, auth.uid(), public.hiring_actor_name() FROM public.hiring_bank_files b WHERE b.id = p_id;
  RETURN jsonb_build_object('orphans', '[]'::jsonb);$q$);

-- A folder's ⋮ › Move to Bin: still only an empty one — what is in the Bin does not count — and listed in the Bin.
SELECT pg_temp.swap_check('public.hiring_bank_folder_delete(uuid)',
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.place_folder_id = p_id) THEN$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.place_folder_id = p_id AND b.deleted_at IS NULL) THEN$q$);
SELECT pg_temp.swap_check('public.hiring_bank_folder_delete(uuid)',
  $q$UPDATE public.hiring_bank_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;$q$,
  $q$UPDATE public.hiring_bank_folders SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
  INSERT INTO public.hiring_bank_bin (kind, folder_id, name, deleted_by, deleted_by_name)
  SELECT 'folder', f.id, f.name, auth.uid(), public.hiring_actor_name() FROM public.hiring_bank_folders f WHERE f.id = p_id;$q$);

-- Remove from Talent Bank: they go to the Bin with their files (kept on them until the Bin lets them go).
SELECT pg_temp.swap_check('public.hiring_talent_remove(uuid)',
  $q$WITH gone AS (DELETE FROM public.hiring_files f WHERE f.talent_id = p_talent RETURNING f.path)
  SELECT coalesce(array_agg(path), '{}') INTO v_gone FROM gone;
  UPDATE public.hiring_talents SET removed_at = now(), removed_by = auth.uid() WHERE id = p_talent AND removed_at IS NULL;
  IF FOUND THEN
    PERFORM public.hiring_talent_log(p_talent, 'Removed from Talent Bank',
      CASE cardinality(v_gone) WHEN 0 THEN '' WHEN 1 THEN '1 file deleted' ELSE cardinality(v_gone) || ' files deleted' END);
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(v_gone)));$q$,
  $q$UPDATE public.hiring_talents SET removed_at = now(), removed_by = auth.uid() WHERE id = p_talent AND removed_at IS NULL;
  IF FOUND THEN
    INSERT INTO public.hiring_bank_bin (kind, talent_id, name, deleted_by, deleted_by_name)
    SELECT 'talent', t.id, t.name, auth.uid(), public.hiring_actor_name() FROM public.hiring_talents t WHERE t.id = p_talent;
    PERFORM public.hiring_talent_log(p_talent, 'Removed from Talent Bank', 'In the Bin for 30 days');
  END IF;
  RETURN jsonb_build_object('orphans', '[]'::jsonb);$q$);

-- A file taken off a person (their page › Remove) goes to the Bin, as it was on them; a candidate's is deleted as before.
SELECT pg_temp.swap_check('public.hiring_file_remove(uuid)',
  $q$ELSE
    PERFORM public.hiring_talent_log(v_f.talent_id, 'File removed', v_type || ' · ' || v_f.name);
  END IF;$q$,
  $q$ELSE
    INSERT INTO public.hiring_bank_bin (kind, talent_id, file_type_id, path, file_added_by_name, file_added_by, file_added_at, name,
      deleted_by, deleted_by_name)
    VALUES ('talent_file', v_f.talent_id, v_f.type_id, v_f.path, v_f.added_by_name, v_f.added_by, v_f.added_at, v_f.name,
      auth.uid(), public.hiring_actor_name());
    PERFORM public.hiring_talent_log(v_f.talent_id, 'File removed', v_type || ' · ' || v_f.name || ' · in the Bin for 30 days');
  END IF;$q$);

-- ── 5. What is in the Bin is not where it was ───────────────────────────────

-- A department nobody lists stays while something is in it — not a file in the Bin.
SELECT pg_temp.swap_check('public.hiring_bank_place(text)',
  $q$AND lower(b.place_dept) = lower(v_name)) THEN$q$,
  $q$AND lower(b.place_dept) = lower(v_name) AND b.deleted_at IS NULL) THEN$q$);

-- …nor does it take the next person saved for it.
SELECT pg_temp.swap_check('public.hiring_bank_locate(text, text, uuid)',
  $q$WHERE b.place_kind = 'dept' AND b.place_sub_id IS NOT DISTINCT FROM sub AND lower(b.place_dept) = lower(v_dept)$q$,
  $q$WHERE b.place_kind = 'dept' AND b.place_sub_id IS NOT DISTINCT FROM sub AND lower(b.place_dept) = lower(v_dept) AND b.deleted_at IS NULL$q$);

-- Move everyone to… takes what is in the department, not what is in the Bin from it (that comes back there).
SELECT pg_temp.swap_check('public.hiring_bank_move_all(text, text)',
  $q$WHERE place_kind = 'dept' AND place_sub_id IS NOT DISTINCT FROM s.sub AND lower(place_dept) = lower(s.dept);$q$,
  $q$WHERE deleted_at IS NULL AND place_kind = 'dept' AND place_sub_id IS NOT DISTINCT FROM s.sub AND lower(place_dept) = lower(s.dept);$q$);

-- ── 6. The bucket knows the Bin holds its objects ───────────────────────────

SELECT pg_temp.swap_check('public.hiring_file_in_use(text)',
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path);$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path)
      OR EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.path = p_path);$q$);

SELECT pg_temp.swap_check('public.hiring_leftovers(integer)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = o.name)$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = o.name)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.path = o.name)$q$);

SELECT pg_temp.swap_check('public.hiring_orphaned(text[])',
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p)$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.path = p)$q$);

SELECT pg_temp.swap_check('public.hiring_take_upload(text)',
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path) THEN$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hiring_bank_files b WHERE b.path = p_path)
     OR EXISTS (SELECT 1 FROM public.hiring_bank_bin x WHERE x.path = p_path) THEN$q$);

-- ── 7. The Bin's own writes ─────────────────────────────────────────────────

-- Bin › Restore (Edit): back where it was. Answers what it was and where it is now, in words.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_restore(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x public.hiring_bank_bin%ROWTYPE;
  b public.hiring_bank_files%ROWTYPE;
  v_label text;
  v_type text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO x FROM public.hiring_bank_bin WHERE id = p_bin FOR UPDATE;
  IF NOT FOUND OR x.deleted_at <= now() - public.hiring_bank_bin_keeps() THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  IF x.kind = 'folder' THEN
    IF NOT public.hiring_bank_bin_reopen(x.folder_id) THEN
      RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
    END IF;
    SELECT public.hiring_bank_label(f.parent_kind, f.parent_sub_id, f.parent_dept, f.parent_folder_id) INTO v_label
      FROM public.hiring_bank_folders f WHERE f.id = x.folder_id;
  ELSIF x.kind = 'file' THEN
    SELECT * INTO b FROM public.hiring_bank_files WHERE id = x.bank_file_id FOR UPDATE;
    IF b.place_kind = 'folder' AND NOT public.hiring_bank_bin_reopen(b.place_folder_id) THEN
      b.place_kind := 'root';
      b.place_folder_id := NULL;
    END IF;
    UPDATE public.hiring_bank_files SET deleted_at = NULL, deleted_by = NULL, place_kind = b.place_kind, place_folder_id = b.place_folder_id
     WHERE id = b.id;
    DELETE FROM public.hiring_bank_bin WHERE id = p_bin;
    v_label := public.hiring_bank_label(b.place_kind, b.place_sub_id, b.place_dept, b.place_folder_id);
  ELSIF x.kind = 'talent' THEN
    IF NOT public.hiring_bank_bin_unremove(x.talent_id) THEN
      RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
    END IF;
    SELECT public.hiring_bank_label(t.place_kind, t.place_sub_id, t.place_dept, t.place_folder_id) INTO v_label
      FROM public.hiring_talents t WHERE t.id = x.talent_id;
  ELSE
    -- A person's file goes back on them — the person with it when they are in the Bin too.
    IF NOT public.hiring_bank_bin_unremove(x.talent_id) THEN
      RAISE EXCEPTION '% is not in the Talent Bank any more.', (SELECT t.name FROM public.hiring_talents t WHERE t.id = x.talent_id)
        USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.hiring_files f WHERE f.talent_id = x.talent_id) >= 20 THEN
      RAISE EXCEPTION 'Up to 20 files each.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.hiring_files (talent_id, type_id, path, name, added_by_name, added_by, added_at)
    VALUES (x.talent_id, x.file_type_id, x.path, x.name, x.file_added_by_name, x.file_added_by, x.file_added_at);
    DELETE FROM public.hiring_bank_bin WHERE id = p_bin;
    SELECT t.name INTO v_type FROM public.hiring_file_types t WHERE t.id = x.file_type_id;
    PERFORM public.hiring_talent_log(x.talent_id, 'File restored', coalesce(v_type, 'File') || ' · ' || x.name);
    SELECT t.name INTO v_label FROM public.hiring_talents t WHERE t.id = x.talent_id;
  END IF;
  RETURN jsonb_build_object('kind', x.kind, 'name', x.name, 'label', coalesce(v_label, 'Talent Bank'));
END
$$;

-- Bin › Delete forever (Edit): out of the Bin now. Answers the objects nobody else names, for the caller to delete.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_delete(p_bin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[];
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hiring_bank_bin WHERE id = p_bin) THEN
    RAISE EXCEPTION 'That is not in the Bin any more.' USING ERRCODE = '22023';
  END IF;
  -- Two statements: hiring_orphaned is STABLE, and in one with the drop it would read the rows from before it.
  v_paths := public.hiring_bank_bin_drop(p_bin, false);
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(v_paths)));
END
$$;

-- Bin › Empty bin (Edit): everything in it, now — a person's own files before the person. Answers how many and the
-- objects nobody else names.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_empty()
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
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT x.id FROM public.hiring_bank_bin x ORDER BY x.kind = 'talent', x.deleted_at, x.id LOOP
    IF EXISTS (SELECT 1 FROM public.hiring_bank_bin WHERE id = r.id) THEN
      v_paths := v_paths || public.hiring_bank_bin_drop(r.id, false);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('count', v_n, 'orphans', to_jsonb(public.hiring_orphaned(v_paths)));
END
$$;

-- The hourly sweep (api/member-queue, the service role): what has been in the Bin 30 days goes for good, at most
-- p_limit a run. The objects it frees are leftovers from then on — the same run's leftover sweep deletes them.
CREATE OR REPLACE FUNCTION public.hiring_bank_bin_purge(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN SELECT x.id FROM public.hiring_bank_bin x
            WHERE x.deleted_at <= now() - public.hiring_bank_bin_keeps()
            ORDER BY x.kind = 'talent', x.deleted_at, x.id
            LIMIT greatest(1, least(coalesce(p_limit, 200), 1000)) LOOP
    IF EXISTS (SELECT 1 FROM public.hiring_bank_bin WHERE id = r.id) THEN
      PERFORM public.hiring_bank_bin_drop(r.id, true);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END
$$;

-- ── 8. Who may call them ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hiring_bank_bin_keeps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_reopen(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_unremove(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_drop(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_purge(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_bank_bin_keeps(), public.hiring_bank_bin_reopen(uuid), public.hiring_bank_bin_unremove(uuid),
  public.hiring_bank_bin_drop(uuid, boolean), public.hiring_bank_bin_purge(integer) TO service_role;

REVOKE ALL ON FUNCTION public.hiring_bank_bin_restore(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_bin_empty() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_bank_bin_restore(uuid), public.hiring_bank_bin_delete(uuid), public.hiring_bank_bin_empty()
  TO authenticated;

-- ── 9. Each write asks the Talent Bank's page first (as mig 20261011220100's) ──

SELECT pg_temp.tab_guard('public.hiring_bank_bin_restore(uuid)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_bin_delete(uuid)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_bank_bin_empty()',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.hiring_bank_bin_restore(uuid)', 'public.hiring_bank_bin_delete(uuid)', 'public.hiring_bank_bin_empty()'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: a signed-in reader may not call it', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.hiring_bank_bin_purge(integer)', 'public.hiring_bank_bin_drop(uuid, boolean)',
                              'public.hiring_bank_bin_reopen(uuid)', 'public.hiring_bank_bin_unremove(uuid)'] LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: open to sessions', v_fn;
    END IF;
  END LOOP;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_file_in_use(text)'::regprocedure), 'hiring_bank_bin') = 0
     OR strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_leftovers(integer)'::regprocedure), 'hiring_bank_bin') = 0 THEN
    RAISE EXCEPTION 'the bucket''s helpers do not know the Bin holds its objects';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_talent_remove(uuid)'::regprocedure), 'DELETE FROM public.hiring_files') > 0 THEN
    RAISE EXCEPTION 'hiring_talent_remove still deletes the files at once';
  END IF;
END
$guard$;
