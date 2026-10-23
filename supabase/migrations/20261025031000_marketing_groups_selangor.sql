-- Marketing (2026-10-24) — the user's answers 1, 7 and 16 (the questionnaire, artifact M5qBkHQbztb9zhpgKVGLPv):
--
--   * 1 — asked again what "跟 People 的 title 走" means: "每个 title 就是一组". A stage's group (`dept`) is a People title
--     of the Marketing department, written as People Management writes it ("GRAPHIC DESIGNER"); Marketing keeps no
--     Content / Social Media / Design / Ads / Brand of its own. mkt_stages.dept loses its five-team CHECK (any title,
--     80 characters at most; '' none). A quick task's stage takes its person's title — the database reads it, whatever
--     the page sends; a workflow template's stage keeps the group picked in the builder (none allowed). A colour is
--     read from a title's words by the pages (lib/marketing/groups.ts) — never a grouping.
--   * 7 — "Selangor": Marketing's working days skip the holidays Selangor keeps — HR's 'All', 'All except Sarawak' and
--     'Selangor' (Attendance › Holidays), never another state's — in the stage dates, the board and the task page.
--   * 16 — "要，固定种类": a canvas date on the calendar is one of six kinds (Post day, Shoot day, Meeting, Ads go-live,
--     Ads end, Report day — a post is a deliverable with a Post day, answer 15); its name there is the kind's. The free
--     name and the team colour are gone (no template holds one on production: every E2E row was deleted).
--
-- mkt_stage_dates, mkt_board, mkt_project and mkt_task_create are replaced from their last copies
-- (20261023234000_marketing_tasks.sql), mkt_workflow_check and mkt_field_extras from 20261024001000_marketing_canvas.sql
-- — production's md5 equal to them on 2026-10-24 — each changed only where it says.
-- PGlite: tests/member-sql/validate-marketing-tasks.mjs and validate-marketing-canvas.mjs (their last sections).

