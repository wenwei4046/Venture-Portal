-- Lead View › Reply rules, Reply templates and the Step library (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html`
-- ?view=routing | template | library — the user: "照 claude design 最新版本"; step 4 of the redesign).
--
-- TEMPLATES are today's flows (lead_flows), drawn on a canvas. A step keeps its kind and gains what the handoff draws:
--   question = Taps an option · message = Send a message · phone = Gives a phone · handoff = Goes to a person
--   text = Types an answer (new: any reply is kept in the card) · ai = Goes to AI Agent (new: the AI Agent is a copilot
--   only, so the chat waits in the Inbox with its draft — the AI never sends on its own yet)
-- and a name, a place on the canvas (pos), a closing message where it ends (endMsg; empty = the template's, end_msg), a
-- phone step's retry when the reply is not a phone (retryText, retryMax, failNext: 'person' | '' (end) | a step), and
-- the library item it came from (lib: {id, ver}). A button or a step may now lead to '' — End here.
--
-- REPLY RULES decide which template (or Customer Service, or the AI Agent) answers a conversation's first message:
-- by the ad it came from (lead_reply_rules: any time / working hours / after hours, by Business hours), else by its
-- page and channel (lead_reply_pages: working hours / after hours). With no rule for it, today's triggers still
-- decide (the flows' trigger_kind) — nothing that runs now stops running until a rule says otherwise.
--
-- THE STEP LIBRARY keeps steps and short flows to copy into templates (lead_step_library). A template keeps its own
-- copy and is asked before taking a newer version (lib.ver < the item's ver).
--
-- New pages /leads/rules (lead.rules) and /leads/library (lead.library), View, and Edit = Lead View · Manage; their
-- registry rows by name. Every table: RLS on, no policy, no grant.

-- ── Templates: two columns and the runner's retry count ─────────────────────

ALTER TABLE public.lead_flows
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  ADD COLUMN IF NOT EXISTS end_msg     text NOT NULL DEFAULT '' CHECK (length(end_msg) <= 1000);

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS flow_tries smallint NOT NULL DEFAULT 0;

-- A template's steps, as the canvas saves them: what is wrong, or NULL.
CREATE OR REPLACE FUNCTION public.lead_template_problem(p_steps jsonb)
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
  v_to text;
BEGIN
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RETURN 'A template needs at least one step.';
  END IF;
  IF jsonb_array_length(p_steps) > 40 THEN
    RETURN 'A template has 40 steps at most.';
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
    IF v_kind IS NULL OR v_kind NOT IN ('question', 'message', 'phone', 'handoff', 'text', 'ai') THEN
      RETURN 'A step is an option, an answer, a phone, a message, a person or the AI Agent.';
    END IF;
    IF length(coalesce(s->>'name', '')) > 40 THEN
      RETURN 'A step''s name is 40 characters at most.';
    END IF;
    IF length(coalesce(s->>'text', '')) > 1000 OR (v_kind NOT IN ('handoff', 'ai') AND btrim(coalesce(s->>'text', '')) = '') THEN
      RETURN 'Every step says something (1,000 characters at most).';
    END IF;
    IF length(coalesce(s->>'endMsg', '')) > 1000 OR length(coalesce(s->>'retryText', '')) > 1000 THEN
      RETURN 'A message is 1,000 characters at most.';
    END IF;
    IF s->>'saveAs' IS NOT NULL AND s->>'saveAs' NOT IN ('interest', 'budget', 'showroom', 'preferredTime', 'note') THEN
      RETURN 'An answer is kept as interest, budget, showroom, date or note.';
    END IF;
    IF s->>'retryMax' IS NOT NULL AND (s->>'retryMax' !~ '^[1-5]$') THEN
      RETURN 'Ask again 1 to 5 times, or without a limit.';
    END IF;
    v_to := s->>'failNext';
    IF v_to IS NOT NULL AND v_to NOT IN ('', 'person') AND NOT (v_to = ANY (ids)) THEN
      RETURN 'Still wrong goes to a person, the end or a step of this template.';
    END IF;
    IF v_kind = 'question' THEN
      IF jsonb_typeof(s->'buttons') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'buttons') = 0 THEN
        RETURN 'An option step needs at least one option.';
      END IF;
      IF jsonb_array_length(s->'buttons') > 13 THEN
        RETURN 'Messenger shows 13 options at most.';
      END IF;
      FOR b IN SELECT * FROM jsonb_array_elements(s->'buttons') LOOP
        IF btrim(coalesce(b->>'label', '')) = '' OR length(b->>'label') > 20 THEN
          RETURN 'An option says 1 to 20 characters.';
        END IF;
        IF b->>'next' IS NULL OR NOT (b->>'next' = '' OR b->>'next' = ANY (ids)) THEN
          RETURN 'Every option goes to a step of this template, or ends.';
        END IF;
        IF length(coalesce(b->>'endMsg', '')) > 1000 THEN
          RETURN 'A message is 1,000 characters at most.';
        END IF;
      END LOOP;
    ELSIF s->>'next' IS NOT NULL AND s->>'next' <> '' AND NOT (s->>'next' = ANY (ids)) THEN
      RETURN 'A step goes to a step of this template, or ends.';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_template_problem(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_template_problem(jsonb) TO service_role;

-- A template from the canvas: its name, description, closing message and steps. New (p_id NULL) or changed; a new one
-- is not started by any trigger — the reply rules start it.
CREATE OR REPLACE FUNCTION public.lead_save_template(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_steps jsonb := coalesce(p_data->'steps', '[]'::jsonb);
  v_problem text;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Templates need Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A template needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_data->>'description', '')) > 300 OR length(coalesce(p_data->>'endMsg', '')) > 1000 THEN
    RAISE EXCEPTION 'The description is 300 characters at most, the closing message 1,000.' USING ERRCODE = '22023';
  END IF;
  v_problem := public.lead_template_problem(v_steps);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_flows (name, description, end_msg, template, trigger_kind, trigger_value, active, steps, sort_order)
    VALUES (v_name, btrim(coalesce(p_data->>'description', '')), btrim(coalesce(p_data->>'endMsg', '')), 'custom', 'first', '', false, v_steps,
            (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_flows))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_flows SET name = v_name, description = btrim(coalesce(p_data->>'description', '')),
         end_msg = btrim(coalesce(p_data->>'endMsg', '')), steps = v_steps, updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- The templates' reader carries the two new columns: production's lead_flows() with them added.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.lead_flows()'::regprocedure);
  v_old text := '''categoryId'', f.category_id, ''template'', f.template, ''config'', f.config,';
  v_new text := '''categoryId'', f.category_id, ''template'', f.template, ''config'', f.config, ''description'', f.description, ''endMsg'', f.end_msg,';
BEGIN
  IF position('''endMsg''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF length(v_def) - length(replace(v_def, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'lead_flows() is not the body this migration expects';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

-- ── Reply rules ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_reply_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Meta's ad id (lead_contacts.ad_id).
  ad_id           text NOT NULL CHECK (ad_id ~ '^[0-9]{5,30}$'),
  -- any = any time; open = working hours; closed = after hours (Business hours).
  at_when         text NOT NULL DEFAULT 'any' CHECK (at_when IN ('any', 'open', 'closed')),
  -- cs = Customer Service; ai = the AI Agent; else a template's id.
  reply           text NOT NULL CHECK (reply IN ('cs', 'ai') OR reply ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  sort_order      integer NOT NULL DEFAULT 0,
  updated_by_name text NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_reply_pages (
  brand_id        uuid NOT NULL REFERENCES public.lead_brands(id),
  channel         text NOT NULL CHECK (channel IN ('messenger', 'instagram')),
  work_reply      text NOT NULL DEFAULT 'cs' CHECK (work_reply IN ('cs', 'ai') OR work_reply ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  after_reply     text NOT NULL DEFAULT 'cs' CHECK (after_reply IN ('cs', 'ai') OR after_reply ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  updated_by_name text NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, channel)
);

-- ── The Step library ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_step_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('step', 'flow')),
  name            text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  description     text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  ver             integer NOT NULL DEFAULT 1 CHECK (ver >= 1),
  -- The same steps a template keeps (lead_template_problem), their own ids s1, s2 …
  steps           jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  updated_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE public.lead_reply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_reply_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_step_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_reply_rules, public.lead_reply_pages, public.lead_step_library FROM anon, authenticated;

SELECT public.audit_register('lead_reply_rules', 'Lead View reply rules by ad', 'Member services', '{leads}', 'all', p_labels => '{ad_id}');
SELECT public.audit_register('lead_reply_pages', 'Lead View reply rules by page', 'Member services', '{leads}', 'all', p_labels => '{channel}');
SELECT public.audit_register('lead_step_library', 'Lead View step library', 'Member services', '{leads}', 'all', p_labels => '{name}');

-- Every rule: by ad (with what is known of the ad) and by page and channel (one per brand and channel, Customer
-- Service where none is saved).
CREATE OR REPLACE FUNCTION public.lead_reply_rules()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN jsonb_build_object(
    'ads', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'adId', r.ad_id, 'when', r.at_when, 'reply', r.reply,
                       'updatedByName', r.updated_by_name, 'updatedAt', r.updated_at) ORDER BY r.sort_order, r.updated_at)
                     FROM public.lead_reply_rules r), '[]'::jsonb),
    'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('brandId', b.id, 'channel', ch.channel,
                         'work', coalesce(p.work_reply, 'cs'), 'after', coalesce(p.after_reply, 'cs')) ORDER BY b.sort_order, ch.ord)
                       FROM public.lead_brands b
                       CROSS JOIN (VALUES ('messenger', 1), ('instagram', 2)) AS ch(channel, ord)
                       LEFT JOIN public.lead_reply_pages p ON p.brand_id = b.id AND p.channel = ch.channel
                      WHERE b.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- The Reply rules page's Save: every ad rule and every page's two replies. A reply is cs, ai or a live template.
CREATE OR REPLACE FUNCTION public.lead_save_reply_rules(p_ads jsonb, p_pages jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_actor text;
  v_ord integer := 0;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Reply rules need Lead View · Manage.');
  v_actor := public.lead_actor_name();
  IF jsonb_typeof(p_ads) <> 'array' OR jsonb_typeof(p_pages) <> 'array' OR jsonb_array_length(p_ads) > 200 THEN
    RAISE EXCEPTION 'The rules are not in the right shape.' USING ERRCODE = '22023';
  END IF;
  -- Every reply named must be Customer Service, the AI Agent or a template that is there.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT x->>'reply' AS v FROM jsonb_array_elements(p_ads) x
      UNION ALL SELECT x->>'work' FROM jsonb_array_elements(p_pages) x
      UNION ALL SELECT x->>'after' FROM jsonb_array_elements(p_pages) x) t
     WHERE t.v IS NULL OR NOT (t.v IN ('cs', 'ai') OR EXISTS (
       SELECT 1 FROM public.lead_flows f WHERE f.deleted_at IS NULL AND f.id::text = t.v))) THEN
    RAISE EXCEPTION 'A rule replies with Customer Service, the AI Agent or a template that is there.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_ads) x WHERE coalesce(x->>'adId', '') !~ '^[0-9]{5,30}$' OR coalesce(x->>'when', '') NOT IN ('any', 'open', 'closed')) THEN
    RAISE EXCEPTION 'Every ad rule names an ad and when it runs.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_ads) x) <> (SELECT count(DISTINCT (x->>'adId', x->>'when')) FROM jsonb_array_elements(p_ads) x) THEN
    RAISE EXCEPTION 'Two rules name the same ad at the same time.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.lead_reply_rules r
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_ads) x WHERE x->>'id' = r.id::text);
  FOR r IN SELECT * FROM jsonb_array_elements(p_ads) LOOP
    v_ord := v_ord + 1;
    IF EXISTS (SELECT 1 FROM public.lead_reply_rules WHERE id::text = r->>'id') THEN
      UPDATE public.lead_reply_rules x SET ad_id = r->>'adId', at_when = r->>'when', reply = r->>'reply', sort_order = v_ord,
             updated_by_name = v_actor, updated_at = now()
       WHERE x.id::text = r->>'id' AND (x.ad_id, x.at_when, x.reply, x.sort_order) IS DISTINCT FROM (r->>'adId', r->>'when', r->>'reply', v_ord);
    ELSE
      INSERT INTO public.lead_reply_rules (ad_id, at_when, reply, sort_order, updated_by_name) VALUES (r->>'adId', r->>'when', r->>'reply', v_ord, v_actor);
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(p_pages) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id::text = r->>'brandId' AND deleted_at IS NULL) OR coalesce(r->>'channel', '') NOT IN ('messenger', 'instagram') THEN
      RAISE EXCEPTION 'A page rule names a brand and a channel.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lead_reply_pages AS p (brand_id, channel, work_reply, after_reply, updated_by_name)
    VALUES ((r->>'brandId')::uuid, r->>'channel', r->>'work', r->>'after', v_actor)
    ON CONFLICT (brand_id, channel) DO UPDATE SET work_reply = EXCLUDED.work_reply, after_reply = EXCLUDED.after_reply,
           updated_by_name = EXCLUDED.updated_by_name, updated_at = now()
     WHERE (p.work_reply, p.after_reply) IS DISTINCT FROM (EXCLUDED.work_reply, EXCLUDED.after_reply);
  END LOOP;
END
$fn$;

-- Who answers a conversation's first message by the rules: 'cs', 'ai', a template's id, or NULL (no rule — today's
-- triggers decide). An ad rule for its ad first (any time, or the hours it is in), then its page and channel.
CREATE OR REPLACE FUNCTION public.lead_rule_reply(p_contact public.lead_contacts, p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_open boolean := public.lead_hours_open(p_at);
  v_reply text;
BEGIN
  IF p_contact.ad_id IS NOT NULL THEN
    SELECT r.reply INTO v_reply FROM public.lead_reply_rules r
     WHERE r.ad_id = p_contact.ad_id AND (r.at_when = 'any' OR (r.at_when = 'open') = v_open)
     ORDER BY (r.at_when = 'any'), r.sort_order LIMIT 1;
    IF v_reply IS NOT NULL THEN
      RETURN v_reply;
    END IF;
  END IF;
  SELECT CASE WHEN v_open THEN p.work_reply ELSE p.after_reply END INTO v_reply
    FROM public.lead_reply_pages p WHERE p.brand_id = p_contact.brand_id AND p.channel = p_contact.channel;
  RETURN v_reply;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_rule_reply(public.lead_contacts, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_rule_reply(public.lead_contacts, timestamptz) TO service_role;

-- ── The Step library ────────────────────────────────────────────────────────

-- Every item, with where it is used: each template holding a step copied from it, those steps' names, and how many
-- hold an older version.
CREATE OR REPLACE FUNCTION public.lead_library()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'name', l.name, 'description', l.description, 'ver', l.ver,
      'steps', l.steps, 'updatedByName', l.updated_by_name, 'updatedAt', l.updated_at,
      'usedIn', coalesce((
        SELECT jsonb_agg(jsonb_build_object('flowId', f.id, 'flowName', f.name,
                 'steps', (SELECT jsonb_agg(coalesce(NULLIF(s->>'name', ''), left(s->>'text', 40))) FROM jsonb_array_elements(f.steps) s WHERE s->'lib'->>'id' = l.id::text),
                 'outdated', (SELECT count(*) FROM jsonb_array_elements(f.steps) s WHERE s->'lib'->>'id' = l.id::text AND coalesce((s->'lib'->>'ver')::integer, 0) < l.ver))
                 ORDER BY f.sort_order)
          FROM public.lead_flows f
         WHERE f.deleted_at IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(f.steps) s WHERE s->'lib'->>'id' = l.id::text)), '[]'::jsonb))
      ORDER BY l.kind, l.name)
      FROM public.lead_step_library l WHERE l.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- An item: new (p_id NULL, version 1) or saved as the next version. Returns its id.
CREATE OR REPLACE FUNCTION public.lead_save_library_item(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_kind text := coalesce(p_data->>'kind', 'step');
  v_steps jsonb := coalesce(p_data->'steps', '[]'::jsonb);
  v_problem text;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The step library needs Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 60 OR length(coalesce(p_data->>'description', '')) > 200 THEN
    RAISE EXCEPTION 'An item needs a name (60 characters at most) and a short description (200).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('step', 'flow') OR (v_kind = 'step' AND jsonb_array_length(v_steps) <> 1) THEN
    RAISE EXCEPTION 'A step is one step; a flow is several.' USING ERRCODE = '22023';
  END IF;
  v_problem := public.lead_template_problem(v_steps);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_step_library (kind, name, description, steps, updated_by_name)
    VALUES (v_kind, v_name, btrim(coalesce(p_data->>'description', '')), v_steps, public.lead_actor_name())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_step_library SET name = v_name, description = btrim(coalesce(p_data->>'description', '')), kind = v_kind,
         steps = v_steps, ver = ver + 1, updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- An item gone from the library; the templates keep their copies.
CREATE OR REPLACE FUNCTION public.lead_remove_library_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The step library needs Lead View · Manage.');
  UPDATE public.lead_step_library SET deleted_at = now(), updated_by_name = public.lead_actor_name() WHERE id = p_id AND deleted_at IS NULL;
END
$fn$;

-- ── The runner ──────────────────────────────────────────────────────────────

-- Production's bodies are checked first (md5 of prosrc): these replace them whole.
DO $do$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_flow_send(uuid, public.lead_flows, text)'::regprocedure) NOT IN
       ('507c4a1840324d949ec09ce1a869d9c6', '6eb693c9f1acc2937ddb003539782a14')
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_flow_on_message()'::regprocedure) NOT IN
       ('65c9fd4cf104a7041cc99eec2102e92c', '42dd64336dcc6e62b07e53144c8cbf5c') THEN
    RAISE EXCEPTION 'The flow runner is not the body this migration expects — compare it with production first';
  END IF;
END
$do$;

-- One of a template's messages, recorded as the template's.
CREATE OR REPLACE FUNCTION public.lead_flow_say(p_contact uuid, p_name text, p_text text, p_buttons jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF btrim(coalesce(p_text, '')) = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, buttons)
  VALUES (p_contact, 'out', 'flow', p_name, left(p_text, 2000), p_buttons);
  UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = left(p_text, 200), updated_at = now() WHERE id = p_contact;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_say(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_say(uuid, text, text, jsonb) TO service_role;

-- A template's end: its closing message (the step's or option's, else the template's), then done.
CREATE OR REPLACE FUNCTION public.lead_flow_end(p_contact uuid, p_flow public.lead_flows, p_end text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_flow_say(p_contact, p_flow.name, coalesce(NULLIF(btrim(coalesce(p_end, '')), ''), p_flow.end_msg), NULL);
  UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', flow_tries = 0 WHERE id = p_contact;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_end(uuid, public.lead_flows, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_end(uuid, public.lead_flows, text) TO service_role;

-- A person (or the AI Agent, a copilot today) takes the chat: it waits in the Inbox.
CREATE OR REPLACE FUNCTION public.lead_flow_to_cs(p_contact uuid, p_flow public.lead_flows, p_ai boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', flow_tries = 0, last_dir = 'in' WHERE id = p_contact;
  INSERT INTO public.lead_events (contact_id, what, actor_name)
  VALUES (p_contact, CASE WHEN p_ai THEN 'Template ' || p_flow.name || ' handed the customer to the AI Agent (copilot — waits for CS)'
                     ELSE 'Flow ' || p_flow.name || ' handed the customer to Customer Service' END, 'Flow');
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_to_cs(uuid, public.lead_flows, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_to_cs(uuid, public.lead_flows, boolean) TO service_role;

-- Send from a step on: a message goes on by itself; a question, an answer or a phone waits; a person or the AI ends it.
CREATE OR REPLACE FUNCTION public.lead_flow_send(p_contact uuid, p_flow public.lead_flows, p_step text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_step text := p_step;
  s jsonb;
  v_hops integer := 0;
BEGIN
  LOOP
    v_hops := v_hops + 1;
    SELECT x INTO s FROM jsonb_array_elements(p_flow.steps) x WHERE x->>'id' = v_step;
    IF s IS NULL OR v_hops > 40 THEN
      UPDATE public.lead_contacts SET flow_state = 'done', flow_step = NULL, flow_tries = 0 WHERE id = p_contact;
      RETURN;
    END IF;
    PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>'text',
      CASE WHEN s->>'kind' = 'question' THEN (SELECT jsonb_agg(b->>'label') FROM jsonb_array_elements(s->'buttons') b) END);
    IF s->>'kind' IN ('question', 'phone', 'text') THEN
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = v_step, flow_state = 'running', flow_tries = 0 WHERE id = p_contact;
      RETURN;
    END IF;
    IF s->>'kind' IN ('handoff', 'ai') THEN
      PERFORM public.lead_flow_to_cs(p_contact, p_flow, s->>'kind' = 'ai');
      RETURN;
    END IF;
    -- A message: on to the next step, or the end with its closing message.
    IF coalesce(s->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, s->>'endMsg');
      RETURN;
    END IF;
    v_step := s->>'next';
  END LOOP;
END
$fn$;

-- The trigger: a customer's message starts or moves a template; Customer Service's reply stops one.
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
  v_label text;
  v_next text;
  v_end text;
  v_first boolean;
  v_rule text;
BEGIN
  SELECT * INTO c FROM public.lead_contacts WHERE id = NEW.contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW.sender = 'cs' THEN
    IF c.flow_state = 'running' THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL, flow_tries = 0 WHERE id = c.id;
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
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL, flow_tries = 0 WHERE id = c.id;
      RETURN NULL;
    END IF;
    IF s->>'kind' = 'question' THEN
      SELECT b->>'next', b->>'label', b->>'endMsg' INTO v_next, v_label, v_end
        FROM jsonb_array_elements(s->'buttons') b WHERE lower(btrim(b->>'label')) = v_answer LIMIT 1;
    ELSIF s->>'kind' = 'text' THEN
      v_label := btrim(NEW.body);
      v_next := coalesce(s->>'next', '');
      v_end := s->>'endMsg';
    ELSIF s->>'kind' = 'phone' AND NEW.phone_found IS NOT NULL THEN
      v_next := coalesce(s->>'next', '');
      v_end := s->>'endMsg';
    ELSIF s->>'kind' = 'phone' AND btrim(coalesce(s->>'retryText', '')) <> '' THEN
      -- Not a phone: ask again while tries are left, then go where "still wrong" says.
      IF s->>'retryMax' IS NULL OR c.flow_tries < (s->>'retryMax')::integer THEN
        UPDATE public.lead_contacts SET flow_tries = flow_tries + 1 WHERE id = c.id;
        PERFORM public.lead_flow_say(c.id, f.name, s->>'retryText', NULL);
        RETURN NULL;
      END IF;
      IF coalesce(s->>'failNext', 'person') = 'person' THEN
        PERFORM public.lead_flow_to_cs(c.id, f, false);
        RETURN NULL;
      END IF;
      v_next := s->>'failNext';
    END IF;
    IF v_next IS NULL THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL, flow_tries = 0 WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Flow stopped — the customer typed their own answer', 'Flow');
      RETURN NULL;
    END IF;
    -- The answer goes into the card where the step says.
    IF v_label IS NOT NULL AND s->>'saveAs' IS NOT NULL THEN
      UPDATE public.lead_contacts SET
        interest = CASE WHEN s->>'saveAs' = 'interest' THEN left(v_label, 120) ELSE interest END,
        budget = CASE WHEN s->>'saveAs' = 'budget' THEN left(v_label, 60) ELSE budget END,
        showroom = CASE WHEN s->>'saveAs' = 'showroom' THEN left(v_label, 60) ELSE showroom END,
        preferred_time = CASE WHEN s->>'saveAs' = 'preferredTime' THEN left(v_label, 60) ELSE preferred_time END,
        note = CASE WHEN s->>'saveAs' = 'note' THEN left(CASE WHEN note = '' THEN v_label ELSE note || E'\n' || v_label END, 1000) ELSE note END
      WHERE id = c.id;
    END IF;
    IF v_next = '' THEN
      PERFORM public.lead_flow_end(c.id, f, v_end);
      RETURN NULL;
    END IF;
    PERFORM public.lead_flow_send(c.id, f, v_next);
    RETURN NULL;
  END IF;

  v_first := NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'out')
             AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in' AND m.id < NEW.id);

  IF v_first AND c.flow_state = 'none' THEN
    -- The reply rules first: Customer Service or the AI Agent (a copilot) answers nothing by itself; a template runs.
    v_rule := public.lead_rule_reply(c);
    IF v_rule IS NOT NULL THEN
      IF v_rule = 'ai' THEN
        INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Reply rules: the AI Agent answers (copilot — waits for CS)', 'Flow');
      ELSIF v_rule <> 'cs' THEN
        SELECT * INTO f FROM public.lead_flows fl WHERE fl.id::text = v_rule AND fl.deleted_at IS NULL;
      END IF;
      IF f.id IS NOT NULL THEN
        INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Template ' || f.name || ' answered (reply rules)', 'Flow');
        PERFORM public.lead_flow_send(c.id, f, f.steps->0->>'id');
      END IF;
      RETURN NULL;
    END IF;
    -- No rule for it: today's triggers — ad, keyword, away (when away), then any first message.
    SELECT * INTO f FROM public.lead_flows fl
     WHERE fl.active AND fl.deleted_at IS NULL AND (fl.brand_id IS NULL OR fl.brand_id = c.brand_id)
       AND ((fl.trigger_kind = 'ad' AND c.source_ad <> '' AND position(lower(fl.trigger_value) IN lower(c.source_ad)) > 0)
         OR (fl.trigger_kind = 'keyword' AND EXISTS (
               SELECT 1 FROM unnest(string_to_array(fl.trigger_value, ',')) k WHERE btrim(k) <> '' AND position(lower(btrim(k)) IN lower(NEW.body)) > 0))
         OR (fl.trigger_kind = 'away' AND public.lead_is_away(fl.config))
         OR fl.trigger_kind = 'first')
     ORDER BY CASE fl.trigger_kind WHEN 'ad' THEN 0 WHEN 'keyword' THEN 1 WHEN 'away' THEN 2 ELSE 3 END,
              (fl.brand_id IS NULL), fl.sort_order, fl.created_at
     LIMIT 1;
  ELSIF NOT v_first
        AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender = 'cs' AND m.created_at > now() - interval '12 hours') THEN
    -- A later message, nobody serving the customer: a keyword, else the away message (once in 12 hours).
    SELECT * INTO f FROM public.lead_flows fl
     WHERE fl.active AND fl.deleted_at IS NULL AND (fl.brand_id IS NULL OR fl.brand_id = c.brand_id)
       AND ((fl.trigger_kind = 'keyword' AND EXISTS (
               SELECT 1 FROM unnest(string_to_array(fl.trigger_value, ',')) k WHERE btrim(k) <> '' AND position(lower(btrim(k)) IN lower(NEW.body)) > 0))
         OR (fl.trigger_kind = 'away' AND public.lead_is_away(fl.config)
             AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.sender = 'flow'
                               AND m.by_name = fl.name AND m.created_at > now() - interval '12 hours')))
     ORDER BY CASE fl.trigger_kind WHEN 'keyword' THEN 0 ELSE 1 END, (fl.brand_id IS NULL), fl.sort_order, fl.created_at
     LIMIT 1;
  END IF;
  IF f.id IS NOT NULL THEN
    INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Automation ' || f.name || ' answered', 'Flow');
    PERFORM public.lead_flow_send(c.id, f, f.steps->0->>'id');
  END IF;
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_flow_send(uuid, public.lead_flows, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_send(uuid, public.lead_flows, text) TO service_role;

REVOKE ALL ON FUNCTION public.lead_save_template(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_reply_rules() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_reply_rules(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_library() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_library_item(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_library_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_save_template(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_reply_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_reply_rules(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_library() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_library_item(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_library_item(uuid) TO authenticated;

-- ── The two new pages, by name ──────────────────────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/leads/rules', 'lead.rules'),
  ('/leads/library', 'lead.library')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('lead.rules', 'view', 'leads.view'),
  ('lead.rules', 'edit', 'leads.manage'),
  ('lead.library', 'view', 'leads.view'),
  ('lead.library', 'edit', 'leads.manage')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
