-- ============================================================================
-- 20261016320000_lead_automations.sql
-- Lead View › Automations (2026-10-16 — the user, after the tree editor: "我更希望的是客服可以创建属于自己的
-- workplace，可以分为 general、广告 etc；这个树状图不容易理解", pointing at Meta's own "create automation":
-- a template per goal, then a short form). The design canvas's "自動化" row, approved "可以".
-- ============================================================================
--
-- 1. Categories Customer Service makes for their own automations (General, 廣告, 節日活動 …):
--    lead_auto_categories. A flow sits in one (or none).
-- 2. A flow remembers the template it was made from and that template's form (lead_flows.template / config) —
--    faq, welcome, away, keyword, ad, or custom (the step editor). The app turns a form into steps
--    (src/lib/leads/automation.ts); the runner still runs only steps, as before.
-- 3. The runner (lead_flow_on_message — production's body is mig 20261016310000's, unchanged since) learns:
--    · trigger 'away': outside the hours in the flow's config (Asia/Kuala_Lumpur), at most once in 12 hours
--      a conversation;
--    · a keyword or away flow also answers a LATER message — not only a conversation's first — while no flow
--      is waiting on the customer and Customer Service has not replied in the last 12 hours (so it never
--      talks over somebody serving the customer);
--    · first message: ad, then keyword, then away (when away), then any-first-message;
--    · a question step may save the tapped answer into the customer card (`saveAs`: interest, budget,
--      showroom, preferredTime) — the ad template's answers fill the card.
-- 4. lead_flow_problem accepts `saveAs`; lead_flows() / lead_save_flow carry the category, template and form;
--    lead_save_flow keeps its page guard (mig 20261016310100) in the body it is rewritten with.

-- ── Categories ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_auto_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 30),
  tone        text NOT NULL DEFAULT 'blue' CHECK (tone IN ('ink', 'clay', 'blue', 'olive', 'plum')),
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_auto_categories_name ON public.lead_auto_categories (lower(name)) WHERE deleted_at IS NULL;
ALTER TABLE public.lead_auto_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_auto_categories FROM anon, authenticated;
SELECT public.audit_register('lead_auto_categories', 'Lead View automation categories', 'Member services', '{leads}', 'all', p_labels => '{name}');

INSERT INTO public.lead_auto_categories (name, tone, sort_order)
SELECT v.name, v.tone, v.ord FROM (VALUES ('General', 'blue', 1), ('廣告', 'clay', 2)) AS v(name, tone, ord)
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_auto_categories c WHERE lower(c.name) = lower(v.name) AND c.deleted_at IS NULL);

-- ── Flows: category, template, form, the away trigger ────────────────────────

