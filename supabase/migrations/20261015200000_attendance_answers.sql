-- ============================================================================
-- 20261015200000_attendance_answers.sql
-- HR › Attendance — the user's answers of 2026-10-15 (the questions left from the night's build).
-- ============================================================================
--
-- 1. Who clocks › OT "by wage" follows the Act's wage line. Asked (Ben, basic RM 4,500, 10 hours on a work day:
--    paid RM 324.52, or recorded and not paid?): "要，超过 RM4,000 不付". The line is the policy's own
--    (att_policy.ot_wage_cap, RM 4,000 to start, changed in Settings › Policy); Month close prices it
--    (src/lib/attendance/payroll.ts) — the database only keeps the number.
-- 2. A profile change, approved, changes the People record: "批准后自动改". att_create_request keeps only the fields
--    a person may ask to change (phone, email, address, the emergency contact, the bank and its account), each with
--    what the record held, and a profile change never ends at the upline ("银行户口一定要 HR 批") — Upline only
--    becomes Upline → HR. att_decide hands the last approval (HR's) to att_profile_apply, which writes those fields
--    and nothing else. The reader shows an account number as •••• to whoever's title does not tick bank accounts.
-- 3. MC attachments and punch photos get their place now: "现在开好". A private bucket, `attendance`: a person files
--    only into their own folder (punch/<login>/…, request/<login>/…); Attendance · View reads every file, a person
--    their own. att_punch refuses a photo path that is not the caller's own filed object; att_request_attach files
--    an attachment on a request still waiting; att_file names a file for the portal's short signed link.
-- 4. Today › Remind all: "现在就做". att_remind leaves a notice for each person still not in who has a login, sent
--    to their phone by the push outbox — never listed in a bell (notifications_mine leaves kind 'attendance' out):
--    a reminder is for now, not for later.
--
-- Every function changed here is PRODUCTION's body (md5 below, read 2026-10-15) with its swaps and nothing else;
-- comments stay outside the bodies. PGlite: tests/member-sql/validate-attendance-answers.mjs.

DO $guard$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.att_config()', 'ab781357271ebab23f4dd76eb632719a', 'otWageCap'),
      ('public.att_save_setting(text, uuid, jsonb)', '2649bbaa22bfb2e2a34f7795004b611c', 'ot_wage_cap'),
      ('public.att_create_request(uuid, text, text, date, date, numeric, numeric, jsonb, text, boolean)', '8f436cce57557020802059223fb8ea33', 'att_profile_changes'),
      ('public.att_decide(uuid, boolean, text)', '09e8bce523a87ea73d6f22d7cf36298b', 'att_profile_apply'),
      ('public.att_requests_list()', '47f77d8955de35ac80136f1b4c141e7e', 'att_detail_shown'),
      ('public.att_punch(text, double precision, double precision, integer, text, text, text, text)', '5a694de7ba8fbfd6356ea5b69228a264', 'was not filed'),
      ('public.notifications_mine(integer)', 'c33ef11991dda14e3c7d9fff10263d22', '''attendance''')
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

-- ── 1. The wage line ────────────────────────────────────────────────────────

ALTER TABLE public.att_policy ADD COLUMN IF NOT EXISTS ot_wage_cap numeric(15,2) NOT NULL DEFAULT 4000 CHECK (ot_wage_cap >= 0);

COMMENT ON COLUMN public.att_policy.ot_wage_cap IS
  'Who clocks › OT "by wage": a person whose monthly wages (basic + fixed allowance) are above this is not paid overtime — the hours are recorded (2026-10-15). Statutory pays whatever the wage.';

-- ── 2. Profile changes ──────────────────────────────────────────────────────

-- A profile change's fields as the request keeps them: only the fields a person may ask to change, each with its
-- label, what the record holds now and what is asked; a field already so is dropped, and nothing left is refused.
CREATE OR REPLACE FUNCTION public.att_profile_changes(p_staff uuid, p_detail jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_labels CONSTANT jsonb := '{"contact_number": "Phone", "email": "Email", "address": "Address",
    "emergency_contact_name": "Emergency contact", "emergency_contact_phone": "Emergency phone",
    "emergency_contact_relationship": "Emergency relationship", "bank_name": "Bank", "bank_account_no": "Bank account"}';
  v_rec  jsonb;
  v_c    jsonb;
  v_key  text;
  v_to   text;
  v_from text;
  v_seen text[] := '{}';
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_detail -> 'changes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_detail -> 'changes') = 0 THEN
    RAISE EXCEPTION 'Name at least one field to change.' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(s) INTO v_rec FROM public.hr_staff_costs s WHERE s.id = p_staff;
  FOR v_c IN SELECT e FROM jsonb_array_elements(p_detail -> 'changes') e LOOP
    v_key := v_c ->> 'key';
    IF v_key IS NULL OR NOT (v_labels ? v_key) THEN
      RAISE EXCEPTION 'That field is not changed by request.' USING ERRCODE = '22023';
    END IF;
    IF v_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'A field is named twice.' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_key;
    v_to := nullif(btrim(coalesce(v_c ->> 'to', '')), '');
    IF v_key = 'bank_account_no' AND v_to IS NOT NULL THEN
      v_to := regexp_replace(v_to, '[[:space:]-]', '', 'g');
      IF v_to !~ '^[0-9]{5,20}$' THEN
        RAISE EXCEPTION 'An account number is 5 to 20 digits.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key IN ('contact_number', 'emergency_contact_phone') AND v_to IS NOT NULL
          AND (char_length(v_to) > 30 OR v_to !~ '^[0-9+() -]+$') THEN
      RAISE EXCEPTION 'Enter a phone number like 012-338 4127.' USING ERRCODE = '22023';
    ELSIF v_key = 'email' AND v_to IS NOT NULL AND v_to !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Enter an email address like name@houzs.my.' USING ERRCODE = '22023';
    ELSIF char_length(coalesce(v_to, '')) > 300 THEN
      RAISE EXCEPTION 'That is too long — at most 300 characters.' USING ERRCODE = '22023';
    END IF;
    v_from := nullif(btrim(coalesce(v_rec ->> v_key, '')), '');
    CONTINUE WHEN v_from IS NOT DISTINCT FROM v_to;
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_key, 'field', v_labels ->> v_key, 'from', v_from, 'to', v_to));
  END LOOP;
  IF jsonb_array_length(v_out) = 0 THEN
    RAISE EXCEPTION 'Nothing to change — the record already says that.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_set(p_detail, '{changes}', v_out);
