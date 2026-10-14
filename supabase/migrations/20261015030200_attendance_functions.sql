-- ============================================================================
-- 20261015030200_attendance_functions.sql
-- HR › Attendance (2026-10-15): the att_* functions over the tables of
-- 20261015030100 — see that file's head for who may call which.
-- ============================================================================

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Who is acting, as their name (the staff record signed in as, else the account).
CREATE OR REPLACE FUNCTION public.att_actor_name()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v text;
BEGIN
  SELECT s.employee_name INTO v FROM public.hr_staff_costs s
   WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.created_at LIMIT 1;
  IF v IS NULL THEN
    SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v FROM public.users u WHERE u.id = auth.uid();
  END IF;
  RETURN coalesce(v, 'System');
END
$fn$;

-- The staff record the caller signs in as (their own punches and requests).
CREATE OR REPLACE FUNCTION public.att_my_staff_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.id FROM public.hr_staff_costs s
   WHERE s.user_id = auth.uid() AND s.status = 'active' AND auth.uid() IS NOT NULL
   ORDER BY s.created_at LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION public.att_need(p_wants text[], p_words text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(p_wants) THEN
    RAISE EXCEPTION '%', p_words USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.att_event(p_entity text, p_key text, p_staff uuid, p_what text, p_note text DEFAULT '')
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.att_events (entity, entity_key, staff_id, what, actor_name, actor_user, note)
  VALUES (p_entity, p_key, p_staff, p_what, public.att_actor_name(), auth.uid(), coalesce(p_note, ''))
$fn$;

REVOKE ALL ON FUNCTION public.att_actor_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_my_staff_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_need(text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_event(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_actor_name() TO service_role;
GRANT EXECUTE ON FUNCTION public.att_my_staff_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.att_need(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.att_event(text, text, uuid, text, text) TO service_role;

-- ── Readers ──────────────────────────────────────────────────────────────────

-- Everything Settings holds, and the people it applies to: every page reads it.
CREATE OR REPLACE FUNCTION public.att_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
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
               'photoKeepDays', x.photo_keep_days) ORDER BY x.effective_from)
        FROM public.att_policy x), '[]'::jsonb),
    'routes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'scope', x.scope, 'kinds', x.kinds, 'label', x.label,
               'titleId', x.title_id, 'route', x.route, 'why', x.why) ORDER BY x.sort_order, x.created_at)
        FROM public.att_routes x WHERE x.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- One month's facts (p_month = its first day): punches, HR's marks, whole days,
-- leave touching the month, the close's decisions and its state.
CREATE OR REPLACE FUNCTION public.att_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN jsonb_build_object(
    'month', v_from,
    'punches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'staffId', p.staff_id, 'day', p.work_day, 'dir', p.direction,
               'time', to_char(p.at AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI'), 'source', p.source,
               'locationId', p.location_id, 'distance', p.distance_m, 'inside', p.inside_fence, 'accuracy', p.accuracy_m,
               'device', p.device, 'photo', p.photo_path IS NOT NULL, 'reason', p.reason,
               'invalid', p.invalid_at IS NOT NULL, 'invalidReason', p.invalid_reason) ORDER BY p.at)
        FROM public.att_punches p WHERE p.work_day BETWEEN v_from AND v_to), '[]'::jsonb),
    'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'in', m.in_time,
               'out', m.out_time, 'note', m.note, 'by', m.by_name, 'at', m.at))
        FROM public.att_day_marks m WHERE m.day BETWEEN v_from AND v_to), '[]'::jsonb),
    'overrides', coalesce((SELECT jsonb_agg(jsonb_build_object('day', o.day, 'code', o.code, 'name', o.name))
        FROM public.att_day_overrides o WHERE o.day BETWEEN v_from AND v_to), '[]'::jsonb),
    'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
               'from', r.date_from, 'to', r.date_to, 'status', r.status))
        FROM public.att_requests r
       WHERE r.kind = 'leave' AND r.status IN ('pending', 'approved') AND r.date_from <= v_to AND r.date_to >= v_from), '[]'::jsonb),
    'decisions', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', d.staff_id, 'day', d.day, 'decision', d.decision, 'by', d.by_name))
        FROM public.att_day_decisions d WHERE d.day BETWEEN v_from AND v_to), '[]'::jsonb),
    'close', (SELECT jsonb_build_object('status', m.status, 'closedAt', m.closed_at, 'closedBy', m.closed_by_name, 'people', m.people,
               'reopenedAt', m.reopened_at) FROM public.att_months m WHERE m.month = v_from));
