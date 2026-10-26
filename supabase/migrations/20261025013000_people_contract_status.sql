-- ============================================================================
-- 20261025013000_people_contract_status.sql
-- Contract — a fourth employment status, with its period (2026-10-24 — LI SEAN asked on IT-0006 for the Revenue team's
-- contract status too; the user: "can add with one is Contract, then need pick time period as well, 6 month, 12 month,
-- 18, 24, until 36").
-- ============================================================================
--
-- hr_staff_costs:
--   employment_status   + 'contract' (Probation, Contract, Permanent, Part time; NULL = not set yet).
--   contract_months     the contract's period, 1–36 months (the forms offer 6, 12, 18, 24, 30 and 36) — set exactly
--                       while on a contract, as probation_months is while on probation.
--   contract_end        GENERATED: its last day, the hire date + the months − 1 day (1 Oct + 12 months → 30 Sep), the way
--                       probation_end is; lib/employment-status.ts › contractEnd counts it the same way.
-- Nobody is reminded of a contract's end (the probation's reminder stays the probation's).
--
-- member_transfer_waiting (Sales Groups › Waiting list › Transfer) files the contract's period too: a 13-argument
-- overload — production's 12-argument body (20261024214500's, md5 6b01f6ee…) with contract_months in its INSERT — and the
-- 12-argument one now calls it with none, as the 10-argument one calls that. All three still run as the caller.
-- PGlite: tests/member-sql/validate-employment-contract.mjs.

-- ── The columns and their rules ─────────────────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_months smallint;
ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_end date
  GENERATED ALWAYS AS (
    CASE WHEN employment_status = 'contract' AND hire_date IS NOT NULL AND contract_months IS NOT NULL
         THEN (hire_date + make_interval(months => contract_months::integer))::date - 1
    END
  ) STORED;

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_employment_status_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_employment_status_check
  CHECK (employment_status IS NULL OR employment_status IN ('probation', 'contract', 'permanent', 'part_time'));

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_contract_months_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_contract_months_check
  CHECK (CASE WHEN employment_status = 'contract'
              THEN contract_months IS NOT NULL AND contract_months BETWEEN 1 AND 36
              ELSE contract_months IS NULL END);

-- A session reads hr_staff_costs column by column (mig 20261009050100): the two new ones are nobody's secret.
GRANT SELECT (contract_months, contract_end) ON public.hr_staff_costs TO authenticated;

-- ── Transfer from the waiting list files a contract's period too ────────────
-- Replaces the 12-argument body only if it is the one 20261024214500 put there (or this migration's call-through).

DO $chk$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p
   WHERE p.oid = 'public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer)'::regprocedure;
  IF v_md5 NOT IN ('6b01f6ee60808dbd8a18e2b667860498', '44744e5e8ea43845acb1130c2ce8a938') THEN
    RAISE EXCEPTION 'member_transfer_waiting(12 arguments) is not the body this migration replaces (md5 %)', v_md5;
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
  p_probation_months integer,
  p_contract_months integer
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
    employment_status, probation_months, contract_months
  ) VALUES (
    btrim(p_name), v_dept, p_title, v_sub, p_reports_to, v_title,
    'commission_eligible', 0, 0, 0,
    btrim(p_nric), btrim(p_bank_name), btrim(p_bank_account_no),
    nullif(btrim(coalesce(p_contact, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), p_hire_date, auth.uid(),
    p_employment_status, p_probation_months, p_contract_months
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
  p_email text,
  p_employment_status text,
  p_probation_months integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.member_transfer_waiting(p_request, p_name, p_title, p_reports_to, p_hire_date, p_nric, p_bank_name,
    p_bank_account_no, p_contact, p_email, p_employment_status, p_probation_months, NULL::integer);
END
$$;

REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_transfer_waiting(uuid, text, uuid, uuid, date, text, text, text, text, text, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
