-- 20261026001000_marketing_ads_report_days.sql
-- 2026-10-25 — Marketing ⑤-3c: an Ads report's Report days on the calendars, and its last report. Asked whether an Ads
-- report should put its Report day on the calendars, tell when a period is due and give a PDF, the user: "can do". A
-- period's Report day is the day after its last (the handoff's PIC Link: *20 Oct – 2 Nov*, *Next report 3 Nov*); the
-- Subsidiary Page has the kind (📊 Report day). It reports on until the Ads person picks its last report (how often it
-- reports is theirs to set — the user's answer 57; told the user, 2026-10-25).
--   mkt_ads.last_no  its last report's number — none: it reports on. Set or moved any time; never before a report out.
--   mkt_ads_view     production's body (md5 4ee02912…), one statement changed: the setup + lastNo.
--   mkt_ads_save     production's body (md5 8a23510d…): + lastNo — a number from 1 to 1000, or none; never under a
--                    report already out; on the trail (*… changed the Ads report · its last report*).
--   mkt_ads_publish  production's body (md5 9a94f7b8…): + a report after the last refused.
--   mkt_board        production's body (md5 6a8402e6…): a project whose Ads report reports on, or whose last Report day
--                    was within 60 days, stays on it though done (its ads may run after its work); + 'ads' — each
--                    project's on it: how often from when, its last report, the reports out (their numbers).
-- PGlite: tests/member-sql/validate-marketing-ads-report-days.mjs.

ALTER TABLE public.mkt_ads ADD COLUMN IF NOT EXISTS last_no integer CHECK (last_no IS NULL OR last_no BETWEEN 1 AND 1000);


CREATE OR REPLACE FUNCTION public.mkt_ads_view(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
  v_a public.mkt_ads;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'link', v_p.link_code IS NOT NULL,
    'setup', CASE WHEN v_a.project_id IS NULL THEN NULL ELSE jsonb_build_object(
      'ads', to_jsonb(v_a.ads), 'every', v_a.every, 'startsOn', v_a.starts_on, 'figures', to_jsonb(v_a.figures),
      'targets', v_a.targets, 'lastNo', v_a.last_no) END,
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object('no', r.no, 'from', r.from_day, 'until', r.until_day, 'values', r.vals,
                                          'targets', r.targets, 'note', r.note, 'by', r.by_name, 'at', r.published_at,
                                          'updatedAt', r.updated_at) ORDER BY r.no DESC)
        FROM public.mkt_ads_reports r WHERE r.project_id = p_project), '[]'::jsonb));
END
$fn$;