END
$fn$;

-- Every request still waiting, and the ones decided in the last 120 days, with their steps.
CREATE OR REPLACE FUNCTION public.att_requests_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'who', s.employee_name, 'kind', r.kind, 'leaveCode', r.leave_code,
             'from', r.date_from, 'to', r.date_to, 'days', r.days, 'hours', r.hours, 'detail', r.detail, 'reason', r.reason,
             'attachment', r.attachment_name, 'hasAttachment', r.attachment_path IS NOT NULL,
             'route', r.route, 'status', r.status, 'onBehalf', r.on_behalf, 'by', r.created_by_name, 'sentAt', r.sent_at,
             'decidedAt', r.decided_at,
             'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('id', st.id, 'seq', st.seq, 'role', st.role,
                         'approverId', st.approver_staff_id, 'approver', st.approver_name, 'state', st.state,
                         'decidedBy', st.decided_by_name, 'onBehalf', st.on_behalf, 'note', st.note,
                         'arrivedAt', st.arrived_at, 'decidedAt', st.decided_at) ORDER BY st.seq)
                  FROM public.att_request_steps st WHERE st.request_id = r.id), '[]'::jsonb),
             'events', coalesce((SELECT jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'at', e.at, 'note', e.note) ORDER BY e.at, e.id)
                  FROM public.att_events e WHERE e.entity = 'request' AND e.entity_key = r.id::text), '[]'::jsonb))
           ORDER BY r.sent_at DESC)
      FROM public.att_requests r JOIN public.hr_staff_costs s ON s.id = r.staff_id
     WHERE r.status = 'pending' OR r.sent_at > now() - interval '120 days' OR r.decided_at > now() - interval '120 days'), '[]'::jsonb);
END
$fn$;

-- A year's stored ledger rows, the approved / pending leave that year, and HR's leave marks.
CREATE OR REPLACE FUNCTION public.att_ledger(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from date := make_date(p_year, 1, 1);
  v_to   date := make_date(p_year, 12, 31);
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN jsonb_build_object(
    'year', p_year,
    'entries', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'ref', l.ref, 'staffId', l.staff_id, 'code', l.leave_code,
               'kind', l.kind, 'days', l.days, 'date', l.entry_date, 'note', l.note, 'detail', l.detail, 'by', l.by_name, 'at', l.at,
               'events', coalesce((SELECT jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'at', e.at, 'note', e.note) ORDER BY e.at, e.id)
                  FROM public.att_events e WHERE e.entity = 'ledger' AND e.entity_key = l.id::text), '[]'::jsonb)) ORDER BY l.entry_date, l.at)
        FROM public.att_ledger l WHERE l.year = p_year), '[]'::jsonb),
    'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
               'from', r.date_from, 'to', r.date_to, 'days', r.days, 'status', r.status, 'onBehalf', r.on_behalf, 'by', r.created_by_name,
               'reason', r.reason, 'sentAt', r.sent_at, 'decidedAt', r.decided_at,
               'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('role', st.role, 'approver', st.approver_name, 'state', st.state,
                         'decidedBy', st.decided_by_name, 'onBehalf', st.on_behalf, 'decidedAt', st.decided_at, 'arrivedAt', st.arrived_at) ORDER BY st.seq)
                  FROM public.att_request_steps st WHERE st.request_id = r.id), '[]'::jsonb)) ORDER BY r.date_from)
        FROM public.att_requests r
       WHERE r.kind = 'leave' AND r.status IN ('pending', 'approved') AND r.date_from <= v_to AND r.date_to >= v_from), '[]'::jsonb),
    'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'note', m.note, 'by', m.by_name, 'at', m.at) ORDER BY m.day)
        FROM public.att_day_marks m
       WHERE m.day BETWEEN v_from AND v_to AND EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = m.code AND t.deleted_at IS NULL)), '[]'::jsonb));
END
$fn$;

