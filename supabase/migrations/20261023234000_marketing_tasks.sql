-- ============================================================================
-- 20261023234000_marketing_tasks.sql
-- Marketing's quick and recurring tasks — ② of the Claude Design handoff "HOUZS Marketing Module Setup" (2026-10-23;
-- the user: "全部照设计做", in order): New Project's ⚡ Quick task and 🔁 Recurring task, the task page's Accept → work
-- → Submit / Complete → Approve / Request changes, the notices that carry a task from person to person, Nudge, and a
-- series paused, resumed or ended. No new table — the last migration's (20261023214100) hold it all.
-- ============================================================================
--
-- The stage machine is the handoff's (hm-store.js):
--   todo (opened for its owner) → accepted (Accept) → review (Submit, when the stage has approvers — each in turn)
--   → done; or → changes (an approver sends it back with a reason) → review again (Submit: the next version).
--   A stage without approvers is completed by its owner (Complete stage). The last stage done closes the task. A
--   stage whose owner is the person starting the task opens accepted (New Project: "phase: first === me ? accepted").
--   Changes asked go back to the stage the builder named ("If changes are requested, go back to which stage?" —
--   spec.back): that stage's owner fixes it and it runs forward again; unnamed, the stage stays where it is.
-- The task page's Free space (notes, headings, checklists anybody on the task adds) lives in the project's canvas,
--   block by block — two people writing at once never undo each other (the user's rule 2026-10-14: save only what
--   changed).
-- Dates (New Project's quick Workflow Builder): the first stage starts the day the task does; each is due its SLA in
--   working days after the one before (the first, after that day) — Monday to Friday, less HR's holidays
--   (Attendance › Holidays; all of them, as the board's). src/lib/marketing/tasks.ts reckons the same for the form.
-- A recurring task is its series (the rule, the stages each run copies; recur.runs = every day it opens a run, from
--   its start, so a run's number is its place there) and a project per run, made up to 60 days ahead and opening on
--   its day: before it, the run is on no board and nobody may accept it. Nothing runs on a clock, so every Marketing
--   write tops the series up (mkt_top_up_due); a series ends after its last run. Paused: its runs not yet open wait
--   (those whose day passes meanwhile are skipped); ended: they are cancelled. Run numbers stop at 999 (the Track ID).
-- Writes (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted), each asking its cell:
--   mkt_task_create(…)                              Marketing · Create
--   mkt_stage_accept / mkt_stage_save / mkt_stage_submit   Marketing · Edit, on the caller's own stage
--   mkt_stage_decide(…)                             Marketing · Approve, as the stage's approver now
--   mkt_free_block(…)                               Marketing · Edit, on a task one is on (Manage: any)
--   mkt_nudge(…) / mkt_series_set(…)                Marketing · Manage
-- Reader: mkt_project(key) — Marketing · View: one project by id or Track ID with its stages' work, its trail, its
--   series and runs.
-- mkt_board and mkt_shell again, from production's bodies (md5 compared 2026-10-23), one condition each: a run before
--   its day, or held by a pause, is not on the board and on nobody's plate.
-- The page New Project (`/marketing/new`) joins the database's copy of the tab registry: the Projects tab.
-- PGlite: tests/member-sql/validate-marketing-tasks.mjs.

-- ── Helpers (nobody's to call but the functions below) ──────────────────────

-- A People record's name as Marketing writes it: their first name, else the first word of their name.
CREATE OR REPLACE FUNCTION public.mkt_staff_name(p_staff uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN (SELECT coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1))
            FROM public.hr_staff_costs s WHERE s.id = p_staff);
END
$fn$;

-- Who is doing it: their People name, else their login's name.
CREATE OR REPLACE FUNCTION public.mkt_actor()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN left(coalesce(public.mkt_staff_name(public.mkt_me_staff()),
                       (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = auth.uid()),
                       'Someone'), 120);
END
$fn$;

-- One line on a project's trail, as the caller.
CREATE OR REPLACE FUNCTION public.mkt_log(p_project uuid, p_action text, p_stage integer DEFAULT NULL,
  p_stage_name text DEFAULT NULL, p_from_to text DEFAULT NULL, p_reason text DEFAULT NULL, p_version text DEFAULT NULL,
  p_data jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason,
                                 version, data)
  VALUES (p_project, auth.uid(), public.mkt_actor(), p_action, p_stage, left(p_stage_name, 80), left(p_from_to, 200),
          left(p_reason, 1000), left(p_version, 60), p_data);
END
$fn$;

-- A Marketing notice to a person (their login), never to whoever is doing it.
CREATE OR REPLACE FUNCTION public.mkt_notify(p_staff uuid, p_project uuid, p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id, data)
  SELECT u.id, 'marketing', left(p_title, 200), left(coalesce(p_body, ''), 400), 'mkt_project', p_project::text,
         jsonb_build_object('type', p_type, 'track', (SELECT p.track_id FROM public.mkt_projects p WHERE p.id = p_project))
    FROM public.hr_staff_costs s
    JOIN public.users u ON u.id = s.user_id
   WHERE s.id = p_staff AND u.is_active AND u.id IS DISTINCT FROM auth.uid();
END
$fn$;

-- Each stage's first and last day from the day the work starts and each stage's SLA (working days).
CREATE OR REPLACE FUNCTION public.mkt_stage_dates(p_base date, p_slas integer[])
RETURNS TABLE (idx integer, starts_on date, due_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hol   date[] := ARRAY(SELECT h.day FROM public.att_holidays h WHERE h.deleted_at IS NULL AND h.day > p_base);
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

-- The days a series' rule opens a run on, from its start up to a day (and its end), at most so many — New Project's
-- Repeat (src/lib/marketing/recur.ts draws the same preview): every day; every 1, 2 or 4 weeks on the weekdays picked
-- (1 = Monday … 7 = Sunday; weeks counted from the start's); every month on the 1st, the 15th or the last day.
CREATE OR REPLACE FUNCTION public.mkt_recur_days(p_rule jsonb, p_until date, p_cap integer)
RETURNS date[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_freq  text := p_rule ->> 'freq';
  v_start date := (p_rule ->> 'start')::date;
  v_end   date := CASE WHEN p_rule ->> 'endMode' = 'date' THEN (p_rule ->> 'end')::date END;
  v_cap   integer := least(greatest(coalesce(p_cap, 0), 0),
                           CASE WHEN p_rule ->> 'endMode' = 'count' THEN (p_rule ->> 'count')::integer ELSE 999 END);
  v_every integer := greatest(coalesce((p_rule ->> 'every')::integer, 1), 1);
  v_days  integer[] := ARRAY(SELECT x::integer FROM jsonb_array_elements_text(
                               CASE WHEN jsonb_typeof(p_rule -> 'days') = 'array' THEN p_rule -> 'days' ELSE '[]'::jsonb END) x);
  v_mday  text := coalesce(p_rule ->> 'mday', '1');
  v_week0 date;
  v_day   date;
  v_out   date[] := '{}';
  v_n     integer := 0;
  v_hit   boolean;
BEGIN
  IF v_start IS NULL THEN
    RETURN v_out;
  END IF;
  v_week0 := v_start - (extract(isodow FROM v_start)::integer - 1);
  v_day := v_start;
  WHILE v_n < v_cap AND v_day <= p_until AND (v_end IS NULL OR v_day <= v_end) LOOP
    v_hit := CASE v_freq
      WHEN 'daily' THEN true
      WHEN 'weekly' THEN extract(isodow FROM v_day)::integer = ANY (v_days) AND ((v_day - v_week0) / 7) % v_every = 0
      WHEN 'monthly' THEN CASE WHEN v_mday = 'last'
                               THEN v_day = (date_trunc('month', v_day) + interval '1 month' - interval '1 day')::date
                               ELSE extract(day FROM v_day)::integer = v_mday::integer END
      ELSE false END;
    IF v_hit THEN
      v_out := v_out || v_day;
      v_n := v_n + 1;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN v_out;
END
$fn$;

-- The next Track ID for a subsidiary this month: PREFIX-CODE-YYMM-NNN, the number shared by its projects, quick and
-- recurring tasks (the handoff: MKT-CAR-2610-014, TSK-CAR-2610-031).
CREATE OR REPLACE FUNCTION public.mkt_next_track(p_prefix text, p_code text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ym text := to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YYMM');
  v_n  integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mkt_track:' || p_code || '-' || v_ym));
  SELECT coalesce(max(split_part(p.track_id, '-', 4)::integer), 0) + 1 INTO v_n
    FROM public.mkt_projects p
   WHERE p.series_id IS NULL AND split_part(p.track_id, '-', 2) = p_code AND split_part(p.track_id, '-', 3) = v_ym;
  IF v_n > 999 THEN
    RAISE EXCEPTION '% has 999 projects and tasks this month already.', p_code USING ERRCODE = '54000';
  END IF;
  RETURN p_prefix || '-' || p_code || '-' || v_ym || '-' || lpad(v_n::text, 3, '0');
END
$fn$;

-- What a stage still needs before it is handed on: each field of its form not filled in (a box not ticked); a stage
-- with no field, a note or a link. Empty = ready (src/lib/marketing/tasks.ts asks the same for the button).
CREATE OR REPLACE FUNCTION public.mkt_stage_missing(p_spec jsonb, p_work jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_form   jsonb := CASE WHEN jsonb_typeof(p_spec -> 'form') = 'array' THEN p_spec -> 'form' ELSE '[]'::jsonb END;
  v_vals   jsonb := CASE WHEN jsonb_typeof(p_work -> 'vals') = 'object' THEN p_work -> 'vals' ELSE '{}'::jsonb END;
  v_links  jsonb := CASE WHEN jsonb_typeof(p_work -> 'links') = 'array' THEN p_work -> 'links' ELSE '[]'::jsonb END;
  v_out    text[] := '{}';
  v_inputs integer := 0;
  f        jsonb;
  v        jsonb;
BEGIN
  FOR f IN SELECT x FROM jsonb_array_elements(v_form) x LOOP
    CONTINUE WHEN f ->> 'type' IN ('Note', 'Table');
    v_inputs := v_inputs + 1;
    v := v_vals -> (f ->> 'label');
    IF v IS NULL OR jsonb_typeof(v) = 'null' OR v = 'false'::jsonb
       OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '') THEN
      v_out := v_out || (f ->> 'label');
    END IF;
  END LOOP;
  IF v_inputs = 0 AND btrim(coalesce(p_work ->> 'notes', '')) = '' AND jsonb_array_length(v_links) = 0 THEN
    v_out := v_out || 'a note or a link'::text;
  END IF;
  RETURN v_out;
END
$fn$;

-- One run of a series: its project and its stages, dated from the day it opens.
CREATE OR REPLACE FUNCTION public.mkt_run_make(p_series uuid, p_run integer, p_day date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s   public.mkt_projects;
  v_id  uuid;
  v_due date;
BEGIN
  SELECT * INTO v_s FROM public.mkt_projects WHERE id = p_series;
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, q_type, brief, owner_staff, cur,
                                   series_id, run_no, starts_on, created_by)
  VALUES (v_s.track_id || '-R' || lpad(p_run::text, CASE WHEN p_run >= 100 THEN 3 ELSE 2 END, '0'), 'recurring',
          v_s.subsidiary_id, v_s.title, 'active', v_s.q_type, v_s.brief, v_s.owner_staff, 0, p_series, p_run, p_day,
          v_s.created_by)
  RETURNING id INTO v_id;
  INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, extra, cands, sla, appr, split, spec,
                                 starts_on, due_on, status, entered_at, accepted_at)
  SELECT v_id, s.idx, s.name, s.dept, s.mode, s.owner_staff, s.extra, s.cands, s.sla, s.appr, s.split, s.spec,
         d.starts_on, d.due_on,
         CASE WHEN s.idx > 0 THEN 'planned' WHEN s.owner_staff = v_s.owner_staff THEN 'accepted' ELSE 'todo' END,
         CASE WHEN s.idx = 0 THEN p_day::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END,
         CASE WHEN s.idx = 0 AND s.owner_staff = v_s.owner_staff THEN p_day::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END
    FROM public.mkt_stages s
    JOIN public.mkt_stage_dates(p_day, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = p_series ORDER BY x.idx)) d
      ON d.idx = s.idx
   WHERE s.project_id = p_series;
  SELECT max(s.due_on) INTO v_due FROM public.mkt_stages s WHERE s.project_id = v_id;
  UPDATE public.mkt_projects SET due_on = v_due WHERE id = v_id;
  RETURN v_id;
END
$fn$;

-- A series kept up to date: every day its rule opens a run on (recur.runs), and a project for each run that opens
-- within 60 days. Nothing for a series paused or ended.
CREATE OR REPLACE FUNCTION public.mkt_series_top_up(p_series uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_s     public.mkt_projects;
  v_days  date[];
  v_k     integer;
  v_made  integer := 0;
BEGIN
  SELECT * INTO v_s FROM public.mkt_projects
   WHERE id = p_series AND kind = 'recurring' AND series_id IS NULL FOR UPDATE;
  IF NOT FOUND OR v_s.status <> 'active' THEN
    RETURN 0;
  END IF;
  v_days := public.mkt_recur_days(v_s.recur -> 'rule', v_today + 400, 999);
  IF (v_s.recur -> 'runs') IS DISTINCT FROM to_jsonb(v_days) THEN
    UPDATE public.mkt_projects SET recur = jsonb_set(recur, '{runs}', to_jsonb(v_days)) WHERE id = v_s.id;
  END IF;
  SELECT coalesce(max(p.run_no), 0) + 1 INTO v_k FROM public.mkt_projects p WHERE p.series_id = v_s.id;
  WHILE v_k <= coalesce(array_length(v_days, 1), 0) AND v_days[v_k] <= v_today + 60 LOOP
    PERFORM public.mkt_run_make(v_s.id, v_k, v_days[v_k]);
    v_made := v_made + 1;
    v_k := v_k + 1;
  END LOOP;
  RETURN v_made;
END
$fn$;

-- A series whose last run is made and no longer open has ended.
CREATE OR REPLACE FUNCTION public.mkt_series_settle(p_series uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s     public.mkt_projects;
  v_total integer;
BEGIN
  SELECT * INTO v_s FROM public.mkt_projects
   WHERE id = p_series AND kind = 'recurring' AND series_id IS NULL AND status IN ('active', 'paused') FOR UPDATE;
  IF NOT FOUND OR v_s.recur -> 'rule' ->> 'endMode' NOT IN ('date', 'count') THEN
    RETURN;
  END IF;
  v_total := coalesce(array_length(public.mkt_recur_days(v_s.recur -> 'rule',
               coalesce((v_s.recur -> 'rule' ->> 'end')::date, (v_s.recur -> 'rule' ->> 'start')::date + 3650), 999), 1), 0);
  IF (SELECT count(*) FROM public.mkt_projects p WHERE p.series_id = v_s.id) >= v_total
     AND NOT EXISTS (SELECT 1 FROM public.mkt_projects p WHERE p.series_id = v_s.id AND p.status IN ('active', 'paused')) THEN
    UPDATE public.mkt_projects
       SET status = 'done', done_at = now(), updated_at = now(), recur = jsonb_set(recur, '{status}', '"ended"')
     WHERE id = v_s.id;
    PERFORM public.mkt_log(v_s.id, 'ended', p_data => jsonb_build_object('after', 'last run'));
  END IF;
END
$fn$;

-- Every series that runs out of made runs within a month gets its next ones (any Marketing write asks).
CREATE OR REPLACE FUNCTION public.mkt_top_up_due()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_id    uuid;
BEGIN
  FOR v_id IN
    SELECT s.id FROM public.mkt_projects s
     WHERE s.kind = 'recurring' AND s.series_id IS NULL AND s.status = 'active'
       AND (s.recur -> 'rule' ->> 'endMode' = 'never'
            OR jsonb_array_length(coalesce(s.recur -> 'runs', '[]'::jsonb))
               > (SELECT count(*) FROM public.mkt_projects r WHERE r.series_id = s.id))
       AND coalesce((SELECT max(r.starts_on) FROM public.mkt_projects r WHERE r.series_id = s.id), v_today - 1) < v_today + 30
  LOOP
    PERFORM public.mkt_series_top_up(v_id);
  END LOOP;
END
$fn$;

-- The stage now handed on: done, and the next one opened for its owner — or, the last, the task closed.
CREATE OR REPLACE FUNCTION public.mkt_advance(p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_next public.mkt_stages;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  UPDATE public.mkt_stages SET status = 'done', done_at = now(), appr_idx = 0
   WHERE project_id = v_p.id AND idx = v_p.cur;
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1;
  IF NOT FOUND THEN
    UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'closed');
    IF v_p.series_id IS NOT NULL THEN
      PERFORM public.mkt_series_settle(v_p.series_id);
    END IF;
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET cur = v_next.idx, updated_at = now() WHERE id = v_p.id;
  UPDATE public.mkt_stages SET status = 'todo', entered_at = now(), appr_idx = 0, changes = NULL
   WHERE project_id = v_p.id AND idx = v_next.idx;
  PERFORM public.mkt_log(v_p.id, 'opened', v_next.idx, v_next.name, public.mkt_staff_name(v_next.owner_staff));
  IF v_next.owner_staff IS NOT NULL THEN
    PERFORM public.mkt_notify(v_next.owner_staff, v_p.id, 'Your turn: ' || v_next.name,
                              v_p.track_id || ' · ' || v_p.title, 'open');
  END IF;
END
$fn$;

-- A project to work on: there, open, past its day — or refused in words.
CREATE OR REPLACE FUNCTION public.mkt_open_project(p_project uuid)
RETURNS public.mkt_projects
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_p     public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.kind = 'recurring' AND v_p.series_id IS NULL THEN
    RAISE EXCEPTION 'A recurring task is worked run by run.' USING ERRCODE = '22023';
  END IF;
  IF v_p.status <> 'active' THEN
    RAISE EXCEPTION 'That task is not open (%).', v_p.status USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_p.starts_on, v_today) > v_today THEN
    RAISE EXCEPTION 'It opens on %.', to_char(v_p.starts_on, 'FMDD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  RETURN v_p;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_staff_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_log(uuid, text, integer, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_notify(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_stage_dates(date, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_recur_days(jsonb, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_next_track(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_stage_missing(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_run_make(uuid, integer, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_series_top_up(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_series_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_top_up_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_advance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_open_project(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_staff_name(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_actor() TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_log(uuid, text, integer, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_notify(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_stage_dates(date, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_recur_days(jsonb, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_next_track(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_stage_missing(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_run_make(uuid, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_series_top_up(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_series_settle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_top_up_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_advance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_open_project(uuid) TO service_role;

-- ── New Project: a quick task or a recurring one ────────────────────────────
-- p_stages: [{ name, dept, who (a People id on Marketing's roster), sla (working days, 1–30), appr ([People ids],
-- at most 3, in order), form ([{ label, type, cols? }]), back (an earlier stage's place, or none) }], 1 to 20.
-- p_recur (a recurring task): { freq: daily |
-- weekly | monthly, days ([1–7], weekly), every (1, 2 or 4, weekly), mday ('1', '15', 'last', monthly), start
-- (a day, not before today), endMode: date | count | never, end (a day, endMode date), count (1–60) }.
-- Answers { id, track, open }: open = the project to show (the task; a recurring task's first run, else its series).
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
    IF coalesce(v_st ->> 'dept', '') NOT IN ('content', 'social', 'design', 'ads', 'brand') THEN
      RAISE EXCEPTION 'Stage %: pick its team.', i + 1 USING ERRCODE = '22023';
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
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('name', v_name, 'dept', v_st ->> 'dept', 'who', v_who,
                 'sla', v_sla, 'appr', v_appr, 'form', v_form, 'back', v_back));
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

-- ── A stage: Accept, the work saved, Submit / Complete ──────────────────────

CREATE OR REPLACE FUNCTION public.mkt_stage_accept(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
  v_p  public.mkt_projects;
  v_s  public.mkt_stages;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status = 'todo' THEN
    UPDATE public.mkt_stages SET status = 'accepted', accepted_at = now() WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'accepted', v_s.idx, v_s.name);
  ELSIF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'This stage is not waiting to be accepted.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- p_work: what changed of the stage's work — { notes, links: [{ url, label }], vals: { <field>: text | true / false |
-- null (cleared) } }: a part left out stays as it was, a field left out of vals too.
CREATE OR REPLACE FUNCTION public.mkt_stage_save(p_project uuid, p_work jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_notes text;
  v_links jsonb := '[]'::jsonb;
  v_vals  jsonb;
  v_ok    text[];
  v_l     jsonb;
  v_k     text;
  v_v     jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_work) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  v_notes := CASE WHEN p_work ? 'notes' THEN coalesce(p_work ->> 'notes', '') ELSE coalesce(v_s.work ->> 'notes', '') END;
  IF length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'Notes: at most 4,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_work ? 'links' THEN
    IF jsonb_typeof(p_work -> 'links') IS DISTINCT FROM 'array' OR jsonb_array_length(p_work -> 'links') > 20 THEN
      RAISE EXCEPTION 'At most 20 links.' USING ERRCODE = '22023';
    END IF;
    FOR v_l IN SELECT x FROM jsonb_array_elements(p_work -> 'links') x LOOP
      IF coalesce(v_l ->> 'url', '') !~* '^https?://[^\s]+$' OR length(v_l ->> 'url') > 500 THEN
        RAISE EXCEPTION 'A link starts with https:// (at most 500 characters).' USING ERRCODE = '22023';
      END IF;
      v_links := v_links || jsonb_build_array(jsonb_build_object('url', v_l ->> 'url',
                   'label', left(btrim(coalesce(v_l ->> 'label', '')), 80)));
    END LOOP;
  ELSE
    v_links := CASE WHEN jsonb_typeof(v_s.work -> 'links') = 'array' THEN v_s.work -> 'links' ELSE '[]'::jsonb END;
  END IF;
  -- Only the stage's own fields, each a text or a tick, merged over what was there.
  v_vals := CASE WHEN jsonb_typeof(v_s.work -> 'vals') = 'object' THEN v_s.work -> 'vals' ELSE '{}'::jsonb END;
  v_ok := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                 WHERE f ->> 'type' NOT IN ('Note', 'Table'));
  IF jsonb_typeof(p_work -> 'vals') = 'object' THEN
    FOR v_k, v_v IN SELECT * FROM jsonb_each(p_work -> 'vals') LOOP
      CONTINUE WHEN NOT (v_k = ANY (v_ok));
      IF jsonb_typeof(v_v) = 'null' THEN
        v_vals := v_vals - v_k;
      ELSIF jsonb_typeof(v_v) = 'boolean' THEN
        v_vals := v_vals || jsonb_build_object(v_k, v_v);
      ELSIF jsonb_typeof(v_v) IN ('string', 'number') THEN
        IF length(v_v #>> '{}') > 2000 THEN
          RAISE EXCEPTION '"%": at most 2,000 characters.', v_k USING ERRCODE = '22023';
        END IF;
        v_vals := v_vals || jsonb_build_object(v_k, v_v #>> '{}');
      END IF;
    END LOOP;
  END IF;
  UPDATE public.mkt_stages SET work = jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals)
   WHERE project_id = v_p.id AND idx = v_s.idx;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  RETURN jsonb_build_object('id', v_p.id, 'missing', to_jsonb(public.mkt_stage_missing(v_s.spec,
           jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals))));
END
$fn$;

-- Hand the stage on: to its first approver (the next version), or — none — completed, the next stage opened.
-- p_pick: the person the next stage goes to, when it is the previous stage's to pick.
CREATE OR REPLACE FUNCTION public.mkt_stage_submit(p_project uuid, p_pick uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := public.mkt_me_staff();
  v_p       public.mkt_projects;
  v_s       public.mkt_stages;
  v_next    public.mkt_stages;
  v_missing text[];
  v_first   jsonb;
  v_ver     integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  v_missing := public.mkt_stage_missing(v_s.spec, v_s.work);
  IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Fill in %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  -- The next stage, when it is this stage's owner's to pick (🔓).
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1 FOR UPDATE;
  IF FOUND AND v_next.mode = 'prev' AND v_next.owner_staff IS NULL THEN
    IF p_pick IS NULL OR NOT (p_pick = ANY (v_next.cands)) THEN
      RAISE EXCEPTION 'Pick who takes % next.', v_next.name USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_stages SET owner_staff = p_pick WHERE project_id = v_p.id AND idx = v_next.idx;
    PERFORM public.mkt_log(v_p.id, 'picked', v_next.idx, v_next.name, public.mkt_staff_name(p_pick));
  END IF;
  v_first := v_s.appr -> 0;
  IF v_first IS NOT NULL THEN
    v_ver := v_s.ver + 1;
    UPDATE public.mkt_stages
       SET status = 'review', ver = v_ver, appr_idx = 0, submitted_at = now(), changes = NULL
     WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'submitted', v_s.idx, v_s.name,
              CASE WHEN v_first ->> 'kind' = 'pic' THEN 'PIC' ELSE public.mkt_staff_name((v_first ->> 'staff')::uuid) END,
              p_version => 'v' || v_ver);
    IF v_first ->> 'kind' = 'person' THEN
      PERFORM public.mkt_notify((v_first ->> 'staff')::uuid, v_p.id,
                public.mkt_actor() || ' submitted ' || v_s.name || ' v' || v_ver || ' for your approval',
                v_p.track_id || ' · ' || v_p.title, 'review');
    END IF;
  ELSE
    PERFORM public.mkt_log(v_p.id, 'completed', v_s.idx, v_s.name);
    PERFORM public.mkt_advance(v_p.id);
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── An approver's answer ────────────────────────────────────────────────────
-- Approve: to the next approver, or — the last — the stage done and the next one opened. Request changes (a reason):
-- back to its owner, who fixes it and submits the next version.
CREATE OR REPLACE FUNCTION public.mkt_stage_decide(p_project uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := public.mkt_me_staff();
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_now    jsonb;
  v_then   jsonb;
  v_back   integer;
  v_to     public.mkt_stages;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.approve'], 'Approving is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_s.status <> 'review' THEN
    RAISE EXCEPTION 'Nothing is waiting for approval on this task.' USING ERRCODE = '22023';
  END IF;
  v_now := v_s.appr -> v_s.appr_idx;
  IF v_me IS NULL OR v_now ->> 'kind' IS DISTINCT FROM 'person' OR v_now ->> 'staff' IS DISTINCT FROM v_me::text THEN
    RAISE EXCEPTION 'This approval is not yours.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve, or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_approve THEN
    v_then := v_s.appr -> (v_s.appr_idx + 1);
    IF v_then IS NOT NULL THEN
      UPDATE public.mkt_stages SET appr_idx = appr_idx + 1 WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      PERFORM public.mkt_log(v_p.id, 'approved', v_s.idx, v_s.name,
                CASE WHEN v_then ->> 'kind' = 'pic' THEN 'PIC' ELSE public.mkt_staff_name((v_then ->> 'staff')::uuid) END,
                p_version => 'v' || v_s.ver);
      IF v_then ->> 'kind' = 'person' THEN
        PERFORM public.mkt_notify((v_then ->> 'staff')::uuid, v_p.id,
                  public.mkt_staff_name(v_s.owner_staff) || ' submitted ' || v_s.name || ' v' || v_s.ver || ' for your approval',
                  v_p.track_id || ' · ' || v_p.title, 'review');
      END IF;
    ELSE
      PERFORM public.mkt_log(v_p.id, 'approved', v_s.idx, v_s.name, p_version => 'v' || v_s.ver);
      PERFORM public.mkt_advance(v_p.id);
    END IF;
  ELSE
    IF length(v_reason) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Say what to change (at most 1,000 characters).' USING ERRCODE = '22023';
    END IF;
    v_back := CASE WHEN jsonb_typeof(v_s.spec -> 'back') = 'number' THEN (v_s.spec ->> 'back')::integer END;
    IF v_back IS NOT NULL AND v_back < v_s.idx THEN
      -- Back to the stage the builder named: it takes the changes; this one and those between wait for it again.
      SELECT * INTO v_to FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_back FOR UPDATE;
      UPDATE public.mkt_stages SET status = 'planned', appr_idx = 0, changes = NULL, done_at = NULL
       WHERE project_id = v_p.id AND idx > v_back AND idx <= v_s.idx;
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0, entered_at = now(), done_at = NULL,
             changes = jsonb_build_object('by', public.mkt_actor(), 'staff', v_me, 'reason', v_reason, 'at', now(),
                                          'ver', v_s.ver, 'from', v_s.name)
       WHERE project_id = v_p.id AND idx = v_back;
      UPDATE public.mkt_projects SET cur = v_back, updated_at = now() WHERE id = v_p.id;
      PERFORM public.mkt_log(v_p.id, 'changes', v_s.idx, v_s.name, public.mkt_staff_name(v_to.owner_staff), v_reason,
                             'v' || v_s.ver, jsonb_build_object('back', v_back, 'to', v_to.name));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                                '"' || v_reason || '"', 'changes');
    ELSE
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0,
             changes = jsonb_build_object('by', public.mkt_actor(), 'staff', v_me, 'reason', v_reason, 'at', now(), 'ver', v_s.ver)
       WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      PERFORM public.mkt_log(v_p.id, 'changes', v_s.idx, v_s.name, public.mkt_staff_name(v_s.owner_staff), v_reason,
                             'v' || v_s.ver);
      PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, 'Changes requested on ' || v_s.name, '"' || v_reason || '"', 'changes');
    END IF;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── The task page's Free space ──────────────────────────────────────────────
-- p_op 'put': a block { id, type: text | heading | check | divider, text, done } added, or its text and tick changed;
-- 'remove': the block with that id gone. Anybody on the task writes here (its owner, a stage's owner or approver, a
-- subtask's), and a manager. Answers the blocks as they now stand.
CREATE OR REPLACE FUNCTION public.mkt_free_block(p_project uuid, p_op text, p_block jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := public.mkt_me_staff();
  v_p    public.mkt_projects;
  v_free jsonb;
  v_id   text := p_block ->> 'id';
  v_type text := p_block ->> 'type';
  v_text text := left(coalesce(p_block ->> 'text', ''), 2000);
  v_done boolean := coalesce(p_block ->> 'done', 'false') = 'true';
  v_at   integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit', 'marketing.manage'], 'Writing on a task is not open to your account.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status = 'cancelled' THEN
    RAISE EXCEPTION 'That task was cancelled.' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(public.has_any_action(ARRAY['marketing.manage']), false)
     AND (v_me IS NULL OR NOT (v_p.owner_staff = v_me
       OR EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = v_p.id
                     AND (s.owner_staff = v_me OR s.appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_me))))
       OR EXISTS (SELECT 1 FROM public.mkt_subtasks t WHERE t.project_id = v_p.id AND t.assignee = v_me))) THEN
    RAISE EXCEPTION 'Only the people on this task write in its free space.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_id, '') !~ '^[a-z0-9]{6,16}$' THEN
    RAISE EXCEPTION 'A block needs its id.' USING ERRCODE = '22023';
  END IF;
  v_free := CASE WHEN jsonb_typeof(v_p.canvas -> 'free') = 'array' THEN v_p.canvas -> 'free' ELSE '[]'::jsonb END;
  SELECT (x.o - 1)::integer INTO v_at FROM jsonb_array_elements(v_free) WITH ORDINALITY AS x(b, o) WHERE x.b ->> 'id' = v_id;
  IF p_op = 'remove' THEN
    IF v_at IS NOT NULL THEN
      v_type := v_free -> v_at ->> 'type';
      v_free := v_free - v_at;
    END IF;
  ELSIF p_op = 'put' THEN
    IF v_at IS NULL THEN
      IF coalesce(v_type, '') NOT IN ('text', 'heading', 'check', 'divider') THEN
        RAISE EXCEPTION 'A text, a heading, a checklist item or a divider.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_free) >= 100 THEN
        RAISE EXCEPTION 'At most 100 blocks.' USING ERRCODE = '22023';
      END IF;
      v_free := v_free || jsonb_build_array(jsonb_build_object('id', v_id, 'type', v_type, 'text', v_text, 'done', v_done,
                                                               'by', public.mkt_actor(), 'at', now()));
    ELSE
      v_type := v_free -> v_at ->> 'type';
      v_free := jsonb_set(v_free, ARRAY[v_at::text], (v_free -> v_at) || jsonb_build_object('text', v_text, 'done', v_done));
    END IF;
  ELSE
    RAISE EXCEPTION 'Put or remove.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects SET canvas = jsonb_set(coalesce(canvas, '{}'::jsonb), '{free}', v_free), updated_at = now()
   WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'free', p_data => jsonb_build_object('op', p_op, 'type', v_type));
  RETURN v_free;
END
$fn$;

-- ── The manager's: Nudge, and a series paused, resumed or ended ─────────────

-- A notice to whoever the task waits on now (its stage's owner, or its approver), at most one an hour each.
CREATE OR REPLACE FUNCTION public.mkt_nudge(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_s    public.mkt_stages;
  v_who  uuid;
  v_user uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Nudging is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur;
  v_who := CASE WHEN v_s.status = 'review' THEN
                  CASE WHEN v_s.appr -> v_s.appr_idx ->> 'kind' = 'person' THEN (v_s.appr -> v_s.appr_idx ->> 'staff')::uuid END
                ELSE v_s.owner_staff END;
  IF v_who IS NULL THEN
    RAISE EXCEPTION 'It waits for the PIC — nobody here to nudge.' USING ERRCODE = '22023';
  END IF;
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = v_who;
  IF v_user IS NULL THEN
    RAISE EXCEPTION '% has no login yet.', public.mkt_staff_name(v_who) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_notifications n
              WHERE n.user_id = v_user AND n.kind = 'marketing' AND n.ref_id = v_p.id::text
                AND n.data ->> 'type' = 'nudge' AND n.created_at > now() - interval '1 hour') THEN
    RETURN jsonb_build_object('id', v_p.id, 'who', public.mkt_staff_name(v_who), 'already', true);
  END IF;
  PERFORM public.mkt_notify(v_who, v_p.id, public.mkt_actor() || ' nudged you: ' || v_s.name,
                            v_p.track_id || ' · ' || v_p.title, 'nudge');
  PERFORM public.mkt_log(v_p.id, 'nudged', v_s.idx, v_s.name, public.mkt_staff_name(v_who));
  RETURN jsonb_build_object('id', v_p.id, 'who', public.mkt_staff_name(v_who), 'already', false);
END
$fn$;

-- p_to: 'pause' (runs not yet open wait), 'resume' (they open again; those whose day passed meanwhile are skipped),
-- 'end' (runs not yet open are cancelled). A run already open carries on.
CREATE OR REPLACE FUNCTION public.mkt_series_set(p_series uuid, p_to text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_s     public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Pausing or ending a recurring task is not open to your account.');
  SELECT * INTO v_s FROM public.mkt_projects WHERE id = p_series AND kind = 'recurring' AND series_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That recurring task is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF p_to = 'pause' THEN
    IF v_s.status <> 'active' THEN
      RAISE EXCEPTION 'Only a running series can be paused.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_projects SET status = 'paused', updated_at = now(), recur = jsonb_set(recur, '{status}', '"paused"')
     WHERE id = v_s.id;
    UPDATE public.mkt_projects SET status = 'paused', updated_at = now()
     WHERE series_id = v_s.id AND status = 'active' AND starts_on > v_today;
    PERFORM public.mkt_log(v_s.id, 'paused');
  ELSIF p_to = 'resume' THEN
    IF v_s.status <> 'paused' THEN
      RAISE EXCEPTION 'Only a paused series can be resumed.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_projects SET status = 'active', updated_at = now(), recur = jsonb_set(recur, '{status}', '"active"')
     WHERE id = v_s.id;
    UPDATE public.mkt_projects SET status = CASE WHEN starts_on > v_today THEN 'active' ELSE 'cancelled' END, updated_at = now()
     WHERE series_id = v_s.id AND status = 'paused';
    PERFORM public.mkt_log(v_s.id, 'resumed');
    PERFORM public.mkt_series_top_up(v_s.id);
  ELSIF p_to = 'end' THEN
    IF v_s.status NOT IN ('active', 'paused') THEN
      RAISE EXCEPTION 'This series has ended already.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now(),
                                   recur = jsonb_set(recur, '{status}', '"ended"')
     WHERE id = v_s.id;
    UPDATE public.mkt_projects SET status = 'cancelled', updated_at = now()
     WHERE series_id = v_s.id AND (status = 'paused' OR (status = 'active' AND starts_on > v_today));
    PERFORM public.mkt_log(v_s.id, 'ended');
  ELSE
    RAISE EXCEPTION 'Pause, resume or end.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', v_s.id, 'track', v_s.track_id);
END
$fn$;

-- ── The task page's reader ──────────────────────────────────────────────────
-- One project by its id or Track ID: the project, its stages with their forms and work, its subtasks, its trail, the
-- series it is a run of (or its runs, a series) — and the roster and subsidiary its names come from.
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
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366), '[]'::jsonb));
END
$fn$;

-- ── The board and the sidebar again: a run before its day, or held by a pause, is nobody's yet ─────

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
    -- Every holiday HR keeps (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366), '[]'::jsonb));
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_shell()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me    uuid := public.mkt_me_staff();
  v_mine  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  -- What is on the caller's plate: their stages to accept, work on or fix, the approvals waiting for them, the
  -- deliveries of their subtasks waiting for their review — each with the subsidiary it is for and its due date. A
  -- task before its day (a run of a recurring task) is nobody's yet.
  WITH turn AS (
    SELECT p.subsidiary_id AS sub, s.due_on AS due
      FROM public.mkt_stages s JOIN public.mkt_projects p ON p.id = s.project_id
     WHERE v_me IS NOT NULL AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL) AND p.cur = s.idx
       AND coalesce(p.starts_on, v_today) <= v_today
       AND ((s.owner_staff = v_me AND s.status IN ('todo', 'accepted', 'changes'))
         OR (s.status = 'review' AND (s.appr -> s.appr_idx ->> 'kind') = 'person' AND (s.appr -> s.appr_idx ->> 'staff') = v_me::text))
    UNION ALL
    SELECT p.subsidiary_id, t.due_on
      FROM public.mkt_subtasks t
      JOIN public.mkt_stages s ON s.project_id = t.project_id AND s.idx = t.stage_idx
      JOIN public.mkt_projects p ON p.id = t.project_id
     WHERE v_me IS NOT NULL AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
       AND coalesce(p.starts_on, v_today) <= v_today
       AND p.cur = s.idx AND s.status IN ('accepted', 'changes')
       AND ((s.owner_staff = v_me AND t.assignee <> v_me AND t.status = 'ready')
         OR (t.assignee = v_me AND s.owner_staff IS DISTINCT FROM v_me AND t.status IN ('working', 'revising')))
  )
  SELECT jsonb_build_object(
           'turn', count(*),
           'today', count(*) FILTER (WHERE due <= v_today),
           'subs', coalesce(jsonb_object_agg(sub, n) FILTER (WHERE sub IS NOT NULL), '{}'::jsonb))
    INTO v_mine
    FROM (SELECT sub, due, count(*) OVER (PARTITION BY sub) AS n FROM turn) z;
  RETURN jsonb_build_object(
    'today', v_today,
    'me', (SELECT jsonb_build_object('id', r.staff_id, 'full', r.full_name, 'first', r.first_name, 'title', r.title,
                                     'team', r.team, 'role', r.role_label, 'color', r.color)
             FROM public.mkt_roster() r WHERE r.staff_id = v_me),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot,
                                         'emoji', x.emoji, 'client', x.company_id IS NULL,
                                         'count', coalesce((v_mine -> 'subs' ->> x.id::text)::int, 0))
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'counts', jsonb_build_object(
      'myspace', coalesce((v_mine ->> 'turn')::int, 0),
      'calendar', coalesce((v_mine ->> 'today')::int, 0),
      -- Product projects waiting for their manager: minutes to finish, the PIC's changes, a plan to make.
      'projects', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage', 'marketing.create']), false) THEN
                    (SELECT count(*) FROM public.mkt_projects p WHERE p.status IN ('minutes', 'changes', 'approved')) ELSE 0 END,
      -- Ongoing stages past their due date, for whoever tracks them.
      'tracking', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage']), false) THEN
                    (SELECT count(*) FROM public.mkt_stages s JOIN public.mkt_projects p ON p.id = s.project_id
                      WHERE p.cur = s.idx AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
                        AND coalesce(p.starts_on, v_today) <= v_today
                        AND s.status IN ('todo', 'accepted', 'review', 'changes') AND s.due_on < v_today) ELSE 0 END),
    'notices', (SELECT count(*) FROM public.app_notifications n
                 WHERE n.user_id = auth.uid() AND n.kind = 'marketing' AND n.read_at IS NULL));
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_stage_accept(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_stage_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_stage_submit(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_stage_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_free_block(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_nudge(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_series_set(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_project(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_board(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_shell() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_stage_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_stage_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_stage_submit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_stage_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_free_block(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_nudge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_series_set(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_board(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_shell() TO authenticated;

-- ── New Project in the database's copy of the tab registry ──────────────────
INSERT INTO public.permission_page_tabs (route, tab_id) VALUES ('/marketing/new', 'mkt.projects')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
