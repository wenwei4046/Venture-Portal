-- Air ticket claim (2026-10-31 — the user, on Member services › Transport claim's *Who can claim transport*: "我要加
-- 多一个 Air ticket claim 的 column。因为有一些人如果不可以 claim 普通 transport claim，但他可以 claim Air ticket
-- claim，所以我要在那边有一个打勾的 option … if the venue is accept for air ticket, then these guys with tick can
-- claim，就算他们没有 tick transport claim，但是其他除了 ticket 以外，他就不能给 因为他没有 tick 那个 transport claim").
--
-- A transport claim is three things: Outstation by road (spots × the rate), a plane ticket (a fair in a region HR
-- ticked *Flown to*) and an Airbnb stay. Until today the one *Transport claim* tick opened all three. Now two ticks,
-- each its own:
-- 1. `member_claim_rates.air_ticket_title_ids` — the titles whose holders may claim a plane ticket. SEEDED with the
--    titles ticked for the transport claim (on 2026-10-31 Senior Revenue Specialist and Revenue Specialist), so nobody
--    loses the plane ticket on the day — once, when the column is made; HR ticks and unticks from there. The
--    *Transport claim* tick keeps Outstation by road and the Airbnb stay. A title may hold either, both or neither.
-- 2. `member_transport_claim_open(staff, sub, part)` refuses a member whose seat title in the sub-department claimed
--    for is not ticked for that part: 'transport' (by road, an Airbnb stay, an old-style claim), 'plane', or 'either'
--    (an outstation claim before its region is known). The two-argument one — an old-style claim with no claimType,
--    from `member_prepare_request` — asks it for 'transport'.
-- 3. `member_claim_detail_for` asks 'either' at its gate for Outstation and 'transport' for an Airbnb stay; once the
--    venue's region is read, 'plane' for a region flown to and 'transport' for one by road — production's body, three
--    statements swapped (pg_temp.swap_check: refuses when production changed since; a second run changes nothing).
-- 4. `member_claim_settings()` hands the member's form `transport.airTicketTitles` beside `transport.titles`, so the
--    app offers *Submit transport claim* — a plane ticket only — to a title ticked for the air ticket alone.
-- 5. HR's list (`member_admin_transport_claim`) says which titles hold each tick, and lists a title ticked for the
--    air ticket alone; its Save `member_admin_save_transport_claim(p_changes jsonb)` writes only the boxes HR changed
--    — each a title's tick on or off — so a second copy of the window saved meanwhile is not undone (the portal's
--    logins are shared). The one-list Save (uuid[]) is left for a page opened before this release; it keeps the air
--    ticket list as it stands.
--
-- No new table. Comments stay outside the function bodies.

-- ── 1. HR's second tick ─────────────────────────────────────────────────────

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'member_claim_rates' AND column_name = 'air_ticket_title_ids') THEN
    ALTER TABLE public.member_claim_rates ADD COLUMN air_ticket_title_ids uuid[] NOT NULL DEFAULT '{}';
    UPDATE public.member_claim_rates SET air_ticket_title_ids = transport_title_ids WHERE id;
  END IF;
END
$do$;

COMMENT ON COLUMN public.member_claim_rates.air_ticket_title_ids IS
  'The titles whose holders may claim a plane ticket — a fair in a region HR flies to (2026-10-31): the member''s seat title in the sub-department claimed for, whether or not it is ticked for the transport claim (transport_title_ids: by road and an Airbnb stay). Written by member_admin_save_transport_claim only.';
COMMENT ON COLUMN public.member_claim_rates.transport_title_ids IS
  'The titles whose holders may send a transport claim by road (Outstation''s spots) and an Airbnb stay (2026-10-20; a plane ticket is air_ticket_title_ids'' since 2026-10-31): the member''s seat title in the sub-department claimed for. Written by member_admin_save_transport_claim only.';

-- ── Helpers: production's body as it was, or already changed by this file ───

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

