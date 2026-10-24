-- 20261025201000_marketing_opened_from.sql
-- 2026-10-25 — Marketing ④-4c: a project opened from inside another (the user's answer 23 — "Both": a project may be
-- opened from inside another, its source kept and a line on the map; `Task Map.dc.html`'s first station, *Requested* —
-- "Opened from Social Media project", "Jason opened MKT-2990-2610-018 from the Social Media project").
--   The source   mkt_projects.source_id — the project it was opened from: a task, a run, a deliverable or a product
--                project, never a series' pattern; gone with it, the link only (ON DELETE SET NULL).
--   Opened       mkt_task_create and mkt_product_start (production's bodies) take p_source: the new project keeps it,
--                its 'created' record names it (`from`), and the source's trail gets 'opened project' — its id, Track
--                ID and title.
--   Read         mkt_project and mkt_product_project (production's bodies) give `source` — its id, Track ID, title, kind,
--                where it stands and whose it is; a run its series'.
-- The PIC sees none of it. PGlite: tests/member-sql/validate-marketing-opened-from.mjs.

-- ── The project a project was opened from ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.mkt_projects(id) ON DELETE SET NULL;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_source_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_source_check CHECK (source_id IS DISTINCT FROM id);
CREATE INDEX IF NOT EXISTS mkt_projects_source ON public.mkt_projects (source_id) WHERE source_id IS NOT NULL;

-- The two that make a project take where it was opened from — re-made with the parameter (an old call without it still
-- names its arguments and opens from nowhere).
DROP FUNCTION IF EXISTS public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.mkt_product_start(uuid, uuid, numeric);

-- ── A task started — production's body, opened from another ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_task_create(p_subsidiary uuid, p_kind text, p_title text, p_q_type text,
  p_brief text, p_stages jsonb, p_recur jsonb DEFAULT NULL, p_source uuid DEFAULT NULL)
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
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('name', v_name,
                 'dept', coalesce((SELECT left(regexp_replace(btrim(t.name), '\s+', ' ', 'g'), 80)
                                     FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id WHERE s.id = v_who), ''),
                 'who', v_who, 'sla', v_sla, 'appr', v_appr, 'form', v_form, 'back', v_back));
  END LOOP;
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
                                   starts_on, recur, created_by, source_id)
  VALUES (v_track, p_kind, v_sub.id, v_title, 'active', p_q_type, v_brief, v_me, 0,
          CASE WHEN p_kind = 'quick' THEN v_today ELSE v_days[1] END,
          CASE WHEN p_kind = 'recurring' THEN jsonb_build_object('rule', v_rule, 'runs', to_jsonb(v_days), 'status', 'active') END,
          auth.uid(), v_src.id)
  RETURNING id INTO v_id;

  IF p_kind = 'quick' THEN
    INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, spec, starts_on, due_on,
                                   status, entered_at, accepted_at)
    SELECT v_id, d.idx, x.st ->> 'name', x.st ->> 'dept', 'person', (x.st ->> 'who')::uuid, (x.st ->> 'sla')::integer,
           x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back')), d.starts_on, d.due_on,
           CASE WHEN d.idx > 0 THEN 'planned' WHEN (x.st ->> 'who')::uuid = v_me THEN 'accepted' ELSE 'todo' END,
           CASE WHEN d.idx = 0 THEN now() END,
           CASE WHEN d.idx = 0 AND (x.st ->> 'who')::uuid = v_me THEN now() END
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n)
      JOIN public.mkt_stage_dates(v_today, ARRAY(SELECT (y ->> 'sla')::integer FROM jsonb_array_elements(v_clean) y)) d
        ON d.idx = x.n - 1;
    UPDATE public.mkt_projects SET due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_id)
     WHERE id = v_id;
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'quick', 'stages', v_n)
              || CASE WHEN v_src.id IS NOT NULL THEN jsonb_build_object('from', v_src.track_id) ELSE '{}'::jsonb END);
    PERFORM public.mkt_log(v_id, 'opened', 0, v_clean -> 0 ->> 'name', public.mkt_staff_name(v_first));
    v_open := v_id;
  ELSE
    -- The series keeps the stages each run copies, undated.
    INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, spec, status)
    SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', x.st ->> 'dept', 'person', (x.st ->> 'who')::uuid,
           (x.st ->> 'sla')::integer, x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back')), 'planned'
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n);
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'recurring', 'stages', v_n, 'rule', v_rule)
              || CASE WHEN v_src.id IS NOT NULL THEN jsonb_build_object('from', v_src.track_id) ELSE '{}'::jsonb END);
    PERFORM public.mkt_series_top_up(v_id);
    v_open := coalesce((SELECT p.id FROM public.mkt_projects p WHERE p.series_id = v_id AND p.run_no = 1), v_id);
  END IF;

  -- Everybody on it hears, once, at the first stage they are on.
  PERFORM public.mkt_notify(o.who, v_id,
            'You''re on ' || CASE p_kind WHEN 'quick' THEN 'quick task' ELSE 'recurring task' END || ' "' || v_title || '"',
            'Stage ' || o.n || ' · ' || o.name, 'task')
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

