-- Lead View: the Inbox hears a new message at once (2026-11-02 — the user: "我发现手机发出后，电脑端很慢才收到讯息", then,
-- shown that Meta reaches the server in 2–5 s and the Inbox read again only every 15 s, "Yes, live push").
--
-- As the Revenue app's bell (mig 20261014223000): every statement that adds messages to lead_messages — a customer's
-- from Meta, a template's, the AI Agent's, CS's — tells the private Realtime channel `leads:inbox` that something
-- moved, and every open Inbox reads its list again at once (its 15-second read stays as the fallback). The channel
-- carries no content — only "message" — and only somebody holding Lead View · View may listen (the policy on
-- realtime.messages below); every table stays closed to the browser as it was, and the Inbox reads through its usual
-- readers. One message a statement (a transition table), so a history of 300 messages filled in at once is one ping.
-- A failure only warns: the Inbox never stops a message being kept. A database without Realtime (a local check) skips
-- the policy; the trigger's send then only warns.

CREATE OR REPLACE FUNCTION public.lead_inbox_ping()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(jsonb_build_object('at', now()), 'message', 'leads:inbox', true);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'lead_inbox_ping: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.lead_inbox_ping() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER lead_messages_inbox_ping
  AFTER INSERT ON public.lead_messages
  REFERENCING NEW TABLE AS fresh
  FOR EACH STATEMENT EXECUTE FUNCTION public.lead_inbox_ping();

-- Only Lead View's readers hear it: a signed-in session holding Lead View · View may listen to `leads:inbox`.
DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'leads: the inbox channel') THEN
    EXECUTE $policy$
      CREATE POLICY "leads: the inbox channel" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          (SELECT realtime.topic()) = 'leads:inbox'
          AND realtime.messages.extension = 'broadcast'
          AND (SELECT public.has_any_action(ARRAY['leads.view']))
        )
    $policy$;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
