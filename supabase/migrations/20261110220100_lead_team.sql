-- Lead View v3 › Team (2026-11-10 — the handoff docs/design_handoff_lead_view_v3 § 4; the user: "People + ERP feed",
-- logins stay HR's ("HR adds them to People"), and "Team gives access" — adding somebody in Settings › Team is what
-- opens Lead View for them).
--
-- THE TEAM. `lead_team` — one People record each: role admin | cs | outlet, Reply to customers, See reports, an optional
-- from / to (office days); `lead_team_outlets` — an Outlet staff's outlets. Saved on Settings › Team
-- (`lead_team_save` / `lead_team_remove`, Lead View · Manage, Settings' page).
--
-- ACTIVE. Somebody on the Team holds Lead View only while their People record is active, the ERP does not list them
-- inactive (`erp_staff`, matched by email, else name), and today is inside their from / to. Stopped is stopped
-- everywhere, and comes back by itself when that changes.
--
-- TEAM GIVES ACCESS — in the three permission readers, so every gate (pages, buttons, has_any_action, the tab guards,
-- View as a person) follows it with nothing else to change. For somebody ON the Team, the Team alone decides Lead View:
--   current_actions()      their `leads.*` cells are the Team's (`lead_team_cells`): Admin and Customer service
--                          view · create · edit · manage; Outlet staff view, and create · edit when they may reply;
--                          stopped none. A template's or person's own leads cells are set aside.
--   current_permissions()  the `leads` key while active, never while stopped.
--   current_tabs()         the Lead View boxes are the Team's (`lead_team_boxes`): Admin every box; Customer service
--                          every tab but Settings, Campaigns to view; Outlet staff Inbox and Leads (their writes when
--                          they may reply) and Insight when they may see reports. Over a template, in place of their
--                          own lead.* boxes; with no template, as boxes over the tabs their cells give.
-- Somebody not on the Team (the Principal, the shared logins) is exactly as before.
--
-- AN OUTLET STAFF SEES THEIR OUTLETS and the chats with no outlet (`lead_my_outlets`, `lead_outlet_ok`): the Inbox's
-- list, an opened chat, Leads, Insight's list and its figures.
--
-- PRODUCTION's bodies, md5 checked, each swap found exactly once: current_actions (aae861a3…), current_permissions
-- (b6122dca…), current_tabs (f4642c7a…), lead_inbox (225ac2bb…), lead_thread (97f162b4…), lead_leads (69d5efa6…),
-- lead_list (59872e21…), lead_insight_more (d131344e…).

CREATE TABLE IF NOT EXISTS public.lead_team (
  staff_id    uuid PRIMARY KEY REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'cs', 'outlet')),
  can_reply   boolean NOT NULL DEFAULT true,
  can_reports boolean NOT NULL DEFAULT false,
  from_on     date,
  to_on       date,
  added_by_name text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (from_on IS NULL OR to_on IS NULL OR from_on <= to_on)
);
CREATE TABLE IF NOT EXISTS public.lead_team_outlets (
  staff_id  uuid NOT NULL REFERENCES public.lead_team(staff_id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, outlet_id)
);
ALTER TABLE public.lead_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_team_outlets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_team, public.lead_team_outlets FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_team', 'Lead View team', 'Member services', '{leads}', 'all');
SELECT public.audit_register('lead_team_outlets', 'Lead View team outlets', 'Member services', '{leads}', 'all');

-- The ERP's row for a People record: by email, else by name (an active one first).
CREATE OR REPLACE FUNCTION public.lead_erp_row(p_staff uuid)
RETURNS public.erp_staff
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.hr_staff_costs;
  e public.erp_staff;
BEGIN
  SELECT * INTO s FROM public.hr_staff_costs WHERE id = p_staff;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF coalesce(btrim(s.email), '') <> '' THEN
    SELECT * INTO e FROM public.erp_staff x WHERE x.email <> '' AND x.email = lower(btrim(s.email)) ORDER BY x.active DESC, x.updated_at DESC LIMIT 1;
    IF FOUND THEN RETURN e; END IF;
  END IF;
  SELECT * INTO e FROM public.erp_staff x WHERE lower(btrim(x.name)) = lower(btrim(s.employee_name)) AND btrim(s.employee_name) <> ''
   ORDER BY x.active DESC, x.updated_at DESC LIMIT 1;
  RETURN e;
END
$$;

