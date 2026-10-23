-- Marketing ⑥-3 (2026-10-24): a guest share link for a Library file or folder — the handoff's *Share link* (a file's
-- and a folder's menu, `Library.dc.html`): "Guest link · for people without an account", *Link expires* 24 hours /
-- 7 days / 30 days / Never (7 days the default), *Allow download* (on by default), Copy.
--
--   * mkt_lib_shares          one live link per file or folder (stopped, or past its expiry, it opens nothing); its
--                             code — 32 random hex, the only key, as the PIC's link — never written to the audit trail
--   * mkt_lib_share(kind, id, expiry, download)   Marketing · Edit: makes the item's link, or changes the live one's
--                             expiry (counted again from now) and download; one past its expiry is closed and a new code
--                             made. A link folder is shared by its own address, never here.
--   * mkt_lib_share_stop(kind, id)                Marketing · Edit: the item's link closed at once (the handoff has no
--                             way to stop one — a link that "Never" expires could not be taken back)
--   * mkt_library()           hands Marketing each live link (kind, item, code, download, expiry)
--   * the page /l/<code> reads as a stranger — the publishable key, no session — through two functions granted to anon
--     BY NAME, each checking the code: mkt_lib_shared(code) what the page draws (the brand, the item, its files' names,
--     sizes and types — never a path, never who sent them), mkt_lib_shared_file(code, file) one file's path, name and
--     type for /l/<code>/f/<id>, which signs it at the click as the stranger. The bucket's new anon SELECT policy asks
--     mkt_lib_share_may_read(name), which reads the code from the request's x-link-code header: only a file of a live
--     link, neither it nor its folder in the Dustbin — and the brand's own logo and cover (⑥-2) of the subsidiary the
--     link's item belongs to, which its page wears.
--
-- mkt_library is replaced from production's body (20261024007200's, md5 3eba1026…), the shares added.
-- PGlite: tests/member-sql/validate-marketing-library.mjs.

-- ── The links ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_lib_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[0-9a-f]{32}$'),
  file_id     uuid REFERENCES public.mkt_lib_files(id) ON DELETE CASCADE,
  folder_id   uuid REFERENCES public.mkt_lib_folders(id) ON DELETE CASCADE,
  download    boolean NOT NULL DEFAULT true,
  -- What was picked (the dialog lights it); expires_at is when, counted from the last change — NULL: never.
  expiry      text NOT NULL DEFAULT '7d' CHECK (expiry IN ('24h', '7d', '30d', 'never')),
  expires_at  timestamptz,
  created_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  stopped_at  timestamptz,
  stopped_by  uuid REFERENCES public.users(id),
  CHECK ((file_id IS NULL) <> (folder_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_lib_shares_one_file ON public.mkt_lib_shares (file_id) WHERE stopped_at IS NULL AND file_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mkt_lib_shares_one_folder ON public.mkt_lib_shares (folder_id) WHERE stopped_at IS NULL AND folder_id IS NOT NULL;
ALTER TABLE public.mkt_lib_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_lib_shares FROM anon, authenticated;
SELECT public.audit_register('mkt_lib_shares', 'Marketing Library share links', 'Marketing', '{marketing}', 'all',
  p_keys => '{id}', p_omit => '{code}');

-- ── May the stranger holding this request's code read this file? ─────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_share_may_read(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-link-code', '')));
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.mkt_lib_shares sh
      JOIN public.mkt_lib_files f ON f.path = p_name AND f.trashed_at IS NULL
      JOIN public.mkt_lib_folders d ON d.id = f.folder_id AND d.trashed_at IS NULL
     WHERE sh.code = v_code AND sh.stopped_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at > now())
       AND (sh.file_id = f.id OR sh.folder_id = d.id))
    -- …and the brand's own pictures (⑥-2) of the subsidiary the link's item belongs to: its page wears them.
    OR EXISTS (
    SELECT 1 FROM public.mkt_lib_shares sh
      LEFT JOIN public.mkt_lib_files f ON f.id = sh.file_id
      JOIN public.mkt_lib_folders d ON d.id = coalesce(sh.folder_id, f.folder_id) AND d.trashed_at IS NULL
      JOIN public.mkt_subsidiaries s ON s.id = d.subsidiary_id
     WHERE sh.code = v_code AND sh.stopped_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at > now())
       AND (sh.file_id IS NULL OR f.trashed_at IS NULL)
       AND p_name IN (s.profile ->> 'avatar_path', s.profile ->> 'banner_path'));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_share_may_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_lib_share_may_read(text) TO anon;

