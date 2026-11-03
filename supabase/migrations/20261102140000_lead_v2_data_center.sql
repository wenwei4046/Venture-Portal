-- Lead View v2 › Data Center and the AI Agent's Knowledge (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2`
-- §7.10 / §7.12 — the user: "完全跟claude design 画的", "4-10 都照claude design").
--
-- 1. Folders: `lead_data_folders` — nested folders under a brand's own folder or Shared (brand_id NULL), each with an
--    optional colour (Rust · Green · Amber · Slate · Plum; NULL = Default). A brand's folder is the brand itself (a
--    root drawn from lead_brands, never a row). A file lives in a folder (`lead_data_files.folder_id`; NULL = right in its
--    brand's folder); its brand_id follows its folder. `category` stays, no longer written by the page.
-- 2. Versions: `lead_data_file_versions` — every upload of a file (v1, v2 …), who and when; Replace file adds one.
-- 3. Web links: a link is read by a brand or Shared, checked for changes every hour · day · week (`check_every`); Check
--    now keeps what the page said (`content`, `checked_at`, `pages_read`, `check_error` — lead_link_checked, Lead View ·
--    Manage), and the agent reads that text (lead_link_text).
-- 4. Knowledge: `lead_ai_knowledge` — what a brand's agent reads, picked on AI Agent › Knowledge: folders (everything in
--    them, as it changes), files and links of its brand's folder or Shared, each on or paused. Replaces lead_ai_sources
--    (copied over; the table stays, no longer written). lead_ai_more hands `knowledge`; lead_save_ai takes `knowledge`
--    when the page sends it (AI corrections' save sends none, so it leaves Knowledge alone).
-- 5. `lead_data_file_until` — a file's end date, set from the Data Center or AI Agent › Knowledge › History (Restore).
-- 6. lead_save_data_file also asks AI Agent's page: Knowledge › Add links takes a new web address, kept in the Data Center.
--
-- lead_data_file_json, lead_save_data_file, lead_remove_data_file, lead_ai_more and lead_save_ai are replaced from
-- PRODUCTION's bodies (md5 below). The new writes' page guards are in the _guards file.

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_data_file_json(public.lead_data_files)'::regprocedure) <> '419b0ce8a9265dce2dc289111dba9f5a' THEN
    RAISE EXCEPTION 'lead_data_file_json is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_save_data_file(uuid,jsonb)'::regprocedure) <> 'cd0f1d7f77b55d8548c3267c3cafdf7e' THEN
    RAISE EXCEPTION 'lead_save_data_file is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_remove_data_file(uuid)'::regprocedure) <> '70861acfc3c61b047c9f229b8aa6bf8b' THEN
    RAISE EXCEPTION 'lead_remove_data_file is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_ai_more(uuid)'::regprocedure) <> '1d99ad70ccfb20873222f9b85428fca5' THEN
    RAISE EXCEPTION 'lead_ai_more is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_save_ai(uuid,jsonb)'::regprocedure) <> 'd809a916bd4b5e7df55c6785cc1b8af5' THEN
    RAISE EXCEPTION 'lead_save_ai is not the body this migration was written from';
  END IF;
END
$guard$;

-- ── Tables ──

CREATE TABLE IF NOT EXISTS public.lead_data_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.lead_brands(id),
  parent_id uuid REFERENCES public.lead_data_folders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  color text CHECK (color IN ('rust', 'green', 'amber', 'slate', 'plum')),
  updated_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_data_folders_name ON public.lead_data_folders
  (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS lead_data_folders_parent ON public.lead_data_folders (parent_id);
ALTER TABLE public.lead_data_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_data_folders FROM anon, authenticated;
SELECT public.audit_register('lead_data_folders', 'Lead View Data Center folders', 'Member services', '{leads}', 'all', p_labels => '{name}');

ALTER TABLE public.lead_data_files
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.lead_data_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_every text NOT NULL DEFAULT 'day' CHECK (check_every IN ('hour', 'day', 'week')),
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS pages_read integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '' CHECK (length(content) <= 200000),
  ADD COLUMN IF NOT EXISTS check_error text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS lead_data_files_folder ON public.lead_data_files (folder_id) WHERE deleted_at IS NULL;
-- A link's check is no edit: the history keeps who changed a file, not each time a page was read.
SELECT public.audit_register('lead_data_files', 'Lead View Data Center files', 'Member services', '{leads}', 'all', p_labels => '{name}',
  p_ignore => '{checked_at,pages_read,content,check_error}', p_omit => '{content}');

CREATE TABLE IF NOT EXISTS public.lead_data_file_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES public.lead_data_files(id) ON DELETE CASCADE,
  ver integer NOT NULL,
  path text,
  mime text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,
  by_name text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, ver)
);
ALTER TABLE public.lead_data_file_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_data_file_versions FROM anon, authenticated;
SELECT public.audit_register('lead_data_file_versions', 'Lead View Data Center file versions', 'Member services', '{}', 'none',
  p_reason => 'A record already: each upload of a file, written with the file''s own audited save');