-- Where somebody stands on the Team: NULL with no Team row. `why` says why they are stopped ('' while active).
CREATE OR REPLACE FUNCTION public.lead_team_state(p_user uuid)
RETURNS TABLE (staff_id uuid, role text, can_reply boolean, can_reports boolean, outlets uuid[], active boolean, why text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s  public.hr_staff_costs;
  t  public.lead_team;
  e  public.erp_staff;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_why text := '';
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  SELECT x.* INTO s FROM public.hr_staff_costs x WHERE x.user_id = p_user ORDER BY (x.status = 'active') DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO t FROM public.lead_team WHERE lead_team.staff_id = s.id;
  IF NOT FOUND THEN RETURN; END IF;
  e := public.lead_erp_row(s.id);
  IF s.status IS DISTINCT FROM 'active' THEN v_why := 'people';
  ELSIF e.staff_id IS NOT NULL AND NOT e.active THEN v_why := 'erp';
  ELSIF t.from_on IS NOT NULL AND v_today < t.from_on THEN v_why := 'not_yet';
  ELSIF t.to_on IS NOT NULL AND v_today > t.to_on THEN v_why := 'ended';
  END IF;
  RETURN QUERY SELECT s.id, t.role, t.can_reply, t.can_reports,
    coalesce((SELECT array_agg(o.outlet_id) FROM public.lead_team_outlets o
               JOIN public.lead_outlets lo ON lo.id = o.outlet_id AND lo.deleted_at IS NULL WHERE o.staff_id = s.id), '{}'::uuid[]),
    v_why = '', v_why;
END
$$;

CREATE OR REPLACE FUNCTION public.lead_team_has(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN p_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.lead_team t JOIN public.hr_staff_costs s ON s.id = t.staff_id WHERE s.user_id = p_user);
END
$$;

-- The Team's Lead View cells for somebody (none while stopped, or not on the Team).
CREATE OR REPLACE FUNCTION public.lead_team_cells(p_user uuid)
RETURNS TABLE (function_key text, action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  st record;
BEGIN
  SELECT * INTO st FROM public.lead_team_state(p_user);
  IF NOT FOUND OR NOT st.active THEN RETURN; END IF;
  RETURN QUERY SELECT 'leads'::text, a FROM unnest(
    CASE WHEN st.role IN ('admin', 'cs') THEN ARRAY['view', 'create', 'edit', 'manage']
         WHEN st.can_reply THEN ARRAY['view', 'create', 'edit']
         ELSE ARRAY['view'] END) AS a;
END
$$;

-- The Team's Lead View boxes for somebody: every box of every lead.* tab, granted by role (all false while stopped).
CREATE OR REPLACE FUNCTION public.lead_team_boxes(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  st record;
  v_on boolean := false;
BEGIN
  SELECT * INTO st FROM public.lead_team_state(p_user);
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  v_on := st.active;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('tab', b.tab_id, 'action', b.action, 'granted',
             v_on AND CASE st.role
               WHEN 'admin' THEN true
               WHEN 'cs' THEN b.tab_id <> 'lead.settings' AND (b.tab_id <> 'lead.campaigns' OR b.action = 'view')
               ELSE (b.tab_id IN ('lead.inbox', 'lead.leads') AND (b.action = 'view' OR st.can_reply))
                    OR (b.tab_id = 'lead.insight' AND st.can_reports)
             END) ORDER BY b.tab_id, b.action)
      FROM (SELECT DISTINCT c.tab_id, c.action FROM public.permission_tab_cells c WHERE c.tab_id LIKE 'lead.%') b), '[]'::jsonb);
END
$$;

-- An Outlet staff's outlets (the chats with no outlet are theirs too); NULL = every outlet (everybody else).
CREATE OR REPLACE FUNCTION public.lead_my_outlets()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  st record;
BEGIN
  SELECT * INTO st FROM public.lead_team_state(auth.uid());
  IF NOT FOUND OR st.role IS DISTINCT FROM 'outlet' THEN RETURN NULL; END IF;
  RETURN coalesce(st.outlets, '{}'::uuid[]);
END
$$;

