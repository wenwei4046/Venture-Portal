-- Lead View › photos and files in the Inbox (2026-10-27 — the user, circling the composer's camera and paperclip: "没有功能，
-- 要加上可发照片，文件"; .claude/rules/leads/lead-view.md › PHOTOS AND FILES).
--
-- Sent: the browser uploads the file to the R2 bucket `lead-media` under chat/<conversation>/ (Lead View · Create), then
-- lead_reply_media records the reply — lead_reply's own (who, the conversation's last message, the template stopped) with
-- the file on it — and the server sends it through the brand's Page as a Messenger attachment (lead_reply_sent keeps what
-- Meta said, as a text reply). Read: the bucket with Lead View · View; the screen asks a short-lived link.
-- Received: a customer's photo / video / voice note / file keeps Meta's own address (`media_url`, Meta's hosts only — the
-- webhook's metaMediaUrl), PRODUCTION's ingest bodies with one INSERT swapped each.
-- lead_thread hands the three to the screen (production's body, one line swapped).

INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('lead-media', false, 26214400, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY lead_media_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-media' AND (storage.foldername(name))[1] = 'chat'
    AND (SELECT public.has_any_action(ARRAY['leads.create'])));
CREATE POLICY lead_media_read ON public.file_objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-media' AND (SELECT public.has_any_action(ARRAY['leads.view'])));

ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS media_path text CHECK (media_path IS NULL OR media_path ~ '^chat/[0-9a-f-]{36}/[^/]{1,200}$'),
  ADD COLUMN IF NOT EXISTS media_mime text CHECK (media_mime IS NULL OR length(media_mime) <= 120),
  ADD COLUMN IF NOT EXISTS media_url text CHECK (media_url IS NULL OR (media_url ~ '^https://' AND length(media_url) <= 2000));

-- A photo or file CS sends: recorded as lead_reply records a reply, then the file put on it.
CREATE OR REPLACE FUNCTION public.lead_reply_media(p_contact uuid, p_path text, p_mime text, p_caption text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text := btrim(coalesce(p_path, ''));
  v_mime text := left(btrim(coalesce(p_mime, '')), 120);
  v_name text;
  v_body text;
  v_id bigint;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Replying needs Lead View · Create.');
  IF v_path !~ ('^chat/' || p_contact::text || '/[^/]{1,200}$') THEN
    RAISE EXCEPTION 'That file is not this conversation''s.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.file_objects WHERE bucket_id = 'lead-media' AND name = v_path) THEN
    RAISE EXCEPTION 'The file did not finish uploading — try again.' USING ERRCODE = '22023';
  END IF;
  v_name := regexp_replace(regexp_replace(v_path, '^.*/', ''), '^[0-9a-f-]{36}-', '');
  v_body := btrim(coalesce(p_caption, ''));
  IF v_body = '' THEN
    v_body := CASE WHEN v_mime LIKE 'image/%' THEN '[Photo]' WHEN v_mime LIKE 'video/%' THEN '[Video]' ELSE '[File] ' || v_name END;
  END IF;
  v_id := public.lead_reply(p_contact, v_body);
  UPDATE public.lead_messages SET media_path = v_path, media_mime = nullif(v_mime, '') WHERE id = v_id;
  RETURN v_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_reply_media(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_reply_media(uuid, text, text, text) TO authenticated;

-- One line swapped in each of three of PRODUCTION's bodies (md5 checked): the thread hands the files to the screen, the
-- two ingests keep a customer's attachment address.
DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_thread(uuid)',
          $$'buttons', m.buttons) ORDER BY m.id)$$,
          $$'buttons', m.buttons, 'mediaPath', m.media_path, 'mediaMime', m.media_mime, 'mediaUrl', m.media_url) ORDER BY m.id)$$,
          'cf7fc34fc94286819682cd3a08bd1e51'],
    ARRAY['public.lead_ingest_messenger(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId');$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$,
          '816bacb8113b7a232f43035efb411aef'],
    ARRAY['public.lead_ingest_instagram(jsonb)',
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId');$$,
          $$INSERT INTO public.lead_messages (contact_id, direction, sender, body, phone_found, external_id, media_url)
    VALUES (v_c.id, 'in', 'customer', v_body, v_phone, m->>'externalId', CASE WHEN m->>'mediaUrl' ~ '^https://' THEN left(m->>'mediaUrl', 2000) END);$$,
          '95240bef30c3140ab143b940f1f77ffd']];
  i int;
  v_sig regprocedure;
  v_src text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position(v_swaps[i][3] IN v_src) > 0 THEN
      CONTINUE;  -- already in place
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the line to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
