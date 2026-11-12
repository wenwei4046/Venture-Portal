-- Reply templates in English and Chinese, several files a step (2026-11-11 — the user: "做中英对照的画面，内容由客服去写，
-- 这样他们就不用做2次" and "可以多张图片，video, pdf file"; then "Yes, build it" to the plan).
--
-- A step keeps its English words where they were (text, endMsg, retryText, doneLabel, againText, an option's label and
-- endMsg) and gains a Chinese twin of each beside it (textZh, endMsgZh, retryTextZh, doneLabelZh, againTextZh, labelZh,
-- an option's endMsgZh); a template's closing message gains lead_flows.end_msg_zh. Which one a customer gets:
--
--   lead_flow_lang(contact)  the customer panel's Language first (Mandarin → zh, English → en); else the customer's
--                            latest message with words in it — a Chinese character → zh, else en. A message that is
--                            only digits, emoji or a file ([Photo] …) does not decide, so "1" keeps the language.
--   lead_flow_t(contact, s, key)  that language's words, and the other language's when that box is empty.
--
-- An option typed or tapped matches its English or its Chinese label; the finish button either language's (the
-- defaults "That's all" / "就这些"); ‹ Back reads "‹ 返回" in Chinese and both are understood. {name} with no name is
-- "there" in English, "朋友" in Chinese.
--
-- Files: a step's `files` (up to 10 — photo, video, PDF or any file, each uploaded under chat/tpl/<uuid>/) go out in
-- their order before the step's words; a step saved before this keeps its one `file`, sent as before.
--
-- lead_flow_say, lead_flow_on_message and lead_template_problem are PRODUCTION's bodies with swaps, each found the
-- number of times it says; the others are replaced whole after their md5 is checked against production's.

ALTER TABLE public.lead_flows ADD COLUMN IF NOT EXISTS end_msg_zh text NOT NULL DEFAULT '';

-- Production's bodies, before anything here replaces them.
DO $do$
DECLARE
  r record;
  v_src text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.lead_flow_send(uuid,public.lead_flows,text)', '36d7035bb27e76534ce680eb7d142c62'),
      ('public.lead_flow_also(uuid,public.lead_flows,jsonb)', '9a6cd0b1fe1848c6b2b6cc59ba6670a9'),
      ('public.lead_flow_buttons(uuid,public.lead_flows,jsonb)', '3267c5a34e976ede2485bbf908e79d9f'),
      ('public.lead_flow_end(uuid,public.lead_flows,text)', '4d2d9a1f94b7775d6a96e9fdde49d4d4'),
      ('public.lead_flow_say_file(uuid,text,jsonb)', 'd07509ecdec2a4b126c016a277cca8eb'),
      ('public.lead_flow_question(uuid,public.lead_flows,jsonb,text)', '038ae4899a25a93a207c7af66b67910b|3456e010719447d000f5477c965239d2'),  -- production's | mig 20261029150010's with its comments
      ('public.lead_save_template(uuid,jsonb)', '30b2c68f834afbca0b1c83cdf55a3e87'),
      ('public.lead_flows()', 'c8db75d0fbd324453096577a3d33527f'),
      ('public.lead_library_push(uuid)', 'a5206bc6c73a2a134ce204e53f246832'),
      ('public.lead_template_more(jsonb)', 'f432630dd1211657b13a34edf9c91bf7')) v(sig, sum) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.sig::regprocedure;
    IF position('mig 20261111130000' IN v_src) = 0 AND NOT (md5(v_src) = ANY (string_to_array(r.sum, '|'))) THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', r.sig, md5(v_src);
    END IF;
  END LOOP;
END
$do$;

