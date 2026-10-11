-- ============================================================================
-- 20261011150000_rooms_on_behalf_and_app_ticks.sql
-- Meeting rooms after the user's answers to the round-2 review (2026-10-11).
--
-- A (review L3). A booking made for somebody else says who made it: the
--    schedule draws "Grace (for Chea Huan)". `on_behalf_by` keeps the name of
--    the account that booked it, as the trail's "Booked on their behalf by …"
--    already does. A change that names somebody else again sets it anew; a
--    change that keeps the person keeps it. Both of them still change or
--    cancel it, as before (`booked_by_user` is the account, `booked_by_staff`
--    the person).
-- B (review L6). The Revenue app's own ticks bind in the database too, not
--    only on the app's screens. A member (Revenue app · View, their own) reads
--    the rooms only while Profile · Book a room's View is open for them, and
--    books or cancels only while its Create is — what rooms-actions.ts already
--    refuses. `tab_box_closed(tab, action)` is the database's twin of
--    lib/page-tabs `closedBoxes` for one box, over `current_tabs()`: nothing is
--    closed for an account with no template, or whose tabs are still worked
--    out from its cells; over a template saved on tabs, a box is closed unless
--    its ticks (their own boxes over them) keep it and the tab's View; over a
--    template not saved on tabs, only a box held back (or its tab's View) is.
--
-- Every function is changed from PRODUCTION's body, one statement swapped
-- (pg_temp.swap_check, as 20261011120100): it refuses when production's
-- statement is not there exactly once, and a second run changes nothing.
-- Comments stay outside the function bodies: production keeps none inside
-- (the bodies of 20261011090000 came back without their comment lines).
-- ============================================================================

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
    RETURN;
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── A. Who made a booking made for somebody else ────────────────────────────

ALTER TABLE public.meeting_room_bookings ADD COLUMN IF NOT EXISTS on_behalf_by text;
COMMENT ON COLUMN public.meeting_room_bookings.on_behalf_by IS
  'The account that made it, when it is for somebody else (Booked by) — drawn "X (for Y)". NULL when booked for oneself.';

-- A new booking: the booker's name when it is for somebody else.
SELECT pg_temp.swap_check('public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid)',
  $q$booked_by_user, booked_by_staff, booked_by_name, internal_staff, external_guests, pax)
      VALUES (v_ref, p_room, p_day, p_from, p_to, v_title, p_source, v_dept, v_sub,
        auth.uid(), p_booked_by, v_by_name, v_internal, v_guests, v_pax)$q$,
  $q$booked_by_user, booked_by_staff, booked_by_name, on_behalf_by, internal_staff, external_guests, pax)
      VALUES (v_ref, p_room, p_day, p_from, p_to, v_title, p_source, v_dept, v_sub,
        auth.uid(), p_booked_by, v_by_name,
        CASE WHEN p_booked_by IS NOT NULL AND p_booked_by IS DISTINCT FROM v_actor_staff THEN v_actor_name END,
        v_internal, v_guests, v_pax)$q$);

-- A change: the same person keeps who made it; another person, whoever names them now (nobody, when it is themselves).
SELECT pg_temp.swap_check('public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid)',
  $q$sub_department_id = v_sub, booked_by_staff = p_booked_by, booked_by_name = v_by_name, internal_staff = v_internal,$q$,
  $q$sub_department_id = v_sub, booked_by_staff = p_booked_by, booked_by_name = v_by_name,
               on_behalf_by = CASE WHEN p_booked_by IS NOT DISTINCT FROM v_old.booked_by_staff THEN v_old.on_behalf_by
                                   WHEN p_booked_by IS NOT NULL AND p_booked_by IS DISTINCT FROM v_actor_staff THEN v_actor_name END,
               internal_staff = v_internal,$q$);

-- Every reader of a booking (the portal, both apps) gets it as `onBehalfBy`.
SELECT pg_temp.swap_check('public.meeting_rooms_rows(date, date, uuid[], boolean, boolean)',
  $q$'bookedBy', b.booked_by_name, 'bookedByStaff', b.booked_by_staff,$q$,
  $q$'bookedBy', b.booked_by_name, 'bookedByStaff', b.booked_by_staff, 'onBehalfBy', b.on_behalf_by,$q$);