-- ── Selangor's holidays ──────────────────────────────────────────────────────────
-- A holiday Marketing's office keeps: HR's for every state, every state but Sarawak, or Selangor's own.
CREATE OR REPLACE FUNCTION public.mkt_holiday_ok(p_states text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce(btrim(p_states), '') IN ('', 'All', 'All except Sarawak', 'Selangor');
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_holiday_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_holiday_ok(text) TO service_role;

CREATE OR REPLACE FUNCTION public.mkt_stage_dates(p_base date, p_slas integer[])
RETURNS TABLE (idx integer, starts_on date, due_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hol   date[] := ARRAY(SELECT h.day FROM public.att_holidays h WHERE h.deleted_at IS NULL AND h.day > p_base AND public.mkt_holiday_ok(h.states));
  v_day   date := p_base;
  v_start date;
  v_left  integer;
  i       integer;
BEGIN
  FOR i IN 1 .. coalesce(array_length(p_slas, 1), 0) LOOP
    IF i = 1 THEN
      v_start := p_base;
    ELSE
      v_start := v_day;
      LOOP
        v_start := v_start + 1;
        EXIT WHEN extract(isodow FROM v_start) < 6 AND NOT (v_start = ANY (v_hol));
      END LOOP;
    END IF;
    v_left := greatest(coalesce(p_slas[i], 1), 1);
    WHILE v_left > 0 LOOP
      v_day := v_day + 1;
      IF extract(isodow FROM v_day) < 6 AND NOT (v_day = ANY (v_hol)) THEN
        v_left := v_left - 1;
      END IF;
    END LOOP;
    idx := i - 1;
    starts_on := v_start;
    due_on := v_day;
    RETURN NEXT;
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_board(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_ids   uuid[];
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND (p_to < p_from OR p_to - p_from > 400) THEN
    RAISE EXCEPTION 'Pick a range of at most 400 days.' USING ERRCODE = '22023';
  END IF;
  -- Open, done or stopped lately, or with a stage due in the range asked — at most 1,500, the newest first. A run of a
  -- recurring task before its day, or held by a pause, is not on it: its series draws it.
  v_ids := ARRAY(
    SELECT p.id FROM public.mkt_projects p
     WHERE NOT (p.series_id IS NOT NULL AND (p.starts_on > v_today OR p.status = 'paused'))
       AND (p.status NOT IN ('done', 'cancelled')
        OR p.updated_at > now() - interval '60 days'
        OR (p_from IS NOT NULL AND p_to IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = p.id AND s.due_on BETWEEN p_from AND p_to)))
     ORDER BY p.updated_at DESC, p.id LIMIT 1500);
  RETURN jsonb_build_object(
    'today', v_today,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot,
                                         'emoji', x.emoji, 'client', x.company_id IS NULL, 'pic', x.pic_name)
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', p.id, 'trackId', p.track_id, 'kind', p.kind, 'sub', p.subsidiary_id, 'title', p.title,
                             'status', p.status, 'workflow', p.workflow_name, 'qType', p.q_type, 'owner', p.owner_staff,
                             'pic', p.pic_name, 'cur', p.cur, 'series', p.series_id, 'run', p.run_no,
                             'recur', CASE WHEN p.kind = 'recurring' AND p.series_id IS NULL THEN p.recur END,
                             'startsOn', p.starts_on, 'dueOn', p.due_on, 'createdAt', p.created_at,
                             'updatedAt', p.updated_at, 'doneAt', p.done_at) ORDER BY x.ord)
                            FROM unnest(v_ids) WITH ORDINALITY AS x(id, ord) JOIN public.mkt_projects p ON p.id = x.id), '[]'::jsonb),
    'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'project', s.project_id, 'idx', s.idx, 'name', s.name, 'dept', s.dept, 'mode', s.mode,
                           'owner', s.owner_staff, 'extra', s.extra, 'cands', to_jsonb(s.cands), 'sla', s.sla,
                           'appr', s.appr, 'split', s.split, 'startsOn', s.starts_on, 'dueOn', s.due_on,
                           'status', s.status, 'apprIdx', s.appr_idx, 'ver', s.ver, 'changes', s.changes,
                           'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at, 'submittedAt', s.submitted_at,
                           'doneAt', s.done_at) ORDER BY s.project_id, s.idx)
                          FROM public.mkt_stages s WHERE s.project_id = ANY (v_ids)), '[]'::jsonb),
    'subtasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', t.id, 'project', t.project_id, 'stage', t.stage_idx, 'title', t.title,
                             'assignee', t.assignee, 'dueOn', t.due_on, 'status', t.status, 'returns', t.returns,
                             'by', t.created_by, 'createdAt', t.created_at, 'updatedAt', t.updated_at)
                           ORDER BY t.created_at, t.id)
                            FROM public.mkt_subtasks t WHERE t.project_id = ANY (v_ids)), '[]'::jsonb),
    -- The holidays HR keeps for Selangor (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
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
      'owner', v_p.owner_staff, 'pic', v_p.pic_name, 'cur', v_p.cur, 'series', v_p.series_id, 'run', v_p.run_no,
      'recur', v_p.recur, 'startsOn', v_p.starts_on, 'dueOn', v_p.due_on, 'createdAt', v_p.created_at,
      'createdBy', (SELECT u.name FROM public.users u WHERE u.id = v_p.created_by),
      'updatedAt', v_p.updated_at, 'doneAt', v_p.done_at,
      'free', CASE WHEN jsonb_typeof(v_p.canvas -> 'free') = 'array' THEN v_p.canvas -> 'free' ELSE '[]'::jsonb END),
    'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'project', s.project_id, 'idx', s.idx, 'name', s.name, 'dept', s.dept, 'mode', s.mode,
                           'owner', s.owner_staff, 'extra', s.extra, 'cands', to_jsonb(s.cands), 'sla', s.sla,
                           'appr', s.appr, 'split', s.split, 'spec', s.spec, 'work', s.work, 'startsOn', s.starts_on,
                           'dueOn', s.due_on, 'status', s.status, 'apprIdx', s.appr_idx, 'ver', s.ver,
                           'changes', s.changes, 'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at,
                           'submittedAt', s.submitted_at, 'doneAt', s.done_at) ORDER BY s.idx)
                          FROM public.mkt_stages s WHERE s.project_id = v_p.id), '[]'::jsonb),
    'subtasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', t.id, 'project', t.project_id, 'stage', t.stage_idx, 'title', t.title,
                             'assignee', t.assignee, 'dueOn', t.due_on, 'status', t.status, 'returns', t.returns,
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

-- ── A stage's group: a People title ──────────────────────────────────────────────
ALTER TABLE public.mkt_stages DROP CONSTRAINT IF EXISTS mkt_stages_dept_check;
ALTER TABLE public.mkt_stages ALTER COLUMN dept SET DEFAULT '';
ALTER TABLE public.mkt_stages ADD CONSTRAINT mkt_stages_dept_check CHECK (length(dept) <= 80);

