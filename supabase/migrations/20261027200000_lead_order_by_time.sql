-- Lead View › a conversation in the order it was written (2026-10-27). Messages Meta had and Lead View missed were filled
-- in that day at their real times (the user: "补回去") — older messages kept later than newer ones, so ordering by the
-- row's id put them at the chat's end and counted unread wrongly. Both now go by the message's own time:
--   - lead_thread(): messages ORDER BY created_at (then id), PRODUCTION's body md5 ee6b0c5c…, one ORDER BY swapped.
--   - lead_inbox()'s `unread`: the customer's messages written after the last message out AND after the caller last
--     opened the chat (lead_seen.seen_at — lead_mark_seen sets it to now()), PRODUCTION's body md5 bb297249…, the
--     bound swapped.

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_thread(uuid)',
          $$'mediaUrl', m.media_url) ORDER BY m.id)$$,
          $$'mediaUrl', m.media_url) ORDER BY m.created_at, m.id)$$,
          'ee6b0c5c2e53cba1ea639afb2f08247a'],
    ARRAY['public.lead_inbox()',
          $$AND m.id > greatest(coalesce((SELECT max(o.id) FROM public.lead_messages o WHERE o.contact_id = c.id AND o.direction = 'out'), 0),
                                 coalesce((SELECT s.seen_id FROM public.lead_seen s WHERE s.user_id = auth.uid() AND s.contact_id = c.id), 0))$$,
          $$AND m.created_at > greatest(coalesce((SELECT max(o.created_at) FROM public.lead_messages o WHERE o.contact_id = c.id AND o.direction = 'out'), '-infinity'::timestamptz),
                                 coalesce((SELECT s.seen_at FROM public.lead_seen s WHERE s.user_id = auth.uid() AND s.contact_id = c.id), '-infinity'::timestamptz))$$,
          'bb29724939997dee9a552adab8756de1']];
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