END
$fn$;

-- A profile change approved: the People record takes the fields it names, and only those (one UPDATE, so a field
-- somebody else changed meanwhile is left as they left it).
CREATE OR REPLACE FUNCTION public.att_profile_apply(p_request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_set  jsonb;
  v_sql  text;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request AND kind = 'profile';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT jsonb_object_agg(c ->> 'key', c -> 'to') INTO v_set
    FROM jsonb_array_elements(coalesce(v_r.detail -> 'changes', '[]'::jsonb)) c
   WHERE c ->> 'key' IN ('contact_number', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone',
                         'emergency_contact_relationship', 'bank_name', 'bank_account_no');
  IF v_set IS NULL THEN
    RETURN;
  END IF;
  SELECT string_agg(format('%I = $2 ->> %L', k, k), ', ') INTO v_sql FROM jsonb_object_keys(v_set) k;
  EXECUTE format('UPDATE public.hr_staff_costs SET %s WHERE id = $1', v_sql) USING v_r.staff_id, v_set;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Record updated',
    (SELECT string_agg(c ->> 'field', ' · ') FROM jsonb_array_elements(v_r.detail -> 'changes') c));
END
$fn$;

-- A request's detail as this reader may see it: a profile change's account number as •••• unless the reader's
-- title ticks bank accounts.
CREATE OR REPLACE FUNCTION public.att_detail_shown(p_detail jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p_detail -> 'changes') IS DISTINCT FROM 'array' OR public.sees_sensitive('bank') THEN
    RETURN p_detail;
  END IF;
  RETURN jsonb_set(p_detail, '{changes}', (
    SELECT coalesce(jsonb_agg(CASE WHEN c ->> 'key' = 'bank_account_no'
             THEN c || jsonb_build_object(
                    'from', CASE WHEN coalesce(c ->> 'from', '') = '' THEN c -> 'from' ELSE to_jsonb('••••'::text) END,
                    'to', CASE WHEN coalesce(c ->> 'to', '') = '' THEN c -> 'to' ELSE to_jsonb('••••'::text) END)
             ELSE c END ORDER BY i), '[]'::jsonb)
      FROM jsonb_array_elements(p_detail -> 'changes') WITH ORDINALITY AS x(c, i)));
END
$fn$;

-- ── 3. Files ────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attendance', 'attendance', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- A person files only into their own folder (punch/<login>/…, request/<login>/…); nobody overwrites or deletes.
-- Attendance · View reads every file — through a short signed link made at the press — and a person their own.
DROP POLICY IF EXISTS attendance_files_read ON storage.objects;
CREATE POLICY attendance_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance'
    AND ((SELECT public.has_any_action(ARRAY['attendance.view'])) OR (storage.foldername(name))[2] = (SELECT auth.uid())::text));
DROP POLICY IF EXISTS attendance_files_upload ON storage.objects;
CREATE POLICY attendance_files_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance'
    AND (storage.foldername(name))[1] IN ('punch', 'request')
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);