CREATE OR REPLACE FUNCTION public.mkt_task_create(p_subsidiary uuid, p_kind text, p_title text, p_q_type text,
  p_brief text, p_stages jsonb, p_recur jsonb DEFAULT NULL)
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

  v_track := public.mkt_next_track(CASE p_kind WHEN 'quick' THEN 'TSK' ELSE 'RCR' END, v_sub.code);
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, q_type, brief, owner_staff, cur,
                                   starts_on, recur, created_by)
  VALUES (v_track, p_kind, v_sub.id, v_title, 'active', p_q_type, v_brief, v_me, 0,
          CASE WHEN p_kind = 'quick' THEN v_today ELSE v_days[1] END,
          CASE WHEN p_kind = 'recurring' THEN jsonb_build_object('rule', v_rule, 'runs', to_jsonb(v_days), 'status', 'active') END,
          auth.uid())
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
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'quick', 'stages', v_n));
    PERFORM public.mkt_log(v_id, 'opened', 0, v_clean -> 0 ->> 'name', public.mkt_staff_name(v_first));
    v_open := v_id;
  ELSE
    -- The series keeps the stages each run copies, undated.
    INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, sla, appr, spec, status)
    SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', x.st ->> 'dept', 'person', (x.st ->> 'who')::uuid,
           (x.st ->> 'sla')::integer, x.st -> 'appr', jsonb_strip_nulls(jsonb_build_object('form', x.st -> 'form', 'back', x.st -> 'back')), 'planned'
      FROM jsonb_array_elements(v_clean) WITH ORDINALITY AS x(st, n);
    PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('kind', 'recurring', 'stages', v_n, 'rule', v_rule));
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
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_id, 'track', v_track, 'open', v_open);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_workflow_check(p_stages jsonb, p_publish boolean, p_locked boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_types  text[] := ARRAY['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'];
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_n      integer := CASE WHEN jsonb_typeof(p_stages) = 'array' THEN jsonb_array_length(p_stages) ELSE -1 END;
  v_out    jsonb := '[]'::jsonb;
  v_st     jsonb;
  v_name   text;
  v_mode   text;
  v_cands  jsonb;
  v_sla    integer;
  v_appr   jsonb;
  v_a      jsonb;
  v_form   jsonb;
  v_f      jsonb;
  v_label  text;
  v_labels text[];
  v_cols   jsonb;
  v_rows   jsonb;
  v_row    jsonb;
  v_back   integer;
  v_x      text;
  v_split  boolean;
  v_sec    jsonb;
  i        integer;
  j        integer;
BEGIN
  IF v_n < 0 THEN
    RAISE EXCEPTION 'Not a list of stages.' USING ERRCODE = '22023';
  END IF;
  IF v_n > 20 THEN
    RAISE EXCEPTION 'A workflow has at most 20 stages.' USING ERRCODE = '22023';
  END IF;
  IF p_publish AND v_n = 0 THEN
    RAISE EXCEPTION 'Add a stage first.' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. v_n - 1 LOOP
    v_st := p_stages -> i;
    IF jsonb_typeof(v_st) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Stage %: not a stage.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_st ->> 'name', ''));
    IF length(v_name) > 80 THEN
      RAISE EXCEPTION 'Stage %: a name of at most 80 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF p_publish AND v_name = '' THEN
      RAISE EXCEPTION 'Stage %: give it a name.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(v_st ->> 'dept', ''))) > 80 THEN
      RAISE EXCEPTION 'Stage %: a group of at most 80 characters.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Who: picked at assignment, or by the stage before from a list.
    v_mode := CASE WHEN v_st -> 'who' ->> 'mode' = 'prev' THEN 'prev' ELSE 'assign' END;
    v_cands := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'who' -> 'cands') = 'array' THEN
      IF jsonb_array_length(v_st -> 'who' -> 'cands') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 candidates.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_x IN SELECT x FROM jsonb_array_elements_text(v_st -> 'who' -> 'cands') x LOOP
        -- A draft keeps somebody who has left the team (the builder shows it); a version runs only on the team.
        IF v_x !~ v_uuid OR (p_publish AND NOT (v_x::uuid = ANY (v_roster))) THEN
          RAISE EXCEPTION 'Stage %: a candidate is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF NOT v_cands @> to_jsonb(ARRAY[lower(v_x)]) THEN
          v_cands := v_cands || to_jsonb(ARRAY[lower(v_x)]);
        END IF;
      END LOOP;
    END IF;
    IF p_publish AND p_locked THEN
      v_mode := 'assign';
    END IF;
    IF p_publish AND v_mode = 'prev' THEN
      IF i = 0 THEN
        RAISE EXCEPTION 'Stage 1: there is no stage before it to pick its person.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_cands) = 0 THEN
        RAISE EXCEPTION 'Stage %: a 🔓 stage needs at least one candidate.', i + 1 USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_publish AND v_mode = 'assign' THEN
      v_cands := '[]'::jsonb;
    END IF;

    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage %: 1 to 30 working days.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Approval levels: a person on the team, the PIC through the link, or a person picked at assignment.
    v_appr := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage %: at most 3 approval levels.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        IF v_a ->> 'kind' = 'assign' THEN
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'assign'));
        ELSIF v_a ->> 'kind' = 'pic' THEN
          IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'pic')) THEN
            RAISE EXCEPTION 'Stage %: the PIC approves it once.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'pic'));
        ELSIF v_a ->> 'kind' = 'person' AND coalesce(v_a ->> 'staff', '') ~ v_uuid
              AND (NOT p_publish OR (v_a ->> 'staff')::uuid = ANY (v_roster)) THEN
          IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', lower(v_a ->> 'staff'))) THEN
            RAISE EXCEPTION 'Stage %: the same approver twice.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', lower(v_a ->> 'staff')));
        ELSE
          RAISE EXCEPTION 'Stage %: an approval nobody on the team can give.', i + 1 USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    -- The fields it fills in: as a quick task's (mkt_task_create), and a table's preset rows.
    v_form := '[]'::jsonb;
    v_labels := '{}';
    IF jsonb_typeof(v_st -> 'form') = 'array' THEN
      IF jsonb_array_length(v_st -> 'form') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 fields.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_f IN SELECT x FROM jsonb_array_elements(v_st -> 'form') x LOOP
        IF NOT (coalesce(v_f ->> 'type', '') = ANY (v_types)) THEN
          RAISE EXCEPTION 'Stage %: a field of a kind it cannot hold.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_label := btrim(coalesce(v_f ->> 'label', ''));
        IF length(v_label) > (CASE WHEN v_f ->> 'type' = 'Note' THEN 300 ELSE 60 END)
           OR (p_publish AND v_label = '') THEN
          RAISE EXCEPTION 'Stage %: name each field (a note at most 300 characters, a field 60).', i + 1 USING ERRCODE = '22023';
        END IF;
        -- A draft may hold two fields of one name while they are typed; a version may not.
        IF p_publish AND v_f ->> 'type' <> 'Note' THEN
          IF v_label = ANY (v_labels) THEN
            RAISE EXCEPTION 'Stage %: two fields called "%".', i + 1, v_label USING ERRCODE = '22023';
          END IF;
          v_labels := v_labels || v_label;
        END IF;
        IF v_f ->> 'type' = 'Table' THEN
          IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
            RAISE EXCEPTION 'Stage %: a table has 1 to 8 columns.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_cols := '[]'::jsonb;
          FOR j IN 0 .. jsonb_array_length(v_f -> 'cols') - 1 LOOP
            IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
               OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Checkbox', 'Date', 'Person') THEN
              RAISE EXCEPTION 'Stage %: name each column of a table (at most 40 characters).', i + 1 USING ERRCODE = '22023';
            END IF;
            v_cols := v_cols || jsonb_build_array(jsonb_build_object('name', btrim(v_f -> 'cols' -> j ->> 'name'), 'type', v_f -> 'cols' -> j ->> 'type'));
          END LOOP;
          v_rows := '[]'::jsonb;
          IF jsonb_typeof(v_f -> 'rows') = 'array' THEN
            IF jsonb_array_length(v_f -> 'rows') > 50 THEN
              RAISE EXCEPTION 'Stage %: a table has at most 50 preset rows.', i + 1 USING ERRCODE = '22023';
            END IF;
            FOR v_row IN SELECT x FROM jsonb_array_elements(v_f -> 'rows') x LOOP
              IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> jsonb_array_length(v_cols)
                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 200) THEN
                RAISE EXCEPTION 'Stage %: a preset row is one short line per column.', i + 1 USING ERRCODE = '22023';
              END IF;
              v_rows := v_rows || jsonb_build_array(v_row);
            END LOOP;
          END IF;
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', 'Table', 'cols', v_cols, 'rows', v_rows)
            || public.mkt_field_extras(v_f, 'Table', v_label, p_publish, format('Stage %s', i + 1), true));
        ELSE
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', v_f ->> 'type')
            || public.mkt_field_extras(v_f, v_f ->> 'type', v_label, p_publish, format('Stage %s', i + 1), true));
        END IF;
      END LOOP;
    END IF;

    v_back := CASE WHEN jsonb_typeof(v_st -> 'back') = 'number' AND (v_st ->> 'back') ~ '^[0-9]{1,2}$'
                        AND (v_st ->> 'back')::integer < i THEN (v_st ->> 'back')::integer END;
    IF length(coalesce(v_st ->> 'picText', '')) > 120 THEN
      RAISE EXCEPTION 'Stage %: what the PIC sees — at most 120 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', '') = 'true' AND NOT (p_publish AND p_locked);

    -- Its section on the canvas: 🎯, not locked, required, shown to the PIC — unless set.
    v_sec := CASE WHEN jsonb_typeof(v_st -> 'sec') = 'object' THEN v_st -> 'sec' ELSE '{}'::jsonb END;
    IF length(coalesce(v_sec ->> 'emoji', '')) > 16 THEN
      RAISE EXCEPTION 'Stage %: its section takes one emoji.', i + 1 USING ERRCODE = '22023';
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'dept', regexp_replace(btrim(coalesce(v_st ->> 'dept', '')), '\s+', ' ', 'g'),
      'who', jsonb_build_object('mode', v_mode, 'cands', v_cands), 'sla', v_sla,
      'appr', v_appr, 'split', v_split, 'back', to_jsonb(v_back), 'picText', btrim(coalesce(v_st ->> 'picText', '')),
      'form', v_form,
      'sec', jsonb_build_object('emoji', coalesce(nullif(btrim(coalesce(v_sec ->> 'emoji', '')), ''), '🎯'),
        'locked', coalesce((v_sec -> 'locked') = 'true'::jsonb, false),
        'req', coalesce((v_sec -> 'req') <> 'false'::jsonb, true),
        'pic', coalesce((v_sec -> 'pic') <> 'false'::jsonb, true))));
  END LOOP;
  RETURN v_out;
