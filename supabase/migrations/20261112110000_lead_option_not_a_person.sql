-- A tapped option is the option, even when its words ask for a person (2026-11-12 — the user, a preview where Welcome's
-- "Talk to Person" button handed the chat to CS instead of sending the "Talk to Person" step: "为什么从welcome 点 talk to
-- person 不会呈现happy to help等的文字?"; then "先修复完所有bug").
--
-- Mig 20261102190000 stops a template when the customer's words ask for a person (lead_asks_for_person) — and it asks
-- before the waiting question looks at the answer, so an option worded "Talk to Person" (24 buttons in three templates on
-- 2026-11-12) never reached its own step. Now, when a template waits on a question and the message is one of that
-- question's options (its English or Chinese words, lead_flow_is), the question answers it; words that are no option
-- still go to CS as before.
--
-- PRODUCTION's lead_flow_on_message (md5 4580c7f5…, = 20261111130000's), one condition swapped, found once.

DO $do$
DECLARE
  v_old text := $$IF public.lead_asks_for_person(NEW.body) THEN$$;
  v_new text := $$IF public.lead_asks_for_person(NEW.body)
     -- A tapped or typed option of the waiting question is that option, whatever its words (mig 20261112110000).
     AND NOT (c.flow_state = 'running' AND EXISTS (
       SELECT 1 FROM public.lead_flows fx, jsonb_array_elements(fx.steps) sx,
                     jsonb_array_elements(CASE WHEN jsonb_typeof(sx->'buttons') = 'array' THEN sx->'buttons' ELSE '[]'::jsonb END) bx
        WHERE fx.id = c.flow_id AND sx->>'id' = c.flow_step AND sx->>'kind' = 'question' AND public.lead_flow_is(NEW.body, bx))) THEN$$;
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_src text;
  v_def text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261112110000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM '4580c7f5edf30b8ee7a0f67a2994c632' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;
