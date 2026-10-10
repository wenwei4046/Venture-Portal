-- ============================================================================
-- 20261010150000_member_transfer_waiting.sql
-- Transfer from the waiting list, in one transaction (HR revamp 3b/8, 2026-10-10).
-- ============================================================================
--
-- Sales Groups › Waiting list › Transfer opens People Management's employee
-- form with the applicant's details filled in; "Add to company" files the
-- employee AND takes the applicant off the list together. A refusal at either
-- step leaves neither half behind, so pressing it again can never file the
-- same person twice.
--
-- SECURITY INVOKER: the roster row is written under the caller's own session,
-- so hr_staff_costs' row policies, its RESTRICTIVE needs_action_* policies
-- (People › Create) and its column grants answer exactly as they do for
-- People's own Add Staff, and so do the roster's triggers (the base, the
-- reporting line, the ladder). The two waiting-list functions it calls are
-- DEFINER and ask member_is_manager('member_requests_manage') themselves.
--
-- The headcount limit is checked here, under the lock every capacity write
-- takes ('member-capacity:<sub>'), so two transfers into the last place cannot
-- both pass.

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
    nric, bank_name, bank_account_no, contact_number, email, hire_date, created_by
  ) VALUES (
    btrim(p_name), v_dept, p_title, v_sub, p_reports_to, v_title,
    'commission_eligible', 0, 0, 0,
    btrim(p_nric), btrim(p_bank_name), btrim(p_bank_account_no),
    nullif(btrim(coalesce(p_contact, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), p_hire_date, auth.uid()
  )
  RETURNING id, employee_code INTO v_staff, v_code;

  RETURN jsonb_build_object(
    'staffId', v_staff,
    'code', v_code,
    'request', public.member_complete_waiting_transfer(p_request, v_staff)
  );
END
$$;

REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text) TO authenticated, service_role;