INSERT INTO public.lead_data_file_versions (file_id, ver, path, mime, size_bytes, by_name, at)
SELECT f.id, f.ver, f.path, f.mime, f.size_bytes, f.updated_by_name, f.updated_at FROM public.lead_data_files f
 WHERE f.kind = 'file' ON CONFLICT (file_id, ver) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lead_ai_knowledge (
  brand_id uuid NOT NULL REFERENCES public.lead_brands(id),
  kind text NOT NULL CHECK (kind IN ('folder', 'file', 'link')),
  ref uuid NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  added_by_name text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, kind, ref)
);
ALTER TABLE public.lead_ai_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ai_knowledge FROM anon, authenticated;
SELECT public.audit_register('lead_ai_knowledge', 'Lead View AI knowledge', 'Member services', '{leads}', 'all');
INSERT INTO public.lead_ai_knowledge (brand_id, kind, ref, paused, added_by_name, added_at)
SELECT s.brand_id, CASE WHEN f.kind = 'link' THEN 'link' ELSE 'file' END, s.file_id, s.paused, s.added_by_name, s.added_at
  FROM public.lead_ai_sources s JOIN public.lead_data_files f ON f.id = s.file_id
 ON CONFLICT DO NOTHING;

-- ── Helpers ──

-- A folder and every folder under it.
CREATE OR REPLACE FUNCTION public.lead_data_subtree(p_folder uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  WITH RECURSIVE t(id) AS (
    SELECT p_folder
    UNION
    SELECT d.id FROM public.lead_data_folders d JOIN t ON d.parent_id = t.id
  )
  SELECT coalesce(array_agg(id), '{}') FROM t WHERE id IS NOT NULL;
$fn$;

-- A folder and every folder above it.
CREATE OR REPLACE FUNCTION public.lead_data_chain(p_folder uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  WITH RECURSIVE t(id, parent_id, n) AS (
    SELECT d.id, d.parent_id, 0 FROM public.lead_data_folders d WHERE d.id = p_folder
    UNION ALL
    SELECT d.id, d.parent_id, t.n + 1 FROM public.lead_data_folders d JOIN t ON d.id = t.parent_id WHERE t.n < 50
  )
  SELECT coalesce(array_agg(id), '{}') FROM t;
$fn$;

REVOKE ALL ON FUNCTION public.lead_data_subtree(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_data_chain(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_data_subtree(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_data_chain(uuid) TO service_role;

-- Agents that can no longer read what moved: a brand's agent reads its own folder and Shared.
CREATE OR REPLACE FUNCTION public.lead_knowledge_tidy()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.lead_ai_knowledge k
   WHERE (k.kind = 'folder' AND NOT EXISTS (SELECT 1 FROM public.lead_data_folders d WHERE d.id = k.ref AND (d.brand_id IS NULL OR d.brand_id = k.brand_id)))
      OR (k.kind IN ('file', 'link') AND NOT EXISTS (SELECT 1 FROM public.lead_data_files f WHERE f.id = k.ref AND f.deleted_at IS NULL
                                                        AND (f.brand_id IS NULL OR f.brand_id = k.brand_id)));
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_knowledge_tidy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_knowledge_tidy() TO service_role;

-- ── The file's JSON (production's body + folder, link check, versions; usedBy from Knowledge) ──

CREATE OR REPLACE FUNCTION public.lead_data_file_json(f public.lead_data_files)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', f.id, 'brandId', f.brand_id, 'category', f.category, 'kind', f.kind, 'name', f.name, 'path', f.path,
    'url', f.url, 'mime', f.mime, 'sizeBytes', f.size_bytes, 'ver', f.ver, 'validFrom', f.valid_from, 'validUntil', f.valid_until,
    'status', f.status, 'updatedByName', f.updated_by_name, 'updatedAt', f.updated_at,
    'folderId', f.folder_id, 'checkEvery', f.check_every, 'checkedAt', f.checked_at, 'pagesRead', f.pages_read,
    'hasContent', f.content <> '', 'checkError', f.check_error,
    'versions', coalesce((SELECT jsonb_agg(jsonb_build_object('ver', v.ver, 'at', v.at, 'byName', v.by_name, 'sizeBytes', v.size_bytes) ORDER BY v.ver DESC)
                            FROM public.lead_data_file_versions v WHERE v.file_id = f.id), '[]'::jsonb),
    'usedBy', coalesce((SELECT jsonb_agg(jsonb_build_object('brandId', k.brand_id, 'paused', k.paused))
                          FROM public.lead_ai_knowledge k
                         WHERE (k.kind IN ('file', 'link') AND k.ref = f.id)
                            OR (k.kind = 'folder' AND f.folder_id IS NOT NULL AND k.ref = ANY (public.lead_data_chain(f.folder_id)))), '[]'::jsonb));
$function$;

-- ── Folders ──

CREATE OR REPLACE FUNCTION public.lead_data_folders()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'brandId', d.brand_id, 'parentId', d.parent_id, 'name', d.name,
                     'color', d.color, 'updatedAt', d.updated_at) ORDER BY lower(d.name)) FROM public.lead_data_folders d), '[]'::jsonb);