DROP POLICY IF EXISTS mkt_library_files_shared ON public.file_objects;
CREATE POLICY mkt_library_files_shared ON public.file_objects FOR SELECT TO anon
  USING ((bucket_id = 'marketing'::text) AND public.mkt_lib_share_may_read(name));

-- ── The live link of an item (its row), or none ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_share_of(p_kind text, p_id uuid)
RETURNS public.mkt_lib_shares
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sh public.mkt_lib_shares;
BEGIN
  SELECT * INTO v_sh FROM public.mkt_lib_shares sh
   WHERE sh.stopped_at IS NULL
     AND ((p_kind = 'file' AND sh.file_id = p_id) OR (p_kind = 'folder' AND sh.folder_id = p_id));
  RETURN v_sh;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_share_of(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_lib_share_of(text, uuid) TO service_role;

-- ── A link made, or the live one changed ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_share(p_kind text, p_id uuid, p_expiry text, p_download boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_until timestamptz;
  v_sh    public.mkt_lib_shares;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Sharing from the Library is not open to your account.');
  PERFORM public.mkt_lib_purge();
  IF p_kind = 'file' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mkt_lib_files f JOIN public.mkt_lib_folders d ON d.id = f.folder_id
                    WHERE f.id = p_id AND f.trashed_at IS NULL AND d.trashed_at IS NULL) THEN
      RAISE EXCEPTION 'That file is not there.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_kind = 'folder' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mkt_lib_folders d WHERE d.id = p_id AND d.trashed_at IS NULL) THEN
      RAISE EXCEPTION 'That folder is not there.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mkt_lib_folders d JOIN public.mkt_lib_types t ON t.id = d.type_id WHERE d.id = p_id AND t.link) THEN
      RAISE EXCEPTION 'A link folder is shared by its own link.' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Share a file or a folder.' USING ERRCODE = '22023';
  END IF;
  v_until := CASE p_expiry WHEN '24h' THEN now() + interval '24 hours' WHEN '7d' THEN now() + interval '7 days'
                           WHEN '30d' THEN now() + interval '30 days' WHEN 'never' THEN NULL END;
  IF p_expiry IS NULL OR p_expiry NOT IN ('24h', '7d', '30d', 'never') THEN
    RAISE EXCEPTION 'Pick when the link expires.' USING ERRCODE = '22023';
  END IF;

  v_sh := public.mkt_lib_share_of(p_kind, p_id);
  -- A link past its expiry opens nothing again: closed, and a new code made.
  IF v_sh.id IS NOT NULL AND v_sh.expires_at IS NOT NULL AND v_sh.expires_at <= now() THEN
    UPDATE public.mkt_lib_shares SET stopped_at = v_sh.expires_at, updated_at = now() WHERE id = v_sh.id;
    v_sh := NULL;
  END IF;
  IF v_sh.id IS NOT NULL THEN
    UPDATE public.mkt_lib_shares SET expiry = p_expiry, expires_at = v_until, download = coalesce(p_download, true), updated_at = now()
     WHERE id = v_sh.id RETURNING * INTO v_sh;
  ELSE
    INSERT INTO public.mkt_lib_shares (code, file_id, folder_id, download, expiry, expires_at, created_by)
    VALUES (replace(gen_random_uuid()::text, '-', ''), CASE WHEN p_kind = 'file' THEN p_id END,
            CASE WHEN p_kind = 'folder' THEN p_id END, coalesce(p_download, true), p_expiry, v_until, auth.uid())
    RETURNING * INTO v_sh;
  END IF;
  RETURN jsonb_build_object('code', v_sh.code, 'download', v_sh.download, 'expiry', v_sh.expiry, 'expires', v_sh.expires_at);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_share(text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lib_share(text, uuid, text, boolean) TO authenticated;

-- ── A link stopped ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_share_stop(p_kind text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sh public.mkt_lib_shares;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Sharing from the Library is not open to your account.');
  PERFORM public.mkt_lib_purge();
  IF p_kind IS NULL OR p_kind NOT IN ('file', 'folder') THEN
    RAISE EXCEPTION 'Stop a file''s link or a folder''s.' USING ERRCODE = '22023';
  END IF;
  v_sh := public.mkt_lib_share_of(p_kind, p_id);
  IF v_sh.id IS NULL THEN
    RAISE EXCEPTION 'It has no link to stop.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.mkt_lib_shares SET stopped_at = now(), stopped_by = auth.uid(), updated_at = now() WHERE id = v_sh.id;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_share_stop(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lib_share_stop(text, uuid) TO authenticated;

-- ── What /l/<code> draws ────────────────────────────────────────────────────────
-- A live link's brand, item and files; NULL for anything else (a wrong code, stopped, expired, binned, gone).
CREATE OR REPLACE FUNCTION public.mkt_lib_shared(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_sh   public.mkt_lib_shares;
  v_d    public.mkt_lib_folders;
  v_f    public.mkt_lib_files;
  v_s    public.mkt_subsidiaries;
  v_type text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_sh FROM public.mkt_lib_shares
   WHERE code = v_code AND stopped_at IS NULL AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_sh.file_id IS NOT NULL THEN
    SELECT * INTO v_f FROM public.mkt_lib_files WHERE id = v_sh.file_id AND trashed_at IS NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v_d FROM public.mkt_lib_folders WHERE id = v_f.folder_id AND trashed_at IS NULL;
  ELSE
    SELECT * INTO v_d FROM public.mkt_lib_folders WHERE id = v_sh.folder_id AND trashed_at IS NULL;
  END IF;
  IF v_d.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = v_d.subsidiary_id;
  SELECT t.name INTO v_type FROM public.mkt_lib_types t WHERE t.id = v_d.type_id;
  RETURN jsonb_build_object(
    'kind', CASE WHEN v_sh.file_id IS NOT NULL THEN 'file' ELSE 'folder' END,
    'name', CASE WHEN v_sh.file_id IS NOT NULL THEN v_f.name ELSE v_type END,
    'folder', v_type,
    'sub', jsonb_build_object('name', v_s.name, 'code', v_s.code, 'emoji', v_s.emoji, 'dot', v_s.dot,
                              'client', v_s.company_id IS NULL, 'profile', v_s.profile),
    'download', v_sh.download,
    'expires', v_sh.expires_at,
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size, 'mime', f.mime, 'at', f.created_at,
                                                           'ext', upper(coalesce(substring(f.path from '\.([A-Za-z0-9]{1,8})$'), '')))
                                        ORDER BY f.created_at DESC)
                         FROM public.mkt_lib_files f
                        WHERE f.trashed_at IS NULL
                          AND (f.id = v_sh.file_id OR (v_sh.folder_id IS NOT NULL AND f.folder_id = v_sh.folder_id))), '[]'::jsonb));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_shared(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_lib_shared(text) TO anon, authenticated;

-- One file of a live link: where it is, for /l/<code>/f/<id> to sign as the stranger (the bucket's anon policy asks
-- the same code again). NULL when the link or the file is not open.
CREATE OR REPLACE FUNCTION public.mkt_lib_shared_file(p_code text, p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_out  jsonb;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' OR p_file IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object('path', f.path, 'name', f.name, 'mime', f.mime, 'download', sh.download) INTO v_out
    FROM public.mkt_lib_shares sh
    JOIN public.mkt_lib_files f ON f.id = p_file AND f.trashed_at IS NULL
    JOIN public.mkt_lib_folders d ON d.id = f.folder_id AND d.trashed_at IS NULL
   WHERE sh.code = v_code AND sh.stopped_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at > now())
     AND (sh.file_id = f.id OR sh.folder_id = d.id);
  RETURN v_out;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_shared_file(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_lib_shared_file(text, uuid) TO anon, authenticated;

-- ── What the page draws: each subsidiary with its profile, and each live link ─────
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
                                                          'client', s.company_id IS NULL, 'profile', s.profile)
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
         WHERE f.trashed_at >= v_cut AND d.trashed_at IS NULL) bin), '[]'::jsonb),
    -- Each live link (⑥-3): the item, its code, download, expiry.
    'shares', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', CASE WHEN sh.file_id IS NOT NULL THEN 'file' ELSE 'folder' END,
                                                            'id', coalesce(sh.file_id, sh.folder_id), 'code', sh.code,
                                                            'download', sh.download, 'expiry', sh.expiry, 'expires', sh.expires_at))
                          FROM public.mkt_lib_shares sh
                         WHERE sh.stopped_at IS NULL AND (sh.expires_at IS NULL OR sh.expires_at > now())), '[]'::jsonb));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_library() TO authenticated;
