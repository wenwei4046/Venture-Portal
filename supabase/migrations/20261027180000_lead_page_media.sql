-- Lead View › the Page's own photos and files show in the chat (2026-10-27 — the user, circling a "[Photo]" the Page sent
-- from Business Suite: "直接呈现照片，文件，就像messager一样"; .claude/rules/leads/lead-view.md › THE PAGE'S OWN REPLIES).
--
--   - lead_ingest_page_replies keeps Meta's address of what the Page sent (`mediaUrl`, an https address on Meta's CDN —
--     the webhook hands only those), as the two customer ingests do since mig 20261027140000 (PRODUCTION's body md5
--     54726b97…, its INSERT swapped).
--   - Messages already kept with no address get it from the delivery log (crm_channel_events keeps every Messenger
--     delivery's payload): same Meta id, an image / video / audio / file attachment, Meta's CDN only. Meta's addresses
--     expire after a while; a later one shows "Photo · not available" as any expired one.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_ingest_page_replies(jsonb)'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_ingest_page_replies(jsonb)'::regprocedure);
  v_old text := $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId');$$;
  v_new text := $$INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, media_url)
    VALUES (v_c.id, 'out', 'page', 'Business Suite', v_body, 'sent', m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$;
BEGIN
  IF position('media_url' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '54726b97802abfe23f9a78e0ae8a68a6' THEN
    RAISE EXCEPTION 'lead_ingest_page_replies: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_ingest_page_replies: its INSERT is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

-- What is already kept: the address from the delivery log, where the log still has it.
WITH att AS (
  SELECT DISTINCT ON (ev->'message'->>'mid') ev->'message'->>'mid' AS mid, ev->'message'->'attachments'->0->'payload'->>'url' AS url
    FROM public.crm_channel_events e,
         jsonb_array_elements(CASE WHEN jsonb_typeof(e.payload->'entry') = 'array' THEN e.payload->'entry' ELSE '[]'::jsonb END) en,
         jsonb_array_elements(CASE WHEN jsonb_typeof(en->'messaging') = 'array' THEN en->'messaging' ELSE '[]'::jsonb END
                           || CASE WHEN jsonb_typeof(en->'standby') = 'array' THEN en->'standby' ELSE '[]'::jsonb END) ev
   WHERE e.channel = 'messenger'
     AND ev->'message'->'attachments'->0->>'type' IN ('image', 'video', 'audio', 'file')
     AND ev->'message'->'attachments'->0->'payload'->>'url' ~ '^https://[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)/')
UPDATE public.lead_messages m
   SET media_url = left(att.url, 2000)
  FROM att
 WHERE att.mid = m.external_id AND m.media_url IS NULL AND m.media_path IS NULL;

NOTIFY pgrst, 'reload schema';