-- ── The language and the words ─────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_flow_lang(p_contact uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang text;
  v_body text;
BEGIN
  SELECT c.language INTO v_lang FROM public.lead_contacts c WHERE c.id = p_contact;
  IF v_lang = 'Mandarin' THEN
    RETURN 'zh';
  ELSIF v_lang = 'English' THEN
    RETURN 'en';
  END IF;
  SELECT m.body INTO v_body FROM public.lead_messages m
   WHERE m.contact_id = p_contact AND m.direction = 'in'
     AND m.body ~ '[A-Za-z㐀-鿿]' AND m.body !~ '^\[[A-Za-z ]+\]'
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  RETURN CASE WHEN v_body ~ '[㐀-鿿]' THEN 'zh' ELSE 'en' END;
END
$$;
REVOKE ALL ON FUNCTION public.lead_flow_lang(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_lang(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lead_flow_t(p_contact uuid, s jsonb, p_key text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_en text := s->>p_key;
  v_zh text := s->>(p_key || 'Zh');
BEGIN
  IF btrim(coalesce(v_zh, '')) = '' THEN
    RETURN v_en;
  END IF;
  IF btrim(coalesce(v_en, '')) = '' OR public.lead_flow_lang(p_contact) = 'zh' THEN
    RETURN v_zh;
  END IF;
  RETURN v_en;
END
$$;
REVOKE ALL ON FUNCTION public.lead_flow_t(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_t(uuid, jsonb, text) TO service_role;

-- Does a typed or tapped answer say this option, in either language?
CREATE OR REPLACE FUNCTION public.lead_flow_is(p_answer text, b jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(p_answer, ''))) <> ''
     AND lower(btrim(coalesce(p_answer, ''))) IN (lower(btrim(coalesce(b->>'label', ''))), lower(btrim(coalesce(b->>'labelZh', ''))))
$$;
REVOKE ALL ON FUNCTION public.lead_flow_is(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_is(text, jsonb) TO service_role;

-- ── The runner, replaced whole ──────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_flow_send(p_contact uuid, p_flow public.lead_flows, p_step text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
    -- The step's files first, then its words in the customer's language (mig 20261111130000).
    PERFORM public.lead_flow_say_file(p_contact, p_flow.name, s);
    PERFORM public.lead_flow_say(p_contact, p_flow.name, public.lead_flow_t(p_contact, s, 'text'),
      public.lead_flow_buttons(p_contact, p_flow, s));
    IF s->>'kind' IN ('question', 'phone', 'text') THEN
      -- The steps that waited in this run, for ‹ Back (mig 20261102180000); the first step starts the run again.
      UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = v_step, flow_state = 'running', flow_tries = 0, flow_picked = '[]'::jsonb,
             flow_trail = CASE WHEN v_step = p_flow.steps->0->>'id' THEN jsonb_build_array(v_step) ELSE flow_trail || to_jsonb(v_step) END
       WHERE id = p_contact;
      RETURN;
    END IF;
    IF s->>'kind' IN ('handoff', 'ai') THEN
      PERFORM public.lead_flow_to_cs(p_contact, p_flow, s->>'kind' = 'ai');
      RETURN;
    END IF;
    -- A message: on to the next step, or the end with its closing message.
    IF coalesce(s->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, public.lead_flow_t(p_contact, s, 'endMsg'));
      RETURN;
    END IF;
    v_step := s->>'next';
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flow_also(p_contact uuid, p_flow public.lead_flows, p_ids jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
      -- In the customer's language (mig 20261111130000).
      PERFORM public.lead_flow_say_file(p_contact, p_flow.name, s);
      PERFORM public.lead_flow_say(p_contact, p_flow.name, public.lead_flow_t(p_contact, s, 'text'), NULL);
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flow_buttons(p_contact uuid, p_flow public.lead_flows, s jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Each option in the customer's language, and ‹ Back in it too (mig 20261111130000).
  v_opts jsonb := CASE WHEN s->>'kind' = 'question' THEN
    (SELECT jsonb_agg(public.lead_flow_t(p_contact, b, 'label')) FROM jsonb_array_elements(s->'buttons') b) END;
  v_back boolean;
BEGIN
  v_back := s->>'back' = 'true' AND s->>'kind' IN ('question', 'text', 'phone') AND s->>'id' IS DISTINCT FROM p_flow.steps->0->>'id'
    AND EXISTS (SELECT 1 FROM public.lead_contacts c, jsonb_array_elements_text(c.flow_trail) t(x) WHERE c.id = p_contact AND t.x <> s->>'id');
  IF v_back THEN
    RETURN coalesce(v_opts, '[]'::jsonb)
      || jsonb_build_array(CASE WHEN public.lead_flow_lang(p_contact) = 'zh' THEN '‹ 返回' ELSE '‹ Back' END);
  END IF;
  RETURN v_opts;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flow_end(p_contact uuid, p_flow public.lead_flows, p_end text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- The template's closing message in the customer's language, the other one when that is empty (mig 20261111130000).
  v_tpl text := CASE WHEN public.lead_flow_lang(p_contact) = 'zh'
                     THEN coalesce(NULLIF(btrim(coalesce(p_flow.end_msg_zh, '')), ''), p_flow.end_msg)
                     ELSE coalesce(NULLIF(btrim(coalesce(p_flow.end_msg, '')), ''), p_flow.end_msg_zh) END;
BEGIN
  PERFORM public.lead_flow_say(p_contact, p_flow.name, coalesce(NULLIF(btrim(coalesce(p_end, '')), ''), v_tpl), NULL);
  UPDATE public.lead_contacts SET flow_id = p_flow.id, flow_step = NULL, flow_state = 'done', flow_tries = 0 WHERE id = p_contact;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flow_say_file(p_contact uuid, p_name text, p_step jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- A step's files in their order, 10 at most; a step from before keeps its one `file` (mig 20261111130000).
  v_files jsonb := CASE WHEN jsonb_typeof(p_step->'files') = 'array' AND jsonb_array_length(p_step->'files') > 0 THEN p_step->'files'
                        WHEN jsonb_typeof(p_step->'file') = 'object' THEN jsonb_build_array(p_step->'file')
                        ELSE '[]'::jsonb END;
  v_file jsonb;
  v_path text;
  v_mime text;
  v_name text;
  v_body text;
BEGIN
  FOR v_file IN SELECT x FROM jsonb_array_elements(v_files) WITH ORDINALITY e(x, o) WHERE o <= 10 ORDER BY o LOOP
    CONTINUE WHEN jsonb_typeof(v_file) IS DISTINCT FROM 'object';
    v_path := v_file->>'path';
    v_mime := left(coalesce(v_file->>'mime', ''), 120);
    v_name := left(btrim(coalesce(v_file->>'name', '')), 120);
    CONTINUE WHEN v_path IS NULL OR v_path !~ '^chat/tpl/[0-9a-f-]{36}/[^/]+$'
      OR NOT EXISTS (SELECT 1 FROM public.file_objects WHERE bucket_id = 'lead-media' AND name = v_path);
    v_body := CASE WHEN v_mime LIKE 'image/%' THEN '[Photo]' WHEN v_mime LIKE 'video/%' THEN '[Video]'
                   ELSE '[File] ' || coalesce(NULLIF(v_name, ''), regexp_replace(v_path, '^.*/', '')) END;
    INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, media_path, media_mime)
    VALUES (p_contact, 'out', 'flow', p_name, v_body, v_path, NULLIF(v_mime, ''));
    UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = v_body, updated_at = now() WHERE id = p_contact;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flow_question(p_contact uuid, p_flow public.lead_flows, p_step jsonb, p_body text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- An option matches its English or its Chinese words; what is shown and kept is the customer's language
  -- (mig 20261111130000).
  v_opts jsonb := CASE WHEN jsonb_typeof(p_step->'buttons') = 'array' THEN p_step->'buttons' ELSE '[]'::jsonb END;
  v_multi boolean := coalesce(p_step->>'multi', '') = 'true';
  v_zh boolean := public.lead_flow_lang(p_contact) = 'zh';
  v_done_en text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabel', '')), ''), 'That''s all');
  v_done_zh text := coalesce(NULLIF(btrim(coalesce(p_step->>'doneLabelZh', '')), ''), '就这些');
  v_done text;
  v_again text;
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
  v_done := CASE WHEN v_zh THEN v_done_zh ELSE v_done_en END;
  SELECT coalesce(array_agg(x::integer), ARRAY[]::integer[]) INTO v_had
    FROM public.lead_contacts c, jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.flow_picked) = 'array' THEN c.flow_picked ELSE '[]'::jsonb END) x
   WHERE c.id = p_contact;

  IF v_multi AND v_ans IN (lower(v_done_en), lower(v_done_zh)) THEN
    v_finish := true;
  ELSE
    SELECT (e.o - 1)::integer INTO v_i FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o)
     WHERE public.lead_flow_is(v_ans, e.b) ORDER BY e.o LIMIT 1;
    IF v_i IS NOT NULL THEN
      v_picks := ARRAY[v_i];
    END IF;
  END IF;

  IF NOT v_finish AND cardinality(v_picks) = 0 THEN
    v_norm := translate(coalesce(p_body, ''), '０１２３４５６７８９零〇一幺二两三四五六七八九', '01234567890011223456789');
    IF v_norm ~* '^\s*\d{1,2}((\s*([,，、/&+]|和|及|and)\s*|\s+)\d{1,2})*\s*$' THEN
      SELECT m.buttons INTO v_shown FROM public.lead_messages m
       WHERE m.contact_id = p_contact AND m.sender = 'flow' AND jsonb_typeof(m.buttons) = 'array'
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
      IF v_shown IS NULL THEN
        SELECT jsonb_agg(public.lead_flow_t(p_contact, b, 'label')) INTO v_shown FROM jsonb_array_elements(v_opts) b;
      END IF;
      FOR v_k IN SELECT (r[1])::integer FROM regexp_matches(v_norm, '\d+', 'g') r LOOP
        CONTINUE WHEN v_k < 1;
        v_lbl := v_shown->>(v_k - 1);
        CONTINUE WHEN v_lbl IS NULL;
        IF v_multi AND lower(btrim(v_lbl)) IN (lower(v_done_en), lower(v_done_zh)) THEN
          v_finish := true;
          CONTINUE;
        END IF;
        v_i := NULL;
        SELECT (e.o - 1)::integer INTO v_i FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o)
         WHERE public.lead_flow_is(v_lbl, e.b) ORDER BY e.o LIMIT 1;
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

  IF NOT v_multi THEN
    o := v_opts->v_picks[1];
    PERFORM public.lead_flow_keep(p_contact, p_step->>'saveAs', public.lead_flow_t(p_contact, o, 'label'), false);
    PERFORM public.lead_flow_also(p_contact, p_flow, o->'also');
    IF coalesce(o->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, public.lead_flow_t(p_contact, o, 'endMsg'));
    ELSE
      PERFORM public.lead_flow_send(p_contact, p_flow, o->>'next');
    END IF;
    RETURN true;
  END IF;

  v_add := cardinality(v_had) > 0;
  FOREACH v_i IN ARRAY v_picks LOOP
    CONTINUE WHEN v_i = ANY (v_had);
    o := v_opts->v_i;
    PERFORM public.lead_flow_keep(p_contact, p_step->>'saveAs', public.lead_flow_t(p_contact, o, 'label'), v_add);
    v_add := true;
    PERFORM public.lead_flow_also(p_contact, p_flow, o->'also');
    v_had := v_had || v_i;
  END LOOP;
  SELECT jsonb_agg(public.lead_flow_t(p_contact, e.b, 'label') ORDER BY e.o) INTO v_left
    FROM jsonb_array_elements(v_opts) WITH ORDINALITY e(b, o) WHERE NOT ((e.o - 1)::integer = ANY (v_had));
  IF v_finish OR v_left IS NULL THEN
    UPDATE public.lead_contacts SET flow_picked = '[]'::jsonb WHERE id = p_contact;
    IF coalesce(p_step->>'next', '') = '' THEN
      PERFORM public.lead_flow_end(p_contact, p_flow, public.lead_flow_t(p_contact, p_step, 'endMsg'));
    ELSE
      PERFORM public.lead_flow_send(p_contact, p_flow, p_step->>'next');
    END IF;
    RETURN true;
  END IF;
  UPDATE public.lead_contacts SET flow_picked = to_jsonb(v_had) WHERE id = p_contact;
  v_again := NULLIF(btrim(coalesce(public.lead_flow_t(p_contact, p_step, 'againText'), '')), '');
  PERFORM public.lead_flow_say(p_contact, p_flow.name,
    coalesce(v_again, CASE WHEN v_zh THEN '还有别的吗？再选一个，或点“' || v_done || '”。'
                           ELSE 'Anything else? Pick another, or tap "' || v_done || '".' END),
    v_left || jsonb_build_array(v_done));
  RETURN true;
END
$$;

-- ── Saving and reading templates ────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_template_more(p_steps jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s jsonb;
  b jsonb;
  v_to text;
  v_kind text;
  v_seen text[];
BEGIN
  -- The Chinese words and the files (mig 20261111130000).
  FOR s IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    IF length(coalesce(s->>'textZh', '')) > 1000 OR length(coalesce(s->>'endMsgZh', '')) > 1000
       OR length(coalesce(s->>'retryTextZh', '')) > 1000 OR length(coalesce(s->>'againTextZh', '')) > 1000 THEN
      RETURN 'A message is 1,000 characters at most.';
    END IF;
    IF length(coalesce(s->>'doneLabelZh', '')) > 20 THEN
      RETURN 'The finish button says 20 characters at most.';
    END IF;
    IF s->'files' IS NOT NULL AND jsonb_typeof(s->'files') <> 'null' THEN
      IF jsonb_typeof(s->'files') <> 'array' OR jsonb_array_length(s->'files') > 10 THEN
        RETURN 'A step sends 10 files at most.';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(s->'files') x
                  WHERE jsonb_typeof(x) <> 'object' OR coalesce(x->>'path', '') !~ '^chat/tpl/[0-9a-f-]{36}/[^/]+$') THEN
        RETURN 'A step''s files are uploaded with the template.';
      END IF;
    END IF;
    IF jsonb_typeof(s->'buttons') = 'array' THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(s->'buttons') x WHERE length(coalesce(x->>'labelZh', '')) > 200) THEN
        RETURN 'An option says 1 to 200 characters.';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(s->'buttons') x WHERE length(coalesce(x->>'endMsgZh', '')) > 1000) THEN
        RETURN 'A message is 1,000 characters at most.';
      END IF;
    END IF;
  END LOOP;

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
$$;

CREATE OR REPLACE FUNCTION public.lead_save_template(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_steps jsonb := coalesce(p_data->'steps', '[]'::jsonb);
  v_problem text;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Templates need Lead View · Manage.');
  PERFORM public.tab_write_guard(ARRAY['/leads/flows'], ARRAY['leads.manage']);
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A template needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  -- The closing message in Chinese too (mig 20261111130000).
  IF length(coalesce(p_data->>'description', '')) > 300 OR length(coalesce(p_data->>'endMsg', '')) > 1000
     OR length(coalesce(p_data->>'endMsgZh', '')) > 1000 THEN
    RAISE EXCEPTION 'The description is 300 characters at most, the closing message 1,000.' USING ERRCODE = '22023';
  END IF;
  v_problem := public.lead_template_problem(v_steps);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_flows (name, description, end_msg, end_msg_zh, template, trigger_kind, trigger_value, active, steps, sort_order)
    VALUES (v_name, btrim(coalesce(p_data->>'description', '')), btrim(coalesce(p_data->>'endMsg', '')), btrim(coalesce(p_data->>'endMsgZh', '')),
            'custom', 'first', '', false, v_steps,
            (SELECT coalesce(max(sort_order), 0) + 1 FROM public.lead_flows))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_flows SET name = v_name, description = btrim(coalesce(p_data->>'description', '')),
         end_msg = btrim(coalesce(p_data->>'endMsg', '')), end_msg_zh = btrim(coalesce(p_data->>'endMsgZh', '')),
         steps = v_steps, updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is gone.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_flows()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  -- + endMsgZh (mig 20261111130000)
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'brandId', f.brand_id, 'name', f.name, 'triggerKind', f.trigger_kind, 'triggerValue', f.trigger_value,
      'active', f.active, 'steps', f.steps, 'sortOrder', f.sort_order, 'updatedAt', f.updated_at,
      'categoryId', f.category_id, 'template', f.template, 'config', f.config, 'description', f.description, 'endMsg', f.end_msg,
      'endMsgZh', f.end_msg_zh,
      'started', (SELECT count(DISTINCT m.contact_id) FROM public.lead_messages m
                   WHERE m.sender = 'flow' AND m.by_name = f.name AND m.created_at > now() - interval '7 days'),
      'phones', (SELECT count(*) FROM public.lead_contacts c WHERE c.flow_id = f.id AND c.phone IS NOT NULL AND c.created_at > now() - interval '7 days'))
      ORDER BY f.sort_order, f.created_at)
      FROM public.lead_flows f WHERE f.deleted_at IS NULL), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION public.lead_library_push(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.lead_step_library;
  v_src jsonb;
  f record;
  v_steps jsonb;
  v_n integer := 0;
BEGIN
  SELECT * INTO l FROM public.lead_step_library WHERE id = p_id AND deleted_at IS NULL AND kind = 'step';
  IF NOT FOUND OR jsonb_array_length(l.steps) <> 1 THEN
    RETURN 0;
  END IF;
  v_src := l.steps->0;
  FOR f IN SELECT id, steps FROM public.lead_flows
            WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(steps) s WHERE s->'lib'->>'id' = p_id::text) FOR UPDATE LOOP
    SELECT jsonb_agg(CASE WHEN s->'lib'->>'id' = p_id::text THEN
             -- The library's words (English and Chinese, mig 20261111130000), files and extras over the template's copy …
             (s - 'kind' - 'name' - 'text' - 'textZh' - 'file' - 'files' - 'saveAs' - 'retryText' - 'retryTextZh' - 'retryMax' - 'multi'
                - 'doneLabel' - 'doneLabelZh' - 'againText' - 'againTextZh' - 'buttons')
             || jsonb_strip_nulls(jsonb_build_object('kind', v_src->'kind', 'name', v_src->'name', 'text', v_src->'text', 'textZh', v_src->'textZh',
                  'file', v_src->'file', 'files', v_src->'files',
                  'saveAs', v_src->'saveAs', 'retryText', v_src->'retryText', 'retryTextZh', v_src->'retryTextZh', 'retryMax', v_src->'retryMax',
                  'multi', v_src->'multi', 'doneLabel', v_src->'doneLabel', 'doneLabelZh', v_src->'doneLabelZh',
                  'againText', v_src->'againText', 'againTextZh', v_src->'againTextZh'))
             -- … each option's words from the library, where it goes and what it also sends from the template's, by place …
             || CASE WHEN v_src ? 'buttons' THEN jsonb_build_object('buttons', coalesce((
                  SELECT jsonb_agg((b.v - 'next' - 'also' - 'endMsg' - 'endMsgZh')
                           || jsonb_build_object('next', coalesce(s->'buttons'->(b.n::int - 1)->'next', '""'::jsonb))
                           || jsonb_strip_nulls(jsonb_build_object('also', s->'buttons'->(b.n::int - 1)->'also',
                                'endMsg', s->'buttons'->(b.n::int - 1)->'endMsg', 'endMsgZh', s->'buttons'->(b.n::int - 1)->'endMsgZh'))
                           ORDER BY b.n)
                    FROM jsonb_array_elements(v_src->'buttons') WITH ORDINALITY b(v, n)), '[]'::jsonb)) ELSE '{}'::jsonb END
             -- … and marked as the library's new version.
             || jsonb_build_object('lib', jsonb_build_object('id', p_id::text, 'ver', l.ver))
           ELSE s END ORDER BY o)
      INTO v_steps
      FROM jsonb_array_elements(f.steps) WITH ORDINALITY x(s, o);
    UPDATE public.lead_flows SET steps = v_steps, updated_at = now() WHERE id = f.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;

-- ── Swaps in production's bodies ────────────────────────────────────────────────────────────────────────────────

DO $do$
DECLARE
  -- signature, md5 of production's body, the text, what it becomes, how many times the text is there
  v_swaps text[][] := ARRAY[
    ARRAY['public.lead_flow_say(uuid,text,text,jsonb)', '8ecdb09f1b0a29e34a814b5221026dd8',
          $$'there'));$$,
          $$CASE WHEN public.lead_flow_lang(p_contact) = 'zh' THEN '朋友' ELSE 'there' END));  -- 朋友 in Chinese (mig 20261111130000)$$,
          '1'],
    ARRAY['public.lead_template_problem(jsonb)', 'c92ffe179873707be264c723981da557',
          $$(v_kind NOT IN ('handoff', 'ai') AND btrim(coalesce(s->>'text', '')) = '')$$,
          $$(v_kind NOT IN ('handoff', 'ai') AND btrim(coalesce(s->>'text', '') || coalesce(s->>'textZh', '')) = '' /* English or Chinese, mig 20261111130000 */)$$,
          '1'],
    ARRAY['public.lead_template_problem(jsonb)', 'c92ffe179873707be264c723981da557',
          $$IF btrim(coalesce(b->>'label', '')) = '' OR length(b->>'label') > 200 THEN$$,
          $$IF btrim(coalesce(b->>'label', '') || coalesce(b->>'labelZh', '')) = '' OR length(coalesce(b->>'label', '')) > 200 THEN$$,
          '1'],
    ARRAY['public.lead_flow_on_message()', '708935155aae4bc8a0a93ad6f69fd622',
          $$IN ('‹ back', 'back', '返回', '上一步', 'kembali')$$,
          $$IN ('‹ back', '‹ 返回', 'back', '返回', '上一步', 'kembali') /* ‹ 返回 in Chinese, mig 20261111130000 */$$,
          '1'],
    ARRAY['public.lead_flow_on_message()', '708935155aae4bc8a0a93ad6f69fd622',
          $$v_end := s->>'endMsg';$$,
          $$v_end := public.lead_flow_t(c.id, s, 'endMsg');$$,
          '2'],
    ARRAY['public.lead_flow_on_message()', '708935155aae4bc8a0a93ad6f69fd622',
          $$ELSIF s->>'kind' = 'phone' AND btrim(coalesce(s->>'retryText', '')) <> '' THEN$$,
          $$ELSIF s->>'kind' = 'phone' AND btrim(coalesce(s->>'retryText', '') || coalesce(s->>'retryTextZh', '')) <> '' THEN$$,
          '1'],
    ARRAY['public.lead_flow_on_message()', '708935155aae4bc8a0a93ad6f69fd622',
          $$PERFORM public.lead_flow_say(c.id, f.name, s->>'retryText', NULL);$$,
          $$PERFORM public.lead_flow_say(c.id, f.name, public.lead_flow_t(c.id, s, 'retryText'), NULL);$$,
          '1']];
  i int;
  v_sig regprocedure;
  v_prev regprocedure;
  v_src text;
  v_def text;
  v_skip boolean := false;
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    IF v_prev IS DISTINCT FROM v_sig THEN
      IF v_prev IS NOT NULL AND NOT v_skip THEN
        EXECUTE v_def;
      END IF;
      v_prev := v_sig;
      SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
      v_skip := position('mig 20261111130000' IN v_src) > 0;
      IF NOT v_skip AND md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
        RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
      END IF;
      v_def := pg_get_functiondef(v_sig);
    END IF;
    CONTINUE WHEN v_skip;
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> v_swaps[i][5]::int THEN
      RAISE EXCEPTION '%: the text to swap is not there % time(s): %', v_sig, v_swaps[i][5], left(v_swaps[i][3], 60);
    END IF;
    v_def := replace(v_def, v_swaps[i][3], v_swaps[i][4]);
  END LOOP;
  IF NOT v_skip THEN
    EXECUTE v_def;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
