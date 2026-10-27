-- Lead View › reply to one message, and react with an emoji (2026-10-27 — the user, showing Messenger's 回复 and ☺ on a
-- message: "帮我增加一个功能 (能回复特定的内容，和emoji)"; .claude/rules/leads/lead-view.md › REPLY TO A MESSAGE, REACT).
-- Meta's Send API takes both: a reply carries `reply_to: {mid}` beside its message (the customer's or the Page's message,
-- in the 24-hour window); a reaction is `sender_action: react` with `payload: {message_id, reaction: <one emoji>}`,
-- replaced by reacting again, taken away by `unreact`.
--
--   - lead_messages.reply_to_mid: Meta's id of the message this one answers — CS's replies, and a customer's or the
--     Page's own quoted replies as Meta reports them (both ingests, PRODUCTION's bodies, one INSERT swapped each).
--   - lead_messages.reaction: the Page's emoji on a customer's message.
--   - lead_reply_to(contact, body, message) (Lead View · Create + the Inbox's guard, mig 20261027220100): lead_reply,
--     answering one message of that conversation that Meta knows (it has Meta's id); hands back the id and that mid.
--   - lead_react(message, emoji | NULL) (the same): the Page's reaction on a customer's message; hands back where it goes
--     and the reaction before, so a refusal from Meta can put it back.
--   - lead_thread hands each message's Meta id, the mid it answers and the Page's reaction to the screen (PRODUCTION's
--     body md5 ecf0ec96…, one key list swapped).

ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS reply_to_mid text CHECK (reply_to_mid IS NULL OR length(reply_to_mid) <= 300),
  ADD COLUMN IF NOT EXISTS reaction text CHECK (reaction IS NULL OR length(reaction) BETWEEN 1 AND 16);

CREATE OR REPLACE FUNCTION public.lead_reply_to(p_contact uuid, p_body text, p_message bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mid text;
  v_id bigint;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  SELECT external_id INTO v_mid FROM public.lead_messages WHERE id = p_message AND contact_id = p_contact;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That message is not in this conversation.' USING ERRCODE = '22023';
  END IF;
  IF v_mid IS NULL THEN
    RAISE EXCEPTION 'That message never reached Messenger, so it cannot be answered there.' USING ERRCODE = '22023';
  END IF;
  v_id := public.lead_reply(p_contact, p_body);
  UPDATE public.lead_messages SET reply_to_mid = v_mid WHERE id = v_id;
  RETURN jsonb_build_object('id', v_id, 'replyToMid', v_mid);
END
$fn$;

CREATE OR REPLACE FUNCTION public.lead_react(p_message bigint, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m public.lead_messages;
  c public.lead_contacts;
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Reacting needs Lead View · Create.');
  SELECT * INTO m FROM public.lead_messages WHERE id = p_message FOR UPDATE;
  IF NOT FOUND OR m.direction <> 'in' THEN
    RAISE EXCEPTION 'Only a customer''s message can be reacted to.' USING ERRCODE = '22023';
  END IF;
  IF v_emoji IS NOT NULL AND length(v_emoji) > 16 THEN
    RAISE EXCEPTION 'One emoji only.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.lead_contacts WHERE id = m.contact_id;
  UPDATE public.lead_messages SET reaction = v_emoji WHERE id = p_message;
  RETURN jsonb_build_object('mid', m.external_id, 'pageId', c.page_id, 'psid', c.external_id, 'channel', c.channel,
                            'isTest', c.is_test, 'before', m.reaction);
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_reply_to(uuid, text, bigint), public.lead_react(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_reply_to(uuid, text, bigint), public.lead_react(bigint, text) TO authenticated;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_thread(uuid)',
          $$'mediaUrl', m.media_url) ORDER BY m.created_at, m.id)$$,
          $$'mediaUrl', m.media_url, 'mid', m.external_id, 'replyToMid', m.reply_to_mid, 'reaction', m.reaction) ORDER BY m.created_at, m.id)$$,
          'ecf0ec961ca624dfb01d33445b965215'],
    ARRAY['public.lead_ingest_messenger(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url, created_at)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()));$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url, created_at, reply_to_mid)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()), left(nullif(m->>'replyToMid', ''), 300));$$,
          '6202f20169e982c58a2d0acf5de9b67d'],
    ARRAY['public.lead_ingest_page_replies(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url, created_at)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()));$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url, created_at, reply_to_mid)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()), left(nullif(m->>'replyToMid', ''), 300));$$,
          'f0a9ea37771b5e711163815721f3da34']];
  i int;
  v_sig regprocedure;
  v_src text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position(v_swaps[i][3] IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
