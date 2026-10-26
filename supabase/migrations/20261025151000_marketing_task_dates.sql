-- 2026-10-24 — Marketing ④-2c: a task's dates on the calendar, and its posts (the user's answers 15 and 16; the handoff's
-- "📌 Dates sync from task fields marked 'Show on calendar'"). A canvas Date field marked for the calendar — its kind, one
-- of six (answer 16): 📣 Post day, 🎬 Shoot day, 🗓️ Meeting, 📈 Ads go-live, 🛑 Ads end, 📊 Report day — puts its date on
-- the board once it is filled. A post (answer 15: "a deliverable with a 📣 Post day; done = Scheduled, its owner marks it
-- Posted, with its link") is marked here.
--   A post's mark  mkt_projects.posted: {"<stage idx>:<field>": {"at", "by", "name", "link"}} — by its owner (the task's,
--                  the stage's) or the manager, once its task is done (mkt_post_mark / mkt_post_unmark); the trail keeps
--                  each.
--   Read           the board (mkt_board: 'dates' — each such field's date, its kind, the PIC's or not, a post's mark — and a
--                  task with one in the range asked), the task page (mkt_project: 'posted') — production's bodies.

ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS posted jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── A post marked posted, with its link (its owner's, or the manager's) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_post_mark(p_project uuid, p_stage integer, p_field text, p_link text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_s    public.mkt_stages;
  v_me   uuid := public.mkt_me_staff();
  v_link text := btrim(coalesce(p_link, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit', 'marketing.manage'], 'Marking a post is Marketing''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = p_stage;
  IF NOT FOUND OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
        WHERE f ->> 'label' = p_field AND f ->> 'type' = 'Date' AND f -> 'cal' ->> 'kind' = 'post') THEN
    RAISE EXCEPTION 'That is not a post day of this task.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_s.work -> 'vals' ->> p_field, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Its post day is not set yet.' USING ERRCODE = '22023';
  END IF;
  -- Its owner (answer 15): the task's, the stage's that holds it — or the manager.
  IF NOT (coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
          OR (v_me IS NOT NULL AND (v_me = v_p.owner_staff OR v_me = v_s.owner_staff))) THEN
    RAISE EXCEPTION 'Only its owner marks the post.' USING ERRCODE = '42501';
  END IF;
  -- Done is Scheduled (answer 15): posted after that.
  IF v_p.status <> 'done' THEN
    RAISE EXCEPTION 'A post is marked posted once its task is done.' USING ERRCODE = '22023';
  END IF;
  IF v_link !~* '^https?://[^[:space:]]+$' OR length(v_link) > 500 THEN
    RAISE EXCEPTION 'The post''s link: https://… — at most 500 characters.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects
     SET posted = posted || jsonb_build_object(p_stage::text || ':' || p_field, jsonb_build_object(
                    'at', now(), 'by', auth.uid(), 'link', v_link,
                    'name', coalesce(public.mkt_staff_name(v_me), (SELECT u.name FROM public.users u WHERE u.id = auth.uid()), 'Somebody'))),
         updated_at = now()
   WHERE id = v_p.id
  RETURNING * INTO v_p;
  PERFORM public.mkt_log(v_p.id, 'posted', p_stage => p_stage, p_stage_name => v_s.name,
                         p_data => jsonb_build_object('field', p_field, 'link', v_link));
  RETURN v_p.posted;
END
$fn$;

-- ── …and its mark taken back ───────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_post_unmark(p_project uuid, p_stage integer, p_field text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p   public.mkt_projects;
  v_s   public.mkt_stages;
  v_me  uuid := public.mkt_me_staff();
  v_key text := p_stage::text || ':' || coalesce(p_field, '');
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit', 'marketing.manage'], 'Marking a post is Marketing''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR NOT (v_p.posted ? v_key) THEN
    RAISE EXCEPTION 'That post is not marked posted.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = p_stage;
  IF NOT (coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
          OR (v_me IS NOT NULL AND (v_me = v_p.owner_staff OR v_me = v_s.owner_staff))) THEN
    RAISE EXCEPTION 'Only its owner marks the post.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.mkt_projects SET posted = posted - v_key, updated_at = now() WHERE id = v_p.id RETURNING * INTO v_p;
  PERFORM public.mkt_log(v_p.id, 'unposted', p_stage => p_stage, p_stage_name => v_s.name, p_data => jsonb_build_object('field', p_field));
  RETURN v_p.posted;
END
$fn$;

-- ── The board: a task's dates on the calendar (production's body) ─────────────────────────────────────────────
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
  -- recurring task before its day, or held by a pause, is not on it: its series draws it. Nor is a deliverable not
  -- planned yet, or before its start day: its product project lists it (②b-2a).
  v_ids := ARRAY(
    SELECT p.id FROM public.mkt_projects p
     WHERE NOT (p.series_id IS NOT NULL AND (p.starts_on > v_today OR p.status = 'paused'))
       AND NOT (p.parent_id IS NOT NULL AND (p.status = 'planning' OR p.starts_on > v_today))
       AND (p.status NOT IN ('done', 'cancelled')
        OR p.updated_at > now() - interval '60 days'
        -- A campaign while it runs, and for 60 days after — or in the range asked (answer 13).
        OR p.campaign_until >= v_today - 60
        OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p.campaign_from <= p_to AND p.campaign_until >= p_from)
        -- …or a date of its marked for the calendar in the range asked (④-2c).
        OR (p_from IS NOT NULL AND p_to IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.mkt_stages s
               CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.spec -> 'form') = 'array' THEN s.spec -> 'form' ELSE '[]'::jsonb END) f
               WHERE s.project_id = p.id AND f ->> 'type' = 'Date' AND jsonb_typeof(f -> 'cal') = 'object'
                 AND s.work -> 'vals' ->> (f ->> 'label') BETWEEN p_from::text AND p_to::text))
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
                                         'emoji', x.emoji, 'client', x.company_id IS NULL, 'pic', x.pic_name,
                                         'whatsapp', x.pic_whatsapp, 'pic2', x.pic2_name, 'whatsapp2', x.pic2_whatsapp)
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', p.id, 'trackId', p.track_id, 'kind', p.kind, 'sub', p.subsidiary_id, 'title', p.title,
                             'status', p.status, 'workflow', p.workflow_name, 'qType', p.q_type, 'owner', p.owner_staff,
                             'pic', p.pic_name, 'cur', p.cur, 'series', p.series_id, 'run', p.run_no, 'parent', p.parent_id,
                             'recur', CASE WHEN p.kind = 'recurring' AND p.series_id IS NULL THEN p.recur END,
                             'startsOn', p.starts_on, 'dueOn', p.due_on, 'createdAt', p.created_at,
                             'updatedAt', p.updated_at, 'doneAt', p.done_at,
                             'campaign', CASE WHEN p.campaign_from IS NOT NULL
                                              THEN jsonb_build_object('from', p.campaign_from, 'until', p.campaign_until) END) ORDER BY x.ord)
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
    -- A task's dates on the calendar (④-2c — answers 15, 16): each Date field marked for it, once filled — its kind, the
    -- PIC's or not, a post's mark.
    'dates', coalesce((SELECT jsonb_agg(jsonb_build_object(
                         'project', s.project_id, 'stage', s.idx, 'field', f ->> 'label', 'kind', f -> 'cal' ->> 'kind',
                         'day', s.work -> 'vals' ->> (f ->> 'label'), 'pic', coalesce((f -> 'cal' -> 'pic') = 'true'::jsonb, false),
                         'posted', p.posted -> (s.idx::text || ':' || (f ->> 'label')))
                       ORDER BY s.work -> 'vals' ->> (f ->> 'label'), s.project_id, s.idx, f ->> 'label')
                        FROM public.mkt_stages s
                        JOIN public.mkt_projects p ON p.id = s.project_id
                        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.spec -> 'form') = 'array' THEN s.spec -> 'form' ELSE '[]'::jsonb END) f
                       WHERE s.project_id = ANY (v_ids) AND f ->> 'type' = 'Date' AND jsonb_typeof(f -> 'cal') = 'object'
                         AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'), '[]'::jsonb),
    -- The holidays HR keeps for Selangor (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
END
$fn$;

-- ── The task page: its posts' marks (production's body) ──────────────────────────────────────────────────────
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

-- ── Who may call what ───────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_post_mark(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_post_mark(uuid, integer, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_post_unmark(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_post_unmark(uuid, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
