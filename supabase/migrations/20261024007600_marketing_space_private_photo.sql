-- Marketing ⑦-1 (2026-10-23): the Photo tile's picture is its owner's alone. In `My Space Bento.dc.html` a visit draws
-- the owner's room, pet, trophies, notes and lobby — never the Photo tile — and the prototype kept the photo in the
-- browser; here it is in the `marketing` bucket, whose read policy opened every file in it to Marketing · View. So:
--
--   * the photo's path is `mine/<uuid>/<name>` (was space/…, like the cover and the avatar, which teammates see:
--     "Teammates see this in chat and in the lobby");
--   * mkt_library_files_read: everything in the bucket but mine/; mkt_space_mine_read: mine/ to its owner only;
--     mkt_space_mine_upload: mine/ sent by Marketing · Edit (the row's owner is the sender — file_objects_stamp);
--   * mkt_space_save replaced from production's body (20261024007500's, md5 9dcdfee6…), the one change: which folder a
--     picture must be under, by its key.
-- No row is moved: mkt_spaces was empty when this was written (the page comes with it).
--
-- PGlite: tests/member-sql/validate-marketing-spaces.mjs.

ALTER TABLE public.mkt_spaces DROP CONSTRAINT IF EXISTS mkt_spaces_photo_path_check;
ALTER TABLE public.mkt_spaces ADD CONSTRAINT mkt_spaces_photo_path_check CHECK (photo_path ~ '^mine/[0-9a-f-]{36}/[^/]+$');

-- ── The bucket's files: Marketing's to read, but mine/ — its owner's ───────────────
DROP POLICY IF EXISTS mkt_library_files_read ON public.file_objects;
CREATE POLICY mkt_library_files_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] IS DISTINCT FROM 'mine'::text)
    AND (SELECT public.has_any_action(ARRAY['marketing.view'::text])));
DROP POLICY IF EXISTS mkt_space_mine_read ON public.file_objects;
CREATE POLICY mkt_space_mine_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'mine'::text)
    AND (owner_id = ((SELECT auth.uid()))::text));
DROP POLICY IF EXISTS mkt_space_mine_upload ON public.file_objects;
CREATE POLICY mkt_space_mine_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'mine'::text)
    AND (SELECT public.has_any_action(ARRAY['marketing.edit'::text])));

