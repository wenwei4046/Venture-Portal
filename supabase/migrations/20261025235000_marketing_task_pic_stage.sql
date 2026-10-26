-- 20261025235000_marketing_task_pic_stage.sql
-- 2026-10-25 — Marketing ②a-5: the PIC approves a quick task's stage — 🔗 PIC via link in New Project's builder. The
-- user's answer 52 ("两个都可以" — both, each chosen on the task: its meeting minutes on the link (②a-4), and a stage, the
-- level the handoff's quick builder leaves out). As a deliverable's stage the PIC approves (②b-2d), on the task's own link.
--   Started      mkt_task_create(…, p_minutes, p_pic) — production's body (20261025231000's), its signature one longer (the
--                old one dropped, as 20261025221000 did): a stage's approval level 'pic' (either PIC) or 'pic:all' (both,
--                the task naming two) — once a stage; what the PIC reads of the stage (picText, ≤ 120). The PIC named once:
--                p_minutes.pic when they approve the minutes (②a-4), else p_pic { name, whatsapp, name2, whatsapp2 } —
--                needed by a PIC level, refused without one. Their links made at Create (the minutes they approve bring
--                them when sent — and nothing starts before they are), the work theirs to follow from the start.
--   Followed     mkt_pic_work(project) — production's body: a series' runs to two weeks ahead, the latest twenty — and any
--                run waiting for the PIC's approval of a stage, however far back.
--   Answered     mkt_pic_page(code), mkt_pic_stage_answer(code, …), mkt_pic_stage_file(code, key) — production's bodies:
--                a task's link, whatever its minutes (its work — mkt_pic_work: the task itself, a series' runs); a stage
--                waiting for the PIC answered on it as a deliverable's. A task's minutes the PIC does not approve stay
--                the team's: none on the link.
--   Calendar     mkt_pic_calendar(code) — production's body: a task with a link is the PIC's as a product project is —
--                its stages' approvals and dates, a series' runs'; minutes waiting for them.
--   Read         mkt_project(key) — production's body: a run's PICs its series'; + 'picLink', the task's links when its
--                stages ask the PIC and its minutes do not ('picMinutes' has them then).
-- PGlite: tests/member-sql/validate-marketing-task-pic-stage.mjs.

DROP FUNCTION IF EXISTS public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb);


