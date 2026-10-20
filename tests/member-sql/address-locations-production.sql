-- Production's own text of the two Attendance functions mig 20261020233000 swaps one statement in (pg_get_functiondef, 2026-10-20; CRLF line ends stored as LF — each md5 below is of production's prosrc).

-- att_config() md5(prosrc) 910bf4c64f3db7d0e56056882f64980d
CREATE OR REPLACE FUNCTION public.att_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'now', to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI'),
    'canCreate', public.has_any_action(ARRAY['attendance.create']),
    'canEdit', public.has_any_action(ARRAY['attendance.edit']),
    'canApprove', public.has_any_action(ARRAY['attendance.approve']),
    'me', public.att_actor_name(),
    'people', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.employee_name, 'code', s.employee_code,
               'titleId', s.title_id, 'title', coalesce(t.name, s.designation),
               'level', l.rank, 'levelName', l.name,
               'departmentId', s.department_id, 'department', d.name,
               'hireDate', s.hire_date, 'hasLogin', s.user_id IS NOT NULL,
               'uplineId', s.reports_to, 'upline', up.employee_name, 'uplineHasLogin', up.user_id IS NOT NULL,
               'templateId', t.template_id)
             ORDER BY lower(s.employee_name))
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.title_levels l ON l.id = t.level_id
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.hr_staff_costs up ON up.id = s.reports_to
       WHERE s.status = 'active'), '[]'::jsonb),
    'titles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'level', l.rank, 'departmentId', t.department_id,
               'hasTemplate', t.template_id IS NOT NULL) ORDER BY t.sort_order, t.name)
        FROM public.titles t LEFT JOIN public.title_levels l ON l.id = t.level_id
       WHERE t.is_active), '[]'::jsonb),
    'levels', coalesce((SELECT jsonb_agg(jsonb_build_object('rank', l.rank, 'name', l.name) ORDER BY l.rank) FROM public.title_levels l), '[]'::jsonb),
    'departments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) ORDER BY d.name)
        FROM public.departments d
       WHERE EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.department_id = d.id AND s.status = 'active')), '[]'::jsonb),
    'schedules', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'days', x.days) ORDER BY x.created_at)
        FROM public.att_schedules x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'locations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'address', x.address, 'state', x.state,
               'radius', x.radius_m, 'lat', x.lat, 'lng', x.lng) ORDER BY x.created_at)
        FROM public.att_locations x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'day', x.day, 'name', x.name, 'kind', x.kind, 'states', x.states) ORDER BY x.day)
        FROM public.att_holidays x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'level', x.level, 'titleId', x.title_id, 'staffId', x.staff_id,
               'label', x.label, 'mode', x.mode, 'scheduleId', x.schedule_id, 'locationId', x.location_id, 'anywhere', x.anywhere,
               'ot', x.ot, 'from', x.effective_from) ORDER BY x.created_at)
        FROM public.att_assignments x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'leaveTypes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'groups', x.groups,
               'rules', x.rules, 'route', x.route, 'counts', x.counts, 'accrues', x.accrues, 'unpaid', x.unpaid,
               'drawsFrom', x.draws_from) ORDER BY x.sort_order, x.created_at)
        FROM public.att_leave_types x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'otRates', coalesce((SELECT jsonb_agg(jsonb_build_object('dayType', x.day_type, 'multiplier', x.multiplier, 'minimum', x.minimum))
        FROM public.att_ot_rates x), '[]'::jsonb),
    'policies', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'from', x.effective_from, 'fenceMode', x.fence_mode,
               'photoRequired', x.photo_required, 'earliestInMin', x.earliest_in_min, 'cutover', x.cutover, 'graceMin', x.grace_min,
               'correctionsPerMonth', x.corrections_per_month, 'otWarnH', x.ot_warn_h, 'otFlagH', x.ot_flag_h, 'otBase', x.ot_base,
               'photoKeepDays', x.photo_keep_days, 'otWageCap', x.ot_wage_cap) ORDER BY x.effective_from)
        FROM public.att_policy x), '[]'::jsonb),
    'routes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'scope', x.scope, 'kinds', x.kinds, 'label', x.label,
               'titleId', x.title_id, 'route', x.route, 'why', x.why) ORDER BY x.sort_order, x.created_at)
        FROM public.att_routes x WHERE x.deleted_at IS NULL), '[]'::jsonb));
