-- Lead View meets Messenger (2026-10-26 — the user, for a start on the 28th: "你帮我决定，我想要在28号就能开始用，
-- AI Agent可以后续再慢慢使用就好"; .claude/rules/leads/lead-view.md › MESSENGER CONNECTED).
--
-- One Meta app has one "page" webhook, so /api/messenger/v1/webhook keeps the CRM's Pages (META_PAGE_IDS) for the CRM
-- and hands every other Page's messages here: lead_ingest_messenger keeps those of a brand's Page (lead_brands.fb_page_id)
-- and ignores the rest. 2990s mini has no Page of its own (it shares 2990s'): a NEW conversation from an ad whose
-- headline says "mini" is the mini brand's (the user's choice A, 2026-10-18); every later message stays where it began.
--
-- What goes out — Customer Service's reply, a template's messages and buttons — is first recorded as before and then
-- sent by the server with the Page's token (Meta's 24-hour window; the Human Agent tag waits for App Review), which
-- writes back Meta's id or why it failed: lead_reply_target / lead_reply_sent for a reply (the person's own session,
-- Lead View · Create on /leads), lead_outbox / lead_outbox_done for a template's messages (the webhook, after the
-- ingest, as the CRM's auto-replies). A test conversation is never sent.
--
-- New columns: lead_messages.external_id (Meta's message id — a re-delivery is skipped), lead_messages.delivery_error,
-- lead_contacts.page_id (the Page the customer wrote to — what a reply is sent from, mini's included).

ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS external_id text CHECK (external_id IS NULL OR length(external_id) <= 200),
  ADD COLUMN IF NOT EXISTS delivery_error text CHECK (delivery_error IS NULL OR length(delivery_error) <= 300);
CREATE UNIQUE INDEX IF NOT EXISTS lead_messages_external ON public.lead_messages (external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS page_id text CHECK (page_id IS NULL OR page_id ~ '^[0-9]{5,30}$');

-- ── In: the webhook's messages for the brands' Pages ────────────────────────

-- p_messages: the webhook's parsed messages ({externalId, pageId, psid, name, kind, body, sentAt, ad: {sourceId, headline}}).
-- Answers how many were taken, how many ignored (not a brand's Page, already here), and the conversations they reached.
CREATE OR REPLACE FUNCTION public.lead_ingest_messenger(p_messages jsonb)
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
    SELECT * INTO v_brand FROM public.lead_brands WHERE fb_page_id = m->>'pageId' AND deleted_at IS NULL;
    IF NOT FOUND OR coalesce(m->>'externalId', '') = '' OR coalesce(m->>'psid', '') !~ '^[0-9]{5,32}$'
       OR EXISTS (SELECT 1 FROM public.lead_messages WHERE external_id = m->>'externalId') THEN
      v_ignored := v_ignored + 1;
      CONTINUE;
    END IF;
    -- The brand that shares this Page ("2990s mini" shares "2990s").
    SELECT b.id INTO v_mini FROM public.lead_brands b
     WHERE b.deleted_at IS NULL AND b.fb_page_id IS NULL AND lower(b.name) = lower(v_brand.name) || ' mini';
    v_head := left(btrim(coalesce(m->'ad'->>'headline', '')), 120);
    v_ad := CASE WHEN coalesce(m->'ad'->>'sourceId', '') ~ '^[0-9]{5,30}$' THEN m->'ad'->>'sourceId' END;

    SELECT * INTO v_c FROM public.lead_contacts c
     WHERE c.channel = 'messenger' AND c.external_id = m->>'psid' AND (c.brand_id = v_brand.id OR c.brand_id = v_mini)
     ORDER BY c.created_at LIMIT 1 FOR UPDATE;
    v_new := NOT FOUND;
    IF v_new THEN
      INSERT INTO public.lead_contacts (brand_id, channel, external_id, is_test, name, source_ad, ad_id, page_id)
      VALUES (CASE WHEN v_mini IS NOT NULL AND v_head ILIKE '%mini%' THEN v_mini ELSE v_brand.id END, 'messenger', m->>'psid', false,
              left(btrim(coalesce(m->>'name', '')), 80), v_head, v_ad, m->>'pageId')
      RETURNING * INTO v_c;
    ELSE
      UPDATE public.lead_contacts SET
        name = CASE WHEN name = '' THEN left(btrim(coalesce(m->>'name', '')), 80) ELSE name END,
        page_id = coalesce(page_id, m->>'pageId')
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
      PERFORM public.lead_event(v_c.id, CASE WHEN v_head = '' THEN 'Came in on Messenger' ELSE 'Came in from the ad ' || v_head END);
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
REVOKE ALL ON FUNCTION public.lead_ingest_messenger(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ingest_messenger(jsonb) TO service_role;

-- ── Out: a template's messages, sent by the webhook after the ingest ────────

-- What a template (or anything but a person) put in these conversations in the last 10 minutes and nobody sent yet —
-- real Messenger conversations only, oldest first, with the Page, the customer and the time of their last message.
CREATE OR REPLACE FUNCTION public.lead_outbox(p_contacts uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', m.id, 'pageId', c.page_id, 'psid', c.external_id, 'body', m.body, 'buttons', m.buttons,
             'lastInAt', (SELECT max(i.created_at) FROM public.lead_messages i WHERE i.contact_id = c.id AND i.direction = 'in')) ORDER BY m.id)
      FROM public.lead_messages m JOIN public.lead_contacts c ON c.id = m.contact_id
     WHERE m.contact_id = ANY (coalesce(p_contacts, '{}')) AND m.direction = 'out' AND m.sender = 'flow'
       AND m.delivery = 'recorded' AND m.external_id IS NULL AND m.delivery_error IS NULL
       AND m.created_at > now() - interval '10 minutes'
       AND NOT c.is_test AND c.channel = 'messenger' AND c.page_id IS NOT NULL), '[]'::jsonb);
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_outbox(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_outbox(uuid[]) TO service_role;

-- What became of them: [{id, mid} | {id, error}].
CREATE OR REPLACE FUNCTION public.lead_outbox_done(p_results jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) LOOP
    UPDATE public.lead_messages SET
      delivery = CASE WHEN coalesce(r->>'mid', '') <> '' THEN 'sent' ELSE 'failed' END,
      external_id = nullif(left(r->>'mid', 200), ''),
      delivery_error = CASE WHEN coalesce(r->>'mid', '') <> '' THEN NULL ELSE left(coalesce(r->>'error', 'Not sent.'), 300) END
     WHERE id = (r->>'id')::bigint AND direction = 'out' AND delivery = 'recorded' AND external_id IS NULL;
  END LOOP;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_outbox_done(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_outbox_done(jsonb) TO service_role;

-- ── Out: Customer Service's reply, sent by the reply's own Server Action ────

-- Where a reply the caller just wrote goes: the Page, the customer, a test or not, and when the customer last wrote.
-- Only the caller's own reply, still only recorded.
CREATE OR REPLACE FUNCTION public.lead_reply_target(p_message bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  RETURN (
    SELECT jsonb_build_object('id', m.id, 'body', m.body, 'isTest', c.is_test, 'channel', c.channel, 'pageId', c.page_id, 'psid', c.external_id,
             'lastInAt', (SELECT max(i.created_at) FROM public.lead_messages i WHERE i.contact_id = c.id AND i.direction = 'in'))
      FROM public.lead_messages m JOIN public.lead_contacts c ON c.id = m.contact_id
     WHERE m.id = p_message AND m.direction = 'out' AND m.sender = 'cs' AND m.by_user = auth.uid()
       AND m.delivery = 'recorded' AND m.external_id IS NULL);
END
$fn$;

-- What became of that reply: Meta's id (sent) or why it was not sent.
CREATE OR REPLACE FUNCTION public.lead_reply_sent(p_message bigint, p_mid text, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  UPDATE public.lead_messages SET
    delivery = CASE WHEN coalesce(p_mid, '') <> '' THEN 'sent' ELSE 'failed' END,
    external_id = nullif(left(p_mid, 200), ''),
    delivery_error = CASE WHEN coalesce(p_mid, '') <> '' THEN NULL ELSE left(coalesce(nullif(btrim(p_error), ''), 'Not sent.'), 300) END
   WHERE id = p_message AND direction = 'out' AND sender = 'cs' AND by_user = auth.uid() AND delivery = 'recorded' AND external_id IS NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_reply_target(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_reply_sent(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_reply_target(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_reply_sent(bigint, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