-- Is a customer inside a scope (lead_my_outlets())? Their outlet is CS's pick, else their ad's (lead_contact_json's rule).
CREATE OR REPLACE FUNCTION public.lead_outlet_ok(p_scope uuid[], p_by text, p_outlet uuid, p_ad text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v uuid;
BEGIN
  IF p_scope IS NULL THEN RETURN true; END IF;
  v := CASE WHEN p_by = 'cs' THEN p_outlet ELSE (SELECT a.outlet_id FROM public.lead_ad_outlets a WHERE a.ad_id = p_ad) END;
  RETURN v IS NULL OR v = ANY (p_scope);
END
$$;

REVOKE ALL ON FUNCTION public.lead_erp_row(uuid), public.lead_team_state(uuid), public.lead_team_has(uuid), public.lead_team_cells(uuid),
  public.lead_team_boxes(uuid), public.lead_my_outlets(), public.lead_outlet_ok(uuid[], text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_erp_row(uuid), public.lead_team_state(uuid), public.lead_team_has(uuid), public.lead_team_cells(uuid),
  public.lead_team_boxes(uuid), public.lead_my_outlets(), public.lead_outlet_ok(uuid[], text, uuid, text) TO service_role;

-- Settings › Team › Add from ERP: everybody People holds and everybody the ERP lists who matches nobody in People.
CREATE OR REPLACE FUNCTION public.lead_staff_directory()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The staff list needs Lead View · Manage.');
  RETURN jsonb_build_object(
    'people', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'staffId', s.id, 'code', coalesce(s.employee_code, ''), 'name', s.employee_name, 'email', coalesce(s.email, ''),
               'title', coalesce(t.name, ''), 'erpCode', coalesce(e.code, ''), 'erpJob', coalesce(e.job, ''), 'branch', coalesce(e.branch, ''),
               'active', s.status = 'active' AND coalesce(e.active, true), 'erpInactive', coalesce(NOT e.active, false),
               'hasLogin', s.user_id IS NOT NULL, 'added', EXISTS (SELECT 1 FROM public.lead_team lt WHERE lt.staff_id = s.id))
             ORDER BY s.employee_name)
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN LATERAL (SELECT * FROM public.lead_erp_row(s.id)) e ON true
       WHERE s.status = 'active' OR EXISTS (SELECT 1 FROM public.lead_team lt WHERE lt.staff_id = s.id)), '[]'::jsonb),
    'erpOnly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'email', x.email, 'job', x.job, 'branch', x.branch, 'active', x.active)
             ORDER BY x.name)
        FROM public.erp_staff x
       WHERE NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s
                          WHERE (x.email <> '' AND lower(btrim(coalesce(s.email, ''))) = x.email)
                             OR lower(btrim(s.employee_name)) = lower(btrim(x.name)))), '[]'::jsonb),
    'erpAt', (SELECT max(d.applied_at) FROM public.erp_staff_deliveries d));
END
$$;
REVOKE ALL ON FUNCTION public.lead_staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_staff_directory() TO authenticated, service_role;

-- Settings › Team: the Team, each with where they stand.
CREATE OR REPLACE FUNCTION public.lead_team()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'staffId', s.id, 'code', coalesce(s.employee_code, ''), 'name', s.employee_name, 'email', coalesce(s.email, ''),
             'title', coalesce(tt.name, ''), 'erpCode', coalesce(e.code, ''), 'erpJob', coalesce(e.job, ''), 'branch', coalesce(e.branch, ''),
             'hasLogin', s.user_id IS NOT NULL, 'role', t.role, 'reply', t.can_reply, 'reports', t.can_reports,
             'outlets', coalesce((SELECT jsonb_agg(o.outlet_id) FROM public.lead_team_outlets o
                                   JOIN public.lead_outlets lo ON lo.id = o.outlet_id AND lo.deleted_at IS NULL WHERE o.staff_id = s.id), '[]'::jsonb),
             'from', t.from_on, 'to', t.to_on,
             'why', CASE WHEN s.status IS DISTINCT FROM 'active' THEN 'people'
                         WHEN e.staff_id IS NOT NULL AND NOT e.active THEN 'erp'
                         WHEN t.from_on IS NOT NULL AND v_today < t.from_on THEN 'not_yet'
                         WHEN t.to_on IS NOT NULL AND v_today > t.to_on THEN 'ended' ELSE '' END,
             'leftOn', coalesce(e.left_on, s.resignation_date))
           ORDER BY s.employee_name)
      FROM public.lead_team t
      JOIN public.hr_staff_costs s ON s.id = t.staff_id
      LEFT JOIN public.titles tt ON tt.id = s.title_id
      LEFT JOIN LATERAL (SELECT * FROM public.lead_erp_row(s.id)) e ON true), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_team() TO authenticated, service_role;