END
$fn$;

-- Add (p_id NULL), rename, colour or move a folder: {brandId, parentId, name, color}. Under a parent it takes the parent's
-- brand; a folder moved to another brand takes its folders and files along.
CREATE OR REPLACE FUNCTION public.lead_save_data_folder(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_color text := NULLIF(p_data->>'color', '');
  v_parent uuid := CASE WHEN p_data->>'parentId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_data->>'parentId')::uuid END;
  v_brand uuid := CASE WHEN p_data->>'brandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_data->>'brandId')::uuid END;
  v_actor text;
  v_id uuid;
  v_old uuid;
  v_tree uuid[];
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF v_name = '' OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'A folder needs a name (80 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_color IS NOT NULL AND v_color NOT IN ('rust', 'green', 'amber', 'slate', 'plum') THEN
    RAISE EXCEPTION 'That colour is not one of the folder colours.' USING ERRCODE = '22023';
  END IF;
  IF v_parent IS NOT NULL THEN
    SELECT brand_id INTO v_brand FROM public.lead_data_folders WHERE id = v_parent;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That folder is gone.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.lead_data_folders (brand_id, parent_id, name, color, updated_by_name)
      VALUES (v_brand, v_parent, v_name, v_color, v_actor) RETURNING id INTO v_id;
      RETURN v_id;
    END IF;
    SELECT brand_id INTO v_old FROM public.lead_data_folders WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That folder is gone.' USING ERRCODE = 'P0002';
    END IF;
    v_tree := public.lead_data_subtree(p_id);
    IF v_parent = ANY (v_tree) THEN
      RAISE EXCEPTION 'A folder cannot go inside itself.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.lead_data_folders d SET name = v_name, color = v_color, parent_id = v_parent, brand_id = v_brand,
           updated_by_name = v_actor, updated_at = now()
     WHERE d.id = p_id AND (d.name, d.color, d.parent_id, d.brand_id) IS DISTINCT FROM (v_name, v_color, v_parent, v_brand);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Another folder here already has that name.' USING ERRCODE = '23505';
  END;
  IF v_old IS DISTINCT FROM v_brand THEN
    UPDATE public.lead_data_folders SET brand_id = v_brand, updated_at = now() WHERE id = ANY (v_tree) AND id <> p_id;
    UPDATE public.lead_data_files SET brand_id = v_brand, updated_by_name = v_actor, updated_at = now()
     WHERE folder_id = ANY (v_tree) AND deleted_at IS NULL;
    PERFORM public.lead_knowledge_tidy();
  END IF;
  RETURN p_id;
END
$fn$;

-- Delete a folder, its folders and their files.
CREATE OR REPLACE FUNCTION public.lead_remove_data_folder(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tree uuid[];
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_data_folders WHERE id = p_id) THEN
    RAISE EXCEPTION 'That folder is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_tree := public.lead_data_subtree(p_id);
  UPDATE public.lead_data_files SET deleted_at = now(), folder_id = NULL, updated_by_name = public.lead_actor_name()
   WHERE folder_id = ANY (v_tree) AND deleted_at IS NULL;
  DELETE FROM public.lead_data_folders WHERE id = p_id;
  PERFORM public.lead_knowledge_tidy();
END
$fn$;

-- ── Files (production's save + folder, link check frequency, versions) ──

CREATE OR REPLACE FUNCTION public.lead_save_data_file(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text := coalesce(p_data->>'kind', 'file');
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_brand uuid := CASE WHEN p_data->>'brandId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_data->>'brandId')::uuid END;
  v_folder uuid := CASE WHEN p_data->>'folderId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_data->>'folderId')::uuid END;
  v_every text := coalesce(NULLIF(p_data->>'checkEvery', ''), 'day');
  v_path text := NULLIF(p_data->>'path', '');
  v_url text := NULLIF(btrim(coalesce(p_data->>'url', '')), '');
  v_from date := NULLIF(p_data->>'validFrom', '')::date;
  v_until date := NULLIF(p_data->>'validUntil', '')::date;
  v_id uuid;
  v_new boolean;
  f public.lead_data_files;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/knowledge', '/leads/ai'], ARRAY['leads.manage']);
  IF v_name = '' OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'A file needs a name (160 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('file', 'link') OR (v_kind = 'link' AND (v_url IS NULL OR v_url !~ '^https://')) THEN
    RAISE EXCEPTION 'A link is an https address.' USING ERRCODE = '22023';
  END IF;
  IF v_every NOT IN ('hour', 'day', 'week') THEN
    RAISE EXCEPTION 'A link is checked every hour, day or week.' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NOT NULL AND (v_path !~ '^files/[0-9a-f-]{36}/' OR NOT EXISTS (SELECT 1 FROM public.file_objects o WHERE o.bucket_id = 'lead-data' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'The file did not finish uploading — try again.' USING ERRCODE = '22023';
  END IF;
  IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_from > v_until THEN
    RAISE EXCEPTION 'A file ends before it starts.' USING ERRCODE = '22023';
  END IF;
  -- A file's brand is its folder's; a link sits in no folder.
  IF v_kind = 'link' THEN
    v_folder := NULL;
  ELSIF v_folder IS NOT NULL THEN
    SELECT brand_id INTO v_brand FROM public.lead_data_folders WHERE id = v_folder;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That folder is gone.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF p_id IS NULL THEN
    IF v_kind = 'file' AND v_path IS NULL THEN
      RAISE EXCEPTION 'Upload the file first.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lead_data_files (brand_id, folder_id, category, kind, name, path, url, mime, size_bytes, valid_from, valid_until, status, check_every, updated_by_name)
    VALUES (v_brand, v_folder, left(coalesce(p_data->>'category', ''), 40), v_kind, v_name, CASE WHEN v_kind = 'file' THEN v_path END, CASE WHEN v_kind = 'link' THEN v_url END,
            left(coalesce(p_data->>'mime', ''), 120), greatest(0, least(52428800, coalesce((p_data->>'sizeBytes')::bigint, 0))), v_from, v_until,
            CASE WHEN p_data->>'status' = 'paused' THEN 'paused' ELSE 'active' END, v_every, public.lead_actor_name())
    RETURNING * INTO f;
    IF v_kind = 'file' THEN
      INSERT INTO public.lead_data_file_versions (file_id, ver, path, mime, size_bytes, by_name) VALUES (f.id, f.ver, f.path, f.mime, f.size_bytes, f.updated_by_name);
    END IF;
    RETURN f.id;
  END IF;
  SELECT * INTO f FROM public.lead_data_files WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_new := f.kind = 'file' AND v_path IS NOT NULL AND v_path <> coalesce(f.path, '');
  UPDATE public.lead_data_files SET brand_id = v_brand, folder_id = CASE WHEN f.kind = 'file' THEN v_folder END,
         category = left(coalesce(p_data->>'category', ''), 40), name = v_name,
         path = CASE WHEN f.kind = 'file' THEN coalesce(v_path, f.path) END,
         url = CASE WHEN f.kind = 'link' THEN coalesce(v_url, f.url) END,
         mime = CASE WHEN v_new THEN left(coalesce(p_data->>'mime', ''), 120) ELSE f.mime END,
         size_bytes = CASE WHEN v_new THEN greatest(0, least(52428800, coalesce((p_data->>'sizeBytes')::bigint, 0))) ELSE f.size_bytes END,
         ver = CASE WHEN v_new THEN f.ver + 1 ELSE f.ver END,
         check_every = v_every,
         -- Another address is another page: what was read of the old one goes.
         content = CASE WHEN f.kind = 'link' AND v_url IS DISTINCT FROM f.url THEN '' ELSE f.content END,
         checked_at = CASE WHEN f.kind = 'link' AND v_url IS DISTINCT FROM f.url THEN NULL ELSE f.checked_at END,
         pages_read = CASE WHEN f.kind = 'link' AND v_url IS DISTINCT FROM f.url THEN 0 ELSE f.pages_read END,
         valid_from = v_from, valid_until = v_until, status = CASE WHEN p_data->>'status' = 'paused' THEN 'paused' ELSE 'active' END,
         updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = p_id
  RETURNING * INTO f;
  IF v_new THEN
    INSERT INTO public.lead_data_file_versions (file_id, ver, path, mime, size_bytes, by_name) VALUES (f.id, f.ver, f.path, f.mime, f.size_bytes, f.updated_by_name)
    ON CONFLICT (file_id, ver) DO NOTHING;
  END IF;
  -- A file moved out of a brand's folder leaves that brand's agent.
  PERFORM public.lead_knowledge_tidy();
  RETURN p_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.lead_remove_data_file(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/knowledge'], ARRAY['leads.manage']);
  DELETE FROM public.lead_ai_sources WHERE file_id = p_id;
  DELETE FROM public.lead_ai_knowledge WHERE kind IN ('file', 'link') AND ref = p_id;
  UPDATE public.lead_data_files SET deleted_at = now(), updated_by_name = public.lead_actor_name() WHERE id = p_id AND deleted_at IS NULL;
END
$function$;

-- A file's end date (Restore on AI Agent › Knowledge › History gives an expired file a new one and turns it back on).
CREATE OR REPLACE FUNCTION public.lead_data_file_until(p_id uuid, p_until date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  UPDATE public.lead_data_files SET valid_until = p_until, status = 'active', updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL AND (valid_from IS NULL OR p_until IS NULL OR valid_from <= p_until);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That file is gone, or it would end before it starts.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- ── Web links: what a check read ──

-- Check now: the page's words as the app read them (or why it could not). p_error '' = read.
CREATE OR REPLACE FUNCTION public.lead_link_checked(p_id uuid, p_content text, p_pages integer, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Data Center needs Lead View · Manage.');
  UPDATE public.lead_data_files
     SET content = CASE WHEN coalesce(p_error, '') = '' THEN left(coalesce(p_content, ''), 200000) ELSE content END,
         pages_read = CASE WHEN coalesce(p_error, '') = '' THEN greatest(0, least(1000, coalesce(p_pages, 1))) ELSE pages_read END,
         check_error = left(coalesce(p_error, ''), 300), checked_at = now()
   WHERE id = p_id AND kind = 'link' AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That link is gone.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- What the agent reads of these links: the words of their last check.
CREATE OR REPLACE FUNCTION public.lead_link_text(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url, 'content', f.content, 'checkedAt', f.checked_at))
                     FROM public.lead_data_files f WHERE f.id = ANY (p_ids) AND f.kind = 'link' AND f.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- ── The agent: Knowledge in place of sources ──

CREATE OR REPLACE FUNCTION public.lead_ai_more(p_brand uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'brandId', p_brand,
    'settings', coalesce((SELECT p.settings FROM public.lead_personas p WHERE p.brand_id = p_brand), '{}'::jsonb),
    'answers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'question', a.question, 'answer', a.answer, 'source', a.source,
                 'draftId', a.draft_id, 'editedAt', a.edited_at) ORDER BY a.sort_order, a.created_at)
                 FROM public.lead_ai_answers a WHERE a.brand_id = p_brand), '[]'::jsonb),
    'playbook', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'active', b.active, 'name', b.name, 'words', b.words,
                 'approaches', to_jsonb(b.approaches), 'reply', b.reply) ORDER BY b.sort_order, b.created_at)
                 FROM public.lead_ai_playbook b WHERE b.brand_id = p_brand), '[]'::jsonb),
    'knowledge', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', k.kind, 'ref', k.ref, 'paused', k.paused, 'addedAt', k.added_at,
                 'addedByName', k.added_by_name) ORDER BY k.added_at)
                 FROM public.lead_ai_knowledge k WHERE k.brand_id = p_brand), '[]'::jsonb));
