-- Lead View: Start over — a conversation's next message runs the reply rules as a first message does (2026-11-02 — the
-- user, a test chat that a template had handed to a person and that "every message" (migs 20261102150000 / 160000) then
-- left to CS for 24 hours: "Yes, add it").
--
-- The Inbox's ⋯ › Start over (`lead_start_over`, Lead View · Create, the Inbox's page): a template waiting on the customer
-- stops, the AI Agent steps aside, and `lead_contacts.restart_at` is set; the customer's next message runs the reply rules
-- (or, with no rule, the old triggers) whatever happened before — once — and clears it. "Started over by <name>" on the
-- timeline. Nothing is sent to the customer.
--
-- PRODUCTION's lead_flow_on_message (md5 b227eaec…, = mig 20261102190000's) with one swap, found exactly once.
--
-- Also (the user, AI Agent › How it replies' number boxes: "这不能设定任意数字"): the AI's reply limit is the brand's number
-- as set; 30 only when none is set (lead_ai_answered, production's md5 b5352781…, one line swapped).

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS restart_at timestamptz;

CREATE OR REPLACE FUNCTION public.lead_start_over(p_contact uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'Starting over needs Lead View · Create.');
  UPDATE public.lead_contacts SET restart_at = now(), flow_state = 'none', flow_step = NULL, flow_tries = 0, flow_picked = '[]'::jsonb,
         flow_trail = '[]'::jsonb, ai_on = false, ai_busy_at = NULL, ad_again_at = NULL
   WHERE id = p_contact;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
  VALUES (p_contact, 'Started over by ' || public.lead_actor_name() || ' — the next message runs the reply rules', public.lead_actor_name(), auth.uid());
END
$$;
REVOKE ALL ON FUNCTION public.lead_start_over(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_start_over(uuid) TO authenticated, service_role;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_flow_on_message()'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$  IF (v_first AND c.flow_state = 'none') OR v_again OR v_every THEN$$;
  v_new text := $$  -- Started over in the Inbox (mig 20261102200000): this message runs the rules as a first message does, once.
  IF c.restart_at IS NOT NULL THEN
    UPDATE public.lead_contacts SET restart_at = NULL WHERE id = c.id;
    v_again := true;
  END IF;
  IF (v_first AND c.flow_state = 'none') OR v_again OR v_every THEN$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261102200000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'b227eaecf216c073dd5140b8d5e609e6' THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
  END IF;
  v_def := pg_get_functiondef(v_sig);
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_ai_answered(uuid, text, text, boolean, text, integer)'::regprocedure;
  v_src text;
  v_def text;
  v_old text := $$  v_limit := greatest(1, least(coalesce(p_max, 30), 30));$$;
  v_new text := $$  v_limit := greatest(1, coalesce(p_max, 30));  -- the brand's number as set; 30 with none (mig 20261102200000)$$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
  IF position('mig 20261102200000' IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'b53527811511c803c8ca38a3ab084fdf' THEN
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
