-- Lead View › a message at the time Meta says it was sent (2026-10-27 — the user, on Ray Ng: "ray ng 的回复应该有误，检查一下").
-- Ray wrote at 06:26:40 and the Page's automatic answer went at 06:26:42 — but the webhook reached us at 06:26:43, and the
-- ingests stamped a message (and the conversation's last message) with the time it ARRIVED, so his message sat after the
-- answer and the chat read Waiting. Now:
--   - lead_meta_time(text): Meta's time handed in (`sentAt`), or NULL when it is missing, unreadable, more than 5 minutes
--     ahead or more than 30 days back (then the arrival time stands). Only the ingests (DEFINER) call it.
--   - the three ingests (PRODUCTION's bodies: lead_ingest_messenger b7644cce…, lead_ingest_instagram 67351ec9…,
--     lead_ingest_page_replies 00a667a6…) insert the message at that time, and set the conversation's last message from
--     its latest message BY TIME — a message arriving late no longer jumps ahead of the answer that came after it.

CREATE OR REPLACE FUNCTION public.lead_meta_time(p_sent text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v timestamptz;
BEGIN
  IF coalesce(p_sent, '') = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v := p_sent::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v > now() + interval '5 minutes' OR v < now() - interval '30 days' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_meta_time(text) FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_ingest_messenger(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url, created_at)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()));$$,
          'b7644cce739f2f6bf6b33e6ee41cad54'],
    ARRAY['public.lead_ingest_messenger(jsonb)',
          $$SET last_at = now(), last_dir = 'in', last_text = left(v_body, 200), updated_at = now(),$$,
          $$SET (last_at, last_dir, last_text) = (SELECT l.created_at, l.direction, left(l.body, 200) FROM public.lead_messages l WHERE l.contact_id = v_c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1), updated_at = now(),$$,
          NULL],
    ARRAY['public.lead_ingest_instagram(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url, created_at)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()));$$,
          '67351ec9be16f60519634ecf6363b9bb'],
    ARRAY['public.lead_ingest_instagram(jsonb)',
          $$SET last_at = now(), last_dir = 'in', last_text = left(v_body, 200), updated_at = now(),$$,
          $$SET (last_at, last_dir, last_text) = (SELECT l.created_at, l.direction, left(l.body, 200) FROM public.lead_messages l WHERE l.contact_id = v_c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1), updated_at = now(),$$,
          NULL],
    ARRAY['public.lead_ingest_page_replies(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url, created_at)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END, coalesce(public.lead_meta_time(m->>'sentAt'), now()));$$,
          '00a667a6e2455f712a20a1cf382b0b25'],
    ARRAY['public.lead_ingest_page_replies(jsonb)',
          $$SET last_at = now(), last_dir = 'out', last_text = left(v_body, 200), updated_at = now()$$,
          $$SET (last_at, last_dir, last_text) = (SELECT l.created_at, l.direction, left(l.body, 200) FROM public.lead_messages l WHERE l.contact_id = v_c.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1), updated_at = now()$$,
          NULL]];
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
    -- A function's first swap is checked against production's body; its second follows its first.
    IF v_swaps[i][4] IS NOT NULL AND md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once (swap %)', v_sig, i;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
