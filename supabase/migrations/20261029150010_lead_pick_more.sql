-- Lead View › an option that sends several replies; a question the customer may answer with more than one option, by
-- tapping again or by typing the options' numbers (2026-10-29 — the user, on Reply templates: "then 是否能做多选的选项呢？
-- 如果客户选择对2样产品有兴趣，那我们在做mind map的同时也能一个选项对应多条回复"; asked: both ways of picking more —
-- "两种都要" — and one option drawing lines to several steps — "可以，一个选项连多个步骤"; .claude/rules/leads/lead-view.md
-- › PICK MORE THAN ONE, SEVERAL REPLIES TO AN OPTION).
--
--   - An option's `also`: steps whose message goes out first, in order (each a "Send a message" step — its words only,
--     its own Goes to not followed); then the option's `next` as before.
--   - A question's `multi`: each option tapped sends its replies (`also`), is kept in the card (interest and note add
--     up), and the question comes back with the options not picked yet and its finish button (`doneLabel`, "That's
--     all"), under `againText`; the finish button — or every option picked — goes to the question's own `next` (its
--     `endMsg` when it ends). On such a question an option's `next` stays '' (its replies are its `also`).
--   - Typed numbers ("1,3", "1 3", "1、3", １ / 一): the options as the list the customer was LAST shown numbers them (the
--     newest template message's buttons — what Messenger lists as "1. …"); one on a question that takes one, several
--     where it takes more. Words that are an option's label still pick it, as before.
--   - Which options a customer picked on the question now waiting: lead_contacts.flow_picked, emptied whenever a
--     question starts waiting (PRODUCTION's lead_flow_send, md5 adb6349a…, one statement's SET swapped).
--   - PRODUCTION's lead_flow_on_message (md5 b9bd1174…): its question branch hands the answer to lead_flow_question.
--   - PRODUCTION's lead_template_problem (md5 214c9367…): its last RETURN asks lead_template_more as well.

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS flow_picked jsonb NOT NULL DEFAULT '[]'::jsonb;

-- What an option's or a step's answer keeps in the card; p_add = add it to what this question kept already.
CREATE OR REPLACE FUNCTION public.lead_flow_keep(p_contact uuid, p_as text, p_label text, p_add boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_as IS NULL OR p_label IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.lead_contacts SET
    interest = CASE WHEN p_as = 'interest' THEN left(CASE WHEN p_add AND interest <> '' THEN interest || ', ' || p_label ELSE p_label END, 120) ELSE interest END,
    budget = CASE WHEN p_as = 'budget' THEN left(p_label, 60) ELSE budget END,
    showroom = CASE WHEN p_as = 'showroom' THEN left(p_label, 60) ELSE showroom END,
    preferred_time = CASE WHEN p_as = 'preferredTime' THEN left(p_label, 60) ELSE preferred_time END,
    note = CASE WHEN p_as = 'note' THEN left(CASE WHEN note = '' THEN p_label ELSE note || E'\n' || p_label END, 1000) ELSE note END
  WHERE id = p_contact;
END
$fn$;

-- An option's `also`: each step's message, in order.
CREATE OR REPLACE FUNCTION public.lead_flow_also(p_contact uuid, p_flow public.lead_flows, p_ids jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id text;
  s jsonb;
BEGIN
  IF jsonb_typeof(p_ids) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  FOR v_id IN SELECT * FROM jsonb_array_elements_text(p_ids) LOOP
    SELECT x INTO s FROM jsonb_array_elements(p_flow.steps) x WHERE x->>'id' = v_id;
    IF s IS NOT NULL THEN
      PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>'text', NULL);
    END IF;
  END LOOP;
END
$fn$;

-- The customer answered a question: an option's words, the finish button, or numbers. False = none of those (the
-- template stops for Customer Service, as before).
CREATE OR REPLACE FUNCTION public.lead_flow_question(p_contact uuid, p_flow public.lead_flows, p_step jsonb, p_body text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_opts jsonb := CASE WHEN jsonb_typeof(p_step->'buttons') = 'array' THEN p_step->'buttons' ELSE '[]'::jsonb END;
  v_multi boolean := coalesce(p_step->>'multi', '') = 'true';
  v_done text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabel', '')), ''), 'That''s all');
  v_ans text := lower(btrim(coalesce(p_body, '')));
  v_norm text;
  v_shown jsonb;
  v_picks integer[] := ARRAY[]::integer[];
  v_had integer[];
  v_finish boolean := false;
  v_k integer;
  v_lbl text;
  v_i integer;
  v_add boolean;
  o jsonb;
  v_left jsonb;
BEGIN
  SELECT coalesce(array_agg(x::integer), ARRAY[]::integer[]) INTO v_had
    FROM public.lead_contacts c, jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.flow_picked) = 'array' THEN c.flow_picked ELSE '[]'::jsonb END) x
   WHERE c.id = p_contact;

  -- Its words: the finish button, or an option's label.
  IF v_multi AND v_ans = lower(v_done) THEN
    v_finish := true;
  ELSE
    SELECT (e.o - 1)::integer INTO v_i FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o)
     WHERE lower(btrim(e.b->>'label')) = v_ans LIMIT 1;
    IF v_i IS NOT NULL THEN
      v_picks := ARRAY[v_i];
    END IF;
  END IF;

  -- Else its numbers, as the list the customer was last shown numbers them.
  IF NOT v_finish AND cardinality(v_picks) = 0 THEN
    v_norm := translate(coalesce(p_body, ''), '０１２３４５６７８９零〇一幺二两三四五六七八九', '01234567890011223456789');
    IF v_norm ~* '^\s*\d{1,2}((\s*([,，、/&+]|和|及|and)\s*|\s+)\d{1,2})*\s*$' THEN
      SELECT m.buttons INTO v_shown FROM public.lead_messages m
       WHERE m.contact_id = p_contact AND m.sender = 'flow' AND jsonb_typeof(m.buttons) = 'array'
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
      IF v_shown IS NULL THEN
        SELECT jsonb_agg(b->>'label') INTO v_shown FROM jsonb_array_elements(v_opts) b;
      END IF;
      FOR v_k IN SELECT (r[1])::integer FROM regexp_matches(v_norm, '\d+', 'g') r LOOP
        CONTINUE WHEN v_k < 1;
        v_lbl := v_shown->>(v_k - 1);
        CONTINUE WHEN v_lbl IS NULL;
        IF v_multi AND lower(btrim(v_lbl)) = lower(v_done) THEN
          v_finish := true;
          CONTINUE;
        END IF;
        v_i := NULL;
        SELECT (e.o - 1)::integer INTO v_i FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o)
         WHERE lower(btrim(e.b->>'label')) = lower(btrim(v_lbl)) LIMIT 1;
        IF v_i IS NOT NULL AND NOT (v_i = ANY (v_picks)) THEN
          v_picks := v_picks || v_i;
        END IF;
      END LOOP;
      IF NOT v_multi THEN
        v_picks := v_picks[1:1];
      END IF;
    END IF;
  END IF;

  IF NOT v_finish AND cardinality(v_picks) = 0 THEN
    RETURN false;
  END IF;

  -- One option: its replies, then where it goes — as before.
  IF NOT v_multi THEN
    o := v_opts->v_picks[1];
    PERFORM public.lead_flow_keep(p_contact, p_step->>'saveAs', o->>'label', false);
    PERFORM public.lead_flow_also(p_contact, p_flow, o->'also');
    IF coalesce(o->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, o->>'endMsg');
    ELSE
      PERFORM public.lead_flow_send(p_contact, p_flow, o->>'next');
    END IF;
    RETURN true;
  END IF;

  -- More than one: each new pick's replies, kept in the card; then the question again, or on when finished.
  v_add := cardinality(v_had) > 0;
  FOREACH v_i IN ARRAY v_picks LOOP
    CONTINUE WHEN v_i = ANY (v_had);
    o := v_opts->v_i;
    PERFORM public.lead_flow_keep(p_contact, p_step->>'saveAs', o->>'label', v_add);
    v_add := true;
    PERFORM public.lead_flow_also(p_contact, p_flow, o->'also');
    v_had := v_had || v_i;
  END LOOP;
  SELECT jsonb_agg(e.b->>'label' ORDER BY e.o) INTO v_left
    FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o) WHERE NOT ((e.o - 1)::integer = ANY (v_had));
  IF v_finish OR v_left IS NULL THEN
    UPDATE public.lead_contacts SET flow_picked = '[]'::jsonb WHERE id = p_contact;
    IF coalesce(p_step->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, p_step->>'endMsg');
    ELSE
      PERFORM public.lead_flow_send(p_contact, p_flow, p_step->>'next');
    END IF;
    RETURN true;
  END IF;
  UPDATE public.lead_contacts SET flow_picked = to_jsonb(v_had) WHERE id = p_contact;
  PERFORM public.lead_flow_say(p_contact, p_flow.name,
    coalesce(NULLIF(btrim(coalesce(p_step->>'againText', '')), ''), 'Anything else? Pick another, or tap "' || v_done || '".'),
    v_left || jsonb_build_array(v_done));
  RETURN true;
