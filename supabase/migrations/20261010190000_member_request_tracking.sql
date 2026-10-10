-- ============================================================================
-- 20261010190000_member_request_tracking.sql
-- The Revenue app's "Waiting list & replacements" (HR revamp 7b/8,
-- 2026-10-10): the sub-department's waiting list as a member may see it, and
-- an edit that says what it changed.
-- ============================================================================
--
-- 1. member_waiting_queue(p_staff) — for each sub-department the member
--    belongs to, everybody HR accepted onto its waiting list, numbered in the
--    order they were accepted (the same order Sales Groups › Waiting list
--    numbers them: the first move into `waiting`, else when it was sent).
--    The member's own applicants by their full name; everybody else's by a
--    first name and an initial ("Siti A.") — the handoff's queue. With
--    p_staff (View as) the caller must manage member requests; the queue is
--    then the viewed person's.
--
-- 2. Edit request → Update: a waiting list or replacement HR has not touched
--    yet is revised in place (mig 20261010180000); its note now names what
--    changed — "Updated by the member · phone number, preferred start date"
--    (the handoff: "each edit appends 'Updated by the member · changed
--    fields' to the audit trail"). Patched from production's body, md5
--    checked, one asserted swap.

-- ── 1. The queue ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_waiting_queue(p_staff uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid;
BEGIN
  IF p_staff IS NULL THEN
    IF NOT public.has_perm('member_requests') THEN
      RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE = '42501';
    END IF;
    v_staff := public.member_staff_id();
  ELSE
    IF NOT public.member_is_manager('member_requests_manage') THEN
      RAISE EXCEPTION 'Only HR or the Principal may read another member''s waiting list' USING ERRCODE = '42501';
    END IF;
    v_staff := p_staff;
  END IF;
  IF v_staff IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'subDepartmentId', d.id,
      'name', d.name,
      'rows', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'position', q.pos,
          'name', CASE WHEN q.mine THEN q.full_name ELSE q.short_name END,
          'mine', q.mine,
          'requestId', CASE WHEN q.mine THEN q.id END
        ) ORDER BY q.pos)
        FROM (
          SELECT r.id,
                 r.staff_id = v_staff AS mine,
                 trim(coalesce(r.detail->>'newPerson', '')) AS full_name,
                 (SELECT CASE WHEN cardinality(w) > 1 THEN w[1] || ' ' || left(w[2], 1) || '.' ELSE coalesce(w[1], '') END
                    FROM (SELECT regexp_split_to_array(trim(coalesce(r.detail->>'newPerson', '')), '\s+') AS w) n) AS short_name,
                 row_number() OVER (ORDER BY coalesce(acc.at, r.submitted_at, r.created_at), r.created_at) AS pos
            FROM public.member_requests r
            LEFT JOIN LATERAL (
              SELECT min(e.created_at) AS at FROM public.member_request_events e
               WHERE e.request_id = r.id AND e.to_status = 'waiting'
            ) acc ON true
           WHERE r.kind = 'waiting'
             AND r.status IN ('waiting', 'reserved', 'accepted')
             AND r.sub_department_id = d.id
        ) q
      ), '[]'::jsonb)
    ) ORDER BY d.name)
    FROM public.comm_sub_departments d
    WHERE d.is_active AND public.member_has_membership(v_staff, d.id)
  ), '[]'::jsonb);
END
$function$;

REVOKE ALL ON FUNCTION public.member_waiting_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_waiting_queue(uuid) TO authenticated;

-- ── 2. The edit names what it changed ────────────────────────────────────────

DO $patch$
DECLARE
  v_src text;
  v_old text;
  v_new text;
  v_count int;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_prepare_request';
  IF md5(v_src) <> 'd9003f7f9a6ef0aff757310636aaaa7f' THEN
    RAISE EXCEPTION 'member_prepare_request is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  v_old := 'note=CASE WHEN status=''submitted'' THEN ''Updated by the member'' ELSE note END';
  v_new := 'note=CASE WHEN status=''submitted'' THEN ''Updated by the member''||coalesce('' · ''||(SELECT string_agg(m.l, '', '' ORDER BY m.o) FROM (VALUES'
    || ' (1,''newPerson'',CASE WHEN p_kind=''waiting'' THEN ''new member name'' ELSE ''replacement name'' END),'
    || ' (2,''contact'',''phone number''),(3,''start'',''preferred start date''),(4,''effective'',''planned effective date''),'
    || ' (5,''reason'',''reason and arrangement''),(6,''answers'',''answers''),(7,''signedFormHash'',''signed form'')) m(o,k,l)'
    || ' WHERE v_existing.detail->m.k IS DISTINCT FROM p_detail->m.k),'''') ELSE note END';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_prepare_request: the revision note matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);
END
$patch$;
