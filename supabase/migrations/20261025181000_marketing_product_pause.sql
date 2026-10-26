-- 20261025181000_marketing_product_pause.sql
-- 2026-10-25 — Marketing ②b-2g: a recurring product project paused and resumed (the spec's gap 180 — "Pause for a product
-- project" — and the user's answer 51: a recurring project is billed every month "paused months too"). As a recurring
-- task's series pauses (②a — "runs not yet open wait; one whose day passes meanwhile is skipped on resuming"):
--   Paused    the manager's (mkt_product_pause): no month's work is made while it is paused — a month whose run day has
--             come is made first; the work made carries on (planned, worked, approved on the PIC's link); still billed
--             every month (answer 51 — mkt_bill_due counts every month of a project not cancelled; nothing changed there).
--   Resumed   the manager's: from this month — its work made on its run day, at once when that has passed; a month whose
--             run day came while it was paused is left out, never made late (mkt_projects.run_from — the run its months
--             go on from). That month's deliverables are carried from the last month made, each start as many months on.
--   Stopped   while paused (mkt_product_stop allows it already): it closes once nothing of it is under way — no month is
--             left to wait for.
--   Production's bodies, a statement or two each: mkt_product_run_next, mkt_product_runs_due, mkt_product_settle,
--   mkt_product_run_day (its day moved while paused too), mkt_deliverable_plan (a paused project's deliverable planned)
--   and mkt_product_project (its runs' next).
-- PGlite: tests/member-sql/validate-marketing-product-pause.mjs.

-- ── The run a resumed project's months go on from ──────────────────────────────────────────────────────────────
-- Set by Resume to this month's run (its months since the first, and one): a month whose run day came while it was
-- paused is left out. None: nothing left out.
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS run_from smallint;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_run_from_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_run_from_check
  CHECK (run_from IS NULL OR (kind = 'product' AND run_from BETWEEN 1 AND 9999));

-- ── A recurring product project paused or resumed — the manager's ─────────────────────────────────────────────
-- Paused: no month's work is made while it is paused (a month whose run day has come is made first); the work made carries
-- on; still billed (answer 51). Resumed: from this month — its work made on its run day, at once when that has passed; a
-- month whose run day came while it was paused is left out. Answers the page.
CREATE OR REPLACE FUNCTION public.mkt_product_pause(p_project uuid, p_pause boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_p     public.mkt_projects;
  v_next  integer;
  v_cur   integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Pausing a recurring project is the manager''s.');
  IF p_pause IS NULL THEN
    RAISE EXCEPTION 'Pause or resume.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'recurring' THEN
    RAISE EXCEPTION 'Only a recurring project is paused — a one-time one closes once its deliverables are done.'
      USING ERRCODE = '22023';
  END IF;
  IF v_p.run_day IS NULL OR v_p.bill_from IS NULL THEN
    RAISE EXCEPTION 'Its work has not started — no month runs yet.' USING ERRCODE = '22023';
  END IF;
  IF v_p.bill_until IS NOT NULL OR v_p.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'It has stopped — no month is left to %.', CASE WHEN p_pause THEN 'pause' ELSE 'resume' END
      USING ERRCODE = '22023';
  END IF;
  IF p_pause THEN
    IF v_p.status = 'paused' THEN
      RAISE EXCEPTION 'It is paused already.' USING ERRCODE = '22023';
    END IF;
    -- A month whose run day has come was due before the pause: made first.
    PERFORM public.mkt_product_runs_due();
    UPDATE public.mkt_projects SET status = 'paused', updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'runs paused');
  ELSE
    IF v_p.status = 'active' THEN
      RAISE EXCEPTION 'It is running already.' USING ERRCODE = '22023';
    END IF;
    v_next := greatest(public.mkt_product_runs_made(v_p.id) + 1, coalesce(v_p.run_from, 1));
    -- This month's run: its months since the first, and one.
    v_cur := ((extract(year FROM v_now) - extract(year FROM v_p.bill_from)) * 12
              + extract(month FROM v_now) - extract(month FROM v_p.bill_from))::integer + 1;
    UPDATE public.mkt_projects SET status = 'active', run_from = greatest(v_next, v_cur), updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'runs resumed', p_data => jsonb_build_object(
              'from', to_char(v_p.bill_from + make_interval(months => greatest(v_next, v_cur) - 1), 'YYYY-MM'),
              'left', greatest(v_cur - v_next, 0)));
    -- This month's work, when its run day has passed.
    PERFORM public.mkt_product_runs_due();
  END IF;
  RETURN public.mkt_product_project(v_p.id::text);
END
$fn$;

-- ── The next month's work — production's body, from the run its months go on from ───────────────────────────────────
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
  v_last    integer;
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
  -- The run after the last made — or, resumed (②b-2g), this month's: a month whose run day came while it was paused is
  -- left out, carried from the last month made.
  v_last := public.mkt_product_runs_made(v_p.id);
  v_k := greatest(v_last + 1, coalesce(v_p.run_from, 1));
  v_month := (v_p.bill_from + make_interval(months => v_k - 1))::date;
  IF v_month + (v_p.run_day - 1) > v_today OR (v_p.bill_until IS NOT NULL AND v_month > v_p.bill_until) THEN
    RETURN 0;
  END IF;
  v_num := coalesce((SELECT max(substring(d.track_id FROM '-D([0-9]+)$')::integer) FROM public.mkt_projects d
                      WHERE d.parent_id = v_p.id), 0);
  FOR v_src IN SELECT * FROM public.mkt_projects d
                WHERE d.parent_id = v_p.id AND d.deliv ->> 'run' = v_last::text
                ORDER BY d.track_id LOOP
    v_num := v_num + 1;
    EXIT WHEN v_num > 999;
    v_planned := v_src.status <> 'planning' AND v_src.starts_on IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = v_src.id AND s.owner_staff IS NOT NULL
                         AND NOT (s.owner_staff = ANY (v_roster)))
      AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                       WHERE s.project_id = v_src.id AND a ->> 'kind' = 'person' AND NOT ((a ->> 'staff')::uuid = ANY (v_roster)));
    v_start := CASE WHEN v_planned THEN greatest((v_src.starts_on + make_interval(months => v_k - v_last))::date, v_today) END;
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

-- ── What is due — production's body, a resumed project's next run ───────────────────────────────────────────────────
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
       AND (p.bill_from + make_interval(months => greatest(r.made, coalesce(p.run_from, 1) - 1)))::date + (p.run_day - 1) <= v_today
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

-- ── A product project closed — production's body, a paused one too ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_settle(p_parent uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_parent FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' OR v_p.status NOT IN ('active', 'paused') THEN
    RETURN;
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'one'
     -- A recurring one, once the manager stopped it (②b-2b).
     AND v_p.bill_until IS NULL THEN
    RETURN;
  END IF;
  -- …and its last month's work made (②b-2f): stopped before that month's run day, it waits for that month's work —
  -- never once paused (②b-2g): no month's work is made again.
  IF v_p.status = 'active' AND v_p.run_day IS NOT NULL AND v_p.bill_until IS NOT NULL
     AND (v_p.bill_from + make_interval(months => greatest(public.mkt_product_runs_made(v_p.id), coalesce(v_p.run_from, 1) - 1)))::date <= v_p.bill_until THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id AND d.status NOT IN ('done', 'cancelled')) THEN
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'closed');
END
$fn$;

