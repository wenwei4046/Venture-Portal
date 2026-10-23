-- ============================================================================
-- 20261024007000_marketing_library.sql
-- Marketing ⑥-1 — the Library (`Library.dc.html` of the Claude Design handoff "HOUZS Marketing Module Setup"): each
-- subsidiary's folders — one of each folder type, the types shared by every subsidiary — their files in R2, link
-- folders (Google Drive …), every file under its folder type's category; search; move; the Dustbin, 30 days.
-- ============================================================================
--
-- Files live in R2 (portal-wide/storage.md › A NEW BUCKET): bucket `marketing`, in R2 from the start, ≤ 50 MB a file
-- (the user's answer: bigger files go in as a link folder). A file's bytes go up from the browser as every R2 bucket's
-- do (its `file_objects` row under the person's own session, then a presigned PUT); the Library's row is written after,
-- naming that row — so the Library lists only files that are there.
--
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_lib_types    folder types: name (unique, any case), colour, the category its files are under, a link type
--   mkt_lib_folders  a subsidiary's folder of a type (one of each, out of the Dustbin); a link folder's address
--   mkt_lib_files    a file in a folder: its name, its path in the bucket, size and type; binned or not
-- Functions (Marketing · View reads; Edit adds, moves, bins and restores; Manage deletes for good and makes types):
--   mkt_library()                         everything the page draws, the Dustbin's last 30 days with it
--   mkt_lib_type_add(name, colour, cat)   Manage — a new folder type, for every subsidiary
--   mkt_lib_folder_add(sub, type, url)    Edit — a subsidiary's folder of a type; a link type takes an https address
--   mkt_lib_file_add(folder, name, path)  Edit — the file the caller just put in the bucket, into a folder
--   mkt_lib_move(kind, id, to)            Edit — a file to another folder; a folder to another subsidiary
--   mkt_lib_bin(kind, id)                 Edit — to the Dustbin (a folder with its files)
--   mkt_lib_restore(kind, id)             Edit — out of it, where it was
--   mkt_lib_delete(kind, id)              Manage — gone for good: the rows, and the bytes' rows (R2's hourly sweep
--                                         takes the bytes no row names)
-- No clock (gap 16): what has been in the Dustbin 30 days goes with the next Library write.
-- PGlite: tests/member-sql/validate-marketing-library.mjs.

-- ── The bucket ─────────────────────────────────────────────────────────────────
INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('marketing', false, 52428800, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;

-- ── Tables ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_lib_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color      text NOT NULL CHECK (color ~ '^(oklch|rgb)\([0-9. /]+\)$'),
  cat        text NOT NULL CHECK (cat IN ('Brand', 'Product', 'Photo', 'Video', 'Content', 'Minutes')),
  link       boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_lib_types_name ON public.mkt_lib_types (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.mkt_lib_folders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.mkt_subsidiaries(id),
  type_id       uuid NOT NULL REFERENCES public.mkt_lib_types(id),
  url           text CHECK (url IS NULL OR (url ~ '^https://[^\s]+$' AND length(url) <= 1000)),
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  trashed_at    timestamptz,
  trashed_by    text
);
-- One folder of a type in a subsidiary — the handoff's "already here" — among those out of the Dustbin.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_lib_folders_one ON public.mkt_lib_folders (subsidiary_id, type_id) WHERE trashed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mkt_lib_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id  uuid NOT NULL REFERENCES public.mkt_lib_folders(id),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  path       text NOT NULL UNIQUE CHECK (path ~ '^library/[0-9a-f-]{36}/[^/]+$'),
  size       bigint NOT NULL CHECK (size >= 0),
  mime       text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.users(id),
  by_name    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  trashed_at timestamptz,
  trashed_by text
);
CREATE INDEX IF NOT EXISTS mkt_lib_files_folder ON public.mkt_lib_files (folder_id);

ALTER TABLE public.mkt_lib_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_lib_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_lib_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_lib_types, public.mkt_lib_folders, public.mkt_lib_files FROM anon, authenticated;

SELECT public.audit_register('mkt_lib_types', 'Marketing Library folder types', 'Marketing', '{marketing}', 'all',
  p_keys => '{name}', p_labels => '{name}');
SELECT public.audit_register('mkt_lib_folders', 'Marketing Library folders', 'Marketing', '{marketing}', 'all',
  p_keys => '{id}');
SELECT public.audit_register('mkt_lib_files', 'Marketing Library files', 'Marketing', '{marketing}', 'all',
  p_keys => '{path}', p_labels => '{name}');

-- The handoff's folder types, in its order — each one's files under the category its sample files carry.
INSERT INTO public.mkt_lib_types (name, color, cat, link, sort_order) VALUES
  ('Brandbook', 'oklch(0.55 0.12 300)', 'Brand', false, 1),
  ('Handbook', 'oklch(0.62 0.10 80)', 'Content', false, 2),
  ('Product info', 'oklch(0.50 0.08 175)', 'Product', false, 3),
  ('Product photos', 'oklch(0.58 0.12 50)', 'Photo', false, 4),
  ('Video library', 'oklch(0.48 0.04 240)', 'Video', false, 5),
  ('Meeting minutes', 'oklch(0.55 0.01 60)', 'Minutes', false, 6),
  ('Character library', 'oklch(0.55 0.12 340)', 'Content', false, 7),
  ('Reference book', 'oklch(0.52 0.09 260)', 'Content', false, 8),
  ('Campaign planning', 'oklch(0.58 0.10 30)', 'Content', false, 9),
  ('Storyboard', 'oklch(0.55 0.08 200)', 'Content', false, 10),
  ('Price lists', 'oklch(0.50 0.08 175)', 'Product', false, 11),
  ('Legal & contracts', 'oklch(0.45 0.02 60)', 'Content', false, 12),
  ('Raw footage', 'oklch(0.48 0.04 240)', 'Video', true, 13)
ON CONFLICT DO NOTHING;

-- ── The bucket's policies: Marketing's files, Marketing's to read; Edit puts them under library/; Manage deletes ──
-- A file put in but never filed (its Library row refused) is its sender's to take back.
CREATE OR REPLACE FUNCTION public.mkt_lib_unfiled(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM public.mkt_lib_files f WHERE f.path = p_name);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_unfiled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lib_unfiled(text) TO authenticated;

DROP POLICY IF EXISTS mkt_library_files_read ON public.file_objects;
CREATE POLICY mkt_library_files_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'marketing'::text) AND (SELECT public.has_any_action(ARRAY['marketing.view'::text])));
DROP POLICY IF EXISTS mkt_library_files_upload ON public.file_objects;
CREATE POLICY mkt_library_files_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'library'::text)
    AND (SELECT public.has_any_action(ARRAY['marketing.edit'::text])));
