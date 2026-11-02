-- Lead View: after a template hands a customer to a person or the AI Agent, their next messages do not start the rules
-- again until somebody of ours answers (2026-11-02 — the user, told that "every message" (mig 20261102150000) would greet
-- a customer already handed over: "Yes, fix it").
--
-- A template's Hand to a person / AI Agent step ends it (`lead_flow_to_cs`: flow_state 'done', the event "… handed the
-- customer to …"), and the conversation waits in the Inbox. Under 20261102150000 the customer's next message, nobody
-- having answered, ran the rule's template again from its first step. Now "every message" also asks that the latest
-- template event of the conversation is not such a hand-off with no message from CS (or a person in Business Suite)
-- after it. A template that ends at its end, or one the customer stopped, still runs again on the next message.
--
-- PRODUCTION's lead_flow_on_message (md5 cbd0ae05…, = mig 20261102150000's) with one swap, found exactly once.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$    AND coalesce(public.lead_rule_reply(c), 'cs') <> 'cs';$$;
  v_new text := $$    -- Handed to a person or the AI Agent by a template, and nobody of ours has answered since (mig 20261102160000).
    AND NOT EXISTS (SELECT 1 FROM (SELECT e.what, e.at FROM public.lead_events e WHERE e.contact_id = c.id AND e.actor_name = 'Flow'
                                    ORDER BY e.at DESC, e.id DESC LIMIT 1) h
                     WHERE h.what LIKE '%handed the customer to%'
                       AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender IN ('cs', 'page')
                                        AND m.created_at > h.at))
    AND coalesce(public.lead_rule_reply(c), 'cs') <> 'cs';$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261102160000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'cbd0ae0587d55cc19247de7ead45a0e1' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the condition to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
