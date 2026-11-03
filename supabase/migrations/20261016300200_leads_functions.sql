-- ============================================================================
-- 20261016300200_leads_functions.sql
-- Lead View (2026-10-16): the lead_* functions over the tables of
-- 20261016300100 — see that file's head for who may call which.
-- ============================================================================

-- ── Helpers (other lead_* functions only) ────────────────────────────────────

-- Who is acting, as their name (the staff record signed in as, else the account).
CREATE OR REPLACE FUNCTION public.lead_actor_name()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v text;
BEGIN
  SELECT s.employee_name INTO v FROM public.hr_staff_costs s
   WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.created_at LIMIT 1;
  IF v IS NULL THEN
    SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v FROM public.users u WHERE u.id = auth.uid();
  END IF;
  RETURN coalesce(v, 'System');
END
$fn$;

CREATE OR REPLACE FUNCTION public.lead_need(p_wants text[], p_words text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(p_wants) THEN
    RAISE EXCEPTION '%', p_words USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.lead_event(p_contact uuid, p_what text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
  VALUES (p_contact, left(p_what, 200), public.lead_actor_name(), auth.uid())
$fn$;

-- The first Malaysian mobile number in a message, digits only (0123384721), or NULL.
-- Takes 012-338 4721, 0123384721, +60 12 338 4721, 6012-3384721, 011-2093 4471.
-- Twin: findPhone() in src/lib/leads/phone.ts.
CREATE OR REPLACE FUNCTION public.lead_find_phone(p_text text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  m text[];
  d text;
BEGIN
  m := regexp_match(coalesce(p_text, ''), '(?:^|[^0-9+])(\+?6?0?[\s-]?1[0-9](?:[\s-]?[0-9]){7,8})(?![0-9])');
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  d := regexp_replace(m[1], '[^0-9]', '', 'g');
  IF d LIKE '60%' THEN
    d := substr(d, 2);
  ELSIF d LIKE '1%' THEN
    d := '0' || d;
  END IF;
  RETURN CASE WHEN d ~ '^01[0-9]{8,9}$' THEN d END;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_actor_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_need(text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_event(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_find_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_actor_name() TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_need(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_event(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_find_phone(text) TO service_role;

-- A conversation as every screen draws it.
CREATE OR REPLACE FUNCTION public.lead_contact_json(c public.lead_contacts)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id', c.id, 'brandId', c.brand_id, 'channel', c.channel, 'isTest', c.is_test, 'name', c.name,
    'sourceAd', c.source_ad, 'phone', c.phone, 'phoneState', c.phone_state, 'phoneAt', c.phone_at,
    'interest', c.interest, 'budget', c.budget, 'showroom', c.showroom, 'preferredTime', c.preferred_time,
    'note', c.note, 'handedSalesId', c.handed_sales_id, 'handedSalesName', s.name, 'handedAt', c.handed_at,
    'handedByName', c.handed_by_name, 'appt', c.appt, 'shown', c.shown, 'lastAt', c.last_at,
    'lastDir', c.last_dir, 'lastText', c.last_text, 'createdAt', c.created_at)
    FROM (SELECT 1) one
    LEFT JOIN public.lead_sales s ON s.id = c.handed_sales_id
$fn$;
REVOKE ALL ON FUNCTION public.lead_contact_json(public.lead_contacts) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_contact_json(public.lead_contacts) TO service_role;

-- ── Readers ──────────────────────────────────────────────────────────────────

-- The brands, their salespeople (each with their leads this week — the rotation's count), and the counts on the sidebar.
CREATE OR REPLACE FUNCTION public.lead_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'brands', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'tone', b.tone, 'fbPageId', b.fb_page_id, 'igAccountId', b.ig_account_id,
        'handoffMode', b.handoff_mode, 'sortOrder', b.sort_order,
        'sales', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'phone', s.phone, 'showroom', s.showroom, 'sortOrder', s.sort_order,
            'week', (SELECT count(*) FROM public.lead_contacts c
                      WHERE c.handed_sales_id = s.id AND c.handed_at > now() - interval '7 days'))
            ORDER BY s.sort_order, s.name)
            FROM public.lead_sales s WHERE s.brand_id = b.id AND s.deleted_at IS NULL), '[]'::jsonb))
        ORDER BY b.sort_order, b.name)
        FROM public.lead_brands b WHERE b.deleted_at IS NULL), '[]'::jsonb),
    'waiting', (SELECT count(*) FROM public.lead_contacts c WHERE c.last_dir = 'in' AND c.handed_at IS NULL),
    'unhanded', (SELECT count(*) FROM public.lead_contacts c WHERE c.phone IS NOT NULL AND c.handed_at IS NULL));
