-- Lead View v2 › the Inbox's customer panel (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` §7.1 —
-- the user: "完全跟claude design 画的"; point 9: "a phone typed by hand is kept as typed").
--
-- 1. Two fields for the salesperson the handoff draws: Language (Mandarin / English / Malay / Other) and Special request.
-- 2. A phone CS types by hand is kept as typed — no format check, a customer may be foreign — and says so
--    ("Phone · added by you"): `phone_typed`. A Malaysian mobile is still stored as digits (lead_find_phone); anything
--    else as typed (30 characters at most, three digits at least). Confirming the number found in the chat leaves
--    `phone_typed` false. phone_state keeps its three values, so no reader moves: a typed phone is 'confirmed'.
-- 3. lead_save_card from PRODUCTION's body (md5 0cc93c19a0d0c3d20b6888eb56c33e70, checked 2026-11-02): the phone
--    branch and two keys; lead_contact_json from PRODUCTION's body (md5 f5de0ecb6a72fc1f34247c333a11f7a9): three keys
--    joined after its object, as `pageId` / `psid` are (jsonb_build_object takes at most 100 arguments).

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_save_card(uuid,jsonb)'::regprocedure) <> '0cc93c19a0d0c3d20b6888eb56c33e70' THEN
    RAISE EXCEPTION 'lead_save_card is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_contact_json(public.lead_contacts)'::regprocedure) <> 'f5de0ecb6a72fc1f34247c333a11f7a9' THEN
    RAISE EXCEPTION 'lead_contact_json is not the body this migration was written from';
  END IF;
END
$guard$;

ALTER TABLE public.lead_contacts
  ADD COLUMN language text NOT NULL DEFAULT '' CHECK (language IN ('', 'Mandarin', 'English', 'Malay', 'Other')),
  ADD COLUMN special_request text NOT NULL DEFAULT '',
  ADD COLUMN phone_typed boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_contacts DROP CONSTRAINT lead_contacts_phone_check;
ALTER TABLE public.lead_contacts ADD CONSTRAINT lead_contacts_phone_check
  CHECK (phone ~ '^01[0-9]{8,9}$' OR (phone_typed AND length(phone) <= 30 AND phone ~ '[0-9].*[0-9].*[0-9]'));

