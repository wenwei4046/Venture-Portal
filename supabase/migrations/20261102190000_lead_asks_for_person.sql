-- Lead View: a customer who asks for a person gets one (2026-11-02 — the user: "当客户写：客服/ customer service, real
-- people 等类似的字眼，要变为talk to person").
--
-- A customer message that asks for a person — 客服, 真人, 人工, customer service, real person / people, talk to a person,
-- khidmat pelanggan … (`lead_asks_for_person`, twin `asksForPerson` in lib/leads/template.ts) — stops a template waiting on
-- them and takes the conversation off the AI Agent, and the chat waits for CS: "Customer asked for a person — handed the
-- customer to Customer Service" on the timeline (actor Flow, so "every message" (mig 20261102160000) starts nothing
-- until somebody of ours answers). Asked again before anybody answers, nothing more is written.
--
-- PRODUCTION's lead_flow_on_message (md5 8c0cc780…, = mig 20261102180000's) with one swap, found exactly once.

CREATE OR REPLACE FUNCTION public.lead_asks_for_person(p_body text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(coalesce(p_body, '')) ~ (
    '(客服|真人|人工|找人|转人工|轉人工|联系人员|聯繫人員|'
    || '\mcustomer (service|support|care)\M|\mreal (person|people|human)\M|\mhuman\M|\mlive (agent|chat|person)\M|'
    || '\m(talk|speak|chat) (to|with) (a |an |your |someone|somebody|person|people|human|agent|staff|sales)|\mcustomer servise\M|'
    || '\mkhidmat pelanggan\M|\morang sebenar\M|\m(cakap|bercakap) dengan (orang|staf|ejen)\M)'
  )
$$;
REVOKE ALL ON FUNCTION public.lead_asks_for_person(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_asks_for_person(text) TO service_role;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$  IF NEW.direction <> 'in' THEN
    RETURN NULL;
  END IF;$$;
  v_new text := $$  IF NEW.direction <> 'in' THEN
    RETURN NULL;
  END IF;

  -- The customer asks for a person (mig 20261102190000): no template, no AI Agent — the chat waits for CS.
  IF public.lead_asks_for_person(NEW.body) THEN
    IF c.flow_state = 'running' OR c.ai_on
       OR NOT EXISTS (SELECT 1 FROM (SELECT e.what, e.at FROM public.lead_events e WHERE e.contact_id = c.id AND e.actor_name = 'Flow'
                                      ORDER BY e.at DESC, e.id DESC LIMIT 1) h
                       WHERE h.what LIKE 'Customer asked for a person%'
                         AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender IN ('cs', 'page') AND m.created_at > h.at)) THEN
      UPDATE public.lead_contacts SET
        flow_state = CASE WHEN flow_state = 'running' THEN 'stopped' ELSE flow_state END,
        flow_step = CASE WHEN flow_state = 'running' THEN NULL ELSE flow_step END,
        flow_tries = 0, ai_on = false, ai_busy_at = NULL, last_dir = 'in'
       WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name)
      VALUES (c.id, 'Customer asked for a person — handed the customer to Customer Service', 'Flow');
    END IF;
    RETURN NULL;
  END IF;$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261102190000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '8c0cc780f5294f58f17013ba406f29ae' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

NOTIFY pgrst, 'reload schema';
