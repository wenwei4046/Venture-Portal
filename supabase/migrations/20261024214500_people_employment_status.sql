-- ============================================================================
-- 20261024214500_people_employment_status.sql
-- Employment status — Probation, Permanent or Part time — and HR's reminder before a probation ends (2026-10-23 — the
-- user, circling the roster's EMPLOYMENT chip: "for the employment status, i want go with permenant, part time and
-- probation status follow by the hire date start. then if the probation is almost end, then it will notification hr
-- acknowledge for further action"; on Add Staff: "will need to fill up one more, is status … then is select probation,
-- needs to select with probation period, so that is can be notice and verify"; the reminder "at least show up in this
-- notification side, in desktop view" — HR view's bell. Asked, the user: the people on the roster today stay unset for
-- HR to set one by one, and HR is told 14 days before a probation ends).
-- ============================================================================
--
-- hr_staff_costs takes:
--   employment_status   'probation' | 'permanent' | 'part_time'; NULL = not set yet (everybody filed before today).
--                       Not employment_type, which is the PAY basis (salaried / commission_eligible / variable).
--   probation_months    the period, 1–24 months (Add Staff offers 1–6, Extend adds to it) — set exactly while on probation.
--   probation_end       GENERATED: the probation's last day, the hire date + the months − 1 day (1 Oct + 3 months →
--                       31 Dec); NULL off probation or without a hire date. The app's twin: lib/employment-status.ts ›
--                       probationEnd.
--   probation_ack_end / _by / _name / _at
--                       HR's acknowledgement of the reminder, for the end it was given for — a probation extended past
--                       it is reminded again. Written only by probation_acknowledge(); cleared whenever they are not on
--                       probation (trigger hr_staff_costs_probation_ack).
-- Two functions, both People · Edit with the HR scope (the roster's update), as the person page's own writes ask:
--   probation_reviews()           STABLE: everybody active on probation, their end and its acknowledgement — HR view's
--                                 bell lists those ending within 14 days or past (lib/employment-status.ts).
--   probation_acknowledge(staff)  the reminder acknowledged for the end it stands at now — asks the person page's box
--                                 (tab_write_guard), as acknowledgeProbation's gate does in the app.
-- Confirm as permanent and Extend are the person page's own updates (People · Edit, the row policies).
-- member_transfer_waiting (Sales Groups › Waiting list › Transfer) takes the status and the period too: a 12-argument
-- overload with production's body (20261010150000's, md5 662d5c84…) and the two in its INSERT; the 10-argument one
-- calls it with neither, so a page opened before this keeps working until it is reloaded.
-- PGlite: tests/member-sql/validate-employment-status.mjs.

-- ── The columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS employment_status text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_months smallint;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_end date
  GENERATED ALWAYS AS (
    CASE WHEN employment_status = 'probation' AND hire_date IS NOT NULL AND probation_months IS NOT NULL
         THEN (hire_date + make_interval(months => probation_months::integer))::date - 1
    END
  ) STORED;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_ack_end date;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_ack_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_ack_name text;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS probation_ack_at timestamptz;

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_employment_status_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_employment_status_check
  CHECK (employment_status IS NULL OR employment_status IN ('probation', 'permanent', 'part_time'));
-- The period is there exactly while they are on probation.
ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_probation_months_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_probation_months_check
  CHECK (CASE WHEN employment_status = 'probation'
              THEN probation_months IS NOT NULL AND probation_months BETWEEN 1 AND 24
              ELSE probation_months IS NULL END);
ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_probation_ack_name_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_probation_ack_name_check
  CHECK (probation_ack_name IS NULL OR length(probation_ack_name) <= 200);

-- Every column of a staff row but the private three is authenticated's to read (mig 20261009050100).
GRANT SELECT (employment_status, probation_months, probation_end, probation_ack_end, probation_ack_by, probation_ack_name, probation_ack_at) ON public.hr_staff_costs TO authenticated;

-- ── The acknowledgement is probation_acknowledge()'s alone ──────────────────
-- Off probation (and on a new row) it is cleared; on probation it changes only inside probation_acknowledge, which
-- names the row it writes (app.probation_ack) — a straight update of it is refused.