DROP POLICY IF EXISTS mkt_library_files_delete ON public.file_objects;
CREATE POLICY mkt_library_files_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'marketing'::text) AND ((SELECT public.has_any_action(ARRAY['marketing.manage'::text]))
    OR ((owner_id = ((SELECT auth.uid()))::text) AND public.mkt_lib_unfiled(name))));

-- ── Helpers (nobody's to call) ─────────────────────────────────────────────────
-- What has been in the Dustbin 30 days: its rows, and its bytes' rows — R2's hourly sweep takes the bytes.
CREATE OR REPLACE FUNCTION public.mkt_lib_purge()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cut timestamptz := now() - interval '30 days';
BEGIN
  WITH gone AS (
    DELETE FROM public.mkt_lib_files f
     WHERE f.trashed_at < v_cut
        OR f.folder_id IN (SELECT d.id FROM public.mkt_lib_folders d WHERE d.trashed_at < v_cut)
    RETURNING f.path)
  DELETE FROM public.file_objects o USING gone WHERE o.bucket_id = 'marketing' AND o.name = gone.path;
  DELETE FROM public.mkt_lib_folders WHERE trashed_at < v_cut;
END
$fn$;

-- A folder by its id, out of the Dustbin, with its type — or refused in words.
CREATE OR REPLACE FUNCTION public.mkt_lib_folder_of(p_folder uuid)
RETURNS public.mkt_lib_folders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f public.mkt_lib_folders;
BEGIN
  SELECT * INTO v_f FROM public.mkt_lib_folders WHERE id = p_folder FOR UPDATE;
  IF NOT FOUND OR v_f.trashed_at IS NOT NULL THEN
    RAISE EXCEPTION 'That folder is not there.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_f;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_lib_purge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_lib_folder_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_purge() TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_lib_folder_of(uuid) TO service_role;

-- ── What the page draws ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_library()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cut timestamptz := now() - interval '30 days';
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'types', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'cat', t.cat, 'link', t.link)
                                        ORDER BY t.sort_order, lower(t.name))
                         FROM public.mkt_lib_types t), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'emoji', s.emoji, 'dot', s.dot,
                                                          'client', s.company_id IS NULL)
                                       ORDER BY s.company_id IS NULL, s.sort_order, s.name)
                        FROM public.mkt_subsidiaries s WHERE s.active), '[]'::jsonb),
    'folders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'sub', d.subsidiary_id, 'type', d.type_id, 'url', d.url,
                                                             'at', d.updated_at) ORDER BY d.created_at)
                           FROM public.mkt_lib_folders d WHERE d.trashed_at IS NULL), '[]'::jsonb),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'folder', f.folder_id, 'name', f.name, 'path', f.path,
                                                           'size', f.size, 'mime', f.mime, 'by', f.by_name, 'at', f.created_at)
                                        ORDER BY f.created_at DESC)
                         FROM public.mkt_lib_files f JOIN public.mkt_lib_folders d ON d.id = f.folder_id
                        WHERE f.trashed_at IS NULL AND d.trashed_at IS NULL), '[]'::jsonb),
    -- The Dustbin: a folder binned (its files with it), or a file binned from a folder still there — the last 30 days.
    'trash', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'at' DESC) FROM (
        SELECT jsonb_build_object('kind', 'folder', 'id', d.id, 'name', t.name, 'sub', d.subsidiary_id, 'type', d.type_id,
                                  'n', (SELECT count(*) FROM public.mkt_lib_files f WHERE f.folder_id = d.id AND f.trashed_at IS NULL),
                                  'by', d.trashed_by, 'at', d.trashed_at) AS x
          FROM public.mkt_lib_folders d JOIN public.mkt_lib_types t ON t.id = d.type_id
         WHERE d.trashed_at >= v_cut
        UNION ALL
        SELECT jsonb_build_object('kind', 'file', 'id', f.id, 'name', f.name, 'sub', d.subsidiary_id, 'type', d.type_id,
                                  'size', f.size, 'by', f.trashed_by, 'at', f.trashed_at)
          FROM public.mkt_lib_files f JOIN public.mkt_lib_folders d ON d.id = f.folder_id
         WHERE f.trashed_at >= v_cut AND d.trashed_at IS NULL) bin), '[]'::jsonb));