END
$function$

;

-- att_save_setting(text,uuid,jsonb) md5(prosrc) dbc7a7882112b5a940fa35a5a769edf5
CREATE OR REPLACE FUNCTION public.att_save_setting(p_kind text, p_id uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id    uuid := p_id;
  v_label text;
  v_min   numeric;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Changing attendance settings needs Attendance · Edit.');
  PERFORM public.tab_write_guard_sites(ARRAY['/attendance/settings|attendance.edit', '/attendance/requests|attendance.edit']);
  IF p_kind = 'schedule' THEN
    v_label := btrim(p_row->>'name');
    IF v_id IS NULL THEN
      INSERT INTO public.att_schedules (name, days) VALUES (v_label, p_row->'days') RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_schedules SET name = v_label, days = p_row->'days', updated_at = now() WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSIF p_kind = 'location' THEN
    v_label := btrim(p_row->>'name');
    IF v_id IS NULL THEN
      INSERT INTO public.att_locations (name, address, state, radius_m, lat, lng)
      VALUES (v_label, coalesce(p_row->>'address', ''), coalesce(p_row->>'state', ''), coalesce((p_row->>'radius')::integer, 150),
              (p_row->>'lat')::double precision, (p_row->>'lng')::double precision) RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_locations SET name = v_label, address = coalesce(p_row->>'address', ''), state = coalesce(p_row->>'state', ''),
             radius_m = coalesce((p_row->>'radius')::integer, 150), lat = (p_row->>'lat')::double precision,
             lng = (p_row->>'lng')::double precision, updated_at = now()
       WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSIF p_kind = 'holiday' THEN
    v_label := btrim(p_row->>'name');
    IF v_id IS NULL THEN
      INSERT INTO public.att_holidays (day, name, kind, states)
      VALUES ((p_row->>'day')::date, v_label, p_row->>'kind', coalesce(p_row->>'states', 'All')) RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_holidays SET day = (p_row->>'day')::date, name = v_label, kind = p_row->>'kind',
             states = coalesce(p_row->>'states', 'All'), updated_at = now()
       WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSIF p_kind = 'assignment' THEN
    v_label := btrim(p_row->>'label');
    IF v_id IS NULL THEN
      INSERT INTO public.att_assignments (level, title_id, staff_id, label, mode, schedule_id, location_id, anywhere, ot, effective_from)
      VALUES (p_row->>'level', (p_row->>'titleId')::uuid, (p_row->>'staffId')::uuid, v_label, p_row->>'mode',
              (p_row->>'scheduleId')::uuid, (p_row->>'locationId')::uuid, coalesce((p_row->>'anywhere')::boolean, false),
              nullif(p_row->>'ot', ''), (p_row->>'from')::date) RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_assignments SET level = p_row->>'level', title_id = (p_row->>'titleId')::uuid, staff_id = (p_row->>'staffId')::uuid,
             label = v_label, mode = p_row->>'mode', schedule_id = (p_row->>'scheduleId')::uuid, location_id = (p_row->>'locationId')::uuid,
             anywhere = coalesce((p_row->>'anywhere')::boolean, false), ot = nullif(p_row->>'ot', ''),
             effective_from = (p_row->>'from')::date, updated_at = now()
       WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSIF p_kind = 'leave' THEN
    v_label := btrim(p_row->>'name');
    IF v_id IS NULL THEN
      INSERT INTO public.att_leave_types (code, name, groups, rules, route, counts, accrues, unpaid, draws_from, sort_order)
      VALUES (upper(btrim(p_row->>'code')), v_label, coalesce(p_row->'groups', '[]'::jsonb), coalesce(p_row->>'rules', ''),
              coalesce(p_row->>'route', 'upline_only'), coalesce(p_row->>'counts', 'working'),
              coalesce((p_row->>'accrues')::boolean, false), coalesce((p_row->>'unpaid')::boolean, false),
              nullif(upper(btrim(coalesce(p_row->>'drawsFrom', ''))), ''),
              coalesce((SELECT max(sort_order) + 1 FROM public.att_leave_types), 0)) RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_leave_types SET code = upper(btrim(p_row->>'code')), name = v_label, groups = coalesce(p_row->'groups', '[]'::jsonb),
             rules = coalesce(p_row->>'rules', ''), route = coalesce(p_row->>'route', 'upline_only'),
             counts = coalesce(p_row->>'counts', 'working'), accrues = coalesce((p_row->>'accrues')::boolean, false),
             unpaid = coalesce((p_row->>'unpaid')::boolean, false),
             draws_from = nullif(upper(btrim(coalesce(p_row->>'drawsFrom', ''))), ''), updated_at = now()
       WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSIF p_kind = 'ot' THEN
    v_label := p_row->>'dayType';
    SELECT minimum INTO v_min FROM public.att_ot_rates WHERE day_type = v_label;
    IF v_min IS NULL THEN RAISE EXCEPTION 'No such day type.'; END IF;
    IF (p_row->>'multiplier')::numeric < v_min THEN
      RAISE EXCEPTION 'The Act''s minimum is %×. Lower is not allowed.', v_min;
    END IF;
    UPDATE public.att_ot_rates SET multiplier = (p_row->>'multiplier')::numeric, updated_at = now() WHERE day_type = v_label;
  ELSIF p_kind = 'policy' THEN
    v_label := p_row->>'from';
    IF (p_row->>'from')::date < v_today THEN
      RAISE EXCEPTION 'A policy applies from today or later, never backwards.';
    END IF;
    INSERT INTO public.att_policy (effective_from, fence_mode, photo_required, earliest_in_min, cutover, grace_min,
           corrections_per_month, ot_warn_h, ot_flag_h, ot_base, photo_keep_days, ot_wage_cap)
    VALUES ((p_row->>'from')::date, p_row->>'fenceMode', (p_row->>'photoRequired')::boolean, (p_row->>'earliestInMin')::integer,
            p_row->>'cutover', (p_row->>'graceMin')::integer, (p_row->>'correctionsPerMonth')::integer, (p_row->>'otWarnH')::integer,
            (p_row->>'otFlagH')::integer, p_row->>'otBase', (p_row->>'photoKeepDays')::integer,
            coalesce((p_row->>'otWageCap')::numeric, (SELECT x.ot_wage_cap FROM public.att_policy x ORDER BY x.effective_from DESC LIMIT 1), 4000))
    ON CONFLICT (effective_from) DO UPDATE SET fence_mode = EXCLUDED.fence_mode, photo_required = EXCLUDED.photo_required,
           earliest_in_min = EXCLUDED.earliest_in_min, cutover = EXCLUDED.cutover, grace_min = EXCLUDED.grace_min,
           corrections_per_month = EXCLUDED.corrections_per_month, ot_warn_h = EXCLUDED.ot_warn_h, ot_flag_h = EXCLUDED.ot_flag_h,
           ot_base = EXCLUDED.ot_base, photo_keep_days = EXCLUDED.photo_keep_days, ot_wage_cap = EXCLUDED.ot_wage_cap
    RETURNING id INTO v_id;
  ELSIF p_kind = 'route' THEN
    v_label := btrim(p_row->>'label');
    IF v_id IS NULL THEN
      INSERT INTO public.att_routes (scope, kinds, label, title_id, route, why, sort_order)
      VALUES (p_row->>'scope', ARRAY(SELECT jsonb_array_elements_text(p_row->'kinds')), v_label, (p_row->>'titleId')::uuid,
              p_row->>'route', coalesce(p_row->>'why', ''), coalesce((SELECT max(sort_order) + 1 FROM public.att_routes), 0)) RETURNING id INTO v_id;
    ELSE
      UPDATE public.att_routes SET scope = p_row->>'scope', kinds = ARRAY(SELECT jsonb_array_elements_text(p_row->'kinds')), label = v_label,
             title_id = (p_row->>'titleId')::uuid, route = p_row->>'route', why = coalesce(p_row->>'why', ''), updated_at = now()
       WHERE id = v_id AND deleted_at IS NULL;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown setting %.', p_kind;
  END IF;
  IF NOT FOUND AND p_id IS NOT NULL AND p_kind NOT IN ('ot', 'policy') THEN
    RAISE EXCEPTION 'This % is no longer there.', p_kind;
  END IF;
  PERFORM public.att_event('setting', p_kind || ':' || coalesce(v_id::text, v_label), NULL,
    CASE WHEN p_id IS NULL AND p_kind NOT IN ('ot', 'policy') THEN 'Added' ELSE 'Changed' END, coalesce(v_label, ''));
  RETURN jsonb_build_object('id', v_id, 'label', v_label);
END
$function$

;
