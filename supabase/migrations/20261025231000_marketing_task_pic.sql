-- 20261025231000_marketing_task_pic.sql
-- 2026-10-25 — Marketing ②a-4: the PIC approves a task's meeting minutes. The user's answers 52 ("两个都可以" — the PIC
-- approves a task's minutes on the link, as a product project's intake, chosen on the task: "可以选择到底是要给 PIC approve，
-- 还是不要给 PIC approve") and 53 ("要等（同产品项目）" — its first stage waits, as a product project's work does; the
-- manager may start before approval). A quick task's stage the PIC approves comes next (②a-5).
--   Chosen       mkt_projects.pic_minutes — the task's minutes go to the PIC: a quick task, or a recurring task's series
--                (its runs read it), never a product project (its template's rule decides) or a run.
--   Started      mkt_task_create(…, p_minutes) — production's body (20261025221000's): p_minutes.pic { name, whatsapp,
--                name2, whatsapp2 } — the PIC (1–80) and their WhatsApp (8 digits at least: the link goes to them), a
--                second PIC on their own link — refused before anything is written or numbered. The task waits
--                ('minutes'): every stage planned and undated, nobody's turn; its minutes complete with the PIC's approval,
--                never at once nor with the last signature. A recurring task's series makes no run while it waits.
--   Sent         mkt_minutes_send(minutes, rev) — production's body: a task's minutes the PIC approves go to them as a product
--                project's intake (the link, the WhatsApp, each signature first) — its owner's to send too, else the manager's.
--   Answered     mkt_pic_page(code), mkt_pic_answer(code, …) — production's bodies: a task's link as a product project's;
--                approved, the task's work starts (mkt_task_begin). The work the PIC follows (mkt_pic_work): a product
--                project's deliverables, as before; a quick task itself once its work started; a series' runs to two weeks
--                ahead, the latest twenty. mkt_pic_stage_file — production's body — opens the files of that work.
--   Resent       mkt_project_resend(project) — production's body: a task's too, its owner's or the manager's.
--   Overridden   mkt_project_override(project, reason) — production's body: a task's, the manager's — its work starts
--                that day (a product project's still waits for Plan assignments).
--   Begun        mkt_task_begin(project, by) — new, called by the two above only: a quick task's stages dated from today,
--                the first one's person up (accepted when it is the task's owner) and told; a series' runs made from
--                today — one whose day went by while it waited opens today. 'work started' and 'opened' on the trail.
--   Written      mkt_minutes_fill(minutes, rev, patch) — production's body: a task's PIC set only when the PIC approves its
--                minutes; an edit the PIC sees after an approval sends them back as a product project's (the task's
--                choice, not the template's rule).
--   Signed       mkt_minutes_sign(minutes) — production's body: a task's minutes the PIC approves never complete with a
--                signature.
--   Read         mkt_project(key) — production's body: + 'picMinutes', where the PIC's approval stands — a run's its
--                series'.
-- PGlite: tests/member-sql/validate-marketing-task-pic.mjs.

ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS pic_minutes boolean NOT NULL DEFAULT false;
DO $do$
BEGIN
  ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_pic_minutes_check
    CHECK (NOT pic_minutes OR (kind IN ('quick', 'recurring') AND series_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$do$;

-- ── The work a PIC follows on their link ─────────────────────────────────────────────────────────────────────────
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
    -- A series' runs to two weeks ahead — the latest twenty.
    RETURN QUERY SELECT r.id FROM public.mkt_projects r
                  WHERE r.series_id = v_p.id AND r.status <> 'cancelled' AND r.starts_on <= v_today + 14
                  ORDER BY r.run_no DESC LIMIT 20;
  END IF;
END
$fn$;

-- ── A task's work starts: the PIC approved its minutes, or the manager started before approval ──────────────────────
CREATE OR REPLACE FUNCTION public.mkt_task_begin(p_project uuid, p_by text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_by    text := left(coalesce(nullif(btrim(coalesce(p_by, '')), ''), 'Someone'), 120);
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_days  date[];
  v_k     integer := 1;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind NOT IN ('quick', 'recurring') OR v_p.series_id IS NOT NULL
     OR v_p.status NOT IN ('minutes', 'waiting_pic', 'changes') THEN
    RETURN;
  END IF;
  IF v_p.kind = 'quick' THEN
    -- Its stages dated from today, as a task started today; the first one's person up — accepted when it is the task's
    -- owner, as a task's own first stage is.
    UPDATE public.mkt_stages s
       SET starts_on = d.starts_on, due_on = d.due_on,
           status = CASE WHEN s.idx > 0 THEN 'planned' WHEN s.owner_staff = v_p.owner_staff THEN 'accepted' ELSE 'todo' END,
           entered_at = CASE WHEN s.idx = 0 THEN now() END,
           accepted_at = CASE WHEN s.idx = 0 AND s.owner_staff = v_p.owner_staff THEN now() END
      FROM public.mkt_stage_dates(v_today, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = v_p.id ORDER BY x.idx)) d
     WHERE s.project_id = v_p.id AND d.idx = s.idx;
    UPDATE public.mkt_projects
       SET status = 'active', cur = 0, starts_on = v_today,
           due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_p.id), updated_at = now()
     WHERE id = v_p.id;
    SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = 0;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, data)
    VALUES (v_p.id, auth.uid(), v_by, 'work started', jsonb_build_object('stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = v_p.id)));
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to)
    VALUES (v_p.id, auth.uid(), v_by, 'opened', 0, left(v_s.name, 80), left(public.mkt_staff_name(v_s.owner_staff), 200));
    IF v_s.owner_staff IS NOT NULL THEN
      PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, 'Your turn: ' || v_s.name, v_p.track_id || ' · ' || v_p.title, 'open');
    END IF;
  ELSE
    -- A series: its runs, made as its top-up makes them — from today: one whose day went by while it waited opens today.
    v_days := public.mkt_recur_days(v_p.recur -> 'rule', v_today + 400, 999);
    UPDATE public.mkt_projects SET status = 'active', recur = jsonb_set(recur, '{runs}', to_jsonb(v_days)), updated_at = now()
     WHERE id = v_p.id;
    WHILE v_k <= coalesce(array_length(v_days, 1), 0) AND v_days[v_k] <= v_today + 60 LOOP
      PERFORM public.mkt_run_make(v_p.id, v_k, greatest(v_days[v_k], v_today));
      v_k := v_k + 1;
    END LOOP;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, data)
    VALUES (v_p.id, auth.uid(), v_by, 'work started', jsonb_build_object('runs', v_k - 1));
  END IF;
