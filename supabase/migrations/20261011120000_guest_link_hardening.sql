-- ============================================================================
-- 20261011120000_guest_link_hardening.sql
-- The guest link, hardened after the round-2 security review (2026-10-11,
-- `.design/hr-r2/review-security.md` — M1, L8, L9). The link is OFF on
-- production and stays off: nothing here turns it on, and nobody's day changes.
-- ============================================================================
--
-- What a guest could do with the code (M1), and what stops it now:
--
--   1. UPLOADS TAKE ONE NAME ONLY. The storage policy `guest_link_uploads` let
--      the publishable key put ANY name under guest/<code>/ — only the request
--      checked the <uuid>.<ext> shape, when it named a file. Now the policy
--      itself asks for exactly what `lib/guest/upload.ts` writes:
--      guest/hv-<the code>/<uuid>.<pdf|doc|docx|png|jpg|jpeg|webp> — the code
--      alphabet is `guest_link_make_code()`'s (A–Z without I and O, 2–9) — and
--      still asks `guest_link_may_upload(<the code>)`.
--
--   2. VOLUME CAPS, counted from the tables' own timestamps over the last hour
--      (`now()`: an instant, not a day — the office clock does not apply):
--        guest_link_may_upload  false once 40 files went under guest/ in the
--                               last hour (storage.objects.created_at);
--        guest_link_hire        refuses once 20 guest requests were filed in
--                               the last hour (hiring_requests.submitted_at);
--        guest_link_book        refuses once 40 bookings or changes came in
--                               through the link in the last hour (its own
--                               trail lines: Booked / Edited via guest link —
--                               a change writes as much as a booking does);
--        guest_link_cancel      refuses once 40 cancellations came in through
--                               the link in the last hour (Cancelled via guest
--                               link).
--      Each says "Too many requests from the guest link just now. Try again
--      later." (P0001, which the guest page passes on). Honest use — a few
--      bookings a day from the subsidiaries' staff — never meets them; a
--      script holding a leaked code fills an hour's worth and waits.
--
--   3. REQUEST MANPOWER STARTS OFF (L8). Turning the link on for room booking
--      also opened the anonymous hiring form and the anonymous upload policy,
--      because `guest_link.hiring` defaulted to true. It defaults to false now,
--      and the one row is set to false (the link is off, so no guest sees a
--      difference). HR turns it on with Admin › Guest Link's own switch.
--
-- The four functions keep PRODUCTION's bodies: one statement swapped in each by
-- `pg_temp.swap_check` (whitespace-blind, exactly once, refused if production
-- changed). md5(prosrc) on production before this migration, equal to the repo's
-- copies: guest_link_may_upload e20f6b4c…, guest_link_hire 8bbe4ea2…,
-- guest_link_book 2d0d98ef…, guest_link_cancel 284dbc31…. CREATE OR REPLACE
-- keeps each one's owner and grants — the five stay anon's BY NAME.
--
-- L9: the comment above `hiring_files_write` in 20261011080000 (guest uploads
-- "go under guest/ through its function, never this policy") predates the guest
-- link. Guest files are written by the publishable key under
-- `guest_link_uploads` (below); `.claude/rules/hr/hiring.md` now says so.

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

-- ── 1. The upload question: the link open AND fewer than 40 files this hour ──

SELECT pg_temp.swap_check('public.guest_link_may_upload(text)',
  $q$RETURN EXISTS (SELECT 1 FROM public.guest_link_open(p_code, 'hiring'));$q$,
  $q$RETURN EXISTS (SELECT 1 FROM public.guest_link_open(p_code, 'hiring'))
     -- At most 40 files an hour come in through the link, whoever holds it (2026-10-11, review M1).
     AND (SELECT count(*) FROM storage.objects o
           WHERE o.bucket_id = 'hiring-files' AND o.name LIKE 'guest/%'
             AND o.created_at > now() - interval '1 hour') < 40;$q$);

-- ── 2. Request manpower: at most 20 requests an hour ────────────────────────

