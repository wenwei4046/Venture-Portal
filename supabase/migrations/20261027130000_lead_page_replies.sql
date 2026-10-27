-- Lead View › what the Page says outside Lead View (2026-10-27 — the user, comparing Business Suite's inbox with Lead
-- View: most of the day's 2990s customers were missing, and CS will reply in Business Suite a few days before Lead View:
-- "给 2990s 和 Carres 订阅 standby 字段，程序把 standby 的客户消息也收进 Lead View，Page 自己发出的回复也记进对话";
-- .claude/rules/leads/lead-view.md › THE PAGE'S OWN REPLIES AND STANDBY).
--
-- The brands' Pages answer in Business Suite — a person, or Meta's own AI, which then holds the conversation, so its
-- customers' messages reach this app as `standby` (the webhook now reads them as messages, lead_ingest_messenger as
-- before). What the Page sends from anywhere but this app comes back as an echo; lead_ingest_page_replies keeps it on
-- the conversation as sender 'page' (by_name: who Meta says sent it — "Business Suite"), delivery sent, Meta's id kept, and
-- moves the conversation's last message — so it reads Answered and the history is whole when CS moves to Lead View.
-- Lead View's own sends (CS, templates) are left out by the webhook (the echo's app_id is ours) and by Meta's id.

ALTER TABLE public.lead_messages DROP CONSTRAINT lead_messages_sender_check;
ALTER TABLE public.lead_messages ADD CONSTRAINT lead_messages_sender_check
  CHECK (sender = ANY (ARRAY['customer', 'cs', 'ai', 'flow', 'campaign', 'page']));

-- p_messages: [{externalId, pageId, psid (the customer), kind, body, sentAt}] — echoes of the Page's own messages.
CREATE OR REPLACE FUNCTION public.lead_ingest_page_replies(p_messages jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m jsonb;
  v_brand public.lead_brands;
  v_mini uuid;
  v_c public.lead_contacts;
  v_body text;
  v_taken integer := 0;
  v_ignored integer := 0;
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
    SELECT b.id INTO v_mini FROM public.lead_brands b
     WHERE b.deleted_at IS NULL AND b.fb_page_id IS NULL AND b.ig_account_id IS NULL AND lower(b.name) = lower(v_brand.name) || ' mini';
    -- Only a conversation Lead View already has: the Page greeting somebody who has not written yet is not a lead.
    SELECT * INTO v_c FROM public.lead_contacts c
     WHERE c.channel = 'messenger' AND c.external_id = m->>'psid' AND (c.brand_id = v_brand.id OR c.brand_id = v_mini)
     ORDER BY c.created_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      v_ignored := v_ignored + 1;
      CONTINUE;
    END IF;
    v_body := btrim(coalesce(m->>'body', ''));
    IF v_body = '' THEN
      v_body := CASE m->>'kind' WHEN 'image' THEN '[Photo]' WHEN 'video' THEN '[Video]' WHEN 'audio' THEN '[Voice message]'
                  WHEN 'document' THEN '[File]' WHEN 'sticker' THEN '[Sticker]' WHEN 'location' THEN '[Location]' ELSE '[Message]' END;
    END IF;
    v_body := left(v_body, 2000);
    INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId');
    UPDATE public.lead_contacts
       SET last_at = now(), last_dir = 'out', last_text = left(v_body, 200), updated_at = now()
     WHERE id = v_c.id;
    v_taken := v_taken + 1;
  END LOOP;
  RETURN jsonb_build_object('messages', v_taken, 'ignored', v_ignored);
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_ingest_page_replies(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ingest_page_replies(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
