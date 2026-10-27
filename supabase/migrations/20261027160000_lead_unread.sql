-- Lead View › the Inbox's unread count (2026-10-27 — the user: "还没回复的，或有新讯息的，可以有个在右手边有数字，像WA 一样",
-- then "要，在对话列表右边加未读数字（客户发来、还没回复的条数）"; .claude/rules/leads/lead-view.md › UNREAD).
--
-- Each conversation the Inbox lists carries `unread`: the customer's messages since the last message that went out to
-- them — CS's reply, a template's, the Page's own (Business Suite), a campaign's. Opening a chat does not clear it;
-- answering does. Nothing is stored: the count is read from lead_messages (index contact_id, id) as the list is read.
--
-- lead_inbox() is PRODUCTION's body (md5 68e0e08f…) with its one json expression swapped; nothing else moves.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_inbox()'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_inbox()'::regprocedure);
  v_old text := $$jsonb_agg(public.lead_contact_json(c) ORDER BY c.last_at DESC)$$;
  v_new text := $$jsonb_agg(public.lead_contact_json(c) || jsonb_build_object('unread', (
      SELECT count(*) FROM public.lead_messages m
       WHERE m.contact_id = c.id AND m.direction = 'in'
         AND m.id > coalesce((SELECT max(o.id) FROM public.lead_messages o WHERE o.contact_id = c.id AND o.direction = 'out'), 0)))
      ORDER BY c.last_at DESC)$$;
BEGIN
  IF position($$'unread'$$ IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '68e0e08f58deaba5ffe0466f283e6483' THEN
    RAISE EXCEPTION 'lead_inbox: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_inbox: its json expression is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