END
$fn$;

-- What lead_template_problem does not ask: an option's `also`, a question that takes more than one.
CREATE OR REPLACE FUNCTION public.lead_template_more(p_steps jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  s jsonb;
  b jsonb;
  v_to text;
  v_kind text;
  v_seen text[];
BEGIN
  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    CONTINUE WHEN s->>'kind' IS DISTINCT FROM 'question';
    IF s->'multi' IS NOT NULL AND jsonb_typeof(s->'multi') <> 'boolean' THEN
      RETURN 'A question takes one option or more.';
    END IF;
    IF length(coalesce(s->>'doneLabel', '')) > 20 THEN
      RETURN 'The finish button says 20 characters at most.';
    END IF;
    IF length(coalesce(s->>'againText', '')) > 1000 THEN
      RETURN 'A message is 1,000 characters at most.';
    END IF;
    FOR b IN SELECT * FROM jsonb_array_elements(s->'buttons') LOOP
      IF coalesce(s->>'multi', '') = 'true' AND coalesce(b->>'next', '') <> '' THEN
        RETURN 'On a question that takes more than one, an option''s replies are its messages; the question goes on when they finish.';
      END IF;
      CONTINUE WHEN b->'also' IS NULL;
      IF jsonb_typeof(b->'also') <> 'array' OR jsonb_array_length(b->'also') > 5 THEN
        RETURN 'An option sends 5 more messages at most.';
      END IF;
      v_seen := ARRAY[]::text[];
      FOR v_to IN SELECT * FROM jsonb_array_elements_text(b->'also') LOOP
        SELECT x->>'kind' INTO v_kind FROM jsonb_array_elements(p_steps) x WHERE x->>'id' = v_to;
        IF v_kind IS NULL OR v_to = s->>'id' THEN
          RETURN 'An option''s replies are steps of this template.';
        END IF;
        IF v_kind <> 'message' THEN
          RETURN 'An option''s other replies are "Send a message" steps.';
        END IF;
        IF v_to = ANY (v_seen) THEN
          RETURN 'An option sends each reply once.';
        END IF;
        v_seen := v_seen || v_to;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NULL;
END
$fn$;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_flow_send(uuid, public.lead_flows, text)',
          $$flow_state = 'running', flow_tries = 0 WHERE id = p_contact;$$,
          $$flow_state = 'running', flow_tries = 0, flow_picked = '[]'::jsonb WHERE id = p_contact;$$,
          'adb6349aca3f86262e0c892a2e5764ff'],
    ARRAY['public.lead_flow_on_message()',
          $$    IF s->>'kind' = 'question' THEN
      SELECT b->>'next', b->>'label', b->>'endMsg' INTO v_next, v_label, v_end
        FROM jsonb_array_elements(s->'buttons') b WHERE lower(btrim(b->>'label')) = v_answer LIMIT 1;
    ELSIF$$,
          $$    IF s->>'kind' = 'question' THEN
      -- An option tapped or typed — its words, or its number; several on a question that takes more than one — its
      -- replies and where it goes (lead_flow_question, mig 20261029150010). None: the template stops below.
      IF public.lead_flow_question(c.id, f, s, NEW.body) THEN
        RETURN NULL;
      END IF;
    ELSIF$$,
          'b9bd11748a326fe93d77f4c9bfb02a1c'],
    ARRAY['public.lead_template_problem(jsonb)',
          $$  RETURN NULL;
END$$,
          $$  RETURN public.lead_template_more(p_steps);
END$$,
          '214c9367e273ce5667e16b1f0f12bf20']];
  i int;
  v_sig regprocedure;
  v_src text;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    IF position(v_swaps[i][3] IN v_src) > 0 THEN
      CONTINUE;
    END IF;
    IF md5(v_src) IS DISTINCT FROM v_swaps[i][4] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    IF (length(v_src) - length(replace(v_src, v_swaps[i][2], ''))) / length(v_swaps[i][2]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_sig), v_swaps[i][2], v_swaps[i][3]);
  END LOOP;
END
$do$;

REVOKE ALL ON FUNCTION public.lead_flow_keep(uuid, text, text, boolean), public.lead_flow_also(uuid, public.lead_flows, jsonb),
  public.lead_flow_question(uuid, public.lead_flows, jsonb, text), public.lead_template_more(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_keep(uuid, text, text, boolean), public.lead_flow_also(uuid, public.lead_flows, jsonb),
  public.lead_flow_question(uuid, public.lead_flows, jsonb, text), public.lead_template_more(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