-- ── Settings writers ─────────────────────────────────────────────────────────
-- One writer for every Settings card (p_kind), so the windows share one save:
--   schedule  { name, days[7] }
--   location  { name, address, state, radius, lat?, lng? }
--   holiday   { day, name, kind, states }
--   assignment { level, titleId?, staffId?, label, mode, scheduleId?, locationId?, anywhere, ot?, from }
--   leave     { code, name, groups, rules, route, counts, accrues, unpaid, drawsFrom? }
--   ot        { dayType, multiplier }               (p_id ignored)
--   policy    { from, fenceMode, photoRequired, earliestInMin, cutover, graceMin, correctionsPerMonth, otWarnH, otFlagH, otBase, photoKeepDays }
--   route     { scope, kinds[], label, titleId?, route, why }
CREATE OR REPLACE FUNCTION public.att_save_setting(p_kind text, p_id uuid, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id    uuid := p_id;
  v_label text;
  v_min   numeric;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Changing attendance settings needs Attendance · Edit.');
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
           corrections_per_month, ot_warn_h, ot_flag_h, ot_base, photo_keep_days)
    VALUES ((p_row->>'from')::date, p_row->>'fenceMode', (p_row->>'photoRequired')::boolean, (p_row->>'earliestInMin')::integer,
            p_row->>'cutover', (p_row->>'graceMin')::integer, (p_row->>'correctionsPerMonth')::integer, (p_row->>'otWarnH')::integer,
            (p_row->>'otFlagH')::integer, p_row->>'otBase', (p_row->>'photoKeepDays')::integer)
    ON CONFLICT (effective_from) DO UPDATE SET fence_mode = EXCLUDED.fence_mode, photo_required = EXCLUDED.photo_required,
           earliest_in_min = EXCLUDED.earliest_in_min, cutover = EXCLUDED.cutover, grace_min = EXCLUDED.grace_min,
           corrections_per_month = EXCLUDED.corrections_per_month, ot_warn_h = EXCLUDED.ot_warn_h, ot_flag_h = EXCLUDED.ot_flag_h,
           ot_base = EXCLUDED.ot_base, photo_keep_days = EXCLUDED.photo_keep_days
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
$fn$;

