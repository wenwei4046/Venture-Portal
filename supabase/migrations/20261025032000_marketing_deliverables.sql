-- 20261025032000_marketing_deliverables.sql
-- 2026-10-24 — Marketing ②b-2a: a product project's deliverables and their Assignment Plan (`Assignment Plan.dc.html`;
-- the user's answers 10 and 17 — one product project; inside it each deliverable, an action × its quantity (four
-- posters are four), is its own sub-task on its action's workflow with its own START day; the product shows
-- deliverables done ÷ all).
--
-- mkt_projects, a deliverable: kind 'deliverable'; `parent_id` its product project; its Track ID the product's with -Dnn
--   (MKT-CAR-2610-007-D01); `deliv` what it is of the product ({group, item, n, of}); status 'planning' until its plan
--   is saved, then the stage machine's, as a quick task's. Its stages are its workflow version's, copied when the work
--   starts: who (the manager assigns, or 🔓 the stage before picks from its candidates), approvals (a person, the PIC on
--   the link, or one picked at assignment), working days, subtasks or not, the fields with the canvas's settings and the
--   canvas's own fields of that stage. A locked template: every stage the manager's to assign, no subtasks.
-- New (SECURITY DEFINER; PUBLIC and anon revoked, `authenticated` granted; Marketing · Manage):
--   mkt_product_begin(project)        the work starts: the product version's deliverables made, each 'planning'; the
--                                     project 'active'. After the PIC's approval, or once started before it.
--   mkt_deliverable_plan(id, plan)    the Assignment Plan saved: the start day, each stage's person and approvals, its
--                                     working days and subtasks; dates skip weekends and Selangor's holidays. Stage 1
--                                     opens on the start day (mkt_board shows it then); everybody on it is told. Once
--                                     open, a stage done stays; a change of hands says why, and the stage now open is
--                                     the new person's to Accept again.
--   mkt_product_settle(parent)        (the functions' own) a one-time product project is done with its last deliverable.
-- Replaced from production's bodies (md5 equal — 20261025031000's and 20261024002000's / 20261023234000's): mkt_board (a
--   deliverable not planned or before its day is not on it; a project names its parent), mkt_project (a deliverable's
--   product, what it is of it, its template locked or not), mkt_product_project (its deliverables), mkt_advance (a
--   deliverable done settles its product), mkt_stage_missing (a field its template marks not required is not asked for).
-- PGlite: tests/member-sql/validate-marketing-deliverables.mjs.

-- ── A deliverable is a project under its product project ─────────────────────────
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.mkt_projects(id);
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS deliv jsonb;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_deliv_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_deliv_check CHECK (deliv IS NULL OR jsonb_typeof(deliv) = 'object');
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_kind_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_kind_check
  CHECK (kind IN ('product', 'quick', 'recurring', 'deliverable'));
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_status_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_status_check
  CHECK (status IN ('minutes', 'waiting_pic', 'changes', 'approved', 'planning', 'active', 'paused', 'done', 'cancelled'));
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_track_id_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_track_id_check
  CHECK (track_id ~ '^(MKT|TSK|RCR)-[A-Z0-9]{2,6}-[0-9]{4}-[0-9]{3}(-R[0-9]{2,3}|-D[0-9]{2,3})?$');
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_parent_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_parent_check CHECK ((kind = 'deliverable') = (parent_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS mkt_projects_parent ON public.mkt_projects (parent_id) WHERE parent_id IS NOT NULL;

-- ── The work starts: the deliverables made ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_begin(p_project uuid)
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
                                         parent_id, deliv, canvas_def, created_by)
        VALUES (v_p.track_id || '-D' || lpad(v_n::text, CASE WHEN v_total >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
                v_p.subsidiary_id,
                left(btrim(v_it ->> 'name') || CASE WHEN v_qty > 1 THEN ' ' || k || '/' || v_qty ELSE '' END, 140),
                'planning', v_p.product_id, v_p.product_version, v_wv.workflow_id, v_wv.version,
                left(v_w.action || ' · ' || v_w.tname, 120), v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp, v_p.id,
                jsonb_build_object('group', btrim(coalesce(v_g ->> 'name', '')), 'item', btrim(v_it ->> 'name'),
                                   'n', k, 'of', v_qty),
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
  UPDATE public.mkt_projects SET status = 'active', updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n));
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_product_begin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_begin(uuid) TO authenticated;

-- ── A deliverable's Assignment Plan ─────────────────────────────────────────────
-- p_plan { start: 'YYYY-MM-DD', stages: [{ owner: staff id | null (🔓 picked by the stage before), extra, appr: [{ kind:
-- 'person', staff } | { kind: 'pic' }], sla, split }] — one per stage, in order —, reasons: { "<stage index>": why } }.
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
  IF v_parent.status <> 'active' THEN
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
          v_a := jsonb_build_object('kind', 'pic');
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
REVOKE ALL ON FUNCTION public.mkt_deliverable_plan(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_deliverable_plan(uuid, jsonb) TO authenticated;

-- ── A one-time product project is done with its last deliverable ───────────────
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
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'one' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id AND d.status NOT IN ('done', 'cancelled')) THEN
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'closed');
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_product_settle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_settle(uuid) TO service_role;

-- ── Replaced from production's bodies ────────────────────────────────────────────
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
                             'pic', p.pic_name, 'cur', p.cur, 'series', p.series_id, 'run', p.run_no, 'parent', p.parent_id,
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
      'link', v_p.link_code, 'linkSentAt', v_p.link_sent_at, 'picReply', v_p.pic_reply, 'override', v_p.override,
      'createdAt', v_p.created_at,
      'product', (SELECT jsonb_build_object('id', pv.product_id, 'version', pv.version, 'name', pv.name, 'kind', pv.kind,
                                            'note', pv.note)
                    FROM public.mkt_product_versions pv WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version)),
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
    -- A deliverable done: its product project is, once its last one is (②b-2a).
    IF v_p.parent_id IS NOT NULL THEN
      PERFORM public.mkt_product_settle(v_p.parent_id);
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
    -- A field its template marks not required is never asked for (②b-2a: a template's fields carry req).
    CONTINUE WHEN f -> 'req' = 'false'::jsonb;
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
