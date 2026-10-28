-- Lead View › the Inbox's tools (2026-10-28 — the user: "我是否可以把讯息unread 来提醒自己稍后回复？是否可以有forward",
-- "要确保不论是客户还是客服发的图片，影片，文件都是直接显示的", then, of four offered: "转发就好，不需要删除,
-- 图片/影片/文件永久显示,发图前先编辑,标为未读（稍后回复）"; .claude/rules/leads/lead-view.md › THE INBOX'S TOOLS).
--
--   - Mark unread: a person marks a chat unread to come back to it — `lead_seen.marked_unread`, set by
--     lead_mark_unread(contact) (Lead View · View, the caller's own mark), read by lead_my_unread_marks(), cleared when
--     they open it again (PRODUCTION's lead_mark_seen, md5 086511bc…, its upsert's SET swapped once). Lead View's alone:
--     Meta has no "mark unread" for an app.
--   - Every photo, video and file kept: a message carrying Meta's address (which expires) is copied into the bucket
--     lead-media under its conversation's folder by the webhook's after-work — lead_media_to_keep() lists them,
--     lead_media_kept(rows) puts the path on (only an object the bucket has, in that conversation's folder). Both the
--     service role's alone. Forwarding needs no function: it copies the object and replies (lead_reply / _media).

ALTER TABLE public.lead_seen ADD COLUMN IF NOT EXISTS marked_unread boolean NOT NULL DEFAULT false;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_mark_seen(uuid)'::regprocedure;
  v_old text := 'seen_at = now();';
  v_new text := 'seen_at = now(), marked_unread = false;';
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position(v_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '086511bc7a2b6019cce5d5162ddb17c4' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

-- Mark a chat unread for oneself, to answer later. Opening it again clears the mark (lead_mark_seen).
CREATE OR REPLACE FUNCTION public.lead_mark_unread(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_contacts WHERE id = p_contact) THEN
    RAISE EXCEPTION 'That conversation is not there.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lead_seen (user_id, contact_id, seen_id, marked_unread) VALUES (auth.uid(), p_contact, 0, true)
  ON CONFLICT (user_id, contact_id) DO UPDATE SET marked_unread = true;
END
$fn$;

-- The chats the caller marked unread.
CREATE OR REPLACE FUNCTION public.lead_my_unread_marks()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(s.contact_id) FROM public.lead_seen s WHERE s.user_id = auth.uid() AND s.marked_unread), '[]'::jsonb);
END
$fn$;

-- Messages whose photo, video or file is still only at Meta's address (newest first, 30 at a time).
CREATE OR REPLACE FUNCTION public.lead_media_to_keep()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'contactId', x.contact_id, 'url', x.media_url, 'body', x.body)), '[]'::jsonb)
    FROM (SELECT m.id, m.contact_id, m.media_url, m.body FROM public.lead_messages m
           WHERE m.media_url IS NOT NULL AND m.media_path IS NULL ORDER BY m.created_at DESC LIMIT 30) x;
$fn$;

-- Kept: [{id, path, mime}] — only an object lead-media has, in that message's conversation's folder.
CREATE OR REPLACE FUNCTION public.lead_media_kept(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  n integer := 0;
  k integer;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rows) = 'array' THEN p_rows ELSE '[]'::jsonb END) LOOP
    UPDATE public.lead_messages m
       SET media_path = r->>'path', media_mime = left(coalesce(nullif(r->>'mime', ''), 'application/octet-stream'), 120)
     WHERE m.id = (r->>'id')::bigint AND m.media_path IS NULL
       AND left(r->>'path', length('chat/' || m.contact_id || '/')) = 'chat/' || m.contact_id || '/'
       AND EXISTS (SELECT 1 FROM public.file_objects o WHERE o.bucket_id = 'lead-media' AND o.name = r->>'path');
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;
  END LOOP;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_mark_unread(uuid), public.lead_my_unread_marks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_mark_unread(uuid), public.lead_my_unread_marks() TO authenticated;
REVOKE ALL ON FUNCTION public.lead_media_to_keep(), public.lead_media_kept(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_media_to_keep(), public.lead_media_kept(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
