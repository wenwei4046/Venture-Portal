-- Lead View: a template's {name} becomes the customer's name, and a step may offer ‹ Back to the question before it
-- (2026-11-02 — the user, a template's welcome reaching Messenger as "Hello! *{name}*!": "name 没有改？"; and "要有一个back
-- 功能，主要是让客户在聊到一半之后可以返回上个问题（加在reply template里面）").
--
-- {name}: Reply templates offer it (the new template's own first step says "Hi {name}!") but only Campaigns filled it in;
-- the runner sent it as typed. `lead_flow_say` — every word a template sends goes through it (steps, an option's other
-- replies, a question coming back, a phone asked again, closing messages) — now puts the customer's name in, "there"
-- when Meta gave none, as a campaign does.
--
-- ‹ Back: a question, Types an answer or Gives a phone step with `back` ticked shows a ‹ Back button (Messenger's quick
-- reply) when the customer was asked something before it in this run. Tapped (or typed: back, 返回, 上一步, kembali), the
-- question before it is asked again, as it was. `lead_contacts.flow_trail` keeps the steps that waited on the customer in
-- this run, oldest first; a run that starts again at the template's first step starts it again.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_flow_say (4433d0d7…), lead_flow_send (ec0a9492…),
-- lead_flow_on_message (4b2ca8a6f45ad49bbb7dab46710968c7, = mig 20261102170000's).

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS flow_trail jsonb NOT NULL DEFAULT '[]'::jsonb;

-- What a waiting step offers: a question's options, then ‹ Back when the step has it and something was asked before it.
CREATE OR REPLACE FUNCTION public.lead_flow_buttons(p_contact uuid, p_flow public.lead_flows, s jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_opts jsonb := CASE WHEN s->>'kind' = 'question' THEN (SELECT jsonb_agg(b->>'label') FROM jsonb_array_elements(s->'buttons') b) END;
  v_back boolean;
BEGIN
  v_back := s->>'back' = 'true' AND s->>'kind' IN ('question', 'text', 'phone') AND s->>'id' IS DISTINCT FROM p_flow.steps->0->>'id'
    AND EXISTS (SELECT 1 FROM public.lead_contacts c, jsonb_array_elements_text(c.flow_trail) t(x) WHERE c.id = p_contact AND t.x <> s->>'id');
  IF v_back THEN
    RETURN coalesce(v_opts, '[]'::jsonb) || '["‹ Back"]'::jsonb;
  END IF;
  RETURN v_opts;
END
$$;
REVOKE ALL ON FUNCTION public.lead_flow_buttons(uuid, public.lead_flows, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_buttons(uuid, public.lead_flows, jsonb) TO service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_flow_say(uuid, text, text, jsonb)', '4433d0d78c642c3a3a705001f6072951',
          $$  INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, buttons)
  VALUES (p_contact, 'out', 'flow', p_name, left(p_text, 2000), p_buttons);
  UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = left(p_text, 200), updated_at = now() WHERE id = p_contact;$$,
          $$  -- {name} is the customer's name, "there" without one, as a campaign's (mig 20261102180000).
  p_text := replace(p_text, '{name}', coalesce((SELECT nullif(btrim(c.name), '') FROM public.lead_contacts c WHERE c.id = p_contact), 'there'));
  INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, buttons)
  VALUES (p_contact, 'out', 'flow', p_name, left(p_text, 2000), p_buttons);
  UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = left(p_text, 200), updated_at = now() WHERE id = p_contact;$$,
          '', ''],
    ARRAY['public.lead_flow_send(uuid, lead_flows, text)', 'ec0a9492979400a7da27e98d6b06ebd7',
          $$      CASE WHEN s->>'kind' = 'question' THEN (SELECT jsonb_agg(b->>'label') FROM jsonb_array_elements(s->'buttons') b) END);$$,
          $$      public.lead_flow_buttons(p_contact, p_flow, s));$$,
          $$      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = v_step, flow_state = 'running', flow_tries = 0, flow_picked = '[]'::jsonb WHERE id = p_contact;$$,
          $$      -- The steps that waited in this run, for ‹ Back (mig 20261102180000); the first step starts the run again.
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = v_step, flow_state = 'running', flow_tries = 0, flow_picked = '[]'::jsonb,
             flow_trail = CASE WHEN v_step = p_flow.steps->0->>'id' THEN jsonb_build_array(v_step) ELSE flow_trail || to_jsonb(v_step) END
       WHERE id = p_contact;$$],
    ARRAY['public.lead_flow_on_message()', '4b2ca8a6f45ad49bbb7dab46710968c7',
          $$    IF s->>'kind' = 'question' THEN
      -- An option tapped or typed$$,
          $$    -- ‹ Back (mig 20261102180000): the step that waited before this one, asked again.
    IF s->>'back' = 'true' AND lower(btrim(NEW.body)) IN ('‹ back', 'back', '返回', '上一步', 'kembali')
       AND jsonb_array_length(c.flow_trail) > 1 AND c.flow_trail->>-1 = c.flow_step THEN
      v_next := c.flow_trail->>(jsonb_array_length(c.flow_trail) - 2);
      UPDATE public.lead_contacts SET flow_trail = flow_trail - (jsonb_array_length(flow_trail) - 1) - (jsonb_array_length(flow_trail) - 2) WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Went back to the question before', 'Flow');
      PERFORM public.lead_flow_send(c.id, f, v_next);
      RETURN NULL;
    END IF;
    IF s->>'kind' = 'question' THEN
      -- An option tapped or typed$$,
          '', '']];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261102180000' IN v_src) > 0 THEN
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

NOTIFY pgrst, 'reload schema';
