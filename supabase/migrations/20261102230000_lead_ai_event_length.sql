-- Lead View: the AI Agent's hand-over line fits the timeline (2026-11-02 — the user, testing: the AI answered nothing to
-- "Any promotion?" — "AI Agent 不是会自动回复的吗？").
--
-- A timeline line holds 200 characters (lead_events_what_check). `lead_ai_answered` wrote "AI Agent handed the customer
-- to Customer Service — " and up to 200 characters of the AI's note: a long note broke the check and the whole reply
-- was thrown away (the webhook's log: "lead_ai_answered failed: … lead_events_what_check"). `lead_ai_stop` had the same
-- shape. Now each line is cut to 200 as a whole.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: lead_ai_answered (e47e2bea…), lead_ai_stop (04c34db0…).

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_ai_answered(uuid, text, text, boolean, text, integer)', 'e47e2bea277f3698b00c52b4f4c98b7a',
          $$    VALUES (p_contact, 'AI Agent handed the customer to Customer Service'
              || CASE WHEN NOT coalesce(p_handoff, false) THEN ' — ' || v_limit || ' replies' WHEN btrim(coalesce(p_note, '')) <> '' THEN ' — ' || left(btrim(p_note), 200) ELSE '' END,
            'AI Agent');$$,
          $$    -- One timeline line holds 200 characters (mig 20261102230000).
    VALUES (p_contact, left('AI Agent handed the customer to Customer Service'
              || CASE WHEN NOT coalesce(p_handoff, false) THEN ' — ' || v_limit || ' replies' WHEN btrim(coalesce(p_note, '')) <> '' THEN ' — ' || btrim(p_note) ELSE '' END, 200),
            'AI Agent');$$],
    ARRAY['public.lead_ai_stop(uuid, text, boolean)', '04c34db096ee3b3ef2b5bef142b2ef8d',
          $$    VALUES (p_contact, 'AI Agent handed the customer to Customer Service — ' || left(coalesce(nullif(btrim(p_why), ''), 'it could not answer'), 200), 'AI Agent');$$,
          $$    -- One timeline line holds 200 characters (mig 20261102230000).
    VALUES (p_contact, left('AI Agent handed the customer to Customer Service — ' || coalesce(nullif(btrim(p_why), ''), 'it could not answer'), 200), 'AI Agent');$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position('mig 20261102230000' IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(v_def, v_swaps[i][3], v_swaps[i][4]);
  END LOOP;
END
$do$;

-- A claim left by the failed replies is let go, so the next message is answered at once.
UPDATE public.lead_contacts SET ai_busy_at = NULL WHERE ai_busy_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
