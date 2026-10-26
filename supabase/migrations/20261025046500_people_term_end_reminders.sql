-- ============================================================================
-- 20261025046500_people_term_end_reminders.sql
-- HR is reminded twice before a probation or a contract ends — 30 days before, then 15 (2026-10-24 — asked whether a
-- contract's end should remind HR too, the user: "need 30 days and 15 days before remind, 2 reminder, then for
-- probation need same as well"). A probation was told once, 15 days before (20261025012000); a contract never.
-- ============================================================================
--
-- Two reminders, each waiting for Acknowledge: the first from 30 days before the end, the second from 15 days before
-- (and after the end, while the term is still open). An acknowledgement answers the reminder that stood on the office's
-- day it was given — 15 days or fewer before the end, the second; earlier, the first — so the first's never silences
-- the second. Nothing new is stored for it: an acknowledgement already keeps its end and its moment (probation_ack_end
-- and probation_ack_at, written by probation_acknowledge, unchanged). lib/employment-status.ts › REMINDER_DAYS,
-- reminderOf and answeredReminder say the same for HR view's bell, the HR app, the roster's chip and HR's Overview
-- (term-reviews.test.ts holds the two together).
--
-- A contract's reminder, as a probation's (20261024214500):
--   contract_ack_end / _by / _name / _at
--                       HR's acknowledgement, for the end it was given for — a contract renewed past it is reminded
--                       again. Written only by contract_acknowledge(); cleared whenever they are not on a contract
--                       (trigger hr_staff_costs_contract_ack).
--   contract_reviews()           STABLE: everybody active on a contract, its end and its acknowledgement — People · Edit
--                                with the HR scope, as probation_reviews().
--   contract_acknowledge(staff)  the reminder acknowledged for the end it stands at now — asks the person page's box
--                                (tab_write_guard), as probation_acknowledge() and acknowledgeContract's gate in the app.
--
-- The phones: notify_term_ends(p_now), the hourly sweep from this deploy on (app/api/member-queue). Each reminder once
-- to each person told, from 9:00 the office's time, unless it is acknowledged already — data.due =
-- '<probation|contract>:<staff>:<end>:<30|15>'; a probation's second also counts the key 20261024223000's sweep wrote
-- ('probation:<staff>:<end>'), so a notice sent before the deploy is not sent again. Told: whoever keeps the topic
-- 'people.probation' — the HR app keeps it for whoever may acknowledge either term, the same three checks — and,
-- asked as them that moment, may still acknowledge it (probation_notice_may). Never the person themselves.
-- notify_probation_due (20261025012000) is left as production runs it: the sweep deployed before this one still calls
-- it; nothing does after the deploy — drop it with the next People migration.
-- PGlite: tests/member-sql/validate-term-end-reminders.mjs.

-- ── A contract's acknowledgement ────────────────────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_ack_end date;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_ack_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_ack_name text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_ack_at timestamptz;

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_contract_ack_name_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_contract_ack_name_check
  CHECK (contract_ack_name IS NULL OR length(contract_ack_name) <= 200);

-- Every column of a staff row but the private three is authenticated's to read (mig 20261009050100).
GRANT SELECT (contract_ack_end, contract_ack_by, contract_ack_name, contract_ack_at) ON public.hr_staff_costs TO authenticated;

-- Off a contract (and on a new row) it is cleared; on a contract it changes only inside contract_acknowledge, which
-- names the row it writes (app.contract_ack) — a straight update of it is refused.

CREATE OR REPLACE FUNCTION public.hr_staff_costs_contract_ack()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.employment_status IS DISTINCT FROM 'contract' THEN
    NEW.contract_ack_end := NULL;
    NEW.contract_ack_by := NULL;
    NEW.contract_ack_name := NULL;
    NEW.contract_ack_at := NULL;
  ELSIF (NEW.contract_ack_end, NEW.contract_ack_by, NEW.contract_ack_name, NEW.contract_ack_at)
          IS DISTINCT FROM (OLD.contract_ack_end, OLD.contract_ack_by, OLD.contract_ack_name, OLD.contract_ack_at)
        AND current_setting('app.contract_ack', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'A contract reminder is acknowledged with Acknowledge, never written straight.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS hr_staff_costs_contract_ack ON public.hr_staff_costs;
CREATE TRIGGER hr_staff_costs_contract_ack
BEFORE INSERT OR UPDATE OF employment_status, contract_ack_end, contract_ack_by, contract_ack_name, contract_ack_at
ON public.hr_staff_costs
FOR EACH ROW EXECUTE FUNCTION public.hr_staff_costs_contract_ack();

-- ── HR view's bell: who is on a contract, and where its reminder stands ─────────

CREATE OR REPLACE FUNCTION public.contract_reviews()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_scope(ARRAY['hr']) IS NOT TRUE OR public.has_any_action(ARRAY['team.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Contract reminders need People · Edit.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', s.employee_name,
             'firstName', s.first_name,
             'lastName', s.last_name,
             'code', s.employee_code,
             'department', d.name,
             'title', coalesce(t.name, s.designation),
             'hireDate', s.hire_date,
             'months', s.contract_months,
             'endsOn', s.contract_end,
             'ackEnd', s.contract_ack_end,
             'ackName', s.contract_ack_name,
             'ackAt', s.contract_ack_at
           ) ORDER BY s.contract_end NULLS LAST, s.employee_name)
      FROM public.hr_staff_costs s
      LEFT JOIN public.departments d ON d.id = s.department_id
      LEFT JOIN public.titles t ON t.id = s.title_id
     WHERE s.status = 'active' AND s.employment_status = 'contract'), '[]'::jsonb);