SELECT pg_temp.swap_check('public.guest_link_hire(text, uuid, text, jsonb, text, text)',
  $q$IF to_regprocedure('public.hiring_file_guest_request(text, text, text, text, jsonb, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Requests are not open yet.';
  END IF;$q$,
  $q$IF to_regprocedure('public.hiring_file_guest_request(text, text, text, text, jsonb, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Requests are not open yet.';
  END IF;
  -- At most 20 requests an hour come in through the link (2026-10-11, review M1).
  IF (SELECT count(*) FROM public.hiring_requests r
       WHERE r.source = 'guest' AND r.submitted_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Too many requests from the guest link just now. Try again later.';
  END IF;$q$);

-- ── 3. Book a room: at most 40 bookings or changes an hour ──────────────────

SELECT pg_temp.swap_check('public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text)',
  $q$RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;$q$,
  $q$RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;
  -- At most 40 bookings and changes an hour come in through the link (2026-10-11, review M1).
  IF (SELECT count(*) FROM public.meeting_room_booking_events e
       WHERE e.what IN ('Booked via guest link', 'Edited via guest link')
         AND e.at > now() - interval '1 hour') >= 40 THEN
    RAISE EXCEPTION 'Too many requests from the guest link just now. Try again later.';
  END IF;$q$);

-- ── 4. Cancel: at most 40 cancellations an hour ─────────────────────────────

SELECT pg_temp.swap_check('public.guest_link_cancel(text, uuid, text)',
  $q$RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;$q$,
  $q$RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;
  -- At most 40 cancellations an hour come in through the link (2026-10-11, review M1).
  IF (SELECT count(*) FROM public.meeting_room_booking_events e
       WHERE e.what = 'Cancelled via guest link' AND e.at > now() - interval '1 hour') >= 40 THEN
    RAISE EXCEPTION 'Too many requests from the guest link just now. Try again later.';
  END IF;$q$);

-- ── 5. The upload policy: one name only ─────────────────────────────────────
-- guest/hv-<code>/<uuid>.<ext>, exactly as lib/guest/upload.ts names a file;
-- the code must still be the link's current one with Request manpower open.

DO $pol$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'guest_link_uploads') THEN
    ALTER POLICY guest_link_uploads ON storage.objects TO anon, authenticated
      WITH CHECK (bucket_id = 'hiring-files'
                  AND name ~ '^guest/hv-[A-HJ-NP-Z2-9]{8}/[0-9a-f-]{36}\.(pdf|doc|docx|png|jpe?g|webp)$'
                  AND (SELECT public.guest_link_may_upload((storage.foldername(name))[2])));
  END IF;
END
$pol$;

-- ── 6. Request manpower starts off (L8) ─────────────────────────────────────

ALTER TABLE public.guest_link ALTER COLUMN hiring SET DEFAULT false;

UPDATE public.guest_link
   SET hiring = false, updated_at = now(), updated_by = auth.uid()
 WHERE id = 1 AND hiring;

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.guest_link_may_upload(text)',
                              'public.guest_link_hire(text, uuid, text, jsonb, text, text)',
                              'public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text)',
                              'public.guest_link_cancel(text, uuid, text)'] LOOP
    IF NOT has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: anon lost EXECUTE — the guest page would stop', v_fn;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '%: no longer SECURITY DEFINER', v_fn;
    END IF;
    IF strpos((SELECT p.prosrc FROM pg_proc p WHERE p.oid = v_fn::regprocedure), 'interval ''1 hour''') = 0 THEN
      RAISE EXCEPTION '%: its hourly cap is missing', v_fn;
    END IF;
  END LOOP;
  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'guest_link_uploads'
                        AND with_check LIKE '%^guest/hv-[A-HJ-NP-Z2-9]{8}/[0-9a-f-]{36}%') THEN
    RAISE EXCEPTION 'guest_link_uploads: the pinned name is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guest_link WHERE hiring) THEN
    RAISE EXCEPTION 'guest_link: Request manpower is still on';
  END IF;
END
$guard$;
