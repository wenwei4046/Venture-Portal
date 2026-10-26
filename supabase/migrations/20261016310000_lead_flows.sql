-- ============================================================================
-- 20261016310000_lead_flows.sql
-- Lead View › Flows (2026-10-16, phase 2 — the design canvas's "Flows" board; the user's brief 2.2: "像現在
-- messenger auto reply template 一樣，客戶選 A 就會自動發送 A 後續的問題，再選後又再發送新的答案再問問題").
-- ============================================================================
--
-- A flow is a brand's (or every brand's) list of steps, started by the first message of a conversation:
--   trigger  ad       the conversation came from an ad whose name holds trigger_value
--            keyword  the first message holds trigger_value
--            first    any first message (the brand's welcome)
--   step     question  its text and buttons (Messenger takes 13, 20 characters each); the customer's answer
--                       must be a button's label, which leads to that button's step
--            message   its text, then straight on to `next` (a photo set, a promo, a line of info)
--            phone     its text; the customer's answer must hold a mobile number, then `next`
--            handoff   its text, and the conversation is Customer Service's (the flow ends)
--   A step with no `next` (message / phone) ends the flow there.
--
-- The flow runs in the database, beside the message that moves it: a DEFERRED constraint trigger on
-- lead_messages, so it runs at the end of the transaction that wrote the customer's message — after the
-- writer (lead_simulate today, Meta's ingest later) has set the conversation's own columns — and so no
-- writer changes. The customer answers anything else (typed, not a button) → the flow stops and the
-- conversation waits for Customer Service; Customer Service replies → the flow stops.
--
-- Flow replies are recorded like Customer Service's (delivery 'recorded') until Meta is connected.
--
-- Who may: lead_flows() Lead View · View; lead_save_flow / lead_remove_flow Lead View · Manage (Flows' Edit,
-- like Settings' — both boxes stand for it, so these writes and Settings' ask their page, mig 20261016310100).

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_flows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = every brand.
  brand_id       uuid REFERENCES public.lead_brands(id),
  name           text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  trigger_kind   text NOT NULL CHECK (trigger_kind IN ('ad', 'keyword', 'first')),
  trigger_value  text NOT NULL DEFAULT '' CHECK (length(trigger_value) <= 120),
  active         boolean NOT NULL DEFAULT false,
  -- [{ "id": "s1", "kind": "question", "text": "…", "buttons": [{ "label": "L 型", "next": "s2" }], "next": null }]
  steps          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  sort_order     integer NOT NULL DEFAULT 0,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_flows_trigger CHECK (trigger_kind = 'first' OR btrim(trigger_value) <> '')
);

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS flow_id    uuid REFERENCES public.lead_flows(id),
  ADD COLUMN IF NOT EXISTS flow_step  text,
  -- none = no flow ran; running = waiting for the customer's answer to flow_step; done = it ended;
  -- stopped = the customer typed something else, or Customer Service replied.
  ADD COLUMN IF NOT EXISTS flow_state text NOT NULL DEFAULT 'none' CHECK (flow_state IN ('none', 'running', 'done', 'stopped'));

-- A flow's message carries its buttons, so the Inbox draws what the customer saw.
ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS buttons jsonb CHECK (buttons IS NULL OR jsonb_typeof(buttons) = 'array');

ALTER TABLE public.lead_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_flows FROM anon, authenticated;
SELECT public.audit_register('lead_flows', 'Lead View flows', 'Member services', '{leads}', 'all', p_labels => '{name}');

-- ── Checking a flow's steps (lead_save_flow) ─────────────────────────────────

-- The steps as saved: refuses anything the runner could not follow. Twin: flowProblem() in src/lib/leads/flow.ts.
CREATE OR REPLACE FUNCTION public.lead_flow_problem(p_steps jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  s jsonb;
  b jsonb;
  ids text[] := ARRAY[]::text[];
  v_id text;
  v_kind text;
BEGIN
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RETURN 'A flow needs at least one step.';
  END IF;
  IF jsonb_array_length(p_steps) > 30 THEN
    RETURN 'A flow has 30 steps at most.';
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_id := s->>'id';
    IF v_id IS NULL OR v_id !~ '^[a-z0-9_-]{1,20}$' THEN
      RETURN 'Every step needs an id.';
    END IF;
    IF v_id = ANY (ids) THEN
      RETURN 'Two steps share the id ' || v_id || '.';
    END IF;
    ids := ids || v_id;
  END LOOP;
  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_kind := s->>'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('question', 'message', 'phone', 'handoff') THEN
      RETURN 'A step is a question, a message, a phone question or a hand-over.';
    END IF;
    IF btrim(coalesce(s->>'text', '')) = '' OR length(s->>'text') > 1000 THEN
      RETURN 'Every step says something (1,000 characters at most).';
    END IF;
    IF v_kind = 'question' THEN
      IF jsonb_typeof(s->'buttons') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'buttons') = 0 THEN
        RETURN 'A question needs at least one button.';
      END IF;
      IF jsonb_array_length(s->'buttons') > 13 THEN
        RETURN 'Messenger shows 13 buttons at most.';
      END IF;
      FOR b IN SELECT * FROM jsonb_array_elements(s->'buttons') LOOP
        IF btrim(coalesce(b->>'label', '')) = '' OR length(b->>'label') > 20 THEN
          RETURN 'A button says 1 to 20 characters.';
        END IF;
        IF b->>'next' IS NULL OR NOT (b->>'next' = ANY (ids)) THEN
          RETURN 'Every button leads to a step of this flow.';
        END IF;
      END LOOP;
    ELSIF s->>'next' IS NOT NULL AND NOT (s->>'next' = ANY (ids)) THEN
      RETURN 'A step leads to a step of this flow.';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_problem(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_problem(jsonb) TO service_role;

-- ── The runner ──────────────────────────────────────────────────────────────

-- Send a step (and the message steps after it) to the conversation; leaves it waiting, done or with Customer Service.
CREATE OR REPLACE FUNCTION public.lead_flow_send(p_contact uuid, p_flow public.lead_flows, p_step text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step text := p_step;
  s jsonb;
  v_hops integer := 0;
  v_text text;
BEGIN
  LOOP
    v_hops := v_hops + 1;
    SELECT x INTO s FROM jsonb_array_elements(p_flow.steps) x WHERE x->>'id' = v_step;
    IF s IS NULL OR v_hops > 30 THEN
      UPDATE public.lead_contacts SET flow_state = 'done', flow_step = NULL WHERE id = p_contact;
      RETURN;
    END IF;
    v_text := left(s->>'text', 2000);
    INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, buttons)
    VALUES (p_contact, 'out', 'flow', p_flow.name, v_text,
            CASE WHEN s->>'kind' = 'question' THEN (SELECT jsonb_agg(b->>'label') FROM jsonb_array_elements(s->'buttons') b) END);
    UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = left(v_text, 200), updated_at = now()
     WHERE id = p_contact;
    IF s->>'kind' IN ('question', 'phone') THEN
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = v_step, flow_state = 'running' WHERE id = p_contact;
      RETURN;
    END IF;
    IF s->>'kind' = 'handoff' THEN
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', last_dir = 'in' WHERE id = p_contact;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (p_contact, 'Flow ' || p_flow.name || ' handed the customer to Customer Service', 'Flow');
      RETURN;
    END IF;
    -- A message: on to the next step, or the end.
    IF s->>'next' IS NULL THEN
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done' WHERE id = p_contact;
      RETURN;
    END IF;
    v_step := s->>'next';
  END LOOP;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_send(uuid, public.lead_flows, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_send(uuid, public.lead_flows, text) TO service_role;

-- The trigger: a customer's message starts or moves a flow; Customer Service's reply stops one.
CREATE OR REPLACE FUNCTION public.lead_flow_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
  f public.lead_flows;
  s jsonb;
  v_answer text := lower(btrim(NEW.body));
  v_next text;
BEGIN
  SELECT * INTO c FROM public.lead_contacts WHERE id = NEW.contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW.sender = 'cs' THEN
    IF c.flow_state = 'running' THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Flow stopped — Customer Service replied', 'Flow');
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.direction <> 'in' THEN
    RETURN NULL;
  END IF;

  -- Waiting on an answer.
  IF c.flow_state = 'running' THEN
    SELECT * INTO f FROM public.lead_flows WHERE id = c.flow_id;
    SELECT x INTO s FROM jsonb_array_elements(coalesce(f.steps, '[]'::jsonb)) x WHERE x->>'id' = c.flow_step;
    IF s IS NULL THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL WHERE id = c.id;
      RETURN NULL;
    END IF;
    IF s->>'kind' = 'question' THEN
      SELECT b->>'next' INTO v_next FROM jsonb_array_elements(s->'buttons') b WHERE lower(btrim(b->>'label')) = v_answer LIMIT 1;
    ELSIF s->>'kind' = 'phone' AND NEW.phone_found IS NOT NULL THEN
      v_next := coalesce(s->>'next', '');
    END IF;
    IF v_next IS NULL THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Flow stopped — the customer typed their own answer', 'Flow');
      RETURN NULL;
    END IF;
    IF v_next = '' THEN
      UPDATE public.lead_contacts SET flow_state = 'done', flow_step = NULL WHERE id = c.id;
      RETURN NULL;
    END IF;
    PERFORM public.lead_flow_send(c.id, f, v_next);
    RETURN NULL;
  END IF;

  -- A conversation's first message, nobody has answered yet: the flow it triggers, if any.
  IF c.flow_state = 'none'
     AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'out')
     AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in' AND m.id < NEW.id) THEN
    SELECT * INTO f FROM public.lead_flows fl
     WHERE fl.active AND fl.deleted_at IS NULL AND (fl.brand_id IS NULL OR fl.brand_id = c.brand_id)
       AND ((fl.trigger_kind = 'ad' AND c.source_ad <> '' AND position(lower(fl.trigger_value) IN lower(c.source_ad)) > 0)
         OR (fl.trigger_kind = 'keyword' AND position(lower(fl.trigger_value) IN lower(NEW.body)) > 0)
         OR fl.trigger_kind = 'first')
     ORDER BY CASE fl.trigger_kind WHEN 'ad' THEN 0 WHEN 'keyword' THEN 1 ELSE 2 END,
              (fl.brand_id IS NULL), fl.sort_order, fl.created_at
     LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Flow ' || f.name || ' started', 'Flow');
      PERFORM public.lead_flow_send(c.id, f, f.steps->0->>'id');
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_on_message() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER lead_messages_flow
  AFTER INSERT ON public.lead_messages
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.direction = 'in' OR NEW.sender = 'cs')
  EXECUTE FUNCTION public.lead_flow_on_message();

-- ── Readers: the conversation shows its flow, a flow message its buttons ─────
-- lead_contact_json and lead_thread are this module's own (mig 20261016300200; production's bodies are those,
-- unchanged since): each gains the new columns, nothing else moves.