END
$fn$;

COMMENT ON FUNCTION public.contract_reviews() IS
  'HR view''s bell (2026-10-24): everybody active on a contract — its end and whether its reminder was acknowledged. People · Edit with the HR scope.';

CREATE OR REPLACE FUNCTION public.contract_acknowledge(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_end  date;
  v_name text;
  v_at   timestamptz := now();
BEGIN
  IF public.has_scope(ARRAY['hr']) IS NOT TRUE OR public.has_any_action(ARRAY['team.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acknowledging a contract needs People · Edit.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/team/people/[id]'], ARRAY['team.edit']);
  SELECT s.contract_end INTO v_end
    FROM public.hr_staff_costs s
   WHERE s.id = p_staff AND s.status = 'active' AND s.employment_status = 'contract'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'They are not on a contract any more — reload the page.' USING ERRCODE = '22023';
  END IF;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'Their contract has no end yet — fill in their hire date first.' USING ERRCODE = '22023';
  END IF;
  v_name := left(coalesce(
    (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = v_me AND s.status = 'active' ORDER BY s.created_at LIMIT 1),
    (SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM public.users u WHERE u.id = v_me),
    'Someone'), 200);
  PERFORM set_config('app.contract_ack', p_staff::text, true);
  UPDATE public.hr_staff_costs
     SET contract_ack_end = v_end, contract_ack_by = v_me, contract_ack_name = v_name, contract_ack_at = v_at
   WHERE id = p_staff;
  PERFORM set_config('app.contract_ack', '', true);
  RETURN jsonb_build_object('endsOn', v_end, 'ackName', v_name, 'ackAt', v_at);
END
$fn$;

COMMENT ON FUNCTION public.contract_acknowledge(uuid) IS
  'People (2026-10-24): HR acknowledges the reminder that a contract ends — for the end it stands at now; a renewal past it is reminded again. People · Edit with the HR scope, on the person page''s box.';

-- The guard the scan reads (tab-write-guards.test.ts): the write asks the person's page in the database, as the app's
-- gate in front of it does. The body above carries it already; this only checks it is there.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.contract_acknowledge(uuid)',
  $$ARRAY['/team/people/[id]']$$, ARRAY['team.edit']);

-- ── The sweep's notices: a probation's or a contract's, 30 and 15 days before ────
-- p_now: the sweep's moment (the checks hand in theirs); the office's day and hour are read from it.