-- A file on a request still waiting: its person's own, or — Attendance · Create — HR's on their behalf; either way
-- an object the caller filed in their own folder.
CREATE OR REPLACE FUNCTION public.att_request_attach(p_request uuid, p_path text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r public.att_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer waiting.';
  END IF;
  IF v_r.staff_id IS DISTINCT FROM public.att_my_staff_id() THEN
    PERFORM public.att_need(ARRAY['attendance.create'], 'Filing a file for somebody else needs Attendance · Create.');
  END IF;
  IF auth.uid() IS NULL OR p_path IS NULL OR NOT starts_with(p_path, 'request/' || auth.uid()::text || '/') OR strpos(p_path, '..') > 0
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'attendance' AND o.name = p_path) THEN
    RAISE EXCEPTION 'The file was not filed — send it again.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.att_requests
     SET attachment_path = p_path, attachment_name = left(coalesce(nullif(btrim(p_name), ''), 'Attachment'), 200)
   WHERE id = p_request;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'File attached', left(coalesce(btrim(p_name), ''), 200));
  RETURN jsonb_build_object('id', p_request);
END
$fn$;

-- Where a request's attachment or a punch's photo is kept, and its name — for the portal's short signed link
-- (the bucket's own read policy asks the reader again).
CREATE OR REPLACE FUNCTION public.att_file(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text;
  v_name text;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  IF p_kind = 'request' THEN
    SELECT r.attachment_path, coalesce(nullif(btrim(r.attachment_name), ''), r.ref) INTO v_path, v_name
      FROM public.att_requests r WHERE r.id = p_id;
  ELSIF p_kind = 'punch' THEN
    SELECT p.photo_path,
           s.employee_name || ' ' || to_char(p.work_day, 'YYYY-MM-DD') || ' ' || upper(p.direction)
             || coalesce(substring(p.photo_path FROM '(\.[A-Za-z0-9]{1,5})$'), '')
      INTO v_path, v_name
      FROM public.att_punches p JOIN public.hr_staff_costs s ON s.id = p.staff_id WHERE p.id = p_id;
  ELSE
    RAISE EXCEPTION 'No such file.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('path', v_path, 'name', v_name);
END
$fn$;

-- ── 4. Remind all ───────────────────────────────────────────────────────────

ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_kind_check
  CHECK (kind = ANY (ARRAY['hiring', 'rooms', 'review', 'memo', 'crm', 'attendance']));
ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_ref_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check
  CHECK (ref_kind = ANY (ARRAY['hiring_request', 'booking', 'member_request', 'memo', 'crm_contact', 'crm_invite', 'att_today']));

-- Today's people still not in (no valid IN today): a notice to each who has a login, unless one went in the last
-- ten minutes. Answers how many it reached, how many have no login, and how many of those reached have no phone
-- signed up for notifications.
CREATE OR REPLACE FUNCTION public.att_remind(p_staff uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_when  text := to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'Dy FMDD Mon');
  v_users uuid[];
  v_staff uuid[];
  v_asked integer;
  v_no_login integer;
  v_no_phone integer;
  v_recent integer;
BEGIN
  PERFORM public.att_need(ARRAY['attendance.edit'], 'Sending a reminder needs Attendance · Edit.');
  WITH asked AS (
    SELECT s.id, u.id AS user_id
      FROM public.hr_staff_costs s
      LEFT JOIN public.users u ON u.id = s.user_id AND u.is_active
     WHERE s.id = ANY (coalesce(p_staff, '{}')) AND s.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM public.att_punches p
                        WHERE p.staff_id = s.id AND p.work_day = v_today AND p.direction = 'in' AND p.invalid_at IS NULL)
  ), fresh AS (
    SELECT a.* FROM asked a
     WHERE NOT EXISTS (SELECT 1 FROM public.att_events e
                        WHERE e.entity = 'day' AND e.entity_key = a.id::text || ':' || v_today::text
                          AND e.what = 'Reminded to clock in' AND e.at > now() - interval '10 minutes')
  )
  SELECT (SELECT count(*) FROM asked),
         (SELECT count(*) FROM asked WHERE user_id IS NULL),
         (SELECT count(*) FROM asked a WHERE a.user_id IS NOT NULL AND a.id NOT IN (SELECT id FROM fresh)),
         (SELECT count(*) FROM fresh f WHERE f.user_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = f.user_id)),
         ARRAY(SELECT f.user_id FROM fresh f WHERE f.user_id IS NOT NULL),
         ARRAY(SELECT f.id FROM fresh f WHERE f.user_id IS NOT NULL)
    INTO v_asked, v_no_login, v_recent, v_no_phone, v_users, v_staff;
  IF cardinality(v_users) > 0 THEN
    PERFORM public.notify_people(v_users, 'attendance', 'Not clocked in yet', 'Today, ' || v_when || ' — open the app to clock in.',
      'att_today', v_today::text);
    INSERT INTO public.att_events (entity, entity_key, staff_id, what, actor_name, actor_user, note)
    SELECT 'day', x::text || ':' || v_today::text, x, 'Reminded to clock in', public.att_actor_name(), auth.uid(), ''
      FROM unnest(v_staff) x;
  END IF;
  RETURN jsonb_build_object('sent', cardinality(v_users), 'noLogin', v_no_login, 'noPhone', v_no_phone, 'recent', v_recent, 'asked', v_asked);