CREATE OR REPLACE FUNCTION pg_temp.body_was(p_sig regprocedure, p_md5 text, p_mark text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF strpos(v_src, p_mark) = 0 AND md5(replace(v_src, E'\r', '')) <> p_md5 THEN
    RAISE EXCEPTION '%: production changed since this migration was written (md5 %)', p_sig, md5(replace(v_src, E'\r', ''));
  END IF;
END
$fn$;

-- ── 2. Who may send which part ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid, p_part text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_title uuid;
  v_title_name text;
  v_rates public.member_claim_rates%ROWTYPE;
  v_road boolean;
  v_plane boolean;
BEGIN
  IF p_part IS NULL OR p_part NOT IN ('transport', 'plane', 'either') THEN
    RAISE EXCEPTION 'Unknown part of a transport claim: %', coalesce(p_part, 'none');
  END IF;
  SELECT h.title_id, t.name INTO v_title, v_title_name
    FROM public.comm_hierarchy h
    JOIN public.comm_schemes c ON c.id = h.scheme_id
    LEFT JOIN public.titles t ON t.id = h.title_id
   WHERE h.staff_id = p_staff AND c.sub_department_id = p_sub AND c.is_active
     AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
     AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
   ORDER BY c.effective_from DESC
   LIMIT 1;
  SELECT * INTO v_rates FROM public.member_claim_rates r WHERE r.id;
  v_road := v_title = ANY (coalesce(v_rates.transport_title_ids, '{}'::uuid[]));
  v_plane := v_title = ANY (coalesce(v_rates.air_ticket_title_ids, '{}'::uuid[]));
  IF p_part = 'plane' AND v_plane IS NOT TRUE THEN
    RAISE EXCEPTION 'A plane ticket claim is not open to %. HR picks the titles that may claim it.', coalesce(v_title_name, 'your title')
      USING ERRCODE = '42501';
  END IF;
  IF p_part = 'transport' AND v_road IS NOT TRUE AND v_plane IS TRUE THEN
    RAISE EXCEPTION '% may claim a plane ticket only. HR picks the titles that may claim the rest.', coalesce(v_title_name, 'Your title')
      USING ERRCODE = '42501';
  END IF;
  IF (p_part = 'transport' AND v_road IS NOT TRUE) OR (p_part = 'either' AND v_road IS NOT TRUE AND v_plane IS NOT TRUE) THEN
    RAISE EXCEPTION 'A transport claim is not open to %. HR picks the titles that may claim it.', coalesce(v_title_name, 'your title')
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.member_transport_claim_open(uuid, uuid, text) IS
  'A transport claim''s parts are the ticked titles'' (2026-10-31): refuses a member whose seat title in the sub-department claimed for is not ticked for the part asked — ''transport'' (by road, an Airbnb stay: member_claim_rates.transport_title_ids), ''plane'' (air_ticket_title_ids) or ''either''. Called by member_claim_detail_for and, through the two-argument one, member_prepare_request.';

REVOKE ALL ON FUNCTION public.member_transport_claim_open(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_transport_claim_open(uuid, uuid, text) TO service_role;

SELECT pg_temp.body_was('public.member_transport_claim_open(uuid, uuid)'::regprocedure,
  '113c1c1cb851788854f8dfba4f9f3987', $mark$p_sub, 'transport')$mark$);

CREATE OR REPLACE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.member_transport_claim_open(p_staff, p_sub, 'transport');
END
$fn$;

COMMENT ON FUNCTION public.member_transport_claim_open(uuid, uuid) IS
  'An old-style claim (no claimType) is a transport claim by road (2026-10-20; since 2026-10-31 the three-argument one''s ''transport''): refuses a member whose seat title in the sub-department claimed for is not in member_claim_rates.transport_title_ids. Called by member_prepare_request only.';

REVOKE ALL ON FUNCTION public.member_transport_claim_open(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_transport_claim_open(uuid, uuid) TO service_role;

-- ── 3. Outstation and Airbnb, worked out: each part asked for its own tick ──

-- 3a. The gate: an outstation claim goes on when either tick is there (its region decides next); an Airbnb stay is
--     the transport tick's.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$PERFORM public.member_transport_claim_open(p_staff, p_sub);$old$,
  $new$PERFORM public.member_transport_claim_open(p_staff, p_sub, CASE WHEN v_type='outstation' THEN 'either' ELSE 'transport' END);$new$);

-- 3b. A region flown to: the plane ticket's tick.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF v_region.plane_ticket THEN$old$,
  $new$IF v_region.plane_ticket THEN
   PERFORM public.member_transport_claim_open(p_staff, p_sub, 'plane');$new$);

-- 3c. A region by road: the transport tick's.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF v_region.spots<=0 THEN RAISE EXCEPTION '% is in %, local to %, so there is no outstation claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley'); END IF;$old$,
  $new$PERFORM public.member_transport_claim_open(p_staff, p_sub, 'transport');
  IF v_region.spots<=0 THEN RAISE EXCEPTION '% is in %, local to %, so there is no outstation claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley'); END IF;$new$);

-- ── 4. The member's form: who may claim a plane ticket ──────────────────────