CREATE OR REPLACE FUNCTION public.att_delete_setting(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_label text;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Changing attendance settings needs Attendance · Edit.');
  IF p_kind = 'schedule' THEN
    IF EXISTS (SELECT 1 FROM public.att_assignments a WHERE a.schedule_id = p_id AND a.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'This schedule is in use — change those assignments first.';
    END IF;
    UPDATE public.att_schedules SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING name INTO v_label;
  ELSIF p_kind = 'location' THEN
    IF EXISTS (SELECT 1 FROM public.att_assignments a WHERE a.location_id = p_id AND a.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'This location is in use — change those assignments first.';
    END IF;
    UPDATE public.att_locations SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING name INTO v_label;
  ELSIF p_kind = 'holiday' THEN
    UPDATE public.att_holidays SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING name INTO v_label;
  ELSIF p_kind = 'assignment' THEN
    IF EXISTS (SELECT 1 FROM public.att_assignments a WHERE a.id = p_id AND a.level = 'company') THEN
      RAISE EXCEPTION 'The company default is not deleted — change it instead.';
    END IF;
    UPDATE public.att_assignments SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING label INTO v_label;
  ELSIF p_kind = 'leave' THEN
    UPDATE public.att_leave_types SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING name INTO v_label;
  ELSIF p_kind = 'route' THEN
    UPDATE public.att_routes SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING label INTO v_label;
  ELSE
    RAISE EXCEPTION 'Unknown setting %.', p_kind;
  END IF;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'This % is no longer there.', p_kind;
  END IF;
  PERFORM public.att_event('setting', p_kind || ':' || p_id::text, NULL, 'Deleted', v_label);
  RETURN jsonb_build_object('id', p_id, 'label', v_label);
END
$fn$;

-- ── Records: HR's corrections ────────────────────────────────────────────────

-- Set people × days to one status (a leave code books leave from Records).
-- Refused inside a closed month.
CREATE OR REPLACE FUNCTION public.att_set_days(p_staff uuid[], p_from date, p_to date, p_code text, p_in text, p_out text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := public.att_actor_name();
  v_n    integer := 0;
  v_d    date;
  v_s    uuid;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Correcting attendance needs Attendance · Edit.');
  IF btrim(coalesce(p_note, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN RAISE EXCEPTION 'Pick at most 62 days.'; END IF;
  IF coalesce(array_length(p_staff, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick somebody.'; END IF;
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.status = 'closed'
              AND m.month BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date) THEN
    RAISE EXCEPTION 'That month is closed — reopen it first.';
  END IF;
  IF p_code NOT IN ('P', 'L', 'A', 'I', 'H', 'SO', 'W')
     AND NOT EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = p_code AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Unknown status %.', p_code;
  END IF;
  FOREACH v_s IN ARRAY p_staff LOOP
    v_d := p_from;
    WHILE v_d <= p_to LOOP
      INSERT INTO public.att_day_marks (staff_id, day, code, in_time, out_time, note, by_name)
      VALUES (v_s, v_d, p_code,
              CASE WHEN p_code IN ('P', 'L', 'I') THEN nullif(p_in, '') END,
              CASE WHEN p_code IN ('P', 'L') THEN nullif(p_out, '') END, btrim(p_note), v_name)
      ON CONFLICT (staff_id, day) DO UPDATE SET code = EXCLUDED.code, in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time,
             note = EXCLUDED.note, by_user = auth.uid(), by_name = EXCLUDED.by_name, at = now();
      PERFORM public.att_event('mark', v_s::text || ':' || v_d::text, v_s, 'Set to ' || p_code, btrim(p_note));
      v_n := v_n + 1;
      v_d := v_d + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('cells', v_n);
END
$fn$;

-- Back to what the punches and the schedule say.
CREATE OR REPLACE FUNCTION public.att_clear_days(p_staff uuid[], p_from date, p_to date, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Correcting attendance needs Attendance · Edit.');
  IF btrim(coalesce(p_note, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.status = 'closed'
              AND m.month BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date) THEN
    RAISE EXCEPTION 'That month is closed — reopen it first.';
  END IF;
  WITH gone AS (DELETE FROM public.att_day_marks WHERE staff_id = ANY (p_staff) AND day BETWEEN p_from AND p_to RETURNING staff_id, day)
  SELECT count(*) INTO v_n FROM gone;
  RETURN jsonb_build_object('cells', v_n);
END
$fn$;

-- A whole day (or days) for everyone: H / CH / SO / WD, or back to normal (p_code NULL).
CREATE OR REPLACE FUNCTION public.att_set_day_override(p_from date, p_to date, p_code text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := public.att_actor_name();
  v_d    date := p_from;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Changing a whole day needs Attendance · Edit.');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN RAISE EXCEPTION 'Pick at most 62 days.'; END IF;
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.status = 'closed'
              AND m.month BETWEEN date_trunc('month', p_from)::date AND date_trunc('month', p_to)::date) THEN
    RAISE EXCEPTION 'That month is closed — reopen it first.';
  END IF;
  WHILE v_d <= p_to LOOP
    IF p_code IS NULL THEN
      DELETE FROM public.att_day_overrides WHERE day = v_d;
    ELSE
      INSERT INTO public.att_day_overrides (day, code, name, by_name) VALUES (v_d, p_code, btrim(coalesce(p_name, '')), v_name)
      ON CONFLICT (day) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, by_user = auth.uid(), by_name = EXCLUDED.by_name, at = now();
    END IF;
    PERFORM public.att_event('day', v_d::text, NULL, coalesce('Set to ' || p_code, 'Back to normal'), coalesce(p_name, ''));
    v_d := v_d + 1;
  END LOOP;
  RETURN jsonb_build_object('days', p_to - p_from + 1);
END
$fn$;

CREATE OR REPLACE FUNCTION public.att_invalidate_punch(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.att_punches%ROWTYPE;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Marking a punch invalid needs Attendance · Edit.');
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  UPDATE public.att_punches SET invalid_at = now(), invalid_by = auth.uid(), invalid_reason = btrim(p_reason)
   WHERE id = p_id AND invalid_at IS NULL RETURNING * INTO v_p;
  IF NOT FOUND THEN RAISE EXCEPTION 'This punch is no longer there.'; END IF;
  PERFORM public.att_event('punch', p_id::text, v_p.staff_id, 'Marked invalid', btrim(p_reason));
  RETURN jsonb_build_object('id', p_id);
END
$fn$;

-- ── Requests ─────────────────────────────────────────────────────────────────

-- The route a request takes: a title override, else the company row for its kind, else the leave type's own.
CREATE OR REPLACE FUNCTION public.att_route_for(p_staff uuid, p_kind text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_title uuid;
  v_route text;
BEGIN
  SELECT title_id INTO v_title FROM public.hr_staff_costs WHERE id = p_staff;
  SELECT r.route INTO v_route FROM public.att_routes r
   WHERE r.deleted_at IS NULL AND r.scope = 'title' AND r.title_id = v_title AND (p_kind = ANY (r.kinds) OR '*' = ANY (r.kinds))
   ORDER BY r.sort_order LIMIT 1;
  IF v_route IS NULL THEN
    SELECT r.route INTO v_route FROM public.att_routes r
     WHERE r.deleted_at IS NULL AND r.scope = 'company' AND (p_kind = ANY (r.kinds) OR '*' = ANY (r.kinds))
     ORDER BY r.sort_order LIMIT 1;
  END IF;
  IF v_route IS NULL THEN
    SELECT t.route INTO v_route FROM public.att_leave_types t WHERE t.code = p_kind AND t.deleted_at IS NULL;
  END IF;
  RETURN coalesce(v_route, CASE WHEN p_kind IN ('OT') THEN 'upline_then_hr' WHEN p_kind = 'PF' THEN 'hr_only' ELSE 'upline_only' END);
END
$fn$;

-- Send a request: a person's own (signed in as themselves), or — Attendance ·
-- Create — on somebody's behalf. p_booked = HR books it straight away (Leave
-- balances › Use leave): it skips the upline and is approved on the spot.
CREATE OR REPLACE FUNCTION public.att_create_request(
  p_staff       uuid,
  p_kind        text,
  p_leave_code  text,
  p_from        date,
  p_to          date,
  p_days        numeric,
  p_hours       numeric,
  p_detail      jsonb,
  p_reason      text,
  p_booked      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me       uuid := public.att_my_staff_id();
  v_actor    text := public.att_actor_name();
  v_behalf   boolean := p_staff IS DISTINCT FROM v_me;
  v_prefix   text := CASE p_kind WHEN 'leave' THEN 'LV' WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' WHEN 'profile' THEN 'PF' END;
  v_route    text;
  v_ref      text;
  v_id       uuid;
  v_up       uuid;
  v_up_name  text;
  v_up_login boolean;
  v_seq      integer := 0;
  v_now      timestamptz := now();
BEGIN
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Unknown request kind %.', p_kind; END IF;
  IF v_behalf OR p_booked THEN
    PERFORM public.att_need(ARRAY['attendance.create'], 'Sending a request for somebody else needs Attendance · Create.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = p_staff AND s.status = 'active') THEN
    RAISE EXCEPTION 'That person is not on the staff list.';
  END IF;
  IF p_kind = 'leave' AND NOT EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = p_leave_code AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Unknown leave type %.', p_leave_code;
  END IF;
  IF (p_booked OR v_behalf) AND btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  v_route := CASE WHEN p_booked THEN 'hr_only'
                  ELSE public.att_route_for(p_staff, CASE p_kind WHEN 'leave' THEN p_leave_code WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' ELSE 'PF' END) END;
  v_ref := v_prefix || '-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMM') || '-' || lpad(nextval('public.att_request_seq')::text, 3, '0');
  INSERT INTO public.att_requests (ref, staff_id, kind, leave_code, date_from, date_to, days, hours, detail, reason, route,
         status, on_behalf, created_by_name, decided_at)
  VALUES (v_ref, p_staff, p_kind, CASE WHEN p_kind = 'leave' THEN p_leave_code END, p_from, coalesce(p_to, p_from), p_days, p_hours,
          coalesce(p_detail, '{}'::jsonb), btrim(coalesce(p_reason, '')), v_route,
          CASE WHEN p_booked THEN 'approved' ELSE 'pending' END, v_behalf, v_actor, CASE WHEN p_booked THEN v_now END)
  RETURNING id INTO v_id;
  SELECT up.id, up.employee_name, up.user_id IS NOT NULL INTO v_up, v_up_name, v_up_login
    FROM public.hr_staff_costs s JOIN public.hr_staff_costs up ON up.id = s.reports_to AND up.status = 'active'
   WHERE s.id = p_staff;
  IF p_booked THEN
    INSERT INTO public.att_request_steps (request_id, seq, role, approver_name, state, decided_by, decided_by_name, on_behalf, arrived_at, decided_at)
    VALUES (v_id, 1, 'hr', 'HR approvers', 'approved', auth.uid(), v_actor, true, v_now, v_now);
    PERFORM public.att_event('request', v_id::text, p_staff, 'Booked by HR on behalf', btrim(coalesce(p_reason, '')));
  ELSE
    IF v_route IN ('upline_only', 'upline_then_hr') AND v_up IS NOT NULL AND v_up_login THEN
      v_seq := v_seq + 1;
      INSERT INTO public.att_request_steps (request_id, seq, role, approver_staff_id, approver_name, state, arrived_at)
      VALUES (v_id, v_seq, 'upline', v_up, v_up_name, 'waiting', v_now);
    END IF;
    IF v_route IN ('hr_only', 'upline_then_hr') OR v_seq = 0 THEN
      v_seq := v_seq + 1;
      INSERT INTO public.att_request_steps (request_id, seq, role, approver_name, state, arrived_at)
      VALUES (v_id, v_seq, 'hr', 'HR approvers', CASE WHEN v_seq = 1 THEN 'waiting' ELSE 'queued' END, CASE WHEN v_seq = 1 THEN v_now END);
    END IF;
    PERFORM public.att_event('request', v_id::text, p_staff, CASE WHEN v_behalf THEN 'Sent by HR on behalf' ELSE 'Submitted' END, btrim(coalesce(p_reason, '')));
  END IF;
  RETURN jsonb_build_object('id', v_id, 'ref', v_ref);
END
$fn$;

-- Decide the step that is waiting: Attendance · Approve (HR's step, or the
-- upline's on their behalf — recorded as such), or the upline themselves.
-- Rejecting needs a note (the requester sees it). Nobody decides their own.
CREATE OR REPLACE FUNCTION public.att_decide(p_request uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r      public.att_requests%ROWTYPE;
  v_st     public.att_request_steps%ROWTYPE;
  v_me     uuid := public.att_my_staff_id();
  v_actor  text := public.att_actor_name();
  v_hr     boolean := public.has_any_action(ARRAY['attendance.approve']);
  v_behalf boolean;
  v_next   uuid;
  v_now    timestamptz := now();
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_r.status <> 'pending' THEN RAISE EXCEPTION 'This request is no longer waiting.'; END IF;
  SELECT * INTO v_st FROM public.att_request_steps WHERE request_id = p_request AND state = 'waiting' ORDER BY seq LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is no longer waiting.'; END IF;
  IF v_r.staff_id IS NOT DISTINCT FROM v_me THEN RAISE EXCEPTION 'Nobody decides their own request.' USING ERRCODE = '42501'; END IF;
  IF v_st.role = 'upline' AND v_st.approver_staff_id IS NOT DISTINCT FROM v_me AND v_me IS NOT NULL THEN
    v_behalf := false;
  ELSIF v_hr THEN
    v_behalf := v_st.role = 'upline';
  ELSE
    RAISE EXCEPTION 'Deciding a request needs Attendance · Approve.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND btrim(coalesce(p_note, '')) = '' THEN RAISE EXCEPTION 'A note is needed to reject.'; END IF;
  UPDATE public.att_request_steps
     SET state = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_by = auth.uid(), decided_by_name = v_actor,
         on_behalf = v_behalf, note = btrim(coalesce(p_note, '')), decided_at = v_now
   WHERE id = v_st.id;
  IF p_approve THEN
    SELECT id INTO v_next FROM public.att_request_steps WHERE request_id = p_request AND state = 'queued' ORDER BY seq LIMIT 1;
    IF v_next IS NOT NULL THEN
      UPDATE public.att_request_steps SET state = 'waiting', arrived_at = v_now WHERE id = v_next;
    ELSE
      UPDATE public.att_requests SET status = 'approved', decided_at = v_now WHERE id = p_request;
    END IF;
  ELSE
    UPDATE public.att_request_steps SET state = 'skipped' WHERE request_id = p_request AND state = 'queued';
    UPDATE public.att_requests SET status = 'rejected', decided_at = v_now WHERE id = p_request;
  END IF;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id,
    CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END || ' by ' || CASE v_st.role WHEN 'hr' THEN 'HR' ELSE 'upline' END
      || CASE WHEN v_behalf THEN ' (on behalf)' ELSE '' END, btrim(coalesce(p_note, '')));
  RETURN jsonb_build_object('id', p_request, 'ref', v_r.ref,
    'status', (SELECT status FROM public.att_requests WHERE id = p_request));
END
$fn$;

-- Withdraw a request still waiting (its sender, or HR).
CREATE OR REPLACE FUNCTION public.att_cancel_request(p_request uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r public.att_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_r.status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'This request is no longer there.'; END IF;
  IF NOT (v_r.staff_id IS NOT DISTINCT FROM public.att_my_staff_id() AND v_r.status = 'pending')
     AND NOT public.has_any_action(ARRAY['attendance.edit']) THEN
    RAISE EXCEPTION 'Withdrawing this request needs Attendance · Edit.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.att_requests SET status = 'cancelled', decided_at = now() WHERE id = p_request;
  UPDATE public.att_request_steps SET state = 'skipped' WHERE request_id = p_request AND state IN ('waiting', 'queued');
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Withdrawn', btrim(coalesce(p_note, '')));
  RETURN jsonb_build_object('id', p_request);
END
$fn$;

-- ── Leave balances ───────────────────────────────────────────────────────────

-- An opening balance (carried in) or an adjustment (+/−), with its reason.
CREATE OR REPLACE FUNCTION public.att_ledger_add(p_staff uuid, p_code text, p_year integer, p_kind text, p_days numeric, p_note text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id  uuid;
  v_ref text;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Changing a leave balance needs Attendance · Edit.');
  IF btrim(coalesce(p_note, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  IF p_days IS NULL OR p_days = 0 THEN RAISE EXCEPTION 'Nothing to change.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = p_code AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Unknown leave type %.', p_code;
  END IF;
  v_ref := CASE p_kind WHEN 'opening' THEN 'OB-' ELSE 'ADJ-' END || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMM') || '-'
           || lpad(nextval('public.att_request_seq')::text, 3, '0');
  INSERT INTO public.att_ledger (ref, staff_id, leave_code, year, kind, days, entry_date, note, detail, by_name)
  VALUES (v_ref, p_staff, p_code, p_year, p_kind, p_days,
          CASE WHEN p_kind = 'opening' THEN make_date(p_year, 1, 1) ELSE (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date END,
          btrim(p_note), coalesce(p_detail, '{}'::jsonb), public.att_actor_name())
  RETURNING id INTO v_id;
  PERFORM public.att_event('ledger', v_id::text, p_staff, CASE p_kind WHEN 'opening' THEN 'Opening entered by HR' ELSE 'Adjusted by HR' END, btrim(p_note));
  RETURN jsonb_build_object('id', v_id, 'ref', v_ref);
END
$fn$;

-- ── Month close ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_decide_day(p_staff uuid, p_day date, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Deciding a day needs Attendance · Edit.');
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.month = date_trunc('month', p_day)::date AND m.status = 'closed') THEN
    RAISE EXCEPTION 'That month is closed — reopen it first.';
  END IF;
  IF p_decision IS NULL THEN
    DELETE FROM public.att_day_decisions WHERE staff_id = p_staff AND day = p_day;
  ELSE
    INSERT INTO public.att_day_decisions (staff_id, day, decision, by_name) VALUES (p_staff, p_day, p_decision, public.att_actor_name())
    ON CONFLICT (staff_id, day) DO UPDATE SET decision = EXCLUDED.decision, by_user = auth.uid(), by_name = EXCLUDED.by_name, at = now();
  END IF;
  PERFORM public.att_event('day', p_staff::text || ':' || p_day::text, p_staff, coalesce('Decided ' || lower(p_decision), 'Decision cleared'));
  RETURN jsonb_build_object('staffId', p_staff, 'day', p_day, 'decision', p_decision);
END
$fn$;

-- Close a month: the page has checked nothing is left to clear and hands in
-- the register it reckoned (one row per person); the database refuses while a
-- request touching the month still waits.
CREATE OR REPLACE FUNCTION public.att_close_month(p_month date, p_register jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Closing the month needs Attendance · Edit.');
  IF EXISTS (SELECT 1 FROM public.att_requests r WHERE r.status = 'pending'
              AND coalesce(r.date_from, (r.sent_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date) <= v_to
              AND coalesce(r.date_to, r.date_from, (r.sent_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date) >= v_from) THEN
    RAISE EXCEPTION 'Requests touching this month are still waiting.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.att_months m WHERE m.month = v_from AND m.status = 'closed') THEN
    RAISE EXCEPTION 'This month is already closed.';
  END IF;
  INSERT INTO public.att_months (month, status, people, register, closed_at, closed_by, closed_by_name)
  VALUES (v_from, 'closed', jsonb_array_length(coalesce(p_register, '[]'::jsonb)), coalesce(p_register, '[]'::jsonb), now(), auth.uid(), public.att_actor_name())
  ON CONFLICT (month) DO UPDATE SET status = 'closed', people = EXCLUDED.people, register = EXCLUDED.register,
         closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by, closed_by_name = EXCLUDED.closed_by_name;
  PERFORM public.att_event('month', v_from::text, NULL, 'Closed', jsonb_array_length(coalesce(p_register, '[]'::jsonb))::text || ' people');
  RETURN jsonb_build_object('month', v_from, 'people', jsonb_array_length(coalesce(p_register, '[]'::jsonb)));
END
$fn$;

CREATE OR REPLACE FUNCTION public.att_reopen_month(p_month date, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Reopening the month needs Attendance · Edit.');
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  UPDATE public.att_months SET status = 'open', reopened_at = now(), reopen_reason = btrim(p_reason)
   WHERE month = v_from AND status = 'closed';
  IF NOT FOUND THEN RAISE EXCEPTION 'This month is not closed.'; END IF;
  PERFORM public.att_event('month', v_from::text, NULL, 'Reopened', btrim(p_reason));
  RETURN jsonb_build_object('month', v_from);
END
$fn$;

-- ── Punching (the button the user adds to the apps later) ────────────────────
-- A person's own punch, signed in as themselves. The work day follows the
-- policy's cutover; the nearest location's fence is checked (outside = flagged,
-- or refused if the policy says Refuse).
CREATE OR REPLACE FUNCTION public.att_punch(p_direction text, p_lat double precision, p_lng double precision, p_accuracy integer,
                                            p_device text, p_photo_path text, p_reason text, p_source text DEFAULT 'app')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff  uuid := public.att_my_staff_id();
  v_local  timestamp := now() AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_pol    public.att_policy%ROWTYPE;
  v_day    date;
  v_loc    uuid;
  v_dist   integer;
  v_radius integer;
  v_inside boolean;
  v_id     uuid;
BEGIN
  IF v_staff IS NULL THEN RAISE EXCEPTION 'Punching needs a staff record linked to this login.' USING ERRCODE = '42501'; END IF;
  IF p_direction NOT IN ('in', 'out') THEN RAISE EXCEPTION 'IN or OUT.'; END IF;
  SELECT * INTO v_pol FROM public.att_policy WHERE effective_from <= v_local::date ORDER BY effective_from DESC LIMIT 1;
  v_day := CASE WHEN v_pol.id IS NOT NULL AND to_char(v_local, 'HH24:MI') < v_pol.cutover THEN v_local::date - 1 ELSE v_local::date END;
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT l.id, l.radius_m,
           round(6371000 * 2 * asin(sqrt(power(sin(radians(l.lat - p_lat) / 2), 2)
                 + cos(radians(p_lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - p_lng) / 2), 2))))::integer AS d
      INTO v_loc, v_radius, v_dist
      FROM public.att_locations l
     WHERE l.deleted_at IS NULL AND l.lat IS NOT NULL AND l.lng IS NOT NULL
     ORDER BY 3 LIMIT 1;
    v_inside := CASE WHEN v_loc IS NULL THEN NULL ELSE v_dist <= v_radius END;
  END IF;
  IF v_inside IS FALSE AND v_pol.fence_mode = 'refuse' THEN
    RAISE EXCEPTION 'You are outside every allowed location.';
  END IF;
  INSERT INTO public.att_punches (staff_id, work_day, direction, source, lat, lng, accuracy_m, location_id, distance_m, inside_fence,
         device, photo_path, reason)
  VALUES (v_staff, v_day, p_direction, CASE WHEN p_source IN ('app', 'web') THEN p_source ELSE 'app' END, p_lat, p_lng, p_accuracy,
          v_loc, v_dist, v_inside, left(coalesce(p_device, ''), 120), p_photo_path, left(btrim(coalesce(p_reason, '')), 200))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'day', v_day, 'inside', v_inside, 'distance', v_dist);
END
$fn$;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.att_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_month(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_requests_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_ledger(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_save_setting(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_delete_setting(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_set_days(uuid[], date, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_clear_days(uuid[], date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_set_day_override(date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_invalidate_punch(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_route_for(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_create_request(uuid, text, text, date, date, numeric, numeric, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_cancel_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_ledger_add(uuid, text, integer, text, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_decide_day(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_close_month(date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_reopen_month(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_punch(text, double precision, double precision, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_route_for(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.att_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_requests_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_ledger(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_save_setting(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_delete_setting(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_set_days(uuid[], date, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_clear_days(uuid[], date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_set_day_override(date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_invalidate_punch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_create_request(uuid, text, text, date, date, numeric, numeric, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_cancel_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_ledger_add(uuid, text, integer, text, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_decide_day(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_close_month(date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_reopen_month(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.att_punch(text, double precision, double precision, integer, text, text, text, text) TO authenticated;