CREATE OR REPLACE FUNCTION public.notify_term_ends(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_today date := (coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_told  uuid[];
  v_n     integer := 0;
  v_rows  integer;
  v_left  integer;
  v_stage integer;
  v_keys  text[];
  v_body  text;
  r       record;
BEGIN
  -- From 9:00 the office's time: never a phone at midnight.
  IF extract(hour FROM v_local) < 9 THEN
    RETURN 0;
  END IF;
  -- Whoever keeps the topic and, asked as them now, may still acknowledge it.
  v_told := ARRAY(
    SELECT t.user_id FROM public.notification_topics t JOIN public.users u ON u.id = t.user_id AND u.is_active
     WHERE t.topic = 'people.probation' AND public.probation_notice_may(t.user_id)
     ORDER BY t.user_id);
  IF coalesce(array_length(v_told, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT term.* FROM (
      SELECT 'probation'::text AS kind, s.id, s.user_id, s.employee_name, s.probation_end AS ends_on,
             s.probation_ack_end AS ack_end, s.probation_ack_at AS ack_at, d.name AS department
        FROM public.hr_staff_costs s
        LEFT JOIN public.departments d ON d.id = s.department_id
       WHERE s.status = 'active' AND s.employment_status = 'probation' AND s.probation_end IS NOT NULL
      UNION ALL
      SELECT 'contract'::text, s.id, s.user_id, s.employee_name, s.contract_end,
             s.contract_ack_end, s.contract_ack_at, d.name
        FROM public.hr_staff_costs s
        LEFT JOIN public.departments d ON d.id = s.department_id
       WHERE s.status = 'active' AND s.employment_status = 'contract' AND s.contract_end IS NOT NULL
    ) term
     -- REMINDER_DAYS (lib/employment-status.ts): the first reminder 30 days before the end, its last day included.
     WHERE term.ends_on - 30 <= v_today AND v_today <= term.ends_on
     ORDER BY term.ends_on, term.employee_name, term.kind
  LOOP
    v_left := r.ends_on - v_today;
    -- The reminder standing today: the second from 15 days before, else the first.
    v_stage := CASE WHEN v_left <= 15 THEN 15 ELSE 30 END;
    -- Acknowledged for it already: an acknowledgement answers the reminder that stood on the office's day it was given.
    CONTINUE WHEN r.ack_end = r.ends_on AND r.ack_at IS NOT NULL
      AND (CASE WHEN r.ends_on - (r.ack_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= 15 THEN 15 ELSE 30 END) <= v_stage;
    v_keys := ARRAY[r.kind || ':' || r.id || ':' || r.ends_on || ':' || v_stage];
    -- A probation's second reminder: the sweep before this one keyed it without the reminder.
    IF r.kind = 'probation' AND v_stage = 15 THEN
      v_keys := v_keys || ('probation:' || r.id || ':' || r.ends_on);
    END IF;
    -- "Ends 31 Oct 2026 · in 8 days · HR" — the bell's own line (lib/employment-status.ts › termEndLine).
    v_body := 'Ends ' || to_char(r.ends_on, 'FMDD Mon YYYY') || ' · '
           || CASE v_left WHEN 0 THEN 'today' WHEN 1 THEN 'tomorrow' ELSE 'in ' || v_left || ' days' END
           || coalesce(' · ' || nullif(btrim(r.department), ''), '');
    INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id, data)
    SELECT x, 'people',
           left(CASE r.kind WHEN 'contract' THEN 'Contract ending · ' ELSE 'Probation ending · ' END || r.employee_name, 200),
           left(v_body, 400), 'hr_staff', r.id::text, jsonb_build_object('due', v_keys[1])
      FROM unnest(v_told) x
     WHERE x IS DISTINCT FROM r.user_id
       AND NOT EXISTS (SELECT 1 FROM public.app_notifications n
                        WHERE n.user_id = x AND n.ref_kind = 'hr_staff' AND n.data ->> 'due' = ANY (v_keys));
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_n := v_n + v_rows;
  END LOOP;
  RETURN v_n;
END
$fn$;

COMMENT ON FUNCTION public.notify_term_ends(timestamptz) IS
  'The hourly sweep (2026-10-24): a probation or a contract ending within 30 days — told 30 and again 15 days before, each unless acknowledged — once to each holder of people.probation who may still acknowledge it. The service role''s alone.';

-- ── Who may call them ───────────────────────────────────────────────────────────
-- The bell's two: a sign-in (each asks who the caller is); the publishable key never. The sweep: the service role.

REVOKE ALL ON FUNCTION public.contract_reviews() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contract_acknowledge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_acknowledge(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.notify_term_ends(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_term_ends(timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