END
$fn$;

-- The Inbox's list: the latest conversations first (500 at most — older ones are on Leads).
CREATE OR REPLACE FUNCTION public.lead_inbox()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(public.lead_contact_json(c) ORDER BY c.last_at DESC)
      FROM (SELECT * FROM public.lead_contacts ORDER BY last_at DESC LIMIT 500) c), '[]'::jsonb);
END
$fn$;

-- One conversation: the customer, every message, the timeline.
CREATE OR REPLACE FUNCTION public.lead_thread(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'contact', public.lead_contact_json(c),
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'direction', m.direction, 'sender', m.sender, 'byName', m.by_name, 'body', m.body,
        'phoneFound', m.phone_found, 'delivery', m.delivery, 'at', m.created_at) ORDER BY m.id)
        FROM public.lead_messages m WHERE m.contact_id = c.id), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('what', e.what, 'by', e.actor_name, 'at', e.at) ORDER BY e.at, e.id)
        FROM public.lead_events e WHERE e.contact_id = c.id), '[]'::jsonb));
END
$fn$;

-- Every conversation that started in [p_from, p_to) — Leads lists those with a phone, Insight counts them all.
CREATE OR REPLACE FUNCTION public.lead_list(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Pick a period of a year or less.' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.lead_contact_json(c) ORDER BY c.created_at DESC)
      FROM public.lead_contacts c
     WHERE (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_from
       AND (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < p_to), '[]'::jsonb);
END
$fn$;

-- ── Writes: replies and test enquiries (leads.create) ────────────────────────

-- Customer Service replies. Recorded only until Meta is connected (and always for a test conversation).
CREATE OR REPLACE FUNCTION public.lead_reply(p_contact uuid, p_body text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  IF v_body = '' THEN
    RAISE EXCEPTION 'Write a reply first.' USING ERRCODE = '22023';
  END IF;
  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'A reply is 2,000 characters at most.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lead_messages (contact_id, direction, sender, by_user, by_name, body)
  VALUES (p_contact, 'out', 'cs', auth.uid(), public.lead_actor_name(), v_body)
  RETURNING id INTO v_id;
  UPDATE public.lead_contacts
     SET last_at = now(), last_dir = 'out', last_text = left(v_body, 200), updated_at = now()
   WHERE id = p_contact;
  RETURN v_id;
END
$fn$;

-- Settings › Test: a customer's message as if it came from Meta, on a test conversation
-- (one per brand, channel and name). A phone in it is found as a real one would be.
CREATE OR REPLACE FUNCTION public.lead_simulate(p_brand uuid, p_channel text, p_name text, p_ad text, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_ad text := btrim(coalesce(p_ad, ''));
  v_phone text;
  v_contact public.lead_contacts;
  v_new boolean := false;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'A test enquiry needs Lead View · Create.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pick a brand.' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS DISTINCT FROM 'messenger' AND p_channel IS DISTINCT FROM 'instagram' THEN
    RAISE EXCEPTION 'Pick Messenger or Instagram.' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Give the test customer a name (80 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_body = '' OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Write the customer''s message (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;
  v_phone := public.lead_find_phone(v_body);

  SELECT * INTO v_contact FROM public.lead_contacts
   WHERE brand_id = p_brand AND channel = p_channel AND external_id = 'test:' || lower(v_name) FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lead_contacts (brand_id, channel, external_id, is_test, name, source_ad)
    VALUES (p_brand, p_channel, 'test:' || lower(v_name), true, v_name, left(v_ad, 120))
    RETURNING * INTO v_contact;
    v_new := true;
  END IF;

  INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found)
  VALUES (v_contact.id, 'in', 'customer', v_body, v_phone);
  UPDATE public.lead_contacts
     SET last_at = now(), last_dir = 'in', last_text = left(v_body, 200), updated_at = now(),
         phone = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN v_phone ELSE phone END,
         phone_at = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN now() ELSE phone_at END,
         phone_state = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN 'detected' ELSE phone_state END
   WHERE id = v_contact.id;

  IF v_new THEN
    PERFORM public.lead_event(v_contact.id, CASE WHEN v_ad = '' THEN 'Came in (test)' ELSE 'Came in from the ad ' || v_ad || ' (test)' END);
  END IF;
  IF v_phone IS NOT NULL AND v_contact.phone_state = 'none' THEN
    PERFORM public.lead_event(v_contact.id, 'Phone found in the message');
  END IF;
  RETURN v_contact.id;
END
$fn$;

-- ── Writes: the customer card, the hand-over, the outcome (leads.edit) ───────

-- The customer card. Fields left out of p_fields stay; a phone typed here is confirmed.
CREATE OR REPLACE FUNCTION public.lead_save_card(p_contact uuid, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  v_phone text;
  v_raw text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The customer card needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(coalesce(p_fields, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;

  IF p_fields ? 'phone' THEN
    v_raw := btrim(coalesce(p_fields->>'phone', ''));
    IF v_raw = '' THEN
      IF c.handed_at IS NOT NULL THEN
        RAISE EXCEPTION 'This customer was handed over with that phone — it stays.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.lead_contacts SET phone = NULL, phone_state = 'none', phone_at = NULL WHERE id = c.id;
      IF c.phone IS NOT NULL THEN
        PERFORM public.lead_event(c.id, 'Phone cleared');
      END IF;
    ELSE
      v_phone := public.lead_find_phone(v_raw);
      IF v_phone IS NULL THEN
        RAISE EXCEPTION 'That is not a Malaysian mobile number (01x-xxx xxxx).' USING ERRCODE = '22023';
      END IF;
      IF v_phone IS DISTINCT FROM c.phone OR c.phone_state <> 'confirmed' THEN
        UPDATE public.lead_contacts
           SET phone = v_phone, phone_state = 'confirmed', phone_at = coalesce(phone_at, now())
         WHERE id = c.id;
        PERFORM public.lead_event(c.id, 'Phone confirmed');
      END IF;
    END IF;
  END IF;

  UPDATE public.lead_contacts SET
    name           = CASE WHEN p_fields ? 'name' AND btrim(p_fields->>'name') <> '' THEN left(btrim(p_fields->>'name'), 80) ELSE name END,
    interest       = CASE WHEN p_fields ? 'interest' THEN left(btrim(coalesce(p_fields->>'interest', '')), 120) ELSE interest END,
    budget         = CASE WHEN p_fields ? 'budget' THEN left(btrim(coalesce(p_fields->>'budget', '')), 60) ELSE budget END,
    showroom       = CASE WHEN p_fields ? 'showroom' THEN left(btrim(coalesce(p_fields->>'showroom', '')), 60) ELSE showroom END,
    preferred_time = CASE WHEN p_fields ? 'preferredTime' THEN left(btrim(coalesce(p_fields->>'preferredTime', '')), 60) ELSE preferred_time END,
    note           = CASE WHEN p_fields ? 'note' THEN left(coalesce(p_fields->>'note', ''), 1000) ELSE note END,
    updated_at     = now()
  WHERE id = c.id;
END
$fn$;

-- Hand the lead to one of its brand's salespeople. The phone must be there (a found one is confirmed by
-- handing it over). Handing it again (to somebody else) is allowed and recorded. Returns the salesperson.
CREATE OR REPLACE FUNCTION public.lead_handoff(p_contact uuid, p_sales uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  s public.lead_sales;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Handing a lead over needs Lead View · Edit.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.phone IS NULL THEN
    RAISE EXCEPTION 'Get the customer''s phone before handing them over.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.lead_sales WHERE id = p_sales AND deleted_at IS NULL;
  IF NOT FOUND OR s.brand_id <> c.brand_id THEN
    RAISE EXCEPTION 'Pick one of this brand''s salespeople.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_contacts
     SET handed_sales_id = s.id, handed_at = now(), handed_by = auth.uid(), handed_by_name = public.lead_actor_name(),
         phone_state = 'confirmed', updated_at = now()
   WHERE id = c.id;
  PERFORM public.lead_event(c.id, CASE WHEN c.handed_sales_id IS NULL THEN 'Handed to ' ELSE 'Handed again, to ' END || s.name);
  RETURN jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone);
END
$fn$;

-- What came of a handed lead: the appointment and whether they came.
CREATE OR REPLACE FUNCTION public.lead_set_outcome(p_contact uuid, p_appt text, p_shown text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The outcome needs Lead View · Edit.');
  IF p_appt NOT IN ('unknown', 'booked', 'not_booked') OR p_shown NOT IN ('unknown', 'came', 'no_show') THEN
    RAISE EXCEPTION 'Unknown outcome.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF c.handed_at IS NULL THEN
    RAISE EXCEPTION 'Hand the lead over first.' USING ERRCODE = '22023';
  END IF;
  IF c.appt = p_appt AND c.shown = p_shown THEN
    RETURN;
  END IF;
  UPDATE public.lead_contacts SET appt = p_appt, shown = p_shown, updated_at = now() WHERE id = c.id;
  IF c.appt <> p_appt THEN
    PERFORM public.lead_event(c.id, CASE p_appt WHEN 'booked' THEN 'Appointment booked' WHEN 'not_booked' THEN 'No appointment' ELSE 'Appointment: not known' END);
  END IF;
  IF c.shown <> p_shown THEN
    PERFORM public.lead_event(c.id, CASE p_shown WHEN 'came' THEN 'Came to the showroom' WHEN 'no_show' THEN 'Did not come' ELSE 'Show-up: not known' END);
  END IF;
END
$fn$;

-- ── Writes: brands and salespeople (leads.manage) ────────────────────────────

-- A brand: new (p_id NULL) or changed. Keys: name, tone, fbPageId, igAccountId, handoffMode, sortOrder.
CREATE OR REPLACE FUNCTION public.lead_save_brand(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  b public.lead_brands;
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_page text := nullif(btrim(coalesce(p_data->>'fbPageId', '')), '');
  v_ig text := nullif(btrim(coalesce(p_data->>'igAccountId', '')), '');
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Brands need Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 40 THEN
    RAISE EXCEPTION 'A brand needs a name (40 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_page IS NOT NULL AND v_page !~ '^[0-9]{5,30}$' OR v_ig IS NOT NULL AND v_ig !~ '^[0-9]{5,30}$' THEN
    RAISE EXCEPTION 'A Page or Instagram id is digits only.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_brands WHERE lower(name) = lower(v_name) AND deleted_at IS NULL AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'There is already a brand called %.', v_name USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_brands (name, tone, fb_page_id, ig_account_id, handoff_mode, sort_order)
    VALUES (v_name, coalesce(p_data->>'tone', 'ink'), v_page, v_ig, coalesce(p_data->>'handoffMode', 'rotate'),
            coalesce((p_data->>'sortOrder')::integer, (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_brands)))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO b FROM public.lead_brands WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_brands SET
    name = v_name,
    tone = coalesce(p_data->>'tone', tone),
    fb_page_id = CASE WHEN p_data ? 'fbPageId' THEN v_page ELSE fb_page_id END,
    ig_account_id = CASE WHEN p_data ? 'igAccountId' THEN v_ig ELSE ig_account_id END,
    handoff_mode = coalesce(p_data->>'handoffMode', handoff_mode),
    sort_order = coalesce((p_data->>'sortOrder')::integer, sort_order),
    updated_at = now()
  WHERE id = p_id;
  RETURN p_id;
END
$fn$;

-- A salesperson of a brand: new (p_id NULL) or changed. Keys: name, phone, showroom, sortOrder.
CREATE OR REPLACE FUNCTION public.lead_save_sales(p_id uuid, p_brand uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_phone text := public.lead_find_phone(coalesce(p_data->>'phone', ''));
  v_room text := left(btrim(coalesce(p_data->>'showroom', '')), 60);
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Salespeople need Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A salesperson needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Their phone is a Malaysian mobile number (01x-xxx xxxx) — the lead is sent there on WhatsApp.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = p_brand AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.lead_sales (brand_id, name, phone, showroom, sort_order)
    VALUES (p_brand, v_name, v_phone, v_room,
            coalesce((p_data->>'sortOrder')::integer, (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_sales WHERE brand_id = p_brand)))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_sales SET name = v_name, phone = v_phone, showroom = v_room,
         sort_order = coalesce((p_data->>'sortOrder')::integer, sort_order), updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That salesperson is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- Take a salesperson off the list (the leads handed to them keep their name).
CREATE OR REPLACE FUNCTION public.lead_remove_sales(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Salespeople need Lead View · Manage.');
  UPDATE public.lead_sales SET deleted_at = now(), updated_at = now() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That salesperson is gone.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- ── Grants: the app calls these as the signed-in person ──────────────────────

REVOKE ALL ON FUNCTION public.lead_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_inbox() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_thread(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_list(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_reply(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_simulate(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_card(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_handoff(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_set_outcome(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_brand(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_sales(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_list(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_reply(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_simulate(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_card(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_handoff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_set_outcome(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_brand(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_sales(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_sales(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
