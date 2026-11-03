-- Lead View: the reply rules answer every message, not only a conversation's first (2026-11-02 — the user, testing
-- templates from a Facebook account that had written to the Page before: "修改为会跑", then, of four ways, "每条讯息都跑").
--
-- Until now a reply rule ran on a conversation's FIRST message, and again only within the hour of a click back from an
-- ad (mig 20261029170010). Now a LATER message runs the rules too when:
--   * no template is waiting on the customer (that one answers it, as before — the branch above returns first),
--   * nobody of ours wrote to them in the last 24 hours — Customer Service in Lead View (sender 'cs') or a person in
--     Business Suite (sender 'page'); a template's own messages ('flow') do not count, and
--   * a rule answers with a template or the AI Agent. No rule for the conversation, or one that says Customer Service,
--     leaves today's later-message triggers (a keyword, the away message) as they were.
-- So a customer who keeps writing while nobody answers gets the template again each time — the user's choice.
--
-- PRODUCTION's lead_flow_on_message (md5 c0c1d012…, = mig 20261029170010's) with two swaps, each found exactly once:
-- a variable declared, and the first-message branch's condition widened.

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_src text;
  v_def text;
  v_decl_old text := $$  v_again boolean := false;
BEGIN$$;
  v_decl_new text := $$  v_again boolean := false;
  v_every boolean := false;
BEGIN$$;
  v_if_old text := $$  IF (v_first AND c.flow_state = 'none') OR v_again THEN$$;
  v_if_new text := $$  -- Every message (mig 20261102150000): a later one, no template waiting (above), nobody of ours — CS, or a person
  -- in Business Suite — writing in the last 24 hours, and a rule that answers with a template or the AI Agent.
  v_every := NOT v_first AND NOT v_again
    AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender IN ('cs', 'page')
                     AND m.created_at > now() - interval '24 hours')
    AND coalesce(public.lead_rule_reply(c), 'cs') <> 'cs';
  IF (v_first AND c.flow_state = 'none') OR v_again OR v_every THEN$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('v_every' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'c0c1d012577bacd7933939655f74a5d0' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_decl_old, ''))) / length(v_decl_old) <> 1 THEN
    RAISE EXCEPTION '%: the declaration to swap is not there exactly once', v_sig;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_if_old, ''))) / length(v_if_old) <> 1 THEN
    RAISE EXCEPTION '%: the first message''s condition is not there exactly once', v_sig;
  END IF;
  v_def := replace(replace(v_def, v_decl_old, v_decl_new), v_if_old, v_if_new);
  EXECUTE v_def;
END
$do$;

NOTIFY pgrst, 'reload schema';
