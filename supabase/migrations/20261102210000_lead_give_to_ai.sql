-- Lead View: hand one chat to the AI Agent by hand (2026-11-02 — the user, the chat header's CS menu showing only
-- "Nobody": "这个是默认的吗？还是我可以指定这个聊天室是ai agent", then "Yes, add it").
--
-- The chat header's CS menu gets "✦ AI Agent" (Lead View · Manage, as giving the chat to a CS is — `lead_give_to_ai`):
-- the conversation goes to the AI (`ai_on`, its count from 0; a template waiting stops) and the Inbox has it answer at
-- once — the webhook's own path (lib/leads/ai-answer.ts), run with the person's session. So the AI's claim, reply, stop
-- and the outbox's two functions take a signed-in caller too, one with Lead View · Create or Manage
-- (`lead_need`, which lets the webhook's service role through as before). Picking a CS or Nobody takes it back
-- (the app calls `lead_give_to_ai(…, false)` first). The card says who has it (`lead_contact_json` + `aiOn`).
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_contact_json (09dd2df1…), lead_ai_claim (0a0f6e98…),
-- lead_ai_answered (44bc421d…), lead_ai_stop (8e6eef8c…), lead_outbox (6bd24e71…), lead_outbox_done (ab461056…).

CREATE OR REPLACE FUNCTION public.lead_give_to_ai(p_contact uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Giving a conversation to the AI Agent needs Lead View · Manage.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(p_on, false) THEN
    UPDATE public.lead_contacts SET ai_on = true, ai_turns = 0, ai_busy_at = NULL, restart_at = NULL,
           flow_state = CASE WHEN flow_state = 'running' THEN 'stopped' ELSE flow_state END,
           flow_step = CASE WHEN flow_state = 'running' THEN NULL ELSE flow_step END
     WHERE id = p_contact;
    INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
    VALUES (p_contact, 'Given to the AI Agent by ' || public.lead_actor_name(), public.lead_actor_name(), auth.uid());
  ELSIF c.ai_on THEN
    UPDATE public.lead_contacts SET ai_on = false, ai_busy_at = NULL WHERE id = p_contact;
    INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
    VALUES (p_contact, 'Taken back from the AI Agent by ' || public.lead_actor_name(), public.lead_actor_name(), auth.uid());
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.lead_give_to_ai(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_give_to_ai(uuid, boolean) TO authenticated, service_role;

DO $do$
DECLARE
  v_need text := $$PERFORM public.lead_need(ARRAY['leads.create', 'leads.manage'], 'The AI Agent''s answer needs Lead View · Create.');  -- mig 20261102210000$$;
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_contact_json(lead_contacts)', '09dd2df116d2790a1115899b7ffd781f',
          $$'phoneTyped', c.phone_typed)$$, $$'phoneTyped', c.phone_typed, 'aiOn', c.ai_on)$$],
    ARRAY['public.lead_ai_claim(uuid[])', '0a0f6e981a7fee812e680f4bb4cc2156',
          $$BEGIN
  WITH due AS ($$, $$BEGIN
  __NEED__
  WITH due AS ($$],
    ARRAY['public.lead_ai_answered(uuid, text, text, boolean, text, integer)', '44bc421d84617c47e59218190913fa54',
          $$BEGIN
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;$$, $$BEGIN
  __NEED__
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;$$],
    ARRAY['public.lead_ai_stop(uuid, text, boolean)', '8e6eef8cc4241da2231648a785c1c010',
          $$BEGIN
  IF coalesce(p_keep, false) THEN$$, $$BEGIN
  __NEED__
  IF coalesce(p_keep, false) THEN$$],
    ARRAY['public.lead_outbox(uuid[])', '6bd24e71dd58672f9d2f849d20ea0190',
          $$BEGIN
  RETURN coalesce(($$, $$BEGIN
  __NEED__
  RETURN coalesce(($$],
    ARRAY['public.lead_outbox_done(jsonb)', 'ab461056b51fd760308ce58a8d3ed0f5',
          $$BEGIN
  FOR r IN SELECT$$, $$BEGIN
  __NEED__
  FOR r IN SELECT$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261102210000' IN v_src) > 0 OR position('''aiOn''' IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(v_def, v_swaps[i][3], replace(v_swaps[i][4], '__NEED__', v_need));
  END LOOP;
END
$do$;

-- Callable from the Inbox (each asks lead_need first); still the webhook's service role's.
GRANT EXECUTE ON FUNCTION public.lead_ai_claim(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_answered(uuid, text, text, boolean, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_ai_stop(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_outbox(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_outbox_done(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