CREATE OR REPLACE FUNCTION public.hr_staff_costs_probation_ack()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.employment_status IS DISTINCT FROM 'probation' THEN
    NEW.probation_ack_end := NULL;
    NEW.probation_ack_by := NULL;
    NEW.probation_ack_name := NULL;
    NEW.probation_ack_at := NULL;
  ELSIF (NEW.probation_ack_end, NEW.probation_ack_by, NEW.probation_ack_name, NEW.probation_ack_at)
          IS DISTINCT FROM (OLD.probation_ack_end, OLD.probation_ack_by, OLD.probation_ack_name, OLD.probation_ack_at)
        AND current_setting('app.probation_ack', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'A probation reminder is acknowledged with Acknowledge, never written straight.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS hr_staff_costs_probation_ack ON public.hr_staff_costs;
CREATE TRIGGER hr_staff_costs_probation_ack
BEFORE INSERT OR UPDATE OF employment_status, probation_ack_end, probation_ack_by, probation_ack_name, probation_ack_at
ON public.hr_staff_costs
FOR EACH ROW EXECUTE FUNCTION public.hr_staff_costs_probation_ack();

-- ── HR view's bell: who is on probation, and where their reminder stands ────

CREATE OR REPLACE FUNCTION public.probation_reviews()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_scope(ARRAY['hr']) IS NOT TRUE OR public.has_any_action(ARRAY['team.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Probation reminders need People · Edit.' USING ERRCODE = '42501';
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
             'months', s.probation_months,
             'endsOn', s.probation_end,
             'ackEnd', s.probation_ack_end,
             'ackName', s.probation_ack_name,
             'ackAt', s.probation_ack_at
           ) ORDER BY s.probation_end NULLS LAST, s.employee_name)
      FROM public.hr_staff_costs s
      LEFT JOIN public.departments d ON d.id = s.department_id
      LEFT JOIN public.titles t ON t.id = s.title_id
     WHERE s.status = 'active' AND s.employment_status = 'probation'), '[]'::jsonb);
END
$fn$;

COMMENT ON FUNCTION public.probation_reviews() IS
  'HR view''s bell (2026-10-23): everybody active on probation — their end and whether its reminder was acknowledged. People · Edit with the HR scope.';

CREATE OR REPLACE FUNCTION public.probation_acknowledge(p_staff uuid)
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
    RAISE EXCEPTION 'Acknowledging a probation needs People · Edit.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/team/people/[id]'], ARRAY['team.edit']);
  SELECT s.probation_end INTO v_end
    FROM public.hr_staff_costs s
   WHERE s.id = p_staff AND s.status = 'active' AND s.employment_status = 'probation'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'They are not on probation any more — reload the page.' USING ERRCODE = '22023';
  END IF;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'Their probation has no end yet — fill in their hire date first.' USING ERRCODE = '22023';
  END IF;
  v_name := left(coalesce(
    (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = v_me AND s.status = 'active' ORDER BY s.created_at LIMIT 1),
    (SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM public.users u WHERE u.id = v_me),
    'Someone'), 200);
  PERFORM set_config('app.probation_ack', p_staff::text, true);
  UPDATE public.hr_staff_costs
     SET probation_ack_end = v_end, probation_ack_by = v_me, probation_ack_name = v_name, probation_ack_at = v_at
   WHERE id = p_staff;
  PERFORM set_config('app.probation_ack', '', true);
  RETURN jsonb_build_object('endsOn', v_end, 'ackName', v_name, 'ackAt', v_at);
END
$fn$;

COMMENT ON FUNCTION public.probation_acknowledge(uuid) IS
  'People (2026-10-23): HR acknowledges the reminder that a probation ends — for the end it stands at now; an extension past it is reminded again. People · Edit with the HR scope, on the person page''s box.';

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

SELECT pg_temp.tab_guard('public.probation_acknowledge(uuid)',
  $$ARRAY['/team/people/[id]']$$, ARRAY['team.edit']);

-- Who may call them: a sign-in (each asks who the caller is); the publishable key never.
REVOKE ALL ON FUNCTION public.probation_reviews() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_acknowledge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.probation_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_acknowledge(uuid) TO authenticated;