CREATE OR REPLACE FUNCTION public.lead_contact_json(c public.lead_contacts)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id', c.id, 'brandId', c.brand_id, 'channel', c.channel, 'isTest', c.is_test, 'name', c.name,
    'sourceAd', c.source_ad, 'phone', c.phone, 'phoneState', c.phone_state, 'phoneAt', c.phone_at,
    'interest', c.interest, 'budget', c.budget, 'showroom', c.showroom, 'preferredTime', c.preferred_time,
    'note', c.note, 'handedSalesId', c.handed_sales_id, 'handedSalesName', s.name, 'handedAt', c.handed_at,
    'handedByName', c.handed_by_name, 'appt', c.appt, 'shown', c.shown, 'lastAt', c.last_at,
    'lastDir', c.last_dir, 'lastText', c.last_text, 'createdAt', c.created_at,
    'flowState', c.flow_state, 'flowName', f.name)
    FROM (SELECT 1) one
    LEFT JOIN public.lead_sales s ON s.id = c.handed_sales_id
    LEFT JOIN public.lead_flows f ON f.id = c.flow_id
$fn$;
REVOKE ALL ON FUNCTION public.lead_contact_json(public.lead_contacts) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_contact_json(public.lead_contacts) TO service_role;

CREATE OR REPLACE FUNCTION public.lead_thread(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c public.lead_contacts;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'contact', public.lead_contact_json(c),
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'direction', m.direction, 'sender', m.sender, 'byName', m.by_name, 'body', m.body,
        'phoneFound', m.phone_found, 'delivery', m.delivery, 'at', m.created_at, 'buttons', m.buttons) ORDER BY m.id)
        FROM public.lead_messages m WHERE m.contact_id = c.id), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('what', e.what, 'by', e.actor_name, 'at', e.at) ORDER BY e.at, e.id)
        FROM public.lead_events e WHERE e.contact_id = c.id), '[]'::jsonb));
