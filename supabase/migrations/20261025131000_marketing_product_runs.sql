-- 20261025131000_marketing_product_runs.sql
-- 2026-10-24 — Marketing ②b-2f: a recurring product's months (the user's answer 12: "a recurring product picks its run
-- day — opened on the 1st, runs every 5th"; the handoff's Product Builder: "Opens a new task every month for the same
-- team"). Until now its deliverables were made once, when its work started.
--   The run day   mkt_projects.run_day (1–28): asked when the work starts (mkt_product_begin re-made with p_run_day;
--                 today's day unless another, the 28th at most); changed by the manager (mkt_product_run_day) for the
--                 months not made yet.
--   Each month    on its run day, the month's deliverables are made again (mkt_product_run_next): each one of the month
--                 before — its workflow, its stages — with its plan carried: the same people, approvals and working days,
--                 its start a month on (never before today); one never planned, or whose people left the roster, waits
--                 to be planned and the project's owner is told. Each carries its run (deliv.run) and its month in its
--                 title. Asked by every Marketing write (mkt_top_up_due — production's body) and the hourly sweep
--                 (/api/member-queue → mkt_product_runs_due), so a month opens when nobody works; a month or a few
--                 behind, each in turn. Never past the month the manager stopped it.
--   Stopped       it closes once its last month's work is made too and done (mkt_product_settle — production's body).
--   The page      mkt_product_project — production's body — gives its runs: the day, the first month, how many made, the
--                 month it stops.
-- PGlite: tests/member-sql/validate-marketing-product-runs.mjs.

-- ── A recurring product's run day ────────────────────────────────────────────────────────────────────────────
-- The day of the month each month's work is made (the user's answer 12: "a recurring product picks its run day — opened
-- on the 1st, runs every 5th"); 1–28, so every month has it. A recurring product project's, once its work started.
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS run_day smallint;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_run_day_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_run_day_check
  CHECK (run_day IS NULL OR (kind = 'product' AND run_day BETWEEN 1 AND 28));

-- ── The runs a recurring product project has made (nobody's to call but the functions below) ────────────────
-- Its deliverables carry their run (`deliv.run`: 1 the month its work started, then one a month); none yet: 1.
CREATE OR REPLACE FUNCTION public.mkt_product_runs_made(p_parent uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((SELECT max((d.deliv ->> 'run')::integer) FROM public.mkt_projects d
                    WHERE d.parent_id = p_parent AND coalesce(d.deliv ->> 'run', '') ~ '^[0-9]{1,4}$'), 1);
END
$fn$;

-- ── The next month's work made, when its day has come (nobody's to call but the functions below) ─────────────
-- "Opens a new task every month for the same team" (the handoff's Product Builder): each deliverable of the month before
-- made again — its workflow, its stages — with its plan carried (the same people, approvals and working days, its start
-- a month on — never before today); one never planned, or whose people left the roster, waits to be planned (the
-- project's owner is told). Never past the month the manager stopped it (`bill_until`). Answers the run made, or 0.
CREATE OR REPLACE FUNCTION public.mkt_product_run_next(p_parent uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_roster  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_p       public.mkt_projects;
  v_k       integer;
  v_month   date;
  v_src     public.mkt_projects;
  v_num     integer;
  v_planned boolean;
  v_start   date;
  v_at      timestamptz;
  v_id      uuid;
  v_made    integer := 0;
  v_plan    integer := 0;
BEGIN
  -- Somebody else working this project now: its run waits for the next call (never a wait, never a deadlock).
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_parent FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR v_p.kind <> 'product' OR v_p.status <> 'active' OR v_p.run_day IS NULL OR v_p.bill_from IS NULL THEN
    RETURN 0;
  END IF;
  v_k := public.mkt_product_runs_made(v_p.id) + 1;
  v_month := (v_p.bill_from + make_interval(months => v_k - 1))::date;
  IF v_month + (v_p.run_day - 1) > v_today OR (v_p.bill_until IS NOT NULL AND v_month > v_p.bill_until) THEN
    RETURN 0;
  END IF;
  v_num := coalesce((SELECT max(substring(d.track_id FROM '-D([0-9]+)$')::integer) FROM public.mkt_projects d
                      WHERE d.parent_id = v_p.id), 0);
  FOR v_src IN SELECT * FROM public.mkt_projects d
                WHERE d.parent_id = v_p.id AND d.deliv ->> 'run' = (v_k - 1)::text
                ORDER BY d.track_id LOOP
    v_num := v_num + 1;
    EXIT WHEN v_num > 999;
    v_planned := v_src.status <> 'planning' AND v_src.starts_on IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = v_src.id AND s.owner_staff IS NOT NULL
                         AND NOT (s.owner_staff = ANY (v_roster)))
      AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                       WHERE s.project_id = v_src.id AND a ->> 'kind' = 'person' AND NOT ((a ->> 'staff')::uuid = ANY (v_roster)));
    v_start := CASE WHEN v_planned THEN greatest((v_src.starts_on + interval '1 month')::date, v_today) END;
    INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version,
                                     workflow_id, workflow_version, workflow_name, owner_staff, pic_name, pic_whatsapp,
                                     pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, starts_on, created_by)
    VALUES (v_p.track_id || '-D' || lpad(v_num::text, CASE WHEN v_num >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
            v_p.subsidiary_id,
            left(regexp_replace(v_src.title, ' · [A-Z][a-z]{2} [0-9]{4}$', '') || ' · ' || to_char(v_month, 'Mon YYYY'), 140),
            CASE WHEN v_planned THEN 'active' ELSE 'planning' END, v_p.product_id, v_p.product_version,
            v_src.workflow_id, v_src.workflow_version, v_src.workflow_name, v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp,
            v_p.pic2_name, v_p.pic2_whatsapp, v_p.id, v_src.deliv || jsonb_build_object('run', v_k), v_src.canvas_def,
            v_start, v_p.created_by)
    RETURNING id INTO v_id;
    IF v_planned THEN
      -- Its plan carried: stage 1 opens on its start day, its person's to Accept; each stage its working days again.
      v_at := CASE WHEN v_start <= v_today THEN now() ELSE v_start::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END;
      INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, extra, cands, sla, appr, split, spec,
                                     starts_on, due_on, status, entered_at)
      SELECT v_id, s.idx, s.name, s.dept, s.mode, s.owner_staff, s.extra, s.cands, s.sla, s.appr, s.split, s.spec,
             d.starts_on, d.due_on, CASE WHEN s.idx = 0 THEN 'todo' ELSE 'planned' END, CASE WHEN s.idx = 0 THEN v_at END
        FROM public.mkt_stages s
        JOIN public.mkt_stage_dates(v_start, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = v_src.id ORDER BY x.idx)) d
          ON d.idx = s.idx
       WHERE s.project_id = v_src.id;
      UPDATE public.mkt_projects SET due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_id)
       WHERE id = v_id;
      PERFORM public.mkt_log(v_id, 'carried', p_data => jsonb_build_object('from', v_src.track_id, 'start', v_start));
      -- Everybody on it hears, once, at the first stage they are on (as a plan saved tells them).
      PERFORM public.mkt_notify(o.who, v_id, 'You''re on the plan for "' || left(regexp_replace(v_src.title, ' · [A-Z][a-z]{2} [0-9]{4}$', '') || ' · ' || to_char(v_month, 'Mon YYYY'), 140) || '"',
                v_p.track_id || ' · Stage ' || (o.idx + 1) || ' · ' || o.name || ' · starts ' || to_char(o.starts, 'FMDD Mon'), 'task')
         FROM (SELECT DISTINCT ON (w.who) w.who, w.idx, w.name, w.starts
                 FROM (SELECT s.owner_staff AS who, s.idx, s.name, s.starts_on AS starts
                         FROM public.mkt_stages s WHERE s.project_id = v_id AND s.owner_staff IS NOT NULL
                       UNION ALL
                       SELECT (a ->> 'staff')::uuid, s.idx, s.name, s.starts_on
                         FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                        WHERE s.project_id = v_id AND a ->> 'kind' = 'person') w
                ORDER BY w.who, w.idx) o;
    ELSE
      -- To be planned: its stages as its workflow has them; the people still on the roster kept as a start.
      INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, owner_staff, extra, cands, sla, appr, split, spec, status)
      SELECT v_id, s.idx, s.name, s.dept, s.mode, CASE WHEN s.owner_staff = ANY (v_roster) THEN s.owner_staff END, s.extra,
             ARRAY(SELECT c FROM unnest(s.cands) c WHERE c = ANY (v_roster)), s.sla,
             coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(s.appr) a
                        WHERE a ->> 'kind' <> 'person' OR (a ->> 'staff')::uuid = ANY (v_roster)), '[]'::jsonb),
             s.split, s.spec, 'planned'
        FROM public.mkt_stages s
       WHERE s.project_id = v_src.id;
      v_plan := v_plan + 1;
    END IF;
    v_made := v_made + 1;
  END LOOP;
  IF v_made = 0 THEN
    RETURN 0;
  END IF;
  PERFORM public.mkt_log(v_p.id, 'run made', p_data => jsonb_build_object('run', v_k, 'month', to_char(v_month, 'YYYY-MM'),
            'made', v_made, 'toPlan', v_plan));
  IF v_plan > 0 AND v_p.owner_staff IS NOT NULL THEN
    PERFORM public.mkt_notify(v_p.owner_staff, v_p.id, 'Plan ' || to_char(v_month, 'Mon YYYY') || '''s work · ' || v_plan
              || ' deliverable' || CASE WHEN v_plan = 1 THEN '' ELSE 's' END, v_p.track_id || ' · ' || v_p.title, 'task');
  END IF;
  RETURN v_k;
END
$fn$;

-- ── Every recurring product's month made once its day has come (any Marketing write asks — mkt_top_up_due — and
-- the hourly sweep, /api/member-queue, so a month opens even when nobody works) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_runs_due()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_id    uuid;
  v_k     integer;
  v_n     integer := 0;
  i       integer;
BEGIN
  FOR v_id IN
    SELECT p.id FROM public.mkt_projects p
     CROSS JOIN LATERAL (SELECT coalesce(max((d.deliv ->> 'run')::integer), 1) AS made FROM public.mkt_projects d
                          WHERE d.parent_id = p.id AND coalesce(d.deliv ->> 'run', '') ~ '^[0-9]{1,4}$') r
     WHERE p.kind = 'product' AND p.status = 'active' AND p.run_day IS NOT NULL AND p.bill_from IS NOT NULL
       AND (p.bill_from + make_interval(months => r.made))::date + (p.run_day - 1) <= v_today
     ORDER BY p.id
  LOOP
    -- Months behind (nobody worked, the sweep missed): each month in turn, a year at most at once.
    FOR i IN 1 .. 12 LOOP
      BEGIN
        v_k := public.mkt_product_run_next(v_id);
      EXCEPTION WHEN OTHERS THEN
        -- One project's month never stops another's, nor the write that asked.
        RAISE WARNING 'mkt_product_runs_due %: %', v_id, SQLERRM;
        v_k := 0;
      END;
      EXIT WHEN v_k = 0;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- ── The run day changed (the manager's) — for the months not made yet ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_run_day(p_project uuid, p_day integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'A project''s run day is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' OR v_p.run_day IS NULL THEN
    RAISE EXCEPTION 'Only a recurring project whose work started runs every month.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status <> 'active' OR v_p.bill_until IS NOT NULL THEN
    RAISE EXCEPTION 'It has stopped — no month is left to move.' USING ERRCODE = '22023';
  END IF;
  IF p_day IS NULL OR p_day NOT BETWEEN 1 AND 28 THEN
    RAISE EXCEPTION 'Pick a day from the 1st to the 28th.' USING ERRCODE = '22023';
  END IF;
  IF p_day <> v_p.run_day THEN
    UPDATE public.mkt_projects SET run_day = p_day, updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'run day', p_data => jsonb_build_object('from', v_p.run_day, 'to', p_day));
    -- A day moved earlier may bring this month's work now.
    PERFORM public.mkt_product_runs_due();
  END IF;
  RETURN public.mkt_product_project(v_p.id::text);
END
$fn$;

-- ── Its work started — re-made with the run day (an old call without one takes today's) ──────────────────
DROP FUNCTION IF EXISTS public.mkt_product_begin(uuid);
CREATE OR REPLACE FUNCTION public.mkt_product_begin(p_project uuid, p_run_day integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p     public.mkt_projects;
  v_pv    public.mkt_product_versions;
  v_g     jsonb;
  v_it    jsonb;
  v_qty   integer;
  v_wv    public.mkt_workflow_versions;
  v_w     public.mkt_workflows;
  v_total integer;
  v_n     integer := 0;
  v_id    uuid;
  k       integer;
  v_run   integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting the work is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id) THEN
    RAISE EXCEPTION 'Its work has started already.' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_p.status = 'approved' OR (v_p.status IN ('waiting_pic', 'changes') AND v_p.override IS NOT NULL)) THEN
    RAISE EXCEPTION 'The work starts once the PIC approves the minutes — or once it is started before approval.'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = v_p.product_id AND version = v_p.product_version;
  -- A recurring one runs every month on its run day (②b-2f — the user's answer 12): the one asked, else today's (the
  -- 28th at most, so every month has it).
  IF v_pv.kind = 'recurring' THEN
    v_run := coalesce(p_run_day, least(extract(day FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::integer, 28));
    IF v_run NOT BETWEEN 1 AND 28 THEN
      RAISE EXCEPTION 'Pick a run day from the 1st to the 28th.' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'), 0);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'The product includes nothing to make.' USING ERRCODE = '22023';
  END IF;
  IF v_total > 300 THEN
    RAISE EXCEPTION 'A product project makes at most 300 deliverables (this product %).', v_total USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(v_pv.groups) x LOOP
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer ELSE 0 END;
      CONTINUE WHEN v_qty = 0;
      SELECT * INTO v_wv FROM public.mkt_workflow_versions
       WHERE workflow_id = (v_it ->> 'workflow')::uuid AND version = (v_it ->> 'workflowVersion')::integer;
      IF NOT FOUND THEN
        RAISE EXCEPTION '"%": its workflow is not there.', v_it ->> 'name' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_w FROM public.mkt_workflows WHERE id = v_wv.workflow_id;
      FOR k IN 1 .. v_qty LOOP
        v_n := v_n + 1;
        INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version,
                                         workflow_id, workflow_version, workflow_name, owner_staff, pic_name, pic_whatsapp,
                                         pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, created_by)
        VALUES (v_p.track_id || '-D' || lpad(v_n::text, CASE WHEN v_total >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
                v_p.subsidiary_id,
                left(btrim(v_it ->> 'name') || CASE WHEN v_qty > 1 THEN ' ' || k || '/' || v_qty ELSE '' END, 140),
                'planning', v_p.product_id, v_p.product_version, v_wv.workflow_id, v_wv.version,
                left(v_w.action || ' · ' || v_w.tname, 120), v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp,
                v_p.pic2_name, v_p.pic2_whatsapp, v_p.id,
                jsonb_build_object('group', btrim(coalesce(v_g ->> 'name', '')), 'item', btrim(v_it ->> 'name'),
                                   'n', k, 'of', v_qty)
                  || CASE WHEN v_pv.kind = 'recurring' THEN '{"run": 1}'::jsonb ELSE '{}'::jsonb END,
                v_wv.canvas, auth.uid())
        RETURNING id INTO v_id;
        -- Its stages, as its template's version has them: the first always the manager's to assign; a locked template
        -- all of them, and none split. A stage's fields are its own and the canvas's own sections' fields of it.
        INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, cands, sla, appr, split, spec, status)
        SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', coalesce(x.st ->> 'dept', ''),
               CASE WHEN v_wv.locked OR x.n = 1 OR x.st -> 'who' ->> 'mode' IS DISTINCT FROM 'prev' THEN 'assign' ELSE 'prev' END,
               ARRAY(SELECT c::uuid FROM jsonb_array_elements_text(coalesce(x.st -> 'who' -> 'cands', '[]'::jsonb)) c),
               (x.st ->> 'sla')::integer, coalesce(x.st -> 'appr', '[]'::jsonb),
               coalesce((x.st ->> 'split')::boolean, false) AND NOT v_wv.locked,
               jsonb_strip_nulls(jsonb_build_object(
                 'form', coalesce(x.st -> 'form', '[]'::jsonb) || coalesce((
                           SELECT jsonb_agg(sf.f || jsonb_build_object('section', sc.sec ->> 'title') ORDER BY sc.so, sf.fo)
                             FROM jsonb_array_elements(coalesce(v_wv.canvas -> 'sections', '[]'::jsonb)) WITH ORDINALITY AS sc(sec, so),
                                  jsonb_array_elements(coalesce(sc.sec -> 'fields', '[]'::jsonb)) WITH ORDINALITY AS sf(f, fo)
                            WHERE coalesce(sf.f ->> 'stage', '') ~ '^[0-9]{1,2}$' AND (sf.f ->> 'stage')::integer = x.n - 1), '[]'::jsonb),
                 'back', x.st -> 'back', 'sec', x.st -> 'sec', 'picText', nullif(x.st ->> 'picText', ''))),
               'planned'
          FROM jsonb_array_elements(v_wv.stages) WITH ORDINALITY AS x(st, n);
      END LOOP;
    END LOOP;
  END LOOP;
  -- A recurring one is billed from this month (②b-2b — the user's answer 51).
  UPDATE public.mkt_projects SET status = 'active', updated_at = now(),
                                 bill_from = CASE WHEN v_pv.kind = 'recurring' THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - (extract(day FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::integer - 1) END,
                                 run_day = CASE WHEN v_pv.kind = 'recurring' THEN v_run END
   WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n)
            || CASE WHEN v_run IS NOT NULL THEN jsonb_build_object('runDay', v_run) ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);
END
$fn$;

-- ── A product project closed — production's body, a stopped recurring one once its last month is made ──────
CREATE OR REPLACE FUNCTION public.mkt_product_settle(p_parent uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_parent FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' OR v_p.status <> 'active' THEN
    RETURN;
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'one'
     -- A recurring one, once the manager stopped it (②b-2b).
     AND v_p.bill_until IS NULL THEN
    RETURN;
  END IF;
  -- …and its last month's work made (②b-2f): stopped before that month's run day, it waits for that month's work.
  IF v_p.run_day IS NOT NULL AND v_p.bill_until IS NOT NULL
     AND (v_p.bill_from + make_interval(months => public.mkt_product_runs_made(v_p.id)))::date <= v_p.bill_until THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id AND d.status NOT IN ('done', 'cancelled')) THEN
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'closed');
END
$fn$;

-- ── A product project's page — production's body, its months ──────────────────────────────────────────────
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
      -- Its months (②b-2f): the run day, the first month, how many made, the month it stops — the work's, not money.
      'runs', CASE WHEN v_p.run_day IS NOT NULL THEN jsonb_build_object('day', v_p.run_day, 'first', v_p.bill_from,
                'made', public.mkt_product_runs_made(v_p.id), 'until', v_p.bill_until) END,
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

-- ── What is due, made on any write — production's body, a recurring product's month too ───────────────────
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
  -- …and a recurring product's month (②b-2f).
  PERFORM public.mkt_product_runs_due();
END
$fn$;

-- ── Who may call what ─────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_product_runs_made(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_runs_made(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_product_run_next(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_run_next(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_product_runs_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_runs_due() TO service_role;
REVOKE ALL ON FUNCTION public.mkt_product_begin(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_begin(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_product_run_day(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_run_day(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