ALTER TABLE public.lead_flows
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.lead_auto_categories(id),
  ADD COLUMN IF NOT EXISTS template    text NOT NULL DEFAULT 'custom' CHECK (template IN ('faq', 'welcome', 'away', 'keyword', 'ad', 'custom')),
  -- The template's form as Customer Service filled it (the steps are made from it).
  ADD COLUMN IF NOT EXISTS config      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object');

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.lead_flows'::regclass AND contype = 'c'
              AND (pg_get_constraintdef(oid) LIKE '%trigger_kind%')
  LOOP
    EXECUTE format('ALTER TABLE public.lead_flows DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;
ALTER TABLE public.lead_flows
  ADD CONSTRAINT lead_flows_trigger_kind CHECK (trigger_kind IN ('ad', 'keyword', 'first', 'away')),
  ADD CONSTRAINT lead_flows_trigger CHECK (trigger_kind IN ('first', 'away') OR btrim(trigger_value) <> '');

-- The flows made so far (the step editor's) are 'custom', in General.
UPDATE public.lead_flows SET category_id = (SELECT id FROM public.lead_auto_categories WHERE name = 'General' AND deleted_at IS NULL)
 WHERE category_id IS NULL AND deleted_at IS NULL;

-- ── Away hours ───────────────────────────────────────────────────────────────

-- Is the office closed now, by a flow's config.hours: [{ "day": 0..6 (Sunday = 0), "from": "10:00", "to": "22:00", "off": false }]?
-- A day not listed is closed. Twin: isAway() in src/lib/leads/automation.ts.
CREATE OR REPLACE FUNCTION public.lead_is_away(p_config jsonb, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := p_at AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_day integer := extract(dow FROM v_local)::integer;
  v_time text := to_char(v_local, 'HH24:MI');
  h jsonb;
BEGIN
  SELECT x INTO h FROM jsonb_array_elements(coalesce(p_config->'hours', '[]'::jsonb)) x WHERE (x->>'day')::integer = v_day LIMIT 1;
  IF h IS NULL OR coalesce((h->>'off')::boolean, false) OR coalesce(h->>'from', '') = '' OR coalesce(h->>'to', '') = '' THEN
    RETURN true;
  END IF;
  RETURN NOT (v_time >= h->>'from' AND v_time < h->>'to');
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_is_away(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_is_away(jsonb, timestamptz) TO service_role;

-- ── The step check learns saveAs ─────────────────────────────────────────────

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
    IF s ? 'saveAs' AND s->>'saveAs' IS NOT NULL AND s->>'saveAs' NOT IN ('interest', 'budget', 'showroom', 'preferredTime') THEN
      RETURN 'An answer is kept as interest, budget, showroom or time.';
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
  v_first boolean;
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
      SELECT b->>'next', b->>'label' INTO v_next, v_label FROM jsonb_array_elements(s->'buttons') b WHERE lower(btrim(b->>'label')) = v_answer LIMIT 1;
    ELSIF s->>'kind' = 'phone' AND NEW.phone_found IS NOT NULL THEN
      v_next := coalesce(s->>'next', '');
    END IF;
    IF v_next IS NULL THEN
      UPDATE public.lead_contacts SET flow_state = 'stopped', flow_step = NULL WHERE id = c.id;
      INSERT INTO public.lead_events (contact_id, what, actor_name) VALUES (c.id, 'Flow stopped — the customer typed their own answer', 'Flow');
      RETURN NULL;
    END IF;
    -- The tapped answer goes into the card where the step says.
    IF v_label IS NOT NULL AND s->>'saveAs' IS NOT NULL THEN
      UPDATE public.lead_contacts SET
        interest = CASE WHEN s->>'saveAs' = 'interest' THEN left(v_label, 120) ELSE interest END,
        budget = CASE WHEN s->>'saveAs' = 'budget' THEN left(v_label, 60) ELSE budget END,
        showroom = CASE WHEN s->>'saveAs' = 'showroom' THEN left(v_label, 60) ELSE showroom END,
        preferred_time = CASE WHEN s->>'saveAs' = 'preferredTime' THEN left(v_label, 60) ELSE preferred_time END
      WHERE id = c.id;
    END IF;
    IF v_next = '' THEN
      UPDATE public.lead_contacts SET flow_state = 'done', flow_step = NULL WHERE id = c.id;
      RETURN NULL;
    END IF;
    PERFORM public.lead_flow_send(c.id, f, v_next);
    RETURN NULL;
  END IF;

  v_first := NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'out')
             AND NOT EXISTS (SELECT 1 FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in' AND m.id < NEW.id);

  IF v_first AND c.flow_state = 'none' THEN
    -- A conversation's first message: ad, keyword, away (when away), then any first message.
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

-- ── Readers and writers ──────────────────────────────────────────────────────

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
      'categoryId', f.category_id, 'template', f.template, 'config', f.config,
      'started', (SELECT count(DISTINCT m.contact_id) FROM public.lead_messages m
                   WHERE m.sender = 'flow' AND m.by_name = f.name AND m.created_at > now() - interval '7 days'),
      'phones', (SELECT count(*) FROM public.lead_contacts c WHERE c.flow_id = f.id AND c.phone IS NOT NULL AND c.created_at > now() - interval '7 days'))
      ORDER BY f.sort_order, f.created_at)
      FROM public.lead_flows f WHERE f.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

CREATE OR REPLACE FUNCTION public.lead_auto_categories()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'tone', c.tone, 'sortOrder', c.sort_order) ORDER BY c.sort_order, c.created_at)
      FROM public.lead_auto_categories c WHERE c.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A flow: new (p_id NULL) or changed. Keys: brandId, categoryId, name, template, config, triggerKind, triggerValue, active, steps.
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
  v_cat uuid := nullif(p_data->>'categoryId', '')::uuid;
  v_tpl text := coalesce(p_data->>'template', 'custom');
  v_config jsonb := coalesce(p_data->'config', '{}'::jsonb);
  v_steps jsonb := coalesce(p_data->'steps', '[]'::jsonb);
  v_problem text;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Flows need Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/flows'], ARRAY['leads.manage']);
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A flow needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('ad', 'keyword', 'first', 'away') THEN
    RAISE EXCEPTION 'A flow starts from an ad, a keyword, the away hours or any first message.' USING ERRCODE = '22023';
  END IF;
  IF v_kind IN ('ad', 'keyword') AND v_value = '' THEN
    RAISE EXCEPTION 'Say which ad or keyword starts it.' USING ERRCODE = '22023';
  END IF;
  IF v_tpl NOT IN ('faq', 'welcome', 'away', 'keyword', 'ad', 'custom') THEN
    RAISE EXCEPTION 'Unknown template.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_config) <> 'object' THEN
    RAISE EXCEPTION 'The form is not in the right shape.' USING ERRCODE = '22023';
  END IF;
  IF v_brand IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That brand is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF v_cat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_auto_categories WHERE id = v_cat AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That category is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_problem := public.lead_flow_problem(v_steps);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_flows (brand_id, category_id, name, template, config, trigger_kind, trigger_value, active, steps, sort_order)
    VALUES (v_brand, v_cat, v_name, v_tpl, v_config, v_kind, CASE WHEN v_kind IN ('first', 'away') THEN '' ELSE left(v_value, 120) END,
            coalesce((p_data->>'active')::boolean, false), v_steps,
            (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_flows))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_flows SET brand_id = v_brand, category_id = v_cat, name = v_name, template = v_tpl, config = v_config,
         trigger_kind = v_kind, trigger_value = CASE WHEN v_kind IN ('first', 'away') THEN '' ELSE left(v_value, 120) END,
         active = coalesce((p_data->>'active')::boolean, active), steps = v_steps, updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That flow is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- A category: new (p_id NULL) or renamed.
