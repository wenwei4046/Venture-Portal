-- Lead View meets Instagram Direct (2026-10-27 — the user: "要", to building Instagram while Meta reviews it;
-- .claude/rules/leads/lead-view.md › INSTAGRAM, WRITTEN).
--
-- Instagram messaging through Facebook login comes to the same webhook as object "instagram": each entry is one of our
-- Instagram professional accounts, each sender an Instagram-scoped id, the events shaped as Messenger's. The webhook hands
-- them here as {externalId, pageId = the Instagram account id, psid = the IGSID, name, kind, body, sentAt, ad}.
-- lead_ingest_instagram is lead_ingest_messenger (mig 20261026110000, with 20261027100000's mini-by-ad-account rule) for the
-- other channel: the brand is the one whose ig_account_id is the account; the conversation keeps the brand's FACEBOOK Page
-- (lead_contacts.page_id) — Instagram messages are sent through the Page that account is linked to.
--
-- lead_outbox sends Instagram conversations too (PRODUCTION's body, md5 c1ca0feb…, one condition swapped).

CREATE OR REPLACE FUNCTION public.lead_ingest_instagram(p_messages jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m jsonb;
  v_brand public.lead_brands;
  v_mini uuid;
  v_c public.lead_contacts;
  v_new boolean;
  v_body text;
  v_phone text;
  v_head text;
  v_ad text;
  v_taken integer := 0;
  v_ignored integer := 0;
  v_ids uuid[] := '{}';
BEGIN
  IF jsonb_typeof(coalesce(p_messages, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'The messages are not in the right shape.' USING ERRCODE = '22023';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) LOOP
    SELECT * INTO v_brand FROM public.lead_brands WHERE ig_account_id = m->>'pageId' AND deleted_at IS NULL;
    IF NOT FOUND OR coalesce(m->>'externalId', '') = '' OR coalesce(m->>'psid', '') !~ '^[0-9]{5,32}$'
       OR EXISTS (SELECT 1 FROM public.lead_messages WHERE external_id = m->>'externalId') THEN
      v_ignored := v_ignored + 1;
      CONTINUE;
    END IF;
    -- The brand that shares this account ("2990s mini" shares "2990s").
    SELECT b.id INTO v_mini FROM public.lead_brands b
     WHERE b.deleted_at IS NULL AND b.fb_page_id IS NULL AND b.ig_account_id IS NULL AND lower(b.name) = lower(v_brand.name) || ' mini';
    v_head := left(btrim(coalesce(m->'ad'->>'headline', '')), 120);
    v_ad := CASE WHEN coalesce(m->'ad'->>'sourceId', '') ~ '^[0-9]{5,30}$' THEN m->'ad'->>'sourceId' END;

    SELECT * INTO v_c FROM public.lead_contacts c
     WHERE c.channel = 'instagram' AND c.external_id = m->>'psid' AND (c.brand_id = v_brand.id OR c.brand_id = v_mini)
     ORDER BY c.created_at LIMIT 1 FOR UPDATE;
    v_new := NOT FOUND;
    IF v_new THEN
      INSERT INTO public.lead_contacts (brand_id, channel, external_id, is_test, name, source_ad, ad_id, page_id)
      VALUES (CASE WHEN v_mini IS NOT NULL AND (v_head ILIKE '%mini%' OR coalesce(m->'ad'->>'account', '') ILIKE '%mini%') THEN v_mini ELSE v_brand.id END, 'instagram', m->>'psid', false,
              left(btrim(coalesce(m->>'name', '')), 80), v_head, v_ad, v_brand.fb_page_id)
      RETURNING * INTO v_c;
    ELSE
      UPDATE public.lead_contacts SET
        name = CASE WHEN name = '' THEN left(btrim(coalesce(m->>'name', '')), 80) ELSE name END,
        page_id = coalesce(page_id, v_brand.fb_page_id)
       WHERE id = v_c.id;
    END IF;

    v_body := btrim(coalesce(m->>'body', ''));
    IF v_body = '' THEN
      v_body := CASE m->>'kind' WHEN 'image' THEN '[Photo]' WHEN 'video' THEN '[Video]' WHEN 'audio' THEN '[Voice message]'
                  WHEN 'document' THEN '[File]' WHEN 'sticker' THEN '[Sticker]' WHEN 'location' THEN '[Location]' ELSE '[Message]' END;
    END IF;
    v_body := left(v_body, 2000);
    v_phone := public.lead_find_phone(v_body);

    -- Settings › Test's way (lead_simulate, production's body), with Meta's id.
    INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId');
    UPDATE public.lead_contacts
       SET last_at = now(), last_dir = 'in', last_text = left(v_body, 200), updated_at = now(),
           phone = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN v_phone ELSE phone END,
           phone_at = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN now() ELSE phone_at END,
           phone_state = CASE WHEN phone_state = 'none' AND v_phone IS NOT NULL THEN 'detected' ELSE phone_state END
     WHERE id = v_c.id;
    IF v_new THEN
      PERFORM public.lead_event(v_c.id, CASE WHEN v_head = '' THEN 'Came in on Instagram' ELSE 'Came in from the ad ' || v_head END);
    END IF;
    IF v_phone IS NOT NULL AND v_c.phone_state = 'none' THEN
      PERFORM public.lead_event(v_c.id, 'Phone found in the message');
    END IF;
    v_taken := v_taken + 1;
    IF NOT v_c.id = ANY (v_ids) THEN
      v_ids := v_ids || v_c.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('messages', v_taken, 'ignored', v_ignored, 'contacts', to_jsonb(v_ids));
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_ingest_instagram(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ingest_instagram(jsonb) TO service_role;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_outbox(uuid[])'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_outbox(uuid[])'::regprocedure);
  v_old text := $$c.channel = 'messenger'$$;
  v_new text := $$c.channel IN ('messenger', 'instagram')$$;
BEGIN
  IF position(v_new IN v_src) > 0 THEN
    RETURN;  -- already in place
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'c1ca0feb687a89ec8e960d7579687979' THEN
    RAISE EXCEPTION 'lead_outbox: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_outbox: the channel condition is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