SELECT pg_temp.swap_check('public.member_claim_settings()'::regprocedure,
  $old$'transport',jsonb_build_object('titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT transport_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),$old$,
  $new$'transport',jsonb_build_object('titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT transport_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb),
   'airTicketTitles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT air_ticket_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),$new$);

-- ── 5. HR's list, and its Save ──────────────────────────────────────────────

-- 5a. The list says which titles hold the air ticket's tick…
SELECT pg_temp.swap_check('public.member_admin_transport_claim()'::regprocedure,
  $old$'titleIds', to_jsonb(coalesce(v_rates.transport_title_ids, '{}'::uuid[])),$old$,
  $new$'titleIds', to_jsonb(coalesce(v_rates.transport_title_ids, '{}'::uuid[])),
    'airTicketTitleIds', to_jsonb(coalesce(v_rates.air_ticket_title_ids, '{}'::uuid[])),$new$);

-- 5b. …and lists a title ticked for it alone.
SELECT pg_temp.swap_check('public.member_admin_transport_claim()'::regprocedure,
  $old$OR t.id = ANY (coalesce(v_rates.transport_title_ids, '{}'::uuid[]))$old$,
  $new$OR t.id = ANY (coalesce(v_rates.transport_title_ids, '{}'::uuid[]))
         OR t.id = ANY (coalesce(v_rates.air_ticket_title_ids, '{}'::uuid[]))$new$);

COMMENT ON FUNCTION public.member_admin_transport_claim() IS
  'Member services › Transport claim''s Who can claim (2026-10-20; the air ticket''s tick since 2026-10-31): every Revenue title — the sub-departments'' department''s, any title held on a seat today, any ticked — the highest level first, with how many hold a seat on it today, and which are ticked for the transport claim (titleIds) and for the air ticket (airTicketTitleIds).';

-- 5c. Save: only the boxes HR changed, each [{"titleId", "transport"?: bool, "airTicket"?: bool}].
CREATE OR REPLACE FUNCTION public.member_admin_save_transport_claim(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rates public.member_claim_rates%ROWTYPE;
  v_road uuid[];
  v_plane uuid[];
  v_change jsonb;
  v_title uuid;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) > 120 THEN
    RAISE EXCEPTION 'Check the titles ticked';
  END IF;
  IF jsonb_array_length(p_changes) = 0 THEN
    RETURN public.member_admin_transport_claim();
  END IF;
  INSERT INTO public.member_claim_rates (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_rates FROM public.member_claim_rates WHERE id FOR UPDATE;
  v_road := coalesce(v_rates.transport_title_ids, '{}'::uuid[]);
  v_plane := coalesce(v_rates.air_ticket_title_ids, '{}'::uuid[]);
  FOR v_change IN SELECT x FROM jsonb_array_elements(p_changes) x LOOP
    IF jsonb_typeof(v_change) IS DISTINCT FROM 'object'
       OR coalesce(v_change->>'titleId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT (v_change ? 'transport' OR v_change ? 'airTicket')
       OR (v_change ? 'transport' AND jsonb_typeof(v_change->'transport') IS DISTINCT FROM 'boolean')
       OR (v_change ? 'airTicket' AND jsonb_typeof(v_change->'airTicket') IS DISTINCT FROM 'boolean') THEN
      RAISE EXCEPTION 'Check the titles ticked';
    END IF;
    v_title := (v_change->>'titleId')::uuid;
    IF (coalesce((v_change->>'transport')::boolean, false) OR coalesce((v_change->>'airTicket')::boolean, false))
       AND NOT EXISTS (SELECT 1 FROM public.titles t WHERE t.id = v_title) THEN
      RAISE EXCEPTION 'A title picked is no longer in People. Reload the page and pick again';
    END IF;
    IF v_change ? 'transport' THEN
      v_road := array_remove(v_road, v_title) || CASE WHEN (v_change->>'transport')::boolean THEN ARRAY[v_title] ELSE '{}'::uuid[] END;
    END IF;
    IF v_change ? 'airTicket' THEN
      v_plane := array_remove(v_plane, v_title) || CASE WHEN (v_change->>'airTicket')::boolean THEN ARRAY[v_title] ELSE '{}'::uuid[] END;
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_road FROM unnest(v_road) x WHERE x IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_plane FROM unnest(v_plane) x WHERE x IS NOT NULL;
  IF cardinality(v_road) > 60 OR cardinality(v_plane) > 60 THEN
    RAISE EXCEPTION 'Keep it to 60 titles';
  END IF;
  UPDATE public.member_claim_rates
     SET transport_title_ids = v_road, air_ticket_title_ids = v_plane,
         transport_updated_at = now(), transport_updated_by = auth.uid()
   WHERE id;
  RETURN public.member_admin_transport_claim();
END
$fn$;

COMMENT ON FUNCTION public.member_admin_save_transport_claim(jsonb) IS
  'Member services › Transport claim''s Who can claim, saved (2026-10-31): only the boxes HR changed — each a title''s transport or air ticket tick, on or off — over the lists as they stand, so a second copy of the window saved meanwhile is not undone. The back office''s door and Member services · Edit.';

REVOKE ALL ON FUNCTION public.member_admin_save_transport_claim(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_transport_claim(jsonb) TO authenticated;

COMMENT ON FUNCTION public.member_admin_save_transport_claim(uuid[]) IS
  'Member services › Transport claim''s Who can claim, saved as one list (2026-10-20): the titles ticked for the transport claim; the air ticket''s ticks stay as they are. For a page opened before 2026-10-31 — the window sends member_admin_save_transport_claim(jsonb) since.';

NOTIFY pgrst, 'reload schema';