END
$fn$;

-- ── Production's bodies, swapped ────────────────────────────────────────────
-- att_config
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
$function$;

-- att_save_setting
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
$function$;

-- att_create_request
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
  v_prefix   text := CASE p_kind WHEN 'leave' THEN 'LV' WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' WHEN 'profile' THEN 'PF' END;
  v_route    text;
  v_ref      text;
  v_id       uuid;
  v_up       uuid;
  v_up_name  text;
  v_up_login boolean;
  v_seq      integer := 0;
  v_now      timestamptz := now();
  v_detail   jsonb := coalesce(p_detail, '{}'::jsonb);
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
  IF (p_booked OR v_behalf) AND btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  v_route := CASE WHEN p_booked THEN 'hr_only'
                  ELSE public.att_route_for(p_staff, CASE p_kind WHEN 'leave' THEN p_leave_code WHEN 'ot' THEN 'OT' WHEN 'correction' THEN 'CR' ELSE 'PF' END) END;
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

-- att_decide
CREATE OR REPLACE FUNCTION public.att_decide(p_request uuid, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r      public.att_requests%ROWTYPE;
  v_st     public.att_request_steps%ROWTYPE;
  v_me     uuid := public.att_my_staff_id();
  v_actor  text := public.att_actor_name();
  v_hr     boolean := public.has_any_action(ARRAY['attendance.approve']);
  v_behalf boolean;
  v_next   uuid;
  v_now    timestamptz := now();
  v_done   boolean := false;
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
      v_done := true;
    END IF;
  ELSE
    UPDATE public.att_request_steps SET state = 'skipped' WHERE request_id = p_request AND state = 'queued';
    UPDATE public.att_requests SET status = 'rejected', decided_at = v_now WHERE id = p_request;
  END IF;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id,
    CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END || ' by ' || CASE v_st.role WHEN 'hr' THEN 'HR' ELSE 'upline' END
      || CASE WHEN v_behalf THEN ' (on behalf)' ELSE '' END, btrim(coalesce(p_note, '')));
  IF v_done AND v_r.kind = 'profile' AND v_st.role = 'hr' THEN
    PERFORM public.att_profile_apply(p_request);
  END IF;
  RETURN jsonb_build_object('id', p_request, 'ref', v_r.ref,
    'status', (SELECT status FROM public.att_requests WHERE id = p_request));
END
$function$;

-- att_requests_list
CREATE OR REPLACE FUNCTION public.att_requests_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.att_need(ARRAY['attendance.view'], 'Attendance needs Attendance · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'ref', r.ref, 'staffId', r.staff_id, 'who', s.employee_name, 'kind', r.kind, 'leaveCode', r.leave_code,
             'from', r.date_from, 'to', r.date_to, 'days', r.days, 'hours', r.hours, 'detail', public.att_detail_shown(r.detail), 'reason', r.reason,
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
$function$;

-- att_punch
CREATE OR REPLACE FUNCTION public.att_punch(p_direction text, p_lat double precision, p_lng double precision, p_accuracy integer, p_device text, p_photo_path text, p_reason text, p_source text DEFAULT 'app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_photo_path IS NOT NULL AND (NOT starts_with(p_photo_path, 'punch/' || auth.uid()::text || '/') OR strpos(p_photo_path, '..') > 0
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'attendance' AND o.name = p_photo_path)) THEN
    RAISE EXCEPTION 'The photo was not filed — take it again.' USING ERRCODE = '22023';
  END IF;
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
$function$;

-- notifications_mine
CREATE OR REPLACE FUNCTION public.notifications_mine(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'unread', (SELECT count(*) FROM public.app_notifications n WHERE n.user_id = v_me AND n.read_at IS NULL AND n.kind NOT IN ('crm', 'attendance')),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
               'refKind', n.ref_kind, 'refId', n.ref_id, 'at', n.created_at, 'read', n.read_at IS NOT NULL) ORDER BY n.created_at DESC)
        FROM (SELECT * FROM public.app_notifications x WHERE x.user_id = v_me AND x.kind NOT IN ('crm', 'attendance')
               ORDER BY x.created_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) n), '[]'::jsonb));
END
$function$;

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.att_profile_changes(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_profile_apply(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.att_detail_shown(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.att_profile_changes(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.att_profile_apply(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.att_detail_shown(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.att_request_attach(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_file(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.att_remind(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.att_request_attach(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.att_file(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.att_remind(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