END
$function$;

CREATE OR REPLACE FUNCTION public.lead_save_ai(p_brand uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_actor text;
  v_ord integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The AI agent needs Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/ai', '/leads/corrections'], ARRAY['leads.manage']);
  v_actor := public.lead_actor_name();
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_data->'settings') <> 'object' OR length((p_data->'settings')::text) > 20000
     OR jsonb_typeof(p_data->'answers') <> 'array' OR jsonb_array_length(p_data->'answers') > 300
     OR jsonb_typeof(p_data->'playbook') <> 'array' OR jsonb_array_length(p_data->'playbook') > 100
     OR (p_data ? 'knowledge' AND (jsonb_typeof(p_data->'knowledge') <> 'array' OR jsonb_array_length(p_data->'knowledge') > 300)) THEN
    RAISE EXCEPTION 'The agent''s settings are not in the right shape.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lead_personas AS p (brand_id, settings, goal, updated_by_name)
  VALUES (p_brand, p_data->'settings', left(coalesce(p_data->'settings'->>'goal', ''), 1000), v_actor)
  ON CONFLICT (brand_id) DO UPDATE SET settings = EXCLUDED.settings, goal = EXCLUDED.goal, updated_by_name = v_actor, updated_at = now()
   WHERE (p.settings, p.goal) IS DISTINCT FROM (EXCLUDED.settings, EXCLUDED.goal);

  -- Fixed answers.
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'answers') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'question', '')) = '' OR btrim(coalesce(r->>'answer', '')) = '' THEN
      RAISE EXCEPTION 'A fixed answer needs what the customer asks and the reply.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_ai_answers WHERE id = v_id AND brand_id = p_brand) THEN
      UPDATE public.lead_ai_answers a SET question = left(btrim(r->>'question'), 500), answer = left(btrim(r->>'answer'), 2000), sort_order = v_ord,
             edited_at = CASE WHEN a.answer <> left(btrim(r->>'answer'), 2000) AND a.draft_id IS NOT NULL THEN now() ELSE a.edited_at END,
             updated_by_name = v_actor, updated_at = now()
       WHERE a.id = v_id AND (a.question, a.answer, a.sort_order) IS DISTINCT FROM (left(btrim(r->>'question'), 500), left(btrim(r->>'answer'), 2000), v_ord);
    ELSE
      INSERT INTO public.lead_ai_answers (brand_id, question, answer, source, draft_id, sort_order, updated_by_name)
      VALUES (p_brand, left(btrim(r->>'question'), 500), left(btrim(r->>'answer'), 2000),
              CASE WHEN (r->>'draftId') ~ '^[0-9]{1,18}$' THEN 'From a correction in the Inbox · ' || v_actor ELSE 'Added by ' || v_actor END,
              CASE WHEN (r->>'draftId') ~ '^[0-9]{1,18}$' AND EXISTS (SELECT 1 FROM public.lead_ai_drafts WHERE id = (r->>'draftId')::bigint) THEN (r->>'draftId')::bigint END,
              v_ord, v_actor)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  DELETE FROM public.lead_ai_answers WHERE brand_id = p_brand AND NOT id = ANY (v_keep);

  -- The playbook.
  v_ord := 0;
  v_keep := '{}';
  FOR r IN SELECT * FROM jsonb_array_elements(p_data->'playbook') LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(r->>'name', '')) = '' THEN
      RAISE EXCEPTION 'A playbook situation needs a name.' USING ERRCODE = '22023';
    END IF;
    v_id := CASE WHEN r->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid END;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_ai_playbook WHERE id = v_id AND brand_id = p_brand) THEN
      UPDATE public.lead_ai_playbook b SET active = coalesce((r->>'active')::boolean, true), name = left(btrim(r->>'name'), 80),
             words = left(coalesce(r->>'words', ''), 300), approaches = ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(coalesce(r->'approaches', '[]'::jsonb)) x LIMIT 20),
             reply = left(coalesce(r->>'reply', ''), 2000), sort_order = v_ord, updated_by_name = v_actor, updated_at = now()
       WHERE b.id = v_id;
    ELSE
      INSERT INTO public.lead_ai_playbook (brand_id, active, name, words, approaches, reply, sort_order, updated_by_name)
      VALUES (p_brand, coalesce((r->>'active')::boolean, true), left(btrim(r->>'name'), 80), left(coalesce(r->>'words', ''), 300),
              ARRAY(SELECT left(x, 80) FROM jsonb_array_elements_text(coalesce(r->'approaches', '[]'::jsonb)) x LIMIT 20),
              left(coalesce(r->>'reply', ''), 2000), v_ord, v_actor)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  DELETE FROM public.lead_ai_playbook WHERE brand_id = p_brand AND NOT id = ANY (v_keep);

  -- Knowledge: folders, files and links of its brand's folder or Shared, on or paused. Left alone when not sent.
  IF p_data ? 'knowledge' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'knowledge') x
                WHERE NOT CASE x->>'kind'
                  WHEN 'folder' THEN EXISTS (SELECT 1 FROM public.lead_data_folders d WHERE d.id::text = x->>'ref' AND (d.brand_id IS NULL OR d.brand_id = p_brand))
                  WHEN 'file' THEN EXISTS (SELECT 1 FROM public.lead_data_files f WHERE f.id::text = x->>'ref' AND f.kind = 'file' AND f.deleted_at IS NULL AND (f.brand_id IS NULL OR f.brand_id = p_brand))
                  WHEN 'link' THEN EXISTS (SELECT 1 FROM public.lead_data_files f WHERE f.id::text = x->>'ref' AND f.kind = 'link' AND f.deleted_at IS NULL AND (f.brand_id IS NULL OR f.brand_id = p_brand))
                  ELSE false END) THEN
      RAISE EXCEPTION 'An agent reads folders, files and links from its brand''s folder or Shared.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.lead_ai_knowledge k WHERE k.brand_id = p_brand
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_data->'knowledge') x WHERE x->>'kind' = k.kind AND x->>'ref' = k.ref::text);
    INSERT INTO public.lead_ai_knowledge AS k (brand_id, kind, ref, paused, added_by_name)
    SELECT DISTINCT ON (x->>'kind', x->>'ref') p_brand, x->>'kind', (x->>'ref')::uuid, coalesce((x->>'paused')::boolean, false), v_actor
      FROM jsonb_array_elements(p_data->'knowledge') x
    ON CONFLICT (brand_id, kind, ref) DO UPDATE SET paused = EXCLUDED.paused WHERE k.paused IS DISTINCT FROM EXCLUDED.paused;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.lead_data_folders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_data_folder(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_data_folder(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_data_file_until(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_link_checked(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_link_text(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_data_folders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_data_folder(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_data_folder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_data_file_until(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_link_checked(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_link_text(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