-- ── B. The Revenue app's own ticks, in the database ─────────────────────────

-- One box of the caller's (`rev.rooms`, `create`): closed for them? The twin of lib/page-tabs closedBoxes.
CREATE OR REPLACE FUNCTION public.tab_box_closed(p_tab text, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v       jsonb := public.current_tabs();
  v_boxes jsonb;
  v_box   boolean;
  v_view  boolean;
BEGIN
  IF v IS NULL THEN
    RETURN false;
  END IF;
  v_boxes := coalesce(v->'boxes', '[]'::jsonb);
  IF jsonb_array_length(v_boxes) = 0 AND coalesce((v->>'cells')::boolean, false) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(v->'ticks') = 'array' THEN
    SELECT (b->>'granted')::boolean INTO v_box FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = p_action LIMIT 1;
    v_box := coalesce(v_box, (v->'ticks') ? (p_tab || '.' || p_action));
    IF p_action = 'view' THEN
      RETURN NOT v_box;
    END IF;
    SELECT (b->>'granted')::boolean INTO v_view FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = 'view' LIMIT 1;
    v_view := coalesce(v_view, (v->'ticks') ? (p_tab || '.view'));
    RETURN NOT (v_box AND v_view);
  END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(v_boxes) b
                  WHERE b->>'tab' = p_tab AND b->>'action' IN (p_action, 'view') AND NOT (b->>'granted')::boolean);
END
$fn$;

REVOKE ALL ON FUNCTION public.tab_box_closed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tab_box_closed(text, text) TO service_role;

-- A member reading (`view`) or booking and cancelling (`create`) from the Revenue app, while Profile · Book a room leaves it open.
CREATE OR REPLACE FUNCTION public.meeting_rooms_member_open(p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN public.has_any_action(ARRAY['revenue_app.view:own']) AND NOT public.tab_box_closed('rev.rooms', p_action);
END
$fn$;

REVOKE ALL ON FUNCTION public.meeting_rooms_member_open(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_member_open(text) TO service_role;

-- The three readers a member uses: Meeting rooms · View, or the app's View box.
SELECT pg_temp.swap_check('public.meeting_rooms_range(date, date)',
  $q$IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN$q$,
  $q$IF NOT (public.has_any_action(ARRAY['rooms.view']) OR public.meeting_rooms_member_open('view')) THEN$q$);
SELECT pg_temp.swap_check('public.meeting_rooms_booking(uuid)',
  $q$IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN$q$,
  $q$IF NOT (public.has_any_action(ARRAY['rooms.view']) OR public.meeting_rooms_member_open('view')) THEN$q$);
SELECT pg_temp.swap_check('public.meeting_rooms_people()',
  $q$IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN$q$,
  $q$IF NOT (public.has_any_action(ARRAY['rooms.view']) OR public.meeting_rooms_member_open('view')) THEN$q$);

-- Booking from the app: Meeting rooms · Create, or the app's Create box.
SELECT pg_temp.swap_check('public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid)',
  $q$IF NOT public.has_any_action(CASE WHEN p_source = 'app' THEN ARRAY['rooms.create', 'revenue_app.view:own'] ELSE ARRAY['rooms.create'] END) THEN$q$,
  $q$IF NOT (public.has_any_action(ARRAY['rooms.create']) OR (p_source = 'app' AND public.meeting_rooms_member_open('create'))) THEN$q$);

-- Cancelling: Meeting rooms · Create or Edit, or the app's Create box (the app: "Create unticked, nothing is booked or cancelled").
SELECT pg_temp.swap_check('public.meeting_rooms_cancel(uuid)',
  $q$IF NOT public.has_any_action(ARRAY['rooms.create', 'rooms.edit', 'revenue_app.view:own']) THEN$q$,
  $q$IF NOT (public.has_any_action(ARRAY['rooms.create', 'rooms.edit']) OR public.meeting_rooms_member_open('create')) THEN$q$);