-- ── The run day — production's body, moved while paused too ─────────────────────────────────────────────────────────
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
  IF v_p.status NOT IN ('active', 'paused') OR v_p.bill_until IS NOT NULL THEN
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

-- ── A deliverable's plan — production's body, a paused project's too ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_deliverable_plan(p_project uuid, p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_p      public.mkt_projects;
  v_parent public.mkt_projects;
  v_locked boolean;
  v_n      integer;
  v_open   boolean;
  v_start  date;
  v_at     timestamptz;
  v_st     jsonb;
  v_s      public.mkt_stages;
  v_owner  uuid;
  v_appr   jsonb;
  v_a      jsonb;
  v_sla    integer;
  v_split  boolean;
  v_reason text;
  v_rows   jsonb := '[]'::jsonb;
  v_hands  integer := 0;
  v_other  integer := 0;
  i        integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Planning the work is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'deliverable' THEN
    RAISE EXCEPTION 'That deliverable is not there.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects WHERE id = v_p.parent_id;
  -- Paused (②b-2g), the work made carries on: planned too.
  IF v_parent.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Its product project is not running (%).', v_parent.status USING ERRCODE = '22023';
  END IF;
  IF v_p.status NOT IN ('planning', 'active') THEN
    RAISE EXCEPTION 'This deliverable is %.', v_p.status USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR jsonb_typeof(p_plan -> 'stages') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a plan.' USING ERRCODE = '22023';
  END IF;
  v_locked := coalesce((SELECT wv.locked FROM public.mkt_workflow_versions wv
                         WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false);
  v_n := (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = v_p.id);
  IF jsonb_array_length(p_plan -> 'stages') <> v_n THEN
    RAISE EXCEPTION 'The plan names % stages; this deliverable has %.', jsonb_array_length(p_plan -> 'stages'), v_n
      USING ERRCODE = '22023';
  END IF;
  -- Open: its start day has come — stage 1 is on somebody's plate. Its start day stays then.
  v_open := v_p.status = 'active' AND v_p.starts_on <= v_today;
  IF v_open THEN
    v_start := v_p.starts_on;
    IF coalesce(p_plan ->> 'start', v_start::text) <> v_start::text THEN
      RAISE EXCEPTION 'It has opened — its start day stays %.', to_char(v_start, 'FMDD Mon') USING ERRCODE = '22023';
    END IF;
  ELSE
    IF coalesce(p_plan ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Pick the day it starts.' USING ERRCODE = '22023';
    END IF;
    v_start := (p_plan ->> 'start')::date;
    IF v_start < v_today THEN
      RAISE EXCEPTION 'Pick the day it starts — today or later.' USING ERRCODE = '22023';
    END IF;
    IF v_start > v_today + 400 THEN
      RAISE EXCEPTION 'Pick a start day within the next 400 days.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Each stage, checked.
  FOR i IN 0 .. v_n - 1 LOOP
    v_st := p_plan -> 'stages' -> i;
    SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = i FOR UPDATE;
    IF jsonb_typeof(v_st) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Stage % (%): not a stage.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_st ->> 'owner', '') = '' THEN
      IF v_s.mode <> 'prev' OR v_locked OR i = 0 THEN
        RAISE EXCEPTION 'Stage % (%): choose someone.', i + 1, v_s.name USING ERRCODE = '22023';
      END IF;
      v_owner := NULL;
    ELSIF (v_st ->> 'owner') !~ v_uuid OR NOT ((v_st ->> 'owner')::uuid = ANY (v_roster)) THEN
      RAISE EXCEPTION 'Stage % (%): pick a person on Marketing''s team.', i + 1, v_s.name USING ERRCODE = '22023';
    ELSE
      v_owner := (v_st ->> 'owner')::uuid;
    END IF;
    v_appr := '[]'::jsonb;
    IF v_st ? 'appr' AND jsonb_typeof(v_st -> 'appr') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Stage % (%): not a list of approvals.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage % (%): at most 3 approvals.', i + 1, v_s.name USING ERRCODE = '22023';
      END IF;
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        IF v_a ->> 'kind' = 'pic' THEN
          -- Either PIC, or both (②b-2d-2b — the user's answer 29: set per approval); one PIC level a stage.
          v_a := jsonb_build_object('kind', 'pic') || CASE WHEN v_a ->> 'all' = 'true' THEN '{"all": true}'::jsonb ELSE '{}'::jsonb END;
          IF v_appr @> '[{"kind": "pic"}]'::jsonb THEN
            RAISE EXCEPTION 'Stage % (%): the same approval twice.', i + 1, v_s.name USING ERRCODE = '22023';
          END IF;
        ELSIF v_a ->> 'kind' = 'person' AND coalesce(v_a ->> 'staff', '') ~ v_uuid AND (v_a ->> 'staff')::uuid = ANY (v_roster) THEN
          v_a := jsonb_build_object('kind', 'person', 'staff', (v_a ->> 'staff')::uuid);
        ELSE
          RAISE EXCEPTION 'Stage % (%): pick who approves it.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_appr @> jsonb_build_array(v_a) THEN
          RAISE EXCEPTION 'Stage % (%): the same approval twice.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        v_appr := v_appr || jsonb_build_array(v_a);
      END LOOP;
    END IF;
    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage % (%): 1 to 30 working days.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', 'false') = 'true' AND NOT v_locked;
    v_reason := nullif(btrim(coalesce(p_plan -> 'reasons' ->> i::text, '')), '');
    IF v_open THEN
      -- What is done stays; the stage waiting for its approval keeps its people; a stage begun keeps its days; a stage
      -- that changes hands says why.
      IF v_s.status = 'done' THEN
        IF v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_s.appr OR v_sla <> v_s.sla OR v_split <> v_s.split THEN
          RAISE EXCEPTION 'Stage % (%) is done — it stays as it was.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_s.status = 'review' AND (v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_s.appr) THEN
          RAISE EXCEPTION 'Stage % (%) waits for its approval — change it after.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_s.status <> 'planned' AND v_sla <> v_s.sla THEN
          RAISE EXCEPTION 'Stage % (%) has begun — its working days stay.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_owner IS DISTINCT FROM v_s.owner_staff AND v_s.owner_staff IS NOT NULL
           AND length(coalesce(v_reason, '')) NOT BETWEEN 5 AND 300 THEN
          RAISE EXCEPTION 'Stage % (%): say why it changes hands — 5 to 300 characters.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
                'idx', i, 'name', v_s.name, 'status', v_s.status, 'was', v_s.owner_staff, 'owner', v_owner,
                'extra', nullif(left(btrim(coalesce(v_st ->> 'extra', '')), 40), ''), 'appr', v_appr, 'sla', v_sla,
                'split', v_split, 'reason', v_reason,
                'other', v_appr <> v_s.appr OR v_sla <> v_s.sla OR v_split <> v_s.split));
  END LOOP;

  -- Written: what is not done; then the dates — from the start day, each stage its working days, weekends and
  -- Selangor's holidays skipped (a stage begun keeps its own).
  UPDATE public.mkt_stages s
     SET owner_staff = (r ->> 'owner')::uuid, extra = r ->> 'extra', appr = r -> 'appr', sla = (r ->> 'sla')::integer,
         split = (r ->> 'split')::boolean
    FROM jsonb_array_elements(v_rows) r
   WHERE s.project_id = v_p.id AND s.idx = (r ->> 'idx')::integer AND s.status <> 'done';
  UPDATE public.mkt_stages s SET starts_on = d.starts_on, due_on = d.due_on
    FROM public.mkt_stage_dates(v_start, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = v_p.id ORDER BY x.idx)) d
   WHERE s.project_id = v_p.id AND s.idx = d.idx AND (NOT v_open OR s.status = 'planned');

  IF NOT v_open THEN
    -- Stage 1 opens on the start day — on the board then, its person's to Accept (the manager's own, accepted).
    v_at := CASE WHEN v_start <= v_today THEN now() ELSE v_start::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END;
    UPDATE public.mkt_stages
       SET status = 'planned', entered_at = NULL, accepted_at = NULL, appr_idx = 0, changes = NULL
     WHERE project_id = v_p.id AND idx > 0;
    UPDATE public.mkt_stages
       SET status = CASE WHEN owner_staff = v_me THEN 'accepted' ELSE 'todo' END, entered_at = v_at,
           accepted_at = CASE WHEN owner_staff = v_me THEN v_at END, appr_idx = 0, changes = NULL
     WHERE project_id = v_p.id AND idx = 0;
    UPDATE public.mkt_projects
       SET status = 'active', cur = 0, starts_on = v_start,
           due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_p.id), updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, CASE WHEN v_p.status = 'planning' THEN 'planned' ELSE 'replanned' END,
              p_data => jsonb_build_object('start', v_start));
    -- Everybody on it hears, once, at the first stage they are on — doing it or approving it.
    PERFORM public.mkt_notify(o.who, v_p.id,
              CASE WHEN v_p.status = 'planning' THEN 'You''re on the plan for "' ELSE 'The plan changed for "' END
                || v_p.title || '"',
              v_p.track_id || ' · Stage ' || (o.idx + 1) || ' · ' || o.name || ' · starts ' || to_char(o.starts, 'FMDD Mon'),
              'task')
       FROM (SELECT DISTINCT ON (w.who) w.who, w.idx, w.name, w.starts
               FROM (SELECT s.owner_staff AS who, s.idx, s.name, s.starts_on AS starts
                       FROM public.mkt_stages s WHERE s.project_id = v_p.id AND s.owner_staff IS NOT NULL
                     UNION ALL
                     SELECT (a ->> 'staff')::uuid, s.idx, s.name, s.starts_on
                       FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                      WHERE s.project_id = v_p.id AND a ->> 'kind' = 'person') w
              ORDER BY w.who, w.idx) o
      WHERE o.who IS DISTINCT FROM v_me;
  ELSE
    -- Mid-way: each change of hands logged with its reason; the stage now open is the new person's to Accept again.
    FOR v_st IN SELECT x FROM jsonb_array_elements(v_rows) x WHERE x ->> 'status' <> 'done' LOOP
      i := (v_st ->> 'idx')::integer;
      IF (v_st ->> 'other')::boolean THEN
        v_other := v_other + 1;
      END IF;
      CONTINUE WHEN (v_st ->> 'owner') IS NOT DISTINCT FROM (v_st ->> 'was');
      v_hands := v_hands + 1;
      PERFORM public.mkt_log(v_p.id, 'reassigned', i, v_st ->> 'name',
                coalesce(public.mkt_staff_name((v_st ->> 'was')::uuid), 'Picked by the stage before') || ' → '
                  || coalesce(public.mkt_staff_name((v_st ->> 'owner')::uuid), 'Picked by the stage before'),
                v_st ->> 'reason');
      IF i = v_p.cur AND v_st ->> 'status' IN ('todo', 'accepted') THEN
        UPDATE public.mkt_stages SET status = 'todo', entered_at = now(), accepted_at = NULL
         WHERE project_id = v_p.id AND idx = i;
      END IF;
      IF (v_st ->> 'owner') IS NOT NULL THEN
        PERFORM public.mkt_notify((v_st ->> 'owner')::uuid, v_p.id,
                  CASE WHEN i = v_p.cur THEN 'Your turn: ' ELSE 'You''re on the plan: ' END || (v_st ->> 'name'),
                  v_p.track_id || ' · ' || v_p.title || coalesce(' — "' || (v_st ->> 'reason') || '"', ''),
                  CASE WHEN i = v_p.cur THEN 'open' ELSE 'task' END);
      END IF;
      IF (v_st ->> 'was') IS NOT NULL THEN
        PERFORM public.mkt_notify((v_st ->> 'was')::uuid, v_p.id,
                  (v_st ->> 'name') || ' of "' || v_p.title || '" moved to '
                    || coalesce(public.mkt_staff_name((v_st ->> 'owner')::uuid), 'the stage before''s pick'),
                  coalesce('"' || (v_st ->> 'reason') || '"', ''), 'task');
      END IF;
    END LOOP;
    IF v_other > 0 THEN
      PERFORM public.mkt_log(v_p.id, 'plan changed', p_data => jsonb_build_object('stages', v_other));
    END IF;
    UPDATE public.mkt_projects
       SET due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_p.id), updated_at = now()
     WHERE id = v_p.id;
  END IF;
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'reassigned', v_hands);
END
$fn$;

-- ── A product project's page — production's body, its next run ──────────────────────────────────────────────────────
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

-- ── Who may call what ─────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_product_pause(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_pause(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
