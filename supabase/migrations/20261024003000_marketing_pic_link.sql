-- ============================================================================
-- 20261024003000_marketing_pic_link.sql
-- Marketing ⑤-1 — the PIC's link for a 📦 product project's intake minutes (`PIC Link.dc.html` of the Claude Design
-- handoff "HOUZS Marketing Module Setup"): the subsidiary's PIC, who is not a portal user, opens /t/<code>, reads the
-- minutes as far as the template lets them see, and approves (their full name typed) or asks for changes (their words).
-- ============================================================================
--
-- The code is the only key, as the guest link's (`.claude/rules/hr/rooms.md` › THE GUEST LINK): 32 random hex made
-- by mkt_minutes_send (mig 20261024002000), kept on the project, never guessable. The page reads and writes as a
-- stranger — the publishable key, no session — through two SECURITY DEFINER functions granted to anon BY NAME, each
-- checking the code itself (a product project's, not cancelled, sent):
--   mkt_pic_page(code)                            what the PIC reads: for whom, on what, where it stands, when it
--                                                 went, their last answer, what changed after they approved, and the
--                                                 intake minutes' fields the PIC sees (👁) — names, never staff ids; no
--                                                 WhatsApp, no meeting notes, no internal field, no override. NULL when
--                                                 the code is nobody's (the page says only "This link is closed").
--   mkt_pic_answer(code, decision, name, reason)  approve — their full name, 3–80 characters: the minutes completed
--                                                 (locked when the template locks them), the project approved; or
--                                                 changes — 5–500 characters: the project sent back with their words.
--                                                 Only a project waiting for the PIC takes an answer and an answer ends
--                                                 the wait, so a code buys one answer per sending — no hourly cap is
--                                                 needed (the guest link's books and cancels again and again).
-- The trail names the PIC ("<name> (PIC)"); the project's owner — with none, Marketing's managers — is told.
-- PGlite: tests/member-sql/validate-marketing-pic-link.mjs.

-- ── What the PIC reads ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := lower(btrim(coalesce(p_code, '')));
  v_p     public.mkt_projects;
  v_m     public.mkt_minutes;
  v_mv    public.mkt_minutes_versions;
  v_f     jsonb;
  v_v     jsonb;
  v_val   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_last  public.mkt_events;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE link_code = v_code AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE project_id = v_p.id AND intake;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;

  -- The fields the PIC sees, as written — people by their first names, a table's columns with its rows.
  FOR v_f IN SELECT f FROM jsonb_array_elements(coalesce(v_mv.fields, '[]'::jsonb)) f LOOP
    CONTINUE WHEN NOT coalesce((v_f -> 'pic') = 'true'::jsonb, false) OR v_f ->> 'type' = 'Project link';
    v_v := v_m.vals -> (v_f ->> 'name');
    v_val := CASE v_f ->> 'type'
      WHEN 'People' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(x::uuid))
                                     FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_v) = 'array' THEN v_v ELSE '[]'::jsonb END) x
                                    WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Signature' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(k::uuid))
                                        FROM jsonb_object_keys(v_m.signed) k
                                       WHERE k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Table' THEN jsonb_build_object(
        'cols', coalesce((SELECT jsonb_agg(c ->> 'name') FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) c), '[]'::jsonb),
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      WHEN 'Free space' THEN jsonb_build_object(
        'cols', CASE WHEN jsonb_typeof(v_v -> 'cols') = 'array' THEN v_v -> 'cols' ELSE '[]'::jsonb END,
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      ELSE CASE WHEN jsonb_typeof(v_v) = 'string' THEN v_v ELSE NULL END
    END;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', v_f ->> 'name', 'type', v_f ->> 'type', 'value', v_val));
  END LOOP;

  -- Why it waits again: changed after they approved, or resent after the changes they asked for.
  SELECT * INTO v_last FROM public.mkt_events
   WHERE project_id = v_p.id AND action IN ('link sent', 'resent', 'edited after approval')
   ORDER BY id DESC LIMIT 1;

  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'sub', (SELECT x.name FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'product', (SELECT pv.name FROM public.mkt_product_versions pv
                 WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version),
    'title', v_p.title, 'track', v_p.track_id, 'status', v_p.status,
    'owner', public.mkt_staff_name(v_p.owner_staff),
    'startedAt', v_p.created_at, 'sentAt', v_p.link_sent_at,
    'reply', v_p.pic_reply,
    'updated', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'edited after approval'
                    THEN jsonb_build_object('fields', v_last.reason, 'at', v_last.at) END,
    'asked', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'resent' AND v_p.pic_reply ->> 'decision' = 'changes'
                  THEN jsonb_build_object('reason', v_p.pic_reply ->> 'reason', 'at', v_p.pic_reply ->> 'at') END,
    'minutes', jsonb_build_object('title', v_m.title, 'fields', v_out));
END
$fn$;

-- ── The PIC's answer ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_answer(p_code text, p_decision text, p_name text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code   text := lower(btrim(coalesce(p_code, '')));
  v_p      public.mkt_projects;
  v_m      public.mkt_minutes;
  v_mv     public.mkt_minutes_versions;
  v_name   text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_who    text;
  v_to     uuid[];
  v_s      uuid;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE link_code = v_code AND kind = 'product' AND status NOT IN ('minutes', 'cancelled')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  IF v_p.status IS DISTINCT FROM 'waiting_pic' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval now.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE project_id = v_p.id AND intake FOR UPDATE;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  -- Who is told: whoever owns the project; with nobody, Marketing's managers.
  v_to := CASE WHEN v_p.owner_staff IS NOT NULL THEN ARRAY[v_p.owner_staff]
               ELSE ARRAY(SELECT r.staff_id FROM public.mkt_roster() r WHERE r.team = 'manager') END;

  IF p_decision = 'approve' THEN
    IF length(v_name) NOT BETWEEN 3 AND 80 THEN
      RAISE EXCEPTION 'Type your full name to sign off.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = left(v_name || ' (PIC)', 120),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = NULL, updated_at = now()
     WHERE id = v_m.id;
    UPDATE public.mkt_projects
       SET status = 'approved', pic_reply = jsonb_build_object('decision', 'approved', 'name', v_name, 'reason', '', 'at', now()),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason)
    VALUES (v_p.id, NULL, left(v_name || ' (PIC)', 120), 'pic approved', v_m.title);
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_name || ' approved the minutes', 200), v_p.title, 'pic_approved');
    END LOOP;
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 500 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := coalesce(nullif(left(v_name, 80), ''), nullif(btrim(v_p.pic_name), ''), 'The PIC');
    UPDATE public.mkt_projects
       SET status = 'changes', pic_reply = jsonb_build_object('decision', 'changes', 'name', v_who, 'reason', v_reason, 'at', now()),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason)
    VALUES (v_p.id, NULL, left(v_who || ' (PIC)', 120), 'pic changes', v_reason);
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_who || ' asked for changes', 200), left(v_reason, 400), 'pic_changes');
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Approve, or say what should change.' USING ERRCODE = '22023';
  END IF;
  RETURN public.mkt_pic_page(v_code);
END
$fn$;

-- A stranger's two, by name — each checks the code itself (CLAUDE.md › Do NOT: a DEFINER function open to anon checks
-- its own caller).
REVOKE ALL ON FUNCTION public.mkt_pic_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mkt_pic_answer(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_pic_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pic_answer(text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
