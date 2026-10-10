-- ============================================================================
-- 20261010191000_member_request_json_effective_on.sql
-- A replacement's date and successor, as the Revenue app tells them (HR
-- revamp 7b/8, 2026-10-10).
-- ============================================================================
--
-- HR approves a replacement with WHO takes the seat and the DATE it runs
-- (mig 20261010170000: `member_requests.allocated_staff_id`,
-- `member_requests.effective_on`). The app's Waiting list & replacements
-- reads "Louis → Ryan Tan · Scheduled · 31 Oct", so the request every member
-- reader returns (`member_request_json`, inside the member and Principal
-- snapshots) now carries `allocatedName` and `effectiveOn` beside
-- `allocatedStaffId`. One asserted swap on production's body, md5 checked;
-- its grants (owner and service role only) stay as they are.

DO $patch$
DECLARE
  v_src text;
  v_old text;
  v_new text;
  v_count int;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_request_json';
  IF md5(v_src) <> '9b095518c35a336f9a3a1ed8bd20f756' THEN
    RAISE EXCEPTION 'member_request_json is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  v_old := '''allocatedStaffId'',r.allocated_staff_id)';
  v_new := '''allocatedStaffId'',r.allocated_staff_id,'
    || '''allocatedName'',(SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id=r.allocated_staff_id),'
    || '''effectiveOn'',r.effective_on)';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_request_json: the detail merge matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_request_json(p_request uuid) '
    'RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);
END
$patch$;
