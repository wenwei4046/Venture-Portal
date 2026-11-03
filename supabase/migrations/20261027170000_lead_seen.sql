-- Lead View › opening a chat clears its unread count, for whoever opened it (2026-10-27 — the user, after the count
-- went live (mig 20261027160000, cleared only by answering): "打开对话就清零了，有些是没必要回复的"; .claude/rules/leads/
-- lead-view.md › UNREAD).
--
--   - lead_seen (person × conversation → the last message id they have seen): RLS on, no policy, no grants — read and
--     written only by the two functions here. Per person, so the Principal opening a chat does not clear it for CS.
--   - lead_mark_seen(contact) (Lead View · View — reading; no page guard: View never narrows a write): the caller has
--     seen everything in it up to now. readThread calls it each time a chat is opened or read again.
--   - lead_inbox()'s `unread` (production's body md5 195d52d0…, the count's one bound swapped): the customer's
--     messages after BOTH the last message out and what the caller has seen.

CREATE TABLE IF NOT EXISTS public.lead_seen (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.lead_contacts(id) ON DELETE CASCADE,
  seen_id    bigint NOT NULL,
  seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id)
);
ALTER TABLE public.lead_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_seen FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_seen', 'Lead View read marks', 'Member services', '{}', 'none',
  p_reason => 'How far each person has read a conversation — a marker on the screen, not data.');

CREATE OR REPLACE FUNCTION public.lead_mark_seen(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_last bigint;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  SELECT max(id) INTO v_last FROM public.lead_messages WHERE contact_id = p_contact;
  IF v_last IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.lead_seen (user_id, contact_id, seen_id) VALUES (auth.uid(), p_contact, v_last)
  ON CONFLICT (user_id, contact_id) DO UPDATE SET seen_id = greatest(lead_seen.seen_id, excluded.seen_id), seen_at = now();
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_mark_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_mark_seen(uuid) TO authenticated;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_inbox()'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_inbox()'::regprocedure);
  v_old text := $$AND m.id > coalesce((SELECT max(o.id) FROM public.lead_messages o WHERE o.contact_id = c.id AND o.direction = 'out'), 0)$$;
  v_new text := $$AND m.id > greatest(coalesce((SELECT max(o.id) FROM public.lead_messages o WHERE o.contact_id = c.id AND o.direction = 'out'), 0),
                                 coalesce((SELECT s.seen_id FROM public.lead_seen s WHERE s.user_id = auth.uid() AND s.contact_id = c.id), 0))$$;
BEGIN
  IF position('lead_seen' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '195d52d07d2f977a82ad8fb13c66d5a1' THEN
    RAISE EXCEPTION 'lead_inbox: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'lead_inbox: the unread bound is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
