-- 20261025038000_marketing_lobby_visit.sql
-- 2026-10-24 — Marketing ⑦-4: the lobby and a visit to a teammate's space (`My Space Bento.dc.html`; the user's answers
-- 37, 38 and 40).
--   The lobby (37)   everybody with Marketing · View sees it: the pets of Marketing's roster — those with a login and
--                    their pet set up — wandering about; one clicked opens its owner's space. The Principal's shared
--                    login has no pet (it sees the lobby).
--   A visit (38)     the teammate's cover, avatar, name, status, room, pet and trophies, their Notes AND their Photo.
--   The avatar (40)  the one uploaded on My Space.
-- The Photo goes under space/ from now on (like the cover and the avatar — Marketing reads them); a photo kept under
-- mine/ (none on production when this was written) stays its owner's alone: a visit does not show it.
-- Replaced from production's body (md5 equal — 20261024007700's): mkt_space_save — a photo sent is under space/.
-- New functions (STABLE, Marketing · View):
--   mkt_lobby()           the pets in the lobby: whose, its kind, name, colour, one's own animal, XP and energy
--   mkt_space_of(staff)   a teammate's space for a visit, and their pet in numbers (its trophies)
-- PGlite: tests/member-sql/validate-marketing-lobby.mjs.

-- ── The photo: under space/ (mine/ kept for one saved before) ─────────────────────────
ALTER TABLE public.mkt_spaces DROP CONSTRAINT IF EXISTS mkt_spaces_photo_path_check;
ALTER TABLE public.mkt_spaces ADD CONSTRAINT mkt_spaces_photo_path_check CHECK (photo_path ~ '^(space|mine)/[0-9a-f-]{36}/[^/]+$');

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

  -- The room: keys, at most 30 pieces of the catalogue's.
  IF p_patch ? 'room' THEN
    v_t := p_patch -> 'room';
    IF jsonb_typeof(v_t) IS DISTINCT FROM 'object'
       OR coalesce(v_t ->> 'wall', 'peach') NOT IN ('peach', 'sage', 'sky', 'blush', 'cream', 'night')
       OR coalesce(v_t ->> 'floor', 'oak') NOT IN ('oak', 'walnut', 'tile', 'grass', 'carpet')
       OR jsonb_typeof(coalesce(v_t -> 'items', '[]'::jsonb)) IS DISTINCT FROM 'array'
       OR jsonb_array_length(coalesce(v_t -> 'items', '[]'::jsonb)) > 30 THEN
      RAISE EXCEPTION 'Pick a wall, a floor and at most 30 pieces from the drawer.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_t -> 'items', '[]'::jsonb)) i
                WHERE jsonb_typeof(i) IS DISTINCT FROM 'object'
                   OR coalesce(i ->> 'k', '') NOT IN ('bed', 'sofa', 'plant', 'desk', 'chair', 'books', 'teddy', 'guitar', 'cactus',
                                                      'tv', 'candle', 'game', 'tree', 'frame', 'clock', 'trophy')
                   OR coalesce(i ->> 'id', '') !~ '^[a-z]+-[0-9a-z]{1,24}$'
                   OR jsonb_typeof(i -> 'x') IS DISTINCT FROM 'number'
                   OR coalesce(i ->> 'flip', '1') NOT IN ('1', '-1'))
       OR (SELECT count(*) <> count(DISTINCT i ->> 'id') FROM jsonb_array_elements(coalesce(v_t -> 'items', '[]'::jsonb)) i) THEN
      RAISE EXCEPTION 'Each piece is one of the catalogue''s, once, somewhere in the room.' USING ERRCODE = '22023';
    END IF;
    v_new.room := jsonb_build_object('wall', coalesce(v_t ->> 'wall', 'peach'), 'floor', coalesce(v_t ->> 'floor', 'oak'),
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i ->> 'id', 'k', i ->> 'k',
                                                             'x', round(least(96, greatest(4, (i ->> 'x')::numeric))),
                                                             'flip', CASE WHEN i ->> 'flip' = '-1' THEN -1 ELSE 1 END))
                           FROM jsonb_array_elements(coalesce(v_t -> 'items', '[]'::jsonb)) i), '[]'::jsonb));
  END IF;

  -- The pet's look: its kind, its name, its colour; the setup done.
  IF p_patch ? 'pet' THEN
    v_t := p_patch -> 'pet';
    IF jsonb_typeof(v_t) IS DISTINCT FROM 'object'
       OR coalesce(v_t ->> 'species', 'cat') NOT IN ('cat', 'dog', 'bird', 'dragon')
       OR coalesce(v_t ->> 'color', 'original') NOT IN ('original', 'cocoa', 'snow', 'rose', 'mint', 'sky', 'midnight')
       OR jsonb_typeof(coalesce(v_t -> 'onboarded', 'false'::jsonb)) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Pick your pet''s kind and colour from the list.' USING ERRCODE = '22023';
    END IF;
    v_val := nullif(btrim(regexp_replace(coalesce(v_t ->> 'name', ''), '\s+', ' ', 'g')), '');
    IF length(v_val) > 16 THEN
      RAISE EXCEPTION 'A pet''s name is at most 16 characters.' USING ERRCODE = '22023';
    END IF;
    v_new.pet := jsonb_strip_nulls(jsonb_build_object('species', coalesce(v_t ->> 'species', 'cat'), 'name', v_val,
      'color', coalesce(v_t ->> 'color', 'original'), 'onboarded', coalesce((v_t ->> 'onboarded')::boolean, false)));
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

  -- The pictures: the one it shows, or an image this person has just sent — all under space/, which Marketing sees: the
  -- photo too since ⑦-4 (the user's answer 38 — a visitor sees the Notes and the Photo; one kept under mine/ stays).
  FOREACH v_key IN ARRAY ARRAY['coverPath', 'avatarPath', 'photoPath', 'petPath'] LOOP
    CONTINUE WHEN NOT (p_patch ? v_key);
    v_val := nullif(btrim(p_patch ->> v_key), '');
    v_folder := 'space';
    IF v_val IS NOT NULL AND v_val IS DISTINCT FROM (CASE v_key WHEN 'coverPath' THEN v_old.cover_path
                                                                WHEN 'avatarPath' THEN v_old.avatar_path
                                                                WHEN 'photoPath' THEN v_old.photo_path
                                                                ELSE v_old.pet_path END) THEN
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
    ELSIF v_key = 'photoPath' THEN v_new.photo_path := v_val;
    ELSE v_new.pet_path := v_val;
    END IF;
  END LOOP;

  UPDATE public.mkt_spaces
     SET layout = v_new.layout, theme = v_new.theme, cover = v_new.cover, cover_path = v_new.cover_path,
         avatar_path = v_new.avatar_path, status = v_new.status, notes = v_new.notes, photo_path = v_new.photo_path,
         tiles_known = v_new.tiles_known, room = v_new.room, pet = v_new.pet, pet_path = v_new.pet_path, updated_at = now()
   WHERE user_id = auth.uid();

  -- A picture replaced or taken off: its bytes' row goes (R2's hourly sweep takes the bytes), unless still shown.
  DELETE FROM public.file_objects o
   WHERE o.bucket_id = 'marketing'
     AND o.name IN (SELECT p FROM unnest(ARRAY[v_old.cover_path, v_old.avatar_path, v_old.photo_path, v_old.pet_path]) p WHERE p IS NOT NULL)
     AND o.name IS DISTINCT FROM v_new.cover_path AND o.name IS DISTINCT FROM v_new.avatar_path
     AND o.name IS DISTINCT FROM v_new.photo_path AND o.name IS DISTINCT FROM v_new.pet_path;
  RETURN public.mkt_space();