END
$fn$;


-- ── Changed from production's bodies ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_task_create(p_subsidiary uuid, p_kind text, p_title text, p_q_type text,
  p_brief text, p_stages jsonb, p_recur jsonb DEFAULT NULL, p_source uuid DEFAULT NULL, p_minutes jsonb DEFAULT NULL)
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
    -- The PIC approves them when the task asks it (②a-4 — the user's answers 52, 53: "可以选择到底是要给 PIC approve，还是
    -- 不要给 PIC approve"; then its first stage waits, as a product project's work does): the PIC named — New Project
    -- fills in the subsidiary's — and their WhatsApp, where the link goes; a second PIC on their own link.
    IF jsonb_typeof(p_minutes -> 'pic') = 'object' THEN
      v_pic := nullif(btrim(coalesce(p_minutes -> 'pic' ->> 'name', '')), '');
      v_wa := nullif(btrim(coalesce(p_minutes -> 'pic' ->> 'whatsapp', '')), '');
      v_pic2 := nullif(btrim(coalesce(p_minutes -> 'pic' ->> 'name2', '')), '');
      v_wa2 := nullif(btrim(coalesce(p_minutes -> 'pic' ->> 'whatsapp2', '')), '');
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
      v_wait := true;
    ELSIF coalesce(jsonb_typeof(p_minutes -> 'pic'), 'null') <> 'null' THEN
      RAISE EXCEPTION 'Name the PIC, or leave the PIC out.' USING ERRCODE = '22023';
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
                                   pic2_whatsapp)
  VALUES (v_track, p_kind, v_sub.id, v_title, CASE WHEN v_wait THEN 'minutes' ELSE 'active' END, p_q_type, v_brief, v_me, 0,
          -- Waiting for the PIC (②a-4), a quick task starts the day its work does.
          CASE WHEN p_kind = 'quick' AND v_wait THEN NULL WHEN p_kind = 'quick' THEN v_today ELSE v_days[1] END,
          CASE WHEN p_kind = 'recurring' THEN jsonb_build_object('rule', v_rule, 'runs', to_jsonb(v_days), 'status', 'active') END,
          auth.uid(), v_src.id, v_wait, v_pic, v_wa, v_pic2, v_wa2)
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
           x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back')),
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
           (x.st ->> 'sla')::integer, x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back')), 'planned'
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n);
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'recurring', 'stages', v_n, 'rule', v_rule)
              || CASE WHEN v_wait THEN jsonb_build_object('pic', v_pic) ELSE '{}'::jsonb END
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