-- ── A product project started — production's body, opened from another ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_start(p_sub uuid, p_product uuid, p_amount numeric DEFAULT NULL, p_source uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_sub    public.mkt_subsidiaries;
  v_ver    integer;
  v_pv     public.mkt_product_versions;
  v_mv     public.mkt_minutes_versions;
  v_tname  text;
  v_att    text;
  v_track  text;
  v_id     uuid;
  v_min    uuid;
  v_amount numeric;
  v_src    public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting a product project is the manager''s.');
  SELECT * INTO v_sub FROM public.mkt_subsidiaries WHERE id = p_sub AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick who the project is for.' USING ERRCODE = '22023';
  END IF;
  v_ver := public.mkt_product_in_effect(p_product);
  IF v_ver IS NULL THEN
    RAISE EXCEPTION 'That product is not on sale today.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = p_product AND version = v_ver;
  -- Its amount (②b-2b — the user's answer 43: typed when it is made, a quote): the product's list price unless another
  -- is given — a one-time project's whole, a recurring one's every month.
  v_amount := coalesce(p_amount, v_pv.price);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount >= 10000000000000 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'An amount in ringgit above zero, at most two decimals.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_pv.intake_id AND version = v_pv.intake_version;
  v_tname := (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = v_pv.intake_id);
  v_att := (SELECT f ->> 'name' FROM jsonb_array_elements(v_mv.fields) f
             WHERE f ->> 'type' = 'People' AND coalesce((f -> 'lock') = 'true'::jsonb, false) LIMIT 1);

  -- Opened from another project (answer 23): one there — a task, a run, a deliverable or a product project, never a
  -- series' pattern (its runs are the work).
  IF p_source IS NOT NULL THEN
    SELECT * INTO v_src FROM public.mkt_projects WHERE id = p_source;
    IF NOT FOUND OR (v_src.kind = 'recurring' AND v_src.series_id IS NULL) THEN
      RAISE EXCEPTION 'The project it is opened from is not there — open it from a task, a run or a product project.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_track := public.mkt_next_track('MKT', v_sub.code);
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version, owner_staff,
                                   pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, created_by, bill_amount, source_id)
  VALUES (v_track, 'product', v_sub.id, left(v_sub.name || ' · ' || v_pv.name || ' · ' || to_char(v_today, 'Mon YYYY'), 140),
          'minutes', p_product, v_ver, v_me, v_sub.pic_name, v_sub.pic_whatsapp, v_sub.pic2_name, v_sub.pic2_whatsapp, auth.uid(), v_amount, v_src.id)
  RETURNING id INTO v_id;
  -- Whoever starts it attends the meeting.
  INSERT INTO public.mkt_minutes (project_id, template_id, template_version, intake, title, vals, created_by, updated_by)
  VALUES (v_id, v_pv.intake_id, v_pv.intake_version, true, left(coalesce(v_tname, 'Meeting minutes'), 80),
          CASE WHEN v_me IS NOT NULL AND v_att IS NOT NULL THEN jsonb_build_object(v_att, jsonb_build_array(v_me)) ELSE '{}'::jsonb END,
          auth.uid(), auth.uid())
  RETURNING id INTO v_min;
  PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('product', v_pv.name, 'version', v_ver)
            || CASE WHEN v_src.id IS NOT NULL THEN jsonb_build_object('from', v_src.track_id) ELSE '{}'::jsonb END);
  -- …and the project it was opened from says so on its trail.
  IF v_src.id IS NOT NULL THEN
    PERFORM public.mkt_log(v_src.id, 'opened project', p_data => jsonb_build_object('id', v_id, 'track', v_track, 'title', left(v_sub.name || ' · ' || v_pv.name || ' · ' || to_char(v_today, 'Mon YYYY'), 140)));
  END IF;
  RETURN jsonb_build_object('id', v_id, 'track', v_track, 'minutes', v_min);
END
$fn$;

-- ── A task's page — production's body, where it was opened from ─────────────────────────────────────────────────────
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
      'owner', v_p.owner_staff, 'pic', v_p.pic_name, 'pic2', v_p.pic2_name, 'cur', v_p.cur, 'series', v_p.series_id, 'run', v_p.run_no,
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