-- ── Transfer from the waiting list asks the status too ──────────────────────
-- Replaces the 10-argument body only if it is the one 20261010150000 put there (or this migration's own call-through).

DO $chk$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p
   WHERE p.oid = 'public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text)'::regprocedure;
  IF v_md5 NOT IN ('662d5c844e758eb706fc0da3ccb9eec1', '6d0ee2a061217c680870795aa9d3cb14') THEN
    RAISE EXCEPTION 'member_transfer_waiting(10 arguments) is not the body this migration replaces (md5 %)', v_md5;
  END IF;
END
$chk$;

CREATE OR REPLACE FUNCTION public.member_transfer_waiting(
  p_request uuid,
  p_name text,
  p_title uuid,
  p_reports_to uuid,
  p_hire_date date,
  p_nric text,
  p_bank_name text,
  p_bank_account_no text,
  p_contact text,
  p_email text,
  p_employment_status text,
  p_probation_months integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_facts jsonb;
  v_sub uuid;
  v_dept uuid;
  v_title text;
  v_staff uuid;
  v_code text;
BEGIN
  v_facts := public.member_waiting_transfer(p_request);
  v_sub := (v_facts ->> 'subDepartmentId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:' || v_sub, 0));
  -- Read again under the lock: a transfer that committed meanwhile counts.
  v_facts := public.member_waiting_transfer(p_request);
  IF (v_facts ->> 'status') NOT IN ('waiting', 'reserved', 'accepted') THEN
    RAISE EXCEPTION 'This applicant is no longer on the waiting list' USING ERRCODE = '22023';
  END IF;
  IF (v_facts ->> 'seatFree')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '% is full — % of % places are taken. Raise the limit on Rules › Capacity first.',
      v_facts ->> 'subDepartment', (v_facts ->> 'occupied')::integer + (v_facts ->> 'held')::integer, v_facts ->> 'capacity'
      USING ERRCODE = '22023';
  END IF;
  -- The handoff's required fields: the name, NRIC and the first bank account.
  IF length(btrim(coalesce(p_name, ''))) = 0 OR length(btrim(coalesce(p_nric, ''))) = 0
     OR length(btrim(coalesce(p_bank_name, ''))) = 0 OR length(btrim(coalesce(p_bank_account_no, ''))) = 0 THEN
    RAISE EXCEPTION 'Fill in the name, NRIC and the bank account' USING ERRCODE = '22023';
  END IF;
  v_dept := (v_facts ->> 'departmentId')::uuid;
  SELECT t.name INTO v_title FROM public.titles t
   WHERE t.id = p_title AND t.is_active AND (t.department_id IS NULL OR t.department_id = v_dept);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That joining title is not on offer in this department' USING ERRCODE = '22023';
  END IF;

  -- Fully commission based (the Add Staff form's tick): no basic, no allowance.
  INSERT INTO public.hr_staff_costs (
    employee_name, department_id, title_id, home_sub_department_id, reports_to, designation,
    employment_type, basic_salary, allowances, non_statutory_allowance,
    nric, bank_name, bank_account_no, contact_number, email, hire_date, created_by,
    employment_status, probation_months
  ) VALUES (
    btrim(p_name), v_dept, p_title, v_sub, p_reports_to, v_title,
    'commission_eligible', 0, 0, 0,
    btrim(p_nric), btrim(p_bank_name), btrim(p_bank_account_no),
    nullif(btrim(coalesce(p_contact, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), p_hire_date, auth.uid(),
    p_employment_status, p_probation_months
  )
  RETURNING id, employee_code INTO v_staff, v_code;

  RETURN jsonb_build_object(
    'staffId', v_staff,
    'code', v_code,
    'request', public.member_complete_waiting_transfer(p_request, v_staff)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.member_transfer_waiting(
  p_request uuid,
  p_name text,
  p_title uuid,
  p_reports_to uuid,
  p_hire_date date,
  p_nric text,
  p_bank_name text,
  p_bank_account_no text,
  p_contact text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.member_transfer_waiting(p_request, p_name, p_title, p_reports_to, p_hire_date, p_nric, p_bank_name,
    p_bank_account_no, p_contact, p_email, NULL::text, NULL::integer);
END
$$;

REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