END
$fn$;

-- ── A new folder type, for every subsidiary ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_type_add(p_name text, p_color text, p_cat text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_t    public.mkt_lib_types;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Folder types are the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name the folder type — at most 40 characters.' USING ERRCODE = '22023';
  END IF;
  -- The handoff's six colours for a new type.
  IF p_color IS NULL OR p_color NOT IN ('oklch(0.55 0.12 300)', 'oklch(0.58 0.12 50)', 'oklch(0.50 0.08 175)',
                                        'oklch(0.52 0.09 260)', 'oklch(0.62 0.10 80)', 'oklch(0.55 0.12 340)') THEN
    RAISE EXCEPTION 'Pick one of the six colours.' USING ERRCODE = '22023';
  END IF;
  IF p_cat IS NULL OR p_cat NOT IN ('Brand', 'Product', 'Photo', 'Video', 'Content', 'Minutes') THEN
    RAISE EXCEPTION 'Pick its files'' category.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_lib_types t WHERE lower(btrim(t.name)) = lower(v_name)) THEN
    RAISE EXCEPTION '"%" is a folder type already.', v_name USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.mkt_lib_types (name, color, cat, sort_order, created_by)
  VALUES (v_name, p_color, p_cat, 100, auth.uid())
  RETURNING * INTO v_t;
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', v_t.id, 'name', v_t.name, 'color', v_t.color, 'cat', v_t.cat, 'link', v_t.link);
END
$fn$;

-- ── A subsidiary's folder of a type ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_folder_add(p_sub uuid, p_type uuid, p_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s   public.mkt_subsidiaries;
  v_t   public.mkt_lib_types;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_id  uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Adding to the Library is not open to your account.');
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_sub AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subsidiary is not on the list.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_t FROM public.mkt_lib_types WHERE id = p_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That folder type is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_t.link AND (v_url IS NULL OR v_url !~ '^https://[^\s]+$' OR length(v_url) > 1000) THEN
    RAISE EXCEPTION 'Paste the folder''s link — https://…' USING ERRCODE = '22023';
  END IF;
  IF NOT v_t.link THEN
    v_url := NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_lib_folders d WHERE d.subsidiary_id = v_s.id AND d.type_id = v_t.id AND d.trashed_at IS NULL) THEN
    RAISE EXCEPTION '% has a % folder already.', v_s.name, v_t.name USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.mkt_lib_folders (subsidiary_id, type_id, url, created_by)
  VALUES (v_s.id, v_t.id, v_url, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', v_id);
END
$fn$;

-- ── A file just put in the bucket, into a folder ────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_file_add(p_folder uuid, p_name text, p_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f    public.mkt_lib_folders;
  v_link boolean;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_o    public.file_objects;
  v_id   uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Adding to the Library is not open to your account.');
  v_f := public.mkt_lib_folder_of(p_folder);
  SELECT t.link INTO v_link FROM public.mkt_lib_types t WHERE t.id = v_f.type_id;
  IF v_link THEN
    RAISE EXCEPTION 'A link folder keeps its files where it points.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Name the file — at most 200 characters.' USING ERRCODE = '22023';
  END IF;
  -- The bytes' row: in the bucket, put there by this caller — the Library lists only what is there.
  SELECT * INTO v_o FROM public.file_objects o
   WHERE o.bucket_id = 'marketing' AND o.name = p_path AND o.owner_id = auth.uid()::text;
  IF NOT FOUND OR p_path !~ '^library/[0-9a-f-]{36}/[^/]+$' THEN
    RAISE EXCEPTION 'That file has not arrived — upload it again.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_lib_files x WHERE x.path = p_path) THEN
    RAISE EXCEPTION 'That file is in the Library already.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.mkt_lib_files (folder_id, name, path, size, mime, created_by, by_name)
  VALUES (v_f.id, v_name, p_path, coalesce((v_o.metadata ->> 'size')::bigint, 0), coalesce(v_o.metadata ->> 'mimetype', ''),
          auth.uid(), public.mkt_actor())
  RETURNING id INTO v_id;
  UPDATE public.mkt_lib_folders SET updated_at = now() WHERE id = v_f.id;
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', v_id);
END
$fn$;

-- ── A file to another folder; a folder to another subsidiary ───────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_move(p_kind text, p_id uuid, p_to uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_file public.mkt_lib_files;
  v_f    public.mkt_lib_folders;
  v_to   public.mkt_lib_folders;
  v_s    public.mkt_subsidiaries;
  v_link boolean;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing the Library is not open to your account.');
  IF p_kind = 'file' THEN
    SELECT * INTO v_file FROM public.mkt_lib_files WHERE id = p_id AND trashed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That file is not there.' USING ERRCODE = 'P0002';
    END IF;
    v_f := public.mkt_lib_folder_of(v_file.folder_id);
    v_to := public.mkt_lib_folder_of(p_to);
    SELECT t.link INTO v_link FROM public.mkt_lib_types t WHERE t.id = v_to.type_id;
    IF v_link THEN
      RAISE EXCEPTION 'A link folder keeps its files where it points.' USING ERRCODE = '22023';
    END IF;
    IF v_to.id <> v_f.id THEN
      UPDATE public.mkt_lib_files SET folder_id = v_to.id WHERE id = v_file.id;
      UPDATE public.mkt_lib_folders SET updated_at = now() WHERE id IN (v_f.id, v_to.id);
    END IF;
  ELSIF p_kind = 'folder' THEN
    v_f := public.mkt_lib_folder_of(p_id);
    SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_to AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That subsidiary is not on the list.' USING ERRCODE = 'P0002';
    END IF;
    IF v_s.id <> v_f.subsidiary_id THEN
      IF EXISTS (SELECT 1 FROM public.mkt_lib_folders d WHERE d.subsidiary_id = v_s.id AND d.type_id = v_f.type_id AND d.trashed_at IS NULL) THEN
        RAISE EXCEPTION '% has a % folder already.', v_s.name, (SELECT t.name FROM public.mkt_lib_types t WHERE t.id = v_f.type_id)
          USING ERRCODE = '23505';
      END IF;
      UPDATE public.mkt_lib_folders SET subsidiary_id = v_s.id, updated_at = now() WHERE id = v_f.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Move a file or a folder.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', p_id);
END
$fn$;

-- ── To the Dustbin; out of it; gone for good ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_bin(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_file public.mkt_lib_files;
  v_f    public.mkt_lib_folders;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing the Library is not open to your account.');
  IF p_kind = 'file' THEN
    SELECT * INTO v_file FROM public.mkt_lib_files WHERE id = p_id AND trashed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That file is not there.' USING ERRCODE = 'P0002';
    END IF;
    v_f := public.mkt_lib_folder_of(v_file.folder_id);
    UPDATE public.mkt_lib_files SET trashed_at = now(), trashed_by = public.mkt_actor() WHERE id = v_file.id;
    UPDATE public.mkt_lib_folders SET updated_at = now() WHERE id = v_f.id;
  ELSIF p_kind = 'folder' THEN
    v_f := public.mkt_lib_folder_of(p_id);
    UPDATE public.mkt_lib_folders SET trashed_at = now(), trashed_by = public.mkt_actor() WHERE id = v_f.id;
  ELSE
    RAISE EXCEPTION 'Bin a file or a folder.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', p_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_lib_restore(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_file public.mkt_lib_files;
  v_f    public.mkt_lib_folders;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing the Library is not open to your account.');
  PERFORM public.mkt_lib_purge();
  IF p_kind = 'file' THEN
    SELECT * INTO v_file FROM public.mkt_lib_files WHERE id = p_id AND trashed_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That is not in the Dustbin.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_f FROM public.mkt_lib_folders WHERE id = v_file.folder_id;
    IF v_f.trashed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Its folder is in the Dustbin — restore the folder.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_lib_files SET trashed_at = NULL, trashed_by = NULL WHERE id = v_file.id;
    UPDATE public.mkt_lib_folders SET updated_at = now() WHERE id = v_f.id;
  ELSIF p_kind = 'folder' THEN
    SELECT * INTO v_f FROM public.mkt_lib_folders WHERE id = p_id AND trashed_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That is not in the Dustbin.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mkt_lib_folders d WHERE d.subsidiary_id = v_f.subsidiary_id AND d.type_id = v_f.type_id
                                                         AND d.trashed_at IS NULL) THEN
      RAISE EXCEPTION '% has a new % folder — move or bin it first.',
        (SELECT s.name FROM public.mkt_subsidiaries s WHERE s.id = v_f.subsidiary_id),
        (SELECT t.name FROM public.mkt_lib_types t WHERE t.id = v_f.type_id) USING ERRCODE = '23505';
    END IF;
    UPDATE public.mkt_lib_folders SET trashed_at = NULL, trashed_by = NULL, updated_at = now() WHERE id = v_f.id;
  ELSE
    RAISE EXCEPTION 'Restore a file or a folder.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', p_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_lib_delete(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_paths text[];
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Deleting for good is the manager''s.');
  IF p_kind = 'file' THEN
    DELETE FROM public.mkt_lib_files WHERE id = p_id AND trashed_at IS NOT NULL RETURNING ARRAY[path] INTO v_paths;
  ELSIF p_kind = 'folder' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mkt_lib_folders WHERE id = p_id AND trashed_at IS NOT NULL) THEN
      v_paths := NULL;
    ELSE
      WITH gone AS (DELETE FROM public.mkt_lib_files WHERE folder_id = p_id RETURNING path)
      SELECT coalesce(array_agg(path), '{}') INTO v_paths FROM gone;
      DELETE FROM public.mkt_lib_folders WHERE id = p_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Delete a file or a folder.' USING ERRCODE = '22023';
  END IF;
  IF v_paths IS NULL THEN
    RAISE EXCEPTION 'Only what is in the Dustbin is deleted for good.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.file_objects WHERE bucket_id = 'marketing' AND name = ANY (v_paths);
  PERFORM public.mkt_lib_purge();
  RETURN jsonb_build_object('id', p_id, 'files', coalesce(array_length(v_paths, 1), 0));
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_library() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_type_add(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_folder_add(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_file_add(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_move(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_bin(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_restore(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_lib_delete(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_library() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_type_add(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_folder_add(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_file_add(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_move(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_bin(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_restore(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_delete(text, uuid) TO authenticated;

-- ── The page in the database's copy of the tab registry (the Projects tab, as Subsidiaries) ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/library', 'mkt.projects')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
