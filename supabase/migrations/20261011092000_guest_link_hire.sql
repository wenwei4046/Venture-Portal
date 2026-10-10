-- ============================================================================
-- 20261011092000_guest_link_hire.sql
-- The guest link's third part, Request manpower (2026-10-11, the HR revamp's
-- second package — README §16, `Guest Booking.dc.html`'s step-by-step form):
-- a guest files a hiring request into Hiring › Requests through the Hiring
-- module's own guest door, `hiring_file_guest_request`, on the form Hiring ›
-- Form settings keeps (`hiring_guest_form`) — both mig 20261011080000. They
-- are looked up by name when called, so until the Hiring module is there the
-- part simply does not open.
--
-- A job description may be attached. The guest's browser puts the file in the
-- private `hiring-files` bucket under guest/<code>/ — one storage policy lets
-- the publishable key do exactly that, and only while the link is on with this
-- part open; nobody outside reads it back (Hiring reads it by a signed link).
-- The request then names the file, which must be under the CURRENT code's
-- folder and really there.
-- ============================================================================

-- The page, now with Request manpower's form when the part is open.
CREATE OR REPLACE FUNCTION public.guest_link_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g       public.guest_link%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_form  jsonb;
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'page');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('on', false);
  END IF;
  -- Request manpower: Hiring › Form settings' fields, once the Hiring module is there.
  IF g.hiring AND to_regprocedure('public.hiring_guest_form()') IS NOT NULL
     AND to_regprocedure('public.hiring_file_guest_request(text, text, text, text, jsonb, text, text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.hiring_guest_form()' INTO v_form;
  END IF;
  RETURN jsonb_build_object(
    'on', true,
    'booking', g.booking,
    'hiring', v_form IS NOT NULL,
    'hireForm', coalesce(v_form, '[]'::jsonb),
    'days', g.days_ahead,
    'today', v_today,
    'rooms', coalesce((SELECT jsonb_agg(public.guest_link_room_json(r) ORDER BY r.sort_order, r.name)
                         FROM public.meeting_rooms r
                        WHERE r.deleted_at IS NULL AND r.bookable AND r.guest_bookable), '[]'::jsonb),
    'allRooms', coalesce((SELECT jsonb_agg(public.guest_link_room_json(r) ORDER BY r.sort_order, r.name)
                            FROM public.meeting_rooms r
                           WHERE r.deleted_at IS NULL AND r.bookable), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
                               'departments', to_jsonb(s.departments)) ORDER BY s.sort_order, s.name)
                        FROM public.guest_link_subsidiaries s WHERE s.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- The storage policy's question: may a file go under guest/<p_code>/ now?
CREATE OR REPLACE FUNCTION public.guest_link_may_upload(p_code text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.guest_link_open(p_code, 'hiring'));
END
$fn$;

-- Send a request to HR: the company (one of the link's), the guest's name, the
-- answers to Hiring › Form settings' fields, and the attached file if any.
CREATE OR REPLACE FUNCTION public.guest_link_hire(
  p_code            text,
  p_subsidiary      uuid,
  p_name            text,
  p_answers         jsonb,
  p_attachment_path text,
  p_attachment_name text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g      public.guest_link%ROWTYPE;
  v_sub  public.guest_link_subsidiaries%ROWTYPE;
  v_name text := btrim(coalesce(p_name, ''));
  v_miss text[] := '{}';
  v_path text := nullif(btrim(coalesce(p_attachment_path, '')), '');
  v_file text := nullif(btrim(coalesce(p_attachment_name, '')), '');
  v_id   text;
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'hiring');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;
  IF to_regprocedure('public.hiring_file_guest_request(text, text, text, text, jsonb, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Requests are not open yet.';
  END IF;
  SELECT * INTO v_sub FROM public.guest_link_subsidiaries WHERE id = p_subsidiary AND deleted_at IS NULL;
  IF NOT FOUND THEN v_miss := v_miss || 'Company'::text; END IF;
  IF v_name = '' THEN v_miss := v_miss || 'Your name'::text; END IF;
  IF cardinality(v_miss) > 0 THEN
    RAISE EXCEPTION 'Fill in %.', array_to_string(v_miss, ', ');
  END IF;
  IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;
  IF v_path IS NOT NULL THEN
    -- Only a file this link's own guests could have put there, and only one that is there.
    IF v_path !~ ('^guest/' || g.code || '/[0-9a-f-]{36}\.(pdf|doc|docx|png|jpe?g|webp)$') THEN
      RAISE EXCEPTION 'Attach the file again.';
    END IF;
    IF to_regclass('storage.objects') IS NULL
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hiring-files' AND o.name = v_path) THEN
      RAISE EXCEPTION 'Attach the file again.';
    END IF;
    v_file := left(coalesce(v_file, 'Job description'), 200);
  ELSE
    v_file := NULL;
  END IF;
  EXECUTE 'SELECT public.hiring_file_guest_request($1, $2, $3, $4, $5, $6, $7)'
    INTO v_id
    USING v_sub.name, NULL::text, v_name, NULL::text, coalesce(p_answers, '{}'::jsonb), v_path, v_file;
  RETURN jsonb_build_object('id', v_id, 'position', coalesce(nullif(btrim(p_answers ->> 'position'), ''), 'the role'));
END
$fn$;

-- The publishable key may put a file under guest/<code>/ in hiring-files —
-- while the link is on with Request manpower open — and do nothing else there.
DO $pol$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'guest_link_uploads') THEN
    CREATE POLICY guest_link_uploads ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'hiring-files' AND (storage.foldername(name))[1] = 'guest'
                  AND (SELECT public.guest_link_may_upload((storage.foldername(name))[2])));
  END IF;
END
$pol$;

-- ── Who may call them ───────────────────────────────────────────────────────
-- The guest page's: anybody holding the link, by name — each checks the code.

REVOKE ALL ON FUNCTION public.guest_link_may_upload(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_link_hire(text, uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_link_may_upload(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_hire(text, uuid, text, jsonb, text, text) TO anon, authenticated;