CREATE OR REPLACE FUNCTION public.lead_save_auto_category(p_id uuid, p_name text, p_tone text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Categories need Lead View · Manage.');
  IF v_name = '' OR length(v_name) > 30 THEN
    RAISE EXCEPTION 'A category needs a name (30 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_auto_categories WHERE lower(name) = lower(v_name) AND deleted_at IS NULL AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'There is already a category called %.', v_name USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_auto_categories (name, tone, sort_order)
    VALUES (v_name, coalesce(p_tone, 'blue'), (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_auto_categories))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_auto_categories SET name = v_name, tone = coalesce(p_tone, tone), updated_at = now() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That category is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- Take a category away; its automations stay, in no category.
CREATE OR REPLACE FUNCTION public.lead_remove_auto_category(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Categories need Lead View · Manage.');
  UPDATE public.lead_auto_categories SET deleted_at = now(), updated_at = now() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That category is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_flows SET category_id = NULL WHERE category_id = p_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_auto_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_auto_category(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_auto_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_auto_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_auto_category(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_auto_category(uuid) TO authenticated;

-- ── The writes behind Flows' Edit ask their page (as mig 20261016310100) ─────

CREATE OR REPLACE FUNCTION pg_temp.guard_put(p_sig text, p_new text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_need text;
  v_n   integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.tab_write_guard', 'g');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% already asks % page guards', p_sig, v_n;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.lead_need\([^;]*\);', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '% asks lead_need % times, not once', p_sig, v_n;
  END IF;
  v_need := (regexp_match(v_src, '(PERFORM public\.lead_need\([^;]*\);)'))[1];
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, replace(v_src, v_need, v_need || E'\n  ' || p_new));
  IF position(p_new IN (SELECT prosrc FROM pg_proc WHERE oid = v_oid)) = 0 THEN
    RAISE EXCEPTION '% — the new guard is not in place', p_sig;
  END IF;
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

-- lead_save_flow carries its guard in the body above already (this finds it there and changes nothing).
SELECT pg_temp.tab_guard('public.lead_save_flow(uuid, jsonb)',
  $$ARRAY['/leads/flows']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_save_auto_category(uuid, text, text)',
  $$ARRAY['/leads/flows']$$, ARRAY['leads.manage']);
SELECT pg_temp.tab_guard('public.lead_remove_auto_category(uuid)',
  $$ARRAY['/leads/flows']$$, ARRAY['leads.manage']);

NOTIFY pgrst, 'reload schema';
