-- ============================================================================
-- 20261010160000_member_services_readers.sql
-- Member services as the HR revamp draws it: two light readers (HR revamp 4a/8, 2026-10-10).
-- ============================================================================
--
-- People › Member services gets the handoff's Request reviews — each request's
-- facts named and its audit history with who moved it — and Publish memo,
-- each memo "read by N". member_admin_snapshot() already carries the requests
-- and memos; it names nobody and counts no reads. Two readers, both DEFINER,
-- each asking the gate its tab asks. Read-only.
--
--   member_admin_request_facts()  every request sent to HR: who sent it, the
--     original member and the successor of a replacement, the receiving
--     sub-department of a transfer, when HR accepted an applicant, and its
--     history — a staff name where the actor is somebody's login, else their
--     role — with a claim's decision and payment taken from the claim itself,
--     as member_request_history tells the member. Gate: member_requests_manage.
--   member_memo_reads()  per memo: how many have read its current version and
--     how many acknowledged it. Gate: member_memos_manage.

CREATE OR REPLACE FUNCTION public.member_admin_request_facts()
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
    SELECT jsonb_object_agg(r.id, jsonb_build_object(
      'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
      'original', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id::text = r.detail ->> 'originalStaffId'),
      'successor', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.allocated_staff_id),
      'target', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id::text = r.detail ->> 'targetDepartmentId'),
      'acceptedAt', (SELECT min(e.created_at) FROM public.member_request_events e WHERE e.request_id = r.id AND e.to_status = 'waiting'),
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'to', ev.status,
          'at', ev.at,
          'note', ev.note,
          'by', coalesce(
            (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = ev.actor_id ORDER BY s.status = 'active' DESC LIMIT 1),
            (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
               FROM public.users u WHERE u.id = ev.actor_id)
          )
        ) ORDER BY ev.at), '[]'::jsonb)
        FROM (
          SELECT e.created_at AS at, e.to_status AS status, e.note, e.actor_id
            FROM public.member_request_events e
           WHERE e.request_id = r.id AND e.from_status IS DISTINCT FROM e.to_status AND e.to_status <> 'draft'
          UNION ALL
          -- A claim is decided on the claim, not on the request.
          SELECT c.approved_at, CASE WHEN c.status = 'rejected' THEN 'rejected' ELSE 'approved' END, NULL, c.approved_by
            FROM public.claims c
           WHERE r.kind = 'claim' AND c.id = r.claim_id AND c.status IN ('approved', 'rejected', 'paid') AND c.approved_at IS NOT NULL
          UNION ALL
          SELECT coalesce(v.executed_at, v.payment_date::timestamptz, c.approved_at), 'paid',
                 CASE WHEN c.payroll_month IS NOT NULL THEN 'With ' || to_char(c.payroll_month, 'FMMonth') || ' payroll' END, v.executed_by
            FROM public.claims c LEFT JOIN public.payment_vouchers v ON v.id = c.voucher_id
           WHERE r.kind = 'claim' AND c.id = r.claim_id AND c.status = 'paid'
        ) ev
        WHERE ev.at IS NOT NULL
      )
    ))
    FROM public.member_requests r
    WHERE r.status <> 'draft'
  ), '{}'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION public.member_memo_reads()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.member_is_manager('member_memos_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'Memo publishing access is required' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(m.id, jsonb_build_object(
      'read', (SELECT count(DISTINCT x.user_id) FROM public.member_memo_receipts x
                WHERE x.memo_id = m.id AND x.version = m.version AND x.read_at IS NOT NULL),
      'acknowledged', (SELECT count(DISTINCT x.user_id) FROM public.member_memo_receipts x
                        WHERE x.memo_id = m.id AND x.version = m.version AND x.acknowledged_at IS NOT NULL)
    ))
    FROM public.member_memos m
  ), '{}'::jsonb);
END
$$;

REVOKE ALL ON FUNCTION public.member_admin_request_facts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_request_facts() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_memo_reads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_memo_reads() TO authenticated, service_role;

COMMENT ON FUNCTION public.member_admin_request_facts() IS
  'Member services › Request reviews: every sent request''s names (sender, original member, successor, receiving sub-department), when HR accepted it and its named history. Gate: member_is_manager(''member_requests_manage'').';
COMMENT ON FUNCTION public.member_memo_reads() IS
  'Member services › Publish memo: per memo, how many read and acknowledged its current version. Gate: member_is_manager(''member_memos_manage'').';
