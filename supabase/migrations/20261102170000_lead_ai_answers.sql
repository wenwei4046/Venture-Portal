-- Lead View: the AI Agent answers customers by itself (2026-11-02 — the user: "flow到最后一部如果交给ai agent，要设定他根据该
-- 聊天记录去读 再回复，达成goal"; it stops when CS replies, when it is unsure, when the goal is reached, or after too many
-- turns; and a reply rule set to "AI Agent" answers the same way).
--
-- Until now the AI Agent was a copilot only: a template's AI Agent step, or a reply rule set to AI Agent, left the chat
-- waiting for CS, who could ask for a draft. Now such a conversation is the AI Agent's (`lead_contacts.ai_on`): after each
-- webhook delivery the app (lib/leads/ai-answer.ts) claims the conversations whose customer wrote last
-- (`lead_ai_claim`), reads the chat with the brand's agent (its settings, Knowledge, General info, fixed answers — the
-- draft's own reading), and records the reply (`lead_ai_answered`, sender 'ai'), which the outbox sends as a template's
-- messages go (`lead_outbox` now takes 'ai' too). It hands the customer to CS — `ai_on` off, "AI Agent handed the
-- customer to Customer Service" on the timeline — when the model says a person should take over (unsure, upset, the
-- goal reached), after 10 replies (`ai_turns`), or when it cannot answer at all (`lead_ai_stop`). A message from CS in
-- Lead View or a person in Business Suite takes it off too. While it is on, the reply rules and keyword triggers leave
-- the customer's messages to it.
--
-- The service role may pass `lead_need` (the readers the draft uses: lead_ai_context, lead_ai_more, lead_info, the Data
-- Center's): it is the app's server answering a webhook with no person's session, and it reads and writes every table
-- anyway. Every other caller is asked as before.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_need (c31452e4…), lead_flow_to_cs (0046d381…),
-- lead_outbox (31c89708…), lead_flow_on_message (33603adc96b3ac1bdaaf8b25a157f991, = mig 20261102160000's).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS ai_on boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_turns integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_busy_at timestamptz;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_need(text[], text)', 'c31452e403522ce84d4f4001c8e791ba',
          $$  IF NOT public.has_any_action(p_wants) THEN$$,
          $$  -- The app's server answering a webhook (the AI Agent, mig 20261102170000) has no person's session.
  IF NOT public.has_any_action(p_wants)
     AND coalesce(current_setting('request.jwt.claim.role', true), current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN$$,
          '', ''],
    ARRAY['public.lead_flow_to_cs(uuid, lead_flows, boolean)', '0046d3810433fc7c333633d9aaff741d',
          $$  UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', flow_tries = 0, last_dir = 'in' WHERE id = p_contact;$$,
          $$  -- Handed to the AI Agent, it answers from here on (mig 20261102170000).
  UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', flow_tries = 0, last_dir = 'in',
         ai_on = p_ai, ai_turns = 0, ai_busy_at = NULL WHERE id = p_contact;$$,
          $$' handed the customer to the AI Agent (copilot — waits for CS)'$$,
          $$' handed the customer to the AI Agent'$$],
    ARRAY['public.lead_outbox(uuid[])', '31c8970874c39915099b29fbed00898f',
          $$AND m.sender = 'flow'$$,
          $$AND m.sender IN ('flow', 'ai')$$,
          '', ''],
    ARRAY['public.lead_flow_on_message()', '33603adc96b3ac1bdaaf8b25a157f991',
          $$  v_first := NOT EXISTS$$,
          $$  -- The AI Agent answers this customer, from the app after the delivery (mig 20261102170000): no rule or trigger here.
  IF c.ai_on THEN
    RETURN NULL;
  END IF;

  v_first := NOT EXISTS$$,
          '', '']];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261102170000' IN v_src) > 0 OR position($$IN ('flow', 'ai')$$ IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    v_def := replace(v_def, v_swaps[i][3], v_swaps[i][4]);
    IF v_swaps[i][5] <> '' THEN
      IF (length(v_def) - length(replace(v_def, v_swaps[i][5], ''))) / length(v_swaps[i][5]) <> 1 THEN
        RAISE EXCEPTION '%: the second text to swap is not there exactly once', v_sig;
      END IF;
      v_def := replace(v_def, v_swaps[i][5], v_swaps[i][6]);
    END IF;
    EXECUTE v_def;
  END LOOP;
END
$do$;

-- A reply rule set to AI Agent puts the conversation in its hands (the runner's rule branch).
DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_def text := pg_get_functiondef('public.lead_flow_on_message()'::regprocedure);
  v_old text := $$        INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Reply rules: the AI Agent answers (copilot — waits for CS)', 'Flow');$$;
  v_new text := $$        UPDATE public.lead_contacts SET ai_on = true, ai_turns = 0, ai_busy_at = NULL WHERE id = c.id;
        INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Reply rules: the AI Agent answers', 'Flow');$$;
BEGIN
  IF position('Reply rules: the AI Agent answers''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the AI rule''s event is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

-- A person of ours answered — CS in Lead View, or a person in Business Suite (sender 'page', which the runner's trigger
-- never sees): the AI Agent stops answering. Not for the earlier messages filled in from Meta (lead_ingest_history).
CREATE OR REPLACE FUNCTION public.lead_ai_off_on_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('lead.history', true) = 'on' THEN
    RETURN NULL;
  END IF;
  UPDATE public.lead_contacts SET ai_on = false, ai_busy_at = NULL WHERE id = NEW.contact_id AND ai_on;
  IF FOUND THEN
    INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (NEW.contact_id, 'AI Agent stopped — a person replied', 'AI Agent');
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.lead_ai_off_on_reply() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER lead_messages_ai_off
  AFTER INSERT ON public.lead_messages
  FOR EACH ROW WHEN (NEW.sender IN ('cs', 'page'))
  EXECUTE FUNCTION public.lead_ai_off_on_reply();

-- The app claims the conversations it will answer: the AI Agent's, a real Messenger / Instagram one with its Page, just
-- handed to it or the customer writing last, inside Meta's 24 hours, nobody already answering it (a claim older than 3
-- minutes is let go).
CREATE OR REPLACE FUNCTION public.lead_ai_claim(p_contacts uuid[])
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH due AS (
    SELECT c.id FROM public.lead_contacts c
     WHERE c.id = ANY (coalesce(p_contacts, '{}')) AND c.ai_on AND NOT c.is_test
       AND c.channel IN ('messenger', 'instagram') AND c.page_id IS NOT NULL
       AND (c.ai_busy_at IS NULL OR c.ai_busy_at < now() - interval '3 minutes')
       -- Just handed to it (no reply of its own yet), or the customer wrote last.
       AND (c.ai_turns = 0
            OR (SELECT m.direction FROM public.lead_messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) = 'in')
       AND (SELECT max(m.created_at) FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in') > now() - interval '24 hours'
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.lead_contacts c SET ai_busy_at = now() FROM due WHERE c.id = due.id RETURNING c.id
  )
  SELECT array_agg(id) INTO v_ids FROM claimed;
  RETURN coalesce(v_ids, '{}');
END
$$;

-- The AI Agent's reply, kept to be sent (the outbox). Nothing when the conversation left its hands meanwhile (CS
-- replied). It hands the customer to CS when the model says so or on its 10th reply.
CREATE OR REPLACE FUNCTION public.lead_ai_answered(p_contact uuid, p_body text, p_name text, p_handoff boolean, p_note text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.lead_contacts;
  v_id bigint;
  v_done boolean;
BEGIN
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND OR NOT c.ai_on THEN
    RETURN NULL;
  END IF;
  IF btrim(coalesce(p_body, '')) = '' THEN
    RAISE EXCEPTION 'The agent wrote nothing.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body)
  VALUES (p_contact, 'out', 'ai', left(coalesce(nullif(btrim(p_name), ''), 'AI Agent'), 80), left(btrim(p_body), 2000))
  RETURNING id INTO v_id;
  v_done := coalesce(p_handoff, false) OR c.ai_turns + 1 >= 10;
  UPDATE public.lead_contacts SET last_at = now(), last_dir = CASE WHEN v_done THEN 'in' ELSE 'out' END, last_text = left(btrim(p_body), 200),
         updated_at = now(), ai_turns = ai_turns + 1, ai_busy_at = NULL, ai_on = NOT v_done
   WHERE id = p_contact;
  IF v_done THEN
    INSERT INTO public.lead_events (contact_id, what, actor_name)
    VALUES (p_contact, 'AI Agent handed the customer to Customer Service'
              || CASE WHEN NOT coalesce(p_handoff, false) THEN ' — 10 replies' WHEN btrim(coalesce(p_note, '')) <> '' THEN ' — ' || left(btrim(p_note), 200) ELSE '' END,
            'AI Agent');
  END IF;
  RETURN v_id;
END
$$;

-- It could not answer (the brand's agent not set up, no API key): the customer goes to CS. p_keep: a passing failure —
-- the claim is let go and the next message tries again.
CREATE OR REPLACE FUNCTION public.lead_ai_stop(p_contact uuid, p_why text, p_keep boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(p_keep, false) THEN
    UPDATE public.lead_contacts SET ai_busy_at = NULL WHERE id = p_contact;
    RETURN;
  END IF;
  UPDATE public.lead_contacts SET ai_on = false, ai_busy_at = NULL, last_dir = 'in' WHERE id = p_contact AND ai_on;
  IF FOUND THEN
    INSERT INTO public.lead_events (contact_id, what, actor_name)
    VALUES (p_contact, 'AI Agent handed the customer to Customer Service — ' || left(coalesce(nullif(btrim(p_why), ''), 'it could not answer'), 200), 'AI Agent');
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.lead_ai_claim(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_ai_answered(uuid, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_ai_stop(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_claim(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_ai_answered(uuid, text, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_ai_stop(uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