-- Add somebody, or change them. Outlets only for Outlet staff (kept otherwise, unused).
CREATE OR REPLACE FUNCTION public.lead_team_save(p_staff uuid, p_role text, p_reply boolean, p_reports boolean,
  p_outlets uuid[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Team needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs WHERE id = p_staff) THEN
    RAISE EXCEPTION 'That person is not in People.' USING ERRCODE = 'P0002';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('admin', 'cs', 'outlet') THEN
    RAISE EXCEPTION 'Admin, Customer service or Outlet staff.' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The last day comes after the first.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_outlets, '{}')) o WHERE NOT EXISTS (SELECT 1 FROM public.lead_outlets x WHERE x.id = o AND x.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'An outlet that is not there.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lead_team AS t (staff_id, role, can_reply, can_reports, from_on, to_on, added_by_name)
  VALUES (p_staff, p_role, coalesce(p_reply, true), coalesce(p_reports, false), p_from, p_to, left(public.lead_actor_name(), 80))
  ON CONFLICT (staff_id) DO UPDATE
    SET role = excluded.role, can_reply = excluded.can_reply, can_reports = excluded.can_reports,
        from_on = excluded.from_on, to_on = excluded.to_on, updated_at = now()
    WHERE (t.role, t.can_reply, t.can_reports, t.from_on, t.to_on)
          IS DISTINCT FROM (excluded.role, excluded.can_reply, excluded.can_reports, excluded.from_on, excluded.to_on);
  DELETE FROM public.lead_team_outlets o WHERE o.staff_id = p_staff AND NOT (o.outlet_id = ANY (coalesce(p_outlets, '{}')));
  INSERT INTO public.lead_team_outlets (staff_id, outlet_id)
  SELECT p_staff, x FROM unnest(coalesce(p_outlets, '{}')) x ON CONFLICT DO NOTHING;
  RETURN public.lead_team();
END
$$;
REVOKE ALL ON FUNCTION public.lead_team_save(uuid, text, boolean, boolean, uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_team_save(uuid, text, boolean, boolean, uuid[], date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_team_remove(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'The Team needs Lead View · Manage.');
  DELETE FROM public.lead_team WHERE staff_id = p_staff;
  RETURN public.lead_team();
END
$$;
REVOKE ALL ON FUNCTION public.lead_team_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_team_remove(uuid) TO authenticated, service_role;

DO $do$
DECLARE
  v_swaps text[][] := ARRAY[
    ARRAY['public.current_actions()', 'aae861a3bcdabf3e843ee794f647457f',
          $$        FROM cells c
       WHERE EXISTS (SELECT 1 FROM me)$$,
          $$        FROM (  -- Lead View's Team decides Lead View for its people (mig 20261110220100)
              SELECT y.function_key, y.action, y.scope FROM cells y
               WHERE NOT (y.function_key = 'leads' AND public.lead_team_has((SELECT id FROM me)))
              UNION ALL
              SELECT z.function_key, z.action, 'all' FROM public.lead_team_cells((SELECT id FROM me)) z
             ) c
       WHERE EXISTS (SELECT 1 FROM me)$$],
    ARRAY['public.current_permissions()', 'b6122dcaf7ca957b67b17134569bb575',
          $$ SELECT coalesce(array_agg(key),'{}'::text[]) FROM resolved
 WHERE$$,
          $$ SELECT coalesce(array_agg(key),'{}'::text[]) FROM (  -- Lead View's Team (mig 20261110220100)
  SELECT r.key FROM resolved r WHERE NOT (r.key='leads' AND public.lead_team_has((SELECT id FROM me)))
  UNION SELECT 'leads' WHERE EXISTS(SELECT 1 FROM public.lead_team_cells((SELECT id FROM me)))
 ) resolved
 WHERE$$],
    ARRAY['public.current_tabs()', 'f4642c7adab521153f7d8a94242c3417',
          $$  IF v_template IS NULL OR NOT EXISTS (SELECT 1 FROM public.permission_templates WHERE id = v_template) THEN
    RETURN NULL;
  END IF;$$,
          $$  IF v_template IS NULL OR NOT EXISTS (SELECT 1 FROM public.permission_templates WHERE id = v_template) THEN
    -- Lead View's Team (mig 20261110220100): its boxes over the tabs their cells give.
    IF public.lead_team_has(v_me) THEN
      RETURN jsonb_build_object('ticks', NULL, 'boxes', public.lead_team_boxes(v_me), 'cells', false);
    END IF;
    RETURN NULL;
  END IF;$$],
    ARRAY['public.current_tabs()', 'f4642c7adab521153f7d8a94242c3417',
          $$                         FROM public.user_permission_tabs b WHERE b.user_id = v_me), '[]'::jsonb),$$,
          $$                         FROM public.user_permission_tabs b WHERE b.user_id = v_me
                          AND NOT (b.tab_id LIKE 'lead.%' AND public.lead_team_has(v_me))), '[]'::jsonb)
             || CASE WHEN public.lead_team_has(v_me) THEN public.lead_team_boxes(v_me) ELSE '[]'::jsonb END,  -- the Team's$$],
    ARRAY['public.lead_inbox()', '225ac2bbbffc0b58d4e0907c3a1c0d09',
          $$             WHERE (SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[])$$,
          $$             WHERE ((SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[]))
               AND public.lead_outlet_ok((SELECT public.lead_my_outlets()), x.outlet_by, x.outlet_id, x.ad_id)  -- an Outlet staff's (mig 20261110220100)$$],
    ARRAY['public.lead_thread(uuid)', '97f162b4a62e67d96ba8878620297f80',
          $$  IF NOT FOUND OR NOT (public.lead_my_brands() IS NULL OR c.brand_id = ANY (public.lead_my_brands())) THEN$$,
          $$  IF NOT FOUND OR NOT (public.lead_my_brands() IS NULL OR c.brand_id = ANY (public.lead_my_brands()))
     OR NOT public.lead_outlet_ok(public.lead_my_outlets(), c.outlet_by, c.outlet_id, c.ad_id) THEN  -- mig 20261110220100$$],
    ARRAY['public.lead_leads(date,date)', '69d5efa668e9384aa952a75c04a57291',
          $$             WHERE ((SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[]))$$,
          $$             WHERE public.lead_outlet_ok((SELECT public.lead_my_outlets()), x.outlet_by, x.outlet_id, x.ad_id)  -- mig 20261110220100
               AND ((SELECT public.lead_my_brands()) IS NULL OR x.brand_id = ANY ((SELECT public.lead_my_brands())::uuid[]))$$],
    ARRAY['public.lead_list(date,date)', '59872e2116366458399781aee36bc1e0',
          $$       AND (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < p_to), '[]'::jsonb);$$,
          $$       AND (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < p_to
       AND public.lead_outlet_ok((SELECT public.lead_my_outlets()), c.outlet_by, c.outlet_id, c.ad_id)), '[]'::jsonb);  -- mig 20261110220100$$],
    ARRAY['public.lead_insight_more(date,date)', 'd131344ee12b17ba490facca20006acc',
          $$       LIMIT 5000)$$,
          $$         AND public.lead_outlet_ok((SELECT public.lead_my_outlets()), c.outlet_by, c.outlet_id, c.ad_id)  -- mig 20261110220100
       LIMIT 5000)$$]];
  i int;
  v_sig regprocedure;
  v_src text;
  v_def text;
  v_done text[] := '{}';
BEGIN
  FOR i IN 1 .. array_length(v_swaps, 1) LOOP
    v_sig := v_swaps[i][1]::regprocedure;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_sig;
    -- Applied already (this migration run before): the function names this migration.
    IF position('mig 20261110220100' IN v_src) > 0 AND NOT (v_swaps[i][1] = ANY (v_done)) THEN
      CONTINUE;
    END IF;
    IF NOT (v_swaps[i][1] = ANY (v_done)) AND md5(v_src) IS DISTINCT FROM v_swaps[i][2] THEN
      RAISE EXCEPTION '%: not the body this migration was written against (md5 %) — compare it with production first', v_sig, md5(v_src);
    END IF;
    v_def := pg_get_functiondef(v_sig);
    IF (length(v_def) - length(replace(v_def, v_swaps[i][3], ''))) / length(v_swaps[i][3]) <> 1 THEN
      RAISE EXCEPTION '%: the text to swap is not there exactly once', v_sig;
    END IF;
    EXECUTE replace(v_def, v_swaps[i][3], v_swaps[i][4]);
    v_done := v_done || v_swaps[i][1];
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
