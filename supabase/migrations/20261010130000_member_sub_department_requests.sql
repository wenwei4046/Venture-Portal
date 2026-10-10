-- ============================================================================
-- 20261010130000_member_sub_department_requests.sql
-- Sales Groups' Waiting list and Replacement list read one sub-department's
-- requests with the page (HR revamp 3/8, 2026-10-10).
-- ============================================================================
--
-- The handoff gives Revenue › Sales Groups two tabs beside Chart and Members:
-- the sub-department's WAITING LIST (applicants HR accepted, in the order they
-- were accepted) and its REPLACEMENT LIST (every replacement and where it
-- stands). Both were only in `member_admin_snapshot()`, which builds every
-- request of every sub-department plus memos, candidates and — for the
-- Principal — the whole catalogue.
--
-- `member_sub_department_requests(p_sub)` answers the waiting-list and
-- replacement requests of ONE sub-department, already named: who submitted
-- (the member's staff record), the original member of a replacement, the
-- receiving sub-department of a transfer, when HR accepted an applicant onto
-- the list (the first event into `waiting`), and the history with who moved
-- it (a staff name where the actor is somebody's login, else their role).
-- Read-only. The gate is Member services' own:
-- member_is_manager('member_requests_manage').

CREATE OR REPLACE FUNCTION public.member_sub_department_requests(p_sub uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'requestNo', r.request_no,
      'kind', r.kind,
      'status', r.status,
      'createdAt', r.created_at,
      'submittedAt', r.submitted_at,
      'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
      'newPerson', nullif(r.detail ->> 'newPerson', ''),
      'contact', nullif(r.detail ->> 'contact', ''),
      'start', nullif(r.detail ->> 'start', ''),
      'signature', nullif(r.detail ->> 'signature', ''),
      'original', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id::text = r.detail ->> 'originalStaffId'),
      'destination', nullif(r.detail ->> 'destination', ''),
      'replacementSource', nullif(r.detail ->> 'replacementSource', ''),
      'effective', nullif(r.detail ->> 'effective', ''),
      'reason', nullif(r.detail ->> 'reason', ''),
      'target', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id::text = r.detail ->> 'targetDepartmentId'),
      'acceptedAt', (SELECT min(e.created_at) FROM public.member_request_events e WHERE e.request_id = r.id AND e.to_status = 'waiting'),
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'to', e.to_status,
          'at', e.created_at,
          'note', e.note,
          'by', coalesce(
            (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = e.actor_id ORDER BY s.status = 'active' DESC LIMIT 1),
            (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
               FROM public.users u WHERE u.id = e.actor_id)
          )
        ) ORDER BY e.created_at), '[]'::jsonb)
        FROM public.member_request_events e WHERE e.request_id = r.id
      )
    ) ORDER BY r.created_at)
    FROM public.member_requests r
    WHERE r.sub_department_id = p_sub
      AND r.kind IN ('waiting', 'replacement')
      AND r.status <> 'draft'
  ), '[]'::jsonb);
END
$$;

REVOKE ALL ON FUNCTION public.member_sub_department_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_sub_department_requests(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.member_sub_department_requests(uuid) IS
  'Sales Groups › Waiting list / Replacement list: one sub-department''s waiting-list and replacement requests, named, with their history. Gate: member_is_manager(''member_requests_manage'').';
