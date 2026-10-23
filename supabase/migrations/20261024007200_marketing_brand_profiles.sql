-- Marketing ⑥-2 (2026-10-24): each subsidiary's brand profile in the Library — the handoff's *Edit … profile*
-- (`Library.dc.html`): its profile picture (one of seven colours, or a logo uploaded), its background (one of seven
-- colours, or a cover uploaded), its brand font (one of six), a display name and a caption. Kept in
-- `mkt_subsidiaries.profile` (the column ① left for it); drawn on the Library's cards and a subsidiary's banner.
--
--   * the manager's (Marketing · Manage) — the handoff lets anybody; a brand's look is the manager's call
--   * a picture goes to the `marketing` bucket under `brand/` (a new INSERT policy: Manage), then the profile names it —
--     only a picture the caller has just sent (its bytes' row is theirs) or the one the profile already shows, and an
--     image; one replaced or taken off loses its bytes' row (R2's hourly sweep takes the bytes) unless another profile
--     shows it
--   * the display name is the brand's, on its card and banner — the subsidiary's own name (the rail, Track IDs,
--     projects) stays as it is (renaming one is question 29)
--   * mkt_library() hands each subsidiary its profile; mkt_lib_unfiled() counts a picture a profile shows as filed, so
--     its sender cannot take it back from under the profile
--
-- mkt_library and mkt_lib_unfiled are replaced from production's bodies (md5 0fea0947… and 41681904…, the same as
-- 20261024007000's), one statement each changed. PGlite: tests/member-sql/validate-marketing-library.mjs.

-- ── A brand picture: the manager's, under brand/ ─────────────────────────────────
DROP POLICY IF EXISTS mkt_library_brand_upload ON public.file_objects;
CREATE POLICY mkt_library_brand_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'brand'::text)
    AND (SELECT public.has_any_action(ARRAY['marketing.manage'::text])));

-- A file is filed while the Library lists it or a profile shows it.
CREATE OR REPLACE FUNCTION public.mkt_lib_unfiled(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM public.mkt_lib_files f WHERE f.path = p_name)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subsidiaries s
                      WHERE s.profile ->> 'avatar_path' = p_name OR s.profile ->> 'banner_path' = p_name);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_unfiled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lib_unfiled(text) TO authenticated;

-- ── What the page draws: each subsidiary with its profile ────────────────────────
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
         WHERE f.trashed_at >= v_cut AND d.trashed_at IS NULL) bin), '[]'::jsonb));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_library() TO authenticated;

-- ── A brand profile saved whole ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_profile_save(p_sub uuid, p_profile jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s     public.mkt_subsidiaries%ROWTYPE;
  v_old   jsonb;
  v_new   jsonb := '{}'::jsonb;
  v_val   text;
  v_key   text;
  v_mime  text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Brand profiles are the manager''s.');
  PERFORM public.mkt_lib_purge();
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_sub AND active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subsidiary is not on the list.' USING ERRCODE = 'P0002';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Send the profile.' USING ERRCODE = '22023';
  END IF;
  v_old := coalesce(v_s.profile, '{}'::jsonb);

  -- The colours and the fonts: the handoff's, and no other.
  v_val := nullif(btrim(p_profile ->> 'avatar'), '');
  IF v_val IS NOT NULL THEN
    IF v_val <> ALL (ARRAY['rgb(94 60 40)', 'rgb(44 82 130)', 'rgb(40 34 30)', 'rgb(84 96 66)', 'rgb(52 110 110)',
                           'rgb(166 78 40)', 'rgb(140 60 90)']) THEN
      RAISE EXCEPTION 'Pick one of the seven colours.' USING ERRCODE = '22023';
    END IF;
    v_new := v_new || jsonb_build_object('avatar', v_val);
  END IF;
  v_val := nullif(btrim(p_profile ->> 'banner'), '');
  IF v_val IS NOT NULL THEN
    IF v_val <> ALL (ARRAY['rgb(238 228 216)', 'rgb(226 234 244)', 'rgb(234 232 228)', 'rgb(234 238 226)', 'rgb(248 228 212)',
                           'rgb(240 228 236)', 'rgb(40 34 30)']) THEN
      RAISE EXCEPTION 'Pick one of the seven backgrounds.' USING ERRCODE = '22023';
    END IF;
    v_new := v_new || jsonb_build_object('banner', v_val);
  END IF;
  v_val := nullif(btrim(p_profile ->> 'font'), '');
  IF v_val IS NOT NULL THEN
    IF v_val <> ALL (ARRAY['Newsreader', 'Nunito', 'Playfair', 'DM Serif', 'Space Grotesk', 'Inter']) THEN
      RAISE EXCEPTION 'Pick one of the six fonts.' USING ERRCODE = '22023';
    END IF;
    v_new := v_new || jsonb_build_object('font', v_val);
  END IF;

  -- The words, tidied.
  v_val := nullif(btrim(regexp_replace(coalesce(p_profile ->> 'name', ''), '\s+', ' ', 'g')), '');
  IF v_val IS NOT NULL THEN
    IF length(v_val) > 40 THEN
      RAISE EXCEPTION 'The display name is at most 40 characters.' USING ERRCODE = '22023';
    END IF;
    v_new := v_new || jsonb_build_object('name', v_val);
  END IF;
  v_val := nullif(btrim(regexp_replace(coalesce(p_profile ->> 'caption', ''), '\s+', ' ', 'g')), '');
  IF v_val IS NOT NULL THEN
    IF length(v_val) > 80 THEN
      RAISE EXCEPTION 'The caption is at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    v_new := v_new || jsonb_build_object('caption', v_val);
  END IF;

  -- The pictures: the one it shows, or an image this person has just sent under brand/.
  FOREACH v_key IN ARRAY ARRAY['avatar_path', 'banner_path'] LOOP
    v_val := nullif(btrim(p_profile ->> v_key), '');
    IF v_val IS NOT NULL AND v_val IS DISTINCT FROM v_old ->> v_key THEN
      SELECT o.metadata ->> 'mimetype' INTO v_mime FROM public.file_objects o
       WHERE o.bucket_id = 'marketing' AND o.name = v_val AND o.owner_id = auth.uid()::text;
      IF NOT FOUND OR v_val !~ '^brand/[0-9a-f-]{36}/[^/]+$' THEN
        RAISE EXCEPTION 'That picture has not arrived — upload it again.' USING ERRCODE = 'P0002';
      END IF;
      IF coalesce(v_mime, '') NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'A brand picture is an image — PNG, JPG, WebP or GIF.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_val IS NOT NULL THEN
      v_new := v_new || jsonb_build_object(v_key, v_val);
    END IF;
  END LOOP;

  UPDATE public.mkt_subsidiaries SET profile = v_new, updated_at = now() WHERE id = p_sub;

  -- A picture replaced or taken off: its bytes' row goes (R2's hourly sweep takes the bytes), unless a profile shows it.
  DELETE FROM public.file_objects o
   WHERE o.bucket_id = 'marketing'
     AND o.name IN (SELECT v_old ->> k FROM unnest(ARRAY['avatar_path', 'banner_path']) k WHERE v_old ->> k IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subsidiaries x
                      WHERE x.profile ->> 'avatar_path' = o.name OR x.profile ->> 'banner_path' = o.name);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_lib_profile_save(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lib_profile_save(uuid, jsonb) TO authenticated;