-- ── Changed from production's bodies ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_task_create(p_subsidiary uuid, p_kind text, p_title text, p_q_type text,
  p_brief text, p_stages jsonb, p_recur jsonb DEFAULT NULL, p_source uuid DEFAULT NULL, p_minutes jsonb DEFAULT NULL,
  p_pic jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_types  text[] := ARRAY['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'];
  v_sub    public.mkt_subsidiaries;
  v_title  text := btrim(coalesce(p_title, ''));
  v_brief  text := nullif(btrim(coalesce(p_brief, '')), '');
  v_n      integer := CASE WHEN jsonb_typeof(p_stages) = 'array' THEN jsonb_array_length(p_stages) ELSE 0 END;
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_clean  jsonb := '[]'::jsonb;
  v_st     jsonb;
  v_name   text;
  v_who    uuid;
  v_sla    integer;
  v_appr   jsonb;
  v_form   jsonb;
  v_f      jsonb;
  v_label  text;
  v_labels text[];
  v_x      text;
  v_back   integer;
  v_rule   jsonb;
  v_days   date[];
  v_track  text;
  v_id     uuid;
  v_open   uuid;
  v_first  uuid;
  v_src    public.mkt_projects;
  v_tpl    public.mkt_minutes_templates;
  v_mver   public.mkt_minutes_versions;
  v_mvals  jsonb := '{}'::jsonb;
  v_mval   jsonb;
  v_mf     jsonb;
  v_key    text;
  v_missing text[];
  v_mnotes text := '';
  v_msigned jsonb := '{}'::jsonb;
  v_mdone  boolean := false;
  v_wait   boolean := false;
  v_pic    text;
  v_wa     text;
  v_pic2   text;
  v_wa2    text;
  v_pobj   jsonb;
  v_picn   integer := 0;
  v_ptext  text;
  i        integer;
  j        integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.create'], 'Starting a task is not open to your account.');
  IF p_kind IS NULL OR p_kind NOT IN ('quick', 'recurring') THEN
    RAISE EXCEPTION 'Pick a quick task or a recurring task.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_sub FROM public.mkt_subsidiaries WHERE id = p_subsidiary AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick who the task is for.' USING ERRCODE = '22023';
  END IF;
  IF length(v_title) NOT BETWEEN 1 AND 140 THEN
    RAISE EXCEPTION 'Give the task a title (at most 140 characters).' USING ERRCODE = '22023';
  END IF;
  IF p_q_type IS NULL OR p_q_type NOT IN ('ads', 'social', 'content', 'brand', 'other') THEN
    RAISE EXCEPTION 'Pick the kind of work.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_brief, '')) > 4000 THEN
    RAISE EXCEPTION 'What needs to be done: at most 4,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_n NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'A task has 1 to 20 stages.' USING ERRCODE = '22023';
  END IF;

  -- The task's PIC (②a-4, ②a-5): who approves its meeting minutes on the link (p_minutes.pic — then its work waits for
  -- them, as a product project's does) or, the minutes not theirs, a stage of it (p_pic — 🔗 PIC via link): named — New
  -- Project fills in the subsidiary's — with their WhatsApp, where the link goes; a second PIC on their own link. Named
  -- once.
  IF jsonb_typeof(p_minutes) = 'object' AND jsonb_typeof(p_minutes -> 'pic') = 'object' THEN
    v_pobj := p_minutes -> 'pic';
    v_wait := true;
  ELSIF jsonb_typeof(p_minutes) = 'object' AND coalesce(jsonb_typeof(p_minutes -> 'pic'), 'null') <> 'null' THEN
    RAISE EXCEPTION 'Name the PIC, or leave the PIC out.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_pic) = 'object' THEN
    IF v_wait THEN
      RAISE EXCEPTION 'Name the PIC once — with the minutes they approve.' USING ERRCODE = '22023';
    END IF;
    v_pobj := p_pic;
  ELSIF coalesce(jsonb_typeof(p_pic), 'null') <> 'null' THEN
    RAISE EXCEPTION 'Name the PIC, or leave the PIC out.' USING ERRCODE = '22023';
  END IF;
  IF v_pobj IS NOT NULL THEN
    v_pic := nullif(btrim(coalesce(v_pobj ->> 'name', '')), '');
    v_wa := nullif(btrim(coalesce(v_pobj ->> 'whatsapp', '')), '');
    v_pic2 := nullif(btrim(coalesce(v_pobj ->> 'name2', '')), '');
    v_wa2 := nullif(btrim(coalesce(v_pobj ->> 'whatsapp2', '')), '');
    IF v_pic IS NULL OR length(v_pic) > 80 THEN
      RAISE EXCEPTION 'Name the PIC (at most 80 characters).' USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_wa, '')) > 40 OR coalesce(v_wa, '') !~ '^[+0-9 ()-]+$' OR length(regexp_replace(v_wa, '[^0-9]', '', 'g')) < 8 THEN
      RAISE EXCEPTION 'Add the PIC''s WhatsApp.' USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(v_pic2, '')) > 80 THEN
      RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_pic2 IS NOT NULL AND (length(coalesce(v_wa2, '')) > 40 OR coalesce(v_wa2, '') !~ '^[+0-9 ()-]+$'
                               OR length(regexp_replace(v_wa2, '[^0-9]', '', 'g')) < 8) THEN
      RAISE EXCEPTION 'Add the second PIC''s WhatsApp.' USING ERRCODE = '22023';
    END IF;
    IF v_pic2 IS NULL THEN
      v_wa2 := NULL;
    END IF;
  END IF;

  -- Each stage, checked and written clean.
  FOR i IN 0 .. v_n - 1 LOOP
    v_st := p_stages -> i;
    v_name := btrim(coalesce(v_st ->> 'name', ''));
    IF length(v_name) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Stage %: give it a name (at most 80 characters).', i + 1 USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_st ->> 'who', '') !~ v_uuid OR NOT ((v_st ->> 'who')::uuid = ANY (v_roster)) THEN
      RAISE EXCEPTION 'Stage %: pick a person on Marketing''s team.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_who := (v_st ->> 'who')::uuid;
    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage %: 1 to 30 working days.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_appr := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage %: at most 3 approvals.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_x IN SELECT x FROM jsonb_array_elements_text(v_st -> 'appr') x LOOP
        -- 🔗 The PIC on the link (②a-5 — the user's answer 52): once a stage — either PIC's approval, or, the task naming
        -- two, both PICs' ('pic:all').
        IF v_x IN ('pic', 'pic:all') THEN
          IF v_appr @> '[{"kind": "pic"}]'::jsonb THEN
            RAISE EXCEPTION 'Stage %: the PIC twice.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(CASE WHEN v_x = 'pic:all' AND v_pic2 IS NOT NULL THEN jsonb_build_object('kind', 'pic', 'all', true)
                                                     ELSE jsonb_build_object('kind', 'pic') END);
          v_picn := v_picn + 1;
          CONTINUE;
        END IF;
        IF v_x !~ v_uuid OR NOT (v_x::uuid = ANY (v_roster)) THEN
          RAISE EXCEPTION 'Stage %: an approver is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_x::uuid)) THEN
          RAISE EXCEPTION 'Stage %: the same approver twice.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_x::uuid));
      END LOOP;
    END IF;
    v_form := '[]'::jsonb;
    v_labels := '{}';
    IF jsonb_typeof(v_st -> 'form') = 'array' THEN
      IF jsonb_array_length(v_st -> 'form') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 fields.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_f IN SELECT x FROM jsonb_array_elements(v_st -> 'form') x LOOP
        v_label := btrim(coalesce(v_f ->> 'label', ''));
        IF NOT (coalesce(v_f ->> 'type', '') = ANY (v_types)) THEN
          RAISE EXCEPTION 'Stage %: a field of a kind it cannot hold.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF length(v_label) NOT BETWEEN 1 AND (CASE WHEN v_f ->> 'type' = 'Note' THEN 300 ELSE 60 END) THEN
          RAISE EXCEPTION 'Stage %: name each field (a note at most 300 characters, a field 60).', i + 1 USING ERRCODE = '22023';
        END IF;
        IF v_f ->> 'type' <> 'Note' THEN
          IF v_label = ANY (v_labels) THEN
            RAISE EXCEPTION 'Stage %: two fields called "%".', i + 1, v_label USING ERRCODE = '22023';
          END IF;
          v_labels := v_labels || v_label;
        END IF;
        IF v_f ->> 'type' = 'Table' THEN
          IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
            RAISE EXCEPTION 'Stage %: a table has 1 to 8 columns.', i + 1 USING ERRCODE = '22023';
          END IF;
          FOR j IN 0 .. jsonb_array_length(v_f -> 'cols') - 1 LOOP
            IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN 1 AND 40
               OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Checkbox', 'Date', 'Person') THEN
              RAISE EXCEPTION 'Stage %: name each column of a table (at most 40 characters).', i + 1 USING ERRCODE = '22023';
            END IF;
          END LOOP;
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', 'Table',
                      'cols', (SELECT jsonb_agg(jsonb_build_object('name', btrim(c ->> 'name'), 'type', c ->> 'type'))
                                 FROM jsonb_array_elements(v_f -> 'cols') c)));
        ELSE
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', v_f ->> 'type'));
        END IF;
      END LOOP;
    END IF;
    v_back := NULL;
    IF jsonb_typeof(v_st -> 'back') = 'number' THEN
      IF (v_st ->> 'back') !~ '^[0-9]{1,2}$' OR (v_st ->> 'back')::integer >= i THEN
        RAISE EXCEPTION 'Stage %: changes go back to an earlier stage.', i + 1 USING ERRCODE = '22023';
      END IF;
      v_back := (v_st ->> 'back')::integer;
    END IF;
    -- What the PIC reads of the stage on the link (②a-5 — a template's *What does PIC see on the link?*), when they
    -- approve it.
    v_ptext := CASE WHEN v_appr @> '[{"kind": "pic"}]'::jsonb THEN nullif(btrim(coalesce(v_st ->> 'picText', '')), '') END;
    IF length(coalesce(v_ptext, '')) > 120 THEN
      RAISE EXCEPTION 'Stage %: what the PIC reads — at most 120 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('name', v_name,
                 'dept', coalesce((SELECT left(regexp_replace(btrim(t.name), '\s+', ' ', 'g'), 80)
                                     FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id WHERE s.id = v_who), ''),
                 'who', v_who, 'sla', v_sla, 'appr', v_appr, 'form', v_form, 'back', v_back, 'picText', v_ptext));
  END LOOP;
  -- A stage the PIC approves needs the PIC named (②a-5); the PIC named, something of theirs to approve.
  IF v_picn > 0 AND v_pic IS NULL THEN
    RAISE EXCEPTION 'Name the PIC who approves on the link.' USING ERRCODE = '22023';
  END IF;
  IF v_pic IS NOT NULL AND NOT v_wait AND v_picn = 0 THEN
    RAISE EXCEPTION 'No stage asks the PIC — leave the PIC out.' USING ERRCODE = '22023';
  END IF;
  v_first := (v_clean -> 0 ->> 'who')::uuid;

  -- A recurring task's rule.
  IF p_kind = 'recurring' THEN
    IF jsonb_typeof(p_recur) IS DISTINCT FROM 'object' OR coalesce(p_recur ->> 'freq', '') NOT IN ('daily', 'weekly', 'monthly') THEN
      RAISE EXCEPTION 'Pick how often it repeats.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_recur ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (p_recur ->> 'start')::date < v_today THEN
      RAISE EXCEPTION 'Pick the day it starts — today or later.' USING ERRCODE = '22023';
    END IF;
    v_rule := jsonb_build_object('freq', p_recur ->> 'freq', 'start', (p_recur ->> 'start')::date);
    IF p_recur ->> 'freq' = 'weekly' THEN
      IF jsonb_typeof(p_recur -> 'days') IS DISTINCT FROM 'array' OR jsonb_array_length(p_recur -> 'days') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_recur -> 'days') d WHERE d !~ '^[1-7]$') THEN
        RAISE EXCEPTION 'Pick the days of the week.' USING ERRCODE = '22023';
      END IF;
      IF coalesce(p_recur ->> 'every', '1') NOT IN ('1', '2', '4') THEN
        RAISE EXCEPTION 'Every week, 2 weeks or 4 weeks.' USING ERRCODE = '22023';
      END IF;
      v_rule := v_rule || jsonb_build_object('every', coalesce(p_recur ->> 'every', '1')::integer,
                  'days', (SELECT jsonb_agg(DISTINCT d::integer ORDER BY d::integer) FROM jsonb_array_elements_text(p_recur -> 'days') d));
    ELSIF p_recur ->> 'freq' = 'monthly' THEN
      IF coalesce(p_recur ->> 'mday', '') NOT IN ('1', '15', 'last') THEN
        RAISE EXCEPTION 'The 1st, the 15th or the last day of the month.' USING ERRCODE = '22023';
      END IF;
      v_rule := v_rule || jsonb_build_object('mday', p_recur ->> 'mday');
    END IF;
    IF coalesce(p_recur ->> 'endMode', '') = 'date' THEN
      IF coalesce(p_recur ->> 'end', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (p_recur ->> 'end')::date < (p_recur ->> 'start')::date THEN
        RAISE EXCEPTION 'Pick the day it ends — not before it starts.' USING ERRCODE = '22023';
      END IF;
      v_rule := v_rule || jsonb_build_object('endMode', 'date', 'end', (p_recur ->> 'end')::date);
    ELSIF coalesce(p_recur ->> 'endMode', '') = 'count' THEN
      IF coalesce(p_recur ->> 'count', '') !~ '^[0-9]{1,2}$' OR (p_recur ->> 'count')::integer NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'After 1 to 60 runs.' USING ERRCODE = '22023';
      END IF;
      v_rule := v_rule || jsonb_build_object('endMode', 'count', 'count', (p_recur ->> 'count')::integer);
    ELSIF coalesce(p_recur ->> 'endMode', '') = 'never' THEN
      v_rule := v_rule || jsonb_build_object('endMode', 'never');
    ELSE
      RAISE EXCEPTION 'Pick when it ends.' USING ERRCODE = '22023';
    END IF;
    v_days := public.mkt_recur_days(v_rule, v_today + 400, 999);
    IF coalesce(array_length(v_days, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Pick at least one day inside the period.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Meeting minutes instead of what is written (2026-10-25 — the user's answers 52–55: a task is written as its
  -- requirements or with meeting minutes, on New Project there and then): a minutes template as it is published, its
  -- fields filled in — every required one — the people named on Marketing's team; whoever starts it signs there and then,
  -- when they attended and the minutes take signatures. Complete at once unless every attendee is to sign and somebody
  -- has not yet — then each signs on the task's page and the last signature completes them.
  IF p_minutes IS NOT NULL THEN
    IF jsonb_typeof(p_minutes) IS DISTINCT FROM 'object' OR coalesce(p_minutes ->> 'template', '') !~ v_uuid THEN
      RAISE EXCEPTION 'Pick the meeting minutes.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_tpl FROM public.mkt_minutes_templates WHERE id = (p_minutes ->> 'template')::uuid AND version > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Those meeting minutes are not published.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_mver FROM public.mkt_minutes_versions WHERE template_id = v_tpl.id AND version = v_tpl.version;
    IF jsonb_typeof(coalesce(p_minutes -> 'vals', '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not a set of answers.' USING ERRCODE = '22023';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(coalesce(p_minutes -> 'vals', '{}'::jsonb)) LOOP
      v_mf := (SELECT f FROM jsonb_array_elements(v_mver.fields) f WHERE f ->> 'name' = v_key LIMIT 1);
      IF v_mf IS NULL THEN
        RAISE EXCEPTION '"%" is not on these minutes.', v_key USING ERRCODE = '22023';
      END IF;
      v_mval := public.mkt_minutes_value(v_mf, p_minutes -> 'vals' -> v_key);
      IF v_mf ->> 'type' = 'People' AND v_mval IS NOT NULL
         AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_mval) x WHERE NOT (x::uuid = ANY (v_roster))) THEN
        RAISE EXCEPTION '"%": somebody who is not on the team.', v_key USING ERRCODE = '22023';
      END IF;
      IF v_mval IS NOT NULL THEN
        v_mvals := jsonb_set(v_mvals, ARRAY[v_key], v_mval);
      END IF;
    END LOOP;
    v_missing := public.mkt_minutes_missing(v_mver.fields, v_mvals);
    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'Still to fill in: %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
    END IF;
    v_mnotes := coalesce(p_minutes ->> 'notes', '');
    IF length(v_mnotes) > 4000 THEN
      RAISE EXCEPTION 'Meeting notes of at most 4000 characters.' USING ERRCODE = '22023';
    END IF;
    IF coalesce((p_minutes -> 'sign') = 'true'::jsonb, false) AND v_me IS NOT NULL
       AND v_me = ANY (public.mkt_minutes_attendees(v_mver.fields, v_mvals))
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_mver.fields) f WHERE f ->> 'type' = 'Signature') THEN
      v_msigned := jsonb_build_object(v_me::text, jsonb_build_object('at', now()));
    END IF;
    v_mdone := NOT (coalesce((v_mver.rules -> 'sign') = 'true'::jsonb, false)
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_mver.fields) f WHERE f ->> 'type' = 'Signature')
                    AND EXISTS (SELECT 1 FROM unnest(public.mkt_minutes_attendees(v_mver.fields, v_mvals)) a
                                 WHERE NOT (v_msigned ? a::text)));
    -- Sent to the PIC, they complete with the PIC's approval (②a-4).
    v_mdone := v_mdone AND NOT v_wait;
    -- The minutes are its requirements: nothing written beside them. A campaign period in them stays there — a campaign
    -- is a product project (answer 13; mkt_projects_campaign_check).
    v_brief := NULL;
  END IF;

  -- Opened from another project (answer 23): one there — a task, a run, a deliverable or a product project, never a
  -- series' pattern (its runs are the work).
  IF p_source IS NOT NULL THEN
    SELECT * INTO v_src FROM public.mkt_projects WHERE id = p_source;
    IF NOT FOUND OR (v_src.kind = 'recurring' AND v_src.series_id IS NULL) THEN
      RAISE EXCEPTION 'The project it is opened from is not there — open it from a task, a run or a product project.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_track := public.mkt_next_track(CASE p_kind WHEN 'quick' THEN 'TSK' ELSE 'RCR' END, v_sub.code);
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, q_type, brief, owner_staff, cur,
                                   starts_on, recur, created_by, source_id, pic_minutes, pic_name, pic_whatsapp, pic2_name,
                                   pic2_whatsapp, link_code, link2_code)
  VALUES (v_track, p_kind, v_sub.id, v_title, CASE WHEN v_wait THEN 'minutes' ELSE 'active' END, p_q_type, v_brief, v_me, 0,
          -- Waiting for the PIC (②a-4), a quick task starts the day its work does.
          CASE WHEN p_kind = 'quick' AND v_wait THEN NULL WHEN p_kind = 'quick' THEN v_today ELSE v_days[1] END,
          CASE WHEN p_kind = 'recurring' THEN jsonb_build_object('rule', v_rule, 'runs', to_jsonb(v_days), 'status', 'active') END,
          auth.uid(), v_src.id, v_wait, v_pic, v_wa, v_pic2, v_wa2,
          -- A stage the PIC approves (②a-5): their links from the start, the work theirs to follow — the minutes they
          -- approve bring them when sent.
          CASE WHEN v_picn > 0 AND NOT v_wait THEN replace(gen_random_uuid()::text, '-', '') END,
          CASE WHEN v_picn > 0 AND NOT v_wait AND v_pic2 IS NOT NULL THEN replace(gen_random_uuid()::text, '-', '') END)
  RETURNING id INTO v_id;

  -- Its meeting minutes (answers 52–55): the task's own — a recurring task's on its series, every run reading them.
  IF v_tpl.id IS NOT NULL THEN
    INSERT INTO public.mkt_minutes (project_id, template_id, template_version, intake, title, vals, signed, notes, status, locked,
                                    completed_at, completed_by, created_by, updated_by)
    VALUES (v_id, v_tpl.id, v_tpl.version, true, left(v_tpl.name, 80), v_mvals, v_msigned, v_mnotes,
            CASE WHEN v_mdone THEN 'completed' ELSE 'draft' END,
            v_mdone AND coalesce((v_mver.rules -> 'lock') = 'true'::jsonb, false),
            CASE WHEN v_mdone THEN now() END, CASE WHEN v_mdone THEN public.mkt_actor() END, auth.uid(), auth.uid());
  END IF;

  IF p_kind = 'quick' THEN
    INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, spec, starts_on, due_on,
                                   status, entered_at, accepted_at)
    SELECT v_id, d.idx, x.st ->> 'name', x.st ->> 'dept', 'person', (x.st ->> 'who')::uuid, (x.st ->> 'sla')::integer,
           x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back', 'picText', x.st -> 'picText')),
           -- Waiting for the PIC (②a-4): every stage planned and undated — dated the day its work starts.
           CASE WHEN NOT v_wait THEN d.starts_on END, CASE WHEN NOT v_wait THEN d.due_on END,
           CASE WHEN v_wait OR d.idx > 0 THEN 'planned' WHEN (x.st ->> 'who')::uuid = v_me THEN 'accepted' ELSE 'todo' END,
           CASE WHEN d.idx = 0 AND NOT v_wait THEN now() END,
           CASE WHEN d.idx = 0 AND NOT v_wait AND (x.st ->> 'who')::uuid = v_me THEN now() END
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n)
      JOIN public.mkt_stage_dates(v_today, ARRAY(SELECT (y ->> 'sla')::integer FROM jsonb_array_elements(v_clean) y)) d
        ON d.idx = x.n - 1;
    UPDATE public.mkt_projects SET due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_id)
     WHERE id = v_id;
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'quick', 'stages', v_n)
              || CASE WHEN v_wait THEN jsonb_build_object('pic', v_pic) ELSE '{}'::jsonb END
              || CASE WHEN v_picn > 0 THEN jsonb_build_object('picStages', jsonb_build_object('n', v_picn, 'pic', v_pic)) ELSE '{}'::jsonb END
              || CASE WHEN v_src.id IS NOT NULL THEN jsonb_build_object('from', v_src.track_id) ELSE '{}'::jsonb END
              || CASE WHEN v_tpl.id IS NOT NULL THEN jsonb_build_object('minutes', v_tpl.name) ELSE '{}'::jsonb END);
    IF v_tpl.id IS NOT NULL THEN
      IF v_msigned <> '{}'::jsonb THEN
        PERFORM public.mkt_log(v_id, 'signed', p_reason => left(v_tpl.name, 80));
      END IF;
      IF v_mdone THEN
        PERFORM public.mkt_log(v_id, 'minutes completed', p_reason => left(v_tpl.name, 80));
      END IF;
    END IF;
    IF NOT v_wait THEN
      PERFORM public.mkt_log(v_id, 'opened', 0, v_clean -> 0 ->> 'name', public.mkt_staff_name(v_first));
    END IF;
    v_open := v_id;
  ELSE
    -- The series keeps the stages each run copies, undated.
    INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, spec, status)
    SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', x.st ->> 'dept', 'person', (x.st ->> 'who')::uuid,
           (x.st ->> 'sla')::integer, x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back', 'picText', x.st -> 'picText')), 'planned'
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n);
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'recurring', 'stages', v_n, 'rule', v_rule)
              || CASE WHEN v_wait THEN jsonb_build_object('pic', v_pic) ELSE '{}'::jsonb END
              || CASE WHEN v_picn > 0 THEN jsonb_build_object('picStages', jsonb_build_object('n', v_picn, 'pic', v_pic)) ELSE '{}'::jsonb END
              || CASE WHEN v_src.id IS NOT NULL THEN jsonb_build_object('from', v_src.track_id) ELSE '{}'::jsonb END
              || CASE WHEN v_tpl.id IS NOT NULL THEN jsonb_build_object('minutes', v_tpl.name) ELSE '{}'::jsonb END);
    IF v_tpl.id IS NOT NULL THEN
      IF v_msigned <> '{}'::jsonb THEN
        PERFORM public.mkt_log(v_id, 'signed', p_reason => left(v_tpl.name, 80));
      END IF;
      IF v_mdone THEN
        PERFORM public.mkt_log(v_id, 'minutes completed', p_reason => left(v_tpl.name, 80));
      END IF;
    END IF;
    PERFORM public.mkt_series_top_up(v_id);
    v_open := coalesce((SELECT p.id FROM public.mkt_projects p WHERE p.series_id = v_id AND p.run_no = 1), v_id);
  END IF;

  -- Everybody on it hears, once, at the first stage they are on.
  PERFORM public.mkt_notify(o.who, v_id,
            'You''re on ' || CASE p_kind WHEN 'quick' THEN 'quick task' ELSE 'recurring task' END || ' "' || v_title || '"',
            'Stage ' || o.n || ' · ' || o.name || CASE WHEN v_wait THEN ' · starts once the PIC approves the minutes' ELSE '' END, 'task')
     FROM (SELECT DISTINCT ON ((x.st ->> 'who')::uuid) (x.st ->> 'who')::uuid AS who, x.n, x.st ->> 'name' AS name
             FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n)
            ORDER BY (x.st ->> 'who')::uuid, x.n) o
    WHERE o.who IS DISTINCT FROM v_me;
  -- …and the project it was opened from says so on its trail.
  IF v_src.id IS NOT NULL THEN
    PERFORM public.mkt_log(v_src.id, 'opened project', p_data => jsonb_build_object('id', v_id, 'track', v_track, 'title', v_title));
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_id, 'track', v_track, 'open', v_open);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_pic_work(p_project uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_p     public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_p.kind = 'product' THEN
    -- A product project's deliverables, once planned (②b-2d).
    RETURN QUERY SELECT d.id FROM public.mkt_projects d WHERE d.parent_id = v_p.id AND d.status NOT IN ('planning', 'cancelled');
  ELSIF v_p.kind = 'quick' THEN
    -- A quick task itself, once its work started (②a-4).
    RETURN QUERY SELECT v_p.id WHERE v_p.status IN ('active', 'paused', 'done');
  ELSIF v_p.kind = 'recurring' AND v_p.series_id IS NULL THEN
    -- A series' runs to two weeks ahead — the latest twenty; and any run waiting for the PIC's approval of a stage
    -- (②a-5), however far back.
    RETURN QUERY (SELECT r.id FROM public.mkt_projects r
                   WHERE r.series_id = v_p.id AND r.status <> 'cancelled' AND r.starts_on <= v_today + 14
                   ORDER BY r.run_no DESC LIMIT 20)
                 UNION
                 SELECT r.id FROM public.mkt_projects r JOIN public.mkt_stages s ON s.project_id = r.id AND s.idx = r.cur
                  WHERE r.series_id = v_p.id AND r.status = 'active' AND s.status = 'review'
                    AND s.appr -> s.appr_idx ->> 'kind' = 'pic';
  END IF;
END
$fn$;

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
  v_you   integer;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  -- Either PIC's own link (2026-10-24 — the user's answer 29); the second's only while they are on the project.
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND series_id IS NULL)) AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_you := CASE WHEN v_p.link_code = v_code THEN 1 ELSE 2 END;
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
      WHEN 'Campaign period' THEN CASE WHEN jsonb_typeof(v_v) = 'object' THEN jsonb_build_object('from', v_v -> 'from', 'to', v_v -> 'to') END
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
    -- A product project, a quick task or a recurring task (②a-4).
    'kind', v_p.kind,
    -- Which PIC holds this link, their name, and the other PIC's (names only).
    'you', v_you, 'pic', CASE v_you WHEN 2 THEN v_p.pic2_name ELSE v_p.pic_name END,
    'other', CASE v_you WHEN 2 THEN v_p.pic_name ELSE nullif(btrim(coalesce(v_p.pic2_name, '')), '') END,
    'owner', public.mkt_staff_name(v_p.owner_staff),
    'startedAt', v_p.created_at, 'sentAt', v_p.link_sent_at,
    'reply', v_p.pic_reply,
    -- Both PICs sign off the minutes (②b-2d-2b): whose approvals this sending has.
    'both', coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
    'ok', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
    'updated', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'edited after approval'
                    THEN jsonb_build_object('fields', v_last.reason, 'at', v_last.at,
                           -- Whose approval the edit took back (②b-2d-2b): this PIC's — or only the other's, named. An
                           -- edit from before there were two took back the one PIC's.
                           'mine', jsonb_typeof(v_last.data -> 'took') IS DISTINCT FROM 'array'
                                   OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_last.data -> 'took') t WHERE t ->> 'pic' = v_you::text),
                           'by', CASE WHEN jsonb_typeof(v_last.data -> 'took') = 'array'
                                      THEN (SELECT t ->> 'name' FROM jsonb_array_elements(v_last.data -> 'took') t
                                             WHERE t ->> 'pic' IS DISTINCT FROM v_you::text LIMIT 1) END) END,
    'asked', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'resent' AND v_p.pic_reply ->> 'decision' = 'changes'
                  THEN jsonb_build_object('reason', v_p.pic_reply ->> 'reason', 'at', v_p.pic_reply ->> 'at') END,
    -- A task's minutes the PIC does not approve stay the team's (②a-5): none on the link.
    'minutes', CASE WHEN v_p.kind = 'product' OR v_p.pic_minutes THEN jsonb_build_object('title', v_m.title, 'fields', v_out) END,
    -- The work (②b-2d; a task's since ②a-4 — mkt_pic_work): each deliverable planned, a quick task itself, a series' runs —
    -- where it stands — and the stage waiting for the PIC, with what they
    -- may see of it: its fields marked for the PIC (never a note, never one its section hides from them), its links;
    -- never the team's own notes. Their last answer on each.
    'work', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'title', d.title, 'status', d.status, 'startsOn', d.starts_on, 'dueOn', d.due_on,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object(
                           'idx', s.idx, 'name', s.name, 'status', s.status, 'dueOn', s.due_on, 'ver', s.ver,
                           -- Waiting for THIS PIC: a level asking both waits no longer for the one who approved — while
                           -- it still has two to ask (the other taken off, it waits for the one left again, never stuck).
                           'waiting', s.status = 'review' AND s.appr -> s.appr_idx ->> 'kind' = 'pic'
                                      AND NOT (coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                               AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                                               AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                                            AND s.pic_ok ? v_you::text, false)),
                           'both', s.appr -> s.appr_idx ->> 'kind' = 'pic' AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                   AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
                           'ok', CASE WHEN s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                      THEN s.pic_ok - 'ver' - 'lvl' END,
                           'note', nullif(btrim(coalesce(s.spec ->> 'picText', '')), ''),
                           'fields', CASE WHEN s.spec -> 'sec' ->> 'pic' = 'false' THEN '[]'::jsonb ELSE coalesce((
                              SELECT jsonb_agg(jsonb_build_object('name', f ->> 'label', 'type', f ->> 'type',
                                       'value', CASE WHEN f ->> 'type' = 'Person' AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                                     THEN to_jsonb(public.mkt_staff_name((s.work -> 'vals' ->> (f ->> 'label'))::uuid))
                                                     ELSE s.work -> 'vals' -> (f ->> 'label') END) ORDER BY x.o)
                                FROM jsonb_array_elements(coalesce(s.spec -> 'form', '[]'::jsonb)) WITH ORDINALITY AS x(f, o)
                               WHERE coalesce(f ->> 'pic', 'true') <> 'false' AND f ->> 'type' <> 'Note'), '[]'::jsonb) END,
                           'links', CASE WHEN jsonb_typeof(s.work -> 'links') = 'array' THEN s.work -> 'links' ELSE '[]'::jsonb END,
                           -- Its files (②b-2e): the stage's own Files, and a File field's when the PIC sees the field; each
                           -- opened through /t/<code>/f/<key> (mkt_pic_file), never by its path.
                           'files', coalesce((
                              SELECT jsonb_agg(jsonb_build_object('key', split_part(x.f ->> 'path', '/', 2), 'name', x.f ->> 'name',
                                       'size', x.f -> 'size', 'mime', x.f ->> 'mime', 'field', x.f ->> 'field') ORDER BY x.o)
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.work -> 'files') = 'array' THEN s.work -> 'files' ELSE '[]'::jsonb END)
                                     WITH ORDINALITY AS x(f, o)
                               WHERE public.mkt_pic_sees_file(s.spec, x.f ->> 'field')), '[]'::jsonb))
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur),
               'last', (SELECT jsonb_build_object('action', e.action, 'name', e.actor_name, 'reason', e.reason,
                                                  'stage', e.stage_name, 'version', e.version, 'at', e.at,
                                                  'pic', CASE WHEN e.data ->> 'pic' IN ('1', '2') THEN (e.data ->> 'pic')::integer END)
                          FROM public.mkt_events e
                         WHERE e.project_id = d.id AND e.action IN ('pic approved', 'pic changes') AND e.stage_idx IS NOT NULL
                         ORDER BY e.id DESC LIMIT 1))
             ORDER BY d.track_id)
        FROM public.mkt_projects d
       WHERE d.id IN (SELECT w FROM public.mkt_pic_work(v_p.id) w)), '[]'::jsonb));
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_pic_stage_answer(p_code text, p_project uuid, p_version integer, p_decision text,
  p_name text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code   text := lower(btrim(coalesce(p_code, '')));
  v_parent public.mkt_projects;
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_then   jsonb;
  v_back   integer;
  v_to     public.mkt_stages;
  v_name   text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_who    text;
  v_you    integer;
  v_ok     jsonb;
  v_other  text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND series_id IS NULL)) AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  v_you := CASE WHEN v_parent.link_code = v_code THEN 1 ELSE 2 END;
  -- The work the link follows (mkt_pic_work): a product project's deliverables — a task itself, a series' runs (②a-5).
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project AND id IN (SELECT w FROM public.mkt_pic_work(v_parent.id) w) FOR UPDATE;
  IF NOT FOUND OR v_p.status <> 'active' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF NOT FOUND OR v_s.status <> 'review' OR v_s.appr -> v_s.appr_idx ->> 'kind' IS DISTINCT FROM 'pic' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  IF p_version IS DISTINCT FROM v_s.ver THEN
    RAISE EXCEPTION 'The team sent a newer version since you opened this page — reload it to see.' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approve' THEN
    IF length(v_name) NOT BETWEEN 3 AND 80 THEN
      RAISE EXCEPTION 'Type your full name to sign off.' USING ERRCODE = '22023';
    END IF;
    v_who := left(v_name || ' (PIC)', 120);
    -- A level that asks both PICs, on a project with two (②b-2d-2b): the first approval is kept for this version at this
    -- level, and the stage waits for the other's.
    IF coalesce(v_s.appr -> v_s.appr_idx ->> 'all' = 'true', false) AND nullif(btrim(coalesce(v_parent.pic2_name, '')), '') IS NOT NULL THEN
      v_ok := CASE WHEN v_s.pic_ok ->> 'ver' = v_s.ver::text AND v_s.pic_ok ->> 'lvl' = v_s.appr_idx::text THEN v_s.pic_ok
                   ELSE jsonb_build_object('ver', v_s.ver, 'lvl', v_s.appr_idx) END;
      v_other := CASE v_you WHEN 1 THEN v_parent.pic2_name ELSE v_parent.pic_name END;
      IF v_ok ? v_you::text THEN
        RAISE EXCEPTION 'You approved this version already — it waits for %.', v_other USING ERRCODE = '22023';
      END IF;
      v_ok := v_ok || jsonb_build_object(v_you::text, jsonb_build_object('name', v_name, 'at', now()));
      UPDATE public.mkt_stages SET pic_ok = v_ok WHERE project_id = v_p.id AND idx = v_s.idx;
      IF NOT (v_ok ? (3 - v_you)::text) THEN
        INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version, data)
        VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80), left(v_other || ' (PIC)', 120), 'v' || v_s.ver,
                jsonb_build_object('pic', v_you, 'waiting', v_other));
        UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
        PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_name || ' (PIC) approved ' || v_s.name || ' — waiting for ' || v_other, 200),
                  v_p.track_id || ' · ' || v_p.title, 'pic_approved');
        RETURN public.mkt_pic_page(v_code);
      END IF;
    END IF;
    v_then := v_s.appr -> (v_s.appr_idx + 1);
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version, data)
    VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80),
            CASE WHEN v_then IS NULL THEN NULL WHEN v_then ->> 'kind' = 'pic' THEN 'PIC'
                 ELSE public.mkt_staff_name((v_then ->> 'staff')::uuid) END,
            'v' || v_s.ver, jsonb_build_object('pic', v_you));
    IF v_then IS NOT NULL THEN
      UPDATE public.mkt_stages SET appr_idx = appr_idx + 1 WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      IF v_then ->> 'kind' = 'person' THEN
        PERFORM public.mkt_notify((v_then ->> 'staff')::uuid, v_p.id,
                  public.mkt_staff_name(v_s.owner_staff) || ' submitted ' || v_s.name || ' v' || v_s.ver || ' for your approval',
                  v_p.track_id || ' · ' || v_p.title, 'review');
      END IF;
    ELSE
      PERFORM public.mkt_advance(v_p.id);
    END IF;
    PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_name || ' (PIC) approved ' || v_s.name, 200),
              v_p.track_id || ' · ' || v_p.title, 'pic_approved');
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 1,000 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := left(coalesce(nullif(left(v_name, 80), ''),
                           nullif(btrim(CASE v_you WHEN 2 THEN v_parent.pic2_name ELSE v_parent.pic_name END), ''), 'The PIC')
                  || ' (PIC)', 120);
    v_back := CASE WHEN jsonb_typeof(v_s.spec -> 'back') = 'number' THEN (v_s.spec ->> 'back')::integer END;
    IF v_back IS NOT NULL AND v_back < v_s.idx THEN
      -- Back to the stage the template named: it takes the changes; this one and those between wait for it again.
      SELECT * INTO v_to FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_back FOR UPDATE;
      UPDATE public.mkt_stages SET status = 'planned', appr_idx = 0, changes = NULL, done_at = NULL
       WHERE project_id = v_p.id AND idx > v_back AND idx <= v_s.idx;
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0, entered_at = now(), done_at = NULL,
             changes = jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(), 'ver', v_s.ver, 'from', v_s.name)
       WHERE project_id = v_p.id AND idx = v_back;
      UPDATE public.mkt_projects SET cur = v_back, updated_at = now() WHERE id = v_p.id;
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version, data)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_to.owner_staff), v_reason,
              'v' || v_s.ver, jsonb_build_object('back', v_back, 'to', v_to.name, 'pic', v_you));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                '"' || v_reason || '"', 'changes');
    ELSE
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0,
             changes = jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(), 'ver', v_s.ver)
       WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version, data)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_s.owner_staff), v_reason,
              'v' || v_s.ver, jsonb_build_object('pic', v_you));
      PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, 'Changes requested on ' || v_s.name, '"' || v_reason || '"', 'changes');
    END IF;
  ELSE
    RAISE EXCEPTION 'Approve, or say what should change.' USING ERRCODE = '22023';
  END IF;
  -- The deliverable's owner hears it too, when it is somebody else.
  IF v_p.owner_staff IS DISTINCT FROM v_s.owner_staff THEN
    PERFORM public.mkt_notify(v_p.owner_staff, v_p.id,
              left(CASE WHEN p_decision = 'approve' THEN v_name || ' (PIC) approved ' ELSE v_who || ' asked for changes on ' END || v_s.name, 200),
              v_p.track_id || ' · ' || v_p.title, CASE WHEN p_decision = 'approve' THEN 'pic_approved' ELSE 'pic_changes' END);
  END IF;
  RETURN public.mkt_pic_page(v_code);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_pic_stage_file(p_code text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_p    public.mkt_projects;
  v_out  jsonb;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' OR coalesce(p_key, '') !~ '^[0-9a-f-]{36}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND series_id IS NULL)) AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT x.f INTO v_out
    FROM public.mkt_projects d
    JOIN public.mkt_stages s ON s.project_id = d.id AND s.idx = d.cur
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.work -> 'files') = 'array' THEN s.work -> 'files' ELSE '[]'::jsonb END) AS x(f)
   WHERE d.id IN (SELECT w FROM public.mkt_pic_work(v_p.id) w)
     AND split_part(x.f ->> 'path', '/', 2) = p_key
     AND public.mkt_pic_sees_file(s.spec, x.f ->> 'field')
   LIMIT 1;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_pic_calendar(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := lower(btrim(coalesce(p_code, '')));
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_first date;
  v_from  date;
  v_to    date;
  v_s     public.mkt_subsidiaries;
  v_slot  integer;
  v_name  text;
  v_wa    text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE (cal_code = v_code OR cal2_code = v_code) AND active;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_slot := CASE WHEN v_s.cal_code = v_code THEN 1 ELSE 2 END;
  v_name := nullif(btrim(coalesce(CASE v_slot WHEN 1 THEN v_s.pic_name ELSE v_s.pic2_name END, '')), '');
  v_wa := public.mkt_wa_key(CASE v_slot WHEN 1 THEN v_s.pic_whatsapp ELSE v_s.pic2_whatsapp END);
  -- Open only while its PIC is still the subsidiary's: named, on the number it was made for.
  IF v_name IS NULL OR v_wa IS NULL OR v_wa IS DISTINCT FROM (CASE v_slot WHEN 1 THEN v_s.cal_wa ELSE v_s.cal2_wa END) THEN
    RETURN NULL;
  END IF;
  v_first := v_today - (extract(day FROM v_today)::integer - 1);
  v_from := (v_first - interval '1 month')::date;
  v_to := (v_first + interval '4 months')::date - 1;

  RETURN (
    -- The subsidiary's product projects sent to this PIC: which of their PICs it is, and its own link.
    WITH mine AS (
      SELECT p.id, p.title, p.status, p.campaign_from, p.campaign_until, p.link_sent_at, p.pic_ok, p.posted,
             CASE WHEN public.mkt_wa_key(p.pic_whatsapp) = v_wa THEN 1 ELSE 2 END AS you,
             CASE WHEN public.mkt_wa_key(p.pic_whatsapp) = v_wa THEN p.link_code ELSE p.link2_code END AS code,
             nullif(btrim(coalesce(p.pic2_name, '')), '') IS NOT NULL AS two
        FROM public.mkt_projects p
       WHERE p.subsidiary_id = v_s.id AND p.status NOT IN ('minutes', 'cancelled')
         -- …and its tasks with a link (②a-5): their stages' approvals and dates, a series' runs'.
         AND (p.kind = 'product' OR (p.kind IN ('quick', 'recurring') AND p.series_id IS NULL AND p.link_code IS NOT NULL))
         AND (public.mkt_wa_key(p.pic_whatsapp) = v_wa
              OR (nullif(btrim(coalesce(p.pic2_name, '')), '') IS NOT NULL AND public.mkt_wa_key(p.pic2_whatsapp) = v_wa))
    ),
    -- …and their deliverables planned, each with its product's link — a series' runs, with the series' (②a-5).
    tasks AS (
      SELECT m.id AS project, m.title AS product, m.title, m.status, m.posted, m.you, m.code, m.two FROM mine m
      UNION ALL
      SELECT d.id, m.title, d.title, d.status, d.posted, m.you, m.code, m.two
        FROM mine m JOIN public.mkt_projects d ON d.parent_id = m.id OR d.series_id = m.id
       WHERE d.status NOT IN ('planning', 'cancelled')
    )
    SELECT jsonb_build_object(
      'today', v_today, 'from', v_from, 'to', v_to,
      'sub', jsonb_build_object('name', v_s.name, 'dot', v_s.dot),
      'pic', v_name,
      -- Each date the canvas puts on the PIC's calendar, once filled; a post's mark — when, its link.
      'dates', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'day', s.work -> 'vals' ->> (f ->> 'label'), 'kind', f -> 'cal' ->> 'kind', 'field', f ->> 'label',
                 'title', t.title, 'product', t.product, 'code', t.code, 'done', t.status = 'done',
                 'posted', CASE WHEN jsonb_typeof(t.posted -> (s.idx::text || ':' || (f ->> 'label'))) = 'object'
                                THEN jsonb_build_object('at', t.posted -> (s.idx::text || ':' || (f ->> 'label')) ->> 'at',
                                                        'link', t.posted -> (s.idx::text || ':' || (f ->> 'label')) ->> 'link') END)
               ORDER BY s.work -> 'vals' ->> (f ->> 'label'), t.title, s.idx, f ->> 'label')
          FROM tasks t
          JOIN public.mkt_stages s ON s.project_id = t.project
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.spec -> 'form') = 'array' THEN s.spec -> 'form' ELSE '[]'::jsonb END) f
         WHERE f ->> 'type' = 'Date' AND jsonb_typeof(f -> 'cal') = 'object' AND (f -> 'cal' -> 'pic') = 'true'::jsonb
           AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           AND s.work -> 'vals' ->> (f ->> 'label') BETWEEN v_from::text AND v_to::text), '[]'::jsonb),
      -- Each stage with a PIC level still ahead (or waiting for them now), by its deadline — never one this PIC approved
      -- already on a level asking both.
      'approvals', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'day', s.due_on, 'title', t.title, 'product', t.product, 'stage', s.name, 'code', t.code,
                 'waiting', s.status = 'review' AND l.lvl = s.appr_idx)
               ORDER BY s.due_on, t.title, s.idx)
          FROM tasks t
          JOIN public.mkt_stages s ON s.project_id = t.project
          CROSS JOIN LATERAL (
            SELECT min(a.o)::integer - 1 AS lvl
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.appr) = 'array' THEN s.appr ELSE '[]'::jsonb END) WITH ORDINALITY AS a(v, o)
             WHERE a.v ->> 'kind' = 'pic' AND a.o - 1 >= CASE WHEN s.status = 'review' THEN coalesce(s.appr_idx, 0) ELSE 0 END) l
         WHERE t.status NOT IN ('done', 'paused') AND s.status <> 'done' AND l.lvl IS NOT NULL AND s.due_on IS NOT NULL
           AND NOT (s.status = 'review' AND l.lvl = s.appr_idx AND t.two
                    AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                    AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text AND s.pic_ok ? t.you::text, false))
           AND (s.due_on BETWEEN v_from AND v_to OR (s.status = 'review' AND l.lvl = s.appr_idx))), '[]'::jsonb),
      -- A product's intake minutes waiting for them — never once their approval of this sending is in.
      'minutes', coalesce((
        SELECT jsonb_agg(jsonb_build_object('title', m.title, 'code', m.code, 'sentAt', m.link_sent_at) ORDER BY m.link_sent_at, m.title)
          FROM mine m
         WHERE m.status = 'waiting_pic'
           AND NOT coalesce(m.pic_ok ->> 'sent' = (extract(epoch FROM m.link_sent_at))::text AND m.pic_ok ? m.you::text, false)), '[]'::jsonb),
      'campaigns', coalesce((
        SELECT jsonb_agg(jsonb_build_object('title', m.title, 'from', m.campaign_from, 'until', m.campaign_until, 'code', m.code)
                         ORDER BY m.campaign_from, m.campaign_until, m.title)
          FROM mine m
         WHERE m.campaign_from IS NOT NULL AND m.campaign_until IS NOT NULL
           AND m.campaign_from <= v_to AND m.campaign_until >= v_from), '[]'::jsonb),
      'holidays', coalesce((
        SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name) ORDER BY h.day, h.name)
          FROM (SELECT DISTINCT x.day, x.name FROM public.att_holidays x
                 WHERE x.deleted_at IS NULL AND x.day BETWEEN v_from AND v_to AND public.mkt_holiday_ok(x.states)) h), '[]'::jsonb))
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_project(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_key    text := btrim(coalesce(p_key, ''));
  v_p      public.mkt_projects;
  v_series uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_key::uuid;
  ELSE
    SELECT * INTO v_p FROM public.mkt_projects WHERE track_id = upper(v_key);
  END IF;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_series := coalesce(v_p.series_id, CASE WHEN v_p.kind = 'recurring' THEN v_p.id END);
  RETURN jsonb_build_object(
    'today', v_today,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'sub', (SELECT jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji,
                                      'client', x.company_id IS NULL, 'pic', x.pic_name)
              FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'project', jsonb_build_object(
      'id', v_p.id, 'trackId', v_p.track_id, 'kind', v_p.kind, 'sub', v_p.subsidiary_id, 'title', v_p.title,
      'status', v_p.status, 'workflow', v_p.workflow_name, 'qType', v_p.q_type, 'brief', v_p.brief,
      'owner', v_p.owner_staff,
      -- A run's PICs are its series' (②a-5).
      'pic', CASE WHEN v_p.series_id IS NULL THEN v_p.pic_name ELSE (SELECT x.pic_name FROM public.mkt_projects x WHERE x.id = v_p.series_id) END,
      'pic2', CASE WHEN v_p.series_id IS NULL THEN v_p.pic2_name ELSE (SELECT x.pic2_name FROM public.mkt_projects x WHERE x.id = v_p.series_id) END,
      'cur', v_p.cur, 'series', v_p.series_id, 'run', v_p.run_no,
      'recur', v_p.recur, 'startsOn', v_p.starts_on, 'dueOn', v_p.due_on, 'createdAt', v_p.created_at,
      'createdBy', (SELECT u.name FROM public.users u WHERE u.id = v_p.created_by),
      'updatedAt', v_p.updated_at, 'doneAt', v_p.done_at,
      -- Its posts marked posted (④-2c — answer 15): "<stage>:<field>" → when, by whom, the link.
      'posted', v_p.posted,
      'free', CASE WHEN jsonb_typeof(v_p.canvas -> 'free') = 'array' THEN v_p.canvas -> 'free' ELSE '[]'::jsonb END,
      -- A deliverable (②b-2a): its product project, what it is of it, whether its template is locked.
      'parent', (SELECT jsonb_build_object('id', x.id, 'trackId', x.track_id, 'title', x.title, 'status', x.status)
                   FROM public.mkt_projects x WHERE x.id = v_p.parent_id),
      -- The project it was opened from (answer 23) — a run, its series'.
      'source', (SELECT jsonb_build_object('id', x.id, 'trackId', x.track_id, 'title', x.title, 'kind', x.kind, 'status', x.status,
                                     'owner', public.mkt_staff_name(x.owner_staff))
                   FROM public.mkt_projects x
                  WHERE x.id = coalesce(v_p.source_id, (SELECT r.source_id FROM public.mkt_projects r WHERE r.id = v_p.series_id))),
      'deliv', v_p.deliv,
      -- Its minutes go to the PIC (②a-4): where that stands — the PICs, their links, the last answer, an override, an edit
      -- that sent them back. A run's, its series'.
      'picMinutes', (SELECT jsonb_build_object(
                       'status', x.status, 'pic', x.pic_name, 'whatsapp', x.pic_whatsapp, 'pic2', x.pic2_name,
                       'whatsapp2', x.pic2_whatsapp, 'link', x.link_code, 'link2', x.link2_code, 'sentAt', x.link_sent_at,
                       'reply', x.pic_reply, 'override', x.override,
                       'ok', CASE WHEN x.pic_ok ->> 'sent' = (extract(epoch FROM x.link_sent_at))::text THEN x.pic_ok - 'sent' END,
                       'edited', CASE WHEN x.status = 'waiting_pic' THEN (
                                   SELECT CASE WHEN e.action = 'edited after approval' THEN coalesce(nullif(e.reason, ''), 'The minutes') END
                                     FROM public.mkt_events e
                                    WHERE e.project_id = x.id AND e.action IN ('link sent', 'resent', 'edited after approval')
                                    ORDER BY e.id DESC LIMIT 1) END)
                       FROM public.mkt_projects x WHERE x.id = coalesce(v_p.series_id, v_p.id) AND x.pic_minutes),
      -- Its stages ask the PIC on their link (②a-5) and its minutes do not: the PICs and their links. A run's, its series'.
      'picLink', (SELECT jsonb_build_object('pic', x.pic_name, 'whatsapp', x.pic_whatsapp, 'pic2', x.pic2_name,
                                            'whatsapp2', x.pic2_whatsapp, 'link', x.link_code, 'link2', x.link2_code)
                    FROM public.mkt_projects x
                   WHERE x.id = coalesce(v_p.series_id, v_p.id) AND x.kind IN ('quick', 'recurring') AND NOT x.pic_minutes
                     AND x.link_code IS NOT NULL),
      'locked', coalesce((SELECT wv.locked FROM public.mkt_workflow_versions wv
                           WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false)),
    'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'project', s.project_id, 'idx', s.idx, 'name', s.name, 'dept', s.dept, 'mode', s.mode,
                           'owner', s.owner_staff, 'extra', s.extra, 'cands', to_jsonb(s.cands), 'sla', s.sla,
                           'appr', s.appr, 'split', s.split, 'spec', s.spec, 'work', s.work, 'startsOn', s.starts_on,
                           'dueOn', s.due_on, 'status', s.status, 'apprIdx', s.appr_idx, 'ver', s.ver,
                           'changes', s.changes, 'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at,
                           'picOk', CASE WHEN s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                         THEN s.pic_ok - 'ver' - 'lvl' END,
                           'submittedAt', s.submitted_at, 'doneAt', s.done_at) ORDER BY s.idx)
                          FROM public.mkt_stages s WHERE s.project_id = v_p.id), '[]'::jsonb),
    'subtasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', t.id, 'project', t.project_id, 'stage', t.stage_idx, 'title', t.title,
                             'assignee', t.assignee, 'dueOn', t.due_on, 'status', t.status, 'returns', t.returns,
                             'delivery', CASE WHEN t.delivery = '{}'::jsonb THEN NULL ELSE t.delivery END,
                             'by', t.created_by, 'createdAt', t.created_at, 'updatedAt', t.updated_at)
                           ORDER BY t.created_at, t.id)
                            FROM public.mkt_subtasks t WHERE t.project_id = v_p.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'id', e.id, 'at', e.at, 'actor', e.actor_name, 'action', e.action, 'stage', e.stage_idx,
                           'stageName', e.stage_name, 'fromTo', e.from_to, 'reason', e.reason, 'version', e.version,
                           'data', e.data) ORDER BY e.at, e.id)
                          FROM public.mkt_events e WHERE e.project_id = v_p.id), '[]'::jsonb),
    -- Its meeting minutes (2026-10-25 — answers 52–55): a task's own, a run's its series' — with the template they follow.
    'minutes', (SELECT jsonb_build_object(
                  'id', m.id, 'project', m.project_id, 'title', m.title, 'intake', m.intake, 'status', m.status, 'locked', m.locked,
                  'rev', m.rev, 'vals', m.vals, 'signed', m.signed, 'notes', m.notes, 'completedAt', m.completed_at,
                  'completedBy', m.completed_by, 'updatedAt', m.updated_at,
                  'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = m.updated_by),
                  'template', jsonb_build_object('id', m.template_id, 'version', m.template_version,
                                                 'name', (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = m.template_id),
                                                 'fields', mv.fields, 'rules', mv.rules))
                  FROM public.mkt_minutes m
                  JOIN public.mkt_minutes_versions mv ON mv.template_id = m.template_id AND mv.version = m.template_version
                 WHERE v_p.kind IN ('quick', 'recurring') AND m.project_id = coalesce(v_p.series_id, v_p.id) AND m.intake),
    'series', CASE WHEN v_series IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('id', s.id, 'trackId', s.track_id, 'title', s.title, 'status', s.status,
               'recur', s.recur, 'owner', s.owner_staff,
               'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'run', r.run_no, 'trackId', r.track_id,
                                          'status', r.status, 'startsOn', r.starts_on, 'dueOn', r.due_on, 'cur', r.cur,
                                          'stage', (SELECT x.status FROM public.mkt_stages x WHERE x.project_id = r.id AND x.idx = r.cur))
                                        ORDER BY r.run_no)
                                   FROM public.mkt_projects r WHERE r.series_id = s.id), '[]'::jsonb))
        FROM public.mkt_projects s WHERE s.id = v_series) END,
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
END
$fn$;

-- mkt_task_create's new signature: the app's, as its old one was.
REVOKE ALL ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