-- ── Saved: only what was sent ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_space_save(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old    public.mkt_spaces;
  v_new    public.mkt_spaces;
  v_t      jsonb;
  v_kinds  text[] := ARRAY['turn', 'waiting', 'delegated', 'week', 'notes', 'photo', 'room', 'pet', 'chat', 'lobby', 'trophies'];
  v_seen   text[] := '{}';
  v_id     text;
  v_x      numeric;
  v_y      numeric;
  v_w      numeric;
  v_h      numeric;
  v_key    text;
  v_val    text;
  v_mime   text;
  v_folder text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Changing your space is not open to your account.');
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_spaces (user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_old FROM public.mkt_spaces WHERE user_id = auth.uid() FOR UPDATE;
  v_new := v_old;

  -- The board: checked whole.
  IF p_patch ? 'layout' THEN
    IF jsonb_typeof(p_patch -> 'layout') IS DISTINCT FROM 'array' OR jsonb_array_length(p_patch -> 'layout') > 20 THEN
      RAISE EXCEPTION 'A board holds at most 20 tiles.' USING ERRCODE = '22023';
    END IF;
    FOR v_t IN SELECT x FROM jsonb_array_elements(p_patch -> 'layout') x LOOP
      v_id := v_t ->> 'id';
      IF v_id IS NULL OR NOT (v_id = ANY (v_kinds)) THEN
        RAISE EXCEPTION 'That tile is not one the board knows.' USING ERRCODE = '22023';
      END IF;
      IF v_id = ANY (v_seen) THEN
        RAISE EXCEPTION 'Each tile is on the board once.' USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_id;
      BEGIN
        v_x := (v_t ->> 'x')::numeric; v_y := (v_t ->> 'y')::numeric; v_w := (v_t ->> 'w')::numeric; v_h := (v_t ->> 'h')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'A tile''s place is numbers.' USING ERRCODE = '22023';
      END;
      IF v_x IS NULL OR v_y IS NULL OR v_w IS NULL OR v_h IS NULL OR v_x < 0 OR v_w < 0.14 OR v_x + v_w > 1.0001
         OR v_y < 0 OR v_y > 20000 OR v_h < 110 OR v_h > 2000 THEN
        RAISE EXCEPTION 'A tile stays within the board, at least 14%% wide and 110 px high.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF NOT ('turn' = ANY (v_seen)) OR NOT ('waiting' = ANY (v_seen)) THEN
      RAISE EXCEPTION 'My turn and Waiting stay on the board.' USING ERRCODE = '22023';
    END IF;
    v_new.layout := (SELECT jsonb_agg(jsonb_build_object('id', x ->> 'id', 'x', round((x ->> 'x')::numeric, 4),
                                                         'y', round((x ->> 'y')::numeric), 'w', round((x ->> 'w')::numeric, 4),
                                                         'h', round((x ->> 'h')::numeric)))
                       FROM jsonb_array_elements(p_patch -> 'layout') x);
  END IF;
  IF p_patch ? 'tilesKnown' THEN
    IF jsonb_typeof(p_patch -> 'tilesKnown') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
    END IF;
    v_new.tiles_known := ARRAY(SELECT DISTINCT k FROM jsonb_array_elements_text(p_patch -> 'tilesKnown') k WHERE k = ANY (v_kinds) ORDER BY k);
  END IF;

  -- The look: keys, never colours.
  IF p_patch ? 'theme' THEN
    v_t := p_patch -> 'theme';
    IF jsonb_typeof(v_t) IS DISTINCT FROM 'object'
       OR coalesce(v_t ->> 'bg', 'linen') NOT IN ('linen', 'mint', 'lilac', 'sand', 'white')
       OR coalesce(v_t ->> 'accent', 'orange') NOT IN ('orange', 'walnut', 'blue', 'green', 'pink')
       OR coalesce(v_t ->> 'corners', 'soft') NOT IN ('square', 'soft', 'round') THEN
      RAISE EXCEPTION 'Pick a background, an accent and corners from the drawer.' USING ERRCODE = '22023';
    END IF;
    v_new.theme := jsonb_strip_nulls(jsonb_build_object('bg', v_t ->> 'bg', 'accent', v_t ->> 'accent', 'corners', v_t ->> 'corners'));
  END IF;
  IF p_patch ? 'cover' THEN
    IF jsonb_typeof(p_patch -> 'cover') = 'null' THEN
      v_new.cover := NULL;
    ELSIF jsonb_typeof(p_patch -> 'cover') = 'number' AND (p_patch ->> 'cover')::numeric IN (0, 1, 2, 3) THEN
      v_new.cover := (p_patch ->> 'cover')::integer;
    ELSE
      RAISE EXCEPTION 'Pick one of the four covers.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- The words, tidied.
  IF p_patch ? 'status' THEN
    v_val := nullif(btrim(regexp_replace(coalesce(p_patch ->> 'status', ''), '\s+', ' ', 'g')), '');
    IF length(v_val) > 80 THEN
      RAISE EXCEPTION 'A status is at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    v_new.status := v_val;
  END IF;
  IF p_patch ? 'notes' THEN
    v_val := nullif(rtrim(coalesce(p_patch ->> 'notes', ''), E' \t\r\n'), '');
    IF length(v_val) > 4000 THEN
      RAISE EXCEPTION 'Notes: at most 4,000 characters.' USING ERRCODE = '22023';
    END IF;
    v_new.notes := v_val;
  END IF;

  -- The pictures: the one it shows, or an image this person has just sent — the cover and the avatar under space/,
  -- the photo under mine/.
  FOREACH v_key IN ARRAY ARRAY['coverPath', 'avatarPath', 'photoPath'] LOOP
    CONTINUE WHEN NOT (p_patch ? v_key);
    v_val := nullif(btrim(p_patch ->> v_key), '');
    v_folder := CASE WHEN v_key = 'photoPath' THEN 'mine' ELSE 'space' END;
    IF v_val IS NOT NULL AND v_val IS DISTINCT FROM (CASE v_key WHEN 'coverPath' THEN v_old.cover_path
                                                                WHEN 'avatarPath' THEN v_old.avatar_path
                                                                ELSE v_old.photo_path END) THEN
      SELECT o.metadata ->> 'mimetype' INTO v_mime FROM public.file_objects o
       WHERE o.bucket_id = 'marketing' AND o.name = v_val AND o.owner_id = auth.uid()::text;
      IF NOT FOUND OR v_val !~ ('^' || v_folder || '/[0-9a-f-]{36}/[^/]+$') THEN
        RAISE EXCEPTION 'That picture has not arrived — upload it again.' USING ERRCODE = 'P0002';
      END IF;
      IF coalesce(v_mime, '') NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'A picture here is an image — PNG, JPG, WebP or GIF.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_key = 'coverPath' THEN v_new.cover_path := v_val;
    ELSIF v_key = 'avatarPath' THEN v_new.avatar_path := v_val;
    ELSE v_new.photo_path := v_val;
    END IF;
  END LOOP;

  UPDATE public.mkt_spaces
     SET layout = v_new.layout, theme = v_new.theme, cover = v_new.cover, cover_path = v_new.cover_path,
         avatar_path = v_new.avatar_path, status = v_new.status, notes = v_new.notes, photo_path = v_new.photo_path,
         tiles_known = v_new.tiles_known, updated_at = now()
   WHERE user_id = auth.uid();

  -- A picture replaced or taken off: its bytes' row goes (R2's hourly sweep takes the bytes), unless still shown.
  DELETE FROM public.file_objects o
   WHERE o.bucket_id = 'marketing'
     AND o.name IN (SELECT p FROM unnest(ARRAY[v_old.cover_path, v_old.avatar_path, v_old.photo_path]) p WHERE p IS NOT NULL)
     AND o.name IS DISTINCT FROM v_new.cover_path AND o.name IS DISTINCT FROM v_new.avatar_path
     AND o.name IS DISTINCT FROM v_new.photo_path;
  RETURN public.mkt_space();
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_space_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_space_save(jsonb) TO authenticated;