END
$fn$;

-- ── The lobby: the roster's pets ─────────────────────────────────────────────────────
-- Somebody on Marketing's roster with a login and their pet set up. XP and energy as mkt_pet_of reckons them (64 to
-- begin with, each feed and workout on top) — summed here once for everybody.
CREATE OR REPLACE FUNCTION public.mkt_lobby()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'staff', r.staff_id, 'first', r.first_name, 'title', r.title,
             'species', sp.pet ->> 'species', 'name', sp.pet ->> 'name', 'color', sp.pet ->> 'color', 'petPath', sp.pet_path,
             'xp', coalesce(l.xp, 0), 'energy', greatest(0, least(100, 64 + coalesce(l.energy, 0))))
           ORDER BY r.first_name, r.staff_id)
      FROM public.mkt_roster() r
      JOIN public.mkt_spaces sp ON sp.user_id = r.user_id
      LEFT JOIN (SELECT g.staff, sum(g.xp)::integer AS xp, sum(g.energy)::integer AS energy
                   FROM public.mkt_pet_log g GROUP BY g.staff) l ON l.staff = r.staff_id
     WHERE r.user_id IS NOT NULL AND (sp.pet ->> 'onboarded') = 'true'), '[]'::jsonb);
END
$fn$;

-- ── A visit: a teammate's space ───────────────────────────────────────────────────────
-- Somebody on Marketing's roster with a login; null for anybody else. Their space as they keep it — never the board's
-- layout (a visit draws its own) — the photo only under space/; their pet in numbers.
CREATE OR REPLACE FUNCTION public.mkt_space_of(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r record;
  v_s public.mkt_spaces;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  SELECT * INTO v_r FROM public.mkt_roster() r WHERE r.staff_id = p_staff;
  IF NOT FOUND OR v_r.user_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_s FROM public.mkt_spaces WHERE user_id = v_r.user_id;
  RETURN jsonb_build_object(
    'staff', v_r.staff_id, 'first', v_r.first_name, 'full', v_r.full_name, 'title', v_r.title, 'role', v_r.role_label,
    'space', CASE WHEN v_s.user_id IS NULL THEN NULL ELSE jsonb_build_object(
               'theme', v_s.theme, 'cover', v_s.cover, 'coverPath', v_s.cover_path, 'avatarPath', v_s.avatar_path,
               'status', v_s.status, 'notes', v_s.notes,
               'photoPath', CASE WHEN v_s.photo_path LIKE 'space/%' THEN v_s.photo_path END,
               'room', v_s.room, 'pet', v_s.pet, 'petPath', v_s.pet_path) END,
    'stats', public.mkt_pet_of(v_r.staff_id));
END
$fn$;

-- ── Who may call what ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_lobby() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_space_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_lobby() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_space_of(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