-- ── A product project's page — production's body, where it was opened from ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_project(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_key, ''));
  v_p   public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_key::uuid;
  ELSE
    SELECT * INTO v_p FROM public.mkt_projects WHERE track_id = upper(v_key);
  END IF;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'sub', (SELECT jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji,
                                      'client', x.company_id IS NULL, 'pic', x.pic_name)
              FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'project', jsonb_build_object(
      'id', v_p.id, 'track', v_p.track_id, 'title', v_p.title, 'status', v_p.status, 'owner', v_p.owner_staff,
      'ownerName', public.mkt_staff_name(v_p.owner_staff), 'pic', v_p.pic_name, 'whatsapp', v_p.pic_whatsapp,
      'pic2', v_p.pic2_name, 'whatsapp2', v_p.pic2_whatsapp, 'link2', v_p.link2_code,
      'picOk', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
      'link', v_p.link_code, 'linkSentAt', v_p.link_sent_at, 'picReply', v_p.pic_reply, 'override', v_p.override,
      'createdAt', v_p.created_at,
      -- The project it was opened from (answer 23).
      'source', (SELECT jsonb_build_object('id', x.id, 'trackId', x.track_id, 'title', x.title, 'kind', x.kind, 'status', x.status,
                                     'owner', public.mkt_staff_name(x.owner_staff))
                   FROM public.mkt_projects x WHERE x.id = v_p.source_id),
      -- A campaign's run period (answer 13), from its intake minutes.
      'campaign', CASE WHEN v_p.campaign_from IS NOT NULL THEN jsonb_build_object('from', v_p.campaign_from, 'until', v_p.campaign_until) END,
      -- Its months (②b-2f): the run day, the first month, how many made, the month it stops — the work's, not money.
      'runs', CASE WHEN v_p.run_day IS NOT NULL THEN jsonb_build_object('day', v_p.run_day, 'first', v_p.bill_from,
                'made', public.mkt_product_runs_made(v_p.id), 'until', v_p.bill_until,
                -- The next run (②b-2g): the one after the last made — or, resumed, this month's.
                'next', greatest(public.mkt_product_runs_made(v_p.id) + 1, coalesce(v_p.run_from, 1))) END,
      'product', (SELECT jsonb_build_object('id', pv.product_id, 'version', pv.version, 'name', pv.name, 'kind', pv.kind,
                                            'note', pv.note)
                    FROM public.mkt_product_versions pv WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version)),
    -- Its billing (②b-2b), the manager's: the amount, a recurring one's months, what was confirmed.
    'bill', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage']), false) THEN jsonb_build_object(
              'amount', v_p.bill_amount, 'from', v_p.bill_from, 'until', v_p.bill_until,
              'confirmed', (SELECT count(*) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed'),
              'last', (SELECT max(b.month) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed')) END,
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'title', m.title, 'intake', m.intake, 'status', m.status, 'locked', m.locked, 'rev', m.rev,
               'vals', m.vals, 'signed', m.signed, 'notes', m.notes, 'completedAt', m.completed_at, 'completedBy', m.completed_by,
               'updatedAt', m.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = m.updated_by),
               'template', jsonb_build_object('id', m.template_id, 'version', m.template_version,
                                              'name', (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = m.template_id),
                                              'fields', mv.fields, 'rules', mv.rules))
             ORDER BY m.intake DESC, m.created_at, m.id)
        FROM public.mkt_minutes m
        JOIN public.mkt_minutes_versions mv ON mv.template_id = m.template_id AND mv.version = m.template_version
       WHERE m.project_id = v_p.id), '[]'::jsonb),
    'trail', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor_name, 'action', e.action, 'reason', e.reason,
                                          'data', e.data) ORDER BY e.id DESC)
        FROM (SELECT * FROM public.mkt_events WHERE project_id = v_p.id ORDER BY id DESC LIMIT 40) e), '[]'::jsonb),
    -- Its deliverables (②b-2a): each with where it stands — its stage now and whose, how many of its stages are done.
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'trackId', d.track_id, 'title', d.title, 'status', d.status, 'cur', d.cur, 'deliv', d.deliv,
               'workflow', d.workflow_name, 'startsOn', d.starts_on, 'dueOn', d.due_on, 'doneAt', d.done_at,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object('idx', s.idx, 'name', s.name, 'status', s.status, 'owner', s.owner_staff,
                                                   'dueOn', s.due_on)
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur))
             ORDER BY d.track_id)
        FROM public.mkt_projects d WHERE d.parent_id = v_p.id), '[]'::jsonb));
END
$fn$;

-- ── Who may call what — as the two they replace ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mkt_product_start(uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_start(uuid, uuid, numeric, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