CREATE OR REPLACE FUNCTION public.lead_save_card(p_contact uuid, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.lead_contacts;
  v_phone text;
  v_raw text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The customer card needs Lead View · Edit.');
  PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.edit']);
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
      UPDATE public.lead_contacts SET phone = NULL, phone_state = 'none', phone_at = NULL, phone_typed = false WHERE id = c.id;
      IF c.phone IS NOT NULL THEN
        PERFORM public.lead_event(c.id, 'Phone cleared');
      END IF;
    ELSE
      v_phone := public.lead_find_phone(v_raw);
      IF v_phone IS NOT NULL AND v_phone = c.phone THEN
        -- The number already on the card (found in the chat): confirmed.
        IF c.phone_state <> 'confirmed' THEN
          UPDATE public.lead_contacts SET phone_state = 'confirmed', phone_at = coalesce(phone_at, now()) WHERE id = c.id;
          PERFORM public.lead_event(c.id, 'Phone confirmed');
        END IF;
      ELSE
        -- Typed by hand: kept as typed (a Malaysian mobile as its digits), no format check.
        v_phone := coalesce(v_phone, left(v_raw, 30));
        IF v_phone !~ '[0-9].*[0-9].*[0-9]' THEN
          RAISE EXCEPTION 'Type a phone number.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.lead_contacts
           SET phone = v_phone, phone_state = 'confirmed', phone_typed = true, phone_at = coalesce(phone_at, now())
         WHERE id = c.id;
        PERFORM public.lead_event(c.id, 'Phone added by ' || public.lead_actor_name());
      END IF;
    END IF;
  END IF;

  UPDATE public.lead_contacts SET
    name            = CASE WHEN p_fields ? 'name' AND btrim(p_fields->>'name') <> '' THEN left(btrim(p_fields->>'name'), 80) ELSE name END,
    interest        = CASE WHEN p_fields ? 'interest' THEN left(btrim(coalesce(p_fields->>'interest', '')), 120) ELSE interest END,
    budget          = CASE WHEN p_fields ? 'budget' THEN left(btrim(coalesce(p_fields->>'budget', '')), 60) ELSE budget END,
    showroom        = CASE WHEN p_fields ? 'showroom' THEN left(btrim(coalesce(p_fields->>'showroom', '')), 60) ELSE showroom END,
    preferred_time  = CASE WHEN p_fields ? 'preferredTime' THEN left(btrim(coalesce(p_fields->>'preferredTime', '')), 60) ELSE preferred_time END,
    note            = CASE WHEN p_fields ? 'note' THEN left(coalesce(p_fields->>'note', ''), 1000) ELSE note END,
    language        = CASE WHEN p_fields ? 'language' THEN
                        CASE WHEN coalesce(p_fields->>'language', '') IN ('', 'Mandarin', 'English', 'Malay', 'Other') THEN coalesce(p_fields->>'language', '') ELSE language END
                      ELSE language END,
    special_request = CASE WHEN p_fields ? 'specialRequest' THEN left(btrim(coalesce(p_fields->>'specialRequest', '')), 500) ELSE special_request END,
    updated_at      = now()
  WHERE id = c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.lead_contact_json(c lead_contacts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id, 'brandId', c.brand_id, 'channel', c.channel, 'isTest', c.is_test, 'name', c.name,
    'sourceAd', c.source_ad, 'phone', c.phone, 'phoneState', c.phone_state, 'phoneAt', c.phone_at,
    'interest', c.interest, 'budget', c.budget, 'showroom', c.showroom, 'preferredTime', c.preferred_time,
    'note', c.note, 'handedSalesId', c.handed_sales_id, 'handedSalesName', s.name, 'handedAt', c.handed_at,
    'handedByName', c.handed_by_name, 'appt', c.appt, 'shown', c.shown, 'lastAt', c.last_at,
    'lastDir', c.last_dir, 'lastText', c.last_text, 'createdAt', c.created_at,
    'flowState', c.flow_state, 'flowName', f.name, 'optIn', c.opt_in, 'optInAt', c.opt_in_at, 'adId', c.ad_id, 'adName', coalesce(a.name, ''), 'adCampaign', coalesce(a.campaign, ''), 'adSet', coalesce(a.adset, ''), 'adAccount', coalesce(a.account_id, ''), 'adLink', coalesce(a.link, ''), 'contactedAt', c.contacted_at, 'apptAt', c.appt_at, 'cameAt', c.came_at, 'closedAt', c.closed_at, 'saleValue', c.sale_value, 'lostAt', c.lost_at, 'lostReason', c.lost_reason, 'stageByName', c.stage_by_name, 'updatedAt', c.updated_at, 'assignedTo', c.assigned_to, 'assignedName', c.assigned_name, 'assignedAt', c.assigned_at,
      'deliveredAt', c.customer_delivered_at, 'readAt', c.customer_read_at,
      'labels', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'tone', l.tone) ORDER BY l.sort_order, l.name)
                            FROM public.lead_contact_labels cl JOIN public.lead_labels l ON l.id = cl.label_id AND l.deleted_at IS NULL
                           WHERE cl.contact_id = c.id), '[]'::jsonb)) || jsonb_build_object('pageId', c.page_id, 'psid', c.external_id)
      || jsonb_build_object('language', c.language, 'specialRequest', c.special_request, 'phoneTyped', c.phone_typed)
    FROM (SELECT 1) one
    LEFT JOIN public.lead_sales s ON s.id = c.handed_sales_id
    LEFT JOIN public.lead_flows f ON f.id = c.flow_id
    LEFT JOIN public.lead_ads a ON a.ad_id = c.ad_id
$function$;

NOTIFY pgrst, 'reload schema';
