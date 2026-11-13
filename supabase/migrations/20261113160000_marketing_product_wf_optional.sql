-- Product Builder: a product item's workflow is optional (the user, 2026-11-13: "不一定要link workflow 才能public").
-- Publishing no longer asks every item for one — a linked one must still be published; starting a product project
-- makes deliverables only for the items that have a workflow. Grants are unchanged (CREATE OR REPLACE keeps them).

CREATE OR REPLACE FUNCTION public.mkt_product_groups(p_groups jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid  text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_out   jsonb := '[]'::jsonb;
  v_g     jsonb;
  v_it    jsonb;
  v_items jsonb;
  v_name  text;
  v_qty   integer;
  v_price numeric;
  v_wf    uuid;
  v_ver   integer;
  v_any   boolean := false;
BEGIN
  IF jsonb_typeof(p_groups) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of categories.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_groups) > 12 THEN
    RAISE EXCEPTION 'A product has at most 12 categories.' USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(p_groups) x LOOP
    IF jsonb_typeof(v_g) IS DISTINCT FROM 'object' OR jsonb_typeof(coalesce(v_g -> 'items', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Not a category.' USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_g ->> 'name', ''));
    IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
      RAISE EXCEPTION 'Name each category (at most 60 characters).' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(coalesce(v_g -> 'items', '[]'::jsonb)) > 30 THEN
      RAISE EXCEPTION '"%": at most 30 actions.', v_name USING ERRCODE = '22023';
    END IF;
    v_items := '[]'::jsonb;
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      IF jsonb_typeof(v_it) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Not an action.' USING ERRCODE = '22023';
      END IF;
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer END;
      IF v_qty IS NULL THEN
        RAISE EXCEPTION 'A quantity of 0 to 999.' USING ERRCODE = '22023';
      END IF;
      v_price := CASE WHEN jsonb_typeof(v_it -> 'price') = 'number' THEN (v_it ->> 'price')::numeric
                      WHEN coalesce(jsonb_typeof(v_it -> 'price'), 'null') = 'null' THEN NULL END;
      IF (jsonb_typeof(v_it -> 'price') IS NOT NULL AND jsonb_typeof(v_it -> 'price') <> 'null' AND v_price IS NULL)
         OR v_price < 0 OR v_price >= 10000000000000 OR v_price <> round(v_price, 2) THEN
        RAISE EXCEPTION 'A unit price in ringgit and sen.' USING ERRCODE = '22023';
      END IF;
      v_name := btrim(coalesce(v_it ->> 'name', ''));
      IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
        RAISE EXCEPTION 'Name each action (at most 60 characters).' USING ERRCODE = '22023';
      END IF;
      v_wf := NULL;
      v_ver := NULL;
      IF coalesce(v_it ->> 'workflow', '') <> '' THEN
        IF (v_it ->> 'workflow') !~ v_uuid THEN
          RAISE EXCEPTION '"%": that workflow is not there.', v_name USING ERRCODE = '22023';
        END IF;
        SELECT w.id, nullif(w.version, 0) INTO v_wf, v_ver FROM public.mkt_workflows w WHERE w.id = (v_it ->> 'workflow')::uuid;
        IF v_wf IS NULL THEN
          RAISE EXCEPTION '"%": that workflow is not there.', v_name USING ERRCODE = '22023';
        END IF;
      END IF;
      -- A workflow is not a must (the user, 2026-11-13: some items have none); one linked is published first.
      IF p_publish AND v_wf IS NOT NULL AND v_ver IS NULL THEN
        RAISE EXCEPTION '"%": its workflow is not published yet.', v_name USING ERRCODE = '22023';
      END IF;
      IF v_qty > 0 AND v_name <> '' THEN
        v_any := true;
      END IF;
      v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'qty', v_qty, 'price', v_price, 'workflow', v_wf,
        'workflowVersion', CASE WHEN p_publish THEN v_ver END)));
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', btrim(coalesce(v_g ->> 'name', '')), 'items', v_items));
  END LOOP;
  IF p_publish AND NOT v_any THEN
    RAISE EXCEPTION 'Add what the product includes.' USING ERRCODE = '22023';
  END IF;
  RETURN v_out;
END
$fn$;


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
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$' AND coalesce(it ->> 'workflow', '') <> ''), 0);
  -- An item with no workflow makes no deliverable (sold, not worked through a template); a product with none linked
  -- at all still starts — it just makes nothing.
  IF v_total > 300 THEN
    RAISE EXCEPTION 'A product project makes at most 300 deliverables (this product %).', v_total USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(v_pv.groups) x LOOP
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer ELSE 0 END;
      CONTINUE WHEN v_qty = 0 OR coalesce(v_it ->> 'workflow', '') = '';
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

