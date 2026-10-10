-- ============================================================================
-- 20261010120000_member_capacity_of.sql
-- Rules › Capacity reads its four figures with the page (HR revamp 2/8,
-- 2026-10-10).
-- ============================================================================
--
-- The headcount limit moved from People › Member services to Revenue › Rules ›
-- Capacity. Its figures were only ever in `member_admin_snapshot()`, which
-- also builds every request, the last 300 events, the candidates, titles,
-- uplines, memos and — for the Principal — the whole member catalogue (1,553
-- products on 2026-10-10). Calling that for four numbers meant a Server Action
-- after the page had drawn, and a section switched while it was in flight
-- makes the App Router discard it and refresh the whole page.
--
-- `member_capacity_of(p_sub)` answers the one sub-department's figures, the
-- same way the snapshot works them out (production body, 2026-10-10):
--   capacity  member_department_capacity.headcount_limit (NULL = never set)
--   occupied  member_occupied(sub, today in the office's calendar)
--   reserved  reserved / accepted requests whose seat is still held and not
--             yet taken by a membership
--   waiting   waiting-list requests still waiting for a seat
-- The gate is Member services' own: member_is_manager('member_requests_manage')
-- (the Principal, or whoever holds the key) — set_capacity asks the same.

CREATE OR REPLACE FUNCTION public.member_capacity_of(p_sub uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'capacity', c.headcount_limit,
      'occupied', public.member_occupied(d.id, v_today),
      'reserved', (
        SELECT count(*) FROM public.member_requests r
        WHERE r.sub_department_id = d.id AND r.status IN ('reserved', 'accepted')
          AND r.reservation_expires_at > now()
          AND (r.allocated_staff_id IS NULL OR NOT public.member_has_membership(r.allocated_staff_id, d.id))
      ),
      'waiting', (
        SELECT count(*) FROM public.member_requests r
        WHERE r.sub_department_id = d.id AND r.kind = 'waiting' AND r.status = 'waiting'
      )
    )
    FROM public.comm_sub_departments d
    LEFT JOIN public.member_department_capacity c ON c.sub_department_id = d.id
    WHERE d.id = p_sub AND d.is_active
  );
END
$$;

REVOKE ALL ON FUNCTION public.member_capacity_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_capacity_of(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.member_capacity_of(uuid) IS
  'Rules › Capacity: one sub-department''s headcount limit, active members, held seats and waiting-list queue. Gate: member_is_manager(''member_requests_manage'').';