END
$fn$;

-- ── A canvas date: one of six kinds ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_field_extras(p_f jsonb, p_type text, p_label text, p_publish boolean, p_where text, p_default boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out   jsonb;
  v_cal   jsonb;
  v_label text;
  v_opts  jsonb := '[]'::jsonb;
  v_o     text;
  v_seen  text[] := '{}';
BEGIN
  v_out := jsonb_build_object(
    'req', CASE WHEN p_type = 'Note' THEN false
                WHEN jsonb_typeof(p_f -> 'req') = 'boolean' THEN (p_f ->> 'req')::boolean ELSE p_default END,
    'pic', CASE WHEN jsonb_typeof(p_f -> 'pic') = 'boolean' THEN (p_f ->> 'pic')::boolean ELSE p_default END);

  -- A date on the calendar: one of six kinds (its name there the kind's), the PIC's calendar or not.
  IF p_type = 'Date' AND jsonb_typeof(p_f -> 'cal') = 'object' THEN
    v_cal := p_f -> 'cal';
    v_label := CASE v_cal ->> 'kind'
                 WHEN 'post' THEN 'Post day' WHEN 'shoot' THEN 'Shoot day' WHEN 'meeting' THEN 'Meeting'
                 WHEN 'ads_live' THEN 'Ads go-live' WHEN 'ads_end' THEN 'Ads end' WHEN 'report' THEN 'Report day' END;
    IF v_label IS NULL THEN
      RAISE EXCEPTION '%: pick which date it is on the calendar.', p_where USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('cal', jsonb_build_object('kind', v_cal ->> 'kind', 'label', v_label,
      'pic', coalesce((v_cal -> 'pic') = 'true'::jsonb, false)));
  END IF;

  -- A choice's options: short, each once; a version's choice has at least one.
  IF p_type IN ('Select', 'Multi-select') THEN
    IF jsonb_typeof(p_f -> 'opts') = 'array' THEN
      IF jsonb_array_length(p_f -> 'opts') > 30 THEN
        RAISE EXCEPTION '%: a choice has at most 30 options.', p_where USING ERRCODE = '22023';
      END IF;
      FOR v_o IN SELECT btrim(x) FROM jsonb_array_elements_text(p_f -> 'opts') x LOOP
        IF length(v_o) > 40 THEN
          RAISE EXCEPTION '%: an option of at most 40 characters.', p_where USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_o = '';
        IF p_publish AND lower(v_o) = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the option "%" is there twice.', p_where, v_o USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || lower(v_o);
        v_opts := v_opts || to_jsonb(v_o);
      END LOOP;
    ELSIF p_f ? 'opts' AND jsonb_typeof(p_f -> 'opts') IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION '%: not a list of options.', p_where USING ERRCODE = '22023';
    END IF;
    IF p_publish AND jsonb_array_length(v_opts) = 0 THEN
      RAISE EXCEPTION '%: "%" — give the choice its options.', p_where, p_label USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('opts', v_opts);
  END IF;
  RETURN v_out;
END
$fn$;