END
$fn$;

-- ── Flows: read, save, remove ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_flows()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'brandId', f.brand_id, 'name', f.name, 'triggerKind', f.trigger_kind, 'triggerValue', f.trigger_value,
      'active', f.active, 'steps', f.steps, 'sortOrder', f.sort_order, 'updatedAt', f.updated_at,
      'started', (SELECT count(*) FROM public.lead_contacts c WHERE c.flow_id = f.id AND c.created_at > now() - interval '7 days'),
      'phones', (SELECT count(*) FROM public.lead_contacts c WHERE c.flow_id = f.id AND c.phone IS NOT NULL AND c.created_at > now() - interval '7 days'))
      ORDER BY f.sort_order, f.created_at)
      FROM public.lead_flows f WHERE f.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A flow: new (p_id NULL) or changed. Keys: brandId (null = every brand), name, triggerKind, triggerValue, active, steps.
CREATE OR REPLACE FUNCTION public.lead_save_flow(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_kind text := coalesce(p_data->>'triggerKind', 'first');
  v_value text := btrim(coalesce(p_data->>'triggerValue', ''));
  v_brand uuid := nullif(p_data->>'brandId', '')::uuid;
  v_steps jsonb := coalesce(p_data->'steps', '[]'::jsonb);
  v_problem text;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Flows need Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A flow needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('ad', 'keyword', 'first') THEN
    RAISE EXCEPTION 'A flow starts from an ad, a keyword or any first message.' USING ERRCODE = '22023';
  END IF;
  IF v_kind <> 'first' AND v_value = '' THEN
    RAISE EXCEPTION 'Say which ad or keyword starts it.' USING ERRCODE = '22023';
  END IF;
  IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_problem := public.lead_flow_problem(v_steps);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_flows (brand_id, name, trigger_kind, trigger_value, active, steps, sort_order)
    VALUES (v_brand, v_name, v_kind, CASE WHEN v_kind = 'first' THEN '' ELSE left(v_value, 120) END,
            coalesce((p_data->>'active')::boolean, false), v_steps,
            (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_flows))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_flows SET brand_id = v_brand, name = v_name, trigger_kind = v_kind,
         trigger_value = CASE WHEN v_kind = 'first' THEN '' ELSE left(v_value, 120) END,
         active = coalesce((p_data->>'active')::boolean, active), steps = v_steps, updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That flow is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- Take a flow away (conversations it ran keep their messages; one waiting on it stops).
CREATE OR REPLACE FUNCTION public.lead_remove_flow(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Flows need Lead View · Manage.');
  UPDATE public.lead_flows SET deleted_at = now(), active = false, updated_at = now() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That flow is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL WHERE flow_id = p_id AND flow_state = 'running';
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_flows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_flow(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_flow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_flows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_flow(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_flow(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