-- p_patch: { ads: [id], every, startsOn, figures: [key], targets: { budget, cpl, roas, apptRate }, lastNo }.
CREATE OR REPLACE FUNCTION public.mkt_ads_save(p_project uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  KEYS    CONSTANT text[] := ARRAY['spendToDate', 'spend', 'leads', 'cpl', 'appt', 'apptRate', 'cpa', 'showup', 'showRate', 'won',
                                   'winRate', 'wonAmount', 'roas', 'impr', 'reach', 'clicks', 'ctr', 'msgconv', 'cpmsg'];
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_a     public.mkt_ads;
  v_new   boolean;
  v_out   boolean;
  v_t     jsonb;
  v_k     text;
  v_x     jsonb;
  v_n     numeric;
  v_ids   text[];
  v_figs  text[];
  v_what  text[] := '{}';
  v_max   integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project FOR UPDATE;
  v_new := NOT FOUND;
  IF v_new THEN
    v_a.project_id := p_project;
    v_a.ads := '{}';
    v_a.every := '2w';
    v_a.starts_on := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_a.figures := ARRAY['spendToDate', 'cpl', 'appt', 'roas'];
    v_a.targets := '{}'::jsonb;
  END IF;
  v_out := EXISTS (SELECT 1 FROM public.mkt_ads_reports WHERE project_id = p_project);

  IF v_patch ? 'ads' THEN
    IF jsonb_typeof(v_patch -> 'ads') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Pick the ads from the list.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_ids FROM jsonb_array_elements_text(v_patch -> 'ads') x;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE x !~ '^\d{5,32}$') THEN
      RAISE EXCEPTION 'Pick the ads from the list.' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_ids) > 40 THEN
      RAISE EXCEPTION 'An Ads report reads 40 ads at most.' USING ERRCODE = '22023';
    END IF;
    v_a.ads := v_ids;
    v_what := array_append(v_what, 'ads');
  END IF;
  IF v_patch ? 'every' THEN
    IF coalesce(v_patch ->> 'every', '') NOT IN ('1w', '2w', '4w', '1m') THEN
      RAISE EXCEPTION 'Pick how often it reports.' USING ERRCODE = '22023';
    END IF;
    IF v_out AND v_patch ->> 'every' IS DISTINCT FROM v_a.every THEN
      RAISE EXCEPTION 'Its first report is out — how often it reports stays as it is.' USING ERRCODE = '22023';
    END IF;
    v_a.every := v_patch ->> 'every';
    v_what := array_append(v_what, 'every');
  END IF;
  IF v_patch ? 'startsOn' THEN
    BEGIN
      v_a.starts_on := (v_patch ->> 'startsOn')::date;
    EXCEPTION WHEN others THEN
      v_a.starts_on := NULL;
    END;
    IF v_a.starts_on IS NULL OR v_a.starts_on NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' THEN
      RAISE EXCEPTION 'Pick the first report''s first day.' USING ERRCODE = '22023';
    END IF;
    IF v_out AND v_a.starts_on IS DISTINCT FROM (SELECT starts_on FROM public.mkt_ads WHERE project_id = p_project) THEN
      RAISE EXCEPTION 'Its first report is out — its first day stays as it is.' USING ERRCODE = '22023';
    END IF;
    v_what := array_append(v_what, 'startsOn');
  END IF;
  IF v_patch ? 'figures' THEN
    IF jsonb_typeof(v_patch -> 'figures') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Pick the figures it shows.' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(x ORDER BY o), '{}') INTO v_figs
      FROM (SELECT x, min(o) AS o FROM jsonb_array_elements_text(v_patch -> 'figures') WITH ORDINALITY t(x, o) GROUP BY x) d;
    IF cardinality(v_figs) < 1 OR cardinality(v_figs) > 12 OR EXISTS (SELECT 1 FROM unnest(v_figs) x WHERE x <> ALL (KEYS)) THEN
      RAISE EXCEPTION 'Pick 1 to 12 figures from the list.' USING ERRCODE = '22023';
    END IF;
    v_a.figures := v_figs;
    v_what := array_append(v_what, 'figures');
  END IF;
  IF v_patch ? 'targets' THEN
    v_t := v_patch -> 'targets';
    IF jsonb_typeof(v_t) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Its targets are numbers.' USING ERRCODE = '22023';
    END IF;
    FOR v_k, v_x IN SELECT key, value FROM jsonb_each(v_t) LOOP
      IF v_k NOT IN ('budget', 'cpl', 'roas', 'apptRate') THEN
        RAISE EXCEPTION 'Its targets are a budget, a cost per lead, a ROAS and an appointment rate.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_x) = 'null' THEN
        v_a.targets := v_a.targets - v_k;
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_x) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Its targets are numbers.' USING ERRCODE = '22023';
      END IF;
      v_n := (v_x #>> '{}')::numeric;
      IF v_n < 0 OR v_n > 1e9 OR (v_k = 'apptRate' AND v_n > 100) THEN
        RAISE EXCEPTION 'A target is a number from 0 — an appointment rate at most 100%%.' USING ERRCODE = '22023';
      END IF;
      v_a.targets := v_a.targets || jsonb_build_object(v_k, round(v_n, 2));
    END LOOP;
    v_what := array_append(v_what, 'targets');
  END IF;
  -- Its last report (⑤-3c): none — it reports on; never one before a report already out.
  IF v_patch ? 'lastNo' THEN
    IF jsonb_typeof(v_patch -> 'lastNo') = 'null' THEN
      v_a.last_no := NULL;
    ELSIF jsonb_typeof(v_patch -> 'lastNo') = 'number' AND (v_patch ->> 'lastNo') ~ '^[0-9]{1,4}$'
          AND (v_patch ->> 'lastNo')::integer BETWEEN 1 AND 1000 THEN
      v_a.last_no := (v_patch ->> 'lastNo')::integer;
    ELSE
      RAISE EXCEPTION 'Pick its last report from the list.' USING ERRCODE = '22023';
    END IF;
    SELECT max(no) INTO v_max FROM public.mkt_ads_reports WHERE project_id = p_project;
    IF v_a.last_no < v_max THEN
      RAISE EXCEPTION 'Report #% is out — its last report is #% or later.', v_max, v_max USING ERRCODE = '22023';
    END IF;
    v_what := array_append(v_what, 'lastNo');
  END IF;

  IF v_new THEN
    INSERT INTO public.mkt_ads (project_id, ads, every, starts_on, figures, targets, last_no, created_by, updated_by)
    VALUES (p_project, v_a.ads, v_a.every, v_a.starts_on, v_a.figures, v_a.targets, v_a.last_no, auth.uid(), auth.uid());
    PERFORM public.mkt_log(p_project, 'ads set up', p_data => jsonb_build_object('every', v_a.every, 'startsOn', v_a.starts_on,
      'ads', cardinality(v_a.ads)));
  ELSIF cardinality(v_what) > 0 THEN
    UPDATE public.mkt_ads
       SET ads = v_a.ads, every = v_a.every, starts_on = v_a.starts_on, figures = v_a.figures, targets = v_a.targets, last_no = v_a.last_no,
           updated_by = auth.uid(), updated_at = now()
     WHERE project_id = p_project;
    PERFORM public.mkt_log(p_project, 'ads changed', p_data => jsonb_build_object('what', to_jsonb(v_what)));
  END IF;
  RETURN public.mkt_ads_view(p_project);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_ads_publish(p_project uuid, p_no integer, p_values jsonb, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_a     public.mkt_ads;
  v_days  date[];
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_vals  jsonb := '{}'::jsonb;
  v_k     text;
  v_x     jsonb;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_again boolean;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Ads reports are not open to your account.');
  PERFORM public.mkt_ads_project(p_project);
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Set up its Ads report first.' USING ERRCODE = 'P0002';
  END IF;
  IF p_no IS NULL OR p_no < 1 OR p_no > 1000 THEN
    RAISE EXCEPTION 'That report is not one of its periods.' USING ERRCODE = '22023';
  END IF;
  v_days := public.mkt_ads_period(v_a.every, v_a.starts_on, p_no);
  -- None after its last report (⑤-3c).
  IF v_a.last_no IS NOT NULL AND p_no > v_a.last_no THEN
    RAISE EXCEPTION 'Its last report is #% — there is no report #%.', v_a.last_no, p_no USING ERRCODE = '22023';
  END IF;
  IF v_days[2] >= v_today THEN
    RAISE EXCEPTION 'Report #% covers % – % — it is published once its last day is over.', p_no,
      to_char(v_days[1], 'FMDD Mon'), to_char(v_days[2], 'FMDD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to publish.' USING ERRCODE = '22023';
  END IF;
  FOR v_k, v_x IN SELECT key, value FROM jsonb_each(p_values) LOOP
    IF v_k <> ALL (v_a.figures) THEN
      RAISE EXCEPTION 'A report shows the figures its setup picked — % is not one.', v_k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_x) = 'null' THEN
      v_vals := v_vals || jsonb_build_object(v_k, NULL);
    ELSIF jsonb_typeof(v_x) = 'number' AND (v_x #>> '{}')::numeric BETWEEN 0 AND 1e12 THEN
      v_vals := v_vals || jsonb_build_object(v_k, round((v_x #>> '{}')::numeric, 4));
    ELSE
      RAISE EXCEPTION 'Each figure is a number from 0 — or left empty.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'A report''s note is 500 characters at most.' USING ERRCODE = '22023';
  END IF;

  v_again := EXISTS (SELECT 1 FROM public.mkt_ads_reports WHERE project_id = p_project AND no = p_no);
  INSERT INTO public.mkt_ads_reports AS r (project_id, no, from_day, until_day, vals, targets, note, published_by, by_name)
  VALUES (p_project, p_no, v_days[1], v_days[2], v_vals, v_a.targets, v_note, auth.uid(), public.mkt_actor())
  ON CONFLICT (project_id, no) DO UPDATE
     SET from_day = excluded.from_day, until_day = excluded.until_day, vals = excluded.vals, targets = excluded.targets,
         note = excluded.note, published_by = excluded.published_by, by_name = excluded.by_name, updated_at = now();
  PERFORM public.mkt_log(p_project, CASE WHEN v_again THEN 'ads report again' ELSE 'ads report' END,
    p_data => jsonb_build_object('no', p_no, 'from', v_days[1], 'until', v_days[2]));
  RETURN public.mkt_ads_view(p_project);
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
        -- …or its Ads report reports on, or its last Report day was within 60 days (⑤-3c): a task done, its ads may run on.
        OR (p.status <> 'cancelled' AND EXISTS (
              SELECT 1 FROM public.mkt_ads a
               WHERE a.project_id = p.id
                 AND (a.last_no IS NULL OR (public.mkt_ads_period(a.every, a.starts_on, a.last_no))[2] + 1 >= v_today - 60)))
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
    -- Each Ads report on it (⑤-3c): how often from when, its last report, the reports out — the calendars reckon its
    -- Report days from them, each the day after its period's last.
    'ads', coalesce((SELECT jsonb_agg(jsonb_build_object(
                       'project', a.project_id, 'every', a.every, 'startsOn', a.starts_on, 'lastNo', a.last_no,
                       'published', coalesce((SELECT jsonb_agg(r.no ORDER BY r.no) FROM public.mkt_ads_reports r
                                               WHERE r.project_id = a.project_id), '[]'::jsonb))
                     ORDER BY a.project_id)
                      FROM public.mkt_ads a WHERE a.project_id = ANY (v_ids)), '[]'::jsonb),
    -- The holidays HR keeps for Selangor (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
END
$fn$;

NOTIFY pgrst, 'reload schema';