CREATE OR REPLACE FUNCTION public.mkt_minutes_send(p_minutes uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m       public.mkt_minutes;
  v_p       public.mkt_projects;
  v_mv      public.mkt_minutes_versions;
  v_missing text[];
  v_unsign  text[];
  v_by      text;
  v_link    text;
  v_link2   text;
  v_names   text;
  v_topic   boolean;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage', 'marketing.edit'], 'Sending the minutes is the manager''s.');
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_m.project_id FOR UPDATE;
  -- A product project's intake minutes — or a task's the PIC approves (②a-4), its owner's to send too.
  IF NOT v_m.intake OR NOT (v_p.kind = 'product' OR (v_p.kind IN ('quick', 'recurring') AND v_p.pic_minutes)) THEN
    RAISE EXCEPTION 'Only a product project''s intake minutes — or a task''s the PIC approves — go to the PIC.' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
     AND NOT (v_p.kind <> 'product' AND v_p.owner_staff IS NOT NULL AND v_p.owner_staff = public.mkt_me_staff()) THEN
    RAISE EXCEPTION 'Sending the minutes is the manager''s.' USING ERRCODE = '42501';
  END IF;
  IF p_rev IS DISTINCT FROM v_m.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_m.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed these minutes since you opened them — reload to see them.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_p.status <> 'minutes' THEN
    RAISE EXCEPTION 'These minutes were sent already.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  -- To the PIC: a product project's when its template asks the PIC's sign-off; a task's always — it chose the PIC (②a-4).
  v_topic := CASE WHEN v_p.kind = 'product' THEN coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) ELSE true END;
  v_missing := public.mkt_minutes_missing(v_mv.fields, v_m.vals);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Still to fill in: %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(v_p.pic_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Name the PIC.' USING ERRCODE = '22023';
  END IF;
  -- The link goes to the PIC on WhatsApp (⭐ on the handoff's meeting card) — when they approve on it.
  IF v_topic
     AND length(regexp_replace(coalesce(v_p.pic_whatsapp, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Add the PIC''s WhatsApp.' USING ERRCODE = '22023';
  END IF;
  IF v_topic AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
     AND length(regexp_replace(coalesce(v_p.pic2_whatsapp, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Add the second PIC''s WhatsApp.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((v_mv.rules -> 'sign') = 'true'::jsonb, false)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Signature') THEN
    v_unsign := ARRAY(SELECT coalesce(public.mkt_staff_name(a), 'Somebody') FROM unnest(public.mkt_minutes_attendees(v_mv.fields, v_m.vals)) a
                       WHERE NOT (v_m.signed ? a::text));
    IF cardinality(v_unsign) > 0 THEN
      RAISE EXCEPTION 'Waiting for signatures: %.', array_to_string(v_unsign, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  v_link := coalesce(v_p.link_code, replace(gen_random_uuid()::text, '-', ''));
  -- Each PIC their own link (2026-10-24 — the user's answer 29): the second PIC's when they are named.
  v_link2 := CASE WHEN nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                  THEN coalesce(v_p.link2_code, replace(gen_random_uuid()::text, '-', '')) END;
  v_names := v_p.pic_name || coalesce(' and ' || nullif(btrim(coalesce(v_p.pic2_name, '')), ''), '');
  IF v_topic THEN
    UPDATE public.mkt_minutes SET status = 'sent', rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_code = v_link, link2_code = v_link2, link_sent_at = now(),
                                   pic_reply = NULL, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'link sent', p_reason => v_names);
  ELSE
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = public.mkt_actor(),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'approved', link_code = v_link, link2_code = v_link2, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'minutes completed', p_reason => v_m.title);
  END IF;
  RETURN jsonb_build_object('status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_p.id),
                            'minutes', v_m.status, 'rev', v_m.rev, 'link', v_link, 'link2', v_link2);
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
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND pic_minutes)) AND status NOT IN ('minutes', 'cancelled');
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
    'minutes', jsonb_build_object('title', v_m.title, 'fields', v_out),
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
  v_you    integer;
  v_ok     jsonb;
  v_other  text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND pic_minutes)) AND status NOT IN ('minutes', 'cancelled')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  v_you := CASE WHEN v_p.link_code = v_code THEN 1 ELSE 2 END;
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
    -- Both PICs sign off when the template asks it and the project has two (②b-2d-2b): the first approval is kept for
    -- this sending, and the minutes wait for the other's.
    IF coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL THEN
      v_ok := CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok ELSE jsonb_build_object('sent', (extract(epoch FROM v_p.link_sent_at))::text) END;
      v_other := CASE v_you WHEN 1 THEN v_p.pic2_name ELSE v_p.pic_name END;
      IF v_ok ? v_you::text THEN
        RAISE EXCEPTION 'You approved already — the minutes wait for %.', v_other USING ERRCODE = '22023';
      END IF;
      v_ok := v_ok || jsonb_build_object(v_you::text, jsonb_build_object('name', v_name, 'at', now()));
      UPDATE public.mkt_projects SET pic_ok = v_ok, updated_at = now() WHERE id = v_p.id;
      IF NOT (v_ok ? (3 - v_you)::text) THEN
        INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
        VALUES (v_p.id, NULL, left(v_name || ' (PIC)', 120), 'pic approved', v_m.title, jsonb_build_object('pic', v_you, 'waiting', v_other));
        FOREACH v_s IN ARRAY v_to LOOP
          PERFORM public.mkt_notify(v_s, v_p.id, left(v_name || ' approved the minutes — waiting for ' || v_other, 200), v_p.title, 'pic_approved');
        END LOOP;
        RETURN public.mkt_pic_page(v_code);
      END IF;
    END IF;
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = left(v_name || ' (PIC)', 120),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = NULL, updated_at = now()
     WHERE id = v_m.id;
    UPDATE public.mkt_projects
       SET status = CASE WHEN v_p.kind = 'product' THEN 'approved' ELSE status END,
           pic_reply = jsonb_build_object('decision', 'approved', 'name', v_name, 'reason', '', 'at', now(), 'pic', v_you),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
    VALUES (v_p.id, NULL, left(v_name || ' (PIC)', 120), 'pic approved', v_m.title, jsonb_build_object('pic', v_you));
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_name || ' approved the minutes', 200), v_p.title, 'pic_approved');
    END LOOP;
    -- A task's work starts with the PIC's approval (②a-4 — answer 53): its stages dated from today.
    IF v_p.kind <> 'product' THEN
      PERFORM public.mkt_task_begin(v_p.id, left(v_name || ' (PIC)', 120));
    END IF;
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 500 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := coalesce(nullif(left(v_name, 80), ''), nullif(btrim(CASE v_you WHEN 2 THEN v_p.pic2_name ELSE v_p.pic_name END), ''),
                      'The PIC');
    UPDATE public.mkt_projects
       SET status = 'changes', pic_reply = jsonb_build_object('decision', 'changes', 'name', v_who, 'reason', v_reason, 'at', now(), 'pic', v_you),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
    VALUES (v_p.id, NULL, left(v_who || ' (PIC)', 120), 'pic changes', v_reason, jsonb_build_object('pic', v_you));
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_who || ' asked for changes', 200), left(v_reason, 400), 'pic_changes');
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Approve, or say what should change.' USING ERRCODE = '22023';
  END IF;
  RETURN public.mkt_pic_page(v_code);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_project_resend(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage', 'marketing.edit'], 'Sending to the PIC is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  -- A product project — or a task whose minutes the PIC approves (②a-4), its owner's to resend too.
  IF NOT FOUND OR NOT (v_p.kind = 'product' OR (v_p.kind IN ('quick', 'recurring') AND v_p.pic_minutes)) THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
     AND NOT (v_p.kind <> 'product' AND v_p.owner_staff IS NOT NULL AND v_p.owner_staff = public.mkt_me_staff()) THEN
    RAISE EXCEPTION 'Sending to the PIC is the manager''s.' USING ERRCODE = '42501';
  END IF;
  IF v_p.status <> 'changes' THEN
    RAISE EXCEPTION 'Nothing was sent back to resend.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects SET status = 'waiting_pic', link_sent_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'resent',
                         p_reason => v_p.pic_name || coalesce(' and ' || nullif(btrim(coalesce(v_p.pic2_name, '')), ''), ''));
  RETURN jsonb_build_object('status', 'waiting_pic');
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_project_override(p_project uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p      public.mkt_projects;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_o      jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting before the PIC approves is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  -- A product project — or a task whose minutes the PIC approves (②a-4).
  IF NOT FOUND OR NOT (v_p.kind = 'product' OR (v_p.kind IN ('quick', 'recurring') AND v_p.pic_minutes)) THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status NOT IN ('waiting_pic', 'changes') THEN
    RAISE EXCEPTION 'Only a project waiting for the PIC starts before approval.' USING ERRCODE = '22023';
  END IF;
  IF v_p.override IS NOT NULL THEN
    RAISE EXCEPTION 'It was started before approval already.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Say why — 5 to 300 characters.' USING ERRCODE = '22023';
  END IF;
  v_o := jsonb_build_object('by', public.mkt_actor(), 'at', now(), 'reason', v_reason);
  UPDATE public.mkt_projects SET override = v_o, updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'started before approval', p_reason => v_reason);
  -- A task's work starts at once (②a-4); a product project's still waits for its Plan assignments.
  IF v_p.kind <> 'product' THEN
    PERFORM public.mkt_task_begin(v_p.id, public.mkt_actor());
  END IF;
  RETURN jsonb_build_object('override', v_o, 'status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_p.id));
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_minutes_fill(p_minutes uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m       public.mkt_minutes;
  v_p       public.mkt_projects;
  v_mv      public.mkt_minutes_versions;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_vals    jsonb;
  v_key     text;
  v_f       jsonb;
  v_v       jsonb;
  v_roster  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_x       uuid;
  v_seen    text[] := '{}';
  v_pic     text;
  v_wa      text;
  v_pic2    text;
  v_wa2     text;
  v_notes   text;
  v_att     uuid[];
  v_signed  jsonb;
  v_by      text;
  v_reapp   boolean := false;
  v_ok      jsonb;
  v_took    jsonb;
  v_cf      date;
  v_cu      date;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage', 'marketing.edit'], 'Writing the minutes is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_m.project_id FOR UPDATE;
  -- A task's minutes (2026-10-25 — answers 52–55) are its owner's to write too; a product project's, the manager's.
  IF NOT coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
     AND NOT (v_p.kind IN ('quick', 'recurring') AND v_p.owner_staff IS NOT NULL AND v_p.owner_staff = public.mkt_me_staff()) THEN
    RAISE EXCEPTION 'Writing the minutes is the manager''s.' USING ERRCODE = '42501';
  END IF;
  IF v_p.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'That project is closed.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_m.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_m.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed these minutes since you opened them — reload to see them.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_m.locked THEN
    RAISE EXCEPTION 'These minutes are locked.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;

  v_vals := v_m.vals;
  IF v_patch ? 'vals' THEN
    IF jsonb_typeof(v_patch -> 'vals') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not a set of answers.' USING ERRCODE = '22023';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_patch -> 'vals') LOOP
      v_f := (SELECT f FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'name' = v_key LIMIT 1);
      IF v_f IS NULL THEN
        RAISE EXCEPTION '"%" is not on these minutes.', v_key USING ERRCODE = '22023';
      END IF;
      v_v := public.mkt_minutes_value(v_f, v_patch -> 'vals' -> v_key);
      IF v_f ->> 'type' = 'People' AND v_v IS NOT NULL THEN
        -- Somebody already listed stays though they left the team; somebody new is on it.
        FOR v_x IN SELECT x::uuid FROM jsonb_array_elements_text(v_v) x LOOP
          IF NOT (v_x = ANY (v_roster)) AND NOT coalesce((v_m.vals -> v_key) @> to_jsonb(ARRAY[v_x::text]), false) THEN
            RAISE EXCEPTION '"%": somebody who is not on the team.', v_key USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
      IF (v_vals -> v_key) IS DISTINCT FROM v_v AND coalesce((v_f -> 'pic') = 'true'::jsonb, false) THEN
        v_seen := v_seen || v_key;
      END IF;
      v_vals := CASE WHEN v_v IS NULL THEN v_vals - v_key ELSE jsonb_set(v_vals, ARRAY[v_key], v_v) END;
    END LOOP;
  END IF;

  v_notes := CASE WHEN v_patch ? 'notes' THEN coalesce(v_patch ->> 'notes', '') ELSE v_m.notes END;
  IF length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'Meeting notes of at most 4000 characters.' USING ERRCODE = '22023';
  END IF;
  v_pic := v_p.pic_name;
  v_wa := v_p.pic_whatsapp;
  v_pic2 := v_p.pic2_name;
  v_wa2 := v_p.pic2_whatsapp;
  IF (v_patch ? 'pic' OR v_patch ? 'whatsapp' OR v_patch ? 'pic2' OR v_patch ? 'whatsapp2') AND NOT v_m.intake THEN
    RAISE EXCEPTION 'The PIC is set on the intake minutes.' USING ERRCODE = '22023';
  END IF;
  -- A task's PIC only when the PIC approves its minutes (②a-4).
  IF (v_patch ? 'pic' OR v_patch ? 'whatsapp' OR v_patch ? 'pic2' OR v_patch ? 'whatsapp2') AND v_p.kind <> 'product' AND NOT v_p.pic_minutes THEN
    RAISE EXCEPTION 'This task''s minutes do not go to the PIC.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'pic' THEN
    v_pic := nullif(btrim(coalesce(v_patch ->> 'pic', '')), '');
    IF length(v_pic) > 80 THEN
      RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_pic IS DISTINCT FROM v_p.pic_name THEN
      v_seen := v_seen || 'PIC name'::text;
    END IF;
  END IF;
  IF v_patch ? 'whatsapp' THEN
    v_wa := nullif(btrim(coalesce(v_patch ->> 'whatsapp', '')), '');
    IF length(v_wa) > 40 OR v_wa !~ '^[+0-9 ()-]+$' THEN
      RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The second PIC (2026-10-24 — the user's answer 29), on their own link. Either PIC's approval counts, so a change of
  -- the second sends nothing back.
  IF v_patch ? 'pic2' THEN
    v_pic2 := nullif(btrim(coalesce(v_patch ->> 'pic2', '')), '');
    IF length(v_pic2) > 80 THEN
      RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    -- …unless both PICs sign off (②b-2d-2b): then a second PIC named or changed after approval approves too.
    IF coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND v_pic2 IS NOT NULL AND v_pic2 IS DISTINCT FROM v_p.pic2_name THEN
      v_seen := v_seen || 'Second PIC'::text;
    END IF;
  END IF;
  IF v_patch ? 'whatsapp2' THEN
    v_wa2 := nullif(btrim(coalesce(v_patch ->> 'whatsapp2', '')), '');
    IF length(v_wa2) > 40 OR v_wa2 !~ '^[+0-9 ()-]+$' THEN
      RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Whoever is no longer an attendee no longer signs.
  v_att := public.mkt_minutes_attendees(v_mv.fields, v_vals);
  v_signed := coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each(v_m.signed) s(k, v) WHERE k::uuid = ANY (v_att)), '{}'::jsonb);

  -- Approved, then changed where the PIC sees: the PIC approves again. So too while the minutes wait for both PICs with
  -- one's approval in (②b-2d-2b): what they approved changed — theirs no longer counts. The trail keeps whose approvals
  -- the edit took back (`took`), so each PIC's page says whether it was theirs.
  v_ok := CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' ELSE '{}'::jsonb END;
  -- A task's by its own choice (②a-4), a product project's by its template's rule.
  IF v_m.intake AND (CASE WHEN v_p.kind = 'product' THEN coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) ELSE v_p.pic_minutes END)
     AND cardinality(v_seen) > 0
     AND (v_p.status = 'approved' OR (v_p.status = 'waiting_pic' AND v_ok <> '{}'::jsonb)) THEN
    v_reapp := true;
    v_took := CASE WHEN v_ok <> '{}'::jsonb
                   THEN (SELECT jsonb_agg(jsonb_build_object('pic', e.k::integer, 'name', e.v ->> 'name') ORDER BY e.k)
                           FROM jsonb_each(v_ok) e(k, v) WHERE e.k IN ('1', '2'))
                   WHEN v_p.pic_reply ->> 'decision' = 'approved'
                   THEN jsonb_build_array(jsonb_build_object('pic', CASE WHEN v_p.pic_reply ->> 'pic' = '2' THEN 2 ELSE 1 END,
                                                             'name', v_p.pic_reply ->> 'name'))
                   ELSE '[]'::jsonb END;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_sent_at = now(), pic_reply = NULL, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'edited after approval', p_reason => array_to_string(v_seen, ', '),
                           p_data => jsonb_build_object('fields', to_jsonb(v_seen), 'took', coalesce(v_took, '[]'::jsonb)));
  END IF;
  IF v_patch ? 'pic' OR v_patch ? 'whatsapp' OR v_patch ? 'pic2' OR v_patch ? 'whatsapp2' THEN
    -- The second PIC's own link: made when they are named once the link has gone out, gone when they are taken off.
    UPDATE public.mkt_projects
       SET pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2,
           link2_code = CASE WHEN v_pic2 IS NULL THEN NULL
                             WHEN link_code IS NOT NULL THEN coalesce(link2_code, replace(gen_random_uuid()::text, '-', ''))
                             ELSE link2_code END,
           updated_at = now()
     WHERE id = v_p.id;
    -- Its deliverables name the same PICs.
    UPDATE public.mkt_projects SET pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2
     WHERE parent_id = v_p.id;
  END IF;

  UPDATE public.mkt_minutes
     SET vals = v_vals, signed = v_signed, notes = v_notes,
         status = CASE WHEN v_reapp THEN 'sent' ELSE status END,
         completed_at = CASE WHEN v_reapp THEN NULL ELSE completed_at END,
         completed_by = CASE WHEN v_reapp THEN NULL ELSE completed_by END,
         rev = rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_m.id
  RETURNING * INTO v_m;
  -- A campaign's run period (answer 13): the intake's, on its project — both days, else none; the trail keeps each change.
  -- A campaign is a product project (mkt_projects_campaign_check): a task's period stays in its minutes (②a-3).
  IF v_m.intake AND v_p.kind = 'product' THEN
    v_f := (SELECT f FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Campaign period' LIMIT 1);
    IF v_f IS NOT NULL THEN
      v_v := v_vals -> (v_f ->> 'name');
      IF coalesce(v_v ->> 'from', '') <> '' AND coalesce(v_v ->> 'to', '') <> '' THEN
        v_cf := (v_v ->> 'from')::date;
        v_cu := (v_v ->> 'to')::date;
      END IF;
      IF v_cf IS DISTINCT FROM v_p.campaign_from OR v_cu IS DISTINCT FROM v_p.campaign_until THEN
        UPDATE public.mkt_projects SET campaign_from = v_cf, campaign_until = v_cu, updated_at = now() WHERE id = v_p.id;
        PERFORM public.mkt_log(v_p.id, 'campaign period', p_data => jsonb_build_object('from', v_cf, 'until', v_cu));
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('rev', v_m.rev, 'minutes', v_m.status, 'reapproval', v_reapp,
                            'status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_m.project_id));
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_minutes_sign(p_minutes uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
  v_m  public.mkt_minutes;
  v_mv public.mkt_minutes_versions;
  v_p  public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Signing minutes is not open to your account.');
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Signature') THEN
    RAISE EXCEPTION 'These minutes take no signatures.' USING ERRCODE = '22023';
  END IF;
  IF v_m.locked OR v_m.status = 'completed' THEN
    RAISE EXCEPTION 'These minutes are complete.' USING ERRCODE = '22023';
  END IF;
  IF v_me IS NULL OR NOT (v_me = ANY (public.mkt_minutes_attendees(v_mv.fields, v_m.vals))) THEN
    RAISE EXCEPTION 'Only those who attended sign — each for themselves.' USING ERRCODE = '42501';
  END IF;
  IF v_m.signed ? v_me::text THEN
    RETURN jsonb_build_object('rev', v_m.rev);
  END IF;
  UPDATE public.mkt_minutes
     SET signed = signed || jsonb_build_object(v_me::text, jsonb_build_object('at', now())), updated_at = now()
   WHERE id = v_m.id
  RETURNING * INTO v_m;
  PERFORM public.mkt_log(v_m.project_id, 'signed', p_reason => v_m.title);
  -- A task's minutes (2026-10-25 — answers 52–55) complete with the last signature: nothing else is asked of them. A
  -- product project's are completed, or sent to the PIC, by the manager — and a task's the PIC approves, by the PIC (②a-4).
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_m.project_id;
  IF v_p.kind IN ('quick', 'recurring') AND NOT v_p.pic_minutes AND v_m.status = 'draft'
     AND cardinality(public.mkt_minutes_missing(v_mv.fields, v_m.vals)) = 0
     AND NOT EXISTS (SELECT 1 FROM unnest(public.mkt_minutes_attendees(v_mv.fields, v_m.vals)) a WHERE NOT (v_m.signed ? a::text)) THEN
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = public.mkt_actor(),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_at = now()
     WHERE id = v_m.id
    RETURNING * INTO v_m;
    PERFORM public.mkt_log(v_m.project_id, 'minutes completed', p_reason => v_m.title);
  END IF;
  RETURN jsonb_build_object('rev', v_m.rev, 'minutes', v_m.status);
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
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND pic_minutes)) AND status NOT IN ('minutes', 'cancelled');
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

-- The two new ones are called by other DEFINER functions only — never from a session.
REVOKE ALL ON FUNCTION public.mkt_pic_work(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pic_work(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_task_begin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_task_begin(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
