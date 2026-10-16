-- ============================================================================
-- 20261017100000_me_self_service.sql
-- "Me" — a person's own attendance, leave, payslips, record and line (2026-10-17, the Claude Design handoff
-- "Attendance Prototype Design (1)" = `design_handoff_staff_app`, `source/Staff App v2.dc.html`).
-- ============================================================================
--
-- The user: "find a button for this file … for punch card and do all hr things, make it in finance app and view and
-- hr as well" — the Me module opens from the HR app's header, the Finance app's Profile and the desktop views' top
-- bar. Until now a person could punch (att_punch) and send their own request (att_create_request) but read none of
-- it back: every att_* reader asks Attendance · View. These answer for the CALLER only — their People record
-- (att_my_staff_id(), the login's own active staff row) — and change nothing:
--
-- 1. att_me(month) — one's own: the record as the engine reads a person, the company's settings the engine needs
--    (schedules, fences, holidays, the assignments that can apply to them, leave types, OT rates, policies, routes),
--    the month's facts (their punches — never another's —, HR's marks on them, the whole days, their leave, the
--    month's close), their requests with each step and trail, their leave ledger for the year, the corrections used
--    in the month, whether they read the punch notice, and the fairs coming (Extra manpower's "For"). Without a
--    People record: { me: null } — the app says so. att_me_today() is the same person's today alone (who clocks,
--    the schedule's row, the punches, leave), for the button and the card that open Me.
-- 2. att_my_team() — an upline's own: the people who report to them, TODAY only (times, place and flags — never a
--    photo: "Photos stay with HR"), the requests waiting at their upline step, and those requesters' leave ledgers
--    (the decision sheet's Balance). Not HR's view of anybody else.
-- 3. att_my_org() — one's line (the reports_to chain up), one's department and one's reports: name, title, the
--    upline link, a status WORD for today (present · late · leave · out · none) — never a time — and the mobile.
-- 4. my_record() — one's People record for Me › Profile: contact, emergency contact, bank, and what HR keeps
--    (NRIC and the account number reach the phone only as their last four).
-- 5. my_payslips() — one's own PAID payroll rows, each with its pay date and the account it went to (last four).
-- 6. att_punch_notice_ack() — "Before your first punch" read once (an att_events row; read back by att_me).
-- 7. att_create_request — a fifth kind, Extra manpower (`manpower`, MP-YYMM-nnn, route kind 'MP' — upline, then HR
--    by default): who for, the days, the role and how many (1–6); and one's own corrections stop at the policy's
--    "Corrections per month" for that month (HR's on behalf still may). att_route_for: 'MP' defaults to upline → HR.
--    Both are PRODUCTION's bodies (md5 below, read 2026-10-17) with those swaps only.
-- 8. att_status_on(staff, day) — the status word, as lib/attendance/engine.ts reckons a day (HR's mark wins, then
--    approved leave, then the first valid IN against the schedule's start and the policy's grace; outside a fence or
--    from a computer counts as flagged). Called only by the functions above.
--
-- PGlite: tests/member-sql/validate-me-self-service.mjs.

DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.att_create_request(uuid, text, text, date, date, numeric, numeric, jsonb, text, boolean)', '4f34b0ba3924ce25c37caed5c32fe980', '''manpower'''),
      ('public.att_route_for(uuid, text)', 'fc452902880cba8caaed7841fe5e07af', '''MP''')
    ) AS t(sig, md5, mark)
  LOOP
    PERFORM 1 FROM pg_proc p
     WHERE p.oid = r.sig::regprocedure AND (md5(p.prosrc) = r.md5 OR strpos(p.prosrc, r.mark) > 0);
    IF NOT FOUND THEN
      RAISE EXCEPTION '% changed in production since this migration was written', r.sig;
    END IF;
  END LOOP;
END
$guard$;

-- ── 7. Extra manpower, and one's own corrections per month ──────────────────

ALTER TABLE public.att_requests DROP CONSTRAINT IF EXISTS att_requests_kind_check;
ALTER TABLE public.att_requests ADD CONSTRAINT att_requests_kind_check
  CHECK (kind = ANY (ARRAY['leave'::text, 'ot'::text, 'correction'::text, 'profile'::text, 'manpower'::text]));

CREATE OR REPLACE FUNCTION public.att_route_for(p_staff uuid, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  RETURN coalesce(v_route, CASE WHEN p_kind IN ('OT', 'MP') THEN 'upline_then_hr' WHEN p_kind = 'PF' THEN 'hr_only' ELSE 'upline_only' END);
END
$function$;

CREATE OR REPLACE FUNCTION public.att_create_request(p_staff uuid, p_kind text, p_leave_code text, p_from date, p_to date, p_days numeric, p_hours numeric, p_detail jsonb, p_reason text, p_booked boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me       uuid := public.att_my_staff_id();
  v_actor    text := public.att_actor_name();
  v_behalf   boolean := p_staff IS DISTINCT FROM v_me;
  v_prefix   text := CASE p_kind WHEN 'leave' THEN 'LV' WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' WHEN 'profile' THEN 'PF' WHEN 'manpower' THEN 'MP' END;
  v_route    text;
  v_ref      text;
  v_id       uuid;
  v_up       uuid;
  v_up_name  text;
  v_up_login boolean;
  v_seq      integer := 0;
  v_now      timestamptz := now();
  v_detail   jsonb := coalesce(p_detail, '{}'::jsonb);
  v_quota    integer;
BEGIN
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Unknown request kind %.', p_kind; END IF;
  IF v_behalf OR p_booked THEN
    PERFORM public.att_need(ARRAY['attendance.create'], 'Sending a request for somebody else needs Attendance · Create.');
  PERFORM public.tab_write_guard_sites(ARRAY['/attendance/requests|attendance.create', '/attendance/balances|attendance.create']);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = p_staff AND s.status = 'active') THEN
    RAISE EXCEPTION 'That person is not on the staff list.';
  END IF;
  IF p_kind = 'leave' AND NOT EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = p_leave_code AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Unknown leave type %.', p_leave_code;
  END IF;
  IF p_kind = 'manpower' AND (p_from IS NULL OR coalesce(p_to, p_from) < p_from OR p_booked
       OR coalesce(v_detail ->> 'count', '') !~ '^[1-6]$'
       OR coalesce(v_detail ->> 'role', '') NOT IN ('Promoter', 'Helper', 'Driver')
       OR btrim(coalesce(v_detail ->> 'for', '')) = '' OR length(v_detail ->> 'for') > 120) THEN
    RAISE EXCEPTION 'Say what it is for, the days, the role and how many people (1 to 6).' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'correction' AND NOT v_behalf AND NOT p_booked AND p_from IS NOT NULL THEN
    SELECT x.corrections_per_month INTO v_quota FROM public.att_policy x WHERE x.effective_from <= p_from ORDER BY x.effective_from DESC LIMIT 1;
    IF v_quota IS NULL THEN SELECT x.corrections_per_month INTO v_quota FROM public.att_policy x ORDER BY x.effective_from LIMIT 1; END IF;
    IF v_quota IS NOT NULL AND (SELECT count(*) FROM public.att_requests r
          WHERE r.staff_id = p_staff AND r.kind = 'correction' AND r.status IN ('pending', 'approved')
            AND date_trunc('month', r.date_from) = date_trunc('month', p_from)) >= v_quota THEN
      RAISE EXCEPTION 'No corrections left for %.', to_char(p_from, 'FMMonth') USING ERRCODE = '22023';
    END IF;
  END IF;
  IF (p_booked OR v_behalf) AND btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  v_route := CASE WHEN p_booked THEN 'hr_only'
                  ELSE public.att_route_for(p_staff, CASE p_kind WHEN 'leave' THEN p_leave_code WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' WHEN 'manpower' THEN 'MP' ELSE 'PF' END) END;
  IF p_kind = 'profile' THEN
    IF p_booked THEN RAISE EXCEPTION 'A profile change is approved, never booked.' USING ERRCODE = '22023'; END IF;
    v_detail := public.att_profile_changes(p_staff, v_detail);
    IF v_route = 'upline_only' THEN v_route := 'upline_then_hr'; END IF;
  END IF;
  v_ref := v_prefix || '-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMM') || '-' || lpad(nextval('public.att_request_seq')::text, 3, '0');
  INSERT INTO public.att_requests (ref, staff_id, kind, leave_code, date_from, date_to, days, hours, detail, reason, route,
         status, on_behalf, created_by_name, decided_at)
  VALUES (v_ref, p_staff, p_kind, CASE WHEN p_kind = 'leave' THEN p_leave_code END, p_from, coalesce(p_to, p_from), p_days, p_hours,
          v_detail, btrim(coalesce(p_reason, '')), v_route,
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
$function$;

-- ── The work day it is now — att_punch's own rule: before the policy's cutover it is still yesterday's ──

CREATE OR REPLACE FUNCTION public.att_work_day()
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := now() AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_pol   public.att_policy%ROWTYPE;
BEGIN
  SELECT * INTO v_pol FROM public.att_policy WHERE effective_from <= v_local::date ORDER BY effective_from DESC LIMIT 1;
  RETURN CASE WHEN v_pol.id IS NOT NULL AND to_char(v_local, 'HH24:MI') < v_pol.cutover THEN v_local::date - 1 ELSE v_local::date END;
END
$fn$;

-- ── 8. The status word for a person's day ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_status_on(p_staff uuid, p_day date)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mark   text;
  v_title  uuid;
  v_mode   text;
  v_sched  uuid;
  v_row    jsonb;
  v_start  text;
  v_grace  integer;
  v_in     timestamptz;
  v_inside boolean;
  v_source text;
BEGIN
  SELECT m.code INTO v_mark FROM public.att_day_marks m WHERE m.staff_id = p_staff AND m.day = p_day;
  IF v_mark IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = v_mark AND t.deleted_at IS NULL) THEN RETURN 'leave'; END IF;
    RETURN CASE v_mark WHEN 'P' THEN 'present' WHEN 'L' THEN 'late' ELSE 'out' END;
  END IF;
  IF EXISTS (SELECT 1 FROM public.att_requests r
              WHERE r.staff_id = p_staff AND r.kind = 'leave' AND r.status = 'approved' AND r.date_from <= p_day AND r.date_to >= p_day) THEN
    RETURN 'leave';
  END IF;
  SELECT s.title_id INTO v_title FROM public.hr_staff_costs s WHERE s.id = p_staff;
  SELECT a.mode, a.schedule_id INTO v_mode, v_sched
    FROM public.att_assignments a
   WHERE a.deleted_at IS NULL AND a.effective_from <= p_day
     AND (a.level = 'company' OR (a.level = 'title' AND a.title_id = v_title) OR (a.level = 'person' AND a.staff_id = p_staff))
   ORDER BY CASE a.level WHEN 'person' THEN 3 WHEN 'title' THEN 2 ELSE 1 END DESC, a.effective_from DESC
   LIMIT 1;
  IF v_mode IS NULL OR v_mode = 'off' THEN RETURN 'none'; END IF;
  IF v_sched IS NOT NULL THEN
    SELECT x.days -> (extract(isodow FROM p_day)::integer - 1) INTO v_row FROM public.att_schedules x WHERE x.id = v_sched;
    v_start := v_row ->> 'start';
  END IF;
  IF v_mode = 'no_clock' THEN
    RETURN CASE WHEN coalesce(v_row ->> 'type', 'work') = 'work' THEN 'present' ELSE 'out' END;
  END IF;
  SELECT p.at, p.inside_fence, p.source INTO v_in, v_inside, v_source
    FROM public.att_punches p
   WHERE p.staff_id = p_staff AND p.work_day = p_day AND p.direction = 'in' AND p.invalid_at IS NULL
   ORDER BY p.at
   LIMIT 1;
  IF v_in IS NULL THEN RETURN 'out'; END IF;
  IF v_inside IS FALSE OR v_source = 'web' THEN RETURN 'late'; END IF;
  SELECT x.grace_min INTO v_grace FROM public.att_policy x WHERE x.effective_from <= p_day ORDER BY x.effective_from DESC LIMIT 1;
  IF v_grace IS NULL THEN SELECT x.grace_min INTO v_grace FROM public.att_policy x ORDER BY x.effective_from LIMIT 1; END IF;
  IF v_start ~ '^[0-2][0-9]:[0-5][0-9]$'
     AND to_char(v_in AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI')::time > v_start::time + make_interval(mins => coalesce(v_grace, 5)) THEN
    RETURN 'late';
  END IF;
  RETURN 'present';
END
$fn$;

-- ── 1. One's own attendance ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_me(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.att_my_staff_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_from  date;
  v_to    date;
  v_year  integer;
  v_title uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  v_from := date_trunc('month', coalesce(p_month, public.att_work_day()))::date;
  v_to := (v_from + interval '1 month - 1 day')::date;
  v_year := extract(year FROM v_today)::integer;
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('today', v_today, 'workDay', public.att_work_day(), 'now', to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI:SS'), 'me', NULL);
  END IF;
  SELECT s.title_id INTO v_title FROM public.hr_staff_costs s WHERE s.id = v_me;
  RETURN jsonb_build_object(
    'today', v_today,
    'workDay', public.att_work_day(),
    'now', to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI:SS'),
    'me', (SELECT jsonb_build_object(
               'id', s.id, 'name', s.employee_name, 'code', s.employee_code,
               'titleId', s.title_id, 'title', coalesce(t.name, s.designation),
               'level', l.rank, 'levelName', l.name,
               'departmentId', s.department_id, 'department', d.name,
               'hireDate', s.hire_date, 'hasLogin', true,
               'uplineId', up.id, 'upline', up.employee_name, 'uplineHasLogin', up.user_id IS NOT NULL,
               'templateId', t.template_id)
             FROM public.hr_staff_costs s
             LEFT JOIN public.titles t ON t.id = s.title_id
             LEFT JOIN public.title_levels l ON l.id = t.level_id
             LEFT JOIN public.departments d ON d.id = s.department_id
             LEFT JOIN public.hr_staff_costs up ON up.id = s.reports_to AND up.status = 'active'
            WHERE s.id = v_me),
    'reports', (SELECT count(*) FROM public.hr_staff_costs r WHERE r.reports_to = v_me AND r.status = 'active'),
    'schedules', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'days', x.days) ORDER BY x.created_at)
        FROM public.att_schedules x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'locations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'address', x.address, 'state', x.state,
               'radius', x.radius_m, 'lat', x.lat, 'lng', x.lng) ORDER BY x.created_at)
        FROM public.att_locations x WHERE x.deleted_at IS NULL), '[]'::jsonb),
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'day', x.day, 'name', x.name, 'kind', x.kind, 'states', x.states) ORDER BY x.day)
        FROM public.att_holidays x WHERE x.deleted_at IS NULL AND x.day BETWEEN make_date(v_year - 1, 1, 1) AND make_date(v_year + 1, 12, 31)), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'level', x.level, 'titleId', x.title_id, 'staffId', x.staff_id,
               'label', x.label, 'mode', x.mode, 'scheduleId', x.schedule_id, 'locationId', x.location_id, 'anywhere', x.anywhere,
               'ot', x.ot, 'from', x.effective_from) ORDER BY x.created_at)
        FROM public.att_assignments x
       WHERE x.deleted_at IS NULL
         AND (x.level = 'company' OR (x.level = 'title' AND x.title_id = v_title) OR (x.level = 'person' AND x.staff_id = v_me))), '[]'::jsonb),
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
        FROM public.att_routes x WHERE x.deleted_at IS NULL AND (x.scope = 'company' OR x.title_id = v_title)), '[]'::jsonb),
    'month', jsonb_build_object(
      'month', v_from,
      'punches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'staffId', p.staff_id, 'day', p.work_day, 'dir', p.direction,
                 'time', to_char(p.at AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI'), 'source', p.source,
                 'locationId', p.location_id, 'distance', p.distance_m, 'inside', p.inside_fence, 'accuracy', p.accuracy_m,
                 'device', p.device, 'photo', p.photo_path IS NOT NULL, 'reason', p.reason,
                 'invalid', p.invalid_at IS NOT NULL, 'invalidReason', p.invalid_reason) ORDER BY p.at)
          FROM public.att_punches p WHERE p.staff_id = v_me AND p.work_day BETWEEN v_from AND v_to), '[]'::jsonb),
      'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'in', m.in_time,
                 'out', m.out_time, 'note', m.note, 'by', m.by_name, 'at', m.at))
          FROM public.att_day_marks m WHERE m.staff_id = v_me AND m.day BETWEEN v_from AND v_to), '[]'::jsonb),
      'overrides', coalesce((SELECT jsonb_agg(jsonb_build_object('day', o.day, 'code', o.code, 'name', o.name))
          FROM public.att_day_overrides o WHERE o.day BETWEEN v_from AND v_to), '[]'::jsonb),
      'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
                 'from', r.date_from, 'to', r.date_to, 'status', r.status))
          FROM public.att_requests r
         WHERE r.staff_id = v_me AND r.kind = 'leave' AND r.status IN ('pending', 'approved') AND r.date_from <= v_to AND r.date_to >= v_from), '[]'::jsonb),
      'decisions', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', d.staff_id, 'day', d.day, 'decision', d.decision, 'by', d.by_name))
          FROM public.att_day_decisions d WHERE d.staff_id = v_me AND d.day BETWEEN v_from AND v_to), '[]'::jsonb),
      'close', (SELECT jsonb_build_object('status', m.status, 'closedAt', m.closed_at, 'closedBy', m.closed_by_name, 'people', m.people,
                 'reopenedAt', m.reopened_at) FROM public.att_months m WHERE m.month = v_from)),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'who', s.employee_name, 'kind', r.kind, 'leaveCode', r.leave_code,
               'from', r.date_from, 'to', r.date_to, 'days', r.days, 'hours', r.hours,
               'detail', CASE WHEN jsonb_typeof(r.detail -> 'changes') = 'array' THEN jsonb_set(r.detail, '{changes}', (
                   SELECT coalesce(jsonb_agg(CASE WHEN c ->> 'key' = 'bank_account_no'
                            THEN c || jsonb_build_object(
                                   'from', CASE WHEN coalesce(c ->> 'from', '') = '' THEN c -> 'from'
                                                ELSE to_jsonb('•••• ' || right(regexp_replace(c ->> 'from', '\D', '', 'g'), 4)) END,
                                   'to', CASE WHEN coalesce(c ->> 'to', '') = '' THEN c -> 'to'
                                              ELSE to_jsonb('•••• ' || right(regexp_replace(c ->> 'to', '\D', '', 'g'), 4)) END)
                            ELSE c END ORDER BY i), '[]'::jsonb)
                     FROM jsonb_array_elements(r.detail -> 'changes') WITH ORDINALITY AS x(c, i))) ELSE r.detail END,
               'reason', r.reason, 'attachment', r.attachment_name, 'hasAttachment', r.attachment_path IS NOT NULL,
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
       WHERE r.staff_id = v_me AND (r.status = 'pending' OR r.sent_at > now() - interval '400 days')), '[]'::jsonb),
    'ledger', jsonb_build_object(
      'year', v_year,
      'entries', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'ref', l.ref, 'staffId', l.staff_id, 'code', l.leave_code,
                 'kind', l.kind, 'days', l.days, 'date', l.entry_date, 'note', l.note, 'detail', '{}'::jsonb, 'by', l.by_name, 'at', l.at,
                 'events', '[]'::jsonb) ORDER BY l.entry_date, l.at)
          FROM public.att_ledger l WHERE l.staff_id = v_me AND l.year = v_year), '[]'::jsonb),
      'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
                 'from', r.date_from, 'to', r.date_to, 'days', r.days, 'status', r.status, 'onBehalf', r.on_behalf, 'by', r.created_by_name,
                 'reason', r.reason, 'sentAt', r.sent_at, 'decidedAt', r.decided_at,
                 'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('role', st.role, 'approver', st.approver_name, 'state', st.state,
                           'decidedBy', st.decided_by_name, 'onBehalf', st.on_behalf, 'decidedAt', st.decided_at, 'arrivedAt', st.arrived_at) ORDER BY st.seq)
                    FROM public.att_request_steps st WHERE st.request_id = r.id), '[]'::jsonb)) ORDER BY r.date_from)
          FROM public.att_requests r
         WHERE r.staff_id = v_me AND r.kind = 'leave' AND r.status IN ('pending', 'approved')
           AND r.date_from <= make_date(v_year, 12, 31) AND r.date_to >= make_date(v_year, 1, 1)), '[]'::jsonb),
      'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'note', m.note, 'by', m.by_name, 'at', m.at) ORDER BY m.day)
          FROM public.att_day_marks m
         WHERE m.staff_id = v_me AND m.day BETWEEN make_date(v_year, 1, 1) AND make_date(v_year, 12, 31)
           AND EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = m.code AND t.deleted_at IS NULL)), '[]'::jsonb)),
    'correctionsUsed', (SELECT count(*) FROM public.att_requests r
       WHERE r.staff_id = v_me AND r.kind = 'correction' AND r.status IN ('pending', 'approved') AND r.date_from BETWEEN v_from AND v_to),
    'noticeRead', EXISTS (SELECT 1 FROM public.att_events e WHERE e.entity = 'punch' AND e.entity_key = 'notice:' || auth.uid()::text),
    'fairs', coalesce((SELECT jsonb_agg(f ORDER BY f ->> 'from', f ->> 'name') FROM (
        SELECT jsonb_build_object('key', e.id, 'name', coalesce(nullif(btrim(v.display_name), ''), e.venue_key),
                 'from', coalesce(e.start_date, e.period_month), 'to', coalesce(e.end_date, (e.period_month + interval '1 month - 1 day')::date)) AS f
          FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key = e.venue_key
         WHERE coalesce(e.end_date, (e.period_month + interval '1 month - 1 day')::date) >= v_today
           AND coalesce(e.start_date, e.period_month) <= v_today + 120
         ORDER BY coalesce(e.start_date, e.period_month), e.venue_key
         LIMIT 20) x), '[]'::jsonb));
END
$fn$;

-- …and just today, for the button and the card that open Me (the desktop's top bar, the Finance app's Profile).

CREATE OR REPLACE FUNCTION public.att_me_today()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.att_my_staff_id();
  v_day   date := public.att_work_day();
  v_title uuid;
  v_mode  text;
  v_sched uuid;
  v_row   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN jsonb_build_object('me', false, 'workDay', v_day); END IF;
  SELECT s.title_id INTO v_title FROM public.hr_staff_costs s WHERE s.id = v_me;
  SELECT a.mode, a.schedule_id INTO v_mode, v_sched
    FROM public.att_assignments a
   WHERE a.deleted_at IS NULL AND a.effective_from <= v_day
     AND (a.level = 'company' OR (a.level = 'title' AND a.title_id = v_title) OR (a.level = 'person' AND a.staff_id = v_me))
   ORDER BY CASE a.level WHEN 'person' THEN 3 WHEN 'title' THEN 2 ELSE 1 END DESC, a.effective_from DESC
   LIMIT 1;
  IF v_sched IS NOT NULL THEN
    SELECT x.days -> (extract(isodow FROM v_day)::integer - 1) INTO v_row FROM public.att_schedules x WHERE x.id = v_sched;
  END IF;
  RETURN jsonb_build_object(
    'me', true,
    'workDay', v_day,
    'now', to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI:SS'),
    'mode', v_mode,
    'day', v_row,
    'grace', (SELECT x.grace_min FROM public.att_policy x ORDER BY (x.effective_from <= v_day) DESC, x.effective_from DESC LIMIT 1),
    'onLeave', (SELECT r.leave_code FROM public.att_requests r
                 WHERE r.staff_id = v_me AND r.kind = 'leave' AND r.status = 'approved' AND r.date_from <= v_day AND r.date_to >= v_day LIMIT 1),
    'punches', coalesce((SELECT jsonb_agg(jsonb_build_object('dir', p.direction, 'time', to_char(p.at AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI'),
               'inside', p.inside_fence, 'source', p.source) ORDER BY p.at)
        FROM public.att_punches p WHERE p.staff_id = v_me AND p.work_day = v_day AND p.invalid_at IS NULL), '[]'::jsonb),
    'noticeRead', EXISTS (SELECT 1 FROM public.att_events e WHERE e.entity = 'punch' AND e.entity_key = 'notice:' || auth.uid()::text));
END
$fn$;

-- ── 2. An upline's own team, today ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_my_team()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.att_my_staff_id();
  v_today date := public.att_work_day();
  v_year  integer := extract(year FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur'))::integer;
  v_who   uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN jsonb_build_object('today', v_today, 'reports', '[]'::jsonb, 'waiting', '[]'::jsonb); END IF;
  -- Whom the answer may speak of: the people who report to them, and whoever waits on their decision.
  SELECT array_agg(DISTINCT x) INTO v_who FROM (
    SELECT s.id AS x FROM public.hr_staff_costs s WHERE s.reports_to = v_me AND s.status = 'active'
    UNION
    SELECT r.staff_id FROM public.att_requests r JOIN public.att_request_steps st ON st.request_id = r.id
     WHERE r.status = 'pending' AND st.state = 'waiting' AND st.role = 'upline' AND st.approver_staff_id = v_me) y;
  RETURN jsonb_build_object(
    'today', v_today,
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.employee_name, 'code', s.employee_code,
               'titleId', s.title_id, 'title', coalesce(t.name, s.designation),
               'level', l.rank, 'levelName', l.name,
               'departmentId', s.department_id, 'department', d.name,
               'hireDate', s.hire_date, 'hasLogin', s.user_id IS NOT NULL,
               'uplineId', s.reports_to, 'upline', up.employee_name, 'uplineHasLogin', up.user_id IS NOT NULL,
               'templateId', t.template_id, 'reportsToMe', s.reports_to = v_me)
             ORDER BY lower(s.employee_name))
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.title_levels l ON l.id = t.level_id
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.hr_staff_costs up ON up.id = s.reports_to
       WHERE s.id = ANY (coalesce(v_who, '{}'::uuid[]))), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'level', x.level, 'titleId', x.title_id, 'staffId', x.staff_id,
               'label', x.label, 'mode', x.mode, 'scheduleId', x.schedule_id, 'locationId', x.location_id, 'anywhere', x.anywhere,
               'ot', x.ot, 'from', x.effective_from) ORDER BY x.created_at)
        FROM public.att_assignments x
       WHERE x.deleted_at IS NULL
         AND (x.level = 'company'
              OR (x.level = 'title' AND x.title_id IN (SELECT s.title_id FROM public.hr_staff_costs s WHERE s.id = ANY (coalesce(v_who, '{}'::uuid[]))))
              OR (x.level = 'person' AND x.staff_id = ANY (coalesce(v_who, '{}'::uuid[]))))), '[]'::jsonb),
    'punches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'staffId', p.staff_id, 'day', p.work_day, 'dir', p.direction,
               'time', to_char(p.at AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI'), 'source', p.source,
               'locationId', p.location_id, 'distance', p.distance_m, 'inside', p.inside_fence, 'accuracy', NULL,
               'device', '', 'photo', false, 'reason', p.reason,
               'invalid', p.invalid_at IS NOT NULL, 'invalidReason', '') ORDER BY p.at)
        FROM public.att_punches p
       WHERE p.work_day = v_today AND p.staff_id IN (SELECT s.id FROM public.hr_staff_costs s WHERE s.reports_to = v_me AND s.status = 'active')), '[]'::jsonb),
    'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'in', m.in_time,
               'out', m.out_time, 'note', '', 'by', '', 'at', m.at))
        FROM public.att_day_marks m
       WHERE m.day = v_today AND m.staff_id IN (SELECT s.id FROM public.hr_staff_costs s WHERE s.reports_to = v_me AND s.status = 'active')), '[]'::jsonb),
    'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
               'from', r.date_from, 'to', r.date_to, 'status', r.status))
        FROM public.att_requests r
       WHERE r.kind = 'leave' AND r.status IN ('pending', 'approved') AND r.date_from <= v_today AND r.date_to >= v_today
         AND r.staff_id IN (SELECT s.id FROM public.hr_staff_costs s WHERE s.reports_to = v_me AND s.status = 'active')), '[]'::jsonb),
    'waiting', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'who', s.employee_name, 'kind', r.kind, 'leaveCode', r.leave_code,
               'from', r.date_from, 'to', r.date_to, 'days', r.days, 'hours', r.hours, 'detail', public.att_detail_shown(r.detail),
               'reason', r.reason, 'attachment', r.attachment_name, 'hasAttachment', r.attachment_path IS NOT NULL,
               'route', r.route, 'status', r.status, 'onBehalf', r.on_behalf, 'by', r.created_by_name, 'sentAt', r.sent_at,
               'decidedAt', r.decided_at,
               'steps', coalesce((SELECT jsonb_agg(jsonb_build_object('id', st.id, 'seq', st.seq, 'role', st.role,
                           'approverId', st.approver_staff_id, 'approver', st.approver_name, 'state', st.state,
                           'decidedBy', st.decided_by_name, 'onBehalf', st.on_behalf, 'note', st.note,
                           'arrivedAt', st.arrived_at, 'decidedAt', st.decided_at) ORDER BY st.seq)
                    FROM public.att_request_steps st WHERE st.request_id = r.id), '[]'::jsonb),
               'events', '[]'::jsonb)
             ORDER BY r.sent_at)
        FROM public.att_requests r JOIN public.hr_staff_costs s ON s.id = r.staff_id
       WHERE r.status = 'pending'
         AND EXISTS (SELECT 1 FROM public.att_request_steps st
                      WHERE st.request_id = r.id AND st.state = 'waiting' AND st.role = 'upline' AND st.approver_staff_id = v_me)), '[]'::jsonb),
    'ledger', jsonb_build_object(
      'year', v_year,
      'entries', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'ref', l.ref, 'staffId', l.staff_id, 'code', l.leave_code,
                 'kind', l.kind, 'days', l.days, 'date', l.entry_date, 'note', l.note, 'detail', '{}'::jsonb, 'by', l.by_name, 'at', l.at,
                 'events', '[]'::jsonb) ORDER BY l.entry_date, l.at)
          FROM public.att_ledger l WHERE l.staff_id = ANY (coalesce(v_who, '{}'::uuid[])) AND l.year = v_year), '[]'::jsonb),
      'leave', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'code', r.leave_code,
                 'from', r.date_from, 'to', r.date_to, 'days', r.days, 'status', r.status, 'onBehalf', r.on_behalf, 'by', r.created_by_name,
                 'reason', '', 'sentAt', r.sent_at, 'decidedAt', r.decided_at, 'steps', '[]'::jsonb) ORDER BY r.date_from)
          FROM public.att_requests r
         WHERE r.staff_id = ANY (coalesce(v_who, '{}'::uuid[])) AND r.kind = 'leave' AND r.status IN ('pending', 'approved')
           AND r.date_from <= make_date(v_year, 12, 31) AND r.date_to >= make_date(v_year, 1, 1)), '[]'::jsonb),
      'marks', coalesce((SELECT jsonb_agg(jsonb_build_object('staffId', m.staff_id, 'day', m.day, 'code', m.code, 'note', '', 'by', '', 'at', m.at) ORDER BY m.day)
          FROM public.att_day_marks m
         WHERE m.staff_id = ANY (coalesce(v_who, '{}'::uuid[])) AND m.day BETWEEN make_date(v_year, 1, 1) AND make_date(v_year, 12, 31)
           AND EXISTS (SELECT 1 FROM public.att_leave_types t WHERE t.code = m.code AND t.deleted_at IS NULL)), '[]'::jsonb)));
END
$fn$;

-- ── 3. One's line and department ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_my_org()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.att_my_staff_id();
  v_today date := public.att_work_day();
  v_dept  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN jsonb_build_object('me', NULL, 'people', '[]'::jsonb); END IF;
  SELECT s.department_id INTO v_dept FROM public.hr_staff_costs s WHERE s.id = v_me;
  RETURN jsonb_build_object(
    'me', v_me,
    'departmentId', v_dept,
    'people', coalesce((
      WITH RECURSIVE line AS (
        SELECT s.id, s.reports_to, 0 AS depth FROM public.hr_staff_costs s WHERE s.id = v_me
        UNION ALL
        SELECT up.id, up.reports_to, line.depth + 1
          FROM line JOIN public.hr_staff_costs up ON up.id = line.reports_to AND up.status = 'active'
         WHERE line.depth < 12
      ), who AS (
        SELECT id FROM line
        UNION SELECT s.id FROM public.hr_staff_costs s WHERE s.reports_to = v_me AND s.status = 'active'
        UNION SELECT s.id FROM public.hr_staff_costs s WHERE v_dept IS NOT NULL AND s.department_id = v_dept AND s.status = 'active'
      )
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.employee_name, 'title', coalesce(t.name, s.designation), 'rank', l.rank,
               'departmentId', s.department_id, 'department', d.name, 'reportsTo', s.reports_to,
               'inLine', s.id IN (SELECT id FROM line), 'status', public.att_status_on(s.id, v_today),
               'phone', nullif(btrim(s.contact_number), ''))
             ORDER BY lower(s.employee_name))
        FROM who JOIN public.hr_staff_costs s ON s.id = who.id
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.title_levels l ON l.id = t.level_id
        LEFT JOIN public.departments d ON d.id = s.department_id), '[]'::jsonb));
END
$fn$;

-- ── 4. One's People record ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_record()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.att_my_staff_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
             'id', s.id, 'name', s.employee_name, 'code', s.employee_code, 'title', coalesce(t.name, s.designation),
             'department', d.name, 'hireDate', s.hire_date, 'upline', up.employee_name,
             'phone', s.contact_number, 'email', s.email, 'address', s.address,
             'ecName', s.emergency_contact_name, 'ecPhone', s.emergency_contact_phone, 'ecRel', s.emergency_contact_relationship,
             'bank', s.bank_name,
             'accountLast4', nullif(right(regexp_replace(coalesce(s.bank_account_no, ''), '\D', '', 'g'), 4), ''),
             'nric', CASE WHEN length(regexp_replace(coalesce(s.nric, ''), '\D', '', 'g')) >= 5
                          THEN left(regexp_replace(s.nric, '\D', '', 'g'), 1) || '•••••-••-' || right(regexp_replace(s.nric, '\D', '', 'g'), 4) END)
      FROM public.hr_staff_costs s
      LEFT JOIN public.titles t ON t.id = s.title_id
      LEFT JOIN public.departments d ON d.id = s.department_id
      LEFT JOIN public.hr_staff_costs up ON up.id = s.reports_to
     WHERE s.id = v_me);
END
$fn$;

-- ── 5. One's payslips ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_payslips()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.att_my_staff_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'month', p.period_month, 'status', p.status,
             'paidOn', (SELECT max(pv.payment_date) FROM public.payment_vouchers pv
                         WHERE pv.status = 'paid' AND (pv.reference_id = p.id
                            OR pv.id IN (SELECT l.voucher_id FROM public.payroll_voucher_lines l WHERE l.payroll_row_id = p.id))),
             'bank', coalesce((SELECT l.bank_name FROM public.payroll_voucher_lines l WHERE l.payroll_row_id = p.id AND l.bank_name IS NOT NULL LIMIT 1), s.bank_name),
             'accountLast4', nullif(right(regexp_replace(coalesce(
                 (SELECT l.bank_account_no FROM public.payroll_voucher_lines l WHERE l.payroll_row_id = p.id AND l.bank_account_no IS NOT NULL LIMIT 1),
                 s.bank_account_no, ''), '\D', '', 'g'), 4), ''),
             'basic', p.basic_salary, 'statutoryAllowance', p.statutory_allowance, 'nonStatutoryAllowance', p.non_statutory_allowance,
             'otHours', p.ot_hours, 'otAmount', p.ot_amount, 'commission', p.commission_amount, 'unpaidLeaveDays', p.unpaid_leave_days,
             'deduction', p.deduction_amount, 'epf', p.epf_ee, 'socso', p.socso_ee, 'eis', p.eis_ee, 'pcb', p.pcb,
             'withholding', p.withholding_tax, 'skbbk', p.skbbk_amount,
             'payLineEarnings', p.pay_line_earnings, 'payLineDeductions', p.pay_line_deductions,
             'gross', p.gross, 'net', p.net, 'attendance', p.attendance_figures)
           ORDER BY p.period_month DESC)
      FROM public.hr_monthly_payroll p JOIN public.hr_staff_costs s ON s.id = p.staff_id
     WHERE p.staff_id = v_me AND p.status = 'paid' AND p.period_month >= (date_trunc('year', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')) - interval '1 year')::date), '[]'::jsonb);
END
$fn$;

-- ── 6. The punch notice, read ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.att_punch_notice_ack()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.att_my_staff_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Punching needs a staff record linked to this login.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.att_events e WHERE e.entity = 'punch' AND e.entity_key = 'notice:' || auth.uid()::text) THEN
    PERFORM public.att_event('punch', 'notice:' || auth.uid()::text, v_me, 'Read the punch notice', '');
  END IF;
  RETURN jsonb_build_object('read', true);
END
$fn$;

-- ── Who may call them ───────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.att_status_on(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_status_on(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.att_work_day() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_work_day() TO service_role;
REVOKE ALL ON FUNCTION public.att_me(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_me_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_me_today() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.att_my_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_my_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_record() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_payslips() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_punch_notice_ack() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_me(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.att_my_team() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.att_my_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_record() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_payslips() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.att_punch_notice_ack() TO authenticated, service_role;
